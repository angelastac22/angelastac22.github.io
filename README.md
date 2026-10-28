# Portfolio · Ángela Santa Cruz López

Web estática (HTML, CSS y JavaScript sin librerías) con tres proyectos de datos y operaciones.
Todos los datos son sintéticos.

## Proyectos y tecnología real de cada uno
| Proyecto | Python | SQL | JavaScript | Power BI |
|---|---|---|---|---|
| Operations Intelligence | genera los datos, ejecuta el análisis y valida | consultas sobre SQLite | panel interactivo y análisis de causas | no (pendiente) |
| Simulador de picking | no | no | todo el modelo (inspirado en mi TFM en C) | no |
| Informes automáticos | solo genera los CSV de ejemplo | no | la herramienta y la batería de pruebas | no |

## Archivos
- `index.html`, `operations.html`, `picking.html`, `informes.html`, `style.css`: las páginas.
- `orders.csv`, `routes.csv`, `orders.js`: datos de Operations Intelligence (`python generate_data.py`, semilla fija).
- `queries.sql`: las consultas SQL.
- `analysis.py`: carga los CSV en SQLite, ejecuta `queries.sql`, recalcula con Python puro y comprueba que coinciden; escribe `analysis_results.js`.
- `analisis.js`, `dashboard.js`, `home.js`: lógica de la página (causas, validación, panel).
- `picking.js`: simulador. `informes.js`, `pruebas.js`, `ejemplos.js`: herramienta de informes y sus pruebas.
- `load_sqlite.py`, `generate_ejemplos.py`: utilidades.

## Reproducir el análisis
```
python generate_data.py
python analysis.py
```
Solo necesita Python 3.

## Publicar
Sube todos los archivos juntos, sin carpetas, al repositorio `angelastac22.github.io` de GitHub (más `cv.pdf` y `foto.jpg`).
