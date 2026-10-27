# LOW 3.55.0 · Cuerpos de estudio en el Taller

Pedido de Mauro: «mejorá los modelos y la malla». Fuimos por una base nueva: los **Human Base Meshes de Blender Studio** (CC0), riggeados con el esqueleto del Taller.

## Hombre (estudio) y Mujer (estudio)

Dos cuerpos nuevos en el Taller de personaje, junto a Hombre, Mujer y Maniquí:

- **Anatomía de estudio**: la malla realista de Blender Studio (100.000 triángulos), con proporción real. El hombre mide unas 8 cabezas y la mujer unas 7,5; los cuerpos de fábrica miden 10,8.
- **El mismo esqueleto del Taller**: los mismos 65 huesos, cada uno con la misma orientación. Por eso las poses de fábrica, las 43 animaciones, y las poses clásicas del Estudio de anatomía valen igual. Sólo cambian los lugares de las articulaciones, que se midieron sobre la malla en vistas con cuadrícula (la mano, con cuadrícula de 1 cm).
- **Dedos con piel**: cada falange apunta a la siguiente articulación, así que la mano se cierra bien.
- **La piel no se rompe al posar**:
  - Los pesos se limpian por zonas: al calcularlos con el brazo pegado al cuerpo, el pecho y la cintura heredaban un 4 a 7 % del brazo, y se cuarteaban al bajarlo.
  - Se suavizan después del corte a 4 huesos por punto.
  - La cara entera va con la cabeza: en la mujer, el mentón se quedaba con el cuello.
- **Todavía sin gestos de cara**: su boca está armada distinto que la de los otros cuerpos y queda para una próxima versión. Se esculpe, se dibuja encima y se posa como los demás.

El armado se rehace con Blender 4.5 y los scripts de `tools/cuerpos/` (`rig.py`, las medidas en `juntas_*.json`, y `probar.py` y `diag.py` para revisar las poses).

## Pruebas

- `tools/check_3d_cuerpo_estudio_ui.js` (nueva, en el build). Para los dos cuerpos:
  - entran al Taller con su malla y sus ojos;
  - miden su canon;
  - en «mano en la cadera» la mano queda en la cadera, y en «brazos arriba» las manos quedan sobre la cabeza;
  - con esas poses, con torsión y con la cabeza girada 45°, ninguna arista se estira más de 3,5 veces (la peor, 3,4 en la axila con los brazos arriba; el cuerpo de fábrica llega a 5);
  - la mano se cierra.
- Las pruebas del Taller, en verde.
