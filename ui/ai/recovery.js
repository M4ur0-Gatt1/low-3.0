(function (global) {
  "use strict";
  const ai = (global.LOW = global.LOW || {}).ai = global.LOW.ai || {};
  class RecoveryStore {
    constructor(storage = global.localStorage) { this.storage = storage; this.key = "low.ai.recovery.v1"; }
    checkpoint(taskId, state) { const data = this.read(); data[taskId] = { state, savedAt: Date.now() };
      try { this.storage?.setItem(this.key, JSON.stringify(data)); } catch (_) {} return data[taskId]; }
    read() { try { return JSON.parse(this.storage?.getItem(this.key) || "{}"); } catch (_) { return {}; } }
    get(taskId) { return this.read()[taskId] || null; }
    clear(taskId) { const data = this.read(); delete data[taskId]; try { this.storage?.setItem(this.key, JSON.stringify(data)); } catch (_) {} }
  }
  ai.recovery = new RecoveryStore();
})(window);
