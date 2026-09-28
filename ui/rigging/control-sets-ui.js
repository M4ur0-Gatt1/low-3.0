/* ══════════════════════════════════════════════════════════════════════════
   CONJUNTOS DE CONTROLES (C05) — la interfaz

   El catálogo y la aplicación viven en `control-sets.js` y en `document.js`.
   Esto es lo que lo hace usable, y su trabajo principal es MOSTRAR EL MAPA.

   La regla del plan es «vinculación explícita a cada personaje», y acá eso se
   traduce en una decisión de pantalla concreta: el mapa rol→pieza está a la
   vista, con un desplegable por rol, y el botón de aplicar queda apagado
   mientras falte vincular alguno. «Sugerir piezas» completa lo que reconoce
   por el nombre, pero es una ayuda que se puede corregir, no una decisión que
   se toma por uno.

   Se podría haber aplicado adivinando y avisando después. No: un control
   colgado de ninguna pieza se mueve y no pasa nada, y el que anima no tiene
   cómo saber por qué.

   @module rigging/control-sets-ui
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const rigging = LOW.rigging = LOW.rigging || {};
  const $ = (sel) => document.querySelector(sel);
  const doc = () => (typeof DZ !== "undefined" && DZ.doc) ? DZ.doc : null;
  const avisar = (m) => { if (typeof dzSetStatus === "function") dzSetStatus(" " + m); };

  /** El mapa que se está armando, por conjunto. Vive acá porque es cursor de
   *  interfaz —lo que todavía no se aplicó—, no obra: lo aplicado se guarda en
   *  la escena. */
  const enCurso = {};

  const catalogo = () => (rigging.controlSets && rigging.controlSets.CATALOGO) || [];
  const elegido = () => {
    const sel = $("#rigConjLista");
    const id = sel && sel.value;
    return (rigging.controlSets && rigging.controlSets.porId(id)) || null;
  };
  const piezas = () => {
    const d = doc();
    if (!d) return [];
    return Object.values(d.scene.rig.bones || {}).map((b) => ({ id: b.id, name: b.name || b.id }));
  };

  function sugerir() {
    const set = elegido();
    if (!set) return;
    const sug = rigging.controlSets.sugerir(set, piezas());
    enCurso[set.id] = { ...(enCurso[set.id] || {}), ...sug };
    const cuantas = Object.keys(sug).length;
    avisar(cuantas ? "Propuse " + cuantas + " pieza(s) por el nombre · revisalas antes de aplicar"
                   : "No reconocí ninguna pieza por el nombre: vinculalas a mano");
    sync();
  }

  function aplicar() {
    const d = doc(), set = elegido();
    if (!d || !set) return;
    const mapa = enCurso[set.id] || {};
    const r = d.applyControlSet(set.id, mapa);
    if (!r.ok) {
      const que = (r.faltan || []).map((f) => f.name || f.key).join(", ");
      return avisar(r.motivo + (que ? ": " + que : ""));
    }
    const nuevos = r.controles.length;
    avisar(nuevos
      ? nuevos + " control(es) creados · cada pieza tiene su juego de vistas esperando los dibujos"
      : "Ese conjunto ya estaba aplicado en este personaje");
    sync();
  }

  /** Redibuja el mapa: un desplegable por rol, con las piezas del personaje. */
  function sync() {
    const lista = $("#rigConjLista"), host = $("#rigConjMapa"), aviso = $("#rigConjAviso");
    const estado = $("#rigConjEstado");
    if (!lista || !host) return;
    const d = doc();

    if (!lista.options.length) {
      for (const c of catalogo()) {
        const o = document.createElement("option");
        o.value = c.id; o.textContent = c.name;
        lista.appendChild(o);
      }
    }
    const set = elegido();
    const disponibles = piezas();
    const mapa = set ? (enCurso[set.id] = enCurso[set.id] || {}) : {};

    host.innerHTML = "";
    for (const rol of (set ? set.roles : [])) {
      const fila = document.createElement("label");
      fila.className = "rig2-conj-rol";
      const etiqueta = document.createElement("span");
      etiqueta.textContent = rol.name;
      const sel = document.createElement("select");
      sel.setAttribute("aria-label", rol.name);
      sel.dataset.rol = rol.key;
      const vacio = document.createElement("option");
      vacio.value = ""; vacio.textContent = "— sin vincular —";
      sel.appendChild(vacio);
      for (const p of disponibles) {
        const o = document.createElement("option");
        o.value = p.id; o.textContent = p.name;
        sel.appendChild(o);
      }
      sel.value = mapa[rol.key] || "";
      sel.onchange = () => {
        if (sel.value) mapa[rol.key] = sel.value; else delete mapa[rol.key];
        sync();
      };
      fila.append(etiqueta, sel);
      host.appendChild(fila);
    }

    const faltan = set ? rigging.controlSets.faltantes(set, mapa) : [];
    const yaEsta = d && set && d.scene.rigControlSet(set.id);
    if (aviso) {
      aviso.textContent = !set ? "Elegí un conjunto."
        : !disponibles.length ? "Este personaje todavía no tiene piezas: armá el esqueleto primero."
        : faltan.length ? "Falta vincular: " + faltan.map((f) => f.name).join(", ") +
            " · el conjunto no adivina cuál es cada una"
        : yaEsta ? "Ya aplicado. Volver a aplicar no duplica nada."
        : "Listo para aplicar: " + set.controles.length + " control(es).";
    }
    const aplicarBtn = $("#rigConjAplicar");
    if (aplicarBtn) aplicarBtn.disabled = !set || !!faltan.length;
    const sugerirBtn = $("#rigConjSugerir");
    if (sugerirBtn) sugerirBtn.disabled = !set || !disponibles.length;

    if (estado) {
      const aplicados = d ? d.controlSetsAplicados() : [];
      const rotos = d ? d.scene.rigControlSetsRotos() : [];
      estado.textContent = !aplicados.length ? "ninguno aplicado"
        : aplicados.length + " aplicado(s)" + (rotos.length ? " · " + rotos.length + " con piezas borradas" : "");
    }
  }

  function wire() {
    if (wire._puesto) return;
    wire._puesto = true;
    const lista = $("#rigConjLista");
    if (lista) lista.onchange = () => sync();
    const s = $("#rigConjSugerir"); if (s) s.onclick = sugerir;
    const a = $("#rigConjAplicar"); if (a) a.onclick = aplicar;
  }

  /* Se engancha solo al refresco del panel de rig, como el de vistas: el
     presupuesto de app.js está justo en el techo y no entra una línea más. */
  function autoEnganche() {
    const previo = global.dzSmartPanelSync;
    if (typeof previo !== "function" || previo.__conConjuntos) return;
    const envuelto = function (...args) {
      const r = previo.apply(this, args);
      try { wire(); sync(); } catch (_) { /* este panel no puede tumbar al del rig */ }
      return r;
    };
    envuelto.__conConjuntos = true;
    // se conserva la marca del otro envoltorio, si ya estaba puesto
    if (previo.__conVistas) envuelto.__conVistas = true;
    global.dzSmartPanelSync = envuelto;
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", autoEnganche, { once: true });
  else autoEnganche();

  rigging.controlSetsUI = { wire, sync, sugerir, aplicar, autoEnganche, enCurso };
})(window);
