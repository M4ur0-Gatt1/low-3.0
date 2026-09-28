(function (global) {
  "use strict";

  const LOW = global.LOW = global.LOW || {};
  const drawing = LOW.drawing = LOW.drawing || {};
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const lerp = (a, b, t) => a + (b - a) * t;

  function normalizeBrush(input = {}) {
    const engine = input.engine === "raster" ? "raster" : "vector";
    return Object.freeze({
      id: String(input.id || "custom-brush"),
      name: String(input.name || "Pincel"),
      engine,
      size: clamp(input.size ?? 6, .1, 512),
      opacity: clamp(input.opacity ?? 1, 0, 1),
      flow: clamp(input.flow ?? 1, .01, 1),
      spacing: clamp(input.spacing ?? (engine === "raster" ? .12 : .04), .01, 2),
      hardness: clamp(input.hardness ?? .8, 0, 1),
      smoothing: clamp(input.smoothing ?? .35, 0, 1),
      pressureSize: clamp(input.pressureSize ?? .75, 0, 1),
      pressureOpacity: clamp(input.pressureOpacity ?? 0, 0, 1),
      pressureGamma: clamp(input.pressureGamma ?? .85, .1, 4),
      tiltSize: clamp(input.tiltSize ?? 0, 0, 1),
      velocitySize: clamp(input.velocitySize ?? 0, 0, 1),
      angle: Number(input.angle) || 0,
      angleFollowsStroke: input.angleFollowsStroke !== false,
      roundness: clamp(input.roundness ?? 1, .05, 1),
      scatter: clamp(input.scatter ?? 0, 0, 2),
      texture: input.texture ? String(input.texture) : null,
      eraser: !!input.eraser,
      seed: (Number(input.seed) || 1) >>> 0
    });
  }

  function dynamics(point, brush, previous) {
    const pressure = Math.pow(clamp(point.pressure ?? 1, .001, 1), brush.pressureGamma);
    const tilt = clamp(Math.hypot(point.tiltX || 0, point.tiltY || 0) / 90, 0, 1);
    const dt = Math.max(1, (point.time || 0) - (previous?.time || point.time || 0));
    const distance = previous ? Math.hypot(point.x - previous.x, point.y - previous.y) : 0;
    const velocity = clamp(distance / dt / 2, 0, 1);
    const pressureScale = lerp(1, pressure, brush.pressureSize);
    const tiltScale = lerp(1, 1 + tilt * .65, brush.tiltSize);
    const velocityScale = lerp(1, 1 - velocity * .7, brush.velocitySize);
    return {
      width: Math.max(.1, brush.size * pressureScale * tiltScale * velocityScale),
      opacity: clamp(brush.opacity * lerp(1, pressure, brush.pressureOpacity), 0, 1),
      velocity,
      tilt
    };
  }

  function seeded(seed) {
    let state = seed || 1;
    return () => ((state = Math.imul(48271, state) | 0) >>> 0) / 4294967296;
  }

  function resample(points, spacing) {
    if (!points.length) return [];
    if (points.length === 1) return [points[0]];
    const result = [points[0]];
    let carry = 0;
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1], b = points[i];
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      if (!length) continue;
      let cursor = Math.max(0, spacing - carry);
      while (cursor <= length) {
        const t = cursor / length;
        result.push({
          x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t),
          pressure: lerp(a.pressure, b.pressure, t),
          tiltX: lerp(a.tiltX || 0, b.tiltX || 0, t),
          tiltY: lerp(a.tiltY || 0, b.tiltY || 0, t),
          time: lerp(a.time || 0, b.time || 0, t)
        });
        cursor += spacing;
      }
      carry = (carry + length) % spacing;
    }
    const last = points[points.length - 1];
    if (result[result.length - 1] !== last) result.push(last);
    return result;
  }

  /* DISPERSION EN VECTORIAL. En raster la dispersion corre cada sello por su
     cuenta; una cinta vectorial no tiene sellos, tiene un eje. Asi que la
     dispersion corre EL EJE: el trazo sale tembloroso en vez de limpio, que es
     lo que uno espera de un pincel disperso.

     Sin esto el deslizador existia y no hacia nada: medido, mover Dispersion
     de 0 a 2 en un pincel vectorial daba el trazo identico. Con scatter 0 la
     lista se devuelve tal cual y no se paga nada. */
  function disperse(samples, brush) {
    if (!(brush.scatter > 0) || samples.length < 3) return samples;
    const random = seeded(brush.seed);
    const alcance = brush.scatter * brush.size * .35;
    return samples.map((p, i) => {
      // Las puntas quedan quietas: el trazo tiene que empezar y terminar donde
      // el dibujante apoyo y levanto el lapiz.
      if (i === 0 || i === samples.length - 1) return p;
      return { ...p, x: p.x + (random() - .5) * alcance, y: p.y + (random() - .5) * alcance };
    });
  }

  function buildVectorOutline(points, inputBrush) {
    const brush = normalizeBrush({ ...inputBrush, engine: "vector" });
    if (points.length < 2) return null;
    const samples = disperse(resample(points, Math.max(.35, brush.size * brush.spacing)), brush);
    const left = [], right = [];
    for (let i = 0; i < samples.length; i++) {
      const p = samples[i], prev = samples[Math.max(0, i - 1)], next = samples[Math.min(samples.length - 1, i + 1)];
      const dx = next.x - prev.x, dy = next.y - prev.y, length = Math.hypot(dx, dy) || 1;
      const width = dynamics(p, brush, prev).width * .5;
      const nx = -dy / length, ny = dx / length;
      left.push({ x: p.x + nx * width, y: p.y + ny * width });
      right.push({ x: p.x - nx * width, y: p.y - ny * width });
    }
    const fmt = p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    return { path: `M ${fmt(left[0])} L ${left.slice(1).map(fmt).join(" L ")} L ${right.reverse().map(fmt).join(" L ")} Z`, samples };
  }

  function buildRasterDabs(points, inputBrush) {
    const brush = normalizeBrush({ ...inputBrush, engine: "raster" });
    if (!points.length) return [];
    const samples = resample(points, Math.max(.35, brush.size * brush.spacing));
    const random = seeded(brush.seed);
    return samples.map((point, index) => {
      const previous = samples[Math.max(0, index - 1)];
      const value = dynamics(point, brush, previous);
      const direction = Math.atan2(point.y - previous.y, point.x - previous.x) * 180 / Math.PI;
      const scatter = brush.scatter * value.width;
      return {
        x: point.x + (random() - .5) * scatter,
        y: point.y + (random() - .5) * scatter,
        width: value.width,
        height: value.width * brush.roundness,
        opacity: value.opacity * brush.flow,
        hardness: brush.hardness,
        angle: brush.angle + (brush.angleFollowsStroke ? direction : 0),
        texture: brush.texture,
        eraser: brush.eraser
      };
    });
  }

  drawing.brushEngine = Object.freeze({ normalizeBrush, dynamics, resample, buildVectorOutline, buildRasterDabs });
})(typeof window !== "undefined" ? window : globalThis);
