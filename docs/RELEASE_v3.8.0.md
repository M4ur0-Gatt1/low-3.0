# LOW 3.8.0 — Movimientos de cámara, y una cámara que se ve, se entiende y se deshace

Reporte de Mauro, en el espacio Cámara: «creo que me faltan opciones de movimientos de cámara; acá se me movió la cámara pero no tengo idea de cómo se movió».

## Por qué se movía sin avisar

En la cámara 2D había cuatro maneras de dejar una clave sin darse cuenta:

- **Al cerrar la línea de tiempo** el modo cámara se apagaba a medias. La herramienta seguía siendo la cámara y el encuadre se podía seguir arrastrando: un arrastre dejaba una clave.
- **Al elegir otra herramienta o apretar Escape**, el botón de cámara quedaba prendido y el encuadre dejaba de responder.
- **Ventana → Cámara funcionaba al revés** cuando la guía de cámara estaba a la vista.
- **En Composición, con auto-key**, cada muesca de la rueda dejaba una clave y un paso de deshacer. Girar la rueda para mirar llenaba la cámara de claves.

Además, **ninguna clave de cámara se podía deshacer**: Ctrl+Z deshacía otra cosa. Y los campos X, Y, Zoom y Rotación de la barra nunca hacían nada.

Las cuatro maneras quedaron corregidas. El espacio **Cámara entra en modo cámara**; los demás espacios lo apagan.

## Todo se deshace

Cada cambio de cámara es **un paso de Ctrl+Z con nombre**, por ejemplo «Paneo a la derecha · cuadros 1–25», «Temblor» o «Curva corte desde el cuadro 1».

## El panel Cámara

Arriba del inspector, cuando la cámara está activa:

- **X, Y, Zoom y Giro** muestran la cámara del cuadro y se pueden escribir. La barra de arriba ahora también anda.
- **La clave del cuadro:** se pone y se saca con un botón.
- **La curva del tramo:** cómo va la cámara de una clave a la siguiente.
  - **Suave:** arranca y frena suave.
  - **Constante:** la misma velocidad todo el tramo.
  - **Arranca suave:** sale despacio y llega rápido.
  - **Frena suave:** sale rápido y llega despacio.
  - **Corte:** se queda quieta y salta en la clave siguiente.
- **Movimientos de un clic**, desde el cuadro actual y con la duración que elijas (24 cuadros si no la cambiás):
  - **Paneo** a la izquierda, a la derecha, arriba o abajo. «Derecha» es la derecha del encuadre, aunque la cámara esté girada.
  - **Acercar** y **Alejar**.
  - **Girar** 15° a cada lado.
  - **Temblor:** se apaga de a poco y vuelve exacto al encuadre. Es siempre el mismo, así que se puede ajustar sin que cambie solo.
  - **Encuadrar selección:** una clave que contiene lo seleccionado, con aire alrededor.
  - **Plano completo:** la hoja entera.
- **La lista de claves:** cuadro, posición, zoom, giro y curva. Un clic va a ese cuadro; ✕ borra la clave. También se pueden borrar todas.

## Ver cómo se mueve

- **El recorrido:** sobre el lienzo, una línea con un punto por cuadro marca por dónde pasa el centro de la cámara. Los puntos juntos son lento y los separados rápido, como en una carta de spacing. Cada clave lleva un rombo con su número y el contorno del encuadre en esa clave. El cuadro actual se marca en celeste.
- **Ver por la cámara:** la vista sigue al encuadre en cada cuadro, así que con el play se ve el plano. Lo de afuera se oscurece y, al apagarlo, vuelve la vista de antes.
- **El zoom entre claves** se interpola en escala logarítmica: de 100 % a 400 % pasa por 200 % en la mitad, no por 250 %. Así el acercamiento se siente parejo.
- **La planilla:** al pasar el mouse por el rombo de cámara se ve la posición, el zoom y el giro de esa clave. Antes leía campos que no existen y no decía nada.

## Detalles

- El dial de la mesa giratoria quedaba encima de la esquina de zoom del encuadre; ahora va debajo.
- La X y la Y de la barra cortaban los números de cuatro cifras.

## Pruebas

**`check_camara_2d_ui.js`** (nueva) usa el mouse y el teclado de verdad. Comprueba que:

- la pestaña Cámara entra en modo cámara;
- arrastrar el encuadre deja una clave, Ctrl+Z la saca y Ctrl+Y la vuelve;
- el campo Zoom deja una clave al 150 % y se deshace;
- «Paneo →» en 12 cuadros deja claves en 1 y 13, pasa por el medio y es un solo paso con nombre;
- la lista lleva al cuadro, y la barra sigue al cuadro;
- «Corte» deja la cámara quieta hasta la clave siguiente;
- el temblor vuelve exacto al encuadre y un solo Ctrl+Z lo saca;
- el recorrido se pinta en un `<canvas>`;
- «Ver por la cámara» centra y llena la vista con el encuadre, lo sigue al cambiar de cuadro y al apagarse vuelve a la vista de antes;
- el lápiz apaga el modo cámara;
- cerrar la línea de tiempo ya no deja la cámara a medias, y un arrastre ya no deja clave;
- Ventana → Cámara prende y apaga el modo;
- el dial queda debajo del encuadre.

Cada arreglo se comprobó en los dos sentidos: con el código viejo la prueba falla y con el nuevo pasa.

**`check_composition_ui.js`**: cinco muescas de rueda con auto-key dejan una clave y un solo paso, al soltar.

**`check_xsheet_columnas_ui.js`**: las claves de prueba tienen la forma real, y la leyenda tiene que decir el zoom.
