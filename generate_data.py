"""
Genera pedidos SINTÉTICOS de una empresa de distribución ficticia.

Ejecuta:  python generate_data.py
Crea:     ../data/orders.csv   (para Excel, SQL, pandas)
          ../data/orders.js    (para el dashboard web)

Los datos llevan patrones de negocio incorporados a propósito, para que el
análisis tenga algo que descubrir:
  - La ruta Sur tiene más retrasos que el resto.
  - El almacén Centro B rinde peor que A y C.
  - Noviembre y diciembre (campaña) aumentan volumen y retrasos.
  - El retraso penaliza el coste del pedido.
Nada de esto viene de una empresa real.
"""
import csv
import json
import random
from datetime import date, timedelta
from pathlib import Path

random.seed(42)  # misma semilla = mismos datos siempre (reproducible)

N_ORDERS = 3000
START = date(2025, 1, 1)
END = date(2026, 6, 30)
DATASET_TODAY = END  # "hoy" dentro del dataset

# ruta: (plazo prometido en días, coste base en €, probabilidad base de retraso)
ROUTES = {
    "Norte": (3, 180, 0.12),
    "Sur": (4, 420, 0.30),
    "Este": (3, 310, 0.18),
    "Oeste": (3, 260, 0.15),
    "Centro": (2, 150, 0.10),
}
ROUTE_WEIGHTS = [0.22, 0.20, 0.18, 0.16, 0.24]

# almacén: (peso de pedidos, extra de probabilidad de retraso)
WAREHOUSES = {"Centro A": (0.45, 0.00), "Centro B": (0.35, 0.07), "Centro C": (0.20, -0.02)}

PEAK_MONTHS = {11, 12}


def random_order_date():
    """Fecha aleatoria; en campaña (nov-dic) se aceptan más pedidos."""
    span = (END - START).days
    while True:
        d = START + timedelta(days=random.randint(0, span))
        weight = 1.0 if d.month in PEAK_MONTHS else 0.62
        if random.random() < weight:
            return d


def build_order():
    order_date = random_order_date()
    route = random.choices(list(ROUTES), weights=ROUTE_WEIGHTS)[0]
    wh = random.choices(list(WAREHOUSES), weights=[w[0] for w in WAREHOUSES.values()])[0]
    lead, base_cost, p_late = ROUTES[route]

    promised = order_date + timedelta(days=lead)

    p = p_late + WAREHOUSES[wh][1] + (0.12 if order_date.month in PEAK_MONTHS else 0)
    p = min(max(p, 0.02), 0.85)

    if random.random() < p:
        delay = 1 + min(int(random.expovariate(0.6)), 6)  # retraso de 1 a 7 días
    else:
        delay = random.choice([0, 0, 0, -1])  # a tiempo, a veces un día antes
    delivered = promised + timedelta(days=delay)

    cost = base_cost * random.uniform(0.7, 1.4) + max(delay, 0) * 12
    cost = round(cost, 2)

    if random.random() < 0.03:
        status, delivered = "Cancelado", None
    elif delivered > DATASET_TODAY:
        status, delivered = "En tránsito", None
    else:
        status = "Entregado"

    return {
        "order_date": order_date,
        "promised_date": promised,
        "delivery_date": delivered,
        "route": route,
        "warehouse": wh,
        "order_cost": cost,
        "status": status,
    }


def main():
    orders = sorted((build_order() for _ in range(N_ORDERS)), key=lambda o: o["order_date"])
    for i, o in enumerate(orders, start=1):
        o["order_id"] = f"ORD-{i:04d}"

    out = Path(__file__).resolve().parent.parent / "data"
    out.mkdir(exist_ok=True)

    cols = ["order_id", "order_date", "promised_date", "delivery_date",
            "route", "warehouse", "order_cost", "status"]

    def fmt(o, c):
        v = o[c]
        return "" if v is None else (v.isoformat() if isinstance(v, date) else v)

    with open(out / "orders.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(cols)
        for o in orders:
            w.writerow([fmt(o, c) for c in cols])

    compact = [[fmt(o, c) for c in cols] for o in orders]
    for row in compact:
        row[6] = float(row[6])
    (out / "orders.js").write_text(
        "// Datos sintéticos generados con python/generate_data.py\n"
        "window.ORDERS = " + json.dumps(compact, ensure_ascii=False, separators=(",", ":")) + ";\n",
        encoding="utf-8",
    )
    print(f"{len(orders)} pedidos escritos en {out}")


if __name__ == "__main__":
    main()
