# Portfolio · Ángela Santa Cruz

Web personal con un primer proyecto interactivo: **Operations Intelligence**, un dashboard de operaciones logísticas con datos sintéticos.

Es gratis y no necesitas instalar nada para verla: son archivos HTML, CSS y JavaScript.

## Qué hay en cada carpeta

```
index.html              La página principal
operations.html         El dashboard Operations Intelligence
cv.pdf                  (lo pones tú) tu CV
assets/css/style.css    Colores, tipografía y estilos
assets/js/              El código que hace funcionar los filtros y gráficos
assets/img/foto.jpg     (opcional, la pones tú) tu foto
assets/img/dashboard.png  Captura que sale en la home
data/orders.csv         3.000 pedidos inventados (se abre en Excel)
python/                 Scripts para generar los datos y practicar SQL
sql/queries.sql         Consultas SQL de análisis
```

## Verla en tu ordenador

Haz doble clic en `index.html`.

## Publicarla gratis (GitHub Pages)

Sigue la guía paso a paso del chat. Resumen: crea una cuenta en github.com (hace falta solo para alojar la web gratis), crea un repositorio público llamado `TU-USUARIO.github.io`, sube el contenido de esta carpeta y tu web quedará en `https://TU-USUARIO.github.io`.

## Antes de publicar

- Copia tu CV en esta carpeta con el nombre `cv.pdf`.
- (Opcional) Copia tu foto en `assets/img/` con el nombre `foto.jpg`.
- En `index.html`, sustituye el `#` de LinkedIn por tu enlace (busca `TODO`).

## Regenerar los datos o practicar SQL (opcional, requiere Python)

```
python python/generate_data.py   # regenera data/orders.csv y data/orders.js
python python/load_sqlite.py     # crea data/orders.db y ejecuta sql/queries.sql
```

## Definiciones de los indicadores

- **Entrega a tiempo:** pedido «Entregado» con fecha de entrega igual o anterior a la prometida. Porcentaje sobre pedidos entregados.
- **Retraso medio:** media de días solo de las entregas tardías.
- **Coste medio:** media del coste de los pedidos no cancelados.

## Aviso

Los datos son sintéticos y los patrones (ruta Sur, almacén Centro B, campaña de noviembre-diciembre) están introducidos a propósito. Es un proyecto personal, no experiencia laboral.
