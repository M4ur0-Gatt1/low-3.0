/* ══════════════════════════════════════════════════════════════════════════
   EL PINCEL MIENTRAS SE DIBUJA (vista en vivo)

   Pedido de Mauro (oct-2026): «no los veo bien a los pinceles». Mientras se
   arrastraba, el pincel se mostraba como RAYITAS finas de grosor fijo; el
   pincel de verdad (punta, textura, brillo) aparecía recién al soltar. Uno
   dibujaba a ciegas.

   Ahora, mientras se dibuja:
     · pincel VECTORIAL: su contorno real (ancho por presión, remates) con su
       textura o su brillo, rehecho en cada cuadro;
     · pincel RASTER: los sellos de verdad (la punta del mapa de bits, su
       color y su opacidad), estampados en una capa sobre la hoja a la
       resolución de la pantalla, con el grano de la hoja encima.
   Al soltar, la capa se va y queda el trazo final (pincel-bitmap.js).

   @module drawing/pincel-vivo
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const drawing = LOW.drawing = LOW.drawing || {};
  const NS = "http://www.w3.org/2000/svg";

  function hoja() { return document.querySelector("#dzCanvas > svg"); }
  const muestras = (pts) => pts.map((p) => ({ x: p[0], y: p[1], pressure: p[2], tiltX: p[3] || 0, tiltY: p[4] || 0, time: p[6] || 0 }));

  function pincelActual() {
    const D = (typeof DZ !== "undefined") ? DZ : null;
    const b = global.dzCurrentBrush ? global.dzCurrentBrush() : null;
    if (!D || !b) return null;
    const fijo = !!D.anchoFijo;
    return { ...b, size: D.drawW || b.size || 6, seed: b.seed || 1, ...(fijo ? { pressureSize: 0, tiltSize: 0, velocitySize: 0 } : {}) };
  }

  /** La vista en vivo de un trazo de pincel. Devuelve true si la dibujó (así
   *  el trazo no agrega las rayitas de siempre). */
  function vivo(track) {
    if (!track || track.mode !== "brush" || !track.el) return false;
    const motor = drawing.brushEngine, brush = track._vivoBrush || (track._vivoBrush = pincelActual());
    if (!motor || !brush || brush.eraser) return false;
    const raster = brush.engine === "raster";
    if (!track._vivo) {
      track._vivo = { raster, hechos: 1, cuadro: 0 };
      const color = (typeof DZ !== "undefined" && DZ.drawColor) || "#1a1a1a";
      track._vivo.color = color;
      if (raster) {
        const svg = hoja(); if (!svg || !drawing.bitmap) return false;
        const r = svg.getBoundingClientRect(), dpr = global.devicePixelRatio || 1;
        const c = document.createElement("canvas");
        c.className = "dz-pincel-vivo"; c.width = Math.round(r.width * dpr); c.height = Math.round(r.height * dpr);
        // ADENTRO del área de dibujo, justo sobre la hoja: en el body quedaba
        // DETRÁS de la vista del editor (que es una capa fija, z-index 61) y no
        // se veía nada (medido: la capa tenía tinta y la pantalla no)
        const area = svg.parentElement, ra = area.getBoundingClientRect();
        if (getComputedStyle(area).position === "static") area.style.position = "relative";
        Object.assign(c.style, { position: "absolute", left: (r.left - ra.left + area.scrollLeft) + "px", top: (r.top - ra.top + area.scrollTop) + "px",
          width: r.width + "px", height: r.height + "px", pointerEvents: "none", zIndex: 3 });
        svg.insertAdjacentElement("afterend", c);
        const trazo = document.createElement("canvas"); trazo.width = c.width; trazo.height = c.height;
        Object.assign(track._vivo, { lienzo: c, trazo, dpr, caja: r });
      } else {
        // las rayitas fuera: un solo camino con el color, la textura y el brillo del pincel
        track.el.replaceChildren();
        const g = document.createElementNS(NS, "g"); g.setAttribute("fill", color); g.setAttribute("stroke", "none");
        const fx = drawing.efectos && drawing.efectos.filtro(brush, "dz_vivo_fx");
        if (fx) { const defs = document.createElementNS(NS, "defs"); defs.innerHTML = fx; g.appendChild(defs); g.setAttribute("filter", "url(#dz_vivo_fx)"); }
        const path = document.createElementNS(NS, "path");
        if (brush.opacity < 1) path.setAttribute("fill-opacity", String(brush.opacity));
        g.appendChild(path); track.el.removeAttribute("stroke"); track.el.appendChild(g);
        track._vivo.path = path;
      }
    }
    // un repintado por cuadro de pantalla, no uno por muestra
    if (!track._vivo.cuadro) track._vivo.cuadro = requestAnimationFrame(() => { if (track._vivo) { track._vivo.cuadro = 0; pintar(track, brush); } });
    return true;
  }

  function pintar(track, brush) {
    const v = track._vivo, pts = track.pts;
    if (!v || pts.length < 2) return;
    if (!v.raster) {
      const o = drawing.brushEngine.buildVectorOutline(muestras(pts), brush);
      if (o && o.path) v.path.setAttribute("d", o.path);
      return;
    }
    // RASTER: sellar sólo lo nuevo, en coordenadas de pantalla
    const svg = hoja(); if (!svg) return;
    const m = svg.getScreenCTM(); if (!m) return;
    const desde = Math.max(0, v.hechos - 1), tramo = pts.slice(desde);
    if (tramo.length < 2) return;
    const dabs = drawing.brushEngine.buildRasterDabs(muestras(tramo), brush).slice(desde ? 1 : 0);
    v.hechos = pts.length;
    const tip = drawing.bitmap.punta(brush);
    if (!tip) return;
    const x = v.trazo.getContext("2d"), dpr = v.dpr, escala = Math.hypot(m.a, m.b) * dpr;
    x.setTransform(m.a * dpr, m.b * dpr, m.c * dpr, m.d * dpr, (m.e - v.caja.left) * dpr, (m.f - v.caja.top) * dpr);
    for (const d of dabs) {
      x.save(); x.globalAlpha = Math.max(0, Math.min(1, d.opacity));
      x.translate(d.x, d.y); x.rotate((d.angle || 0) * Math.PI / 180);
      x.drawImage(tip, -d.width / 2, -d.height / 2, d.width, d.height);
      x.restore();
    }
    void escala;
    // la capa visible: el trazo, con el color del pincel y el grano de la hoja
    const out = v.lienzo.getContext("2d");
    out.setTransform(1, 0, 0, 1, 0, 0); out.clearRect(0, 0, v.lienzo.width, v.lienzo.height);
    out.globalCompositeOperation = "source-over"; out.drawImage(v.trazo, 0, 0);
    out.globalCompositeOperation = "source-in"; out.fillStyle = v.color; out.fillRect(0, 0, v.lienzo.width, v.lienzo.height);
    const tex = brush.texture;
    if (tex && drawing.bitmap.GRANOS.has(tex)) {
      const g = drawing.bitmap.grano(tex === "dry" ? "paper" : tex, tex === "dry" ? .35 : Math.max(0, Math.min(1, brush.textureStrength ?? .6)), (brush.seed || 1) >>> 0);
      const e = (g.unidades / 256) * Math.max(.2, Math.min(5, brush.textureScale ?? 1));
      const patron = out.createPattern(g.lienzo, "repeat");
      if (patron && patron.setTransform) {
        // el grano en coordenadas del DIBUJO: el mismo que va a quedar al soltar
        patron.setTransform(new DOMMatrix([m.a * dpr * e, m.b * dpr * e, m.c * dpr * e, m.d * dpr * e, (m.e - v.caja.left) * dpr, (m.f - v.caja.top) * dpr]));
        out.globalCompositeOperation = "destination-in"; out.fillStyle = patron; out.fillRect(0, 0, v.lienzo.width, v.lienzo.height);
      }
    }
    out.globalCompositeOperation = "source-over";
    if (brush.opacity < 1) v.lienzo.style.opacity = "1";
  }

  /** Al soltar o cancelar: la capa en vivo se va. */
  function fin(track) {
    const v = track && track._vivo;
    if (!v) return;
    if (v.cuadro) cancelAnimationFrame(v.cuadro);
    if (v.lienzo) v.lienzo.remove();
    track._vivo = null;
  }

  drawing.pincelVivo = { vivo, fin };
  global.dzPincelVivo = vivo;
  global.dzPincelVivoFin = fin;
})(typeof window !== "undefined" ? window : globalThis);
