# Reenfoque del módulo 2D de LOW

Estado: **en curso**. Referencia estructural: OpenToonz 1.7.
Este documento es el plan de trabajo; se actualiza a medida que avanzan las fases.

---

## 1. Auditoría de lo que hay hoy (agosto 2026)

Medido, no estimado:

| | |
|---|---|
| `ui/app.js` | **9.526 líneas** — acá vive TODO el módulo 2D |
| `ui/animation/*`, `ui/drawing/*`, `ui/workspace/*` | **371 líneas** repartidas en 15 archivos |

Los módulos existen como **fachada**: `scene-model.js` (66 líneas) tiene 0 menciones en `app.js`;
`layouts.js`, `stroke-engine.js`, `stabilization.js` y `pointer-input.js` también 0. La lógica real
no está ahí.

### El problema de fondo: no hay modelo de datos

```js
DZ.anim = { frames: [rutas de archivo], idx, playing, onion, cache }
```

Un "frame" es **un archivo .svg en disco**. De ahí se desprende todo lo demás:

- **No existe Drawing.** No hay una entidad dibujo separada del frame.
- **No existe Exposure.** Un dibujo no puede ocupar varios frames: cada frame es otro archivo.
- **No hay holds** — ni 2s, ni 3s, ni extender exposición. Es estructuralmente imposible.
- **El Onion Skin mira `idx ± n`**, o sea frames vecinos. Con un hold mostraría el mismo dibujo
  repetido. Por eso el papel cebolla actual no sirve: no es un bug, es el modelo.
- Todo se opera **directo sobre el DOM del SVG**, sin capa intermedia. Por eso cada arreglo toca
  el DOM y rompe otra cosa.

### Qué se conserva

- El **motor de trazo** y el manejo de puntero/presión (funciona y tiene estabilizador).
- El **sistema de paneles separables** a otra ventana (v3.29.22–28), que ya sirve para dos monitores.
- El **módulo 3D completo**: no se toca. La integración es posterior.
- La idea de `scene-model.js`/`exposures.js` (Level → exposures → drawingId) es **conceptualmente
  correcta**: se completa y se pone a gobernar de verdad, no se tira.

### Qué se reemplaza

- `DZ.anim.frames` como lista de archivos → modelo Scene/Level/Drawing/Exposure.
- El Onion Skin actual → uno que trabaja sobre **drawings**, no sobre índices de frame.
- La timeline actual → Xsheet/Timeline con celdas, exposiciones y holds.
- El layout fijo → **Workspaces** con definición serializable.

---

## 2. Cómo lo resuelve OpenToonz (lo que importa copiar)

Investigado en la documentación oficial 1.7.1.

**Xsheet.** Columnas = capas, filas = frames, celdas = contenido de esa capa en ese frame.
Varias celdas pueden referirse **al mismo dibujo sin duplicarlo**. Un hold es la misma referencia
repetida en celdas consecutivas. Si el dibujo referido no existe, la celda se muestra en rojo.

**Operaciones de celda** (las que definen el oficio): Increase/Decrease Step, Step 2/3/4,
Each 2/3/4, Reframe, Repeat, Reverse, Swing, Random, Autoexpose, Reset Step, Insert, Delete,
Cut/Copy/Paste, Roll Up/Down, Time Stretch, Replace Level. Más el **Fill Handle**: arrastrar la
manija extiende la secuencia con criterio (repite un dibujo, continúa una progresión 1,3,5 → 7,9,11,
y borra si se arrastra hacia atrás).

**Sustitución de dibujo:** se escribe el número del dibujo directamente en la celda.

**Navegación:** flechas mueven por frames; **Shift+↑/↓ salta al dibujo anterior/siguiente
salteando los holds**. Ese detalle es el que hace usable una xsheet.

**Onion Skin:** marcadores romboidales a la izquierda de la columna de frames. Dos modos:
**relativo** (respecto del frame actual) y **fijo** (frames marcados, independientes del actual).
Color configurable para anteriores y posteriores, y *Paper Thickness* para la transparencia.
Aplicado desde el Level Strip trabaja sobre la secuencia del nivel; desde la Xsheet, sobre lo
expuesto en escena.

**Rooms:** pestañas a la derecha de la barra de menú. Cambiar de room **no toca la escena**, solo el
layout. Se renombran con doble clic, se reordenan arrastrando, los paneles se acoplan arrastrando su
barra de título, y hay *Lock Room Panes* y *Reset to Default Rooms*.

Paneles disponibles: Viewer, ComboViewer, Xsheet, Timeline, Level Strip, Palette, Style Editor,
Studio Palette, Color Model, Tool Options Bar, Toolbar, Command Bar, Function Editor, Schematic,
Flipbook, File Browser, Scene Cast, Cleanup Settings, History, Message Center, Tasks, Batch Servers.

---

## 3. Arquitectura objetivo

### Entidades (Fase 1)

```
Scene
 ├── fps, rango de reproducción, cámara, audio
 ├── Level[]                    "el material dibujado"
 │    ├── id, nombre, tipo (vector|raster), paleta
 │    └── Drawing[]             numerados: 1, 2, 3… (renumerables)
 │         └── contenido (SVG), pivote, metadatos
 └── Layer[]                    "la columna de la xsheet"
      ├── id, nombre, visible, bloqueada, opacidad, Z
      └── Cell[frame] → { levelId, drawingNumber } | vacía
```

Reglas que se derivan y que el código debe respetar:

1. **Drawing ≠ Frame.** El dibujo vive en el Level; el frame solo lo *referencia*.
2. Un mismo `drawingNumber` en celdas consecutivas **es** un hold. No se duplica nada.
3. Borrar una celda **no borra el dibujo**. Borrar el dibujo es otra operación, explícita.
4. Mover exposiciones reordena referencias, nunca contenido.
5. El Onion Skin recorre **celdas distintas hacia atrás/adelante**, salteando holds.

### Capas de código

```
ui/animation/scene-model.js    entidades + invariantes (sin DOM)
ui/animation/exposures.js      operaciones de celda (step, each, reframe, repeat…)
ui/animation/onion.js          cálculo de qué drawings mostrar (sin DOM)
ui/animation/palette.js        el trazo referencia al estilo; resolución del color
ui/workspace/workspaces.js     definición de layouts como DATOS + persistencia
ui/app.js                      solo vista y eventos; deja de ser el dueño del estado
```

El modelo **no toca el DOM**. Eso permite probarlo de verdad y es lo que hoy no existe.

### Workspaces (Fase 2)

Definición serializable, nunca layout hardcodeado en la UI:

```js
{ name: "Animation",
  panels: [
    { id: "viewer",   dock: "center" },
    { id: "tools",    dock: "left",   size: 56 },
    { id: "options",  dock: "top",    size: 34 },
    { id: "xsheet",   dock: "bottom", size: 320 },
    { id: "palette",  dock: "right",  size: 240, hidden: true }
  ] }
```

Workspaces iniciales: **Drawing · Animation · Cleanup · Ink & Paint · Compositing · Camera · 3D**.
Cambiar de workspace cambia **solo** layout/paneles/barras/contexto. La escena, los documentos
abiertos y el estado del proyecto quedan intactos. Se guardan fuera del archivo de escena.

---

## 4. Fases y criterio de terminado

Una fase termina cuando se puede hacer el flujo real, no cuando compila.

| Fase | Contenido | Estado |
|---|---|---|
| 1 | Modelo: Scene/Level/Drawing/Cell/Exposure + operaciones de celda | ✅ hecho |
| 2 | Workspaces genéricos + los 7 layouts | ✅ base hecha |
| 3 | Xsheet/Timeline sobre el modelo (holds, steps, rangos) | ◐ planilla y navegación hechas |
| 4 | El dibujo entra al modelo solo + escena en un archivo | ✅ hecho |
| 5 | Onion Skin sobre drawings | ✅ hecho |
| 6 | Workflow: copiar/pegar, insertar, atajos, navegación, renumerar | ✅ hecho |
| 7 | Playback: FPS real, rango, loop, scrubbing | ◐ falta audio |
| 8 | Paletas y estilos, pegbars, function editor, schematic | ◐ paletas y estilos hechos |
| 9 | Integración con el módulo 3D | pendiente |

### Lo que ya está (v3.29.29)

**Fase 1 — modelo.** `ui/animation/scene-model.js` (Scene · Level · Drawing · Layer · Cell),
`exposures.js` (step, each, stepChange, insert, clear, remove, move, repeat, reverse, swing,
resetStep, dedupe, autoexpose, fillHandle, nextDrawingFrame, keyFrames) y `onion.js` (relativo +
fijo, sobre dibujos). Ninguno toca el DOM.

**Pruebas: 27/27**, con `LOW.animation.runTests()` — incluye el test de aceptación completo
(poses en 1/5/9/13 → autoexpose → intercalar → 2s → extender hold → borrar exposición → guardar →
reabrir → seguir). Verifican, entre otras cosas, que borrar una exposición **no** borra el dibujo
y que el onion skin **no** repite el dibujo de un hold.

Una prueba falló al escribirla y era de criterio, no de código: al navegar hacia atrás entre
dibujos, aterrizar en el último frame del hold anterior deja el cursor en el medio del bloque.
Ahora siempre se cae en el **primer** frame de la exposición.

**Fase 2 — workspaces.** `ui/workspace/workspaces.js`: catálogo de paneles + 7 presets como datos
(Dibujo · Animación · Limpieza · Color · Composición · Cámara · 3D), guardado, duplicado y reset.
Pestañas siempre visibles a la derecha de la barra de menú. Verificado: cambiar de workspace
reorganiza los paneles y **la escena queda intacta** (mismo SVG, mismo contenido, mismo archivo).

**Detalle de infraestructura:** los scripts de `ui/` se sellan con la versión
(`tools/stamp_version.py`, correr en cada bump). Sin eso el WebView puede seguir ejecutando el
`app.js` anterior tras actualizar, y el arreglo "no aparece".

**Fase 3 — planilla y navegación (v3.29.30).** `document.js` (LowDoc: dueño de la escena, del
frame y del dibujo actual, con migración desde la animación vieja) y `xsheet-view.js` (la planilla:
columnas por capa, holds dibujados como línea de continuación, número editable en la celda, manija
para estirar la exposición y las operaciones de timing a un clic).

Verificado en pantalla, no solo en tests: dibujar en el frame 1, ir al 5, dibujar otra pose, volver
— cada dibujo queda donde debe y **no se duplica nada** (2 dibujos, 5 celdas). Parado dentro de un
hold, el papel cebolla **no repite el dibujo sostenido** y muestra el siguiente distinto.

Al probar la planilla en pantalla apareció un bug que los tests no cazaban: las operaciones que
ACORTAN la secuencia (1s sobre un 2s, `each`, `dedupe`) dejaban las celdas viejas del final
colgando — dibujos fantasma al final de la escena. Corregido con `replace()` y con tres pruebas
nuevas (**30/30**).

**Fases 5, 6 y 7 (v3.29.33).**

*Papel cebolla:* panel nuevo, sobre dibujos, con puntos de un clic para cuántos ver de cada
lado, color por lado, desvanecido por distancia y marcadores fijos. Se saca a otra ventana.

*Atajos* (`shortcuts.js`), los que se usan sin mirar el teclado: `←/→` frame, **`↑/↓` DIBUJO —
saltea los holds**, `Inicio/Fin`, `Espacio` reproducir, `L` loop, `.`/`,` alargar y acortar la
exposición, `Insert`, `Supr` (vacía la celda, no toca el dibujo), `O` papel cebolla,
`Ctrl+C/X/V` sobre celdas. Copiar celdas copia REFERENCIAS: pegar no duplica dibujos —
verificado, 3 dibujos antes y después de pegar.

*Playback* (`playback.js`): reproduce sobre el modelo, sin precargar archivos. El frame se
calcula por RELOJ REAL, así que si la máquina no llega saltea frames en vez de ir en cámara
lenta. Medido: 12 frames en 1 s a 12 fps, loop correcto, y sin loop se detiene al final.
No usa `requestAnimationFrame`: despierta 60 veces por segundo para nada a 12 fps, y se PAUSA
con la ventana oculta — con la timeline en el otro monitor la reproducción se congelaba.

*X-sheet:* transporte propio (reproducir, dibujo anterior/siguiente, primero/último, loop, FPS,
rango, y el fps real medido mientras corre) y selección de rango con Shift+clic, que es sobre lo
que actúan las operaciones de timing.

**Fase 4 (v3.29.34).** Toda edición del lienzo entra al dibujo del modelo sola, por
`dzMarkDirty` con 260 ms de retardo: antes solo se volcaba al cambiar de frame, así que dibujar
y guardar sin moverse perdía ese trazo.

La escena entera —niveles, dibujos, capas, exposiciones, fps, rango— va a **un** archivo
`.lowscene` (Animación → Guardar escena, `Ctrl+Shift+S`), con autoguardado local cada 8 s y
recuperación al abrir si LOW se cerró mal.

Test de aceptación corrido de punta a punta en la app: dibujar tres poses → autoexpose (holds de
4) → guardar → descartar todo de memoria (cerrar) → reabrir del archivo → **3 dibujos, mismo
timing, mismo fps, mismo rango, contenido intacto** → navegar y seguir dibujando encima sin crear
dibujos de más. Y como prueba automática: **37/37**.

**Timeline nueva (v3.29.35).** `timeline-view.js`: una fila por capa, el tiempo hacia la derecha,
regla de frames, ojo de visibilidad y arrastre de bloques de exposición. Es la otra lectura del
MISMO documento — lo que cambiás en la planilla aparece acá al instante, sin sincronizar nada a
mano. Verificado: 3 exposiciones y 6 holds en la timeline y los mismos 3 números en la X-sheet,
las dos marcando el frame actual.

**Level Strip y operaciones de dibujo (v3.29.37).** La tira muestra el MATERIAL —qué dibujos
existen en el nivel, estén expuestos o no—, que era la mitad del modelo que no se veía en ninguna
parte: un dibujo fuera de toda celda era invisible aunque existiera. Ahora se marca como suelto.
Con clic derecho: exponer acá, duplicar, renumerar y borrar. Las tres operaciones entran al
historial, y **renumerar arrastra las celdas** para que ninguna quede apuntando a un dibujo que ya
no existe.

Ctrl+Z verificado en cada una: duplicar se deshace, renumerar vuelve el número y las celdas, y
borrar devuelve el dibujo con su contenido y sus exposiciones.

**Scrubbing:** arrastrar por la regla de la timeline recorre la animación con la mano — el
playback muestra el resultado, el scrub sirve para encontrar el frame exacto donde algo falla.

**Paletas y estilos (fase 8).** El registro canónico del color ya estaba en el modelo
(`Palette` y `Style` en `scene-model.js`, con color, opacidad y bloqueo). Lo que faltaba para
que sirviera mientras se dibuja es el otro lado del vínculo: **que el trazo referencie al
estilo**. Sin eso el color sigue siendo un valor literal pegado adentro de cada trazo, y
aclarar la línea de un personaje son cuatrocientos trazos repartidos en ciento veinte dibujos,
uno por uno.

Ahora el estilo tiene, además de su `id`, un **número corto** — y el número es lo que queda
escrito en el dibujo (`data-stk` para la línea, `data-fil` para el relleno, como el ink & paint
de siempre). Se referencia el número y no el `id` por lo mismo que la celda de la X-sheet lleva
el número del dibujo: un uid repetido en cada elemento del SVG no se lee ni se escribe a mano.
El número no se reordena ni se reusa; si cambiara, los trazos apuntarían a otro color.

El color lo resuelve una hoja de estilos que se inyecta en el SVG (`palette.js`), no una
reescritura de los dibujos. Dos consecuencias concretas: el color literal queda igual en el
archivo como respaldo —el `.svg` guardado se lleva la hoja, así que afuera de LOW se ve con los
colores de HOY— y recolorear es cambiar una línea de texto, así que arrastrar el selector se ve
al instante en todos los dibujos, expuestos o no.

El panel (`palette-view.js`) muestra por estilo su número, su color y **cuántos elementos lo
usan**: es lo que hace falta para animarse a tocar un color y para ver cuál está de adorno.
Borrar un estilo NO recolorea nada —los trazos se quedan con el color que tienen y quedan
señalados como sueltos, para reasignarlos cuando se quiera— y "pasar sus N elementos a otro
estilo" unifica dos colores que terminaron siendo el mismo. Si la paleta está bloqueada, el
panel no ofrece lo que el modelo va a rechazar.

**Adoptar** es lo que hace que esto sirva para el trabajo que ya existe: mete en la paleta los
colores de lo que se dibujó antes, sin cambiar cómo se ve. Sin eso la paleta gobernaría solo lo
nuevo. Verificado en la app sobre un dibujo con colores literales: 5 elementos adoptados, 3
estilos nuevos para los colores que no estaban, los que ya estaban reusados, y el dibujo
idéntico en pantalla.

Verificado con eventos de puntero reales, no solo en tests: clic en el casillero 4 → el lápiz
pasa a ese estilo → se dibuja → el trazo queda con `data-stk="4"` y su color literal de
respaldo → se arrastra el selector y el trazo YA dibujado cambia en vivo → al soltar queda
**un** paso de historial y `Ctrl+Z` devuelve el color, en el modelo y en el panel. El papel
cebolla se mira aparte: al fantasma se le sacan las referencias de estilo, porque si no la
paleta le impondría su color y el cebolla dejaría de distinguir el pasado del futuro.

Pruebas: **140/140** (20 nuevas). Se comprobó además que las nuevas tengan filo, rompiendo el
código a propósito: mutar la resolución del color, el salteo de lo ya marcado en *adoptar*, el
conteo de uso, el filtro de `fill="none"` y el reparto de números hace caer pruebas en las
cinco mutaciones.

Lo que la paleta todavía NO gobierna: las formas del menú de inserción (rectángulo, estrella,
texto) y lo importado siguen naciendo con color literal. Entran con **Adoptar**, que es
justamente para eso. De la fase 8 quedan pegbars, function editor y schematic.

### Lo que sigue

Retirar `DZ.anim.frames` y la timeline vieja, que todavía conviven con lo nuevo (la timeline de
abajo sigue siendo la anterior; la planilla nueva es la de la X-sheet). Después: renumerar
dibujos, audio y scrubbing, paletas y estilos.

---

## Rigging 2D: auditoría y deuda P0 (2026-08-20)

Estado honesto: **flujo cut-out rígido funcional; deformación flexible y editor de curvas aún pendientes**.

### Lo que funciona actualmente

- Registrar piezas SVG sin duplicar dibujos y colocar sus pivotes.
- Armar una jerarquía padre-hijo sin ciclos; la matriz mundial propaga
  traslación, rotación y escala hasta las piezas descendientes.
- Posar en FK y crear claves locales o una clave global de todo el personaje.
- Crear una cadena IK consecutiva de dos huesos, arrastrar su objetivo, invertir
  la flexión, fijar raíz y limitar ángulos. La pose IK clava ambos huesos y el
  objetivo dentro de una sola operación de Undo.
- Ver las articulaciones sobre la mesa, las claves en una pista Esqueleto de la
  Timeline y manipular el rig con su panel o mesa desacoplados.
- Reproducir, exportar, guardar, cerrar, reabrir y continuar: todo evalúa el
  mismo `LowDoc.scene.rig`; la pose nunca se hornea accidentalmente al Drawing.
- Grabar una actuación FK, remuestrearla a claves y suavizarla conservando X/Y
  de escala independientes.

### Deuda que permanece

1. Las piezas cut-out son rígidas: todavía no hay deformador por malla/curva ni pesos.
2. La Timeline muestra las claves del esqueleto, pero falta selección/copy-paste
   de claves y edición visual de curvas/easing por propiedad.
3. Falta una vista Schematic del mismo grafo canónico.
4. La captura de actuación funciona con FK; la manipulación IK simultánea y la
   edición avanzada de trayectorias son trabajo posterior.
5. Los IDs estables ya viven en el modelo y se conservan al guardar, pero la UI
   todavía debe incorporar una operación explícita de renombrado de pieza.

### Arquitectura obligatoria para resolverlo

Sin crear una escena paralela, extender el modelo actual:

```text
Scene
 ├── rig
 │    ├── nodes[id]: DrawingNode { parentId, pivot, rest, limits, keys }
 │    └── constraints[id]: IK2 { rootId, midId, effectorId, targetKeys }
 └── functionCurves[nodeId/property] → Keyframe[]
```

Las capas/celdas continúan determinando qué Drawing está expuesto. El rig referencia IDs estables
del modelo, nunca posiciones del DOM. Viewer, Timeline, XSheet, Schematic y export leen la misma
evaluación de escena.

### Pasada de implementación

- **P0.1 — Canonizar: ✅ hecho.** `Scene.rig.nodes` guarda IDs estables, claves, rest pose y
  parenting; `LowDoc` serializa, migra `DZ.scene.rig` y registra crear/mover/borrar claves y
  jerarquía en el Undo compartido. La UI, playback y grabación ya leen/escriben ese estado.
- **P0.2 — Peg hierarchy: ✅ hecho.** Nodos padre-hijo, rest pose, pivotes y transformación mundial/local.
- **P0.3 — Timeline/Function curves: ◐ pista hecha.** Pista Esqueleto visible y navegación;
  faltan selección múltiple de claves, copy/paste,
  easing editable y navegación desde XSheet/Timeline.
- **P0.4 — Bones + IK: ✅ hecho para cut-out rígido.** Cadena de dos huesos, target animado,
  raíz fijada, límites angulares, flip controlado y Undo transaccional.
- **P0.5 — Deformación:** deformador por curva o malla con pesos persistentes y edición de rest pose.
- **P0.6 — Schematic:** vista de conexiones que edita el mismo grafo, sin duplicar estado.

Pruebas del modelo: **83/83**. Cubren jerarquía matricial, propagación de pose,
creación y solución IK, límites, claves automáticas, Undo atómico, persistencia y
limpieza de constraints al quitar piezas.
- **P0.7 — Actuación:** grabación sobre las curvas canónicas, reducción configurable de claves y
  reproducción por reloj real.
- **P0.8 — Export:** evaluación idéntica entre Viewer, playback y export; eliminar el bake basado
  en duplicar archivos por frame.

### Criterio de aceptación

Crear torso, brazo y antebrazo → parentar la cadena → fijar pivotes → añadir IK con mano fijada →
posar en frames 1 y 13 → editar easing → ver la misma pose en Viewer/XSheet/Timeline → Undo/Redo
de claves y parenting → guardar `.lowscene` → cerrar → reabrir → conservar rig, constraints y
curvas → exportar y comparar los frames 1/7/13 con el Viewer.

Mientras ese flujo no pase completo, LOW debe llamar a la función **Pegs (experimental)** y no
presentarla como rigging profesional terminado.

### Test de aceptación (el que define si esto sirve)

Escena a 24 fps → crear un nivel → dibujar poses en 1, 5, 9, 13 → exponerlas → onion skin →
intercalar → cambiar el timing → pasar a 2s → extender un hold → mover una exposición →
borrar una exposición **sin perder el dibujo** → reproducir → guardar → cerrar LOW → reabrir →
seguir trabajando donde se dejó.

Mientras alguna de esas operaciones falle o sea incoherente, la fase no está terminada.

La arquitectura siguiente del rig —bones, slots, attachments, bindings,
constraints, controladores, acciones, mallas/pesos y vistas 360— está fijada en
[`ADR_2D_PRO_RIG_ARCHITECTURE.md`](ADR_2D_PRO_RIG_ARCHITECTURE.md). Ese ADR
corrige la aplicación directa de técnicas 3D al dominio 2D y mantiene todo en
el mismo `LowDoc.scene.rig`.

---

## 5. Timeline desacoplada y mesa de luz (pasada 2026-08-20)

- Timeline y XSheet separados son vistas movidas del mismo estado; **Acoplar** devuelve la vista
  original y no deja una copia detrás.
- La Timeline separada conserva transporte, loop, FPS, rango In/Out, selección, cámara, claves,
  audio, exportación y las operaciones canónicas de celdas (cortar/copiar/pegar, vaciar,
  exposiciones, 1s/2s/3s, autoexponer, quitar holds, repetir, invertir e ida-vuelta).
- La Timeline principal monta `TimelineView` canónica; el render de archivos legacy queda como
  adaptador de migración y no vuelve a reemplazarla.
- La fila **Referencias** encima del tiempo fija dibujos lejanos con clic o clic-arrastre, sin mover
  el cabezal. Son referencias absolutas y se guardan con la escena.
- El panel de papel cebolla es una mesa de luz de 20 canales: 10 dibujos anteriores y 10
  posteriores, opacidad independiente, perfiles rápidos, colores por lado y modo sólo línea.
- Seleccionar una celda vacía y empezar a dibujar crea y expone el Drawing automáticamente; el
  usuario no necesita crear un archivo o dibujo manualmente antes del primer trazo.

Pruebas del modelo: **65/65**. Incluyen perfiles independientes, canales apagados, persistencia
guardar/reabrir y dibujo directo sobre una celda vacía.

---

## 6. Resolución canónica de la mesa de dibujo (pasada 2026-08-20)

- Una escena nueva parte de **1020×1080 px**. Archivo → Documento permite elegir ese formato,
  HD, Full HD horizontal/vertical, 4K, cuadrado, cine e impresión, o escribir una medida propia.
- `Scene.width/height` son la única resolución del documento de animación y se guardan dentro de
  `.lowscene`. Cambiar el tamaño de un panel, acoplarlo, moverlo a otro monitor o ajustar la vista
  sólo cambia el zoom CSS; no toca la resolución ni las coordenadas del dibujo.
- La raíz SVG mantiene sincronizados `viewBox`, `width`, `height` y `preserveAspectRatio` al abrir,
  cambiar de Drawing, recuperar una escena y deshacer/rehacer el cambio de documento.
- Los SVG anteriores conservan el tamaño que ya tenían durante la migración. El nuevo valor
  1020×1080 es el predeterminado para archivos nuevos, no una conversión destructiva.
- Cambiar tamaño y fondo forma una única operación de Undo, y guardar/reabrir conserva el formato.

Pruebas del modelo: **72/72** tras esta pasada (incluyen valor inicial, preset, Undo/Redo y
persistencia de resolución).

---

## 7. Paneles desacoplados: contrato de estado (pasada 2026-08-20)

- Cada panel auxiliar recibe una foto inicial **antes** de abrir su ventana y sólo se publica si
  cumple el contrato de su tipo. Así no aparece vacío durante el primer render ni quedan variantes
  parciales al añadir otro panel.
- Dibujos del nivel transmite el contenido SVG de cada `Drawing`, su selección y su estado de
  exposición. La ventana separada renderiza miniaturas reales; seleccionar conserva la semántica
  del Level Strip y el doble clic expone el dibujo en la celda actual con el mismo Undo canónico.
- La mesa separada recibe el SVG canónico, pero no el `transform` CSS de zoom/paneo de la ventana
  principal. Su tamaño y encuadre se recalculan en su propio monitor sin mover el arte ni alterar
  la resolución del documento.
- Capas, Herramientas, Color y Papel cebolla usan el mismo contrato validado. Timeline y XSheet
  continúan compartiendo el estado canónico de animación y lo publican antes de crear la ventana.

Prueba en navegador: miniaturas SVG reales, selección, mesa sin transformación heredada y contrato
válido para los seis paneles auxiliares generales. Pruebas del modelo: **72/72**.

---

## 8. Fuentes

- [Interface Overview — OpenToonz 1.7.1](https://opentoonz.readthedocs.io/en/latest/interface_overview.html)
- [Working in Xsheet/Timeline — OpenToonz 1.7.1](https://opentoonz.readthedocs.io/en/latest/working_in_xsheet.html)
- [Drawing Animation Levels — OpenToonz 1.7.1](https://opentoonz.readthedocs.io/en/latest/drawing_animation_levels.html)
- [Rooms — OpenToonz Wikia](https://opentoonz.fandom.com/wiki/Rooms)

---

## 9. Fundamento de rig profesional v4 (pasada 2026-08-20)

- `Scene.rig` migra automáticamente rigs legacy, v3 y v4 al mismo contrato.
- Bones contienen jerarquía y pose; slots contienen orden visual; attachments
  contienen dibujos/sustituciones; bindings declaran cómo se vinculan.
- Un esqueleto puede crearse sin arte y recibir slots, sustituciones y bindings
  después; copiar o reutilizar la estructura no obliga a duplicar los dibujos.
- `rig.nodes` comparte la referencia de `bones` sólo como adaptador temporal de
  la interfaz existente y no se duplica en el archivo `.lowscene`.
- Las claves de pose se reflejan en canales por propiedad con interpolación y
  Undo, preparando Timeline y Function Editor sin romper las claves actuales.
- Las constraints tienen orden persistente, `mix`, lecturas, escrituras y
  dependencias. LOW rechaza ciclos antes de guardar el cambio y aplica orden
  topológico estable cuando una preferencia manual contradice una dependencia.
- El diagnóstico detecta jerarquías circulares y referencias rotas de slots,
  attachments y bindings antes de exportar.

Pruebas del modelo: **118/118**. Incluyen migración v3→v4, JSON sin estado
duplicado, sustituciones y Undo, orden visual, canales, constraints ordenadas,
rechazo atómico de ciclos, diagnóstico y reapertura.

---

## 10. Armado gráfico y ruta de deformación (pasada 2026-08-20)

- `Crear hueso` ya trabaja sobre la mesa: arrastrar define cabeza y punta; si
  el gesto empieza en una punta existente, el nuevo hueso nace conectado como
  hijo. No requiere registrar una pieza de arte antes.
- Los huesos puros se seleccionan desde el overlay o la jerarquía. Cabeza y
  punta se editan gráficamente, conservan una longitud mínima y se guardan en
  el mismo `Scene.rig.bones` canónico.
- Crear, extender y editar geometría producen una operación atómica de Undo.
- La carga de un SVG preserva los overlays del editor. Antes eliminaba todos
  los hijos `<svg>` y podía borrar el overlay del rig junto con el dibujo.
- Prueba interactiva real: crear raíz, extender un hijo desde la punta,
  verificar `parentId`, Undo, Redo, cambiar longitud y deshacer.

Pruebas del modelo: **120/120**.

### Decisiones tomadas a partir del informe técnico adjunto

El objetivo de deformación avanzada se divide para no confundir una interfaz
con un motor terminado:

1. malla 2D explícita, triangulación, bindings y LBS con pesos dispersos;
2. auto-pesado BBW opcional en bind-time, aislado en Worker, con cancelación,
   caché y fallback manual; nunca recalculado durante playback;
3. deformadores de curva/jaula, switches y Master Controllers sobre los
   channels/actions v4;
4. rigs 360° como vistas y sustituciones coordinadas por controladores;
5. Shape-aware IK sólo después de medir calidad y latencia sobre escenas de
   producción.

Dual-quaternion skinning y generalized winding numbers no son requisitos del
primer motor 2D: se evaluarán únicamente para torsión o geometría problemática
que demuestre una mejora frente al coste y complejidad añadidos.
