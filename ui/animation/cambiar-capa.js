/* ══════════════════════════════════════════════════════════════════════════
   EL LIENZO SÓLO SE GUARDA EN LA CAPA QUE ESTÁ MOSTRANDO

   MEDIDO en v4.51.0, con clics reales: dos capas, la 1 con dibujo. Clic en el
   nombre de la Capa 1 → el lienzo SEGUÍA mostrando la capa anterior (nadie
   escuchaba el aviso «layer»). Un trazo → el volcado con retardo escribía el
   lienzo en el dibujo de la capa ELEGIDA: el dibujo de la Capa 1 se perdía
   (484 → 247 caracteres, el círculo ya no estaba).

   La misma familia, por otra puerta: «+ Capa» de la X-sheet crea la capa sin
   repintar, así que el lienzo sigue mostrando la anterior y el volcado se la
   COPIABA a la capa nueva. La cazó check_workspace_ui («ocultar pistas vacías»
   dejó de encontrar la vacía).

   La causa común es una sola, y el arreglo también: el volcado escribía el
   lienzo en «el dibujo actual» sin saber de QUIÉN era lo que el lienzo
   mostraba. Ahora:
   1. cada vez que el lienzo se pinta desde el documento, se anota de qué capa
      y qué cuadro es;
   2. el volcado (dzDocCommit) no escribe si el lienzo es de OTRA capa u otro
      cuadro: guardar ahí sería pisar un dibujo ajeno;
   3. cambiar de capa o crear una guarda lo de la capa que se deja y repinta
      con la que queda activa.

   Va en la capa de autoría, envolviendo, y no en app.js por el presupuesto.
   Es la misma lección que el Ctrl+V que se comía el cuadro (setCell en
   document.js): un lienzo desactualizado no es sólo visual.

   @module animation/cambiar-capa
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};
  const app = () => (typeof DZ !== "undefined") ? DZ : null;

  /** De quién es lo que el lienzo muestra ahora: { doc, layerId, frame }. */
  let lienzoDe = null;
  const anotar = () => {
    const a = app();
    lienzoDe = a && a.doc ? { doc: a.doc, layerId: a.doc.layerId, frame: a.doc.frame } : null;
  };
  /** ¿El lienzo muestra la capa y el cuadro actuales del documento activo? */
  function lienzoEsDelActual() {
    const a = app();
    // Sólo se BLOQUEA cuando es seguro que el lienzo es de otra capa o cuadro
    // del MISMO documento. Sin registro, o con registro de otro documento (hay
    // caminos que pintan sin pasar por dzCanvasSet), se guarda como siempre:
    // bloquear de más perdería trazos, que es peor que el defecto que se arregla.
    if (!a || !a.doc || !lienzoDe || lienzoDe.doc !== a.doc) return true;
    return lienzoDe.layerId === a.doc.layerId && lienzoDe.frame === a.doc.frame;
  }
  const cancelarVolcado = () => {
    // DZ_DOC_TIMER es de app.js (ámbito global compartido entre scripts)
    try { if (typeof DZ_DOC_TIMER !== "undefined") clearTimeout(DZ_DOC_TIMER); } catch (_) { /* nada pendiente */ }
  };

  function envolverApp() {
    let hecho = false;
    const set = global.dzCanvasSet;
    if (typeof set === "function" && !set.__lienzoDe) {
      const w = function () { const r = set.apply(this, arguments); anotar(); return r; };
      w.__lienzoDe = true; global.dzCanvasSet = w; hecho = true;
    }
    const commit = global.dzDocCommit;
    if (typeof commit === "function" && !commit.__lienzoDe) {
      const w = function () {
        if (!lienzoEsDelActual()) return;          // el lienzo es de otra capa/cuadro: no se pisa
        const r = commit.apply(this, arguments);
        anotar();                                    // lo guardado ES lo que se muestra
        return r;
      };
      w.__lienzoDe = true; global.dzDocCommit = w; hecho = true;
    }
    anotar();
    return hecho;
  }

  function envolverDoc() {
    const P = animation.LowDoc && animation.LowDoc.prototype;
    if (!P || P.selectLayer.__cambiarCapa) return false;
    const conCambio = (original, cambia) => function () {
      const a = app();
      const activo = !!a && a.doc === this;
      const va = activo && cambia.apply(this, arguments);
      if (va) { cancelarVolcado(); if (typeof global.dzDocCommit === "function") global.dzDocCommit(); }
      const r = original.apply(this, arguments);
      if (va) this.emit("frame");                    // el lienzo muestra la capa que quedó activa
      return r;
    };
    const selectLayer = conCambio(P.selectLayer, function (id) { return !!this.scene.layer(id) && id !== this.layerId; });
    selectLayer.__cambiarCapa = true;
    P.selectLayer = selectLayer;
    const addLayer = conCambio(P.addLayer, function () { return true; });
    addLayer.__cambiarCapa = true;
    P.addLayer = addLayer;
    return true;
  }

  animation.cambiarCapa = { envolverApp, envolverDoc, lienzoEsDelActual, get lienzoDe() { return lienzoDe; } };
  envolverDoc();
  // dzCanvasSet y dzDocCommit son de app.js, que carga DESPUÉS de este módulo
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", envolverApp, { once: true });
  else envolverApp();
})(window);
