// Informes automáticos · lógica
// Lee archivos CSV, detecta incidencias, limpia los datos y genera un informe.
// Todo ocurre en el navegador: los archivos no se envían a ningún sitio.
(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const nf0 = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0, useGrouping: "always" });
  const nf1 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: "always" });
  const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", useGrouping: "always" });
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

  // ---------- Utilidades de texto, números y fechas ----------
  const MISSING = new Set(["", "n/a", "na", "null", "nan", "-", "s/d"]);
  const isMissing = s => MISSING.has(String(s).trim().toLowerCase());
  const tidy = s => String(s).replace(/\s+/g, " ").trim();
  const normKey = s => tidy(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

  function parseNum(s) {
    let t = String(s).trim().replace(/[€$\s]/g, "");
    if (/^[-+]?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, "").replace(",", ".");
    else if (/^[-+]?\d+,\d+$/.test(t)) t = t.replace(",", ".");
    else if (!/^[-+]?\d+(\.\d+)?$/.test(t)) return NaN;
    return Number(t);
  }
  const fmtNum = n => String(+n.toFixed(6)).replace(".", ",");

  const LOOKDATE = /^\d{1,4}[\/\-.]\d{1,2}[\/\-.]\d{1,4}$/;
  function parseDate(s) {
    const m = String(s).trim().match(/^(\d{1,4})[\/\-.](\d{1,2})[\/\-.](\d{1,4})$/);
    if (!m) return null;
    let y, mo, d;
    if (m[1].length === 4) { y = +m[1]; mo = +m[2]; d = +m[3]; }
    else if (m[3].length === 4) { y = +m[3]; mo = +m[2]; d = +m[1]; }
    else return null;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d ? dt : null;
  }
  const isoDate = dt => dt.toISOString().slice(0, 10);

  // ---------- Lectura de CSV ----------
  function parseCSV(text) {
    text = text.replace(/^﻿/, "");
    const first = text.split(/\r?\n/)[0] || "";
    const counts = { ";": 0, ",": 0, "\t": 0 };
    let q = false;
    for (const ch of first) { if (ch === '"') q = !q; else if (!q && ch in counts) counts[ch]++; }
    const delim = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const rows = []; let row = [], field = "", inQ = false;
    const endRow = () => { row.push(field); field = ""; if (row.some(c => c.trim() !== "")) rows.push(row); row = []; };
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQ) {
        if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; } else field += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === delim) { row.push(field); field = ""; }
      else if (ch === "\n") endRow();
      else if (ch !== "\r") field += ch;
    }
    if (field !== "" || row.length) endRow();
    return { delim, header: (rows.shift() || []).map(h => tidy(h)), rows };
  }

  async function readFile(file) {
    const buf = await file.arrayBuffer();
    try { return new TextDecoder("utf-8", { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder("windows-1252").decode(buf); }
  }

  // ---------- Unión de archivos ----------
  function combine(files) {
    const notes = [], used = [];
    let header = null; const rows = [];
    files.forEach(f => {
      const p = parseCSV(f.text);
      if (!p.header.length) { notes.push({ name: f.name, msg: "Archivo vacío: no se incluye." }); return; }
      if (!header) header = p.header;
      else if (p.header.length !== header.length || p.header.some((h, i) => h.toLowerCase() !== header[i].toLowerCase())) {
        notes.push({ name: f.name, msg: "Sus columnas no coinciden con las del primer archivo: no se incluye." }); return;
      }
      p.rows.forEach((r, i) => rows.push({ v: header.map((_, j) => (r[j] === undefined ? "" : r[j])), rawLen: r.length, file: f.name, line: i + 2 }));
      used.push({ name: f.name, rows: p.rows.length });
    });
    return { header: header || [], rows, used, notes };
  }

  // ---------- Análisis: detectar incidencias ----------
  const HANDLING = {
    "Fila duplicada": ["Error", "Se elimina en la limpieza"],
    "Variante de escritura": ["Aviso", "Se unifica en la limpieza"],
    "Valor vacío": ["Aviso", "Se deja para revisar"],
    "No es un número": ["Error", "Se deja para revisar"],
    "Fecha no válida": ["Error", "Se deja para revisar"],
    "Valor negativo": ["Aviso", "Se deja para revisar"],
    "Valor atípico": ["Aviso", "Se deja para revisar"],
    "Identificador repetido": ["Error", "Se deja para revisar"],
    "Columnas de más o de menos": ["Aviso", "Se deja para revisar"],
  };
  const quantile = (sorted, p) => {
    const i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  };

  function analyze(ds) {
    const { header, rows } = ds, nC = header.length, inc = [];
    const add = (tipo, r, col, valor, detalle) => inc.push({
      tipo, grav: HANDLING[tipo][0], file: r.file, line: r.line, col: col === null ? "—" : header[col], valor, detalle, row: r,
    });

    rows.forEach(r => { if (r.rawLen !== nC) add("Columnas de más o de menos", r, null, "", `La fila tiene ${r.rawLen} columnas y la cabecera ${nC}.`); });

    // duplicados exactos (ignorando mayúsculas y espacios sobrantes)
    const seen = new Map();
    rows.forEach(r => {
      const k = r.v.map(x => tidy(x).toLowerCase()).join("\u0001");
      r.dup = seen.has(k);
      if (r.dup) { const o = seen.get(k); add("Fila duplicada", r, null, "", `Igual que la fila ${o.line} de ${o.file}.`); } else seen.set(k, r);
    });
    const live = rows.filter(r => !r.dup);

    // tipo de cada columna
    const cols = header.map((name, j) => {
      const vals = live.map(r => r.v[j]).filter(x => !isMissing(x));
      const n = vals.length;
      const dateLook = vals.filter(x => LOOKDATE.test(x.trim())).length;
      const numOk = vals.filter(x => !isNaN(parseNum(x))).length;
      const type = n && dateLook / n >= 0.6 ? "date" : n && numOk / n >= 0.8 ? "num" : "text";
      const uniq = new Set(vals.map(normKey)).size;
      const ratio = n ? uniq / n : 0;
      const intLike = type === "num" && vals.every(x => Number.isInteger(parseNum(x)) || isNaN(parseNum(x)));
      return { name, j, type, n, uniq, ratio, id: (type === "num" && intLike && ratio >= 0.9) || (type === "text" && ratio >= 0.9), canon: null };
    });

    cols.forEach(c => {
      const j = c.j, nums = [];
      live.forEach(r => {
        const raw = r.v[j];
        if (isMissing(raw)) { add("Valor vacío", r, j, raw, c.type === "text" ? "Campo sin rellenar." : "Falta el dato."); return; }
        if (c.type === "num") {
          const n = parseNum(raw);
          if (isNaN(n)) add("No es un número", r, j, raw, "Hay texto donde se esperaba un número.");
          else nums.push({ r, n });
        } else if (c.type === "date") {
          if (!parseDate(raw)) add("Fecha no válida", r, j, raw, "La fecha no existe o no tiene un formato reconocido.");
        }
      });
      if (c.type === "num" && !c.id && nums.length) {
        nums.forEach(o => { if (o.n < 0) add("Valor negativo", o.r, j, o.r.v[j], "Importe menor que cero."); });
        const s = nums.map(o => o.n).sort((a, b) => a - b);
        if (s.length >= 8) {
          const q1 = quantile(s, .25), q3 = quantile(s, .75), iqr = q3 - q1, lo = q1 - 3 * iqr, hi = q3 + 3 * iqr;
          nums.forEach(o => { if (o.n > hi || (o.n < lo && o.n >= 0)) add("Valor atípico", o.r, j, o.r.v[j], `Muy lejos del rango habitual (${fmtNum(q1)} a ${fmtNum(q3)}).`); });
        }
      }
      if (c.type === "text" && !c.id && c.ratio < 0.5 && c.uniq <= 40) {
        const groups = new Map();
        live.forEach(r => {
          if (isMissing(r.v[j])) return;
          const k = normKey(r.v[j]), g = groups.get(k) || new Map();
          g.set(r.v[j], (g.get(r.v[j]) || 0) + 1); groups.set(k, g);
        });
        c.canon = new Map();
        groups.forEach((forms, k) => {
          const tidyForms = new Map();
          forms.forEach((cnt, f) => tidyForms.set(tidy(f), (tidyForms.get(tidy(f)) || 0) + cnt));
          const best = [...tidyForms.entries()].sort((a, b) => b[1] - a[1] || (a[0] === a[0].toUpperCase() ? 1 : -1))[0][0];
          c.canon.set(k, best);
        });
        live.forEach(r => {
          if (isMissing(r.v[j])) return;
          const canon = c.canon.get(normKey(r.v[j]));
          if (r.v[j] !== canon) add("Variante de escritura", r, j, r.v[j], `Se unifica como «${canon}».`);
        });
      }
    });

    // identificador repetido con datos distintos (primera columna, si es casi única)
    if (cols.length && cols[0].id) {
      const cnt = new Map(); live.forEach(r => cnt.set(tidy(r.v[0]), (cnt.get(tidy(r.v[0])) || 0) + 1));
      live.forEach(r => { if (!isMissing(r.v[0]) && cnt.get(tidy(r.v[0])) > 1) add("Identificador repetido", r, 0, r.v[0], "El mismo identificador aparece con datos distintos."); });
    }
    return { header, cols, rows, live, inc };
  }

  // ---------- Limpieza ----------
  function cleanRows(an) {
    return an.live.map(r => an.cols.map(c => {
      const raw = r.v[c.j];
      if (isMissing(raw)) return "";
      if (c.type === "num") { const n = parseNum(raw); return isNaN(n) ? tidy(raw) : fmtNum(n); }
      if (c.type === "date") { const d = parseDate(raw); return d ? isoDate(d) : tidy(raw); }
      if (c.canon) return c.canon.get(normKey(raw)) || tidy(raw);
      return tidy(raw);
    }));
  }

  const toCSV = (header, rows) => "﻿" + [header, ...rows].map(r => r.map(v => {
    const s = String(v); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(";")).join("\n");

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/csv;charset=utf-8" }));
    a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }

  // ---------- Gráficos ----------
  function hbars(el, rows, fmt) {
    if (!rows.length) { el.innerHTML = '<p class="empty">Sin datos.</p>'; return; }
    const W = 520, rowH = 34, L = 130, R = 90, H = rowH * rows.length + 4;
    const max = Math.max(...rows.map(r => r.v), 1e-9);
    let g = "";
    rows.forEach((r, i) => {
      const y = 2 + i * rowH, bw = Math.max(0, (W - L - R) * r.v / max);
      g += `<text class="lab" x="0" y="${y + 20}">${esc(r.label.length > 18 ? r.label.slice(0, 17) + "…" : r.label)}</text>` +
        `<rect class="track" x="${L}" y="${y + 6}" width="${W - L - R}" height="18"/>` +
        `<rect class="bar" x="${L}" y="${y + 6}" width="${bw.toFixed(1)}" height="18"><title>${esc(r.label)}: ${fmt(r.v)}</title></rect>` +
        `<text class="val" x="${L + bw + 8}" y="${y + 20}">${fmt(r.v)}</text>`;
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
  }

  function columns(el, pts, fmt) {
    if (pts.length < 2) { el.innerHTML = '<p class="empty">Hacen falta fechas en al menos dos meses.</p>'; return; }
    const W = 760, H = 240, L = 10, T = 22, B = 30, n = pts.length, max = Math.max(...pts.map(p => p.v), 1e-9);
    const bw = (W - L * 2) / n;
    let g = "";
    pts.forEach((p, i) => {
      const h = (H - T - B) * p.v / max, x = L + i * bw;
      g += `<rect class="bar" x="${(x + bw * .15).toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${(bw * .7).toFixed(1)}" height="${h.toFixed(1)}"><title>${p.label}: ${fmt(p.v)}</title></rect>` +
        `<text class="tick" x="${(x + bw / 2).toFixed(1)}" y="${H - 10}" text-anchor="middle">${p.label}</text>` +
        (n <= 12 ? `<text class="tick" x="${(x + bw / 2).toFixed(1)}" y="${(H - B - h - 6).toFixed(1)}" text-anchor="middle">${fmt(p.v)}</text>` : "");
    });
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img">${g}</svg>`;
  }

  // ---------- Informe ----------
  let files = [], current = null, shown = 25, incSorted = [];

  function render() {
    const hasFiles = files.length > 0;
    $("results").classList.toggle("hidden", !hasFiles);
    $("btn-clear").classList.toggle("hidden", !hasFiles);
    if (!hasFiles) { $("file-list").innerHTML = ""; return; }

    const ds = combine(files);
    $("file-list").innerHTML = ds.used.map(u => `<li><span>${esc(u.name)}</span><span>${nf0.format(u.rows)} filas</span></li>`).join("") +
      ds.notes.map(n => `<li class="bad"><span>${esc(n.name)}</span><span>${esc(n.msg)}</span></li>`).join("");
    if (!ds.rows.length) { $("results").classList.add("hidden"); return; }

    const an = analyze(ds), cleaned = cleanRows(an);
    current = { ds, an, cleaned };
    const N = ds.rows.length, rowsWithInc = new Set(an.inc.map(i => i.row)).size;
    const okRows = N - rowsWithInc;
    const count = t => an.inc.filter(i => i.tipo === t).length;

    // resumen
    $("k-files").textContent = nf0.format(ds.used.length);
    $("k-rows").textContent = nf0.format(N);
    $("k-clean").textContent = nf0.format(cleaned.length);
    $("k-ok").textContent = nf1.format(100 * okRows / N) + " %";

    // comprobaciones
    $("checks").innerHTML = Object.keys(HANDLING).map(t => {
      const n = count(t), [grav, how] = HANDLING[t];
      const cls = n === 0 ? "ok" : grav === "Error" ? "err" : "warn";
      const ico = n === 0 ? "✓" : grav === "Error" ? "✕" : "!";
      return `<li class="${cls}"><span class="ico">${ico}</span><span>${t}<small>${n === 0 ? "Sin problemas." : how + "."}</small></span><span class="n">${n === 0 ? "0" : nf0.format(n)}</span></li>`;
    }).join("");

    // conclusiones
    const out = [];
    out.push(`Se han leído <b>${nf0.format(N)} filas</b> de ${ds.used.length} ${ds.used.length === 1 ? "archivo" : "archivos"}, con ${an.header.length} columnas.`);
    if (!an.inc.length) out.push("No se ha detectado ninguna incidencia: los datos están listos para usar.");
    else {
      const top = Object.keys(HANDLING).map(t => [t, count(t)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 3);
      out.push(`Se han detectado <b>${nf0.format(an.inc.length)} incidencias</b> en ${nf0.format(rowsWithInc)} filas. El ${nf1.format(100 * okRows / N)} % de las filas está libre de problemas. Las más frecuentes: ${top.map(x => `${x[0].toLowerCase()} (${nf0.format(x[1])})`).join(", ")}.`);
      const removed = N - cleaned.length, unified = count("Variante de escritura"), review = an.inc.filter(i => HANDLING[i.tipo][1].includes("revisar")).length;
      out.push(`La limpieza automática elimina <b>${nf0.format(removed)}</b> filas duplicadas y unifica <b>${nf0.format(unified)}</b> variantes de escritura. También iguala los formatos de números (coma o punto decimal) y de fechas.`);
      if (review) out.push(`Quedan <b>${nf0.format(review)}</b> incidencias que una persona debe revisar, porque no se pueden corregir sin conocer el dato real: valores vacíos, fechas no válidas, importes negativos o atípicos.`);
    }
    $("insights").innerHTML = `<h3>Lo que dicen los datos</h3><p>${out.join("</p><p>")}</p>`;

    renderSummary(an, cleaned);

    // tabla de incidencias
    const order = { Error: 0, Aviso: 1 };
    incSorted = an.inc.slice().sort((a, b) => order[a.grav] - order[b.grav] || a.tipo.localeCompare(b.tipo) || a.file.localeCompare(b.file) || a.line - b.line);
    shown = 25; renderIncidents();
    $("inc-panel").classList.toggle("hidden", !incSorted.length);
  }

  function renderIncidents() {
    $("tbody").innerHTML = incSorted.slice(0, shown).map(i =>
      `<tr><td><span class="tag ${i.grav === "Error" ? "err" : "warn"}">${i.grav}</span></td><td class="wrap-cell">${i.tipo}</td><td>${esc(i.file.replace(/\.csv$/i, ""))}</td><td class="num">${i.line}</td><td>${esc(i.col)}</td><td>${i.valor === "" ? "—" : "«" + esc(i.valor) + "»"}</td><td class="wrap-cell">${esc(i.detalle)}</td></tr>`).join("");
    $("inc-count").textContent = `${nf0.format(Math.min(shown, incSorted.length))} de ${nf0.format(incSorted.length)}`;
    $("more").classList.toggle("hidden", shown >= incSorted.length);
  }

  function renderSummary(an, cleaned) {
    const cols = an.cols;
    // columna de medida: importe, total, etc.
    const numCols = cols.filter(c => c.type === "num" && !c.id);
    const measure = numCols.find(c => /importe|total|amount|coste|precio|venta|valor|ingreso/i.test(c.name)) || numCols[0];
    const dateCol = cols.find(c => c.type === "date");
    const catCols = cols.filter(c => c.type === "text" && !c.id && c.uniq >= 2 && c.uniq <= 12).slice(0, 3);

    // filas con valores que conviene dejar fuera de los totales
    const flagged = new Set(an.inc.filter(i => measure && i.col === measure.name && ["Valor negativo", "Valor atípico", "No es un número"].includes(i.tipo)).map(i => i.row));
    const liveIdx = new Map(an.live.map((r, i) => [r, i]));
    const val = (r, c) => { const n = parseNum(cleaned[liveIdx.get(r)][c.j]); return isNaN(n) ? null : n; };

    const el = $("summary");
    if (!measure) { el.classList.add("hidden"); return; }
    el.classList.remove("hidden");
    let all = 0, good = 0, nGood = 0;
    an.live.forEach(r => { const v = val(r, measure); if (v === null) return; all += v; if (!flagged.has(r)) { good += v; nGood++; } });
    $("s-name").textContent = measure.name;
    $("s-all").textContent = eur.format(all);
    $("s-good").textContent = eur.format(good);
    $("s-avg").textContent = nGood ? eur.format(good / nGood) : "—";
    $("s-note").textContent = `«Sin valores marcados» deja fuera ${nf0.format(flagged.size)} filas con importes negativos, atípicos o ilegibles, para que no distorsionen los totales.`;

    const grid = $("cat-charts"); grid.innerHTML = "";
    catCols.forEach(c => {
      const sums = new Map();
      an.live.forEach(r => {
        if (flagged.has(r)) return;
        const k = cleaned[liveIdx.get(r)][c.j] || "(vacío)", v = val(r, measure);
        if (v !== null) sums.set(k, (sums.get(k) || 0) + v);
      });
      const rows = [...sums.entries()].map(([label, v]) => ({ label, v })).sort((a, b) => b.v - a.v);
      const div = document.createElement("section"); div.className = "panel";
      const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
      div.innerHTML = `<h3>${esc(cap(measure.name))} por ${esc(c.name)}</h3><div></div>`;
      grid.appendChild(div);
      hbars(div.lastChild, rows, v => eur.format(v));
    });

    const mp = $("month-panel");
    if (dateCol) {
      mp.classList.remove("hidden");
      const m = new Map();
      an.live.forEach(r => {
        if (flagged.has(r)) return;
        const d = parseDate(cleaned[liveIdx.get(r)][dateCol.j]), v = val(r, measure);
        if (!d || v === null) return;
        const k = d.getUTCFullYear() * 12 + d.getUTCMonth();
        m.set(k, (m.get(k) || 0) + v);
      });
      const keys = [...m.keys()].sort((a, b) => a - b), pts = [];
      if (keys.length) for (let k = keys[0]; k <= keys[keys.length - 1]; k++) pts.push({ label: MONTHS[k % 12] + " " + String(Math.floor(k / 12)).slice(2), v: m.get(k) || 0 });
      $("month-title").textContent = `${measure.name.charAt(0).toUpperCase() + measure.name.slice(1)} por mes`;
      columns($("c-month"), pts, v => nf0.format(v / 1000) + " k€");
    } else mp.classList.add("hidden");
  }

  // ---------- Entrada de archivos ----------
  async function addFiles(list) {
    for (const f of list) {
      if (!/\.(csv|txt)$/i.test(f.name)) continue;
      files = files.filter(x => x.name !== f.name);
      files.push({ name: f.name, text: await readFile(f) });
    }
    render();
  }

  $("file-input").addEventListener("change", e => { addFiles([...e.target.files]); e.target.value = ""; });
  const drop = $("drop");
  ["dragenter", "dragover"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove("over"); }));
  drop.addEventListener("drop", e => addFiles([...e.dataTransfer.files]));
  $("btn-sample").addEventListener("click", () => { files = window.SAMPLES.map(s => ({ name: s.name, text: s.text })); render(); $("results").scrollIntoView({ behavior: "smooth" }); });
  $("btn-clear").addEventListener("click", () => { files = []; current = null; render(); });
  $("more").addEventListener("click", () => { shown += 50; renderIncidents(); });
  $("dl-clean").addEventListener("click", () => current && download("datos_limpios.csv", toCSV(current.an.header, current.cleaned)));
  $("dl-inc").addEventListener("click", () => current && download("incidencias.csv", toCSV(["gravedad", "tipo", "archivo", "fila", "columna", "valor", "detalle"],
    incSorted.map(i => [i.grav, i.tipo, i.file, i.line, i.col, i.valor, i.detalle]))));
  $("print").addEventListener("click", () => window.print());

  render();
})();
