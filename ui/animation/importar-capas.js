/* ══════════════════════════════════════════════════════════════════════════
   IMPORTAR CAPAS DE PHOTOSHOP (PSD) O KRITA (ORA)

   Pedido de Mauro (nov-2026): el puente con Photoshop y Krita que en Blender
   da COA Tools para el cut-out. Archivo → «Importar capas (PSD, ORA)…»: cada
   capa del archivo entra como una CAPA de LOW, en su lugar y en su orden (la
   de más atrás, atrás), con su visibilidad y su opacidad, todas juntas en un
   GRUPO con el nombre del archivo. Listas para el esqueleto (cut-out), para
   colorear encima o para usarlas de fondo.

   El backend lee el archivo (capas_archivo.py) y manda cada capa como PNG.
   Si el lienzo del archivo no tiene el tamaño de la escena, se escala entero
   (sin deformar) y se centra. Todo es UN paso de Ctrl+Z.

   @module animation/importar-capas
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const avisar = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

  /** Arma las capas en el documento. `r`: lo que devuelve api.import_capas. */
  function armar(doc, r) {
    const sc = doc.scene, W = sc.width || 1920, H = sc.height || 1080;
    const capas = (r.capas || []).filter((c) => c && typeof c.data === "string" && /^data:image\/png;base64,/.test(c.data));
    if (!capas.length) { avisar("El archivo no tiene capas con imagen"); return null; }
    const aw = Number(r.ancho) || W, ah = Number(r.alto) || H;
    const k = Math.min(W / aw, H / ah), ox = (W - aw * k) / 2, oy = (H - ah * k) / 2;
    const n = Math.max(1, sc.lastFrame ? sc.lastFrame() : 1);
    const h = doc.history, tx = !!h && !h.transaction;
    if (tx) h.begin("Importar capas de «" + String(r.name || "archivo").slice(0, 40) + "»");
    const ids = [];
    try {
      const antes = doc._layersSnapshot();
      const niveles = [];
      for (const c of capas) {
        const nombre = String(c.nombre || "Capa").slice(0, 80);
        const lv = sc.addLevel(nombre);
        const x = +(ox + (Number(c.x) || 0) * k).toFixed(2), y = +(oy + (Number(c.y) || 0) * k).toFixed(2);
        const w = +((Number(c.ancho) || 1) * k).toFixed(2), hh = +((Number(c.alto) || 1) * k).toFixed(2);
        lv.addDrawing(1, `<g data-low-art="colour"></g><g data-low-art="line"><image data-low-importada="${esc(nombre)}" href="${c.data}" x="${x}" y="${y}" width="${w}" height="${hh}" preserveAspectRatio="none"></image></g>`);
        const ly = sc.addLayer(lv.id, nombre);
        ly.visible = c.visible !== false;
        ly.opacity = Math.max(0, Math.min(1, c.opacidad == null ? 1 : Number(c.opacidad)));
        for (let f = 1; f <= n; f++) ly.setCell(f, 1);
        ids.push(ly.id);
        niveles.push(lv);
      }
      doc.layerId = ids[ids.length - 1];
      const despues = { ...doc._layersSnapshot(), levels: niveles.map((l) => l.toJSON()) };
      antes.dropLevels = niveles.map((l) => l.id);
      doc.touch(); doc.emit("layers"); doc.emit("level"); doc.emit("cells"); doc.emit("frame");
      doc._pushLayersChange("Importar capas", antes, despues);
      // juntas en un grupo con el nombre del archivo (si hay grupos en esta versión)
      if (typeof doc.crearGrupo === "function" && ids.length > 1) doc.crearGrupo(String(r.name || "Importado").replace(/\.(psd|ora)$/i, ""), ids);
    } finally { if (tx) h.commit(); }
    return ids;
  }

  async function importar() {
    const D = dz(), doc = D && D.doc;
    if (!doc) return avisar("Abrí o creá un documento de animación para importar capas");
    if (typeof api === "undefined" || typeof api.import_capas !== "function") return avisar("Esta versión de LOW no puede importar capas: reiniciá la app");
    const r = await api.import_capas();
    if (!r || r.cancel) return;
    if (r.error) return avisar("No pude importar las capas: " + r.error);
    if (typeof global.dzDocCommit === "function") global.dzDocCommit();
    const ids = armar(doc, r);
    if (!ids) return;
    if (typeof global.dzBuildLayers === "function") global.dzBuildLayers();
    if (typeof global.dzTlFramesRender === "function") global.dzTlFramesRender();
    if (typeof global.dzCanvasSet === "function" && doc.drawing) global.dzCanvasSet(doc.drawing.content);
    if (typeof global.dzCapasEnMesa === "function") global.dzCapasEnMesa();
    if (typeof global.dzMarkDirty === "function") global.dzMarkDirty();
    avisar(ids.length + " capa" + (ids.length === 1 ? "" : "s") + " de «" + (r.name || "archivo") + "» importada" + (ids.length === 1 ? "" : "s") +
      (ids.length > 1 ? " en un grupo" : "") + " · Ctrl+Z las saca");
  }

  // la entrada del menú Archivo (se dispara al apretar; ver produccion.js)
  let ultimo = 0;
  for (const tipo of ["mousedown", "click"]) document.addEventListener(tipo, (ev) => {
    if (!(ev.target && ev.target.closest && ev.target.closest('[data-act="importar-capas"]')) || Date.now() - ultimo < 600) return;
    ultimo = Date.now();
    importar();
  }, true);

  const a = (global.LOW = global.LOW || {}).animation = global.LOW.animation || {};
  a.importarCapas = { importar, armar };
})(typeof window !== "undefined" ? window : globalThis);
