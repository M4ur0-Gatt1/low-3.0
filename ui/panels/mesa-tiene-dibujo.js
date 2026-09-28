/* ══════════════════════════════════════════════════════════════════════════
   ¿HAY ALGO DIBUJADO EN LA MESA?

   Pregunta chica con una consecuencia grande: es la que decide si una acción
   que REEMPLAZA el lienzo tiene que pedir permiso.

   Salió de perder un dibujo. `dzRigEjemplo()` entra por `dzCanvasSet`, que
   pisa el contenido del SVG, y sólo preguntaba si el documento estaba SUCIO o
   tenía más de un cuadro. Un personaje ya guardado, de un solo cuadro, se
   reemplazaba sin avisar: «al colocar el esqueleto entero borra el personaje».

   No alcanza con mirar si el SVG tiene hijos: adentro del lienzo viven las
   capas de asistencia del editor —rotoscopia, alambre del rig, malla, papel
   cebolla, guías de la pluma y la hoja de la paleta— y ninguna es dibujo. Se
   cuentan sólo las formas, y se ignora el fondo de papel.

   @module panels/mesa-tiene-dibujo
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const panels = LOW.panels = LOW.panels || {};

  const FORMAS = "path,polyline,polygon,circle,ellipse,line,text,image,g[data-low]";
  const ASISTENCIA = ".dz-onion,.dz-penui,#dzRigOverlay,#dzMeshOverlay,#dzMocapSheet,.rig-control-overlay";

  /** Cuántas formas dibujadas hay en la hoja del dibujo. */
  function formasEnLaMesa() {
    const cv = document.querySelector("#dzCanvas");
    const hoja = cv && cv.querySelector(":scope > svg");
    if (!hoja) return 0;
    let n = 0;
    for (const el of hoja.querySelectorAll(FORMAS)) {
      if (el.closest(ASISTENCIA)) continue;                 // capa del editor, no dibujo
      // el rectángulo de fondo es el papel, no un trazo de nadie
      if (el.tagName.toLowerCase() === "rect" && el.dataset.low === "papel") continue;
      n++;
    }
    return n;
  }
  const hayDibujo = () => formasEnLaMesa() > 0;

  panels.mesaTieneDibujo = { hayDibujo, formasEnLaMesa, FORMAS, ASISTENCIA };
  global.dzHayDibujoEnLaMesa = hayDibujo;
})(window);
