/* ══════════════════════════════════════════════════════════════════════════
   ESCULPIR TRAZOS — la herramienta

   Pedido de Mauro (oct-2026): «un pincel deformador de trazos inspirado en el
   Sculpt Mode de Blender… no pintar una línea nueva encima sino tomar un trazo
   existente y modificar su recorrido de forma orgánica», con un modo
   REDIBUJAR. «Una herramienta nueva, no sobre el deformador que ya existe.»

   Cómo se apoya en lo que ya hay (y en nada más):
   - un trazo de PINCEL guarda sus puntos con presión en
     `data-low-brush-points` y su pincel en `data-low-brush-config`: se leen,
     se deforman (ui/vector/esculpir-nucleo.js) y se VUELVE A DIBUJAR con su
     mismo pincel (dzBrushRenderElement). Es el mismo elemento: mismo id, mismo
     color de paleta, misma capa; no aparece otra línea.
   - un trazo de LÁPIZ guarda sólo su `d`: la primera vez se muestrea a puntos
     y de ahí en más los guarda en `data-low-trazo-points`, para que la
     segunda pasada parta del recorrido exacto y no de un remuestreo.
   - un paso de Ctrl+Z por gesto (dzSnapshot al apoyar, dzMarkDirty al soltar).

   Con el lápiz: la presión puede manejar la fuerza y/o el radio; Mayús
   suaviza mientras se aprieta (como en Blender); Ctrl invierte (atraer ↔
   alejar, pellizcar ↔ expandir); con el Espejo prendido, esculpe también del
   otro lado.

   @module vector/esculpir
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const N = global.LOW && global.LOW.vector && global.LOW.vector.esculpir;
  if (!N) return;
  const doc = global.document;
  const D = () => (typeof DZ !== "undefined" ? DZ : null);
  const $q = (s, r) => (r || doc).querySelector(s);
  const hoja = () => $q("#dzCanvas")?.querySelector(":scope > svg") || null;
  const TOOL = "sculpt";

  /* ── PREFERENCIAS ───────────────────────────────────────────────────────── */
  const CLAVE = "low.esculpir.v1";
  const prefs = Object.assign({ modo: "agarrar", radio: 40, fuerza: .5, caida: "suave",
    presionFuerza: true, presionRadio: false, radioMin: 12, radioMax: 120, perpendicular: false },
    (() => { try { return JSON.parse(global.localStorage.getItem(CLAVE) || "{}"); } catch (_) { return {}; } })());
  const guardar = () => { try { global.localStorage.setItem(CLAVE, JSON.stringify(prefs)); } catch (_) { /* */ } };

  /* ── LOS TRAZOS ─────────────────────────────────────────────────────────── */
  const FUERA = "g.dz-onion, g.dz-capa, g.dz-penui, [data-low='ruler-guide'], [data-locked], defs, mask, clipPath, pattern";
  function esLapiz(el) {
    if (el.tagName !== "path" || el.closest("[data-low]") !== null && el.closest("[data-low]") !== el) return false;
    const fill = (el.getAttribute("fill") || "").toLowerCase();
    return fill === "none" && !!el.getAttribute("stroke") && !el.hasAttribute("data-low") &&
      ((el.getAttribute("d") || "").match(/[Mm]/g) || []).length === 1;
  }
  function esPincel(el) { return el.hasAttribute("data-low-brush-points") && /^(brush|raster-brush|imported-brush)$/.test(el.getAttribute("data-low") || ""); }
  function candidatos() {
    const svg = hoja();
    if (!svg) return [];
    return [...svg.querySelectorAll("[data-low-brush-points], path")].filter((el) =>
      !el.closest(FUERA) && (esPincel(el) || esLapiz(el)));
  }
  function leer(el) {
    if (esPincel(el)) {
      try { const p = JSON.parse(el.getAttribute("data-low-brush-points")); if (Array.isArray(p) && p.length > 1) return p.map((q) => q.slice()); } catch (_) { /* */ }
      return null;
    }
    const guardados = el.getAttribute("data-low-trazo-points");
    if (guardados) { try { const p = JSON.parse(guardados); if (p.length > 1) return p; } catch (_) { /* */ } }
    const L = el.getTotalLength ? el.getTotalLength() : 0;
    if (!(L > 0)) return null;
    const n = Math.max(2, Math.min(800, Math.ceil(L / 1.5))), pts = [];
    for (let i = 0; i <= n; i++) { const q = el.getPointAtLength(L * i / n); pts.push([q.x, q.y, 1]); }
    return pts;
  }
  const r2 = (n) => Math.round(n * 100) / 100;
  const limpiar = (pts) => pts.map((p) => p.map((v, k) => (k < 2 ? r2(v) : k === 2 ? Math.round(v * 1000) / 1000 : v)));

  /** Vuelve a dibujar el MISMO elemento con sus puntos nuevos. */
  function escribir(el, pts, final) {
    if (esPincel(el)) {
      let config = null;
      try { config = JSON.parse(el.getAttribute("data-low-brush-config") || "null"); } catch (_) { /* */ }
      const color = el.getAttribute("data-low-brush-color") || el.getAttribute("fill") || "#1a1a1a";
      const size = +el.getAttribute("data-low-brush-size") || (config && config.size) || 6;
      const nuevo = typeof global.dzBrushRenderElement === "function" ?
        global.dzBrushRenderElement(pts, color, { brush: config || undefined, size, fixedWidth: el.getAttribute("data-low-brush-fixed") === "1" }) : null;
      if (nuevo) {
        if (el.tagName === nuevo.tagName && el.tagName === "path") el.setAttribute("d", nuevo.getAttribute("d"));
        else {
          el.replaceChildren(...[...nuevo.childNodes]);
          for (const a of ["d", "filter", "mask"]) { if (nuevo.hasAttribute(a)) el.setAttribute(a, nuevo.getAttribute(a)); }
        }
      }
      if (final) el.setAttribute("data-low-brush-points", JSON.stringify(limpiar(pts)));
    } else {
      const d = typeof global.dzSmoothPath === "function" ? global.dzSmoothPath(pts) : "M " + pts.map((p) => r2(p[0]) + " " + r2(p[1])).join(" L ");
      el.setAttribute("d", d);
      if (final) el.setAttribute("data-low-trazo-points", JSON.stringify(limpiar(pts)));
    }
  }

  /* ── COORDENADAS: cada trazo en las suyas ──────────────────────────────── */
  function local(el, cx, cy) {
    const m = el.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    return { x: p.x, y: p.y, escala: Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1, m };
  }
  function deltaLocal(m, dx, dy) {
    const i = m.inverse();
    return [i.a * dx + i.c * dy, i.b * dx + i.d * dy];
  }

  /* ── EL ESPEJO: el mismo gesto del otro lado del eje ──────────────────── */
  function espejo(cx, cy) {
    const dz = D(), svg = hoja();
    if (!dz || !dz.mirror || !svg) return null;
    const m = svg.getScreenCTM(); if (!m) return null;
    const vb = (svg.getAttribute("viewBox") || "0 0 1 1").split(/\s+/).map(Number), eje = vb[0] + vb[2] / 2;
    const u = new DOMPoint(cx, cy).matrixTransform(m.inverse());
    const v = new DOMPoint(2 * eje - u.x, u.y).matrixTransform(m);
    return { x: v.x, y: v.y };
  }

  /* ── EL GESTO ───────────────────────────────────────────────────────────── */
  let gesto = null;
  const presionDe = (e) => (e.pointerType === "pen" || e.pointerType === "touch") && e.pressure > 0 ? e.pressure : 1;
  const radioDe = (p) => prefs.presionRadio ? prefs.radioMin + (prefs.radioMax - prefs.radioMin) * p : prefs.radio;
  const modoDe = (e) => (e.shiftKey ? "suavizar" : prefs.modo);

  function empezar(e) {
    const dz = D(), svg = hoja();
    if (!dz || !svg) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.();
    try { $q("#dzCanvas").setPointerCapture(e.pointerId); } catch (_) { /* */ }
    global.dzSnapshot?.();
    const p = presionDe(e);
    gesto = { id: e.pointerId, modo: modoDe(e), x: e.clientX, y: e.clientY, estados: new Map(), tocados: new Set(),
      guia: [[e.clientX, e.clientY]], invertir: !!(e.ctrlKey || e.metaKey), pendiente: false };
    if (gesto.modo === "agarrar" || gesto.modo === "curvar") {
      for (const pincel of pinceles(e.clientX, e.clientY)) {
        for (const el of candidatos()) {
          const l = local(el, pincel.x, pincel.y); if (!l) continue;
          const R = radioDe(p) / l.escala;
          let pts = leer(el); if (!pts) continue;
          pts = N.subdividir(pts, Math.max(.4, R / 8));
          if (!pts.some((q) => Math.hypot(q[0] - l.x, q[1] - l.y) < R)) continue;
          const g = gesto.modo === "agarrar" ? N.agarrarInicio(pts, [l.x, l.y], R, prefs.caida) : N.curvarInicio(pts, [l.x, l.y], R, prefs.caida);
          const clave = el;
          const prev = gesto.estados.get(clave);
          // con espejo, el mismo trazo puede quedar agarrado por los dos lados
          if (prev) prev.grupos.push({ g, espejo: pincel.espejo });
          else gesto.estados.set(clave, { el, pts, grupos: [{ g, espejo: pincel.espejo }], m: l.m });
        }
      }
    }
    pintarCirculo(e);
  }

  function pinceles(cx, cy) {
    const lista = [{ x: cx, y: cy, espejo: false }];
    const m = espejo(cx, cy);
    if (m) lista.push({ x: m.x, y: m.y, espejo: true });
    return lista;
  }

  function mover(e) {
    if (!gesto || e.pointerId !== gesto.id) { if (D()?.tool === TOOL) pintarCirculo(e); return; }
    e.preventDefault(); e.stopPropagation();
    const eventos = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
    for (const ev of (eventos.length ? eventos : [e])) paso(ev);
    pintarCirculo(e);
    if (!gesto.pendiente) { gesto.pendiente = true; global.requestAnimationFrame(dibujar); }
  }

  function paso(ev) {
    const g = gesto, p = presionDe(ev), k = prefs.fuerza * (prefs.presionFuerza ? p : 1);
    const dx = ev.clientX - g.x, dy = ev.clientY - g.y;
    if (g.modo === "redibujar") { g.guia.push([ev.clientX, ev.clientY]); pintarGuia(); return; }
    if (g.modo === "agarrar" || g.modo === "curvar") {
      const totx = ev.clientX - g.guia[0][0], toty = ev.clientY - g.guia[0][1];
      for (const st of g.estados.values()) {
        let pts = null;
        for (const gr of st.grupos) {
          const [lx, ly] = deltaLocal(st.m, gr.espejo ? -totx : totx, toty);   // el espejo invierte la x de pantalla (el eje es vertical)
          const base = pts ? { ...gr.g, base: pts } : gr.g;
          /* AGARRAR Y CURVAR SIGUEN AL LÁPIZ ENTERO, sin presión ni fuerza.
             Reporte de Mauro con la tableta (3.10.0): «algunas modificaciones
             se vuelven a la posición anterior». Medido: el agarre se escalaba
             por la presión de CADA muestra; al levantar el lápiz la presión cae
             a casi 0 y el trazo volvía a su lugar justo al final (y=402 en vez
             de ~500). Como en Blender, lo agarrado va adonde va la mano. */
          pts = g.modo === "agarrar" ? N.agarrarMover(base, [lx, ly], 1) : N.curvarMover(base, [lx, ly], 1);
        }
        st.pts = pts; g.tocados.add(st);
      }
      return;
    }
    if (Math.hypot(dx, dy) < .5) return;
    g.x = ev.clientX; g.y = ev.clientY;
    let modo = g.modo, signo = 1;
    if (g.invertir) { if (modo === "pellizcar") modo = "expandir"; else if (modo === "expandir") modo = "pellizcar"; else if (modo === "atraer") signo = -1; }
    const op = N.OPERACIONES[modo];
    if (!op) return;
    for (const pincel of pinceles(ev.clientX, ev.clientY)) {
      for (const el of candidatos()) {
        const l = local(el, pincel.x, pincel.y); if (!l) continue;
        const R = radioDe(p) / l.escala;
        let st = g.estados.get(el);
        if (!st) {
          const pts = leer(el); if (!pts) continue;
          if (!pts.some((q) => Math.hypot(q[0] - l.x, q[1] - l.y) < R * 1.2)) continue;
          st = { el, pts: N.subdividir(pts, Math.max(.4, R / 8)), m: l.m };
          g.estados.set(el, st);
        }
        if (!st.pts.some((q) => Math.hypot(q[0] - l.x, q[1] - l.y) < R)) continue;
        const [ldx, ldy] = deltaLocal(l.m, pincel.espejo ? -dx : dx, dy);
        st.pts = N.mantenerDetalle(op(st.pts, { c: [l.x, l.y], R, k: k * signo, delta: [ldx, ldy], caida: prefs.caida, perpendicular: prefs.perpendicular }), Math.max(.4, R / 8));
        g.tocados.add(st);
      }
    }
  }

  function dibujar() {
    if (!gesto) return;
    gesto.pendiente = false;
    for (const st of gesto.tocados) escribir(st.el, st.pts, false);
    global.dzPositionHandle?.();
  }

  function terminar(e) {
    if (!gesto || (e && e.pointerId !== gesto.id)) return;
    const g = gesto; gesto = null;
    try { $q("#dzCanvas").releasePointerCapture(g.id); } catch (_) { /* */ }
    borrarGuia();
    let hechos = 0;
    if (g.modo === "redibujar") hechos = redibujarCon(g.guia);
    else {
      for (const st of g.tocados) {
        const l = local(st.el, g.x, g.y), tol = .25 / (l ? l.escala : 1);
        escribir(st.el, N.simplificar(st.pts, Math.max(.03, tol)), true);
        hechos++;
      }
    }
    if (hechos) {
      const nombre = (N.MODOS.find((m) => m[0] === g.modo) || [, g.modo])[1];
      // el paso de historial con su NOMBRE («Esculpir · Curvar»): el volcado
      // de siempre lo llamaba «Dibujar». Después dzMarkDirty encuentra el mismo
      // contenido y no apila otro paso.
      const dz = D();
      if (dz && dz.doc && typeof global.dzCanvasInner === "function") {
        try { dz.doc.writeDrawing(global.dzCanvasInner(), { label: "Esculpir · " + nombre }); } catch (_) { /* el volcado de siempre lo guarda igual */ }
      }
      global.dzMarkDirty?.();
      global.dzPositionHandle?.();
      global.dzSetStatus?.("Esculpir · " + nombre + ": " + hechos + (hechos === 1 ? " trazo" : " trazos") + " · Ctrl+Z lo deshace");
    } else if (g.modo === "redibujar") {
      global.dzSetStatus?.("Redibujar: empezá y terminá sobre el trazo que querés cambiar");
    }
  }

  /** REDIBUJAR: el trazo cuyas dos puntas quedan más cerca de lo dibujado. */
  function redibujarCon(guiaPantalla) {
    if (guiaPantalla.length < 3) return 0;
    let mejor = null;
    for (const el of candidatos()) {
      const l = local(el, 0, 0); if (!l) continue;
      const inv = l.m.inverse();
      const guia = guiaPantalla.map(([x, y]) => { const q = new DOMPoint(x, y).matrixTransform(inv); return [q.x, q.y]; });
      const tol = 18 / l.escala;
      let pts = leer(el); if (!pts) continue;
      pts = N.subdividir(pts, Math.max(.4, 2 / l.escala));
      const t = N.tramoARedibujar(pts, guia, tol);
      if (t && (!mejor || t.error < mejor.t.error)) mejor = { el, pts, guia, t, escala: l.escala };
    }
    if (!mejor) return 0;
    const r = N.redibujar(mejor.pts, mejor.guia, 18 / mejor.escala, Math.max(.4, 2 / mejor.escala));
    if (!r) return 0;
    escribir(mejor.el, N.simplificar(r.pts, Math.max(.03, .25 / mejor.escala)), true);
    return 1;
  }

  /* ── LO QUE SE VE: el círculo del pincel y la guía de Redibujar ────────── */
  let circulo = null, lienzoGuia = null;
  /* EN COORDENADAS DE PANTALLA, fuera del lienzo. Reporte de Mauro con la
     tableta (3.10.0): «está desfasado el círculo de tamaño de la cruz». El
     círculo vivía DENTRO de #dzCanvas y se ubicaba restando la caja del
     lienzo: cualquier scroll, transformación o corrimiento del lienzo o de sus
     padres lo corría respecto del puntero. Fijo en el <body>, en clientX/Y,
     queda exactamente donde está la punta del lápiz. */
  function dentroDelLienzo(e) {
    const cv = $q("#dzCanvas"); if (!cv) return false;
    const r = cv.getBoundingClientRect();
    return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
  }
  function pintarCirculo(e) {
    const dz = D();
    if (!dz) return;
    if (dz.tool !== TOOL || dz.spaceDown || (!gesto && !dentroDelLienzo(e))) { if (circulo) circulo.hidden = true; return; }
    if (!circulo || !circulo.isConnected) {
      circulo = doc.createElement("div"); circulo.className = "esc-circulo"; circulo.setAttribute("aria-hidden", "true");
      doc.body.appendChild(circulo);
    }
    const R = radioDe(presionDe(e));
    circulo.hidden = false;
    circulo.dataset.modo = gesto ? gesto.modo : modoDe(e);
    Object.assign(circulo.style, { left: (e.clientX - R) + "px", top: (e.clientY - R) + "px", width: 2 * R + "px", height: 2 * R + "px" });
  }
  function pintarGuia() {
    if (!gesto) return;
    if (!lienzoGuia || !lienzoGuia.isConnected) {
      lienzoGuia = doc.createElement("canvas"); lienzoGuia.className = "esc-guia"; lienzoGuia.setAttribute("aria-hidden", "true");
      doc.body.appendChild(lienzoGuia);
    }
    const dpr = global.devicePixelRatio || 1, W = global.innerWidth, H = global.innerHeight;
    if (lienzoGuia.width !== Math.round(W * dpr) || lienzoGuia.height !== Math.round(H * dpr)) {
      lienzoGuia.width = Math.round(W * dpr); lienzoGuia.height = Math.round(H * dpr); lienzoGuia.style.width = W + "px"; lienzoGuia.style.height = H + "px";
    }
    lienzoGuia.hidden = false;
    const g = lienzoGuia.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    g.strokeStyle = "#33B5E8"; g.lineWidth = 2; g.lineCap = g.lineJoin = "round"; g.setLineDash([6, 4]);
    g.beginPath(); gesto.guia.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  }
  function borrarGuia() { if (lienzoGuia) lienzoGuia.hidden = true; }

  /* ── LAS OPCIONES, en la barra de la herramienta ──────────────────────── */
  let panelAbierto = null;
  doc.addEventListener("pointerdown", (e) => {
    const mas = doc.querySelector(".esc-mas");
    if (!mas || !mas.open || mas.contains(e.target) || (panelAbierto && panelAbierto.contains(e.target))) return;
    mas.open = false;
  }, true);
  function opciones() {
    const box = $q("#dzToolOpts");
    if (!box || D()?.tool !== TOOL) return;
    // la barra no conoce esta herramienta y pone la ayuda de la Flecha
    // («clic selecciona · marco vacío…»): acá no corresponde
    box.querySelectorAll(":scope > .dz-hint").forEach((n) => n.remove());
    const s = doc.createElement("span");
    s.className = "esc-opciones";
    s.innerHTML = `<label title="Qué le hace el pincel al trazo · Mayús: suaviza mientras la apretás · Ctrl: invierte · con Espejo, esculpe los dos lados">Modo <select data-e="modo">${N.MODOS.map(([v, n, d]) =>
      `<option value="${v}" title="${d}"${v === prefs.modo ? " selected" : ""}>${n}</option>`).join("")}</select></label>
      <label title="Radio del pincel, en píxeles de pantalla">Radio <input type="range" data-e="radio" min="4" max="300" value="${prefs.radio}"><b>${prefs.radio}</b></label>
      <label title="Cuánto mueve cada pasada">Fuerza <input type="range" data-e="fuerza" min="5" max="100" value="${Math.round(prefs.fuerza * 100)}"></label>
      <details class="esc-mas"><summary title="Caída, presión y dirección">Opciones…</summary><div class="esc-mas-panel">
      <label title="Cómo se apaga el efecto hacia el borde del pincel">Caída <select data-e="caida">
        <option value="suave"${prefs.caida === "suave" ? " selected" : ""}>Suave</option>
        <option value="lineal"${prefs.caida === "lineal" ? " selected" : ""}>Lineal</option>
        <option value="firme"${prefs.caida === "firme" ? " selected" : ""}>Firme</option></select></label>
      <label title="La presión del lápiz maneja la fuerza"><input type="checkbox" data-e="presionFuerza"${prefs.presionFuerza ? " checked" : ""}> Presión→fuerza</label>
      <label title="La presión del lápiz maneja el radio, entre el mínimo y el máximo"><input type="checkbox" data-e="presionRadio"${prefs.presionRadio ? " checked" : ""}> Presión→radio</label>
      <label class="esc-minmax" ${prefs.presionRadio ? "" : "hidden"}>Mín <input type="number" data-e="radioMin" min="2" max="300" value="${prefs.radioMin}"> Máx <input type="number" data-e="radioMax" min="4" max="600" value="${prefs.radioMax}"></label>
      <label title="Empujar sólo de costado al trazo, no a lo largo"><input type="checkbox" data-e="perpendicular"${prefs.perpendicular ? " checked" : ""}> De costado</label>
      </div></details>`;
    s.addEventListener("input", cambio); s.addEventListener("change", cambio);
    /* EL DESPLEGABLE VIVE FUERA DE LA BARRA mientras está abierto. La barra
       tiene `backdrop-filter` y `overflow: auto`: eso la vuelve la caja que
       contiene hasta a lo `position: fixed`, y el panel quedaba recortado y
       debajo del lienzo (medido: el centro de cada control daba #dzCanvas). */
    const mas = s.querySelector(".esc-mas"), panel = mas.querySelector(".esc-mas-panel");
    panel.addEventListener("input", cambio); panel.addEventListener("change", cambio);
    const cerrar = () => { if (panel.parentElement !== mas) mas.appendChild(panel); panel.removeAttribute("style"); };
    mas.addEventListener("toggle", () => {
      if (!mas.open) return cerrar();
      const r = mas.querySelector("summary").getBoundingClientRect();
      doc.body.appendChild(panel);
      Object.assign(panel.style, { position: "fixed", zIndex: 4000, left: Math.max(8, Math.min(r.left, global.innerWidth - 240)) + "px", top: (r.bottom + 6) + "px" });
    });
    if (panelAbierto && panelAbierto !== panel) panelAbierto.remove();
    panelAbierto = panel;
    box.appendChild(s);
  }
  function cambio(e) {
    const el = e.target, k = el.dataset.e;
    if (!k) return;
    if (el.type === "checkbox") prefs[k] = el.checked;
    else if (k === "fuerza") prefs[k] = Math.max(.05, Math.min(1, +el.value / 100));
    else if (k === "modo" || k === "caida") prefs[k] = el.value;
    else prefs[k] = Math.max(2, +el.value || prefs[k]);
    if (k === "radio") { const b = el.parentElement.querySelector("b"); if (b) b.textContent = el.value; }
    if (k === "presionRadio") { const mm = el.closest(".esc-opciones").querySelector(".esc-minmax"); if (mm) mm.hidden = !prefs.presionRadio; }
    guardar();
  }

  /* ── ENGANCHES, sin sumar líneas a app.js ─────────────────────────────── */
  function enganchar() {
    try { if (typeof DZ_TOOL_NAMES !== "undefined") DZ_TOOL_NAMES[TOOL] = "esculpir trazos"; } catch (_) { /* */ }
    try { if (typeof DZ_CURSORS !== "undefined") DZ_CURSORS[TOOL] = "crosshair"; } catch (_) { /* */ }
    // el gesto se toma ANTES que el lienzo (fase de captura en el documento):
    // si no, dzDrawDown lo trataría como el comienzo de un trazo
    doc.addEventListener("pointerdown", (e) => {
      const dz = D(), cv = $q("#dzCanvas");
      if (!dz || dz.tool !== TOOL || !cv || !cv.contains(e.target)) return;
      if (e.button !== 0 || dz.spaceDown) return;                         // la mano y el botón del medio panean
      if (typeof global.dzOnUiPanel === "function" && global.dzOnUiPanel(e)) return;
      empezar(e);
    }, true);
    doc.addEventListener("pointermove", mover, true);
    doc.addEventListener("pointerup", terminar, true);
    doc.addEventListener("pointercancel", terminar, true);
    const orig = global.dzToolOptsRender;
    if (typeof orig === "function" && !orig.__esculpir) {
      const f = function () {
        if (panelAbierto && !doc.querySelector(".esc-mas")?.contains(panelAbierto)) { panelAbierto.remove(); panelAbierto = null; }
        const r = orig.apply(this, arguments);
        try { opciones(); } catch (err) { console.warn("[esculpir]", err); }
        if (circulo && D()?.tool !== TOOL) circulo.hidden = true;
        return r;
      };
      Object.assign(f, orig); f.__esculpir = true;
      global.dzToolOptsRender = f;
    }
  }

  global.LOW.vector.esculpirHerramienta = { prefs, leer, escribir, candidatos, redibujarCon };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(typeof window !== "undefined" ? window : globalThis);
