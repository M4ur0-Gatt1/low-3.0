/* ══════════════════════════════════════════════════════════════════════════
   EL RESCATE ANTE CAÍDAS NO FALLA EN SILENCIO (v3.44, fase 1 del camino a la
   estabilidad)

   El rescate (lo sin guardar, por si LOW se cierra mal) vive en el
   almacenamiento del navegador, ~5 MB por origen. Un documento de más de 2,5 MB,
   o un almacén lleno, y `saveNow` devolvía false… y nadie lo miraba: el día de
   la caída no había nada que recuperar y nada había dicho por qué.

   Acá se envuelven los dos almacenes (documento y escena): si el rescate no
   entra, se AVISA una vez por documento —y otra vez si volvió a entrar y
   después dejó de entrar—, con el remedio: guardar seguido. Llevar el rescate
   al disco es el paso siguiente de la fase 1 (docs/CAMINO_ESTABILIDAD.md).

   @module workspace/rescate-aviso
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const avisados = new Set();
  const mb = (n) => (n / 1048576).toFixed(1).replace(".", ",") + " MB";
  function avisar(clave, tam) {
    if (avisados.has(clave)) return;
    avisados.add(clave);
    const texto = "⚠ El rescate ante caídas no entra en el almacenamiento" + (tam ? " (" + mb(tam) + ")" : "") +
      ": si LOW se cierra mal no vas a poder recuperar lo último · guardá seguido (Ctrl+S)";
    try { (global.dzSetStatus || console.warn)(texto); } catch (_) { console.warn(texto); }
    try { console.warn("[rescate] " + texto); } catch (_) { /* */ }
  }
  function envolver(almacen, clavePara, tamPara) {
    if (!almacen || typeof almacen.saveNow !== "function" || almacen.saveNow.__conAviso) return;
    const original = almacen.saveNow.bind(almacen);
    const saveNow = function (id, contenido, meta) {
      const ok = original(id, contenido, meta);
      if (id && contenido) {
        const clave = clavePara(id);
        if (ok) avisados.delete(clave); else avisar(clave, tamPara(contenido));
      }
      return ok;
    };
    saveNow.__conAviso = true;
    almacen.saveNow = saveNow;
  }
  function instalar() {
    const ws = global.LOW && global.LOW.workspace;
    if (!ws) return;
    envolver(ws.recovery, (p) => "doc:" + p, (c) => String(c).length);
    envolver(ws.sceneRecovery, (id) => "esc:" + id, (c) => { try { return JSON.stringify(c).length; } catch (_) { return 0; } });
  }
  instalar();
  if (global.document && global.document.readyState !== "complete") global.addEventListener("load", instalar);
  global.LOW = global.LOW || {}; (global.LOW.workspace = global.LOW.workspace || {}).rescateAviso = { avisados };
})(typeof window !== "undefined" ? window : globalThis);
