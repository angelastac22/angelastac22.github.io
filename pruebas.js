// Informes automáticos · batería de pruebas
// Cada caso es un archivo CSV con errores conocidos. Se pasa por la misma lógica que usa la herramienta
// y se compara el número de incidencias esperado con el detectado.
(function () {
  "use strict";
  const C = window.InformesCore, $ = id => document.getElementById(id);
  const TYPES = Object.keys(C.HANDLING);

  // datos base deterministas (sin azar)
  const CLIENTES = ["Aurora Textil", "Brisa Hogar", "Cantábrica Foods", "Delta Ferretería", "Eco Papel", "Fénix Motor"];
  const CIUDADES = ["Bilbao", "Oviedo", "Santander", "Vitoria"];
  const ESTADOS = ["Entregado", "Pendiente", "Cancelado"];
  const HEAD = ["pedido", "fecha", "cliente", "ciudad", "importe", "estado"];
  function base(first, n) {
    const rows = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i * 5));
      const imp = 90 + ((i * 137) % 1500) + ((i * 7) % 100) / 100 + 0.05;
      rows.push([String(first + i), d.toISOString().slice(0, 10), CLIENTES[i % 6], CIUDADES[(i * 3) % 4], imp.toFixed(2), ESTADOS[i % 3]]);
    }
    return rows;
  }
  const csv = (rows, delim = ",") => "﻿" + [HEAD, ...rows].map(r => r.map(v => (String(v).includes(delim) ? '"' + v + '"' : v)).join(delim)).join("\n") + "\n";
  const F = (name, text) => ({ name, text });

  // ---- casos ----
  const cases = [];
  cases.push({
    name: "Archivo limpio", desc: "40 filas sin ningún error. No debe saltar ninguna alarma (comprueba que no hay falsos positivos).",
    files: [F("prueba_01_limpio.csv", csv(base(1001, 40)))], expect: {}, clean: 40,
  });
  (function () {
    const r = base(1001, 40);
    const dup = [r[2].slice(), r[9].slice(), r[15].slice(), r[22].slice(), r[30].slice()];
    dup[1][2] = dup[1][2].toUpperCase();  // mismo pedido en mayúsculas
    dup[3][3] = " " + dup[3][3] + " ";     // con espacios sobrantes
    cases.push({
      name: "Filas duplicadas", desc: "5 filas repetidas: 3 idénticas y 2 que solo cambian en mayúsculas o espacios.",
      files: [F("prueba_02_duplicados.csv", csv(r.concat(dup)))], expect: { "Fila duplicada": 5 }, clean: 40,
    });
  })();
  (function () {
    const r = base(1001, 40);
    [3, 11, 20, 33].forEach(i => { r[i][4] = ""; });
    cases.push({ name: "Importes vacíos", desc: "4 filas sin importe.", files: [F("prueba_03_vacios.csv", csv(r))], expect: { "Valor vacío": 4 }, clean: 40 });
  })();
  (function () {
    const r = base(1001, 40);
    r[4][1] = "2026-13-05"; r[12][1] = "31/02/2026"; r[19][1] = "2026-02-30"; r[27][1] = "sin fecha";
    cases.push({ name: "Fechas imposibles", desc: "4 fechas que no existen: mes 13, 31 de febrero, 30 de febrero y un texto.", files: [F("prueba_04_fechas.csv", csv(r))], expect: { "Fecha no válida": 4 }, clean: 40 });
  })();
  (function () {
    const r = base(1001, 40);
    r.forEach(x => { x[3] = "Bilbao"; });
    [1, 6, 13].forEach(i => { r[i][3] = "BILBAO"; });
    [20, 25].forEach(i => { r[i][3] = " bilbao"; });
    [8, 9, 10, 11, 12].forEach(i => { r[i][3] = "Oviedo"; });
    [30, 31, 32, 33].forEach(i => { r[i][3] = "Santander"; });
    cases.push({
      name: "Misma ciudad escrita de varias formas", desc: "5 variantes de «Bilbao»: 3 en mayúsculas y 2 en minúsculas con espacio. Después de limpiar solo deben quedar 3 ciudades.",
      files: [F("prueba_05_variantes.csv", csv(r))], expect: { "Variante de escritura": 5 }, clean: 40,
      check: res => new Set(res.cleaned.map(x => x[3])).size === 3 ? "" : "Tras la limpieza no quedan solo 3 ciudades distintas.",
    });
  })();
  (function () {
    const r = base(1001, 40);
    r[2][4] = "1.234,56"; r[7][4] = "1234,5"; r[15][4] = "1234.5"; r[21][4] = "€ 99,90"; r[30][4] = "1 099,00";
    cases.push({
      name: "Formatos de número mezclados", desc: "5 importes escritos de formas distintas (1.234,56 · 1234,5 · 1234.5 · € 99,90 · 1 099,00). No son errores: deben entenderse y unificarse.",
      files: [F("prueba_06_formatos.csv", csv(r))], expect: {}, clean: 40,
      check: res => {
        const v = i => res.cleaned[i][4];
        return v(2) === "1234,56" && v(7) === "1234,5" && v(15) === "1234,5" && v(21) === "99,9" && v(30) === "1099" ? "" : "Algún importe no se ha convertido bien.";
      },
    });
  })();
  (function () {
    const r = base(1001, 40);
    r[5][4] = "-120.50"; r[17][4] = "-45.00"; r[26][4] = "99999.00";
    cases.push({ name: "Negativos y atípico", desc: "2 importes negativos y 1 importe disparatado (99.999).", files: [F("prueba_07_negativos_atipico.csv", csv(r))], expect: { "Valor negativo": 2, "Valor atípico": 1 }, clean: 40 });
  })();
  (function () {
    const a = base(1001, 20), b = base(2001, 20);
    const bText = "﻿" + [HEAD, ...b.map(x => { const d = x[1].split("-"); return [x[0], d[2] + "/" + d[1] + "/" + d[0], x[2], x[3], x[4].replace(".", ","), x[5]]; })].map(r => r.join(";")).join("\n") + "\n";
    cases.push({
      name: "Dos archivos con formato distinto", desc: "Uno con comas, puntos decimales y fechas AAAA-MM-DD; otro con punto y coma, comas decimales y fechas DD/MM/AAAA. Deben unirse sin incidencias.",
      files: [F("prueba_08a_norte.csv", csv(a)), F("prueba_08b_sur.csv", bText)], expect: {}, clean: 40,
      check: res => res.cleaned.every(x => /^\d{4}-\d{2}-\d{2}$/.test(x[1])) ? "" : "Alguna fecha no quedó en formato AAAA-MM-DD.",
    });
  })();
  (function () {
    const a = base(1001, 20), b = base(2001, 20);
    b[4][0] = "1005"; b[4][4] = "777.77"; // mismo pedido que el 1005 del primer archivo, con otro importe
    cases.push({ name: "Pedido repetido entre archivos", desc: "El pedido 1005 aparece en los dos archivos con datos distintos. Se espera avisar de las 2 filas.", files: [F("prueba_09a.csv", csv(a)), F("prueba_09b.csv", csv(b))], expect: { "Identificador repetido": 2 }, clean: 40 });
  })();
  (function () {
    const a = base(1001, 20);
    const other = "﻿codigo,producto,unidades\nA1,Tornillo,10\nA2,Tuerca,5\n";
    cases.push({ name: "Archivo con otras columnas", desc: "Se sube un archivo con columnas distintas. Debe rechazarse con un aviso, sin mezclarlo.", files: [F("prueba_10a.csv", csv(a)), F("prueba_10b_otras_columnas.csv", other)], expect: {}, clean: 20, notes: 1 });
  })();

  // ---- ejecución ----
  function run(c) {
    const ds = C.combine(c.files), an = C.analyze(ds), cleaned = C.cleanRows(an);
    const got = {}; TYPES.forEach(t => { got[t] = an.inc.filter(i => i.tipo === t).length; });
    const exp = {}; TYPES.forEach(t => { exp[t] = c.expect[t] || 0; });
    const issues = [];
    TYPES.forEach(t => { if (got[t] !== exp[t]) issues.push(`${t}: esperadas ${exp[t]}, detectadas ${got[t]}`); });
    if (cleaned.length !== c.clean) issues.push(`filas tras limpiar: esperadas ${c.clean}, obtenidas ${cleaned.length}`);
    if ((c.notes || 0) !== ds.notes.length) issues.push(`archivos rechazados: esperados ${c.notes || 0}, obtenidos ${ds.notes.length}`);
    if (c.check) { const m = c.check({ cleaned, an, ds }); if (m) issues.push(m); }
    return { got, exp, issues, rows: cleaned.length };
  }
  const fmt = o => { const k = TYPES.filter(t => o[t]); return k.length ? k.map(t => `${t.toLowerCase()}: ${o[t]}`).join("<br>") : "ninguna incidencia"; };
  const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

  function runAll() {
    let ok = 0;
    $("tests-body").innerHTML = cases.map((c, i) => {
      const r = run(c); if (!r.issues.length) ok++;
      const rej = c.notes ? `<br>${c.notes} archivo rechazado` : "";
      return `<tr><td class="wrap-cell"><b>${i + 1}. ${c.name}</b></td><td class="wrap-cell">${c.desc}</td><td class="wrap-cell">${fmt(r.exp)}${rej}<br><span class="muted small">${c.clean} filas limpias</span></td>` +
        `<td class="wrap-cell">${fmt(r.got)}${rej}<br><span class="muted small">${r.rows} filas limpias</span></td>` +
        `<td class="wrap-cell"><span class="tag ${r.issues.length ? "err" : "ok"}">${r.issues.length ? "Falla" : "Superada"}</span>${r.issues.length ? "<br><span class='small'>" + esc(r.issues.join("; ")) + "</span>" : ""}</td>` +
        `<td class="wrap-cell">${c.files.map((f, k) => `<a href="#" data-c="${i}" data-f="${k}">${esc(f.name)}</a>`).join("<br>")}</td></tr>`;
    }).join("");
    const el = $("tests-summary"); el.innerHTML = `<b>${ok} de ${cases.length} pruebas superadas.</b>`;
    el.dataset.ok = ok; el.dataset.total = cases.length;
  }
  function save(name, text) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
  }
  $("run-tests").addEventListener("click", runAll);
  $("tests-body").addEventListener("click", e => { const a = e.target.closest("a[data-c]"); if (!a) return; e.preventDefault(); const f = cases[+a.dataset.c].files[+a.dataset.f]; save(f.name, f.text); });
  $("dl-tests").addEventListener("click", () => cases.forEach(c => c.files.forEach(f => save(f.name, f.text))));
  runAll();
})();
