(function (global) {
  "use strict";
  const workspace = (global.LOW = global.LOW || {}).workspace = global.LOW.workspace || {};
  /* Cuantos puntos de recuperacion se conservan. Doce cubre de sobra «lo que
     estaba haciendo» sin llenar la cuota del navegador. */
  const TOPE = 12;

  class DocumentRecovery {
    constructor(storage = global.localStorage) { this.storage = storage; this.prefix = "low.document.recovery."; this.timers = new Map(); }
    key(path) { let hash = 2166136261; for (const c of String(path)) { hash ^= c.charCodeAt(0); hash = Math.imul(hash, 16777619); }
      return this.prefix + (hash >>> 0).toString(36); }
    saveNow(path, content, metadata = {}) {
      if (!path || !content || content.length > 2_500_000) return false;
      try {
        this.storage?.setItem(this.key(path), JSON.stringify({ path, content, metadata, savedAt: Date.now() }));
        return true;
      } catch (_) { return false; }
    }
    checkpoint(path, content, metadata = {}) { if (!path || !content || content.length > 2_500_000) return false;
      clearTimeout(this.timers.get(path)); this.timers.set(path, setTimeout(() => {
        this.timers.delete(path); this.saveNow(path, content, metadata);
      }, 450)); return true; }
    get(path) { try { const value = JSON.parse(this.storage?.getItem(this.key(path)) || "null"); return value?.path === path ? value : null; } catch (_) { return null; } }
    clear(path) { clearTimeout(this.timers.get(path)); this.timers.delete(path); try { this.storage?.removeItem(this.key(path)); } catch (_) {} }
  }
  const canonicalPath = value => String(value || "").trim().replace(/\\+/g, "/").replace(/\/{2,}/g, "/").toLowerCase();
  class SceneRecoveryStore {
    constructor(storage = global.localStorage) {
      this.storage = storage;
      this.prefix = "low.scene.recovery.v2.";
      this.indexKey = this.prefix + "index";
      this.legacyKey = "low.scene.autosave";
    }
    identity({ path, sceneId } = {}) {
      const clean = canonicalPath(path);
      return clean ? "path:" + clean : (sceneId ? "scene:" + String(sceneId) : "");
    }
    key(identity) { return this.prefix + encodeURIComponent(String(identity || "")); }
    _index() {
      try { const value = JSON.parse(this.storage?.getItem(this.indexKey) || "[]"); return Array.isArray(value) ? value : []; }
      catch (_) { return []; }
    }
    _writeIndex(items) { this.storage?.setItem(this.indexKey, JSON.stringify([...new Set(items.filter(Boolean))])); }
    /* EL ALMACEN TIENE QUE TENER FONDO. Cada escena que se abre deja su punto de
       recuperacion y NADA los borraba: medido en la maquina de pruebas, 64
       escenas viejas ocupando cientos de KB. El navegador da ~5 MB por origen y
       cuando se llena `setItem` TIRA: el catch se lo tragaba y devolvia false,
       asi que LOW dejaba de guardar el rescate EN SILENCIO. El dia que se cae,
       no hay nada que recuperar y nada dijo por que. Se guardan los TOPE mas
       recientes; si aun asi no entra, se tiran los mas viejos y se reintenta. */
    _podar(protegida) {
      const registros = this.list();                       // ya vienen del mas nuevo al mas viejo
      const sobran = registros.slice(TOPE).filter((r) => r.identity !== protegida);
      for (const viejo of sobran) this.clear(viejo.identity);
      return sobran.length;
    }
    saveNow(identity, content, metadata = {}) {
      if (!identity || !content || content.format !== "lowscene") return false;
      const record = { schema: 2, kind: "lowscene", identity,
        path: metadata.path || null, sceneId: content.scene?.id || metadata.sceneId || null,
        name: metadata.name || content.scene?.name || "Escena", savedAt: Date.now(), metadata,
        content };
      const escribir = () => {
        this.storage?.setItem(this.key(identity), JSON.stringify(record));
        const verified = this.get(identity);
        if (!verified || verified.identity !== identity) return false;
        this._writeIndex([...this._index(), identity]);
        return true;
      };
      let guardado = false;
      try { guardado = escribir(); }
      catch (_) {
        // sin espacio: se hace lugar con lo mas viejo y se reintenta UNA vez.
        // Perder un rescate viejo es barato; perder el de ahora, no.
        try { this._podar(identity); guardado = escribir(); } catch (__) { return false; }
      }
      if (guardado) { try { this._podar(identity); } catch (_) { /* podar es higiene, no la promesa */ } }
      return guardado;
    }
    get(identity) {
      if (!identity) return null;
      try {
        const value = JSON.parse(this.storage?.getItem(this.key(identity)) || "null");
        return value?.schema === 2 && value?.kind === "lowscene" && value?.identity === identity ? value : null;
      } catch (_) { return null; }
    }
    list() {
      const good = [], records = [];
      for (const identity of this._index()) { const value = this.get(identity); if (value) { good.push(identity); records.push(value); } }
      if (good.length !== this._index().length) { try { this._writeIndex(good); } catch (_) { /* cuota/privacidad */ } }
      return records.sort((a, b) => b.savedAt - a.savedAt);
    }
    clear(identity) {
      if (!identity) return false;
      try {
        this.storage?.removeItem(this.key(identity));
        this._writeIndex(this._index().filter(item => item !== identity));
        return true;
      } catch (_) { return false; }
    }
    rekey(from, to) {
      if (!from || !to || from === to) return !!this.get(to);
      const record = this.get(from); if (!record) return false;
      if (!this.saveNow(to, record.content, { ...record.metadata, path: record.path, migratedFrom: from })) return false;
      this.clear(from); return true;
    }
    legacy() {
      try {
        const content = JSON.parse(this.storage?.getItem(this.legacyKey) || "null");
        return content?.format === "lowscene" && content?.scene?.id ? content : null;
      } catch (_) { return null; }
    }
    migrateLegacy(identity) {
      const content = this.legacy(); if (!content || !identity) return null;
      if (!this.saveNow(identity, content, { sceneId: content.scene.id, legacy: true })) return null;
      try { this.storage?.removeItem(this.legacyKey); } catch (_) { /* la copia v2 ya fue verificada */ }
      return this.get(identity);
    }
  }
  workspace.DocumentRecovery = DocumentRecovery;
  workspace.recovery = new DocumentRecovery();
  workspace.SceneRecoveryStore = SceneRecoveryStore;
  workspace.sceneRecovery = new SceneRecoveryStore();
})(window);
