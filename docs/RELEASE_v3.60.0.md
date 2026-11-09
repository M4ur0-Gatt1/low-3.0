# LOW 3.60.0 · Modificadores y efectos de capa

Pasos 1 y 2 del plan para tener en LOW lo que Blender trae para animación 2D: los **modificadores** y los **efectos** (Shader FX) de Grease Pencil. Cambian cómo se ve una capa **sin tocar sus dibujos**: se sacan y la capa vuelve a ser la de antes.

## Clic derecho en la capa → «Modificadores y efectos…»

Una lista, en orden, que se aplica de arriba hacia abajo. Cada modificador se agrega, se configura, se apaga o se quita. «Aplicar» es un paso de Ctrl+Z.

### Modificadores

- **Tiempo** (Time Offset). La capa muestra otro cuadro de sí misma:
  - desfasada unos cuadros;
  - en **bucle**: un ciclo de caminata que se repite;
  - de **ida y vuelta**, sin repetir las puntas;
  - **al revés**;
  - **clavada** en un cuadro.

  Con varias capas que usan el mismo ciclo y distinto desfase se arma una multitud sin duplicar una sola celda. Varios modificadores de tiempo se encadenan.
- **Temblor de línea** (Noise o «boil»). La línea tiembla un poco y cambia cada N cuadros («en dos» tiembla en dos), como el dibujo hecho a mano que nunca queda quieto. Tiene amplitud, tamaño del temblor y variante.
- **Se dibuja solo** (Build). En un tramo de cuadros, los trazos aparecen uno tras otro, en el orden en que se dibujaron.

### Efectos

- **Desenfoque.**
- **Sombra proyectada:** corrimiento, suavidad, color y opacidad.
- **Resplandor:** radio, color e intensidad.
- **Colorear:** pasar la capa a un color, con cantidad.

El temblor y los efectos se arman como **un solo filtro SVG por capa**, en el orden de la lista. Es el mismo texto en la mesa y en el export: lo que se ve es lo que sale.

## Dónde se ven

- **En la mesa,** en las otras capas.
- **Al reproducir:** el temblor y los efectos también se ven en la capa activa.
- **Al exportar.**

La capa que estás dibujando se ve como es, para editar lo que de verdad hay (igual que con el movimiento de capa).

Se guarda en `layer.mods`, con normalizador. Los colores inválidos vuelven al de fábrica: un archivo no puede meter código en el filtro. Las capas sin modificadores se exportan exactamente igual que antes; la prueba lo compara.

## Pruebas

- **`tools/run_modificadores_tests.js`** (nueva, en el build): 39 casos.
  - Desfase, bucle (también desfasado), ida y vuelta, al revés, clavada, encadenados y el tramo de un solo cuadro.
  - La semilla del temblor «en dos».
  - Los trazos que se ven cuadro a cuadro.
  - El filtro en orden: la sombra debajo, y el temblor antes del desenfoque.
  - Colores inválidos.
  - Guardar y reabrir, Ctrl+Z y Ctrl+Shift+Z.
- **`tools/check_modificadores_ui.js`** (nueva, en el build): el diálogo desde el clic derecho real.
  - El bucle en el cuadro 3 muestra el dibujo 1 en la mesa y en el export, y los dibujos quedan intactos.
  - Temblor y sombra con su filtro en la mesa y en el export.
  - «Se dibuja solo» deja 2 de 4 trazos en el cuadro 2.
  - Tres Ctrl+Z dejan el export idéntico al de antes.
  - Se rompió a propósito el bucle en la mesa y el filtro en el export, y las dos roturas se detectan.

## Lo que todavía no hace

- **Una capa con tono (sombra o luz de Harmony) y efectos a la vez:** se ven los dos en el export, pero en la mesa manda el tono.
- **«Se dibuja solo» va trazo por trazo,** no punto por punto dentro de un trazo.
