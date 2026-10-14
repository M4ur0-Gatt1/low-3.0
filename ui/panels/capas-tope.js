/* ══════════════════════════════════════════════════════════════════════════
   PANEL DE CAPAS CON TOPE: no arma una fila por trazo en cada trazo

   Reportado: «para dibujar vectores se pone lento». MEDIDO en la app real
   (WebView2): soltar el lápiz costaba 13 ms con 25 trazos en el dibujo y
   59 ms con 200, creciendo en línea recta. El perfil de CPU lo dijo: después
   de CADA trazo, dzBuildLayers rearmaba la lista entera del panel de capas,
   una fila por elemento (221 filas, 6680 px de alto), aunque en pantalla
   entran nueve. Cuanto más dibujabas, más lento quedaba.

   Ahora se arman las primeras filas y al final una fila «… y N elementos
   más» que, al tocarla, arma otra tanda. El elemento SELECCIONADO siempre
   tiene su fila: si quedó más abajo, se arma hasta él.

   Va aparte de app.js por el presupuesto: envuelve dzBuildLayers y
   dzLayerRow (las llamadas internas de app.js pasan por el global).

   @module panels/capas-tope
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const TANDA = 60;
  const estado = { tope: TANDA, armando: false, filas: 0, salteadas: 0, selArmada: false };

  function enganchar() {
    const build = global.dzBuildLayers, row = global.dzLayerRow;
    if (typeof build !== "function" || typeof row !== "function" || build.__tope) return;

    const fila = function (el) {
      if (!estado.armando) return row.apply(this, arguments);
      const sel = typeof DZ !== "undefined" && DZ ? DZ.sel : null;
      if (estado.filas >= estado.tope) {
        estado.salteadas++;
        // una fila vacía: bajar() la agrega y no pasa nada
        return document.createDocumentFragment();
      }
      estado.filas++;
      if (el === sel) estado.selArmada = true;
      return row.apply(this, arguments);
    };
    fila.__tope = true;
    global.dzLayerRow = fila;

    const armar = function () {
      // re-entrada (un clic de la lista que rearma): la maneja la vuelta de afuera
      if (estado.armando) return build.apply(this, arguments);
      const sel = typeof DZ !== "undefined" && DZ ? DZ.sel : null;
      const previo = estado.tope;
      let r;
      for (let intento = 0; intento < 2; intento++) {
        estado.armando = true; estado.filas = 0; estado.salteadas = 0; estado.selArmada = false;
        try { r = build.apply(this, arguments); } finally { estado.armando = false; }
        // la selección quedó más abajo del tope: se arma hasta ella
        if (!sel || !sel.isConnected || estado.selArmada || !estado.salteadas) break;
        estado.tope = Infinity;
      }
      estado.tope = previo;   // sólo esta vez: soltar la selección vuelve a la tanda
      const box = document.getElementById("dzLayers");
      if (box && estado.salteadas > 0) {
        const mas = document.createElement("button");
        mas.type = "button";
        mas.className = "dz-lay-mas";
        const n = estado.salteadas;
        mas.textContent = "… y " + n + (n === 1 ? " elemento más" : " elementos más");
        mas.title = "Mostrar " + Math.min(n, TANDA * 3) + " más. La lista no se arma entera para que dibujar no se vuelva lento.";
        mas.onclick = (e) => { e.stopPropagation(); estado.tope = estado.filas + TANDA * 3; global.dzBuildLayers(); };
        box.appendChild(mas);
      }
      return r;
    };
    armar.__tope = true;
    global.dzBuildLayers = armar;
  }

  global.LOW = global.LOW || {};
  (global.LOW.panels = global.LOW.panels || {}).capasTope = { estado, TANDA };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(window);
