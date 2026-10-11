/* ══════════════════════════════════════════════════════════════════════════
   INTERCALAR LO MOVIDO: INTERPOLAR DOS `transform`

   Reporte de Mauro (oct-2026, LOW 3.16): «no me acuerdo cómo se usa el flujo
   de interpolación con los fotogramas clave, o no anda».

   Medido con el flujo pose a pose (Alt+K, Alt+D, mover, Alt+T), el intercalado
   dejaba los intermedios en la pose de partida. La flecha mueve escribiendo un
   `transform="matrix(…)"`, y el objeto de la primera clave no tiene ninguno.
   `dzTweenEl` sólo interpolaba un atributo si estaba en LOS DOS lados, así que
   «nada → matrix» no se interpolaba nunca: el movimiento no aparecía.

   Acá un lado sin `transform` vale lo que vale: la identidad. Y no se mezclan
   los seis números de la matriz uno por uno: a mitad de un giro de 90° eso
   achica el objeto al 70 %. Cada matriz se descompone en posición, giro,
   escala e inclinación, y se interpola cada parte. El giro va por el camino
   corto.

   @module animation/interpolar-transform
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  let probeta = null;

  /** La matriz de un `transform` cualquiera (translate, rotate, matrix…). */
  function matriz(txt) {
    if (!txt || !String(txt).trim()) return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
    if (!probeta) probeta = document.createElementNS(NS, "g");
    probeta.setAttribute("transform", txt);
    const m = probeta.transform.baseVal.consolidate();
    return m ? { a: m.matrix.a, b: m.matrix.b, c: m.matrix.c, d: m.matrix.d, e: m.matrix.e, f: m.matrix.f }
      : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  }

  /** M = traslación · giro · [[sx, k], [0, sy]] */
  function partes(m) {
    const sx = Math.hypot(m.a, m.b) || 1e-9, giro = Math.atan2(m.b, m.a);
    const co = Math.cos(giro), si = Math.sin(giro);
    return { x: m.e, y: m.f, giro, sx, k: m.c * co + m.d * si, sy: -m.c * si + m.d * co };
  }

  function armar(p) {
    const co = Math.cos(p.giro), si = Math.sin(p.giro);
    return { a: co * p.sx, b: si * p.sx, c: co * p.k - si * p.sy, d: si * p.k + co * p.sy, e: p.x, f: p.y };
  }

  const n = (v) => (Math.abs(v) < 1e-10 ? 0 : Math.round(v * 1e4) / 1e4);

  /** El `transform` intermedio entre `ta` y `tb` en t (0..1). Un lado vacío
   *  es la identidad. */
  function dzTweenTransform(ta, tb, t) {
    const A = partes(matriz(ta)), B = partes(matriz(tb));
    let dg = B.giro - A.giro;
    while (dg > Math.PI) dg -= 2 * Math.PI;
    while (dg < -Math.PI) dg += 2 * Math.PI;
    const l = (a, b) => a + (b - a) * t;
    const m = armar({ x: l(A.x, B.x), y: l(A.y, B.y), giro: A.giro + dg * t, sx: l(A.sx, B.sx), sy: l(A.sy, B.sy), k: l(A.k, B.k) });
    return `matrix(${n(m.a)} ${n(m.b)} ${n(m.c)} ${n(m.d)} ${n(m.e)} ${n(m.f)})`;
  }

  global.dzTweenTransform = dzTweenTransform;
})(window);
