/* ══════════════════════════════════════════════════════════════════════════
   ONION SKIN — sobre DIBUJOS, no sobre frames

   El papel cebolla anterior miraba `frameActual ± n`. Con un hold eso muestra
   el MISMO dibujo repetido tres veces: inútil, que es justo lo que hacía
   inaceptable el papel cebolla de LOW. Este módulo busca los dibujos
   DISTINTOS anteriores y posteriores, salteando los holds — como el onion skin
   de OpenToonz, que trabaja sobre la secuencia de dibujos expuestos.

   Dos modos, los mismos que usa OpenToonz:
     RELATIVO  n dibujos antes y después del actual, siempre respecto de donde
               estés parado.
     FIJO      frames marcados a mano, que se muestran siempre (para tener una
               pose clave de referencia mientras animás lejos de ella).

   Este módulo NO dibuja: decide QUÉ mostrar y con qué color y opacidad. El
   render es de la vista.

   @module animation/onion
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};

  const DEFAULTS = {
    enabled: true,
    before: 2,            // cuántos DIBUJOS anteriores
    after: 1,             // cuántos DIBUJOS posteriores
    alpha: 0.38,          // opacidad del más cercano
    falloff: 0.55,        // cuánto se desvanece cada dibujo más lejano
    colorBefore: "#c0392b",   // rojo: lo que ya pasó
    colorAfter: "#1e8449",    // verde: lo que viene
    fixed: [],            // frames marcados (modo fijo)
    linesOnly: false,     // mostrar solo la línea, sin rellenos
    // Perfiles opcionales de mesa de luz. Cada posición es la opacidad del
    // dibujo a esa distancia; null conserva el formato histórico alpha/falloff.
    beforeOpacity: null,
    afterOpacity: null,
  };
  const MAX_SLOTS = 10;

  function opacityAt(c, tipo, distancia) {
    const perfil = tipo === "before" ? c.beforeOpacity : c.afterOpacity;
    if (Array.isArray(perfil)) return Math.max(0, Math.min(1, Number(perfil[distancia - 1]) || 0));
    return c.alpha * Math.pow(c.falloff, distancia - 1);
  }

  function visibleCount(c, tipo) {
    const perfil = tipo === "before" ? c.beforeOpacity : c.afterOpacity;
    if (!Array.isArray(perfil)) return Math.max(0, Number(c[tipo]) || 0);
    let ultimo = 0;
    perfil.slice(0, MAX_SLOTS).forEach((v, i) => { if (Number(v) > 0.005) ultimo = i + 1; });
    return ultimo;
  }

  /** Frames de los N dibujos distintos anteriores/posteriores a `frame`.
   *  Devuelve los frames DONDE EMPIEZA cada exposición, para que el dibujo que
   *  se muestre sea el de la exposición completa y no una repetición. */
  function neighbours(layer, frame, count, dir) {
    const out = [];
    if (!layer || count <= 0) return out;
    let f = frame;
    let actual = layer.cellAt(layer.holdStart(frame));
    for (let i = 0; i < count; i++) {
      const sig = animation.exposures.nextDrawingFrame(layer, f, dir);
      if (sig == null) break;
      const inicio = layer.holdStart(sig);
      const num = layer.cellAt(inicio);
      if (num == null || num === actual) { f = sig; continue; }
      out.push({ frame: inicio, drawingNumber: num, distancia: i + 1 });
      actual = num;
      f = sig;
    }
    return out;
  }

  const onion = {
    DEFAULTS, MAX_SLOTS,

    config(parcial) { return { ...DEFAULTS, ...(parcial || {}) }; },

    /** Qué mostrar detrás del dibujo actual, ya resuelto: cada entrada trae el
     *  dibujo, su color y su opacidad. La vista solo tiene que pintarlo.
     *
     *  @param {Scene} scene
     *  @param {string} layerId
     *  @param {number} frame  frame actual
     *  @param {object} cfg    configuración (ver DEFAULTS)
     *  @returns {Array<{drawing, frame, color, opacity, tipo}>}
     */
    resolve(scene, layerId, frame, cfg) {
      const c = onion.config(cfg);
      if (!c.enabled || !scene) return [];
      const layer = scene.layer(layerId);
      const level = layer && scene.level(layer.levelId);
      if (!layer || !level) return [];

      const salida = [];
      const agregar = (info, color, tipo) => {
        const d = level.byNumber(info.drawingNumber);
        if (!d || d.isEmpty()) return;
        // cada dibujo más lejano se ve más tenue: da sensación de profundidad
        // temporal, que es para lo que sirve el papel cebolla
        const op = opacityAt(c, tipo, info.distancia);
        if (op <= 0.005) return;
        salida.push({ drawing: d, frame: info.frame, color, opacity: Math.max(0.01, op), tipo });
      };

      neighbours(layer, frame, visibleCount(c, "before"), -1).forEach((i) => agregar(i, c.colorBefore, "before"));
      neighbours(layer, frame, visibleCount(c, "after"), +1).forEach((i) => agregar(i, c.colorAfter, "after"));

      // FIJOS: se muestran siempre, sin importar dónde estés parado. Se pintan
      // con el color según queden antes o después del frame actual.
      for (const ff of c.fixed || []) {
        if (ff === frame) continue;
        const inicio = layer.holdStart(ff);
        const num = layer.cellAt(inicio);
        if (num == null) continue;
        const d = level.byNumber(num);
        if (!d || d.isEmpty()) continue;
        if (salida.some((s) => s.frame === inicio)) continue;   // ya lo trae el relativo
        salida.push({ drawing: d, frame: inicio, opacity: c.alpha,
                      color: inicio < frame ? c.colorBefore : c.colorAfter, tipo: "fixed" });
      }
      // los más lejanos primero: el más cercano al actual queda arriba
      return salida.sort((a, b) => a.opacity - b.opacity);
    },

    /** Marcas para pintar en la xsheet/timeline: qué frames están participando
     *  del onion skin ahora mismo (los rombos de OpenToonz). */
    markers(scene, layerId, frame, cfg) {
      return onion.resolve(scene, layerId, frame, cfg)
        .map((s) => ({ frame: s.frame, tipo: s.tipo, color: s.color }));
    },

    /** Activa/desactiva un marcador FIJO en un frame. */
    toggleFixed(cfg, frame) {
      const fijos = new Set((cfg.fixed || []).map(Number));
      if (fijos.has(frame)) fijos.delete(frame); else fijos.add(frame);
      return { ...cfg, fixed: [...fijos].sort((a, b) => a - b) };
    },
  };

  animation.onion = onion;
})(window);
