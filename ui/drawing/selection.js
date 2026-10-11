/* ══════════════════════════════════════════════════════════════════════════
   EL MARCO DE SELECCIÓN, COMO EN ILLUSTRATOR

   Pedido de Mauro (oct-2026, LOW 3.16): «pasá el marco a como Illustrator;
   lo que ya sabemos que funciona en otros programas lo copiamos. Tiene que ser
   intuitivo, práctico y familiar para quien usa Toon Boom, Moho, Illustrator,
   After Effects».

   Antes la dirección mandaba —izquierda→derecha exigía que el objeto quedara
   ENTERO adentro, la convención de AutoCAD— y con la tableta casi nunca
   queda entero: el marco «no elegía nada» y parecía roto.

   Ahora:
     · en cualquier dirección, el marco elige lo que TOCA;
     · tocar es tocar el TRAZO de verdad, no su caja: un arco grande cuya caja
       cruza el marco pero cuya línea pasa lejos no se elige (como en
       Illustrator, que mira el trazado);
     · Shift suma a lo elegido;
     · Alt elige sólo lo que queda entero adentro (un extra; no cambia lo de
       fábrica).

   @module drawing/selection
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const drawing = LOW.drawing = LOW.drawing || {};

  /** El modo del marco: siempre por contacto; Alt pide lo contenido. La
   *  dirección ya no cuenta (se aceptan los argumentos por compatibilidad). */
  function marqueeMode(startX, endX, alt = false) {
    return alt ? "contained" : "touching";
  }

  const cruzaCaja = (b, s) => !(b.right < s.left || b.left > s.right || b.bottom < s.top || b.top > s.bottom);
  const adentro = (p, s) => p.x >= s.left && p.x <= s.right && p.y >= s.top && p.y <= s.bottom;

  /* ¿La GEOMETRÍA de este elemento toca el rectángulo de pantalla? Se recorre
     el trazado a pasos de unos 3 px de pantalla (y nunca más de 600) y se mira
     si algún punto cae adentro. Si el elemento está relleno y el marco cae
     entero en su interior, también lo toca. Lo que no tiene trazado medible
     (texto, imágenes, mapas de bits) cuenta por su caja. */
  function tocaGeometria(el, s) {
    const tag = (el.tagName || "").toLowerCase();
    if (tag === "g" || tag === "a" || tag === "switch") {
      for (const h of el.children) {
        const t = (h.tagName || "").toLowerCase();
        if (t === "defs" || t === "title" || t === "desc" || t === "style" || t === "mask" || t === "clippath") continue;
        let b; try { b = h.getBoundingClientRect(); } catch (_) { continue; }
        if ((b.width || b.height) && cruzaCaja(b, s) && tocaGeometria(h, s)) return true;
      }
      return false;
    }
    if (typeof el.getTotalLength !== "function" || typeof el.getScreenCTM !== "function") return true;
    let largo, m;
    try { largo = el.getTotalLength(); m = el.getScreenCTM(); } catch (_) { return true; }
    if (!m || !(largo > 0)) return true;
    const escala = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
    const pasos = Math.max(8, Math.min(600, Math.ceil(largo * escala / 3)));
    const svg = el.ownerSVGElement;
    for (let i = 0; i <= pasos; i++) {
      const q = el.getPointAtLength(largo * i / pasos);
      if (adentro({ x: m.a * q.x + m.c * q.y + m.e, y: m.b * q.x + m.d * q.y + m.f }, s)) return true;
    }
    // el marco entero dentro de una forma rellena: su centro cae en el relleno
    const relleno = (el.getAttribute("fill") || (global.getComputedStyle ? global.getComputedStyle(el).fill : "")) || "";
    if (svg && relleno && relleno !== "none" && typeof el.isPointInFill === "function") {
      try {
        const inv = m.inverse(), cx = (s.left + s.right) / 2, cy = (s.top + s.bottom) / 2;
        const p = svg.createSVGPoint(); p.x = inv.a * cx + inv.c * cy + inv.e; p.y = inv.b * cx + inv.d * cy + inv.f;
        if (el.isPointInFill(p)) return true;
      } catch (_) { /* sin geometría */ }
    }
    return false;
  }

  /** ¿El elemento (su caja `bounds`, en pantalla) entra en el marco? Con
   *  `el`, el contacto se mide sobre su trazado real. */
  function marqueeHit(bounds, selection, mode, el) {
    if (!bounds || !selection) return false;
    if (mode === "contained") {
      return bounds.left >= selection.left && bounds.top >= selection.top
        && bounds.right <= selection.right && bounds.bottom <= selection.bottom;
    }
    if (!cruzaCaja(bounds, selection)) return false;
    // la caja entera adentro: lo toca seguro, no hace falta recorrerlo
    if (bounds.left >= selection.left && bounds.right <= selection.right && bounds.top >= selection.top && bounds.bottom <= selection.bottom) return true;
    return el ? tocaGeometria(el, selection) : true;
  }

  drawing.selection = { marqueeMode, marqueeHit };
})(typeof window !== "undefined" ? window : globalThis);
