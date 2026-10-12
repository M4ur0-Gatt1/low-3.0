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
    const a = p.vps[0], b = p.vps[1];
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
      const color = COLORES[i] || COLORES[0];
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
    el("line", { x1: h.a.x - h.ux * L, y1: h.a.y - h.uy * L, x2: h.a.x + h.ux * L, y2: h.a.y + h.uy * L,
      stroke: HORIZONTE, "stroke-width": editando ? "2" : "1.4", opacity: "0.85", "data-p": "horizonte", ...fino }, g);
    if (editando) {
      const r = 7 / k;
      p.vps.forEach((v, i) => {
        const color = COLORES[i] || COLORES[0];
        el("circle", { cx: v.x, cy: v.y, r: r * 1.6, fill: color, opacity: "0.18", stroke: "none" }, g);
        el("circle", { cx: v.x, cy: v.y, r, fill: "#fff", stroke: color, "stroke-width": "2.5", "data-p": "vp" + i, "vector-effect": "non-scaling-stroke" }, g);
        const t = el("text", { x: v.x + r * 1.5, y: v.y - r * 1.3, fill: color, "font-size": 13 / k,
          "font-family": "Figtree, sans-serif", "font-weight": "700" }, g);
        t.textContent = String(i + 1);
      });
    }
    if (g.parentNode !== svg || svg.lastElementChild !== g) svg.appendChild(g);
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
    guardar({ ...copia(antes), vps, visible: true, iman: antes.iman !== false, origen: "manual" },
      "Perspectiva de " + n + (n === 1 ? " punto" : " puntos"));
    dzAviso(n === 1 ? "Perspectiva de 1 punto: calles y pasillos de frente"
      : n === 2 ? "Perspectiva de 2 puntos: esquinas de casas y edificios"
      : "Perspectiva de 3 puntos: edificios vistos desde arriba");
  }
  function dzAviso(t) { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); }

  /* ── el imán del lápiz ── */
  function direcciones(p, sx, sy) {
    const out = [];
    p.vps.forEach((v, i) => {
      const dx = v.x - sx, dy = v.y - sy, n = Math.hypot(dx, dy);
      if (n > 1e-6) out.push({ ux: dx / n, uy: dy / n, color: COLORES[i] || COLORES[0] });
    });
    if (p.vps.length < 3) out.push({ ux: 0, uy: 1, color: "#9aa0a6" });       // verticales
    if (p.vps.length === 1) out.push({ ux: 1, uy: 0, color: HORIZONTE });      // horizontales
    return out;
  }
  /** Decide hacia dónde va el trazo y proyecta el punto ahí. La dirección es
   *  PROVISORIA hasta FIJAR_PX: se mide del arranque al punto actual (no del
   *  primer tramito, que con el pulso temblando apunta a cualquier lado) y, si
   *  cambia, lo ya dibujado se vuelve a proyectar. Después queda fija. */
  function imantar(track, x, y) {
    const p = datos();
    if (!p || !p.iman) return null;
    const sx = track.startX, sy = track.startY;
    const st = track._pp || (track._pp = { dir: undefined, fijo: false });
    if (!st.fijo) {
      const dx = x - sx, dy = y - sy, d = Math.hypot(dx, dy), px = d * escala(svgDibujo());
      if (px < ARRANQUE_PX && st.dir === undefined) return { x: sx, y: sy };   // todavía no se sabe: nada torcido
      let mejor = null, ang = Infinity;
      if (d > 1e-9) for (const u of direcciones(p, sx, sy)) {
        const a = Math.acos(Math.min(1, Math.abs(dx * u.ux + dy * u.uy) / d));
        if (a < ang) { ang = a; mejor = u; }
      }
      const dir = mejor && ang <= ANG_LIBRE ? mejor : null;
      if (dir && dir !== st.dir) reproyectar(track, dir);
      st.dir = dir;
      if (px >= FIJAR_PX) st.fijo = true;
      if (dir) mostrarGuia(sx, sy, dir); else ocultarGuia();
    }
    const u = st.dir;
    if (!u) return null;
    const k = (x - sx) * u.ux + (y - sy) * u.uy;
    return { x: sx + k * u.ux, y: sy + k * u.uy };
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

  /* ── arrastrar puntos y horizonte (con la barra abierta) ── */
  function agarrar(e) {
    if (!editando || e.button !== 0) return;
    const p = datos(), svg = svgDibujo();
    if (!p || !svg) return;
    const cx = e.clientX, cy = e.clientY;
    let cual = null, mejor = AGARRE_PX;
    p.vps.forEach((v, i) => { const s = aPantalla(svg, v), d = Math.hypot(s.x - cx, s.y - cy); if (d < mejor) { mejor = d; cual = i; } });
    if (cual === null) {
      // ¿sobre el horizonte? (distancia a la recta, en pantalla)
      const h = horizonte(p), a = aPantalla(svg, h.a), b = aPantalla(svg, { x: h.a.x + h.ux * 100, y: h.a.y + h.uy * 100 });
      const n = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      if (Math.abs((cx - a.x) * (b.y - a.y) - (cy - a.y) * (b.x - a.x)) / n < 6) cual = "h";
    }
    if (cual === null) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const inv = svg.getScreenCTM().inverse();
    const aLienzo = (x, y) => ({ x: inv.a * x + inv.c * y + inv.e, y: inv.b * x + inv.d * y + inv.f });
    const juntos = p.vps.length >= 2 && Math.abs(p.vps[0].y - p.vps[1].y) < 0.5;
    arrastre = { cual, antes: copia(p), desde: aLienzo(cx, cy), aLienzo, juntos, pid: e.pointerId };
    ocultarGuia();
  }
  function mover(e) {
    if (!arrastre) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const sc = escena(); if (!sc) return;
    const q = arrastre.aLienzo(e.clientX, e.clientY), dx = q.x - arrastre.desde.x, dy = q.y - arrastre.desde.y;
    const vps = arrastre.antes.vps.map((v) => ({ ...v }));
    if (arrastre.cual === "h") {
      const n = Math.min(2, vps.length);
      for (let i = 0; i < n; i++) vps[i].y += dy;
    } else {
      const i = arrastre.cual;
      vps[i].x += dx; vps[i].y += dy;
      if (arrastre.juntos && i < 2 && vps[1 - i]) vps[1 - i].y = vps[i].y;   // la misma altura de los ojos
    }
    sc.perspective = { ...arrastre.antes, vps, origen: "manual" };
    pintar();
  }
  function soltar(e) {
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
        <label title="El lápiz sigue al punto de fuga hacia donde arranca el trazo"><input type="checkbox" id="lowPerspIman"> Imán</label>
        <label><input type="checkbox" id="lowPerspVer"> Ver guías</label>
        <button type="button" data-p="quitar" title="Sacar los puntos de fuga de la escena">Quitar</button>
        <button type="button" data-p="listo" class="lowpersp-listo" title="Cerrar la barra: las guías y el imán siguen">Listo</button>
        <div class="lowpersp-ayuda" id="lowPerspAyuda"></div>`;
      document.body.appendChild(barra);
      barra.addEventListener("pointerdown", (e) => e.stopPropagation());
      barra.querySelectorAll("[data-p]").forEach((b) => b.onclick = () => {
        const q = b.dataset.p;
        if (q === "listo") return cerrar();
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
    editando = false;
    if (barra) barra.hidden = true;
    pintar();
  }
  function ubicar() {
    const mesa = document.getElementById("dzCanvas");
    if (!barra || !mesa) return;
    const r = mesa.getBoundingClientRect();
    barra.style.top = Math.max(4, r.top + 8) + "px";
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
    barra.querySelectorAll("[data-p='1'],[data-p='2'],[data-p='3']").forEach((b) =>
      b.classList.toggle("activo", hay && p.vps.length === +b.dataset.p));
    barra.querySelector("#lowPerspAyuda").textContent = hay
      ? (p.origen === "3d" ? "Puntos de la cámara del estudio 3D · " : "") + "Arrastrá los puntos y el horizonte · el lápiz sigue al punto de fuga hacia donde arranques (Shift: recta libre)"
      : "Elegí cuántos puntos de fuga";
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
  global.dzPerspectivaDesde3D = (vps, camara) => {
    const sc = escena(); if (!sc) return false;
    return guardar({ ...copia(sc.perspective), vps: (vps || []).slice(0, 3), visible: true, iman: true, origen: "3d", camara },
      "Perspectiva desde el estudio 3D");
  };
  global.dzPerspectivaAbrir = abrir;
  global.LOW = global.LOW || {};
  global.LOW.drawing = global.LOW.drawing || {};
  global.LOW.drawing.perspectiva = { abrir, cerrar, preset, pintar, editando: () => editando, datos };

  function iniciar() {
    envolverTrazo();
    const mesa = document.getElementById("dzCanvas");
    if (mesa) {
      mesa.addEventListener("pointerdown", agarrar, true);
      global.addEventListener("pointermove", mover, true);
      global.addEventListener("pointerup", soltar, true);
      global.addEventListener("pointercancel", soltar, true);
    }
    const zoom = global.dzApplyZoom;
    if (typeof zoom === "function" && !zoom._perspectiva) {
      global.dzApplyZoom = function () { const r = zoom.apply(this, arguments); if (editando) pintar(); return r; };
      global.dzApplyZoom._perspectiva = true;
    }
    vigilar(); pintar();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar);
  else iniciar();
})(typeof window !== "undefined" ? window : globalThis);
