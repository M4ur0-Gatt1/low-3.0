/* Autoridad única de gestos de LOW. Dibujo, rigging y futuras herramientas
   comparten esta sesión para que sólo una pueda poseer el puntero a la vez. */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const input = LOW.input = LOW.input || {};
  class PointerController {
    constructor() { this.epoch = 0; this.active = null; }
    begin({ owner = "tool", pointerId = null, cancel = null } = {}) {
      this.cancel("superseded");
      const token = ++this.epoch;
      this.active = { token, owner, pointerId,
        cancel: typeof cancel === "function" ? cancel : null };
      return token;
    }
    current(token) { return !!this.active && this.active.token === token; }
    owns(owner, pointerId = null) {
      const a = this.active;
      return !!a && a.owner === owner && (pointerId == null || a.pointerId == null || a.pointerId === pointerId);
    }
    accepts(token, pointerId = null) {
      const a = this.active;
      return this.current(token) && (pointerId == null || a.pointerId == null || a.pointerId === pointerId);
    }
    finish(token, pointerId = null) {
      if (!this.accepts(token, pointerId)) return false;
      this.active = null; return true;
    }
    cancel(reason = "cancel") {
      const a = this.active;
      if (!a) return false;
      this.active = null; this.epoch++;
      a.cancel?.(reason); return true;
    }
    transition() { return this.cancel("transition"); }
  }
  input.PointerController = PointerController;
  input.createPointerController = () => new PointerController();
  input.pointerController = input.pointerController || new PointerController();
})(typeof window !== "undefined" ? window : globalThis);
