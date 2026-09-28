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
  drawing.strokeWidth = width; drawing.StrokeEngine = StrokeEngine;
})(window);
