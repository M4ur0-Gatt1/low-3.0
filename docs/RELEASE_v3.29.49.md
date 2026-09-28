# LOW v3.29.49 — Los pivotes del rig hacen lo que dicen

El pivote es el punto sobre el que gira una pieza: el hombro de un brazo, la
cadera de un cuerpo. Si no se puede poner donde uno quiere, el rig entero no
sirve. Eso es lo que estaba pasando.

## El pivote se lo llevaba la pieza equivocada

El botón **Pivote** decía "hacé clic donde articula la pieza seleccionada", pero
por dentro se lo ponía a **la pieza que estuviera bajo el cursor**.

El problema es que eso falla justo en el caso normal: el pivote de un brazo va
en el **hombro**, y ahí abajo lo que hay es el **torso**. Así que el punto se lo
llevaba el torso —silenciosamente— y el brazo seguía girando por el medio, como
si el clic no hubiera pasado nunca.

Ahora manda lo que está **elegido**: si tenés seleccionada una pieza o un hueso,
el pivote va a ese, caiga el clic donde caiga. Con nada elegido se mantiene el
comportamiento de siempre. **Alt+clic** lo saca.

## Y si el clic no caía en ninguna pieza, no pasaba nada

Era un `return` mudo: el clic no hacía nada y no había forma de saber por qué.
Ahora la barra de estado lo dice: *"Ahí no hay ninguna pieza · elegí primero la
pieza o el hueso, o hacé clic encima del dibujo"*.

## El pivote de un hueso no se podía mover

Arrastrar la articulación de un hueso movía **el hueso entero**, y el botón
Pivote sólo actuaba sobre piezas del dibujo. No había ninguna forma de correr el
pivote de un hueso: quedaba clavado en su cabeza para siempre.

Ahora **Alt+arrastrar** la articulación mueve solo el pivote, y el botón Pivote
también funciona con un hueso elegido.

## El tutorial dice lo que el programa hace

**Ayuda → Cómo se riggea un personaje** se corrigió en los dos puntos donde no
coincidía con el comportamiento: cómo se coloca el pivote y qué pasa con el
pivote de un hueso.

## Qué se midió

Con el flujo completo ejercitado sobre un personaje de cuatro piezas —registrar,
pivote, jerarquía, FK, posar—:

| caso | antes | ahora |
| --- | --- | --- |
| pivote del brazo con el clic sobre el torso | se lo llevaba el torso | va al brazo (465,238 → 408,230) y el torso queda intacto |
| clic donde no hay pieza | silencio | avisa qué falta |
| pivote de un hueso | imposible de mover | Alt+arrastrar lo mueve (511,239 → 551,279) con la cabeza y la punta intactas |

Lo que ya andaba y quedó confirmado de punta a punta: registrar las piezas de un
dibujo (sueltas o dentro de grupos), armar la jerarquía con **Cuelga de**, posar
en FK y que el dibujo se mueva de verdad con su clave en el cuadro.
