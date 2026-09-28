# LOW v4.34.0 — con el encuadre de cámara puesto no se podía dibujar

Esta versión sale de un accidente útil: fui a arreglar una prueba que fallaba y
el que estaba mal era el producto. Trae además el trabajo de Codex de la tanda
de herramientas de dibujo, que él dejó terminado y sin publicar.

## 1. El encuadre de cámara se comía el dibujo de toda la mesa

`#dzCam` —el encuadre animable— es un **div transparente** de 1011×568 px
medidos, con `cursor:move` y sin `pointer-events` propio. Tapa prácticamente
toda la mesa de trabajo.

La cámara es un **modo**, y mientras es la herramienta activa el encuadre
*tiene* que agarrarse: así se mueve el plano, y el aviso de la app lo dice. El
problema estaba después. Al elegir el lápiz, `camMode` sigue encendido y el
encuadre sigue a la vista —que es lo deseable: uno quiere ver el plano mientras
dibuja—, pero el marco **seguía agarrando el puntero**.

Medido en el mock: con el encuadre puesto y el lápiz elegido, **ningún trazo
entraba** y cada intento **movía la cámara**, de (68,191) a (132,215). Y cada
cambio de cámara **deja clave en el cuadro**, así que intentar dibujar corría el
plano de la escena y lo dejaba anotado en la línea de tiempo. Nada avisaba nada.

Ahora el encuadre agarra el puntero sólo con `#dzCanvas[data-tool="camera"]`.
`dzCamToggle` escribe `DZ.tool` a mano sin pasar por `dzSetTool`, así que ahora
sincroniza también el atributo que lee el CSS: sin eso la cámara quedaría
**inmóvil**, y ésa es una de las tres mutaciones que se verificaron.

## 2. Y los tiradores de la selección se comían las herramientas vectoriales

Con un trazo **seleccionado**, un tirador de la caja tapa la línea. Apretar ahí
**redimensionaba la selección** en vez de bombear, planchar, cortar o deformar
—y la herramienta contestaba «acercate más a una línea» estando justo encima—.

Afecta a las siete herramientas que trabajan sobre el dibujo y conservan la
selección: bomba, plancha, pinza, imán, inflador, balde y cuentagotas. Para
seleccionar y editar por nodos los tiradores siguen vivos, que es su razón de
ser. Y `dzPickStroke` mira ahora **a través** de la UI flotante en vez de
creerle al elemento de arriba, que es la causa raíz compartida de los dos
defectos.

## 3. La ayuda no llegaba justo a las herramientas que nadie conoce

El cajón de herramientas secundarias (`#dzToolsDrawer`) se cuelga del `body`, no
de `#designView`, y la ayuda al pasar el puntero buscaba sólo dentro de
`#designView`. Resultado: las únicas herramientas **sin** ayuda eran bomba,
plancha, pinza, imán, inflador, pivote y espejo — exactamente las que uno no
puede adivinar. Medido: el globo salía en la barra y no salía en el cajón.

## 4. El trabajo de Codex: texto, bomba de grosor, esquinas e inspector

Terminado por él y publicado acá con crédito (commit `d77ea3f`):

- **Texto en la hoja**: se pone donde se hace clic y se edita antes de
  aplicarlo; Escape cancela sin dejar rastro; doble clic reedita.
- **Bomba de grosor** sobre los tres tipos de trazo: forma entintada, pincel por
  muestras y pincel de sellos.
- **Editor de esquinas**, **inspector de elemento** y la **ayuda** de la barra.
- La geometría del balde sale de `app.js`, que **baja 211 líneas**.
- Y su parche anterior: seleccionar un dibujo ya no genera un paso de Undo
  fantasma.

## Pruebas

- **`check_camara_encuadre_ui.js`, nueva y en CI**: prueba las **dos mitades** de
  la regla, y se prueban juntas a propósito, porque apagar el encuadre entero
  pasa una y rompe la otra. Tres mutaciones verificadas: sin la regla falla «no
  se puede dibujar», sin el atributo falla «la cámara queda inmóvil», y con el
  encuadre apagado siempre falla «no hay manera de encuadrar».
- **`check_drawing_workflow_ui.js` de Codex**, completado y **cableado en CI**:
  no estaba en `build.yml`. Tampoco `check_color_studio_ui` en la puerta local.
- **Cinco contratos estáticos nuevos** (261 en total), los cinco verificados
  contra su violación.
- Puerta completa: **12 suites de modelo, 7 comprobaciones de puente y 37
  recorridos de navegador. 0 fallos.**

## Dos defectos de la prueba ajena, que son los que destaparon todo

No reescribí la prueba de Codex: la completé, y las dos trampas valen anotarse.

**Un botón dentro de un cajón cerrado devuelve un rectángulo de 0×0**, y el clic
termina en la barra de menú sin que nadie se queje. La prueba apretaba la bomba
sin abrir el cajón con el `⋯`.

**Y `[data-tool="handler"]` matchea dos cosas**: el botón de la barra y el
**seguidor del cursor** dentro de `#dzCanvas`, que hereda ese atributo y va antes
en el documento. `querySelector` devolvía el del lienzo. Ahora dice
`button[data-tool="handler"]`.

## Lo que esta versión NO certifica

El **editor de esquinas** y el **inspector de elemento** de Codex quedan
marcados **sin verificar** en el inventario: son suyos, están en el producto y
no tienen recorrido propio. Y sigue sin ninguna prueba la **exportación de
animación (MP4/PNG)**, que es el agujero que el inventario de A01 señaló como el
siguiente y el que se nota más, porque falla al final del trabajo.

## Reversión

Estable previa: `v4.33.0`. Los tres arreglos de puntero son una regla de CSS en
`ui/app.css` (`.dz-cam`), una regla más para `.dz-sh`, una línea en
`dzCamToggle` y una línea en `dzPickStroke`, todo en `ui/app.js`. Lo de Codex
vive en módulos aparte (`ui/drawing/text-tool.js`, `ui/vector/brush-width.js`,
`ui/panels/corner-editor.js`, `ui/panels/element-inspector.js`,
`ui/panels/tool-help.js`, `ui/drawing/fill-geometry.js`).
