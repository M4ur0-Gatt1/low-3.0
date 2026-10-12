/* ══════════════════════════════════════════════════════════════════════════
   LIPSYNC DESDE EL TEXTO: EL PANEL

   Vive adentro de la sección Lipsync del panel del esqueleto, al lado del
   lipsync por volumen: la misma boca (la pieza elegida del rig, con sus
   dibujos), las mismas claves de sustitución, la misma X-sheet para corregir.
   El flujo:
     1. elegir la boca del personaje (la pieza del rig, como para el volumen);
     2. escribir o pegar el diálogo;
     3. ajustar el inicio (cuadro) y la velocidad de lectura;
     4. ver los visemas que salen, con sus cuadros, antes de tocar nada;
     5. «Crear las claves» — un paso de Ctrl+Z; las claves fuera del tramo
        del diálogo quedan como estaban;
     6. reproducir, revisar en la X-sheet, y volver a generar si hace falta.
   El mapa de visemas → dibujos y los diálogos se guardan en el slot de la
   boca (LowDoc.applyLipsyncTexto), con la escena.

   El cálculo vive en animation/lipsync-texto.js (puro, probado en node).

   @module animation/lipsync-texto-panel
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const L = () => global.LOW && LOW.animation && LOW.animation.lipsyncTexto;
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const avisar = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  let dialogoId = null;      // el diálogo que se está editando (para regenerarlo sin dejar restos)
  let dialogoSlot = null;    // de qué boca es: al elegir otra pieza se empieza de cero

  function boca() {
    const D = dz();
    if (!D || !D.doc || typeof global.dzLipFormas !== "function") return { slotId: null, variantes: [] };
    return global.dzLipFormas();
  }
  // los FPS de la reproducción (la caja de la línea de tiempo), como el lipsync por volumen; si no, los de la escena
  const fps = () => { const D = dz(), caja = $("#tlFps"); return Math.max(1, +(caja && caja.value) || (D && D.doc && D.doc.scene.fps) || 24); };
  const limite = () => { const D = dz(); return D && D.doc ? D.doc.scene.playRange().out : 0; };

  function montar() {
    const sec = $(".rig2-section.rig2-lip");
    if (!sec || $("#rigLipTextoCaja")) return !!sec;
    const caja = document.createElement("div");
    caja.id = "rigLipTextoCaja"; caja.className = "rig2-lip-texto";
    caja.innerHTML = `
      <div class="rig2-title"><b>Desde el texto</b><span id="rigLipTextoEstado"></span></div>
      <p class="rig2-hint">Escribí el diálogo y LOW arma la boca: cada sonido con su visema y su duración,
        respetando tildes, dígrafos y pausas. Es una <b>estimación</b> —todavía no escucha la voz—: ajustá el
        inicio y la velocidad, y corregí desde la X-sheet.</p>
      <textarea id="rigLipTexto" class="rig2-lip-dialogo" rows="3" spellcheck="true" placeholder="Escribí o pegá el diálogo… (por ejemplo: ¡Hola! ¿Cómo estás?)"></textarea>
      <label class="rig2-lip-ctl">Inicio<input id="rigLipInicio" type="number" min="1" step="1" value="1"><button id="rigLipAqui" type="button" title="Empezar en el cuadro actual">aquí</button></label>
      <label class="rig2-lip-ctl">Velocidad<input id="rigLipVel" type="range" min="50" max="200" step="5" value="100"><output id="rigLipVelVal">100 %</output></label>
      <div class="rig2-lip-previa" id="rigLipPrevia" aria-live="polite"></div>
      <div class="rig2-lip-acciones rig2-lip-acciones-texto">
        <button id="rigLipTextoGen" title="Crear las claves de boca del diálogo (un paso de Ctrl+Z)">Crear las claves</button>
        <button id="rigLipTextoPlay" type="button" title="Ir al inicio del diálogo y reproducir">▶</button>
        <button id="rigLipTextoQuitar" class="danger" type="button" title="Quitar este diálogo y sus claves">Quitar</button>
      </div>
      <div class="rig2-lip-dialogos" id="rigLipDialogos"></div>
      <details class="rig2-lip-mapa" id="rigLipMapa"><summary>Bocas de cada visema</summary><div id="rigLipMapaFilas"></div></details>`;
    sec.appendChild(caja);
    let reloj = null;
    const previaLuego = () => { clearTimeout(reloj); reloj = setTimeout(previa, 120); };
    $("#rigLipTexto").addEventListener("input", previaLuego);
    $("#rigLipInicio").addEventListener("input", previaLuego);
    $("#rigLipVel").addEventListener("input", () => { $("#rigLipVelVal").textContent = $("#rigLipVel").value + " %"; previaLuego(); });
    $("#rigLipAqui").onclick = () => { const D = dz(); if (D && D.doc) { $("#rigLipInicio").value = D.doc.frame; previa(); } };
    $("#rigLipTextoGen").onclick = generar;
    $("#rigLipTextoPlay").onclick = reproducir;
    $("#rigLipTextoQuitar").onclick = quitar;
    return true;
  }

  function bocaAntes(D, slotId, inicio) {
    const sw = D.doc.scene.rigSwitch(slotId);
    if (!sw || inicio <= 1) return null;
    const previo = dialogoId ? D.doc.lipsyncTexto(slotId).dialogos[dialogoId] : null;
    let mejor = null, cuadro = -Infinity;
    for (const k of Object.keys(sw.keys).map(Number)) {
      if (k >= inicio || (previo && k >= previo.inicio && k <= previo.fin)) continue;
      if (k > cuadro) { cuadro = k; mejor = sw.keys[k]; }
    }
    return mejor;
  }

  /** Lo que saldría con el texto y los ajustes de ahora (sin tocar nada). */
  function calcular() {
    const lt = L(), D = dz();
    const { slotId, variantes } = boca();
    const texto = ($("#rigLipTexto") || {}).value || "";
    const inicio = Math.max(1, Math.round(+($("#rigLipInicio") || {}).value || 1));
    const velocidad = (+($("#rigLipVel") || {}).value || 100) / 100;
    if (!lt || !D || !D.doc || !slotId || variantes.length < 2) return { slotId, variantes, texto, inicio, velocidad, error: "boca" };
    const guardado = D.doc.lipsyncTexto(slotId);
    const { mapa } = lt.resolverMapa(variantes, guardado.mapa);
    // la boca que ya estaba antes del inicio, para no repetirla. Sin contar las
    // claves de la versión anterior de ESTE diálogo, que se van a borrar
    // (medido: al regenerar desde F30, la O vieja de F29 tapaba la O nueva de F30)
    const antes = bocaAntes(D, slotId, inicio);
    const r = lt.clavesDeTexto(texto, { idioma: "es", fps: fps(), inicio, velocidad, limite: limite(), mapa, antes });
    return { slotId, variantes, texto, inicio, velocidad, mapa, guardado, r };
  }

  function previa() {
    const caja = $("#rigLipPrevia"), lt = L();
    if (!caja || !lt) return;
    const c = calcular();
    const btn = $("#rigLipTextoGen");
    if (c.error === "boca") {
      caja.innerHTML = '<span class="rig2-lip-vacio">Elegí la pieza de la boca: sus dibujos son las bocas de los visemas.</span>';
      if (btn) btn.disabled = true; return;
    }
    if (!c.texto.trim() || !Object.keys(c.r.keys).length) {
      caja.innerHTML = '<span class="rig2-lip-vacio">Escribí el diálogo para ver los visemas.</span>';
      if (btn) btn.disabled = true; return;
    }
    if (btn) btn.disabled = false;
    const nombre = Object.fromEntries(lt.VISEMAS.map((v) => [v.id, v.nombre]));
    const dibujo = Object.fromEntries(c.variantes.map((v) => [v.id, v.name || v.elementId]));
    const seg = c.r.segundos;
    caja.innerHTML = `<div class="rig2-lip-resumen">≈ ${seg.toFixed(1).replace(".", ",")} s · F${c.inicio}–F${c.r.fin} · ${Object.keys(c.r.keys).length} cambios de boca</div>` +
      `<div class="rig2-lip-tramos">${c.r.tramos.filter((t) => !limite() || t.desde <= limite()).map((t) =>
        `<span class="rig2-lip-tramo v-${esc(t.visema)}" title="${esc(nombre[t.visema])} · «${esc(t.fonemas)}» · dibujo: ${esc(dibujo[lt.dibujoDe(t.visema, c.mapa)] || "—")}">F${t.desde} ${esc(nombre[t.visema])}</span>`).join("")}</div>` +
      (c.r.avisos.length ? `<div class="rig2-lip-aviso">${esc(c.r.avisos.join(" · "))}</div>` : "");
  }

  function generar() {
    const D = dz(), c = calcular();
    if (c.error === "boca") return avisar("Elegí la pieza de la boca, con dos dibujos o más");
    if (!c.texto.trim() || !Object.keys(c.r.keys).length) return avisar("Escribí el diálogo antes de crear las claves");
    // el diálogo que se edita; si no hay, uno guardado con el MISMO texto (regenerarlo, no duplicarlo)
    const mismo = Object.values(D.doc.lipsyncTexto(c.slotId).dialogos).find((d) => d.texto.trim() === c.texto.trim());
    const id = (dialogoSlot === c.slotId && dialogoId) || (mismo && mismo.id) || ("d" + Date.now().toString(36));
    const dialogo = { id, texto: c.texto, idioma: "es", inicio: c.inicio, fin: c.r.fin, velocidad: c.velocidad, fps: fps() };
    const puestas = D.doc.applyLipsyncTexto(c.slotId, dialogo, c.r.keys);
    dialogoId = id; dialogoSlot = c.slotId;
    if (typeof global.dzRigApplyLive === "function" && typeof global.dzRigCur === "function") global.dzRigApplyLive(global.dzRigCur());
    if (typeof global.dzRigPanelSync === "function") global.dzRigPanelSync();
    if (D.xsView) D.xsView.render();
    dialogos();
    avisar(`Lipsync desde el texto: ${puestas} cambios de boca entre F${c.inicio} y F${c.r.fin}` +
      (c.r.avisos.length ? " · " + c.r.avisos[0] : "") + " · corregí desde la X-sheet · Ctrl+Z lo saca entero");
  }

  function reproducir() {
    const D = dz(); if (!D || !D.doc) return;
    const inicio = Math.max(1, Math.round(+$("#rigLipInicio").value || 1));
    if (typeof global.dzDocGoTo === "function") global.dzDocGoTo(inicio); else D.doc.goTo(inicio);
    if (typeof global.dzPlayToggle === "function" && !(D.playback && D.playback.playing)) global.dzPlayToggle();
  }

  function quitar() {
    const D = dz(), { slotId } = boca();
    if (!D || !D.doc || !slotId || !dialogoId || !D.doc.removeLipsyncTexto(slotId, dialogoId))
      return avisar("No hay un diálogo guardado para quitar: elegilo de la lista");
    dialogoId = null;
    if (typeof global.dzRigApplyLive === "function" && typeof global.dzRigCur === "function") global.dzRigApplyLive(global.dzRigCur());
    if (D.xsView) D.xsView.render();
    dialogos(); previa();
    avisar("Quité el diálogo y sus claves de boca · Ctrl+Z lo devuelve");
  }

  /** Los diálogos guardados de esta boca: clic para volver a editarlo. */
  function dialogos() {
    const caja = $("#rigLipDialogos"), D = dz(), { slotId } = boca();
    if (!caja) return;
    const lista = D && D.doc && slotId ? Object.values(D.doc.lipsyncTexto(slotId).dialogos).sort((a, b) => a.inicio - b.inicio) : [];
    caja.innerHTML = lista.map((d) => `<button type="button" class="rig2-lip-dlg${d.id === dialogoId ? " activo" : ""}" data-dlg="${esc(d.id)}" title="Volver a editar este diálogo">F${d.inicio}–F${d.fin} · ${esc(d.texto.slice(0, 40))}${d.texto.length > 40 ? "…" : ""}</button>`).join("");
    caja.querySelectorAll("[data-dlg]").forEach((b) => b.onclick = () => {
      const d = D.doc.lipsyncTexto(slotId).dialogos[b.dataset.dlg]; if (!d) return;
      dialogoId = d.id; dialogoSlot = slotId;
      $("#rigLipTexto").value = d.texto; $("#rigLipInicio").value = d.inicio;
      $("#rigLipVel").value = Math.round((d.velocidad || 1) * 100); $("#rigLipVelVal").textContent = $("#rigLipVel").value + " %";
      dialogos(); previa();
    });
  }

  /** Qué dibujo de la boca usa cada visema: automático por nombre u orden, y elegible. */
  function mapa() {
    const filas = $("#rigLipMapaFilas"), lt = L(), D = dz(), { slotId, variantes } = boca();
    if (!filas || !lt) return;
    if (!slotId || variantes.length < 2) { filas.innerHTML = ""; return; }
    const guardado = D.doc.lipsyncTexto(slotId).mapa, r = lt.resolverMapa(variantes, guardado);
    filas.innerHTML = lt.VISEMAS.map((v) => `<label class="rig2-lip-visema" title="${esc(v.ayuda)}"><span><b>${esc(v.id)}</b> ${esc(v.nombre)}</span>
      <select data-visema="${esc(v.id)}"><option value="">Automático (${esc((variantes.find((x) => x.id === r.mapa[v.id]) || {}).name || "—")})</option>
      ${variantes.map((x) => `<option value="${esc(x.id)}"${guardado[v.id] === x.id ? " selected" : ""}>${esc(x.name || x.elementId)}</option>`).join("")}</select></label>`).join("");
    filas.querySelectorAll("select[data-visema]").forEach((s) => s.onchange = () => {
      const nuevo = { ...D.doc.lipsyncTexto(slotId).mapa };
      if (s.value) nuevo[s.dataset.visema] = s.value; else delete nuevo[s.dataset.visema];
      D.doc.setLipsyncTextoMapa(slotId, nuevo);
      mapa(); previa();
    });
  }

  function sync() {
    if (!montar()) return;
    const { slotId, variantes } = boca();
    const est = $("#rigLipTextoEstado");
    if (est) est.textContent = slotId && variantes.length >= 2 ? variantes.length + " bocas · " + fps() + " fps" : "falta la boca";
    // el diálogo en edición se olvida al cambiar de boca, NO cuando desaparece un momento:
    // Ctrl+Z lo saca y Ctrl+Y lo devuelve (medido: olvidarlo ahí duplicaba el diálogo y dejaba restos)
    if (slotId !== dialogoSlot) { dialogoId = null; dialogoSlot = slotId; }
    mapa(); dialogos(); previa();
  }

  // se actualiza con el panel de lipsync de siempre (al elegir otra pieza, al cambiar de escena)
  function envolver() {
    const orig = global.dzLipPanelSync;
    if (typeof orig !== "function" || orig.__texto) return false;
    const env = function (...a) { const r = orig.apply(this, a); try { sync(); } catch (e) { if (global.console) console.warn("[lipsync texto]", e); } return r; };
    env.__texto = true; global.dzLipPanelSync = env;
    return true;
  }
  global.LOW = global.LOW || {};
  LOW.lipsyncTextoPanel = { sync, calcular, generar, previa, get dialogoId() { return dialogoId; } };
  const arrancar = () => { envolver(); try { sync(); } catch (_) { /* sin escena todavía */ } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(arrancar, 0), { once: true });
  else setTimeout(arrancar, 0);
})(window);
