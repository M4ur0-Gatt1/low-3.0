/* ══ ✂ LIMPIEZA DE LÍNEA: CUCHILLA, CINTA, CERRAR HUECOS, RECORTAR SOBRANTES ══
   Pedido de Mauro: «teníamos una herramienta cuchilla para cortar líneas de
   vector que se cruzan, como en Toon Boom u OpenToonz… suma todas esas
   herramientas, también una que sirve para unir líneas, eliminar huecos;
   copiemos esas herramientas en su flujo completo».

   Lo que hacen, como en esos programas:
   - CUCHILLA (Shift+T, el atajo del Cutter de Harmony): es el borrador por
     «segmento» de OpenToonz y el gesto del Cutter de Harmony.
       · clic sobre un tramo → se borra SÓLO ese tramo, de cruce a cruce
         (lo que sobra pasado una esquina se va de un clic);
       · arrastrar cruzando líneas → se borran todos los tramos cruzados;
       · al pasar el mouse se marca en naranja lo que se va a borrar;
       · «Recortar sobrantes»: todas las colitas cortas pasado el último cruce,
         de una vez.
   - CINTA (Alt+C, el atajo del Close Gap de Harmony): la «Tape» de OpenToonz.
       · arrastrar desde la PUNTA de una línea hasta la punta de otra → se
         sueldan en una sola línea (o se cierra la figura si es la otra punta
         de la misma);
       · hasta el CUERPO de otra línea → la punta se prolonga hasta tocarla;
       · arrastrar un rectángulo desde un lugar vacío → se cierran todos los
         huecos de adentro, hasta la distancia elegida;
       · «Sólo para pintar»: en vez de soldar deja un cierre INVISIBLE (como
         los trazos invisibles de Harmony): el balde lo respeta, no se ve ni
         sale en el export. Se ven punteados en celeste con la Cinta o el Balde.
   - PINZA (X), arreglada: parte una línea en dos donde hacés clic. Antes
     convertía el tramo curvo en recto y deformaba la línea; ahora la parte
     exacto, también un pincel (se vuelve a dibujar cada mitad).

   Funciona sobre las líneas del lápiz, la pluma, la regla, las figuras (su
   contorno) y el pincel (que guarda su línea central). La geometría vive en
   limpieza-nucleo.js; acá se lee y se escribe el dibujo. Cada acción es UN
   paso de Ctrl+Z. */
(function (global) {
  "use strict";
  const doc = global.document;
  const N = () => global.LOW.vector.limpieza;
  const D = () => (typeof DZ !== "undefined" ? DZ : null);
  const SVGNS = "http://www.w3.org/2000/svg";
  const FUERA = ".dz-penui, .dz-onion, [data-locked], defs, mask, clipPath, pattern, symbol, [data-low='fill'], [data-low='gap-close'], [data-defbase], [data-low='perspectiva']";
  const CLAVE = "low.limpieza.v1";
  const prefs = (() => {
    const base = { sobrante: 14, distancia: 12, union: "soldar" };
    try { return { ...base, ...JSON.parse(global.localStorage.getItem(CLAVE) || "{}") }; } catch (_) { return base; }
  })();
  const guardarPrefs = () => { try { global.localStorage.setItem(CLAVE, JSON.stringify(prefs)); } catch (_) { /* */ } };
  const aviso = (t) => global.dzSetStatus?.(t);

  /* ── leer el dibujo: cada línea como polilínea en el espacio del lienzo ── */
  const hoja = () => doc.querySelector("#dzCanvas > svg");
  function matriz(el, svg) {
    const r = svg.getScreenCTM(), m = el.getScreenCTM && el.getScreenCTM();
    return r && m ? r.inverse().multiply(m) : null;
  }
  const por = (M, x, y) => [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f];
  const escala = (svg) => { const m = svg && svg.getScreenCTM(); return m ? Math.hypot(m.a, m.b) || 1 : 1; };
  function aLienzo(svg, cx, cy) { const m = svg.getScreenCTM().inverse(); return [m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f]; }

  const esPincel = (el) => el.hasAttribute("data-low-brush-points");
  function conTrazo(el) {
    const s = el.getAttribute("stroke") || (global.getComputedStyle ? global.getComputedStyle(el).stroke : "");
    if (!s || s === "none" || /^rgba\(.*,\s*0\)$/.test(s)) return false;
    const w = parseFloat(el.getAttribute("stroke-width") || (global.getComputedStyle ? global.getComputedStyle(el).strokeWidth : "1"));
    return !(w <= 0);
  }
  function candidatos(svg) {
    const fondo = (el) => el.matches("rect[data-low-page]") || (typeof global.dzIsCanvasBackground === "function" && global.dzIsCanvasBackground(el));
    return [...svg.querySelectorAll("[data-low-brush-points], path, line, polyline, polygon, rect, circle, ellipse")].filter((el) => {
      if (el.closest(FUERA) || fondo(el)) return false;
      const dueño = el.parentElement && el.parentElement.closest("[data-low-brush-points]");
      if (dueño) return false;                              // las piezas internas de un pincel
      if (el.closest("[data-low='forma-pincel']") && !esPincel(el)) return false;
      return esPincel(el) || conTrazo(el);
    });
  }
  function leerLinea(el, svg) {
    const M = matriz(el, svg);
    if (!M) return null;
    const tag = el.tagName.toLowerCase();
    let local = null, cerrada = false, tipo, seg = null, segs = null, tags = null;
    try {
      if (esPincel(el)) {
        tipo = "pincel";
        const pts = JSON.parse(el.getAttribute("data-low-brush-points"));
        if (!Array.isArray(pts) || pts.length < 2) return null;
        local = global.LOW.drawing.puntosDeCurva ? global.LOW.drawing.puntosDeCurva(pts, 1.5) : pts;
      } else if (tag === "line") {
        tipo = "recta";
        local = [[+el.getAttribute("x1") || 0, +el.getAttribute("y1") || 0], [+el.getAttribute("x2") || 0, +el.getAttribute("y2") || 0]];
        segs = [{ c: "L", p0: local[0], p1: local[1] }]; tags = [[0, 0], [0, 1]];
      } else if ((seg = segmentosDe(el))) {
        tipo = tag === "path" ? "camino" : "forma";
        const ap = N().aplanar(seg.segs);
        local = ap.pts; tags = ap.tags; segs = seg.segs; cerrada = seg.cerrada;
      } else {
        tipo = tag === "path" ? "camino" : "forma";
        const L = el.getTotalLength ? el.getTotalLength() : 0;
        if (!(L > 0)) return null;
        const n = Math.max(2, Math.min(1500, Math.ceil(L / 1.5)));
        local = [];
        for (let i = 0; i <= n; i++) { const q = el.getPointAtLength(L * i / n); local.push([q.x, q.y]); }
        cerrada = tag === "path" ? /z\s*$/i.test(el.getAttribute("d") || "") : tag !== "polyline";
      }
    } catch (_) { return null; }
    if (!local || local.length < 2) return null;
    const poly = local.map((p) => { const [x, y] = por(M, p[0], p[1]); return [x, y].concat(p.slice(2)); });
    const acum = N().acumulado(poly);
    if (!(acum[acum.length - 1] > 0.01)) return null;
    return { el, tipo, cerrada, poly, acum, caja: N().caja(poly), M, segs, tags };
  }
  /** Los segmentos Bézier del elemento, si se puede partir exacto. Un círculo o
   *  una elipse son cuatro cúbicas (k = 0,5523: menos de 0,03 % del radio). */
  function segmentosDe(el) {
    const tag = el.tagName.toLowerCase(), n = (a) => +(el.getAttribute(a) || 0);
    if (tag === "circle" || tag === "ellipse") {
      const cx = n("cx"), cy = n("cy"), rx = tag === "circle" ? n("r") : n("rx"), ry = tag === "circle" ? n("r") : n("ry"), k = 0.5522847498;
      if (!(rx > 0 && ry > 0)) return null;
      const P = [[cx + rx, cy], [cx, cy + ry], [cx - rx, cy], [cx, cy - ry]];
      const H = [[0, ry * k], [-rx * k, 0], [0, -ry * k], [rx * k, 0]];
      const segs = P.map((p0, i) => { const p1 = P[(i + 1) % 4], h0 = H[i], h1 = H[(i + 1) % 4];
        return { c: "C", p0, c1: [p0[0] + h0[0], p0[1] + h0[1]], c2: [p1[0] - h1[0], p1[1] - h1[1]], p1 }; });
      return { segs, cerrada: true };
    }
    if (typeof global.dzPathParse !== "function") return null;
    const d = tag === "path" ? el.getAttribute("d") || "" : (typeof global.dzFormaAPath === "function" ? global.dzFormaAPath(el) : "");
    if (!d || /[aAsStT]/.test(d.replace(/e-?\d/g, ""))) return null;   // arcos y S/T: el camino aproximado
    return N().segmentar(global.dzPathParse(d));
  }
  const todas = (svg) => candidatos(svg).map((el) => leerLinea(el, svg)).filter(Boolean);

  /* ── escribir: cada pieza vuelve a su elemento, en su espacio ── */
  const r2 = (v) => Math.round(v * 100) / 100;
  function aLocal(M, poly) {
    const I = M.inverse();
    return poly.map((p) => { const [x, y] = por(I, p[0], p[1]); return [x, y].concat(p.slice(2)); });
  }
  const PRESENTACION = ["stroke", "stroke-width", "stroke-linecap", "stroke-linejoin", "stroke-opacity", "opacity",
    "stroke-dasharray", "data-stk", "data-low", "transform", "class", "style", "vector-effect"];
  /** Un <path> con el estilo del elemento (para figuras y rectas que pasan a ser caminos). */
  function caminoComo(el) {
    const p = doc.createElementNS(SVGNS, "path");
    for (const a of PRESENTACION) if (el.hasAttribute(a)) p.setAttribute(a, el.getAttribute(a));
    if (!p.hasAttribute("stroke-linecap")) p.setAttribute("stroke-linecap", "round");
    if (!p.hasAttribute("stroke-linejoin")) p.setAttribute("stroke-linejoin", "round");
    p.setAttribute("fill", "none");
    return p;
  }
  function dCamino(loc, cerrar) {
    const s = N().simplificar(loc, 0.2);
    const d = s.length < 3 ? "M " + s.map((p) => r2(p[0]) + " " + r2(p[1])).join(" L ")
      : (global.LOW.drawing.caminoSuave ? global.LOW.drawing.caminoSuave(s) : "M " + s.map((p) => r2(p[0]) + " " + r2(p[1])).join(" L "));
    return { d: cerrar ? d + " Z" : d, pts: s };
  }
  /** Escribe la polilínea (en el espacio del lienzo) como `nodo`, del tipo de
   *  la línea original. Devuelve el nodo que quedó (puede ser otro). */
  function escribir(nodo, linea, poly, cerrar = false) {
    const loc = aLocal(linea.M, poly);
    if (linea.tipo === "pincel") {
      let config = null;
      try { config = JSON.parse(nodo.getAttribute("data-low-brush-config") || "null"); } catch (_) { /* */ }
      const color = nodo.getAttribute("data-low-brush-color") || nodo.getAttribute("fill") || "#1a1a1a";
      const size = +nodo.getAttribute("data-low-brush-size") || (config && config.size) || 6;
      const pts = N().simplificar(loc.map((p) => [p[0], p[1], p[2] == null ? 0.5 : p[2]].concat(p.slice(3))), 0.15);
      if (cerrar) pts.push(pts[0].slice());
      const nuevo = typeof global.dzBrushRenderElement === "function" ? global.dzBrushRenderElement(pts, color,
        { brush: config || undefined, size, fixedWidth: nodo.getAttribute("data-low-brush-fixed") === "1" }) : null;
      if (nuevo) {
        if (nodo.tagName === nuevo.tagName && nodo.tagName.toLowerCase() === "path") nodo.setAttribute("d", nuevo.getAttribute("d"));
        else {
          nodo.replaceChildren(...[...nuevo.childNodes]);
          for (const a of ["d", "filter", "mask"]) if (nuevo.hasAttribute(a)) nodo.setAttribute(a, nuevo.getAttribute(a));
        }
      }
      nodo.setAttribute("data-low-brush-points", JSON.stringify(pts.map((p) => p.map((v, k) => (k < 2 ? r2(v) : k === 2 ? Math.round(v * 1000) / 1000 : v)))));
      return nodo;
    }
    if (linea.tipo === "recta" && !cerrar && nodo.tagName.toLowerCase() === "line" && poly.length >= 2) {
      const a = loc[0], b = loc[loc.length - 1];
      nodo.setAttribute("x1", r2(a[0])); nodo.setAttribute("y1", r2(a[1]));
      nodo.setAttribute("x2", r2(b[0])); nodo.setAttribute("y2", r2(b[1]));
      return nodo;
    }
    let p = nodo;
    if (nodo.tagName.toLowerCase() !== "path") { p = caminoComo(nodo); if (nodo.id) p.id = nodo.id; nodo.replaceWith(p); }
    else if (!cerrar) p.setAttribute("fill", "none");   // una pieza abierta no tiene relleno
    const { d, pts } = dCamino(loc, cerrar);
    p.setAttribute("d", d);
    p.setAttribute("data-low-trazo-points", JSON.stringify(pts.map((q) => [r2(q[0]), r2(q[1]), 1])));
    return p;
  }
  /** Las piezas de una línea para unos intervalos [a, b] de largo de arco. */
  function piezasSegs(linea, iv) {
    const L = linea.acum[linea.acum.length - 1], pos = (s) => N().posEn(linea.tags, linea.acum, s);
    if (iv[1] <= L + 1e-9) return N().trozo(linea.segs, pos(iv[0]), pos(Math.min(iv[1], L)));
    return N().trozo(linea.segs, pos(iv[0]), pos(L)).concat(N().trozo(linea.segs, pos(0), pos(iv[1] - L)));
  }
  /** Escribe segmentos Bézier (en el espacio LOCAL de la línea) en `nodo`. */
  function escribirSegs(nodo, linea, segs, cerrar = false) {
    if (linea.tipo === "recta" && !cerrar && segs.length === 1 && segs[0].c === "L" && nodo.tagName.toLowerCase() === "line") {
      nodo.setAttribute("x1", r2(segs[0].p0[0])); nodo.setAttribute("y1", r2(segs[0].p0[1]));
      nodo.setAttribute("x2", r2(segs[0].p1[0])); nodo.setAttribute("y2", r2(segs[0].p1[1]));
      return nodo;
    }
    let p = nodo;
    if (nodo.tagName.toLowerCase() !== "path") { p = caminoComo(nodo); if (nodo.id) p.id = nodo.id; nodo.replaceWith(p); }
    else if (!cerrar) p.setAttribute("fill", "none");     // una pieza abierta no tiene relleno
    p.setAttribute("d", N().dDe(segs, cerrar));
    p.removeAttribute("data-low-trazo-points");          // el camino manda (el Esculpir lo vuelve a leer)
    return p;
  }
  /** Reemplaza la línea por las piezas de esos intervalos (0, 1 o más). */
  function reemplazar(linea, intervalos) {
    const el = linea.el;
    const piezas = intervalos.map((iv) => (linea.segs ? piezasSegs(linea, iv) : N().polyDe(linea, iv))).filter((pz) => pz && pz.length);
    if (!piezas.length) { el.remove(); return []; }
    const out = [];
    let ancla = el;
    piezas.forEach((pz, i) => {
      let nodo = i === 0 ? el : el.cloneNode(true);
      if (i > 0) { nodo.removeAttribute("id"); ancla.after(nodo); }
      nodo = linea.segs ? escribirSegs(nodo, linea, pz) : escribir(nodo, linea, pz);
      ancla = nodo; out.push(nodo);
    });
    return out;
  }

  /* ── el paso de historial ── */
  function antes() { global.dzSnapshot?.(); }
  let version = 0;                                // cambia con cada edición propia (para la memoria del hover)
  function confirmar(label, estado) {
    version++;
    const dz = D();
    if (dz && dz.doc && typeof global.dzCanvasInner === "function") {
      try { dz.doc.writeDrawing(global.dzCanvasInner(), { label }); } catch (_) { /* el volcado de siempre lo guarda */ }
    }
    global.dzMarkDirty?.(); global.dzBuildLayers?.(); global.dzPositionHandle?.();
    if (estado) aviso(estado);
  }

  /* ── superposición: lo que se va a borrar, el gesto, la cinta ── */
  let capa = null;
  function superposicion(svg) {
    if (capa && capa.ownerSVGElement === svg && capa.isConnected) { svg.appendChild(capa); return capa; }
    capa = doc.createElementNS(SVGNS, "g");
    capa.setAttribute("class", "dz-penui dz-limpieza"); capa.setAttribute("pointer-events", "none");
    svg.appendChild(capa);
    return capa;
  }
  function limpiarCapa() { if (capa) capa.replaceChildren(); }
  function dibujar(svg, polys, color, ancho = 3, punteado = "") {
    const g = superposicion(svg);
    for (const poly of polys) {
      if (!poly || poly.length < 2) continue;
      const p = doc.createElementNS(SVGNS, "path");
      p.setAttribute("d", "M " + poly.map((q) => r2(q[0]) + " " + r2(q[1])).join(" L "));
      p.setAttribute("fill", "none"); p.setAttribute("stroke", color); p.setAttribute("stroke-width", ancho);
      p.setAttribute("stroke-linecap", "round"); p.setAttribute("stroke-linejoin", "round");
      p.setAttribute("vector-effect", "non-scaling-stroke"); p.setAttribute("opacity", "0.9");
      if (punteado) p.setAttribute("stroke-dasharray", punteado);
      g.appendChild(p);
    }
  }
  function anillo(svg, x, y, color) {
    const g = superposicion(svg), c = doc.createElementNS(SVGNS, "circle"), k = escala(svg);
    c.setAttribute("cx", x); c.setAttribute("cy", y); c.setAttribute("r", 7 / k);
    c.setAttribute("fill", "none"); c.setAttribute("stroke", color); c.setAttribute("stroke-width", 2.5);
    c.setAttribute("vector-effect", "non-scaling-stroke");
    g.appendChild(c);
  }
  /** El tramo [s0, s1] como polilínea (en una cerrada puede dar la vuelta). */
  function tramoPoly(l, tr) {
    const L = l.acum[l.acum.length - 1], [a, b] = tr;
    if (b > a) return N().sub(l.poly, l.acum, a, Math.min(b, L)).concat(b > L ? N().sub(l.poly, l.acum, 0, b - L).slice(1) : []);
    return N().sub(l.poly, l.acum, a, L).concat(N().sub(l.poly, l.acum, 0, b).slice(1));
  }

  /* ── la cuchilla ── */
  const tolT = (svg) => Math.max(0.75, 3 / escala(svg));   // una T a 3 px de pantalla también corta
  function masCercana(lineas, p, radio) {
    let mejor = null;
    for (const l of lineas) {
      const m = N().masCercano(l.poly, l.acum, p);
      if (m.d <= radio && (!mejor || m.d < mejor.m.d)) mejor = { l, m };
    }
    return mejor;
  }
  function tramoBajo(svg, lineas, p) {
    const hit = masCercana(lineas, p, 10 / escala(svg));
    if (!hit) return null;
    const cs = N().cortes(hit.l, lineas, tolT(svg));
    const L = hit.l.acum[hit.l.acum.length - 1];
    return { l: hit.l, tr: N().tramo(cs, hit.m.s, L, hit.l.cerrada), cs };
  }
  function cuchillaClic(svg, p) {
    const lineas = todas(svg), t = tramoBajo(svg, lineas, p);
    if (!t) return aviso("Cuchilla: hacé clic sobre el tramo de línea que querés sacar");
    antes();
    reemplazar(t.l, N().quedan(t.l, [t.tr]));
    confirmar("Cuchilla · borrar tramo", t.cs.length ? "Tramo borrado de cruce a cruce · Ctrl+Z lo devuelve" : "Esa línea no cruzaba nada: se borró entera · Ctrl+Z la devuelve");
  }
  function cuchillaGesto(svg, gesto) {
    const lineas = todas(svg), G = { poly: gesto, acum: N().acumulado(gesto) };
    const cambios = [];
    for (const l of lineas) {
      const ss = N().crucesEntre(l.poly, l.acum, G.poly, G.acum, false);
      if (!ss.length) continue;
      const cs = N().cortes(l, lineas, tolT(svg)), L = l.acum[l.acum.length - 1];
      cambios.push({ l, piezas: N().quedan(l, ss.map((s) => N().tramo(cs, s, L, l.cerrada))) });
    }
    if (!cambios.length) return aviso("Cuchilla: el gesto no cruzó ninguna línea");
    antes();
    for (const c of cambios) reemplazar(c.l, c.piezas);
    confirmar("Cuchilla · borrar tramos", cambios.length + (cambios.length === 1 ? " línea recortada" : " líneas recortadas") + " · Ctrl+Z lo devuelve");
  }
  function recortarSobrantes() {
    const svg = hoja(); if (!svg) return;
    const lineas = todas(svg), cambios = [];
    for (const l of lineas) {
      const cs = N().cortes(l, lineas, tolT(svg)), tr = N().sobrantes(l, cs, prefs.sobrante);
      if (tr.length) cambios.push({ l, piezas: N().quedan(l, tr, 0.01) });
    }
    if (!cambios.length) return aviso("No hay colitas de menos de " + prefs.sobrante + " px pasado un cruce");
    antes();
    for (const c of cambios) reemplazar(c.l, c.piezas);
    confirmar("Recortar sobrantes", "Sobrantes recortados en " + cambios.length + (cambios.length === 1 ? " línea" : " líneas") + " · Ctrl+Z los devuelve");
  }

  /* ── la pinza (partir en dos, exacto) ── */
  function pinza(e) {
    const svg = hoja(); if (!svg) return;
    const p = aLienzo(svg, e.clientX, e.clientY), lineas = todas(svg);
    const hit = masCercana(lineas, p, 10 / escala(svg));
    if (!hit) return aviso("Pinza: hacé clic sobre una línea para partirla en dos");
    antes();
    const piezas = N().partirIntervalos(hit.l, hit.m.s);
    reemplazar(hit.l, piezas);
    confirmar("Pinza · partir línea", piezas.length > 1 ? "Línea partida en dos · Ctrl+Z la une" : "Figura abierta en ese punto · Ctrl+Z la cierra");
  }

  /* ── la cinta ── */
  function puntas(lineas) {
    const out = [];
    for (const l of lineas) {
      if (l.cerrada) continue;
      const L = l.acum[l.acum.length - 1];
      out.push({ l, extremo: 0, x: l.poly[0][0], y: l.poly[0][1], id: l, largo: L });
      out.push({ l, extremo: 1, x: l.poly[l.poly.length - 1][0], y: l.poly[l.poly.length - 1][1], id: l, largo: L });
    }
    return out;
  }
  function puntaCerca(lista, p, radio, salvo) {
    let mejor = null;
    for (const q of lista) {
      if (salvo && q.l === salvo.l && q.extremo === salvo.extremo) continue;
      const d = Math.hypot(q.x - p[0], q.y - p[1]);
      if (d <= radio && (!mejor || d < mejor.d)) mejor = { ...q, d };
    }
    return mejor;
  }
  /** Un cierre INVISIBLE (sólo para el balde): como los trazos invisibles de Harmony. */
  function cierreInvisible(svg, a, b) {
    const host = svg.querySelector(':scope > g[data-low-art="line"]') || svg;
    const M = matriz(host, svg) || svg.createSVGMatrix();
    const I = M.inverse(), [ax, ay] = por(I, a[0], a[1]), [bx, by] = por(I, b[0], b[1]);
    const p = doc.createElementNS(SVGNS, "path");
    p.setAttribute("data-low", "gap-close");
    p.setAttribute("d", `M ${r2(ax)} ${r2(ay)} L ${r2(bx)} ${r2(by)}`);
    p.setAttribute("fill", "none"); p.setAttribute("stroke", "#000"); p.setAttribute("stroke-width", "1.5");
    p.setAttribute("stroke-linecap", "round"); p.setAttribute("opacity", "0"); p.setAttribute("pointer-events", "none");
    host.appendChild(p);
    return p;
  }
  /** Suelda la punta `pa` con la punta `pb` (o cierra la figura si es la misma línea). */
  function soldar(svg, pa, pb) {
    if (pa.l === pb.l) {                                   // las dos puntas de la misma: se cierra
      const l = pa.l;
      if (l.segs) escribirSegs(l.el, l, l.segs, true); else escribir(l.el, l, l.poly, true);
      return 1;
    }
    const A = pa.l, B = pb.l;
    const mismoTipo = (A.tipo === "pincel") === (B.tipo === "pincel");
    if (!mismoTipo) {                                      // pincel con línea: un tramo recto con el estilo de A
      const puente = A.el.cloneNode(false);
      puente.removeAttribute("id");
      A.el.after(puente);
      escribir(puente, { ...A, tipo: A.tipo === "pincel" ? "camino" : A.tipo }, [[pa.x, pa.y, 0.5], [pb.x, pb.y, 0.5]]);
      return 1;
    }
    if (A.segs && B.segs) {                                // exacto: las curvas de las dos, y un tramo recto si no se tocaban
      const BenA = N().transformar(B.segs, A.M.inverse().multiply(B.M));
      const sa = pa.extremo === 1 ? A.segs : N().invertir(A.segs), sb = pb.extremo === 0 ? BenA : N().invertir(BenA);
      const fin = sa[sa.length - 1].p1, ini = sb[0].p0;
      const puente = Math.hypot(fin[0] - ini[0], fin[1] - ini[1]) > 1e-6 ? [{ c: "L", p0: fin, p1: ini }] : [];
      escribirSegs(A.el, { ...A, tipo: "camino" }, sa.concat(puente, sb));
      B.el.remove();
      return 1;
    }
    const unida = N().unir(A.poly, pa.extremo, B.poly, pb.extremo);
    escribir(A.el, { ...A, tipo: A.tipo === "recta" || A.tipo === "forma" ? "camino" : A.tipo }, unida);
    B.el.remove();
    return 1;
  }
  /** Prolonga la punta `pa` hasta el punto q (sobre otra línea). */
  function prolongar(pa, q) {
    const l = pa.l;
    if (l.segs) {                                          // exacto: un tramo recto hasta la otra línea
      const I = l.M.inverse(), [qx, qy] = por(I, q[0], q[1]);
      const segs = pa.extremo === 1 ? l.segs.concat([{ c: "L", p0: l.segs[l.segs.length - 1].p1, p1: [qx, qy] }])
        : [{ c: "L", p0: [qx, qy], p1: l.segs[0].p0 }].concat(l.segs);
      escribirSegs(l.el, { ...l, tipo: "camino" }, segs);
      return;
    }
    const poly = pa.extremo === 1 ? l.poly.concat([[q[0], q[1]].concat(l.poly[l.poly.length - 1].slice(2))])
      : [[q[0], q[1]].concat(l.poly[0].slice(2))].concat(l.poly);
    escribir(l.el, { ...l, tipo: l.tipo === "recta" || l.tipo === "forma" ? "camino" : l.tipo }, poly);
  }
  /** Cierra los huecos de un rectángulo (o de todo el dibujo): de punta a punta
   *  primero (los pares más cercanos), y después de punta a línea. De a uno,
   *  releyendo el dibujo: cada soldadura cambia las líneas. */
  function cerrarHuecos(svg, rect, dist) {
    const dentro = (q) => !rect || (q.x >= rect[0] && q.x <= rect[2] && q.y >= rect[1] && q.y <= rect[3]);
    const invisible = prefs.union === "invisible";
    const clave = (q) => Math.round(q.x * 10) + "," + Math.round(q.y * 10);
    const usadas = new Set();                     // cada punta se cierra UNA vez
    let hechos = 0, tope = 2000;
    // 1) de punta a punta, el par más cercano primero, releyendo después de cada unión
    while (tope-- > 0) {
      const lineas = todas(svg);
      const ps = puntas(lineas).filter((q) => dentro(q) && !usadas.has(clave(q)));
      const pares = N().huecos(ps.map((q, i) => ({ ...q, id: lineas.indexOf(q.l), i })), dist);
      if (!pares.length) break;
      const a = ps[pares[0].a.i], b = ps[pares[0].b.i];
      usadas.add(clave(a)); usadas.add(clave(b));
      if (invisible) cierreInvisible(svg, [a.x, a.y], [b.x, b.y]);
      else soldar(svg, a, b);
      hechos++;
    }
    // 2) de punta a línea: una punta suelta cerca del cuerpo de otra
    while (tope-- > 0) {
      const lineas = todas(svg);
      let elegido = null;
      for (const pa of puntas(lineas)) {
        if (!dentro(pa) || usadas.has(clave(pa))) continue;
        for (const l of lineas) {
          if (l === pa.l) continue;
          const m = N().masCercano(l.poly, l.acum, [pa.x, pa.y]);
          if (m.d > 1e-3 && m.d <= dist && (!elegido || m.d < elegido.m.d)) elegido = { pa, m };
        }
      }
      if (!elegido) break;
      usadas.add(clave(elegido.pa));
      if (invisible) cierreInvisible(svg, [elegido.pa.x, elegido.pa.y], [elegido.m.x, elegido.m.y]);
      else prolongar(elegido.pa, [elegido.m.x, elegido.m.y]);
      usadas.add(clave({ x: elegido.m.x, y: elegido.m.y }));   // la punta nueva queda sobre la línea: ya está cerrada
      hechos++;
    }
    return hechos;
  }
  function cerrarTodos() {
    const svg = hoja(); if (!svg) return;
    antes();
    const n = cerrarHuecos(svg, null, prefs.distancia);
    if (!n) return aviso("No hay huecos de menos de " + prefs.distancia + " px");
    confirmar("Cerrar huecos", n + (n === 1 ? " hueco cerrado" : " huecos cerrados") +
      (prefs.union === "invisible" ? " con cierres invisibles (sólo para pintar)" : "") + " · Ctrl+Z los abre");
  }
  function borrarInvisibles() {
    const svg = hoja(); if (!svg) return;
    const cierres = svg.querySelectorAll('[data-low="gap-close"]');
    if (!cierres.length) return aviso("No hay cierres invisibles en este dibujo");
    antes();
    cierres.forEach((c) => c.remove());
    confirmar("Borrar cierres invisibles", cierres.length + " cierres invisibles borrados");
  }

  /* ── los gestos ── */
  let g = null;
  function empezar(e) {
    const svg = hoja(); if (!svg) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    try { doc.querySelector("#dzCanvas").setPointerCapture(e.pointerId); } catch (_) { /* puntero sintético */ }
    const p = aLienzo(svg, e.clientX, e.clientY), herramienta = D().tool;
    g = { herramienta, pid: e.pointerId, svg, pts: [p], cx: e.clientX, cy: e.clientY, largo: 0 };
    limpiarCapa();
    if (herramienta === "cinta") {
      g.lineas = todas(svg);
      g.puntas = puntas(g.lineas);
      g.desde = puntaCerca(g.puntas, p, 14 / escala(svg));
      if (g.desde) anillo(svg, g.desde.x, g.desde.y, "#F0450E");
    }
  }
  function mover(e) {
    const dz = D();
    if (!dz) return;
    if (!g) {                                             // pasar el mouse: lo que se va a borrar
      if (dz.tool === "cuchilla" && e.buttons === 0) hover(e);
      return;
    }
    if (e.pointerId !== g.pid) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const svg = g.svg, p = aLienzo(svg, e.clientX, e.clientY);
    g.largo += Math.hypot(e.clientX - g.cx, e.clientY - g.cy); g.cx = e.clientX; g.cy = e.clientY;
    g.pts.push(p);
    limpiarCapa();
    if (g.herramienta === "cuchilla") {
      dibujar(svg, [g.pts], "#F0450E", 1.5, "5 4");
    } else if (g.desde) {
      const q = destino(svg, p);
      dibujar(svg, [[[g.desde.x, g.desde.y], q ? [q.x, q.y] : p]], prefs.union === "invisible" ? "#33B5E8" : "#F0450E", 2, "6 4");
      anillo(svg, g.desde.x, g.desde.y, "#F0450E");
      if (q) anillo(svg, q.x, q.y, q.tipo === "punta" ? "#F0450E" : "#33B5E8");
    } else {
      const a = g.pts[0];
      dibujar(svg, [[a, [p[0], a[1]], p, [a[0], p[1]], a]], "#33B5E8", 1.5, "4 4");
    }
  }
  /** Adónde va la cinta: una punta (prioridad) o el cuerpo de una línea. */
  function destino(svg, p) {
    const k = escala(svg);
    const pt = puntaCerca(g.puntas, p, 14 / k, g.desde);
    if (pt) return { tipo: "punta", x: pt.x, y: pt.y, punta: pt };
    let mejor = null;
    for (const l of g.lineas) {
      const m = N().masCercano(l.poly, l.acum, p);
      if (l === g.desde.l) {                             // la propia: no contra su propia punta
        const L = l.acum[l.acum.length - 1], sPunta = g.desde.extremo === 1 ? L : 0;
        if (Math.abs(m.s - sPunta) < 20 / k) continue;
      }
      if (m.d <= 10 / k && (!mejor || m.d < mejor.d)) mejor = { tipo: "linea", x: m.x, y: m.y, d: m.d };
    }
    return mejor;
  }
  function terminar(e) {
    if (!g || (e.pointerId != null && e.pointerId !== g.pid)) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const gesto = g; g = null;
    limpiarCapa();
    if (e.type === "pointercancel") return;
    const svg = gesto.svg, p = aLienzo(svg, e.clientX, e.clientY);
    if (gesto.herramienta === "cuchilla") {
      if (gesto.largo < 6) cuchillaClic(svg, p);
      else cuchillaGesto(svg, gesto.pts.concat([p]));
      return;
    }
    if (gesto.desde) {
      g = gesto; const q = destino(svg, p); g = null;
      if (!q) return aviso("Cinta: soltá sobre la punta o el cuerpo de otra línea");
      antes();
      if (prefs.union === "invisible") cierreInvisible(svg, [gesto.desde.x, gesto.desde.y], [q.x, q.y]);
      else if (q.tipo === "punta") soldar(svg, gesto.desde, q.punta);
      else prolongar(gesto.desde, [q.x, q.y]);
      return confirmar("Cinta · " + (prefs.union === "invisible" ? "cierre invisible" : q.tipo === "punta" ? "unir líneas" : "prolongar hasta la línea"),
        prefs.union === "invisible" ? "Cierre invisible: el balde ya pinta adentro · no se ve ni sale en el export"
          : q.tipo === "punta" ? (gesto.desde.l === q.punta.l ? "Figura cerrada" : "Líneas unidas en una sola") : "Línea prolongada hasta tocar la otra");
    }
    if (gesto.largo < 6) return aviso("Cinta: arrastrá desde la punta de una línea, o un rectángulo para cerrar los huecos de adentro");
    const a = gesto.pts[0];
    antes();
    const n = cerrarHuecos(svg, [Math.min(a[0], p[0]), Math.min(a[1], p[1]), Math.max(a[0], p[0]), Math.max(a[1], p[1])], prefs.distancia);
    if (!n) return aviso("No hay huecos de menos de " + prefs.distancia + " px en ese rectángulo");
    confirmar("Cinta · cerrar huecos", n + (n === 1 ? " hueco cerrado" : " huecos cerrados") + " · Ctrl+Z los abre");
  }
  let hoverPendiente = false, ultimoHover = null;
  function hover(e) {
    const cv = doc.querySelector("#dzCanvas");
    if (!cv || !cv.contains(e.target)) { limpiarCapa(); return; }
    ultimoHover = e;
    if (hoverPendiente) return;
    hoverPendiente = true;
    global.requestAnimationFrame(() => {
      hoverPendiente = false;
      const svg = hoja(); if (!svg || !ultimoHover || D()?.tool !== "cuchilla" || g) return;
      const p = aLienzo(svg, ultimoHover.clientX, ultimoHover.clientY);
      limpiarCapa();
      const t = tramoBajo(svg, cache(svg), p);
      if (t) dibujar(svg, [tramoPoly(t.l, t.tr)], "#F0450E", 5);
    });
  }
  /** Las líneas leídas, mientras el dibujo no cambie (para el pasar del mouse). */
  let memo = null;
  function cache(svg) {
    const firma = svg.querySelectorAll("*").length + ":" + (D()?.doc?.revision || 0) + ":" + version;
    if (!memo || memo.svg !== svg || memo.firma !== firma) memo = { svg, firma, lineas: todas(svg) };
    return memo.lineas;
  }

  /* ── la barra de opciones ── */
  function opciones() {
    const box = doc.querySelector("#dzToolOpts"), t = D()?.tool;
    if (!box || (t !== "cuchilla" && t !== "cinta")) return;
    box.querySelectorAll(":scope > .dz-hint").forEach((n) => n.remove());
    const s = doc.createElement("span");
    s.className = "limp-opciones";
    if (t === "cuchilla") {
      s.innerHTML = `<span class="dz-hint">Clic: borra el tramo hasta los cruces · arrastrar: borra los tramos que cruzás</span>
        <label title="Las colitas que pasan del último cruce y miden menos que esto">Sobrantes de hasta <input type="number" data-l="sobrante" min="1" max="200" value="${prefs.sobrante}"> px</label>
        <button type="button" data-l="recortar" title="Recorta todas las colitas cortas del dibujo de una vez">Recortar sobrantes</button>`;
    } else {
      s.innerHTML = `<span class="dz-hint">Desde una punta: a otra punta la suelda, a una línea la prolonga · desde un lugar vacío: rectángulo que cierra los huecos</span>
        <label title="Soldar: la línea se completa. Sólo para pintar: un cierre invisible que respeta el balde (como Harmony)">Unión <select data-l="union">
          <option value="soldar"${prefs.union === "soldar" ? " selected" : ""}>Soldar línea</option>
          <option value="invisible"${prefs.union === "invisible" ? " selected" : ""}>Sólo para pintar (invisible)</option></select></label>
        <label title="Hasta qué distancia se cierra un hueco (rectángulo y «Cerrar todos»)">Distancia <input type="number" data-l="distancia" min="1" max="200" value="${prefs.distancia}"> px</label>
        <button type="button" data-l="cerrar" title="Cierra todos los huecos del dibujo hasta la distancia elegida">Cerrar todos los huecos</button>
        <button type="button" data-l="invisibles" title="Saca los cierres invisibles de este dibujo">Borrar cierres invisibles</button>`;
    }
    s.addEventListener("change", (e) => {
      const k = e.target.dataset.l; if (!k) return;
      if (k === "union") prefs.union = e.target.value === "invisible" ? "invisible" : "soldar";
      else prefs[k] = Math.max(1, Math.min(200, +e.target.value || prefs[k]));
      guardarPrefs();
    });
    s.addEventListener("click", (e) => {
      const k = e.target.dataset && e.target.dataset.l;
      if (k === "recortar") recortarSobrantes();
      else if (k === "cerrar") cerrarTodos();
      else if (k === "invisibles") borrarInvisibles();
    });
    box.appendChild(s);
  }

  /* ── enganches, sin sumar líneas a app.js ── */
  function enganchar() {
    try { if (typeof DZ_TOOL_NAMES !== "undefined") { DZ_TOOL_NAMES.cuchilla = "cuchilla"; DZ_TOOL_NAMES.cinta = "cinta"; } } catch (_) { /* */ }
    try { if (typeof DZ_CURSORS !== "undefined") { DZ_CURSORS.cuchilla = "crosshair"; DZ_CURSORS.cinta = "crosshair"; } } catch (_) { /* */ }
    doc.addEventListener("pointerdown", (e) => {
      const dz = D(), cv = doc.querySelector("#dzCanvas");
      if (!dz || (dz.tool !== "cuchilla" && dz.tool !== "cinta") || !cv || !cv.contains(e.target)) return;
      if (e.button !== 0 || dz.spaceDown) return;
      if (typeof global.dzOnUiPanel === "function" && global.dzOnUiPanel(e)) return;
      empezar(e);
    }, true);
    doc.addEventListener("pointermove", mover, true);
    doc.addEventListener("pointerup", terminar, true);
    doc.addEventListener("pointercancel", terminar, true);
    // la Pinza, exacta: dzDrawDown la llama POR NOMBRE
    global.dzPliersDown = pinza;
    const orig = global.dzToolOptsRender;
    if (typeof orig === "function" && !orig.__limpieza) {
      const f = function () {
        const r = orig.apply(this, arguments);
        try { opciones(); } catch (err) { console.warn("[limpieza]", err); }
        if (!["cuchilla", "cinta"].includes(D()?.tool)) limpiarCapa();
        return r;
      };
      Object.assign(f, orig); f.__limpieza = true;
      global.dzToolOptsRender = f;
    }
  }

  global.LOW.vector.limpiezaHerramientas = { prefs, todas, cuchillaClic, cuchillaGesto, recortarSobrantes, cerrarTodos,
    borrarInvisibles, pinza, cerrarHuecos };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(typeof window !== "undefined" ? window : globalThis);
