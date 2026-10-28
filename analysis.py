"""
Análisis reproducible de Operations Intelligence.

Ejecuta:  python analysis.py
No necesita instalar nada (solo usa la biblioteca estándar de Python).

Qué hace:
  1. Carga orders.csv y routes.csv en una base SQLite en memoria.
  2. Ejecuta las consultas de queries.sql y guarda sus resultados.
  3. Calcula los mismos indicadores por un segundo camino, solo con Python
     (sin SQL), y comprueba que ambos resultados coinciden.
  4. Escribe analysis_results.js, que la página usa para mostrar las consultas
     y su resultado, y para la sección de validación.

Si los dos cálculos no coinciden, el script se detiene con un error.
"""
import csv
import json
import re
import sqlite3
from collections import defaultdict
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TOL = 0.051  # tolerancia por redondeo (SQLite y Python redondean distinto en los .x5)


# ---------- 1. Cargar los datos ----------
def read_csv(name):
    with open(ROOT / name, encoding="utf-8") as f:
        return list(csv.DictReader(f))


orders = read_csv("orders.csv")
routes = read_csv("routes.csv")

con = sqlite3.connect(":memory:")
con.execute("""CREATE TABLE orders (order_id TEXT PRIMARY KEY, order_date TEXT, promised_date TEXT,
               delivery_date TEXT, route TEXT, warehouse TEXT, order_cost REAL, status TEXT)""")
con.execute("CREATE TABLE routes (route TEXT PRIMARY KEY, promised_days INTEGER, reference_cost REAL)")
con.executemany("INSERT INTO orders VALUES (?,?,?,?,?,?,?,?)", [
    (r["order_id"], r["order_date"], r["promised_date"], r["delivery_date"] or None,
     r["route"], r["warehouse"], float(r["order_cost"]), r["status"]) for r in orders])
con.executemany("INSERT INTO routes VALUES (?,?,?)",
                [(r["route"], int(r["promised_days"]), float(r["reference_cost"])) for r in routes])


# ---------- 2. Ejecutar queries.sql ----------
def parse_queries(text):
    out = []
    for block in re.split(r"(?m)^-- @id:", text)[1:]:
        head, _, body = block.partition("\n")
        qid = head.strip()
        meta = {"id": qid}
        sql_lines = []
        for line in body.splitlines():
            m = re.match(r"-- @(titulo|pregunta):\s*(.*)", line)
            if m:
                meta[m.group(1)] = m.group(2).strip()
            elif not line.strip().startswith("--"):
                sql_lines.append(line)
        meta["sql"] = "\n".join(sql_lines).strip().rstrip(";") + ";"
        out.append(meta)
    return out


queries = parse_queries((ROOT / "queries.sql").read_text(encoding="utf-8"))
results = {}
for q in queries:
    cur = con.execute(q["sql"])
    q["columns"] = [c[0] for c in cur.description]
    q["rows"] = [list(r) for r in cur.fetchall()]
    results[q["id"]] = q


# ---------- 3. Segundo camino: solo Python ----------
def d(s):
    return date.fromisoformat(s)


delivered = [o for o in orders if o["status"] == "Entregado"]
late = lambda o: d(o["delivery_date"]) > d(o["promised_date"])
ontime = lambda o: not late(o)
pct = lambda a: 100.0 * sum(1 for o in a if ontime(o)) / len(a)
mean = lambda a: sum(a) / len(a)

py = {}
py["pedidos"] = len(orders)
py["entregados"] = len(delivered)
py["pct_a_tiempo"] = pct(delivered)
py["coste_medio"] = mean([float(o["order_cost"]) for o in orders if o["status"] != "Cancelado"])
py["retraso_medio_dias"] = mean([(d(o["delivery_date"]) - d(o["promised_date"])).days for o in delivered if late(o)])

by_route = defaultdict(list)
for o in delivered:
    by_route[o["route"]].append(o)
for r, a in by_route.items():
    py["pct_ruta_" + r] = pct(a)

by_month = defaultdict(list)
for o in delivered:
    by_month[o["order_date"][:7]].append(o)
worst_month = min(by_month, key=lambda m: pct(by_month[m]))
py["peor_mes_pct"] = pct(by_month[worst_month])

tasa_global = sum(1 for o in delivered if late(o)) / len(delivered)
combos = defaultdict(list)
for o in delivered:
    combos[(o["warehouse"], o["route"])].append(o)
excess = {k: sum(1 for o in a if late(o)) - len(a) * tasa_global for k, a in combos.items()}
top = max(excess, key=excess.get)
py["combo_top_tardias_de_mas"] = excess[top]

py["coste_tardio"] = mean([float(o["order_cost"]) for o in delivered if late(o)])
py["coste_a_tiempo"] = mean([float(o["order_cost"]) for o in delivered if ontime(o)])
py["diferencia_global"] = py["coste_tardio"] - py["coste_a_tiempo"]
for r, a in by_route.items():
    py["diferencia_" + r] = (mean([float(o["order_cost"]) for o in a if late(o)])
                             - mean([float(o["order_cost"]) for o in a if ontime(o)]))

# ---------- 4. Comparar SQL y Python ----------
k = dict(zip(results["kpis"]["columns"], results["kpis"]["rows"][0]))
route_sql = {r[0]: r for r in results["rutas"]["rows"]}
cost_route_sql = {r[0]: r for r in results["coste_ruta"]["rows"]}
glob = dict(zip(results["coste_global"]["columns"], results["coste_global"]["rows"][0]))
top_sql = results["combinaciones"]["rows"][0]

checks = [
    ("Pedidos", k["pedidos"], py["pedidos"]),
    ("Pedidos entregados", k["entregados"], py["entregados"]),
    ("Entregas a tiempo (%)", k["pct_a_tiempo"], py["pct_a_tiempo"]),
    ("Coste medio por pedido (€)", k["coste_medio"], py["coste_medio"]),
    ("Retraso medio de las tardías (días)", k["retraso_medio_dias"], py["retraso_medio_dias"]),
]
for r in sorted(by_route):
    checks.append((f"Entregas a tiempo, ruta {r} (%)", route_sql[r][3], py["pct_ruta_" + r]))
checks.append((f"Peor mes: entregas a tiempo (%)", results["meses"]["rows"][0][2], py["peor_mes_pct"]))
checks.append(("Entregas tardías de más en la peor combinación", top_sql[6], py["combo_top_tardias_de_mas"]))
checks.append(("Diferencia de coste tardío vs a tiempo, global (€)", glob["diferencia"], py["diferencia_global"]))
for r in sorted(by_route):
    checks.append((f"Diferencia de coste tardío vs a tiempo, ruta {r} (€)", cost_route_sql[r][5], py["diferencia_" + r]))

report = []
for name, sql_v, py_v in checks:
    ok = abs(float(sql_v) - float(py_v)) <= TOL
    report.append({"nombre": name, "sql": sql_v, "python": round(py_v, 4), "ok": ok})
    if not ok:
        raise SystemExit(f"NO COINCIDEN: {name}: SQL={sql_v} Python={py_v}")

# ---------- 5. Guardar para la web ----------
payload = {"sqlite": sqlite3.sqlite_version, "queries": queries, "checks": report}
(ROOT / "analysis_results.js").write_text(
    "// Generado por analysis.py: resultados reales de ejecutar queries.sql en SQLite\n"
    "window.ANALYSIS = " + json.dumps(payload, ensure_ascii=False, indent=1) + ";\n",
    encoding="utf-8",
)

# ---------- Resumen por pantalla ----------
print(f"SQLite {sqlite3.sqlite_version} · {len(orders)} pedidos · {len(queries)} consultas ejecutadas")
for c in report:
    print(f"  OK  {c['nombre']}: SQL={c['sql']}  Python={c['python']}")
print(f"\n{len(report)} comprobaciones: SQL y Python coinciden en todas.")
print("Escrito analysis_results.js")
