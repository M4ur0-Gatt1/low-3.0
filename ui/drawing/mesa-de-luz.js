/* ══════════════════════════════════════════════════════════════════════════
   LA MESA DE ANIMACIÓN

   Pedido de Mauro (oct-2026): «que la rotación de la mesa de trabajo y la
   estética de la mesa de trabajo remitan a la clásica mesa de animación 2D,
   como tienen OpenToonz o Toon Boom».

   La mesa del animador es un tablero con un DISCO giratorio: vidrio esmerilado
   iluminado desde abajo, un aro de metal graduado y una REGLA DE PERNOS donde
   se calzan las hojas. Para dibujar cómodo no se tuerce la mano: se gira el
   disco entero, con la hoja y los pernos. Eso es lo que hace esta pieza:

   1. EL DISCO, debajo de la hoja: vidrio con luz, aro graduado cada 5° con
      números cada 30°, y la regla de pernos (redondo al centro, planos a los
      lados, como la Acme) al pie de la hoja. Gira con la vista.
   2. EL ÍNDICE de la mesa, que NO gira: la marca naranja arriba del aro.
   3. EL DIAL de la esquina. Con la hoja ajustada a la pantalla el aro grande
      apenas asoma, y con zoom queda afuera: el dial está siempre a mano. Se
      gira arrastrando, la rueda lo mueve de a 5°, Shift lo lleva de a 15° y el
      doble clic lo endereza.
   4. El aro grande también se agarra donde se ve.
   5. Los botones ±15° GIRAN el disco —un cuarto de segundo— en vez de saltar.

   Sólo cambia cómo se ve: el dibujo y sus coordenadas no se tocan.

   CUIDADOS
   - El aro y el dial son UI (`.dz-disc`, que ya está en DZ_UI_SEL de app.js):
     un clic ahí no dibuja. El VIDRIO no: un trazo que empieza fuera de la hoja
     sigue dibujando, como siempre.
   - El disco se mide con la hoja (su alto en pantalla): con la vista ajustada,
     el aro asoma arriba y abajo de la hoja, como en la mesa de verdad cuando
     la hoja es apaisada. «Ajustar a pantalla» deja ese margen sólo con la mesa
     prendida.
   - Se cuelga de `dzApplyZoom` por su nombre: todas las llamadas de app.js lo
     buscan por nombre, así que el envoltorio las alcanza a todas sin sumarle
     líneas a app.js.

   @module drawing/mesa-de-luz
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const CLAVE = "low.mesa.v1";
  const doc = global.document;
  let prendida = leerPreferencia();
  let raiz = null, disco = null, indice = null, dial = null, medidaPintada = "";
  let animacion = null;     // {desde, hasta, t0, ms, fin}

  function leerPreferencia() {
    try { return global.localStorage.getItem(CLAVE) !== "0"; } catch (_) { return true; }
  }
  function guardarPreferencia() {
    try { global.localStorage.setItem(CLAVE, prendida ? "1" : "0"); } catch (_) { /* sin almacenamiento */ }
  }
  const estado = () => (typeof DZ !== "undefined" ? DZ : null);   // DZ es `let` de app.js: alcance compartido
  const lienzo = () => doc.querySelector("#dzCanvas");
  const hoja = () => lienzo()?.querySelector(":scope > svg") || null;
  const grados = () => Number(estado()?.viewRot) || 0;
  const r1 = (n) => Math.round(n * 10) / 10;

  /* ── EL DIBUJO DEL DISCO ─────────────────────────────────────────────────
     Un generador para los tres: el disco bajo la hoja, el dial de la esquina y
     el disco de la portada. Coordenadas centradas en 0; todo en px.

     SE PINTA COMO IMAGEN, NO COMO ELEMENTOS SVG. Varias partes de LOW
     reconocen «el dibujo» por `#dzCanvas svg` (la selección, los nodos, el
     paso del puntero, la herramienta de texto). Un <svg> de la mesa dentro de
     #dzCanvas se hacía pasar por parte del dibujo: medido en la puerta, sus
     <text> de grados quedaban como «texto en el lienzo» después de deshacer
     uno de verdad. Como fondo (data URI) la mesa no deja NINGÚN elemento SVG
     en el lienzo; el aro que se agarra es un <div> recortado con clip-path. */
  const TINTA = "rgba(236,234,226,";
  function graduacion(rIn, rOut, o = {}) {
    const ancho = rOut - rIn, partes = [], k = o.trazo || 1;
    const paso = o.paso || 5, numeros = o.numeros !== false;
    const fuente = o.fuente || Math.max(7, Math.min(11, ancho * 0.34));
    for (let g = 0; g < 360; g += paso) {
      const mayor = g % 30 === 0, medio = g % 15 === 0;
      const largo = ancho * (mayor ? 0.42 : medio ? 0.3 : 0.18);
      const a = (g - 90) * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
      const x1 = r1(c * rIn), y1 = r1(s * rIn), x2 = r1(c * (rIn + largo)), y2 = r1(s * (rIn + largo));
      const trazo = g === 0 ? `stroke="#F0450E" stroke-width="${r1(2.2 * k)}"` :
        mayor ? `stroke="${TINTA}.62)" stroke-width="${r1(1.4 * k)}"` : `stroke="${TINTA}.32)" stroke-width="${r1(k)}"`;
      partes.push(`<line ${trazo} stroke-linecap="round" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
      if (numeros && mayor && ancho >= 16) {
        const rt = rIn + ancho * 0.7;
        partes.push(`<text fill="${TINTA}.62)" font-family="JetBrains Mono, Consolas, monospace" font-weight="600" ` +
          `text-anchor="middle" dominant-baseline="central" font-size="${r1(fuente)}" ` +
          `transform="rotate(${g}) translate(0 ${r1(-rt)})">${g}</text>`);
      }
    }
    return partes.join("");
  }

  function discoSVG(rIn, rOut, o = {}) {
    const id = o.id || "mesa";
    const reglaY = o.reglaY, reglaAncho = o.reglaAncho;
    const perno = `fill="#b9b6ac" stroke="rgba(0,0,0,.45)" stroke-width=".8"`;
    let regla = "";
    if (reglaY != null && reglaAncho > 20) {
      const alto = Math.max(6, Math.min(14, reglaAncho * 0.02)), y = r1(reglaY);
      const plano = Math.max(8, alto * 1.9), xs = r1(reglaAncho * 0.38);
      regla = `<rect x="${r1(-reglaAncho / 2)}" y="${y}" width="${r1(reglaAncho)}" height="${r1(alto)}" rx="${r1(alto / 3)}" fill="url(#${id}Metal)"/>` +
        `<rect ${perno} x="${r1(-xs - plano / 2)}" y="${r1(reglaY + alto * 0.22)}" width="${r1(plano)}" height="${r1(alto * 0.56)}" rx="${r1(alto * 0.28)}"/>` +
        `<circle ${perno} cx="0" cy="${r1(reglaY + alto / 2)}" r="${r1(alto * 0.34)}"/>` +
        `<rect ${perno} x="${r1(xs - plano / 2)}" y="${r1(reglaY + alto * 0.22)}" width="${r1(plano)}" height="${r1(alto * 0.56)}" rx="${r1(alto * 0.28)}"/>`;
    }
    return `<defs>` +
      `<radialGradient id="${id}Vidrio"><stop offset="0" stop-color="#fff6e6" stop-opacity=".34"/>` +
      `<stop offset=".72" stop-color="#ffe9cc" stop-opacity=".22"/><stop offset="1" stop-color="#ffe2bf" stop-opacity=".11"/></radialGradient>` +
      `<linearGradient id="${id}Metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#55534e"/>` +
      `<stop offset=".5" stop-color="#2f2e2b"/><stop offset="1" stop-color="#1a1918"/></linearGradient></defs>` +
      `<circle r="${r1(rIn)}" fill="url(#${id}Vidrio)"/>` +
      `<circle r="${r1((rIn + rOut) / 2)}" fill="none" stroke="url(#${id}Metal)" stroke-width="${r1(rOut - rIn)}"/>` +
      `<circle r="${r1(rIn)}" fill="none" stroke="rgba(0,0,0,.6)"/><circle r="${r1(rOut)}" fill="none" stroke="rgba(0,0,0,.6)"/>` +
      graduacion(rIn, rOut, o) + regla + (o.extra || "");
  }

  /** El disco como valor de `background-image`, en un cuadrado de lado 2·mitad. */
  function discoImagen(rIn, rOut, o = {}) {
    const t = o.mitad || rOut + 2;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r1(-t)} ${r1(-t)} ${r1(t * 2)} ${r1(t * 2)}">` +
      discoSVG(rIn, rOut, o) + `</svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
  }

  /** Un aro como recorte: sólo la corona entre rIn y rOut recibe el puntero. */
  function recorteDeAro(t, rIn, rOut) {
    const circ = (r) => `M ${r1(t - r)} ${r1(t)} a ${r1(r)} ${r1(r)} 0 1 0 ${r1(2 * r)} 0 a ${r1(r)} ${r1(r)} 0 1 0 ${r1(-2 * r)} 0 Z`;
    return `path(evenodd, "${circ(rOut)} ${circ(rIn)}")`;
  }

  /* ── MEDIDAS: el disco se mide con la hoja ─────────────────────────────── */
  function medidas() {
    const svg = hoja(), dz = estado();
    if (!svg || !dz) return null;
    const w = svg.clientWidth, h = svg.clientHeight, z = Number(dz.zoom) || 1;
    if (!(w > 0 && h > 0)) return null;
    const mw = (w * z) / 2, mh = (h * z) / 2;
    // el disco abraza el lado largo de la hoja: las esquinas asoman sobre el
    // aro, y arriba y abajo se ve el vidrio iluminado (medido: un disco del
    // alto de la hoja quedaba tapado por una hoja apaisada y no se leía)
    const rIn = Math.max(mw, mh) * 1.03;
    const aro = Math.max(16, Math.min(36, rIn * 0.06));
    return { w, h, z, mw, mh, rIn, rOut: rIn + aro };
  }

  /* ── MONTAJE ───────────────────────────────────────────────────────────── */
  function montar() {
    const cv = lienzo();
    if (!cv) return false;
    if (raiz && raiz.isConnected) return true;
    raiz = doc.createElement("div");
    raiz.id = "dzMesa"; raiz.className = "mesa-luz"; raiz.setAttribute("aria-hidden", "true");
    raiz.innerHTML = '<div class="mesa-disco"><div class="mesa-aro dz-disc"></div></div>' +
      '<div class="mesa-indice"><i></i></div>';
    cv.insertBefore(raiz, cv.firstChild);        // debajo de todo: la hoja va arriba
    disco = raiz.querySelector(".mesa-disco");
    indice = raiz.querySelector(".mesa-indice");
    const aro = disco.querySelector(".mesa-aro");
    aro.addEventListener("pointerdown", (e) => agarrar(e, disco, aro));
    aro.addEventListener("dblclick", (e) => { e.preventDefault(); enderezar(); });
    medidaPintada = "";
    montarDial(cv);
    return true;
  }

  function montarDial(cv) {
    if (dial && dial.isConnected) return;
    dial = doc.createElement("div");
    dial.id = "dzDisc"; dial.className = "dz-disc mesa-dial";
    dial.title = "Disco de la mesa: arrastrá para girar la hoja · rueda: de a 5° · " +
      "Shift: de a 15° · doble clic: enderezar";
    dial.innerHTML = '<i class="mesa-dial-giro"></i><i class="mesa-dial-indice"></i><b class="mesa-dial-grados">0°</b>';
    cv.appendChild(dial);
    dial.addEventListener("pointerdown", (e) => agarrar(e, dial, dial));
    dial.addEventListener("dblclick", (e) => { e.preventDefault(); enderezar(); });
    dial.addEventListener("wheel", (e) => {
      e.preventDefault(); e.stopPropagation();
      girarA(destino() + (e.deltaY > 0 ? 5 : -5), 90);
    }, { passive: false });
  }

  /** El dial: el disco en chico con una hojita de la proporción del documento. */
  function imagenDial(w, h) {
    const as = h / w, ww = as > 1 ? 34 / as : 34, hh = as > 1 ? 34 : 34 * as;
    const hojita = `<rect x="${r1(-ww / 2)}" y="${r1(-hh / 2)}" width="${r1(ww)}" height="${r1(hh)}" rx="1.5" ` +
      `fill="rgba(250,248,242,.9)" stroke="rgba(0,0,0,.35)" stroke-width=".6"/>` +
      `<rect x="-12" y="${r1(hh / 2 + 1.5)}" width="24" height="2.5" rx="1" fill="#8d8a82"/>`;
    return discoImagen(30, 44, { id: "d", paso: 15, numeros: false, mitad: 46, extra: hojita });
  }

  /* ── PINTAR: lo llama dzApplyZoom en cada cambio de vista ──────────────── */
  let dialPintado = "";
  function pintar() {
    const cv = lienzo();
    if (!cv) return;
    const m = prendida ? medidas() : null;
    cv.classList.toggle("con-mesa", !!m);
    if (!m) { if (raiz) raiz.hidden = true; if (dial) dial.hidden = true; return; }
    montar();
    raiz.hidden = false; dial.hidden = false;
    const dz = estado(), px = Number(dz.panX) || 0, py = Number(dz.panY) || 0, rot = grados();
    const clave = [m.w, m.h, r1(m.z * 1000)].join("|");
    if (clave !== medidaPintada) {
      const t = m.rOut + 2, lado = r1(t * 2) + "px";
      disco.style.width = disco.style.height = lado;
      disco.style.backgroundImage = discoImagen(m.rIn, m.rOut, { id: "g", mitad: t,
        reglaY: m.mh + 2, reglaAncho: m.mw * 1.25 });
      const aro = disco.firstChild;
      aro.style.clipPath = recorteDeAro(t, m.rIn, m.rOut);
      aro.dataset.r = r1((m.rIn + m.rOut) / 2);        // el radio medio, para quien lo mida
      medidaPintada = clave;
    }
    disco.style.transform = `translate(-50%, -50%) translate(${px}px, ${py}px) rotate(${rot}deg)`;
    indice.style.transform = `translate(-50%, -100%) translate(${px}px, ${r1(py - m.rOut + 3)}px)`;
    const claveDial = m.w + "x" + m.h, giro = dial.querySelector(".mesa-dial-giro");
    if (claveDial !== dialPintado) { giro.style.backgroundImage = imagenDial(m.w, m.h); dialPintado = claveDial; }
    giro.style.transform = `rotate(${r1(rot)}deg)`;
    const g = Math.round(rot);
    dial.querySelector(".mesa-dial-grados").textContent = (g === 0 ? 0 : g) + "°";
    dial.classList.toggle("girada", g % 360 !== 0);
  }

  /* ── GIRAR ─────────────────────────────────────────────────────────────── */
  const normalizar = (g) => { const n = g % 360; return Object.is(n, -0) ? 0 : n; };
  const destino = () => (animacion ? animacion.hasta : grados());

  function fijar(g) {
    const dz = estado();
    if (!dz) return;
    dz.viewRot = normalizar(g);
    global.dzApplyZoom?.();
  }

  /* Gira con una curva corta, como un disco que tiene peso. Sin animación si
     la ventana está oculta (no hay cuadros) o si se pidió menos movimiento. */
  function girarA(hasta, ms = 220) {
    const desde = grados();
    const quieto = doc.hidden || global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (animacion) { clearTimeout(animacion.fin); animacion = null; }
    if (quieto || ms <= 0 || Math.abs(hasta - desde) < 0.5) { fijar(hasta); return; }
    const yo = { desde, hasta, t0: global.performance.now(), ms };
    // el cierre no depende de los cuadros: si la ventana deja de pintar, el
    // disco igual queda donde se pidió
    yo.fin = setTimeout(() => { if (animacion === yo) { animacion = null; fijar(hasta); } }, ms + 120);
    animacion = yo;
    const paso = (ahora) => {
      if (animacion !== yo) return;
      const t = Math.min(1, (ahora - yo.t0) / yo.ms), k = 1 - Math.pow(1 - t, 3);
      if (t >= 1) { animacion = null; clearTimeout(yo.fin); fijar(hasta); return; }
      const dz = estado(); if (dz) { dz.viewRot = desde + (hasta - desde) * k; global.dzApplyZoom?.(); }
      global.requestAnimationFrame(paso);
    };
    global.requestAnimationFrame(paso);
  }

  /** Endereza por el camino corto: de 350° vuelve a 360, no a 0 dando la vuelta. */
  function enderezar() {
    const g = grados(), hasta = Math.round(g / 360) * 360;
    girarA(hasta, 260);
    global.dzSetStatus?.("Disco enderezado");
  }

  /* Agarrar el disco: el ángulo del puntero alrededor del centro manda.
     Shift lo lleva de a 15°. Pointer events: anda con mouse, lápiz y dedo. */
  function agarrar(e, el, captor = el) {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    e.preventDefault(); e.stopPropagation();
    if (animacion) { clearTimeout(animacion.fin); animacion = null; }
    const r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const angulo = (ev) => Math.atan2(ev.clientY - cy, ev.clientX - cx) * 180 / Math.PI;
    const inicio = angulo(e), base = grados(), id = e.pointerId;
    try { captor.setPointerCapture(id); } catch (_) { /* sin captura */ }
    el.classList.add("agarrado");
    const mover = (ev) => {
      if (ev.pointerId !== id) return;
      let d = angulo(ev) - inicio;
      if (d > 180) d -= 360; else if (d < -180) d += 360;
      let g = base + d;
      if (ev.shiftKey) g = Math.round(g / 15) * 15;
      fijar(g);
    };
    const soltar = (ev) => {
      if (ev.pointerId !== id) return;
      captor.removeEventListener("pointermove", mover);
      captor.removeEventListener("pointerup", soltar);
      captor.removeEventListener("pointercancel", soltar);
      el.classList.remove("agarrado");
    };
    captor.addEventListener("pointermove", mover);
    captor.addEventListener("pointerup", soltar);
    captor.addEventListener("pointercancel", soltar);
  }

  /* ── PRENDER Y APAGAR ──────────────────────────────────────────────────── */
  function marcarBoton() {
    const b = doc.querySelector("#dzDiscBtn");
    if (!b) return;
    b.classList.toggle("active", prendida);
    b.setAttribute("aria-pressed", prendida ? "true" : "false");
    b.title = "Mesa de animación: disco giratorio con luz de abajo y regla de pernos. " +
      (prendida ? "Apretá para trabajar sobre fondo liso." : "Apretá para volver a la mesa.");
  }
  function alternar() {
    prendida = !prendida;
    guardarPreferencia(); marcarBoton(); pintar();
    global.dzSetStatus?.(prendida ? "Mesa de animación: girá el disco desde el dial o desde su aro"
      : "Mesa de animación apagada: fondo liso");
    return prendida;
  }

  /* Ajustar a pantalla con la mesa: deja ver el aro a los lados (o arriba y
     abajo, si la pantalla es angosta). Cuesta poco: la hoja ya deja ese margen
     casi siempre. Sin la mesa, el ajuste de siempre. */
  function ajustarConMesa(original) {
    return function () {
      const r = original.apply(this, arguments);
      const dz = estado(), cv = lienzo(), svg = hoja();
      if (prendida && dz && cv && svg && svg.clientHeight > 0) {
        const lugar = Math.max(cv.clientWidth, cv.clientHeight) / 2 - 6;
        const maxZ = (lugar - 36) / ((Math.max(svg.clientWidth, svg.clientHeight) / 2) * 1.03);
        if (maxZ > 0.05 && dz.zoom > maxZ) { dz.zoom = maxZ; global.dzApplyZoom?.(); }
      }
      return r;
    };
  }

  /* ── ENGANCHES con app.js, por nombre ──────────────────────────────────── */
  function enganchar() {
    const zoom = global.dzApplyZoom;
    if (typeof zoom === "function" && !zoom.__mesa) {
      const envuelto = function () {
        const r = zoom.apply(this, arguments);
        try { pintar(); } catch (err) { console.warn("[mesa] no se pudo pintar", err); }
        return r;
      };
      envuelto.__mesa = true;
      global.dzApplyZoom = envuelto;
    }
    const ajustar = global.dzFitView;
    if (typeof ajustar === "function" && !ajustar.__mesa) {
      const envuelto = ajustarConMesa(ajustar);
      envuelto.__mesa = true;
      global.dzFitView = envuelto;
      // el botón de la barra guardó la función vieja en su onclick
      const b = doc.querySelector("#dzZoomFit");
      if (b) b.onclick = () => global.dzFitView();
    }
    // los ±15° giran el disco en vez de saltar
    global.dzRotView = (delta) => girarA(destino() + (Number(delta) || 0));
    global.dzDiscToggle = alternar;
    marcarBoton();
    pintar();
  }

  global.LOW_MESA = { discoSVG, discoImagen, graduacion, girarA, enderezar, alternar, pintar,
    get prendida() { return prendida; } };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(typeof window !== "undefined" ? window : globalThis);
