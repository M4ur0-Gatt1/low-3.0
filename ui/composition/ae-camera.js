/* ══════════════════════════════════════════════════════════════════════════
   CÁMARA VIRTUAL ESTILO AFTER EFFECTS

   Pedido de Mauro (3.50): «quiero que la cámara del modo composición se parezca
   más a la cámara virtual que tiene After Effects».

   La cámara de LOW era 2D: un recuadro {cx, cy, w, rot} sobre la hoja y un
   paralaje aproximado (p = 100 / (100 + z)). Servía para panear, pero no tenía
   lo que define a la cámara de AE:

     - POSICIÓN y PUNTO DE INTERÉS en 3D (cámara de dos nodos que siempre mira
       a su punto de interés) o cámara de un nodo con orientación libre.
     - ZOOM en píxeles ⇄ DISTANCIA FOCAL en mm ⇄ ÁNGULO DE VISIÓN, con
       película de 36 mm y los presets de lente (15 … 200 mm). Cambiar la lente
       NO es lo mismo que acercar la cámara: el dolly zoom (vértigo) existe.
     - Perspectiva real: los planos se proyectan con una cámara estenopeica, se
       ordenan por profundidad y los que quedan detrás de la cámara no se ven.
     - PROFUNDIDAD DE CAMPO: distancia de enfoque, apertura y nivel de
       desenfoque; los planos fuera de foco se desenfocan.

   Compatibilidad: una clave sin `ae` sigue siendo la cámara 2D de siempre y se
   pinta con el mismo código de antes (vista2D, movida tal cual desde app.js).
   Una clave AE guarda además {cx, cy, w, rot} sincronizados (dónde corta el eje
   óptico al plano de acción y cuánto abarca), así el recuadro del lienzo 2D, el
   panel Cámara y la lista de claves la siguen mostrando.

   Unidades: la profundidad `data-z` de un plano está en las unidades de la mesa
   multiplano. Se pasan a píxeles con k = Z0 / 100, donde Z0 es el zoom de la
   lente de 50 mm para el ancho de la hoja. Con eso la cámara AE por omisión da
   EXACTAMENTE el mismo cuadro y el mismo paralaje que la cámara 2D: pasar de
   una a otra no hace saltar nada.

   Compensación de escala Z: en la mesa cada plano se dibuja del tamaño en que
   se ve. En perspectiva pura un fondo a Z 200 se vería a un tercio, así que el
   plano se agranda en el mundo en proporción a su profundidad: con la cámara
   por omisión se ve del tamaño dibujado, y al moverla se comporta en 3D.

   Límite honesto: un plano paralelo a la imagen se proyecta exacto. Si la
   cámara orbita, el plano se pinta con la mejor transformación afín alrededor
   del punto que la cámara mira (SVG no tiene transformaciones proyectivas):
   en órbitas fuertes el escorzo trapezoidal no se ve, sí el desplazamiento,
   la escala, el giro y el orden por profundidad.
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const composition = LOW.composition = LOW.composition || {};

  const FILM_MM = 36;
  const PRESETS = Object.freeze([15, 20, 24, 28, 35, 50, 80, 135, 200]);
  const NEAR = 1;
  const PASAN = new Set(["defs", "style", "title", "desc", "metadata", "lineargradient", "radialgradient",
    "pattern", "clippath", "mask", "filter", "symbol", "marker", "script"]);
  const NUM = ["x", "y", "z", "poiX", "poiY", "poiZ", "rx", "ry", "rz", "focus", "aperture", "blurLevel"];
  /* El rango de `data-z` que respeta la cámara, el MISMO en las dos vistas. En
     la 2D, z = -100 es el ojo (p = 100 / (100 + z) se va a infinito) y por eso
     siempre se limitó a -60…400. Sin ese límite en la AE, un plano de primer
     plano (z -150, lo que da la manija Z) quedaba DETRÁS de la cámara por
     omisión: desaparecía al pasar a la cámara AE y, al orbitar, volvía espejado
     y gigante. */
  const Z_MIN = -60, Z_MAX = 400;
  const zDe = (v) => clamp(Number.isFinite(v) ? v : 0, Z_MIN, Z_MAX);

  const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  /** Rodrigues: gira `v` alrededor del eje unitario `k`, en grados. */
  function rotar(v, k, grados) {
    const t = grados * Math.PI / 180, c = Math.cos(t), s = Math.sin(t);
    return add(add(mul(v, c), mul(cross(k, v), s)), mul(k, dot(k, v) * (1 - c)));
  }

  /* ── LENTE ─────────────────────────────────────────────────────────────── */
  const zoomDeFocal = (mm, ancho) => num(mm, 50) * ancho / FILM_MM;
  const focalDeZoom = (zoom, ancho) => num(zoom) * FILM_MM / Math.max(1, ancho);
  const anguloDeZoom = (zoom, ancho) => 2 * Math.atan(ancho / 2 / Math.max(1, zoom)) * 180 / Math.PI;
  const zoomDeAngulo = (grados, ancho) => ancho / 2 / Math.tan(clamp(num(grados, 39.6), 1, 170) * Math.PI / 360);
  /** Zoom de la lente de 50 mm para esta hoja: la cámara por omisión de AE. */
  const zoomBase = (ancho) => zoomDeFocal(50, ancho);
  /** Cuántos píxeles de profundidad vale una unidad de `data-z`. */
  const unidadZ = (ancho) => zoomBase(ancho) / 100;

  function vbDe(vb) {
    if (Array.isArray(vb) && vb.length === 4) return vb.map(Number);
    if (typeof global.dzVB === "function") return global.dzVB();
    return [0, 0, 1080, 1080];
  }

  /* ── LA CÁMARA ─────────────────────────────────────────────────────────── */
  /** Base de la cámara: r (derecha de pantalla), u (abajo), f (hacia adelante).
   *  El mundo es el de AE: x a la derecha, y hacia abajo, z hacia adentro. */
  function base(cam) {
    let r = [1, 0, 0], u = [0, 1, 0], f = [0, 0, 1];
    if (cam.type !== "one") {
      const d = sub([cam.poiX, cam.poiY, cam.poiZ], [cam.x, cam.y, cam.z]);
      if (len(d) > 1e-6) {
        f = norm(d);
        let rr = cross([0, 1, 0], f);
        if (len(rr) < 1e-6) rr = [1, 0, 0];
        r = norm(rr); u = cross(f, r);
      }
    }
    // orientación local: X inclina, Y gira, Z rola (como Orientación + Rotación de AE)
    if (cam.rx) { u = rotar(u, r, -cam.rx); f = rotar(f, r, -cam.rx); }
    if (cam.ry) { r = rotar(r, u, cam.ry); f = rotar(f, u, cam.ry); }
    if (cam.rz) { r = rotar(r, f, cam.rz); u = rotar(u, f, cam.rz); }
    return { r, u, f };
  }

  /** Normaliza una cámara AE: completa campos y sincroniza {cx, cy, w, rot}. */
  function completar(cam, vb) {
    vb = vbDe(vb);
    const z0 = zoomBase(vb[2]);
    const c = { ...cam, ae: 1, type: cam.type === "one" ? "one" : "two" };
    for (const k of NUM) c[k] = num(c[k], k === "aperture" ? 25 : k === "blurLevel" ? 100 : 0);
    c.zoom = clamp(num(c.zoom, z0), 1, 1e6);
    c.dof = !!c.dof; c.lockFocus = c.lockFocus !== false;
    return sincronizar(c, vb);
  }

  /** De una clave 2D {cx, cy, w, rot} a la cámara AE que da el MISMO cuadro. */
  function desdeLegacy(cam, vb) {
    vb = vbDe(vb);
    const legacy = cam || {};
    const cx = num(legacy.cx, vb[0] + vb[2] / 2), cy = num(legacy.cy, vb[1] + vb[3] / 2);
    const z0 = zoomBase(vb[2]), d = z0 * Math.max(1, num(legacy.w, vb[2])) / vb[2];
    const out = completar({ type: "two", x: cx, y: cy, z: -d, poiX: cx, poiY: cy, poiZ: 0, zoom: z0,
      rx: 0, ry: 0, rz: num(legacy.rot), dof: false, focus: d, aperture: 25, blurLevel: 100, lockFocus: true }, vb);
    if (legacy.ease) out.ease = legacy.ease;
    return out;
  }

  const comoAE = (cam, vb) => (cam && cam.ae ? completar(cam, vb) : desdeLegacy(cam, vb));

  /** Dónde corta el eje óptico al plano de acción (z = 0) y cuánto abarca. */
  function legacyDe(cam, vb) {
    vb = vbDe(vb);
    const { f } = base(cam), P = [cam.x, cam.y, cam.z];
    let Q = [cam.poiX, cam.poiY, 0], d = Math.abs(cam.z) || 1;
    if (f[2] > 1e-6) {
      const t = -P[2] / f[2];
      if (t > NEAR) { Q = add(P, mul(f, t)); d = t; }
    }
    return { cx: Q[0], cy: Q[1], w: vb[2] * d / Math.max(1, cam.zoom), rot: cam.rz || 0 };
  }

  function sincronizar(cam, vb) {
    Object.assign(cam, legacyDe(cam, vb));
    if (cam.lockFocus) cam.focus = Math.max(NEAR, len(sub([cam.poiX, cam.poiY, cam.poiZ], [cam.x, cam.y, cam.z])));
    return cam;
  }

  /** Alguien editó cx/cy/w/rot de una clave AE (recuadro 2D, panel Cámara):
   *  se traslada esa edición a la cámara 3D en vez de perderla. */
  function aplicarLegacy(cam, vb) {
    vb = vbDe(vb);
    const c = completar({ ...cam, cx: undefined, cy: undefined, w: undefined, rot: undefined }, vb);
    const antes = legacyDe(c, vb);
    const dx = num(cam.cx, antes.cx) - antes.cx, dy = num(cam.cy, antes.cy) - antes.cy;
    c.x += dx; c.poiX += dx; c.y += dy; c.poiY += dy;
    const ratio = num(cam.w, antes.w) / Math.max(1e-6, antes.w);
    if (Math.abs(ratio - 1) > 1e-6) {
      const Q = [antes.cx + dx, antes.cy + dy, 0];
      const P = add(Q, mul(sub([c.x, c.y, c.z], Q), ratio));
      [c.x, c.y, c.z] = P;
    }
    c.rz += num(cam.rot, antes.rot) - antes.rot;
    if (cam.ease) c.ease = cam.ease;
    return sincronizar(c, vb);
  }

  function redondear(cam) {
    const r = (v, p) => Math.round(v * p) / p, out = { ...cam };
    for (const k of NUM) out[k] = r(num(out[k]), k[0] === "r" ? 100 : 10);
    out.zoom = r(out.zoom, 10);
    for (const k of ["cx", "cy", "w", "rot"]) out[k] = r(num(out[k]), 10);
    return out;
  }

  /** Interpola dos claves (2D o AE). El zoom va en escala logarítmica. */
  function interpolar(a, b, t, vb) {
    vb = vbDe(vb);
    const A = comoAE(a, vb), B = comoAE(b, vb), out = { ...A };
    for (const k of NUM) out[k] = A[k] + (B[k] - A[k]) * t;
    out.zoom = A.zoom * Math.pow(B.zoom / A.zoom, t);
    delete out.ease;
    return sincronizar(out, vb);
  }

  /** Proyección estenopeica: mundo → coordenadas de la hoja. */
  function proyector(cam, vb) {
    const B = base(cam), P = [cam.x, cam.y, cam.z];
    const ccx = vb[0] + vb[2] / 2, ccy = vb[1] + vb[3] / 2;
    return (W) => {
      const d = sub(W, P), z = dot(d, B.f);
      if (z < NEAR) return null;
      return { x: ccx + cam.zoom * dot(d, B.r) / z, y: ccy + cam.zoom * dot(d, B.u) / z, z };
    };
  }

  /* ── LA VISTA 2D DE SIEMPRE (movida desde app.js sin cambios) ──────────── */
  function vista2D(svgText, cam) {
    const tmp = document.createElement("div"); tmp.innerHTML = svgText;
    const svg = tmp.querySelector("svg");
    if (!svg) return svgText;
    const vb = (svg.getAttribute("viewBox") || "0 0 1080 1080").split(/\s+/).map(Number);
    const vbcx = vb[0] + vb[2] / 2, vbcy = vb[1] + vb[3] / 2;
    const h = cam.w * (vb[3] / vb[2]);
    const NS = "http://www.w3.org/2000/svg";
    const out = document.createElementNS(NS, "svg");
    out.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    out.setAttribute("viewBox", `${(cam.cx - cam.w / 2).toFixed(1)} ${(cam.cy - h / 2).toFixed(1)} ${cam.w.toFixed(1)} ${h.toFixed(1)}`);
    out.setAttribute("width", Math.round(vb[2])); out.setAttribute("height", Math.round(vb[3]));
    const g = document.createElementNS(NS, "g");
    if (cam.rot) g.setAttribute("transform", `rotate(${(-cam.rot).toFixed(2)} ${cam.cx.toFixed(1)} ${cam.cy.toFixed(1)})`);
    [...svg.children].forEach(n => {
      if (n.classList && n.classList.contains("dz-onion")) return;
      const z = zDe(parseFloat(n.getAttribute && n.getAttribute("data-z")) || 0);
      const compX = parseFloat(n.getAttribute && n.getAttribute("data-comp-x")) || 0;
      const compY = parseFloat(n.getAttribute && n.getAttribute("data-comp-y")) || 0;
      const compRz = parseFloat(n.getAttribute && n.getAttribute("data-comp-rz")) || 0;
      const compSx = parseFloat(n.getAttribute && n.getAttribute("data-comp-sx")) || 1;
      const compSy = parseFloat(n.getAttribute && n.getAttribute("data-comp-sy")) || 1;
      if (z || compX || compY || compRz || compSx !== 1 || compSy !== 1) {
        // multiplano: p = cuánto acompaña esta capa el movimiento de la cámara
        // (1 = igual que el plano de acción; <1 = lejos; >1 = cerca)
        const p = 100 / (100 + z);
        const dx = (cam.cx - vbcx) * (1 - p), dy = (cam.cy - vbcy) * (1 - p);
        // dolly: el viewBox ya escala TODO por vb[2]/cam.w; se contrarresta en
        // proporción a 1-p para que lo cercano crezca más rápido que lo lejano
        const zoomRatio = cam.w / vb[2];
        const extraScale = zoomRatio + (1 - zoomRatio) * p;
        const w = document.createElementNS(NS, "g");
        let tf = `translate(${(dx + compX).toFixed(1)} ${(dy + compY).toFixed(1)})`;
        if (Math.abs(extraScale - 1) > 1e-4) {
          tf += ` translate(${cam.cx.toFixed(1)} ${cam.cy.toFixed(1)}) scale(${extraScale.toFixed(4)}) translate(${(-cam.cx).toFixed(1)} ${(-cam.cy).toFixed(1)})`;
        }
        if (compRz || compSx !== 1 || compSy !== 1) {
          tf += ` translate(${vbcx.toFixed(1)} ${vbcy.toFixed(1)}) rotate(${compRz.toFixed(2)}) scale(${compSx.toFixed(4)} ${compSy.toFixed(4)}) translate(${(-vbcx).toFixed(1)} ${(-vbcy).toFixed(1)})`;
        }
        w.setAttribute("transform", tf);
        w.appendChild(n.cloneNode(true));
        g.appendChild(w);
      } else g.appendChild(n.cloneNode(true));
    });
    out.appendChild(g);
    return out.outerHTML;
  }

  /* ── DÓNDE ESTÁ CADA PLANO EN EL MUNDO ─────────────────────────────────── */
  /** Un plano (hijo del SVG del cuadro) llevado al mundo 3D: su profundidad y
   *  la función que manda un punto de la hoja (u, v) a su lugar en el espacio.
   *  La usan la vista SVG (afín) y el render 3D (perspectiva real): la MISMA
   *  cuenta, así las dos vistas no pueden separarse. */
  function planoMundo(n, vb) {
    const k = unidadZ(vb[2]), z0 = zoomBase(vb[2]);
    const ccx = vb[0] + vb[2] / 2, ccy = vb[1] + vb[3] / 2;
    const at = (a, d) => { const v = parseFloat(n.getAttribute && n.getAttribute(a)); return Number.isFinite(v) ? v : d; };
    const Z = zDe(at("data-z", 0)) * k, ox = at("data-comp-x", 0), oy = at("data-comp-y", 0);
    const rz = at("data-comp-rz", 0) * Math.PI / 180, sx = at("data-comp-sx", 1) || 1, sy = at("data-comp-sy", 1) || 1;
    const cs = Math.cos(rz), sn = Math.sin(rz);
    // compensación de escala Z: el plano se dibujó a su tamaño de pantalla, así
    // que en el mundo se agranda con la profundidad y la cámara por omisión lo
    // muestra del tamaño dibujado (igual que la cámara 2D)
    const comp = Math.max(0.01, (z0 + Z) / z0);
    const mundo = (u, v) => {
      const px = (u - ccx) * sx * comp, py = (v - ccy) * sy * comp;
      return [ccx + ox + px * cs - py * sn, ccy + oy + px * sn + py * cs, Z];
    };
    return { Z, ox, oy, cs, sn, sx, sy, comp, ccx, ccy, mundo };
  }

  /** Los planos del cuadro en el mundo, con las cuatro esquinas de la hoja
   *  (arriba-izq, arriba-der, abajo-der, abajo-izq). Para el render 3D. */
  function planosMundo(svg, vb) {
    vb = vbDe(vb);
    const lista = [];
    [...svg.children].forEach((n, idx) => {
      const tag = String(n.tagName || "").toLowerCase();
      if (n.classList && n.classList.contains("dz-onion")) return;
      if (PASAN.has(tag)) { lista.push({ idx, pasa: true, n }); return; }
      const m = planoMundo(n, vb), [x0, y0, w, h] = vb;
      lista.push({ idx, n, z: m.Z, esquinas: [m.mundo(x0, y0), m.mundo(x0 + w, y0), m.mundo(x0 + w, y0 + h), m.mundo(x0, y0 + h)] });
    });
    return lista;
  }

  /** Desenfoque (en px de la hoja) de un plano a `distancia` de la cámara. */
  function desenfoqueDe(cam, distancia) {
    if (!cam.dof || !(cam.aperture > 0) || !(distancia > 0)) return 0;
    return clamp(cam.aperture * Math.abs(distancia - cam.focus) / distancia * (cam.blurLevel / 100) * 0.5, 0, 80);
  }

  /** La cámara AE como cámara de three.js: posición, base (derecha, ARRIBA de
   *  three = -u, atrás = -f) y campo vertical. Con esto la perspectiva real
   *  coincide punto por punto con `proyector` (lo controla la prueba). */
  function paraThree(camIn, vb) {
    vb = vbDe(vb);
    const cam = completar(camIn, vb), B = base(cam);
    return { posicion: [cam.x, cam.y, cam.z], derecha: B.r, arriba: mul(B.u, -1), atras: mul(B.f, -1), adelante: B.f,
      fovY: 2 * Math.atan(vb[3] / 2 / cam.zoom) * 180 / Math.PI, aspecto: vb[2] / vb[3], cam };
  }

  /* ── LA VISTA POR LA CÁMARA AE ─────────────────────────────────────────── */
  /** Datos de proyección de cada plano (también los usa la prueba). */
  function planosProyectados(svg, cam, vb) {
    const proy = proyector(cam, vb), B = base(cam), P = [cam.x, cam.y, cam.z];
    const ccx = vb[0] + vb[2] / 2, ccy = vb[1] + vb[3] / 2, h = vb[2] * 0.05;
    const lista = [];
    [...svg.children].forEach((n, idx) => {
      const tag = String(n.tagName || "").toLowerCase();
      if (n.classList && n.classList.contains("dz-onion")) return;
      if (PASAN.has(tag)) { lista.push({ idx, pasa: true, n }); return; }
      const { Z, ox, oy, cs, sn, sx, sy, comp, mundo } = planoMundo(n, vb);
      // ancla: donde el eje óptico corta a este plano (el punto que la cámara mira)
      let Q = null;
      if (B.f[2] > 1e-6) {
        const t = (Z - P[2]) / B.f[2];
        if (t > NEAR) Q = add(P, mul(B.f, t));
      }
      if (!Q) Q = mundo(ccx, ccy);
      const qx = Q[0] - ccx - ox, qy = Q[1] - ccy - oy;
      const uQ = ccx + (qx * cs + qy * sn) / (sx * comp), vQ = ccy + (-qx * sn + qy * cs) / (sy * comp);
      const s0 = proy(mundo(uQ, vQ)), s1 = proy(mundo(uQ + h, vQ)), s2 = proy(mundo(uQ, vQ + h));
      if (!s0 || !s1 || !s2) { lista.push({ idx, oculto: true, n, z: Z }); return; }
      const a = (s1.x - s0.x) / h, b = (s1.y - s0.y) / h, c = (s2.x - s0.x) / h, d = (s2.y - s0.y) / h;
      const e = s0.x - a * uQ - c * vQ, f = s0.y - b * uQ - d * vQ;
      const blur = desenfoqueDe(cam, s0.z);
      lista.push({ idx, n, z: Z, distancia: s0.z, matriz: [a, b, c, d, e, f], blur });
    });
    return lista;
  }

  function vista3D(svgText, camIn) {
    const tmp = document.createElement("div"); tmp.innerHTML = svgText;
    const svg = tmp.querySelector("svg");
    if (!svg) return svgText;
    const vb = (svg.getAttribute("viewBox") || "0 0 1080 1080").split(/\s+/).map(Number);
    const cam = completar(camIn, vb);
    const NS = "http://www.w3.org/2000/svg";
    const out = document.createElementNS(NS, "svg");
    out.setAttribute("xmlns", NS);
    out.setAttribute("viewBox", vb.join(" "));
    out.setAttribute("width", Math.round(vb[2])); out.setAttribute("height", Math.round(vb[3]));
    out.setAttribute("data-camara", "ae");
    const planos = planosProyectados(svg, cam, vb);
    planos.filter((p) => p.pasa).forEach((p) => out.appendChild(p.n.cloneNode(true)));
    // AE ordena las capas 3D por distancia a la cámara: lo lejano se pinta primero
    const visibles = planos.filter((p) => p.matriz)
      .sort((a, b) => (b.distancia - a.distancia) || (a.idx - b.idx));
    for (const p of visibles) {
      const g = document.createElementNS(NS, "g");
      g.setAttribute("transform", "matrix(" + p.matriz.map((v) => +v.toFixed(5)).join(" ") + ")");
      if (p.blur > 0.3) g.setAttribute("style", "filter:blur(" + p.blur.toFixed(2) + "px)");
      g.appendChild(p.n.cloneNode(true));
      out.appendChild(g);
    }
    return out.outerHTML;
  }

  /** La vista POR la cámara (la usa el visor, la exportación y Composición). */
  function dzCamView(svgText, cam) {
    return cam && cam.ae ? vista3D(svgText, cam) : vista2D(svgText, cam || {});
  }

  /* ── MOVIMIENTOS DE CÁMARA (las herramientas de AE) ────────────────────── */
  /** Órbita alrededor del punto de interés (dos nodos) o giro de la cámara (un nodo). */
  function orbitar(cam, dxGrados, dyGrados, vb) {
    const c = completar(cam, vb);
    if (c.type === "one") { c.ry += dxGrados; c.rx = clamp(c.rx + dyGrados, -89, 89); return sincronizar(c, vb); }
    const O = [c.poiX, c.poiY, c.poiZ];
    let v = sub([c.x, c.y, c.z], O);
    v = rotar(v, [0, 1, 0], -dxGrados);
    const f = norm(mul(v, -1)), r = norm(cross([0, 1, 0], f));
    const elev = Math.asin(clamp(-v[1] / (len(v) || 1), -1, 1)) * 180 / Math.PI;
    const giro = clamp(elev + dyGrados, -89, 89) - elev;
    if (len(r) > 1e-6) v = rotar(v, r, -giro);
    [c.x, c.y, c.z] = add(O, v);
    return sincronizar(c, vb);
  }
  /** Track XY: mueve cámara y punto de interés juntos sobre el plano de la imagen.
   *  dx/dy en unidades de la hoja medidas en el plano del punto de interés. */
  function trackXY(cam, dx, dy, vb) {
    const c = completar(cam, vb), B = base(c);
    const dist = Math.max(NEAR, dot(sub([c.poiX, c.poiY, c.poiZ], [c.x, c.y, c.z]), B.f)) || c.zoom;
    const s = dist / c.zoom, m = add(mul(B.r, -dx * s), mul(B.u, -dy * s));
    c.x += m[0]; c.y += m[1]; c.z += m[2]; c.poiX += m[0]; c.poiY += m[1]; c.poiZ += m[2];
    return sincronizar(c, vb);
  }
  /** Track Z (dolly): avanza o retrocede por el eje de la cámara, con el punto de interés. */
  function trackZ(cam, d, vb) {
    const c = completar(cam, vb), { f } = base(c);
    c.x += f[0] * d; c.y += f[1] * d; c.z += f[2] * d;
    c.poiX += f[0] * d; c.poiY += f[1] * d; c.poiZ += f[2] * d;
    return sincronizar(c, vb);
  }
  /** Cambia la lente (zoom) sin mover la cámara. */
  function lente(cam, zoom, vb) {
    const c = completar(cam, vb);
    c.zoom = clamp(num(zoom, c.zoom), 1, 1e6);
    return sincronizar(c, vb);
  }
  /** Mira a un punto del mundo: lo vuelve punto de interés (dos nodos). */
  function mirarA(cam, punto, vb) {
    const c = completar(cam, vb);
    [c.poiX, c.poiY, c.poiZ] = punto;
    return sincronizar(c, vb);
  }
  /** Distancia de la cámara a un plano de profundidad `dataZ` por su eje. */
  function distanciaA(cam, dataZ, vb) {
    vb = vbDe(vb);
    const c = completar(cam, vb), { f } = base(c), Z = zDe(num(dataZ)) * unidadZ(vb[2]);
    if (f[2] > 1e-6) return Math.max(NEAR, (Z - c.z) / f[2]);
    return Math.max(NEAR, Math.abs(Z - c.z));
  }

  composition.aeCamera = Object.freeze({
    FILM_MM, PRESETS, zoomDeFocal, focalDeZoom, anguloDeZoom, zoomDeAngulo, zoomBase, unidadZ,
    base, completar, desdeLegacy, comoAE, legacyDe, aplicarLegacy, redondear, interpolar,
    proyector, planosProyectados, vista2D, vista3D, orbitar, trackXY, trackZ, lente, mirarA, distanciaA,
    planoMundo, planosMundo, desenfoqueDe, paraThree, Z_MIN, Z_MAX,
  });
  global.dzCamView = dzCamView;
})(typeof window !== "undefined" ? window : globalThis);
