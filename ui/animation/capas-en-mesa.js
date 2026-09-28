/* ══════════════════════════════════════════════════════════════════════════
   TODAS LAS CAPAS EN LA MESA, Y LAS MISMAS EN EL EXPORT

   MEDIDO en v4.51.0: el lienzo mostraba SÓLO el dibujo de la capa activa. Con
   dos capas, dibujando en la 2 no se veía la 1 —pero el export sí las
   componía—: lo que se veía no era lo que salía, y una capa de calco (el
   storyboard importado, una rotoscopía) no servía para calcar.

   QUÉ HACE
   - Las otras capas visibles se pintan en el lienzo, en su ORDEN (la de índice
     0 es la de más atrás, igual que el export), con su OPACIDAD y su MODO DE
     FUSIÓN. Las de atrás van debajo del dibujo activo; las de adelante, encima.
   - MESA DE LUZ por capa (Layer.lightTable): la capa se ve lavada, para
     calcar. Es de la vista: el export no cambia.
   - El export (dzCuadroSvgTexto) aplica la MISMA opacidad y fusión. Antes
     ignoraba la opacidad de capa por completo.

   CUIDADOS QUE NO SON OPCIONALES
   1. Las capas de contexto llevan la clase `dz-onion`: el volcado del lienzo
      (dzCanvasInner) la descarta, así que NUNCA se guardan dentro del dibujo
      activo. Tampoco capturan el puntero.
   2. Se les SACAN LOS `id`: el rig busca sus piezas con querySelector sin
      acotar y encontraría la copia antes que la pieza viva (ver
      cebolla-de-poses.js). Las poses del rig se les aplican acá, con las
      matrices del cuadro.
   3. Se les saca el PAPEL (el rect blanco de página): si no, el papel de una
      capa de adelante taparía todo lo de atrás.
   4. Cada dibujo se prepara UNA vez y se reusa mientras no cambie: en un
      animatic un plano dura cientos de cuadros y rehacer una imagen grande en
      cada cuadro traba la reproducción.

   El modo de fusión y la opacidad de la capa ACTIVA se aplican por una hoja de
   estilos del documento (no del SVG), así no se escriben en su dibujo.

   @module animation/capas-en-mesa
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};
  const SVGNS = "http://www.w3.org/2000/svg";
  const CLASE = "dz-onion dz-capa";
  const LAVADO = { opacity: 0.35, filter: "grayscale(1) contrast(.55) brightness(1.25)" };
  const app = () => (typeof DZ !== "undefined") ? DZ : null;
  const hoja = () => { const cv = document.querySelector("#dzCanvas"); return cv ? cv.querySelector(":scope > svg") : null; };

  /** capaId → { content, g, piezas: Map(idOriginal → elemento) } */
  const cache = new Map();

  function construir(content, viewBox) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", CLASE);
    g.setAttribute("pointer-events", "none");
    g.innerHTML = content;
    if (typeof global.dzOnionStripPage === "function") global.dzOnionStripPage(g, viewBox);
    const piezas = new Map();
    g.querySelectorAll("[id]").forEach((n) => { piezas.set(n.id, n); n.removeAttribute("id"); });
    return { content, g, piezas, base: new Map() };
  }

  /** Las poses del rig de ESTE cuadro sobre la copia de una capa. */
  function posar(doc, item, frame) {
    const nodos = (doc.scene.rig && doc.scene.rig.nodes) || {};
    for (const n of Object.values(nodos)) {
      if (!n.elementId) continue;
      const el = item.piezas.get(n.elementId);
      if (!el) continue;
      if (!item.base.has(el)) item.base.set(el, el.getAttribute("transform"));
      try {
        const m = doc.scene.rigWorldMatrix(n.id, frame);
        if (m) el.setAttribute("transform", "matrix(" + m.map((v) => +(+v).toFixed(5)).join(" ") + ")");
      } catch (_) { /* un hueso raro no puede tumbar la mesa */ }
    }
  }

  function estiloDeCapa(g, ly) {
    const luz = !!ly.lightTable;
    g.setAttribute("opacity", String(+(Math.max(0, Math.min(1, ly.opacity == null ? 1 : ly.opacity)) * (luz ? LAVADO.opacity : 1)).toFixed(3)));
    g.style.mixBlendMode = !luz && ly.blend && ly.blend !== "normal" ? ly.blend : "";
    g.style.filter = luz ? LAVADO.filter : "";
    g.dataset.capa = ly.id;
    g.classList.toggle("dz-capa-luz", luz);
  }

  /** La capa activa se dibuja directo en el SVG: su opacidad y fusión van por
   *  una hoja de estilos de la PÁGINA, que no viaja con el dibujo. */
  function estiloActivo(doc) {
    let st = document.getElementById("dzCapaActivaCss");
    if (!st) { st = document.createElement("style"); st.id = "dzCapaActivaCss"; document.head.appendChild(st); }
    const ly = doc && doc.layer;
    const reglas = ["#dzCanvas > svg { isolation: isolate; }"];
    if (ly && ((ly.opacity != null && ly.opacity < 1) || (ly.blend && ly.blend !== "normal"))) {
      reglas.push("#dzCanvas > svg > g[data-low-art] { " +
        (ly.opacity < 1 ? "opacity: " + (+ly.opacity).toFixed(3) + "; " : "") +
        (ly.blend && ly.blend !== "normal" ? "mix-blend-mode: " + ly.blend + "; " : "") + "}");
    }
    const css = reglas.join("\n");
    if (st.textContent !== css) st.textContent = css;
  }

  const suscritos = new WeakSet();
  function suscribir(doc) {
    if (!doc || suscritos.has(doc) || typeof doc.subscribe !== "function") return;
    suscritos.add(doc);
    doc.subscribe((d, motivo) => {
      const a = app();
      if (!a || a.doc !== d) return;
      // «layers»: visibilidad, opacidad, fusión, mesa de luz u orden. El lienzo
      // del activo no cambia, sólo su contexto.
      if (motivo === "layers" || motivo === "cells") { try { pintar(); } catch (_) { /* la mesa no tumba nada */ } }
    });
  }

  /** Pinta el contexto de las otras capas para el cuadro actual. Devuelve
   *  cuántas capas puso. */
  function pintar() {
    const a = app(), svg = hoja();
    if (!svg) return 0;
    svg.querySelectorAll(":scope > g.dz-capa").forEach((n) => n.remove());
    if (!a || !a.doc) return 0;
    const doc = a.doc, sc = doc.scene, frame = doc.frame;
    suscribir(doc);
    estiloActivo(doc);
    const capas = sc.layers, activa = capas.findIndex((l) => l.id === doc.layerId);
    if (capas.length < 2 || activa < 0) return 0;
    const vb = svg.getAttribute("viewBox");
    const usados = new Set();
    const prep = (ly) => {
      if (ly.id === doc.layerId || ly.visible === false) return null;
      const dw = sc.drawingAt(ly.id, frame);
      if (!dw || !dw.content || (animation.drawingIsEmpty && animation.drawingIsEmpty(dw.content))) return null;
      let item = cache.get(ly.id);
      if (!item || item.content !== dw.content) { item = construir(dw.content, vb); cache.set(ly.id, item); }
      usados.add(ly.id);
      estiloDeCapa(item.g, ly);
      posar(doc, item, frame);
      return item.g;
    };
    let puestas = 0;
    // ATRÁS del activo: se insertan al principio, de la más cercana a la más
    // lejana, así la de índice 0 queda primera (la de más atrás)
    for (let i = activa - 1; i >= 0; i--) {
      const g = prep(capas[i]);
      if (g) { svg.insertBefore(g, svg.firstChild); puestas++; }
    }
    // ADELANTE: justo después del dibujo activo (antes de los asistentes del
    // editor, que tienen que seguir viéndose arriba de todo)
    const linea = svg.querySelector(':scope > g[data-low-art="line"]');
    let ancla = linea ? linea.nextSibling : null;
    for (let i = activa + 1; i < capas.length; i++) {
      const g = prep(capas[i]);
      if (!g) continue;
      svg.insertBefore(g, ancla); puestas++;
    }
    for (const id of [...cache.keys()]) if (!sc.layer(id)) cache.delete(id);
    return puestas;
  }

  /* ── export: la MISMA opacidad y fusión que se ven en la mesa ──
     Sólo se envuelve la capa que lo necesita: una capa normal y opaca sale
     idéntica a antes (hay prácticas, como la cámara multiplano, que miran los
     elementos del cuadro y no se tocan). */
  function envolverExport() {
    const original = global.dzCuadroSvgTexto;
    if (typeof original !== "function" || original.__conCapas) return false;
    const envuelto = function (frame) {
      const a = app(), sc = a && a.doc && a.doc.scene;
      if (!sc || !sc.layers.some((l) => (l.opacity != null && l.opacity < 1) || (l.blend && l.blend !== "normal")))
        return original.apply(this, arguments);
      const partes = [];
      for (const ly of sc.layers) {
        if (ly.visible === false) continue;
        const dw = sc.drawingAt(ly.id, frame);
        if (!dw || !dw.content) continue;
        let t = typeof global.dzCompositionDrawingTexto === "function"
          ? global.dzCompositionDrawingTexto(dw.content, ly.id, frame) : dw.content;
        const op = ly.opacity == null ? 1 : +ly.opacity;
        const bl = ly.blend && ly.blend !== "normal" ? ly.blend : "";
        if (op < 1 || bl) t = `<g data-low-capa="${ly.id}"` + (op < 1 ? ` opacity="${op.toFixed(3)}"` : "") +
          (bl ? ` style="mix-blend-mode:${bl}"` : "") + `>${t}</g>`;
        partes.push(t);
      }
      if (!partes.length) return "";
      const w = sc.width || 1920, h = sc.height || 1080;
      const viva = document.querySelector("#dzCanvas > svg > style.dz-palcss");
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ` +
        `style="isolation:isolate">${viva ? viva.outerHTML : ""}${partes.join("")}</svg>`;
    };
    envuelto.__conCapas = true;
    global.dzCuadroSvgTexto = envuelto;
    return true;
  }

  function envolverMesa() {
    const original = global.dzOnionRender;
    if (typeof original !== "function" || original.__conCapas) return false;
    const envuelta = function () {
      const r = original.apply(this, arguments);
      try { pintar(); } catch (_) { /* la mesa no puede tumbar el repintado */ }
      return r;
    };
    envuelta.__conCapas = true;
    global.dzOnionRender = envuelta;
    return true;
  }

  function enganchar() { envolverMesa(); envolverExport(); try { pintar(); } catch (_) { /* sin documento todavía */ } }

  animation.capasEnMesa = { pintar, envolverMesa, envolverExport, LAVADO, _cache: cache };
  global.dzCapasEnMesa = pintar;

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(window);
