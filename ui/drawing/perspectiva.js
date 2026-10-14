/* ══ 📐 PERSPECTIVA: PUNTOS DE FUGA PARA DIBUJAR FONDOS ═════════════════════
   Pedido de Mauro: «un sistema de guías de puntos de fuga pensado para dibujar
   layouts de fondos —ciudad, casas— en el 2D», vinculado con el estudio 3D.

   Es la regla de perspectiva de Clip Studio / los asistentes de Krita, con lo
   que ya se sabe que funciona:
   - 1, 2 o 3 PUNTOS DE FUGA guardados con la escena (`scene.perspective`). El
     horizonte es la recta por el 1 y el 2 (horizontal si hay uno solo).
   - En la mesa se ven el horizonte y un abanico de rectas por punto. Con la
     barra abierta se ARRASTRAN los puntos y el horizonte (los dos primeros
     comparten la altura de los ojos: mover uno de arriba abajo mueve el otro).
   - v3.29.2: la Línea y las figuras también (las figuras, sobre un plano de la
     perspectiva); flecha en el borde para los puntos fuera de la vista; imán
     por punto; Tab cambia de fuga en medio del trazo; «Fuga con 2 líneas».
   - IMÁN: el lápiz y el pincel siguen la recta hacia el punto de fuga que mejor
     coincide con hacia dónde arrancó el trazo; con 1 o 2 puntos también las
     verticales, y con 1 punto las horizontales. Si el trazo arranca lejos de
     toda dirección (>22°), queda libre: un árbol o una nube no se imantan.
     Shift sigue siendo la recta a 15° de siempre.
   - La Regla (U) usa los mismos puntos: clic derecho agrega uno a la escena.
   - Las guías son de pantalla (`.dz-penui`): nunca entran en el dibujo guardado.

   El estudio 3D manda acá los puntos de su cámara («Mandar al 2D»), así el
   dibujo encima del layout se imanta a la perspectiva exacta del 3D. */
(function (global) {
  "use strict";

  const COLORES = ["#F0450E", "#33B5E8", "#2ecc71"];
  const HORIZONTE = "#FFB000";
  const ANG_LIBRE = 22 * Math.PI / 180;     // más lejos que esto de toda dirección: libre
  const ARRANQUE_PX = 7;                    // cuánto hay que moverse para empezar a decidir
  const FIJAR_PX = 24;                      // desde acá la dirección queda fija
  const AGARRE_PX = 11;                     // radio para agarrar un punto con el mouse

  let editando = false;                     // la barra abierta: puntos arrastrables
  let marcando = false;                     // «Líneas desde un punto»: el clic marca un punto
  let barra = null, arrastre = null, docOido = null;

  const escena = () => (typeof DZ !== "undefined" && DZ.doc && DZ.doc.scene) || null;
  const svgDibujo = () => document.querySelector("#dzCanvas > svg");
  function datos() {
    const sc = escena();
    return sc && sc.perspective && sc.perspective.vps && sc.perspective.vps.length ? sc.perspective : null;
  }
  /** Píxeles de pantalla por unidad del lienzo (con zoom y giro). */
  function escala(svg) {
    const m = svg && svg.getScreenCTM && svg.getScreenCTM();
    return m ? Math.hypot(m.a, m.b) || 1 : 1;
  }
  const aPantalla = (svg, p) => {
    const m = svg.getScreenCTM(); if (!m) return { x: p.x, y: p.y };
    return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f };
  };
  const SVGNS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, padre) {
    const n = document.createElementNS(SVGNS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (padre) padre.appendChild(n);
    return n;
  }

  /* ── el horizonte: recta por el 1 y el 2, o horizontal por el 1 ── */
  function horizonte(p) {
    const hz = p.vps.filter((v) => v.eje !== "y");
    if (!hz.length) return null;                 // mirando derecho abajo o arriba: no hay horizonte
    const a = hz[0], b = hz[1];
    if (!b || Math.hypot(b.x - a.x, b.y - a.y) < 1e-6) return { a, ux: 1, uy: 0 };
    const n = Math.hypot(b.x - a.x, b.y - a.y);
    return { a, ux: (b.x - a.x) / n, uy: (b.y - a.y) / n };
  }

  /* ── dibujar las guías (dentro del svg: siguen el zoom y el giro gratis) ── */
  function pintar() {
    oirDocumento();
    const svg = svgDibujo();
    if (!svg) return;
    let g = svg.querySelector(":scope > g[data-low='perspectiva']");
    const p = datos();
    pintarFlechas(p);
    if (!p || !(p.visible || editando)) { if (g) g.remove(); return; }
    if (!g) {
      g = el("g", { "data-low": "perspectiva", class: "dz-penui dz-perspectiva", "pointer-events": "none" });
    }
    while (g.firstChild) g.firstChild.remove();
    const sc = escena(), W = sc.width || 1920, H = sc.height || 1080;
    const k = escala(svg), L = (W + H) * 6;
    const fino = { "vector-effect": "non-scaling-stroke", fill: "none" };
    // el abanico: de cada punto hacia el borde del cuadro (un poco agrandado)
    const borde = [];
    const N = 9, mx = W * 0.08, my = H * 0.08;
    for (let i = 0; i <= N; i++) {
      const x = -mx + (W + 2 * mx) * i / N, y = -my + (H + 2 * my) * i / N;
      borde.push([x, -my], [x, H + my], [-mx, y], [W + mx, y]);
    }
    p.vps.forEach((v, i) => {
      const color = colorDe(v, i);
      const capa = el("g", { stroke: color, opacity: editando ? "0.42" : "0.3", ...fino }, g);
      const vistos = new Set();
      for (const [bx, by] of borde) {
        const dx = bx - v.x, dy = by - v.y, n = Math.hypot(dx, dy);
        if (n < 1e-6) continue;
        const clave = Math.round(Math.atan2(dy, dx) * 180);   // sin rectas repetidas
        if (vistos.has(clave)) continue; vistos.add(clave);
        el("line", { x1: v.x, y1: v.y, x2: v.x + dx / n * L, y2: v.y + dy / n * L, "stroke-width": "1", "vector-effect": "non-scaling-stroke" }, capa);
      }
    });
    const h = horizonte(p);
    if (h) el("line", { x1: h.a.x - h.ux * L, y1: h.a.y - h.uy * L, x2: h.a.x + h.ux * L, y2: h.a.y + h.uy * L,
      stroke: HORIZONTE, "stroke-width": editando ? "2" : "1.4", opacity: "0.85", "data-p": "horizonte", ...fino }, g);
    // «Líneas desde un punto»: de cada punto de fuga, pasando EXACTO por el punto marcado
    if ((p.lineas || []).length) {
      const cons = el("g", { "data-p": "lineas", opacity: "0.85", ...fino }, g);
      for (const q of p.lineas) {
        for (const u of direcciones(p, q.x, q.y)) {
          el("line", { x1: q.x - u.ux * L, y1: q.y - u.uy * L, x2: q.x + u.ux * L, y2: q.y + u.uy * L,
            stroke: u.color, "stroke-width": "1.2", "stroke-dasharray": "7 4", "vector-effect": "non-scaling-stroke" }, cons);
        }
        el("circle", { cx: q.x, cy: q.y, r: 4 / k, fill: "#fff", stroke: HORIZONTE, "stroke-width": "2", "vector-effect": "non-scaling-stroke" }, cons);
      }
    }
    if (editando) {
      const r = 7 / k;
      p.vps.forEach((v, i) => {
        const color = colorDe(v, i);
        el("circle", { cx: v.x, cy: v.y, r: r * 1.6, fill: color, opacity: "0.18", stroke: "none" }, g);
        el("circle", { cx: v.x, cy: v.y, r, fill: "#fff", stroke: color, "stroke-width": "2.5", "data-p": "vp" + i, "vector-effect": "non-scaling-stroke" }, g);
        const t = el("text", { x: v.x + r * 1.5, y: v.y - r * 1.3, fill: color, "font-size": 13 / k,
          "font-family": "Figtree, sans-serif", "font-weight": "700" }, g);
        t.textContent = v.eje ? v.eje.toUpperCase() : String(i + 1);
      });
    }
    if (g.parentNode !== svg || svg.lastElementChild !== g) svg.appendChild(g);
  }

  /* ── flechas en el borde: los puntos que quedan fuera de la vista ──
     MEDIDO en v3.29.1: con el zoom de siempre, los dos puntos del preset de 2
     quedaban fuera de la pantalla —no se veían ni se podían agarrar—. Ahora
     cada punto afuera tiene una flecha en el borde de la mesa, en la dirección
     en que está, y arrastrarla mueve el punto (con su Ctrl+Z). */
  function pintarFlechas(p) {
    const mesa = document.getElementById("dzCanvas"), svg = svgDibujo();
    const todas = Array.from(document.querySelectorAll(".lowpersp-fuera"));
    const ver = p && (p.visible || editando) && mesa && svg && !mesa.closest("[hidden]");
    if (!ver) { todas.forEach((f) => { f.hidden = true; }); return; }
    const r = mesa.getBoundingClientRect();
    if (!r.width || !r.height) { todas.forEach((f) => { f.hidden = true; }); return; }
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2, M = 18;
    // la hoja RECORTA (overflow hidden): un punto fuera de la hoja no se dibuja
    // aunque caiga dentro de la mesa. MEDIDO a 1000×560: los dos puntos del
    // preset de 2 caían ahí, invisibles.
    const h = svg.getBoundingClientRect(), recorta = getComputedStyle(svg).overflow !== "visible";
    const seVe = (s) => s.x >= r.left && s.x <= r.right && s.y >= r.top && s.y <= r.bottom &&
      (!recorta || (s.x >= h.left && s.x <= h.right && s.y >= h.top && s.y <= h.bottom));
    todas.forEach((f) => { if (+f.dataset.vp >= p.vps.length) f.hidden = true; });
    p.vps.forEach((v, i) => {
      let f = document.querySelector(`.lowpersp-fuera[data-vp="${i}"]`);
      const s = aPantalla(svg, v);
      if (seVe(s)) { if (f) f.hidden = true; return; }
      const enMesa = s.x >= r.left + M && s.x <= r.right - M && s.y >= r.top + M && s.y <= r.bottom - M;
      if (!f) {
        f = document.createElement("button");
        f.type = "button"; f.className = "lowpersp-fuera"; f.dataset.vp = String(i);
        f.innerHTML = '<span class="lowpersp-flecha" aria-hidden="true"></span><b></b>';
        f.addEventListener("pointerdown", (e) => { if (e.button === 0) empezarArrastre(e, +f.dataset.vp); });
        document.body.appendChild(f);
      }
      // dentro de la mesa (pero fuera de la hoja): la agarradera va EN el punto;
      // fuera de la mesa: flecha en el borde, en la dirección del punto
      const dx = s.x - cx, dy = s.y - cy;
      let x = s.x, y = s.y;
      if (!enMesa) {
        const tx = dx ? ((dx > 0 ? r.right - M : r.left + M) - cx) / dx : Infinity;
        const ty = dy ? ((dy > 0 ? r.bottom - M : r.top + M) - cy) / dy : Infinity;
        const t = Math.min(tx, ty);
        x = cx + dx * t; y = cy + dy * t;
      }
      f.classList.toggle("en-sitio", enMesa);
      f.style.left = x + "px"; f.style.top = y + "px";
      f.style.setProperty("--ang", Math.atan2(dy, dx) + "rad");
      f.style.setProperty("--fuga", colorDe(v, i));
      const nombre = v.eje ? v.eje.toUpperCase() : String(i + 1);
      f.querySelector("b").textContent = nombre;
      f.title = "Punto de fuga " + nombre + (enMesa ? ", fuera de la hoja" : ", fuera de la vista") + " · arrastrá para moverlo";
      f.setAttribute("aria-label", f.title);
      f.hidden = false;
    });
  }

  /** Se repinta cuando el lienzo cambia (otro cuadro, otro documento): la capa
   *  de guías vive dentro del svg y se va con él. Sale enseguida si no hay nada. */
  let pendiente = false;
  function vigilar() {
    const mesa = document.getElementById("dzCanvas");
    if (!mesa) return;
    new MutationObserver(() => {
      if (pendiente) return;
      const p = datos();
      const svg = svgDibujo();
      if (!svg) return;
      const tiene = !!svg.querySelector(":scope > g[data-low='perspectiva']");
      if ((p && (p.visible || editando)) === tiene && (!tiene || svg.lastElementChild === svg.querySelector(":scope > g[data-low='perspectiva']"))) return;
      pendiente = true;
      requestAnimationFrame(() => { pendiente = false; pintar(); });
    }).observe(mesa, { childList: true, subtree: true });
  }

  /** El Ctrl+Z de la perspectiva la cambia en el modelo: hay que repintar. */
  function oirDocumento() {
    const doc = typeof DZ !== "undefined" ? DZ.doc : null;
    if (!doc || doc === docOido || typeof doc.subscribe !== "function") return;
    docOido = doc;
    doc.subscribe((d, motivo) => { if (motivo === "perspective") { pintar(); sincronizarBarra(); } });
  }

  /* ── cambiar la perspectiva (con deshacer) ── */
  function guardar(nueva, label, before) {
    const doc = typeof DZ !== "undefined" ? DZ.doc : null;
    if (!doc || typeof doc.setPerspective !== "function") return false;
    const r = doc.setPerspective(nueva, { label, before });
    if (typeof global.dzMarkDirty === "function") global.dzMarkDirty();
    pintar(); sincronizarBarra();
    return r;
  }
  const copia = (p) => JSON.parse(JSON.stringify(p || { vps: [] }));

  /** Puntos típicos para arrancar, a la altura de los ojos de un adulto sobre
   *  el cuadro (42 % del alto). Los de 2 puntos quedan FUERA del cuadro, que es
   *  lo que evita la distorsión de los bordes. */
  function preset(n) {
    const sc = escena();
    if (!sc) return dzAviso("Abrí un documento de animación para usar la perspectiva");
    const W = sc.width || 1920, H = sc.height || 1080, y = Math.round(H * 0.42);
    const vps = n === 1 ? [{ x: W / 2, y }]
      : n === 2 ? [{ x: -0.3 * W, y }, { x: 1.3 * W, y }]
      : [{ x: -0.3 * W, y }, { x: 1.3 * W, y }, { x: W / 2, y: Math.round(H * 2.6) }];
    const antes = sc.perspective || {};
    const base = copia(antes); delete base.paralelas; delete base.camara;
    guardar({ ...base, vps, visible: true, iman: antes.iman !== false, origen: "manual" },
      "Perspectiva de " + n + (n === 1 ? " punto" : " puntos"));
    dzAviso(n === 1 ? "Perspectiva de 1 punto: calles y pasillos de frente"
      : n === 2 ? "Perspectiva de 2 puntos: esquinas de casas y edificios"
      : "Perspectiva de 3 puntos: edificios vistos desde arriba");
  }
  function dzAviso(t) { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); }

  /* ── el imán: lápiz, pincel, Línea y figuras ──
     Una FAMILIA es un juego de rectas de la perspectiva: las que van a un punto
     de fuga, o las paralelas (verticales, horizontales, las del 3D). Cada una
     tiene una clave estable, para poder decir «la misma» o «la siguiente». */
  function familias(p) {
    const out = [];
    p.vps.forEach((v, i) => { if (v.iman !== false) out.push({ clave: "vp" + i, vp: v, color: colorDe(v, i) }); });
    if (Array.isArray(p.paralelas)) {                                           // del estudio 3D
      p.paralelas.forEach((u, k) => out.push({ clave: "par" + k, ux: u.ux, uy: u.uy, color: Math.abs(u.ux) < Math.abs(u.uy) ? "#9aa0a6" : HORIZONTE }));
    } else {
      if (p.vps.length < 3) out.push({ clave: "vert", ux: 0, uy: 1, color: "#9aa0a6" });     // verticales
      if (p.vps.length === 1) out.push({ clave: "hor", ux: 1, uy: 0, color: HORIZONTE });    // horizontales
    }
    return out;
  }
  /** La dirección de una familia en el punto (sx, sy). null si el punto ES el de fuga. */
  function enPunto(f, sx, sy) {
    if (!f.vp) return { clave: f.clave, ux: f.ux, uy: f.uy, color: f.color };
    const dx = f.vp.x - sx, dy = f.vp.y - sy, n = Math.hypot(dx, dy);
    return n > 1e-6 ? { clave: f.clave, ux: dx / n, uy: dy / n, color: f.color } : null;
  }
  function direcciones(p, sx, sy) { return familias(p).map((f) => enPunto(f, sx, sy)).filter(Boolean); }
  const colorDe = (v, i) => v.color || COLORES[i] || COLORES[0];
  /** Las direcciones en (sx, sy) ordenadas por cuánto se parecen a (dx, dy). */
  function ordenadas(p, sx, sy, dx, dy) {
    const d = Math.hypot(dx, dy) || 1;
    return direcciones(p, sx, sy)
      .map((u) => ({ u, ang: Math.acos(Math.min(1, Math.abs(dx * u.ux + dy * u.uy) / d)) }))
      .sort((a, b) => a.ang - b.ang);
  }
  /** Decide hacia dónde va un gesto que arrancó en (sx, sy) y está en (x, y).
   *  La dirección es PROVISORIA hasta FIJAR_PX: se mide del arranque al punto
   *  actual (no del primer tramito, que con el pulso temblando apunta a
   *  cualquier lado). Después queda fija; Tab la cambia (`cambiarFuga`).
   *  Devuelve { dir, cambio } o null si no hay perspectiva con imán. */
  function elegir(st, sx, sy, x, y) {
    const p = datos();
    if (!p || !p.iman) return null;
    st.sx = sx; st.sy = sy; st.x = x; st.y = y;
    if (st.fijo) return { dir: st.dir, cambio: false };
    const dx = x - sx, dy = y - sy, px = Math.hypot(dx, dy) * escala(svgDibujo());
    if (px < ARRANQUE_PX && st.dir === undefined) return { dir: undefined, cambio: false };   // todavía no se sabe
    const o = px > 0 ? ordenadas(p, sx, sy, dx, dy) : [];
    const dir = o.length && o[0].ang <= ANG_LIBRE ? o[0].u : null;
    const cambio = (dir && dir.clave) !== (st.dir && st.dir.clave);
    st.dir = dir;
    if (px >= FIJAR_PX) st.fijo = true;
    if (dir) mostrarGuia(sx, sy, dir); else ocultarGuia();
    return { dir, cambio };
  }
  const proyectar = (sx, sy, u, x, y) => { const k = (x - sx) * u.ux + (y - sy) * u.uy; return { x: sx + k * u.ux, y: sy + k * u.uy }; };
  /** Tab en medio del gesto: la fuga siguiente, por parecido a lo dibujado.
   *  Cerca del horizonte las rectas de dos puntos casi coinciden y el imán no
   *  tiene cómo adivinar cuál se quería: esto le deja la decisión a quien dibuja. */
  function siguienteDireccion(st) {
    const p = datos(); if (!p || st.sx == null) return null;
    const o = ordenadas(p, st.sx, st.sy, st.x - st.sx, st.y - st.sy);
    if (!o.length) return null;
    const i = st.dir ? o.findIndex((c) => c.u.clave === st.dir.clave) : -1;
    st.dir = o[(i + 1) % o.length].u; st.fijo = true;
    mostrarGuia(st.sx, st.sy, st.dir);
    return st.dir;
  }
  /** Lápiz y pincel: proyecta el punto y, si la dirección cambió, también lo ya dibujado. */
  function imantar(track, x, y) {
    const st = track._pp || (track._pp = { dir: undefined, fijo: false });
    const r = elegir(st, track.startX, track.startY, x, y);
    if (!r) return null;
    if (r.dir === undefined) return { x: track.startX, y: track.startY };   // nada torcido mientras se decide
    if (r.dir && r.cambio) reproyectar(track, r.dir);
    return r.dir ? proyectar(track.startX, track.startY, r.dir, x, y) : null;
  }
  function reproyectar(track, u) {
    for (const pt of track.pts) {
      const k = (pt[0] - track.startX) * u.ux + (pt[1] - track.startY) * u.uy;
      pt[0] = track.startX + k * u.ux; pt[1] = track.startY + k * u.uy;
    }
  }
  const guia = { linea: null };
  function mostrarGuia(sx, sy, u) {
    const svg = svgDibujo();
    if (!svg) return;
    const L = ((escena() && escena().width) || 1920) * 8;
    if (!guia.linea) guia.linea = el("line", { "data-low": "perspectiva-guia", class: "dz-penui", "stroke-dasharray": "6 5",
      "stroke-width": "1.5", "vector-effect": "non-scaling-stroke", opacity: "0.9", "pointer-events": "none" });
    guia.linea.setAttribute("stroke", u.color);
    guia.linea.setAttribute("x1", sx - u.ux * L); guia.linea.setAttribute("y1", sy - u.uy * L);
    guia.linea.setAttribute("x2", sx + u.ux * L); guia.linea.setAttribute("y2", sy + u.uy * L);
    svg.appendChild(guia.linea);
  }
  function ocultarGuia() { if (guia.linea) guia.linea.remove(); }

  function envolverTrazo() {
    const agregar = global._drawAddPoint, fin = global._drawFinish, cancelar = global._drawCancel;
    if (typeof agregar !== "function" || agregar._perspectiva) return;
    global._drawAddPoint = function (track, x, y, pr, meta) {
      if (track && !track.shiftPressed && (track.mode === "pencil" || track.mode === "brush")) {
        const q = imantar(track, x, y);
        if (q) { x = q.x; y = q.y; }
      }
      return agregar.call(this, track, x, y, pr, meta);
    };
    global._drawAddPoint._perspectiva = true;
    if (typeof fin === "function") global._drawFinish = function () {
      // el trazo termina donde se levantó el lápiz (cerrarEnElPuntero): esa
      // última punta también va a la recta, si no el final se tuerce
      const t = typeof DRAW_TRACK !== "undefined" ? DRAW_TRACK : null;
      if (t && t._pp && t._pp.dir) reproyectar(t, t._pp.dir);
      ocultarGuia();
      return fin.apply(this, arguments);
    };
    if (typeof cancelar === "function") global._drawCancel = function () { ocultarGuia(); return cancelar.apply(this, arguments); };
  }

  /* ── la Línea y las figuras ──
     MEDIDO en v3.29.1: con 2 puntos de fuga la Línea y el Rectángulo salían con
     los mismos 8° con que se los tiraba; sólo el lápiz y el pincel fugaban. Como
     en Clip Studio, ahora:
     - la Línea elige su fuga igual que el lápiz (y Tab la cambia);
     - el Rectángulo, la Elipse, el Círculo, el Polígono y la Estrella se dibujan
       SOBRE UN PLANO de la perspectiva: el gesto va de una esquina a la opuesta
       y los otros dos vértices salen de cruzar las rectas de las dos fugas del
       plano. La Elipse queda inscripta en ese cuadrilátero (homografía del
       cuadrado al cuadrilátero), que es como se ve un círculo en el piso.
     Shift sigue siendo lo de siempre (proporcionado, 45°): una salida sin
     perspectiva, igual que en el lápiz. */
  function cruce(p, u, q, w) {
    const den = u.ux * w.uy - u.uy * w.ux;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((q.x - p.x) * w.uy - (q.y - p.y) * w.ux) / den;
    return { x: p.x + t * u.ux, y: p.y + t * u.uy };
  }
  function convexo(q) {
    let signo = 0;
    for (let i = 0; i < 4; i++) {
      const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
      const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (Math.abs(z) < 1e-6) return false;
      if (!signo) signo = Math.sign(z); else if (Math.sign(z) !== signo) return false;
    }
    return true;
  }
  /** El cuadrilátero con A y C opuestos y los lados en las familias fi y fj. */
  function cuadrilatero(fi, fj, A, C) {
    const ai = enPunto(fi, A.x, A.y), aj = enPunto(fj, A.x, A.y), ci = enPunto(fi, C.x, C.y), cj = enPunto(fj, C.x, C.y);
    if (!ai || !aj || !ci || !cj) return null;
    const B = cruce(A, ai, C, cj), D = cruce(A, aj, C, ci);
    if (!B || !D) return null;
    const q = [A, B, C, D], diag = Math.hypot(C.x - A.x, C.y - A.y) || 1;
    // casi paralelas: el cruce se va al infinito y la figura no se puede leer
    if (q.some((v) => Math.hypot(v.x - A.x, v.y - A.y) > diag * 12)) return null;
    return convexo(q) ? q : null;
  }
  /** Los planos posibles para un gesto de A a C, el más probable primero.
   *  Un gesto TENDIDO (diagonal a menos de 45° de la horizontal) va al piso o
   *  al techo: las dos familias que no son verticales. Uno PARADO va a una
   *  pared: la vertical con la fuga que más se parece a la diagonal. */
  function planos(p, A, C) {
    const fs = familias(p);
    const vertical = (f) => { const u = enPunto(f, A.x, A.y); return u && Math.abs(u.uy) > Math.cos(30 * Math.PI / 180); };
    const dx = C.x - A.x, dy = C.y - A.y, d = Math.hypot(dx, dy) || 1, tendido = Math.abs(dy) < Math.abs(dx);
    const pares = [];
    for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) {
      const q = cuadrilatero(fs[i], fs[j], A, C);
      if (!q) continue;
      const nVert = (vertical(fs[i]) ? 1 : 0) + (vertical(fs[j]) ? 1 : 0);
      // qué tanto se parece cada lado a la diagonal: lo más parecido, mejor
      const parecido = Math.max(...[fs[i], fs[j]].map((f) => { const u = enPunto(f, A.x, A.y); return Math.abs(dx * u.ux + dy * u.uy) / d; }));
      const nota = (tendido ? (nVert === 0 ? 2 : 0) : (nVert === 1 ? 2 : 0)) + parecido;
      pares.push({ q, nota, clave: fs[i].clave + "+" + fs[j].clave });
    }
    return pares.sort((a, b) => b.nota - a.nota);
  }
  /** Homografía del cuadrado unidad al cuadrilátero q (A=(0,0), B=(1,0), C=(1,1), D=(0,1)). */
  function homografia(q) {
    const [p0, p1, p2, p3] = q;
    const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
    const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
    const den = dx1 * dy2 - dx2 * dy1;
    const g = den ? (dx3 * dy2 - dx2 * dy3) / den : 0, h = den ? (dx1 * dy3 - dx3 * dy1) / den : 0;
    const a = p1.x - p0.x + g * p1.x, b = p3.x - p0.x + h * p3.x, c = p0.x;
    const d = p1.y - p0.y + g * p1.y, e = p3.y - p0.y + h * p3.y, f = p0.y;
    return (u, v) => { const w = g * u + h * v + 1; return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w }; };
  }
  /** La figura en el cuadrado unidad, como lista de [u, v]. */
  function figuraUnidad(kind) {
    if (kind === "rect") return [[0, 0], [1, 0], [1, 1], [0, 1]];
    if (kind === "ellipse" || kind === "circle") {
      const out = [];
      for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2; out.push([0.5 + 0.5 * Math.cos(a), 0.5 + 0.5 * Math.sin(a)]); }
      return out;
    }
    const lados = kind === "star" ? 10 : 6, out = [];
    for (let i = 0; i < lados; i++) {
      const r = kind === "star" && i % 2 ? 0.5 * 0.45 : 0.5, a = -Math.PI / 2 + i * Math.PI * 2 / lados;
      out.push([0.5 + r * Math.cos(a), 0.5 + r * Math.sin(a)]);
    }
    return out;
  }
  /** Pasa la forma del gesto a un <polygon> (una vez) y le pone los puntos. */
  function formaEnPlano(g, q) {
    if (!g.persp) {
      const pol = document.createElementNS(SVGNS, "polygon");
      for (const k of ["fill", "stroke", "stroke-width", "stroke-linejoin", "stroke-linecap", "style", "class"])
        if (g.el.hasAttribute(k)) pol.setAttribute(k, g.el.getAttribute(k));
      g.el.replaceWith(pol); g.el = pol; g.persp = true;
    }
    const H = homografia(q);
    g.el.setAttribute("points", figuraUnidad(g.kind).map(([u, v]) => { const p = H(u, v); return p.x.toFixed(2) + "," + p.y.toFixed(2); }).join(" "));
  }
  function envolverFormas() {
    const geo = global.dzFormaGeometria, vacia = global.dzFormaVacia, medida = global.dzFormaMedida;
    if (typeof geo !== "function" || geo._perspectiva) return;
    global.dzFormaGeometria = function (g, p, shift, alt) {
      // sólo el gesto de la herramienta (dzFormaDown le pone desdePantalla), con imán y sin Shift
      const persp = datos();
      if (!g || !g.desdePantalla || shift || !persp || !persp.iman) return geo.apply(this, arguments);
      g._ultimo = { p, alt };
      if (g.kind === "line") {
        const st = g._pp || (g._pp = { dir: undefined, fijo: false });
        const r = elegir(st, g.ancla.x, g.ancla.y, p.x, p.y);
        if (r && r.dir === undefined) p = { x: g.ancla.x, y: g.ancla.y };
        else if (r && r.dir) p = proyectar(g.ancla.x, g.ancla.y, r.dir, p.x, p.y);
        return geo.call(this, g, p, false, alt);
      }
      const lista = planos(persp, g.ancla, p);
      // el plano se elige una vez que el gesto tiene tamaño, y después queda (Tab lo cambia)
      if (g._plano == null && Math.hypot(p.x - g.ancla.x, p.y - g.ancla.y) * escala(svgDibujo()) >= FIJAR_PX && lista.length) g._plano = lista[0].clave;
      const elegido = lista.find((x) => x.clave === g._plano) || lista[0];
      if (!elegido) return geo.apply(this, arguments);
      formaEnPlano(g, elegido.q);
      g._planos = lista.map((x) => x.clave);
    };
    global.dzFormaGeometria._perspectiva = true;
    if (typeof vacia === "function") global.dzFormaVacia = function (g) {
      if (!g || !g.persp) return vacia.apply(this, arguments);
      const v = (g.el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number), n = Math.floor(v.length / 2);
      let area = 0;
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += v[2 * i] * v[2 * j + 1] - v[2 * j] * v[2 * i + 1]; }
      return Math.abs(area) / 2 < 0.5;
    };
    if (typeof medida === "function") global.dzFormaMedida = function (g) {
      if (!g || !g.persp) return medida.apply(this, arguments);
      return ({ rect: "Rectángulo", ellipse: "Elipse", circle: "Círculo", poly: "Polígono", star: "Estrella" }[g.kind] || "Forma") + " en perspectiva";
    };
  }
  /** Tab en medio de un gesto con perspectiva: la otra fuga (o el otro plano).
   *  Fuera de un gesto, Tab sigue siendo el modo dibujo. */
  function alTeclear(e) {
    if (e.key !== "Tab" || e.ctrlKey || e.altKey || e.metaKey || !datos()) return;
    const t = typeof DRAW_TRACK !== "undefined" ? DRAW_TRACK : null;
    const f = typeof DZ_FORMA !== "undefined" ? DZ_FORMA : null;
    if (!t && !f) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (t && (t.mode === "pencil" || t.mode === "brush")) {
      const st = t._pp || (t._pp = { dir: undefined, fijo: false });
      if (st.sx == null) return;
      const u = siguienteDireccion(st);
      if (u) { reproyectar(t, u); dzAviso("Fuga cambiada (Tab)"); }
    } else if (f && f._ultimo) {
      if (f.kind === "line") { if (f._pp && f._pp.sx != null) siguienteDireccion(f._pp); }
      else if (f._planos && f._planos.length > 1) f._plano = f._planos[(f._planos.indexOf(f._plano) + 1) % f._planos.length];
      global.dzFormaGeometria(f, f._ultimo.p, false, f._ultimo.alt);
      dzAviso(f.kind === "line" ? "Fuga cambiada (Tab)" : "Plano cambiado (Tab)");
    }
  }

  /* ── arrastrar puntos y horizonte (con la barra abierta) ── */
  const aLienzoDe = (svg) => { const inv = svg.getScreenCTM().inverse(); return (x, y) => ({ x: inv.a * x + inv.c * y + inv.e, y: inv.b * x + inv.d * y + inv.f }); };
  function empezarArrastre(e, cual) {
    const p = datos(), svg = svgDibujo();
    if (!p || !svg) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const aLienzo = aLienzoDe(svg);
    const juntos = p.vps.length >= 2 && Math.abs(p.vps[0].y - p.vps[1].y) < 0.5;
    arrastre = { cual, antes: copia(p), desde: aLienzo(e.clientX, e.clientY), aLienzo, juntos, pid: e.pointerId };
    ocultarGuia();
  }
  /* «Fuga con 2 líneas», como en Clip Studio: se dibujan dos rectas sobre los
     bordes de algo que ya está (una foto, un fondo del 3D) y donde se cruzan
     nace el punto de fuga. Las rectas son de construcción: no quedan en la hoja. */
  let construyendo = null;          // { segs: [{a, b}], actual, capa }
  function capaConstruccion() {
    const svg = svgDibujo(); if (!svg) return null;
    let g = svg.querySelector(":scope > g[data-low='perspectiva-construccion']");
    if (!g) g = el("g", { "data-low": "perspectiva-construccion", class: "dz-penui", "pointer-events": "none" }, svg);
    return g;
  }
  function pintarConstruccion() {
    const g = capaConstruccion(); if (!g) return;
    while (g.firstChild) g.firstChild.remove();
    const L = ((escena() && escena().width) || 1920) * 8;
    for (const s of construyendo ? construyendo.segs.concat(construyendo.actual ? [construyendo.actual] : []) : []) {
      const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, n = Math.hypot(dx, dy) || 1;
      el("line", { x1: s.a.x - dx / n * L, y1: s.a.y - dy / n * L, x2: s.a.x + dx / n * L, y2: s.a.y + dy / n * L, stroke: HORIZONTE,
        "stroke-width": "1", "stroke-dasharray": "5 4", opacity: "0.7", "vector-effect": "non-scaling-stroke" }, g);
      el("line", { x1: s.a.x, y1: s.a.y, x2: s.b.x, y2: s.b.y, stroke: HORIZONTE, "stroke-width": "2.5", "vector-effect": "non-scaling-stroke" }, g);
    }
    if (!construyendo) g.remove();
  }
  function terminarConstruccion() { construyendo = null; pintarConstruccion(); sincronizarBarra(); }
  function construccionLista() {
    const [s1, s2] = construyendo.segs;
    const u = (s) => { const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y, n = Math.hypot(dx, dy); return { ux: dx / n, uy: dy / n }; };
    const q = cruce(s1.a, u(s1), s2.a, u(s2));
    terminarConstruccion();
    if (!q) return dzAviso("Las dos rectas son paralelas: no se cruzan, no hay punto de fuga");
    const sc = escena(); if (!sc) return;
    const p = copia(sc.perspective);
    if ((p.vps || []).length >= 3) return dzAviso("Ya hay 3 puntos de fuga: sacá uno antes de agregar otro");
    p.vps = (p.vps || []).concat([{ x: q.x, y: q.y }]);
    guardar({ ...p, visible: true, iman: p.iman !== false, origen: "manual" }, "Punto de fuga con 2 líneas");
    dzAviso("Punto de fuga " + p.vps.length + " donde se cruzan las dos rectas");
  }
  function agarrar(e) {
    if (!editando || e.button !== 0) return;
    const p = datos(), svg = svgDibujo();
    if (!svg) return;
    if (construyendo) {
      e.preventDefault(); e.stopImmediatePropagation();
      const a = aLienzoDe(svg)(e.clientX, e.clientY);
      construyendo.actual = { a, b: a, pid: e.pointerId, aLienzo: aLienzoDe(svg) };
      pintarConstruccion();
      return;
    }
    if (!p) return;
    const cx = e.clientX, cy = e.clientY;
    let cual = null, mejor = AGARRE_PX;
    p.vps.forEach((v, i) => { const s = aPantalla(svg, v), d = Math.hypot(s.x - cx, s.y - cy); if (d < mejor) { mejor = d; cual = i; } });
    if (cual === null) {
      // ¿sobre el horizonte? (distancia a la recta, en pantalla)
      const h = horizonte(p);
      if (h) {
        const a = aPantalla(svg, h.a), b = aPantalla(svg, { x: h.a.x + h.ux * 100, y: h.a.y + h.uy * 100 });
        const n = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        if (Math.abs((cx - a.x) * (b.y - a.y) - (cy - a.y) * (b.x - a.x)) / n < 6) cual = "h";
      }
    }
    if (cual === null && marcando) {
      e.preventDefault(); e.stopImmediatePropagation();
      const inv0 = svg.getScreenCTM().inverse();
      const q = { x: inv0.a * cx + inv0.c * cy + inv0.e, y: inv0.b * cx + inv0.d * cy + inv0.f };
      const sc = escena();
      guardar({ ...copia(sc.perspective), lineas: (sc.perspective.lineas || []).concat([q]).slice(-60) }, "Agregar líneas desde un punto");
      return;
    }
    if (cual === null) return;
    empezarArrastre(e, cual);
  }
  function mover(e) {
    if (construyendo && construyendo.actual) {
      e.preventDefault(); e.stopImmediatePropagation();
      construyendo.actual.b = construyendo.actual.aLienzo(e.clientX, e.clientY);
      pintarConstruccion();
      return;
    }
    if (!arrastre) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const sc = escena(); if (!sc) return;
    const q = arrastre.aLienzo(e.clientX, e.clientY), dx = q.x - arrastre.desde.x, dy = q.y - arrastre.desde.y;
    const vps = arrastre.antes.vps.map((v) => ({ ...v }));
    if (arrastre.cual === "h") {
      vps.forEach((v) => { if (v.eje !== "y") v.y += dy; });
    } else {
      const i = arrastre.cual;
      vps[i].x += dx; vps[i].y += dy;
      if (arrastre.juntos && i < 2 && vps[1 - i]) vps[1 - i].y = vps[i].y;   // la misma altura de los ojos
    }
    sc.perspective = { ...arrastre.antes, vps, origen: "manual" };
    pintar();
  }
  function soltar(e) {
    if (construyendo && construyendo.actual) {
      e.preventDefault(); e.stopImmediatePropagation();
      const s = construyendo.actual; construyendo.actual = null;
      const svg = svgDibujo();
      // una recta muy corta no dice hacia dónde va: se ignora
      if (Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) * escala(svg) < 12) { pintarConstruccion(); return dzAviso("Esa recta es muy corta: arrastrá un poco más"); }
      construyendo.segs.push({ a: s.a, b: s.b });
      pintarConstruccion();
      if (construyendo.segs.length >= 2) construccionLista();
      else dzAviso("Ahora la segunda recta, sobre otro borde que vaya al mismo punto");
      return;
    }
    if (!arrastre) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const a = arrastre; arrastre = null;
    const sc = escena(); if (!sc) return;
    guardar(sc.perspective, a.cual === "h" ? "Mover el horizonte" : "Mover un punto de fuga", a.antes);
  }

  /* ── la barra ── */
  function abrir() {
    if (!escena()) return dzAviso("Abrí un documento de animación para usar la perspectiva");
    editando = true;
    if (!barra) {
      barra = document.createElement("div");
      barra.id = "lowPersp"; barra.className = "lowpersp"; barra.setAttribute("role", "toolbar");
      barra.setAttribute("aria-label", "Perspectiva");
      barra.innerHTML = `<span class="lowpersp-titulo">Perspectiva</span>
        <button type="button" data-p="1" title="Calles y pasillos de frente">1 punto</button>
        <button type="button" data-p="2" title="Esquinas de casas y edificios">2 puntos</button>
        <button type="button" data-p="3" title="Edificios vistos desde arriba o desde abajo">3 puntos</button>
        <span class="lowpersp-sep"></span>
        <button type="button" data-p="dos-lineas" title="Dibujá dos rectas sobre bordes que van al mismo punto (de una foto o un fondo): donde se cruzan nace el punto de fuga">Fuga con 2 líneas</button>
        <span class="lowpersp-sep"></span>
        <label title="Las herramientas siguen al punto de fuga hacia donde arranca el trazo. Tab, en medio del trazo, cambia de fuga"><input type="checkbox" id="lowPerspIman"> Imán</label>
        <span class="lowpersp-fugas" id="lowPerspFugas" title="Prendé o apagá el imán de cada punto de fuga"></span>
        <label><input type="checkbox" id="lowPerspVer"> Ver guías</label>
        <button type="button" data-p="marcar" title="Clic en la mesa: salen las rectas de cada punto de fuga pasando por ahí">Líneas desde un punto</button>
        <button type="button" data-p="borrar-lineas" title="Borrar las líneas de construcción">Borrar líneas</button>
        <button type="button" data-p="quitar" title="Sacar los puntos de fuga de la escena">Quitar</button>
        <button type="button" data-p="listo" class="lowpersp-listo" title="Cerrar la barra: las guías y el imán siguen">Listo</button>
        <div class="lowpersp-ayuda" id="lowPerspAyuda"></div>`;
      document.body.appendChild(barra);
      barra.addEventListener("pointerdown", (e) => e.stopPropagation());
      barra.querySelectorAll("[data-p]").forEach((b) => b.onclick = () => {
        const q = b.dataset.p;
        if (q === "listo") return cerrar();
        if (q === "marcar") {
          marcando = !marcando; sincronizarBarra();
          return dzAviso(marcando ? "Clic en la mesa: salen las rectas de cada punto de fuga pasando por ahí" : "");
        }
        if (q === "dos-lineas") {
          if (construyendo) { terminarConstruccion(); return dzAviso(""); }
          marcando = false; construyendo = { segs: [], actual: null }; sincronizarBarra();
          return dzAviso("Dibujá una recta sobre un borde que vaya al punto de fuga (Esc cancela)");
        }
        if (q === "borrar-lineas") {
          const sc = escena(); if (!sc) return;
          return guardar({ ...copia(sc.perspective), lineas: [] }, "Borrar las líneas desde un punto");
        }
        if (q === "quitar") {
          const sc = escena(); if (!sc) return;
          guardar({ ...copia(sc.perspective), vps: [], origen: "manual" }, "Quitar la perspectiva");
          return dzAviso("Sin puntos de fuga");
        }
        preset(+q);
      });
      barra.querySelector("#lowPerspIman").onchange = (e) => {
        const sc = escena(); if (!sc) return;
        guardar({ ...copia(sc.perspective), iman: e.target.checked }, e.target.checked ? "Prender el imán de perspectiva" : "Apagar el imán de perspectiva");
      };
      barra.querySelector("#lowPerspVer").onchange = (e) => {
        const sc = escena(); if (!sc) return;
        guardar({ ...copia(sc.perspective), visible: e.target.checked }, e.target.checked ? "Mostrar la perspectiva" : "Ocultar la perspectiva");
      };
      global.addEventListener("resize", ubicar);
    }
    barra.hidden = false;
    ubicar(); sincronizarBarra(); pintar();
    if (!datos()) dzAviso("Perspectiva: elegí 1, 2 o 3 puntos de fuga");
  }
  function cerrar() {
    editando = false; marcando = false;
    if (construyendo) terminarConstruccion();
    if (barra) barra.hidden = true;
    pintar();
  }
  function ubicar() {
    const mesa = document.getElementById("dzCanvas");
    if (!barra || !mesa) return;
    const r = mesa.getBoundingClientRect();
    // al PIE de la mesa: arriba tapaba la altura de los ojos, que es justo donde
    // están los puntos de fuga (medido a 1000×560: la barra cubría y 108–221 y
    // el horizonte estaba en 200)
    // con la mesa baja (espacio Animación en una ventana chica) la ayuda pasa a la
    // barra de estado: si no, la barra tapa la hoja entera
    const compacta = r.height < 420;
    if (barra.classList.contains("compacta") !== compacta) barra.classList.toggle("compacta", compacta);
    // Arriba de la mesa, como siempre, SALVO que ahí tape la altura de los ojos,
    // que es donde están los puntos de fuga (medido a 1000×560: la barra cubría
    // y 108–221 y el horizonte estaba en 200). Entonces va al pie. Siempre
    // abajo tampoco: tapaba el piso, donde se dibuja (lo encontró la prueba).
    const arriba = Math.max(4, r.top + 8), abajo = Math.max(r.top + 8, r.bottom - barra.offsetHeight - 8);
    const p = datos(), svg = svgDibujo();
    let top = arriba;
    if (p && p.vps.length && svg && svg.getScreenCTM()) {
      const ys = p.vps.filter((v) => v.eje !== "y").map((v) => aPantalla(svg, v).y);
      if (ys.some((y) => y >= arriba - 12 && y <= arriba + barra.offsetHeight + 12)) top = abajo;
    }
    barra.style.top = top + "px";
    barra.style.left = (r.left + r.width / 2) + "px";
  }
  function sincronizarBarra() {
    if (!barra || barra.hidden) return;
    const sc = escena(), p = sc && sc.perspective, hay = !!datos();
    barra.querySelector("#lowPerspIman").checked = !p || p.iman !== false;
    barra.querySelector("#lowPerspVer").checked = !p || p.visible !== false;
    barra.querySelector("#lowPerspIman").disabled = !hay;
    barra.querySelector("#lowPerspVer").disabled = !hay;
    barra.querySelector('[data-p="quitar"]').disabled = !hay;
    barra.querySelector('[data-p="marcar"]').disabled = !hay;
    barra.querySelector('[data-p="marcar"]').classList.toggle("activo", hay && marcando);
    barra.querySelector('[data-p="borrar-lineas"]').disabled = !hay || !((p.lineas || []).length);
    barra.querySelectorAll("[data-p='1'],[data-p='2'],[data-p='3']").forEach((b) =>
      b.classList.toggle("activo", hay && p.vps.length === +b.dataset.p));
    barra.querySelector('[data-p="dos-lineas"]').classList.toggle("activo", !!construyendo);
    // un interruptor por punto: apagar uno resuelve «se va a la fuga que no es»
    const fugas = barra.querySelector("#lowPerspFugas");
    fugas.textContent = "";
    if (hay) p.vps.forEach((v, i) => {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.vpIman = String(i);
      const prendido = v.iman !== false;
      b.className = "lowpersp-fuga" + (prendido ? " activo" : "");
      b.style.setProperty("--fuga", colorDe(v, i));
      b.setAttribute("aria-pressed", String(prendido));
      b.textContent = v.eje ? v.eje.toUpperCase() : String(i + 1);
      b.title = (prendido ? "Apagar" : "Prender") + " el imán del punto de fuga " + b.textContent;
      b.onclick = () => {
        const sc = escena(); if (!sc) return;
        const q = copia(sc.perspective);
        if (q.vps[i].iman === false) delete q.vps[i].iman; else q.vps[i].iman = false;
        guardar(q, (prendido ? "Apagar" : "Prender") + " el imán de un punto de fuga");
      };
      fugas.appendChild(b);
    });
    barra.querySelector("#lowPerspAyuda").textContent = hay
      ? (p.origen === "3d" ? "Puntos de la cámara del estudio 3D · " : "") + (construyendo ? "Dibujá dos rectas sobre bordes que vayan al mismo punto · Esc cancela"
        : "Arrastrá los puntos (o su flecha, si están fuera de la vista) y el horizonte · lápiz, Línea y figuras siguen la fuga · Tab, en medio del trazo, cambia de fuga · Shift: libre")
      : "Elegí cuántos puntos de fuga";
    barra.title = barra.querySelector("#lowPerspAyuda").textContent;
    ubicar();   // el alto de la barra depende de lo que dice: se reubica después
    if (barra.classList.contains("compacta") && hay && editando) dzAviso(barra.title);
  }

  /* ── lo que usan la Regla y el estudio 3D ── */
  global.dzPerspectivaVPs = () => { const p = datos(); return p ? p.vps.map((v) => ({ ...v })) : []; };
  /** Clic derecho de la Regla: el punto va a la escena (se guarda). */
  global.dzPerspectivaAgregarVP = (pt) => {
    const sc = escena(); if (!sc) return false;
    const p = copia(sc.perspective);
    if ((p.vps || []).length >= 3) { dzAviso("Ya hay 3 puntos de fuga: clic derecho sobre uno para sacarlo"); return true; }
    p.vps = (p.vps || []).concat([{ x: pt.x, y: pt.y }]);
    guardar({ ...p, visible: true, origen: "manual" }, "Agregar un punto de fuga");
    return true;
  };
  global.dzPerspectivaQuitarVP = (pt, radio) => {
    const sc = escena(), p = datos(); if (!sc || !p) return false;
    const i = p.vps.findIndex((v) => Math.hypot(v.x - pt.x, v.y - pt.y) < radio);
    if (i < 0) return false;
    const q = copia(p); q.vps.splice(i, 1);
    guardar({ ...q, origen: "manual" }, "Sacar un punto de fuga");
    return true;
  };
  /** Del estudio 3D: los puntos de fuga de su cámara, ya en unidades del lienzo. */
  global.dzPerspectivaDesde3D = (vps, extra = {}) => {
    const sc = escena(); if (!sc) return false;
    return guardar({ ...copia(sc.perspective), vps: (vps || []).slice(0, 3), paralelas: extra.paralelas || [],
      visible: true, iman: true, origen: "3d", camara: extra.ajustes || null, lineas: [] }, "Perspectiva desde el estudio 3D");
  };
  global.dzPerspectivaAbrir = abrir;
  global.LOW = global.LOW || {};
  global.LOW.drawing = global.LOW.drawing || {};
  global.LOW.drawing.perspectiva = { abrir, cerrar, preset, pintar, editando: () => editando, datos };

  function iniciar() {
    envolverTrazo();
    envolverFormas();
    const mesa = document.getElementById("dzCanvas");
    if (mesa) {
      mesa.addEventListener("pointerdown", agarrar, true);
      global.addEventListener("pointermove", mover, true);
      global.addEventListener("pointerup", soltar, true);
      global.addEventListener("pointercancel", soltar, true);
      // panear o hacer zoom cambia el estilo del svg: las flechas del borde se reubican
      let flechasPend = false;
      new MutationObserver(() => {
        if (flechasPend || !datos()) return;
        flechasPend = true;
        requestAnimationFrame(() => { flechasPend = false; pintarFlechas(datos()); });
      }).observe(mesa, { attributes: true, subtree: true, attributeFilter: ["style", "viewBox"] });
    }
    global.addEventListener("keydown", alTeclear, true);
    global.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && construyendo) { e.preventDefault(); e.stopImmediatePropagation(); terminarConstruccion(); dzAviso("Fuga con 2 líneas cancelada"); }
    }, true);
    global.addEventListener("resize", () => pintarFlechas(datos()));
    const zoom = global.dzApplyZoom;
    if (typeof zoom === "function" && !zoom._perspectiva) {
      global.dzApplyZoom = function () { const r = zoom.apply(this, arguments); if (editando) pintar(); else pintarFlechas(datos()); return r; };
      global.dzApplyZoom._perspectiva = true;
    }
    vigilar(); pintar();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})(typeof window !== "undefined" ? window : globalThis);
