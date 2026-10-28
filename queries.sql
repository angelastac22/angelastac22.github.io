-- Operations Intelligence · consultas SQL (SQLite)
--
-- Tablas:
--   orders(order_id, order_date, promised_date, delivery_date, route, warehouse, order_cost, status)
--   routes(route, promised_days, reference_cost)
--
-- Cada consulta empieza con tres líneas de comentario (@id, @titulo, @pregunta) que lee
-- analysis.py para ejecutarlas y generar la página web. Así lo que se ve en la web es
-- exactamente lo que se ha ejecutado.
--
-- Definición clave: una entrega es "a tiempo" si delivery_date <= promised_date.
-- Solo cuentan los pedidos con status = 'Entregado'; los cancelados y los que siguen en
-- tránsito no tienen fecha de entrega.

-- @id: kpis
-- @titulo: Indicadores generales
-- @pregunta: ¿Cuántos pedidos hay, cuántos llegan a tiempo y cuánto cuestan? Usa CASE WHEN dentro de funciones de agregación para calcular cada indicador sobre el conjunto de filas que le corresponde.
SELECT
  COUNT(*)                                                     AS pedidos,
  SUM(status = 'Entregado')                                    AS entregados,
  ROUND(100.0 * SUM(status = 'Entregado' AND delivery_date <= promised_date)
        / SUM(status = 'Entregado'), 1)                        AS pct_a_tiempo,
  ROUND(AVG(CASE WHEN status <> 'Cancelado' THEN order_cost END), 2) AS coste_medio,
  ROUND(AVG(CASE WHEN status = 'Entregado' AND delivery_date > promised_date
                 THEN julianday(delivery_date) - julianday(promised_date) END), 1) AS retraso_medio_dias
FROM orders;

-- @id: rutas
-- @titulo: Cumplimiento por ruta
-- @pregunta: ¿Qué rutas cumplen menos? Une los pedidos con la tabla de rutas (JOIN) para ver el plazo prometido junto al resultado, y agrupa con GROUP BY.
SELECT
  o.route                                                      AS ruta,
  r.promised_days                                              AS plazo_dias,
  COUNT(*)                                                     AS entregas,
  ROUND(100.0 * SUM(o.delivery_date <= o.promised_date) / COUNT(*), 1) AS pct_a_tiempo
FROM orders o
JOIN routes r ON r.route = o.route
WHERE o.status = 'Entregado'
GROUP BY o.route, r.promised_days
ORDER BY pct_a_tiempo;

-- @id: meses
-- @titulo: Los meses con peor cumplimiento
-- @pregunta: ¿Hay estacionalidad? Se extrae el mes de la fecha con substr y se ordena de peor a mejor.
SELECT
  substr(order_date, 1, 7)                                     AS mes,
  COUNT(*)                                                     AS entregas,
  ROUND(100.0 * SUM(delivery_date <= promised_date) / COUNT(*), 1) AS pct_a_tiempo
FROM orders
WHERE status = 'Entregado'
GROUP BY mes
ORDER BY pct_a_tiempo
LIMIT 4;

-- @id: combinaciones
-- @titulo: Dónde se concentran las entregas tardías de más
-- @pregunta: ¿Qué combinaciones de almacén y ruta tienen más retrasos de los que cabría esperar? Compara cada combinación con la tasa global de retrasos (CTE) y las ordena con una función de ventana (RANK).
WITH global AS (
  SELECT 1.0 * SUM(delivery_date > promised_date) / COUNT(*) AS tasa_global
  FROM orders
  WHERE status = 'Entregado'
),
combos AS (
  SELECT warehouse, route,
         COUNT(*)                          AS entregas,
         SUM(delivery_date > promised_date) AS tardias
  FROM orders
  WHERE status = 'Entregado'
  GROUP BY warehouse, route
)
SELECT
  RANK() OVER (ORDER BY tardias - entregas * tasa_global DESC) AS puesto,
  warehouse                                                    AS almacen,
  route                                                        AS ruta,
  entregas,
  tardias,
  ROUND(100.0 * tardias / entregas, 1)                         AS pct_tardias,
  ROUND(tardias - entregas * tasa_global, 1)                   AS tardias_de_mas
FROM combos, global
ORDER BY puesto
LIMIT 5;

-- @id: coste_global
-- @titulo: Coste de un pedido tardío, a primera vista
-- @pregunta: ¿Cuánto más cuesta un pedido que llega tarde? Esta primera comparación mezcla todas las rutas.
SELECT
  ROUND(AVG(CASE WHEN delivery_date >  promised_date THEN order_cost END), 2) AS coste_tardio,
  ROUND(AVG(CASE WHEN delivery_date <= promised_date THEN order_cost END), 2) AS coste_a_tiempo,
  ROUND(AVG(CASE WHEN delivery_date >  promised_date THEN order_cost END)
      - AVG(CASE WHEN delivery_date <= promised_date THEN order_cost END), 2) AS diferencia
FROM orders
WHERE status = 'Entregado';

-- @id: coste_ruta
-- @titulo: Coste de un pedido tardío, dentro de cada ruta
-- @pregunta: ¿La diferencia anterior es real o viene de la mezcla de rutas? Si la ruta Sur es cara y además tarda más, parecerá que "retrasarse cuesta mucho" aunque no sea así. Se compara dentro de cada ruta.
SELECT
  o.route                                                      AS ruta,
  r.reference_cost                                             AS tarifa_ref,
  SUM(o.delivery_date > o.promised_date)                       AS tardias,
  ROUND(AVG(CASE WHEN o.delivery_date >  o.promised_date THEN o.order_cost END), 2) AS coste_tardio,
  ROUND(AVG(CASE WHEN o.delivery_date <= o.promised_date THEN o.order_cost END), 2) AS coste_a_tiempo,
  ROUND(AVG(CASE WHEN o.delivery_date >  o.promised_date THEN o.order_cost END)
      - AVG(CASE WHEN o.delivery_date <= o.promised_date THEN o.order_cost END), 2) AS diferencia
FROM orders o
JOIN routes r ON r.route = o.route
WHERE o.status = 'Entregado'
GROUP BY o.route, r.reference_cost
ORDER BY diferencia DESC;
