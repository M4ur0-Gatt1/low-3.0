# Arquitectura temporal y edición audiovisual dentro de LOW 2D

**Estado:** decisión de arquitectura aceptada; implementación incremental  
**Fecha:** 2026-09-01  
**Alcance:** Scene Model, X-Sheet, Timeline, Viewer, Playback, audio, video de referencia, cámara, marcadores y exportación.

## Decisión

LOW tendrá un solo reloj y una sola fuente de verdad temporal:

```text
LowDoc / Scene
├─ fps + playRange + frame actual
├─ Levels → Drawings                  material sin tiempo
├─ Layers → cells[frame]              exposiciones del X-Sheet
├─ camera.keys[frame]
├─ rig.nodes[*].keys[frame]
└─ timeline media / markers           clips y anotaciones en frames de escena
       ↓
X-Sheet ↔ Timeline ↔ Viewer ↔ Playback ↔ Export
```

La Timeline y la X-Sheet son dos vistas del mismo documento. Ninguna mantiene
una lista paralela de cuadros. `Drawing`, `Level` y `Exposure` conservan su
significado tradicional; un clip de video o audio no se disfrazará de dibujo.

El estado puramente visual —zoom horizontal, altura, pistas plegadas, filtros,
panel activo— pertenece al workspace/localStorage. No se serializa dentro de la
obra, no ensucia el documento y no entra en el historial de Ctrl+Z.

## Auditoría del estado actual

| Área | Fuente actual | Estado | Riesgo concreto |
|---|---|---|---|
| Dibujo | `Level.drawings` | Correcto | Ninguno: no debe mezclarse con tiempo. |
| Exposición | `Layer.cells[frame-1]` | Correcto | Las operaciones ripple actúan hoy sobre una capa, no sobre blancos explícitamente elegidos. |
| Frame actual | `LowDoc.frame` | Correcto | El camino legado `DZ.anim.idx` todavía convive en `app.js`. |
| FPS y tramo | `Scene.fps`, `Scene.range` | Correcto | `Scene.lastFrame()` sólo mira exposiciones; puede ignorar cámara, rig, audio o mocap posteriores. |
| Playback | `Playback` + tiempo real | Correcto | Sólo conecta una pista de audio. |
| Audio | `LowDoc.audio` (`AudioTrack`) | Parcial | `Scene.audio` también existe pero no gobierna el runtime. La onda se guarda; el medio decodificado no. |
| Video | `MotionCaptureTrack` | Especializado | Es un recurso de sesión para mocap/rotoscopía, no un clip de referencia general. |
| Cámara | `Scene.camera.keys` | Funcional | La edición de claves no siempre pasa por una transacción de historial. |
| Marcadores | notas legadas y referencias de onion | Fragmentado | No existe una entidad semántica única para marca, región, comentario o tempo. |
| Exportación | Viewer compone PNG; Python codifica | Parcial | Omite cuadros vacíos y no mezcla audio; eso puede acortar o desincronizar el resultado. |
| Undo/redo | `LowDoc.history` | Correcto para dibujo/rig | Audio, cámara y futuros clips necesitan comandos atómicos equivalentes. |
| Persistencia | `.lowscene` | Parcial | Metadatos sí; fuentes audiovisuales, offline/relink, proxy y caché no tienen contrato. |

### Duplicaciones que deben retirarse por migración, no de golpe

- `LowDoc.audio` es la pista usada; `Scene.audio` quedó como estructura
  duplicada y no debe recibir nuevas funciones.
- El editor nuevo usa `LowDoc`, pero `app.js` conserva rutas de `DZ.anim` para
  escenas antiguas. Cualquier función nueva debe entrar por `LowDoc`.
- `main.py` todavía contiene utilidades de animación por archivos de cuadros.
  Son backend/importación, no el modelo de tiempo del módulo 2D.
- `MotionCaptureTrack` seguirá independiente del panel Cut-out y de los clips
  audiovisuales normales. Puede compartir el reloj, no la responsabilidad.

## Contrato propuesto para medios

La próxima extensión de `Scene` será un `timeline` serializable con entidades
tipadas. Todos sus límites usan frames enteros de la escena.

```js
scene.timeline = {
  tracks: [
    { id, type: "audio" | "video-reference", name, muted, locked, clips: [clip] }
  ],
  markers: [{ id, frame, endFrame, kind, label, color, note }]
}

clip = {
  id, sourceId,
  startFrame, durationFrames,
  sourceInSeconds, playbackRate,
  gain, fadeInFrames, fadeOutFrames,
  proxy: { status, cacheKey },
  offline: false
}
```

Las fuentes viven en un registro de medios con identidad estable (ruta o URI,
tamaño, fecha, hash cuando sea posible). Los picos y proxies son caché externa,
reconstruible y versionada por fuente + FPS; no inflan el `.lowscene`.

## Semántica de edición

- **Insert:** agrega contenido y desplaza sólo las pistas objetivo.
- **Overwrite:** reemplaza el intervalo sin mover el resto.
- **Ripple:** desplaza un conjunto explícito de pistas objetivo; nunca todas por
  accidente.
- **Trim:** cambia un borde del clip y su punto de fuente correspondiente.
- **Slip:** mantiene posición/duración y cambia sólo `sourceInSeconds`.
- **Split:** produce dos clips contiguos que referencian la misma fuente.
- Cada gesto es una transacción única de historial y conserva sincronía A/V.

## Lo ya implementado en la primera unidad

- Zoom temporal por pasos y Ctrl+rueda.
- Encajar escena, selección o tramo activo.
- Regla con detalle adaptativo según zoom.
- Densidad compacta, normal o cómoda.
- Plegado individual de referencias, rig, capas y audio.
- Foco en la capa seleccionada y ocultación de capas sin exposiciones.
- La extensión visual contempla claves de cámara/rig, audio y mocap sin crear
  cuadros ni modificar el `playRange`.
- Las preferencias quedan fuera de `Scene` y del historial.

Esta unidad mejora legibilidad y navegación. Todavía no virtualiza miles de
celdas; la virtualización por ventana visible es el siguiente requisito de
rendimiento antes de habilitar escenas audiovisuales largas.

## Plan de migración

1. **Compactación y rendimiento:** virtualización horizontal, scroll estable,
   alturas por pista y menú de visualización.
2. **Modelo de medios:** registro de fuentes, clips tipados, offline/relink y
   serialización compatible hacia atrás.
3. **Edición:** selección de clips, split/trim/insert/overwrite/ripple/slip con
   historial atómico y pistas objetivo.
4. **Audio:** varias pistas, forma de onda multirresolución, scrub, ganancia,
   mute/solo y fades.
5. **Video de referencia:** Source/Viewer, proxy reproducible, ajuste a FPS y
   estado offline visible. Nunca reemplaza al módulo de mocap.
6. **Exportación:** emitir todos los frames del rango, incluir cuadros vacíos,
   mezclar audio y usar originales o proxies según destino.
7. **Marcadores y propiedades:** marcas de escena/tempo/comentarios y un panel
   contextual para exposición, clave, clip o pista.

## Criterios de aceptación

- X-Sheet y Timeline producen la misma escena al guardar y reabrir.
- Cambiar de Room no cambia frame, selección, zoom del Viewer ni historial.
- Reproducir, hacer scrub y exportar usan el mismo FPS y el mismo play range.
- Un ripple sólo toca pistas señaladas y se deshace con un Ctrl+Z.
- Una fuente offline conserva el montaje y ofrece relink; no desaparece.
- El export conserva la duración aun cuando existan cuadros visualmente vacíos.
- Mocap, rotoscopía y video de referencia son paneles y datos distintos.

## Referencias de producto verificadas

- [OpenToonz: X-Sheet y Timeline como dos vistas equivalentes](https://opentoonz.readthedocs.io/en/latest/working_in_xsheet.html)
- [Adobe Premiere: apariencia, expansión y altura de pistas](https://helpx.adobe.com/premiere/desktop/edit-projects/change-clip-sequence/edit-track-appearance.html)
- [Adobe Premiere: selección explícita de pistas objetivo](https://helpx.adobe.com/premiere/desktop/edit-projects/intro-to-editing/work-with-clips-on-the-timeline-using-track-targeting.html)
- [Toon Boom Harmony: propiedades de capa como vista acoplable](https://docs.toonboom.com/help/harmony-24/advanced/reference/view/layer-properties-view.html)

