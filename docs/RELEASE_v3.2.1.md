# LOW 3.2.1 — seleccionar varios cuadros, el clic derecho, y la ventana separada con el estilo del estudio

## Seleccionar varios cuadros en la línea de tiempo

- **Arrastrá sobre las celdas** para seleccionar un rectángulo de cuadros. Puede abarcar varias capas.
- **Shift+clic** extiende la selección desde donde estabas.
- **Arrastrar un bloque que ya está seleccionado lo mueve**, como antes. Arrastrar sobre celdas sin seleccionar selecciona. Es la misma regla que usa Harmony.
- La barra de estado dice cuánto quedó seleccionado: «4 cuadros × 2 capas seleccionadas · clic derecho para las acciones».

## Clic derecho: acciones de cuadro sobre la selección

- **Copiar** y **Cortar**.
- **Reexponer lo copiado**: comparte el dibujo, sin crear copias.
- **Rellenar los huecos** con el dibujo anterior.
- **Dibujo nuevo en cada celda vacía**: prepara un tramo para dibujar cuadro a cuadro.
- **Duplicar los dibujos**: cada dibujo del tramo pasa a ser una copia independiente, y los holds siguen compartiendo su copia. Sirve para partir de unas poses y modificarlas sin tocar las originales.
- **Exponer en unos, dos o tres** y **una celda por dibujo**.
- **Invertir**, **repetir** e **ida y vuelta**.
- **Insertar celdas en blanco**, **vaciar** (los dibujos quedan en el nivel) y **quitar** (lo que sigue se corre).

Cada acción es un solo paso de historial y Ctrl+Z vuelve al estado exacto anterior.

## La ventana separada se ve como el estudio

Al despegar un panel a otra pantalla, la ventana perdía el estilo: usaba otro naranja, otro celeste y otra tipografía, con botones-píldora. Ahora usa la paleta de LOW y el mismo estilo del estudio: baldosas de herramientas, la regla como banda celeste y el cuadro actual en naranja.

## Deshacer como máquina de estados

Hay un banco de pruebas nuevo, con 51 casos. Para cada operación del tiempo y del dibujo exige que deshacer devuelva **exactamente** el estado anterior, y rehacer el posterior. Incluye un recorrido al azar de 300 operaciones y una escena de 100 dibujos y 1000 exposiciones. Encontró y quedan arreglados:

- **Exponer un número de dibujo que no existía lo creaba**, pero el historial solo guardaba las celdas, así que deshacer dejaba el dibujo huérfano.
- **Mirar la paleta la creaba**: abrir el panel de color modificaba el documento. Ahora cada nivel nace con su paleta.

También hay un oráculo nuevo que, después de cada operación, compara celda por celda la Timeline y la X-sheet con el documento, incluidos varios Ctrl+Z y Ctrl+Y.

## Pruebas nuevas

- `run_undo_estado_tests.js`
- `check_timeline_xsheet_coherentes_ui.js`
- `check_panel_separado_estilo_ui.js`
- `check_timeline_seleccion_ui.js`
