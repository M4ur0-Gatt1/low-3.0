/* ══════════════════════════════════════════════════════════════════════════
   ACOMPAÑAR EL MOVIMIENTO: UNA PARTE SIGUE A OTRA, SIN AGRUPARLAS

   Pedido de Mauro (oct-2026, LOW 3.19, con un video): «si ya tengo un objeto
   animado, quiero agregarle otro objeto y que siga el movimiento… una función
   nueva, para no mezclar el comportamiento de agrupado, porque también sirve
   mover cada parte independiente; pero en casos necesito que el movimiento
   acompañe al cuerpo: voy a hacer una caminata y quiero que la cabeza
   acompañe al cuerpo».

   Es el «parent» de After Effects o el peg de Toon Boom, para dibujos cuadro
   a cuadro:
     · en un cuadro donde están los dos, se eligen la cabeza (o varias partes)
       y, con Shift, el cuerpo AL FINAL: el último elegido es el que guía,
       como el objeto clave de Illustrator;
     · Animación → «Acompañar el movimiento» (Alt+P): en cada cuadro de la
       capa donde está el cuerpo, la cabeza aparece movida, girada y escalada
       igual que el cuerpo respecto de este cuadro;
     · siguen siendo objetos separados: en cualquier cuadro se puede retocar la
       cabeza sola. Volver a aplicarlo REEMPLAZA lo que puso antes (no duplica),
       y saca las copias quietas idénticas que hubiera (las de Alt+D);
     · «Soltar del movimiento» saca la cabeza de los otros cuadros;
     · todo es un solo paso de Ctrl+Z.

   CÓMO RECONOCE AL CUERPO EN CADA CUADRO. Si el cuerpo se animó copiándolo o
   interpolándolo, es la MISMA forma con otro `transform`: se lo encuentra por
   su id o por su forma, y la cabeza hereda exactamente su desplazamiento, giro
   y escala. Si se lo redibujó a mano cuadro a cuadro (la forma cambia), se lo
   toma por su lugar en el plano y la cabeza sigue el centro del cuerpo (sólo
   posición); el mensaje final lo dice.

   @module animation/acompanar
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const GEOM = ["d", "points", "cx", "cy", "r", "rx", "ry", "x", "y", "width", "height", "x1", "y1", "x2", "y2", "href"];
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const avisar = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };
  const respirar = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

  /* ── matrices sin pantalla: sirven igual en la hoja viva y en una copia ── */
  const I = () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
  const mul = (A, B) => ({ a: A.a * B.a + A.c * B.b, b: A.b * B.a + A.d * B.b, c: A.a * B.c + A.c * B.d, d: A.b * B.c + A.d * B.d, e: A.a * B.e + A.c * B.f + A.e, f: A.b * B.e + A.d * B.f + A.f });
  const inv = (M) => { const det = M.a * M.d - M.b * M.c || 1e-12; return { a: M.d / det, b: -M.b / det, c: -M.c / det, d: M.a / det, e: (M.c * M.f - M.d * M.e) / det, f: (M.b * M.e - M.a * M.f) / det }; };
  const propia = (el) => { try { const c = el.transform && el.transform.baseVal.consolidate(); return c ? { a: c.matrix.a, b: c.matrix.b, c: c.matrix.c, d: c.matrix.d, e: c.matrix.e, f: c.matrix.f } : I(); } catch (_) { return I(); } };
  /** La matriz del elemento respecto de su plano (o de la hoja): la suya y la de sus grupos. */
  function relPlano(el) {
    let M = I();
    for (let n = el; n && !(n.getAttribute && n.getAttribute("data-low-art")) && n.tagName && n.tagName.toLowerCase() !== "svg"; n = n.parentElement) M = mul(propia(n), M);
    return M;
  }
  const txt = (M) => `matrix(${[M.a, M.b, M.c, M.d, M.e, M.f].map((v) => Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e5) / 1e5).join(" ")})`;
  const planoDe = (el) => { const g = el.closest && el.closest("[data-low-art]"); return g ? g.getAttribute("data-low-art") : null; };

  /** La forma del elemento, sin su lugar: para reconocerlo en otro cuadro. */
  function firma(el) {
    if (el.id) return "#" + el.id;
    const c = el.cloneNode(true);
    ["transform", "class", "data-acompana", "data-sigue", "style"].forEach((a) => c.removeAttribute(a));
    c.querySelectorAll && c.querySelectorAll("[class]").forEach((x) => x.removeAttribute("class"));
    return c.outerHTML;
  }
  /** Su lugar en el plano (para cuando se lo redibujó y la forma cambió). */
  function lugar(el) {
    const p = el.parentElement;
    return p ? [planoDe(el), [...p.children].indexOf(el), el.tagName.toLowerCase()] : null;
  }

  /** El cuerpo en otra hoja: por id, por forma, o por su lugar. */
  function buscarGuia(tmp, guia) {
    if (guia.id) { const n = tmp.querySelector("#" + CSS.escape(guia.id)); if (n) return { n, exacto: true }; }
    for (const n of tmp.querySelectorAll(guia.tag)) if (!n.closest(".dz-onion") && firma(n) === guia.firma) return { n, exacto: true };
    if (guia.lugar) {
      const plano = guia.lugar[0] ? tmp.querySelector('[data-low-art="' + guia.lugar[0] + '"]') : tmp;
      const n = plano && plano.children[guia.lugar[1]];
      if (n && n.tagName.toLowerCase() === guia.lugar[2]) return { n, exacto: false };
    }
    return null;
  }

  /** El centro de un elemento de una hoja oculta, en unidades del plano. */
  let oculta = null;
  function centroEn(tmp, n) {
    if (!oculta || !oculta.isConnected) {
      oculta = document.createElementNS(NS, "svg");
      oculta.style.cssText = "position:absolute;left:-30000px;top:0;visibility:hidden;pointer-events:none";
      document.body.appendChild(oculta);
    }
    oculta.setAttribute("viewBox", tmp.getAttribute("viewBox") || "0 0 1920 1080");
    oculta.innerHTML = ""; oculta.appendChild(tmp);
    try { const b = n.getBBox(), M = relPlano(n); const x = b.x + b.width / 2, y = b.y + b.height / 2; return [M.a * x + M.c * y + M.e, M.b * x + M.d * y + M.f]; }
    catch (_) { return null; } finally { oculta.innerHTML = ""; }
  }

  function eleccion() {
    const D = dz();
    if (!D) return [];
    const varios = D.multi && D.multi.length > 1 ? D.multi.slice() : (D.sel ? [D.sel] : []);
    return varios.filter((n) => n && n.isConnected && n.ownerSVGElement);
  }
  const marca = (el) => { if (!el.getAttribute("data-acompana")) el.setAttribute("data-acompana", "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)); return el.getAttribute("data-acompana"); };

  /** La cabeza (las partes) sigue al cuerpo en todos los cuadros de la capa. */
  async function acompanar() {
    const D = dz(), doc = D && D.doc;
    if (!doc) return avisar("Acompañar el movimiento trabaja sobre una escena .low");
    const els = eleccion(), guiaEl = D.sel;
    if (els.length < 2 || !guiaEl || !els.includes(guiaEl))
      return avisar("Elegí la cabeza (o lo que tenga que acompañar) y después, con Shift, el cuerpo: el último que elegís es el que guía");
    const capa = doc.layer;
    if (!capa || capa.locked) return avisar("La capa está bloqueada");
    if (typeof global.dzDocCommit === "function") global.dzDocCommit();
    const partes = els.filter((n) => n !== guiaEl);
    const F = doc.frame, L0 = relPlano(guiaEl);
    const guia = { id: guiaEl.id || null, tag: guiaEl.tagName.toLowerCase(), firma: firma(guiaEl), lugar: lugar(guiaEl) };
    // el cuerpo, en esta hoja: su centro (para los cuadros donde se lo redibujó)
    const c0 = (() => { try { const b = guiaEl.getBBox(), x = b.x + b.width / 2, y = b.y + b.height / 2; return [L0.a * x + L0.c * y + L0.e, L0.b * x + L0.d * y + L0.f]; } catch (_) { return null; } })();
    const datos = partes.map((p) => {
      const c = p.cloneNode(true);
      ["class"].forEach((a) => c.removeAttribute(a));
      c.querySelectorAll && c.querySelectorAll(".dz-sel, .dz-msel").forEach((x) => x.classList.remove("dz-sel", "dz-msel"));
      return { id: marca(p), tag: p.tagName.toLowerCase(), plano: planoDe(p) || "line", P0: relPlano(p), html: (() => { c.setAttribute("data-acompana", p.getAttribute("data-acompana")); c.removeAttribute("transform"); return new XMLSerializer().serializeToString(c); })(), huella: firma(p) };
    });
    // que la marca quede guardada también en este cuadro
    if (typeof global.dzMarkDirty === "function") global.dzMarkDirty();
    if (typeof global.dzDocCommit === "function") global.dzDocCommit();

    const vb = global.dzVB ? global.dzVB() : [0, 0, 1920, 1080];
    const fin = (doc.scene.lastFrame && doc.scene.lastFrame()) || F;
    const hechos = new Set([capa.cellAt ? capa.cellAt(F) : null]);   // un dibujo sostenido se escribe una vez
    const cambios = [];
    let aproximados = 0, sinCuerpo = 0;
    avisar("Buscando el cuerpo en los cuadros…"); await respirar();
    for (let f = 1; f <= fin; f++) {
      if (f === F) continue;
      const num = capa.cellAt ? capa.cellAt(f) : null;
      if (num == null || hechos.has(num)) continue;
      hechos.add(num);
      const dw = doc.scene.drawingAt(capa.id, f);
      if (!dw || !dw.content) continue;
      const tmp = document.createElementNS(NS, "svg");
      tmp.setAttribute("viewBox", vb.join(" "));
      tmp.innerHTML = dw.content;
      const hallado = buscarGuia(tmp, guia);
      if (!hallado) { sinCuerpo++; continue; }
      let mover;
      if (hallado.exacto) mover = mul(relPlano(hallado.n), inv(L0));
      else {
        // redibujado: se mide el centro del cuerpo en una copia montada aparte
        const copia = tmp.cloneNode(true), h2 = buscarGuia(copia, guia), cf = h2 && centroEn(copia, h2.n);
        if (!cf || !c0) { sinCuerpo++; continue; }
        mover = { a: 1, b: 0, c: 0, d: 1, e: cf[0] - c0[0], f: cf[1] - c0[1] };
        aproximados++;
      }
      // lo anterior de estas partes (su versión acompañada, o una copia quieta idéntica) se va
      for (const d of datos) {
        tmp.querySelectorAll('[data-acompana="' + d.id + '"]').forEach((n) => n.remove());
        for (const n of [...tmp.querySelectorAll(d.tag)]) if (!n.hasAttribute("data-acompana") && firma(n) === d.huella) n.remove();
        const t2 = document.createElementNS(NS, "svg"); t2.innerHTML = d.html;
        const nueva = t2.firstElementChild;
        nueva.setAttribute("transform", txt(mul(mover, d.P0)));
        const destino = tmp.querySelector('[data-low-art="' + d.plano + '"]') || tmp;
        destino.appendChild(nueva);
      }
      cambios.push([f, tmp.innerHTML]);
    }
    if (!cambios.length) return avisar(sinCuerpo ? "No encontré el cuerpo en los otros cuadros de la capa" : "La capa no tiene otros cuadros con dibujo");

    const h = doc.history, tx = !!h && !h.transaction;
    if (tx) h.begin("Acompañar el movimiento");
    try {
      for (let k = 0; k < cambios.length; k++) {
        if (k % 8 === 0) { avisar("Acompañando · cuadro " + (k + 1) + " de " + cambios.length + "…"); await respirar(); }
        doc.goTo(cambios[k][0]);
        doc.writeDrawing(cambios[k][1], { label: "Acompañar el movimiento" });
      }
    } finally { if (tx) h.commit(); }
    doc.goTo(F);
    if (typeof global.dzCanvasSet === "function") global.dzCanvasSet(doc.drawing ? doc.drawing.content : "");
    doc.emit("cells"); doc.emit("frame");
    const que = partes.length === 1 ? "La parte elegida acompaña" : "Las " + partes.length + " partes acompañan";
    avisar(que + " al cuerpo en " + cambios.length + " dibujo" + (cambios.length === 1 ? "" : "s") +
      (aproximados ? " (en " + aproximados + " el cuerpo estaba redibujado: sigue su centro, sin giro)" : "") +
      (sinCuerpo ? " · en " + sinCuerpo + " no estaba el cuerpo" : "") + " · Ctrl+Z lo deshace");
    return { dibujos: cambios.length, aproximados, sinCuerpo };
  }

  /** Saca de los OTROS cuadros las copias acompañadas de lo elegido. */
  async function soltar() {
    const D = dz(), doc = D && D.doc;
    if (!doc) return;
    const ids = eleccion().map((n) => n.getAttribute("data-acompana")).filter(Boolean);
    if (!ids.length) return avisar("Elegí la parte que acompaña (la cabeza) para soltarla del movimiento");
    if (typeof global.dzDocCommit === "function") global.dzDocCommit();
    const capa = doc.layer, F = doc.frame, fin = (doc.scene.lastFrame && doc.scene.lastFrame()) || F;
    const hechos = new Set([capa.cellAt ? capa.cellAt(F) : null]), cambios = [];
    for (let f = 1; f <= fin; f++) {
      const num = capa.cellAt ? capa.cellAt(f) : null;
      if (f === F || num == null || hechos.has(num)) continue;
      hechos.add(num);
      const dw = doc.scene.drawingAt(capa.id, f);
      if (!dw || !dw.content) continue;
      const tmp = document.createElementNS(NS, "svg"); tmp.innerHTML = dw.content;
      let n = 0; for (const id of ids) tmp.querySelectorAll('[data-acompana="' + id + '"]').forEach((x) => { x.remove(); n++; });
      if (n) cambios.push([f, tmp.innerHTML]);
    }
    if (!cambios.length) return avisar("Lo elegido no estaba acompañando en otros cuadros");
    const h = doc.history, tx = !!h && !h.transaction;
    if (tx) h.begin("Soltar del movimiento");
    try { for (const [f, c] of cambios) { doc.goTo(f); doc.writeDrawing(c, { label: "Soltar del movimiento" }); } } finally { if (tx) h.commit(); }
    doc.goTo(F);
    if (typeof global.dzCanvasSet === "function") global.dzCanvasSet(doc.drawing ? doc.drawing.content : "");
    doc.emit("cells"); doc.emit("frame");
    avisar("Solté lo elegido del movimiento: salió de " + cambios.length + " dibujo" + (cambios.length === 1 ? "" : "s") + " · Ctrl+Z lo devuelve");
  }

  function envolverMenu() {
    const orig = global.dzMenuAction;
    if (typeof orig !== "function" || orig.__acompanar) return;
    const env = function (act, ...resto) {
      if (act === "acompanar") return acompanar();
      if (act === "soltar-acompanar") return soltar();
      return orig.call(this, act, ...resto);
    };
    env.__acompanar = true; global.dzMenuAction = env;
  }
  global.LOW = global.LOW || {};
  LOW.acompanar = { acompanar, soltar, relPlano, firma };
  global.dzAcompanar = acompanar; global.dzSoltarAcompanar = soltar;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(envolverMenu, 0), { once: true });
  else setTimeout(envolverMenu, 0);
})(window);
