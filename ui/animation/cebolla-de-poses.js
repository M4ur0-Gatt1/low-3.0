/* ══════════════════════════════════════════════════════════════════════════
   PAPEL CEBOLLA PARA CUT-OUT: FANTASMAS DE POSES, NO DE DIBUJOS

   MEDIDO en LOW v4.50.0, con un personaje vinculado, sostenido y con poses
   distintas en los cuadros 1 y 8: parado en el 8 y con el papel cebolla
   encendido, los fantasmas dibujados son CERO.

   La causa es sana y por eso cuesta verla: la cebolla compara DIBUJOS, y en
   cut-out todos los cuadros comparten el mismo —es un sostenido—. El
   resolvedor hace bien su trabajo: no tiene sentido fantasmear un dibujo
   idéntico al que ya está. Lo que cambia entre cuadros no es el dibujo, son
   las POSES, y de eso la cebolla no sabía nada.

   Toon Boom lo trata como un caso propio: «You can use Onion Skin to help you
   use existing poses as references to create new key poses, breakdowns or
   in-betweens». Sin esto, un animador de cut-out enciende el papel cebolla,
   no ve nada, y concluye que está roto.

   QUÉ HACE. Cuando el dibujo del cuadro vecino es EL MISMO que el actual pero
   la pose del rig es distinta, clona el dibujo vivo y le aplica las matrices
   de los huesos de ESE cuadro. El resultado es el personaje en su pose
   anterior, teñido, detrás del actual.

   DOS CUIDADOS QUE NO SON OPCIONALES:

   1. AL FANTASMA SE LE SACAN LOS `id`. La cebolla de dibujos los conserva, y
      el fantasma se inserta como PRIMER hijo de la hoja: como el rig busca
      sus piezas con `svg.querySelector("#id")` sin acotar, encontraría al
      fantasma antes que a la pieza viva y posaría al fantasma. Medido en un
      montaje donde el dibujo vivo estaba vacío: la búsqueda del rig devolvía
      «AL FANTASMA» y era el fantasma el que se movía 90.8 px. Sin pieza viva
      con la que competir no alcanza para llamarlo defecto reproducido, pero
      el orden del DOM no deja lugar a dudas y acá no se repite el patrón.
   2. NO CAPTURA EL PUNTERO. Un fantasma clickeable es peor que no tenerlo.

   Si el dibujo del vecino es DISTINTO, no se mete: de eso ya se ocupa la
   cebolla de siempre, y duplicar fantasmas sería peor que faltar.

   @module animation/cebolla-de-poses
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};
  const SVGNS = "http://www.w3.org/2000/svg";
  const CLASE = "dz-onion dz-onion-pose";
  const estado = () => (typeof DZ !== "undefined") ? DZ : null;

  const hoja = () => {
    const cv = document.querySelector("#dzCanvas");
    return cv ? cv.querySelector(":scope > svg") : null;
  };

  /** ¿Qué dibujo está expuesto en este cuadro? Dos cuadros con el mismo
   *  dibujo son un sostenido, y ahí la cebolla de dibujos no muestra nada. */
  function dibujoEn(doc, frame) {
    try {
      const ly = (doc.scene.layers || []).find((l) => l.id === doc.layerId) || (doc.scene.layers || [])[0];
      return ly && typeof ly.cellAt === "function" ? ly.cellAt(frame) : null;
    } catch (_) { return null; }
  }

  /** ¿Las poses del rig difieren entre estos dos cuadros? */
  function poseDistinta(doc, a, b) {
    const nodos = (doc.scene.rig && doc.scene.rig.nodes) || {};
    for (const n of Object.values(nodos)) {
      if (!n.elementId) continue;
      const pa = doc.scene.rigPose(n.id, a), pb = doc.scene.rigPose(n.id, b);
      if (!pa || !pb) continue;
      if (Math.abs(pa.x - pb.x) > 0.01 || Math.abs(pa.y - pb.y) > 0.01 ||
          Math.abs(pa.r - pb.r) > 0.01 || Math.abs(pa.sx - pb.sx) > 0.001 ||
          Math.abs(pa.sy - pb.sy) > 0.001) return true;
    }
    return false;
  }

  const matrizA = (m) => "matrix(" + m.map((v) => +(+v).toFixed(5)).join(" ") + ")";

  /** Un fantasma con el personaje POSADO como en `frame`. */
  function fantasma(doc, svg, frame, color, opacidad) {
    const g = document.createElementNS(SVGNS, "g");
    g.setAttribute("class", CLASE);
    g.setAttribute("opacity", String(opacidad));
    g.setAttribute("pointer-events", "none");
    // se clona lo que HAY en la mesa, sin los asistentes del editor
    for (const hijo of [...svg.children]) {
      if (hijo.classList && (hijo.classList.contains("dz-onion") || hijo.classList.contains("dz-penui"))) continue;
      if (["dzRigOverlay", "dzMeshOverlay", "dzMocapSheet"].includes(hijo.id)) continue;
      g.appendChild(hijo.cloneNode(true));
    }
    // las matrices de ESE cuadro, sobre la copia
    const nodos = (doc.scene.rig && doc.scene.rig.nodes) || {};
    for (const n of Object.values(nodos)) {
      if (!n.elementId) continue;
      const el = g.querySelector('[id="' + n.elementId.replace(/"/g, "") + '"]');
      if (!el) continue;
      try {
        const m = doc.scene.rigWorldMatrix(n.id, frame);
        if (m) el.setAttribute("transform", matrizA(m));
      } catch (_) { /* un hueso raro no puede tumbar el fantasma */ }
    }
    /* LOS `id` SE VAN. El rig busca sus piezas con querySelector sin acotar y
       este nodo va PRIMERO en la hoja: con los id puestos, posaría al
       fantasma en vez del personaje. */
    g.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
    g.querySelectorAll("[data-stk],[data-fil]").forEach((n) => {
      n.removeAttribute("data-stk"); n.removeAttribute("data-fil");
    });
    g.querySelectorAll("*").forEach((n) => {
      if (n.getAttribute("fill") && n.getAttribute("fill") !== "none") n.setAttribute("fill", color);
      if (n.getAttribute("stroke") && n.getAttribute("stroke") !== "none") n.setAttribute("stroke", color);
    });
    return g;
  }

  /** Dibuja los fantasmas de pose que falten. Devuelve cuántos puso. */
  function pintar() {
    const DZ = estado();
    const svg = hoja();
    if (!DZ || !DZ.doc || !svg) return 0;
    svg.querySelectorAll("g.dz-onion-pose").forEach((n) => n.remove());
    if (!DZ.onionOn) return 0;
    const cfgBase = (LOW.animation.onion && LOW.animation.onion.DEFAULTS) || {};
    const cfg = { ...cfgBase, ...(DZ.doc.onionCfg || {}) };
    const f = DZ.doc.frame;
    const mio = dibujoEn(DZ.doc, f);
    if (mio == null) return 0;
    const base = (cfg.alpha || 38) / 100;
    let puestos = 0;
    const lados = [
      { n: cfg.before || 0, paso: -1, color: cfg.colorBefore || "#3b82f6", factor: 1 },
      { n: cfg.after || 0, paso: +1, color: cfg.colorAfter || "#e74c3c", factor: 0.8 },
    ];
    for (const lado of lados) {
      for (let k = 1; k <= lado.n; k++) {
        const g = f + lado.paso * k;
        if (g < 1) continue;
        // sólo cuando la cebolla de DIBUJOS no muestra nada y la pose cambió
        if (dibujoEn(DZ.doc, g) !== mio) continue;
        if (!poseDistinta(DZ.doc, f, g)) continue;
        svg.insertBefore(fantasma(DZ.doc, svg, g, lado.color, base * lado.factor / k), svg.firstChild);
        puestos++;
      }
    }
    return puestos;
  }

  /** Se engancha detrás de la cebolla de dibujos: corre después, sobre la
   *  hoja ya pintada, y sólo agrega lo que a la otra le falta. */
  function envolver() {
    const original = global.dzOnionRender;
    if (typeof original !== "function" || original.__conPoses) return false;
    const envuelta = function (...args) {
      const r = original.apply(this, args);
      try { pintar(); } catch (_) { /* la cebolla no puede tumbar el repintado */ }
      return r;
    };
    envuelta.__conPoses = true;
    global.dzOnionRender = envuelta;
    return true;
  }

  animation.cebollaDePoses = { pintar, envolver, poseDistinta, dibujoEn };
  global.dzCebollaDePoses = pintar;

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", envolver, { once: true });
  else envolver();
})(window);
