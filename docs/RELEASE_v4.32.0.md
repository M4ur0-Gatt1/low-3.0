# LOW v4.32.0 — LOW dejó de olvidarse de todo cada vez que lo abrís

Esta versión sale del plan maestro: A02, A03 y C02, más el B03 de Codex. La
cabeza de todo es un defecto de **pérdida de datos** que estuvo ahí siempre y que
sólo apareció al validar el arranque a mano.

## 1. LOW estrenaba almacenamiento vacío en cada arranque

`pywebview` viene con **`private_mode=True`** —el perfil del navegador embebido
es efímero, se tira al cerrar— y con **`http_port=None`**, así que la interfaz se
servía desde un **puerto al azar** cada vez. `localStorage` es **por origen**.
`main.py` no fijaba ninguno de los dos.

Reproducido con una clave testigo: escrita en `http://127.0.0.1:17446` y, tras
cerrar y reabrir, `{testigo: null, claves: 0}` en `http://127.0.0.1:61150`.

**Lo que se perdía en cada arranque**, todo guardado en `localStorage`:

- **El rescate ante caída.** Probado en la app real: un trazo sin guardar, matar
  el proceso, reabrir — no había documento, ni ofrecimiento, ni rastro de las
  claves de recuperación.
- **Los pinceles** (`low.brushes.v1`).
- **La disposición de paneles** (`low.2d.panelLayout`) y el espacio de trabajo.

Arreglado con `private_mode=False`, un `storage_path` propio bajo
`%APPDATA%/LOW/webview`, y **`LOW_UI_PORT = 47141`** fijo. El puerto se comprueba
con un `bind` **antes** de arrancar: si estuviera ocupado, LOW abre igual sin
fijarlo y lo deja dicho en el log, porque vale más abrir perdiendo la
persistencia que no abrir. No se reintenta *después* de `webview.start`, que
bloquea hasta que se cierra la ventana: reintentar ahí abriría una segunda.

Verificado: el testigo **sobrevive** a un cierre forzado y el origen es estable.

## 2. Y el rescate ante caída no se ofrecía en ningún lado

El ofrecimiento vive dentro de `dzDocInit`, que sólo corre al **crear o abrir**
un documento. Desde que LOW abre *sin* documento (v4.28.0), quien volvía después
de un cierre forzado veía un estudio vacío y **ninguna señal** de que su trabajo
estaba guardado.

Ahora la primera pantalla lo ofrece: «Quedó trabajo sin guardar en «*archivo*» ·
de hace 2 min», con su botón.

**Hay dos almacenes de rescate y el que sirve es el del documento.**
`LOW.workspace.recovery` guarda el SVG del lienzo cada 450 ms y tiene los
últimos trazos; `LOW.workspace.sceneRecovery` guarda el modelo de la escena en
momentos más gruesos y medido traía el **lienzo vacío** —189 bytes de página en
blanco— mientras el del documento traía el trazo. La invitación prefiere el del
documento y delega en `openDesign`, que compara con el disco y pregunta.

Probado de punta a punta en la app real: dibujar, matar el proceso, reabrir,
aceptar, y **vuelve el trazo** — 129 caracteres de geometría, idénticos.

## 3. Desde el estudio 2D no había manera de llegar al 3D

La única puerta al estudio 3D era el botón de la barra izquierda, y esa barra
queda **tapada** por `#designView`, que es `position:fixed; inset:0`. Medido con
`elementFromPoint`: con el 2D abierto, el punto medio de la pluma y del botón 3D
devuelve `#designView`. Mientras LOW abría en el lado programador no se notaba;
desde que el 2D es la primera pantalla, el 3D quedó sin entrada.

Ahora hay un botón **3D** al lado del de ✳ IA, en la barra del estudio. Y cambiar
de pantalla **cierra** el 3D: `#l3dView` está en z-index 62 contra el 61 del 2D,
así que mostrar el 2D sin cerrarlo dejaba al dibujante pidiendo volver al dibujo
y mirando otra pantalla.

Lo que **no** era un defecto, y estuve a punto de reportar: el estudio 3D sí
tiene salida propia —el botón «Volver» de su barra, que postea `low:close-3d`—.
Lo verifiqué en el bundle antes de abrir la boca.

## 4. El punto 2D deja de ser un control de una dimensión

El modelo guardaba `link.partner` con su eje desde `adb0dbc`, pero la interfaz
movía el tirador en **un** eje y escribía **un** canal: el «punto 2D» era un
control de una dimensión dibujado dentro de un cuadrado. Sirve para lo que tiene
que servir —la mirada de un ojo, la inclinación de una cabeza— sólo si un
arrastre mueve **los dos** canales.

Ahora los mueve, con dos guías cruzadas para que se lea como un plano, el socio
no se dibuja aparte (el del eje X dibuja el plano) y los dos canales van en
**una** transacción, porque `setRigControlValue` deja un paso por canal y si no
harían falta dos Ctrl+Z para un solo gesto.

Medido con arrastre asimétrico: `ejeX 0.591`, `ejeY −0.591`, **un** paso, dos
guías, y un Undo deshace los dos ejes.

## 5. B03 de Codex: la malla sale de `app.js`

Trabajo de Codex, protegido en `b152127`. El bloque `dzMesh*` se mudó a
`ui/rigging/mesh-ui.js` —`app.js` baja 142 líneas y su concentración pasa de
30,6% a **29,5%** del frontend—, la malla se resuelve por hueso influyente (con
el codo seleccionado no encontraba la malla portadora), la malla ya sigue la pose
provisional al arrastrar, hay bloqueos de pesos por vértice y suavizado vecinal,
y `.dz-mesh-overlay` dejó de heredar el `left/top` del 50% de la hoja SVG —que
hacía que un clic físico terminara editando el dibujo—.

## Pruebas

- **`check_arranque_recorrido_ui.js`, nueva y en CI** (A02): arranque, Nuevo,
  viaje a la IA y vuelta, ida al 3D por la puerta del estudio, «Volver» clickeado
  **dentro del iframe** por coordenada de ventana, la pluma con el 3D abierto, y
  dos documentos con cambio de pestaña. Todo con `Input.dispatchMouseEvent`.
- **`check_pantalla_inicial_ui`** siembra un punto de rescate antes de que corra
  la app y exige que la invitación lo ofrezca **nombrando el archivo**.
- **`check_rig_control_ui`** —el guard de Codex— con cuatro aserciones nuevas
  para el punto 2D.
- **12 contratos estáticos nuevos**, todos verificados contra su violación.

## Dos defectos de mis propias pruebas, que valen más que el código

**Un guard que apunta con desplazamientos en píxeles no distingue nada.** Los dos
ejes del punto 2D salían `1` y `1` —saturados— porque al zoom de trabajo unos
pocos píxeles de pantalla son muchas unidades del lienzo. Con los dos valores
iguales, un error que escriba el mismo valor en ambos canales pasaba
desapercibido. Ahora se apunta a una **coordenada del dibujo** y se exige que los
dos valores sean **distintos**.

**Y un `pointerId` que nunca existió hace fallar `setPointerCapture` en
silencio**, así que el arrastre no arranca y la prueba culpa al producto.

## Una conclusión que me guardé de sacar

En una corrida el rescate restauró un lienzo vacío y parecía un defecto del
producto. No lo era: mis propias corridas habían dejado puntos de rescate más
**nuevos** y vacíos, y LOW restauró correctamente el más reciente. Se limpió el
almacén, se repitió, y el trazo volvió.

## Lo que esta versión NO certifica

Codex había dicho «congelo tras mutaciones y pruebas finales» y no llegó a
avisar. Su B03 pasa la puerta completa —las tres suites del rig, los contratos,
el presupuesto y sus tres guards de navegador—, pero **sus pruebas finales no
corrieron**. Se publica porque el defecto de pérdida de datos pesa más que
esperar, y porque Mauro pidió avanzar sin bloquear.

Puerta completa en verde: 50 comprobaciones, más `check_rig_control_ui` y
`check_3d_studio_ui`.

## Reversión

Estable previa: `v4.31.0`. El arreglo del almacenamiento es el bloque de
`webview.start` en `main.py`; el resto vive en módulos propios
(`ui/application/pantalla-inicial.js`, `ui/rigging/rig-control-ui.js`,
`ui/rigging/mesh-ui.js`).
