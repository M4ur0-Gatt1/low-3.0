/* ══════════════════════════════════════════════════════════════════════════
   NUEVA CAPA DE ANIMACIÓN, DESDE EL MENÚ

   Reportado: «no veo cómo generar una nueva capa o columna en la línea de
   tiempo», y «el botón + sirve para agregar un frame, no una columna».
   MEDIDO en v4.51.0: el menú Capa no tenía «nueva capa» (todo lo que tiene es
   para objetos del dibujo) y en la línea de tiempo la única entrada era el
   segundo ícono, sin texto, de una barra de 29 — al lado de un «+» que
   inserta un CUADRO.

   Ahora hay tres entradas con palabras: «+ Capa» debajo de la última capa de
   la línea de tiempo (timeline-view.js), «+ Capa» en la X-sheet
   (xsheet-view.js) y Capa → Nueva capa de animación. Las tres llaman al MISMO
   comando del documento (`doc.addLayer`), que entra en Undo.

   El menú se atiende acá porque el presupuesto de app.js está en el techo:
   `dzMenuAction` no conoce esta acción y no hace nada con ella, así que no
   hay doble ejecución.

   @module animation/nueva-capa
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};
  const estado = () => (typeof DZ !== "undefined") ? DZ : null;
  const avisar = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };

  function nuevaCapa() {
    const app = estado();
    if (!app || !app.doc) { avisar("Abrí una escena de animación para agregarle capas"); return null; }
    const ly = app.doc.addLayer();
    app.doc.emit("frame");
    avisar("«" + ly.name + "» creada · es una columna más en la X-sheet · doble clic en su nombre para renombrarla");
    return ly;
  }

  function enganchar() {
    const item = document.querySelector('[data-act="capa-animacion-nueva"]');
    if (!item || item.__nuevaCapa) return false;
    item.__nuevaCapa = true;
    // mousedown, como el resto del menú: el menú se cierra en el mousedown y
    // el «click» ya no le llega a un ítem escondido
    item.addEventListener("mousedown", () => nuevaCapa());
    return true;
  }

  animation.nuevaCapa = { nuevaCapa, enganchar };
  global.dzNuevaCapaAnimacion = nuevaCapa;

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(window);
