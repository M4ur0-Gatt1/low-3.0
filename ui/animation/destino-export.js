/* ══ 📤 DÓNDE GUARDAR LO EXPORTADO ═══════════════════════════════════════════
   Pedido de Mauro: «cuando exporto los archivos quiero poder elegir dónde los
   guardo; ahora se arma una carpeta por defecto y no la puedo cambiar».

   Todas las salidas iban a `export/` al lado del documento, sin preguntar. Como
   en Photoshop, Illustrator o Harmony, ahora al elegir el formato se abre el
   diálogo del sistema:
   - MP4, WebM, GIF y spritesheet son UN archivo: diálogo de Guardar, con el
     nombre sugerido y la extensión puesta.
   - La secuencia PNG y el paquete de Premiere son muchos archivos: se elige
     la carpeta.
   Abre en la última carpeta usada y la recuerda (`export_dir` en la config).

   Se pregunta ANTES de rasterizar: elegir el lugar no puede esperar a que
   termine un render de 300 cuadros, y cancelar no tiene que costar nada.

   Si el puente no sabe preguntar (versión vieja, el diálogo no abre), queda el
   camino de siempre: `export/`. Exportar nunca deja de funcionar por esto. */
(function (global) {
  "use strict";

  /**
   * @param {string} kind  mp4 | webm | gif | png | sheet | premiere
   * @param {object} estado  el `DZ` de app.js (no es propiedad de window)
   * @returns {Promise<{path?:string, nombre?:string}|null>} null si se canceló
   */
  async function dzDestinoExport(kind, estado) {
    const DZ = estado || {};
    const nombre = (DZ.doc && DZ.doc.scene && DZ.doc.scene.name) || "animacion";
    // `api` vive en app.js como `let`: se lee por nombre, no por window
    const puente = typeof api !== "undefined" ? api : null;
    if (!puente || typeof puente.pick_export_target !== "function") return { nombre };
    let r = null;
    try {
      r = await puente.pick_export_target(global.dzRutaDeSalida(DZ), kind, nombre);
    } catch (e) { r = { error: String(e) }; }
    if (r && r.cancel) {
      if (typeof global.dzSetStatus === "function") global.dzSetStatus("Exportación cancelada");
      else if (typeof dzSetStatus === "function") dzSetStatus("Exportación cancelada");
      return null;
    }
    if (r && r.path) return { path: r.path, dir: r.dir, nombre };
    return { nombre };                       // sin elección: export/ como siempre
  }

  global.dzDestinoExport = dzDestinoExport;
  global.LOW = global.LOW || {};
  global.LOW.animation = global.LOW.animation || {};
  global.LOW.animation.destinoExport = dzDestinoExport;
})(typeof window !== "undefined" ? window : globalThis);
