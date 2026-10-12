# LOW 3.28.0 — La Flecha con Tipo y Alcance (toda la capa); cuentagotas con su ícono clásico

Pedidos de Mauro:
- «me falta una herramienta de selección que sirva para seleccionar toda la capa en una línea de tiempo; Toon Boom y OpenToonz tienen un desplegable en la herramienta de selección con distintas opciones; copiemos eso».
- «el ícono del cuentagotas es demasiado parecido a un lápiz, confunde mucho; quiero el clásico».

## La Flecha: Tipo, Alcance, Elegir todo, Mismo color

En la barra de la Flecha (y de la flecha blanca), como en OpenToonz:

- **Tipo**, para cuando arrastrás en un lugar vacío:
  - **Rectángulo**: el marco de siempre.
  - **Lazo**: a mano alzada.
  - **Polígono**: un clic por punto; se cierra con un clic en el primero, doble clic o Enter, y Esc lo cancela.

  Shift suma y Alt elige sólo lo que queda entero adentro, igual que el marco.
- **Alcance:**
  - **Este dibujo**: lo de siempre.
  - **Cuadros elegidos**: los cuadros de esta capa marcados en la línea de tiempo.
  - **Toda la capa**: todos sus dibujos. Es el «Whole Level» de OpenToonz y el «Apply to All Drawings» de Harmony.

  Lo que elegís en la mesa se busca igual en cada dibujo, con el mismo marco, lazo, polígono, punto o color, en el mismo lugar de la hoja. **Mover, escalar o rotar se aplica igual en todos**, en **un solo paso de Ctrl+Z**.
- **Elegir todo** y **Mismo color**, el «Same Style» de OpenToonz: todo lo que usa el mismo color de la paleta que lo elegido.

**Para mover una capa entera en toda la escena:** Alcance → Toda la capa, después **Elegir todo**, y arrastrar.

Las flechas del teclado y el inspector siguen siendo de este dibujo. Con el rig prendido el alcance es sólo este dibujo, porque las piezas del rig se posan, no se mueven.

## Cuentagotas

El ícono era casi un lápiz. Ahora es una pipeta clásica, con perilla, anillo, tubo de vidrio y la gota en la punta.

## Pruebas

- **`check_seleccion_alcance_ui.js`** (nueva), con mouse de verdad sobre una capa de tres dibujos. Comprueba:
  - la barra con Tipo y Alcance;
  - Toda la capa + Elegir todo + arrastrar: los tres dibujos se mueven 100 y 50, y un Ctrl+Z los devuelve;
  - un marco sobre el rectángulo: en los otros cuadros se mueve el rectángulo y no el círculo;
  - el tirador de escala: los otros rectángulos se escalan en la misma proporción;
  - Cuadros elegidos 1 y 2: el 3 no se toca;
  - un lazo alrededor del círculo elige sólo el círculo;
  - un polígono de cuatro clics elige el rectángulo;
  - Mismo color elige los dos rectángulos azules.
- En el camino apareció un defecto: agarrar algo ya elegido para arrastrar la selección reemplazaba «todo» por «el punto del clic», y sólo se movía en los otros cuadros lo que estaba en ese punto.
- La primera tanda completa dio 3 fallas por una sola causa: con las opciones nuevas, la barra de la Flecha (la herramienta por defecto) hacía crecer la cabecera a tres renglones. Eso corría el lienzo y le sacaba lugar al riel de herramientas en Animación. La ayuda larga de la Flecha pasó al tooltip y la barra entra en un renglón. La segunda tanda: 179 de 179.
