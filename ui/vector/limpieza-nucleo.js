/* ══ ✂ LIMPIEZA DE LÍNEA: EL NÚCLEO GEOMÉTRICO ══════════════════════════════
   Puro (sin DOM), se prueba en node: tools/run_limpieza_tests.js.

   Todo trabaja con POLILÍNEAS densas ([[x, y], …]) en un mismo espacio (el
   del lienzo) y con posiciones medidas en LARGO DE ARCO (s) a lo largo de
   cada una. Así un corte es un número, y un tramo un par de números.

   - cortes(poly, otras, tol): dónde cruzan a `poly` las otras líneas (y ella
     misma), más dónde la tocan sus puntas (una T: una línea que termina sobre
     otra también la parte, aunque no la atraviese por una décima).
   - tramo(cortes, s, total, cerrada): el pedazo entre dos cortes que contiene s.
   - quitar(poly, …, tramos): lo que queda al sacar esos tramos (0, 1 o más piezas).
   - partir(poly, …, s): la línea partida en dos en s (la cuchilla de OpenToonz).
   - sobrantes(poly, cortes, tol): las colitas cortas pasado el último cruce.
   - huecos(puntas, tol): qué puntas cerrar con qué (de a pares, la más cercana).
   - unir(a, b): dos polilíneas soldadas por las puntas que se tocan. */
(function (global) {
  "use strict";

  const EPS = 1e-9;

  function acumulado(poly) {
    const a = [0];
    for (let i = 1; i < poly.length; i++) a.push(a[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
    return a;
  }

  /** Punto en el largo s (con la presión y lo demás interpolado si lo hay). */
  function puntoEn(poly, acum, s) {
    if (s <= 0) return poly[0].slice();
    const L = acum[acum.length - 1];
    if (s >= L) return poly[poly.length - 1].slice();
    let lo = 0, hi = acum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (acum[m] <= s) lo = m; else hi = m; }
    const seg = acum[hi] - acum[lo], t = seg > EPS ? (s - acum[lo]) / seg : 0, a = poly[lo], b = poly[hi];
    const out = [];
    for (let c = 0; c < Math.max(a.length, b.length); c++) {
      out.push(a[c] == null || b[c] == null ? (a[c] ?? b[c]) : a[c] + (b[c] - a[c]) * t);
    }
    return out;
  }

  /** El pedazo de la polilínea entre s0 y s1 (s0 < s1). */
  function sub(poly, acum, s0, s1) {
    const out = [puntoEn(poly, acum, s0)];
    for (let i = 0; i < poly.length; i++) if (acum[i] > s0 + EPS && acum[i] < s1 - EPS) out.push(poly[i].slice());
    out.push(puntoEn(poly, acum, s1));
    return out;
  }

  /** Cruce de dos segmentos: [t, u] en 0..1, o null (paralelos o sin cruce). */
  function cruceSeg(a, b, c, d) {
    const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1];
    const den = rx * sy - ry * sx;
    if (Math.abs(den) < EPS) return null;
    const qx = c[0] - a[0], qy = c[1] - a[1];
    const t = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
    if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
    return [Math.min(1, Math.max(0, t)), Math.min(1, Math.max(0, u))];
  }

  function cajas(poly) {
    const out = [];
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i], b = poly[i + 1];
      out.push([Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])]);
    }
    return out;
  }
  const caja = (poly) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; }
    return [x0, y0, x1, y1];
  };
  const tocan = (A, B, m = 0) => A[0] <= B[2] + m && B[0] <= A[2] + m && A[1] <= B[3] + m && B[1] <= A[3] + m;

  /** Dónde cruza `b` a `a`: lista de largos de arco sobre `a`. Con mismo=true
   *  se buscan los cruces de la línea consigo misma (sin los tramos vecinos). */
  function crucesEntre(a, acumA, b, acumB, mismo, cerrada = false) {
    const out = [];
    if (a.length < 2 || b.length < 2) return out;
    if (!mismo && !tocan(caja(a), caja(b))) return out;
    const ca = cajas(a), cb = mismo ? ca : cajas(b);
    for (let i = 0; i < ca.length; i++) {
      for (let j = mismo ? i + 2 : 0; j < cb.length; j++) {
        if (mismo && cerrada && i === 0 && j === cb.length - 1) continue;   // en una cerrada el primero y el último se tocan en el arranque: no es un cruce
        if (!tocan(ca[i], cb[j])) continue;
        const r = cruceSeg(a[i], a[i + 1], b[j], b[j + 1]);
        if (!r) continue;
        const sa = acumA[i] + r[0] * (acumA[i + 1] - acumA[i]);
        out.push(sa);
        if (mismo) out.push(acumB[j] + r[1] * (acumB[j + 1] - acumB[j]));
      }
    }
    return out;
  }

  /** El punto de la polilínea más cercano a p: { s, d, x, y }. */
  function masCercano(poly, acum, p) {
    let mejor = { s: 0, d: Infinity, x: poly[0][0], y: poly[0][1] };
    for (let i = 0; i < poly.length - 1; i++) {
      const a = poly[i], b = poly[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
      const t = L2 > EPS ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
      const x = a[0] + dx * t, y = a[1] + dy * t, d = Math.hypot(p[0] - x, p[1] - y);
      if (d < mejor.d) mejor = { s: acum[i] + t * (acum[i + 1] - acum[i]), d, x, y };
    }
    if (poly.length === 1) mejor.d = Math.hypot(p[0] - poly[0][0], p[1] - poly[0][1]);
    return mejor;
  }

  /** Todos los cortes de una línea contra las demás (y contra sí misma).
   *  `tol`: una punta de otra línea a menos de tol del cuerpo también corta
   *  (las T de una esquina que no llegó a cruzar por una décima). */
  function cortes(linea, otras, tol = 0.75) {
    const acum = linea.acum || acumulado(linea.poly);
    const L = acum[acum.length - 1];
    let s = crucesEntre(linea.poly, acum, linea.poly, acum, true, !!linea.cerrada);
    const cj = caja(linea.poly);
    for (const o of otras) {
      if (o === linea || !o.poly || o.poly.length < 2) continue;
      if (!tocan(cj, o.caja || caja(o.poly), tol)) continue;
      const ao = o.acum || acumulado(o.poly);
      s = s.concat(crucesEntre(linea.poly, acum, o.poly, ao, false));
      if (!o.cerrada) for (const punta of [o.poly[0], o.poly[o.poly.length - 1]]) {
        const m = masCercano(linea.poly, acum, punta);
        if (m.d <= tol) s.push(m.s);
      }
    }
    // las puntas de la propia línea que caen sobre su cuerpo (un lazo que se cierra)
    if (!linea.cerrada) for (const [punta, s0] of [[linea.poly[0], 0], [linea.poly[linea.poly.length - 1], L]]) {
      const m = masCercano(linea.poly, acum, punta);
      if (m.d <= tol && Math.abs(m.s - s0) > tol * 4) s.push(m.s);
    }
    const lim = linea.cerrada ? s.map((v) => ((v % L) + L) % L) : s.filter((v) => v > 1e-6 && v < L - 1e-6);
    lim.sort((x, y) => x - y);
    const out = [];
    for (const v of lim) if (!out.length || v - out[out.length - 1] > 1e-6) out.push(v);
    return out;
  }

  /** El tramo entre cortes que contiene s: [s0, s1]. En una cerrada puede
   *  dar la vuelta (s0 > s1). Sin cortes: toda la línea. */
  function tramo(cs, s, L, cerrada) {
    if (!cs.length) return [0, L, true];
    let i = 0;
    while (i < cs.length && cs[i] <= s) i++;
    if (cerrada) {
      if (cs.length === 1) return [cs[0], cs[0] + L, false];
      if (i === 0 || i === cs.length) return [cs[cs.length - 1], cs[0], false];
      return [cs[i - 1], cs[i], false];
    }
    return [i === 0 ? 0 : cs[i - 1], i === cs.length ? L : cs[i], false];
  }

  /** Lo que queda de la línea al sacar los tramos (lista de [s0, s1]). Las
   *  piezas de menos de `minimo` se descartan (un resto de una décima no es
   *  una línea). Una cerrada queda abierta desde donde se la cortó. */
  /** Los intervalos que QUEDAN al sacar los tramos (absolutos; en una
   *  cerrada b puede pasar de L: da la vuelta por el arranque). */
  function quedan(linea, tramos, minimo = 0.5) {
    const acum = linea.acum || acumulado(linea.poly), L = acum[acum.length - 1];
    if (!tramos.length) return [[0, L]];
    // un recorrido lineal de 0 a L; en una cerrada, desenrollado desde el
    // final del primer tramo quitado (así ningún tramo cruza el arranque)
    const largo = ([a, b]) => { if (!linea.cerrada) return b - a; const d = ((b - a) % L + L) % L; return d < 1e-9 ? L : d; };
    const base = linea.cerrada ? ((tramos[0][0] + largo(tramos[0])) % L) : 0;
    const ints = tramos.map((tr) => {
      const a = linea.cerrada ? ((tr[0] - base) % L + L) % L : tr[0];
      return [a, a + largo(tr)];
    }).map(([a, b]) => (linea.cerrada && a > L - 1e-9 ? [0, b - a] : [a, b])).sort((x, y) => x[0] - y[0]);
    const libres = [];
    let cur = 0;
    for (const [a, b] of ints) { if (a > cur + 1e-9) libres.push([cur, a]); cur = Math.max(cur, b); }
    if (cur < L - 1e-9) libres.push([cur, L]);
    return libres.filter(([a, b]) => b - a >= minimo)
      .map(([k0, k1]) => (linea.cerrada ? [(base + k0) % L, (base + k0) % L + (k1 - k0)] : [k0, k1]));
  }
  /** La polilínea de un intervalo [a, b] (en una cerrada b puede pasar de L). */
  function polyDe(linea, iv) {
    const poly = linea.poly, acum = linea.acum || acumulado(poly), L = acum[acum.length - 1], a = iv[0], b = iv[1];
    if (b <= L + 1e-9) return sub(poly, acum, a, Math.min(b, L));
    return sub(poly, acum, a, L).concat(sub(poly, acum, 0, b - L).slice(1));
  }
  function quitar(linea, tramos, minimo = 0.5) {
    return quedan(linea, tramos, minimo).map((iv) => polyDe(linea, iv));
  }
  /** Los intervalos de partir en s: dos (o uno, abierto, si era cerrada). */
  function partirIntervalos(linea, s) {
    const acum = linea.acum || acumulado(linea.poly), L = acum[acum.length - 1];
    if (linea.cerrada) return [[s, s + L]];
    if (s <= 1e-6 || s >= L - 1e-6) return [[0, L]];
    return [[0, s], [s, L]];
  }

  /* ── CAMINOS DE VERDAD: Bézier, para cortar EXACTO ──────────────────────
     La polilínea sirve para buscar cruces; para escribir, cada pieza se saca
     de las curvas originales partiéndolas en su t (De Casteljau): la pieza es
     idéntica al tramo, no una aproximación. */
  /** De los comandos absolutos de dzPathParse a segmentos L/C. Null si hay
   *  algo que no se parte así (arcos, S/T sin expandir, varios subcaminos). */
  function segmentar(cmds) {
    if (!cmds || !cmds.length || cmds[0].c !== "M") return null;
    let start = cmds[0].n.slice(0, 2), cur = start.slice(), cerrada = false, ms = 0;
    const segs = [];
    for (const s of cmds) {
      if (s.c === "M") { if (++ms > 1) return null; cur = s.n.slice(0, 2); start = cur.slice(); continue; }
      if (cerrada) return null;
      if (s.c === "L") { segs.push({ c: "L", p0: cur, p1: s.n.slice(0, 2) }); cur = s.n.slice(0, 2); }
      else if (s.c === "C") { segs.push({ c: "C", p0: cur, c1: s.n.slice(0, 2), c2: s.n.slice(2, 4), p1: s.n.slice(4, 6) }); cur = s.n.slice(4, 6); }
      else if (s.c === "Q") {
        const q = s.n.slice(0, 2), p1 = s.n.slice(2, 4);
        segs.push({ c: "C", p0: cur, c1: [cur[0] + 2 / 3 * (q[0] - cur[0]), cur[1] + 2 / 3 * (q[1] - cur[1])],
                    c2: [p1[0] + 2 / 3 * (q[0] - p1[0]), p1[1] + 2 / 3 * (q[1] - p1[1])], p1 });
        cur = p1;
      } else if (s.c === "Z") {
        if (Math.hypot(cur[0] - start[0], cur[1] - start[1]) > 1e-6) segs.push({ c: "L", p0: cur, p1: start.slice() });
        cerrada = true; cur = start.slice();
      } else return null;
    }
    return segs.length ? { segs, cerrada } : null;
  }
  function evalSeg(g, t) {
    if (g.c === "L") return [g.p0[0] + (g.p1[0] - g.p0[0]) * t, g.p0[1] + (g.p1[1] - g.p0[1]) * t];
    const u = 1 - t;
    return [u * u * u * g.p0[0] + 3 * u * u * t * g.c1[0] + 3 * u * t * t * g.c2[0] + t * t * t * g.p1[0],
            u * u * u * g.p0[1] + 3 * u * u * t * g.c1[1] + 3 * u * t * t * g.c2[1] + t * t * t * g.p1[1]];
  }
  /** Puntos densos sobre los segmentos, cada uno con su (segmento, t). */
  function aplanar(segs) {
    const pts = [segs[0].p0.slice()], tags = [[0, 0]];
    segs.forEach((g, i) => {
      let k = 1;
      if (g.c === "C") {
        const largo = Math.hypot(g.c1[0] - g.p0[0], g.c1[1] - g.p0[1]) + Math.hypot(g.c2[0] - g.c1[0], g.c2[1] - g.c1[1]) + Math.hypot(g.p1[0] - g.c2[0], g.p1[1] - g.c2[1]);
        k = Math.max(8, Math.min(200, Math.ceil(largo / 1.5)));
      }
      for (let j = 1; j <= k; j++) { const t = j / k; pts.push(evalSeg(g, t)); tags.push([i, t]); }
    });
    return { pts, tags };
  }
  /** (segmento, t) en el largo s de la polilínea aplanada. */
  function posEn(tags, acum, s) {
    const L = acum[acum.length - 1];
    if (s <= 0) return [0, 0];
    if (s >= L) return [tags[tags.length - 1][0], 1];
    let lo = 0, hi = acum.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (acum[m] <= s) lo = m; else hi = m; }
    const f = acum[hi] - acum[lo] > EPS ? (s - acum[lo]) / (acum[hi] - acum[lo]) : 0;
    let ta = tags[lo][1];
    const ib = tags[hi][0], tb = tags[hi][1];
    if (tags[lo][0] !== ib) ta = 0;                       // el punto de unión: el comienzo del siguiente
    return [ib, ta + (tb - ta) * f];
  }
  function partirCubica(p0, c1, c2, p1, t) {
    const m = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    const a = m(p0, c1), b = m(c1, c2), c = m(c2, p1), d = m(a, b), e = m(b, c), f = m(d, e);
    return [[p0, a, d, f], [f, e, c, p1]];
  }
  /** El pedazo de un segmento entre ta y tb (exacto). */
  function subSeg(g, ta, tb) {
    if (g.c === "L") return { c: "L", p0: evalSeg(g, ta), p1: evalSeg(g, tb) };
    let q = [g.p0, g.c1, g.c2, g.p1];
    if (tb < 1 - 1e-12) q = partirCubica(q[0], q[1], q[2], q[3], tb)[0];
    if (ta > 1e-12) q = partirCubica(q[0], q[1], q[2], q[3], tb > 1e-12 ? ta / tb : 0)[1];
    return { c: "C", p0: q[0], c1: q[1], c2: q[2], p1: q[3] };
  }
  /** Los segmentos de la posición pa a la pb (pa antes que pb). */
  function trozo(segs, pa, pb) {
    const ia = pa[0], ta = pa[1], ib = pb[0], tb = pb[1];
    if (ia === ib) return tb - ta > 1e-9 ? [subSeg(segs[ia], ta, tb)] : [];
    const out = [];
    if (ta < 1 - 1e-9) out.push(subSeg(segs[ia], ta, 1));
    for (let i = ia + 1; i < ib; i++) out.push(Object.assign({}, segs[i]));
    if (tb > 1e-9) out.push(subSeg(segs[ib], 0, tb));
    return out;
  }
  function invertir(segs) {
    return segs.slice().reverse().map((g) => (g.c === "L" ? { c: "L", p0: g.p1, p1: g.p0 } : { c: "C", p0: g.p1, c1: g.c2, c2: g.c1, p1: g.p0 }));
  }
  /** Una matriz afín {a,b,c,d,e,f} aplicada a todos los puntos (una Bézier se transforma exacta). */
  function transformar(segs, M) {
    const f = (p) => [M.a * p[0] + M.c * p[1] + M.e, M.b * p[0] + M.d * p[1] + M.f];
    return segs.map((g) => (g.c === "L" ? { c: "L", p0: f(g.p0), p1: f(g.p1) } : { c: "C", p0: f(g.p0), c1: f(g.c1), c2: f(g.c2), p1: f(g.p1) }));
  }
  function dDe(segs, cerrar) {
    const r = (v) => Math.round(v * 100) / 100;
    let d = "M " + r(segs[0].p0[0]) + " " + r(segs[0].p0[1]);
    for (const g of segs) d += g.c === "L" ? " L " + r(g.p1[0]) + " " + r(g.p1[1])
      : " C " + r(g.c1[0]) + " " + r(g.c1[1]) + " " + r(g.c2[0]) + " " + r(g.c2[1]) + " " + r(g.p1[0]) + " " + r(g.p1[1]);
    return cerrar ? d + " Z" : d;
  }

  /** La línea partida en s: dos piezas (o una, abierta, si era cerrada). */
  function partir(linea, s) {
    return partirIntervalos(linea, s).map((iv) => polyDe(linea, iv));
  }

  /** Las colitas: lo que sobra pasado el primer/último corte, si mide menos
   *  que tol. Devuelve los tramos a quitar. */
  function sobrantes(linea, cs, tol) {
    if (linea.cerrada || !cs.length) return [];
    const acum = linea.acum || acumulado(linea.poly), L = acum[acum.length - 1], out = [];
    if (cs[0] > 1e-6 && cs[0] <= tol) out.push([0, cs[0]]);
    const ult = cs[cs.length - 1];
    if (L - ult > 1e-6 && L - ult <= tol) out.push([ult, L]);
    return out;
  }

  /** Qué puntas cerrar con qué. `puntas`: [{ id, extremo: 0|1, x, y }]. Se
   *  arman los pares más cercanos primero, cada punta una sola vez, sin unir
   *  las dos puntas de una misma línea demasiado corta (sería un punto). */
  function huecos(puntas, tol) {
    const pares = [];
    for (let i = 0; i < puntas.length; i++) for (let j = i + 1; j < puntas.length; j++) {
      const a = puntas[i], b = puntas[j];
      if (a.id === b.id && a.extremo === b.extremo) continue;
      if (a.id === b.id && a.largo != null && a.largo < tol * 3) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d <= tol && d > 1e-6) pares.push({ a, b, d });
    }
    pares.sort((x, y) => x.d - y.d);
    const usadas = new Set(), out = [];
    for (const p of pares) {
      const ka = p.a.id + ":" + p.a.extremo, kb = p.b.id + ":" + p.b.extremo;
      if (usadas.has(ka) || usadas.has(kb)) continue;
      usadas.add(ka); usadas.add(kb); out.push(p);
    }
    return out;
  }

  /** Dos polilíneas soldadas: `ea` y `eb` dicen qué punta (0 = inicio,
   *  1 = final) de cada una se toca. La de `a` queda primero. */
  function unir(a, ea, b, eb) {
    const A = ea === 1 ? a.map((p) => p.slice()) : a.map((p) => p.slice()).reverse();
    const B = eb === 0 ? b.map((p) => p.slice()) : b.map((p) => p.slice()).reverse();
    return A.concat(B);
  }

  /** Ramer-Douglas-Peucker: menos puntos, la misma forma (hasta eps). */
  function simplificar(pts, eps) {
    if (pts.length < 3) return pts.slice();
    const marca = new Uint8Array(pts.length); marca[0] = marca[pts.length - 1] = 1;
    const pila = [[0, pts.length - 1]];
    while (pila.length) {
      const [i, j] = pila.pop();
      const a = pts[i], b = pts[j], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
      let k = -1, dmax = 0;
      for (let m = i + 1; m < j; m++) {
        const d = L > EPS ? Math.abs((pts[m][0] - a[0]) * dy - (pts[m][1] - a[1]) * dx) / L : Math.hypot(pts[m][0] - a[0], pts[m][1] - a[1]);
        if (d > dmax) { dmax = d; k = m; }
      }
      if (k > 0 && dmax > eps) { marca[k] = 1; pila.push([i, k], [k, j]); }
    }
    return pts.filter((_, i) => marca[i]);
  }

  const api = { acumulado, puntoEn, sub, cruceSeg, crucesEntre, masCercano, cortes, tramo, quedan, polyDe, quitar,
                partir, partirIntervalos, sobrantes, huecos, unir, simplificar, caja,
                segmentar, evalSeg, aplanar, posEn, subSeg, trozo, invertir, transformar, dDe };
  global.LOW = global.LOW || {};
  global.LOW.vector = global.LOW.vector || {};
  global.LOW.vector.limpieza = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
