(function (global) {
  "use strict";

  const LOW = global.LOW = global.LOW || {};
  const drawing = LOW.drawing = LOW.drawing || {};
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  const lerp = (a, b, t) => a + (b - a) * t;

  /** Formas de sello de los pinceles raster. «ellipse» es el sello redondo de
   *  siempre; las otras son para los pinceles de EFECTOS (destellos, pasto,
   *  confeti, hojas, rayado). */
  const SHAPES = ["ellipse", "star", "blade", "leaf", "square", "line", "dot"];

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
      textureStrength: clamp(input.textureStrength ?? .6, 0, 1),
      textureScale: clamp(input.textureScale ?? 1, .2, 5),
      // REMATE: el trazo arranca y termina en punta aunque la presión no baje
      // (y con el mouse, que no tiene presión). Fracción de un largo de
      // 6 veces el tamaño del pincel.
      taperStart: clamp(input.taperStart ?? 0, 0, 1),
      taperEnd: clamp(input.taperEnd ?? 0, 0, 1),
      shape: SHAPES.includes(input.shape) ? input.shape : "ellipse",
      sizeJitter: clamp(input.sizeJitter ?? 0, 0, 1),
      angleJitter: clamp(input.angleJitter ?? 0, 0, 1),
      opacityJitter: clamp(input.opacityJitter ?? 0, 0, 1),
      hueJitter: clamp(input.hueJitter ?? 0, 0, 1),
      glow: clamp(input.glow ?? 0, 0, 1),
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
    const last = points[points.length - 1], ultimo = result[result.length - 1];
    // el punto final, salvo que coincida con el último sello: un TOQUE (dos
    // puntos en el mismo lugar) dejaba DOS sellos encimados, el doble de tinta
    if (ultimo !== last && Math.hypot(last.x - ultimo.x, last.y - ultimo.y) > 1e-6) result.push(last);
    return result;
  }

  /** El factor de ancho de cada muestra por los REMATES de inicio y fin: 1 en
   *  el cuerpo, bajando a una punta fina en los extremos. Sin remates, null. */
  function remates(samples, brush) {
    if (!(brush.taperStart > 0 || brush.taperEnd > 0) || samples.length < 2) return null;
    const s = [0];
    for (let i = 1; i < samples.length; i++) s.push(s[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y));
    const L = s[s.length - 1] || 1;
    const li = Math.min(L / 2, brush.taperStart * brush.size * 6), lf = Math.min(L / 2, brush.taperEnd * brush.size * 6);
    const curva = (t) => Math.sin(Math.max(0, Math.min(1, t)) * Math.PI / 2);
    return s.map((d) => Math.max(.08, (li > 0 ? curva(d / li) : 1) * (lf > 0 ? curva((L - d) / lf) : 1)));
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

  /* EL CONTORNO DE UNA CINTA VECTORIAL, SUAVE (oct-2026).
     Reporte: «el pincel por defecto es un poco vectorial, tosco; que sea más
     fluido y suave». El contorno era un polígono de segmentos rectos: cada
     muestra un vértice, con el ancho de la presión crudo (un escalón por
     muestra) y la normal tomada del vecino inmediato (salta en cada curva), y
     los extremos cortados en recto. Ahora:
     1. el ANCHO se suaviza a lo largo del trazo (ventana de ~medio grosor):
        la presión ya no deja escalones en el borde;
     2. la DIRECCIÓN sale de una ventana, no del vecino: los dos bordes quedan
        paralelos y no se pliegan en las curvas;
     3. REMATES REDONDOS cuando el trazo no termina en punta;
     4. el borde es una CURVA (cuadráticas por los puntos medios), sin facetas.
     Se devuelven también `left` y `right`, los dos bordes, para quien los mida. */
  function suavizarSerie(valores, largos, ventana) {
    if (!(ventana > 0) || valores.length < 3) return valores.slice();
    const out = new Array(valores.length);
    for (let i = 0; i < valores.length; i++) {
      let suma = 0, peso = 0;
      for (let j = i; j >= 0 && largos[i] - largos[j] <= ventana; j--) { const w = 1 - (largos[i] - largos[j]) / (ventana + 1e-9); suma += valores[j] * w; peso += w; }
      for (let j = i + 1; j < valores.length && largos[j] - largos[i] <= ventana; j++) { const w = 1 - (largos[j] - largos[i]) / (ventana + 1e-9); suma += valores[j] * w; peso += w; }
      out[i] = peso ? suma / peso : valores[i];
    }
    return out;
  }
  /* Ramer-Douglas-Peucker iterativo: se queda con los puntos que se apartan
     más de `tol` de la recta entre los que ya quedaron. */
  function simplificar(pts, tol) {
    if (pts.length < 3) return pts.slice();
    const queda = new Uint8Array(pts.length); queda[0] = queda[pts.length - 1] = 1;
    const pila = [[0, pts.length - 1]];
    while (pila.length) {
      const [i, j] = pila.pop(), a = pts[i], b = pts[j];
      const dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1e-9;
      let peor = -1, dist = tol;
      for (let k = i + 1; k < j; k++) {
        const d = Math.abs((pts[k].x - a.x) * dy - (pts[k].y - a.y) * dx) / l;
        if (d > dist) { dist = d; peor = k; }
      }
      if (peor > 0) { queda[peor] = 1; pila.push([i, peor], [peor, j]); }
    }
    return pts.filter((_, k) => queda[k]);
  }
  function contornoCurvo(puntos) {
    const n = puntos.length, f = (v) => v.toFixed(2);
    if (n < 3) return `M ${puntos.map((p) => f(p.x) + " " + f(p.y)).join(" L ")} Z`;
    const medio = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
    const m0 = medio(puntos[n - 1], puntos[0]);
    let d = `M ${f(m0.x)} ${f(m0.y)}`;
    for (let i = 0; i < n; i++) {
      const p = puntos[i], m = medio(p, puntos[(i + 1) % n]);
      d += ` Q ${f(p.x)} ${f(p.y)} ${f(m.x)} ${f(m.y)}`;
    }
    return d + " Z";
  }
  function buildVectorOutline(points, inputBrush) {
    const brush = normalizeBrush({ ...inputBrush, engine: "vector" });
    if (points.length < 2) return null;
    // la cinta se muestrea a una resolución fija: el ESPACIADO es de los sellos
    // (raster) y en la cinta no cambiaba la forma (se declara inerte en el Estudio)
    const samples = disperse(resample(points, Math.max(.35, brush.size * .04)), brush);
    const remate = remates(samples, brush);
    const largos = [0];
    for (let i = 1; i < samples.length; i++) largos.push(largos[i - 1] + Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y));
    // 1. el ancho, suavizado a lo largo del trazo
    const crudos = samples.map((p, i) => dynamics(p, brush, samples[Math.max(0, i - 1)]).width * .5);
    const anchos = suavizarSerie(crudos, largos, Math.max(.6, brush.size * .5)).map((w, i) => w * (remate ? remate[i] : 1));
    // 2. la dirección, de una ventana alrededor de cada muestra
    const alcance = Math.max(.5, brush.size * .35);
    const left = [], right = [];
    let a = 0, b = 0;
    for (let i = 0; i < samples.length; i++) {
      while (a < i && largos[i] - largos[a] > alcance) a++;
      while (b < samples.length - 1 && largos[b + 1] - largos[i] <= alcance) b++;
      const prev = samples[Math.min(a, Math.max(0, i - 1))], next = samples[Math.max(b, Math.min(samples.length - 1, i + 1))];
      const dx = next.x - prev.x, dy = next.y - prev.y, length = Math.hypot(dx, dy) || 1;
      const p = samples[i], w = anchos[i], nx = -dy / length, ny = dx / length;
      left.push({ x: p.x + nx * w, y: p.y + ny * w });
      right.push({ x: p.x - nx * w, y: p.y - ny * w });
    }
    // 3. remates redondos donde el trazo no termina en punta
    const tapa = (centro, radio, dir, desde) => {
      const pts = [], pasos = Math.max(4, Math.min(16, Math.round(radio * 2)));
      for (let k = 1; k < pasos; k++) {
        const ang = Math.PI * k / pasos, c = Math.cos(ang), s = Math.sin(ang);
        pts.push({ x: centro.x + desde.x * c + dir.x * s * radio, y: centro.y + desde.y * c + dir.y * s * radio });
      }
      return pts;
    };
    const n = samples.length;
    const tangente = (i, j) => { const dx = samples[j].x - samples[i].x, dy = samples[j].y - samples[i].y, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; };
    const fin = [], inicio = [];
    if (anchos[n - 1] > .3 && n > 1) {
      const t = tangente(Math.max(0, n - 1 - 3), n - 1), w = anchos[n - 1];
      const desde = { x: left[n - 1].x - samples[n - 1].x, y: left[n - 1].y - samples[n - 1].y };
      fin.push(...tapa(samples[n - 1], w, t, desde));
    }
    if (anchos[0] > .3 && n > 1) {
      const t = tangente(Math.min(n - 1, 3), 0), w = anchos[0];
      const desde = { x: right[0].x - samples[0].x, y: right[0].y - samples[0].y };
      inicio.push(...tapa(samples[0], w, t, desde));
    }
    // 4. el borde como curva, con los puntos que hacen falta: el motor muestrea
    // cada 0,35 unidades y un trazo de 1000 unidades dejaba 6000 vértices
    // (~190 KB por trazo en el archivo). En lo recto sobran; en la curva no.
    const tol = Math.max(.04, brush.size * .01);
    const anillo = [...simplificar(left, tol), ...fin, ...simplificar(right.slice().reverse(), tol), ...inicio];
    return { path: contornoCurvo(anillo), samples, left, right };
  }

  function buildRasterDabs(points, inputBrush) {
    const brush = normalizeBrush({ ...inputBrush, engine: "raster" });
    if (!points.length) return [];
    const samples = resample(points, Math.max(.35, brush.size * brush.spacing));
    const random = seeded(brush.seed);
    // la VARIACIÓN por sello va por otra secuencia: así los pinceles de
    // siempre (sin variación) dejan exactamente los mismos sellos que antes
    const azar = seeded((brush.seed ^ 0x9e3779b9) >>> 0 || 7);
    const remate = remates(samples, brush);
    return samples.map((point, index) => {
      const previous = samples[Math.max(0, index - 1)];
      const value = dynamics(point, brush, previous);
      const direction = Math.atan2(point.y - previous.y, point.x - previous.x) * 180 / Math.PI;
      const scatter = brush.scatter * value.width;
      const r1 = azar(), r2 = azar(), r3 = azar(), r4 = azar();
      const width = value.width * (remate ? remate[index] : 1) * (1 - brush.sizeJitter * r1);
      return {
        x: point.x + (random() - .5) * scatter,
        y: point.y + (random() - .5) * scatter,
        width,
        height: width * brush.roundness,
        opacity: value.opacity * brush.flow * (1 - brush.opacityJitter * r3),
        hardness: brush.hardness,
        angle: brush.angle + (brush.angleFollowsStroke ? direction : 0) + (r2 - .5) * 360 * brush.angleJitter,
        hue: brush.hueJitter ? (r4 - .5) * 360 * brush.hueJitter : 0,
        shape: brush.shape,
        texture: brush.texture,
        eraser: brush.eraser
      };
    });
  }

  drawing.brushEngine = Object.freeze({ normalizeBrush, dynamics, resample, buildVectorOutline, buildRasterDabs, remates, SHAPES });
})(typeof window !== "undefined" ? window : globalThis);
