/* ══════════════════════════════════════════════════════════════════════════
   SOSTENER AL PERSONAJE EN TODO EL RANGO

   Reportado: «no entiendo cómo se anima, porque el personaje no está en todos
   los frames, está sólo en el primer frame, pero el esqueleto sí está en
   todos».

   No estaba haciendo nada mal. En cut-out el dibujo se hace UNA vez y se
   SOSTIENE a lo largo del plano; lo que cambia cuadro a cuadro son las poses
   del esqueleto. Su personaje estaba expuesto sólo en el cuadro 1, así que
   del 2 en adelante el rig no tenía a quién mover.

   LO QUE FALLABA NO ERA EL MODELO, ERA LA PANTALLA. Dos cosas:

   1. El panel decía «Rig listo para animar · todas las piezas detectadas
      están vinculadas» —en verde— mientras posar en el cuadro 12 no movía
      nada. El bloque no miraba la EXPOSICIÓN: un rig puede estar
      perfectamente vinculado y ser inusable porque el arte vive en un solo
      cuadro.
   2. La barra de estado sí lo decía —«F12: este cuadro no tiene al personaje
      · sostené su dibujo (↔ en la hoja de tiempos)»— pero pedía una maniobra
      con una manija chiquita de la hoja de tiempos, sin ofrecer la acción.
      Nombrar un problema sin dar el botón deja a la persona buscando.

   ESTE MÓDULO da la cuenta y la acción:

   · `dzPersonajeHasta()` — hasta qué cuadro llega el personaje y hasta cuál
     debería llegar (lo más lejos donde haya una clave del rig, o el final
     del rango de la escena).
   · `dzSostenerPersonaje()` — repite la última exposición hasta cubrirlo. Es
     un HOLD, no copias: la misma celda expuesta, que es como se hace en
     cut-out y lo que espera cualquiera que venga de OpenToonz o TVPaint.

   No inventa dibujos ni toca los que ya están: si un cuadro ya tiene algo
   expuesto, se respeta. Sostener nunca pisa trabajo.

   @module animation/sostener-personaje
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};
  const estado = () => (typeof DZ !== "undefined") ? DZ : null;

  /** La capa donde vive el personaje: la del documento. */
  function capa(doc) {
    const id = doc.layerId || (doc.scene.layers && doc.scene.layers[0] && doc.scene.layers[0].id);
    return (doc.scene.layers || []).find((l) => l.id === id) || (doc.scene.layers || [])[0] || null;
  }

  /** Hasta dónde llega el personaje y hasta dónde tendría que llegar. */
  function hasta() {
    const DZ = estado();
    if (!DZ || !DZ.doc) return null;
    const doc = DZ.doc, ly = capa(doc);
    if (!ly || typeof ly.lastFrame !== "function") return null;
    const expuesto = ly.lastFrame() || 0;

    // Lo que hay que cubrir: la clave de rig más lejana, o el rango declarado.
    let necesario = 0;
    const nodos = (doc.scene.rig && doc.scene.rig.nodes) || {};
    for (const n of Object.values(nodos))
      for (const k of Object.keys(n.keys || {})) necesario = Math.max(necesario, +k || 0);
    const rango = doc.scene.range || {};
    if (rango.out > 0) necesario = Math.max(necesario, rango.out);
    if (typeof doc.scene.lastFrame === "function") necesario = Math.max(necesario, doc.scene.lastFrame());

    return { expuesto, necesario, falta: Math.max(0, necesario - expuesto) };
  }

  /** Repite la última exposición hasta cubrir el rango. Devuelve cuántos
   *  cuadros llenó, o 0 si no hacía falta (o no se pudo). */
  function sostener() {
    const DZ = estado();
    if (!DZ || !DZ.doc) return 0;
    const doc = DZ.doc, ly = capa(doc);
    const cuenta = hasta();
    if (!ly || !cuenta || !cuenta.falta) return 0;
    if (typeof ly.cellAt !== "function" || typeof doc.scene.expose !== "function") return 0;

    // el dibujo que se sostiene es el último expuesto, no el del cuadro actual:
    // si uno está parado en un cuadro vacío, el actual no es ninguno
    const dibujo = ly.cellAt(cuenta.expuesto);
    if (dibujo == null) return 0;

    let puestos = 0;
    for (let f = cuenta.expuesto + 1; f <= cuenta.necesario; f++) {
      if (ly.cellAt(f) != null) continue;          // ya hay algo: no se pisa
      if (doc.scene.expose(ly.id, f, dibujo)) puestos++;
    }
    if (puestos && typeof doc.touch === "function") doc.touch();
    return puestos;
  }

  /** Lo mismo, pero contándolo y repintando: es lo que engancha el botón. */
  function sostenerYAvisar() {
    const puestos = sostener();
    const c = hasta();
    if (typeof global.dzSetStatus === "function") {
      global.dzSetStatus(puestos
        ? "Personaje sostenido en " + puestos + " cuadro(s) más · ahora el esqueleto lo mueve en todo el plano"
        : (c && !c.falta
          ? "El personaje ya está en todo el rango"
          : "No hay ningún dibujo expuesto que sostener: dibujá el personaje en el primer cuadro"));
    }
    for (const fn of ["dzBuildLayers", "dzTimelineBadges", "dzXsRender", "dzRigPanelSync", "dzMarkDirty"])
      if (typeof global[fn] === "function") { try { global[fn](); } catch (_) { /* repintar es de mejor esfuerzo */ } }
    if (typeof global.dzRigApplyLive === "function" && typeof global.dzRigCur === "function") {
      try { global.dzRigApplyLive(global.dzRigCur()); } catch (_) { /* idem */ }
    }
    return puestos;
  }

  /* F5, COMO EN TOON BOOM.  Mauro lo recordaba y la documentación de Harmony
     lo confirma: F5 es «Extend Exposure» y F6 «Insert Keyframe» (Timeline
     Keyboard Shortcuts, Harmony 22). Quien viene de ahí lo va a apretar sin
     pensar, así que hace lo mismo acá.

     Se corta el evento SIEMPRE que se atiende: F5 recarga la página en el
     navegador y en WebView2, y perder el trabajo por pedir un sostenido
     sería el peor cambio posible. Y no se roba la tecla mientras se escribe
     en un campo. */
  function esCampo(el) {
    if (!el) return false;
    const t = (el.tagName || "").toLowerCase();
    return t === "input" || t === "textarea" || t === "select" || el.isContentEditable;
  }

  function atajo(e) {
    if (e.key !== "F5" || e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;
    if (esCampo(document.activeElement)) return;
    const DZ = estado();
    if (!DZ || !DZ.doc) return;            // sin documento, que recargue si quiere
    e.preventDefault(); e.stopPropagation();
    sostenerYAvisar();
  }

  document.addEventListener("keydown", atajo, true);

  animation.sostenerPersonaje = { hasta, sostener, sostenerYAvisar, capa, atajo };
  global.dzPersonajeHasta = hasta;
  global.dzSostenerPersonaje = sostenerYAvisar;
})(window);
