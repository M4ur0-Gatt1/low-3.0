# LOW v4.31.0 — la forma es una línea, y la línea se puede doblar

Pedido de Mauro, tres cosas en una:

> Quiero que cuando dibujo una forma en LOW 2D lo que dibuje primero por defecto
> sea una forma sin relleno, sólo contorno. Y quiero que se le pueda poner un
> pincel como forma de la línea de contorno. Y que la forma se pueda deformar
> libremente, imitando y mejorando las herramientas que tiene Moho para hacer
> ese tipo de dibujo. Actualmente dibuja rellenos rojos.

Las tres están, y están hechas para **componer**: una forma nace como línea, la
línea se entinta con el pincel, y al deformarla el pincel se rehace sobre la
curva nueva.

## 1. La forma nace sólo con contorno

Antes salía un bloque rojo macizo: `fill` con el color de relleno y **ningún**
`stroke`. En una mesa de animación eso es al revés de lo que se necesita —
primero la línea, el relleno después si viene.

Ahora nace con `fill="none"` y con el trazo y el grosor que estés usando. En el
menú de formas hay una casilla **Rellenar** para cuando la querés maciza, y se
recuerda entre sesiones. El interruptor está en el menú de la herramienta y no en
el inspector a propósito: es una propiedad de **cómo va a nacer la próxima**, no
del elemento que ya está en la mesa.

## 2. El contorno se dibuja con el pincel

Casilla **Contorno con pincel** en el mismo menú, y un botón **Entintar la
selección** para lo que ya está dibujado. El contorno pasa a ser un trazo de
pincel de verdad —punta, presión, dureza, textura—, el mismo que sale del lápiz,
en vez de una línea de grosor constante.

La forma entintada queda así:

```
<g data-low="forma-pincel" data-d="M…Z" data-relleno="none"
   data-trazo="#1a1a1a" data-pincel="<id>" data-grosor="6">
  <path data-rol="contorno" …/>
</g>
```

**Dos decisiones, y las dos son para que la deformación funcione:**

- **La geometría se guarda** (`data-d`). Los hijos son un *render*, no el dato.
  Sin guardar la figura, deformar sería deformar tinta sin saber qué era.
- **El pincel se guarda por id y con su grosor.** Si al re-dibujar se leyera el
  pincel actual, deformar una forma le cambiaría el trazo por el que tengas
  elegido en ese momento. El trazo es de la forma, no de la barra. Para eso
  `dzBrushFinalElement` aprendió a recibir un pincel explícito.

## 3. Deformación libre: la jaula de puntos

Menú **Capa → Deformar libremente (jaula de puntos)**. Aparece una rejilla sobre
el dibujo; se arrastran los puntos y el dibujo sigue.

**No se inventó la matemática.** La deformación es `rigMalla` —interpolación
bilineal entre la rejilla en reposo y la posada—, la misma que ya dobla los
dibujos del esqueleto, y ya estaba exportada en `LOW.animation`: la fui a
exportar creyendo que hacía falta y no hacía. La aplicación es
`dzDeformarElemento`, que ya sabía recorrer los subpaths con `data-defbase` para
que deformar no se acumule sobre lo ya deformado.

**Tres cosas en las que esto mejora a Moho:**

1. **La jaula queda.** Se guarda en el dibujo (`data-warp`), así que mañana
   agarrás el mismo punto y seguís corrigiendo. No es una transformación que se
   aplica y se va.
2. **Se puede reponer**, entera o de a un punto (doble clic en el punto). Nunca
   hace falta deshacer diez veces para volver al dibujo original.
3. **La densidad se cambia sin perder lo hecho.** Pasar de 3×3 a 5×5 fija lo
   deformado como nuevo reposo y arma la rejilla encima: se empieza con el gesto
   grueso y después se afina, que es como se dibuja.

Y **un tirón es un solo Ctrl+Z**. Eso costó trabajo: hay dos historiales —el del
lienzo y el del documento, que vuelca con 260 ms de retardo— y sin transacción un
tirón medía **dos pasos**. Es el mismo arreglo que necesitó el editor de nodos.

## Lo que costó, y queda escrito

**`window.DZ` no existe, y me morfó por tercera vez.** `DZ` es `const` en
`app.js`: leerlo como propiedad de `window` da `undefined` **en silencio**. La
jaula decía «elegí un dibujo» con el dibujo elegido. Ahora hay un contrato que lo
busca en **los 92 módulos** del árbol, `api` incluido.

**Un contrato con un byte invisible pasaba en verde con la violación puesta.** El
patrón nuevo lo escribí con un heredoc y `\b` se convirtió en un **byte de
retroceso de verdad** (0x08): el regex pedía un carácter invisible después de
`DZ` y no podía coincidir nunca. Lo encontró `cat -A`, no el ojo. Esa
comprobación ahora busca texto y no usa expresiones regulares, justamente para
que no haya escapado que se pueda arruinar.

**Reponer devolvía una copia, no el original.** Pasar la geometría por la malla
en reposo la re-muestrea: un rectángulo queda convertido en una polilínea de
trescientos puntos, idéntica al ojo y distinta como dato. Con la jaula en reposo
ahora se restaura la geometría guardada, tal cual.

**Y una corrección sobre mi propio diagnóstico.** Creí que entintar rompía el
Ctrl+Z porque dejaba la forma pelada en la mesa, y no era eso: era el montaje de
mi propia prueba, que vaciaba el lienzo sin sincronizar el modelo. La línea que
puse por ese motivo se queda —cancelar el volcado pendiente al empezar el gesto
es correcto, la previsualización no es una edición— pero **no la vi fallar**, y
así está anotada en el código.

## Pruebas

- **`check_warp_cage_ui.js`, nueva y en CI.** Recorre la jaula sobre una forma
  simple y sobre una entintada: que aparezca, que arrastrar cambie la geometría
  *de verdad* y no sólo la vista, que la jaula quede guardada y se pueda
  reabrir, que Reponer devuelva el original, que la densidad no pierda lo hecho,
  que sea **un** paso de historial, que Escape salga sin cerrar el módulo, y que
  el contorno entintado **siga siendo tinta** después de deformar.
- **`check_shape_tool_ui.js` ampliado** con el contorno sin relleno, la casilla
  Rellenar, el contorno con pincel y el botón de entintar.
- **11 contratos estáticos nuevos**, cada uno verificado contra su violación con
  un arnés que muta el código a propósito. Ese arnés encontró **cinco contratos
  flojos míos** —uno que mordía su propio comentario, dos que encontraban una
  mención en vez del uso— y un error real: había duplicado un export.

Y una **falsa alarma que valió el arreglo**: la puerta empezó a acusar que el
panel del storyboard tapaba el escenario. No era cierto — fallaba también contra
el árbol de la versión anterior, que estaba verde dos horas antes—. El motivo:
ese recorrido **no fijaba su ventana** y heredaba el tamaño con que hubiera
quedado el navegador; en mi máquina eran 764×485 y a ese ancho el panel tapa de
verdad. Ahora fija 1366×768, que es lo que usa CI, así que ya no puede pasar ni
fallar por accidente del tamaño de la ventana.

Puerta completa en verde.

## También va en esta versión: el salto del estudio 3D

Trabajo de Codex, congelado en `db6f7ed` y `a6643b8` y con su propia guardia en
CI: la interfaz pasó de **58 a 22 botones** iniciales, los cuatro paneles
flotantes se volvieron un riel de herramientas y un inspector contextual, la
órbita ortogonal orbita de verdad, los campos de texto ya no disparan Delete ni
Undo sobre la escena, y el tema oscuro se aclaró a gris carbón. El alcance y su
validación están en `docs/LOW_ESTUDIO_3D_UX.md`.

## Reversión

Estable previa: `v4.30.0`. Las tres partes son independientes: la forma sin
relleno es una línea en `ui/panels/shape-tool.js`; el pincel del contorno y la
jaula son módulos propios (`ui/drawing/forma-pincel.js`,
`ui/vector/warp-cage.js`) y quedan inertes si se saca su `<script>`.
