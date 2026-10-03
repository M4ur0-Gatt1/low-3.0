/* RESCATE DE UNA ESCENA (.low) QUE QUEDÓ SIN GUARDAR.

   POR QUE EXISTE. Medido el 3-oct-2026 en la app real, con dos capas y tres
   dibujos sin guardar y LOW cerrado a la fuerza:

   1. La pantalla inicial ofrecía «Recuperar lo que quedó sin guardar» y el
      botón creaba un documento NUEVO Y VACÍO. Delegaba en «Nuevo documento»
      esperando que `dzDocInit` encontrara el rescate, pero el documento nuevo
      ya no pasa por ahí. Y el vacío pasaba a ser el rescate más nuevo: la
      próxima vez se ofrecía ESE, y el trabajo quedaba inalcanzable.
   2. Abrir el mismo .low con «Abrir documento…» no ofrecía nada, y al seguir
      trabajando el autoguardado PISABA el rescate (misma identidad por ruta).

   Acá vive la decisión, fuera de app.js (que está en su techo de líneas):
   - `dzEscenaConRescate(leido)`: recibe lo que el puente leyó del disco y, si
     hay un rescate DISTINTO con trabajo de verdad, pregunta. Si se elige
     recuperar, devuelve lo rescatado marcado `rescatado: true`.
   - `dzEscenaRescatar(identidad)`: el botón de la pantalla inicial. Abre lo
     rescatado en SU archivo, por el mismo `dzSceneOpen` de siempre.
   - `dzEscenaRescatadaMarcar(doc)`: lo abierto figura SIN GUARDAR, para que
     se note y Ctrl+S lo escriba. El rescate NO se borra: se borra al guardar.
   - `dzEscenaTieneTrabajo(contenido)`: dos planos vacíos no son trabajo. La
     vara vieja —más de 40 caracteres— los contaba como tal. */
(function (global) {
  "use strict";

  const almacen = () => (global.LOW && global.LOW.workspace && global.LOW.workspace.sceneRecovery) || null;

  /* La HOJA no es trabajo. «Nuevo documento» mete el papel blanco
     (<rect data-low-page>) dentro del dibujo 1, y `drawingIsEmpty` sólo
     descuenta los planos vacíos: medido en la app real, un documento recién
     creado contaba como trabajo y tapaba al rescate de dos capas. */
  const HOJA = /<rect\b[^>]*\bdata-low-page\b[^>]*?(?:\/>|>\s*<\/rect>)/gi;
  function vacio(contenido) {
    const sinHoja = String(contenido || "").replace(HOJA, "");
    const A = global.LOW && global.LOW.animation;
    if (A && typeof A.drawingIsEmpty === "function") return A.drawingIsEmpty(sinHoja);
    return !/<(path|rect|circle|ellipse|line|polyline|polygon|text|image|use)\b/i.test(sinHoja);
  }

  function tieneTrabajo(contenido) {
    const escena = contenido && contenido.scene;
    return ((escena && escena.levels) || []).some((nivel) =>
      (nivel.drawings || []).some((d) => d && d.content && !vacio(d.content)));
  }

  /** Lo que importa comparar es la ESCENA: el cuadro o la capa activa no son trabajo. */
  function mismaEscena(a, b) {
    try {
      const A = global.LOW.animation.LowDoc;
      return JSON.stringify(A.fromJSON(a).toJSON().scene) === JSON.stringify(A.fromJSON(b).toJSON().scene);
    } catch (_) { return false; }
  }

  function cuando(marca) {
    const t = Number(marca);
    if (!Number.isFinite(t) || t <= 0) return "";
    const min = Math.round((Date.now() - t) / 60000);
    if (min < 1) return " hace un instante";
    if (min < 60) return " hace " + min + " min";
    const h = Math.round(min / 60);
    if (h < 24) return " hace " + h + (h === 1 ? " hora" : " horas");
    try { return " el " + new Date(t).toLocaleDateString(); } catch (_) { return ""; }
  }

  const nombreDe = (ruta, respaldo) => {
    const partes = String(ruta || "").split(/[\\/]/);
    return partes[partes.length - 1] || respaldo || "la escena";
  };

  async function conRescate(leido) {
    if (!leido || leido.error || !leido.path || !leido.content) return leido;
    const st = almacen();
    if (!st || typeof st.get !== "function") return leido;
    let registro = null;
    try { registro = st.get(st.identity({ path: leido.path })); } catch (_) { return leido; }
    if (!registro || !tieneTrabajo(registro.content)) return leido;
    if (mismaEscena(leido.content, registro.content)) return leido;
    const preguntar = global.dzConfirmModal;
    if (typeof preguntar !== "function") return leido;
    const si = await preguntar("«" + nombreDe(leido.path, leido.name) + "» tiene cambios que no llegaron a " +
      "guardarse (de" + (cuando(registro.savedAt) || " antes") + "). ¿Abrís esos cambios o lo último guardado?",
      { ok: "Recuperar los cambios", cancel: "Abrir lo guardado", title: "Cambios sin guardar" });
    if (!si) return leido;
    return { ...leido, content: registro.content, rescatado: true };
  }

  function marcar(doc) {
    if (!doc) return;
    doc.dirty = true;
    try { if (typeof DZ !== "undefined" && DZ) DZ.dirty = true; } catch (_) { /* sin app */ }
    try {
      const tab = typeof dzDocumentTabCurrent === "function" ? dzDocumentTabCurrent() : null;
      if (tab) { tab.dirty = true; if (typeof dzDocumentTabsRender === "function") dzDocumentTabsRender(); }
    } catch (_) { /* las pestañas son vista */ }
    if (typeof global.dzSetStatus === "function")
      global.dzSetStatus(" Escena recuperada · todavía SIN GUARDAR · Ctrl+S la guarda en su archivo");
  }

  async function rescatar(identidad) {
    const st = almacen();
    const registro = st && identidad ? st.get(identidad) : null;
    if (!registro || !registro.content) {
      if (typeof global.dzNotice === "function") await global.dzNotice("Ese punto de recuperación ya no está.");
      return false;
    }
    const ruta = registro.path || null;
    const leido = { path: ruta, name: nombreDe(ruta, registro.name), content: registro.content, rescatado: true };
    return typeof global.dzSceneOpen === "function" ? global.dzSceneOpen(ruta, leido) : false;
  }

  global.dzEscenaConRescate = conRescate;
  global.dzEscenaRescatar = rescatar;
  global.dzEscenaRescatadaMarcar = marcar;
  global.dzEscenaTieneTrabajo = tieneTrabajo;
})(window);
