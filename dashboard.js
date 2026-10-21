// Operations Intelligence · lógica del dashboard
// Sin librerías: los gráficos son SVG construidos a mano.
(function () {
  "use strict";

  const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const DAY = 86400000;
  const nf0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: "always" });
  const nf1 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
  const $ = id => document.getElementById(id);
  const days = s => Date.parse(s + "T00:00:00Z") / DAY;
  const sum = (a, k) => a.reduce((t, r) => t + r[k], 0);
  const monthLabel = ym => MONTHS[+ym.slice(5, 7) - 1] + " " + ym.slice(2, 4);

  // ---------- Datos ----------
  const rows = window.ORDERS.map(r => {
    const o = {
      id: r[0], order: r[1], promised: r[2], delivered: r[3],
      route: r[4], warehouse: r[5], cost: r[6], status: r[7], month: r[1].slice(0, 7),
    };
    if (o.delivered) {
      o.delay = days(o.delivered) - days(o.promised);
      o.onTime = o.delay <= 0;
    }
    return o;
  });

  const pct = a => (a.length ? (100 * a.filter(r => r.onTime).length) / a.length : null);
  function groupBy(arr, key) {
    const m = new Map();
    arr.forEach(r => {
      const k = typeof key === "function" ? key(r) : r[key];
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    });
    return m;
  }

  // ---------- Controles ----------
  const uniq = k => [...new Set(rows.map(r => r[k]))].sort();
  function fillSelect(id, values) {
    values.forEach(v => {
      const o = document.createElement("option");
      o.value = o.textContent = v;
      $(id).appendChild(o);
    });
  }
  fillSelect("f-route", uniq("route"));
  fillSelect("f-wh", uniq("warehouse"));
  fillSelect("f-status", uniq("status"));
  const allDates = rows.map(r => r.order).sort();
  $("f-from").min = $("f-to").min = allDates[0];
  $("f-from").max = $("f-to").max = allDates[allDates.length - 1];

  function current() {
    const from = $("f-from").value, to = $("f-to").value;
    const route = $("f-route").value, wh = $("f-wh").value, st = $("f-status").value;
    return rows.filter(r =>
      (!from || r.order >= from) && (!to || r.order <= to) &&
      (route === "all" || r.route === route) &&
      (wh === "all" || r.warehouse === wh) &&
      (st === "all" || r.status === st));
  }

  // ---------- Gráficos ----------
  const empty = () => '<p class="empty">Sin datos con estos filtros.</p>';

  function lineChart(el, pts) {
    if (pts.length < 2) { el.innerHTML = empty(); return; }
    const W = 760, H = 280, L = 44, R = 14, T = 14, B = 34;
    const lo = Math.max(0, Math.floor((Math.min(...pts.map(p => p.v)) - 5) / 10) * 10), hi = 100;
    const x = i => L + ((W - L - R) * i) / (pts.length - 1);
    const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
    let g = "";
    for (let v = lo; v <= hi; v += 10) {
      g += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/>` +
           `<text class="tick" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v}%</text>`;
    }
    const step = Math.ceil(pts.length / 9);
    pts.forEach((p, i) => {
      if (i % step === 0) g += `<text class="tick" x="${x(i)}" y="${H - 10}" text-anchor="middle">${p.label}</text>`;
    });
    g += `<path class="line" d="${pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.v).toFixed(1)).join(" ")}"/>`;
    pts.forEach((p, i) => {
      g += `<circle class="dot" cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4"><title>${p.label}: ${nf1.format(p.v)} % (${p.n} entregas)</title></circle>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Porcentaje de entregas a tiempo por mes">${g}</svg>`;
  }

  function barChart(el, items, avg) {
    if (!items.length) { el.innerHTML = empty(); return; }
    const W = 520, rowH = 46, T = 14, L = 78, R = 64, H = T + rowH * items.length + 8;
    const bw = W - L - R, bx = v => L + (bw * v) / 100;
    let g = "";
    items.forEach((it, i) => {
      const y = T + i * rowH;
      g += `<text class="lab" x="0" y="${y + 20}">${it.label}</text>` +
           `<rect class="track" x="${L}" y="${y + 5}" width="${bw}" height="22"/>` +
           `<rect class="bar${i === 0 ? " worst" : ""}" x="${L}" y="${y + 5}" width="${(bw * it.v / 100).toFixed(1)}" height="22"><title>${it.label}: ${nf1.format(it.v)} % (${it.n} entregas)</title></rect>` +
           `<text class="val" x="${bx(it.v) + 8}" y="${y + 21}">${nf1.format(it.v)}%</text>`;
    });
    g += `<line class="avg" x1="${bx(avg)}" x2="${bx(avg)}" y1="${T - 6}" y2="${H - 4}"/>` +
         `<text class="tick" x="${bx(avg)}" y="${T - 8}" text-anchor="middle">media ${nf1.format(avg)}%</text>`;
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H + 8}" role="img" aria-label="Entregas a tiempo por ruta">${g}</svg>`;
  }

  const mix = (a, b, t) => a.map((c, i) => Math.round(c + (b[i] - c) * t));
  function heatChart(el, delivered) {
    const whs = [...new Set(delivered.map(r => r.warehouse))].sort();
    const routes = [...new Set(delivered.map(r => r.route))].sort();
    if (!whs.length || !routes.length) { el.innerHTML = empty(); return; }
    const cells = new Map();
    delivered.forEach(r => {
      const k = r.warehouse + "|" + r.route;
      if (!cells.has(k)) cells.set(k, []);
      cells.get(k).push(r);
    });
    const vals = [...cells.values()].filter(a => a.length >= 5).map(pct);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const W = 520, L = 78, T = 28, cw = (W - L) / routes.length, ch = 52, H = T + ch * whs.length;
    const BAD = [217, 83, 43], GOOD = [222, 233, 251];
    let g = "";
    routes.forEach((r, j) => g += `<text class="tick" x="${L + cw * j + cw / 2}" y="16" text-anchor="middle">${r}</text>`);
    whs.forEach((w, i) => {
      g += `<text class="lab" x="0" y="${T + ch * i + ch / 2 + 5}">${w}</text>`;
      routes.forEach((r, j) => {
        const a = cells.get(w + "|" + r) || [];
        const x = L + cw * j, y = T + ch * i;
        if (a.length < 5) {
          g += `<rect x="${x + 2}" y="${y + 2}" width="${cw - 4}" height="${ch - 4}" fill="none" stroke="var(--rule)"/>` +
               `<text class="cell-t" x="${x + cw / 2}" y="${y + ch / 2 + 4}" text-anchor="middle" fill="var(--muted)">·</text>`;
          return;
        }
        const v = pct(a), t = hi === lo ? 1 : (v - lo) / (hi - lo);
        const [R, G, B] = mix(BAD, GOOD, t);
        const dark = t < 0.3;
        g += `<rect x="${x + 2}" y="${y + 2}" width="${cw - 4}" height="${ch - 4}" fill="rgb(${R},${G},${B})"><title>${w} · ${r}: ${nf1.format(v)} % (${a.length} entregas)</title></rect>` +
             `<text class="cell-t" x="${x + cw / 2}" y="${y + ch / 2 + 4}" text-anchor="middle" fill="${dark ? "#f3efe6" : "#16181d"}">${nf1.format(v)}%</text>`;
      });
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H + 4}" role="img" aria-label="Entregas a tiempo por almacén y ruta">${g}</svg>`;
  }

  // ---------- Lectura automática ----------
  function insights(delivered) {
    const out = [];
    const byRoute = [...groupBy(delivered, "route")].filter(([, a]) => a.length >= 20).map(([k, a]) => [k, pct(a)]).sort((a, b) => a[1] - b[1]);
    if (byRoute.length >= 2) {
      const w = byRoute[0], b = byRoute[byRoute.length - 1];
      out.push(`La ruta <b>${w[0]}</b> es la de menor cumplimiento (${nf1.format(w[1])} %), frente al ${nf1.format(b[1])} % de <b>${b[0]}</b>.`);
    }
    const byMonth = [...groupBy(delivered, "month")].filter(([, a]) => a.length >= 20).map(([k, a]) => [k, pct(a)]).sort((a, b) => a[1] - b[1]);
    if (byMonth.length >= 2) {
      out.push(`El mes más flojo fue <b>${monthLabel(byMonth[0][0])}</b> (${nf1.format(byMonth[0][1])} %).`);
    }
    const combos = [...groupBy(delivered, r => r.warehouse + " · " + r.route)].filter(([, a]) => a.length >= 15).map(([k, a]) => [k, pct(a)]).sort((a, b) => a[1] - b[1]);
    if (combos.length >= 2) {
      out.push(`La combinación almacén-ruta más crítica es <b>${combos[0][0]}</b> (${nf1.format(combos[0][1])} %).`);
    }
    $("insights").innerHTML = out.length
      ? `<h3>Lo que dicen los datos</h3><p>${out.join("</p><p>")}</p>`
      : `<h3>Lo que dicen los datos</h3><p>Hay muy pocos datos con estos filtros para sacar conclusiones fiables.</p>`;
  }

  // ---------- Tabla ----------
  let shown = 25, filtered = [];
  function renderTable() {
    const list = filtered.slice().sort((a, b) => (a.order < b.order ? 1 : a.order > b.order ? -1 : b.id.localeCompare(a.id)));
    $("tbody").innerHTML = list.slice(0, shown).map(r => {
      const d = r.delay;
      return `<tr><td>${r.id}</td><td>${r.order}</td><td>${r.promised}</td><td>${r.delivered || "—"}</td>` +
        `<td>${r.route}</td><td>${r.warehouse}</td><td class="num">${eur.format(r.cost)}</td><td>${r.status}</td>` +
        `<td class="num ${d > 0 ? "late" : ""}">${d === undefined ? "—" : d > 0 ? "+" + d + " d" : d === 0 ? "0" : d + " d"}</td></tr>`;
    }).join("");
    $("count").textContent = `${nf0.format(Math.min(shown, list.length))} de ${nf0.format(list.length)}`;
    $("more").style.display = shown >= list.length ? "none" : "";
  }

  // ---------- Render general ----------
  function render() {
    const f = filtered = current();
    const delivered = f.filter(r => r.status === "Entregado");
    const late = delivered.filter(r => !r.onTime);
    const billable = f.filter(r => r.status !== "Cancelado");

    $("k-orders").textContent = nf0.format(f.length);
    $("k-ontime").textContent = delivered.length ? nf1.format(pct(delivered)) + " %" : "—";
    $("k-cost").textContent = billable.length ? eur.format(sum(billable, "cost") / billable.length) : "—";
    $("k-delay").textContent = late.length ? nf1.format(sum(late, "delay") / late.length) + " días" : "—";

    insights(delivered);

    const months = [...groupBy(delivered, "month")].sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([k, a]) => ({ label: monthLabel(k), v: pct(a), n: a.length }));
    lineChart($("c-line"), months);

    const routes = [...groupBy(delivered, "route")].map(([k, a]) => ({ label: k, v: pct(a), n: a.length }))
      .sort((a, b) => a.v - b.v);
    barChart($("c-bars"), routes, delivered.length ? pct(delivered) : 0);

    heatChart($("c-heat"), delivered);
    renderTable();
  }

  // ---------- Eventos ----------
  ["f-from", "f-to", "f-route", "f-wh", "f-status"].forEach(id =>
    $(id).addEventListener("input", () => { shown = 25; render(); }));

  $("reset").addEventListener("click", () => {
    $("f-from").value = $("f-to").value = "";
    ["f-route", "f-wh", "f-status"].forEach(id => ($(id).value = "all"));
    shown = 25; render();
  });

  $("more").addEventListener("click", () => { shown += 50; renderTable(); });

  $("dl").addEventListener("click", () => {
    const head = ["order_id", "order_date", "promised_date", "delivery_date", "route", "warehouse", "order_cost", "status"];
    const lines = filtered.map(r => [r.id, r.order, r.promised, r.delivered || "", r.route, r.warehouse,
      r.cost.toFixed(2).replace(".", ","), r.status].join(";"));
    // BOM + punto y coma + coma decimal: se abre bien en Excel en español
    const blob = new Blob(["﻿" + head.join(";") + "\n" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "pedidos_filtrados.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  render();
})();
