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

   MÁSCARA DE RECORTE Y TONO/LUZ (fase 6, oct-2026; como el Cutter y el Tone /
   Highlight de Harmony). Una capa con `clip` se ve sólo donde hay dibujo en su
   BASE (la capa de abajo más cercana que no está recortada): una <mask> de
   alfa hecha con el dibujo de la base. Una capa con `tone` no se ve con sus
   colores: su dibujo es una silueta (filtro flood + alfa, con desenfoque si
   tiene borde suave) que multiplica (sombra) o aclara (luz, trama) lo de abajo. La
   mesa y el export arman las MISMAS <mask> y <filter>: lo que se ve es lo que
   sale. Las definiciones de la mesa van en un g.dz-onion: no se guardan.

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

  /** La BASE de una capa recortada: la de abajo más cercana sin recorte.
   *  -1 si la capa no está recortada o no tiene base (la de más atrás). */
  function baseDeRecorte(capas, i) {
    if (!capas[i] || !capas[i].clip) return -1;
    for (let j = i - 1; j >= 0; j--) if (!capas[j].clip) return j;
    return -1;
  }
  /** El filtro de TONO/LUZ: la silueta del dibujo en un color, con borde suave. */
  function filtroTono(id, tono) {
    const blur = tono.soft > 0 ? '<feGaussianBlur stdDeviation="' + (+tono.soft / 2).toFixed(2) + '"/>' : "";
    return '<filter id="' + id + '" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">' +
      '<feFlood flood-color="' + tono.color + '"/><feComposite in2="SourceAlpha" operator="in"/>' + blur + "</filter>";
  }
  /** Cómo compone una capa de tono: sombra multiplica, luz aclara (trama). */
  const fusionDeTono = (tono) => tono.kind === "luz" ? "screen" : "multiply";
  const atributosMascara = (id, w, h) => ({ id, maskUnits: "userSpaceOnUse", maskContentUnits: "userSpaceOnUse",
    x: String(-w), y: String(-h), width: String(3 * w), height: String(3 * h), "mask-type": "alpha", style: "mask-type:alpha" });
  function mascaraTexto(id, contenido, w, h) {
    const a = atributosMascara(id, w, h);
    return "<mask " + Object.keys(a).map((k) => k + '="' + a[k] + '"').join(" ") + ">" + contenido + "</mask>";
  }
  const especial = (l) => (l.opacity != null && l.opacity < 1) || (l.blend && l.blend !== "normal") || l.clip || l.tone;

  /** capaId → { content, g, piezas: Map(idOriginal → elemento) } */
  const cache = new Map();

  function construir(content, viewBox) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", CLASE);
    g.setAttribute("pointer-events", "none");
    g.innerHTML = content;
    if (typeof global.dzOnionStripPage === "function") global.dzOnionStripPage(g, viewBox);
    const piezas = new Map();
    // los id de <defs> (filtros, gradientes, formas de los pinceles) se QUEDAN:
    // sin ellos los trazos de otra capa perdían su textura, su forma y su dureza.
    // El rig no busca piezas ahí adentro.
    g.querySelectorAll("[id]").forEach((n) => { if (n.closest("defs")) return; piezas.set(n.id, n); n.removeAttribute("id"); });
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
    g.removeAttribute("mask");
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
    if (ly && especial(ly)) {
      const capas = doc.scene.layers, b = baseDeRecorte(capas, capas.indexOf(ly));
      const tono = ly.tone, op = (ly.opacity == null ? 1 : +ly.opacity) * (tono ? tono.amount : 1);
      const fusion = tono ? fusionDeTono(tono) : (ly.blend && ly.blend !== "normal" ? ly.blend : "");
      // recortada contra una base vacía se vería invisible MIENTRAS se dibuja: ahí no se recorta
      const conMascara = b >= 0 && baseConDibujo(doc, capas[b]);
      reglas.push("#dzCanvas > svg > g[data-low-art] { " +
        (op < 1 ? "opacity: " + op.toFixed(3) + "; " : "") +
        (fusion ? "mix-blend-mode: " + fusion + "; " : "") +
        (conMascara ? "mask: url(#dzRecorte_" + capas[b].id + "); " : "") +
        (tono && !ly.lightTable ? "filter: url(#dzTono_" + ly.id + "); " : "") + "}");
    }
    const css = reglas.join("\n");
    if (st.textContent !== css) st.textContent = css;
  }

  function baseConDibujo(doc, base) {
    if (!base || base.visible === false) return false;
    const dw = doc.scene.drawingAt(base.id, doc.frame);
    return !!(dw && dw.content && !(animation.drawingIsEmpty && animation.drawingIsEmpty(dw.content)));
  }

  /** Las <mask> y <filter> de la mesa, y quién las usa. `copias`: capaId → g. */
  function aplicarRecortes(doc, svg, copias) {
    svg.querySelectorAll(":scope > g.dz-capa-defs").forEach((n) => n.remove());
    const capas = doc.scene.layers, activa = capas.findIndex((l) => l.id === doc.layerId);
    const vb = svg.getAttribute("viewBox"), w = doc.scene.width || 1920, h = doc.scene.height || 1080;
    const cont = document.createElementNS(SVGNS, "g");
    cont.setAttribute("class", "dz-onion dz-capa-defs");
    const defs = document.createElementNS(SVGNS, "defs");
    cont.appendChild(defs);
    const mascaras = new Set();
    let algo = false;
    capas.forEach((ly, i) => {
      if (ly.visible === false) return;
      const b = baseDeRecorte(capas, i), tono = ly.tone;
      if (b < 0 && !tono) return;
      algo = true;
      const g = copias.get(ly.id);   // null si es la activa (va por la hoja de estilos)
      if (b >= 0) {
        const base = capas[b], mid = "dzRecorte_" + base.id;
        if (!mascaras.has(mid)) {
          mascaras.add(mid);
          const m = document.createElementNS(SVGNS, "mask");
          const a = atributosMascara(mid, w, h);
          for (const k of Object.keys(a)) m.setAttribute(k, a[k]);
          // la silueta de la base: el dibujo vivo si es la activa, la copia si no
          const fuente = b === activa ? [...svg.querySelectorAll(":scope > g[data-low-art]")] : (copias.get(base.id) ? [copias.get(base.id)] : []);
          for (const n of fuente) {
            const c = n.cloneNode(true);
            c.removeAttribute("opacity"); c.removeAttribute("style"); c.removeAttribute("mask");
            c.querySelectorAll("[id]").forEach((x) => x.removeAttribute("id")); c.removeAttribute("id");
            if (typeof global.dzOnionStripPage === "function") global.dzOnionStripPage(c, vb);
            m.appendChild(c);
          }
          defs.appendChild(m);
        }
        if (g) g.setAttribute("mask", "url(#" + mid + ")");
      }
      if (tono) {
        defs.insertAdjacentHTML("beforeend", filtroTono("dzTono_" + ly.id, tono));
        if (g && !ly.lightTable) {
          g.style.filter = "url(#dzTono_" + ly.id + ")";
          g.style.mixBlendMode = fusionDeTono(tono);
          g.setAttribute("opacity", String(+((ly.opacity == null ? 1 : ly.opacity) * tono.amount).toFixed(3)));
        }
      }
    });
    if (algo) svg.appendChild(cont);
    return algo;
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

  /* EL PAPEL TAPABA AL PAPEL CEBOLLA. Reportado en v3.0.1: «el papel cebolla
     no anda». MEDIDO: los fantasmas SÍ se dibujaban, pero la cebolla los mete
     como PRIMEROS hijos de la hoja, y un documento nuevo trae como primer
     elemento de su dibujo la hoja blanca opaca (rect[data-low-page], 1920x1080
     #ffffff): quedaban DEBAJO del papel. En el mock no pasa porque no tiene
     hoja. Lo mismo les pasaba a las capas de atrás de esta mesa y a la cebolla
     de poses. Todo lo de asistencia que está antes del papel se mueve a
     inmediatamente DESPUÉS, en el mismo orden: papel · capas de atrás ·
     fantasmas · dibujo activo. */
  function sobreElPapel(svg) {
    if (!svg) return false;
    const hijos = [...svg.children];
    const esPapel = (n) => n.matches && (n.matches("rect[data-low-page]") ||
      (typeof global.dzIsCanvasBackground === "function" && global.dzIsCanvasBackground(n)));
    const papel = hijos.find(esPapel);
    if (!papel) return false;
    const antes = hijos.slice(0, hijos.indexOf(papel)).filter((n) => n.classList && n.classList.contains("dz-onion"));
    if (!antes.length) return false;
    let ancla = papel.nextSibling;
    for (const n of antes) svg.insertBefore(n, ancla);
    return true;
  }

  function pintar() {
    const n = pintarCapas();
    try { sobreElPapel(hoja()); } catch (_) { /* reordenar no puede tumbar la mesa */ }
    return n;
  }

  /** Pinta el contexto de las otras capas para el cuadro actual. Devuelve
   *  cuántas capas puso. */
  function pintarCapas() {
    const a = app(), svg = hoja();
    if (!svg) return 0;
    svg.querySelectorAll(":scope > g.dz-capa, :scope > g.dz-capa-defs").forEach((n) => n.remove());
    if (!a || !a.doc) return 0;
    const doc = a.doc, sc = doc.scene, frame = doc.frame;
    suscribir(doc);
    estiloActivo(doc);
    const capas = sc.layers, activa = capas.findIndex((l) => l.id === doc.layerId);
    const copias = new Map();
    if (capas.length < 2 || activa < 0) { aplicarRecortes(doc, svg, copias); return 0; }
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
      copias.set(ly.id, item.g);
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
    aplicarRecortes(doc, svg, copias);
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
      if (!sc || !sc.layers.some(especial))
        return original.apply(this, arguments);
      const w = sc.width || 1920, h = sc.height || 1080;
      const textos = sc.layers.map((ly) => {
        if (ly.visible === false) return null;
        const dw = sc.drawingAt(ly.id, frame);
        if (!dw || !dw.content) return null;
        return typeof global.dzCompositionDrawingTexto === "function"
          ? global.dzCompositionDrawingTexto(dw.content, ly.id, frame) : dw.content;
      });
      const partes = [], defs = [], mascaras = new Set();
      sc.layers.forEach((ly, i) => {
        let t = textos[i];
        if (t == null) return;
        const b = baseDeRecorte(sc.layers, i), tono = ly.tone;
        let extra = "";
        if (b >= 0) {
          if (textos[b] == null) return;              // base oculta o vacía: lo recortado no se ve
          const mid = "lowRecorte_" + sc.layers[b].id;
          if (!mascaras.has(mid)) { mascaras.add(mid); defs.push(mascaraTexto(mid, sinPapel(textos[b], w, h), w, h)); }
          extra += ` mask="url(#${mid})"`;
        }
        let op = ly.opacity == null ? 1 : +ly.opacity;
        let bl = ly.blend && ly.blend !== "normal" ? ly.blend : "";
        if (tono) {
          defs.push(filtroTono("lowTono_" + ly.id, tono));
          extra += ` filter="url(#lowTono_${ly.id})"`;
          op *= tono.amount; bl = fusionDeTono(tono);
        }
        if (op < 1 || bl || extra) t = `<g data-low-capa="${ly.id}"` + (op < 1 ? ` opacity="${op.toFixed(3)}"` : "") +
          (bl ? ` style="mix-blend-mode:${bl}"` : "") + extra + `>${t}</g>`;
        partes.push(t);
      });
      if (!partes.length) return "";
      if (defs.length) partes.unshift("<defs>" + defs.join("") + "</defs>");
      const viva = document.querySelector("#dzCanvas > svg > style.dz-palcss");
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ` +
        `style="isolation:isolate">${viva ? viva.outerHTML : ""}${partes.join("")}</svg>`;
    };
    envuelto.__conCapas = true;
    global.dzCuadroSvgTexto = envuelto;
    return true;
  }

  /** El dibujo de la base sin el papel: si no, la máscara sería la hoja entera. */
  function sinPapel(texto, w, h) {
    const g = document.createElementNS(SVGNS, "g");
    g.innerHTML = texto;
    if (typeof global.dzOnionStripPage === "function") global.dzOnionStripPage(g, "0 0 " + w + " " + h);
    g.querySelectorAll("rect[data-low-page]").forEach((n) => n.remove());
    return g.innerHTML;
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

  animation.capasEnMesa = { pintar, sobreElPapel, envolverMesa, envolverExport, LAVADO, _cache: cache };
  animation.recorte = { baseDeRecorte, filtroTono, fusionDeTono, mascaraTexto, especial };
  global.dzCapasEnMesa = pintar;

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(window);
