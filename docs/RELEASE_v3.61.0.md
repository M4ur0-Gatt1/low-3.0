# LOW 3.61.0 · Rellenos con degradé y textura, y tinte

Paso 3 del plan para tener en LOW lo que Blender trae para animación 2D: el **Fill Gradient** de Grease Pencil 3, las **texturas de relleno** y el pincel de **Tinte** (Vertex Paint).

## Rellenos con degradé o textura

Clic derecho en un color de la paleta → **«Relleno: degradé…»** o **«Relleno: textura…»**. Todo lo que use ese estilo como relleno pasa a rellenarse así, en **todos los dibujos**, como cualquier cambio de paleta.

- **Degradé:** lineal con ángulo o radial, del color del estilo a un segundo color.
- **Textura:** rayas, puntos, cuadrícula o trama, del color del estilo sobre un segundo color, con su tamaño.
- **«Relleno liso»** lo vuelve atrás. Cada cambio es un paso de Ctrl+Z.
- **La línea sigue siendo el color liso.**
- **Se guarda en el estilo** (`style.meta.relleno`), no en los dibujos. Se valida al usarlo: sólo colores `#rrggbb` y números acotados, así que un archivo no puede meter nada en el CSS ni en el SVG (la prueba lo intenta).
- **Las definiciones SVG** van en la mesa, en un grupo auxiliar que no se guarda, y adentro de cada cuadro exportado.

## Tinte

- **Edición → «Teñir lo elegido…»:** lleva lo elegido hacia un color, en la cantidad que digas, **sin cambiar la paleta**. Sirve para una sombra en este cuadro, un rubor o un reflejo.
- **Edición → «Pincel de tinte»:** cada clic tiñe lo que toca. Esc lo apaga.
- **Edición → «Quitar el tinte»:** lo devuelve a su color (de lo elegido, o de todo el dibujo).
- **Cómo queda guardado:** el tinte vive en el elemento, como estilo propio que le gana a la paleta, y se marca con `data-tinte`. Ctrl+Z lo deshace.

## Pruebas

- **`tools/run_rellenos_tests.js`** (nueva, en el build): 21 casos.
  - Sin rellenos, el CSS es el de siempre.
  - Degradé lineal con ángulo y degradé radial.
  - Los cuatro patrones.
  - La línea sigue lisa.
  - Un color con código, un patrón desconocido y una escala absurda.
  - Guardar y reabrir, y Ctrl+Z.
- **`tools/check_rellenos_ui.js`** (nueva, en el build):
  - Clic derecho en la paleta → degradé: se ve en la mesa (`fill: url(#…)`) y sale en el export, y no se guarda adentro del dibujo.
  - Teñir con el mouse desde Edición deja lo elegido en rojo, sin tocar la paleta, y Ctrl+Z lo deshace.
  - El pincel de tinte tiñe y Esc lo apaga.
  - «Quitar el tinte» devuelve el color.
  - Se rompió a propósito el degradé en el export, y se detecta.
- **Las pruebas de color, paleta y pinceles que ya existían pasan.**
