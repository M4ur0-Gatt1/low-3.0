/* ══════════════════════════════════════════════════════════════════════════
   DIBUJO CLAVE 🔑 Y CLAVE CON IA EN UN DOCUMENTO .low

   Salieron buscando «más errores como el de la coma y el punto» (oct-2026):
   funciones escritas para el modelo VIEJO —un .svg suelto por cuadro— que
   con un .low no hacían lo que anunciaban.

   🔑 «Marcar como fotograma clave» (botón, menú y ventana separada):
   leía el número de cuadro de `DZ.path`, que en un .low es null, así que
   SIEMPRE marcaba el cuadro 1 —«Cuadro 1 marcado» estando en el 7—, lo
   anotaba en una lista que el documento no guarda ni muestra, y encima
   guardaba el documento entero, que en uno sin nombre abre el diálogo.
   Ahora, como en Toon Boom y TVPaint, ser CLAVE es una propiedad del DIBUJO
   (`drawing.meta.clave`): se guarda en el .low, se deshace con Ctrl+Z, el
   botón 🔑 se ve prendido en un dibujo clave y la celda lleva una raya
   naranja arriba en la línea de tiempo.

   ✨ «Secuencia con IA»: le mandaba `null` como ruta al modelo. Ahora manda
   el dibujo del cuadro actual (main.py `ai_keyframe_svg`) y los cuadros
   nuevos entran en el documento después del actual.

   @module animation/clave-de-dibujo
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const $q = (s) => document.querySelector(s);
  const avisar = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };

  const esClave = (dw) => !!(dw && dw.meta && dw.meta.clave);
  function poner(dw, si) {
    dw.meta = dw.meta || {};
    if (si) dw.meta.clave = true; else delete dw.meta.clave;
  }

  /** El botón 🔑 dice si el dibujo del cuadro actual es clave. */
  function pintarBoton() {
    const d = dz(), b = $q("#tlKey");
    if (b && d && d.doc) b.classList.toggle("active", esClave(d.doc.drawing));
  }
  /** Raya naranja en las celdas de los dibujos clave. */
  function pintarCeldas(host) {
    const d = dz();
    if (!d || !d.doc || !host) return;
    const sc = d.doc.scene;
    host.querySelectorAll(".tl2-cell[data-layer-id][data-frame]").forEach((c) => {
      let dw = null;
      try { dw = sc.drawingAt(c.dataset.layerId, Number(c.dataset.frame)); } catch (_) { /* celda vacía */ }
      c.classList.toggle("dibujo-clave", esClave(dw));
    });
  }

  function alternarEnDocumento() {
    const d = dz(), doc = d.doc, dw = doc.drawing;
    if (!dw) {
      avisar("🔑 En el cuadro " + doc.frame + " no hay dibujo: dibujá algo para marcarlo como clave");
      return false;
    }
    const before = esClave(dw), after = !before;
    poner(dw, after);
    if (typeof doc.touch === "function") doc.touch();
    doc.emit("cells");
    if (doc.history) doc.history.push({ label: after ? "Marcar dibujo clave" : "Quitar dibujo clave", domain: "anim", before, after,
      apply: (_dir, v) => { poner(dw, v); doc.emit("cells"); pintarBoton(); } });
    pintarBoton();
    avisar(after ? "🔑 Dibujo " + (dw.number != null ? dw.number : "") + " (cuadro " + doc.frame + ") marcado como CLAVE · Ctrl+Z lo deshace"
      : "Dibujo " + (dw.number != null ? dw.number : "") + " ya no es clave");
    return true;
  }

  /* ── ✨ secuencia con IA sobre el documento ────────────────────────────── */
  function svgDelCuadro(doc, contenido) {
    const sc = doc.scene, w = sc.width || 1920, h = sc.height || 1080;
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + " " + h + '" width="' + w + '" height="' + h + '">' + (contenido || "") + "</svg>";
  }
  function interior(svgTexto) {
    const doc = new DOMParser().parseFromString(svgTexto, "image/svg+xml");
    const raiz = doc.documentElement;
    if (!raiz || raiz.nodeName.toLowerCase() !== "svg") return null;
    raiz.querySelectorAll("rect[data-low-page]").forEach((n) => n.remove());
    return raiz.innerHTML;
  }
  function modalDocumento() {
    const d = dz();
    if (!d.doc.drawing || !d.doc.drawing.content) { avisar("✨ Dibujá el cuadro de partida antes de pedir la secuencia con IA"); return; }
    global.openModal(`<h2> Secuencia de fotogramas con IA</h2>
      <div class="sub">El modelo parte del dibujo del cuadro actual y genera una secuencia progresiva.
      Los cuadros nuevos entran después del actual, en esta misma capa.</div>
      <textarea id="aiKeyTxt" class="cmp-field" rows="3" spellcheck="false"
        placeholder="ej: «el personaje levanta el brazo derecho y mira hacia arriba», «la pelota toca el piso y se aplasta»"></textarea>
      <div class="dz-ai-seq-options">
        <label>Cantidad de frames <input id="aiKeyCount" class="cmp-field" type="number" min="1" max="24" value="6"></label>
        <label><input id="aiKeyMark" type="checkbox" checked> marcar el último como dibujo clave</label>
      </div>
      <div class="m-actions"><button class="ghost" id="mCancel">Cancelar</button>
      <button class="primary" id="aiKeyGo"> Generar e incorporar</button></div>`);
    $q("#mCancel").onclick = global.closeModal;
    $q("#aiKeyGo").onclick = async () => {
      const txt = $q("#aiKeyTxt").value.trim();
      const count = Math.max(1, Math.min(24, +$q("#aiKeyCount").value || 1));
      const marcar = $q("#aiKeyMark").checked;
      global.closeModal();
      if (!txt) return;
      const doc = dz().doc, desde = doc.frame;
      let actual = svgDelCuadro(doc, doc.drawing.content);
      const nuevos = [];
      for (let i = 0; i < count; i++) {
        avisar(`IA generando frame ${i + 1}/${count}…`);
        const paso = `${txt}\nEste es el paso ${i + 1} de ${count} de la secuencia. ` +
          "Avanzá solo una fracción natural del movimiento; mantené continuidad exacta con el frame anterior" +
          (i === count - 1 ? " y completá la acción en este frame final." : ". No completes todavía la acción final.");
        let r = null;
        // `api` es un let de app.js: se llega por nombre, no por window
        try { r = await api.ai_keyframe_svg(actual, paso); } catch (e) { r = { error: String(e && e.message || e) }; }
        if (!r || r.error || !r.svg) { avisar(`La IA se detuvo en ${i}/${count}: ${(r && r.error) || "sin respuesta"}`); break; }
        const dentro = interior(r.svg);
        if (dentro == null) { avisar(`La IA devolvió un dibujo que no se puede leer (paso ${i + 1})`); break; }
        nuevos.push(dentro); actual = r.svg;
      }
      if (!nuevos.length) return;
      const t = global.dzCuadrosAlDocumento(doc, nuevos, desde);
      if (t && t.error) { avisar("No pude poner los cuadros: " + t.error); return; }
      const ultimo = t.desde + nuevos.length - 1;
      if (typeof global.dzDocGoTo === "function") global.dzDocGoTo(ultimo); else doc.goTo(ultimo);
      if (marcar && doc.drawing) { poner(doc.drawing, true); doc.emit("cells"); pintarBoton(); }
      doc.emit("cells");
      avisar(`${nuevos.length} cuadro(s) generados por IA después del ${desde}` + (marcar ? " · el último quedó como clave" : ""));
    };
  }

  /* ── enganches, por nombre ─────────────────────────────────────────────── */
  function envolver(nombre, conDocumento) {
    const orig = global[nombre];
    if (typeof orig !== "function" || orig.__claveDoc) return;
    const f = function () {
      const d = dz();
      if (d && d.doc) return conDocumento.apply(this, arguments);
      return orig.apply(this, arguments);
    };
    Object.assign(f, orig);
    f.__claveDoc = true;
    global[nombre] = f;
  }
  function envolverVista() {
    const V = global.LOW && global.LOW.animation && global.LOW.animation.TimelineView;
    if (!V || V.prototype.__claveDoc) return;
    const render = V.prototype.render;
    V.prototype.render = function () {
      const r = render.apply(this, arguments);
      try { pintarCeldas(this.host); } catch (_) { /* la marca no tumba la línea de tiempo */ }
      return r;
    };
    V.prototype.__claveDoc = true;
  }
  const suscritos = new WeakSet();
  function seguirDocumento() {
    const d = dz(), doc = d && d.doc;
    if (!doc || suscritos.has(doc) || typeof doc.subscribe !== "function") return;
    suscritos.add(doc);
    doc.subscribe((_docu, motivo) => { if (motivo === "frame" || motivo === "cells" || motivo === "layer") pintarBoton(); });
    pintarBoton();
  }

  function arrancar() {
    envolver("dzKeyToggle", alternarEnDocumento);
    envolver("dzAIKeyModal", modalDocumento);
    envolverVista();
    seguirDocumento();
    setInterval(seguirDocumento, 1000);   // un documento nuevo o abierto
  }

  global.LOW = global.LOW || {};
  global.LOW.animation = global.LOW.animation || {};
  global.LOW.animation.claveDeDibujo = { esClave, alternarEnDocumento, pintarCeldas, pintarBoton, interior };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar, { once: true });
  else arrancar();
})(window);
