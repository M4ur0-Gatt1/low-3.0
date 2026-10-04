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
  function caminoSuave(pts) {
    const n = pts.length, f = (v) => v.toFixed(1);
    if (n < 3) return `M ${f(pts[0][0])} ${f(pts[0][1])} L ${f(pts[n - 1][0])} ${f(pts[n - 1][1])}`;
    const tope = (x, y, max) => { const L = Math.hypot(x, y); return L > max && L > 0 ? [x * max / L, y * max / L] : [x, y]; };
    let d = `M ${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
      const tramo = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 2;
      const [m1x, m1y] = tope((p2[0] - p0[0]) / 6, (p2[1] - p0[1]) / 6, tramo);
      const [m2x, m2y] = tope((p3[0] - p1[0]) / 6, (p3[1] - p1[1]) / 6, tramo);
      d += ` C ${f(p1[0] + m1x)} ${f(p1[1] + m1y)} ${f(p2[0] - m2x)} ${f(p2[1] - m2y)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d;
  }
  drawing.strokeWidth = width; drawing.StrokeEngine = StrokeEngine; drawing.caminoSuave = caminoSuave;
})(window);
