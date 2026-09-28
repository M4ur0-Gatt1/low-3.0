# LOW v4.35.0 — la exportación perdía cuadros y corría el timing

Esta versión cierra el agujero que el inventario de capacidades (A01) había
marcado como el siguiente: **la exportación de animación no tenía ninguna
prueba**. Al escribirla aparecieron tres defectos, y los tres son de los que se
notan al final del trabajo, cuando ya no se puede revisar.

**Incluye todo lo de v4.34.0**, cuya compilación quedó en rojo por un defecto de
una prueba —no del producto—; está explicado abajo.

## 1. Un cuadro en blanco desaparecía del export

El exportador hacía esto:

```js
let txt = dzCuadroSvgTexto(f);
if (!txt) continue;                    // cuadro vacio: se saltea
```

Medido con cinco cuadros —contenido en 1, 2, 4 y 5, el **3 vacío**— el puente
recibía **cuatro** PNG, y la app informaba, contradiciéndose sola:

> Exportado export/prueba (4 PNGs) · **4 cuadros (F1 a F5)**

Para una animación eso no es un cuadro de menos: **todo lo que sigue al hueco se
adelanta un cuadro**. El timing es la materia del oficio y se rompía en
silencio. Y un cuadro en blanco no es un error: un parpadeo, una entrada después
de un tiempo muerto o una pausa sobre nada son cuadros vacíos **a propósito**.

Ahora el hueco se dibuja: un cuadro del tamaño de la escena **con el papel
puesto**. Con el papel, no transparente: un PNG transparente lo rellena el codec
con negro y el hueco aparece como un fogonazo en el MP4 y en el GIF. El papel se
toma del lienzo vivo, la misma fuente que usa el balde para saber cuál es el
fondo.

## 2. Y si un cuadro se perdía de verdad, no lo decía

Quedan dos maneras de perder un cuadro —que falle la rasterización, o que no se
pueda leer el archivo en el camino viejo— y las dos salían informadas **como si
todo hubiera salido bien**. Ahora el aviso dice cuántos faltan y qué significa:
que la animación sale más corta y lo que sigue al hueco se adelanta. Los dos
caminos de exportación lo dicen.

## 3. La secuencia PNG se desordenaba a partir de los 1000 cuadros

El relleno de ceros era fijo en tres dígitos, así que con 1000 cuadros —**42
segundos a 24 fps**, nada raro— `escena_1000.png` se ordena **antes** de
`escena_999.png` y la secuencia entra desordenada al montaje. Ahora el relleno
se calcula por la cantidad de cuadros, con tres dígitos como mínimo para no
cambiarle el nombre a las exportaciones cortas de siempre.

Y en el mismo lugar apareció otro: **exportar una toma corta después de una
larga dejaba los cuadros viejos**. Se exportan 1000 cuadros, se corrige, se
exporta un tramo de 10 — y en la carpeta quedan los 990 de la versión anterior,
que el importador se lleva pegados atrás. Ahora la exportación PNG limpia los
cuadros de la toma anterior de ese mismo documento antes de escribir.

## 4. Lo que venía de v4.34.0

Esa versión no llegó a compilar. Va entera acá:

- **Con el encuadre de cámara puesto no se podía dibujar** en toda la mesa: el
  marco es un div transparente de 1011×568 px que se llevaba cada trazo, y cada
  intento **movía la cámara** —que deja clave en el cuadro—, así que dibujar
  corría el plano de la escena.
- **Los tiradores de la selección** se comían las siete herramientas que
  trabajan sobre el dibujo, que contestaban «acercate más a una línea» estando
  justo encima.
- **La ayuda al pasar el puntero** no alcanzaba el cajón, así que las únicas
  herramientas sin ayuda eran las que nadie conoce de memoria.
- El trabajo de Codex: **texto en la hoja**, **bomba de grosor** sobre los tres
  tipos de trazo, editor de esquinas, inspector de elemento, y la geometría del
  balde fuera de `app.js`, que baja 211 líneas.

## Pruebas

- **`check_export_anim_ui.js`, nueva**: el botón de la timeline abre el modal
  con las cinco salidas, elegir «Secuencia PNG» llama al puente una vez, los
  cinco cuadros llegan aunque uno esté en blanco, el hueco trae el papel, y si
  se pierde un cuadro el aviso lo dice — esto último con una falla de
  rasterización **inyectada a propósito**. Tres mutaciones verificadas.
- **`check_export_anim_backend.py`, nueva**: las promesas del puente, con PNG
  armados a mano byte por byte para no depender de Pillow. Cubre secuencia
  intacta, nombres ordenables, limpieza de la toma anterior, cuadro corrupto sin
  dejar media secuencia en disco, MP4, GIF y spritesheet. Donde falta `ffmpeg` o
  `Pillow` se comprueba que el mensaje **nombre la alternativa que sí funciona**,
  porque un «error» a secas al final de una exportación larga es perder el
  trabajo. Cuatro mutaciones verificadas.
- **Seis contratos estáticos nuevos** (267 en total).
- Puerta completa: **12 suites, 8 comprobaciones de puente y 38 recorridos. 0
  fallos.**

## Por qué v4.34.0 quedó en rojo, y qué se aprendió

Falló `check_drawing_workflow_ui` —el recorrido de Codex— en «Texto no se
aplica», y **sólo en CI**: acá pasaba. La causa no era el producto sino el
recorrido, en dos capas:

**Su ayudante de clic no movía el puntero antes de apretar.** Sin el
`mouseMoved` previo, Chromium entrega el `mousePressed` sin que el destino se
haya enterado del puntero: el clic aterriza de manera inconsistente, el cursor
no entra al cuadro de texto y `Input.insertText` —que escribe en el elemento
enfocado— no aterriza en ninguna parte. Entonces «Aplicar» no aplicaba nada,
porque no había nada que aplicar, y la prueba acusaba al producto.

**Y no esperaba en ningún paso**, así que en una máquina más lenta que la mía la
carrera se perdía siempre. Ahora espera condiciones, no tiempos, y **comprueba
que lo tecleado llegó** antes de apretar Aplicar: así la próxima vez el mensaje
dice cuál de las dos cosas falló.

Se verificó además que el producto está bien: midiendo con un clic completo, el
cuadro de texto abre con el cursor adentro y lo tecleado aterriza, las dos
veces. Esa comprobación quedó como **aserción** del recorrido —no como muleta—
para que un cuadro de texto que abra sin cursor lo agarre la puerta.

## Lo que esta versión NO certifica

La exportación a **Premiere** sigue **parcial**: su XML tiene suite de modelo,
pero ningún recorrido de navegador toca el camino desde el menú. El **editor de
esquinas** y el **inspector de elemento** de Codex siguen sin recorrido propio.

## Reversión

Estable previa: `v4.33.0` (v4.34.0 no llegó a compilar). El arreglo del cuadro
en blanco vive en `ui/animation/export-cuadros.js` y en dos líneas de
`dzDoExportDoc`; el del orden y la limpieza de la secuencia, en `export_anim` de
`main.py`.

---

## Apéndice — v4.35.1: por qué v4.35.0 tampoco compiló, y qué destapó

v4.35.0 volvió a quedar en rojo en el mismo recorrido, ahora en otro punto:
pasaba el tecleo —el arreglo del `mouseMoved` funcionó— y fallaba en «Aplicar no
dejó el texto en la hoja», otra vez **sólo en CI**.

Esta vez el que estaba mal era el producto, y el defecto es feo: **si el lienzo
se repinta mientras estás escribiendo un texto, todo lo tecleado se tira sin
decir nada.** La edición se ataba al nodo `<svg>` que había cuando se abrió la
caja, y cada repintado —un cambio de contenido, el papel cebolla, un compañero
de equipo— **reemplaza** ese nodo: el vigilante lo veía desconectado y cancelaba
la edición a mitad de la frase.

Reproducido acá reemplazando el nodo del lienzo: la caja desaparece y «Aplicar»
no aplica nada. Arreglado en `ui/drawing/text-tool.js`: la hoja se resuelve
**viva** al aplicar, y el vigilante cancela por lo que de verdad invalida un
texto a medio escribir —cambiar de documento o de cuadro—, no por un repintado.
Si se estaba editando un texto que ya existía y el repintado se llevó ese nodo,
ahora **se avisa** en vez de perderlo en silencio.

Queda cubierto por un paso nuevo del recorrido —verificado contra su violación—
y por dos contratos. Y el recorrido informa el estado completo cuando algo no
llega a tiempo, para no gastar una vuelta entera de compilación en adivinar cuál
de las dos cosas se rompió.

**Una última trampa, mía:** mi primer diagnóstico local dio «no se reproduce»
porque el navegador estaba corriendo el módulo **viejo**. `Network.setCacheDisabled`
no hace nada si antes no se llamó a `Network.enable`, y la sonda no lo llamaba.
Es la trampa número uno del arnés y me la comí igual.

## Apéndice — v4.35.2: la prueba miraba una hoja muerta

El diagnóstico que se agregó en v4.35.1 contestó en la primera vuelta. La
compilación falló otra vez en el mismo punto, pero informando el estado:

```
{"sesion":false,"caja":false,"doc":true,"cuadro":1,"hojaViva":true,
 "textos":1,"aviso":"Texto aplicado · doble clic para editar · Ctrl+Z para deshacer"}
```

**`textos: 1` y «Texto aplicado»**: el producto había hecho su trabajo. Lo que
estaba mal era la prueba, que guardaba el nodo `<svg>` del montaje en una
variable y buscaba el texto ahí. Como CI **sí** repinta el lienzo —el nodo se
reemplaza—, la prueba miraba una hoja muerta mientras el texto estaba en la
viva.

Eso confirma además que el arreglo de v4.35.1 era necesario y correcto: en el
mismo entorno donde antes la edición moría, ahora sobrevivió al repintado y se
aplicó.

Ahora el recorrido resuelve la hoja **cada vez que la mira**, en vez de
acordarse de cuál era.
