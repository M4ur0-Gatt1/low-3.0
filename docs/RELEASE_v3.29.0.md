# LOW 3.29.0 — Las herramientas de selección en un solo botón, como en Toon Boom

Pedidos de Mauro:
- «te había pedido que haya varias herramientas de selección en la herramienta de selección, tal cual en Toon Boom»;
- «quiero redimensionar o modificar todos los elementos de todos los frames de la capa, todo junto, y no puedo»;
- «en la perspectiva estaría bueno tener una función de repetición en la fuga, que repita el mismo edificio hacia atrás».

## El botón de la Flecha es un grupo de herramientas

En la barra lateral, el botón de selección tiene una flechita en la esquina, como los grupos de Toon Boom. La lista se abre con la flechita, manteniéndolo pulsado o con clic derecho. El ícono del botón muestra la herramienta que está en uso.

- **Herramientas:**
  - Selección con rectángulo (V);
  - Selección con lazo;
  - Selección con polígono;
  - Selección por mismo color: un clic en un trazo elige todos los de su color. Si no usa un color de la paleta, compara el color pintado, así que también sirve con trazos de pincel sueltos;
  - Selección directa, para elegir dentro de los grupos (D).
- **Mover, escalar y girar en…:**
  - sólo este dibujo;
  - los cuadros elegidos en la línea de tiempo;
  - toda la capa (todos los cuadros).

  Si el alcance no es «este dibujo», el botón lleva un punto naranja y el selector de la barra de arriba también se marca en naranja. Así nadie mueve toda la capa sin darse cuenta.
- **Acciones:**
  - Elegir todo el dibujo (Ctrl+A);
  - Elegir toda la capa y transformarla (Ctrl+Shift+A).

La lista y la barra de opciones de arriba son lo mismo y siempre muestran lo mismo.

## Redimensionar toda la capa, todos los cuadros juntos

Hay una orden directa en tres lugares:
- **Ctrl+Shift+A**;
- **Edición → Elegir toda la capa (todos los cuadros)**;
- **clic derecho sobre la capa en la línea de tiempo → Elegir toda la capa (todos los cuadros)**.

La orden:
1. pasa a la Flecha;
2. elige todo el dibujo con el alcance «toda la capa»;
3. avisa cuántos dibujos tiene la capa.

Después, arrastrar mueve y los tiradores escalan o giran los dibujos de todos los cuadros a la vez. Un Ctrl+Z lo deshace en todos.

Ese alcance dura lo que dura la selección: al soltarla, vuelve a «este dibujo». El alcance tampoco se guarda entre sesiones, así que abrir LOW nunca deja «toda la capa» puesto sin aviso. El tipo de selección sí se recuerda.

Edición también tiene **Elegir todo (Ctrl+A)**.

## Estudio 3D: repetir hacia la fuga

El panel Perspectiva tiene una sección nueva, **Repetir hacia la fuga**:
1. Elegí un edificio con Mover (V).
2. **Medir** elige el eje que va hacia el fondo y sugiere la separación: lo que mide lo elegido, más un 20 %.
3. **Repetir** hace las copias que pidas, cada tantos metros, hacia el punto de fuga.

Son copias en el espacio, así que cada una fuga exacto y al «Mandar al 2D» llegan al layout. Cada copia es su propio grupo, y un Ctrl+Z las saca todas.

## Pruebas

- **`check_seleccion_grupo_ui.js`** (nueva), con el mouse y el teclado de verdad sobre una capa de 5 cuadros. Comprueba:
  - que la flechita abre la lista completa y que la lista entra en la ventana;
  - que el Lazo cambia el ícono y la barra, y un lazo dibujado elige el trazo;
  - que el clic derecho en el botón abre la lista; «Elegir toda la capa y transformarla» más un tirador de esquina agranda los 5 dibujos (124 → 241 px) y un Ctrl+Z los deja como estaban;
  - que Ctrl+Shift+A elige la capa y, al soltar, el alcance vuelve a «este dibujo»;
  - que Mismo color elige los dos trazos negros y no el rojo;
  - que mantener pulsado abre la lista y Esc la cierra;
  - que el alcance no se guarda y el tipo sí;
  - que el clic derecho en la capa de la línea de tiempo elige toda la capa;
  - que el menú Edición tiene las dos órdenes.

  Falla con la 3.28.2: el botón no tiene desplegable.
- **`check_repetir_fuga_3d_ui.js`** (nueva). En la Calle de 1 punto, comprueba:
  - que un edificio de dos trazos se repite 4 veces hacia el fondo, cada 2,7 m sobre la misma fachada;
  - que cada copia es su propio grupo;
  - que se achican hacia el punto de fuga (200 → 171 → 149 → 132 → 118 px);
  - que un Ctrl+Z las saca todas.
- Siguen pasando `check_seleccion_alcance_ui`, `check_capa_menu_ui` y la puerta completa.
