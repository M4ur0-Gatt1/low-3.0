/* ══════════════════════════════════════════════════════════════════════════
   LA PULSACIÓN LARGA DEL LÁPIZ NO ES UN CLIC DERECHO MIENTRAS SE DIBUJA

   Reporte de Mauro (oct-2026, LOW 3.11.0): «cuando doy la vuelta completa con
   la tableta, como dibujando un pequeño círculo, se activa la herramienta de
   selección… me pasa siempre o casi siempre y es bastante molesto».

   La causa: Windows convierte la PULSACIÓN LARGA del lápiz en un CLIC DERECHO
   —basta que la punta quede un instante dentro de un radio chico, y un
   círculo chico y lento nunca sale de ese radio—. El clic derecho en el lienzo
   SELECCIONA lo que hay abajo para abrir su menú, y abajo estaba justo el trazo
   recién dibujado: quedaba seleccionado («1 pieza») con el menú abierto. El
   botón lateral del lápiz, apretado sin querer al girarlo, hace lo mismo.

   Acá: con una herramienta de dibujo, el clic derecho que llega DURANTE un
   trazo de lápiz o enseguida después (700 ms) se descarta, venga marcado
   como lápiz o como mouse. Fuera de ese momento, el clic derecho del mouse y
   el botón lateral con la punta en el aire siguen abriendo el menú.

   @module drawing/pulsacion-larga
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const doc = global.document;
  const D = () => (typeof DZ !== "undefined" ? DZ : null);
  const VENTANA = 700;
  let trazando = false, fin = -Infinity;
  const enLienzo = (e) => { const cv = doc.querySelector("#dzCanvas"); return !!(cv && e.target && cv.contains(e.target)); };
  const deSeleccion = () => ["select", "direct"].includes(D()?.tool || "select");

  doc.addEventListener("pointerdown", (e) => { if (e.pointerType === "pen" && e.button === 0 && enLienzo(e)) trazando = true; }, true);
  const soltar = (e) => { if (e.pointerType === "pen" && trazando) { trazando = false; fin = global.performance.now(); } };
  doc.addEventListener("pointerup", soltar, true);
  doc.addEventListener("pointercancel", soltar, true);

  doc.addEventListener("contextmenu", (e) => {
    // se decide por el MOMENTO, no por el tipo: según el controlador de la
    // tableta, Windows manda ese clic derecho como si fuera del mouse
    if (!enLienzo(e) || deSeleccion()) return;
    if (!(trazando || global.performance.now() - fin < VENTANA)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
  }, true);

  global.LOW = global.LOW || {};
  global.LOW.drawing = global.LOW.drawing || {};
  global.LOW.drawing.pulsacionLarga = { VENTANA, get trazando() { return trazando; } };
})(typeof window !== "undefined" ? window : globalThis);
