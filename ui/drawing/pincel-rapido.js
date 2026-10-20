/* ══════════════════════════════════════════════════════════════════════════
   EL CLIC DERECHO DEL LÁPIZ ABRE EL PINCEL

   Pedido de Mauro (oct-2026): «quiero que el clic derecho del lápiz de la
   tableta muestre las opciones de pincel o del lápiz: el suavizado, el
   espesor y la presión; quiero poder desactivar, activar o variar la presión
   del pincel».

   Con el Lápiz o el Pincel elegidos, el botón lateral del lápiz (con la punta
   apoyada o en el aire) abre, ahí donde está la punta, un panel chico:
   - Espesor y Suavizado: los mismos valores del inspector y de la barra;
   - Presión: prendida (el trazo engorda y adelgaza con la mano) o apagada
     (= «Ancho fijo» del inspector);
   - Variación: cuánto se nota la presión, de 0 % (nada) a 200 % (el doble de
     lo que trae el pincel); 100 % = el pincel como viene. Se guarda con cada
     trazo (data-low-brush-config), así que repintarlo no lo cambia;
   - Unir puntas (drawing/unir-puntas.js).
   El Lápiz traza parejo (no usa la presión): ahí la presión aparece apagada y
   lo dice.

   ¿CUÁNDO ES EL LÁPIZ Y NO EL MOUSE? Según el controlador de la tableta,
   Windows manda el botón lateral como clic derecho del MOUSE (ver
   drawing/pulsacion-larga.js), y antes del clic mueve el cursor del mouse a
   la punta. Así que vale el tipo del evento, o que el clic caiga DONDE el
   lápiz estaba flotando hace menos de 600 ms (a menos de 24 px): un mouse de
   verdad no aparece justo ahí en ese instante. El clic derecho
   del mouse sigue abriendo el menú de siempre. El que llega durante un trazo
   del lápiz o enseguida después (pulsación larga) sigue descartándose.

   Además el botón derecho ya no DIBUJA con el Lápiz ni el Pincel (antes el
   botón lateral con la punta apoyada hacía un trazo).

   @module drawing/pincel-rapido
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const doc = global.document;
  const D = () => (typeof DZ !== "undefined" ? DZ : null);
  const CLAVE_VAR = "low.presion.variacion";
  const VENTANA = 700;        // tras un trazo del lápiz: pulsación larga, no botón lateral
  const FLOTANDO = 600;       // el lápiz estuvo flotando hace menos de esto
  const ahora = () => global.performance.now();
  const almacen = () => { try { return typeof dzPrefsStorage === "function" ? dzPrefsStorage() : global.localStorage; } catch (_) { return null; } };
  const $ = (s) => doc.querySelector(s);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ── la variación de presión ──
  function variacion() { const v = Number(D()?.presionVar); return Number.isFinite(v) ? clamp(v, 0, 200) : 100; }
  function ponerVariacion(v) {
    const dz = D(); if (!dz) return;
    dz.presionVar = clamp(Math.round(Number(v) || 0), 0, 200);
    try { almacen()?.setItem(CLAVE_VAR, String(dz.presionVar)); } catch (_) { /* sin almacenamiento */ }
  }
  /** El pincel con la variación de presión aplicada (100 % = como viene). */
  function presionAplicada(p) {
    const v = variacion();
    if (!p || v === 100) return p;
    const f = v / 100;
    return { ...p, pressureSize: clamp((p.pressureSize ?? .75) * f, 0, 1), pressureOpacity: clamp((p.pressureOpacity ?? 0) * f, 0, 1) };
  }

  // ── espesor y suavizado: los mismos campos del inspector y de la barra ──
  function ponerEspesor(v) {
    const dz = D(); if (!dz) return;
    dz.drawW = clamp(Math.round(Number(v) || 6), 1, 120);
    for (const s of ["#dzDrawW", "#toW"]) { const i = $(s); if (i) i.value = dz.drawW; }
  }
  function ponerSuavizado(v) {
    const dz = D(); if (!dz) return;
    dz.smooth = clamp(Math.round(Number(v) || 0), 0, 100);
    for (const [i, l] of [["#dzSmooth", "#dzSmoothLbl"], ["#toSmooth", "#toSmoothLbl"]]) {
      const x = $(i); if (x) x.value = dz.smooth; const y = $(l); if (y) y.textContent = String(dz.smooth);
    }
    try { almacen()?.setItem("low.dzsmooth", String(dz.smooth)); } catch (_) { /* sin almacenamiento */ }
  }

  // ── el panel ──
  let panel = null;
  const esDibujo = () => ["pencil", "brush"].includes(D()?.tool);
  function nombre() {
    const dz = D();
    if (dz?.tool === "pencil") return "Lápiz";
    return (global.dzCurrentBrush && global.dzCurrentBrush()?.name) || "Pincel";
  }
  function pintar() {
    const dz = D(); if (!panel || !dz) return;
    const lapiz = dz.tool === "pencil", conPresion = !dz.anchoFijo && !lapiz;
    const unir = global.LOW?.drawing?.unirPuntas?.activo?.() || false;
    panel.innerHTML = `
      <div class="pr-cab"><strong>${nombre()}</strong><button type="button" class="pr-x" data-pr="cerrar" aria-label="Cerrar" title="Cerrar (Esc)">×</button></div>
      <label class="pr-fila"><span>Espesor</span><input type="range" data-pr="espesor" min="1" max="120" value="${dz.drawW || 6}"><output>${dz.drawW || 6}</output></label>
      <label class="pr-fila"><span>Suavizado</span><input type="range" data-pr="suavizado" min="0" max="100" value="${dz.smooth ?? 40}"><output>${dz.smooth ?? 40} %</output></label>
      <div class="pr-fila"><span>Presión</span><button type="button" class="pr-sw${conPresion ? " on" : ""}" data-pr="presion" aria-pressed="${conPresion}" ${lapiz ? "disabled" : ""}
        title="${lapiz ? "El Lápiz traza parejo: la presión la usa el Pincel" : "Prendida: el trazo engorda y adelgaza con la presión del lápiz. Apagada: ancho fijo"}">${conPresion ? "Prendida" : "Apagada"}</button></div>
      <label class="pr-fila"><span>Variación</span><input type="range" data-pr="variacion" min="0" max="200" step="5" value="${variacion()}" ${conPresion ? "" : "disabled"}
        title="Cuánto se nota la presión: 0 % nada, 100 % el pincel como viene, 200 % el doble"><output>${variacion()} %</output></label>
      ${lapiz ? `<p class="pr-nota">El Lápiz traza parejo: la presión es del Pincel.</p>` : ""}
      <div class="pr-fila"><span>Unir puntas</span><button type="button" class="pr-sw${unir ? " on" : ""}" data-pr="unir" aria-pressed="${unir}"
        title="Un trazo que empieza o termina en la punta de otra línea (mismo color y pincel) se une con ella">${unir ? "Prendido" : "Apagado"}</button></div>
      <p class="pr-pie">Atajo: <kbd>Shift+B</kbd> · <button type="button" class="pr-link" data-pr="ayuda-lapicera">Ponérselo al botón de la lapicera…</button></p>`;
  }
  function crear() {
    if (panel) return panel;
    panel = doc.createElement("div");
    panel.id = "dzPincelRapido"; panel.className = "dz-pincel-rapido";
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Opciones del pincel");
    panel.hidden = true;
    panel.addEventListener("input", (e) => {
      const k = e.target.getAttribute("data-pr"), out = e.target.parentNode.querySelector("output");
      if (k === "espesor") { ponerEspesor(e.target.value); if (out) out.textContent = String(D().drawW); }
      else if (k === "suavizado") { ponerSuavizado(e.target.value); if (out) out.textContent = D().smooth + " %"; }
      else if (k === "variacion") { ponerVariacion(e.target.value); if (out) out.textContent = variacion() + " %"; }
    });
    panel.addEventListener("click", (e) => {
      const b = e.target.closest("[data-pr]"); if (!b || b.disabled) return;
      const k = b.getAttribute("data-pr");
      if (k === "cerrar") return cerrar();
      if (k === "ayuda-lapicera") { cerrar(); return ayudaLapicera(); }
      if (k === "presion") { global.dzAnchoFijoToggle?.(); pintar(); }
      else if (k === "unir") { const u = global.LOW?.drawing?.unirPuntas; u?.poner(!u.activo()); pintar(); }
    });
    // que el lápiz no dibuje a través del panel
    panel.addEventListener("pointerdown", (e) => e.stopPropagation());
    doc.body.appendChild(panel);
    return panel;
  }
  function abrir(x, y) {
    crear(); pintar(); panel.hidden = false;
    const r = panel.getBoundingClientRect(), W = global.innerWidth, H = global.innerHeight;
    panel.style.left = clamp(x + 12, 8, Math.max(8, W - r.width - 8)) + "px";
    panel.style.top = clamp(y - 20, 8, Math.max(8, H - r.height - 8)) + "px";
    panel.querySelector("input")?.focus({ preventScroll: true });
  }
  function cerrar() { if (panel && !panel.hidden) panel.hidden = true; }
  /* ── CÓMO PONERLE EL PANEL AL BOTÓN DE LA LAPICERA ──────────────────────
     Medido con la lapicera de Mauro (Huion Inspiroy H1060P): el botón con
     «botón derecho del ratón» llega mal —sólo al levantar la punta quieta, y
     no siempre—; el botón con una TECLA llega siempre. Así que el camino que
     se explica es asignarle Shift+B en el programa de la tableta. La ventana
     tiene una prueba en vivo: apretás el botón y dice qué llegó. */
  function ayudaLapicera() {
    if (typeof global.openModal !== "function") return false;
    global.openModal(`<h2>El botón de la lapicera abre el pincel</h2>
      <div class="sub">En LOW, <kbd>Shift+B</kbd> abre las opciones del pincel —espesor, suavizado, presión— ahí donde está la punta.
        Asignale esa combinación a un botón de la lapicera en el programa de tu tableta y queda a un clic.</div>
      <div class="lap-pasos">
        <h3>Con cualquier tableta</h3>
        <ol><li>Abrí el <b>programa de tu tableta</b> (el controlador que trae la marca).</li>
          <li>Buscá la configuración del <b>lápiz</b> o de sus <b>botones</b>.</li>
          <li>En el botón que quieras, elegí la función de <b>teclado</b>. Según la marca se llama «Teclado», «Pulsación de tecla»,
            «Atajo de teclado», «Keystroke» o «Shortcut».</li>
          <li>Apretá <kbd>Shift</kbd> + <kbd>B</kbd>, guardá o aplicá, y probalo acá abajo.</li></ol>
        <h3>Dónde está en cada marca</h3>
        <ul class="lap-marcas">
          <li><b>Huion</b> (Inspiroy, Kamvas): HuionTablet → <i>Lápiz Digital</i> → el botón → <i>Teclado</i>.</li>
          <li><b>Wacom</b>: Propiedades de la tableta Wacom o Wacom Center → el botón lateral → <i>Pulsación de tecla…</i></li>
          <li><b>XP-Pen</b>: Pentablet → <i>Lápiz</i> → el botón → <i>Teclado</i>.</li>
          <li><b>Gaomon, Veikk, Ugee, Parblo</b> y otras: el mismo camino en su programa: <i>Lápiz</i> → el botón → <i>Teclado</i> o <i>Atajo</i>.</li>
        </ul>
        <p class="lap-nota">Si el botón queda como <b>botón derecho del ratón</b> también funciona, pero con Windows Ink el clic suele llegar recién
          al <b>levantar</b> la punta después de apoyarla quieta un momento, y no siempre. Con la tecla es inmediato.
          Si tu programa no deja asignar teclas, apretá <kbd>Shift+B</kbd> en el teclado: se abre donde está la lapicera.</p>
      </div>
      <div class="lap-prueba" id="lapPrueba" tabindex="-1">Probalo acá: apretá el botón de la lapicera…</div>
      <div class="modal-actions"><button type="button" class="ghost" id="lapCerrar">Listo</button></div>`);
    // en WINDOW: antes que los atajos (si no, Shift+B abría el panel por detrás)
    const caja = doc.querySelector("#lapPrueba"), fin = () => { global.removeEventListener("keydown", oir, true); global.removeEventListener("contextmenu", oirClic, true); global.closeModal?.(); };
    const oir = (e) => {
      if (!caja || !caja.isConnected || doc.querySelector("#overlay")?.hidden) return global.removeEventListener("keydown", oir, true);
      if (["Shift", "Control", "Alt", "Meta"].includes(e.key)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const k = (e.ctrlKey ? "Ctrl+" : "") + (e.altKey ? "Alt+" : "") + (e.shiftKey ? "Shift+" : "") + (e.key.length === 1 ? e.key.toUpperCase() : e.key);
      const ok = e.shiftKey && !e.ctrlKey && !e.altKey && e.key.toLowerCase() === "b";
      caja.className = "lap-prueba " + (ok ? "ok" : "otra");
      caja.textContent = ok ? "¡Anda! El botón manda Shift+B: va a abrir las opciones del pincel." : "Llegó «" + k + "». Para abrir el pincel tiene que mandar Shift+B.";
    };
    const oirClic = (e) => {
      if (!caja || !caja.isConnected || doc.querySelector("#overlay")?.hidden) return global.removeEventListener("contextmenu", oirClic, true);
      e.preventDefault(); e.stopImmediatePropagation();
      caja.className = "lap-prueba otra";
      caja.textContent = "Llegó un clic derecho. Funciona, pero sólo al levantar la punta quieta: asignale Shift+B para que sea inmediato.";
    };
    global.addEventListener("keydown", oir, true);
    global.addEventListener("contextmenu", oirClic, true);
    doc.querySelector("#lapCerrar")?.addEventListener("click", fin);
    caja?.focus();
    return true;
  }
  // Ayuda → «Configurar el botón de la lapicera…»
  function engancharMenu() {
    const orig = global.dzMenuAction;
    if (typeof orig !== "function" || orig.__lapicera) return;
    const f = function (act) { if (act === "lapicera") return ayudaLapicera(); return orig.apply(this, arguments); };
    Object.assign(f, orig); f.__lapicera = true;
    global.dzMenuAction = f;
  }

  /** Con el atajo (Shift+B): donde está la lapicera; si no, el cursor; si no,
   *  el centro de la hoja. Con otra herramienta, pasa al Pincel. Apretado de
   *  nuevo, lo cierra. */
  let cursor = null;
  function abrirAqui() {
    if (abierto()) { cerrar(); return false; }
    if (!esDibujo()) global.dzSetTool?.("brush");
    let p = ahora() - flota.t < 3000 ? flota : cursor;
    if (!p) { const r = $("#dzCanvas")?.getBoundingClientRect(); p = r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 200, y: 200 }; }
    abrir(p.x, p.y);
    return true;
  }
  const abierto = () => !!(panel && !panel.hidden);

  // ── ¿es el lápiz? ──
  /* LAS TRES FORMAS EN QUE LLEGA EL BOTÓN LATERAL (v3.36.1). En la 3.35 sólo
     se reconocía «clic derecho» y con la lapicera de Mauro no pasaba nada
     («si hago clic derecho con la lapicera no hace nada»). Según el
     controlador, el botón lateral llega como:
     1. BOTÓN + TOCAR: un TOQUE normal (button 0) y, al levantar, Windows manda
        el clic derecho. Ese clic llegaba < 700 ms después de un «trazo» y se
        descartaba como pulsación larga. Un toque corto (< 350 ms, < 8 px) no es
        una pulsación larga: es el botón.
     2. BOTÓN APRETADO CON LA PUNTA APOYADA: pointerdown con button 2, o con
        button 0 y el bit del botón lateral en `buttons` (3).
     3. BOTÓN CON LA PUNTA EN EL AIRE: un pointermove del lápiz con el bit 2 en
        `buttons`, sin pointerdown.
     Y si el controlador lo emula como clic del MOUSE, cuenta que el lápiz
     estaba flotando ahí (< 600 ms, < 24 px). */
  const TOQUE_MS = 350, TOQUE_PX = 8;
  let flota = { x: 0, y: 0, t: -Infinity, botones: 0 }, trazando = false, fin = -Infinity, tragarHasta = -Infinity;
  let contacto = null, ultimoToque = null;
  /** Sobre la hoja: el lienzo o lo que flota encima de ella (el marco de la
   *  cámara, guías), pero no un botón o un panel. */
  const enLienzo = (e) => {
    const cv = $("#dzCanvas"); if (!cv || !e.target) return false;
    if ($("#overlay") && !$("#overlay").hidden) return false;      // hay una ventana encima
    if (cv.contains(e.target)) return true;
    const r = cv.getBoundingClientRect();
    const dentro = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    return dentro && !(e.target.closest && e.target.closest("button, input, select, textarea, [role=dialog], [role=menu], .ctx-menu, .dz-pincel-rapido"));
  };
  const delLapiz = (e) => e.pointerType === "pen"
    || (ahora() - flota.t < FLOTANDO && Math.hypot(e.clientX - flota.x, e.clientY - flota.y) < 24);
  const reciente = () => trazando || ahora() - fin < VENTANA;
  /** El último contacto del lápiz fue el botón lateral: lo marcó el bit, o fue un toque corto. */
  const fueBoton = () => {
    const c = trazando ? contacto && { dur: ahora() - contacto.t, mov: contacto.mov, boton: contacto.boton } : ultimoToque;
    return !!c && (c.boton || (c.dur < TOQUE_MS && c.mov < TOQUE_PX));
  };
  /* MEDIDO CON LA LAPICERA DE MAURO (v3.36.1, registro de eventos en la app
     real): el botón lateral NUNCA llega como botón —todo es button 0 /
     buttons 1— y con la punta en el aire no manda nada. Lo único que llega es
     el clic derecho que Windows arma al LEVANTAR la punta tras un contacto de
     ~700 ms (pointerType "pen"). Lo que lo separa de la pulsación larga sin
     querer (un círculo chico, el reporte de la 3.11) es el MOVIMIENTO: el
     botón es un toque con la punta quieta; el círculo se mueve. */
  const QUIETO_PX = 10;
  const fueQuieto = () => {
    const c = trazando ? contacto : ultimoToque;
    return !!c && (c.boton || c.mov < QUIETO_PX);
  };
  /* Lo que dibujó el toque del botón: un MutationObserver anota lo que se
     agrega a la hoja mientras la punta está apoyada (y un instante después,
     cuando el trazo se cierra). Si el toque resultó ser el botón, se saca. */
  let agregados = [], observador = null, apagarObs = 0;
  function observar() {
    const svg = $("#dzCanvas > svg"); if (!svg || typeof MutationObserver === "undefined") return;
    agregados = []; global.clearTimeout(apagarObs);
    observador?.disconnect();
    observador = new MutationObserver((ms) => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) agregados.push(n); });
    observador.observe(svg, { childList: true, subtree: true });
  }
  function dejarDeObservar() { global.clearTimeout(apagarObs); apagarObs = global.setTimeout(() => { observador?.disconnect(); observador = null; agregados = []; }, 1500); }
  function borrarLoDelToque() {
    const hechos = agregados.filter((n) => n.isConnected && !n.closest?.("g.dz-onion") && (n.hasAttribute?.("data-low-brush-points") || n.hasAttribute?.("data-low-pencil-points") || /^(path|g|image)$/i.test(n.tagName)));
    // sólo lo de primer nivel (no los hijos de un trazo que ya se borra)
    const raices = hechos.filter((n) => !hechos.some((o) => o !== n && o.contains(n)));
    for (const n of raices) n.remove();
    agregados = [];
    if (raices.length) { global.dzMarkDirty?.(); global.dzBuildLayers?.(); }
    return raices.length;
  }
  function abrirPorBoton(x, y, porque) {
    if (!esDibujo()) return false;
    // si ya arrancó un trazo con ese toque, se cancela (no deja un punto ni un sello);
    // si ya se cerró (el clic de Windows llega al levantar), se borra lo que dejó
    if (trazando) global._drawCancel?.("botón lateral del lápiz");
    else if (porque === "toque") borrarLoDelToque();
    abrir(x, y); tragarHasta = ahora() + 1000;
    try { (global.LOW.drawing.pincelRapido.ultimoMotivo = porque); } catch (_) { /* nada */ }
    return true;
  }

  function enganchar() {
    engancharMenu();
    const dz = D();
    if (dz) { try { const v = almacen()?.getItem(CLAVE_VAR); dz.presionVar = v == null ? 100 : clamp(+v || 0, 0, 200); } catch (_) { dz.presionVar = 100; } }
    // EN WINDOW, antes que nadie: el descarte de la pulsación larga
    // (pulsacion-larga.js, en document) se comía el clic del botón lateral
    global.addEventListener("pointermove", (e) => {
      cursor = { x: e.clientX, y: e.clientY };
      if (e.pointerType !== "pen") return;
      const antes = flota.botones;
      flota = { x: e.clientX, y: e.clientY, t: ahora(), botones: e.buttons };
      const nuevo = (e.buttons & 2) && !(antes & 2);
      // apretado con la punta recién apoyada (toque corto) = el botón; en medio
      // de un trazo largo = apretado sin querer al girar la lapicera: nada
      const corto = !trazando || (contacto && ahora() - contacto.t < TOQUE_MS && contacto.mov < TOQUE_PX);
      if (contacto) { contacto.mov = Math.max(contacto.mov, Math.hypot(e.clientX - contacto.x, e.clientY - contacto.y)); if (nuevo && corto) contacto.boton = true; }
      // 2b y 3. aparece el bit del botón lateral: con la punta en el aire o recién apoyada
      if (nuevo && corto && enLienzo(e) && !abierto()) abrirPorBoton(e.clientX, e.clientY, (e.buttons & 1) ? "apoyado" : "aire");
    }, true);
    global.addEventListener("pointerdown", (e) => {
      if (abierto() && !panel.contains(e.target)) cerrar();
      if (!enLienzo(e)) return;
      const lateral = e.button === 2 || (e.pointerType === "pen" && (e.buttons & 2));
      if (e.pointerType === "pen" && !lateral) { trazando = true; contacto = { t: ahora(), x: e.clientX, y: e.clientY, mov: 0, boton: false }; observar(); }
      if (!lateral || !esDibujo()) return;
      // 2. el botón apretado (o el derecho): no dibuja
      e.preventDefault(); e.stopImmediatePropagation();
      if (delLapiz(e) && !(reciente() && !fueBoton())) abrirPorBoton(e.clientX, e.clientY, "apoyado");
    }, true);
    const soltar = (e) => {
      if (e.pointerType !== "pen" || !trazando) return;
      trazando = false; fin = ahora();
      ultimoToque = contacto ? { dur: fin - contacto.t, mov: contacto.mov, boton: contacto.boton } : null;
      contacto = null; dejarDeObservar();
    };
    global.addEventListener("pointerup", soltar, true);
    global.addEventListener("pointercancel", soltar, true);
    global.addEventListener("contextmenu", (e) => {
      if (!enLienzo(e) || !esDibujo()) return;
      if (ahora() < tragarHasta || abierto()) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (!delLapiz(e) && !reciente()) return;            // el mouse: su menú de siempre
      // 1. botón + tocar: el clic llega pegado a un toque corto
      if (reciente() && !fueBoton() && !fueQuieto()) return;   // pulsación larga mientras se DIBUJA (la punta se movió): la descarta pulsacion-larga.js
      e.preventDefault(); e.stopImmediatePropagation();
      abrirPorBoton(e.clientX, e.clientY, reciente() ? "toque" : "clic");
    }, true);
    doc.addEventListener("keydown", (e) => { if (e.key === "Escape" && abierto()) { e.preventDefault(); e.stopPropagation(); cerrar(); } }, true);
  }

  global.dzPresionAplicada = presionAplicada;
  global.LOW = global.LOW || {};
  global.LOW.drawing = global.LOW.drawing || {};
  global.LOW.drawing.pincelRapido = { abrir, abrirAqui, ayudaLapicera, cerrar, abierto, variacion, ponerVariacion, presionAplicada, ponerEspesor, ponerSuavizado,
    /** para diagnosticar desde las pruebas: qué sabe el detector del lápiz */
    detector: () => ({ flota: { ...flota }, trazando, fin, tragarHasta, ahora: ahora(), contacto: contacto && { ...contacto }, ultimoToque }) };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(typeof window !== "undefined" ? window : globalThis);
