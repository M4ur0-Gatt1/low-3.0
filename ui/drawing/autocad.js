/* ══════════════════════════════════════════════════════════════════════════
   LO DE AUTOCAD QUE LE SIRVE A UN ESTUDIO DE ANIMACIÓN

   Pedido de Mauro (oct-2026): «si te parece que hay algún comportamiento de
   AutoCAD que se pueda copiar y sea útil a este sistema, sumalo; tiene que
   ser el mejor programa estudio de animación del mundo, no te conformes con
   poco».

   Se copió cómo trabaja AutoCAD (no su código):
   - REFERENCIAS A OBJETOS (F3, «REFENT»): el lápiz, el pincel, la pluma y las
     formas arrancan y terminan EXACTO en el punto final, el punto medio, la
     intersección, el centro, la perpendicular o el punto más cercano de otra
     línea, con las mismas marcas de AutoCAD (□ △ ✕ ○ ⊥ ⧗) y su nombre. En un
     dibujo para animar sirve para cerrar las formas: el balde rellena a la
     primera.
   - DESFASE («O», «DESFASE»): una copia paralela de lo elegido a la distancia
     pedida; un clic dice de qué lado (Shift: de los dos). Las esquinas de un
     rectángulo o un polígono quedan en punta, como en AutoCAD.
   - MATRIZ («AR», «MATRIZ»): copias en filas y columnas, en círculo alrededor
     de un centro (los rayos de una rueda, una multitud en ronda) o a lo largo
     de un trayecto (postes de un alambrado, pisadas).
   - IGUALAR PROPIEDADES («MA», «IGUALARPROP»): lo elegido pasa su color,
     grosor, trazo y opacidad a lo que se toque después.
   - La LÍNEA DE COMANDOS: la barra de abajo («Pedile un cambio a LOW…»,
     Ctrl+K) entiende los comandos y sus alias antes de mandarle el texto a la
     IA; Enter con la línea vacía repite el último comando, como en AutoCAD.

   Va en un módulo: app.js está en el techo de su presupuesto.

   @module drawing/autocad
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const doc = global.document;
  const NS = "http://www.w3.org/2000/svg";
  const D = () => (typeof DZ !== "undefined" ? DZ : null);   // DZ es una variable global de app.js, no una propiedad de window
  const almacen = () => { try { return typeof dzPrefsStorage === "function" ? dzPrefsStorage() : global.localStorage; } catch (_) { return null; } };
  const hoja = () => doc.querySelector("#dzCanvas > svg");
  const estado = (t) => global.dzSetStatus?.(t);
  const PX_POR_MM = 96 / 25.4;
  const fmt = (v) => String(Math.round(v * 10) / 10).replace(".", ",");
  const leerMm = (clave, d) => { try { const v = Number(almacen()?.getItem(clave)); return v > 0 ? v : d; } catch (_) { return d; } };
  const guardarMm = (clave, v) => { try { almacen()?.setItem(clave, String(v)); } catch (_) { /* sin almacenamiento */ } };

  /* ══ LA GEOMETRÍA: cada elemento como polilínea, en coordenadas del dibujo ══ */
  let version = 0;
  const cache = new WeakMap();
  let vigiaHoja = null, hojaVigilada = null;
  function vigilar() {
    const s = hoja();
    if (!s || s === hojaVigilada) return;
    vigiaHoja?.disconnect();
    hojaVigilada = s; version++;
    vigiaHoja = new MutationObserver(() => { version++; });
    vigiaHoja.observe(s, { subtree: true, childList: true, attributes: true, attributeFilter: ["d", "transform", "points", "x", "y", "width", "height", "cx", "cy", "r", "rx", "ry", "x1", "y1", "x2", "y2", "data-low-pencil-points", "data-low-brush-points"] });
  }
  /** La matriz del espacio propio del elemento al del dibujo (el del SVG raíz). */
  function aDibujo(el) {
    const s = hoja(); if (!s) return null;
    try { const r = s.getScreenCTM(), c = el.getScreenCTM(); if (!r || !c) return null; return r.inverse().multiply(c); } catch (_) { return null; }
  }
  const aplicar = (m, x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const num = (el, a) => Number(el.getAttribute(a)) || 0;

  /** Los puntos PROPIOS del elemento (antes de su transform), si es una línea. */
  function puntosPropios(el) {
    const tag = (el.tagName || "").toLowerCase();
    const attr = el.getAttribute("data-low-pencil-points") || el.getAttribute("data-low-brush-points");
    if (attr) { try { const p = JSON.parse(attr); if (Array.isArray(p) && p.length >= 2) return { pts: p.map((q) => [Number(q[0]), Number(q[1]), q[2] ?? 1]), poligono: false, cinta: el.hasAttribute("data-low-brush-points") }; } catch (_) { /* puntos rotos */ } }
    if (tag === "line") return { pts: [[num(el, "x1"), num(el, "y1")], [num(el, "x2"), num(el, "y2")]], poligono: true };
    if (tag === "rect") { const x = num(el, "x"), y = num(el, "y"), w = num(el, "width"), h = num(el, "height"); if (!(w > 0 && h > 0)) return null; return { pts: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], poligono: true, cerrada: true }; }
    if (tag === "polygon" || tag === "polyline") {
      const v = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
      const pts = []; for (let i = 0; i + 1 < v.length; i += 2) pts.push([v[i], v[i + 1]]);
      return pts.length >= 2 ? { pts, poligono: true, cerrada: tag === "polygon" } : null;
    }
    if (tag === "circle" || tag === "ellipse" || tag === "path") {
      if (typeof el.getTotalLength !== "function") return null;
      let largo = 0; try { largo = el.getTotalLength(); } catch (_) { return null; }
      if (!(largo > 0)) return null;
      const n = Math.max(12, Math.min(500, Math.round(largo / 3))), pts = [];
      for (let i = 0; i <= n; i++) { const p = el.getPointAtLength((largo * i) / n); pts.push([p.x, p.y]); }
      const cerrada = tag !== "path" || /[zZ]\s*$/.test((el.getAttribute("d") || "").trim());
      if (cerrada && pts.length > 2 && dist(pts[0], pts[pts.length - 1]) < 1e-6) pts.pop();
      return { pts, poligono: false, cerrada };
    }
    return null;
  }
  /** Lo que AutoCAD engancha de cada elemento: la polilínea, las puntas, los medios y el centro. */
  function geometria(el) {
    vigilar();
    const c = cache.get(el);
    if (c && c.version === version) return c.g;
    const m = aDibujo(el), propio = m && puntosPropios(el);
    let g = null;
    if (propio) {
      const tag = (el.tagName || "").toLowerCase(), P = propio.pts.map((p) => aplicar(m, p[0], p[1]));
      const cerrada = !!propio.cerrada || (P.length > 3 && dist(P[0], P[P.length - 1]) < 1.5);
      const puntas = [], medios = [];
      let centro = null;
      if (tag === "circle" || tag === "ellipse") centro = aplicar(m, num(el, "cx"), num(el, "cy"));
      else if (cerrada) {
        // el centro geométrico (el «centroide» de AutoCAD 2016+): el del área
        let a = 0, cx = 0, cy = 0;
        for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length], k = p[0] * q[1] - q[0] * p[1]; a += k; cx += (p[0] + q[0]) * k; cy += (p[1] + q[1]) * k; }
        if (Math.abs(a) > 1e-9) centro = [cx / (3 * a), cy / (3 * a)];
      }
      if (propio.poligono) {
        // en un rectángulo o un polígono, los vértices son puntos finales y cada lado tiene su medio
        const n = P.length, lados = cerrada ? n : n - 1;
        P.forEach((p) => puntas.push(p));
        for (let i = 0; i < lados; i++) { const p = P[i], q = P[(i + 1) % n]; medios.push([(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]); }
      } else if (!cerrada) {
        puntas.push(P[0], P[P.length - 1]);
        let tot = 0; for (let i = 1; i < P.length; i++) tot += dist(P[i - 1], P[i]);
        let ac = 0;
        for (let i = 1; i < P.length; i++) { const d = dist(P[i - 1], P[i]); if (ac + d >= tot / 2) { const t = d ? (tot / 2 - ac) / d : 0; medios.push([P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t]); break; } ac += d; }
      }
      g = { P, cerrada, puntas, medios, centro, propio, m };
    }
    cache.set(el, { version, g });
    return g;
  }
  const segmentos = (g) => { const s = []; const n = g.P.length; for (let i = 1; i < n; i++) s.push([g.P[i - 1], g.P[i]]); if (g.cerrada && n > 2) s.push([g.P[n - 1], g.P[0]]); return s; };
  function masCercano(p, a, b) {
    const vx = b[0] - a[0], vy = b[1] - a[1], l = vx * vx + vy * vy;
    const t = l ? Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l)) : 0;
    return [a[0] + vx * t, a[1] + vy * t];
  }
  function cruce(a, b, c, d) {
    const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
    if (Math.abs(den) < 1e-12) return null;
    const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
  }
  /** Los elementos del dibujo que pueden engancharse cerca de un punto de pantalla. */
  function candidatosCerca(cx, cy, radioPx, excluir) {
    const s = hoja(); if (!s || typeof dzHitCandidatos !== "function") return [];
    return dzHitCandidatos(s).filter((el) => {
      if ((el.tagName || "").toLowerCase() === "g" || (excluir && excluir.has(el))) return false;
      if (el.closest && el.closest(".dz-penui,.dz-onion,[visibility=hidden]")) return false;
      let b; try { b = el.getBoundingClientRect(); } catch (_) { return false; }
      return (b.width || b.height) && cx >= b.left - radioPx && cx <= b.right + radioPx && cy >= b.top - radioPx && cy <= b.bottom + radioPx;
    });
  }

  /* ══ REFERENCIAS A OBJETOS (OSNAP) ══ */
  const TIPOS = [
    { id: "fin", nombre: "Punto final", prioridad: 0 },
    { id: "inter", nombre: "Intersección", prioridad: 1 },
    { id: "centro", nombre: "Centro", prioridad: 2 },
    { id: "medio", nombre: "Punto medio", prioridad: 3 },
    { id: "perp", nombre: "Perpendicular", prioridad: 4 },
    { id: "cercano", nombre: "Cercano", prioridad: 5 },
  ];
  const CLAVE_ON = "low.refent", CLAVE_MODOS = "low.refent.modos";
  const MODOS_INICIALES = { fin: true, inter: true, centro: true, medio: true, perp: true, cercano: false };
  let modos = { ...MODOS_INICIALES };
  const APERTURA = 12;   // px de pantalla, como la «apertura» de AutoCAD
  const HERRAMIENTAS = new Set(["pencil", "brush", "pen", "shape", "line", "ruler"]);
  function refentActivo() { return !!D()?.refent; }
  function ponerRefent(on) {
    const d = D(); if (!d) return;
    d.refent = !!on;
    try { almacen()?.setItem(CLAVE_ON, on ? "1" : "0"); } catch (_) { /* sin almacenamiento */ }
    for (const b of doc.querySelectorAll("#dzRefent")) { b.classList.toggle("active", !!on); b.setAttribute("aria-pressed", String(!!on)); }
    if (!on) marca(null);
    const activos = TIPOS.filter((t) => modos[t.id]).map((t) => t.nombre.toLowerCase());
    estado(on ? `⌖ Referencias a objetos: los trazos arrancan y terminan exacto en ${activos.join(", ")} (F3 apaga · «REFENT» elige cuáles)` : "⌖ Referencias a objetos apagadas (F3 las prende)");
  }
  /** El punto de enganche más conveniente cerca de un punto de pantalla. `desde`
   *  (en el dibujo) es donde arrancó el trazo: con él vale la perpendicular. */
  function buscar(cx, cy, opciones = {}) {
    const s = hoja(); if (!s || !refentActivo()) return null;
    const d = D(), zoom = Math.max(0.05, d?.zoom || 1), ap = APERTURA / zoom;
    const p = toUserCrudo ? toUserCrudo(cx, cy) : null; if (!p) return null;
    const q = [p.x, p.y], mejores = [];
    const ofrecer = (pt, tipo, el) => { const dd = dist(pt, q); if (dd <= ap) mejores.push({ x: pt[0], y: pt[1], tipo, el, puntaje: dd + TIPOS.find((t) => t.id === tipo).prioridad * ap * 0.12 }); };
    const cand = candidatosCerca(cx, cy, APERTURA + 2, opciones.excluir), cercanos = [];
    for (const el of cand) {
      const g = geometria(el); if (!g) continue;
      if (modos.fin) for (const pt of g.puntas) ofrecer(pt, "fin", el);
      if (modos.medio) for (const pt of g.medios) ofrecer(pt, "medio", el);
      if (modos.centro && g.centro) ofrecer(g.centro, "centro", el);
      // los tramos que pasan cerca: para lo cercano, la perpendicular y las intersecciones
      const segs = segmentos(g).filter(([a, b]) => dist(masCercano(q, a, b), q) <= ap * 1.5);
      if (!segs.length) continue;
      cercanos.push({ el, segs });
      if (modos.cercano) { let m = null, md = Infinity; for (const [a, b] of segs) { const c = masCercano(q, a, b), dd = dist(c, q); if (dd < md) { md = dd; m = c; } } if (m) ofrecer(m, "cercano", el); }
      if (modos.perp && opciones.desde) {
        const o = opciones.desde;
        for (const [a, b] of segs) {
          const vx = b[0] - a[0], vy = b[1] - a[1], l = vx * vx + vy * vy; if (!l) continue;
          const t = ((o[0] - a[0]) * vx + (o[1] - a[1]) * vy) / l;
          if (t >= 0 && t <= 1) ofrecer([a[0] + vx * t, a[1] + vy * t], "perp", el);
        }
      }
    }
    if (modos.inter) {
      for (let i = 0; i < cercanos.length; i++) for (let j = i; j < cercanos.length; j++) {
        const A = cercanos[i].segs, B = cercanos[j].segs;
        for (let ia = 0; ia < A.length; ia++) for (let ib = i === j ? ia + 2 : 0; ib < B.length; ib++) {
          const x = cruce(A[ia][0], A[ia][1], B[ib][0], B[ib][1]);
          if (x) ofrecer(x, "inter", cercanos[i].el);
        }
      }
    }
    if (!mejores.length) return null;
    mejores.sort((a, b) => a.puntaje - b.puntaje);
    return mejores[0];
  }

  /* la MARCA de AutoCAD sobre la hoja, con su nombre */
  let marcaEl = null;
  function marca(r) {
    if (!r) { if (marcaEl) marcaEl.hidden = true; return; }
    if (!marcaEl) {
      marcaEl = doc.createElement("div");
      marcaEl.className = "dz-refent-marca"; marcaEl.id = "dzRefentMarca";
      Object.assign(marcaEl.style, { position: "fixed", zIndex: 67, pointerEvents: "none", width: "0", height: "0" });
      marcaEl.innerHTML = `<svg width="22" height="22" viewBox="-11 -11 22 22" style="position:absolute;left:-11px;top:-11px;overflow:visible"><g class="glifo"></g></svg>`
        + `<span style="position:absolute;left:12px;top:10px;white-space:nowrap;font:11px/1.2 system-ui,sans-serif;padding:2px 6px;border-radius:4px;background:rgba(28,28,30,.9);color:#f4f1ec"></span>`;
      doc.body.appendChild(marcaEl);
    }
    const s = hoja(), M = s && s.getScreenCTM(); if (!M) return;
    const x = M.a * r.x + M.c * r.y + M.e, y = M.b * r.x + M.d * r.y + M.f;
    const forma = {
      fin: '<rect x="-6" y="-6" width="12" height="12"/>',
      medio: '<path d="M0 -7 L7 5.5 L-7 5.5 Z"/>',
      inter: '<path d="M-6 -6 L6 6 M6 -6 L-6 6"/>',
      centro: '<circle r="6.5"/>',
      perp: '<path d="M-7 6 L7 6 M-4 6 L-4 -7 M-4 1 L1 1 L1 6"/>',
      cercano: '<path d="M-6 -6 L6 -6 L-6 6 L6 6 Z"/>',
    }[r.tipo] || "";
    marcaEl.querySelector(".glifo").innerHTML = `<g fill="none" stroke="#1c1c1e" stroke-width="4" stroke-linejoin="round">${forma}</g><g fill="none" stroke="#f2b705" stroke-width="2" stroke-linejoin="round">${forma}</g>`;
    marcaEl.querySelector("span").textContent = TIPOS.find((t) => t.id === r.tipo)?.nombre || "";
    marcaEl.style.left = x + "px"; marcaEl.style.top = y + "px";
    marcaEl.hidden = false;
    marcaEl.setAttribute("data-tipo", r.tipo);
  }

  /* el enganche en los gestos: mientras se despacha un pointerdown/up de una
     herramienta de dibujo, dzToUser devuelve el punto enganchado */
  let toUserCrudo = null, gesto = null, ultimo = null, cuadroHover = 0, ultimaPos = null;
  function trazoActual() { try { return typeof DRAW_TRACK !== "undefined" ? DRAW_TRACK : null; } catch (_) { return null; } }
  function herramientaEngancha() { const d = D(); return !!d && refentActivo() && HERRAMIENTAS.has(d.tool) && !$hidden(); }
  function $hidden() { const v = doc.querySelector("#designView"); return !v || v.hidden; }
  function excluirDelTrazo() {
    const t = trazoActual(), ex = new Set();
    if (t?.el) { ex.add(t.el); for (const l of t._paralelas?.lados || []) if (l.el) ex.add(l.el); }
    return ex;
  }
  function enganchar() {
    const d = D();
    if (d) { try { d.refent = almacen()?.getItem(CLAVE_ON) === "1"; const m = JSON.parse(almacen()?.getItem(CLAVE_MODOS) || "null"); if (m && typeof m === "object") modos = { ...MODOS_INICIALES, ...m }; } catch (_) { /* sin almacenamiento */ } }
    const orig = global.dzToUser;
    if (typeof orig === "function" && !orig.__autocad) {
      toUserCrudo = orig;
      const f = function (cx, cy) {
        const p = orig.apply(this, arguments);
        if (gesto && Math.abs(cx - gesto.x) < 0.5 && Math.abs(cy - gesto.y) < 0.5 && gesto.r) return { ...p, x: gesto.r.x, y: gesto.r.y };
        return p;
      };
      f.__autocad = true; global.dzToUser = f;
    }
    // el comienzo y el final de cada gesto de dibujo
    const lienzo = () => doc.querySelector("#dzCanvas");
    global.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || !herramientaEngancha() || !lienzo()?.contains(e.target) || modo) return;
      const t = trazoActual();
      gesto = { x: e.clientX, y: e.clientY, r: buscar(e.clientX, e.clientY, { excluir: excluirDelTrazo(), desde: t ? [t.startX, t.startY] : null }) };
    }, true);
    global.addEventListener("pointerdown", () => { gesto = null; }, false);
    global.addEventListener("pointerup", (e) => {
      if (!herramientaEngancha() || modo) return;
      const t = trazoActual();
      gesto = { x: e.clientX, y: e.clientY, r: buscar(e.clientX, e.clientY, { excluir: excluirDelTrazo(), desde: t ? [t.startX, t.startY] : (forma0 || null) }) };
    }, true);
    global.addEventListener("pointerup", () => { gesto = null; }, false);
    // la marca al pasar (una vez por cuadro de pantalla)
    global.addEventListener("pointermove", (e) => {
      ultimaPos = { x: e.clientX, y: e.clientY };
      if (!herramientaEngancha() || modo) { if (marcaEl && !marcaEl.hidden) marca(null); return; }
      if (cuadroHover) return;
      cuadroHover = requestAnimationFrame(() => {
        cuadroHover = 0;
        if (!ultimaPos) return;
        const t = trazoActual();
        ultimo = buscar(ultimaPos.x, ultimaPos.y, { excluir: excluirDelTrazo(), desde: t ? [t.startX, t.startY] : null });
        marca(ultimo);
      });
    }, true);
    // el arranque del trazo a mano: el primer punto, exacto en el enganche
    const empezar = global._drawBeginTrack;
    if (typeof empezar === "function" && !empezar.__autocad) {
      const f = function (e) {
        const t = empezar.apply(this, arguments);
        if (t && gesto && gesto.r && Math.abs(e.clientX - gesto.x) < 0.5) {
          const r = gesto.r, p0 = t.pts[0];
          p0[0] = r.x; p0[1] = r.y; t.startX = r.x; t.startY = r.y;
          t.stabilizer?.reset?.(); t._refentInicio = r;
        }
        return t;
      };
      f.__autocad = true; global._drawBeginTrack = f;
    }
    // el final del trazo a mano: el último punto, exacto en el enganche
    const terminar = global._drawFinish;
    if (typeof terminar === "function" && !terminar.__autocad) {
      const f = function () {
        const t = trazoActual();
        if (t && refentActivo() && t.pts?.length >= 2 && ultimaPos) {
          const r = buscar(ultimaPos.x, ultimaPos.y, { excluir: excluirDelTrazo(), desde: [t.startX, t.startY] });
          if (r) {
            const u = t.pts[t.pts.length - 1], d = D(), ap = APERTURA / Math.max(0.05, d?.zoom || 1);
            const nuevo = [r.x, r.y, ...u.slice(2)];
            if (dist(u, [r.x, r.y]) <= ap) t.pts[t.pts.length - 1] = nuevo; else t.pts.push(nuevo);
            t._refentFin = r;
          }
        }
        marca(null);
        return terminar.apply(this, arguments);
      };
      f.__autocad = true; global._drawFinish = f;
    }
    // (las formas: el punto de arranque cuenta para la perpendicular del final)
    const fd = global.dzFormaDown;
    if (typeof fd === "function" && !fd.__autocad) {
      const f = function (e) { const r = fd.apply(this, arguments); try { const p = global.dzToUser(e.clientX, e.clientY); forma0 = [p.x, p.y]; } catch (_) { forma0 = null; } return r; };
      f.__autocad = true; global.dzFormaDown = f;
    }
    const b = doc.querySelector("#dzRefent");
    if (b && !b.__autocad) { b.__autocad = true; b.addEventListener("click", () => ponerRefent(!refentActivo())); b.addEventListener("contextmenu", (e) => { e.preventDefault(); dialogoRefent(); }); }
    for (const [sel, fn] of [["#dzDesfase", () => comando("DESFASE")], ["#dzMatriz", () => comando("MATRIZ")], ["#dzIgualar", () => comando("IGUALARPROP")]]) {
      const x = doc.querySelector(sel); if (x && !x.__autocad) { x.__autocad = true; x.addEventListener("click", fn); }
    }
    engancharLineaDeComandos();
    engancharModos();
    ponerRefentSilencioso();
  }
  let forma0 = null;
  function ponerRefentSilencioso() { const on = refentActivo(); for (const b of doc.querySelectorAll("#dzRefent")) { b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); } }

  /** «REFENT»: qué se engancha (el cuadro de Parámetros de dibujo de AutoCAD). */
  function dialogoRefent() {
    if (typeof openModal !== "function") return;
    openModal(`<h2>⌖ Referencias a objetos</h2>
      <div class="sub">Al dibujar con el lápiz, el pincel, la pluma o las formas, el comienzo y el final del trazo se enganchan exacto en estos puntos de otras líneas (a ${APERTURA} px del cursor). F3 las prende y las apaga.</div>
      <div class="dz-refent-modos" style="display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;margin:12px 0">
        ${TIPOS.map((t) => `<label><input type="checkbox" data-refent-modo="${t.id}" ${modos[t.id] ? "checked" : ""}> ${t.nombre}</label>`).join("")}
      </div>
      <label style="display:block;margin:6px 0 14px"><input type="checkbox" id="refentOn" ${refentActivo() ? "checked" : ""}> Referencias a objetos prendidas (F3)</label>
      <div class="row" style="display:flex;gap:8px;justify-content:flex-end"><button class="ghost" id="refentCancelar">Cancelar</button><button id="refentListo">Listo</button></div>`);
    doc.querySelector("#refentCancelar").onclick = () => global.closeModal?.();
    doc.querySelector("#refentListo").onclick = () => {
      for (const c of doc.querySelectorAll("[data-refent-modo]")) modos[c.getAttribute("data-refent-modo")] = c.checked;
      try { almacen()?.setItem(CLAVE_MODOS, JSON.stringify(modos)); } catch (_) { /* sin almacenamiento */ }
      global.closeModal?.();
      ponerRefent(doc.querySelector("#refentOn")?.checked ?? refentActivo());
    };
  }

  /* ══ LOS MODOS DE CLIC (desfase: de qué lado; igualar: a quién) ══ */
  let modo = null;   // { tipo: "desfase" | "igualar" | "centro", ... }
  function empezarModo(m, texto) {
    modo = m; marca(null);
    const c = doc.querySelector("#dzCanvas"); if (c) c.style.cursor = "crosshair";
    estado(texto);
  }
  function terminarModo(texto) {
    modo = null;
    const c = doc.querySelector("#dzCanvas"); if (c) c.style.cursor = "";
    if (texto) estado(texto);
  }
  function engancharModos() {
    global.addEventListener("pointerdown", (e) => {
      if (!modo || e.button !== 0) return;
      const c = doc.querySelector("#dzCanvas"); if (!c || !c.contains(e.target)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const m = modo;
      if (m.tipo === "desfase") { const p = toUserCrudo(e.clientX, e.clientY); terminarModo(); hacerDesfase(m.els, m.mm, [p.x, p.y], e.shiftKey); }
      else if (m.tipo === "igualar") {
        const el = typeof dzHitTest === "function" ? dzHitTest(e.clientX, e.clientY) : null;
        if (el && el !== m.fuente && !m.fuente.contains(el)) igualar(m.fuente, el);
      } else if (m.tipo === "centro") { const p = toUserCrudo(e.clientX, e.clientY); terminarModo(); m.listo([p.x, p.y]); }
    }, true);
    global.addEventListener("contextmenu", (e) => { if (modo && doc.querySelector("#dzCanvas")?.contains(e.target)) { e.preventDefault(); e.stopImmediatePropagation(); terminarModo(modo.tipo === "igualar" ? "Igualar propiedades: listo" : "Cancelado"); } }, true);
    global.addEventListener("keydown", (e) => {
      if (!modo) return;
      if (e.key === "Escape" || (e.key === "Enter" && modo.tipo === "igualar")) { e.preventDefault(); e.stopImmediatePropagation(); terminarModo(modo.tipo === "igualar" ? "Igualar propiedades: listo" : "Cancelado"); }
    }, true);
    // (F3 va por el mapa de atajos: panels/atajos.js)
  }
  const elegidos = () => { const d = D(); if (!d) return []; const m = (d.multi || []).filter((n) => n?.isConnected); return m.length ? m : (d.sel?.isConnected ? [d.sel] : []); };
  /** Lo elegido, sin grupos: se baja a las piezas que tienen geometría. */
  function piezas(els) {
    const out = [];
    const bajar = (el) => { if ((el.tagName || "").toLowerCase() === "g") { for (const h of el.children) bajar(h); return; } if (puntosPropios(el)) out.push(el); };
    els.forEach(bajar);
    return out;
  }

  /* ══ DESFASE ══ */
  const CLAVE_DESFASE = "low.desfase.mm";
  /** Desplazar una polilínea `d` hacia el lado `lado` (+1: izquierda de su recorrido).
   *  Curvas: por la normal medida en un tramo, sin rulos. Polígonos: cada lado
   *  corrido y las esquinas en punta (el desfase de AutoCAD). */
  function desplazarPolilinea(pts, d, lado, cerrada, poligono) {
    const n = pts.length; if (n < 2) return null;
    if (poligono) {
      const lados = [], m = cerrada ? n : n - 1;
      for (let i = 0; i < m; i++) {
        const a = pts[i], b = pts[(i + 1) % n], l = dist(a, b) || 1, nx = (-(b[1] - a[1]) / l) * d * lado, ny = ((b[0] - a[0]) / l) * d * lado;
        lados.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny]]);
      }
      const recta = (L1, L2) => {
        const [a, b] = L1, [c, e] = L2, r = [b[0] - a[0], b[1] - a[1]], s = [e[0] - c[0], e[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
        if (Math.abs(den) < 1e-9) return b;
        const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
        return [a[0] + r[0] * t, a[1] + r[1] * t];
      };
      const out = [];
      if (!cerrada) out.push(lados[0][0]);
      for (let i = cerrada ? 0 : 1; i < lados.length; i++) out.push(recta(lados[(i - 1 + lados.length) % lados.length], lados[i]));
      if (!cerrada) out.push(lados[lados.length - 1][1]);
      return out;
    }
    const s = new Float64Array(n);
    for (let i = 1; i < n; i++) s[i] = s[i - 1] + dist(pts[i], pts[i - 1]);
    const total = s[n - 1] + (cerrada ? dist(pts[n - 1], pts[0]) : 0);
    if (total < 1e-9) return null;
    const ventana = Math.max(1, Math.min(Math.abs(d) * 0.6, total / 6));
    const at = (k) => pts[((k % n) + n) % n];
    const out = [], T = [];
    for (let i = 0; i < n; i++) {
      // la tangente: entre los puntos a una ventana de largo de cada lado (dando la vuelta si es cerrada)
      let j0 = i, j1 = i, a0 = 0, a1 = 0;
      while (a0 < ventana && (cerrada || j0 > 0) && i - j0 < n - 1) { a0 += dist(at(j0), at(j0 - 1)); j0--; }
      while (a1 < ventana && (cerrada || j1 < n - 1) && j1 - i < n - 1) { a1 += dist(at(j1 + 1), at(j1)); j1++; }
      let tx = at(j1)[0] - at(j0)[0], ty = at(j1)[1] - at(j0)[1];
      const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l; T.push([tx, ty]);
      out.push([pts[i][0] - ty * d * lado, pts[i][1] + tx * d * lado, ...pts[i].slice(2)]);
    }
    const limpio = [out[0]];
    for (let i = 1; i < out.length; i++) {
      const q = limpio[limpio.length - 1];
      if ((out[i][0] - q[0]) * T[i][0] + (out[i][1] - q[1]) * T[i][1] <= 0 && i < out.length - 1) continue;
      limpio.push(out[i]);
    }
    return limpio.length >= 2 ? limpio : out;
  }
  /** El lado (+1/−1) donde cae un punto del dibujo respecto del recorrido de un elemento. */
  function ladoDe(g, p) {
    let mejor = null, md = Infinity;
    for (const [a, b] of segmentos(g)) { const c = masCercano(p, a, b), dd = dist(c, p); if (dd < md) { md = dd; mejor = [a, b]; } }
    if (!mejor) return 1;
    const [a, b] = mejor, cr = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    return cr >= 0 ? 1 : -1;
  }
  const ATTRS_TRAZO = ["stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "stroke-miterlimit", "opacity", "fill", "fill-opacity", "filter", "vector-effect", "style", "class", "transform", "data-low-style", "data-low-papel", "data-low-ink", "data-ancho"];
  function caminoRecto(P, cerrada) { return P.map((p, i) => (i ? "L " : "M ") + p[0].toFixed(2) + " " + p[1].toFixed(2)).join(" ") + (cerrada ? " Z" : ""); }
  function comenzarDesfase(mm) {
    const els = piezas(elegidos());
    if (!els.length) { estado("Desfase: primero elegí con la flecha la línea (o las líneas) a desfasar"); return false; }
    const v = mm > 0 ? mm : leerMm(CLAVE_DESFASE, 6);
    guardarMm(CLAVE_DESFASE, v);
    empezarModo({ tipo: "desfase", els, mm: v }, `Desfase de ${fmt(v)} mm: hacé clic del lado donde va la copia (Shift+clic: de los dos lados · Esc: cancelar) · otra distancia: «O 10»`);
    return true;
  }
  function hacerDesfase(els, mm, clic, ambos) {
    const dDibujo = mm * PX_POR_MM, nuevos = [];
    global.dzSnapshot?.();
    for (const el of els) {
      const g = geometria(el); if (!g) continue;
      const det = g.m.a * g.m.d - g.m.b * g.m.c, escala = Math.sqrt(Math.abs(det)) || 1;
      const ladoDibujo = ladoDe(g, clic), lados = ambos ? [1, -1] : [ladoDibujo];
      for (const lado of lados) {
        const ladoPropio = det < 0 ? -lado : lado;
        const pr = g.propio, off = desplazarPolilinea(pr.pts, dDibujo / escala, ladoPropio, !!pr.cerrada, !!pr.poligono);
        if (!off) continue;
        let nuevo;
        if (pr.cinta && typeof global.dzBrushFinalElement === "function") {
          nuevo = global.dzBrushFinalElement(off.map((p) => [p[0], p[1], p[2] ?? 1]), el.getAttribute("fill") || "#1a1a1a");
          if (!nuevo) continue;
          for (const a of ["opacity", "transform", "filter"]) if (el.hasAttribute(a)) nuevo.setAttribute(a, el.getAttribute(a));
          global.dzStyleTagInkAsFill?.(nuevo);
        } else {
          nuevo = doc.createElementNS(NS, "path");
          for (const a of ATTRS_TRAZO) if (el.hasAttribute(a)) nuevo.setAttribute(a, el.getAttribute(a));
          nuevo.classList?.remove("dz-sel", "dz-msel");
          if (!nuevo.getAttribute("class")) nuevo.removeAttribute("class");
          nuevo.setAttribute("d", pr.poligono ? caminoRecto(off, !!pr.cerrada) : (global.dzSmoothPath ? global.dzSmoothPath(off) : caminoRecto(off, !!pr.cerrada)) + (pr.cerrada && !pr.poligono ? " Z" : ""));
          if (el.hasAttribute("data-low-pencil-points")) nuevo.setAttribute("data-low-pencil-points", JSON.stringify(off.map((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100])));
          if (!nuevo.hasAttribute("fill") && (el.tagName || "").toLowerCase() !== "path") nuevo.setAttribute("fill", "none");
        }
        el.parentNode.insertBefore(nuevo, el.nextSibling);
        nuevos.push(nuevo);
      }
    }
    if (!nuevos.length) { estado("Desfase: no hubo nada que desfasar"); return []; }
    elegir(nuevos);
    global.dzMarkDirty?.(); global.dzBuildLayers?.();
    estado(`Desfase: ${nuevos.length} copia(s) a ${fmt(mm)} mm · Ctrl+Z la(s) saca`);
    ultimoComando = "O " + String(mm).replace(".", ",");
    return nuevos;
  }
  function elegir(nuevos) {
    const d = D(); if (!d) return;
    global.dzClearMulti?.();
    d.multi = nuevos.length > 1 ? nuevos.slice() : [];
    for (const n of d.multi) n.classList?.add("dz-msel");
    if (nuevos.length) global.dzSelect?.(nuevos[nuevos.length - 1]);
    global.dzPositionHandle?.();
  }

  /* ══ MATRIZ ══ */
  /** Un vector del dibujo llevado al espacio del padre de un elemento. */
  function aPadre(el, vx, vy, px, py) {
    const m = el.parentNode && el.parentNode.getScreenCTM ? aDibujo(el.parentNode) : null;
    if (!m) return { v: [vx, vy], p: px != null ? [px, py] : null };
    const inv = m.inverse();
    const v = [inv.a * vx + inv.c * vy, inv.b * vx + inv.d * vy];
    const p = px != null ? aplicar(inv, px, py) : null;
    return { v, p };
  }
  function copia(el, extra) {
    const c = el.cloneNode(true);
    c.classList?.remove("dz-sel", "dz-msel");
    if (c.getAttribute && c.getAttribute("class") === "") c.removeAttribute("class");
    global.dzUniqueCloneIds?.(c);
    const own = el.getAttribute("transform") || "";
    c.setAttribute("transform", (extra + (own ? " " + own : "")).trim());
    return c;
  }
  /** El centro de lo elegido, en el dibujo. */
  function centroDe(els) {
    const s = hoja(), M = s?.getScreenCTM(); if (!M) return [0, 0];
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const el of els) { const q = el.getBoundingClientRect(); l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); b = Math.max(b, q.bottom); }
    const inv = M.inverse();
    return aplicar(inv, (l + r) / 2, (t + b) / 2);
  }
  const CLAVE_MATRIZ = "low.matriz";
  function opcionesMatriz() { try { return { tipo: "rect", filas: 2, cols: 4, dx: 20, dy: 20, n: 8, angulo: 360, rotar: true, centro: "seleccion", m: 6, alinear: true, ...JSON.parse(almacen()?.getItem(CLAVE_MATRIZ) || "{}") }; } catch (_) { return { tipo: "rect", filas: 2, cols: 4, dx: 20, dy: 20, n: 8, angulo: 360, rotar: true, centro: "seleccion", m: 6, alinear: true }; } }
  function dialogoMatriz() {
    const els = elegidos();
    if (!els.length) { estado("Matriz: primero elegí con la flecha lo que querés repetir"); return false; }
    const o = opcionesMatriz();
    const campo = (id, nombre, v, extra = "") => `<label style="display:flex;justify-content:space-between;gap:10px;align-items:center">${nombre} <input type="number" id="${id}" value="${v}" ${extra} class="dz-win" style="width:84px"></label>`;
    openModal(`<h2>▦ Matriz</h2>
      <div class="sub">Copias de lo elegido (${els.length} elemento${els.length > 1 ? "s" : ""}), como la matriz de AutoCAD. Un solo Ctrl+Z las saca.</div>
      <div role="radiogroup" aria-label="Tipo de matriz" style="display:flex;gap:6px;margin:12px 0">
        ${[["rect", "▦ Rectangular"], ["polar", "◎ Polar"], ["trayecto", "∿ En trayecto"]].map(([v, n]) => `<label class="ghost" style="flex:1;text-align:center;padding:6px;border:1px solid var(--line,#444);border-radius:8px"><input type="radio" name="matrizTipo" value="${v}" ${o.tipo === v ? "checked" : ""}> ${n}</label>`).join("")}
      </div>
      <div data-matriz="rect" style="display:grid;gap:6px">${campo("mzFilas", "Filas", o.filas, 'min="1" max="200"')}${campo("mzCols", "Columnas", o.cols, 'min="1" max="200"')}${campo("mzDx", "Entre columnas (mm)", o.dx, 'step="0.5"')}${campo("mzDy", "Entre filas (mm)", o.dy, 'step="0.5"')}</div>
      <div data-matriz="polar" style="display:grid;gap:6px">${campo("mzN", "Cantidad (con el original)", o.n, 'min="2" max="360"')}${campo("mzAng", "Ángulo a cubrir (°)", o.angulo, 'min="-360" max="360"')}
        <label><input type="checkbox" id="mzRotar" ${o.rotar ? "checked" : ""}> Girar cada copia (como los rayos de una rueda)</label>
        <label style="display:flex;justify-content:space-between;gap:10px">Centro <select id="mzCentro" class="langsel"><option value="seleccion" ${o.centro === "seleccion" ? "selected" : ""}>El de lo elegido</option><option value="clic" ${o.centro === "clic" ? "selected" : ""}>Un clic en la hoja</option></select></label></div>
      <div data-matriz="trayecto" style="display:grid;gap:6px">${campo("mzM", "Cantidad", o.m, 'min="2" max="500"')}
        <label><input type="checkbox" id="mzAlinear" ${o.alinear ? "checked" : ""}> Alinear con el trayecto</label>
        <div class="sub">El trayecto es lo ÚLTIMO que elegiste (con Shift): lo demás se reparte a lo largo.</div></div>
      <div class="row" style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="ghost" id="mzCancelar">Cancelar</button><button id="mzHacer">Hacer la matriz</button></div>`);
    const mostrar = () => { const t = doc.querySelector('input[name="matrizTipo"]:checked')?.value || "rect"; for (const b of doc.querySelectorAll("[data-matriz]")) b.hidden = b.getAttribute("data-matriz") !== t; };
    for (const r of doc.querySelectorAll('input[name="matrizTipo"]')) r.onchange = mostrar;
    mostrar();
    doc.querySelector("#mzCancelar").onclick = () => global.closeModal?.();
    doc.querySelector("#mzHacer").onclick = () => {
      const v = (id) => Number(doc.querySelector("#" + id)?.value);
      const op = { tipo: doc.querySelector('input[name="matrizTipo"]:checked')?.value || "rect", filas: v("mzFilas"), cols: v("mzCols"), dx: v("mzDx"), dy: v("mzDy"),
        n: v("mzN"), angulo: v("mzAng"), rotar: !!doc.querySelector("#mzRotar")?.checked, centro: doc.querySelector("#mzCentro")?.value || "seleccion", m: v("mzM"), alinear: !!doc.querySelector("#mzAlinear")?.checked };
      try { almacen()?.setItem(CLAVE_MATRIZ, JSON.stringify(op)); } catch (_) { /* sin almacenamiento */ }
      global.closeModal?.();
      if (op.tipo === "polar" && op.centro === "clic") { empezarModo({ tipo: "centro", listo: (c) => hacerMatriz(els, { ...op, c }) }, "Matriz polar: hacé clic donde va el centro (Esc: cancelar)"); return; }
      hacerMatriz(els, op);
    };
    return true;
  }
  function hacerMatriz(els, op) {
    els = els.filter((e) => e.isConnected);
    if (!els.length) return [];
    const nuevos = [], lim = (x, a, b, d) => (Number.isFinite(x) ? Math.max(a, Math.min(b, Math.round(x))) : d);
    global.dzSnapshot?.();
    if (op.tipo === "rect") {
      const F = lim(op.filas, 1, 200, 1), C = lim(op.cols, 1, 200, 1), dx = (Number(op.dx) || 0) * PX_POR_MM, dy = (Number(op.dy) || 0) * PX_POR_MM;
      if (F * C > 2000) { estado("Matriz: son demasiadas copias (más de 2000)"); return []; }
      for (const el of els) {
        let ancla = el;
        for (let i = 0; i < F; i++) for (let j = 0; j < C; j++) {
          if (!i && !j) continue;
          const t = aPadre(el, j * dx, i * dy).v;
          const c = copia(el, `translate(${t[0].toFixed(2)} ${t[1].toFixed(2)})`);
          ancla.parentNode.insertBefore(c, ancla.nextSibling); ancla = c; nuevos.push(c);
        }
      }
    } else if (op.tipo === "polar") {
      const N = lim(op.n, 2, 360, 8), A = Number.isFinite(op.angulo) ? op.angulo : 360, paso = Math.abs(Math.abs(A) - 360) < 1e-6 ? A / N : A / (N - 1);
      const centro = op.c || centroDe(els), ref = centroDe(els);
      for (const el of els) {
        let ancla = el;
        for (let k = 1; k < N; k++) {
          const ang = paso * k, cp = aPadre(el, 0, 0, centro[0], centro[1]).p;
          let extra;
          if (op.rotar) extra = `rotate(${ang.toFixed(3)} ${cp[0].toFixed(2)} ${cp[1].toFixed(2)})`;
          else {
            // sin girar: cada copia se TRASLADA a donde caería su centro girado
            const r = (ang * Math.PI) / 180, vx = ref[0] - centro[0], vy = ref[1] - centro[1];
            const nx = centro[0] + vx * Math.cos(r) - vy * Math.sin(r), ny = centro[1] + vx * Math.sin(r) + vy * Math.cos(r);
            const t = aPadre(el, nx - ref[0], ny - ref[1]).v; extra = `translate(${t[0].toFixed(2)} ${t[1].toFixed(2)})`;
          }
          const c = copia(el, extra);
          ancla.parentNode.insertBefore(c, ancla.nextSibling); ancla = c; nuevos.push(c);
        }
      }
    } else {
      // EN TRAYECTO: el trayecto es el último elegido; lo demás se reparte
      const camino = D()?.sel && els.includes(D().sel) ? D().sel : els[els.length - 1], items = els.filter((x) => x !== camino);
      const g = camino && geometria(camino);
      if (!g || !items.length) { estado("Matriz en trayecto: elegí lo que se repite y, con Shift, por último la línea que hace de trayecto"); return []; }
      const P = g.cerrada ? [...g.P, g.P[0]] : g.P, s = [0];
      for (let i = 1; i < P.length; i++) s.push(s[i - 1] + dist(P[i], P[i - 1]));
      const total = s[s.length - 1], M = lim(op.m, 2, 500, 6);
      const enLargo = (L) => { let i = 1; while (i < P.length - 1 && s[i] < L) i++; const d = s[i] - s[i - 1] || 1, t = Math.max(0, Math.min(1, (L - s[i - 1]) / d)); return { p: [P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t], ang: Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]) }; };
      const ref = centroDe(items), a0 = enLargo(0).ang;
      for (const el of items) {
        let ancla = el;
        for (let k = 0; k < M; k++) {
          const q = enLargo((total * k) / (g.cerrada ? M : M - 1));
          const t = aPadre(el, q.p[0] - ref[0], q.p[1] - ref[1]).v;
          let extra = `translate(${t[0].toFixed(2)} ${t[1].toFixed(2)})`;
          if (op.alinear) { const cp = aPadre(el, 0, 0, ref[0], ref[1]).p, gr = ((q.ang - a0) * 180) / Math.PI; extra += ` rotate(${gr.toFixed(3)} ${cp[0].toFixed(2)} ${cp[1].toFixed(2)})`; }
          const c = copia(el, extra);
          ancla.parentNode.insertBefore(c, ancla.nextSibling); ancla = c; nuevos.push(c);
        }
      }
    }
    if (!nuevos.length) { estado("Matriz: no salió ninguna copia"); return []; }
    elegir(nuevos);
    global.dzMarkDirty?.(); global.dzBuildLayers?.();
    estado(`Matriz ${op.tipo === "rect" ? "rectangular" : op.tipo === "polar" ? "polar" : "en trayecto"}: ${nuevos.length} copia(s) · Ctrl+Z la(s) saca`);
    ultimoComando = "MATRIZ";
    return nuevos;
  }

  /* ══ IGUALAR PROPIEDADES ══ */
  const PROPS = ["stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-dashoffset", "stroke-linecap", "stroke-linejoin", "opacity", "fill-opacity", "filter", "data-low-style"];
  const esCinta = (el) => el.hasAttribute("data-low-brush-points") || (el.getAttribute("data-low") === "brush" && (el.getAttribute("fill") || "none") !== "none");
  const colorDeLinea = (el) => (esCinta(el) ? el.getAttribute("fill") : el.getAttribute("stroke"));
  function igualar(fuente, destino) {
    const hojas = (el) => ((el.tagName || "").toLowerCase() === "g" ? [...el.querySelectorAll("path,line,polyline,polygon,rect,circle,ellipse")] : [el]);
    const f = hojas(fuente)[0]; if (!f) return;
    global.dzSnapshot?.();
    let n = 0;
    for (const t of hojas(destino)) {
      const color = colorDeLinea(f);
      if (esCinta(f) === esCinta(t)) {
        for (const a of PROPS) { if (f.hasAttribute(a)) t.setAttribute(a, f.getAttribute(a)); else if (a !== "data-low-style") t.removeAttribute(a); }
        if (esCinta(t) || (f.getAttribute("fill") || "none") !== "none" || (t.getAttribute("fill") || "none") !== "none") { if (f.hasAttribute("fill")) t.setAttribute("fill", f.getAttribute("fill")); }
      } else {
        // de cinta (pincel) a línea, o al revés: pasan el color de línea y la opacidad
        if (color) { if (esCinta(t)) t.setAttribute("fill", color); else t.setAttribute("stroke", color); }
        for (const a of ["opacity", "filter"]) { if (f.hasAttribute(a)) t.setAttribute(a, f.getAttribute(a)); else t.removeAttribute(a); }
      }
      n++;
    }
    global.dzMarkDirty?.(); global.dzBuildLayers?.();
    estado(`Igualar propiedades: ${n} pieza(s) igualadas · seguí tocando (Esc o Enter termina)`);
  }
  function comenzarIgualar() {
    const d = D(), f = d?.sel?.isConnected ? d.sel : null;
    if (!f) { estado("Igualar propiedades: primero elegí con la flecha el elemento que da sus propiedades"); return false; }
    empezarModo({ tipo: "igualar", fuente: f }, "Igualar propiedades: tocá los elementos que toman el color, el grosor y el trazo de lo elegido (Esc o Enter termina)");
    ultimoComando = "MA";
    return true;
  }

  /* ══ LA LÍNEA DE COMANDOS (la barra de abajo, como la de AutoCAD) ══ */
  let ultimoComando = null;
  const ALIAS = {
    O: "DESFASE", DESFASE: "DESFASE", OFFSET: "DESFASE", EQ: "DESFASE", EQDIST: "DESFASE",
    AR: "MATRIZ", MATRIZ: "MATRIZ", ARRAY: "MATRIZ",
    MA: "IGUALARPROP", IGUALARPROP: "IGUALARPROP", MATCHPROP: "IGUALARPROP", IGUALAR: "IGUALARPROP",
    REFENT: "REFENT", OSNAP: "REFENT", OS: "REFENT", REF: "REFENT",
    F3: "F3",
    PAR: "PARALELAS", PARALELAS: "PARALELAS",
    "?": "AYUDA", AYUDA: "AYUDA", COMANDOS: "AYUDA",
  };
  /** Corre un comando de AutoCAD; devuelve true si lo entendió. */
  function comando(texto) {
    const partes = String(texto || "").trim().split(/\s+/), cab = (partes[0] || "").toUpperCase().replace(/^_/, ""), c = ALIAS[cab];
    if (!c) return false;
    const arg = partes[1] != null ? Number(String(partes[1]).replace(",", ".")) : NaN;
    if (c !== "AYUDA") ultimoComando = partes.join(" ");
    switch (c) {
      case "DESFASE": comenzarDesfase(arg); break;
      case "MATRIZ": dialogoMatriz(); break;
      case "IGUALARPROP": comenzarIgualar(); break;
      case "REFENT": dialogoRefent(); break;
      case "F3": ponerRefent(!refentActivo()); break;
      case "PARALELAS": global.dzParalelasToggle?.(); break;
      case "AYUDA":
        estado("Comandos: O (desfase, «O 6» = 6 mm) · AR (matriz) · MA (igualar propiedades) · REFENT (referencias a objetos) · F3 · PAR (paralelas) · Enter vacío repite el último");
        break;
      default: return false;
    }
    return true;
  }
  function engancharLineaDeComandos() {
    const correr = (ta, e) => {
      const txt = ta.value.trim();
      const t = txt || ultimoComando || "";
      if (!t || !ALIAS[(t.split(/\s+/)[0] || "").toUpperCase().replace(/^_/, "")]) return false;
      e.preventDefault(); e.stopImmediatePropagation();
      ta.value = "";
      comando(t);
      ta.blur?.();
      return true;
    };
    global.addEventListener("keydown", (e) => {
      const ta = e.target;
      if (!ta || ta.id !== "dzPrompt" || e.key !== "Enter" || e.shiftKey) return;
      correr(ta, e);
    }, true);
    global.addEventListener("click", (e) => {
      if (!e.target.closest || !e.target.closest("#dzSend")) return;
      const ta = doc.querySelector("#dzPrompt"); if (ta && ta.value.trim()) correr(ta, e);
    }, true);
  }

  global.dzRefentToggle = () => ponerRefent(!refentActivo());
  global.dzComandoCad = comando;
  global.LOW = global.LOW || {};
  global.LOW.drawing = global.LOW.drawing || {};
  global.LOW.drawing.autocad = {
    comando, buscar, geometria, desplazarPolilinea, hacerDesfase, hacerMatriz, igualar, ponerRefent, refentActivo,
    modos: () => ({ ...modos }), ponerModos: (m) => { modos = { ...modos, ...m }; }, PX_POR_MM,
  };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(typeof window !== "undefined" ? window : globalThis);
