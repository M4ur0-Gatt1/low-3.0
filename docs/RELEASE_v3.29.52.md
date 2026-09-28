# LOW v3.29.52 — Las piezas se doblan

Hasta acá una pieza del rig sólo podía **rotar**. Sirve para un brazo; no sirve
para el pelo, una cola, una manga ni nada que tenga que curvarse. El modelo ya
nombraba los modos `curve`, `envelope`, `warp` y `weightedMesh`, pero el único
implementado era `rigid`.

## Dar curva

Con la pieza elegida, **Dar curva** le pone tres puntos verdes sobre el dibujo.
Se arrastran y la pieza se dobla siguiendo esa curva. El doblez queda clavado en
el cuadro donde estás, así que se anima igual que una pose.

**Sin doblez acá** borra el de ese cuadro. **Quitar curva** devuelve la pieza a
rígida y el dibujo a su forma exacta.

## Cómo funciona

Cada punto del dibujo se guarda en coordenadas curvilíneas respecto de la curva
**en reposo** —cuánto avanza a lo largo y cuánto se separa en perpendicular— y se
lo vuelve a colocar sobre la curva **posada** con las mismas coordenadas. Por eso
dar una curva no cambia nada hasta que se la toca: mientras las dos curvas sean
iguales, cada punto cae donde estaba.

Dos cosas que había que resolver bien:

**Doblar no es transformar.** Una rotación es una matriz; un doblez obliga a
reescribir la geometría punto por punto. Para eso la pieza pasa de forma a trazo
—un rectángulo no se dobla— y esa conversión queda guardada en el dibujo, no como
un efecto pasajero: si no, al cambiar de cuadro volvería el rectángulo.

**El rig no puede hornear su vista en el dibujo.** El `d` original se guarda
aparte y se devuelve antes de serializar, igual que ya pasaba con las poses y con
las variantes escondidas. El archivo se guarda con la forma original.

## Qué se midió

| caso | resultado |
| --- | --- |
| curva sin tocar | identidad exacta: error **0** en todos los puntos probados |
| doblar la punta a (100,−40) | la base queda en (0,0) y la punta cae exactamente ahí |
| grosor al doblar | dos puntos separados 20 px siguen separados **20 px** |
| orden a lo largo | se mantiene: el dibujo no se da vuelta |
| convertir un `rect` 112×42 rx=20 a trazo | perímetro **274** contra 273.66 teórico |
| dar curva a una pieza | la caja no cambia: `482,270,112,42` antes y después |
| arrastrar el punto del medio 45 px | la curva baja 291 → **336** y el brazo se arquea (alto 42 → 72) |
| dos claves de doblez, F1 abajo y F7 arriba | F4 cae en **291**, el medio exacto, y el brazo vuelve a estar recto |
| quitar la curva | la caja vuelve exacta a `482,270,112,42` |
| guardar con la pieza doblada | el archivo sale con el trazo original, sin `data-defbase` |

Y lo anterior, confirmado sin regresiones en el mismo pasaje: cadena FK con el
torso quieto, topes (−400 → −150), curvas de interpolación, sustituciones de
dibujo e IK con error **0 px**.
