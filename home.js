// Cifras de la home, calculadas en vivo a partir de los mismos datos del dashboard.
(function () {
  "use strict";
  if (!window.ORDERS) return;

  // columnas: 0 id, 1 pedido, 2 prometida, 3 entrega, 4 ruta, 5 almacén, 6 coste, 7 estado
  const delivered = window.ORDERS.filter(r => r[7] === "Entregado");
  const onTime = r => r[3] <= r[2];
  const pct = a => (100 * a.filter(onTime).length) / a.length;

  const byRoute = {};
  delivered.forEach(r => (byRoute[r[4]] = byRoute[r[4]] || []).push(r));
  const worst = Object.entries(byRoute).sort((a, b) => pct(a[1]) - pct(b[1]))[0];

  const nf0 = new Intl.NumberFormat("es-ES", { useGrouping: "always" });
  const nf1 = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  document.getElementById("fig-orders").textContent = nf0.format(window.ORDERS.length);
  document.getElementById("fig-ontime").textContent = nf1.format(pct(delivered)) + " %";
  document.getElementById("fig-worst").textContent = worst[0];
})();
