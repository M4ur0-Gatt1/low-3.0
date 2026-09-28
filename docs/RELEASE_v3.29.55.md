# LOW v3.29.55 — El giro vuelve a dar la vuelta entera

Rotar una pieza se frenaba a media vuelta: llegabas a 180° y no seguía, como si
todos los huesos tuvieran un tope puesto. **Es una regresión que introduje en la
v3.29.51**, cuando hice que posar a mano respetara los topes de giro. Eran dos
fallas encadenadas.

## El rango completo no es un tope

Un hueso nace con el rango `-180 / 180`, que quiere decir «sin restricción». Pero
al empezar a aplicarlo, ese rango pasó a funcionar como un tope real: recortaba
en media vuelta y no dejaba acumular giro. Un brazo que da la vuelta, una rueda o
una hélice quedaban imposibles.

Ahora `-180 / 180` significa lo que siempre quiso decir: **sin tope**, gira todo
lo que haga falta, vueltas enteras incluidas. Los topes de verdad —los que le
ponés vos— siguen frenando igual. El panel lo dice: *«Tope de giro · sin tope»*.

## El gesto tampoco podía pasar de media vuelta

Aparte del tope, el arrastre calculaba el ángulo con `atan2`, que devuelve entre
−180° y 180°: al cruzar esa línea el valor saltaba al otro extremo y el giro se
daba vuelta solo. Aunque no hubiera ningún tope, el gesto no podía acumular más
de media vuelta.

Ahora el giro se **acumula**: se lleva la cuenta del recorrido real del puntero,
así que podés dar las vueltas que quieras en un solo gesto.

## Y cuando un tope sí frena, lo dice

Antes el hueso simplemente dejaba de girar, sin explicación, y parecía que el
programa se había colgado. Ahora la barra de estado avisa:
*«"mano" llegó a su tope de giro (−30° a 30°) · se cambia en Construir»*.

## El personaje de ejemplo va sin topes

Traía el codo limitado a −150°/5° para mostrar los topes en acción, pero
encontrarse con una pieza que frena parece una falla antes que una restricción
puesta a propósito. El ejemplo es para aprender a animar; los topes se explican
en el tutorial.

## Qué se midió

| caso | antes | ahora |
| --- | --- | --- |
| pieza sin topes, pedirle 200° · 360° · 540° · 720° | todo recortado a **180°** | pasa exacto: 200 · 360 · 540 · 720 |
| gesto real de dos vueltas con la manija | se frenaba antes de la primera | **720°**, las dos vueltas enteras |
| muñeca con tope real −30°/30°, girarle media vuelta | — | frena en **30°** y explica cuál tope la paró |
| el panel, en una pieza sin topes | «Tope de giro» | «Tope de giro · sin tope» |
| topes del personaje de ejemplo | codo en −150°/5° | todas las piezas libres |
