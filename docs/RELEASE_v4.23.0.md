# LOW v4.23.0 — Saber qué versión estás corriendo

Esta versión sale de un error mío, y conviene contarlo derecho porque el arreglo
es justamente que no vuelva a pasar.

## Lo que pasó

Se reportó tres veces que el panel de Composición «no anda nada nada nada». Yo
lo medí tres veces funcionando y lo dije. **Las dos cosas eran ciertas.**

El programa que se estaba probando no era el que se había arreglado. Los datos
del sistema:

| | |
|---|---|
| proceso de LOW abierto | arrancó **23:15:11** |
| `C:\Program Files\LOW\LOW.exe` en disco | modificado **23:20** |

El instalador nuevo se corrió **con LOW abierto**. El `.exe` del disco se
reemplazó, pero la ventana siguió corriendo el código anterior en memoria. Los
arreglos de las v4.20.0, v4.21.0 y v4.22.0 no estaban en lo que se estaba
tocando.

Y no había **ninguna** forma de darse cuenta:

- la ventana de animación no muestra la versión en ninguna parte;
- el log escribía `── arranque ──`, sin número;
- nada avisa cuando se instala una versión con el programa abierto.

Así que el reporte era correcto y mi medición también, y no había manera de
cruzarlas. Eso es lo que se arregla acá.

## Lo que cambia

**1. La versión, a la vista.** En la barra de estado de dibujo, al lado del
zoom y del cuadro. Es donde uno ya mira. Antes la versión sólo aparecía en el
panel de chat, que en la ventana de animación no se ve.

**2. El log dice qué arrancó.** `── arranque ── LOW v4.23.0 · python 3.13.2 ·
win32 · CONGELADO`. Con eso, cualquier reporte se puede diagnosticar sin
adivinar: se mira el log y se sabe qué build estaba corriendo.

**3. El aviso de reinicio.** Si el ejecutable en disco es más nuevo que el
proceso que lo corre, se instaló una versión con LOW abierto y lo que hay en
pantalla es código viejo. Ahora se dice, con el motivo y qué hacer:

> **Se instaló una versión nueva con LOW abierto.** Esta ventana sigue corriendo
> el código de antes —el de hace 5 minutos—, así que los arreglos de la versión
> que instalaste no están acá. Cerrá LOW y volvé a abrirlo.

Se cierra con un botón y no vuelve en esa sesión.

## Y un defecto real del panel de papel cebolla

Buscando el reporte del panel estilo TVPaint apareció esto, que sí estaba roto y
llevaba mucho tiempo así:

Los faders median **129 px dentro de una fila de grilla de 96**. `studio-polish.css`
le pone `height:14px` a **todos** los deslizadores de `#designView`, con un
selector de id, así que la altura declarada en `app.css` nunca ganaba; el escape
era `height:auto`, que da el alto por omisión del control vertical. Resultado: el
fader se desbordaba sobre su etiqueta de arriba y su porcentaje de abajo, y **el
nudo que se ve no caía donde estaba la barra**.

Ahora los faders miden 20 × 94 y entran en su fila. Medido: no pisan la etiqueta
ni el porcentaje, y arrastrar uno lleva el valor de 0 a 97 y lo escribe en el
perfil del papel cebolla.

También se sacó **`appearance: slider-vertical`**, que Chrome eliminó en la
versión 121: en un WebView2 actual es letra muerta —computa `none`— y lo único
que hacía era sugerir que la orientación dependía de ella. La da
`writing-mode: vertical-lr`, que es lo soportado y ya estaba.

Y el mixer, que tiene 505 px de canales en 249 px visibles, ahora **muestra que
hay más**: barra de scroll fina siempre visible y los bordes desvanecidos. El
scroll existía y no se anunciaba, así que el panel parecía tener diez canales en
vez de veinte.

## Lo que NO pude reproducir

**El arrastre de los faders.** Se reportó que «sólo anda con los clics». Con el
código actual, un arrastre real —eventos de mouse de verdad, no sintéticos—
mueve el valor de 0 a 97. Lo intenté cuatro veces; las dos primeras me dieron
«no anda» y las dos eran **errores míos de medición**: una leía una referencia al
elemento que el panel ya había reemplazado, y la otra apretaba en un punto que
estaba fuera del scroll del mixer. Queda dicho porque es probable que lo que se
estaba tocando sea el fader desbordado, que efectivamente responde raro.

Si con esta versión sigue pasando, hace falta saber qué fader y en qué momento.

## Pruebas

`tools/check_version_onion_ui.js`, nuevo y en la puerta de CI. Comprueba el chip
de versión (que esté, que diga la versión, que no se duplique, que no quede
detrás del hint), el aviso de reinicio (que no aparezca sin motivo, que explique
el porqué, que se pueda cerrar) y los faders (que entren en su fila, que no
pisen etiqueta ni porcentaje, que el mixer siga necesitando scroll).

El arrastre se prueba con `Input.dispatchMouseEvent`: un `input[type=range]` se
arrastra **dentro** del navegador y no responde a eventos sintéticos, así que
una prueba con `dispatchEvent` no habría detectado nada.

Comprobado contra el CSS anterior: falla con *«un fader mide 129 px dentro de una
fila de grilla de 96»*.

8 contratos estáticos nuevos, uno de ellos sobre el log: si el arranque vuelve a
escribirse sin versión, CI falla.

## Reversión

Estable previa: `v4.22.0`. Nada de esto toca el motor: es la barra de estado, un
aviso, y dos reglas de CSS.
