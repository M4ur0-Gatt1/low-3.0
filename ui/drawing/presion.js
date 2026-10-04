/* ══════════════════════════════════════════════════════════════════════════
   LA PRESIÓN DE LA TABLETA

   Vivía en app.js. Se mudó acá al medirla en la app real (oct-2026), con un
   trazo de lápiz de presión creciente y otro de mouse:

   1. CADA MUESTRA ENTRA DOS VECES, y se deja así A PROPÓSITO. `pointerrawupdate`
      y los eventos coalescidos de `pointermove` traen las mismas muestras: 41
      enviadas, 82 en el trazo. Se probó dejarlas entrar una sola vez y la
      geometría del trazo cambió: el estabilizador está calibrado con los dos
      pasos por muestra, y check_trazo_calidad_ui (detalle, círculo, temblor)
      falló en un estado u otro con cualquier ajuste. Lo que SÍ estaba mal era
      la presión de ese camino (2).
   2. CON EL MOUSE EL ANCHO TEMBLABA. El camino rápido leía `e.pressure` crudo
      —0,5 para un mouse, valor sintético de Pointer Events— y el otro daba 1,
      y como las dos copias de cada muestra entran, el trazo de mouse salía con
      la presión saltando entre 0,52 y 1. Y con lápiz, una de las dos copias
      salteaba la calibración (inicio/máximo): la presión zigzagueaba entre la
      calibrada y la cruda. Ahora las dos copias traen la misma presión.
   3. EL FILTRO DE PRESIÓN ERA POR CANTIDAD DE MUESTRAS (un promedio de 5).
      Con una tableta a 200 muestras por segundo eso son 25 ms; con una a 60,
      83 ms: la misma mano se sentía distinta según el aparato. Ahora el filtro
      es por TIEMPO (constante de 12 ms), igual en cualquier tableta.

   Además, «Probar con la tableta» en Preferencias: se hace un trazo apretando
   como siempre y LOW propone el inicio y el máximo de presión de esa mano y
   esa tableta, en vez de adivinar números.

   @module drawing/presion
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const drawing = LOW.drawing = LOW.drawing || {};
  const TAU_MS = 12;          // constante de tiempo del filtro de presión

  /** La presión calibrada de un evento: el rango inicio–máximo de la mano se
   *  estira a 0–1. Mouse y toque: 1 (ancho completo, sin temblor). */
  function calibrada(e, cfg) {
    const tipo = e && e.pointerType;
    if ((tipo === "pen" || tipo === "eraser") && e.pressure != null) {
      const c = cfg || {};
      const min = Math.max(0, Math.min(.95, c.min || 0));
      const max = Math.max(min + .05, Math.min(1, c.max || 1));
      return Math.max(0, Math.min(1, (e.pressure - min) / (max - min)));
    }
    return 1;
  }

  /** Filtro de presión por TIEMPO + la curva de sensibilidad (gamma). El
   *  estado vive en el trazo (`track._pres`). */
  function suavizar(pr, track, tiempo, gamma) {
    const p = Math.max(.03, pr || .03);
    const g = gamma !== undefined ? gamma : .85;
    if (!track) return Math.pow(p, g);
    const s = track._pres;
    if (!s || !Number.isFinite(tiempo)) { track._pres = { v: p, t: tiempo }; return Math.pow(p, g); }
    const dt = Math.max(0, tiempo - (s.t != null ? s.t : tiempo));
    const a = dt > 0 ? 1 - Math.exp(-dt / TAU_MS) : .5;   // sin hora: medio camino
    s.v += (p - s.v) * a; s.t = tiempo;
    return Math.pow(s.v, g);
  }

  /** Lo que propone la prueba de la tableta, a partir de las presiones crudas
   *  de un trazo: el inicio es el umbral de apoyo (un poco por debajo de la
   *  presión más liviana) y el máximo, la presión fuerte habitual (percentil
   *  95: un pico suelto no cuenta). */
  function proponerRango(presiones) {
    const v = (presiones || []).filter((x) => Number.isFinite(x) && x > .001).sort((a, b) => a - b);
    if (v.length < 8) return null;
    const pct = (q) => v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))];
    const min = Math.max(0, +(pct(.03) * .6).toFixed(2));
    const max = Math.max(min + .1, Math.min(1, +(pct(.95) * 1.02).toFixed(2)));
    return { min, max, muestras: v.length, fuerte: +pct(.95).toFixed(3), liviana: +pct(.03).toFixed(3) };
  }

  drawing.presion = { calibrada, suavizar, proponerRango, TAU_MS };

  // ── los nombres que usa app.js ──
  global._otPressure = function (e) {
    const D = (typeof DZ !== "undefined") ? DZ : {};
    return calibrada(e, { min: D.pressureMin, max: D.pressureMax });
  };
  global.dzSmoothPressure = function (pr, track) {
    const D = (typeof DZ !== "undefined") ? DZ : {};
    return suavizar(pr, track, track && track._horaMuestra, D.pressureGamma);
  };

  /* ── «Probar con la tableta» en Preferencias ─────────────────────────────
     Se agrega solo cuando el modal muestra los campos de inicio y máximo. */
  function mejorarPreferencias(raiz) {
    const max = raiz.querySelector && raiz.querySelector("#prefPressureMax");
    if (!max || raiz.querySelector("#prefPresionProbar")) return;
    const fila = max.closest("label") && max.closest("label").parentElement;
    if (!fila) return;
    const caja = document.createElement("div");
    caja.className = "dz-presion-prueba";
    caja.innerHTML = '<button type="button" id="prefPresionProbar">Probar con la tableta</button>' +
      '<canvas id="prefPresionPad" width="320" height="90" hidden></canvas>' +
      '<span class="dz-hint" id="prefPresionInfo">Hacé un trazo apretando como siempre: LOW ajusta el inicio y el máximo a tu mano.</span>';
    fila.insertAdjacentElement("afterend", caja);
    const pad = caja.querySelector("canvas"), info = caja.querySelector("#prefPresionInfo");
    caja.querySelector("button").onclick = () => { pad.hidden = false; info.textContent = "Dibujá en el recuadro con el lápiz, de liviano a fuerte."; };
    const crudas = [];
    let ultimo = null;
    const ctx = pad.getContext("2d");
    pad.style.touchAction = "none";
    pad.onpointerdown = (e) => {
      if (e.pointerType !== "pen") { info.textContent = "Esto mide el LÁPIZ: el mouse no tiene presión."; return; }
      crudas.length = 0; ctx.clearRect(0, 0, pad.width, pad.height);
      pad.setPointerCapture(e.pointerId); ultimo = { x: e.offsetX, y: e.offsetY };
    };
    pad.onpointermove = (e) => {
      if (!ultimo || e.pointerType !== "pen") return;
      const evs = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
      for (const c of evs) {
        crudas.push(c.pressure);
        ctx.strokeStyle = "#F0450E"; ctx.lineCap = "round"; ctx.lineWidth = 1 + 14 * (c.pressure || 0);
        ctx.beginPath(); ctx.moveTo(ultimo.x, ultimo.y); ctx.lineTo(c.offsetX, c.offsetY); ctx.stroke();
        ultimo = { x: c.offsetX, y: c.offsetY };
      }
    };
    pad.onpointerup = () => {
      if (!ultimo) return; ultimo = null;
      const r = proponerRango(crudas);
      if (!r) { info.textContent = "Muy corto: hacé un trazo más largo."; return; }
      const min = raiz.querySelector("#prefPressureMin"), mx = raiz.querySelector("#prefPressureMax");
      min.value = r.min; mx.value = r.max;
      min.dispatchEvent(new Event("change")); mx.dispatchEvent(new Event("change"));
      info.textContent = "Listo: inicio " + r.min + " · máximo " + r.max + " (tu presión fuerte es " + r.fuerte + ").";
    };
  }
  if (typeof MutationObserver === "function" && typeof document !== "undefined") {
    const mirar = () => new MutationObserver(() => { if (document.querySelector("#prefPressureMax")) mejorarPreferencias(document); })
      .observe(document.body, { childList: true, subtree: true });
    if (document.body) mirar(); else document.addEventListener("DOMContentLoaded", mirar, { once: true });
  }
  drawing.presion.mejorarPreferencias = mejorarPreferencias;
})(typeof window !== "undefined" ? window : globalThis);
