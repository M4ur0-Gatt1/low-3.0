(function (global) {
  "use strict";
  const drawing = (global.LOW = global.LOW || {}).drawing = global.LOW.drawing || {};
  /* LOS PINCELES DE LOW, por CATEGORÍA (oct-2026: «aumentemos la variedad…
     quiero pinceles de efectos y de texturas»). Los ids de siempre no cambian:
     los trazos guardados y los favoritos los nombran por id. Las texturas y los
     efectos los pinta ui/drawing/pincel-efectos.js; las formas de sello, las
     variaciones y los remates, el motor (brush-engine-pro.js). */
  const CATEGORIAS = [["lapiz", "Lápices"], ["tinta", "Tintas"], ["pintura", "Pintura"], ["textura", "Texturas"], ["efecto", "Efectos"], ["borrador", "Borradores"]];
  const defaults = [
    // ── LÁPICES ──
    ["animation-pencil", "Lápiz de animación", { cat: "lapiz", engine: "vector", size: 3, opacity: .72, pressureSize: .55, smoothing: .28 }],
    ["graphite-pencil", "Lápiz grafito", { cat: "lapiz", engine: "vector", size: 4, opacity: .85, pressureSize: .6, smoothing: .3, texture: "graphite", textureStrength: .55, taperStart: .2, taperEnd: .35 }],
    ["color-pencil", "Lápiz de color", { cat: "lapiz", engine: "vector", size: 6, opacity: .9, pressureSize: .4, smoothing: .3, texture: "pastel", textureStrength: .5, textureScale: .7, taperEnd: .2 }],
    ["wax-crayon", "Crayón de cera", { cat: "lapiz", engine: "vector", size: 14, opacity: .95, pressureSize: .35, smoothing: .2, texture: "crayon", textureStrength: .7 }],
    ["blue-pencil", "Lápiz azul", { cat: "lapiz", size: 3, opacity: .6, color: "#4b8de8", pressureSize: .5, smoothing: .3 }],
    ["red-pencil", "Lápiz rojo", { cat: "lapiz", size: 3, opacity: .6, color: "#df5d57", pressureSize: .5, smoothing: .3 }],
    // ── TINTAS ──
    ["clean-ink", "Tinta limpia", { cat: "tinta", size: 7, opacity: 1, pressureSize: .82, smoothing: .45 }],
    ["tapered-ink", "Tinta con remate", { cat: "tinta", size: 8, opacity: 1, pressureSize: .7, smoothing: .45, taperStart: .45, taperEnd: .7 }],
    ["technical-ink", "Tinta técnica", { cat: "tinta", size: 3, opacity: 1, pressureSize: .08, smoothing: .25 }],
    ["rough-ink", "Tinta áspera", { cat: "tinta", size: 9, opacity: .94, pressureSize: .88, velocitySize: .14, smoothing: .32, texture: "rough", textureStrength: .5 }],
    ["comic-ink", "Tinta de cómic", { cat: "tinta", size: 11, opacity: 1, pressureSize: .92, pressureGamma: .72, smoothing: .5, taperStart: .25, taperEnd: .45 }],
    ["dry-ink", "Tinta seca", { cat: "tinta", size: 12, opacity: .95, pressureSize: .7, smoothing: .35, texture: "dry", textureStrength: .65, taperEnd: .3 }],
    ["sumi", "Sumi-e", { cat: "tinta", size: 26, opacity: .78, pressureSize: .9, pressureOpacity: .35, tiltSize: .45, roundness: .36, angle: -18, taperEnd: .4 }],
    ["calligraphy", "Caligrafía", { cat: "tinta", size: 18, opacity: 1, pressureSize: .45, tiltSize: .5, roundness: .22, angle: -35, smoothing: .38 }],
    // ── PINTURA ──
    ["flat-gouache", "Gouache plano", { cat: "pintura", engine: "raster", size: 34, opacity: .88, flow: .72, pressureOpacity: .25, spacing: .07, hardness: .74, texture: "gouache", textureStrength: .45 }],
    ["wet-gouache", "Gouache húmedo", { cat: "pintura", engine: "raster", size: 42, opacity: .62, flow: .38, pressureSize: .35, spacing: .06, hardness: .32, texture: "wet", textureStrength: .5 }],
    ["watercolor", "Acuarela", { cat: "pintura", engine: "raster", size: 54, opacity: .3, flow: .22, pressureOpacity: .72, spacing: .08, hardness: .12, texture: "watercolor", textureStrength: .6 }],
    ["watercolor-edge", "Acuarela de borde", { cat: "pintura", engine: "vector", size: 28, opacity: .55, pressureSize: .5, smoothing: .5, texture: "watercolor", textureStrength: .75, taperStart: .3, taperEnd: .5 }],
    ["oil-canvas", "Óleo sobre lienzo", { cat: "pintura", engine: "raster", size: 30, opacity: .9, flow: .8, spacing: .06, hardness: .8, roundness: .7, texture: "canvas", textureStrength: .55 }],
    ["sponge", "Esponja", { cat: "pintura", engine: "raster", size: 36, opacity: .5, flow: .6, spacing: .35, scatter: .5, sizeJitter: .5, angleJitter: 1, angleFollowsStroke: false, shape: "dot", hardness: 1, texture: "charcoal", textureStrength: .85 }],
    ["dry-brush", "Pincel seco", { cat: "pintura", engine: "raster", size: 20, opacity: .8, pressureSize: .55, spacing: .12, texture: "dry", textureStrength: .7 }],
    ["airbrush", "Aerógrafo", { cat: "pintura", engine: "raster", size: 48, opacity: .18, pressureOpacity: .75, flow: .3, hardness: .05 }],
    ["soft-shader", "Sombreado suave", { cat: "pintura", engine: "raster", size: 70, opacity: .16, flow: .18, pressureOpacity: .6, tiltSize: .4, hardness: .03 }],
    ["marker", "Marcador", { cat: "pintura", engine: "raster", size: 18, opacity: .62, pressureSize: .12, roundness: .42, angle: -18, hardness: .7 }],
    ["pixel", "Pixel duro", { cat: "pintura", engine: "raster", size: 4, opacity: 1, flow: 1, pressureSize: 0, spacing: .25, hardness: 1, smoothing: 0, texture: "pixel" }],
    // ── TEXTURAS ──
    ["charcoal", "Carboncillo", { cat: "textura", engine: "raster", size: 24, opacity: .5, pressureSize: .65, tiltSize: .4, spacing: .08, texture: "charcoal", textureStrength: .7 }],
    ["chalk", "Tiza", { cat: "textura", engine: "raster", size: 22, opacity: .68, flow: .62, pressureSize: .48, scatter: .08, spacing: .1, hardness: .7, texture: "chalk", textureStrength: .75 }],
    ["pastel", "Pastel", { cat: "textura", engine: "raster", size: 30, opacity: .55, flow: .5, tiltSize: .55, roundness: .5, spacing: .08, texture: "pastel", textureStrength: .6 }],
    ["paper-grain", "Grano de papel", { cat: "textura", engine: "raster", size: 44, opacity: .5, flow: .45, spacing: .08, hardness: .25, texture: "paper", textureStrength: .85 }],
    ["stipple", "Puntillismo", { cat: "textura", engine: "raster", size: 5, opacity: .9, flow: 1, pressureSize: .4, spacing: 1.4, scatter: 1.6, sizeJitter: .6, shape: "dot", hardness: 1 }],
    ["texture-spray", "Spray de textura", { cat: "textura", engine: "raster", size: 46, opacity: .34, flow: .26, pressureOpacity: .45, scatter: .8, spacing: .12, hardness: .55, texture: "spray", textureStrength: .7 }],
    // ── EFECTOS ──
    ["neon", "Neón", { cat: "efecto", engine: "vector", color: "#33B5E8", size: 6, opacity: 1, pressureSize: .3, smoothing: .55, glow: .9, neon: true }],
    ["soft-glow", "Brillo suave", { cat: "efecto", engine: "vector", color: "#ffb347", size: 10, opacity: .9, pressureSize: .6, smoothing: .45, glow: .6, taperStart: .2, taperEnd: .4 }],
    ["sparkles", "Destellos", { cat: "efecto", engine: "raster", color: "#f2c230", size: 26, opacity: .95, flow: 1, pressureSize: .5, spacing: 1.1, scatter: 1.4, sizeJitter: .75, angleJitter: .25, opacityJitter: .4, angleFollowsStroke: false, shape: "star", hardness: 1, glow: .25 }],
    ["confetti", "Confeti", { cat: "efecto", engine: "raster", size: 10, opacity: 1, flow: 1, color: "#F0450E", spacing: 1.2, scatter: 2, sizeJitter: .5, angleJitter: 1, hueJitter: 1, angleFollowsStroke: false, shape: "square", roundness: .6, hardness: 1 }],
    ["grass", "Pasto", { cat: "efecto", engine: "raster", color: "#3f8f3a", size: 30, opacity: .95, flow: 1, spacing: .1, scatter: .5, sizeJitter: .55, angleJitter: .12, hueJitter: .06, angleFollowsStroke: false, shape: "blade", hardness: 1 }],
    ["leaves", "Hojas", { cat: "efecto", engine: "raster", color: "#4a8f3c", size: 22, opacity: .95, flow: 1, spacing: .7, scatter: 1.2, sizeJitter: .5, angleJitter: 1, hueJitter: .12, angleFollowsStroke: false, shape: "leaf", roundness: .7, hardness: 1 }],
    ["smoke", "Humo", { cat: "efecto", engine: "raster", size: 60, opacity: .14, flow: .3, spacing: .1, scatter: .4, sizeJitter: .4, hardness: .02, texture: "wet", textureStrength: .9 }],
    ["hatching", "Rayado", { cat: "efecto", engine: "raster", size: 22, opacity: .85, flow: 1, pressureSize: .5, spacing: .28, sizeJitter: .15, angle: -45, angleFollowsStroke: false, shape: "line", hardness: 1 }],
    // ── BORRADORES ──
    ["soft-eraser", "Borrador suave", { cat: "borrador", engine: "raster", size: 40, opacity: .45, eraser: true, hardness: .08 }]
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
  /** La categoría de un pincel; los importados y los propios van aparte. */
  BrushLibrary.prototype.categoria = function (p) { return (p && p.cat) || (p && p.imported ? "importado" : "propio"); };
  drawing.BRUSH_CATEGORIAS = CATEGORIAS.concat([["propio", "Mis pinceles"], ["importado", "Importados"]]);
  drawing.BrushLibrary = BrushLibrary; drawing.brushes = new BrushLibrary();
  /** Las <option> de un selector de pinceles, agrupadas por categoría. */
  drawing.opcionesDePinceles = function (seleccionado, biblioteca) {
    const lib = biblioteca || drawing.brushes, esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
    const grupos = new Map(drawing.BRUSH_CATEGORIAS.map(([id, nombre]) => [id, { nombre, items: [] }]));
    for (const p of lib.all()) { const g = grupos.get(lib.categoria(p)) || grupos.get("propio"); g.items.push(p); }
    return [...grupos.values()].filter((g) => g.items.length).map((g) => `<optgroup label="${esc(g.nombre)}">` +
      g.items.map((p) => `<option value="${esc(p.id)}"${p.id === seleccionado ? " selected" : ""}>${esc(p.name)}</option>`).join("") + "</optgroup>").join("");
  };
})(window);
