/* ══ ⬚ LA FLECHA CON OPCIONES: TIPO Y ALCANCE ═══════════════════════════════
   Pedido de Mauro: «me falta una herramienta de selección que sirva para
   seleccionar toda la capa en una línea de tiempo; Toon Boom y OpenToonz tienen
   un desplegable en la herramienta de selección con distintas opciones;
   copiemos eso».

   En la barra de la Flecha (y de la flecha blanca), como en OpenToonz:
   - TIPO: Rectángulo (el marco de siempre) · Lazo (a mano alzada) · Polígono
     (clic por punto; se cierra con clic en el primero, doble clic o Enter).
     Shift suma y Alt elige sólo lo que queda entero adentro, como el marco.
   - ALCANCE: Este dibujo · Cuadros elegidos (los de la línea de tiempo) ·
     Toda la capa (todos sus dibujos: el «Whole Level» de OpenToonz y el
     «Apply to All Drawings» de Harmony). Lo que se elige en la mesa se vuelve
     a buscar en cada dibujo con el MISMO criterio —el mismo marco, lazo,
     polígono, punto o color, en el mismo lugar de la hoja— y mover, escalar
     o rotar se aplica igual en todos, en UN paso de Ctrl+Z.
   - ELEGIR TODO, y MISMO COLOR (el «Same Style» de OpenToonz): todo lo que
     usa el mismo estilo de la paleta que lo elegido.

   Para mover una capa entera en toda la escena: Toda la capa → Elegir todo →
   arrastrar. Las flechas del teclado y los botones del inspector (voltear,
   alinear) también se repiten; los campos numéricos que se tipean, no (cada
   tecla sería un paso). Con el rig prendido el alcance es sólo este dibujo
   (las piezas del rig se posan, no se mueven). */
(function (global) {
  "use strict";
  const doc = global.document;
  const D = () => (typeof DZ !== "undefined" ? DZ : null);
  const SVGNS = "http://www.w3.org/2000/svg";
  const CLAVE = "low.seleccion.v1";
  const prefs = (() => {
    const base = { tipo: "rect", alcance: "dibujo" };
    try { return { ...base, ...JSON.parse(global.localStorage.getItem(CLAVE) || "{}") }; } catch (_) { return base; }
  })();
  const guardarPrefs = () => { try { global.localStorage.setItem(CLAVE, JSON.stringify(prefs)); } catch (_) { /* */ } };
  const aviso = (t) => global.dzSetStatus?.(t);
  const hoja = () => doc.querySelector("#dzCanvas > svg");
  const esFlecha = () => ["select", "direct"].includes(D()?.tool || "select");

  /* ── matrices sin pantalla (como acompanar.js): sirven en la hoja viva y en una copia ── */
  const I = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  const mul = (A, B) => ({ a: A.a * B.a + A.c * B.b, b: A.b * B.a + A.d * B.b, c: A.a * B.c + A.c * B.d, d: A.b * B.c + A.d * B.d, e: A.a * B.e + A.c * B.f + A.e, f: A.b * B.e + A.d * B.f + A.f });
  const inv = (M) => { const det = M.a * M.d - M.b * M.c || 1e-12; return { a: M.d / det, b: -M.b / det, c: -M.c / det, d: M.a / det, e: (M.c * M.f - M.d * M.e) / det, f: (M.b * M.e - M.a * M.f) / det }; };
  const propia = (el) => { try { const c = el.transform && el.transform.baseVal.consolidate(); return c ? { a: c.matrix.a, b: c.matrix.b, c: c.matrix.c, d: c.matrix.d, e: c.matrix.e, f: c.matrix.f } : I(); } catch (_) { return I(); } };
  const esPlano = (n) => !n || (n.getAttribute && n.getAttribute("data-low-art")) || !n.tagName || n.tagName.toLowerCase() === "svg";
  /** La matriz del elemento respecto de la hoja: la suya y la de sus grupos (los planos no tienen). */
  function aHoja(el) { let M = I(); for (let n = el; !esPlano(n); n = n.parentElement) M = mul(propia(n), M); return M; }
  const por = (M, x, y) => [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f];
  const txt = (M) => `matrix(${[M.a, M.b, M.c, M.d, M.e, M.f].map((v) => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e5) / 1e5)).join(" ")})`;
  /** De la pantalla a la hoja (con zoom y giro de la vista). */
  function aLaHoja(cx, cy) { const m = hoja().getScreenCTM().inverse(); return [m.a * cx + m.c * cy + m.e, m.b * cx + m.d * cy + m.f]; }

  /* ── lo elegible de una hoja (viva u oculta): lo mismo que el marco ── */
  const SKIP = ["defs", "title", "desc", "style", "metadata", "lineargradient", "radialgradient", "filter", "clippath", "mask", "symbol"];
  function candidatos(svg) {
    const direct = [...svg.children].filter((n) => !n.hasAttribute("data-low-art"));
    const art = [...svg.querySelectorAll(":scope > g[data-low-art] > *")];
    return [...direct, ...art].filter((n) => !SKIP.includes(n.tagName.toLowerCase())
      && !(n.classList && (n.classList.contains("dz-onion") || n.classList.contains("dz-penui")))
      && !n.hasAttribute("data-locked") && n.getAttribute("display") !== "none"
      && n.getAttribute("data-low") !== "gap-close"
      && !n.matches("rect[data-low-page]")
      && !(typeof global.dzIsCanvasBackground === "function" && global.dzIsCanvasBackground(n)));
  }
  /** Puntos de la geometría del elemento, en la hoja (cada ~4 unidades). */
  function muestras(n) {
    const geos = n.matches("path,line,polyline,polygon,rect,circle,ellipse,image,text,use") ? [n]
      : [...n.querySelectorAll("path,line,polyline,polygon,rect,circle,ellipse,image,text,use")];
    const out = [];
    for (const g of geos) {
      const M = aHoja(g);
      try {
        if (g.getTotalLength && !["image", "text", "use"].includes(g.tagName.toLowerCase())) {
          const L = g.getTotalLength();
          const k = Math.max(4, Math.min(300, Math.ceil(L / 4)));
          for (let i = 0; i <= k; i++) { const q = g.getPointAtLength(L * i / k); out.push(por(M, q.x, q.y)); }
        } else {
          const b = g.getBBox();
          for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x + b.width, b.y + b.height], [b.x, b.y + b.height], [b.x + b.width / 2, b.y + b.height / 2]]) out.push(por(M, x, y));
        }
      } catch (_) { /* sin geometría */ }
    }
    return out;
  }
  function dentro(p, poly) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  const estilos = (n) => {
    const s = new Set();
    for (const x of [n, ...n.querySelectorAll("[data-stk],[data-fil]")]) {
      if (x.getAttribute("data-stk")) s.add("s" + x.getAttribute("data-stk"));
      if (x.getAttribute("data-fil")) s.add("f" + x.getAttribute("data-fil"));
    }
    return s;
  };
  /** ¿El elemento cumple el criterio? (rect y lazo son polígonos de la hoja) */
  function cumple(n, c) {
    if (c.tipo === "todo") return true;
    if (c.tipo === "estilo") { const s = estilos(n); return c.estilos.some((e) => s.has(e)); }
    const pts = muestras(n);
    if (!pts.length) return false;
    if (c.tipo === "poligono") return c.entero ? pts.every((p) => dentro(p, c.poly)) : (pts.some((p) => dentro(p, c.poly)) || c.poly.some((q) => dentro(q, pts)));
    if (c.tipo === "punto") {
      if (pts.some((p) => Math.hypot(p[0] - c.p[0], p[1] - c.p[1]) <= c.tol)) return true;
      return pts.length > 2 && dentro(c.p, pts);            // adentro de una forma
    }
    return false;
  }

  /* ── el criterio de lo elegido: cómo se eligió (para repetirlo en otros dibujos) ── */
  let criterios = null;              // [{tipo, …}] en coordenadas de la hoja; null = no se sabe
  let eligiendo = false;             // nuestras propias selecciones no pisan el criterio
  function elegirEn(svg, crit, sumar) {
    const dz = D();
    const nuevos = candidatos(svg).filter((n) => crit.some((c) => cumple(n, c)));
    eligiendo = true;
    try {
      let pack = sumar ? ((dz.multi && dz.multi.length > 1) ? dz.multi.slice() : (dz.sel && dz.sel.isConnected ? [dz.sel] : [])) : [];
      for (const n of nuevos) if (!pack.includes(n)) pack.push(n);
      pack = pack.filter((n) => n && n.isConnected);
      if (!sumar) global.dzClearMulti?.();
      dz.multi = pack.length > 1 ? pack : [];
      if (pack.length) global.dzSelect(pack[pack.length - 1]); else global.dzDeselect();
    } finally { eligiendo = false; }
    criterios = sumar && criterios ? criterios.concat(crit) : crit.slice();
    return nuevos.length;
  }
  function informar(n) {
    const total = (D().multi && D().multi.length > 1) ? D().multi.length : (D().sel ? 1 : 0);
    aviso(total ? total + (total === 1 ? " elemento seleccionado" : " elementos seleccionados") + textoAlcance() : (n === 0 ? "Nada adentro" : ""));
  }
  const textoAlcance = () => prefs.alcance === "capa" ? " · se aplica a toda la capa" : prefs.alcance === "cuadros" ? " · se aplica a los cuadros elegidos" : "";

  /* ── el marco de siempre: queda anotado como polígono (también con la vista girada) ── */
  function envolverMarco() {
    const sel = global.dzMarqueeSelect;
    if (typeof sel === "function" && !sel.__alcance) {
      global.dzMarqueeSelect = function (l, t, r, b, additive, mode) {
        const out = sel.apply(this, arguments);
        if (hoja()) {
          const poly = [[l, t], [r, t], [r, b], [l, b]].map(([x, y]) => aLaHoja(x, y));
          const c = { tipo: "poligono", poly, entero: mode === "contained" };
          criterios = additive && criterios ? criterios.concat([c]) : [c];
        }
        return out;
      };
      global.dzMarqueeSelect.__alcance = true;
    }
    const empezar = global.dzMarqueeStart;
    if (typeof empezar === "function" && !empezar.__alcance) {
      global.dzMarqueeStart = function (e) {
        if (prefs.tipo === "lazo") return lazo(e);
        if (prefs.tipo === "poligono") return poligono(e);
        return empezar.apply(this, arguments);
      };
      global.dzMarqueeStart.__alcance = true;
    }
  }

  /* ── superposición del lazo y del polígono (en la hoja, como guía de pantalla) ── */
  let guia = null;
  function dibujarGuia(pts, cerrar, extra) {
    const svg = hoja(); if (!svg) return;
    if (!guia || !guia.isConnected) {
      guia = doc.createElementNS(SVGNS, "g");
      guia.setAttribute("class", "dz-penui dz-lazo"); guia.setAttribute("pointer-events", "none");
    }
    svg.appendChild(guia);
    guia.replaceChildren();
    if (pts.length < 1) return;
    const camino = doc.createElementNS(SVGNS, "path");
    const todos = extra ? pts.concat([extra]) : pts;
    camino.setAttribute("d", "M " + todos.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L ") + (cerrar ? " Z" : ""));
    camino.setAttribute("fill", "rgba(51,181,232,0.08)"); camino.setAttribute("stroke", "#33B5E8");
    camino.setAttribute("stroke-width", "1.5"); camino.setAttribute("stroke-dasharray", "5 4");
    camino.setAttribute("vector-effect", "non-scaling-stroke");
    guia.appendChild(camino);
    const k = Math.hypot(svg.getScreenCTM().a, svg.getScreenCTM().b) || 1;
    for (const p of pts.slice(0, prefs.tipo === "poligono" ? pts.length : 1)) {
      const c = doc.createElementNS(SVGNS, "circle");
      c.setAttribute("cx", p[0]); c.setAttribute("cy", p[1]); c.setAttribute("r", 4 / k);
      c.setAttribute("fill", "#fff"); c.setAttribute("stroke", "#33B5E8"); c.setAttribute("stroke-width", "1.5");
      c.setAttribute("vector-effect", "non-scaling-stroke");
      guia.appendChild(c);
    }
  }
  const borrarGuia = () => { if (guia) guia.remove(); };

  function lazo(e) {
    e.preventDefault();
    const pid = e.pointerId, pts = [aLaHoja(e.clientX, e.clientY)];
    let recorrido = 0, ultimo = [e.clientX, e.clientY];
    const mover = (ev) => {
      if (ev.pointerId !== pid) return;
      recorrido += Math.hypot(ev.clientX - ultimo[0], ev.clientY - ultimo[1]); ultimo = [ev.clientX, ev.clientY];
      pts.push(aLaHoja(ev.clientX, ev.clientY));
      dibujarGuia(pts, false);
    };
    const soltar = (ev) => {
      if (ev.pointerId !== pid) return;
      doc.removeEventListener("pointermove", mover); doc.removeEventListener("pointerup", soltar); doc.removeEventListener("pointercancel", soltar);
      borrarGuia();
      if (ev.type === "pointercancel") return;
      if (recorrido < 6 || pts.length < 3) { if (!ev.shiftKey) global.dzDeselect(); return; }
      informar(elegirEn(hoja(), [{ tipo: "poligono", poly: pts, entero: !!ev.altKey }], !!ev.shiftKey));
    };
    doc.addEventListener("pointermove", mover); doc.addEventListener("pointerup", soltar); doc.addEventListener("pointercancel", soltar);
  }

  /* El polígono: cada clic es un punto. Mientras está abierto, los clics en la
     mesa son suyos (no eligen ni dibujan). */
  let poli = null;
  function poligono(e) {
    e.preventDefault();
    poli = { pts: [aLaHoja(e.clientX, e.clientY)], ultimoClic: performance.now(), shift: !!e.shiftKey, alt: !!e.altKey };
    dibujarGuia(poli.pts, false);
    aviso("Polígono: clic por punto · clic en el primero, doble clic o Enter lo cierra · Esc cancela");
  }
  function cerrarPoligono(alt) {
    const p = poli; poli = null; borrarGuia();
    if (!p || p.pts.length < 3) return aviso("Polígono cancelado: hacen falta tres puntos");
    informar(elegirEn(hoja(), [{ tipo: "poligono", poly: p.pts, entero: !!(alt || p.alt) }], p.shift));
  }
  function poliDown(e) {
    if (!poli) return;
    const cv = doc.querySelector("#dzCanvas");
    if (!cv || !cv.contains(e.target) || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const p = aLaHoja(e.clientX, e.clientY), svg = hoja();
    const k = Math.hypot(svg.getScreenCTM().a, svg.getScreenCTM().b) || 1;
    const primero = poli.pts[0], ahora = performance.now();
    if (poli.pts.length >= 3 && (Math.hypot(p[0] - primero[0], p[1] - primero[1]) * k < 9 || ahora - poli.ultimoClic < 300)) return cerrarPoligono(e.altKey);
    poli.pts.push(p); poli.ultimoClic = ahora;
    dibujarGuia(poli.pts, false);
  }
  function poliMove(e) { if (poli && hoja()) dibujarGuia(poli.pts, false, aLaHoja(e.clientX, e.clientY)); }
  function poliTecla(e) {
    if (!poli) return;
    if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); cerrarPoligono(e.altKey); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); poli = null; borrarGuia(); aviso("Polígono cancelado"); }
  }

  /* ── un clic sobre un objeto: el criterio es ese punto de la hoja ── */
  let clic = null;                   // dónde se hizo el último clic con la flecha
  function anotarClic(e) {
    if (!esFlecha() || poli) return;
    const cv = doc.querySelector("#dzCanvas");
    if (!cv || !cv.contains(e.target) || e.button !== 0 || !hoja()) return;
    const svg = hoja(), k = Math.hypot(svg.getScreenCTM().a, svg.getScreenCTM().b) || 1;
    clic = { p: aLaHoja(e.clientX, e.clientY), tol: 6 / k, shift: !!e.shiftKey, t: performance.now() };
    punteroAbajo = true;
  }
  function envolverEleccion() {
    const sel = global.dzSelect;
    if (typeof sel === "function" && !sel.__alcance) {
      global.dzSelect = function (el) {
        const dz0 = D(), yaEstaba = !!dz0 && (dz0.sel === el || (dz0.multi || []).includes(el));
        const r = sel.apply(this, arguments);
        // agarrar algo que ya estaba elegido (para arrastrar la selección) sólo
        // cambia cuál es el activo: el criterio de lo elegido sigue siendo el mismo
        if (!eligiendo && !yaEstaba) {
          // un clic de la flecha recién hecho: el criterio es ese punto
          if (clic && performance.now() - clic.t < 1500 && punteroAbajo) {
            const c = { tipo: "punto", p: clic.p, tol: clic.tol };
            criterios = clic.shift && criterios ? criterios.concat([c]) : [c];
          } else if (!marcando) criterios = null;          // una selección hecha por código: no se sabe repetirla
        }
        return r;
      };
      global.dzSelect.__alcance = true;
    }
    const des = global.dzDeselect;
    if (typeof des === "function" && !des.__alcance) {
      global.dzDeselect = function () { const r = des.apply(this, arguments); if (!eligiendo && !restaurando) criterios = null; return r; };
      global.dzDeselect.__alcance = true;
    }
  }
  let marcando = false;

  /* ── repetir la transformación en los otros dibujos ── */
  let punteroAbajo = false, armado = null, aplicando = false, restaurando = false;
  const paquete = () => { const dz = D(); return (dz.multi && dz.multi.length > 1) ? dz.multi.slice() : (dz.sel ? [dz.sel] : []); };
  function esquinas(n) {
    try { const b = n.getBBox(), M = aHoja(n); return [por(M, b.x, b.y), por(M, b.x + b.width, b.y), por(M, b.x, b.y + b.height)]; }
    catch (_) { return null; }
  }
  /** La afín que lleva A (3 puntos) a B (3 puntos); null si son colineales. */
  function ajustar(A, B) {
    const ux = A[1][0] - A[0][0], uy = A[1][1] - A[0][1], vx = A[2][0] - A[0][0], vy = A[2][1] - A[0][1];
    const det = ux * vy - uy * vx;
    if (Math.abs(det) < 1e-6) return null;
    const Ux = B[1][0] - B[0][0], Uy = B[1][1] - B[0][1], Vx = B[2][0] - B[0][0], Vy = B[2][1] - B[0][1];
    // L = [U V] · [u v]^-1
    const i11 = vy / det, i12 = -vx / det, i21 = -uy / det, i22 = ux / det;
    const a = Ux * i11 + Vx * i21, c = Ux * i12 + Vx * i22, b = Uy * i11 + Vy * i21, d = Uy * i12 + Vy * i22;
    return { a, b, c, d, e: B[0][0] - (a * A[0][0] + c * A[0][1]), f: B[0][1] - (b * A[0][0] + d * A[0][1]) };
  }
  /** Anota cómo estaba lo elegido ANTES de un gesto (para medir qué le hizo).
   *  Con el mouse (punteroAbajo) o, con `sinPuntero`, desde el teclado o un botón. */
  function armar(sinPuntero = false) {
    const dz = D();
    if (aplicando || armado || (!punteroAbajo && !sinPuntero) || !esFlecha() || prefs.alcance === "dibujo" || !criterios || !dz?.doc || dz.rigMode) return;
    const pack = paquete().filter((n) => n && n.isConnected);
    if (!pack.length) return;
    armado = { pack, antes: pack.map(esquinas) };
  }
  const FLECHAS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  const tipeando = () => { const a = doc.activeElement; return !!a && (/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || a.isContentEditable); };
  /** Las flechas del teclado mueven lo elegido (drawing/flechas.js): con
   *  «Toda la capa» también se repite. Se arma ANTES que ese manejador. */
  function alApretar(e) {
    if (!FLECHAS.includes(e.key) || e.ctrlKey || e.metaKey || tipeando()) return;
    armar(true);
  }
  /** Si el gesto terminó sin cambiar nada (un clic), se desarma. Con margen: el
   *  dzMarkDirty del final del gesto llega DESPUÉS de este pointerup. */
  function desarmarLuego() { const a = armado; setTimeout(() => { if (armado === a && !aplicando) armado = null; }, 150); }
  function alTerminar(medido) {
    if (medido) return aplicarEnOtros(medido);
    const delta = medir();
    if (delta) aplicarEnOtros(delta);
  }
  /** Qué le hizo el gesto a lo elegido: la afín de antes a después (en la hoja). */
  function medir() {
    if (!armado || aplicando) return null;
    const a = armado; armado = null;
    let delta = null;
    for (let i = 0; i < a.pack.length && !delta; i++) {
      const n = a.pack[i];
      if (!n.isConnected || !a.antes[i]) continue;
      const despues = esquinas(n);
      if (despues) delta = ajustar(a.antes[i], despues);
    }
    if (!delta) {                                       // todo era una línea: al menos el corrimiento
      const n = a.pack.find((x, i) => x.isConnected && a.antes[i]);
      if (!n) return;
      const i = a.pack.indexOf(n), d = esquinas(n);
      if (!d) return;
      delta = { a: 1, b: 0, c: 0, d: 1, e: d[0][0] - a.antes[i][0][0], f: d[0][1] - a.antes[i][0][1] };
    }
    const quieto = Math.abs(delta.a - 1) + Math.abs(delta.d - 1) + Math.abs(delta.b) + Math.abs(delta.c) < 1e-6 && Math.hypot(delta.e, delta.f) < 0.01;
    return quieto ? null : delta;
  }

  let oculta = null;
  function hojaOculta(vb) {
    if (!oculta || !oculta.isConnected) {
      oculta = doc.createElementNS(SVGNS, "svg");
      oculta.style.cssText = "position:absolute;left:-30000px;top:0;width:1920px;height:1080px;visibility:hidden;pointer-events:none";
      doc.body.appendChild(oculta);
    }
    oculta.setAttribute("viewBox", vb || "0 0 1920 1080");
    return oculta;
  }
  /** Dónde está cada elegido (plano + índices), para volver a elegirlos después de repintar. */
  function rutas(pack, svg) {
    return pack.map((n) => { const r = []; for (let x = n; x && x !== svg; x = x.parentElement) r.unshift([...x.parentElement.children].indexOf(x)); return r; });
  }
  const porRuta = (svg, r) => r.reduce((n, i) => (n ? n.children[i] : null), svg);

  function aplicarEnOtros(delta) {
    const dz = D(), d = dz.doc, coloring = global.LOW && global.LOW.animation && global.LOW.animation.coloring;
    if (!coloring || typeof coloring.scopeTargets !== "function" || typeof d.applyDrawingContents !== "function") return;
    const actual = d.drawing, capa = d.layer;
    const destinos = coloring.scopeTargets(d, prefs.alcance === "capa" ? "level" : "selection")
      .filter((t) => !(actual && t.levelId === capa.levelId && t.number === actual.number));
    if (!destinos.length) {
      if (prefs.alcance === "cuadros") aviso("Cuadros elegidos: marcá en la línea de tiempo los cuadros de esta capa");
      return;
    }
    const svg = hoja(), vb = svg.getAttribute("viewBox"), tmp = hojaOculta(vb), cambios = [];
    let tocados = 0;
    for (const t of destinos) {
      tmp.innerHTML = t.drawing.content || "";
      let cambio = false;
      for (const n of candidatos(tmp)) {
        if (!criterios.some((c) => cumple(n, c))) continue;
        const P = aHoja(n.parentElement), T = propia(n);
        n.setAttribute("transform", txt(mul(inv(P), mul(delta, mul(P, T)))));
        cambio = true; tocados++;
      }
      if (cambio) cambios.push({ levelId: t.levelId, number: t.number, content: tmp.innerHTML });
    }
    tmp.innerHTML = "";
    if (!cambios.length) return aviso("En los otros dibujos no hay nada en el mismo lugar");
    // UN paso de Ctrl+Z: el dibujo de la mesa y los demás
    const r = rutas(paquete().filter((n) => n.isConnected), svg), crit = criterios;
    aplicando = true;
    const h = d.history, tx = !!h && !h.transaction;
    try {
      if (tx) h.begin("Transformar en " + (prefs.alcance === "capa" ? "toda la capa" : "los cuadros elegidos"));
      global.dzDocCommit?.();
      d.applyDrawingContents(cambios, "Transformar en varios dibujos");
      if (tx) h.commit();
    } catch (err) { if (tx) try { h.cancel(); } catch (_) { /* */ } console.warn("[selección]", err); }
    finally { aplicando = false; }
    // repintar deselecciona: se vuelve a elegir lo mismo
    restaurando = true;
    try {
      const svg2 = hoja(), pack = r.map((ruta) => porRuta(svg2, ruta)).filter(Boolean);
      eligiendo = true;
      dz.multi = pack.length > 1 ? pack : [];
      if (pack.length) global.dzSelect(pack[pack.length - 1]);
    } finally { eligiendo = false; restaurando = false; }
    criterios = crit;
    // los dibujos son del NIVEL: si otra capa usa el mismo nivel, también cambia
    const otras = d.scene.layers.filter((l) => l.levelId === capa.levelId && l.id !== capa.id).length;
    aviso("Hecho en " + (cambios.length + 1) + " dibujos de la " + (prefs.alcance === "capa" ? "capa" : "selección de cuadros") + " · Ctrl+Z lo deshace en todos" +
      (otras ? " · ojo: " + (otras === 1 ? "otra capa usa" : otras + " capas más usan") + " el mismo nivel y también cambian" : ""));
  }

  function envolverHistoria() {
    const snap = global.dzSnapshot;
    if (typeof snap === "function" && !snap.__alcance) {
      global.dzSnapshot = function () { try { armar(); } catch (_) { /* */ } return snap.apply(this, arguments); };
      global.dzSnapshot.__alcance = true;
    }
    // los botones del inspector (voltear, alinear) registran con dzDrawingEditBegin/Record
    const empieza = global.dzDrawingEditBegin, registra = global.dzDrawingEditRecord;
    if (typeof empieza === "function" && !empieza.__alcance) {
      global.dzDrawingEditBegin = function () { if (!tipeando()) { try { armar(true); } catch (_) { /* */ } } return empieza.apply(this, arguments); };
      global.dzDrawingEditBegin.__alcance = true;
    }
    if (typeof registra === "function" && !registra.__alcance) {
      global.dzDrawingEditRecord = function () {
        // se mide ANTES de registrar: registrar repinta el lienzo y lo elegido pasa a ser otros nodos
        const delta = armado && !aplicando ? medir() : null;
        const r = registra.apply(this, arguments);
        if (delta) setTimeout(() => { try { alTerminar(delta); } catch (err) { console.warn("[selección]", err); } }, 0);
        return r;
      };
      global.dzDrawingEditRecord.__alcance = true;
    }
    const sucio = global.dzMarkDirty;
    if (typeof sucio === "function" && !sucio.__alcance) {
      global.dzMarkDirty = function () {
        const r = sucio.apply(this, arguments);
        if (armado && !aplicando) setTimeout(() => { try { alTerminar(); } catch (err) { console.warn("[selección]", err); } }, 0);
        return r;
      };
      global.dzMarkDirty.__alcance = true;
    }
  }

  /* ── elegir todo y mismo color ── */
  function elegirTodo() {
    const svg = hoja(); if (!svg) return;
    if (!esFlecha()) global.dzSetTool?.("select");
    informar(elegirEn(svg, [{ tipo: "todo" }], false));
  }
  function mismoColor() {
    const dz = D(), svg = hoja();
    const base = paquete().filter((n) => n && n.isConnected);
    if (!svg || !base.length) return aviso("Elegí algo primero: se eligen todos los que usan su mismo color de la paleta");
    const est = [...new Set(base.flatMap((n) => [...estilos(n)]))];
    if (!est.length) return aviso("Eso no usa un color de la paleta: no hay «mismo color» para buscar");
    informar(elegirEn(svg, [{ tipo: "estilo", estilos: est }], false));
  }

  /* ── la barra de opciones ── */
  function opciones() {
    const box = doc.querySelector("#dzToolOpts");
    if (!box || !esFlecha()) return;
    // la ayuda larga de la flecha («clic selecciona · marco vacío…») pasa al
    // tooltip: con las opciones al lado no entraba y la cabecera crecía un renglón
    const ayuda = box.querySelector(":scope > .dz-hint");
    const textoAyuda = ayuda ? ayuda.textContent.trim() : "";
    if (ayuda) ayuda.remove();
    const s = doc.createElement("span");
    s.className = "sel-opciones";
    if (textoAyuda) s.title = textoAyuda;
    s.innerHTML = `<label title="Cómo se arma la selección al arrastrar en un lugar vacío">Tipo <select data-s="tipo">
        <option value="rect"${prefs.tipo === "rect" ? " selected" : ""}>Rectángulo</option>
        <option value="lazo"${prefs.tipo === "lazo" ? " selected" : ""}>Lazo</option>
        <option value="poligono"${prefs.tipo === "poligono" ? " selected" : ""}>Polígono</option></select></label>
      <label title="A qué dibujos se aplica mover, escalar o rotar: lo elegido se busca igual en cada uno">Alcance <select data-s="alcance">
        <option value="dibujo"${prefs.alcance === "dibujo" ? " selected" : ""}>Este dibujo</option>
        <option value="cuadros"${prefs.alcance === "cuadros" ? " selected" : ""}>Cuadros elegidos</option>
        <option value="capa"${prefs.alcance === "capa" ? " selected" : ""}>Toda la capa</option></select></label>
      <button type="button" data-s="todo" title="Elige todo el dibujo (con «Toda la capa», mover lleva toda la capa en toda la escena)">Elegir todo</button>
      <button type="button" data-s="color" title="Elige todo lo que usa el mismo color de la paleta que lo elegido">Mismo color</button>`;
    s.addEventListener("change", (e) => {
      const k = e.target.dataset.s; if (!k) return;
      prefs[k] = e.target.value; guardarPrefs();
      if (k === "alcance") aviso(prefs.alcance === "dibujo" ? "Alcance: este dibujo" : prefs.alcance === "capa" ? "Alcance: toda la capa · lo que muevas se mueve igual en todos sus dibujos" : "Alcance: los cuadros elegidos en la línea de tiempo");
    });
    s.addEventListener("click", (e) => {
      const k = e.target.dataset && e.target.dataset.s;
      if (k === "todo") elegirTodo(); else if (k === "color") mismoColor();
    });
    box.appendChild(s);
  }

  function enganchar() {
    envolverMarco(); envolverEleccion(); envolverHistoria();
    doc.addEventListener("pointerdown", anotarClic, true);
    doc.addEventListener("pointerdown", poliDown, true);
    doc.addEventListener("pointermove", poliMove, true);
    doc.addEventListener("pointerup", () => { punteroAbajo = false; desarmarLuego(); }, true);
    doc.addEventListener("keydown", poliTecla, true);
    doc.addEventListener("keydown", alApretar, true);
    const orig = global.dzToolOptsRender;
    if (typeof orig === "function" && !orig.__seleccion) {
      const f = function () { const r = orig.apply(this, arguments); try { opciones(); } catch (err) { console.warn("[selección]", err); } if (!esFlecha() && poli) { poli = null; borrarGuia(); } return r; };
      Object.assign(f, orig); f.__seleccion = true;
      global.dzToolOptsRender = f;
    }
  }

  global.LOW = global.LOW || {};
  global.LOW.drawing = global.LOW.drawing || {};
  global.LOW.drawing.seleccionOpciones = { prefs, elegirTodo, mismoColor, criterios: () => criterios, ajustar, cumple, candidatos };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(typeof window !== "undefined" ? window : globalThis);
