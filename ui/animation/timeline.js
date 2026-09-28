(function (global) {
  "use strict";
  const animation = (global.LOW = global.LOW || {}).animation = global.LOW.animation || {};

  /* Estado de VISTA de la timeline. No pertenece a Scene ni a LowDoc: cambiar
     el zoom, la densidad o plegar una pista no modifica la obra, no ensucia el
     archivo y no entra en Ctrl+Z. El tiempo continúa viviendo exclusivamente
     en las celdas, claves y rangos del documento. */
  const VIEW_DEFAULTS = Object.freeze({
    frameWidth: 16,
    density: "normal",
    hideEmpty: false,
    focusSelected: false,
    compact: false,
    collapsed: {}
  });
  // La columna de nombres es el ÚNICO costo horizontal fijo de la timeline:
  // aparece en todas las filas y queda pegada al borde con el scroll. Angostarla
  // es lo que devuelve ancho real para tiempo; la escala la sigue mandando el zoom.
  const NAME_WIDTHS = Object.freeze({ normal: 170, compact: 34 });   // 170: ojo, candado, luz, propiedades y el nombre
  const FRAME_WIDTHS = Object.freeze([6, 8, 10, 12, 16, 20, 24, 32, 40, 48]);
  const DENSITIES = Object.freeze(["compact", "normal", "comfortable"]);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function nearestFrameWidth(value) {
    const requested = clamp(Number(value) || VIEW_DEFAULTS.frameWidth,
      FRAME_WIDTHS[0], FRAME_WIDTHS[FRAME_WIDTHS.length - 1]);
    return FRAME_WIDTHS.reduce((best, candidate) =>
      Math.abs(candidate - requested) < Math.abs(best - requested) ? candidate : best,
    VIEW_DEFAULTS.frameWidth);
  }

  function normalizeViewState(value) {
    const data = value && typeof value === "object" ? value : {};
    return {
      frameWidth: nearestFrameWidth(data.frameWidth),
      density: DENSITIES.includes(data.density) ? data.density : VIEW_DEFAULTS.density,
      hideEmpty: !!data.hideEmpty,
      focusSelected: !!data.focusSelected,
      compact: !!data.compact,
      collapsed: data.collapsed && typeof data.collapsed === "object"
        ? Object.fromEntries(Object.entries(data.collapsed).filter(([, state]) => !!state)) : {}
    };
  }

  function rowHeight(density) {
    return density === "compact" ? 18 : density === "comfortable" ? 32 : 24;
  }

  /** Ancho del encabezado de pista. `fitFrameWidth` lo necesita para no
      calcular la escala contra un ancho que ya no existe. */
  function nameWidth(compact) {
    return compact ? NAME_WIDTHS.compact : NAME_WIDTHS.normal;
  }

  /** Separación de números de regla según el zoom. Mantiene aproximadamente
      64 px entre etiquetas y evita una sopa de cifras en escenas largas. */
  function majorTickStep(frameWidth, minLabelPixels = 64) {
    const required = Math.max(1, minLabelPixels / Math.max(1, Number(frameWidth) || 1));
    const steps = [1, 2, 3, 5, 6, 10, 12, 15, 20, 24, 30, 48, 60, 120, 240, 480];
    return steps.find((step) => step >= required) || Math.ceil(required / 480) * 480;
  }

  /** Resumen por cuadro de las sustituciones de dibujo del rig: dónde CAMBIA la
      pieza y hasta dónde se sostiene ese dibujo. Sin esto, pasar de mano abierta
      a puño es un timing invisible, y un timing invisible no se corrige.
      Índice = cuadro; los cuadros sin nada quedan en null para no dibujar celdas
      de más. Una clave que apunta a un dibujo borrado se ignora: la pista no
      puede mostrar una marca que ya no corresponde a nada. */
  function switchTrack(scene, total = 1) {
    const rig = (scene && scene.rig) || {};
    const switches = rig.switches || {}, attachments = rig.attachments || {}, slots = rig.slots || {};
    const bones = rig.bones || rig.nodes || {};
    const last = Math.max(1, Math.round(Number(total) || 1));
    const marks = new Array(last + 1).fill(null);
    // `labels` son los dibujos que ENTRAN en ese cuadro; `holds`, los que vienen
    // sostenidos de antes. Mezclarlos hacía que un cuadro donde cambia la cabeza
    // y la mano sólo continúa dijera que cambiaron las dos.
    const marcaEn = (frame) => (marks[frame] ||= { change: false, held: false, labels: [], holds: [], slots: [] });
    for (const [slotId, sw] of Object.entries(switches)) {
      const keys = (sw && sw.keys) || {};
      const frames = Object.keys(keys).map(Number)
        .filter((f) => Number.isFinite(f) && f >= 1 && f <= last && attachments[keys[f]])
        .sort((a, b) => a - b);
      frames.forEach((frame, index) => {
        const attachment = attachments[keys[frame]];
        const dibujo = attachment.name || attachment.elementId || attachment.id;
        // Los slots nacen con un nombre autogenerado, y hay DOS formas: el id del
        // hueso o el id del slot (`slot:<hueso>`). Ninguna sirve para leer:
        // mostraría «slot:human_standard_ps4bi_hand_L» en vez de «Mano izq.».
        // Sólo un nombre puesto a mano gana; si no, manda el nombre del hueso.
        const slot = slots[slotId], bone = slot && bones[slot.boneId];
        const generico = !slot || !slot.name || slot.name === slot.id || slot.name === slot.boneId;
        const pieza = (!generico && slot.name) || (bone && bone.name) || (slot && slot.name) || slotId;
        const hasta = index + 1 < frames.length ? frames[index + 1] - 1 : last;
        for (let f = frame; f <= hasta; f++) {
          const mark = marcaEn(f), etiqueta = `${pieza}: ${dibujo}`;
          if (f === frame) { mark.change = true; mark.labels.push(etiqueta); mark.slots.push(slotId); }
          else { mark.held = true; mark.holds.push(etiqueta); }
        }
      });
    }
    return marks;
  }

  function layerHasContent(layer) {
    return !!(layer && Array.isArray(layer.cells) && layer.cells.some((cell) => cell != null));
  }

  function visibleLayers(layers, state, selectedId) {
    const view = normalizeViewState(state);
    return (Array.isArray(layers) ? layers : []).filter((layer) => {
      if (layer.id === selectedId) return true;
      if (view.focusSelected) return false;
      if (view.hideEmpty && !layerHasContent(layer)) return false;
      return true;
    });
  }

  /** Extensión visual de todas las fuentes temporales conocidas. No crea
      cuadros ni cambia playRange: sólo evita que una clave de cámara, rig,
      audio o mocap quede fuera de la regla por no haber dibujos expuestos. */
  function extent(scene, { audio = null, mocap = null, current = 1 } = {}) {
    let last = Math.max(1, Number(current) || 1,
      scene && typeof scene.lastFrame === "function" ? scene.lastFrame() : 1,
      scene && scene.range ? Number(scene.range.out) || 0 : 0);
    const takeKeys = (keys) => {
      for (const key of Object.keys(keys || {})) last = Math.max(last, Number(key) || 0);
    };
    takeKeys(scene && scene.camera && scene.camera.keys);
    for (const plane of Object.values((scene && scene.composition && scene.composition.planes) || {}))
      takeKeys(plane && plane.keys);
    const rig = scene && scene.rig;
    for (const node of Object.values((rig && rig.nodes) || {})) takeKeys(node && node.keys);
    for (const constraint of Object.values((rig && rig.constraints) || {})) takeKeys(constraint && constraint.targetKeys);
    if (audio && Array.isArray(audio.peaks))
      last = Math.max(last, (Number(audio.offset) || 0) + audio.peaks.length);
    if (mocap && mocap.range) last = Math.max(last, Number(mocap.range.out) || 0);
    return Math.max(1, Math.ceil(last));
  }

  function fitFrameWidth(viewportWidth, from, to, headerWidth = 128) {
    const count = Math.max(1, Math.abs((Number(to) || 1) - (Number(from) || 1)) + 1);
    const available = Math.max(FRAME_WIDTHS[0], (Number(viewportWidth) || 0) - headerWidth - 18);
    return nearestFrameWidth(available / count);
  }

  function rangeFor(kind, doc, options = {}) {
    const scene = doc && doc.scene;
    if (!scene) return { from: 1, to: 1 };
    if (kind === "selection" && doc.cellSelection)
      return { from: Math.max(1, doc.cellSelection.from), to: Math.max(1, doc.cellSelection.to) };
    if (kind === "play" && typeof scene.playRange === "function") {
      const range = scene.playRange();
      return { from: Math.max(1, range.in), to: Math.max(1, range.out) };
    }
    return { from: 1, to: extent(scene, { ...options, current: doc.frame }) };
  }

  function buildPanelState({ frames = [], levels = [], current = 0, playing = false, fps = 12,
    perFrame = [], camera = {}, keys = [], displayCount = frames.length } = {}) {
    const cells = Array.from({ length: displayCount }, (_, i) => ({
      index: i, number: i + 1, exists: i < frames.length,
      name: frames[i] ? String(frames[i]).split(/[\\/]/).pop() : "",
      key: i < frames.length && keys.includes(i + 1), camera: !!camera[i + 1]
    }));
    return { frames: cells, levels: [...levels], current, playing: !!playing,
      fps: Math.max(1, +fps || 12), exposures: levels.map(level => cells.map((f, i) =>
        !!(f.exists && perFrame[i] && perFrame[i].has(level)))) };
  }
  function selection(anchor, index, extend) {
    if (!extend) return { anchor: index, from: index, to: index };
    const a = anchor == null ? index : anchor;
    return { anchor: a, from: Math.min(a, index), to: Math.max(a, index) };
  }
  animation.timeline = { VIEW_DEFAULTS, FRAME_WIDTHS, DENSITIES, NAME_WIDTHS, normalizeViewState,
    nearestFrameWidth, rowHeight, nameWidth, majorTickStep, switchTrack, layerHasContent, visibleLayers,
    extent, fitFrameWidth, rangeFor, buildPanelState, selection };
})(window);
