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
        title="Un trazo que empieza o termina en la punta de otra línea (mismo color y pincel) se une con ella">${unir ? "Prendido" : "Apagado"}</button></div>`;
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
  const abierto = () => !!(panel && !panel.hidden);

  // ── ¿es el lápiz? ──
  let flota = { x: 0, y: 0, t: -Infinity }, trazando = false, fin = -Infinity, tragarHasta = -Infinity;
  const enLienzo = (e) => { const cv = $("#dzCanvas"); return !!(cv && e.target && cv.contains(e.target)); };
  const delLapiz = (e) => e.pointerType === "pen"
    || (ahora() - flota.t < FLOTANDO && Math.hypot(e.clientX - flota.x, e.clientY - flota.y) < 24);
  const reciente = () => trazando || ahora() - fin < VENTANA;

  function enganchar() {
    const dz = D();
    if (dz) { try { const v = almacen()?.getItem(CLAVE_VAR); dz.presionVar = v == null ? 100 : clamp(+v || 0, 0, 200); } catch (_) { dz.presionVar = 100; } }
    // cualquier movimiento del lápiz (el «buttons» de la punta en el aire varía según el controlador;
    // lo que pasa durante un trazo lo cubre la ventana de después del trazo)
    doc.addEventListener("pointermove", (e) => { if (e.pointerType === "pen") flota = { x: e.clientX, y: e.clientY, t: ahora() }; }, true);
    doc.addEventListener("pointerdown", (e) => {
      if (abierto() && !panel.contains(e.target)) cerrar();
      if (e.pointerType === "pen" && e.button === 0 && enLienzo(e)) trazando = true;
      if (e.button !== 2 || !enLienzo(e) || !esDibujo()) return;
      // el botón derecho no dibuja: con el lápiz es el botón lateral
      e.preventDefault(); e.stopImmediatePropagation();
      if (delLapiz(e) && !reciente()) { abrir(e.clientX, e.clientY); tragarHasta = ahora() + 1000; }
    }, true);
    const soltar = (e) => { if (e.pointerType === "pen" && trazando) { trazando = false; fin = ahora(); } };
    doc.addEventListener("pointerup", soltar, true);
    doc.addEventListener("pointercancel", soltar, true);
    doc.addEventListener("contextmenu", (e) => {
      if (!enLienzo(e) || !esDibujo()) return;
      if (ahora() < tragarHasta) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (!delLapiz(e) || reciente()) return;
      e.preventDefault(); e.stopImmediatePropagation();
      abrir(e.clientX, e.clientY);
    }, true);
    doc.addEventListener("keydown", (e) => { if (e.key === "Escape" && abierto()) { e.preventDefault(); e.stopPropagation(); cerrar(); } }, true);
  }

  global.dzPresionAplicada = presionAplicada;
  global.LOW = global.LOW || {};
  global.LOW.drawing = global.LOW.drawing || {};
  global.LOW.drawing.pincelRapido = { abrir, cerrar, abierto, variacion, ponerVariacion, presionAplicada, ponerEspesor, ponerSuavizado,
    /** para diagnosticar desde las pruebas: qué sabe el detector del lápiz */
    detector: () => ({ flota: { ...flota }, trazando, fin, tragarHasta, ahora: ahora() }) };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(typeof window !== "undefined" ? window : globalThis);
