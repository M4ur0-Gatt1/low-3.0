function dzFillPrepareSvg(root, vb) {
  const clean = root.cloneNode(true);
  clean.setAttribute("xmlns", SVGNS); clean.setAttribute("viewBox", vb.join(" "));
  // El SVG vivo lleva el zoom/pan del visor en `style`. Serializar ese estilo
  // dentro del bitmap encogía o desplazaba también la geometría analizada.
  clean.removeAttribute("style"); clean.removeAttribute("class");
  clean.querySelectorAll('.dz-onion,.dz-penui,[data-dz3d],g[data-low-art="colour"],style.dz-palcss,[data-low="fill"]').forEach((n) => n.remove());
  clean.querySelectorAll('rect').forEach(el => { if (dzIsCanvasBackground(el)) el.remove(); });
  clean.querySelectorAll('[data-low="forma-pincel"]').forEach(g => {
    const path=document.createElementNS(SVGNS,'path');path.setAttribute('d',g.getAttribute('data-d')||'');
    path.setAttribute('stroke-width',g.getAttribute('data-grosor')||'1.5');g.replaceChildren(path);
  });
  clean.querySelectorAll("image,text,foreignObject").forEach((n) => n.remove());
  clean.querySelectorAll("path,rect,circle,ellipse,line,polyline,polygon").forEach((el) => {
    if (el.closest("defs")) return;
    if (el.closest('[data-low="brush"],[data-low="raster-brush"],[data-low="imported-brush"]')) {
      el.setAttribute('fill','#000');el.setAttribute('stroke','none');el.removeAttribute('fill-opacity');return;
    }
    const sw = parseFloat(el.getAttribute("stroke-width") || "0");
    el.setAttribute("fill", "none"); el.setAttribute("stroke", "#000000");
    el.setAttribute("stroke-width", String(Math.max(1.5, Number.isFinite(sw) ? sw : 1.5)));
    el.setAttribute("opacity", "1");
    if (el.style) { el.style.fill = "none"; el.style.stroke = "#000000"; el.style.opacity = "1"; }
  });
  const bg = document.createElementNS(SVGNS, "rect");
  bg.setAttribute("x", vb[0]); bg.setAttribute("y", vb[1]);
  bg.setAttribute("width", vb[2]); bg.setAttribute("height", vb[3]);
  bg.setAttribute("fill", "#ffffff"); bg.setAttribute("stroke", "none");
  clean.insertBefore(bg, clean.firstChild);
  return clean;
}

/* ══ EL BALDE: resolución, relleno por debajo de la línea y borde suave ══
   Reporte de Mauro (oct-2026): «revisá el bote de pintura, me parece que no
   anda». MEDIDO en la app real a 200 %:
   1. la hoja se analizaba a 720 píxeles (casi 3 unidades por píxel): el
      adentro de un círculo chico (un ojo, un botón) desaparecía, y un clic ahí
      recoloreaba la zona grande de alrededor;
   2. el borde del relleno era una escalera de ~3 unidades;
   3. el relleno se frenaba antes de la línea (el anillo que cierra huecos) y
      quedaba PAPEL BLANCO entre el color y la línea.
   Ahora: se analiza a ~1 píxel por unidad (cuesta ~40 ms más, medido); la
   zona CRECE POR DEBAJO de la línea —como en Toonz y Harmony: el color va en
   el plano de Color, debajo de la Línea— sin meterse nunca en otra zona; y el
   borde se suaviza (Chaikin) y se simplifica para no pesar. */
function dzFillResolucion(vb) { return Math.max(720, Math.min(2048, Math.round(vb[2] || 720))); }

/** La zona elegida, crecida hacia los píxeles de LÍNEA (etiqueta -1): primero
 *  el anillo que cierra los huecos y después un poco de tinta. Nunca entra en
 *  otra zona (etiqueta > 0). */
function dzFillCrecerBajoLinea(analysis, region) {
  const w = analysis.width, labels = analysis.labels;
  let mask = dzFillMask(analysis, region);
  const pasos = (analysis.gapPx || 0) + Math.max(2, Math.round(w / 720 * 1.5));
  for (let k = 0; k < pasos; k++) {
    const sig = mask.slice();
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] || labels[i] !== -1) continue;
      const x = i % w;
      if ((x > 0 && mask[i - 1]) || (x < w - 1 && mask[i + 1]) || (i >= w && mask[i - w]) || (i + w < mask.length && mask[i + w])) sig[i] = 1;
    }
    mask = sig;
  }
  return mask;
}

/** Chaikin: dos pasadas sacan la escalera de los píxeles. */
function dzFillChaikin(pts, pasadas) {
  let p = pts;
  for (let k = 0; k < pasadas; k++) {
    const q = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      q.push([.75 * a[0] + .25 * b[0], .75 * a[1] + .25 * b[1]], [.25 * a[0] + .75 * b[0], .25 * a[1] + .75 * b[1]]);
    }
    p = q;
  }
  return p;
}
/** RDP sobre un contorno cerrado: queda lo que hace falta para la forma. */
function dzFillSimplificar(pts, tol) {
  if (pts.length < 8) return pts;
  const abierto = [...pts, pts[0]], queda = new Uint8Array(abierto.length);
  queda[0] = queda[abierto.length - 1] = 1;
  const pila = [[0, abierto.length - 1]];
  while (pila.length) {
    const [i, j] = pila.pop(), a = abierto[i], b = abierto[j];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    let peor = -1, max = tol;
    for (let k = i + 1; k < j; k++) {
      const q = abierto[k];
      const d = l ? Math.abs((q[0] - a[0]) * dy - (q[1] - a[1]) * dx) / l : Math.hypot(q[0] - a[0], q[1] - a[1]);
      if (d > max) { max = d; peor = k; }
    }
    if (peor > 0) { queda[peor] = 1; pila.push([i, peor], [peor, j]); }
  }
  const out = abierto.filter((_, k) => queda[k]); out.pop();
  return out;
}

function dzFillPathData(analysis, region, vb) {
  const loops = dzTraceMaskJS(dzFillCrecerBajoLinea(analysis, region), analysis.width, analysis.height);
  const sx = vb[2] / analysis.width, sy = vb[3] / analysis.height;
  const tol = Math.max(.15, Math.min(sx, sy) * .35);
  return loops.map((loop) => {
    let pts = loop.slice(0, -1).map(([x, y]) => [vb[0] + x * sx, vb[1] + y * sy]);
    if (pts.length < 3) return "";
    // el borde suavizado queda por DEBAJO de la línea (la zona creció hacia
    // ella), así que el suavizado ya no puede asomar del otro lado
    pts = dzFillSimplificar(dzFillChaikin(pts, 2), tol);
    return pts.length >= 3 ? "M " + pts.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L ") + " Z" : "";
  }).filter(Boolean).join(" ");
}

/* ══ UNA ZONA PARTIDA POR LÍNEAS NUEVAS ══════════════════════════════════
   MEDIDO en la app real: pinté un círculo grande, después dibujé un círculo
   chico ADENTRO (un ojo) y le di balde adentro del chico: RECOLOREÓ EL GRANDE.
   El balde busca primero un relleno debajo del clic y, si hay, recolorea esa
   zona entera; el relleno grande estaba ahí abajo (se pintó cuando el chico no
   existía) y las líneas nuevas que la partieron no contaban.
   Ahora, si debajo del clic hay un relleno pero la zona CERRADA en ese punto
   es claramente más chica que ese relleno, se pinta la zona nueva (un relleno
   propio, encima) y el grande queda como estaba. Recolorear un relleno sin
   líneas nuevas sigue igual. Se engancha por nombre después de app.js. */
(function () {
  let ignorar = null;
  function enganchar() {
    const zonaEn = window.dzFillZoneAtPoint, aplicar = window.dzBucketApply;
    if (typeof zonaEn !== "function" || typeof aplicar !== "function" || aplicar.__partida) return;
    window.dzFillZoneAtPoint = function () { const r = zonaEn.apply(this, arguments); return r && r === ignorar ? null : r; };
    const envuelto = async function (e) {
      const svg = document.querySelector("#dzCanvas")?.querySelector(":scope > svg");
      const prefs = typeof dzColoringPrefs === "function" ? dzColoringPrefs() : {};
      const existente = svg && (prefs.mode || "paint") === "paint" ? zonaEn(e, svg) : null;
      if (existente && typeof dzFillAnalyze === "function") {
        try {
          const vb = dzVB(), p = dzToUser(e.clientX, e.clientY);
          const a = await dzFillAnalyze(svg, vb, p, prefs.gap);
          if (a.region) {
            const sx = vb[2] / a.width, sy = vb[3] / a.height;
            const area = (a.region.maxX - a.region.minX + 1) * sx * (a.region.maxY - a.region.minY + 1) * sy;
            const b = existente.getBBox ? existente.getBBox() : null;
            if (b && area < b.width * b.height * .8) ignorar = existente;
          }
        } catch (_) { /* si el análisis falla, el balde de siempre */ }
      }
      try { return aplicar.apply(this, arguments); }   // dzFillZoneAtPoint se llama en la parte sincrónica
      finally { ignorar = null; }
    };
    Object.assign(envuelto, aplicar); envuelto.__partida = true;
    window.dzBucketApply = envuelto;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})();
