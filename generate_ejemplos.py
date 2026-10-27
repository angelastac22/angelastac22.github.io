"""
Genera dos archivos CSV de ejemplo con errores puestos a propósito, para probar
la herramienta de informes automáticos.

Ejecuta:  python generate_ejemplos.py
Crea:     ejemplo_pedidos_norte.csv  (separador coma, decimales con punto, fechas AAAA-MM-DD)
          ejemplo_pedidos_sur.csv    (separador punto y coma, decimales con coma, fechas DD/MM/AAAA)
          ejemplos.js                (los mismos datos, para que la web los cargue sin servidor)

Los errores introducidos (todos ficticios) son: filas duplicadas, importes vacíos,
importes negativos, un importe atípico, fechas que no existen, ciudades escritas de
varias formas y pedidos repetidos entre los dos archivos.
"""
import csv
import io
import json
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(11)
OUT = Path(__file__).resolve().parent

CLIENTES = ["Aurora Textil", "Brisa Hogar", "Cantábrica Foods", "Delta Ferretería", "Eco Papel", "Fénix Motor",
            "Gaia Bio", "Horizonte Tech", "Ibérica Pack", "Jade Moda", "Kora Sport", "Luna Café"]
NORTE = ["Santander", "Bilbao", "Oviedo", "Vitoria", "Pamplona"]
SUR = ["Sevilla", "Málaga", "Córdoba", "Granada", "Cádiz"]
ESTADOS = ["Entregado", "Entregado", "Entregado", "Pendiente", "Cancelado"]
ALMACENES = {"Norte": ["Norte 1", "Norte 2"], "Sur": ["Sur 1", "Sur 2"]}
HEAD = ["pedido", "fecha", "cliente", "ciudad", "importe", "estado", "almacen"]


def rows_for(zone, ciudades, first_id, n):
    rows = []
    for i in range(n):
        d = date(2026, 1, 1) + timedelta(days=random.randint(0, 270))
        rows.append({
            "pedido": first_id + i,
            "fecha": d,
            "cliente": random.choice(CLIENTES),
            "ciudad": random.choice(ciudades),
            "importe": round(random.uniform(80, 1800), 2),
            "estado": random.choice(ESTADOS),
            "almacen": random.choice(ALMACENES[zone]),
        })
    return rows


norte = rows_for("Norte", NORTE, 1001, 120)
sur = rows_for("Sur", SUR, 2001, 110)


def fmt_norte(r):
    return [r["pedido"], r["fecha"].isoformat(), r["cliente"], r["ciudad"],
            "" if r["importe"] is None else f'{r["importe"]:.2f}', r["estado"], r["almacen"]]


def fmt_sur(r):
    imp = "" if r["importe"] is None else f'{r["importe"]:.2f}'.replace(".", ",")
    if isinstance(r["importe"], float) and r["importe"] >= 1000:
        imp = f'{r["importe"]:,.2f}'.replace(",", "X").replace(".", ",").replace("X", ".")  # 1.234,50
    return [r["pedido"], r["fecha"].strftime("%d/%m/%Y"), r["cliente"], r["ciudad"], imp, r["estado"], r["almacen"]]


# ---- errores deliberados ----
def pick(rows, k):
    return random.sample(range(len(rows)), k)

for i in pick(norte, 4): norte[i]["importe"] = None                      # importes vacíos
for i in pick(norte, 2): norte[i]["importe"] = -round(random.uniform(40, 200), 2)  # negativos
norte[pick(norte, 1)[0]]["importe"] = 99999.00                           # atípico
for i in pick(norte, 3): norte[i]["ciudad"] = norte[i]["ciudad"].upper()  # SANTANDER
for i in pick(norte, 2): norte[i]["ciudad"] = " " + norte[i]["ciudad"].lower()  # " bilbao"
for i in pick(norte, 2): norte[i]["ciudad"] = ""                         # ciudad vacía

for i in pick(sur, 3): sur[i]["importe"] = None
sur[pick(sur, 1)[0]]["importe"] = -85.5
for i in pick(sur, 3): sur[i]["ciudad"] = sur[i]["ciudad"].upper()
for i in pick(sur, 2): sur[i]["ciudad"] = sur[i]["ciudad"].lower() + " "
for i in pick(sur, 2): sur[i]["cliente"] = sur[i]["cliente"].upper()

out_norte = [fmt_norte(r) for r in norte]
out_sur = [fmt_sur(r) for r in sur]

# fechas imposibles
out_norte[pick(out_norte, 1)[0]][1] = "2026-13-05"
out_sur[pick(out_sur, 1)[0]][1] = "31/02/2026"
out_sur[pick(out_sur, 1)[0]][1] = "sin fecha"

# duplicados exactos dentro de cada archivo
for i in pick(out_norte, 5): out_norte.append(list(out_norte[i]))
for i in pick(out_sur, 4): out_sur.append(list(out_sur[i]))
# un pedido que aparece en los dos archivos
out_sur.append(list(out_norte[3]))
out_sur.append(list(out_norte[10]))

random.shuffle(out_norte)
random.shuffle(out_sur)


def to_csv(rows, delim):
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=delim, lineterminator="\n")
    w.writerow(HEAD)
    w.writerows(rows)
    return buf.getvalue()


files = {
    "ejemplo_pedidos_norte.csv": to_csv(out_norte, ","),
    "ejemplo_pedidos_sur.csv": to_csv(out_sur, ";"),
}
for name, text in files.items():
    (OUT / name).write_text("﻿" + text, encoding="utf-8")  # con BOM: Excel lo abre bien

(OUT / "ejemplos.js").write_text(
    "// Archivos de ejemplo generados con generate_ejemplos.py\n"
    "window.SAMPLES = " + json.dumps([{"name": k, "text": v} for k, v in files.items()], ensure_ascii=False) + ";\n",
    encoding="utf-8",
)
print({k: len(v.splitlines()) - 1 for k, v in files.items()}, "filas")
