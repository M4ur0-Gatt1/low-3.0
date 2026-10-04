# LOW 3.2.3 — el cuadro selector de la línea de tiempo

## Seleccionar cuadros con un cuadro selector

Seleccionar varios cuadros ahora funciona como en Moho o en el explorador de archivos:

- **Arrastrar dibuja un rectángulo** sobre la línea de tiempo y selecciona todos los cuadros que toca, aunque pertenezcan a varias capas.
- **Arrastrar siempre selecciona.** También cuando empezás sobre algo que ya está seleccionado.
- **Shift o Ctrl + arrastrar** (o + clic) **suma** a lo que ya estaba seleccionado.
- **Alt + arrastrar mueve** la selección entera, con todas sus capas. Mientras arrastrás se marca en celeste dónde va a quedar, y el cuadro que agarraste queda donde lo soltás. Es un solo paso de historial: Ctrl+Z devuelve el bloque a su lugar y la selección vuelve con él.
- Cerca del borde, la línea de tiempo se desplaza sola para que puedas seguir seleccionando.

## Arreglado

- **Volver a arrastrar sobre una selección desordenaba la capa.** Probando el LOW.exe 3.2.2 descargado: después de seleccionar los cuadros 1 a 4, arrastrar de nuevo de 1 a 4 para reseleccionarlos movía el dibujo 1 y dejaba la capa como 2-3-1-4, con un paso «Mover exposición» en el historial. Además, el arrastre movía solo la exposición que estaba bajo el puntero, no toda la selección. Ahora arrastrar selecciona y Alt+arrastrar mueve toda la selección.
- La barra de estado decía «4 cuadros seleccionadas». Ahora dice «seleccionados».

## Pruebas

- `check_timeline_seleccion_ui.js` cubre ahora:
  - arrastrar de nuevo sobre lo que ya está seleccionado no cambia la escena;
  - el rectángulo se ve mientras arrastrás y desaparece al soltar;
  - Shift suma a la selección;
  - Alt mueve toda la selección en un paso, y Ctrl+Z la deja exacta y con su selección.
- `run_undo_estado_tests.js` (53 casos) suma «mover una selección de dos capas» y «mover hacia atrás no pasa del cuadro 1». El recorrido al azar de 300 operaciones ahora incluye mover selecciones.
- También se probó en la app real (WebView2) con eventos de mouse reales.
