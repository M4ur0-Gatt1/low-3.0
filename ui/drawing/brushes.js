(function (global) {
  "use strict";
  const drawing = (global.LOW = global.LOW || {}).drawing = global.LOW.drawing || {};
  const defaults = [
    ["animation-pencil", "Lápiz de animación", { engine: "vector", size: 3, opacity: .72, pressureSize: .55, smoothing: .28, texture: "graphite" }],
    ["blue-pencil", "Lápiz azul", { size: 3, opacity: .6, color: "#4b8de8", pressureSize: .5, smoothing: .3 }],
    ["red-pencil", "Lápiz rojo", { size: 3, opacity: .6, color: "#df5d57", pressureSize: .5, smoothing: .3 }],
    ["clean-ink", "Tinta limpia", { size: 7, opacity: 1, pressureSize: .82, smoothing: .45 }],
    ["technical-ink", "Tinta técnica", { size: 3, opacity: 1, pressureSize: .08, smoothing: .25 }],
    ["dry-brush", "Pincel seco", { engine: "raster", size: 20, opacity: .8, pressureSize: .55, spacing: .12, texture: "dry" }],
    ["charcoal", "Carboncillo", { engine: "raster", size: 24, opacity: .5, pressureSize: .65, tiltSize: .4, spacing: .08, texture: "charcoal" }],
    ["airbrush", "Aerógrafo", { engine: "raster", size: 48, opacity: .18, pressureOpacity: .75, flow: .3, hardness: .05 }],
    ["marker", "Marcador", { engine: "raster", size: 18, opacity: .62, pressureSize: .12, roundness: .42, angle: -18, hardness: .7 }],
    ["soft-eraser", "Borrador suave", { engine: "raster", size: 40, opacity: .45, eraser: true, hardness: .08 }]
    ,["rough-ink", "Tinta áspera", { size: 9, opacity: .94, pressureSize: .88, velocitySize: .14, smoothing: .32, texture: "rough" }]
    ,["comic-ink", "Tinta de cómic", { size: 11, opacity: 1, pressureSize: .92, pressureGamma: .72, smoothing: .5 }]
    ,["sumi", "Sumi-e", { size: 26, opacity: .78, pressureSize: .9, pressureOpacity: .35, tiltSize: .45, roundness: .36, angle: -18 }]
    ,["flat-gouache", "Gouache plano", { engine: "raster", size: 34, opacity: .88, flow: .72, pressureOpacity: .25, spacing: .07, hardness: .74, texture: "gouache" }]
    ,["wet-gouache", "Gouache húmedo", { engine: "raster", size: 42, opacity: .62, flow: .38, pressureSize: .35, spacing: .06, hardness: .32, texture: "wet" }]
    ,["watercolor", "Acuarela", { engine: "raster", size: 54, opacity: .3, flow: .22, pressureOpacity: .72, spacing: .08, hardness: .12, texture: "watercolor" }]
    ,["chalk", "Tiza", { engine: "raster", size: 22, opacity: .68, flow: .62, pressureSize: .48, scatter: .08, spacing: .1, hardness: .7, texture: "chalk" }]
    ,["pastel", "Pastel", { engine: "raster", size: 30, opacity: .55, flow: .5, tiltSize: .55, roundness: .5, spacing: .08, texture: "pastel" }]
    ,["pixel", "Pixel duro", { engine: "raster", size: 4, opacity: 1, flow: 1, pressureSize: 0, spacing: .25, hardness: 1, smoothing: 0, texture: "pixel" }]
    ,["texture-spray", "Spray de textura", { engine: "raster", size: 46, opacity: .34, flow: .26, pressureOpacity: .45, scatter: .8, spacing: .12, hardness: .55, texture: "spray" }]
    ,["soft-shader", "Sombreado suave", { engine: "raster", size: 70, opacity: .16, flow: .18, pressureOpacity: .6, tiltSize: .4, hardness: .03 }]
    ,["calligraphy", "Caligrafía", { size: 18, opacity: 1, pressureSize: .45, tiltSize: .5, roundness: .22, angle: -35, smoothing: .38 }]
  ];
  class BrushLibrary {
    constructor(storage = (global.LOW?.safeMode?.preferenceStorage || global.localStorage)) { this.storage = storage; this.presets = new Map(defaults.map(([id, name, settings]) => [id, { id, name, ...settings }])); this.load(); }
    get(id) { return this.presets.get(id); }
    isBuiltin(id) { return defaults.some(item => item[0] === id); }
    all() { return [...this.presets.values()]; }
    save(preset, persist = true) { if (!preset || !preset.id) throw Error("El pincel necesita id"); this.presets.set(preset.id, { ...preset }); if (persist && !this.persist()) throw Error("No hay espacio local para guardar más puntas de pincel"); }
    saveMany(presets) { for (const preset of presets || []) this.save(preset, false); if (!this.persist()) throw Error("No hay espacio local para guardar el paquete de pinceles"); return (presets || []).length; }
    remove(id) { if (defaults.some(x => x[0] === id)) return false; const ok = this.presets.delete(id); this.persist(); return ok; }
    persist() { try { this.storage?.setItem("low.brushes.v1", JSON.stringify(this.all().filter(x => !defaults.some(d => d[0] === x.id)))); return true; } catch (_) { return false; } }
    load() { try { (JSON.parse(this.storage?.getItem("low.brushes.v1") || "[]") || []).forEach(x => this.presets.set(x.id, x)); } catch (_) {} }
  }
  drawing.BrushLibrary = BrushLibrary; drawing.brushes = new BrushLibrary();
})(window);
