/* ══════════════════════════════════════════════════════════════════════════
   IMPORTAR UN PROYECTO DE STORYBOARDER

   La puesta de cámara con monigotes 3D posables ya existe en Storyboarder
   (Shot Generator). En vez de rehacerla, se abre su proyecto: posás allá,
   guardás, y acá quedan los planos para hacer el animatic y animar.

   OJO CON LA LICENCIA: Storyboarder NO es software libre (v3: EULA de Wonder
   Unit; antes «MIT + excepciones», sin distribución comercial de terceros).
   Por eso acá no hay NADA de su código ni de sus modelos: sólo se lee el
   FORMATO de sus archivos (JSON + carpeta images/), que es interoperabilidad.

   Qué se trae de cada panel:
   - la imagen, aplanada como la ve Storyboarder: capas en su orden y el calco
     con su opacidad (lo lee main.py); si no hay capas, el posterframe;
   - la duración (milisegundos → cuadros de ESTA escena, conservando segundos);
   - toma («1A»), diálogo, acción y notas;
   - en `source`, lo que LOW todavía no usa pero no se puede perder: el Shot
     Generator completo (cámara, personajes y la rotación de cada hueso) y el
     audio del panel.

   Qué NO se trae todavía, y se DICE al importar: el audio por panel (LOW tiene
   una sola pista por escena) y la cámara del Shot Generator traducida a la
   del generador de tomas.

   Todo entra como UNA sola entrada de Undo.

   @module storyboard/storyboarder-import
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const storyboard = LOW.storyboard = LOW.storyboard || {};

  const LADO_MAX = 1280;        // px del lado largo de la imagen aplanada

  /** Milisegundos de Storyboarder → cuadros de la escena de LOW. */
  function cuadros(ms, fps) {
    const n = Number(ms);
    return Math.max(1, Math.round((Number.isFinite(n) && n > 0 ? n : 2000) * Math.max(1, fps || 24) / 1000));
  }

  /** El proyecto leído por main.py → datos de panel de LOW (sin imagen). */
  function toBoards(project, fps) {
    const porDefecto = Number(project && project.defaultBoardTiming) || 2000;
    return ((project && project.boards) || []).map((b) => ({
      name: typeof b.shot === "string" ? b.shot : "",
      action: b.action || "", dialogue: b.dialogue || "", notes: b.notes || "",
      duration: cuadros(b.duration != null ? b.duration : porDefecto, fps),
      source: { app: "storyboarder", version: project.version || "", uid: b.uid || null,
        number: b.number == null ? null : b.number, shot: b.shot || null, newShot: !!b.newShot,
        audio: b.audio || null, sg: b.sg || null },
    }));
  }

  const cargarImagen = (src) => new Promise((ok, fail) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = () => fail(Error("imagen ilegible"));
    img.src = src;
  });

  /** Capas → UN PNG, del tamaño de la primera capa (limitado a LADO_MAX). */
  async function aplanar(capas, posterframe) {
    const fuentes = capas && capas.length ? capas : (posterframe ? [{ data: posterframe, opacity: 1 }] : []);
    if (!fuentes.length) return null;
    const imgs = [];
    for (const c of fuentes) {
      try { imgs.push({ img: await cargarImagen(c.data), opacity: c.opacity == null ? 1 : +c.opacity }); }
      catch (_) { /* una capa rota no tumba el panel */ }
    }
    if (!imgs.length) return null;
    const w0 = imgs[0].img.naturalWidth || 1, h0 = imgs[0].img.naturalHeight || 1;
    const k = Math.min(1, LADO_MAX / Math.max(w0, h0));
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(w0 * k)); cv.height = Math.max(1, Math.round(h0 * k));
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#ffffff";                    // el papel: las capas son transparentes
    ctx.fillRect(0, 0, cv.width, cv.height);
    for (const { img, opacity } of imgs) {
      ctx.globalAlpha = Math.max(0, Math.min(1, opacity));
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
    }
    ctx.globalAlpha = 1;
    return cv.toDataURL("image/png");
  }

  /** Arma los paneles con imagen. No toca el documento. */
  async function prepare(project, fps) {
    const datos = toBoards(project, fps);
    const sinImagen = [];
    for (let i = 0; i < datos.length; i++) {
      const b = project.boards[i];
      const png = await aplanar(b.layers, b.posterframe);
      if (png) datos[i].drawingRef = { kind: "storyboarder", png };
      else sinImagen.push(i + 1);
    }
    return { boards: datos, sinImagen };
  }

  /** Lo que se le dice a quien importa: qué entró y qué no. */
  function resumen(project, prep) {
    const n = prep.boards.length;
    const partes = [n + " panel(es) importados de «" + (project.name || "Storyboarder") + "»"];
    if (prep.sinImagen.length) partes.push("sin imagen: " + prep.sinImagen.join(", "));
    if (project.missing && project.missing.length)
      partes.push("faltan en images/: " + project.missing.slice(0, 4).join(", ") + (project.missing.length > 4 ? "…" : ""));
    const conAudio = prep.boards.filter((b) => b.source.audio).length;
    if (conAudio) partes.push(conAudio + " con audio: todavía no se importa, cargalo con Animación → Cargar audio");
    const conSg = prep.boards.filter((b) => b.source.sg).length;
    if (conSg) partes.push(conSg + " con Shot Generator: cámara y personajes quedan guardados en el panel");
    return partes.join(" · ");
  }

  /** El recorrido completo desde el panel. */
  async function importInto(view) {
    const api = global.pywebview && global.pywebview.api;
    if (!api || typeof api.import_storyboarder !== "function") throw Error("Importar Storyboarder necesita la app de escritorio.");
    const r = await api.import_storyboarder();
    if (!r || r.cancel) return null;
    if (r.error) throw Error(r.error);
    const doc = view.doc;
    if (!r.boards || !r.boards.length) throw Error("El proyecto no tiene paneles.");
    const prep = await prepare(r, doc.scene.fps);
    if (view.doc !== doc) throw Error("Cambió la escena durante la importación. Volvé a intentarlo.");
    const ids = doc.addStoryboardBoards(prep.boards, "Importar Storyboarder");
    if (ids.length) view.selectedId = ids[0];
    view.render();
    const texto = resumen(r, prep);
    if (view.status) view.status(texto);
    return { ids, texto };
  }

  storyboard.storyboarderImport = { cuadros, toBoards, aplanar, prepare, resumen, importInto };
})(typeof window !== "undefined" ? window : globalThis);
