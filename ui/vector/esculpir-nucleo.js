/* ══════════════════════════════════════════════════════════════════════════
   ESCULPIR TRAZOS — el núcleo (matemática pura, sin pantalla)

   Pedido de Mauro (oct-2026): un pincel que DEFORMA un trazo existente como el
   Sculpt Mode de Blender —empujar, atraer, agarrar, suavizar, relajar,
   pellizcar, expandir, enderezar, curvar— y un modo REDIBUJAR: se dibuja
   encima de un tramo el recorrido que se quiere y el trazo lo toma, sin crear
   otra línea. «Que se sienta como modelar una línea con el lápiz, no como
   editar nodos». Y aclaró: una herramienta NUEVA, no sobre el deformador
   que ya existe.

   Un trazo es una lista de puntos [x, y, presión, ...resto] en las
   coordenadas del elemento: la misma forma que guarda el Pincel en
   `data-low-brush-points` (resto = inclinación x/y, giro, tiempo). Todo lo de
   acá recibe y devuelve esa lista; la pantalla (ui/vector/esculpir.js) la
   lee del trazo, la deforma y lo vuelve a dibujar con su mismo pincel.

   INTERPOLACIÓN, que es lo que importa:
   - antes de deformar se SUBDIVIDE (un trazo simplificado tiene pocos puntos
     y moverlos uno por uno deja rectas y picos);
   - la caída del pincel es suave (smoothstep): sin escalón en el borde;
   - si un tramo se estira, se vuelve a subdividir en el mismo gesto;
   - al terminar se SIMPLIFICA para no acumular geometría (con la presión
     como tercera dimensión: no se pierde la variación de grosor).

   @module vector/esculpir-nucleo
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const lerp = (a, b, t) => a + (b - a) * t;
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const copia = (pts) => pts.map((p) => p.slice());

  /** Interpola TODOS los canales (x, y, presión, inclinación…) entre a y b. */
  function mezcla(a, b, t) {
    const n = Math.max(a.length, b.length), out = new Array(n);
    for (let k = 0; k < n; k++) out[k] = lerp(a[k] ?? b[k] ?? 0, b[k] ?? a[k] ?? 0, t);
    return out;
  }

  /** Inserta puntos donde un tramo pasa de `paso`: la deformación necesita detalle. */
  function subdividir(pts, paso) {
    if (pts.length < 2 || !(paso > 0)) return copia(pts);
    const out = [pts[0].slice()];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = dist(a, b), n = Math.min(400, Math.ceil(d / paso));
      for (let k = 1; k < n; k++) out.push(mezcla(a, b, k / n));
      out.push(b.slice());
    }
    return out;
  }

  /** Remuestrea a distancia pareja (para el recorrido nuevo de Redibujar). */
  function remuestrear(pts, paso) {
    if (pts.length < 2) return copia(pts);
    const out = [pts[0].slice()];
    let resto = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], d = dist(a, b);
      if (!d) continue;
      let s = paso - resto;
      while (s <= d) { out.push(mezcla(a, b, s / d)); s += paso; }
      resto = d - (s - paso);
    }
    const ult = pts[pts.length - 1];
    if (dist(out[out.length - 1], ult) > paso * .25) out.push(ult.slice()); else out[out.length - 1] = ult.slice();
    return out;
  }

  /** RDP con la presión como tercera dimensión (escalada): se queda con lo que hace falta. */
  function simplificar(pts, tol, escalaPresion = 4) {
    if (pts.length < 3) return copia(pts);
    const queda = new Uint8Array(pts.length); queda[0] = queda[pts.length - 1] = 1;
    const pila = [[0, pts.length - 1]];
    const d3 = (p, a, b) => {
      const ax = a[0], ay = a[1], az = (a[2] ?? 1) * escalaPresion;
      const bx = b[0] - ax, by = b[1] - ay, bz = (b[2] ?? 1) * escalaPresion - az;
      const px = p[0] - ax, py = p[1] - ay, pz = (p[2] ?? 1) * escalaPresion - az;
      const l2 = bx * bx + by * by + bz * bz || 1e-12, t = Math.max(0, Math.min(1, (px * bx + py * by + pz * bz) / l2));
      return Math.hypot(px - bx * t, py - by * t, pz - bz * t);
    };
    while (pila.length) {
      const [i, j] = pila.pop();
      let peor = -1, max = tol;
      for (let k = i + 1; k < j; k++) { const d = d3(pts[k], pts[i], pts[j]); if (d > max) { max = d; peor = k; } }
      if (peor > 0) { queda[peor] = 1; pila.push([i, peor], [peor, j]); }
    }
    return pts.filter((_, k) => queda[k]).map((p) => p.slice());
  }

  /** La CAÍDA del pincel: 1 en el centro, 0 en el borde, sin escalón. */
  function caida(t, tipo = "suave") {
    if (!(t < 1)) return 0;
    const u = Math.max(0, t);
    if (tipo === "lineal") return 1 - u;
    if (tipo === "firme") return 1 - Math.pow(u, 4);
    return 1 - u * u * (3 - 2 * u);               // smoothstep invertido
  }

  /** Normal unitaria del trazo en el punto i (de los vecinos). */
  function normal(pts, i) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    return [-dy / l, dx / l];
  }
  function tangente(pts, i) { const n = normal(pts, i); return [n[1], -n[0]]; }

  /** Largo acumulado de cada punto (para las caídas «a lo largo del trazo»). */
  function largos(pts) {
    const s = [0];
    for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + dist(pts[i - 1], pts[i]));
    return s;
  }
  function masCercano(pts, c) {
    let mejor = -1, d = Infinity;
    for (let i = 0; i < pts.length; i++) { const q = dist(pts[i], c); if (q < d) { d = q; mejor = i; } }
    return { i: mejor, d };
  }

  /** Los pesos de cada punto para un pincel en c de radio R. */
  function pesos(pts, c, R, tipo) { return pts.map((p) => caida(dist(p, c) / R, tipo)); }

  /* ── LAS OPERACIONES DE UN PASO (se llaman en cada movimiento del lápiz) ──
     ctx: { c:[x,y], R, k (fuerza 0..1, ya con la presión), delta:[dx,dy]
     (movimiento del lápiz desde el paso anterior), caida, perpendicular:bool }.
     Los extremos del trazo se mueven como cualquier punto salvo en suavizar,
     relajar y enderezar, que los dejan quietos (si no, el trazo se encoge). */
  const OPERACIONES = {
    empujar(pts, x) {
      return pts.map((p, i) => {
        const w = caida(dist(p, x.c) / x.R, x.caida) * x.k;
        if (!w) return p;
        let dx = x.delta[0], dy = x.delta[1];
        if (x.perpendicular) { const n = normal(pts, i), pr = dx * n[0] + dy * n[1]; dx = n[0] * pr; dy = n[1] * pr; }
        const q = p.slice(); q[0] += dx * w; q[1] += dy * w; return q;
      });
    },
    atraer(pts, x) {
      return pts.map((p, i) => {
        const w = caida(dist(p, x.c) / x.R, x.caida) * x.k * .25;
        if (!w) return p;
        const n = normal(pts, i), pr = (x.c[0] - p[0]) * n[0] + (x.c[1] - p[1]) * n[1];
        const q = p.slice(); q[0] += n[0] * pr * w; q[1] += n[1] * pr * w; return q;
      });
    },
    pellizcar(pts, x) {
      return pts.map((p) => {
        const w = caida(dist(p, x.c) / x.R, x.caida) * x.k * .12;
        if (!w) return p;
        const q = p.slice(); q[0] += (x.c[0] - p[0]) * w; q[1] += (x.c[1] - p[1]) * w; return q;
      });
    },
    expandir(pts, x) {
      return pts.map((p) => {
        const d = dist(p, x.c), w = caida(d / x.R, x.caida) * x.k * .12;
        if (!w || !d) return p;
        const q = p.slice(); q[0] += (p[0] - x.c[0]) / d * x.R * w * .5; q[1] += (p[1] - x.c[1]) / d * x.R * w * .5; return q;
      });
    },
    suavizar(pts, x) {
      if (pts.length < 3) return pts;
      return pts.map((p, i) => {
        if (i === 0 || i === pts.length - 1) return p;
        const w = caida(dist(p, x.c) / x.R, x.caida) * x.k * .6;
        if (!w) return p;
        const a = pts[i - 1], b = pts[i + 1], q = p.slice();
        q[0] += ((a[0] + b[0]) / 2 - p[0]) * w; q[1] += ((a[1] + b[1]) / 2 - p[1]) * w;
        if (q[2] != null && a[2] != null && b[2] != null) q[2] += ((a[2] + b[2]) / 2 - p[2]) * w * .5;
        return q;
      });
    },
    relajar(pts, x) {
      if (pts.length < 3) return pts;
      return pts.map((p, i) => {
        if (i === 0 || i === pts.length - 1) return p;
        const w = caida(dist(p, x.c) / x.R, x.caida) * x.k * .7;
        if (!w) return p;
        const a = pts[i - 1], b = pts[i + 1], t = tangente(pts, i);
        const lx = (a[0] + b[0]) / 2 - p[0], ly = (a[1] + b[1]) / 2 - p[1], pr = lx * t[0] + ly * t[1];
        const q = p.slice(); q[0] += t[0] * pr * w; q[1] += t[1] * pr * w; return q;
      });
    },
    enderezar(pts, x) {
      // por cada tramo seguido dentro del pincel: la recta entre sus puntas
      const w = pesos(pts, x.c, x.R, x.caida), out = copia(pts);
      let i = 0;
      while (i < pts.length) {
        if (!w[i]) { i++; continue; }
        let j = i; while (j + 1 < pts.length && w[j + 1]) j++;
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, j + 1)];
        const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
        for (let k = i; k <= j; k++) {
          if (k === 0 || k === pts.length - 1) continue;
          const p = pts[k], t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2;
          const fx = a[0] + dx * t, fy = a[1] + dy * t, m = w[k] * x.k * .35;
          out[k][0] = lerp(p[0], fx, m); out[k][1] = lerp(p[1], fy, m);
        }
        i = j + 1;
      }
      return out;
    },
  };

  /* ── AGARRAR y CURVAR: el gesto entero, desde donde se apoyó ──────────────
     Los pesos se fijan al apoyar (Blender Grab): lo agarrado sigue al lápiz
     aunque el lápiz se aleje. CURVAR mide la caída A LO LARGO DEL TRAZO y
     mueve sólo en la normal del punto agarrado: arquea el tramo sin
     amontonar puntos y sin arrastrar lo que está cerca en el papel pero lejos
     en el trazo. */
  function agarrarInicio(pts, c, R, tipo) { return { base: copia(pts), w: pesos(pts, c, R, tipo) }; }
  function agarrarMover(g, delta, k = 1) {
    return g.base.map((p, i) => { const w = g.w[i] * k; if (!w) return p.slice(); const q = p.slice(); q[0] += delta[0] * w; q[1] += delta[1] * w; return q; });
  }
  function curvarInicio(pts, c, R, tipo) {
    const m = masCercano(pts, c), s = largos(pts);
    const w = s.map((v) => caida(Math.abs(v - s[m.i]) / R, tipo));
    return { base: copia(pts), w, n: normal(pts, m.i) };
  }
  function curvarMover(g, delta, k = 1) {
    const pr = delta[0] * g.n[0] + delta[1] * g.n[1];
    return g.base.map((p, i) => { const w = g.w[i] * k; if (!w) return p.slice(); const q = p.slice(); q[0] += g.n[0] * pr * w; q[1] += g.n[1] * pr * w; return q; });
  }

  /* ── REDIBUJAR ────────────────────────────────────────────────────────────
     1. el tramo: los puntos del trazo más cercanos al principio y al final de
        lo dibujado (las dos puntas tienen que caer cerca del trazo);
     2. lo dibujado es la guía: se remuestrea y toma la presión del tramo
        original (a lo largo, proporcional);
     3. se CORRIGE para que arranque y termine exacto en el trazo (la
        corrección se apaga hacia el medio): sin escalón;
     4. se suavizan unos puntos a cada lado de las uniones: sin quiebre.
     Devuelve null si lo dibujado no toca el trazo en sus dos puntas. */
  function tramoARedibujar(pts, guia, tol) {
    if (pts.length < 2 || guia.length < 2) return null;
    const a = masCercano(pts, guia[0]), b = masCercano(pts, guia[guia.length - 1]);
    if (a.d > tol || b.d > tol || a.i === b.i) return null;
    return { i0: a.i, i1: b.i, error: a.d + b.d };
  }
  function redibujar(pts, guiaCruda, tol, paso) {
    const t = tramoARedibujar(pts, guiaCruda, tol);
    if (!t) return null;
    let { i0, i1 } = t, guia = guiaCruda.map((p) => [p[0], p[1]]);
    if (i0 > i1) { [i0, i1] = [i1, i0]; guia = guia.slice().reverse(); }
    guia = remuestrear(guia, paso);
    if (guia.length < 2) return null;
    // la presión y el resto de los canales: del tramo original, a lo largo
    const sOrig = largos(pts.slice(i0, i1 + 1)), Lo = sOrig[sOrig.length - 1] || 1;
    const sGuia = largos(guia), Lg = sGuia[sGuia.length - 1] || 1;
    const canal = (u) => {   // u en 0..1 a lo largo del tramo original
      const objetivo = u * Lo;
      let j = 0; while (j + 1 < sOrig.length && sOrig[j + 1] < objetivo) j++;
      const a = pts[i0 + j], b = pts[i0 + Math.min(j + 1, sOrig.length - 1)];
      const seg = (sOrig[Math.min(j + 1, sOrig.length - 1)] - sOrig[j]) || 1;
      return mezcla(a, b, Math.max(0, Math.min(1, (objetivo - sOrig[j]) / seg)));
    };
    const e0 = [pts[i0][0] - guia[0][0], pts[i0][1] - guia[0][1]];
    const ult = guia.length - 1, e1 = [pts[i1][0] - guia[ult][0], pts[i1][1] - guia[ult][1]];
    const nuevo = guia.map((g, k) => {
      const u = sGuia[k] / Lg, base = canal(u);
      const c0 = caida(u / .35, "suave"), c1 = caida((1 - u) / .35, "suave");
      base[0] = g[0] + e0[0] * c0 + e1[0] * c1;
      base[1] = g[1] + e0[1] * c0 + e1[1] * c1;
      return base;
    });
    const out = [...copia(pts.slice(0, i0)), ...nuevo, ...copia(pts.slice(i1 + 1))];
    // unas pasadas de suavizado en las uniones
    const uniones = [i0, i0 + nuevo.length - 1], vecinos = 4;
    for (let pasada = 0; pasada < 3; pasada++) {
      for (const u of uniones) {
        for (let k = Math.max(1, u - vecinos); k <= Math.min(out.length - 2, u + vecinos); k++) {
          const w = .5 * (1 - Math.abs(k - u) / (vecinos + 1));
          out[k][0] += ((out[k - 1][0] + out[k + 1][0]) / 2 - out[k][0]) * w;
          out[k][1] += ((out[k - 1][1] + out[k + 1][1]) / 2 - out[k][1]) * w;
        }
      }
    }
    return { pts: out, i0, i1, largoNuevo: nuevo.length };
  }

  /** Mantiene el detalle: si un tramo se estiró más que `paso`, lo subdivide. */
  function mantenerDetalle(pts, paso) {
    for (let i = 1; i < pts.length; i++) if (dist(pts[i - 1], pts[i]) > paso * 1.6) return subdividir(pts, paso);
    return pts;
  }

  /** El mayor giro entre tramos (en grados): mide si quedaron picos. */
  function peorGiro(pts) {
    let max = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
      const b = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
      let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d;
      max = Math.max(max, d * 180 / Math.PI);
    }
    return max;
  }

  const MODOS = [
    ["agarrar", "Agarrar", "Agarra una sección y la lleva adonde va el lápiz"],
    ["empujar", "Empujar", "Empuja el trazo en la dirección del lápiz"],
    ["atraer", "Atraer", "Trae el trazo hacia el cursor"],
    ["curvar", "Curvar", "Arquea un tramo a lo largo del trazo, sin quiebres"],
    ["suavizar", "Suavizar", "Saca las irregularidades del recorrido"],
    ["relajar", "Relajar", "Reparte los puntos parejo sin cambiar la forma"],
    ["enderezar", "Enderezar", "Lleva el tramo de a poco hacia una recta"],
    ["pellizcar", "Pellizcar", "Junta el recorrido hacia el centro del pincel"],
    ["expandir", "Expandir", "Separa el recorrido del centro del pincel"],
    ["redibujar", "Redibujar", "Dibujá encima de un tramo el recorrido que querés: el trazo lo toma"],
  ];

  const api = { mezcla, subdividir, remuestrear, simplificar, caida, normal, largos, masCercano, pesos,
    OPERACIONES, agarrarInicio, agarrarMover, curvarInicio, curvarMover, tramoARedibujar, redibujar,
    mantenerDetalle, peorGiro, MODOS };
  global.LOW = global.LOW || {};
  global.LOW.vector = global.LOW.vector || {};
  global.LOW.vector.esculpir = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
