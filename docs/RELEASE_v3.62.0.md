# LOW 3.62.0 · Mover varios cuadros a la vez, y cuadros de barrido

Paso 4 del plan para tener en LOW lo que Blender trae para animación 2D.

## Animación → «Mover varios cuadros…»

Es el **multiframe editing** de Grease Pencil, con su curva de atenuación. Corre, gira o escala el dibujo de la capa en un **tramo de cuadros a la vez**: corregir la proporción de una cabeza en 40 cuadros, o bajar todo un personaje que quedó alto.

- **Sin atenuación,** todos los cuadros del tramo se mueven igual.
- **Con atenuación lineal o suave,** el cuadro actual se mueve entero y los de las puntas cada vez menos.
- **Cada dibujo se mueve una sola vez,** aunque esté expuesto en varios cuadros: con el peso más alto de los suyos.
- **El pivote es el centro de la hoja.**
- **Un paso de Ctrl+Z.**

## Animación → «Cuadro de barrido (smear)…»

Los **«múltiplos»** del dibujo animado clásico para un movimiento muy rápido: en el cuadro actual deja **detrás del dibujo** varias copias cada vez más transparentes, en la dirección en que vino.

- **La dirección se mide sola:** del centro del dibujo anterior (el último distinto de la capa) al del actual. Se puede corregir.
- **Se elige la cantidad de copias y su opacidad.**
- **Las copias no repiten los `id` del original,** así que el rig y las selecciones no se confunden.
- **Un paso de Ctrl+Z.**

## Hooks y claves por punto (AnimAll)

**No agregué un sistema aparte.** El AnimAll de Blender, que pone claves sobre los puntos de un trazo, en LOW se hace así:

1. editar los nodos del trazo en dos dibujos clave (el editor de nodos);
2. «Intercalar toda la secuencia» (3.58), que morfea esos puntos cuadro a cuadro respetando el timing.

**Por qué no:** un sistema de claves por punto encima del dibujo se vería distinto mientras se edita la capa que al reproducir. Es el mismo límite que el movimiento de capa, pero en cada punto, y confundiría.

## Pruebas

- **`tools/run_varios_cuadros_tests.js`** (nueva, en el build): 12 casos.
  - La atenuación: ninguna, lineal y suave.
  - Fuera del tramo no se mueve nada.
  - La matriz con peso 0, 0,5 y 1, y el giro alrededor del centro.
  - Cada dibujo se mueve una sola vez y el tramo limita.
- **`tools/check_varios_cuadros_ui.js`** (nueva, en el build): con el mouse desde el menú.
  - Sin atenuación, los tres dibujos se corren 50, y un Ctrl+Z vuelve.
  - Con atenuación lineal, el del medio se corre 100 y los de las puntas 60.
  - El barrido mide la dirección (300, 0), deja 3 copias detrás, corridas hacia atrás y sin ids repetidos, y Ctrl+Z las saca.
