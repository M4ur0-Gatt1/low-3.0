# LOW v4.36.0 — el documento de animación ya es un archivo

Mauro preguntó si ya existían los archivos `.low`. Se midió su workspace y la
respuesta fue peor que un «no»:

> **157 dibujos sueltos `diseno_*.svg` —138 de ellos en blanco, de 323 bytes— y
> CERO archivos `.low`.**

El formato propio del programa no lo estaba usando nadie. Esta versión arregla
las dos razones, y la segunda era **pérdida de datos**.

## 1. «Nuevo documento» creaba un dibujo suelto, no una escena

`dzDocumentNew()` llamaba a `api.new_design()`, que escribe un
`disenos/diseno_<fecha>.svg` —un dibujo suelto— y recién después armaba la
escena **en memoria**. O sea que la escena, con sus capas, sus exposiciones, su
rig, su cámara y su audio, sólo llegaba al disco si uno se acordaba de guardar y
además pasaba por el diálogo. Mientras tanto, cada arranque dejaba un SVG vacío
tirado en la carpeta: esos son los 138.

Ahora el documento **nace siendo su archivo**. Se escribe
`disenos/escena_<fecha>.low` antes de mostrar nada, `DZ.doc.path` apunta ahí, y
**Ctrl+S guarda en ese archivo sin preguntar**. No se crea ningún SVG suelto.

Dos documentos creados dentro del mismo segundo no se pisan: el puente esquiva
el nombre repetido, porque si no el segundo «Nuevo documento» borraría el
trabajo del primero.

## 2. Y abrir un `.low` lo dejaba en blanco

Este es el que explica por qué el formato no se usaba aunque existiera.

Dentro de `#dzCanvas` hay otros `<svg>` que son **hijos directos**: la hoja de
rotoscopía, la del esqueleto y la de la malla. Vienen en el HTML, así que van
**antes**. Y todo el editor busca el dibujo con `querySelector(":scope > svg")`
—el primero—, mientras que la hoja del dibujo sólo la creaba `openDesign` al
abrir un `.svg`.

Resultado, medido: abrir un `.low` **sin haber abierto antes un `.svg`** —que es
exactamente lo que ofrece la primera pantalla— escribía el dibujo dentro de la
hoja de **rotoscopía**, que está oculta. No se veía nada. Y el primer
`dzDocCommit()` leía el lienzo vacío y **escribía ese vacío encima del
documento**: el archivo quedaba en blanco en memoria, y un Ctrl+S lo dejaba en
blanco en el disco.

La traza que lo delató:

```
dzCanvasSet  → largo 145 · habiaSvg true · ok true
dzDocCommit  → dibujoAntes 145 · lienzo 0
```

Ahora el lienzo **asegura su hoja de dibujo** antes de pintar, y la inserta
donde la pone `openDesign`, así los dos caminos dejan el lienzo igual. Arreglado
en `dzDocUse`, que es por donde pasan tanto el documento nuevo como el que se
abre.

## Pruebas

- **`check_escena_nueva_ui.js`, nueva y en CI**: aprieta «Nuevo documento» con
  un clic de verdad en la invitación de la primera pantalla y exige que el
  archivo exista, que sea `.low`, que el documento apunte a él, que **no** se
  siembre un SVG suelto, que lo escrito sea la escena de verdad —nivel, capa y
  dibujo 1 con su papel—, y que Ctrl+S guarde en ese archivo **sin diálogo**.
  Después abre un `.low` con un trazo adentro y exige que se vea y que el commit
  siguiente **no lo vacíe**.
- **`check_escena_nueva_backend.py`, nueva y en CI**: el archivo aparece en
  `disenos/`, se escribe **byte por byte** como se mandó, dos documentos
  seguidos no se pisan, un pedido vacío no crea un `.low` de cero bytes —que
  parecería trabajo guardado y no lo es—, y la interfaz se entera para refrescar
  el árbol.
- **Ocho contratos estáticos nuevos** (275 en total), todos verificados contra
  su violación.
- Puerta completa: **12 suites, 9 comprobaciones de puente y 39 recorridos. 0
  fallos.**

## Comprobado en la app real, no sólo en el mock

Se abrió LOW de verdad con CDP y se apretó «Nuevo documento»:

```
C:\Users\Mauro\Downloads\disenos\escena_20260912_181857.low   4066 B
formato: lowscene · capas: 1 · dibujos: 1
```

Después se dibujó un trazo y se guardó: el trazo quedó **adentro de ese mismo
archivo** (260 bytes de geometría) y el aviso dijo «Escena guardada». SVG
sueltos creados ese día: **0**.

## Lo que esta versión NO cambia

Los 157 SVG que ya están en `disenos/` siguen ahí y se siguen abriendo: una
versión nueva no toca los archivos de antes. Y el camino viejo —abrir un `.svg`
y trabajarlo— sigue existiendo igual; lo que cambió es con qué nace un documento
nuevo.

## Reversión

Estable previa: `v4.35.2`. Todo lo nuevo vive en `ui/animation/escena-nueva.js`
y en el `new_scene` de `main.py`; en `app.js` son dos líneas: la delegación de
`dzDocumentNew` y la llamada a `dzHojaDeDibujoAsegurar` dentro de `dzDocUse`.

---

## Apéndice — v4.36.1: el error que estaba en tu propio log

Revisando `%APPDATA%\LOW\low.log` apareció un error real, del 10/9 a las 20:19,
con la v4.33.0 instalada y una escena sin guardar abierta:

```
[js] Uncaught TypeError: Cannot read properties of null
     (reading 'querySelector') @app.js?v=4.33.0:276
```

Es el menú «Copiar» del chat. La línea 276 pedía el foco del primer botón dentro
de un `requestAnimationFrame`, leyendo la variable `ctxMenu`. Pero ese menú **se
cierra solo**: `closeCtxMenu` está enganchado a `click`, a `scroll` en captura y
a `blur`, y el chat **se autodesplaza cada vez que llega una respuesta**. Si el
menú se cierra antes del cuadro siguiente, la variable ya es `null` y el callback
revienta.

Reproducido acá con el mismo mensaje antes de tocar nada. El arreglo es que el
callback mire **su** menú —el que acaba de crear— y no la variable, que para
entonces puede ser otra cosa.

Queda cubierto por `check_menu_contextual_ui`, que prueba **las dos mitades**:
que cerrarlo en el mismo cuadro no tire nada, y que abierto siga tomando el foco
—porque sacar el `requestAnimationFrame` pasaría la primera prueba y rompería el
teclado sin que nadie se entere—. Las dos verificadas contra su violación.

LOW guarda estos errores solo: `%APPDATA%\LOW\low.log` y un reporte por fallo en
`%APPDATA%\LOW\fallos\`, con la escena, la herramienta y el último comando.
