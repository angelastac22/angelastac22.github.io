// Simulador de picking · lógica
// Modelo simplificado de un almacén con pasillos paralelos. Todo se calcula en el navegador.
(function () {
  "use strict";

  // ---------- Supuestos fijos del modelo ----------
  const CFG = {
    aisles: 12,      // pasillos
    slots: 30,       // posiciones por pasillo
    slotLen: 1.2,    // m por posición
    aisleGap: 3.5,   // m entre pasillos
    speed: 1.2,      // m/s caminando
    pickT: 12,       // s por línea de pedido
    sortT: 6,        // s por línea para clasificar (solo picking por lotes)
    consolT: 15,     // s por cada zona adicional de un pedido (solo picking por zonas)
    tripT: 20,       // s de inicio y cierre de cada ruta
  };
  CFG.L = (CFG.slots + 1) * CFG.slotLen; // longitud de un pasillo
  const X = a => a * CFG.aisleGap;
  const Y = p => p * CFG.slotLen;

  const STRATS = [
    { id: "single", name: "Por pedido", desc: "Cada ruta prepara un único pedido." },
    { id: "batch", name: "Por lotes", desc: "Una ruta prepara varios pedidos a la vez; después hay que clasificarlos." },
    { id: "zone", name: "Por zonas", desc: "Cada persona trabaja solo en su zona y los pedidos pasan de una zona a otra." },
  ];

  const nf0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: "always" });
  const nf1 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const $ = id => document.getElementById(id);

  // ---------- Números aleatorios con semilla (misma semilla = mismos pedidos) ----------
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeOrders(n, avgLines, layout, seed) {
    const rnd = rng(seed);
    // en la colocación "popular" los pasillos cercanos a la entrada reciben más pedidos
    const w = Array.from({ length: CFG.aisles }, (_, i) => (layout === "abc" ? Math.exp(-i / 3) : 1));
    const tot = w.reduce((s, v) => s + v, 0);
    const pickAisle = () => {
      let r = rnd() * tot;
      for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i; }
      return w.length - 1;
    };
    const orders = [];
    for (let i = 0; i < n; i++) {
      const lines = 1 + Math.floor(rnd() * (2 * avgLines - 1));
      const seen = new Set(), items = [];
      let guard = 0;
      while (items.length < lines && guard++ < 50) {
        const a = pickAisle(), p = 1 + Math.floor(rnd() * CFG.slots), k = a + "-" + p;
        if (!seen.has(k)) { seen.add(k); items.push({ a, p }); }
      }
      orders.push({ id: i + 1, items });
    }
    return orders;
  }

  // ---------- Ruta en "S" por los pasillos con productos ----------
  function routeS(items, depotX) {
    const maxPos = new Map();
    items.forEach(it => maxPos.set(it.a, Math.max(maxPos.get(it.a) || 0, it.p)));
    const aisles = [...maxPos.keys()].sort((a, b) => a - b);
    const k = aisles.length;
    const pts = [[depotX, 0]];
    if (!k) return { dist: 0, pts };
    pts.push([X(aisles[0]), 0]);
    aisles.forEach((a, i) => {
      const x = X(a), last = i === k - 1;
      if (!last) {
        if (i % 2 === 0) { pts.push([x, CFG.L]); pts.push([X(aisles[i + 1]), CFG.L]); }
        else { pts.push([x, 0]); pts.push([X(aisles[i + 1]), 0]); }
      } else if (i % 2 === 0) { pts.push([x, Y(maxPos.get(a))]); pts.push([x, 0]); }
      else pts.push([x, 0]);
    });
    pts.push([depotX, 0]);
    let dist = 0;
    for (let i = 1; i < pts.length; i++) dist += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
    return { dist, pts };
  }


  // ---------- Rutas que visitan los productos uno a uno ----------
  // Moverse entre pasillos obliga a salir por el frente o por el fondo; dentro del mismo pasillo se camina recto.
  function step(from, to) {
    if (from.a !== null && from.a === to.a) return { d: Math.abs(to.y - from.y), cross: null };
    const dx = Math.abs(to.x - from.x);
    const front = from.y + dx + to.y, back = (CFG.L - from.y) + dx + (CFG.L - to.y);
    return front <= back ? { d: front, cross: 0 } : { d: back, cross: CFG.L };
  }
  function walk(seq, depotX) {
    let pos = { x: depotX, y: 0, a: null };
    const pts = [[depotX, 0]];
    seq.forEach(it => {
      const to = { x: X(it.a), y: Y(it.p), a: it.a };
      const st = step(pos, to);
      if (st.cross !== null) { pts.push([pos.x, st.cross]); pts.push([to.x, st.cross]); }
      pts.push([to.x, to.y]);
      pos = to;
    });
    pts.push([pos.x, 0]); pts.push([depotX, 0]);
    let dist = 0;
    for (let i = 1; i < pts.length; i++) dist += Math.abs(pts[i][0] - pts[i - 1][0]) + Math.abs(pts[i][1] - pts[i - 1][1]);
    return { dist, pts };
  }
  function uniq(items) {
    const seen = new Set();
    return items.filter(it => { const k = it.a + "-" + it.p; if (seen.has(k)) return false; seen.add(k); return true; });
  }
  function routeNN(items, depotX) {
    const left = uniq(items), seq = [];
    let pos = { x: depotX, y: 0, a: null };
    while (left.length) {
      let bi = 0, bd = Infinity;
      left.forEach((it, i) => { const d = step(pos, { x: X(it.a), y: Y(it.p), a: it.a }).d; if (d < bd) { bd = d; bi = i; } });
      const it = left.splice(bi, 1)[0];
      seq.push(it); pos = { x: X(it.a), y: Y(it.p), a: it.a };
    }
    return walk(seq, depotX);
  }
  function route(items, depotX, method) {
    if (!items.length) return { dist: 0, pts: [[depotX, 0]] };
    if (method === "nn") return routeNN(items, depotX);
    if (method === "list") return walk(uniq(items), depotX);
    return routeS(items, depotX);
  }

  const meanAisle = o => o.items.reduce((s, it) => s + it.a, 0) / o.items.length;

  function zonesFor(z) {
    const base = Math.floor(CFG.aisles / z), extra = CFG.aisles % z, out = [];
    let start = 0;
    for (let i = 0; i < z; i++) { const size = base + (i < extra ? 1 : 0); out.push([start, start + size - 1]); start += size; }
    return out;
  }

  // reparto de rutas entre personas: siempre la ruta más larga a la persona menos cargada
  function schedule(times, pickers) {
    const load = new Array(pickers).fill(0);
    times.slice().sort((a, b) => b - a).forEach(t => {
      let m = 0;
      for (let i = 1; i < pickers; i++) if (load[i] < load[m]) m = i;
      load[m] += t;
    });
    return load;
  }

  // ---------- Simulación de las tres estrategias ----------
  function simulate(p) {
    const orders = makeOrders(p.orders, p.lines, p.layout, p.seed);
    const totalLines = orders.reduce((s, o) => s + o.items.length, 0);
    const sampleIdx = Math.max(0, orders.findIndex(o => o.items.length >= Math.max(3, p.lines)));
    const results = {};

    // Por pedido
    {
      const trips = orders.map(o => {
        const r = route(o.items, 0, p.method);
        return { dist: r.dist, pts: r.pts, items: o.items, time: r.dist / CFG.speed + o.items.length * CFG.pickT + CFG.tripT };
      });
      const load = schedule(trips.map(t => t.time), p.pickers);
      results.single = { trips, dist: trips.reduce((s, t) => s + t.dist, 0), makespan: Math.max(...load), work: load.reduce((s, v) => s + v, 0), nTrips: trips.length };
    }

    // Por lotes (se agrupan pedidos con productos en pasillos parecidos)
    {
      const sorted = orders.slice().sort((a, b) => meanAisle(a) - meanAisle(b));
      const trips = [];
      for (let i = 0; i < sorted.length; i += p.batch) {
        const grp = sorted.slice(i, i + p.batch);
        const items = grp.flatMap(o => o.items);
        const lines = items.length;
        const r = route(items, 0, p.method);
        trips.push({ dist: r.dist, pts: r.pts, items, time: r.dist / CFG.speed + lines * (CFG.pickT + CFG.sortT) + CFG.tripT });
      }
      const load = schedule(trips.map(t => t.time), p.pickers);
      results.batch = { trips, dist: trips.reduce((s, t) => s + t.dist, 0), makespan: Math.max(...load), work: load.reduce((s, v) => s + v, 0), nTrips: trips.length };
    }

    // Por zonas (una zona por persona)
    {
      const zones = zonesFor(p.pickers);
      const load = new Array(p.pickers).fill(0);
      let dist = 0, nTrips = 0;
      orders.forEach(o => {
        let visited = 0;
        zones.forEach(([a0, a1], zi) => {
          const items = o.items.filter(it => it.a >= a0 && it.a <= a1);
          if (!items.length) return;
          const r = route(items, X(a0), p.method);
          const t = r.dist / CFG.speed + items.length * CFG.pickT + (visited === 0 ? CFG.tripT : CFG.consolT);
          visited++;
          load[zi] += t; dist += r.dist; nTrips++;
        });
      });
      // pedido de ejemplo para el mapa: uno con varios productos repartidos en más de una zona
      const touches = o => zones.filter(([a0, a1]) => o.items.some(it => it.a >= a0 && it.a <= a1)).length;
      const sample = orders.find(o => o.items.length >= 3 && touches(o) >= Math.min(2, zones.length)) || orders[0];
      const sampleTrips = [];
      zones.forEach(([a0, a1], zi) => {
        const items = sample.items.filter(it => it.a >= a0 && it.a <= a1);
        if (!items.length) return;
        const r = route(items, X(a0), p.method);
        sampleTrips.push({ dist: r.dist, pts: r.pts, items, zone: zi });
      });
      results.zone = { trips: sampleTrips, zones, loads: load, dist, makespan: Math.max(...load), work: load.reduce((s, v) => s + v, 0), nTrips };
    }

    STRATS.forEach(s => {
      const r = results[s.id];
      r.distPerOrder = r.dist / orders.length;
      r.hours = r.makespan / 3600;
      r.throughput = orders.length / r.hours;
    });
    results.single.sample = results.single.trips[sampleIdx];
    return { orders, totalLines, results };
  }

  // ---------- Gráficos ----------
  function bars(el, rows, fmt, unit) {
    const W = 520, rowH = 46, T = 6, L = 96, R = 90, H = T + rowH * rows.length;
    const max = Math.max(...rows.map(r => r.v));
    const best = Math.min(...rows.map(r => r.v));
    let g = "";
    rows.forEach((r, i) => {
      const y = T + i * rowH, bw = (W - L - R) * (r.v / max);
      g += `<text class="lab" x="0" y="${y + 24}">${r.label}</text>` +
        `<rect class="track" x="${L}" y="${y + 8}" width="${W - L - R}" height="24"/>` +
        `<rect class="bar${r.v === best ? "" : " base"}" x="${L}" y="${y + 8}" width="${bw.toFixed(1)}" height="24"><title>${r.label}: ${fmt(r.v)} ${unit}</title></rect>` +
        `<text class="val" x="${L + bw + 8}" y="${y + 25}">${fmt(r.v)}</text>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
  }

  const ZONE_COL = ["#2457c5", "#d9532b", "#2a8a6a", "#8a5bc0", "#c08a1a", "#1d7fa6"];

  function map(el, sim, strat, p) {
    const R = sim.results[strat];
    const M = 28, sc = 12;
    const W = X(CFG.aisles - 1) * sc + M * 2 + 50, H = CFG.L * sc + M * 2 + 22;
    const px = x => M + 50 + x * sc, py = y => H - M - 14 - y * sc;
    let g = "";
    if (strat === "zone") {
      R.zones.forEach(([a0, a1], zi) => {
        g += `<rect x="${px(X(a0)) - 14}" y="${py(CFG.L) - 6}" width="${(X(a1) - X(a0)) * sc + 28}" height="${CFG.L * sc + 12}" fill="${ZONE_COL[zi % 6]}" opacity=".07"/>`;
      });
    }
    for (let a = 0; a < CFG.aisles; a++) {
      g += `<rect x="${px(X(a)) - 6}" y="${py(CFG.L)}" width="12" height="${CFG.L * sc}" fill="#dcdad2"/>`;
      g += `<text class="tick" x="${px(X(a))}" y="${H - 6}" text-anchor="middle">${a + 1}</text>`;
    }
    g += `<text class="tick" x="${px(0) - 14}" y="${py(0) - 2}" text-anchor="end">Entrada</text>`;
    let trips;
    if (strat === "single") trips = [R.sample];
    else if (strat === "batch") trips = [R.trips[Math.floor(R.trips.length / 2)]];
    else trips = R.trips;
    trips.forEach((t, i) => {
      const col = strat === "zone" ? ZONE_COL[t.zone % 6] : "#2457c5";
      g += `<polyline fill="none" stroke="${col}" stroke-width="2.6" stroke-linejoin="round" points="${t.pts.map(q => px(q[0]).toFixed(1) + "," + py(q[1]).toFixed(1)).join(" ")}"/>`;
      t.items.forEach(it => { g += `<circle cx="${px(X(it.a)) + (it.a % 2 ? 7 : -7) * 0}" cy="${py(Y(it.p)).toFixed(1)}" r="5.5" fill="#d9532b" stroke="#fff" stroke-width="1.5"/>`; });
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa del almacén con la ruta de una persona">${g}</svg>`;
    const t0 = trips.reduce((s, t) => s + t.dist, 0);
    const nProd = trips.reduce((s, t) => s + t.items.length, 0);
    const what = strat === "single" ? "un pedido" : strat === "batch" ? `un lote de ${p.batch} pedidos` : `un pedido repartido entre ${trips.length} ${trips.length === 1 ? "zona" : "zonas"} (una persona por zona, cada una con su color)`;
    $("map-note").textContent = `Ruta de ${what}: ${nf0.format(t0)} m recorridos para ${nProd} ${nProd === 1 ? "producto" : "productos"} (puntos naranjas).`;
  }

  // ---------- Ejemplo comentado paso a paso ----------
  const METHOD_NAME = { s: "recorrido en S", nn: "siempre al más cercano", list: "orden de la lista" };
  function example(sim, p) {
    const t = sim.results.single.sample;
    const items = t.items, n = items.length;
    const rows = ["list", "nn", "s"].map(m => {
      const r = route(items, 0, m);
      return { m, dist: r.dist, time: r.dist / CFG.speed + n * CFG.pickT + CFG.tripT };
    });
    const cur = rows.find(r => r.m === p.method);
    const best = rows.slice().sort((a, b) => a.time - b.time)[0];
    const list = items.map(it => `pasillo ${it.a + 1}, posición ${it.p}`).join("; ");
    $("ex-text").innerHTML =
      `<p>Tomamos un pedido de la simulación, con <b>${n} ${n === 1 ? "línea" : "líneas"}</b>: ${list}.</p>` +
      `<p>Con el método elegido (<b>${METHOD_NAME[p.method]}</b>) la persona recorre <b>${nf0.format(cur.dist)} m</b>. Su tiempo se calcula sumando tres partes:</p>` +
      `<ol class="prose-list"><li>Caminar: ${nf0.format(cur.dist)} m ÷ ${nf1.format(CFG.speed)} m/s = <b>${nf0.format(cur.dist / CFG.speed)} s</b></li>` +
      `<li>Coger los productos: ${n} × ${CFG.pickT} s = <b>${n * CFG.pickT} s</b></li>` +
      `<li>Salir y cerrar la ruta: <b>${CFG.tripT} s</b></li></ol>` +
      `<p>Total: <b>${nf0.format(cur.time)} s</b>. Si se hiciera por pedido con las tres formas de elegir la ruta:</p>`;
    $("ex-rows").innerHTML = rows.map(r => `<tr><td>${METHOD_NAME[r.m][0].toUpperCase() + METHOD_NAME[r.m].slice(1)}</td><td class="num">${nf0.format(r.dist)} m</td><td class="num">${nf0.format(r.time)} s</td>` +
      `<td>${r.m === best.m ? '<span class="tag ok">La más rápida</span>' : ""}</td></tr>`).join("");
  }

  // ---------- Mapa de decisión: qué estrategia gana según líneas por pedido y personas ----------
  const WIN = { single: { l: "P", name: "por pedido" }, batch: { l: "L", name: "por lotes" }, zone: { l: "Z", name: "por zonas" } };
  function decision(p) {
    const grid = [];
    for (let lines = 1; lines <= 10; lines++) {
      const row = [];
      for (let k = 1; k <= 6; k++) {
        const r = simulate({ orders: 120, lines, pickers: k, batch: p.batch, layout: p.layout, method: p.method, seed: p.seed }).results;
        const w = STRATS.map(s => s.id).sort((a, b) => r[a].makespan - r[b].makespan)[0];
        row.push(w);
      }
      grid.push(row);
    }
    let h = `<table class="dmap"><thead><tr><th>Líneas por pedido</th>${[1, 2, 3, 4, 5, 6].map(k => `<th class="num">${k} ${k === 1 ? "persona" : "personas"}</th>`).join("")}</tr></thead><tbody>`;
    grid.forEach((row, i) => { h += `<tr><td>${i + 1}</td>${row.map(w => `<td class="w-${w}" title="Gana ${WIN[w].name}">${WIN[w].l}</td>`).join("")}</tr>`; });
    $("c-decision").innerHTML = h + "</tbody></table>";

    // lectura automática, a partir de la propia tabla
    const total = grid.length * 6, cnt = { single: 0, batch: 0, zone: 0 };
    grid.forEach(r => r.forEach(w => cnt[w]++));
    const major = row => { const c = {}; row.forEach(w => c[w] = (c[w] || 0) + 1); return Object.keys(c).sort((a, b) => c[b] - c[a])[0]; };
    const runs = [];
    grid.forEach((row, i) => { const m = major(row); if (runs.length && runs[runs.length - 1].w === m) runs[runs.length - 1].to = i + 1; else runs.push({ w: m, from: i + 1, to: i + 1 }); });
    const span = r => r.from === r.to ? `con ${r.from} ${r.from === 1 ? "línea" : "líneas"}` : `con ${r.from} a ${r.to} líneas`;
    $("decision-text").innerHTML =
      `<p>De las ${total} combinaciones, preparar <b>por pedido</b> gana en ${cnt.single}, <b>por lotes</b> en ${cnt.batch} y <b>por zonas</b> en ${cnt.zone}.</p>` +
      `<p>Según la estrategia que gana en la mayoría de columnas: ${runs.map(r => `${span(r)}, <b>${WIN[r.w].name}</b>`).join("; ")}.</p>` +
      (cnt.batch === total ? `<p>Con estas hipótesis el picking por lotes gana siempre, y es sensible al tiempo de clasificar: sube «Clasificar una línea» (por ejemplo a 20 s) y el picking por pedido empieza a ganar con pedidos grandes. Por eso las hipótesis conviene medirlas en el almacén real antes de decidir.</p>` : "");
  }

  // ---------- Pantalla ----------
  let seed = 7;
  function params() {
    return {
      orders: +$("p-orders").value, lines: +$("p-lines").value, pickers: +$("p-pickers").value,
      batch: +$("p-batch").value, layout: $("p-layout").value, method: $("p-route").value, seed,
    };
  }

  function readHyp() {
    CFG.speed = +$("h-speed").value || DEF.speed; CFG.pickT = +$("h-pick").value || DEF.pickT;
    CFG.sortT = +$("h-sort").value; CFG.consolT = +$("h-consol").value; CFG.tripT = +$("h-trip").value;
  }
  const DEF = Object.assign({}, CFG);

  function run() {
    readHyp();
    const p = params();
    $("o-orders").textContent = nf0.format(p.orders);
    $("o-lines").textContent = p.lines;
    $("o-pickers").textContent = p.pickers;
    $("o-batch").textContent = p.batch;
    $("seed").textContent = seed;

    const sim = simulate(p);
    const R = sim.results;

    $("tbody").innerHTML = STRATS.map(s => {
      const r = R[s.id];
      return `<tr><td class="wrap-cell"><b>${s.name}</b><br><span class="muted small">${s.desc}</span></td>` +
        `<td class="num">${nf1.format(r.dist / 1000)} km</td><td class="num">${nf0.format(r.distPerOrder)} m</td>` +
        `<td class="num">${nf1.format(r.hours)} h</td><td class="num">${nf0.format(r.throughput)}</td></tr>`;
    }).join("");

    bars($("c-dist"), STRATS.map(s => ({ label: s.name, v: R[s.id].distPerOrder })), v => nf0.format(v) + " m", "m");
    bars($("c-time"), STRATS.map(s => ({ label: s.name, v: R[s.id].hours })), v => nf1.format(v) + " h", "h");

    // lectura automática
    const byDist = STRATS.slice().sort((a, b) => R[a.id].distPerOrder - R[b.id].distPerOrder)[0];
    const byTime = STRATS.slice().sort((a, b) => R[a.id].hours - R[b.id].hours)[0];
    const base = R.single;
    const out = [];
    const dGain = 100 * (1 - R[byDist.id].distPerOrder / base.distPerOrder);
    const tGain = 100 * (1 - R[byTime.id].hours / base.hours);
    out.push(byDist.id === "single"
      ? `Caminando, la estrategia que menos distancia recorre por pedido es <b>${byDist.name.toLowerCase()}</b>.`
      : `Caminando, la estrategia que menos distancia recorre por pedido es <b>${byDist.name.toLowerCase()}</b>: ${nf0.format(R[byDist.id].distPerOrder)} m, un ${nf0.format(dGain)} % menos que preparar pedido a pedido.`);
    if (byTime.id === byDist.id) {
      out.push(byTime.id === "single" ? "También es la más rápida en terminar todos los pedidos." : `También es la más rápida en terminar todos los pedidos (${nf1.format(R[byTime.id].hours)} h, un ${nf0.format(tGain)} % menos que por pedido).`);
    } else {
      out.push(`Pero la más rápida en terminar todos los pedidos es <b>${byTime.name.toLowerCase()}</b> (${nf1.format(R[byTime.id].hours)} h). Menos distancia no siempre significa menos tiempo, porque cada estrategia añade tareas distintas: clasificar los lotes o repartir los pedidos entre zonas.`);
    }
    const loads = R.zone.loads;
    const avgLoad = loads.reduce((a, b) => a + b, 0) / loads.length;
    const over = 100 * (Math.max(...loads) / avgLoad - 1);
    if (p.pickers > 1 && over >= 25) out.push(`En el picking por zonas, la zona más cargada tiene un ${nf0.format(over)} % más de trabajo que la media, así que el resto de personas espera. Es el problema típico cuando los productos más pedidos están concentrados.`);
    if (p.pickers === 1) out.push("Con una sola persona, preparar por zonas equivale a preparar por pedido: pruébalo con más personas.");
    $("insights").innerHTML = `<h3>Lo que dicen los datos</h3><p>${out.join("</p><p>")}</p>`;

    map($("c-map"), sim, $("p-view").value, p);
    example(sim, p);
    decision(p);
    $("a-speed").textContent = `${nf1.format(CFG.speed)} m/s`; $("a-pick").textContent = `${CFG.pickT} s por línea`;
    $("a-sort").textContent = `${CFG.sortT} s por línea`; $("a-consol").textContent = `${CFG.consolT} s`; $("a-trip").textContent = `${CFG.tripT} s por ruta`;
  }

  ["p-orders", "p-lines", "p-pickers", "p-batch", "p-layout", "p-route", "h-speed", "h-pick", "h-sort", "h-consol", "h-trip"].forEach(id => $(id).addEventListener("input", run));
  $("p-view").addEventListener("input", run);
  $("again").addEventListener("click", () => { seed = (seed * 7919 + 13) % 100000; run(); });
  $("reset").addEventListener("click", () => {
    $("p-orders").value = 300; $("p-lines").value = 4; $("p-pickers").value = 3; $("p-batch").value = 5;
    $("p-layout").value = "random"; $("p-route").value = "s"; $("p-view").value = "single"; seed = 7;
    $("h-speed").value = DEF.speed; $("h-pick").value = DEF.pickT; $("h-sort").value = DEF.sortT; $("h-consol").value = DEF.consolT; $("h-trip").value = DEF.tripT; run();
  });

  run();
})();
