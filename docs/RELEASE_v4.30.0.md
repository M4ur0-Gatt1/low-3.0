# LOW v4.30.0 — el estudio no espera a que cargue el chat

Segundo reporte de Mauro sobre el arranque, y el que faltaba:

> y hay una primera pantalla que sigue siendo la vieja

Es cierto, y ahora se sabe cuánto: **6.542 milisegundos**.

## Lo que se midió

Instrumentando la app real **desde antes de que corra nada** —cuando el arranque
termina ya no queda rastro de quién pintó primero—, la línea de tiempo era:

| tiempo | qué se veía |
|---|---|
| 62 ms | estudio **oculto** |
| ~1.300 ms | se va el splash del logo |
| **6.542 ms** | aparece el estudio y su invitación |

O sea: el logo tapaba el primer segundo, y los **cinco siguientes** eran la
pantalla vieja del lado programador.

## Por qué

La llamada a la primera pantalla está en la **última línea útil** de `init()`, y
antes de ella `init()` hace `await api.get_state()`, `await loadChatTabs()` y
`await resume(última conversación)`.

Dicho de otro modo: **el estudio de dibujo esperaba a que cargara el chat de la
IA** — exactamente la jerarquía que la decisión de v4.28.0 vino a dar vuelta. La
pantalla se invirtió; el orden del arranque, no.

## El arreglo: dos fases, y no por gusto

**Fase temprana** (corre con el DOM, ~100 ms): muestra el estudio, pone el botón
✳ IA y pinta la invitación. No necesita nada del puente de Python — el estudio,
su barra y la invitación son HTML que ya está en la página.

**Fase tardía** (donde estaba, al final de `init()`): re-cablea la pluma de la
barra izquierda y **prende** las acciones.

El re-cableado **no puede** adelantarse: `bind()` le pone `designEntry` a
`#abDesign` en la línea 517 de `app.js` y corre *después* de las esperas, así que
pisaría cualquier cosa que hiciéramos antes. De ahí las dos fases, y hay un
contrato que impide volver a juntarlas.

## Y las acciones nacen apagadas

La invitación aparece a los 100 ms, pero «Nuevo documento» necesita el puente.
Un botón visible que no hace nada es **el defecto que se arregló en v4.29.0**, y
no vamos a reintroducirlo por apuro: hasta que el arranque termina, las dos
acciones se muestran apagadas y con un «Preparando LOW…» que lo dice. Después se
prenden. Medido en la app real:

- temprano: `{estudioVisible: true, nuevo: apagado, abrir: apagado, dice: "Preparando LOW…"}`
- tarde: `{nuevo: PRENDIDO, abrir: PRENDIDO, espera: false}`
- clic real: `{ultimo: "nuevo", tabs: 2}`

## Pruebas

**`check_pantalla_inicial_ui` ahora se instrumenta antes de navegar** y exige que
la invitación la pinte la fase **temprana**, no la tardía: espía la llamada del
arranque y compara los dos instantes. Verificado mordiendo con el código
anterior: `{"foto":{"t":364,...},"tTardio":310}`.

También exige que la primera foto de la invitación tenga las acciones apagadas y
un texto que diga que LOW está arrancando — porque si nacieran prendidas
estaríamos ofreciendo botones muertos.

**4 contratos estáticos nuevos**, los cuatro verificados a mano contra su
violación: que la fase temprana exista y esté colgada de `DOMContentLoaded`; que
**no** re-cablee la pluma; que las acciones nazcan con `disabled`; y que alguien
las prenda.

Uno de ellos tuvo que aprender lo mismo de siempre: `require("habilitar()")`
sobre el archivo entero **encontraba su propia definición** y pasaba aunque nadie
la llamara. Ahora busca en el cuerpo de la fase tardía. Es la tercera vez que
esta trampa aparece —`closeDesign`, `appearance: slider-vertical`— y está
anotada en las tres.

Puerta completa en verde.

## Una nota sobre el reloj de la invitación

El reloj que la quita cuando aparece un documento mira cada 500 ms, y **los
temporizadores se estrangulan cuando la ventana está en segundo plano**: durante
una medición mía la invitación tardó más de ocho segundos en irse, con la ventana
oculta. Con LOW adelante se va enseguida. Queda dicho para no volver a leer eso
como una regresión.

## Reversión

Estable previa: `v4.29.0`. Se revierte sacando el autoarranque del final de
`ui/application/pantalla-inicial.js`: la fase tardía sigue funcionando sola, y se
vuelve al arranque de v4.29.0.
