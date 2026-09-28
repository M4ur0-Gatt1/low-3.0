# LOW v4.51.0 — del storyboard al animatic, y Storyboarder entra en LOW

Cuatro cosas. La primera responde a un pedido directo: *«la idea era copiar el
sistema de Storyboarder, con un generador de puesta de cámara y monigotes 3D
para manipular; quizá lo mejor sería poder importarlo directamente de ahí»*.

---

## 1. Importar proyectos de Storyboarder

Storyboard → **Importar Storyboarder** → elegís el `.storyboarder`. La puesta
con monigotes posables se hace en el Shot Generator de Storyboarder y se trae
acá; no se rehace.

**Una aclaración que cambió el plan: Storyboarder no es software libre.** La
v3.0 está bajo una licencia comercial de Wonder Unit, y la anterior era «MIT
más excepciones», sin distribución comercial de terceros. LOW es público y se
distribuye, así que no tiene nada de su código ni de sus modelos 3D: sólo **lee
el formato** de sus archivos (un JSON y la carpeta `images/`), que es
interoperabilidad.

De cada panel se trae:

- **La imagen, aplanada como la ve Storyboarder**: las capas en su orden y el
  calco *debajo* del dibujo con su opacidad (75 % si el archivo no la dice). Si
  el panel no tiene capas, su posterframe.
- **La duración**, de milisegundos a cuadros de *tu* escena, conservando los
  segundos.
- La toma («1A») como nombre, el diálogo, la acción y las notas.
- **El Shot Generator completo** —cámara, personajes y la rotación de cada
  hueso— queda guardado en el panel. LOW todavía no lo usa, pero no se pierde
  al guardar ni al reabrir.

Importar es **un solo Deshacer**. Y lo que no entró se dice al terminar, no se
calla: paneles sin imagen, archivos que faltan en `images/`, audio.

**Todavía no se trae:** el audio de cada panel (LOW tiene una pista por
escena; por ahora se carga con Animación → Cargar audio) ni la cámara del Shot
Generator traducida al generador de tomas de LOW.

MEDIDO con proyectos reales de Storyboarder en tres versiones del formato
(0.7, 1.3 y 2.0.1): capas en orden, el dibujo principal de los proyectos
viejos (que vive en otro lugar del archivo) y el Shot Generator de su ejemplo.

## 2. Del storyboard al animatic

Traído del trabajo de Codex del 26-sep (que había quedado en una rama vieja,
siete versiones atrás):

- **Capturar dibujo**: el cuadro actual queda como imagen del plano, *dentro*
  de la escena. Se deshace.
- **Crear animatic**: abre **otra escena** con un dibujo por plano, expuesto
  exactamente su duración, y el rango de salida igual a la suma. El storyboard
  original sigue en su pestaña. Si a un plano le falta la imagen, se niega y
  dice cuál: un animatic con huecos no sirve para juzgar el ritmo.
- **Duplicar** plano, **Nombre** y **Notas** por plano, y elegir planos con el
  teclado.
- Anotar un plano ya no repinta el dibujo.

**La barra del panel queda fija arriba.** Con el generador abierto, el panel
scrolleaba y dejaba a la vista campos sueltos, sin + Panel, Capturar ni
Animática. Así no había forma de entender el flujo.

Quedaron afuera, a propósito, dos piezas de esa rama: un visor propio que
reproducía con `requestAnimationFrame` (se congela con la ventana en el otro
monitor; el panel ya tiene ▶ Animática sobre el reproductor de la escena) y un
arreglo del encuadre de cámara que main ya tenía desde la v4.44.

## 3. El audio con desfase sonaba adelantado

Con un desfase **positivo** (el audio entra más adelante en la escena), darle
play desde el cuadro 1 lo hacía sonar **desde el cuadro 1**. Ahora espera a su
cuadro de entrada, y el scrub antes de esa entrada es silencio. El animatic se
lleva el audio con su propio desfase: retimarlo allá no mueve el original.

## 4. Cut-out: la primera pose no se pierde, y el papel cebolla ve poses

Lo que la v4.50.0 dejó anotado como «lo que sigue»:

- **La primera pose ya no se destruye.** Con una sola clave en el cuadro 8, el
  cuadro 1 se movía los mismos 55 px. Toon Boom Harmony te pide poner a mano
  una clave en el cuadro 1; acá se pone sola al clavar la primera pose de un
  hueso fuera del 1, y se avisa. Si el hueso ya tenía claves, no se toca.
  MEDIDO: el cuadro 1 se mueve **cero** píxeles.
- **Papel cebolla en cut-out.** Con el personaje sostenido, la cebolla no
  mostraba nada: compara dibujos, y en cut-out el dibujo es el mismo en todos
  los cuadros. Ahora muestra la **pose** de los cuadros vecinos, sin `id` (si
  no, el rig posaba al fantasma) y sin capturar el puntero.

## Además

- Proveedor de IA **StepFun** (compatible con OpenAI, endpoint internacional).

## Guardias

- `check_storyboarder_import_backend.py` — proyecto sintético en disco: orden
  de capas, calco al 75 %, formato viejo, posterframe, faltantes y que una capa
  con ruta no lea fuera de `images/`.
- `check_storyboarder_import_ui.js` — clic real; mide el **pixel** (calco
  debajo al 50 % sobre papel blanco da rosa), Undo único, Crear animatic
  habilitado después, y la barra alcanzable con el panel scrolleado.
- `check_storyboard_workflow_ui.js` — capturar, Undo/Redo, duplicar, animatic
  en otra pestaña con los cortes correctos y el original intacto.
- `check_primera_pose_ui.js`, `check_cebolla_poses_ui.js`.
- `run_storyboard_tests` +25: animatic, audio con desfase y la **ida y vuelta
  por archivo** del Shot Generator importado.

Todos probados al revés: fallan sin el arreglo. Puerta local: 28 suites y
puentes + 71/71 recorridos. `app.js` sin tocar (17.075 líneas, en el techo).

## Lo que sigue, con evidencia

- Audio por panel de Storyboarder → una pista de escena.
- Traducir la cámara del Shot Generator al generador de tomas.
- Siguen abiertos el dibujo que desaparece al colocar el esqueleto (nunca
  reproducido) y el intermitente de `check_export_anim_ui`.
