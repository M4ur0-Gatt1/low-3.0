# LOW 3.11.1 — Dibujar un círculo chico con la tableta ya no selecciona nada

Reporte de Mauro: «cuando doy la vuelta completa con la tableta, como dibujando un pequeño círculo, se activa la herramienta de selección… me pasa siempre o casi siempre y es bastante molesto».

## Por qué pasaba

**Windows convierte la pulsación larga del lápiz en un clic derecho:** basta que la punta quede un instante dentro de un radio chico, y un círculo chico y lento nunca sale de ese radio.

En LOW, el clic derecho sobre el lienzo **selecciona lo que hay abajo** para abrir su menú. Abajo estaba justo el trazo recién dibujado, así que quedaba seleccionado («1 pieza») y con el menú abierto. Había que ir a la flecha, deseleccionar y volver al lápiz.

El botón lateral del lápiz, si se aprieta sin querer al girarlo, hace lo mismo.

## Ahora

Con una herramienta de dibujo, **el clic derecho que llega durante un trazo de lápiz, o en los 700 ms siguientes, se descarta**. Se decide por el momento y no por el tipo de evento, porque, según el controlador de la tableta, Windows manda ese clic como si fuera del mouse.

Fuera de ese momento, el clic derecho del **mouse** y el **botón lateral** con la punta en el aire siguen abriendo el menú. Con la flecha (selección) todo sigue igual.

**Si preferís que Windows no lo genere nunca:** Configuración → Dispositivos → Lápiz y Windows Ink → desactivar «Mantener presionado para hacer clic derecho». En algunas tabletas está en el panel del controlador del lápiz.

## Pruebas

**`check_pulsacion_larga_ui.js`** (nueva) usa un lápiz simulado. Con el código anterior falla: el trazo quedaba seleccionado y el menú abierto. Comprueba que:

- después de un círculo chico, el clic derecho del lápiz no selecciona ni abre el menú, y sigue elegido el Lápiz;
- lo mismo si ese clic llega marcado como del mouse;
- un rato después, el clic derecho del mouse abre el menú y selecciona;
- el botón lateral con la punta en el aire, lejos de un trazo, abre el menú.

## Arreglado de paso: un error al arrancar

Al arrancar, el espacio de trabajo puede abrir el documento antes de que termine de cargar el código que guarda el dibujo (`canvas-content.js`). Según la velocidad de la máquina, LOW tiraba «dzCanvasInner is not defined» en el arranque. La puerta lo agarró y era la misma causa de varias fallas al azar de las semanas anteriores. Ahora ese código carga antes que todo lo demás.

Además, cuatro pruebas propias (`check_pincel_suave_ui`, `check_camara_2d_ui`, `check_capa_bitmap_ui` y `check_mesa_animacion_ui`) daban por cargada la página vieja apenas después de recargarla. Ahora esperan a la nueva.
