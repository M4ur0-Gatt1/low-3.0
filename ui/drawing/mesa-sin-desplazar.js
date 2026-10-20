/* ══════════════════════════════════════════════════════════════════════════
   LA MESA SE MUEVE CON EL PANEO, NUNCA DESPLAZÁNDOSE

   Reporte de Mauro (oct-2026, LOW 3.36.1, con capturas): «se desfasa de la
   cámara y la mesa de trabajo… la cámara y la mesa están súper lejos».

   MEDIDO: cuando la hoja no entra en la ventana (zoom grande, o una imagen
   enorme), el lienzo (#dzCanvas, overflow auto) se DESPLAZA con la rueda.
   La hoja se desplaza con él, pero todo lo que va encima —el marco de la
   cámara, el recuadro de transformación, la imagen de la reproducción, el
   recorrido— se ubica midiendo desde el borde VISIBLE del lienzo. En cuanto
   algo lo recalcula (zoom, elegir, cambiar de cuadro), queda corrido justo lo
   desplazado: con 160 px de desplazamiento la hoja se movió 160 y el marco de
   la cámara 320. Las capturas mostraban ~170 px.

   Acá: todo desplazamiento del lienzo (la rueda, un scrollIntoView, el
   navegador) se convierte en el ACTO en paneo (DZ.panX / DZ.panY, lo mismo
   que la mano o Espacio+arrastrar), y el lienzo vuelve a 0. La hoja queda
   donde se la llevó, y todo lo de encima con ella.

   @module drawing/mesa-sin-desplazar
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  function enganchar() {
    const cv = global.document.querySelector("#dzCanvas");
    if (!cv || cv.__sinDesplazar) return;
    cv.__sinDesplazar = true;
    const aPaneo = () => {
      const dx = cv.scrollLeft, dy = cv.scrollTop;
      if (!dx && !dy) return;
      const D = typeof DZ !== "undefined" ? DZ : null;   // DZ es una variable global de app.js, no una propiedad de window
      cv.scrollLeft = 0; cv.scrollTop = 0;
      if (!D) return;
      // desplazar hacia abajo sube el contenido: en paneo es restar
      D.panX = (D.panX || 0) - dx;
      D.panY = (D.panY || 0) - dy;
      if (typeof global.dzApplyZoom === "function") global.dzApplyZoom();
    };
    cv.addEventListener("scroll", aPaneo, { passive: true });
    // sin barras ni desplazamiento propio (CSS): la RUEDA (sin Alt) mueve la
    // mesa con el paneo; Shift+rueda, de costado. Si app.js ya la usó (zoom
    // con Alt, o bloqueada en modo esqueleto), no se toca.
    cv.style.overflow = "hidden";
    cv.addEventListener("wheel", (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const D = typeof DZ !== "undefined" ? DZ : null;
      if (!D) return;
      const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? cv.clientHeight : 1;
      let dx = e.deltaX * k, dy = e.deltaY * k;
      if (e.shiftKey && !dx) { dx = dy; dy = 0; }
      if (!dx && !dy) return;
      e.preventDefault();
      D.panX = (D.panX || 0) - dx;
      D.panY = (D.panY || 0) - dy;
      if (typeof global.dzApplyZoom === "function") global.dzApplyZoom();
    }, { passive: false });
    aPaneo();
  }
  global.LOW = global.LOW || {};
  global.LOW.drawing = global.LOW.drawing || {};
  global.LOW.drawing.mesaSinDesplazar = { enganchar };
  if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(typeof window !== "undefined" ? window : globalThis);
