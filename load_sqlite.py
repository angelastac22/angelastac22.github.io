"""
Carga data/orders.csv en una base SQLite y ejecuta sql/queries.sql.

Ejecuta:  python load_sqlite.py
No necesita instalar nada: sqlite3 viene incluido con Python.
"""
import csv
import sqlite3
from pathlib import Path

root = Path(__file__).resolve().parent.parent
db_path = root / "data" / "orders.db"

con = sqlite3.connect(db_path)
con.execute("DROP TABLE IF EXISTS orders")
con.execute("""
    CREATE TABLE orders (
        order_id TEXT PRIMARY KEY,
        order_date TEXT, promised_date TEXT, delivery_date TEXT,
        route TEXT, warehouse TEXT, order_cost REAL, status TEXT
    )
""")

with open(root / "data" / "orders.csv", encoding="utf-8") as f:
    rows = [
        (r["order_id"], r["order_date"], r["promised_date"], r["delivery_date"] or None,
         r["route"], r["warehouse"], float(r["order_cost"]), r["status"])
        for r in csv.DictReader(f)
    ]
con.executemany("INSERT INTO orders VALUES (?,?,?,?,?,?,?,?)", rows)
con.commit()
print(f"{len(rows)} pedidos cargados en {db_path}\n")

# Ejecuta cada consulta del archivo y muestra el resultado
sql = (root / "sql" / "queries.sql").read_text(encoding="utf-8")
for block in sql.split(";"):
    lines = [l for l in block.strip().splitlines()]
    query = "\n".join(l for l in lines if not l.strip().startswith("--")).strip()
    if not query:
        continue
    title = next((l for l in lines if l.startswith("-- ") and l[3:4].isdigit()), "")
    cur = con.execute(query)
    print(title or "Consulta")
    print("  " + " | ".join(c[0] for c in cur.description))
    for row in cur.fetchall():
        print("  " + " | ".join(str(v) for v in row))
    print()
con.close()
