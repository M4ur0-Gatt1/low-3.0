# LOW v4.48.0 — el rig ya mueve el dibujo

Esta versión existe para que el rig cut-out se pueda poner en manos de
animadores. Arregla la causa de fondo por la que no servía, que resultó ser
**una sola** y estaba produciendo tres reportes distintos.

---

## 1. El rig no movía el dibujo: un vínculo apuntaba a la nada

Reportado tres veces con tres caras: «una pieza no quedó asociada al hueso
como debería», «hay una pieza que se mueve suelta cuando muevo otras, como en
espejo», y el cartel «F1: animando sólo el esqueleto» apareciendo con el
personaje a la vista.

**MEDIDO**, dibujando seis trazos con el lápiz y colocando el esqueleto
«Humano · stickman» de la biblioteca:

| | antes | ahora |
|---|---|---|
| piezas en la mesa | 6 | 6 |
| piezas con `id` | **0** | 6 |
| `id` guardados en el documento | **0** | 6 |
| vínculos creados por Repartir | 6 | 6 |
| vínculos que apuntan a algo real | **0** | **6** |
| tras cambiar de cuadro y volver | 6 colgados | 0 colgados |
| posar un hueso movía | **nada** | su pieza, y arrastra a sus hijos |
| guardar y reabrir | — | 6 vínculos, 0 colgados, claves intactas |

Y mientras tanto Repartir informaba «6 piezas repartidas entre 7 huesos».

**La causa.** Un vínculo *es* el `id` del elemento. El reparto le ponía un
`id` a cada pieza, pero sólo al elemento **vivo** de la mesa: nunca al
documento. La mesa se rearma desde el documento en cuanto algo la repinta
—cambiar de cuadro, volver de otro modo, el propio repintado del rig—, los
`id` se van con el DOM viejo, y todos los vínculos quedan apuntando a
elementos que ya no existen. El rig seguía «sano» según sus datos: lo que se
rompía era a qué apuntaban.

**El arreglo.** Los `id` se ponen y **se guardan en el documento antes** de
vincular. Y como Repartir no es el único camino que vincula —también lo hace
dibujar un hueso a mano, e importar—, la regla se pide en el cuello de
botella por el que todos pasan: *un vínculo apunta a un `id` que está
guardado*. Va en `ui/rigging/ids-persistentes.js`, envuelto, para que `app.js`
no sume una sola línea (está en el techo de su presupuesto).

La interpolación nunca estuvo rota: nunca llegaba a tener a quién mover. Con
el vínculo sano, dos claves dan `0° → 25,7° → 60°`.

## 2. «Cortar pieza» dibujaba líneas sobre el personaje

Reportado: «la herramienta para cortar piezas dibuja líneas», y en la captura
se veía una curva negra atravesando al personaje.

Cuando no hay una pieza elegida, «Cortar pieza» avisaba y no arrancaba —pero
dejaba la herramienta de dibujo activa—. Uno igual arrastra sobre el personaje
esperando cortarlo, y lo que pasa es que **dibuja encima**. Avisar no alcanza
cuando el gesto siguiente hace algo destructivo.

Ahora el rechazo deja la **flecha** activa, así ese mismo gesto elige la
pieza, que es justo lo que el mensaje está pidiendo. Vale para los cinco
motivos de rechazo, no sólo para «no hay nada elegido».

## 3. El globo de ayuda era un párrafo

Tercer reporte sobre lo mismo: primero salía doble, después tapaba el botón, y
ahora «siguen siendo incómodos, son grandes».

**MEDIDO** sobre los 283 textos de ayuda de la interfaz: 49 caracteres de
promedio, **179 el más largo** — a 260 px de ancho, seis renglones flotando al
lado del cursor. Casi todos ya vienen partidos («Pincel (B)**:** grosor según
la presión…»), así que ahora el **nombre y el atajo** van arriba y el detalle
abajo en chico, recortado a dos renglones.

| | antes | ahora |
|---|---|---|
| área media | 25.792 px² | **11.806 px²** |
| el más alto | 110 px | **56 px** |
| ancho | 260 px | 210 px |

El texto completo sigue en la ayuda del programa (`?`).

---

## Cómo se encontró

`tools/auditoria_rig_flujo.js` es un informe, no una puerta: recorre lo que
hace un animador la primera vez —dibujar el personaje, colocar el esqueleto,
Repartir, posar, dejar que interpole— y mide en cada paso lo que esa persona
notaría. Antes: **3 problemas**. Ahora: **0**.

Se suma a `tools/auditoria_uso_ui.js`, que aprieta los 144 botones de los
siete espacios y anota los que no producen ningún efecto observable.

## Guardias nuevos, los tres probados al revés

- `tools/check_rig_vinculos_ui.js` — sin el arreglo se pone rojo nombrando los
  seis vínculos colgados. Cuida cinco cosas en este orden: que no queden
  vínculos colgados, que los `id` estén **guardados** (sin esto lo anterior
  pasa igual, porque la mesa todavía no se repintó), que sobrevivan a un
  **repintado**, que **posar mueva el dibujo** —la única prueba de que el
  vínculo sirve—, y que todo eso sobreviva a **guardar y reabrir**.
- `tools/check_cortar_no_dibuja_ui.js` — sin el arreglo denuncia que quedó el
  lápiz activo, y además comprueba que arrastrar no agregue trazos.
- `tools/check_hidden_esconde_ui.js` y `check_3d_superficie_curva_ui.js`
  siguen de la versión anterior.

Puerta local: **64 de 64 recorridos en verde**. `app.js` sin tocar, en el
techo del presupuesto (17.075 líneas).

## Lo que esta versión NO cubre

Dicho antes de que lo encuentre quien la pruebe:

1. **La desaparición del dibujo al colocar el esqueleto** se reportó y no se
   pudo reproducir, ni siquiera contando los píxeles oscuros del lienzo antes
   y después (18.261 → 18.235). Puede seguir ahí.
2. El camino de **dibujar el hueso a mano** tiene el mismo código sospechoso,
   pero no se logró disparar desde el arnés: la regla nueva lo cubre por
   construcción, no por medición.
3. Las auditorías miran **botones** y **el flujo del rig**. No miran gestos
   con el lápiz, atajos de teclado, ni el orden en que se hacen las cosas.
4. Todo está medido en el mock. Hay defectos que sólo aparecen en la app real
   de Windows (WebView2).
