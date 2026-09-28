(function (global) {
  "use strict";
  const workspace = (global.LOW = global.LOW || {}).workspace = global.LOW.workspace || {};
  const presets = {
    drawing: { name: "Dibujo", panels: ["tools", "canvas", "brushes", "layers"] },
    animation: { name: "Animación", panels: ["tools", "canvas", "timeline", "xsheet", "layers"] },
    camera: { name: "Cámara", panels: ["canvas", "timeline", "camera", "multiplane"] },
    composition: { name: "Composición", panels: ["canvas", "nodes", "timeline", "inspector"] },
    threeD: { name: "3D", panels: ["3d-tools", "3d-stage", "surfaces", "layers"] }
  };
  class LayoutStore {
    constructor(storage = (global.LOW?.safeMode?.preferenceStorage || global.localStorage)) { this.storage = storage; }
    save(name, panels) { const all = this.read(); all[name] = { name, panels, savedAt: Date.now() };
      this.storage?.setItem("low.layouts.v1", JSON.stringify(all)); return all[name]; }
    read() { try { return JSON.parse(this.storage?.getItem("low.layouts.v1") || "{}"); } catch (_) { return {}; } }
    get(name) { return this.read()[name] || presets[name] || null; }
  }
  workspace.layoutPresets = presets; workspace.layouts = new LayoutStore();
})(window);
