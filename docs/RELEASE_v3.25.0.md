# LOW 3.25.0 — Perspectiva: puntos de fuga para dibujar fondos

Pedido de Mauro: «un sistema de guías de puntos de fuga pensado para dibujar layouts de fondos —ciudad, casas— para el módulo 2D», vinculado con el estudio 3D. Esta es la primera parte, la del 2D. La segunda, el estudio 3D que manda su perspectiva al 2D, viene en la 3.26.

## Cómo se usa

**Vista → Perspectiva (puntos de fuga)** abre una barra arriba de la mesa:

- **1 punto · 2 puntos · 3 puntos**:
  - 1 punto, para calles y pasillos de frente;
  - 2 puntos, para esquinas de casas y edificios, con los puntos fuera del cuadro para no deformar los bordes;
  - 3 puntos, para edificios vistos desde arriba.
- En la mesa se ven el **horizonte** (amarillo) y un **abanico de rectas** por punto, cada uno de su color.
- Con la barra abierta **se arrastran los puntos y el horizonte**. Los dos primeros comparten la altura de los ojos: subir uno sube el otro. Cada arrastre es un paso de Ctrl+Z.
- **Imán**: el lápiz y el pincel siguen la recta hacia el punto de fuga que coincide con hacia dónde arrancás el trazo. Con 1 o 2 puntos también las verticales, y con 1 punto las horizontales.
  - Si arrancás lejos de toda dirección, el trazo queda libre: un árbol o una nube no se imantan.
  - **Shift** sigue siendo la recta a 15°.
- **Ver guías** las oculta sin perder los puntos. **Quitar** los saca. **Listo** cierra la barra, y las guías y el imán siguen.
- La perspectiva **se guarda con la escena** en el `.low`.

## La Regla (U), arreglada y unida a esto

- **Arreglado:** con un punto de fuga, la línea de la Regla terminaba **en** el punto de fuga en vez de ir **hacia** él. Ahora sigue la recta hasta donde soltás.
- **Arreglado:** los circulitos de los puntos de fuga de la Regla podían quedar **guardados dentro del dibujo**.
- El clic derecho de la Regla agrega el punto a la perspectiva de la escena, así que se guarda; clic derecho sobre un punto lo saca.

## Pruebas

- **`check_perspectiva_ui.js`** (nueva), con mouse de verdad. Comprueba:
  - la barra y los 2 puntos a la misma altura y fuera del cuadro;
  - que las guías no entren en el dibujo guardado;
  - el arrastre de un punto, que arrastra al otro, y su Ctrl+Z en un paso;
  - un trazo tembloroso hacia el punto 2, que queda recto sobre la recta (desvío 0,035);
  - un trazo casi vertical, que queda vertical;
  - un trazo a 45°, que queda libre;
  - que sin imán quede el temblor;
  - que la Regla vaya hacia el punto y no hasta él;
  - el clic derecho, que agrega y saca puntos;
  - que la perspectiva viaje con el documento;
  - que las guías de la Regla tampoco se guarden.
- En el camino apareció un defecto del imán: la dirección se decidía con los primeros 7 px, y con el pulso temblando al arrancar elegía mal. Ahora queda provisoria hasta los 24 px y lo ya dibujado se vuelve a proyectar.
- `check_hilo_tensado_ui.js` se actualizó: con un `.low`, el punto de fuga del clic derecho ahora va a la escena.
