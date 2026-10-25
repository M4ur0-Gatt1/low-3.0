/* ══════════════════════════════════════════════════════════════════════════
   LA TOMA EN 3D DE VERDAD Y LA VISTA DIVIDIDA (3.51)

   Pedido de Mauro, con el reel de Yuzu Studio de referencia: «el render de
   Composición con perspectiva real en 3D y la vista dividida: arriba la escena,
   abajo el resultado final». En el reel, la vista de arriba muestra la cámara
   3D y las capas separadas en Z, y la de abajo, la toma terminada.

   Por qué hacía falta: la vista Cámara de 3.50 pinta en SVG, y SVG no tiene
   transformaciones proyectivas. Cada plano se aproximaba con una afín alrededor
   del punto que mira la cámara: al orbitar fuerte, una capa no se veía en
   escorzo (el lado lejano más chico) y una capa que la cámara atravesaba
   desaparecía entera en vez de cortarse.

   Cómo es ahora:
     · TOMA (abajo): three.js con la MISMA cámara (`aeCamera.paraThree`, que
       la prueba compara punto por punto con el proyector AE) y los planos en
       el MISMO lugar del mundo (`aeCamera.planosMundo`, la cuenta que usa la
       vista SVG). Cada plano es su dibujo rasterizado UNA vez a una textura;
       mover la cámara sólo vuelve a dibujar. Escorzo real, recorte en el
       plano cercano, orden por distancia y profundidad de campo (cada plano
       se desenfoca según su distancia al foco, como en la vista SVG).
     · VISTA DE TRABAJO (arriba): la misma escena desde afuera, con un piso
       de referencia, el contorno de cada capa, el cuerpo de la cámara, su
       pirámide de visión y el punto de interés. Arrastrar la gira, la rueda
       acerca, doble clic vuelve al ángulo de partida. No toca la cámara de la
       escena ni deja claves.

   El SVG de siempre queda debajo de la toma: es el respaldo si no hay WebGL y
   la referencia que leen las pruebas. Una clave 2D (sin `ae`) se sigue viendo
   con el SVG, que es exactamente lo que se exporta.

   @module composition/ae-render3d
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const composition = LOW.composition = LOW.composition || {};
  const THREE_SRC = "vendor/three.min.js";
  const TEX_MAX = 2048;
  const CLAVE_DIVIDIDA = "low.cmp.dividida";
  const COLORES = [0xf0450e, 0x2b9dff, 0x35c46a, 0xe8b10c, 0xb05cff, 0x14c3c3, 0xff5c8a];
  const ae = () => composition.aeCamera;

  let cargando = null;
  function cargarThree() {
    if (global.THREE) return Promise.resolve(global.THREE);
    if (cargando) return cargando;
    cargando = new Promise((ok, fail) => {
      const s = document.createElement("script");
      s.src = THREE_SRC;
      s.onload = () => (global.THREE ? ok(global.THREE) : fail(Error("three.js cargó sin exponer THREE")));
      s.onerror = () => { cargando = null; fail(Error("no se pudo cargar " + THREE_SRC)); };
      document.head.appendChild(s);
    });
    return cargando;
  }

  const leer = (k, d) => { try { const v = global.localStorage.getItem(k); return v == null ? d : v === "1"; } catch (_) { return d; } };
  const guardar = (k, v) => { try { global.localStorage.setItem(k, v ? "1" : "0"); } catch (_) { /* sin almacenamiento */ } };

  /* ── estado ─────────────────────────────────────────────────────────────── */
  const E = {
    raiz: null, work: null, shot: null, cvWork: null, cvShot: null,
    T: null, escena: null, grupoPlanos: null, ayudas: null,
    rToma: null, rTrabajo: null, camToma: null, camTrabajo: null,
    planos: [], textoActual: null, vbActual: null, ultimo: null,
    orbita: { az: 38, el: 34, zoom: 1 }, dividida: leer(CLAVE_DIVIDIDA, true),
    error: null, generacion: 0, pendiente: false,
  };

  /* ── armado del DOM (una vez) ──────────────────────────────────────────── */
  function montar(camview) {
    if (!camview || camview.dataset.r3d) return;
    camview.dataset.r3d = "1";
    E.raiz = camview;
    // lo que había adentro (el SVG de la toma) pasa a la mitad de abajo
    const shot = document.createElement("div"); shot.className = "cmp3-shot";
    const svgHost = document.createElement("div"); svgHost.className = "cmp3-shot-svg";
    while (camview.firstChild) svgHost.appendChild(camview.firstChild);
    const cvShot = document.createElement("canvas"); cvShot.className = "cmp3-gl";
    const rotToma = document.createElement("span"); rotToma.className = "cmp3-rotulo"; rotToma.textContent = "Toma · cámara de la escena";
    shot.append(svgHost, cvShot, rotToma);
    const work = document.createElement("div"); work.className = "cmp3-work";
    const cvWork = document.createElement("canvas"); cvWork.className = "cmp3-gl-work";
    const rotWork = document.createElement("span"); rotWork.className = "cmp3-rotulo";
    rotWork.textContent = "Vista de trabajo · arrastrá para girar · rueda acerca · doble clic: ángulo inicial";
    work.append(cvWork, rotWork);
    camview.append(work, shot);
    Object.assign(E, { work, shot, cvWork, cvShot });
    camview.classList.toggle("cmp3-dividida", E.dividida);

    // la vista de trabajo tiene sus propios gestos: no mueven la cámara de la escena
    work.addEventListener("pointerdown", gestoTrabajo);
    work.addEventListener("wheel", (e) => {
      e.preventDefault(); e.stopPropagation();
      E.orbita.zoom = Math.max(0.15, Math.min(6, E.orbita.zoom * (e.deltaY < 0 ? 0.88 : 1 / 0.88)));
      pintar();
    }, { passive: false });
    work.addEventListener("dblclick", (e) => { e.stopPropagation(); E.orbita = { az: 38, el: 34, zoom: 1 }; pintar(); });
    if (typeof ResizeObserver === "function") new ResizeObserver(() => pintar()).observe(camview);
    botonDividida();
  }

  function botonDividida() {
    const barra = E.raiz && E.raiz.closest("#dzComposition3D")?.querySelector(".cmp3-camtools");
    if (!barra || barra.querySelector('[data-camaccion="dividida"]')) return;
    const b = document.createElement("button");
    b.dataset.camaccion = "dividida";
    b.textContent = "Dividida";
    b.title = "Vista dividida: arriba la escena con la cámara y las capas en Z, abajo la toma (como el visor de After Effects)";
    b.classList.toggle("active", E.dividida);
    b.onclick = () => setDividida(!E.dividida);
    barra.appendChild(b);
  }

  function setDividida(si) {
    E.dividida = !!si; guardar(CLAVE_DIVIDIDA, E.dividida);
    if (E.raiz) E.raiz.classList.toggle("cmp3-dividida", E.dividida);
    const b = E.raiz && E.raiz.closest("#dzComposition3D")?.querySelector('[data-camaccion="dividida"]');
    if (b) b.classList.toggle("active", E.dividida);
    pintar();
  }

  function gestoTrabajo(e) {
    e.stopPropagation(); e.preventDefault();
    const x0 = e.clientX, y0 = e.clientY, o0 = { ...E.orbita };
    const mover = (ev) => {
      E.orbita.az = o0.az + (ev.clientX - x0) * 0.4;
      E.orbita.el = Math.max(-80, Math.min(89, o0.el + (ev.clientY - y0) * 0.4));
      pintar();
    };
    const soltar = () => { global.removeEventListener("pointermove", mover); global.removeEventListener("pointerup", soltar); };
    global.addEventListener("pointermove", mover);
    global.addEventListener("pointerup", soltar);
  }

  /* ── three.js ───────────────────────────────────────────────────────────── */
  function iniciarGL(T) {
    if (E.rToma) return true;
    try {
      const op = { antialias: true, alpha: true, preserveDrawingBuffer: true };
      E.rToma = new T.WebGLRenderer({ canvas: E.cvShot, ...op });
      E.rTrabajo = new T.WebGLRenderer({ canvas: E.cvWork, ...op });
    } catch (err) {
      E.error = "sin WebGL: " + (err && err.message || err);
      return false;
    }
    for (const r of [E.rToma, E.rTrabajo]) {
      r.outputEncoding = T.sRGBEncoding;
      r.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    }
    E.rToma.setClearColor(0xffffff, 1);
    E.rTrabajo.setClearColor(0x17181b, 1);
    E.escena = new T.Scene();
    E.grupoPlanos = new T.Group(); E.ayudas = new T.Group();
    E.escena.add(E.grupoPlanos, E.ayudas);
    E.camToma = new T.PerspectiveCamera(40, 16 / 9, 1, 1e7);
    E.camToma.matrixAutoUpdate = false;
    E.camTrabajo = new T.PerspectiveCamera(40, 1, 1, 1e7);
    E.camTrabajo.up.set(0, -1, 0);   // en el mundo de AE la y crece hacia abajo
    return true;
  }

  const v3 = (T, a) => new T.Vector3(a[0], a[1], a[2]);

  /** Arma los planos del cuadro en el visor (sólo cuando cambia el dibujo). */
  function armarPlanos(T, texto, vb) {
    E.generacion++;
    const gen = E.generacion;
    soltarPlanos(E.planos);
    E.grupoPlanos.clear();
    E.planos = construirPlanos(T, texto, vb, E.grupoPlanos, () => gen === E.generacion, () => pintar()).planos;
  }

  function soltarPlanos(planos) {
    for (const p of planos) { p.mesh.geometry.dispose(); p.mesh.material.dispose(); p.tex && p.tex.dispose(); }
  }

  /** Los planos de un cuadro como mallas de three.js dentro de `grupo`. Cada
   *  textura se rasteriza aparte; `listo` se cumple cuando están todas.
   *  `vigente()` dice si todavía hacen falta (un cuadro nuevo las descarta). */
  function construirPlanos(T, texto, vb, grupo, vigente, alCargar) {
    const planos = [], esperas = [];
    const tmp = document.createElement("div"); tmp.innerHTML = texto;
    const svg = tmp.querySelector("svg");
    if (!svg) return { planos, listo: Promise.resolve(planos) };
    const lista = ae().planosMundo(svg, vb);
    const pasan = lista.filter((p) => p.pasa).map((p) => p.n.outerHTML).join("");
    const esc = Math.min(1, TEX_MAX / Math.max(vb[2], vb[3]));
    const tw = Math.max(1, Math.round(vb[2] * esc)), th = Math.max(1, Math.round(vb[3] * esc));
    const NS = "http://www.w3.org/2000/svg";
    lista.filter((p) => !p.pasa).forEach((p, orden) => {
      const [A, B, , D] = p.esquinas;
      const X = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];   // ancho de la hoja en el mundo
      const Y = [A[0] - D[0], A[1] - D[1], A[2] - D[2]];   // de abajo hacia arriba de la hoja
      const C = p.esquinas.reduce((s, q) => [s[0] + q[0] / 4, s[1] + q[1] / 4, s[2] + q[2] / 4], [0, 0, 0]);
      const vx = v3(T, X), vy = v3(T, Y), vz = new T.Vector3().crossVectors(vx, vy).normalize();
      const canvas = document.createElement("canvas"); canvas.width = tw; canvas.height = th;
      const tex = new T.CanvasTexture(canvas);
      tex.encoding = T.sRGBEncoding;
      tex.anisotropy = 4;
      const mat = new T.MeshBasicMaterial({ map: tex, transparent: true, side: T.DoubleSide, depthWrite: false });
      const mesh = new T.Mesh(new T.PlaneGeometry(1, 1), mat);
      mesh.matrixAutoUpdate = false;
      mesh.matrix.makeBasis(vx, vy, vz).setPosition(v3(T, C));
      mesh.matrixWorldNeedsUpdate = true;
      mesh.userData.orden = orden;
      grupo.add(mesh);
      const plano = { mesh, tex, canvas, img: null, blur: -1, z: p.z, esquinas: p.esquinas, centro: C, color: COLORES[orden % COLORES.length] };
      planos.push(plano);
      // el dibujo de esta capa, solo, con los <defs>/<style> del cuadro
      const fuente = '<svg xmlns="' + NS + '" viewBox="' + vb.join(" ") + '" width="' + tw + '" height="' + th + '">' + pasan + p.n.outerHTML + "</svg>";
      esperas.push(new Promise((fin) => {
        const img = new Image();
        const url = URL.createObjectURL(new Blob([fuente], { type: "image/svg+xml" }));
        img.onload = () => { URL.revokeObjectURL(url); if (vigente()) { plano.img = img; plano.blur = -1; alCargar && alCargar(); } fin(); };
        img.onerror = () => { URL.revokeObjectURL(url); if (vigente()) E.error = "no pude rasterizar una capa"; fin(); };
        img.src = url;
      }));
    });
    return { planos, listo: Promise.all(esperas).then(() => planos) };
  }

  /* ── EXPORTAR POR LA CÁMARA AE ─────────────────────────────────────────────
     La exportación (MP4, GIF, PNG, Premiere), la vista previa y el play fluido
     piden el cuadro por `dzExportCuadroSvgListo`: con una clave AE, el cuadro
     sale de ESTE render, no de la aproximación SVG. Lo que se ve en la toma es
     lo que sale. Un renderer aparte, fuera de pantalla, para no tocar el visor. */
  const X = { r: null, escena: null, cam: null, texto: null, vb: null, planos: [], grupo: null };
  async function tomaPng(texto, camIn, vb) {
    if (!ae()) return null;
    let T;
    try { T = await cargarThree(); } catch (_) { return null; }
    if (!X.r) {
      try {
        X.r = new T.WebGLRenderer({ canvas: document.createElement("canvas"), antialias: true, alpha: true, preserveDrawingBuffer: true });
      } catch (_) { X.r = null; return null; }
      X.r.outputEncoding = T.sRGBEncoding;
      X.r.setPixelRatio(1);
      X.r.setClearColor(0x000000, 0);   // el papel lo pone el cuadro; lo vacío queda transparente, como el SVG
      X.escena = new T.Scene(); X.grupo = new T.Group(); X.escena.add(X.grupo);
      X.cam = new T.PerspectiveCamera(40, 16 / 9, 1, 1e7); X.cam.matrixAutoUpdate = false;
    }
    if (texto !== X.texto || String(vb) !== String(X.vb)) {   // un dibujo sostenido no se vuelve a rasterizar
      soltarPlanos(X.planos); X.grupo.clear();
      X.texto = texto; X.vb = vb;
      const armado = construirPlanos(T, texto, vb, X.grupo, () => X.texto === texto, null);
      X.planos = armado.planos;
      await armado.listo;
      if (X.texto !== texto) return null;
    }
    const t = ae().paraThree(camIn, vb), cam = t.cam, c = X.cam;
    c.fov = t.fovY; c.aspect = t.aspecto; c.near = 1; c.far = 1e7; c.updateProjectionMatrix();
    c.matrix.makeBasis(v3(T, t.derecha), v3(T, t.arriba), v3(T, t.atras)).setPosition(v3(T, t.posicion));
    c.matrixWorldNeedsUpdate = true; c.updateMatrixWorld(true);
    for (const p of X.planos) {
      const d = (p.centro[0] - t.posicion[0]) * t.adelante[0] + (p.centro[1] - t.posicion[1]) * t.adelante[1] + (p.centro[2] - t.posicion[2]) * t.adelante[2];
      texturaCon(p, ae().desenfoqueDe(cam, d), vb);
    }
    const esc = Math.min(1, 4096 / Math.max(vb[2], vb[3]));
    X.r.setSize(Math.round(vb[2] * esc), Math.round(vb[3] * esc), false);
    X.r.render(X.escena, c);
    return X.r.domElement.toDataURL("image/png");
  }

  /** Redibuja la textura de un plano con su desenfoque (sólo si cambió). */
  function texturaCon(plano, blurHoja, vb) {
    if (!plano.img) return;
    const b = Math.round(blurHoja * 2) / 2;
    if (b === plano.blur) return;
    plano.blur = b;
    const ctx = plano.canvas.getContext("2d"), esc = plano.canvas.width / vb[2];
    ctx.clearRect(0, 0, plano.canvas.width, plano.canvas.height);
    ctx.filter = b > 0.3 ? "blur(" + (b * esc).toFixed(2) + "px)" : "none";
    ctx.drawImage(plano.img, 0, 0, plano.canvas.width, plano.canvas.height);
    ctx.filter = "none";
    plano.tex.needsUpdate = true;
  }

  /** Las ayudas de la vista de trabajo: piso, contornos, cámara, pirámide y punto de interés. */
  function armarAyudas(T, t, cam, vb, ancho) {
    E.ayudas.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    E.ayudas.clear();
    const lineas = (pts, color, opac = 1) => {
      const g = new T.BufferGeometry().setFromPoints(pts.map((p) => v3(T, p)));
      return new T.LineSegments(g, new T.LineBasicMaterial({ color, transparent: opac < 1, opacity: opac, depthTest: false }));
    };
    // contorno de cada capa, con su color
    for (const p of E.planos) {
      const q = p.esquinas, seg = [];
      for (let i = 0; i < 4; i++) seg.push(q[i], q[(i + 1) % 4]);
      E.ayudas.add(lineas(seg, p.color));
    }
    // la cámara: pirámide de visión hasta el plano que mira, y su cuerpo
    const P = t.posicion, f = t.adelante, r = t.derecha, u = t.arriba.map((x) => -x);
    const D = Math.max(1, cam.focus || Math.abs(cam.z) || cam.zoom);
    const hw = vb[2] / 2 * D / cam.zoom, hh = vb[3] / 2 * D / cam.zoom;
    const esq = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [0, 1, 2].map((i) => P[i] + f[i] * D + r[i] * a * hw + u[i] * b * hh));
    const pir = [];
    for (let i = 0; i < 4; i++) pir.push(P, esq[i], esq[i], esq[(i + 1) % 4]);
    E.ayudas.add(lineas(pir, 0x9dbbff, 0.9));
    const cuerpo = new T.Mesh(new T.BoxGeometry(ancho * 0.05, ancho * 0.035, ancho * 0.07),
      new T.MeshBasicMaterial({ color: 0x2b6cff, depthTest: false }));
    cuerpo.matrixAutoUpdate = false;
    cuerpo.matrix.makeBasis(v3(T, t.derecha), v3(T, t.arriba), v3(T, t.atras)).setPosition(v3(T, P));
    E.ayudas.add(cuerpo);
    if (cam.type !== "one") {
      const O = [cam.poiX, cam.poiY, cam.poiZ], s = ancho * 0.03;
      E.ayudas.add(lineas([[O[0] - s, O[1], O[2]], [O[0] + s, O[1], O[2]], [O[0], O[1] - s, O[2]], [O[0], O[1] + s, O[2]],
        [O[0], O[1], O[2] - s], [O[0], O[1], O[2] + s], P, O], 0x9dbbff, 0.7));
    }
    // piso de referencia debajo de la hoja (la y del mundo crece hacia abajo)
    const piso = new T.GridHelper(ancho * 3, 24, 0x3a3d44, 0x26282d);
    piso.position.set(vb[0] + vb[2] / 2, vb[1] + vb[3] + vb[3] * 0.08, 0);
    E.ayudas.add(piso);
  }

  /** Coloca el lienzo de la toma exactamente sobre el SVG (mismo tamaño en pantalla). */
  function encuadrarToma() {
    const svg = E.shot && E.shot.querySelector(".cmp3-shot-svg svg");
    if (!svg) return null;
    const rs = svg.getBoundingClientRect(), rp = E.shot.getBoundingClientRect();
    if (!(rs.width > 0 && rs.height > 0)) return null;
    Object.assign(E.cvShot.style, { left: (rs.left - rp.left) + "px", top: (rs.top - rp.top) + "px", width: rs.width + "px", height: rs.height + "px" });
    return rs;
  }

  /** Dibuja las dos vistas con el último estado. Es barato: no rasteriza nada. */
  function pintar() {
    if (!E.rToma || !E.ultimo) return;
    const T = E.T, { cam: camIn, vb } = E.ultimo;
    const t = ae().paraThree(camIn, vb), cam = t.cam;
    // ── cámara de la toma
    const c = E.camToma;
    c.fov = t.fovY; c.aspect = t.aspecto; c.near = 1; c.far = 1e7; c.updateProjectionMatrix();
    c.matrix.makeBasis(v3(T, t.derecha), v3(T, t.arriba), v3(T, t.atras)).setPosition(v3(T, t.posicion));
    c.matrixWorldNeedsUpdate = true;
    c.updateMatrixWorld(true);
    // profundidad de campo: cada plano según su distancia (la misma fórmula que el SVG)
    const P = t.posicion, f = t.adelante;
    for (const p of E.planos) {
      const d = (p.centro[0] - P[0]) * f[0] + (p.centro[1] - P[1]) * f[1] + (p.centro[2] - P[2]) * f[2];
      texturaCon(p, ae().desenfoqueDe(cam, d), vb);
    }
    // ── la toma
    const rs = encuadrarToma();
    const usarGL = E.ultimo.esAE && !!rs;
    E.shot.classList.toggle("gl-listo", usarGL && E.planos.every((p) => p.img));
    if (usarGL) {
      E.rToma.setSize(Math.round(rs.width), Math.round(rs.height), false);
      E.ayudas.visible = false;
      E.rToma.render(E.escena, c);
    }
    // ── la vista de trabajo
    if (E.dividida) {
      const rw = E.work.getBoundingClientRect();
      if (rw.width > 0 && rw.height > 0) {
        E.rTrabajo.setSize(Math.round(rw.width), Math.round(rw.height), false);
        // encuadre: todas las capas y la cámara
        const pts = E.planos.flatMap((p) => p.esquinas).concat([P]);
        if (!pts.length) pts.push([vb[0] + vb[2] / 2, vb[1] + vb[3] / 2, 0]);
        const min = [0, 1, 2].map((i) => Math.min(...pts.map((q) => q[i]))), max = [0, 1, 2].map((i) => Math.max(...pts.map((q) => q[i])));
        const centro = [0, 1, 2].map((i) => (min[i] + max[i]) / 2);
        const radio = Math.max(1, Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2);
        armarAyudas(T, t, cam, vb, radio);
        const w = E.camTrabajo;
        w.aspect = rw.width / rw.height; w.fov = 35;
        const dist = radio / Math.sin(w.fov * Math.PI / 360) * 1.05 * E.orbita.zoom;
        const az = E.orbita.az * Math.PI / 180, el = E.orbita.el * Math.PI / 180;
        // de frente es desde -z (donde está la cámara de la escena); arriba es -y
        w.position.set(centro[0] + dist * Math.sin(az) * Math.cos(el), centro[1] - dist * Math.sin(el), centro[2] - dist * Math.cos(az) * Math.cos(el));
        w.near = Math.max(1, dist / 1000); w.far = dist * 10;
        w.lookAt(centro[0], centro[1], centro[2]);
        w.updateProjectionMatrix();
        E.ayudas.visible = true;
        E.rTrabajo.render(E.escena, w);
      }
    }
  }

  /** Lo llama la vista Cámara en cada cambio: dibujo del cuadro, cámara y hoja. */
  function actualizar(texto, cam, vb) {
    if (!E.raiz || !ae()) return;
    // una clave 2D se lleva a la cámara AE que da el mismo cuadro (para la vista
    // de trabajo); la TOMA de una clave 2D sigue siendo el SVG, que es lo que se exporta
    E.ultimo = { cam: ae().comoAE(cam || {}, vb), esAE: !!(cam && cam.ae), vb };
    if (E.rToma) {
      if (texto !== E.textoActual || String(vb) !== String(E.vbActual)) {
        E.textoActual = texto; E.vbActual = vb;
        armarPlanos(E.T, texto || "", vb);
      }
      pintar();
      return;
    }
    if (E.error || E.pendiente) return;
    E.pendiente = true;
    cargarThree().then((T) => {
      E.T = T; E.pendiente = false;
      if (!iniciarGL(T)) return;
      E.textoActual = null;
      if (E.ultimo) actualizar(texto, E.ultimo.cam, E.ultimo.vb);
    }).catch((err) => { E.pendiente = false; E.error = String(err && err.message || err); });
  }

  /** Para las pruebas y el diagnóstico. */
  function estado() {
    return { listo: !!E.rToma, error: E.error, planos: E.planos.length, rasterizados: E.planos.filter((p) => p.img).length,
      dividida: E.dividida, gl: !!(E.shot && E.shot.classList.contains("gl-listo")), orbita: { ...E.orbita } };
  }

  composition.render3d = Object.freeze({ montar, actualizar, pintar, setDividida, estado, cargarThree, tomaPng });
})(typeof window !== "undefined" ? window : globalThis);
