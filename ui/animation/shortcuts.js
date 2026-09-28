/* ══════════════════════════════════════════════════════════════════════════
   ATAJOS DE ANIMACIÓN

   Los que se usan sin mirar el teclado, tomados del flujo de OpenToonz. El
   detalle que más cambia el trabajo diario es la distinción entre moverse por
   FRAMES y moverse por DIBUJOS: dentro de un hold de cuatro frames uno no
   quiere pulsar cuatro veces para llegar al dibujo siguiente.

     ← →            frame anterior / siguiente
     ↑ ↓            dibujo anterior / siguiente (saltea los holds)
     Inicio / Fin   primer / último frame del rango
     Espacio        MANO: mantener y arrastrar para panear (nunca reproduce)
     Enter          reproducir / parar (reasignable en Preferencias)
     L              loop
     . ,            alargar / acortar la exposición actual
     Insert         insertar un frame vacío
     Supr           vaciar la celda (el DIBUJO no se toca)
     O              papel cebolla
     Ctrl+C / Ctrl+V  copiar y pegar. Sin rango seleccionado copia el DIBUJO
                      y pega una copia aparte; con un rango, copia las CELDAS
                      (tiempo). Ctrl+Shift+V pega como REUSO del mismo dibujo.
     Ctrl+X           cortar celdas

   No se activan mientras se escribe en un campo: eso arruinaba los atajos de
   una tecla en cualquier programa que lo haya intentado.

   @module animation/shortcuts
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};

  function escribiendo() {
    const e = document.activeElement;
    if (!e) return false;
    const t = (e.tagName || "").toLowerCase();
    return t === "input" || t === "textarea" || t === "select" || e.isContentEditable;
  }

  /** Portapapeles de celdas: guarda REFERENCIAS, no dibujos. Pegar en otro
   *  lado no duplica el dibujo, lo vuelve a exponer — que es justo la ventaja
   *  de tener el nivel separado del tiempo. */
  const clip = { range: null };

  /** HIST-02 de la matriz: copiar, cortar y pegar celdas es UN comando, no una
   *  copia por cada camino de entrada. Antes vivía tres veces —X-sheet, barra
   *  de la Timeline y teclado— y bastaba tocar una para que las tres dejaran de
   *  producir el mismo estado. Acá el rango, las etiquetas de Undo y el mensaje
   *  son los mismos vengan de donde vengan. */
  const cells = {
    copy(doc, seleccion) {
      const sel = cells.rango(doc, seleccion);
      if (!doc || !sel) return null;
      clip.range = doc.readCells(sel);
      return clip.range;
    },
    cut(doc, seleccion) {
      const sel = cells.rango(doc, seleccion);
      if (!doc || !sel) return null;
      clip.range = doc.readCells(sel);
      doc.clearCells(sel, "Cortar rango");
      return clip.range;
    },
    paste(doc) {
      if (!doc || !clip.range) return null;
      doc.pasteCells(clip.range, doc.layerId, doc.frame, { label: "Pegar rango" });
      return clip.range;
    },
    /** Sin selección explícita, el comando trabaja sobre la celda actual. */
    rango(doc, seleccion) {
      if (seleccion) return seleccion;
      if (!doc) return null;
      return { fromLayerId: doc.layerId, toLayerId: doc.layerId, from: doc.frame, to: doc.frame };
    },
    medida(rango) { return rango ? `${rango.width} x ${rango.height} celdas` : ""; },
  };

  function wire(getDoc, getPlayback, opciones) {
    const opts = opciones || {};
    if (global.__lowAnimKeys) return;
    global.__lowAnimKeys = true;

    global.addEventListener("keydown", (e) => {
      const doc = getDoc && getDoc();
      const pb = getPlayback && getPlayback();
      if (!doc) return;
      // Supr sobre una selección de la mesa es una orden inequívoca aunque
      // el último control enfocado haya sido un desplegable del panel.
      if (e.key === "Delete" && opts.deleteScene?.()) {
        e.preventDefault(); e.stopPropagation(); return;
      }
      if (escribiendo()) return;
      const ctrl = e.ctrlKey || e.metaKey;
      const ly = doc.layer;
      let manejado = true;

      switch (e.key) {
        case "ArrowLeft":  pb ? pb.step(-1) : doc.step(-1); break;
        case "ArrowRight": pb ? pb.step(+1) : doc.step(+1); break;
        // ↑ va hacia ATRÁS en el tiempo: en una xsheet el tiempo baja, así que
        // "arriba" es el dibujo anterior. Es la convención de OpenToonz.
        case "ArrowUp":    pb ? pb.stepDrawing(-1) : doc.stepDrawing(-1); break;
        case "ArrowDown":  pb ? pb.stepDrawing(+1) : doc.stepDrawing(+1); break;
        case "Home":       pb ? pb.first() : doc.goTo(1); break;
        case "End":        if (pb) pb.last(); else doc.goTo(doc.scene.lastFrame() || 1); break;
        // La BARRA ESPACIADORA es la mano, siempre y en todos los modos: es el
        // atajo que uno tiene apretado la mitad del tiempo mientras dibuja, y
        // si además reproduce, no se puede panear con la animación abierta.
        // Reproducir vive en el mapa de atajos configurables (Enter por
        // omisión, reasignable desde Preferencias).
        case "Insert":     doc.apply("insert", doc.frame, 1); break;
        case "Delete": {
          // La mesa manda cuando hay arte o un hueso seleccionado. Este
          // listener corre en captura; antes vaciaba la celda y nunca dejaba
          // que Supr llegara al editor de objetos.
          const selected = opts.getSelection && opts.getSelection();
          if (selected) doc.clearCells(selected, "Vaciar rango");
          else doc.apply("clear", doc.frame, doc.frame);
          break;
        }
        case ".":          doc.apply("stepChange", doc.frame, +1); break;
        case ",":          doc.apply("stepChange", doc.frame, -1); break;
        default: manejado = false;
      }

      if (!manejado && !ctrl) {
        const k = e.key.toLowerCase();
        if (k === "l" && pb) { pb.setLoop(!pb.loop); manejado = true; }
        else if (k === "o" && opts.toggleOnion) { opts.toggleOnion(); manejado = true; }
      }

      // ── Copiar y pegar ────────────────────────────────────────────────
      // UNA regla, y visible: lo que manda es si hay un RANGO seleccionado.
      //
      //   · Sin rango (estás parado en un cuadro) → se copia el DIBUJO, y
      //     pegar deja una copia aparte: retocarla no toca el original. Es lo
      //     que espera cualquiera que dice «copiar este dibujo al otro cuadro».
      //   · Con un rango seleccionado → se copian las CELDAS, que es trabajo de
      //     tiempo: pegar vuelve a exponer los mismos dibujos, sin duplicarlos.
      //   · Ctrl+Shift+V → pegar como REUSO: la misma celda apuntando al mismo
      //     dibujo. Retocarlo cambia todos los cuadros donde está.
      //
      // Antes esto dependía de algo invisible: si la X-sheet estaba montada,
      // sus atajos capturaban primero y pegaban una referencia; si no, otro
      // camino en app.js pegaba una copia. El mismo Ctrl+V hacía dos cosas
      // distintas y ninguna de las dos estaba anunciada.
      if (!manejado && ctrl && ly) {
        const k = e.key.toLowerCase();
        const sel = (opts.getSelection && opts.getSelection()) || null;
        const hayRango = !!(sel && (sel.to > sel.from || sel.fromLayerId !== sel.toLayerId));
        const rango = sel || { fromLayerId: doc.layerId, toLayerId: doc.layerId,
          from: doc.frame, to: doc.frame };
        if (k === "c") {
          manejado = true;
          if (!hayRango && opts.copiarDibujo) opts.copiarDibujo();
          else {
            const r = cells.copy(doc, rango);
            if (opts.status && r) opts.status(cells.medida(r) + " copiadas");
          }
        } else if (k === "x") {
          cells.cut(doc, rango); manejado = true;
        } else if (k === "v") {
          manejado = true;
          if (e.shiftKey && clip.range) {
            const r = cells.paste(doc);
            if (opts.status && r) opts.status(cells.medida(r) + " reexpuestas · es el MISMO dibujo");
          } else if (opts.pegarDibujo && opts.hayDibujoCopiado && opts.hayDibujoCopiado()) {
            opts.pegarDibujo();
          } else if (clip.range) {
            const r = cells.paste(doc);
            if (opts.status && r) opts.status(cells.medida(r) + " pegadas");
          } else manejado = false;
        }
      }

      if (manejado) { e.preventDefault(); e.stopPropagation(); }
    }, true);   // en captura: los atajos de animación mandan sobre los del editor
  }

  animation.shortcuts = { wire, clip, cells };
})(window);
