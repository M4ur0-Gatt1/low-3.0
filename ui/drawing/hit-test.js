/* ══════════════════════════════════════════════════════════════════════════
   PUNTERÍA DE LA SELECCIÓN

   El reporte: «cuando hay un elemento dentro de otro no selecciona precisamente
   donde estoy; debe seleccionar con más precisión y detectar el objeto que está
   adelante en esa selección».

   Medido, la causa: el navegador acierta el impacto sólo donde hay PINTURA. Una
   forma **sin relleno** —un rectángulo que sólo tiene borde— no existe para el
   puntero en su interior: `elementsFromPoint` ni la nombra, y el clic pasa de
   largo hasta la forma de atrás. Reproducido con un rectángulo chico sin relleno
   encima de uno grande rojo: clickeando el centro del chico se seleccionaba el
   grande.

   Es la semántica correcta de SVG y también la de Illustrator con «selección
   sólo por trazado». Pero en una mesa de dibujo lo que uno espera es que gane
   **lo que está adelante en ese punto**, con relleno o sin él.

   La herramienta que lo resuelve es `isPointInFill`: prueba la GEOMETRÍA del
   relleno, no el color, así que contesta true dentro del área aunque `fill` sea
   `none`. Verificado en el navegador antes de construir sobre eso.

   Reglas, en orden:
     1. Gana el que está MÁS ADELANTE: se recorre de adelante hacia atrás
        (orden inverso del documento, que en SVG es el orden de pintado).
     2. Cuenta el área para las formas cerradas y el TRAZO para las abiertas
        (una línea, una curva sin cerrar): el interior de una curva abierta no
        es algo que uno sienta como «adentro».
     3. El papel y las capas de asistencia no se seleccionan nunca.
     4. Si nada da, se devuelve null y manda lo que decida quien llame — que
        normalmente es empezar un marco de selección.

   @module drawing/hit-test
   ══════════════════════════════════════════════════════════════════════════ */

/** Holgura del trazo, en píxeles de pantalla, para las formas abiertas: sin
 *  esto habría que acertarle a una línea de un píxel. */
const DZ_HIT_HOLGURA = 4;

/** ¿Este nodo es arte seleccionable, o es asistencia visual? */
function dzHitSeleccionable(nodo) {
  if (!nodo || nodo.nodeType !== 1) return false;
  const tag = (nodo.tagName || "").toLowerCase();
  if (tag === "defs" || tag === "style" || tag === "title" || tag === "desc") return false;
  const clase = (nodo.getAttribute && nodo.getAttribute("class")) || "";
  // dz-penui son las guías de pantalla (espejo, arcos); dz-onion el papel cebolla
  if (/\bdz-penui\b|\bdz-onion\b|\bdz-arco\b/.test(clase)) return false;
  if (nodo.closest && nodo.closest("g.dz-onion, g.dz-penui")) return false;
  if (nodo.hasAttribute && nodo.hasAttribute("data-locked")) return false;
  if (nodo.closest && nodo.closest("[data-locked]")) return false;
  if (typeof dzIsCanvasBackground === "function" && dzIsCanvasBackground(nodo)) return false;
  const estilo = nodo.getAttribute && nodo.getAttribute("style");
  if (estilo && /pointer-events\s*:\s*none/.test(estilo)) return false;
  return true;
}

/** ¿La forma está cerrada? Un rect, un círculo, una elipse y un polígono sí.
 *  Un path lo decide su comando final; una línea y una polilínea, nunca. */
function dzHitCerrada(nodo) {
  const tag = (nodo.tagName || "").toLowerCase();
  if (tag === "rect" || tag === "circle" || tag === "ellipse" || tag === "polygon") return true;
  if (tag === "line" || tag === "polyline") return false;
  if (tag === "path") return /[zZ]\s*$/.test((nodo.getAttribute("d") || "").trim());
  return false;
}

/** El punto, en coordenadas del SVG, como SVGPoint. */
function dzHitPunto(svg, x, y) {
  const p = svg.createSVGPoint();
  const u = typeof dzToUser === "function" ? dzToUser(x, y) : { x, y };
  p.x = u.x; p.y = u.y;
  return p;
}

/** ¿El punto cae en este nodo? Área si la forma es cerrada, trazo si es
 *  abierta, y caja si es texto o una imagen (no tienen geometría de relleno). */
function dzHitTocado(nodo, punto, holguraUsuario) {
  const tag = (nodo.tagName || "").toLowerCase();
  if (tag === "text" || tag === "image" || tag === "use" || tag === "foreignobject") {
    try {
      const b = nodo.getBBox();
      return punto.x >= b.x && punto.x <= b.x + b.width
        && punto.y >= b.y && punto.y <= b.y + b.height;
    } catch (_) { return false; }
  }
  try {
    if (dzHitCerrada(nodo) && typeof nodo.isPointInFill === "function"
        && nodo.isPointInFill(punto)) return true;
    if (typeof nodo.isPointInStroke === "function" && nodo.isPointInStroke(punto)) return true;
    // TRAZO FINO. Una línea de un píxel exige acertarle al píxel, así que hace
    // falta holgura. Se mide la DISTANCIA REAL del punto al trazado.
    //
    // Primero probé una cruz de cinco puntos alrededor con `isPointInStroke`, y
    // medido falla: es un muestreo ralo, y un clic a tres píxeles de una raya
    // horizontal caía entre las puntas de la cruz. La distancia al trazado no
    // tiene agujeros.
    const ancho = parseFloat(nodo.getAttribute("stroke-width")) || 1;
    const cerca = holguraUsuario + ancho / 2;
    if (typeof nodo.getBBox === "function") {
      const b = nodo.getBBox();          // rechazo barato antes de muestrear
      if (punto.x < b.x - cerca || punto.x > b.x + b.width + cerca
          || punto.y < b.y - cerca || punto.y > b.y + b.height + cerca) return false;
    }
    return dzHitDistanciaAlTrazo(nodo, punto) <= cerca;
  } catch (_) { /* nodo sin geometría medible */ }
  return false;
}

/** La distancia del punto al trazado, muestreando a lo largo y refinando
 *  alrededor del tramo más cercano. Sirve para cualquier `SVGGeometryElement`
 *  —line, polyline, path— sin tocar el documento. */
function dzHitDistanciaAlTrazo(nodo, punto) {
  if (typeof nodo.getTotalLength !== "function" || typeof nodo.getPointAtLength !== "function") return Infinity;
  let largo;
  try { largo = nodo.getTotalLength(); } catch (_) { return Infinity; }
  if (!(largo > 0)) return Infinity;
  const dist = (t) => {
    const p = nodo.getPointAtLength(t);
    return Math.hypot(p.x - punto.x, p.y - punto.y);
  };
  const N = 48;
  let mejor = Infinity, mejorT = 0;
  for (let i = 0; i <= N; i++) {
    const t = largo * i / N, d = dist(t);
    if (d < mejor) { mejor = d; mejorT = t; }
  }
  let paso = largo / N;
  for (let vuelta = 0; vuelta < 14 && paso > 0.05; vuelta++) {
    paso /= 2;
    for (const t of [mejorT - paso, mejorT + paso]) {
      if (t < 0 || t > largo) continue;
      const d = dist(t);
      if (d < mejor) { mejor = d; mejorT = t; }
    }
  }
  return mejor;
}

/** Los candidatos: el arte del dibujo, en orden de pintado. Los grupos de arte
 *  (`data-low-art`) no se seleccionan: son contenedores, y lo que interesa son
 *  sus hijos. */
function dzHitCandidatos(svg) {
  const salida = [];
  const recorrer = (padre) => {
    for (const n of padre.children) {
      if (!dzHitSeleccionable(n)) continue;
      const tag = (n.tagName || "").toLowerCase();
      if (tag === "g" && n.hasAttribute("data-low-art")) { recorrer(n); continue; }
      salida.push(n);
      // Dentro de un grupo real (<g> guardado) se miran los hijos también: el
      // que llama decide después si sube al grupo o se queda en la pieza.
      if (tag === "g") recorrer(n);
    }
  };
  recorrer(svg);
  return salida;
}

/**
 * El elemento de arte que está ADELANTE en ese punto de la pantalla.
 * @returns {Element|null}
 */
function dzHitTest(x, y) {
  const svg = document.querySelector("#dzCanvas > svg");
  if (!svg) return null;
  const punto = dzHitPunto(svg, x, y);
  // La holgura del trazo se mide en pantalla y se lleva a unidades de usuario:
  // al alejarse, cuatro píxeles de pantalla son muchas unidades del dibujo.
  const zoom = (typeof DZ !== "undefined" && DZ.zoom) ? DZ.zoom : 1;
  const holgura = DZ_HIT_HOLGURA / Math.max(0.05, zoom);
  const candidatos = dzHitCandidatos(svg);
  for (let i = candidatos.length - 1; i >= 0; i--) {
    const n = candidatos[i];
    if ((n.tagName || "").toLowerCase() === "g") continue;   // los grupos no se prueban solos
    if (dzHitTocado(n, punto, holgura)) return dzAtomicArtwork(n);
  }
  return null;
}

/* ─────────────────────────────────────────────────────────────────────────
   La pieza de arte dibujable que queda debajo de un punto de pantalla. Sirve
   para que «Crear hueso» vincule el hueso al dibujo sin pasos extra.

   Vivía en app.js y buscaba con `elementsFromPoint`, así que arrastraba el
   mismo defecto que la selección: un contorno sin relleno —una pata dibujada
   con línea— no se encontraba nunca en su interior y el hueso terminaba
   colgado del cuerpo. Ahora se prueba primero la geometría.
   ───────────────────────────────────────────────────────────────────────── */
function dzRigArtAtPoint(clientX, clientY) {
  const piezas = typeof dzRigDrawableElements === "function" ? dzRigDrawableElements() : [];
  if (!piezas.length) return null;
  const piezaDe = (el) => {
    for (let n = el; n && n !== document; n = n.parentElement) if (piezas.includes(n)) return n;
    return null;
  };
  // 1) LA GEOMETRÍA REAL bajo el punto, de adelante hacia atrás. Antes se
  //    miraba la caja envolvente y se devolvía la primera pieza en orden de
  //    dibujo: en un personaje esa es el cuerpo, y su caja tapa casi todo, así
  //    que los huesos de la pata o la oreja quedaban vinculados al cuerpo.
  const preciso = dzHitTest(clientX, clientY);
  if (preciso) { const pieza = piezaDe(preciso); if (pieza) return pieza; }
  // 2) Lo que el navegador acierte por pintura, por si la pieza es una imagen
  //    o un nodo sin geometría medible.
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    const pieza = piezaDe(el);
    if (pieza) return pieza;
  }
  // 3) Si el punto cayó en un hueco: la caja MÁS CHICA que lo contenga, que es
  //    la más específica. Nunca la primera del documento.
  let mejor = null, menor = Infinity;
  for (const el of piezas) {
    try {
      const r = el.getBoundingClientRect();
      if (clientX < r.left || clientX > r.right || clientY < r.top || clientY > r.bottom) continue;
      const area = Math.max(1, r.width) * Math.max(1, r.height);
      if (area < menor) { menor = area; mejor = el; }
    } catch (_) { /* pieza sin caja */ }
  }
  return mejor;
}

window.dzRigArtAtPoint = dzRigArtAtPoint;
window.dzHitTest = dzHitTest;
window.dzHitTocado = dzHitTocado;
window.dzHitCandidatos = dzHitCandidatos;
window.dzHitSeleccionable = dzHitSeleccionable;
window.dzHitCerrada = dzHitCerrada;

// Generated dabs are rendering details, not independently editable objects.
function dzAtomicArtwork(element) {
  let target = element;
  for (let node = element; node && node.tagName?.toLowerCase() !== 'svg'; node = node.parentElement) {
    if (['forma-pincel','raster-brush','imported-brush','brush'].includes(node.getAttribute?.('data-low')))
      target = node;
  }
  return target;
}
