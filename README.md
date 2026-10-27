# Portfolio · Ángela Santa Cruz

Web personal con tres proyectos interactivos que funcionan en el navegador, sin servidor y con datos sintéticos.

## Proyectos

- **Operations Intelligence** (`operations.html`): dashboard de operaciones logísticas con filtros, indicadores, gráficos y exportación a CSV.
- **Simulador de picking** (`picking.html`): compara tres estrategias de preparación de pedidos en almacén (por pedido, por lotes y por zonas) y tres formas de elegir la ruta. Desarrolla las ideas de mejora del trabajo fin de máster.
- **Informes automáticos** (`informes.html`): lee archivos CSV, detecta incidencias, limpia los datos y genera un informe.

Todos los datos son inventados. Son proyectos personales, no experiencia laboral.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html`, `operations.html`, `picking.html`, `informes.html` | Las páginas de la web |
| `style.css` | Estilos |
| `home.js`, `dashboard.js`, `picking.js`, `informes.js` | Código de cada página |
| `orders.csv`, `orders.js` | 3.000 pedidos sintéticos (el CSV se abre en Excel) |
| `generate_data.py` | Genera los pedidos sintéticos con semilla fija |
| `load_sqlite.py`, `queries.sql` | Carga los pedidos en SQLite y ejecuta consultas de análisis |
| `generate_ejemplos.py`, `ejemplos.js`, `ejemplo_pedidos_*.csv` | Archivos de ejemplo, con errores a propósito, para probar los informes |
| `*.png` | Capturas que se ven en la página principal |

## Ver la web en local

Haz doble clic en `index.html`. Hay que tener todos los archivos juntos en la misma carpeta.

## Ejecutar los scripts de Python (opcional)

```
python generate_data.py       # regenera orders.csv y orders.js
python load_sqlite.py         # crea orders.db y ejecuta queries.sql
python generate_ejemplos.py   # regenera los archivos de ejemplo de los informes
```

## Definiciones del dashboard

- **Entrega a tiempo:** pedido «Entregado» con fecha de entrega igual o anterior a la prometida. Porcentaje sobre pedidos entregados.
- **Retraso medio:** media de días solo de las entregas tardías.
- **Coste medio:** media del coste de los pedidos no cancelados.
