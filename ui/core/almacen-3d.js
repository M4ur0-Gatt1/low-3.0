/* ══════════════════════════════════════════════════════════════════════════
   EL PUENTE DEL ESTUDIO 3D AL DISCO (fase 1 del camino a la estabilidad)

   El estudio 3D corre en un iframe y no llega a la app: le pide a esta página
   (mensaje «low:almacen») leer, guardar o borrar su biblioteca y su
   autoguardado, y esta página se lo pide a Python (almacen3d.py, archivos en
   %APPDATA%/LOW/estudio3d/). La respuesta vuelve con el mismo id; un error
   vuelve como error, para que el estudio lo MUESTRE. Antes la biblioteca vivía
   en el almacenamiento del navegador y, lleno, fallaba en silencio.

   Sólo atiende a un iframe de esta misma página y del mismo origen.

   @module core/almacen-3d
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const OPS = { leer: "est3d_leer", guardar: "est3d_guardar", borrar: "est3d_borrar" };
  global.addEventListener("message", async (ev) => {
    const m = ev.data;
    if (!m || typeof m !== "object" || m.type !== "low:almacen") return;
    if (ev.origin !== global.location.origin) return;
    const esNuestro = [...global.document.querySelectorAll("iframe")].some((f) => f.contentWindow === ev.source);
    if (!esNuestro || !ev.source) return;
    let r;
    try {
      const api = global.pywebview && global.pywebview.api, fn = OPS[m.op];
      if (!fn) r = { error: "operación desconocida: " + m.op };
      else if (!api || typeof api[fn] !== "function") r = { error: "la app no tiene dónde guardar en disco", sinApp: true };
      else r = await (m.op === "guardar" ? api[fn](m.nombre, m.json) : api[fn](m.nombre));
    } catch (e) {
      r = { error: String((e && e.message) || e) };
    }
    try { ev.source.postMessage({ ...(r && typeof r === "object" ? r : {}), type: "low:almacen-respuesta", id: m.id }, global.location.origin); }
    catch (_) { /* el estudio se cerró mientras tanto */ }
  });
})(typeof window !== "undefined" ? window : globalThis);
