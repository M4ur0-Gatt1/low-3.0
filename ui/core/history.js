(function (global) {
  "use strict";
  const core = (global.LOW = global.LOW || {}).core = global.LOW.core || {};
  class HistoryManager {
    constructor({ limit = 180, onChange = () => {} } = {}) {
      this.limit = limit; this.onChange = onChange; this.undoStack = []; this.redoStack = [];
      this.transaction = null;
    }
    push(entry) {
      if (!entry || typeof entry.apply !== "function") throw Error("Entrada de historial inválida");
      if (this.transaction) { this.transaction.entries.push(entry); return entry; }
      this.undoStack.push(entry); if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack.length = 0; this.emit(); return entry;
    }
    begin(label = "Cambio") { if (this.transaction) throw Error("Ya existe una transacción"); this.transaction = { label, entries: [] }; }
    commit() { const tx = this.transaction; this.transaction = null; if (!tx || !tx.entries.length) return false;
      return this.push({ label: tx.label, domain: "transaction", before: null, after: null,
        apply: direction => { const list = direction === "undo" ? [...tx.entries].reverse() : tx.entries;
          list.forEach(e => e.apply(direction, direction === "undo" ? e.before : e.after)); } }); }
    cancel() { this.transaction = null; }
    undo() { const entry = this.undoStack.pop(); if (!entry) return false;
      if (entry.after == null && typeof entry.capture === "function") entry.after = entry.capture();
      entry.apply("undo", entry.before);
      this.redoStack.push(entry); this.emit(); return entry; }
    redo() { const entry = this.redoStack.pop(); if (!entry) return false; entry.apply("redo", entry.after);
      this.undoStack.push(entry); this.emit(); return entry; }
    clear() { this.undoStack.length = 0; this.redoStack.length = 0; this.transaction = null; this.emit(); }
    get canUndo() { return this.undoStack.length > 0; } get canRedo() { return this.redoStack.length > 0; }
    emit() { this.onChange({ canUndo: this.canUndo, canRedo: this.canRedo,
      undoLabel: this.undoStack.at(-1)?.label || "", redoLabel: this.redoStack.at(-1)?.label || "" }); }
  }
  core.HistoryManager = HistoryManager;
})(window);
