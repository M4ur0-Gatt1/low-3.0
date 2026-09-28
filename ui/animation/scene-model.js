/* ══════════════════════════════════════════════════════════════════════════
   MODELO DE ESCENA 2D — Scene · Level · Drawing · Layer · Cell

   Es el corazón del módulo de animación, y NO toca el DOM. Antes toda la
   animación era `DZ.anim.frames = [rutas de archivo]`, o sea "un frame es un
   archivo": no existía el dibujo como entidad, así que un dibujo no podía
   ocupar varios frames y los holds eran imposibles. De ahí venía que el papel
   cebolla mirara `idx ± n` en vez de dibujos.

   El modelo separa las dos cosas que la animación tradicional tiene separadas
   desde siempre (y que OpenToonz respeta en su Xsheet):

     Level   = el material dibujado          Layer/Cell = el TIEMPO
     ├ Drawing 1                             frame 1 → dibujo 1
     ├ Drawing 2                             frame 2 → dibujo 1   ← hold
     └ Drawing 3                             frame 3 → dibujo 2

   Reglas que el resto del programa puede dar por ciertas:
     1. Drawing ≠ Frame. El dibujo vive en el Level; la celda lo REFERENCIA.
     2. La misma referencia en celdas seguidas ES un hold. Nada se duplica.
     3. Borrar una celda NO borra el dibujo (son operaciones distintas).
     4. Mover exposiciones reordena referencias, nunca contenido.

   @module animation/scene-model
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};
  const DEFAULT_WIDTH = 1920;
  const DEFAULT_HEIGHT = 1080;
  const documentDimension = (value, fallback) => {
    const n = Math.round(Number(value));
    return Number.isFinite(n) && n >= 16 ? Math.min(16384, n) : fallback;
  };

  const clone = (v) => (v == null ? v : JSON.parse(JSON.stringify(v)));
  let seq = 0;
  const uid = (p) => `${p}_${(seq++).toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

  const rigPoseData = (pose = {}) => ({ x: +pose.x || 0, y: +pose.y || 0,
    r: +pose.r || 0,
    sx: pose.sx == null ? (pose.s == null ? 1 : +pose.s) : +pose.sx,
    sy: pose.sy == null ? (pose.s == null ? 1 : +pose.s) : +pose.sy });

  /* ── CURVAS DE INTERPOLACION ──────────────────────────────────────────
     Cada clave lleva dos manijas: `eo` gobierna como SALE hacia la clave
     siguiente y `ei` como LLEGA desde la anterior. El tramo A->B usa la de
     salida de A y la de entrada de B, igual que un cubic-bezier de CSS.
     Con las manijas por defecto la curva es exactamente la recta, asi que
     todo lo que ya estaba animado se sigue viendo igual. */
  const EASE_OUT_LINEAL = [1 / 3, 1 / 3];
  const EASE_IN_LINEAL = [2 / 3, 2 / 3];
  const clampX = (v, d) => Number.isFinite(+v) ? Math.max(0, Math.min(1, +v)) : d;
  const manija = (m, dx, dy) => Array.isArray(m) && m.length === 2
    ? [clampX(m[0], dx), Number.isFinite(+m[1]) ? +m[1] : dy] : [dx, dy];

  const rigEaseData = (e = {}) => ({
    eo: manija(e.eo, EASE_OUT_LINEAL[0], EASE_OUT_LINEAL[1]),
    ei: manija(e.ei, EASE_IN_LINEAL[0], EASE_IN_LINEAL[1]),
    hold: !!e.hold });

  const bezX = (s, x1, x2) => { const u = 1 - s;
    return 3 * u * u * s * x1 + 3 * u * s * s * x2 + s * s * s; };
  const bezY = (s, y1, y2) => { const u = 1 - s;
    return 3 * u * u * s * y1 + 3 * u * s * s * y2 + s * s * s; };

  /** El parametro de la curva cuyo avance horizontal es `t`. Newton primero,
   *  biseccion de respaldo: Newton solo se planta en tramos casi verticales. */
  function bezSolve(t, x1, x2) {
    let s = t;
    for (let i = 0; i < 8; i++) {
      const dx = bezX(s, x1, x2) - t;
      if (Math.abs(dx) < 1e-6) return s;
      const u = 1 - s;
      const d = 3 * u * u * x1 + 6 * u * s * (x2 - x1) + 3 * s * s * (1 - x2);
      if (Math.abs(d) < 1e-6) break;
      s -= dx / d;
    }
    let lo = 0, hi = 1; s = t;
    for (let i = 0; i < 30; i++) {
      const x = bezX(s, x1, x2);
      if (Math.abs(x - t) < 1e-6) break;
      if (x < t) lo = s; else hi = s;
      s = (lo + hi) / 2;
    }
    return s;
  }

  /** Curva el avance `t` (0..1) de un tramo segun las manijas de sus extremos. */
  function rigEaseT(t, easeA, easeB) {
    const a = rigEaseData(easeA), b = rigEaseData(easeB);
    if (a.hold) return 0;                       // escalon: sostiene hasta la proxima
    const [x1, y1] = a.eo, [x2, y2] = b.ei;
    if (Math.abs(x1 - EASE_OUT_LINEAL[0]) < 1e-9 && Math.abs(y1 - EASE_OUT_LINEAL[1]) < 1e-9 &&
        Math.abs(x2 - EASE_IN_LINEAL[0]) < 1e-9 && Math.abs(y2 - EASE_IN_LINEAL[1]) < 1e-9)
      return t;                                 // recta: sin cuentas de mas
    return bezY(bezSolve(t, x1, x2), y1, y2);
  }


  /* == DEFORMADOR DE CURVA ==================================================
     Hasta aca una pieza solo podia ROTAR entera: sirve para un brazo, no para
     el pelo, una cola o una manga. El deformador dobla el dibujo a lo largo de
     una curva de control.

     Como: cada punto del dibujo se guarda en coordenadas curvilineas respecto
     de la curva EN REPOSO —cuanto avanzo a lo largo (s) y cuanto me separo en
     perpendicular (d)— y se lo vuelve a colocar sobre la curva POSADA con el
     mismo (s, d). Si las dos curvas son iguales, el punto no se mueve: por eso
     un deformador recien creado no cambia nada. */

  const CURVA_MUESTRAS = 96;      // suficiente para que no se vean facetas

  /** Catmull-Rom: pasa POR los puntos de control, que es lo que espera quien
   *  los arrastra. Con Bezier habria que explicar manijas que nadie pidio. */
  function curvaPunto(pts, t) {
    const n = pts.length;
    if (n === 0) return { x: 0, y: 0 };
    if (n === 1) return { x: pts[0].x, y: pts[0].y };
    if (n === 2) return { x: pts[0].x + (pts[1].x - pts[0].x) * t,
                          y: pts[0].y + (pts[1].y - pts[0].y) * t };
    const seg = Math.min(Math.floor(t * (n - 1)), n - 2);
    const u = t * (n - 1) - seg;
    const p0 = pts[Math.max(0, seg - 1)], p1 = pts[seg], p2 = pts[seg + 1],
          p3 = pts[Math.min(n - 1, seg + 2)];
    const u2 = u * u, u3 = u2 * u;
    return {
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * u +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
      y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * u +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3)
    };
  }

  /** Muestreo con longitud de arco acumulada: sin esto, los tramos largos de
   *  la curva comprimirian el dibujo y los cortos lo estirarian. */
  function curvaMuestrear(pts) {
    const ms = [];
    let largo = 0;
    let previo = curvaPunto(pts, 0);
    ms.push({ ...previo, s: 0 });
    for (let i = 1; i <= CURVA_MUESTRAS; i++) {
      const q = curvaPunto(pts, i / CURVA_MUESTRAS);
      largo += Math.hypot(q.x - previo.x, q.y - previo.y);
      ms.push({ ...q, s: largo });
      previo = q;
    }
    if (largo > 1e-9) for (const m of ms) m.s /= largo;   // normalizado 0..1
    return { ms, largo };
  }

  /** Tangente unitaria en la muestra i. */
  function curvaTangente(ms, i) {
    const a = ms[Math.max(0, i - 1)], b = ms[Math.min(ms.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, h = Math.hypot(dx, dy);
    return h < 1e-9 ? { x: 1, y: 0 } : { x: dx / h, y: dy / h };
  }

  /** Punto y marco (tangente/normal) a lo largo de la curva, en s de 0 a 1. */
  function curvaEnS(muestreo, s) {
    const ms = muestreo.ms;
    const t = Math.max(0, Math.min(1, s));
    let i = 0;
    while (i < ms.length - 2 && ms[i + 1].s < t) i++;
    const a = ms[i], b = ms[i + 1] || a;
    const span = (b.s - a.s) || 1e-9;
    const u = Math.max(0, Math.min(1, (t - a.s) / span));
    const ta = curvaTangente(ms, i), tb = curvaTangente(ms, Math.min(ms.length - 1, i + 1));
    const tx = ta.x + (tb.x - ta.x) * u, ty = ta.y + (tb.y - ta.y) * u;
    const h = Math.hypot(tx, ty) || 1;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u,
             tx: tx / h, ty: ty / h, nx: -ty / h, ny: tx / h };
  }

  /** Coordenadas curvilineas de un punto respecto de una curva: cuanto avanza
   *  a lo largo (s, 0..1) y cuanto se separa en perpendicular (d, con signo).
   *  Fuera de los extremos se extiende la recta tangente, para que un dibujo
   *  mas largo que su curva no se amontone en las puntas. */
  function curvaCoordenadas(muestreo, punto) {
    const ms = muestreo.ms;
    let mejor = { dist2: Infinity, i: 0, u: 0 };
    for (let i = 0; i < ms.length - 1; i++) {
      const a = ms[i], b = ms[i + 1];
      const vx = b.x - a.x, vy = b.y - a.y;
      const len2 = vx * vx + vy * vy;
      let u = len2 < 1e-12 ? 0 : ((punto.x - a.x) * vx + (punto.y - a.y) * vy) / len2;
      u = Math.max(0, Math.min(1, u));
      const px = a.x + vx * u, py = a.y + vy * u;
      const dist2 = (punto.x - px) ** 2 + (punto.y - py) ** 2;
      if (dist2 < mejor.dist2) mejor = { dist2, i, u };
    }
    const a = ms[mejor.i], b = ms[mejor.i + 1];
    const s = a.s + (b.s - a.s) * mejor.u;
    const marco = curvaEnS(muestreo, s);
    const d = (punto.x - marco.x) * marco.nx + (punto.y - marco.y) * marco.ny;
    // avance mas alla del extremo, medido en unidades de la curva
    let extra = 0;
    if (s <= 1e-6 || s >= 1 - 1e-6) {
      const fin = s <= 1e-6 ? curvaEnS(muestreo, 0) : curvaEnS(muestreo, 1);
      extra = (punto.x - fin.x) * fin.tx + (punto.y - fin.y) * fin.ty;
      if (s <= 1e-6 && extra > 0) extra = 0;      // adentro: no es desborde
      if (s >= 1 - 1e-6 && extra < 0) extra = 0;
    }
    return { s, d, extra };
  }

  /** Recoloca un punto: mismas coordenadas curvilineas, otra curva. */
  function curvaAplicar(muestreoPosado, coord, escalaLargo) {
    const marco = curvaEnS(muestreoPosado, coord.s);
    const extra = (coord.extra || 0) * (escalaLargo || 1);
    return { x: marco.x + marco.nx * coord.d + marco.tx * extra,
             y: marco.y + marco.ny * coord.d + marco.ty * extra };
  }

  /** Un deformador listo para usar: mapea puntos del reposo a la pose. */
  function rigDeformador(reposo, posado) {
    const a = curvaMuestrear(reposo), b = curvaMuestrear(posado);
    const escala = a.largo > 1e-9 ? b.largo / a.largo : 1;
    return {
      largoReposo: a.largo, largoPosado: b.largo,
      punto(p) { return curvaAplicar(b, curvaCoordenadas(a, p), escala); }
    };
  }

  /** Un hueso con el rango completo (-180 a 180) NO tiene tope: gira todo lo
   *  que haga falta, varias vueltas si hace falta —una helice, una rueda, un
   *  brazo que da la vuelta—. Recortar ahi impedia dar el giro entero, que es
   *  justo lo que un tope NO tiene que hacer. */
  const rigSinTope = (limits) =>
    (limits?.min ?? -180) <= -180 && (limits?.max ?? 180) >= 180;

  /** Aplica el tope de un hueso a un angulo. Sin tope, lo deja pasar entero. */
  const rigAplicarTope = (limits, r) => rigSinTope(limits) ? r
    : Math.max(limits.min, Math.min(limits.max, r));

  const rigChannelPath = (boneId, property) =>
    `bones/${encodeURIComponent(boneId)}/pose/${property}`;

  /** Claves de sustitucion de dibujo por slot. Se descartan las que apunten a
   *  un dibujo que ya no existe: si no, el slot quedaria vacio en ese cuadro. */
  const rigSwitchesData = (source = {}, attachments = {}) => {
    const out = {};
    for (const [slotId, sw] of Object.entries(source || {})) {
      const keys = {};
      for (const [frame, attachmentId] of Object.entries((sw && sw.keys) || {})) {
        const f = Math.max(1, Math.round(+frame));
        if (Number.isFinite(f) && attachments[attachmentId]) keys[f] = attachmentId;
      }
      if (Object.keys(keys).length) out[slotId] = { slotId, keys };
    }
    return out;
  };

  /** JUEGOS DE VISTAS (C04) — el giro de cabeza hecho con dibujos, no con
   *  matemática.
   *
   *  Una cabeza no gira interpolando: gira porque el animador DIBUJÓ el frente,
   *  el tres cuartos y el perfil, y en cada punto del giro se muestra el dibujo
   *  que corresponde. Eso ya se podía hacer a mano —las sustituciones por slot
   *  existen— pero había que clavar la sustitución cuadro por cuadro, que es
   *  justo el trabajo que un control de actuación viene a sacar.
   *
   *  Un juego de vistas ata un SLOT a un CONTROL: cada vista dice en qué valor
   *  del control manda ella. Animás el control y aparece el dibujo que toca.
   *
   *  LO QUE NO HACE, a propósito: no inventa un giro de 360°. Si sólo dibujaste
   *  frente y perfil, el juego cubre lo que va de uno a otro y lo DICE
   *  (`rigViewSetCoverage`). Prometer un giro completo con dos dibujos es
   *  mentirle a quien después tiene que animar con eso.
   *
   *  La sustitución es DISCRETA: dos dibujos no se mezclan. Entre dos vistas
   *  manda la más cercana, y el empate cae siempre en la de valor menor, para
   *  que el mismo valor dé siempre el mismo dibujo. */
  const rigViewSetsData = (source = {}, attachments = {}, slots = {}) => {
    const out = {};
    for (const [id, raw] of Object.entries(source || {})) {
      if (!id || !raw) continue;
      const slotId = raw.slotId && slots[raw.slotId] ? String(raw.slotId) : null;
      if (!slotId) continue;                       // un juego sin slot no muestra nada
      const driver = raw.driver && raw.driver.path ? {
        path: String(raw.driver.path),
        min: Number.isFinite(+raw.driver.min) ? +raw.driver.min : -90,
        max: Number.isFinite(+raw.driver.max) ? +raw.driver.max : 90,
      } : null;
      // Se descarta la vista que apunte a un dibujo que ya no existe: si no, el
      // giro tendría un agujero y nadie se enteraría hasta verlo en pantalla.
      const vistas = [];
      for (const v of (Array.isArray(raw.views) ? raw.views : [])) {
        if (!v || !attachments[v.attachmentId]) continue;
        const at = Number(v.at);
        if (!Number.isFinite(at)) continue;
        if (vistas.some((x) => x.attachmentId === v.attachmentId)) continue;
        // EL CORRECTIVO DE LA VISTA. Al girar la cabeza las piezas que van
        // encima no caen solas en su lugar: de tres cuartos el ojo se corre y
        // la oreja se achica. Eso no es una interpolación —el dibujo cambió de
        // golpe—, así que es un ajuste FIJO que vale mientras esa vista manda.
        // Se suma en el mismo lugar que las acciones, para que compongan.
        const fix = {};
        for (const [pieza, pose] of Object.entries((v.fix && typeof v.fix === "object") ? v.fix : {})) {
          const limpio = {};
          for (const prop of ["x", "y", "r", "sx", "sy"]) {
            const n = Number(pose && pose[prop]);
            if (Number.isFinite(n) && n !== 0) limpio[prop] = n;
          }
          if (Object.keys(limpio).length) fix[String(pieza)] = limpio;
        }
        vistas.push({ attachmentId: String(v.attachmentId), at,
          name: typeof v.name === "string" ? v.name : "",
          // el orden de los slots puede cambiar con la vista: de perfil, la
          // nariz cruza la cara y lo que estaba atrás pasa adelante
          order: Array.isArray(v.order) ? v.order.map(String) : null,
          fix: Object.keys(fix).length ? fix : null });
      }
      vistas.sort((a, b) => a.at - b.at || a.attachmentId.localeCompare(b.attachmentId));
      out[id] = { id, name: raw.name || id, slotId, driver,
        enabled: raw.enabled !== false, views: vistas };
    }
    return out;
  };

  /** CONJUNTOS DE CONTROLES APLICADOS (C05). Deja escrito en la escena quién
   *  aplicó qué conjunto y sobre qué piezas. Sin esto, mañana no hay manera de
   *  saber por qué existe un control llamado «boca_forma» ni a qué pieza
   *  corresponde: el vínculo viviría sólo en la cabeza de quien lo armó.
   *
   *  NO se descarta un conjunto cuyas piezas ya no existan. Es tentador
   *  limpiarlo, pero borrar el vínculo hace desaparecer la única pista de que
   *  esos controles quedaron huérfanos; se conserva y `rigDiagnostics` lo
   *  señala, que es lo que el resto del rig hace con las referencias rotas. */
  const rigControlSetsData = (source = {}) => {
    const out = {};
    for (const [id, raw] of Object.entries(source || {})) {
      if (!id || !raw) continue;
      const mapa = {};
      for (const [rol, pieza] of Object.entries(raw.mapa || {}))
        if (rol && pieza) mapa[String(rol)] = String(pieza);
      const controles = (Array.isArray(raw.controles) ? raw.controles : []).map(String);
      out[id] = { id: String(id), setId: String(raw.setId || id),
        name: raw.name || id, mapa, controles };
    }
    return out;
  };

  /** Qué parte del recorrido está DIBUJADA, y qué falta.
   *
   *  Es la pieza que impide prometer un giro que no existe: devuelve el tramo
   *  que cubren las vistas que hay, si llega a los extremos que el control
   *  declara, y los huecos entre vistas contiguas. La interfaz muestra esto
   *  en vez de un giro completo imaginario. */
  const rigViewSetCoverage = (juego) => {
    const vistas = (juego && juego.views) || [];
    if (!vistas.length) return { vistas: 0, desde: null, hasta: null, completo: false, huecos: [] };
    const desde = vistas[0].at, hasta = vistas[vistas.length - 1].at;
    const huecos = [];
    for (let i = 1; i < vistas.length; i++)
      huecos.push({ desde: vistas[i - 1].at, hasta: vistas[i].at,
                    salto: Math.abs(vistas[i].at - vistas[i - 1].at) });
    const d = juego.driver;
    const llegaAlMinimo = !d || desde <= d.min + 1e-9;
    const llegaAlMaximo = !d || hasta >= d.max - 1e-9;
    return { vistas: vistas.length, desde, hasta, huecos,
             llegaAlMinimo, llegaAlMaximo,
             completo: vistas.length >= 2 && llegaAlMinimo && llegaAlMaximo };
  };

  /** Qué vista manda para un valor del control. Discreta: la más cercana, y el
   *  empate cae en la de valor menor. `fuera` avisa que el valor se pasó de lo
   *  dibujado y se está sosteniendo el extremo — no es lo mismo que haber
   *  dibujado esa vuelta. */
  const rigViewAt = (juego, valor) => {
    const vistas = (juego && juego.enabled !== false && juego.views) || [];
    if (!vistas.length) return null;
    const v = Number(valor);
    if (!Number.isFinite(v)) return { ...vistas[0], fuera: false };
    let elegida = vistas[0], mejor = Math.abs(vistas[0].at - v);
    for (const vista of vistas) {
      const d = Math.abs(vista.at - v);
      if (d < mejor - 1e-9) { mejor = d; elegida = vista; }
    }
    const fuera = v < vistas[0].at - 1e-9 || v > vistas[vistas.length - 1].at + 1e-9;
    return { ...elegida, fuera };
  };

  /** Deformadores por pieza. Se descartan los que no tengan una curva usable:
   *  con menos de dos puntos no hay nada que doblar. */
  const rigDeformersData = (source = {}) => {
    const punto = (q) => ({ x: +q.x || 0, y: +q.y || 0 });
    const lista = (arr) => Array.isArray(arr) ? arr.filter((q) => q && Number.isFinite(+q.x)
      && Number.isFinite(+q.y)).map(punto) : [];
    const out = {};
    for (const [boneId, d] of Object.entries(source || {})) {
      const rest = lista(d && d.rest);
      if (rest.length < 2) continue;
      const keys = {};
      for (const [frame, pts] of Object.entries((d && d.keys) || {})) {
        const f = Math.max(1, Math.round(+frame)), curva = lista(pts);
        // una clave con otra cantidad de puntos no se puede mezclar con el reposo
        if (Number.isFinite(f) && curva.length === rest.length) keys[f] = curva;
      }
      out[boneId] = { id: d.id || `deformer:${boneId}`, boneId, type: "curve",
        enabled: d.enabled !== false, rest, keys };
    }
    return out;
  };

  /* == MALLA DE DEFORMACIÓN (lattice / FFD) =================================
     Nivel "profesional" (biblia §4.3): en vez de seguir un hueso rígido, el
     dibujo se DOBLA arrastrando una rejilla de puntos de control encima suyo.
     Cómo: la rejilla en reposo es regular sobre el bounding box de la pieza;
     cada punto del dibujo se ubica por sus coordenadas bilineales dentro de su
     celda y se lo recoloca con las MISMAS coords sobre la rejilla POSADA. Si
     reposo == posado, el punto no se mueve (una malla recién creada no cambia
     nada, igual que el deformador de curva). */
  function rigMalla(reposo, posado, nx, ny) {
    nx = Math.max(2, nx | 0); ny = Math.max(2, ny | 0);
    let bx = Infinity, by = Infinity, mx = -Infinity, my = -Infinity;
    for (const p of reposo) { if (p.x < bx) bx = p.x; if (p.y < by) by = p.y; if (p.x > mx) mx = p.x; if (p.y > my) my = p.y; }
    const bw = (mx - bx) || 1e-9, bh = (my - by) || 1e-9;
    const idx = (c, r) => r * nx + c;
    return {
      nx, ny,
      punto(p) {
        let gx = ((p.x - bx) / bw) * (nx - 1), gy = ((p.y - by) / bh) * (ny - 1);
        gx = Math.max(0, Math.min(nx - 1, gx)); gy = Math.max(0, Math.min(ny - 1, gy));
        const c = Math.min(nx - 2, Math.floor(gx)), r = Math.min(ny - 2, Math.floor(gy));
        const u = gx - c, v = gy - r;
        const a = posado[idx(c, r)], b = posado[idx(c + 1, r)], d0 = posado[idx(c, r + 1)], e = posado[idx(c + 1, r + 1)];
        const tx = a.x + (b.x - a.x) * u, ty = a.y + (b.y - a.y) * u;
        const sx = d0.x + (e.x - d0.x) * u, sy = d0.y + (e.y - d0.y) * u;
        return { x: tx + (sx - tx) * v, y: ty + (sy - ty) * v };
      }
    };
  }

  /* Interpola una rejilla de puntos entre claves (lineal), o el reposo si no
     hay claves. Compartido por la malla; misma semántica que las poses. */
  function rigInterpGrid(rest, keys, frame) {
    const nums = Object.keys(keys || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!nums.length) return clone(rest);
    const f = Number(frame) || 1;
    const mezcla = (A, B, t) => A.map((pt, i) => ({ x: pt.x + (((B[i] || pt).x) - pt.x) * t, y: pt.y + (((B[i] || pt).y) - pt.y) * t }));
    if (keys[f]) return clone(keys[f]);
    if (f <= nums[0]) return clone(keys[nums[0]]);
    if (f >= nums.at(-1)) return clone(keys[nums.at(-1)]);
    let a = nums[0], b = nums.at(-1);
    for (const k of nums) { if (k <= f) a = k; else { b = k; break; } }
    return mezcla(keys[a], keys[b], (f - a) / (b - a));
  }

  /** Mallas por pieza. Se descarta la que no tenga cols*rows puntos de reposo;
      una clave con otra cantidad de puntos no se puede mezclar con el reposo. */
  /** PESOS DE VÉRTICE. Cada punto de la malla guarda a qué huesos sigue y
   *  cuánto: `{ hueso: 0..1 }`, disperso y normalizado a 1. Disperso porque un
   *  vértice de un muñeco cut-out sigue a dos o tres huesos, no a los veinte:
   *  guardar veinte números por punto engorda el archivo y no cambia el dibujo.
   *  Normalizado porque si la suma no da 1 la pieza se encoge o se estira sola
   *  al posar, que es el defecto clásico del skinning hecho a ojo. */
  const rigWeightsData = (source, cantidad) => {
    if (!Array.isArray(source) || !cantidad) return [];
    const out = [];
    for (let i = 0; i < cantidad; i++) out.push(rigNormalizeWeights(source[i]));
    return out.some((w) => Object.keys(w).length) ? out : [];
  };
  const rigNormalizeWeights = (raw, maximo = 4) => {
    const pares = Object.entries(raw || {})
      .map(([id, w]) => [String(id), Math.max(0, +w || 0)])
      .filter(([, w]) => w > 1e-6)
      .sort((a, b) => b[1] - a[1])
      .slice(0, Math.max(1, maximo | 0));
    const total = pares.reduce((n, [, w]) => n + w, 0);
    if (!total) return {};
    const out = {};
    for (const [id, w] of pares) out[id] = w / total;
    return out;
  };
  /** Distancia de un punto al SEGMENTO del hueso (no a su origen): un hueso
   *  largo tiene que influir parejo a lo largo de todo su cuerpo. */
  const rigDistanciaAlHueso = (p, head, tail) => {
    const ax = +head.x || 0, ay = +head.y || 0, bx = +tail.x || 0, by = +tail.y || 0;
    const dx = bx - ax, dy = by - ay, largo2 = dx * dx + dy * dy;
    const t = largo2 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / largo2)) : 0;
    return Math.hypot(p.x - (ax + dx * t), p.y - (ay + dy * t));
  };
  /** FLEXI-BINDING: pesos automáticos por distancia. Es el segundo nivel de la
   *  tabla de deformación: sin pintar nada, cada vértice sigue a los huesos que
   *  tiene cerca, con caída suave. Sirve como punto de partida honesto para
   *  después corregir a mano los pesos que importan. */
  function rigAutoWeights(huesos, puntos, opciones = {}) {
    const caida = Math.max(1, +opciones.falloff || 2.5);
    const maximo = Math.max(1, Math.min(4, (opciones.max | 0) || 3));
    const utiles = (huesos || []).filter((b) => b && b.id && b.head && b.tail);
    if (!utiles.length) return [];
    return (puntos || []).map((p) => {
      const crudos = {};
      for (const b of utiles) {
        const d = rigDistanciaAlHueso(p, b.head, b.tail);
        crudos[b.id] = 1 / (Math.pow(d, caida) + 1e-6);
      }
      return rigNormalizeWeights(crudos, maximo);
    });
  }

  const rigMeshesData = (source = {}) => {
    const punto = (q) => ({ x: +q.x || 0, y: +q.y || 0 });
    const lista = (arr) => Array.isArray(arr) ? arr.filter((q) => q && Number.isFinite(+q.x) && Number.isFinite(+q.y)).map(punto) : [];
    const out = {};
    for (const [boneId, m] of Object.entries(source || {})) {
      const nx = Math.max(2, (m && m.cols) | 0), ny = Math.max(2, (m && m.rows) | 0);
      const rest = lista(m && m.rest);
      if (rest.length !== nx * ny) continue;
      const keys = {};
      for (const [frame, pts] of Object.entries((m && m.keys) || {})) {
        const f = Math.max(1, Math.round(+frame)), grid = lista(pts);
        if (Number.isFinite(f) && grid.length === nx * ny) keys[f] = grid;
      }
      out[boneId] = { id: (m && m.id) || `mesh:${boneId}`, boneId, type: "mesh",
        enabled: !(m && m.enabled === false), cols: nx, rows: ny, rest, keys,
        weights: rigWeightsData(m && m.weights, rest.length),
        locked: Array.from({length:rest.length},(_,i)=>m?.locked?.[i]===true) };
    }
    return out;
  };

  /** CONTROLES (§4.3, último nivel: cara, manos, ojos, boca).
   *
   *  Un control es un DIAL con nombre: «boca abierta», «ceja izquierda»,
   *  «mano cerrada». No es un hueso ni una pieza; es un número entre dos
   *  extremos que el animador mueve y que conduce acciones.
   *
   *  La decisión que lo hace barato: un control es un CANAL más, con la ruta
   *  `controls/<id>`. Con eso hereda todo lo que ya existe sin código nuevo —
   *  se le ponen claves por cuadro, se interpola, aparece en el Function Editor
   *  con sus curvas y tangentes, y cualquier Smart Bone puede tomarlo como
   *  conductor igual que toma el ángulo de un hueso. Un dial de cara animable
   *  sale, así, de piezas que ya estaban probadas. */
  const rigControlPath = (id) => `controls/${encodeURIComponent(id)}`;
  /** Parte VISUAL de un control: qué forma tiene el mando y dónde se para
   *  sobre el personaje. Vive en la misma definición porque es del control,
   *  no de la escena, y así viaja con el personaje a la biblioteca.
   *
   *  Ojo: `rigControlsData` es una LISTA BLANCA. Todo campo nuevo tiene que
   *  pasar por acá o se borra en silencio al normalizar el rig (que es lo que
   *  hace `replaceRig` al cargar un personaje). */
  const rigControlKinds = new Set(["slider", "point2d", "selector"]);
  const rigControlWidget = (raw = {}, min = 0, max = 1) => {
    const kind = rigControlKinds.has(raw.kind) ? raw.kind : "slider";
    const out = { kind };
    // Posición sobre el personaje, en unidades del SVG. Sin ella el mando
    // todavía no fue colocado y sólo se maneja desde el panel.
    if (Number.isFinite(+raw.x) && Number.isFinite(+raw.y)) { out.x = +raw.x; out.y = +raw.y; }
    if (kind === "selector") {
      const lo = Math.min(min, max), hi = Math.max(min, max);
      const opciones = (Array.isArray(raw.options) ? raw.options : [])
        .filter((o) => o && Number.isFinite(+o.value))
        .map((o) => ({ label: String(o.label || o.value), value: Math.max(lo, Math.min(hi, +o.value)) }));
      // Un selector sin opciones no es un selector: degrada a deslizador en vez
      // de quedar como un mando que no se puede accionar.
      if (opciones.length) out.options = opciones; else out.kind = "slider";
    }
    if (kind === "point2d" && raw.link && raw.link.partner) {
      out.link = { partner: String(raw.link.partner),
        axis: raw.link.axis === "y" ? "y" : "x" };
    }
    return out;
  };

  const rigControlsData = (source = {}) => {
    const out = {};
    for (const [id, raw] of Object.entries(source || {})) {
      if (!id || !raw) continue;
      const min = Number.isFinite(+raw.min) ? +raw.min : 0;
      const max = Number.isFinite(+raw.max) ? +raw.max : 1;
      if (Math.abs(max - min) < 1e-9) continue;      // un dial sin recorrido no es un dial
      const inicial = Number.isFinite(+raw.default) ? +raw.default : min;
      out[id] = { id, name: raw.name || id, min, max,
        default: Math.max(Math.min(min, max), Math.min(Math.max(min, max), inicial)),
        group: raw.group || "", ...rigControlWidget(raw, min, max) };
    }
    return out;
  };

  /** ACCIONES Y SMART BONES (§4.3, nivel «Acciones conducidas por ángulo»).
   *
   *  Una ACCIÓN es una mini línea de tiempo con nombre: guarda claves de
   *  canales igual que la escena, pero su tiempo no es el de la escena.
   *  Un SMART BONE es esa acción CONDUCIDA por el valor de otro canal —casi
   *  siempre el ángulo de un hueso—: el driver dice `de tal ángulo a tal otro`
   *  y la acción se recorre en ese trayecto.
   *
   *  Para qué: un codo que al doblarse deforma el brazo, un hombro que al subir
   *  corrige la clavícula. Sin esto hay que arreglar a mano, cuadro por cuadro,
   *  la misma corrección cada vez que el personaje dobla el brazo.
   *
   *  La acción aporta DIFERENCIAS contra su propio cuadro 1, no valores
   *  absolutos: así una acción en reposo no cambia nada y varias acciones se
   *  suman sin pelearse por quién manda. */
  const rigActionsData = (source = {}) => {
    const out = {};
    for (const [id, raw] of Object.entries(source || {})) {
      if (!id || !raw) continue;
      const channels = {};
      for (const [path, ch] of Object.entries(raw.channels || {}))
        channels[path] = rigChannelData(path, ch);
      const driver = raw.driver && raw.driver.path ? {
        path: String(raw.driver.path),
        min: Number.isFinite(+raw.driver.min) ? +raw.driver.min : 0,
        max: Number.isFinite(+raw.driver.max) ? +raw.driver.max : 90,
      } : null;
      out[id] = { id, name: raw.name || id, enabled: raw.enabled !== false,
        length: Math.max(2, Math.round(+raw.length || 2)), driver, channels };
    }
    return out;
  };
  /** Cuánto recorrió la acción para el valor actual de su driver: 0..1. */
  const rigActionPhase = (accion, valor) => {
    if (!accion || !accion.driver) return 0;
    const { min, max } = accion.driver;
    if (Math.abs(max - min) < 1e-9) return 0;
    return Math.max(0, Math.min(1, (valor - min) / (max - min)));
  };

  const rigChannelData = (path, raw = {}) => ({ path,
    valueType: raw.valueType || "number", interpolation: raw.interpolation || "linear",
    keys: clone(raw.keys || {}), ease: clone(raw.ease || {}) });

  /** Evalúa UN canal suelto en un cuadro. Vive fuera de la escena porque las
   *  acciones tienen sus propios canales, con su propio tiempo, y necesitan la
   *  misma matemática sin pasar por `scene.rig.channels`. */
  function rigChannelValueDe(channel, frame, fallback = 0) {
    const keys = (channel && channel.keys) || {};
    const frames = Object.keys(keys).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!frames.length) return fallback;
    const f = Number(frame) || 1;
    if (keys[f] != null) return clone(keys[f]);
    if (f <= frames[0]) return clone(keys[frames[0]]);
    if (f >= frames.at(-1)) return clone(keys[frames.at(-1)]);
    let a = frames[0], b = frames.at(-1);
    for (const k of frames) { if (k <= f) a = k; else { b = k; break; } }
    if (channel.interpolation === "step" || typeof keys[a] !== "number" || typeof keys[b] !== "number")
      return clone(keys[a]);
    const ease = channel.ease || {};
    return keys[a] + (keys[b] - keys[a]) * rigEaseT((f - a) / (b - a), ease[a], ease[b]);
  }

  /** Devuelve el tramo de un canal que contiene un cuadro. Mantener esta
   *  decisión en el modelo evita que Timeline, X-sheet y Function Editor
   *  discrepen justo sobre una clave o fuera del rango animado. */
  function rigChannelSegment(channel, frame) {
    const keys = channel?.keys || {};
    const frames = Object.keys(keys).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (frames.length < 2) return null;
    const f = Number(frame) || frames[0];
    let a = null, b = null;
    for (const key of frames) { if (key <= f) a = key; else { b = key; break; } }
    if (a == null) { a = frames[0]; b = frames[1]; }
    else if (b == null) { a = frames.at(-2); b = frames.at(-1); }
    return { a, b, frame: Math.max(a, Math.min(b, f)), frames,
      valueA: clone(keys[a]), valueB: clone(keys[b]) };
  }

  /** Formato pequeño y portable para copiar solamente el timing de un tramo,
   *  sin copiar ni deformar los valores de sus poses. */
  function rigCurveClipboardData(channel, a, b) {
    if (!channel?.keys || channel.keys[a] == null || channel.keys[b] == null) return null;
    return { type: "low-rig-curve", version: 1,
      interpolation: channel.interpolation === "step" ? "step" :
        (channel.interpolation === "linear" ? "linear" : "bezier"),
      out: rigEaseData(channel.ease?.[a]), in: rigEaseData(channel.ease?.[b]) };
  }

  const rigConstraintData = (id, raw = {}, index = 0) => ({ ...clone(raw), id,
    type: raw.type || "transform", enabled: raw.enabled !== false,
    mix: Number.isFinite(+raw.mix) ? Math.max(0, Math.min(1, +raw.mix)) : 1,
    order: Number.isFinite(+raw.order) ? +raw.order : index,
    reads: [...new Set((raw.reads || []).filter(Boolean))],
    writes: [...new Set((raw.writes || []).filter(Boolean))],
    dependsOn: [...new Set((raw.dependsOn || []).filter(Boolean))] });

  function rigConstraintEdges(rig) {
    const constraints = rig.constraints || {}, ids = Object.keys(constraints);
    const edges = Object.fromEntries(ids.map((id) => [id, new Set()]));
    const writers = {};
    for (const id of ids) {
      const c = constraints[id];
      for (const resource of c.writes || []) (writers[resource] ||= []).push(id);
      for (const dependency of c.dependsOn || []) if (edges[dependency]) edges[dependency].add(id);
    }
    for (const id of ids) {
      for (const resource of constraints[id].reads || [])
        for (const writer of writers[resource] || []) edges[writer].add(id);
    }
    return edges;
  }

  function rigConstraintHasCycle(rig) {
    const constraints = rig.constraints || {}, ids = Object.keys(constraints);
    const edges = rigConstraintEdges(rig);
    const visiting = new Set(), visited = new Set();
    const visit = (id) => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;
      visiting.add(id);
      for (const next of edges[id] || []) if (visit(next)) return true;
      visiting.delete(id); visited.add(id); return false;
    };
    return ids.some(visit);
  }

  function rigOrderedConstraintIds(rig) {
    const constraints = rig.constraints || {}, ids = Object.keys(constraints), edges = rigConstraintEdges(rig);
    const preferred = [...new Set([...(rig.constraintOrder || []), ...ids])].filter((id) => constraints[id]);
    const rank = Object.fromEntries(preferred.map((id, index) => [id, index]));
    const indegree = Object.fromEntries(ids.map((id) => [id, 0]));
    for (const next of Object.values(edges)) for (const id of next) indegree[id]++;
    const ready = ids.filter((id) => indegree[id] === 0).sort((a, b) => rank[a] - rank[b]);
    const result = [];
    while (ready.length) {
      const id = ready.shift(); result.push(id);
      for (const next of edges[id]) {
        indegree[next]--;
        if (indegree[next] === 0) {
          ready.push(next); ready.sort((a, b) => rank[a] - rank[b]);
        }
      }
    }
    return result.length === ids.length ? result : preferred;
  }

  function rigDiagnostics(rig) {
    const errors = [], warnings = [], bones = rig.bones || rig.nodes || {};
    const artOwners = new Map();
    const claimArt = (elementId, boneId, sourceId) => {
      if (!elementId || !boneId) return;
      const previous = artOwners.get(elementId);
      if (previous && previous.boneId !== boneId) {
        errors.push({ code: "duplicate-art-binding", id: sourceId || boneId,
          ref: elementId, owners: [previous.boneId, boneId] });
        return;
      }
      artOwners.set(elementId, { boneId, sourceId });
    };
    for (const [id, bone] of Object.entries(bones)) {
      const seen = new Set([id]); let parentId = bone.parentId;
      while (parentId) {
        if (!bones[parentId]) { errors.push({ code: "missing-parent", id, ref: parentId }); break; }
        if (seen.has(parentId)) { errors.push({ code: "bone-cycle", id, ref: parentId }); break; }
        seen.add(parentId); parentId = bones[parentId].parentId;
      }
      claimArt(bone.elementId || bone.binding?.elementId, id, id);
    }
    for (const [id, slot] of Object.entries(rig.slots || {})) {
      if (slot.boneId && !bones[slot.boneId]) errors.push({ code: "missing-slot-bone", id, ref: slot.boneId });
      if (slot.activeAttachmentId && !rig.attachments?.[slot.activeAttachmentId])
        errors.push({ code: "missing-active-attachment", id, ref: slot.activeAttachmentId });
    }
    for (const [id, attachment] of Object.entries(rig.attachments || {}))
      if (!rig.slots?.[attachment.slotId]) errors.push({ code: "missing-attachment-slot", id, ref: attachment.slotId });
    for (const [id, binding] of Object.entries(rig.bindings || {})) {
      if (binding.boneId && !bones[binding.boneId]) errors.push({ code: "missing-binding-bone", id, ref: binding.boneId });
      if (binding.slotId && !rig.slots?.[binding.slotId]) errors.push({ code: "missing-binding-slot", id, ref: binding.slotId });
      if (binding.attachmentId && !rig.attachments?.[binding.attachmentId])
        errors.push({ code: "missing-binding-attachment", id, ref: binding.attachmentId });
      const attachment = rig.attachments?.[binding.attachmentId];
      claimArt(attachment?.elementId || binding.elementId, binding.boneId, id);
    }
    // Actions read raw channels, so cycles do not recurse. Still report the
    // dependency loop: artists otherwise expect chained actions to propagate.
    const actionEdges = new Map();
    const referenceExists = (path) => {
      const match = /^(bones|controls|meshes)\/([^/]+)/.exec(path || '');
      if (!match) return false;
      let id; try { id = decodeURIComponent(match[2]); } catch (_) { return false; }
      return !!(match[1] === 'bones' ? bones[id] : rig[match[1]]?.[id]);
    };
    for (const [id, action] of Object.entries(rig.actions || {})) {
      const driver = action.driver?.path;
      if (!referenceExists(driver)) errors.push({ code: 'missing-action-driver', id, ref: driver || '' });
      for (const output of Object.keys(action.channels || {})) {
        if (!referenceExists(output)) errors.push({ code: 'missing-action-target', id, ref: output });
        if (driver && action.enabled !== false) {
          if (!actionEdges.has(driver)) actionEdges.set(driver, new Set());
          actionEdges.get(driver).add(output);
        }
      }
    }
    const visiting = new Set(), visited = new Set();
    function visitAction(path) {
      if (visiting.has(path)) return true;
      if (visited.has(path)) return false;
      visiting.add(path);
      for (const next of actionEdges.get(path) || []) if (visitAction(next)) return true;
      visiting.delete(path); visited.add(path); return false;
    }
    if ([...actionEdges.keys()].some(visitAction)) warnings.push({ code: 'action-cycle' });
    if (rigConstraintHasCycle(rig)) errors.push({ code: "constraint-cycle" });
    for (const id of rig.constraintOrder || [])
      if (!rig.constraints?.[id]) warnings.push({ code: "missing-ordered-constraint", id });
    return { valid: errors.length === 0, errors, warnings };
  }

  function rigReadiness(rig, availableElementIds = []) {
    const bones = Object.values(rig?.bones || rig?.nodes || {});
    const deformBones = bones.filter(b => b.role !== "control");
    const controls = bones.filter(b => b.role === "control");
    const boundElements = new Set();
    const boundBones = new Set();
    for (const bone of deformBones) {
      const elementId = bone.elementId || bone.binding?.elementId;
      if (elementId) { boundElements.add(elementId); boundBones.add(bone.id); }
    }
    for (const binding of Object.values(rig?.bindings || {})) {
      const attachment = rig?.attachments?.[binding.attachmentId];
      const elementId = attachment?.elementId || binding.elementId;
      if (elementId) boundElements.add(elementId);
      if (binding.boneId && elementId) boundBones.add(binding.boneId);
    }
    const diagnostics = rigDiagnostics(rig || {});
    const unboundBoneIds = deformBones.map(b => b.id).filter(id => !boundBones.has(id));
    const art = [...new Set((availableElementIds || []).filter(Boolean))];
    const unboundElementIds = art.filter(id => !boundElements.has(id));
    return {
      valid: diagnostics.valid,
      errors: diagnostics.errors,
      warnings: diagnostics.warnings,
      boneCount: deformBones.length,
      controlCount: controls.length,
      boundBoneCount: boundBones.size,
      boundElementCount: boundElements.size,
      unboundBoneIds,
      unboundElementIds,
      readyToTest: diagnostics.valid && bones.length > 0,
      // El movimiento pertenece al esqueleto, no al dibujo. Permitir claves
      // sin arte hace posible crear y reutilizar animaciones antes del binding.
      readyToAnimate: diagnostics.valid && bones.length > 0,
      hasBoundArt: boundBones.size > 0
    };
  }

  function rigData(data) {
    const source = data || {}, structured = !!(source.nodes || source.bones);
    const sourceBones = source.bones || source.nodes || (structured ? {} : source);
    const bones = {}, slots = clone(source.slots || {}), attachments = clone(source.attachments || {}),
      bindings = clone(source.bindings || {}), channels = {};
    for (const [id, raw] of Object.entries(sourceBones)) {
      const n = structured ? (raw || {}) : { keys: raw || {} };
      const hasArtLink = !source.bones || !!(n.elementId || n.binding?.elementId);
      const elementId = n.elementId || n.binding?.elementId || id;
      bones[id] = { id, type: "bone", name: n.name || id,
        parentId: n.parentId || null, pivot: n.pivot ? { x: +n.pivot.x || 0, y: +n.pivot.y || 0 } : null,
        head: n.head ? { x: +n.head.x || 0, y: +n.head.y || 0 } :
          (n.pivot ? { x: +n.pivot.x || 0, y: +n.pivot.y || 0 } : null),
        tail: n.tail ? { x: +n.tail.x || 0, y: +n.tail.y || 0 } : null,
        rest: rigPoseData(n.rest), keys: clone(n.keys || {}), pinned: !!n.pinned,
        role: n.role === "control" ? "control" : "bone",
        control: n.control ? clone(n.control) : null,
        inherit: { translation: n.inherit?.translation !== false, rotation: n.inherit?.rotation !== false,
          scale: n.inherit?.scale !== false },
        limits: { min: Number.isFinite(+n.limits?.min) ? +n.limits.min : -180,
          max: Number.isFinite(+n.limits?.max) ? +n.limits.max : 180 } };
      if (hasArtLink) {
        bones[id].elementId = elementId;
        bones[id].binding = { mode: n.binding?.mode || "rigid", elementId };
      }
      for (const property of ["x", "y", "r", "sx", "sy"]) {
        const path = rigChannelPath(id, property), keys = {}, ease = {};
        for (const [frame, pose] of Object.entries(n.keys || {})) {
          const normalized = rigPoseData(pose); keys[frame] = normalized[property];
          if (pose && pose.ease) ease[frame] = rigEaseData(pose.ease);
        }
        if (Object.keys(keys).length) channels[path] = rigChannelData(path, { keys, ease });
      }
      if (!source.bones) {
        const slotId = `slot:${id}`, attachmentId = `attachment:${id}`, bindingId = `binding:${id}`;
        slots[slotId] ||= { id: slotId, name: n.name || id, boneId: id,
          drawOrder: Object.keys(slots).length, activeAttachmentId: attachmentId, visible: true };
        attachments[attachmentId] ||= { id: attachmentId, slotId, type: "drawing", elementId,
          name: n.name || id, levelId: n.levelId || null, drawingNumber: n.drawingNumber ?? null };
        bindings[bindingId] ||= { id: bindingId, mode: n.binding?.mode || "rigid", boneId: id,
          slotId, attachmentId, elementId };
      }
    }
    for (const [path, channel] of Object.entries(source.channels || {}))
      channels[path] = rigChannelData(path, channel);
    const constraints = {};
    Object.entries(source.constraints || {}).forEach(([id, constraint], index) => {
      constraints[id] = rigConstraintData(id, constraint, index);
    });
    const requestedOrder = (source.constraintOrder || source.setup?.evaluationOrder || []).filter((id) => constraints[id]);
    const remainder = Object.keys(constraints).filter((id) => !requestedOrder.includes(id))
      .sort((a, b) => constraints[a].order - constraints[b].order || a.localeCompare(b));
    const rig = { version: 4,
      setup: { mode: source.setup?.mode || "cutout", restFrame: Math.max(1, Math.round(source.setup?.restFrame || 1)),
        units: source.setup?.units || "px" },
      bones, slots, attachments, bindings, meshes: rigMeshesData(source.meshes),
      deformers: rigDeformersData(source.deformers), constraints,
      constraintOrder: [...requestedOrder, ...remainder], controllers: clone(source.controllers || {}),
      actions: rigActionsData(source.actions), controls: rigControlsData(source.controls), channels, switches: rigSwitchesData(source.switches, attachments),
      viewSets: rigViewSetsData(source.viewSets, attachments, slots),
      controlSets: rigControlSetsData(source.controlSets),
      physics: clone(source.physics || {}), diagnostics: { valid: true, errors: [], warnings: [] } };
    // `nodes` es sólo el nombre de compatibilidad usado por la UI v3. Comparte
    // la misma referencia que `bones`; el JSON canónico nunca serializa ambos.
    rig.nodes = rig.bones;
    rig.diagnostics = rigDiagnostics(rig);
    return rig;
  }

  function rigToJSON(rig) {
    const normalized = rigData(rig), out = clone(normalized);
    delete out.nodes;
    out.diagnostics = rigDiagnostics(normalized);
    return out;
  }

  // Matrices afines SVG [a,b,c,d,e,f]. El rig de recortes conserva las piezas
  // como hermanas en el dibujo y compone acá la jerarquía sin reescribir el SVG.
  const matIdentity = () => [1, 0, 0, 1, 0, 0];
  const matMul = (a, b) => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]
  ];
  const matPoint = (m, p) => ({ x: m[0] * p.x + m[2] * p.y + m[4],
    y: m[1] * p.x + m[3] * p.y + m[5] });
  const matInverse = (m) => {
    const d = m[0] * m[3] - m[1] * m[2];
    if (Math.abs(d) < 1e-9) return matIdentity();
    return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d,
      (m[2] * m[5] - m[3] * m[4]) / d, (m[1] * m[4] - m[0] * m[5]) / d];
  };
  const matPose = (pose, pivot) => {
    const p = rigPoseData(pose), pv = pivot || { x: 0, y: 0 };
    const rad = p.r * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
    const rs = [c * p.sx, s * p.sx, -s * p.sy, c * p.sy, 0, 0];
    const around = matMul([1, 0, 0, 1, pv.x, pv.y],
      matMul(rs, [1, 0, 0, 1, -pv.x, -pv.y]));
    return matMul([1, 0, 0, 1, p.x, p.y], around);
  };

  /** Un dibujo: contenido + su número dentro del nivel. El número es lo que se
   *  escribe en la celda de la xsheet, y es renumerable sin perder el dibujo. */
  class Drawing {
    constructor(data = {}) {
      this.id = data.id || uid("dw");
      this.number = Number(data.number) || 1;
      this.content = data.content || "";     // SVG del dibujo
      this.name = data.name || "";
      this.meta = clone(data.meta || {});
    }
    isEmpty() { return !this.content || !/<(path|g|rect|circle|ellipse|line|polyline|polygon|text|image)\b/.test(this.content); }
    toJSON() { return { id: this.id, number: this.number, content: this.content, name: this.name, meta: this.meta }; }
  }

  /** Un nivel: la colección de dibujos numerados. Equivale al "animation level"
   *  de OpenToonz — el material, sin ninguna noción de tiempo. */
  class Level {
    constructor(data = {}) {
      this.id = data.id || uid("lv");
      this.name = data.name || "Nivel";
      // «reference» (calco/rotoscopía) se conservaba al crear y se perdía al
      // reabrir, convertido en «vector»
      this.type = data.type === "raster" || data.type === "reference" ? data.type : "vector";
      this.paletteId = data.paletteId || null;
      this.drawings = (data.drawings || []).map((d) => new Drawing(d));
    }
    /** Dibujo por NÚMERO (lo que referencia la celda), no por índice. */
    byNumber(n) { return this.drawings.find((d) => d.number === Number(n)) || null; }
    /** Números en uso, ordenados. */
    numbers() { return this.drawings.map((d) => d.number).sort((a, b) => a - b); }
    nextNumber() { const n = this.numbers(); return n.length ? n[n.length - 1] + 1 : 1; }
    /** Crea un dibujo. Si el número ya existe, devuelve el que había: nunca se
     *  pisa contenido en silencio. */
    addDrawing(number, content = "") {
      const n = Number(number) || this.nextNumber();
      const ya = this.byNumber(n);
      if (ya) return ya;
      const d = new Drawing({ number: n, content });
      this.drawings.push(d);
      this.drawings.sort((a, b) => a.number - b.number);
      return d;
    }
    removeDrawing(number) {
      const i = this.drawings.findIndex((d) => d.number === Number(number));
      if (i < 0) return null;
      return this.drawings.splice(i, 1)[0];
    }
    /** Renumera un dibujo. Devuelve false si el destino está ocupado (el
     *  llamador decide si intercambia o aborta; nunca se pierde un dibujo). */
    renumber(from, to) {
      const d = this.byNumber(from);
      if (!d || this.byNumber(to)) return false;
      d.number = Number(to);
      this.drawings.sort((a, b) => a.number - b.number);
      return true;
    }
    toJSON() {
      return { id: this.id, name: this.name, type: this.type,
               paletteId: this.paletteId, drawings: this.drawings.map((d) => d.toJSON()) };
    }
  }

  /** Un estilo: un color con nombre y opacidad, referenciable desde el dibujo.
   *  En OpenToonz es un "style" de la paleta: si cambia el estilo, cambian todos
   *  los elementos que lo referencian. Acá es el registro canónico de ese color. */
  class Style {
    constructor(data = {}) {
      this.id = data.id || uid("st");
      // El `id` es la identidad del estilo adentro del modelo. El `index` es su
      // NUMERO CORTO, y es lo que queda escrito en cada trazo del dibujo: un
      // uid repetido en cada elemento del SVG no se puede leer ni escribir a
      // mano, y el numero es justamente lo que en una paleta se nombra.
      // No se reordena ni se reusa: si cambiara, los trazos apuntarian a otro
      // color. Lo asigna la paleta al agregar el estilo.
      this.index = Math.max(0, Math.round(Number(data.index) || 0));
      this.name = data.name || "Estilo";
      this.color = Style.normalizeColor(data.color);
      this.opacity = Style.normalizeOpacity(data.opacity);
      this.meta = clone(data.meta || {});
    }
    static normalizeColor(c) {
      if (c == null || c === "") return "#000000";
      const s = String(c).trim();
      if (/^#?[0-9a-fA-F]{3}$/.test(s)) {
        const h = s.replace("#", "");
        return ("#" + h[0] + h[0] + h[1] + h[1] + h[2] + h[2]).toLowerCase();
      }
      if (/^#?[0-9a-fA-F]{6}$/.test(s)) return ("#" + s.replace("#", "")).toLowerCase();
      return s; // color con nombre o rgb()/rgba(): se respeta tal cual
    }
    static normalizeOpacity(o) {
      const n = Number(o);
      if (o == null || !Number.isFinite(n)) return 1;
      return Math.max(0, Math.min(1, n));
    }
    setColor(color) { this.color = Style.normalizeColor(color); return this; }
    setOpacity(opacity) { this.opacity = Style.normalizeOpacity(opacity); return this; }
    rename(name) { if (name) this.name = name; return this; }
    toJSON() { return { id: this.id, index: this.index, name: this.name, color: this.color,
                        opacity: this.opacity, meta: this.meta }; }
  }

  /** Una paleta: colección de estilos asociada a un Level. Un Level tiene a lo
   *  sumo una paleta (por `paletteId`); la paleta puede ser compartida. */
  class Palette {
    constructor(data = {}) {
      this.id = data.id || uid("pl");
      this.name = data.name || "Paleta";
      this.locked = !!data.locked;
      this.styles = (data.styles || []).map((s) => new Style(s));
      // paletas guardadas antes de que el estilo tuviera numero: se les asigna
      // uno en el orden en que estaban, para no perder ninguna referencia
      let libre = this.nextIndex();
      for (const s of this.styles) if (!s.index) s.index = libre++;
    }
    style(id) { return this.styles.find((s) => s.id === id) || null; }
    styleByName(name) { return this.styles.find((s) => s.name === name) || null; }
    /** Estilo por NUMERO: es como lo referencia el dibujo. */
    byIndex(i) { return this.styles.find((s) => s.index === Number(i)) || null; }
    /** Estilo por color exacto (para adoptar dibujos que ya existian). */
    byColor(color) {
      const c = Style.normalizeColor(color);
      return this.styles.find((s) => s.color === c) || null;
    }
    indices() { return this.styles.map((s) => s.index).filter(Boolean).sort((a, b) => a - b); }
    nextIndex() { const n = this.indices(); return n.length ? n[n.length - 1] + 1 : 1; }
    /** Crea un estilo. Si el nombre ya existe, devuelve el que había: nunca se
     *  pisan estilos en silencio. */
    addStyle(name, color, opacity) {
      const n = name || `Estilo ${this.styles.length + 1}`;
      const ya = this.styleByName(n);
      if (ya) return ya;
      const s = new Style({ name: n, color, opacity, index: this.nextIndex() });
      this.styles.push(s);
      return s;
    }
    removeStyle(id) {
      if (this.locked) return null;
      const i = this.styles.findIndex((s) => s.id === id);
      if (i < 0) return null;
      return this.styles.splice(i, 1)[0];
    }
    toJSON() { return { id: this.id, name: this.name, locked: this.locked, styles: this.styles.map((s) => s.toJSON()) }; }
  }

  /** Una columna de la xsheet: qué dibujo se ve en cada frame.
   *  `cells` es disperso — índice = frame - 1; un hueco es una celda vacía. */
  /** Modos de fusión de capa. Son los de CSS mix-blend-mode: el editor y el
   *  PNG exportado los componen con el MISMO motor, así lo que se ve es lo que
   *  sale. Sobreexposición/subexposición lineal, restar y dividir (Photoshop)
   *  no existen ahí y no se prometen. */
  const LAYER_BLENDS = ["normal", "multiply", "screen", "overlay", "darken", "lighten",
    "color-dodge", "color-burn", "hard-light", "soft-light", "difference", "exclusion",
    "hue", "saturation", "color", "luminosity"];

  class Layer {
    constructor(data = {}) {
      this.id = data.id || uid("ly");
      this.name = data.name || "Capa";
      this.levelId = data.levelId || null;
      this.visible = data.visible !== false;
      this.locked = !!data.locked;
      this.opacity = data.opacity == null ? 1 : Math.max(0, Math.min(1, Number(data.opacity) || 0));
      this.z = Number(data.z) || 0;            // profundidad para la cámara multiplano
      // Modo de fusión con las capas de abajo, como Photoshop/Harmony. Sólo los
      // que el motor compone igual en el editor y en el PNG (CSS mix-blend-mode).
      this.blend = LAYER_BLENDS.includes(data.blend) ? data.blend : "normal";
      // Mesa de luz de ESTA capa: se ve lavada para calcar encima. Es de la
      // vista: no cambia el render.
      this.lightTable = !!data.lightTable;
      this.cells = Array.isArray(data.cells) ? data.cells.slice() : [];
    }
    /** Celda en un frame (1-based): número de dibujo, o null si está vacía. */
    cellAt(frame) {
      const c = this.cells[Math.max(0, Math.round(frame) - 1)];
      return c == null ? null : c;
    }
    setCell(frame, drawingNumber) {
      const i = Math.max(0, Math.round(frame) - 1);
      while (this.cells.length < i) this.cells.push(null);
      this.cells[i] = drawingNumber == null ? null : Number(drawingNumber);
      return true;
    }
    /** Último frame con contenido. */
    lastFrame() {
      for (let i = this.cells.length - 1; i >= 0; i--) if (this.cells[i] != null) return i + 1;
      return 0;
    }
    /** ¿Este frame repite el dibujo del anterior? (o sea: es parte de un hold) */
    isHold(frame) {
      if (frame <= 1) return false;
      const a = this.cellAt(frame), b = this.cellAt(frame - 1);
      return a != null && a === b;
    }
    /** Primer frame del bloque de exposición que contiene a `frame`. */
    holdStart(frame) {
      let f = Math.max(1, Math.round(frame));
      const v = this.cellAt(f);
      if (v == null) return f;
      while (f > 1 && this.cellAt(f - 1) === v) f--;
      return f;
    }
    /** Cuántos frames dura la exposición que contiene a `frame`. */
    holdLength(frame) {
      const v = this.cellAt(frame);
      if (v == null) return 0;
      let n = 0, f = this.holdStart(frame);
      while (this.cellAt(f) === v) { n++; f++; }
      return n;
    }
    toJSON() {
      return { id: this.id, name: this.name, levelId: this.levelId, visible: this.visible,
               locked: this.locked, opacity: this.opacity, z: this.z, blend: this.blend,
               lightTable: this.lightTable, cells: this.cells.slice() };
    }
  }

  function compositionTransform(data = {}) {
    return { x: Number(data.x) || 0, y: Number(data.y) || 0, z: Number(data.z) || 0,
      rotationX: Number(data.rotationX) || 0, rotationY: Number(data.rotationY) || 0,
      rotationZ: Number(data.rotationZ) || 0,
      scaleX: data.scaleX == null ? 1 : Number(data.scaleX),
      scaleY: data.scaleY == null ? 1 : Number(data.scaleY) };
  }

  /* STORYBOARD: la secuencia de paneles es parte del documento, igual que las
     capas o el rig. Un panel guarda la DECISIÓN de la toma (tipo, ángulo y la
     cámara que la produce), no sólo coordenadas sueltas: así se puede volver a
     generar, reencuadrar o cambiar de lente sin perder la intención. */
  const STAGE_POSES = ["de-pie", "caminando", "sentado", "senalando"];
  function storyboardCast(source) {
    const out = [], seen = new Set();
    for (const raw of Array.isArray(source) ? source : []) {
      if (!raw) continue;
      const id = typeof raw.id === "string" && raw.id ? raw.id : `fig_${out.length + 1}`;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push({ id, name: typeof raw.name === "string" ? raw.name : "",
        x: Number(raw.x) || 0, z: Number(raw.z) || 0,
        // Una figura sin altura no se puede encuadrar; 170 es la de referencia.
        height: Math.max(20, Math.min(400, Number(raw.height) || 170)),
        rotation: Number(raw.rotation) || 0,
        pose: STAGE_POSES.includes(raw.pose) ? raw.pose : "de-pie" });
    }
    return out;
  }

  function storyboardBoard(data = {}, index = 0) {
    const shot = data.shot && typeof data.shot === "object" ? data.shot : {};
    return { id: data.id || `board_${Date.now().toString(36)}_${index}_${Math.random().toString(36).slice(2, 6)}`,
      name: typeof data.name === "string" ? data.name : "",
      action: typeof data.action === "string" ? data.action : "",
      dialogue: typeof data.dialogue === "string" ? data.dialogue : "",
      notes: typeof data.notes === "string" ? data.notes : "",
      // Un panel de cero cuadros no se vería nunca: no es un panel.
      duration: Math.max(1, Math.round(Number(data.duration) || 1)),
      drawingRef: data.drawingRef == null ? null : clone(data.drawingRef),
      // De dónde vino el panel si se importó (p. ej. Storyboarder: su toma
      // «1A», la cámara y los personajes del Shot Generator). Se guarda tal
      // cual para no perder nada que LOW todavía no sepa usar.
      source: data.source && typeof data.source === "object" ? clone(data.source) : null,
      shot: { type: typeof shot.type === "string" ? shot.type : "plano-medio",
        angle: typeof shot.angle === "string" ? shot.angle : "nivel",
        camera: clone(shot.camera || null), subject: clone(shot.subject || null),
        // El REPARTO en el piso del escenario: quién está y dónde. `focus` dice
        // a quién encuadra la cámara; sin reparto no hay a quién medirle el plano.
        cast: storyboardCast(shot.cast),
        focus: typeof shot.focus === "string" ? shot.focus : null } };
  }
  function storyboardData(data = {}) {
    const seen = new Set(), boards = [];
    for (const raw of Array.isArray(data.boards) ? data.boards : []) {
      const board = storyboardBoard(raw || {}, boards.length);
      if (seen.has(board.id)) continue;      // un id repetido rompería el orden
      seen.add(board.id); boards.push(board);
    }
    return { version: 1, boards, settings: clone(data.settings || {}) };
  }

  function compositionData(data = {}) {
    const planes = {};
    for (const [id, plane] of Object.entries(data.planes || {})) {
      planes[id] = { id, source: clone(plane.source || {}), transform: compositionTransform(plane.transform),
        keys: clone(plane.keys || {}), visible: plane.visible !== false, locked: !!plane.locked };
    }
    return { version: 1, planes, camera: clone(data.camera || {}), settings: clone(data.settings || {}) };
  }

  /** La escena: niveles (material) + capas (tiempo) + ajustes. */
  class Scene {
    constructor(data = {}) {
      this.version = 2;
      this.id = data.id || uid("sc");
      this.name = data.name || "Escena";
      this.fps = Math.max(1, Math.min(120, Number(data.fps) || 24));
      this.width = documentDimension(data.width, DEFAULT_WIDTH);
      this.height = documentDimension(data.height, DEFAULT_HEIGHT);
      this.range = { in: Number(data.range?.in) || 1, out: Number(data.range?.out) || 0 };
      this.levels = (data.levels || []).map((l) => new Level(l));
      this.layers = (data.layers || []).map((l) => new Layer(l));
      this.palettes = (data.palettes || []).map((p) => new Palette(p));
      this.camera = clone(data.camera || { keys: {} });
      this.composition = compositionData(data.composition);
      this.storyboard = storyboardData(data.storyboard);
      this.audio = clone(data.audio || []);
      this.rig = rigData(data.rig);
      this.revision = Number(data.revision) || 0;
    }

    touch() { this.revision++; return this; }
    /** Resolución lógica de la mesa. Es estado del archivo, nunca del panel. */
    setSize(width, height) {
      const w = documentDimension(width, this.width || DEFAULT_WIDTH);
      const h = documentDimension(height, this.height || DEFAULT_HEIGHT);
      if (w === this.width && h === this.height) return false;
      this.width = w; this.height = h; this.touch(); return true;
    }
    level(id) { return this.levels.find((l) => l.id === id) || null; }
    layer(id) { return this.layers.find((l) => l.id === id) || null; }

    board(id) { return this.storyboard.boards.find((b) => b.id === id) || null; }
    /** De qué cuadro a qué cuadro va cada panel. El tiempo del storyboard es
     *  la suma de sus paneles: no hay una segunda fuente que pueda discrepar. */
    boardTiming() {
      let cursor = 1;
      return this.storyboard.boards.map((board) => {
        const from = cursor, to = cursor + board.duration - 1;
        cursor = to + 1;
        return { id: board.id, from, to, duration: board.duration };
      });
    }
    boardDuration() {
      return this.storyboard.boards.reduce((total, board) => total + board.duration, 0);
    }
    /** Qué panel se ve en un cuadro dado. Es lo que convierte la lista de
     *  paneles en algo MIRABLE: sin esto el storyboard tiene tiempos escritos
     *  pero no se puede reproducir, y un board que no se puede ver no cumple
     *  su única función, que es juzgar el ritmo antes de animar.
     *
     *  Se resuelve desde `boardTiming()` y no con una segunda cuenta propia:
     *  dos fuentes del mismo tiempo terminan discrepando. */
    boardAt(frame) {
      const f = Math.max(1, Math.round(Number(frame) || 1));
      const tramo = this.boardTiming().find((t) => f >= t.from && f <= t.to);
      if (!tramo) return null;
      const board = this.storyboard.boards.find((b) => b.id === tramo.id);
      return board ? { board, ...tramo, index: this.storyboard.boards.indexOf(board) } : null;
    }

    compositionPlane(id) { return this.composition.planes[id] || null; }
    ensureCompositionPlane(id, source = {}) {
      if (!id) return null;
      if (!this.composition.planes[id]) this.composition.planes[id] = {
        id, source: clone(source), transform: compositionTransform(), keys: {}, visible: true, locked: false };
      return this.composition.planes[id];
    }
    setCompositionTransform(id, transform, frame = null) {
      const plane = this.ensureCompositionPlane(id);
      if (!plane || plane.locked) return false;
      const value = compositionTransform({ ...plane.transform, ...transform });
      if (frame == null) plane.transform = value;
      else plane.keys[Math.max(1, Math.round(frame))] = value;
      this.touch(); return true;
    }
    compositionTransformAt(id, frame = null) {
      const plane = this.compositionPlane(id);
      if (!plane) return null;
      const base = compositionTransform(plane.transform), keys = plane.keys || {};
      const frames = Object.keys(keys).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
      if (frame == null || !frames.length) return base;
      const f = Math.max(1, Number(frame) || 1);
      if (keys[f]) return compositionTransform({ ...base, ...keys[f] });
      if (f <= frames[0]) return compositionTransform({ ...base, ...keys[frames[0]] });
      if (f >= frames.at(-1)) return compositionTransform({ ...base, ...keys[frames.at(-1)] });
      let a = frames[0], b = frames.at(-1);
      for (const key of frames) { if (key <= f) a = key; else { b = key; break; } }
      const t = (f - a) / (b - a), A = compositionTransform({ ...base, ...keys[a] }), B = compositionTransform({ ...base, ...keys[b] });
      const out = {}; for (const key of Object.keys(base)) out[key] = A[key] + (B[key] - A[key]) * t;
      return compositionTransform(out);
    }
    removeCompositionKey(id, frame) {
      const plane = this.compositionPlane(id), key = Math.max(1, Math.round(frame));
      if (!plane || !Object.prototype.hasOwnProperty.call(plane.keys, key)) return false;
      delete plane.keys[key]; this.touch(); return true;
    }

    addLevel(name, type) {
      const l = new Level({ name: name || `Nivel ${this.levels.length + 1}`, type });
      this.levels.push(l); this.touch(); return l;
    }
    addLayer(levelId, name) {
      const l = new Layer({ levelId, name: name || `Capa ${this.layers.length + 1}` });
      this.layers.push(l); this.touch(); return l;
    }

    palette(id) { return this.palettes.find((p) => p.id === id) || null; }
    addPalette(name) {
      const p = new Palette({ name: name || `Paleta ${this.palettes.length + 1}` });
      this.palettes.push(p); this.touch(); return p;
    }
    /** La paleta asociada a un nivel (por paletteId), o null. */
    levelPalette(levelId) {
      const lv = this.level(levelId);
      return lv && lv.paletteId ? this.palette(lv.paletteId) : null;
    }
    /** Vincula un nivel a una paleta, o lo desvincula con null. */
    setLevelPalette(levelId, paletteId) {
      const lv = this.level(levelId);
      if (!lv) return false;
      if (paletteId != null && !this.palette(paletteId)) return false;
      lv.paletteId = paletteId || null; this.touch(); return true;
    }

    /** Último frame con contenido en toda la escena. */
    lastFrame() { return this.layers.reduce((m, l) => Math.max(m, l.lastFrame()), 0); }
    /** Rango efectivo de reproducción. */
    playRange() {
      const out = this.range.out > 0 ? this.range.out : this.lastFrame() || 1;
      return { in: Math.max(1, this.range.in), out: Math.max(1, out) };
    }

    /** El dibujo que se ve en una capa en un frame dado (resolviendo la
     *  referencia celda → nivel → dibujo). null si la celda está vacía. */
    drawingAt(layerId, frame) {
      const ly = this.layer(layerId);
      if (!ly) return null;
      const num = ly.cellAt(frame);
      if (num == null) return null;
      const lv = this.level(ly.levelId);
      return lv ? lv.byNumber(num) : null;
    }

    rigNode(id) { return this.rig.bones[id] || null; }
    rigBone(id) { return this.rigNode(id); }
    rigSlot(id) { return this.rig.slots[id] || null; }
    rigAttachment(id) { return this.rig.attachments[id] || null; }
    rigViewSet(id) { return (this.rig.viewSets || {})[id] || null; }
    rigControlSet(id) { return (this.rig.controlSets || {})[id] || null; }
    /** Conjuntos aplicados cuyo mapa apunta a una pieza que ya no está. Se
     *  informan, no se limpian: borrarlos escondería que esos controles
     *  quedaron colgados. */
    rigControlSetsRotos() {
      return Object.values(this.rig.controlSets || {})
        .map((cs) => ({ id: cs.id, name: cs.name,
          piezasRotas: Object.entries(cs.mapa).filter(([, pieza]) => !this.rigNode(pieza))
            .map(([rol, pieza]) => ({ rol, pieza })) }))
        .filter((x) => x.piezasRotas.length);
    }
    /** Los juegos de vistas que gobiernan un slot. */
    rigViewSetsOf(slotId) {
      return Object.values(this.rig.viewSets || {}).filter((j) => j.slotId === slotId);
    }
    /** Qué parte del giro está dibujada. La interfaz muestra esto en vez de
     *  prometer una vuelta completa que nadie dibujó. */
    rigViewSetCoverage(id) { return rigViewSetCoverage(this.rigViewSet(id)); }
    /** La vista vigente de un juego en un cuadro: lee el valor del control que
     *  lo conduce y elige el dibujo más cercano. Devuelve también `fuera`, que
     *  avisa cuando el control se pasó de lo dibujado y se sostiene el extremo. */
    rigViewAt(id, frame) {
      const juego = this.rigViewSet(id);
      if (!juego || !juego.driver) return null;
      const valor = this.rigChannelValue(juego.driver.path, frame, juego.driver.min);
      return rigViewAt(juego, valor == null ? juego.driver.min : valor);
    }
    /** El dibujo que va en un slot. Con `frame` respeta las claves de
     *  sustitucion; sin `frame`, el que este activo en el slot.
     *  Un dibujo NO se interpola: vale el de la ultima clave <= frame. */
    rigActiveAttachment(slotId, frame) {
      const slot = this.rigSlot(slotId);
      if (!slot) return null;
      if (frame != null) {
        const id = this.rigSwitchAt(slotId, frame);
        if (id) return this.rigAttachment(id);
      }
      return slot.activeAttachmentId ? this.rigAttachment(slot.activeAttachmentId) : null;
    }

    /** Todos los dibujos disponibles para un slot, en orden de creacion. */
    rigVariants(slotId) {
      return Object.values(this.rig.attachments || {})
        .filter((a) => a.slotId === slotId)
        .sort((a, b) => (a.order || 0) - (b.order || 0) || a.id.localeCompare(b.id));
    }

    rigSwitch(slotId) { return (this.rig.switches || {})[slotId] || null; }

    rigDeformer(boneId) { return (this.rig.deformers || {})[boneId] || null; }

    /** La curva de control de una pieza en un cuadro. Los puntos se interpolan
     *  linealmente entre claves; sin claves vale la curva en reposo, o sea el
     *  dibujo sin doblar. */
    rigDeformerAt(boneId, frame) {
      const d = this.rigDeformer(boneId);
      if (!d || !Array.isArray(d.rest) || d.rest.length < 2) return null;
      const keys = d.keys || {};
      const nums = Object.keys(keys).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
      if (!nums.length) return clone(d.rest);
      const f = Number(frame) || 1;
      const mezcla = (A, B, t) => A.map((pt, i) => ({
        x: pt.x + (((B[i] || pt).x) - pt.x) * t,
        y: pt.y + (((B[i] || pt).y) - pt.y) * t }));
      if (keys[f]) return clone(keys[f]);
      if (f <= nums[0]) return clone(keys[nums[0]]);
      if (f >= nums.at(-1)) return clone(keys[nums.at(-1)]);
      let a = nums[0], b = nums.at(-1);
      for (const k of nums) { if (k <= f) a = k; else { b = k; break; } }
      return mezcla(keys[a], keys[b], (f - a) / (b - a));
    }

    /** El mapeador listo para usar en un cuadro, o null si no hay que doblar
     *  nada. Devuelve null tambien cuando la curva esta en reposo: asi el
     *  dibujo original se deja intacto en vez de reescribirlo por gusto. */
    rigDeformadorAt(boneId, frame) {
      const d = this.rigDeformer(boneId);
      if (!d || d.enabled === false) return null;
      const posado = this.rigDeformerAt(boneId, frame);
      if (!posado) return null;
      const quieto = d.rest.every((pt, i) =>
        Math.abs(pt.x - posado[i].x) < 1e-6 && Math.abs(pt.y - posado[i].y) < 1e-6);
      if (quieto) return null;
      return rigDeformador(d.rest, posado);
    }

    /** La malla de una pieza. */
    rigMesh(boneId) { return (this.rig.meshes || {})[boneId] || null; }

    /** La rejilla POSADA de una malla en un cuadro (interpolada entre claves;
     *  sin claves, la rejilla en reposo → el dibujo sin deformar). */
    rigMeshAt(boneId, frame) {
      const m = this.rigMesh(boneId);
      if (!m || !Array.isArray(m.rest) || m.rest.length < 4) return null;
      return rigInterpGrid(m.rest, m.keys || {}, frame);
    }

    /** La matriz del hueso en REPOSO. Sin ella no hay skinning: para saber
     *  cuánto se movió un hueso hay que compararlo con dónde estaba cuando se
     *  ató la malla, no con la identidad. */
    rigBindMatrix(id, seen = new Set()) {
      const node = this.rigNode(id);
      if (!node || seen.has(id)) return matIdentity();
      seen.add(id);
      const local = matPose(node.rest || rigPoseData(), node.pivot);
      if (!node.parentId) return local;
      return matMul(this.rigBindMatrix(node.parentId, seen), local);
    }

    /** La rejilla de una malla POSADA POR LOS HUESOS en un cuadro.
     *
     *  Cada vértice se mueve con la mezcla de las matrices de los huesos que lo
     *  pesan: `Σ w · (Mundo(f) · Bind⁻¹) · p`. Encima se suman los retoques
     *  manuales de las claves —guardados como diferencia contra el reposo—, así
     *  que pintar pesos y corregir a mano no se pelean: el hueso pone el
     *  movimiento y la mano pone la corrección.
     *
     *  Sin pesos devuelve exactamente la rejilla de siempre, para que una malla
     *  hecha a mano siga comportándose igual que antes. */
    rigMeshSkinnedAt(boneId, frame, overrides = {}) {
      const m = this.rigMesh(boneId);
      if (!m || !Array.isArray(m.rest) || m.rest.length < 4) return null;
      const manual = rigInterpGrid(m.rest, m.keys || {}, frame);
      const corrections=this.rigMeshActionOffsets(boneId,frame,m.rest.length,overrides);
      if (!Array.isArray(m.weights) || !m.weights.length) return manual.map((p,i)=>({x:p.x+corrections[i].x,y:p.y+corrections[i].y}));
      const cache = new Map();
      const delta = (id) => {
        if (cache.has(id)) return cache.get(id);
        const mundo = this.rigWorldMatrix(id, frame, overrides);
        const bind = matInverse(this.rigBindMatrix(id));
        const d = bind ? matMul(mundo, bind) : matIdentity();
        cache.set(id, d);
        return d;
      };
      return m.rest.map((p, i) => {
        const pesos = m.weights[i] || {};
        const ids = Object.keys(pesos);
        let x = 0, y = 0, total = 0;
        for (const id of ids) {
          const w = pesos[id];
          if (!(w > 0) || !this.rigNode(id)) continue;
          const q = matPoint(delta(id), p);
          x += q.x * w; y += q.y * w; total += w;
        }
        const base = total > 1e-6 ? { x: x / total, y: y / total } : { x: p.x, y: p.y };
        const corregido = manual[i] || p;
        return { x: base.x + (corregido.x - p.x) + corrections[i].x, y: base.y + (corregido.y - p.y) + corrections[i].y };
      });
    }

    /** Mesh corrective channels share action time and persistence with Smart
     * Bones. Offsets are stored in the driver bone's local vector space, so
     * moving/rotating the character does not leave its correction behind. */
    rigMeshActionOffsets(meshId,frame,count,overrides = {}) {
      const offsets=Array.from({length:count},()=>({x:0,y:0}));
      const prefix=`meshes/${encodeURIComponent(meshId)}/`;
      for(const action of Object.values(this.rig.actions||{})){
        if(!action?.driver || action.enabled===false)continue;
        const driver=/^bones\/([^/]+)\//.exec(action.driver.path);
        if(!driver || !this.rigNode(decodeURIComponent(driver[1])))continue;
        const driverId=decodeURIComponent(driver[1]),property=action.driver.path.split('/').at(-1);
        const value=overrides[driverId]?.[property] ?? this.rigChannelValue(action.driver.path,frame,0);
        const af=1+rigActionPhase(action,value)*(action.length-1);
        const matrix=this.rigWorldMatrix(driverId,frame,overrides);
        for(const [path,channel] of Object.entries(action.channels||{})){
          if(!path.startsWith(prefix))continue;
          const match=/^(\d+)\/(x|y)$/.exec(path.slice(prefix.length));if(!match)continue;
          const index=Number(match[1]);if(index>=count)continue;
          const start=rigChannelValueDe(channel,1,0);
          const delta=rigChannelValueDe(channel,af,start)-start;
          const axis=match[2]==='x'?0:2;
          offsets[index].x+=matrix[axis]*delta;offsets[index].y+=matrix[axis+1]*delta;
        }
      }
      return offsets;
    }

    /** El mapeador de la malla listo para deformar el dibujo en un cuadro, o
     *  null si no hay malla o está en reposo (así el dibujo no se reescribe al
     *  pedo). Devuelve { punto(p) } — mismo contrato que rigDeformadorAt. */
    rigMallaAt(boneId, frame, overrides = {}) {
      const m = this.rigMesh(boneId);
      if (!m || m.enabled === false) return null;
      const posado = this.rigMeshSkinnedAt(boneId, frame, overrides);
      if (!posado) return null;
      const quieto = m.rest.every((pt, i) =>
        Math.abs(pt.x - posado[i].x) < 1e-6 && Math.abs(pt.y - posado[i].y) < 1e-6);
      if (quieto) return null;
      return rigMalla(m.rest, posado, m.cols, m.rows);
    }

    /** El attachment vigente en un cuadro segun las claves de sustitucion. */
    rigSwitchAt(slotId, frame) {
      const sw = this.rigSwitch(slotId), keys = sw && sw.keys;
      if (!keys) return null;
      const nums = Object.keys(keys).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
      if (!nums.length) return null;
      const f = Number(frame) || 1;
      if (f < nums[0]) return null;            // antes de la primera, manda el slot
      let elegido = nums[0];
      for (const k of nums) { if (k <= f) elegido = k; else break; }
      const id = keys[elegido];
      return this.rig.attachments[id] ? id : null;
    }
    rigOrderedConstraints() {
      return rigOrderedConstraintIds(this.rig).map((id) => this.rig.constraints[id]).filter(Boolean);
    }
    rigChannel(path) { return this.rig.channels[path] || null; }
    rigControl(id) { return (this.rig.controls || {})[id] || null; }
    /** El valor de un dial en un cuadro, acotado a su recorrido. Sin claves
     *  devuelve su valor de reposo, para que un control recién creado no mueva
     *  nada hasta que alguien lo toque. */
    rigControlValue(id, frame) {
      const control = this.rigControl(id);
      if (!control) return 0;
      const crudo = this.rigChannelValue(rigControlPath(id), frame, control.default);
      const lo = Math.min(control.min, control.max), hi = Math.max(control.min, control.max);
      return Math.max(lo, Math.min(hi, +crudo || 0));
    }
    rigChannelValue(path, frame, fallback = 0) {
      return rigChannelValueDe(this.rigChannel(path), frame, fallback);
    }
    validateRig() {
      this.rig.diagnostics = rigDiagnostics(this.rig);
      return clone(this.rig.diagnostics);
    }
    /** La pose de una pieza: la suya, más lo que le sumen las acciones activas.
     *  El driver se lee del canal CRUDO (`rigChannelValue`, que no consulta
     *  acciones), así que no hay realimentación posible: una acción no puede
     *  conducirse a sí misma. */
    rigPose(id, frame) {
      const base = this.rigPoseBase(id, frame);
      if (!base) return base;
      const acciones = this.rigActionDelta(id, frame);
      const vistas = this.rigViewDelta(id, frame);
      if (!acciones && !vistas) return base;
      const s = (a, b, prop) => (a ? a[prop] : 0) + (b ? b[prop] : 0);
      return { ...base,
        x: base.x + s(acciones, vistas, "x"), y: base.y + s(acciones, vistas, "y"),
        r: base.r + s(acciones, vistas, "r"),
        sx: (base.sx == null ? 1 : base.sx) + s(acciones, vistas, "sx"),
        sy: (base.sy == null ? 1 : base.sy) + s(acciones, vistas, "sy") };
    }
    /** Lo que los CORRECTIVOS DE LAS VISTAS activas le suman a una pieza.
     *
     *  Es discreto por definición: vale entero mientras esa vista manda y
     *  desaparece cuando manda otra. No se interpola entre vistas porque el
     *  dibujo tampoco se interpola — cambia de golpe, y la corrección tiene
     *  que cambiar con él o quedaría arrastrando el ajuste del dibujo viejo. */
    rigViewDelta(id, frame) {
      const juegos = Object.values(this.rig.viewSets || {});
      if (!juegos.length) return null;
      let x = 0, y = 0, r = 0, sx = 0, sy = 0, hay = false;
      for (const juego of juegos) {
        if (!juego || juego.enabled === false || !juego.driver) continue;
        const vista = this.rigViewAt(juego.id, frame);
        const pose = vista && vista.fix && vista.fix[id];
        if (!pose) continue;
        hay = true;
        x += pose.x || 0; y += pose.y || 0; r += pose.r || 0;
        sx += pose.sx || 0; sy += pose.sy || 0;
      }
      return hay ? { x, y, r, sx, sy } : null;
    }
    /** Lo que las acciones le suman a una pieza en un cuadro, o null si nada. */
    rigActionDelta(id, frame) {
      const acciones = this.rig.actions;
      if (!acciones) return null;
      let x = 0, y = 0, r = 0, sx = 0, sy = 0, hay = false;
      for (const accion of Object.values(acciones)) {
        if (!accion || accion.enabled === false || !accion.driver) continue;
        // Un dial sin claves vale su reposo, no cero: si no, una cara recién
        // armada arrancaría con todas sus correcciones al mínimo del recorrido.
        const control = /^controls\/(.+)$/.exec(accion.driver.path);
        const valor = control
          ? this.rigControlValue(decodeURIComponent(control[1]), frame)
          : this.rigChannelValue(accion.driver.path, frame, 0);
        const t = rigActionPhase(accion, valor);
        const af = 1 + t * (accion.length - 1);
        for (const property of ["x", "y", "r", "sx", "sy"]) {
          const canal = accion.channels[rigChannelPath(id, property)];
          if (!canal || !Object.keys(canal.keys || {}).length) continue;
          const inicio = rigChannelValueDe(canal, 1, property === "sx" || property === "sy" ? 1 : 0);
          const ahora = rigChannelValueDe(canal, af, inicio);
          const d = ahora - inicio;
          if (Math.abs(d) < 1e-9) continue;
          hay = true;
          if (property === "x") x += d; else if (property === "y") y += d;
          else if (property === "r") r += d; else if (property === "sx") sx += d; else sy += d;
        }
      }
      return hay ? { x, y, r, sx, sy } : null;
    }
    rigPoseBase(id, frame) {
      const node = this.rigNode(id), keys = node && node.keys;
      if (!node) return null;
      const frames = Object.keys(keys).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
      if (!frames.length) {
        const rest = clone(node.rest || rigPoseData());
        for (const property of ["x", "y", "r", "sx", "sy"])
          rest[property] = this.rigChannelValue(rigChannelPath(id, property), frame, rest[property]);
        return rest;
      }
      const f = Number(frame) || 1;
      let pose;
      if (keys[f]) pose = rigPoseData(keys[f]);
      else if (f <= frames[0]) pose = rigPoseData(keys[frames[0]]);
      else if (f >= frames.at(-1)) pose = rigPoseData(keys[frames.at(-1)]);
      if (pose) {
        for (const property of ["x", "y", "r", "sx", "sy"])
          pose[property] = this.rigChannelValue(rigChannelPath(id, property), frame, pose[property]);
        return pose;
      }
      let a = frames[0], b = frames.at(-1);
      for (const k of frames) { if (k <= f) a = k; else { b = k; break; } }
      const p = keys[a], q = keys[b];
      const t = rigEaseT((f - a) / (b - a), p.ease, q.ease);
      const lerp = (x, y) => Number(x || 0) + (Number(y || 0) - Number(x || 0)) * t;
      pose = { x: lerp(p.x, q.x), y: lerp(p.y, q.y), r: lerp(p.r, q.r),
        sx: lerp(p.sx == null ? (p.s == null ? 1 : p.s) : p.sx, q.sx == null ? (q.s == null ? 1 : q.s) : q.sx),
        sy: lerp(p.sy == null ? (p.s == null ? 1 : p.s) : p.sy, q.sy == null ? (q.s == null ? 1 : q.s) : q.sy) };
      for (const property of ["x", "y", "r", "sx", "sy"])
        pose[property] = this.rigChannelValue(rigChannelPath(id, property), frame, pose[property]);
      return pose;
    }
    rigWorldPose(id, frame, seen = new Set()) {
      const node = this.rigNode(id);
      if (!node || seen.has(id)) return null;
      seen.add(id);
      const local = this.rigPose(id, frame) || { x: 0, y: 0, r: 0, sx: 1, sy: 1 };
      if (!node.parentId) return local;
      const parent = this.rigWorldPose(node.parentId, frame, seen);
      if (!parent) return local;
      const rad = (parent.r || 0) * Math.PI / 180;
      const lx = (local.x || 0) * (parent.sx == null ? 1 : parent.sx);
      const ly = (local.y || 0) * (parent.sy == null ? 1 : parent.sy);
      return { x: parent.x + lx * Math.cos(rad) - ly * Math.sin(rad),
        y: parent.y + lx * Math.sin(rad) + ly * Math.cos(rad), r: (parent.r || 0) + (local.r || 0),
        sx: (parent.sx == null ? 1 : parent.sx) * (local.sx == null ? 1 : local.sx),
        sy: (parent.sy == null ? 1 : parent.sy) * (local.sy == null ? 1 : local.sy) };
    }

    /** Matriz completa de una pieza. A diferencia de `rigWorldPose`, aplica la
     * jerarquía alrededor de pivotes reales, que es lo que necesita un muñeco
     * cut-out para que antebrazo y mano sigan al brazo. */
    rigWorldMatrix(id, frame, overrides = {}, seen = new Set()) {
      const node = this.rigNode(id);
      if (!node || seen.has(id)) return matIdentity();
      seen.add(id);
      const local = matPose(overrides[id] || this.rigPose(id, frame), node.pivot);
      if (!node.parentId) return local;
      return matMul(this.rigWorldMatrix(node.parentId, frame, overrides, seen), local);
    }

    rigWorldPoint(id, frame, point, overrides = {}) {
      return matPoint(this.rigWorldMatrix(id, frame, overrides), point || { x: 0, y: 0 });
    }

    /** El camino de vuelta: de coordenadas del lienzo al espacio propio de la
     *  pieza. Lo necesita cualquier cosa que se arrastre en la mesa y se guarde
     *  en el dibujo —la curva del deformador—, porque el dibujo vive antes de
     *  que se le aplique la matriz del hueso. */
    rigLocalPoint(id, frame, point, overrides = {}) {
      return matPoint(matInverse(this.rigWorldMatrix(id, frame, overrides)), point || { x: 0, y: 0 });
    }

    rigConstraint(id) { return (this.rig.constraints || {})[id] || null; }

    /** Un punto animado de la cadena (objetivo o pole) en un cuadro. Entre
     * claves interpola recto: son posiciones que el animador ve moverse, no
     * ángulos, así que la línea es lo predecible. */
    rigPointAt(keys, fallback, frame) {
      const frames = Object.keys(keys || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
      if (!frames.length) return clone(fallback || null);
      const f = Number(frame) || 1;
      if (keys[f]) return clone(keys[f]);
      if (f <= frames[0]) return clone(keys[frames[0]]);
      if (f >= frames.at(-1)) return clone(keys[frames.at(-1)]);
      let a = frames[0], b = frames.at(-1);
      for (const k of frames) { if (k <= f) a = k; else { b = k; break; } }
      const t = (f - a) / (b - a), p = keys[a], q = keys[b];
      return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
    }

    rigTargetAt(id, frame) {
      const c = this.rigConstraint(id);
      if (!c) return null;
      return this.rigPointAt(c.targetKeys, c.target, frame);
    }

    /** Adónde apunta la articulación del medio. Es la forma profesional de
     * decidir el codo o la rodilla: se ve, se anima y no se da vuelta sola.
     * Sin pole definido devuelve null y manda el flag `bend`. */
    rigPoleAt(id, frame) {
      const c = this.rigConstraint(id);
      if (!c) return null;
      if (!c.pole && !Object.keys(c.poleKeys || {}).length) return null;
      return this.rigPointAt(c.poleKeys, c.pole, frame);
    }

    /** ¿Está clavado el extremo de esta cadena en este cuadro? El pin es un
     * ESTADO SOSTENIDO, no un valor que se interpola: un pie está apoyado o no
     * lo está, y vale desde su clave hasta la siguiente. */
    rigPinnedAt(id, frame) {
      const c = this.rigConstraint(id);
      if (!c) return false;
      const keys = c.pinKeys || {};
      const frames = Object.keys(keys).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
      if (!frames.length) return false;
      const f = Number(frame) || 1;
      if (f < frames[0]) return false;
      let last = frames[0];
      for (const k of frames) { if (k <= f) last = k; else break; }
      return !!keys[last];
    }

    /** Las cadenas con el extremo clavado en un cuadro. LowDoc las vuelve a
     * resolver después de cada gesto para que el apoyo no patine. */
    rigPinnedConstraints(frame) {
      return Object.values(this.rig.constraints || {})
        .filter((c) => c && c.type === "ik2" && c.enabled !== false && this.rigPinnedAt(c.id, frame));
    }

    /** Qué necesitaría la cadena IK para reproducir EXACTAMENTE la pose que hoy
     * tiene en FK: dónde está el extremo, dónde la articulación del medio y
     * hacia qué lado dobla. Con esto, encender IK no mueve nada. Si la cadena
     * está estirada el lado es ambiguo y se conserva el que ya tenía. */
    rigMatchIK(id, frame) {
      const c = this.rigConstraint(id);
      if (!c || c.type !== "ik2") return null;
      const root = this.rigNode(c.rootId), mid = this.rigNode(c.midId), end = this.rigNode(c.effectorId);
      if (!root || !mid || !end || !root.pivot || !mid.pivot || !end.pivot) return null;
      const parentMatrix = root.parentId ? this.rigWorldMatrix(root.parentId, frame) : matIdentity();
      const toLocal = (p) => matPoint(matInverse(parentMatrix), p);
      const target = this.rigWorldPoint(c.effectorId, frame, end.pivot);
      const joint = this.rigWorldPoint(c.midId, frame, mid.pivot);
      const rootPose = rigPoseData(this.rigPose(root.id, frame));
      // El signo se mide en el mismo espacio que usa el solver: si el padre
      // está espejado, hacerlo en el lienzo daría el lado contrario.
      const a = { x: root.pivot.x + rootPose.x, y: root.pivot.y + rootPose.y };
      const t = toLocal(target), p = toLocal(joint);
      const cross = (t.x - a.x) * (p.y - a.y) - (t.y - a.y) * (p.x - a.x);
      const ambiguous = Math.abs(cross) <= 1e-6;
      return { target, pole: joint, ambiguous,
        bend: ambiguous ? (c.bend === -1 ? -1 : 1) : (cross > 0 ? -1 : 1) };
    }

    /** Solver analítico de dos huesos para una cadena root→mid→effector.
     * Devuelve poses locales; LowDoc decide cuándo convertirlas en claves. */
    rigSolveIK(id, frame, target, poleOverride = null) {
      const c = this.rigConstraint(id);
      if (!c || c.type !== "ik2" || c.enabled === false) return null;
      const root = this.rigNode(c.rootId), mid = this.rigNode(c.midId), end = this.rigNode(c.effectorId);
      if (!root || !mid || !end || mid.parentId !== root.id || end.parentId !== mid.id ||
          !root.pivot || !mid.pivot || !end.pivot) return null;
      const wanted = target || this.rigTargetAt(id, frame) || end.pivot;
      const parentMatrix = root.parentId ? this.rigWorldMatrix(root.parentId, frame) : matIdentity();
      const localTarget = matPoint(matInverse(parentMatrix), wanted);
      const rootPose = rigPoseData(this.rigPose(root.id, frame));
      const midPose = rigPoseData(this.rigPose(mid.id, frame));
      const endPose = rigPoseData(this.rigPose(end.id, frame));
      const a = { x: root.pivot.x + rootPose.x, y: root.pivot.y + rootPose.y };
      // Las traslaciones FK existentes forman parte de la geometría actual de
      // la cadena. Si se ignoraran, pasar de FK a IK haría saltar el brazo.
      const b = { x: mid.pivot.x + midPose.x, y: mid.pivot.y + midPose.y };
      const e = { x: end.pivot.x + endPose.x, y: end.pivot.y + endPose.y };
      const l1 = Math.max(0.001, Math.hypot(b.x - root.pivot.x, b.y - root.pivot.y));
      const l2 = Math.max(0.001, Math.hypot(e.x - mid.pivot.x, e.y - mid.pivot.y));
      const dx = localTarget.x - a.x, dy = localTarget.y - a.y;
      const distance = Math.max(0.001, Math.min(l1 + l2 - 0.001, Math.hypot(dx, dy)));
      const cosJoint = Math.max(-1, Math.min(1, (distance * distance - l1 * l1 - l2 * l2) / (2 * l1 * l2)));
      // El pole decide de qué lado queda la articulación; el flag `bend` sólo
      // sirve de respaldo. Si el pole cae SOBRE la recta raíz→objetivo el signo
      // es ambiguo: ahí se conserva la flexión anterior en vez de temblar.
      let bend = c.bend === -1 ? -1 : 1;
      // `poleOverride` es para previsualizar el arrastre del pole sin escribirlo
      // todavía: el codo tiene que seguir al puntero antes de soltar.
      const pole = poleOverride || this.rigPoleAt(id, frame);
      if (pole) {
        const localPole = matPoint(matInverse(parentMatrix), pole);
        const cross = (localTarget.x - a.x) * (localPole.y - a.y)
          - (localTarget.y - a.y) * (localPole.x - a.x);
        if (Math.abs(cross) > 1e-6) bend = cross > 0 ? -1 : 1;
      }
      const joint = Math.acos(cosJoint) * bend;
      const rootAngle = Math.atan2(dy, dx) - Math.atan2(l2 * Math.sin(joint), l1 + l2 * Math.cos(joint));
      const base1 = Math.atan2(b.y - root.pivot.y, b.x - root.pivot.x);
      const base2 = Math.atan2(e.y - b.y, e.x - b.x);
      const clamp = (value, node) => rigAplicarTope(node.limits, value);
      const rootRotation = clamp((rootAngle - base1) * 180 / Math.PI, root);
      const midRotation = clamp((joint - (base2 - base1)) * 180 / Math.PI, mid);
      return { target: { x: +wanted.x || 0, y: +wanted.y || 0 },
        poses: { [root.id]: { ...rootPose, r: rootRotation }, [mid.id]: { ...midPose, r: midRotation } } };
    }

    /** Expone un dibujo en un frame. Si el dibujo no existe en el nivel, lo
     *  CREA vacío: dibujar es lo que después le pone contenido. */
    expose(layerId, frame, drawingNumber) {
      const ly = this.layer(layerId);
      if (!ly || ly.locked) return false;
      const lv = this.level(ly.levelId);
      if (lv && drawingNumber != null) lv.addDrawing(drawingNumber);
      ly.setCell(frame, drawingNumber);
      this.touch();
      return true;
    }

    toJSON() {
      return { version: this.version, id: this.id, name: this.name, fps: this.fps,
               width: this.width, height: this.height, range: this.range,
               levels: this.levels.map((l) => l.toJSON()),
               layers: this.layers.map((l) => l.toJSON()),
               palettes: this.palettes.map((p) => p.toJSON()),
               camera: this.camera, composition: clone(this.composition),
               storyboard: clone(this.storyboard), audio: this.audio,
               rig: rigToJSON(this.rig), revision: this.revision };
    }

    /** Convierte el modelo VIEJO (`frames` = lista de archivos) al nuevo. Cada
     *  archivo pasa a ser un dibujo numerado y se expone un frame cada uno:
     *  el resultado se ve idéntico a antes, pero ya con dibujos de verdad, así
     *  que a partir de ahí se pueden hacer holds. */
    static fromLegacy({ frames = [], fps = 12, name = "Escena", contents = {} } = {}) {
      const sc = new Scene({ name, fps });
      const lv = sc.addLevel("Nivel 1");
      const ly = sc.addLayer(lv.id, "Capa 1");
      frames.forEach((ruta, i) => {
        const d = lv.addDrawing(i + 1, contents[ruta] || "");
        d.meta.legacyPath = ruta || null;
        ly.setCell(i + 1, d.number);
      });
      return sc;
    }
  }

  animation.Scene = Scene;
  animation.Level = Level;
  animation.Layer = Layer;
  animation.LAYER_BLENDS = LAYER_BLENDS;
  animation.Drawing = Drawing;
  animation.Palette = Palette;
  animation.Style = Style;
  animation.clone = clone;
  animation.rigData = rigData;
  animation.rigToJSON = rigToJSON;
  animation.rigChannelPath = rigChannelPath;
  animation.rigEaseData = rigEaseData;
  animation.rigSinTope = rigSinTope;
  animation.rigAplicarTope = rigAplicarTope;
  animation.rigDeformador = rigDeformador;
  animation.rigMalla = rigMalla;
  animation.rigMeshesData = rigMeshesData;
  animation.rigAutoWeights = rigAutoWeights;
  animation.rigActionsData = rigActionsData;
  animation.rigControlsData = rigControlsData;
  animation.rigControlPath = rigControlPath;
  animation.rigControlWidget = rigControlWidget;
  animation.rigActionPhase = rigActionPhase;
  animation.rigChannelValueDe = rigChannelValueDe;
  animation.rigNormalizeWeights = rigNormalizeWeights;
  animation.rigDistanciaAlHueso = rigDistanciaAlHueso;
  animation.rigEaseT = rigEaseT;
  animation.rigChannelData = rigChannelData;
  animation.rigChannelSegment = rigChannelSegment;
  animation.rigCurveClipboardData = rigCurveClipboardData;
  animation.rigConstraintData = rigConstraintData;
  animation.storyboardBoard = storyboardBoard;
  animation.storyboardCast = storyboardCast;
  animation.STAGE_POSES = STAGE_POSES;
  animation.storyboardData = storyboardData;
  animation.rigDiagnostics = rigDiagnostics;
  animation.rigReadiness = rigReadiness;
  animation.rigConstraintHasCycle = rigConstraintHasCycle;
  animation.rigOrderedConstraintIds = rigOrderedConstraintIds;

  // La clase History previa se conserva: la usa el resto del módulo.
  class History {
    constructor(limit = 150) { this.limit = limit; this.undoStack = []; this.redoStack = []; }
    commit(label, before, after) {
      this.undoStack.push({ label, before: clone(before), after: clone(after) });
      if (this.undoStack.length > this.limit) this.undoStack.shift();
      this.redoStack.length = 0;
    }
    undo(model) { const e = this.undoStack.pop(); if (!e) return model; this.redoStack.push(e); return new Scene(e.before); }
    redo(model) { const e = this.redoStack.pop(); if (!e) return model; this.undoStack.push(e); return new Scene(e.after); }
  }
  animation.History = History;
})(window);
