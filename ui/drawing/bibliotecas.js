/* ══════════════════════════════════════════════════════════════════════════
   BIBLIOTECAS DE PINCELES INSTALADAS

   Pedido de Mauro (oct-2026): «quiero que incorpores pinceles de otros
   softwares para instalar bibliotecas como las de Photoshop o Illustrator, y
   que le instales bibliotecas de pinceles».

   Una BIBLIOTECA es un archivo de pinceles —.abr de Photoshop, .brushset /
   .brush de Procreate, .bundle / .kpp de Krita, .gbr / .gih de GIMP, .myb de
   MyPaint, o un .lowbrush— que el backend lee (brush_import.py) y deja
   INSTALADO como archivo en la carpeta de datos de LOW (%APPDATA%/LOW/
   pinceles). Antes los importados iban al almacén del navegador, donde entran
   unos 5 MB: una biblioteca de Photoshop con cientos de puntas no cabía.

   Al abrir LOW se cargan todas; sus pinceles aparecen en el selector y en el
   Estudio agrupados por biblioteca, y se pueden quitar. No se escriben en el
   almacén del navegador (los marca `fromLibrary`).

   @module drawing/bibliotecas
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const drawing = LOW.drawing = LOW.drawing || {};
  const instaladas = new Map();   // id → { id, name, count, format }

  const puente = () => (typeof api !== "undefined" && api) ? api : null;
  // el Estudio vive en un `let` de app.js: se lo alcanza por el ámbito compartido, no por window
  const estudio = () => (typeof DZ_BRUSH_STUDIO !== "undefined" && DZ_BRUSH_STUDIO) || null;

  /** Registra los pinceles de una biblioteca en la biblioteca de LOW. */
  function registrar(lib, info) {
    const B = drawing.brushes;
    if (!B || !lib || !Array.isArray(lib.brushes)) return 0;
    // los de una versión anterior de la misma biblioteca se van
    for (const p of B.all()) if (p.libraryId === lib.id) B.presets.delete(p.id);
    lib.brushes.forEach((p, i) => {
      B.presets.set(`lib-${lib.id}-${i + 1}`, { ...p, id: `lib-${lib.id}-${i + 1}`, cat: "lib:" + lib.id,
        libraryId: lib.id, libraryName: lib.name, fromLibrary: true, imported: true });
      if (drawing.bitmap && drawing.bitmap.prepararPunta) drawing.bitmap.prepararPunta(p);
    });
    instaladas.set(lib.id, { id: lib.id, name: lib.name, count: lib.brushes.length, format: lib.format,
      builtin: !!(info && info.builtin), license: (info && info.license) || lib.license || null, author: (info && info.author) || lib.author || null });
    return lib.brushes.length;
  }

  async function cargarTodas() {
    // el puente de pywebview puede llegar después de cargar la página
    let A = puente();
    for (let i = 0; i < 50 && !(A && typeof A.brush_libraries === "function"); i++) { await new Promise((r) => setTimeout(r, 200)); A = puente(); }
    if (!A || typeof A.brush_libraries !== "function") return 0;
    let n = 0;
    try {
      const lista = await A.brush_libraries();
      for (const item of (lista && lista.libraries) || []) {
        try { const lib = await A.brush_library(item.id); if (lib && !lib.error) n += registrar(lib, item); } catch (_) { /* una biblioteca rota no frena a las demás */ }
      }
    } catch (_) { /* sin puente todavía */ }
    refrescar();
    return n;
  }

  function quitar(id) {
    const A = puente(), B = drawing.brushes;
    for (const p of B ? B.all() : []) if (p.libraryId === id) B.presets.delete(p.id);
    instaladas.delete(id);
    if (A && typeof A.remove_brush_library === "function") A.remove_brush_library(id);
    refrescar();
  }

  /** Instalar bibliotecas (una o varias): el diálogo y la lectura los hace el backend. */
  async function instalar() {
    const A = puente();
    if (!A || typeof A.import_brush_pack !== "function") return;
    const r = await A.import_brush_pack();
    if (!r || r.cancel) return;
    const avisar = (t) => (typeof dzSetStatus === "function" ? dzSetStatus(t) : null);
    if (r.error && !(r.libraries || []).length) { avisar(" No pude instalar los pinceles: " + r.error); return; }
    let primero = null, primeraLib = null, total = 0;
    for (const item of r.libraries || []) {
      const lib = await A.brush_library(item.id);
      if (lib && !lib.error) { total += registrar(lib); if (!primero) { primero = `lib-${lib.id}-1`; primeraLib = lib.id; } }
    }
    const errores = (r.errors || []).map((e) => e.file + ": " + e.error);
    if (primero && typeof DZ !== "undefined") {
      DZ.brushPreset = primero;
      const p = drawing.brushes.get(primero); if (p) DZ.drawW = p.size || DZ.drawW;
      const E = estudio(); if (E) { E.selected = primero; E.filter = "lib:" + primeraLib; }
    }
    refrescar();
    const libs = (r.libraries || []).map((x) => "«" + x.name + "» (" + x.count + ")").join(", ");
    avisar((total ? " Instalé " + total + " pincel" + (total === 1 ? "" : "es") + ": " + libs : " No se instaló ningún pincel") +
      (errores.length ? " · no pude leer: " + errores.join("; ") : ""));
  }

  function refrescar() {
    try { const E = estudio(); if (E) E.render(); } catch (_) { /* el estudio puede no estar abierto */ }
    try { if (typeof dzToolOptsRender === "function") dzToolOptsRender(); } catch (_) { /* sin barra todavía */ }
  }

  drawing.bibliotecas = { registrar, cargarTodas, quitar, instalar, instaladas };
  // el botón «Importar…» del Estudio y el menú usan este nombre
  global.dzImportBrushes = instalar;

  const arrancar = () => setTimeout(cargarTodas, 0);
  if (typeof document !== "undefined" && document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar, { once: true });
  else arrancar();
})(typeof window !== "undefined" ? window : globalThis);
