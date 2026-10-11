/* ══════════════════════════════════════════════════════════════════════════
   OCULTAR LA CAPA ACTIVA OCULTA DE VERDAD

   Reporte de Mauro (oct-2026, LOW 3.15): «el botón ocultar capa no anda».
   Medido con clics de verdad:
   · el ojo de la línea de tiempo marcaba la capa como oculta en el
     documento, y las OTRAS capas desaparecían de la mesa (las pinta
     animation/capas-en-mesa.js, que ya respeta `visible`)… pero la capa
     ACTIVA, la que está en la mesa para dibujar, seguía viéndose igual:
     nadie la escondía;
   · el ojo del panel de Capas era un <span> VACÍO de 18×0 px mientras el
     elemento estaba visible: no se veía ni se podía tocar (arreglado en
     app.js, dzLayerRow, con el icono del ojo).

   Acá: si la capa activa está oculta, el dibujo de la mesa se esconde —el
   papel, las guías y los fantasmas de las otras capas no— y la barra de
   estado lo dice, porque dibujar a ciegas en una capa oculta es un error
   fácil de cometer.

   @module animation/capa-oculta
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const CLASE = "capa-activa-oculta";
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  let antes = null;

  function pintar() {
    const d = dz(), cv = document.getElementById("dzCanvas");
    if (!cv) return;
    const ly = d && d.doc && d.doc.layer;
    const oculta = !!(ly && ly.visible === false);
    cv.classList.toggle(CLASE, oculta);
    const clave = ly ? ly.id + ":" + oculta : "";
    if (oculta && clave !== antes && typeof global.dzSetStatus === "function")
      global.dzSetStatus("La capa «" + ly.name + "» está oculta: lo que dibujes en ella no se ve · el ojo de la línea de tiempo la vuelve a mostrar");
    antes = clave;
  }

  const suscritos = new WeakSet();
  function seguir() {
    const d = dz(), doc = d && d.doc;
    if (doc && !suscritos.has(doc) && typeof doc.subscribe === "function") {
      suscritos.add(doc);
      doc.subscribe(() => pintar());
    }
    pintar();
  }

  global.LOW = global.LOW || {};
  global.LOW.animation = global.LOW.animation || {};
  global.LOW.animation.capaOculta = { pintar, CLASE };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", seguir, { once: true });
  else seguir();
  setInterval(seguir, 700);   // un documento nuevo, abierto o cambiado de pestaña
})(window);
