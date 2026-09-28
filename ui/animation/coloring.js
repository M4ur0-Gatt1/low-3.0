/* ══════════════════════════════════════════════════════════════════════════
   COLORING — identidad de zonas y propagación verificable

   El color no se copia a "la misma coordenada" del dibujo siguiente. Esa
   estrategia funciona mientras la animación casi no se mueve y falla justo
   cuando más importa. LOW identifica la zona, compara forma, tamaño y
   trayectoria, y se niega a pintar si dos candidatos son igualmente
   probables. Un cuadro omitido y denunciado es recuperable; un color puesto en
   el ojo equivocado a lo largo de cien dibujos no lo es.

   Este núcleo no toca el DOM. Describe máscaras, decide coincidencias y
   resuelve el alcance temporal; el adaptador del lienzo rasteriza/traza SVG.

   @module animation/coloring
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};

  const DEFAULTS = Object.freeze({
    mode: "paint",              // paint | unpainted | repaint | unpaint
    scope: "level",             // current | selection | onion | level
    gap: 2,                      // cierre visual de huecos, en píxeles
    minConfidence: 0.64,
    ambiguityMargin: 0.07,
    grid: 8,
  });
  const MODES = new Set(["paint", "unpainted", "repaint", "unpaint"]);
  const SCOPES = new Set(["current", "selection", "onion", "level"]);
  const clamp = (n, a, b) => Math.max(a, Math.min(b, Number(n) || 0));

  function normalizeSettings(value) {
    const v = value || {};
    return {
      mode: MODES.has(v.mode) ? v.mode : DEFAULTS.mode,
      scope: SCOPES.has(v.scope) ? v.scope : DEFAULTS.scope,
      gap: Math.round(clamp(v.gap == null ? DEFAULTS.gap : v.gap, 0, 10)),
      minConfidence: clamp(v.minConfidence == null ? DEFAULTS.minConfidence : v.minConfidence, .35, .95),
      ambiguityMargin: clamp(v.ambiguityMargin == null ? DEFAULTS.ambiguityMargin : v.ambiguityMargin, .01, .3),
      grid: Math.round(clamp(v.grid == null ? DEFAULTS.grid : v.grid, 4, 16)),
    };
  }

  function zoneId() {
    if (global.crypto && typeof global.crypto.randomUUID === "function")
      return "zone-" + global.crypto.randomUUID();
    return "zone-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  /** Descriptor invariante al tamaño del raster. `mask` usa 1 para la zona. */
  function describeMask(mask, width, height, gridSize) {
    const w = Math.max(1, width | 0), h = Math.max(1, height | 0);
    const grid = Math.max(4, Math.min(16, gridSize | 0 || DEFAULTS.grid));
    let count = 0, sx = 0, sy = 0, minX = w, minY = h, maxX = -1, maxY = -1;
    for (let i = 0; i < w * h; i++) {
      if (!mask[i]) continue;
      const x = i % w, y = (i / w) | 0;
      count++; sx += x; sy += y;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    if (!count) return null;
    const bw = Math.max(1, maxX - minX + 1), bh = Math.max(1, maxY - minY + 1);
    const signature = new Array(grid * grid).fill(0);
    const capacity = new Array(grid * grid).fill(0);
    for (let gy = 0; gy < grid; gy++) for (let gx = 0; gx < grid; gx++) {
      const x0 = minX + Math.floor(gx * bw / grid), x1 = minX + Math.floor((gx + 1) * bw / grid);
      const y0 = minY + Math.floor(gy * bh / grid), y1 = minY + Math.floor((gy + 1) * bh / grid);
      capacity[gy * grid + gx] = Math.max(1, (x1 - x0) * (y1 - y0));
    }
    for (let i = 0; i < w * h; i++) {
      if (!mask[i]) continue;
      const x = i % w, y = (i / w) | 0;
      const gx = Math.min(grid - 1, Math.floor((x - minX) / bw * grid));
      const gy = Math.min(grid - 1, Math.floor((y - minY) / bh * grid));
      signature[gy * grid + gx]++;
    }
    for (let i = 0; i < signature.length; i++) signature[i] /= capacity[i];
    return {
      count,
      area: count / (w * h),
      centroid: { x: (sx / count + .5) / w, y: (sy / count + .5) / h },
      bbox: { x: minX / w, y: minY / h, w: bw / w, h: bh / h },
      aspect: bw / bh,
      signature,
    };
  }

  function signatureSimilarity(a, b) {
    const x = a || [], y = b || [];
    if (!x.length || x.length !== y.length) return .5;
    let error = 0;
    for (let i = 0; i < x.length; i++) error += Math.abs(x[i] - y[i]);
    return clamp(1 - error / x.length, 0, 1);
  }

  /** Puntaje explicable: no hay una red opaca que pueda inventar una zona. */
  function scoreRegion(reference, candidate, predicted) {
    if (!reference || !candidate || !candidate.centroid) return 0;
    const p = predicted || reference.centroid;
    const distance = Math.hypot(candidate.centroid.x - p.x, candidate.centroid.y - p.y);
    const distanceScore = Math.exp(-distance / .22);
    const areaScore = Math.exp(-Math.abs(Math.log(Math.max(1e-8, candidate.area) /
      Math.max(1e-8, reference.area))));
    const aspectScore = Math.exp(-Math.abs(Math.log(Math.max(1e-8, candidate.aspect) /
      Math.max(1e-8, reference.aspect))));
    const shapeScore = signatureSimilarity(reference.signature, candidate.signature);
    return clamp(.38 * shapeScore + .25 * distanceScore + .22 * areaScore + .15 * aspectScore, 0, 1);
  }

  function matchRegion(reference, candidates, options) {
    const cfg = normalizeSettings(options);
    const predicted = options && options.predicted ? options.predicted : reference && reference.centroid;
    const ranked = (candidates || []).map((candidate) => ({
      candidate, score: scoreRegion(reference, candidate, predicted)
    })).sort((a, b) => b.score - a.score);
    if (!ranked.length) return { candidate: null, confidence: 0, accepted: false, reason: "no-candidates" };
    const best = ranked[0], second = ranked[1];
    const margin = second ? best.score - second.score : 1;
    if (best.score < cfg.minConfidence)
      return { candidate: null, confidence: best.score, accepted: false, reason: "low-confidence", margin, ranked };
    if (second && margin < cfg.ambiguityMargin)
      return { candidate: null, confidence: best.score, accepted: false, reason: "ambiguous", margin, ranked };
    return { candidate: best.candidate, confidence: best.score, accepted: true, reason: "matched", margin, ranked };
  }

  /** Dibujos únicos del nivel activo, ordenados por su primera exposición. */
  function scopeTargets(doc, scope) {
    if (!doc || !doc.layer || !doc.level) return [];
    const ly = doc.layer, lv = doc.level, current = doc.drawing;
    const chosen = SCOPES.has(scope) ? scope : DEFAULTS.scope;
    let from = 1, to = Math.max(ly.lastFrame ? ly.lastFrame() : ly.cells.length, doc.frame || 1);
    if (chosen === "current") from = to = doc.frame;
    else if (chosen === "selection") {
      const s = doc.cellSelection;
      if (s && (s.fromLayerId === ly.id || s.toLayerId === ly.id || s.anchorLayerId === ly.id)) {
        from = Math.max(1, s.from | 0); to = Math.max(from, s.to | 0);
      } else from = to = doc.frame;
    } else if (chosen === "onion" && animation.onion) {
      const resolved = animation.onion.resolve(doc.scene, ly.id, doc.frame, doc.onionCfg || {});
      const numbers = new Set(resolved.map((item) => item.drawing && item.drawing.number));
      if (current) numbers.add(current.number);
      return lv.drawings.filter((d) => numbers.has(d.number)).map((drawing) => ({
        layerId: ly.id, levelId: lv.id, drawing, number: drawing.number,
        frame: drawing === current ? doc.frame : firstFrame(ly, drawing.number),
      })).sort((a, b) => a.frame - b.frame || a.number - b.number);
    }
    const seen = new Set(), out = [];
    for (let frame = from; frame <= to; frame++) {
      const number = ly.cellAt(frame);
      if (number == null || seen.has(number)) continue;
      const drawing = lv.byNumber(number); if (!drawing) continue;
      seen.add(number); out.push({ layerId: ly.id, levelId: lv.id, drawing, number, frame });
    }
    if (chosen === "level") for (const drawing of lv.drawings) if (!seen.has(drawing.number)) {
      out.push({ layerId: ly.id, levelId: lv.id, drawing, number: drawing.number,
        frame: firstFrame(ly, drawing.number) || Number.MAX_SAFE_INTEGER });
    }
    if (current && !seen.has(current.number))
      out.push({ layerId: ly.id, levelId: lv.id, drawing: current, number: current.number, frame: doc.frame });
    return out.sort((a, b) => a.frame - b.frame || a.number - b.number);
  }
  function firstFrame(layer, number) {
    const i = layer.cells.findIndex((n) => n === number);
    return i < 0 ? 0 : i + 1;
  }

  animation.coloring = {
    DEFAULTS, normalizeSettings, zoneId, describeMask, signatureSimilarity,
    scoreRegion, matchRegion, scopeTargets,
  };
})(window);
