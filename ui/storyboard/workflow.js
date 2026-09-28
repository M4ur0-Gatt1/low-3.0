/* ══════════════════════════════════════════════════════════════════════════
   STORYBOARD → ANIMATIC → ESCENA

   Lo que el panel no podía hacer: pasar del storyboard a ANIMAR. La animática
   del panel sirve para juzgar el ritmo, pero después había que rearmar todo a
   mano. Acá:

   - `capture`: el cuadro actual del 2D queda como imagen del plano, DENTRO de
     la escena (PNG en data URI; no depende de una ruta que después falte).
     Va por `updateStoryboardBoard`, así que entra en Undo.
   - `buildAnimatic`: arma OTRO documento con un Drawing por plano, expuesto
     exactamente su duración (holds, no copias) y el rango de salida igual a la
     suma. El original no se toca. Si falta la imagen de algún plano, se niega y
     dice cuáles: un animatic con huecos negros no sirve para juzgar nada.
   - El audio viaja al animatic con transporte PROPIO (`cloneFor`): retimarlo
     allá no mueve el del storyboard.

   Traído de la rama codex/animation-workflow (58d75f5, sobre v4.43.1). SU
   visor propio se dejó afuera a propósito: reproducía con
   requestAnimationFrame, que se congela con la ventana oculta, y el panel ya
   tiene la animática sobre el reproductor de la escena (reloj real + audio).

   @module storyboard/workflow
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const storyboard = LOW.storyboard = LOW.storyboard || {};

  /** La imagen del plano, sólo si es un PNG embebido de verdad. */
  const imageOf = (board) => {
    const png = board && board.drawingRef && board.drawingRef.png;
    return /^data:image\/png;base64,[A-Za-z0-9+/=\s]+$/.test(png || "") ? png : null;
  };

  function buildAnimatic(source) {
    const boards = source.scene.storyboard.boards;
    if (!boards.length) throw Error("Agregá al menos un plano.");
    const missing = boards.map((b, i) => imageOf(b) ? null : i + 1).filter(Boolean);
    if (missing.length) throw Error("Falta una imagen en los planos: " + missing.join(", ") +
      ". Capturá el dibujo antes de crear el animatic.");
    const total = source.scene.boardDuration();
    if (!Number.isSafeInteger(total) || total > 100000)
      throw Error("La secuencia supera los 100.000 cuadros. Dividila en escenas.");
    const doc = new LOW.animation.LowDoc();
    doc.scene.setSize(source.scene.width, source.scene.height);
    doc.scene.name = source.scene.name + " · Animatic";
    doc.scene.fps = source.scene.fps;
    doc.scene.storyboard = LOW.animation.storyboardData(source.scene.storyboard);
    doc.level.name = "Planos del storyboard";
    doc.layer.name = "Animatic";
    const timing = source.scene.boardTiming();
    boards.forEach((board, i) => {
      doc.level.addDrawing(i + 1, `<image xmlns="http://www.w3.org/2000/svg" href="${imageOf(board)}" x="0" y="0" ` +
        `width="${doc.scene.width}" height="${doc.scene.height}" preserveAspectRatio="xMidYMid meet"/>`);
      for (let f = timing[i].from; f <= timing[i].to; f++) doc.layer.setCell(f, i + 1);
    });
    if (source.audio && typeof source.audio.cloneFor === "function") doc.audio = source.audio.cloneFor(doc);
    doc.scene.range = { in: 1, out: total };
    doc.touch();
    return doc;
  }

  /** El cuadro actual como imagen del plano elegido. */
  async function capture(view) {
    const app = (typeof DZ !== "undefined") ? DZ : null;
    const doc = view.doc, board = view._selected();
    if (!board || !app || doc !== app.doc) return;
    dzDocCommit();
    const png = await dzSvgToPng(dzCuadroSvgTexto(doc.frame), Math.max(doc.scene.width, doc.scene.height));
    if (!png) throw Error("No se pudo capturar el dibujo. Revisá las imágenes enlazadas.");
    // el PNG tarda: si en el medio cambió el documento o se borró el plano, no se escribe
    if (view.doc !== doc || app.doc !== doc || !doc.scene.board(board.id))
      throw Error("Cambió la escena durante la captura. Volvé a intentarlo.");
    doc.updateStoryboardBoard(board.id, { drawingRef: { kind: "drawing", png, frame: doc.frame } },
      "Capturar dibujo para el storyboard");
    if (view.status) view.status("Dibujo capturado. La imagen queda guardada dentro de la escena.");
  }

  /** Abre el animatic en otra pestaña; el storyboard original sigue en la suya. */
  function openAnimatic(view) {
    const doc = buildAnimatic(view.doc);
    dzDocCommit(); dzDocumentTabPrepareNew(); dzDocUse(doc);
    dzDocumentTabRegister("scene:" + doc.scene.id, doc.scene.name);
    const panel = document.getElementById("dzStoryboard");
    if (panel) panel.hidden = true;
    requestAnimationFrame(dzFitView);
    dzSetStatus("Animatic creado en otra pestaña. Guardá la nueva escena como .low; el storyboard original se conserva.");
    return doc;
  }

  storyboard.workflow = { imageOf, buildAnimatic, capture, openAnimatic };
})(typeof window !== "undefined" ? window : globalThis);
