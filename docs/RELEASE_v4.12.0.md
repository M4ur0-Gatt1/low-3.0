# LOW v4.12.0 — Lipsync: la primera pasada, hecha en un botón

Sincronizar una boca a mano es marcar cuadro por cuadro en la X-sheet cuál de
los dibujos va en cada uno. Es un trabajo largo y, en su mayor parte, mecánico:
donde hay silencio la boca está cerrada, donde hay voz fuerte está abierta.
Esta versión hace esa pasada sola y deja el trabajo fino para el animador.

## Qué hace, y qué no

Lee el **volumen** del audio, no los fonemas. No distingue una «M» de una «A»,
porque para eso hace falta reconocimiento de fonemas y LOW no lo tiene. Está
dicho así en el propio panel, no escondido en la documentación.

Aun así resuelve el trabajo real: en producción 2D la primera pasada de lipsync
casi siempre es por amplitud, y después se corrigen a mano las sílabas que
importan. Lo que deja son **claves de sustitución comunes y corrientes** — se
tocan desde la X-sheet como cualquier otra, y entran en Undo.

## Cómo se usa

En el panel de rigging, tarjeta **Lipsync**. Se elige la pieza que tiene las
bocas —sus variantes ordenadas de cerrada a abierta—, se carga el audio de la
escena, se marca el rango en la Timeline y se genera. `Borrar` limpia las bocas
de ese tramo, que es por donde hay que empezar para rehacer un lipsync sin
mezclar dos sincronizaciones distintas.

Sin audio o con menos de dos bocas el botón está apagado y el panel dice por
qué. No genera nada a medias.

## Las tres decisiones que separan un lipsync usable de uno que tiembla

**Silencio explícito.** Por debajo del umbral va la boca cerrada, siempre. Un
lipsync que sigue moviendo la boca en las pausas se nota desde lejos.

**Sostén mínimo.** Una boca no puede durar un solo cuadro: a 24 fps eso es un
parpadeo, no una sílaba. Por omisión cada forma se sostiene dos cuadros, y el
control está a la vista para subirlo.

**Sólo se escribe el cambio.** Si la boca no cambia, no se pone clave. Sobre 48
cuadros de diálogo eso son once claves en vez de cuarenta y ocho, y la X-sheet
queda legible para corregir a mano.

Hay una cuarta, menos visible: la escala la manda **el tramo**, no el archivo
entero. Si en otra parte del audio alguien pega un grito, una toma susurrada
igual abre la boca; medida contra el grito, el personaje murmuraría la escena
completa.

## Todo el lipsync es UN paso de historial

Once claves, un Ctrl+Z. Es el comportamiento que uno espera de un comando y el
que la prueba verifica explícitamente: si mañana alguien lo rompe y Undo empieza
a sacar las claves de a una, la puerta de CI no deja pasar el cambio.

## Pruebas

- Suite nueva `tools/run_lipsync_tests.js` — **23/23**, en la puerta de CI.
  Incluye el caso del susurro contra el grito y el del chasquido de una muestra,
  que no debe abrir la boca de par en par (por eso los picos son RMS por cuadro
  y no el pico absoluto).
- Recorrido nuevo `tools/check_lipsync_ui.js`: panel bloqueado sin audio,
  habilitado con audio y bocas, generación dentro del rango, silencio cerrado,
  varias formas usadas, un solo paso de historial, Undo y borrado por tramo.
- Ocho contratos estáticos nuevos.
- El generador es un módulo **puro**: recibe picos y devuelve un mapa
  cuadro → forma, así que se prueba sin navegador.
- Batería completa antes de publicar: **9 suites de modelo** (353 + 14 + 8 +
  storyboard + 34 + 16 + 51 + 29 + 23), 3 comprobaciones Python y **13 recorridos
  E2E**, todos en verde.

## Lo que queda dicho como está

`tools/check_color_studio_ui.js` sigue **fuera** de la puerta de CI: falla de
forma intermitente cuando corre en ráfaga con los otros doce. Es una limitación
del arnés, no del producto, y se sigue corriendo a mano.

## Pendiente

- De §12 SIGUIENTE queda la prueba de **mocap con videos reales** (MOCAP-05 y
  MOCAP-12 necesitan aceptación humana).
- **Trabajo remoto en equipo**: transporte decidido —servidor propio en el
  droplet— y alcance decidido —presencia, bloqueos, edición simultánea y
  comentarios—. Es el próximo bloque grande. La pantalla compartida es un
  problema aparte (WebRTC), no del modelo de sincronización de operaciones.
- §12 AHORA·7: partir `app.js`, que sigue creciendo.

## Reversión

Estable previa: `v4.11.0`. El lipsync no toca nada más que las claves de
sustitución de la pieza elegida, dentro del rango marcado.
