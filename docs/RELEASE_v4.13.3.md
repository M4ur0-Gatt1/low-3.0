# LOW v4.13.3 — Copiar y pegar un dibujo, que borraba lo pegado

Ctrl+C y Ctrl+V entre cuadros tenían dos problemas al mismo tiempo. Uno
**borraba trabajo**.

## El que borraba

Pegar avisaba «Pegado en F3», el lienzo mostraba el dibujo, y **a los 260 ms
desaparecía del documento**. Uno seguía animando, se iba del cuadro, volvía, y
no había nada.

La causa: al pegar en el cuadro donde ya estabas parado, el modelo cambiaba pero
**el lienzo no se enteraba**. `setCell` avisaba `"cells"`, y la mesa de dibujo
sólo escucha `"frame"`. Como el pegado no cambia de cuadro, nadie repintaba. Y
un lienzo desactualizado no es un problema visual: el volcado con retardo
—el que existe para que un trazo llegue al documento sin esperar a que cambies
de cuadro— escribe el lienzo **encima** del dibujo del modelo a los 260 ms. Lo
viejo se comía a lo nuevo: 567 caracteres pasaban a 94.

Arreglado en la causa y no en el síntoma: si lo que cambia es la celda donde uno
está parado, cambió el dibujo que hay sobre la mesa, y eso ahora se avisa. Vale
para pegar y para cualquier otra operación de exposición que toque el cuadro
actual.

## El que confundía

El mismo Ctrl+V hacía **dos cosas distintas según un estado invisible**: si
alguna vez habías abierto la X-sheet, sus atajos capturaban la tecla primero y
pegaban una *referencia* al mismo dibujo; si no, otro camino en `app.js` pegaba
una *copia aparte*. Ninguna de las dos estaba anunciada, y son cosas muy
distintas: retocar una referencia cambia todos los cuadros donde está.

Ahora hay **una regla, y depende de algo que se ve**:

| | qué hace |
|---|---|
| **Ctrl+C / Ctrl+V** sin rango seleccionado | copia el **dibujo**; pega una **copia aparte** — retocarla no toca el original |
| **Ctrl+C / Ctrl+V** con un rango seleccionado | copia **celdas**: trabajo de tiempo, sin duplicar dibujos |
| **Ctrl+Shift+V** | pega como **reuso**: el mismo dibujo expuesto otra vez |

Y la barra de estado dice cuál de las tres pasó, cada vez.

Las dos implementaciones que competían pasaron a ser una: los atajos le piden a
`app.js` la única que quedó.

## Pruebas

- `tools/check_copy_paste_ui.js`, nuevo y en la puerta de CI. Todas sus esperas
  pasan los **400 ms a propósito**: medido antes, el bug pasa desapercibido.
  Comprueba las tres ramas de la regla, que el original quede intacto, y que lo
  pegado siga estando al volver al cuadro.
- Se verificó que el recorrido **falla** con el código viejo: «Ctrl+V no pega el
  dibujo».
- 5 pruebas de modelo nuevas (365): que cambiar la celda actual avise, que
  cambiar una lejana **no** repinte al pedo, y que el duplicado sea un dibujo
  aparte.
- 3 contratos estáticos nuevos.
- Batería completa: 10 suites de modelo, 4 comprobaciones Python y **15**
  recorridos E2E, en verde.

## Todavía no está

De lo que pediste quedan dos cosas, que son trabajo aparte y no están:

- Una **herramienta de movimiento** que grabe el objeto moviéndose e interpole.
- Los **arcos** de aceleración, desaceleración y overlapping sobre el lienzo.

## Reversión

Estable previa: `v4.13.2`.
