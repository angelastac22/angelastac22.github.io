// Generado por analysis.py: resultados reales de ejecutar queries.sql en SQLite
window.ANALYSIS = {
 "sqlite": "3.45.1",
 "queries": [
  {
   "id": "kpis",
   "titulo": "Indicadores generales",
   "pregunta": "¿Cuántos pedidos hay, cuántos llegan a tiempo y cuánto cuestan? Usa CASE WHEN dentro de funciones de agregación para calcular cada indicador sobre el conjunto de filas que le corresponde.",
   "sql": "SELECT\n  COUNT(*)                                                     AS pedidos,\n  SUM(status = 'Entregado')                                    AS entregados,\n  ROUND(100.0 * SUM(status = 'Entregado' AND delivery_date <= promised_date)\n        / SUM(status = 'Entregado'), 1)                        AS pct_a_tiempo,\n  ROUND(AVG(CASE WHEN status <> 'Cancelado' THEN order_cost END), 2) AS coste_medio,\n  ROUND(AVG(CASE WHEN status = 'Entregado' AND delivery_date > promised_date\n                 THEN julianday(delivery_date) - julianday(promised_date) END), 1) AS retraso_medio_dias\nFROM orders;",
   "columns": [
    "pedidos",
    "entregados",
    "pct_a_tiempo",
    "coste_medio",
    "retraso_medio_dias"
   ],
   "rows": [
    [
     3000,
     2888,
     79.2,
     273.04,
     2.1
    ]
   ]
  },
  {
   "id": "rutas",
   "titulo": "Cumplimiento por ruta",
   "pregunta": "¿Qué rutas cumplen menos? Une los pedidos con la tabla de rutas (JOIN) para ver el plazo prometido junto al resultado, y agrupa con GROUP BY.",
   "sql": "SELECT\n  o.route                                                      AS ruta,\n  r.promised_days                                              AS plazo_dias,\n  COUNT(*)                                                     AS entregas,\n  ROUND(100.0 * SUM(o.delivery_date <= o.promised_date) / COUNT(*), 1) AS pct_a_tiempo\nFROM orders o\nJOIN routes r ON r.route = o.route\nWHERE o.status = 'Entregado'\nGROUP BY o.route, r.promised_days\nORDER BY pct_a_tiempo;",
   "columns": [
    "ruta",
    "plazo_dias",
    "entregas",
    "pct_a_tiempo"
   ],
   "rows": [
    [
     "Sur",
     4,
     564,
     67.2
    ],
    [
     "Este",
     3,
     515,
     75.1
    ],
    [
     "Oeste",
     3,
     483,
     83.4
    ],
    [
     "Norte",
     3,
     637,
     84.1
    ],
    [
     "Centro",
     2,
     689,
     84.5
    ]
   ]
  },
  {
   "id": "meses",
   "titulo": "Los meses con peor cumplimiento",
   "pregunta": "¿Hay estacionalidad? Se extrae el mes de la fecha con substr y se ordena de peor a mejor.",
   "sql": "SELECT\n  substr(order_date, 1, 7)                                     AS mes,\n  COUNT(*)                                                     AS entregas,\n  ROUND(100.0 * SUM(delivery_date <= promised_date) / COUNT(*), 1) AS pct_a_tiempo\nFROM orders\nWHERE status = 'Entregado'\nGROUP BY mes\nORDER BY pct_a_tiempo\nLIMIT 4;",
   "columns": [
    "mes",
    "entregas",
    "pct_a_tiempo"
   ],
   "rows": [
    [
     "2025-12",
     231,
     66.2
    ],
    [
     "2025-11",
     247,
     69.2
    ],
    [
     "2025-06",
     168,
     73.8
    ],
    [
     "2025-02",
     132,
     76.5
    ]
   ]
  },
  {
   "id": "combinaciones",
   "titulo": "Dónde se concentran las entregas tardías de más",
   "pregunta": "¿Qué combinaciones de almacén y ruta tienen más retrasos de los que cabría esperar? Compara cada combinación con la tasa global de retrasos (CTE) y las ordena con una función de ventana (RANK).",
   "sql": "WITH global AS (\n  SELECT 1.0 * SUM(delivery_date > promised_date) / COUNT(*) AS tasa_global\n  FROM orders\n  WHERE status = 'Entregado'\n),\ncombos AS (\n  SELECT warehouse, route,\n         COUNT(*)                          AS entregas,\n         SUM(delivery_date > promised_date) AS tardias\n  FROM orders\n  WHERE status = 'Entregado'\n  GROUP BY warehouse, route\n)\nSELECT\n  RANK() OVER (ORDER BY tardias - entregas * tasa_global DESC) AS puesto,\n  warehouse                                                    AS almacen,\n  route                                                        AS ruta,\n  entregas,\n  tardias,\n  ROUND(100.0 * tardias / entregas, 1)                         AS pct_tardias,\n  ROUND(tardias - entregas * tasa_global, 1)                   AS tardias_de_mas\nFROM combos, global\nORDER BY puesto\nLIMIT 5;",
   "columns": [
    "puesto",
    "almacen",
    "ruta",
    "entregas",
    "tardias",
    "pct_tardias",
    "tardias_de_mas"
   ],
   "rows": [
    [
     1,
     "Centro B",
     "Sur",
     201,
     88,
     43.8,
     46.2
    ],
    [
     2,
     "Centro B",
     "Este",
     184,
     59,
     32.1,
     20.7
    ],
    [
     3,
     "Centro A",
     "Sur",
     257,
     67,
     26.1,
     13.5
    ],
    [
     4,
     "Centro C",
     "Sur",
     106,
     30,
     28.3,
     7.9
    ],
    [
     5,
     "Centro C",
     "Este",
     98,
     26,
     26.5,
     5.6
    ]
   ]
  },
  {
   "id": "coste_global",
   "titulo": "Coste de un pedido tardío, a primera vista",
   "pregunta": "¿Cuánto más cuesta un pedido que llega tarde? Esta primera comparación mezcla todas las rutas.",
   "sql": "SELECT\n  ROUND(AVG(CASE WHEN delivery_date >  promised_date THEN order_cost END), 2) AS coste_tardio,\n  ROUND(AVG(CASE WHEN delivery_date <= promised_date THEN order_cost END), 2) AS coste_a_tiempo,\n  ROUND(AVG(CASE WHEN delivery_date >  promised_date THEN order_cost END)\n      - AVG(CASE WHEN delivery_date <= promised_date THEN order_cost END), 2) AS diferencia\nFROM orders\nWHERE status = 'Entregado';",
   "columns": [
    "coste_tardio",
    "coste_a_tiempo",
    "diferencia"
   ],
   "rows": [
    [
     324.27,
     259.37,
     64.89
    ]
   ]
  },
  {
   "id": "coste_ruta",
   "titulo": "Coste de un pedido tardío, dentro de cada ruta",
   "pregunta": "¿La diferencia anterior es real o viene de la mezcla de rutas? Si la ruta Sur es cara y además tarda más, parecerá que \"retrasarse cuesta mucho\" aunque no sea así. Se compara dentro de cada ruta.",
   "sql": "SELECT\n  o.route                                                      AS ruta,\n  r.reference_cost                                             AS tarifa_ref,\n  SUM(o.delivery_date > o.promised_date)                       AS tardias,\n  ROUND(AVG(CASE WHEN o.delivery_date >  o.promised_date THEN o.order_cost END), 2) AS coste_tardio,\n  ROUND(AVG(CASE WHEN o.delivery_date <= o.promised_date THEN o.order_cost END), 2) AS coste_a_tiempo,\n  ROUND(AVG(CASE WHEN o.delivery_date >  o.promised_date THEN o.order_cost END)\n      - AVG(CASE WHEN o.delivery_date <= o.promised_date THEN o.order_cost END), 2) AS diferencia\nFROM orders o\nJOIN routes r ON r.route = o.route\nWHERE o.status = 'Entregado'\nGROUP BY o.route, r.reference_cost\nORDER BY diferencia DESC;",
   "columns": [
    "ruta",
    "tarifa_ref",
    "tardias",
    "coste_tardio",
    "coste_a_tiempo",
    "diferencia"
   ],
   "rows": [
    [
     "Centro",
     150.0,
     107,
     190.1,
     156.85,
     33.25
    ],
    [
     "Oeste",
     260.0,
     80,
     297.67,
     267.57,
     30.1
    ],
    [
     "Este",
     310.0,
     128,
     342.31,
     321.07,
     21.25
    ],
    [
     "Sur",
     420.0,
     185,
     465.01,
     445.34,
     19.67
    ],
    [
     "Norte",
     180.0,
     101,
     206.81,
     188.5,
     18.31
    ]
   ]
  }
 ],
 "checks": [
  {
   "nombre": "Pedidos",
   "sql": 3000,
   "python": 3000,
   "ok": true
  },
  {
   "nombre": "Pedidos entregados",
   "sql": 2888,
   "python": 2888,
   "ok": true
  },
  {
   "nombre": "Entregas a tiempo (%)",
   "sql": 79.2,
   "python": 79.1898,
   "ok": true
  },
  {
   "nombre": "Coste medio por pedido (€)",
   "sql": 273.04,
   "python": 273.0412,
   "ok": true
  },
  {
   "nombre": "Retraso medio de las tardías (días)",
   "sql": 2.1,
   "python": 2.1215,
   "ok": true
  },
  {
   "nombre": "Entregas a tiempo, ruta Centro (%)",
   "sql": 84.5,
   "python": 84.4702,
   "ok": true
  },
  {
   "nombre": "Entregas a tiempo, ruta Este (%)",
   "sql": 75.1,
   "python": 75.1456,
   "ok": true
  },
  {
   "nombre": "Entregas a tiempo, ruta Norte (%)",
   "sql": 84.1,
   "python": 84.1444,
   "ok": true
  },
  {
   "nombre": "Entregas a tiempo, ruta Oeste (%)",
   "sql": 83.4,
   "python": 83.4369,
   "ok": true
  },
  {
   "nombre": "Entregas a tiempo, ruta Sur (%)",
   "sql": 67.2,
   "python": 67.1986,
   "ok": true
  },
  {
   "nombre": "Peor mes: entregas a tiempo (%)",
   "sql": 66.2,
   "python": 66.2338,
   "ok": true
  },
  {
   "nombre": "Entregas tardías de más en la peor combinación",
   "sql": 46.2,
   "python": 46.1714,
   "ok": true
  },
  {
   "nombre": "Diferencia de coste tardío vs a tiempo, global (€)",
   "sql": 64.89,
   "python": 64.8937,
   "ok": true
  },
  {
   "nombre": "Diferencia de coste tardío vs a tiempo, ruta Centro (€)",
   "sql": 33.25,
   "python": 33.2502,
   "ok": true
  },
  {
   "nombre": "Diferencia de coste tardío vs a tiempo, ruta Este (€)",
   "sql": 21.25,
   "python": 21.2481,
   "ok": true
  },
  {
   "nombre": "Diferencia de coste tardío vs a tiempo, ruta Norte (€)",
   "sql": 18.31,
   "python": 18.3102,
   "ok": true
  },
  {
   "nombre": "Diferencia de coste tardío vs a tiempo, ruta Oeste (€)",
   "sql": 30.1,
   "python": 30.1005,
   "ok": true
  },
  {
   "nombre": "Diferencia de coste tardío vs a tiempo, ruta Sur (€)",
   "sql": 19.67,
   "python": 19.6704,
   "ok": true
  }
 ]
};
