-- Operations Intelligence · consultas SQL (SQLite)
-- Tabla: orders(order_id, order_date, promised_date, delivery_date,
--               route, warehouse, order_cost, status)
-- Carga los datos con python/load_sqlite.py y practica aquí.

-- 1. KPI generales ---------------------------------------------------------
-- Pedidos, % a tiempo (sobre entregados), coste medio y retraso medio de tardías.
SELECT
  COUNT(*)                                                        AS pedidos,
  ROUND(100.0 * SUM(CASE WHEN status = 'Entregado'
                          AND delivery_date <= promised_date THEN 1 ELSE 0 END)
        / SUM(CASE WHEN status = 'Entregado' THEN 1 ELSE 0 END), 1) AS pct_a_tiempo,
  ROUND(AVG(CASE WHEN status <> 'Cancelado' THEN order_cost END), 2) AS coste_medio,
  ROUND(AVG(CASE WHEN status = 'Entregado' AND delivery_date > promised_date
                 THEN julianday(delivery_date) - julianday(promised_date) END), 1) AS retraso_medio_dias
FROM orders;

-- 2. Cumplimiento por ruta -------------------------------------------------
SELECT route,
       COUNT(*) AS entregas,
       ROUND(100.0 * SUM(delivery_date <= promised_date) / COUNT(*), 1) AS pct_a_tiempo
FROM orders
WHERE status = 'Entregado'
GROUP BY route
ORDER BY pct_a_tiempo;

-- 3. Evolución mensual -----------------------------------------------------
SELECT substr(order_date, 1, 7) AS mes,
       COUNT(*) AS entregas,
       ROUND(100.0 * SUM(delivery_date <= promised_date) / COUNT(*), 1) AS pct_a_tiempo
FROM orders
WHERE status = 'Entregado'
GROUP BY mes
ORDER BY mes;

-- 4. Combinaciones almacén-ruta más críticas (mínimo 15 entregas) ------------
SELECT warehouse, route,
       COUNT(*) AS entregas,
       ROUND(100.0 * SUM(delivery_date <= promised_date) / COUNT(*), 1) AS pct_a_tiempo
FROM orders
WHERE status = 'Entregado'
GROUP BY warehouse, route
HAVING COUNT(*) >= 15
ORDER BY pct_a_tiempo
LIMIT 5;

-- 5. ¿Cuánto cuesta un retraso? Coste medio según días de retraso -----------
SELECT MAX(0, CAST(julianday(delivery_date) - julianday(promised_date) AS INTEGER)) AS dias_retraso,
       COUNT(*) AS pedidos,
       ROUND(AVG(order_cost), 2) AS coste_medio
FROM orders
WHERE status = 'Entregado'
GROUP BY dias_retraso
ORDER BY dias_retraso;
