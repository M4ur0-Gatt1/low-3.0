/* ══════════════════════════════════════════════════════════════════════════
   LAS IMÁGENES IMPORTADAS: ENTERAS, CON SU PROPORCIÓN Y CON SU ALTO

   Reporte de Mauro (oct-2026, LOW 3.36.1), importando una imagen para calcar:
   «hace cosas rarísimas con los cuadros de selección de los objetos o
   imágenes… no respeta la posición ni la escala».

   MEDIDO con una imagen vertical (300 × 700):
   - `dzImportImage` le ponía ANCHO (el 80 % de la hoja) pero NO ALTO. Chrome
     la dibuja igual, con su proporción: 3584 de alto en una hoja de 1080.
     Quedaba enorme, saliéndose por abajo, con la esquina de escalar fuera de
     la pantalla.
   - El recuadro de transformación se medía antes de que la imagen cargara y
     nacía de 2 px de alto.
   Acá:
   1. `dzImagenTamano`: lee el tamaño real de la imagen y la mete ENTERA en el
      80 % de la hoja, con su proporción, centrada. app.js le escribe x, y,
      ancho y alto.
   2. Los documentos que ya tienen imágenes sin alto: al abrirlos, cada una
      recibe el alto con que YA se veía (lo que se ve no cambia) y el recuadro
      se vuelve a medir.

   El marco de selección que no acompañaba al mover / escalar / zoom se
   arregla en panels/marco-seleccion.js.

   @module drawing/imagenes
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const r1 = (v) => Math.round(v * 10) / 10;

  /** El lugar de una imagen nueva en la hoja `vb` ([x, y, ancho, alto]). */
  async function tamano(src, vb) {
    const [vx, vy, vw, vh] = vb;
    let nw = 0, nh = 0;
    try {
      const img = new Image();
      img.src = src;
      await img.decode();
      nw = img.naturalWidth; nh = img.naturalHeight;
    } catch (_) { /* no se pudo leer: ocupa el 80 % de la hoja */ }
    const maxW = vw * 0.8, maxH = vh * 0.8;
    const s = nw > 0 && nh > 0 ? Math.min(maxW / nw, maxH / nh) : 0;
    const w = s ? nw * s : maxW, h = s ? nh * s : maxH;
    return { x: r1(vx + (vw - w) / 2), y: r1(vy + (vh - h) / 2), w: r1(w), h: r1(h) };
  }

  /** Imágenes sin alto (o sin ancho): reciben el tamaño con que se dibujan. */
  function reparar() {
    const svg = global.document.querySelector("#dzCanvas > svg");
    if (!svg) return 0;
    let n = 0;
    for (const im of svg.querySelectorAll("image:not([height]), image:not([width])")) {
      if (im.closest("g.dz-onion")) continue;
      const fijar = () => {
        if (!im.isConnected) return;
        let b; try { b = im.getBBox(); } catch (_) { return; }
        if (!(b.width > 0 && b.height > 0)) return;
        if (!im.hasAttribute("width")) im.setAttribute("width", r1(b.width));
        if (!im.hasAttribute("height")) im.setAttribute("height", r1(b.height));
        if (typeof DZ !== "undefined" && DZ.sel === im) global.dzPositionHandle?.();   // DZ es variable global de app.js, no de window
      };
      let b0 = null; try { b0 = im.getBBox(); } catch (_) { /* nada */ }
      if (b0 && b0.width > 0 && b0.height > 0) fijar();
      else im.addEventListener("load", fijar, { once: true });
      n++;
    }
    return n;
  }

  /* Cualquier imagen que APAREZCA en la mesa (cambiar de cuadro, deshacer,
     abrir, pegar) se repara: engancharse sólo a dzCanvasSet llegaba tarde en
     algunos caminos (medido con la escena de Mauro: cuadros 1 y 2 sin alto). */
  let pendiente = 0;
  function vigilar() {
    const cv = global.document.querySelector("#dzCanvas");
    if (!cv || typeof MutationObserver === "undefined" || cv.__vigilaImagenes) return;
    cv.__vigilaImagenes = true;
    new MutationObserver((ms) => {
      if (pendiente) return;
      if (!ms.some((m) => [...m.addedNodes].some((n) => n.nodeType === 1 && (n.tagName === "image" || n.querySelector?.("image"))))) return;
      pendiente = global.requestAnimationFrame(() => { pendiente = 0; try { reparar(); } catch (_) { /* nada */ } });
    }).observe(cv, { childList: true, subtree: true });
  }
  function enganchar() {
    vigilar();
    const orig = global.dzCanvasSet;
    if (typeof orig === "function" && !orig.__imagenes) {
      const f = function () { const r = orig.apply(this, arguments); try { reparar(); } catch (e) { console.warn("[imágenes]", e); } return r; };
      Object.assign(f, orig); f.__imagenes = true;
      global.dzCanvasSet = f;
    }
    reparar();
  }

  global.dzImagenTamano = tamano;
  global.LOW = global.LOW || {};
  global.LOW.drawing = global.LOW.drawing || {};
  global.LOW.drawing.imagenes = { tamano, reparar };
  if (global.document.readyState === "loading") global.document.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(typeof window !== "undefined" ? window : globalThis);
