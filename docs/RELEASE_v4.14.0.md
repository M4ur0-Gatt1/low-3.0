# LOW v4.14.0 — Arcos y espaciado

Un movimiento vivo no viaja en línea recta ni a velocidad constante, y las dos
cosas se juzgan mirando lo mismo: **el espaciado**. Los puntos juntos son
cuadros lentos, los separados son rápidos. Es la carta de espaciado que se
dibuja al costado del papel desde antes de que hubiera computadoras.

Hasta ahora el arco existía **sólo para piezas de rig** y sólo desde el panel de
rigging. Un objeto cualquiera —uno que moviste con la interpolación de
movimiento o que grabaste en vivo— no mostraba nada.

## Cómo se usa

Botón **arcos** en la barra de la timeline, o *Animación → Arcos y espaciado*.
Elegís algo en la mesa y aparece su trayectoria a lo largo del rango, con un
punto por cuadro. El punto del cuadro actual va blanco y más grande, y sigue a
la cabeza lectora mientras scrubbeás.

Y no hay que contar píxeles: la barra de estado lo dice en palabras.

> «cadera»: acelera · cambia en F2, F8 · más rápido en F7, más lento en F1

Si la trayectoria quedó quebrada —el vicio clásico de interpolar a mano tramo
por tramo— también lo dice: *«la trayectoria está quebrada, no es un arco»*.

## Overlapping

El overlapping no es una propiedad de **un** arco: es la relación entre dos. Que
la cadera arranque y la mano llegue tarde no se ve mirando una sola.

**Shift+clic** en el botón fija el arco de lo que tengas elegido. Fijás la
cadera, después la mano, y las dos quedan a la vista con colores distintos:

> «mano» va 2 cuadro(s) ATRÁS de «cadera» · eso es overlapping

Si te adelantás en vez de atrasarte, lo dice también, porque adelantarse casi
siempre es un error de timing y no una intención.

**Y se calla cuando no sabe.** Si los dos movimientos no se parecen lo
suficiente, contesta que no se puede medir y que el ojo manda, en vez de tirar
un número cualquiera que parezca autoridad.

## Detalles que cambian cómo se lee

**Dentro de un sostenido no se pone un punto por cuadro.** El dibujo es el
mismo, así que el objeto no se movió: repetir el punto haría leer «lento» donde
en realidad hay un hold.

**El arco no se guarda.** Vive en la capa sólo-pantalla, igual que la guía del
espejo: no entra en el SVG ni sale en la exportación.

**Sigue el id, no el elemento.** Al cambiar de cuadro el lienzo se repinta desde
el contenido del dibujo, así que la referencia al elemento seleccionado queda
muerta. Si el arco dependiera de eso, desaparecería justo al mover la cabeza
lectora — que es exactamente lo que uno hace para leer un arco. Lo descubrió la
prueba, no el ojo.

## Las otras dos ya estaban (y no se encontraban)

Las herramientas de movimiento que pediste **ya existen**, en la misma barra:

- **Grabación en vivo**: armás la grabación, agarrás un elemento y actuás el
  movimiento con el mouse; al soltar, el recorrido real de tu mano se remuestrea
  al fps de la escena y se vuelve cuadros.
- **Interpolación de movimiento**: primer clic fija el INICIO del elemento
  seleccionado, lo movés a la posición final, segundo clic y se generan los
  cuadros del viaje con la curva que elijas.

Funcionan; se verificaron de punta a punta antes de escribir esto. El problema
era encontrarlas, que es el mismo problema que tenía el XML para Premiere.

## Pruebas

- `tools/run_arcs_tests.js` — **26/26**, en la puerta de CI. El módulo es puro:
  entran posiciones por cuadro, salen las respuestas. Incluye distinguir una
  curva de un zigzag, y que el desfase **devuelva nada** cuando dos movimientos
  no se parecen.
- `tools/check_arcs_ui.js` — el recorrido completo con dos piezas desfasadas dos
  cuadros a propósito: arco dibujado, lectura correcta, overlapping medido,
  algo quieto sin arco, y nada guardado dentro del dibujo.
- 6 contratos estáticos nuevos.
- Batería completa: 11 suites de modelo, 4 comprobaciones Python y **16**
  recorridos E2E, en verde.

## Reversión

Estable previa: `v4.13.3`. Los arcos son una capa de asistencia: no tocan el
documento ni la exportación.
