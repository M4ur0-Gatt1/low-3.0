(function (global) {
  "use strict";
  const drawing = (global.LOW = global.LOW || {}).drawing = global.LOW.drawing || {};
  function width(point, brush) { const p = Math.pow(Math.max(.001, point.pressure), brush.pressureGamma || .85);
    return Math.max(.1, (brush.size || 1) * (1 - (brush.pressureSize || 0) + (brush.pressureSize || 0) * p)); }
  class StrokeEngine {
    constructor(brush, options = {}) { this.brush = brush; this.points = []; this.stabilizer = new drawing.Stabilizer({ strength: brush.smoothing ?? options.smoothing }); }
    start(point) { this.points = []; this.stabilizer.reset(); return this.add(point); }
    add(point) { const p = this.stabilizer.push(point); if (!p) return null; const value = { ...p, width: width(p, this.brush) }; this.points.push(value); return value; }
    finish(point) { if (point) this.add(point); return this.points.slice(); }
  }
  /* La curva del trazo: Catmull-Rom por los puntos, en «M x y C ...».
     NINGUNA MANIJA PASA LA MITAD DE SU TRAMO. Catmull-Rom uniforme toma la
     manija de (p3 - p1) / 6: si el tramo siguiente es mucho más largo, la manija
     se dispara hacia atrás y la curva RETROCEDE. Medido (oct-2026): una línea
     lenta simplificada a [inicio, un punto cerca, final lejos] arrancaba 96
     unidades ANTES de donde se apoyó el lápiz. Con puntos parejos la manija es
     ~1/3 del tramo y el tope no cambia nada. tools/run_trazo_tests.js */
  /* LAS ESQUINAS SE RESPETAN (oct-2026). Pedido de Mauro: «el trazo no sigue
     la mano». Medido en la app real: una V aguda, simplificada a [inicio,
     punta, fin], salía como una U —la curva pasaba por la punta con la
     manija horizontal— y se separaba hasta 8 px del recorrido del lápiz.
     Donde el trazo DOBLA más de 65°, las manijas de ese punto son cero: la
     esquina queda en punta. Una curva suave (giros chicos) no cambia. */
  const COS_ESQUINA = Math.cos(65 * Math.PI / 180);
  function esEsquina(pts, i) {
    if (i <= 0 || i >= pts.length - 1) return false;
    const ax = pts[i][0] - pts[i - 1][0], ay = pts[i][1] - pts[i - 1][1], bx = pts[i + 1][0] - pts[i][0], by = pts[i + 1][1] - pts[i][1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (!la || !lb) return false;
    return (ax * bx + ay * by) / (la * lb) < COS_ESQUINA;
  }
  /** Las manijas del tramo i→i+1 (Catmull-Rom con tope y esquinas). */
  function manijas(pts, i) {
    const n = pts.length, p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    const tope = (x, y, max) => { const L = Math.hypot(x, y); return L > max && L > 0 ? [x * max / L, y * max / L] : [x, y]; };
    const tramo = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2;
    const m1 = esEsquina(pts, i) ? [0, 0] : tope((p2[0] - p0[0]) / 6, (p2[1] - p0[1]) / 6, tramo);
    const m2 = esEsquina(pts, i + 1) ? [0, 0] : tope((p3[0] - p1[0]) / 6, (p3[1] - p1[1]) / 6, tramo);
    return [p1[0] + m1[0], p1[1] + m1[1], p2[0] - m2[0], p2[1] - m2[1]];
  }
  function caminoSuave(pts) {
    const n = pts.length, f = (v) => v.toFixed(1);
    if (n < 3) return `M ${f(pts[0][0])} ${f(pts[0][1])} L ${f(pts[n - 1][0])} ${f(pts[n - 1][1])}`;
    let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 0; i < n - 1; i++) {
      const [c1x, c1y, c2x, c2y] = manijas(pts, i), p2 = pts[i + 1];
      d += ` C ${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d;
  }
  /** Puntos a lo largo de la MISMA curva, cada `paso` unidades: para que el
   *  pincel siga la curva del trazo (y sus esquinas) en vez de unir los puntos
   *  simplificados con rectas, que en un trazo grande se veían como facetas.
   *  Presión, inclinación y hora se interpolan; los puntos de entrada quedan. */
  function puntosDeCurva(pts, paso) {
    const n = pts ? pts.length : 0;
    if (n < 3 || !(paso > 0)) return pts;
    const out = [pts[0]];
    for (let i = 0; i < n - 1; i++) {
      const [c1x, c1y, c2x, c2y] = manijas(pts, i), a = pts[i], b = pts[i + 1];
      const largo = Math.hypot(c1x - a[0], c1y - a[1]) + Math.hypot(c2x - c1x, c2y - c1y) + Math.hypot(b[0] - c2x, b[1] - c2y);
      const k = Math.max(1, Math.min(400, Math.ceil(largo / paso)));
      for (let j = 1; j <= k; j++) {
        const t = j / k, u = 1 - t;
        if (j === k) { out.push(b); break; }
        const x = u * u * u * a[0] + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * b[0];
        const y = u * u * u * a[1] + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * b[1];
        const q = [x, y];
        for (let c = 2; c < Math.max(a.length, b.length); c++) q.push(a[c] == null || b[c] == null ? (a[c] ?? b[c]) : a[c] + (b[c] - a[c]) * t);
        out.push(q);
      }
    }
    return out;
  }
  drawing.strokeWidth = width; drawing.StrokeEngine = StrokeEngine; drawing.caminoSuave = caminoSuave; drawing.puntosDeCurva = puntosDeCurva; drawing.esEsquina = esEsquina;
})(window);
