// Operations Intelligence · sección de análisis
// Todo se calcula en el navegador a partir de los mismos 3.000 pedidos del panel,
// y se contrasta con los resultados que produjo SQL (SQLite) y Python (analysis.py).
(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const nf = (d, extra) => new Intl.NumberFormat("es-ES", Object.assign({ minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: "always" }, extra || {}));
  const n0 = nf(0), n1 = nf(1), n2 = nf(2);
  const sgn = (v, f) => (v > 0 ? "+" : v < 0 ? "−" : "") + f.format(Math.abs(v));
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const days = s => Date.parse(s + "T00:00:00Z") / 86400000;

  // ---------- Datos ----------
  const R = window.ORDERS.map(r => ({ id: r[0], order: r[1], promised: r[2], delivered: r[3], route: r[4], wh: r[5], cost: r[6], status: r[7] }));
  R.forEach(r => { r.month = r.order.slice(0, 7); r.peak = r.month.slice(5) === "11" || r.month.slice(5) === "12"; });
  const D = R.filter(r => r.status === "Entregado");
  D.forEach(r => { r.late = r.delivered > r.promised; r.delay = days(r.delivered) - days(r.promised); });
  const lateRate = a => (a.length ? 100 * a.filter(r => r.late).length / a.length : NaN);
  const onTimePct = a => 100 - lateRate(a);
  const groupBy = (a, f) => { const m = new Map(); a.forEach(r => { const k = f(r); if (!m.has(k)) m.set(k, []); m.get(k).push(r); }); return m; };
  const routes = [...new Set(R.map(r => r.route))].sort();
  const whs = [...new Set(R.map(r => r.wh))].sort();

  // ---------- Efecto de cada factor (comparación dentro de los mismos grupos) ----------
  // Para evitar mezclas (por ejemplo, que el almacén B sirva más a la ruta Sur), el factor se compara
  // dentro de cada combinación de los otros factores y se promedian las diferencias según su tamaño.
  function effect(factor, a, b, strata) {
    const cells = new Map();
    D.forEach(r => {
      const lv = factor(r); if (lv !== a && lv !== b) return;
      const key = strata.map(f => f(r)).join("|");
      const c = cells.get(key) || { a: [0, 0], b: [0, 0] };
      const t = lv === a ? c.a : c.b; t[0]++; if (r.late) t[1]++;
      cells.set(key, c);
    });
    let num = 0, den = 0;
    cells.forEach(c => { if (c.a[0] >= 10 && c.b[0] >= 10) { const w = c.a[0] + c.b[0]; num += w * (c.b[1] / c.b[0] - c.a[1] / c.a[0]); den += w; } });
    return 100 * num / den;
  }
  const byRoute = (a, b) => effect(r => r.route, a, b, [r => r.wh, r => r.peak]);
  const byWh = (a, b) => effect(r => r.wh, a, b, [r => r.route, r => r.peak]);
  const byPeak = () => effect(r => (r.peak ? "p" : "n"), "n", "p", [r => r.route, r => r.wh]);

  // ---------- Combinaciones almacén-ruta ----------
  const globalLate = D.filter(r => r.late).length / D.length;
  const combos = [...groupBy(D, r => r.wh + "|" + r.route)].map(([k, a]) => {
    const [wh, route] = k.split("|"), late = a.filter(r => r.late).length;
    return { wh, route, n: a.length, late, rate: 100 * late / a.length, excess: late - a.length * globalLate };
  }).sort((x, y) => y.excess - x.excess);
  const positiveExcess = combos.filter(c => c.excess > 0).reduce((s, c) => s + c.excess, 0);

  // ---------- Coste de un retraso ----------
  const costNaive = mean(D.filter(r => r.late).map(r => r.cost)) - mean(D.filter(r => !r.late).map(r => r.cost));
  const costByRoute = routes.map(rt => {
    const a = D.filter(r => r.route === rt), l = a.filter(r => r.late), o = a.filter(r => !r.late);
    return { route: rt, late: l.length, costLate: mean(l.map(r => r.cost)), costOn: mean(o.map(r => r.cost)), diff: mean(l.map(r => r.cost)) - mean(o.map(r => r.cost)) };
  });
  const costWithin = costByRoute.reduce((s, c) => s + c.diff * c.late, 0) / costByRoute.reduce((s, c) => s + c.late, 0);

  // =====================================================================
  // 1. Resumen: hallazgos y recomendaciones
  // =====================================================================
  (function summary() {
    const worstRoute = routes.map(rt => [rt, onTimePct(D.filter(r => r.route === rt))]).sort((a, b) => a[1] - b[1])[0];
    const restRoutes = D.filter(r => r.route !== worstRoute[0]);
    const leadOf = rt => { const a = R.filter(r => r.route === rt).map(r => days(r.promised) - days(r.order)); return Math.round(mean(a)); };
    const longestLead = Math.max(...routes.map(leadOf));

    const whB = D.filter(r => r.wh === "Centro B"), whOther = D.filter(r => r.wh !== "Centro B");
    const worseB = routes.filter(rt => onTimePct(D.filter(r => r.wh === "Centro B" && r.route === rt)) < onTimePct(D.filter(r => r.wh === "Centro A" && r.route === rt))).length;

    const peakD = D.filter(r => r.peak), restD = D.filter(r => !r.peak);
    const peakMonths = new Set(R.filter(r => r.peak).map(r => r.month)).size, restMonths = new Set(R.filter(r => !r.peak).map(r => r.month)).size;
    const volPeak = R.filter(r => r.peak).length / peakMonths, volRest = R.filter(r => !r.peak).length / restMonths;

    const cards = [
      { tag: "Ruta", big: n1.format(onTimePct(D.filter(r => r.route === worstRoute[0]))) + " %", title: `La ruta ${worstRoute[0]} es la que peor cumple`,
        text: `Cumple el ${n1.format(worstRoute[1])} % de las entregas, frente al ${n1.format(onTimePct(restRoutes))} % del resto de rutas juntas.` +
          (leadOf(worstRoute[0]) === longestLead ? ` Tiene además el plazo prometido más largo (${longestLead} días), así que el problema no parece ser un plazo demasiado ajustado.` : "") },
      { tag: "Almacén", big: n1.format(onTimePct(whB)) + " %", title: "Centro B rinde por debajo de los otros dos",
        text: `Frente al ${n1.format(onTimePct(whOther))} % de Centro A y Centro C. Cumple menos que Centro A en ${worseB} de las ${routes.length} rutas, así que no es un efecto de las rutas que atiende.` },
      { tag: "Estacionalidad", big: n1.format(onTimePct(peakD)) + " %", title: "La campaña de noviembre y diciembre lo empeora",
        text: `Con ${n0.format(volPeak)} pedidos al mes frente a ${n0.format(volRest)} el resto del año (un ${n0.format(100 * (volPeak / volRest - 1))} % más), el cumplimiento baja del ${n1.format(onTimePct(restD))} % al ${n1.format(onTimePct(peakD))} %.` },
      { tag: "Coste", big: sgn(costWithin, n0) + " €", title: "Un retraso cuesta menos de lo que parece",
        text: `A primera vista, un pedido tardío cuesta ${n0.format(costNaive)} € más. Pero esa cifra mezcla rutas: la ruta Sur es cara y además la más tardía. Comparando dentro de cada ruta, la diferencia media baja a unos ${n0.format(costWithin)} €.` },
    ];
    $("findings").innerHTML = cards.map(c => `<article class="finding"><span class="lab">${c.tag}</span><b>${c.big}</b><h3>${c.title}</h3><p>${c.text}</p></article>`).join("");

    // recomendaciones y escenario
    const top = combos[0], top3 = combos.slice(0, 3);
    const lateTotal = D.filter(r => r.late).length;
    const newLate = lateTotal - top3.reduce((s, c) => s + (c.late - c.n * globalLate), 0);
    const newPct = 100 * (1 - newLate / D.length), nowPct = onTimePct(D);
    $("recs").innerHTML =
      `<li><b>Revisar primero Centro B en la ruta ${top.route}.</b> Es la combinación con más entregas tardías de más: ${n0.format(top.excess)} frente a lo esperable, un ${n0.format(100 * top.excess / positiveExcess)} % del exceso total.</li>` +
      `<li><b>Preparar la campaña con más margen.</b> Cuando el volumen sube un ${n0.format(100 * (volPeak / volRest - 1))} %, el cumplimiento cae ${n0.format(onTimePct(restD) - onTimePct(peakD))} puntos. Convendría estudiar refuerzo de personal o de transporte en esos dos meses.</li>` +
      `<li><b>No tratar el plazo de ${worstRoute[0]} como la causa.</b> Ya es el más largo y sigue siendo la ruta que peor cumple; habría que mirar el transporte y la preparación en origen.</li>` +
      `<li><b>Escenario:</b> si las tres combinaciones con más retrasos de más (${top3.map(c => `${c.wh}–${c.route}`).join(", ")}) llegaran a la tasa media, el cumplimiento global subiría del ${n1.format(nowPct)} % al ${n1.format(newPct)} %, unas ${n0.format(lateTotal - newLate)} entregas más a tiempo.</li>`;
  })();

  // =====================================================================
  // 2. Causas: peso de cada factor y tablas
  // =====================================================================
  (function causes() {
    const eff = [
      { label: `Ruta Sur frente a Centro`, v: byRoute("Centro", "Sur") },
      { label: `Ruta Este frente a Centro`, v: byRoute("Centro", "Este") },
      { label: `Campaña nov-dic frente al resto`, v: byPeak() },
      { label: `Almacén Centro B frente a A`, v: byWh("Centro A", "Centro B") },
      { label: `Almacén Centro C frente a A`, v: byWh("Centro A", "Centro C") },
    ].sort((a, b) => b.v - a.v);
    const W = 640, rowH = 40, L = 220, R_ = 70, H = rowH * eff.length + 8;
    const max = Math.max(...eff.map(e => Math.abs(e.v)), 1), scale = (W - L - R_) / (max * 1.0);
    let g = "";
    eff.forEach((e, i) => {
      const y = 4 + i * rowH, w = Math.abs(e.v) * scale;
      g += `<text class="lab" x="0" y="${y + 24}">${e.label}</text>` +
        `<rect class="track" x="${L}" y="${y + 8}" width="${W - L - R_}" height="22"/>` +
        `<rect class="bar${i === 0 ? " worst" : ""}" x="${L}" y="${y + 8}" width="${w.toFixed(1)}" height="22"><title>${e.label}: ${sgn(e.v, n1)} puntos</title></rect>` +
        `<text class="val" x="${L + w + 8}" y="${y + 25}">${sgn(e.v, n1)} pp</text>`;
    });
    $("c-effects").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Efecto de cada factor sobre la tasa de retrasos">${g}</svg>`;

    // tabla ruta x factores
    const heat = v => `background:rgba(217,83,43,${(Math.max(0, Math.min(v, 45)) / 45 * 0.55).toFixed(2)})`;
    const cell = a => a.length >= 10 ? `<td class="num" style="${heat(lateRate(a))}">${n1.format(lateRate(a))} %</td>` : `<td class="num">—</td>`;
    $("t-causes").innerHTML =
      `<thead><tr><th>Ruta</th><th class="num">Resto del año</th><th class="num">Nov–dic</th>${whs.map(w => `<th class="num">${w}</th>`).join("")}</tr></thead><tbody>` +
      routes.map(rt => { const a = D.filter(r => r.route === rt); return `<tr><td><b>${rt}</b></td>${cell(a.filter(r => !r.peak))}${cell(a.filter(r => r.peak))}${whs.map(w => cell(a.filter(r => r.wh === w))).join("")}</tr>`; }).join("") +
      `<tr><td><b>Todas</b></td>${cell(D.filter(r => !r.peak))}${cell(D.filter(r => r.peak))}${whs.map(w => cell(D.filter(r => r.wh === w))).join("")}</tr></tbody>`;

    // prioridades
    $("t-priority").innerHTML = `<thead><tr><th class="num">Puesto</th><th>Almacén</th><th>Ruta</th><th class="num">Entregas</th><th class="num">Tardías</th><th class="num">% tardías</th><th class="num">Tardías de más</th></tr></thead><tbody>` +
      combos.slice(0, 5).map((c, i) => `<tr><td class="num">${i + 1}</td><td>${c.wh}</td><td>${c.route}</td><td class="num">${n0.format(c.n)}</td><td class="num">${n0.format(c.late)}</td><td class="num">${n1.format(c.rate)} %</td><td class="num"><b>${n1.format(c.excess)}</b></td></tr>`).join("") + `</tbody>`;

    // coste
    $("t-cost").innerHTML = `<thead><tr><th>Comparación</th><th class="num">Pedido tardío</th><th class="num">A tiempo</th><th class="num">Diferencia</th></tr></thead><tbody>` +
      `<tr class="strong"><td>Todas las rutas juntas (mezcla)</td><td class="num">${n2.format(mean(D.filter(r => r.late).map(r => r.cost)))} €</td><td class="num">${n2.format(mean(D.filter(r => !r.late).map(r => r.cost)))} €</td><td class="num"><b>${sgn(costNaive, n2)} €</b></td></tr>` +
      costByRoute.map(c => `<tr><td>Dentro de la ruta ${c.route}</td><td class="num">${n2.format(c.costLate)} €</td><td class="num">${n2.format(c.costOn)} €</td><td class="num">${sgn(c.diff, n2)} €</td></tr>`).join("") +
      `<tr class="strong"><td>Media ponderada dentro de cada ruta</td><td class="num">—</td><td class="num">—</td><td class="num"><b>${sgn(costWithin, n2)} €</b></td></tr></tbody>`;
  })();

  // =====================================================================
  // 3. SQL: consultas y resultados reales
  // =====================================================================
  (function sql() {
    const A = window.ANALYSIS;
    if (!A) { $("sql-list").innerHTML = '<p class="muted">No se han podido cargar los resultados del análisis.</p>'; return; }
    $("sql-version").textContent = A.sqlite;
    $("sql-list").innerHTML = A.queries.map((q, i) =>
      `<details class="query" ${i < 2 ? "open" : ""}><summary><span class="qn">${i + 1}</span>${esc(q.titulo)}</summary>` +
      `<p class="muted">${esc(q.pregunta)}</p>` +
      `<pre class="code"><code>${esc(q.sql)}</code></pre>` +
      `<div class="table-wrap"><table><thead><tr>${q.columns.map(c => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>` +
      q.rows.map(r => `<tr>${r.map(v => `<td${typeof v === "number" ? ' class="num"' : ""}>${esc(typeof v === "number" ? String(v).replace(".", ",") : v)}</td>`).join("")}</tr>`).join("") +
      `</tbody></table></div></details>`).join("");
  })();

  // =====================================================================
  // 4. Validación
  // =====================================================================
  (function validation() {
    const A = window.ANALYSIS;
    // valores de esta página, con los mismos nombres que usa analysis.py
    const js = {};
    js["Pedidos"] = R.length;
    js["Pedidos entregados"] = D.length;
    js["Entregas a tiempo (%)"] = onTimePct(D);
    js["Coste medio por pedido (€)"] = mean(R.filter(r => r.status !== "Cancelado").map(r => r.cost));
    js["Retraso medio de las tardías (días)"] = mean(D.filter(r => r.late).map(r => r.delay));
    routes.forEach(rt => { js[`Entregas a tiempo, ruta ${rt} (%)`] = onTimePct(D.filter(r => r.route === rt)); });
    js["Peor mes: entregas a tiempo (%)"] = Math.min(...[...groupBy(D, r => r.month)].map(([, a]) => onTimePct(a)));
    js["Entregas tardías de más en la peor combinación"] = combos[0].excess;
    js["Diferencia de coste tardío vs a tiempo, global (€)"] = costNaive;
    costByRoute.forEach(c => { js[`Diferencia de coste tardío vs a tiempo, ruta ${c.route} (€)`] = c.diff; });

    let okAll = 0;
    $("t-checks").innerHTML = `<thead><tr><th>Indicador</th><th class="num">Esta página (JavaScript)</th><th class="num">SQL (SQLite)</th><th class="num">Python</th><th>Resultado</th></tr></thead><tbody>` +
      (A ? A.checks.map(c => {
        const dec = (String(c.sql).split(".")[1] || "").length, f = nf(dec);
        const v = js[c.nombre], ok = v !== undefined && Math.abs(v - c.sql) <= 0.051 && c.ok;
        if (ok) okAll++;
        return `<tr><td>${esc(c.nombre)}</td><td class="num">${v === undefined ? "—" : f.format(v)}</td><td class="num">${f.format(c.sql)}</td><td class="num">${f.format(c.python)}</td><td><span class="tag ${ok ? "ok" : "err"}">${ok ? "Coincide" : "Revisar"}</span></td></tr>`;
      }).join("") : "") + `</tbody>`;
    $("v-summary").textContent = A ? `${okAll} de ${A.checks.length} indicadores coinciden en los tres cálculos.` : "";

    // pruebas de coherencia de los datos
    const ids = new Set(R.map(r => r.id));
    const tests = [
      ["Cada pedido tiene un identificador único", R.length - ids.size],
      ["Entregados = a tiempo + tardías", D.length - (D.filter(r => !r.late).length + D.filter(r => r.late).length)],
      ["La suma de pedidos por ruta es el total", R.length - routes.reduce((s, rt) => s + R.filter(r => r.route === rt).length, 0)],
      ["La suma de pedidos por almacén es el total", R.length - whs.reduce((s, w) => s + R.filter(r => r.wh === w).length, 0)],
      ["Ninguna fecha prometida es anterior a la del pedido", R.filter(r => r.promised < r.order).length],
      ["Ninguna entrega es anterior a la fecha del pedido", D.filter(r => r.delivered < r.order).length],
      ["Solo los pedidos entregados tienen fecha de entrega", R.filter(r => (r.status === "Entregado") !== !!r.delivered).length],
      ["Todos los costes son positivos", R.filter(r => !(r.cost > 0)).length],
    ];
    $("t-tests").innerHTML = tests.map(([name, bad]) => `<li class="${bad === 0 ? "ok" : "err"}"><span class="ico">${bad === 0 ? "✓" : "✕"}</span><span>${name}<small>${bad === 0 ? "Sin excepciones." : n0.format(bad) + " casos."}</small></span><span class="n">${bad}</span></li>`).join("");
  })();
})();
