(function (global) {
  "use strict";
  const drawing = (global.LOW = global.LOW || {}).drawing = global.LOW.drawing || {};
  class Stabilizer {
    constructor({ strength = .35, pressureStrength = .28, minDistance = .2 } = {}) {
      this.strength = Math.max(0, Math.min(.95, strength)); this.pressureStrength = pressureStrength;
      this.minDistance = minDistance; this.last = null;
    }
    reset() { this.last = null; }
    push(point) {
      if (!this.last) return this.last = { ...point };
      const dx = point.x - this.last.x, dy = point.y - this.last.y;
      if (Math.hypot(dx, dy) < this.minDistance) return null;
      const follow = 1 - this.strength;
      const out = { ...point, x: this.last.x + dx * follow, y: this.last.y + dy * follow,
        pressure: this.last.pressure + (point.pressure - this.last.pressure) * (1 - this.pressureStrength) };
      this.last = out; return out;
    }
  }
  drawing.Stabilizer = Stabilizer;
})(window);
