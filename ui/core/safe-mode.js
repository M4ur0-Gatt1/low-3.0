/* Modo seguro y restablecimiento de preferencias 2D.
   El documento, la recuperación y los recursos del proyecto quedan fuera de
   estas listas a propósito: corregir una interfaz nunca puede borrar arte. */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const query = new URLSearchParams(global.location?.search || "");
  const active = query.get("safe") === "1" || query.get("safe") === "true";

  const DOMAINS = Object.freeze({
    workspace: Object.freeze({
      label: "Espacios y paneles",
      keys: Object.freeze(["low.workspaces.v1", "low.workspace.active", "low.workspace.locked",
        "low.panels.v1", "low.layouts.v1", "low.2d.dockSizes", "low.2d.panelLayout",
        "low.2d.panelSizes", "low.toolbar.v1", "low.timeline.view.v1", "low.timeline.height",
        "fidel.dzinsw"]),
      prefixes: Object.freeze([]),
    }),
    shortcuts: Object.freeze({
      label: "Atajos",
      keys: Object.freeze(["low.dzkeys"]), prefixes: Object.freeze([]),
    }),
    brushes: Object.freeze({
      label: "Pinceles",
      keys: Object.freeze(["low.brushes.v1", "low.brush.favorites"]), prefixes: Object.freeze([]),
    }),
    drawing: Object.freeze({
      label: "Preferencias de dibujo",
      keys: Object.freeze(["low.dzsmooth", "fidel.dzsmooth", "low.dzgamma", "low.dzpressuremin",
        "low.dzpressuremax", "low.2d.vectorTools", "fidel.dzonion", "low.onion.v2",
        "low.anchoFijo", "low.color.recent.v1", "low.coloring.v1"]),
      prefixes: Object.freeze(["low.palette."]),
    }),
  });

  const domainNames = domains => [...new Set((domains || []).filter(name => DOMAINS[name]))];
  const allManaged = key => Object.values(DOMAINS).some(domain =>
    domain.keys.includes(key) || domain.prefixes.some(prefix => key.startsWith(prefix)));
  function storedKeys(storage) {
    const keys = [];
    try { for (let i = 0; i < (storage?.length || 0); i++) { const key = storage.key(i); if (key) keys.push(key); } }
    catch (_) { /* almacenamiento bloqueado: el modo seguro sigue sirviendo */ }
    return keys;
  }
  function keysFor(domains, storage = global.localStorage) {
    const names = domainNames(domains), keys = new Set();
    names.forEach(name => DOMAINS[name].keys.forEach(key => keys.add(key)));
    const prefixes = names.flatMap(name => DOMAINS[name].prefixes);
    if (prefixes.length) storedKeys(storage).forEach(key => {
      if (prefixes.some(prefix => key.startsWith(prefix))) keys.add(key);
    });
    return [...keys];
  }
  function reset(domains, options = {}) {
    const names = domainNames(domains), storage = options.storage || global.localStorage;
    if (!options.confirmed) return { ok: false, cancelled: true, domains: names, removed: [] };
    const removed = [];
    for (const key of keysFor(names, storage)) {
      try {
        if (storage?.getItem(key) !== null) removed.push(key);
        storage?.removeItem(key);
      } catch (_) { /* se informa lo que sí pudo limpiarse */ }
    }
    return { ok: true, cancelled: false, domains: names, removed };
  }

  /* En modo seguro las preferencias administradas viven sólo en memoria.
     Las claves desconocidas y la recuperación de documentos siguen legibles. */
  const shadow = new Map();
  const nativeStorage = global.localStorage;
  const preferenceStorage = active ? {
    get length() { return nativeStorage?.length || 0; },
    key(index) { return nativeStorage?.key(index) ?? null; },
    getItem(key) {
      if (!allManaged(String(key))) return nativeStorage?.getItem(key) ?? null;
      return shadow.has(String(key)) ? shadow.get(String(key)) : null;
    },
    setItem(key, value) {
      if (!allManaged(String(key))) return nativeStorage?.setItem(key, String(value));
      shadow.set(String(key), String(value));
    },
    removeItem(key) {
      if (!allManaged(String(key))) return nativeStorage?.removeItem(key);
      shadow.delete(String(key));
    },
    clear() { shadow.clear(); },
  } : nativeStorage;

  LOW.safeMode = Object.freeze({ active, domains: DOMAINS, preferenceStorage, keysFor, reset });
  global.dzPrefsStorage = () => LOW.safeMode.preferenceStorage || global.localStorage;
})(typeof window !== "undefined" ? window : globalThis);
