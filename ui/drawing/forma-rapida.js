/* ══════════════════════════════════════════════════════════════════════════
   FORMA RÁPIDA: UN CÍRCULO A MANO + SHIFT AL SOLTAR = UN CÍRCULO PERFECTO

   Pedido de Mauro (oct-2026, LOW 3.13): «tenía un atajo para dibujar un
   círculo manteniendo Alt o Shift al cerrar un pseudo círculo con la tableta;
   esa función no me está andando». En el 2D no existía —estaba la herramienta
   Formas, que se arrastra—; acá se hace con el lápiz y el pincel, como la
   QuickShape de Procreate, pero con una tecla en vez de esperar:

     · se dibuja un círculo a mano, más o menos cerrado, y al LEVANTAR el lápiz
       se tiene apretada
         Shift → queda un círculo perfecto (centro y radio del que dibujaste);
         Alt   → queda la elipse que mejor ajusta (con su inclinación);
     · un trazo ABIERTO con Shift al soltar → queda una recta.

   Sin tecla no se toca nada: lo dibujado es del que dibuja. La forma sale con
   la herramienta en uso (lápiz o pincel, con su grosor) y empieza donde
   empezó el trazo y en el mismo sentido, así el pincel afina donde uno
   esperaba. Ctrl+Z la saca entera (es el mismo paso que el trazo).

   Se engancha en `_drawFinish` (app.js), por nombre: corre justo antes de
   que el trazo se suavice y se convierta en tinta, y cambia sus puntos.

   @module drawing/forma-rapida
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const DOS_PI = Math.PI * 2;

  /* Las teclas al soltar: del evento del puntero (la tableta las trae), y
     del teclado por las dudas (algunos controladores no las pasan). */
  const teclado = { shift: false, alt: false };
  let alSoltar = { shift: false, alt: false, t: 0 };
  const anotar = (e) => { alSoltar = { shift: !!e.shiftKey, alt: !!e.altKey, t: performance.now() }; };
  document.addEventListener("pointerup", anotar, true);
  document.addEventListener("pointercancel", anotar, true);
  const tecla = (e) => { if (e.key === "Shift") teclado.shift = e.type === "keydown"; if (e.key === "Alt") teclado.alt = e.type === "keydown"; };
  document.addEventListener("keydown", tecla, true);
  document.addEventListener("keyup", tecla, true);
  global.addEventListener("blur", () => { teclado.shift = teclado.alt = false; });
  function teclas() {
    const reciente = performance.now() - alSoltar.t < 400;
    return { shift: (reciente && alSoltar.shift) || teclado.shift, alt: (reciente && alSoltar.alt) || teclado.alt };
  }

  /* ── geometría ─────────────────────────────────────────────────────────── */
  const largo = (pts) => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L; };
  /** Puntos parejos a lo largo del trazo: si no, donde la mano fue lenta hay
   *  más muestras y el centro se corre para ese lado. */
  function parejo(pts, n) {
    const L = largo(pts); if (!L) return pts.map((p) => [p[0], p[1]]);
    const out = [[pts[0][0], pts[0][1]]]; let i = 1, hecho = 0, previo = pts[0];
    for (let k = 1; k < n; k++) {
      const meta = L * k / (n - 1);
      while (i < pts.length) {
        const seg = Math.hypot(pts[i][0] - previo[0], pts[i][1] - previo[1]);
        if (hecho + seg >= meta) { const f = seg ? (meta - hecho) / seg : 0; out.push([previo[0] + (pts[i][0] - previo[0]) * f, previo[1] + (pts[i][1] - previo[1]) * f]); break; }
        hecho += seg; previo = pts[i]; i++;
      }
    }
    return out;
  }
  const mediana = (v) => { const s = v.slice().sort((a, b) => a - b); return s.length ? s[s.length >> 1] : .5; };

  /** ¿Es un lazo? Que vuelva cerca de donde empezó y que haya dado la vuelta. */
  function esLazo(pts) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const tam = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const hueco = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]);
    return tam > 4 && hueco < Math.max(tam * .3, 8) && largo(pts) > tam * 2.2;
  }

  /** Centro y ejes del lazo: la elipse que mejor ajusta (componentes
   *  principales). Para el círculo se usa el radio medio. */
  function ajuste(muestras) {
    const n = muestras.length;
    const cx = muestras.reduce((s, p) => s + p[0], 0) / n, cy = muestras.reduce((s, p) => s + p[1], 0) / n;
    let sxx = 0, syy = 0, sxy = 0;
    for (const [x, y] of muestras) { sxx += (x - cx) ** 2; syy += (y - cy) ** 2; sxy += (x - cx) * (y - cy); }
    sxx /= n; syy /= n; sxy /= n;
    const t = (sxx + syy) / 2, d = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy ** 2);
    const l1 = t + d, l2 = Math.max(0, t - d);
    const ang = .5 * Math.atan2(2 * sxy, sxx - syy);
    // los semiejes por mínimos cuadrados de (u/a)² + (v/b)² = 1 en los ejes
    // principales. La varianza (a ≈ √2σ) subestimaba el eje largo: con puntos
    // parejos a lo LARGO del trazo, las puntas del eje mayor tienen menos.
    let a = Math.sqrt(2 * l1), b = Math.sqrt(2 * l2);
    const c = Math.cos(ang), s = Math.sin(ang);
    let u4 = 0, v4 = 0, uv = 0, u2 = 0, v2 = 0;
    for (const [x, y] of muestras) {
      const u = (x - cx) * c + (y - cy) * s, v = -(x - cx) * s + (y - cy) * c;
      const uu = u * u, vv = v * v;
      u4 += uu * uu; v4 += vv * vv; uv += uu * vv; u2 += uu; v2 += vv;
    }
    const det = u4 * v4 - uv * uv;
    if (Math.abs(det) > 1e-9) {
      const A = (u2 * v4 - v2 * uv) / det, B = (v2 * u4 - u2 * uv) / det;
      if (A > 0 && B > 0) { a = 1 / Math.sqrt(A); b = 1 / Math.sqrt(B); }
    }
    const r = muestras.reduce((s, p) => s + Math.hypot(p[0] - cx, p[1] - cy), 0) / n;
    return { cx, cy, a, b, ang, r };
  }

  /** Los puntos de la forma, con el formato de un trazo: [x, y, presión, …]. */
  function puntosDeLazo(original, g, circulo) {
    const pr = mediana(original.map((p) => p[2] == null ? .5 : p[2]));
    const muestra = original[0], t0 = muestra[6] || performance.now();
    // empieza donde empezó la mano, y gira en el mismo sentido
    let area = 0;
    for (let i = 1; i < original.length; i++) area += original[i - 1][0] * original[i][1] - original[i][0] * original[i - 1][1];
    const sentido = area >= 0 ? 1 : -1;
    const cos = Math.cos(g.ang), sin = Math.sin(g.ang);
    const rx = circulo ? g.r : g.a, ry = circulo ? g.r : g.b;
    const dx = original[0][0] - g.cx, dy = original[0][1] - g.cy;
    const inicio = circulo ? Math.atan2(dy, dx) : Math.atan2((-sin * dx + cos * dy) / (ry || 1), (cos * dx + sin * dy) / (rx || 1));
    const n = Math.max(48, Math.min(160, Math.round(DOS_PI * Math.max(rx, ry) / 6)));
    const out = [];
    for (let k = 0; k <= n; k++) {
      const t = inicio + sentido * DOS_PI * k / n;
      const ex = Math.cos(t) * rx, ey = Math.sin(t) * ry;
      const x = circulo ? g.cx + ex : g.cx + ex * cos - ey * sin;
      const y = circulo ? g.cy + ey : g.cy + ex * sin + ey * cos;
      out.push([x, y, pr, muestra[3] || 0, muestra[4] || 0, muestra[5] || 0, t0 + k]);
    }
    return out;
  }
  function puntosDeRecta(original) {
    const pr = mediana(original.map((p) => p[2] == null ? .5 : p[2]));
    const a = original[0], z = original[original.length - 1], t0 = a[6] || performance.now();
    const n = Math.max(2, Math.min(40, Math.round(Math.hypot(z[0] - a[0], z[1] - a[1]) / 20)));
    return Array.from({ length: n + 1 }, (_, k) => [a[0] + (z[0] - a[0]) * k / n, a[1] + (z[1] - a[1]) * k / n, pr, a[3] || 0, a[4] || 0, a[5] || 0, t0 + k]);
  }

  /** Decide y cambia los puntos del trazo. Devuelve qué hizo, o null. */
  function ajustarTrazo(track, mods) {
    if (!track || !Array.isArray(track.pts) || track.pts.length < 6) return null;
    if (track.mode !== "pencil" && track.mode !== "brush") return null;
    if (!mods.shift && !mods.alt) return null;
    const pts = track.pts;
    if (esLazo(pts)) {
      const g = ajuste(parejo(pts, 96));
      const circulo = mods.shift && !mods.alt;
      track.pts = puntosDeLazo(pts, g, circulo);
      track.formaRapida = circulo ? "círculo" : "elipse";
      return track.formaRapida;
    }
    if (mods.shift && !mods.alt) { track.pts = puntosDeRecta(pts); track.formaRapida = "recta"; return "recta"; }
    return null;
  }

  /* La forma ya sale limpia y pareja: NO pasa por el suavizado del trazo a
     mano. Medido en la app real: a zoom 29 % el suavizado (dzRefineStroke,
     con Ramer-Douglas-Peucker) dejaba 18 de los 89 puntos de la elipse, y la
     curva rehecha con tan pocos quedaba con bultos — se veía «a mano» otra
     vez. Se lo saltea sólo mientras se termina una forma rápida. */
  let sinRefinar = false;
  function envolverRefinado() {
    const orig = global.dzRefineStroke;
    if (typeof orig !== "function" || orig.__formaRapida) return;
    const f = function (pts) { return sinRefinar ? pts : orig.apply(this, arguments); };
    Object.assign(f, orig);
    f.__formaRapida = true;
    global.dzRefineStroke = f;
  }

  function envolver() {
    const orig = global._drawFinish;
    if (typeof orig !== "function" || orig.__formaRapida) return false;
    envolverRefinado();
    const f = function () {
      let hecho = null;
      try { hecho = ajustarTrazo(typeof DRAW_TRACK !== "undefined" ? DRAW_TRACK : null, teclas()); }
      catch (e) { console.warn("[forma rápida]", e); }
      sinRefinar = !!hecho;
      let r;
      try { r = orig.apply(this, arguments); } finally { sinRefinar = false; }
      if (hecho && typeof global.dzSetStatus === "function") {
        global.dzSetStatus(hecho === "círculo" ? "◯ Círculo perfecto (Shift al soltar) · Alt al soltar deja la elipse · Ctrl+Z lo deshace"
          : hecho === "elipse" ? "⬭ Elipse ajustada (Alt al soltar) · Shift al soltar deja un círculo · Ctrl+Z lo deshace"
          : "╱ Recta (Shift al soltar un trazo abierto) · Ctrl+Z la deshace");
      }
      return r;
    };
    Object.assign(f, orig);
    f.__formaRapida = true;
    global._drawFinish = f;
    return true;
  }

  global.LOW = global.LOW || {};
  global.LOW.drawing = global.LOW.drawing || {};
  global.LOW.drawing.formaRapida = { ajustarTrazo, esLazo, ajuste, parejo };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", envolver, { once: true });
  else envolver();
})(window);
