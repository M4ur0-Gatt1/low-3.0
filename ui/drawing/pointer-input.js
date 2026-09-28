(function (global) {
  "use strict";
  const drawing = (global.LOW = global.LOW || {}).drawing = global.LOW.drawing || {};
  function sample(event, map = (x, y) => ({ x, y })) {
    const p = map(event.clientX, event.clientY); const pen = event.pointerType === "pen";
    return { x: p.x, y: p.y, pressure: pen ? Math.max(.001, event.pressure || .001) : 1,
      tiltX: event.tiltX || 0, tiltY: event.tiltY || 0, twist: event.twist || 0,
      tangentialPressure: event.tangentialPressure || 0, pointerType: event.pointerType || "mouse",
      eraser: event.pointerType === "eraser" || (pen && (event.buttons & 32) !== 0), time: event.timeStamp };
  }
  class PointerInput {
    constructor(element, options = {}) { this.element = element; this.map = options.map; this.active = new Map(); this.handlers = {};
      this.down = this.down.bind(this); this.move = this.move.bind(this); this.up = this.up.bind(this); }
    on(name, fn) { this.handlers[name] = fn; return this; }
    attach() { this.element.style.touchAction = "none"; this.element.addEventListener("pointerdown", this.down);
      this.element.addEventListener("pointermove", this.move); this.element.addEventListener("pointerup", this.up);
      this.element.addEventListener("pointercancel", this.up); return this; }
    detach() { ["pointerdown", "pointermove", "pointerup", "pointercancel"].forEach((n, i) =>
      this.element.removeEventListener(n, [this.down, this.move, this.up, this.up][i])); }
    down(e) { this.element.setPointerCapture?.(e.pointerId); this.active.set(e.pointerId, true); this.handlers.start?.(sample(e, this.map), e); }
    move(e) { if (!this.active.has(e.pointerId)) return; const events = e.getCoalescedEvents?.() || [e];
      this.handlers.move?.(events.map(x => sample(x, this.map)), e); }
    up(e) { if (!this.active.delete(e.pointerId)) return; this.handlers.end?.(sample(e, this.map), e); }
  }
  drawing.pointerSample = sample; drawing.PointerInput = PointerInput;
})(window);
