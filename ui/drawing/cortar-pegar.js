/* ══════════════════════════════════════════════════════════════════════════
   CORTAR, COPIAR Y PEGAR OBJETOS (Ctrl+X · Ctrl+C · Ctrl+V)

   Pedido de Mauro (oct-2026, LOW 3.19): «el comando Ctrl+X no funciona para
   cortar, y creo que es muy útil; quiero que funcione con los objetos».

   Hasta acá Ctrl+C copiaba SIEMPRE el cuadro entero, aunque hubiera objetos
   elegidos, y Ctrl+X no hacía nada. Ahora, como en Illustrator y Toon Boom:
     · con objetos elegidos en la mesa, Ctrl+C los copia y Ctrl+X los corta
       (un solo paso de Ctrl+Z);
     · Ctrl+V los pega EN EL MISMO LUGAR, en el cuadro y la capa donde estés:
       cortar en un cuadro y pegar en otro no corre nada (para animar es lo
       que sirve). Cada objeto vuelve a su plano (Línea o Color) y quedan
       elegidos, listos para mover;
     · sin nada elegido, Ctrl+C sigue copiando el cuadro entero, y Ctrl+V pega
       lo último que se copió (objetos o cuadro).
   Lo que se copia lleva su posición REAL: la transformación propia y la de
   los grupos donde estaba quedan en el objeto pegado.

   No toca a la línea de tiempo ni a la X-sheet: si lo último que se tocó fue
   una celda, Ctrl+C/X/V son de ellas.

   @module drawing/cortar-pegar
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  let piezas = null;          // [{ plano, html }]
  let ultimo = null;          // "objetos" | "cuadro": lo último que se copió
  let ultimoToque = null;     // dónde fue el último clic: la mesa, o la línea de tiempo / X-sheet

  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const hoja = () => document.querySelector("#dzCanvas > svg");
  const avisar = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };
  const plural = (n, uno, varios) => n + " " + (n === 1 ? uno : varios);

  function seleccion() {
    const D = dz(), svg = hoja();
    if (!D || !svg) return [];
    const multi = (D.multi || []).filter((n) => n && n.isConnected && svg.contains(n));
    if (multi.length > 1) return multi;
    return D.sel && D.sel.isConnected && svg.contains(D.sel) && D.sel !== svg ? [D.sel] : [];
  }

  const matriz = (m) => `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map((v) => Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e6) / 1e6).join(" ")})`;
  const identidad = (m) => Math.abs(m.a - 1) < 1e-9 && Math.abs(m.d - 1) < 1e-9 && Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9 && Math.abs(m.e) < 1e-6 && Math.abs(m.f) < 1e-6;

  /** Guarda los objetos con su posición real respecto de su plano. */
  function copiar(els) {
    const svg = hoja();
    piezas = els.map((el) => {
      const plano = el.closest("[data-low-art]");
      const base = plano && svg.contains(plano) ? plano : svg;
      const c = el.cloneNode(true);
      c.classList && c.classList.remove("dz-sel", "dz-msel");
      if (c.getAttribute && c.getAttribute("class") === "") c.removeAttribute("class");
      try {
        const m = base.getScreenCTM().inverse().multiply(el.getScreenCTM());
        if (identidad(m)) c.removeAttribute("transform"); else c.setAttribute("transform", matriz(m));
      } catch (_) { /* sin pantalla: va como está */ }
      return { plano: plano ? plano.getAttribute("data-low-art") : "line", html: new XMLSerializer().serializeToString(c) };
    });
    ultimo = "objetos";
    return piezas.length;
  }

  function pegar() {
    const svg = hoja();
    if (!svg || !piezas || !piezas.length) return 0;
    if (typeof global.dzSnapshot === "function") global.dzSnapshot();
    const nuevos = [];
    for (const p of piezas) {
      const tmp = document.createElementNS(NS, "svg");
      tmp.innerHTML = p.html;
      const n = tmp.firstElementChild;
      if (!n) continue;
      // un id que ya está en la hoja (pegar dos veces) se renombra; si no, se conserva (el rig se vincula por id)
      const choca = [n, ...n.querySelectorAll("[id]")].some((x) => x.id && document.getElementById(x.id));
      if (choca && typeof global.dzUniqueCloneIds === "function") global.dzUniqueCloneIds(n);
      const host = typeof global.dzArtHost === "function" ? global.dzArtHost(svg, p.plano === "colour" ? "colour" : "line") : svg;
      host.appendChild(n);
      nuevos.push(n);
    }
    if (!nuevos.length) return 0;
    const D = dz();
    if (typeof global.dzClearMulti === "function") global.dzClearMulti();
    if (D) D.multi = nuevos.length > 1 ? nuevos.slice() : [];
    nuevos.forEach((n) => nuevos.length > 1 && n.classList && n.classList.add("dz-msel"));
    if (typeof global.dzSelect === "function") global.dzSelect(nuevos[nuevos.length - 1]);
    if (typeof global.dzMarkDirty === "function") global.dzMarkDirty();
    if (typeof global.dzBuildLayers === "function") global.dzBuildLayers();
    return nuevos.length;
  }

  function cortar(els) {
    const n = copiar(els);
    if (typeof global.dzDeleteSelected === "function") global.dzDeleteSelected();   // borra con su propio paso de Ctrl+Z
    return n;
  }

  // dónde fue el último toque: la línea de tiempo y la X-sheet tienen su propio cortar/pegar de celdas
  document.addEventListener("pointerdown", (e) => {
    const t = e.target;
    ultimoToque = t && t.closest && t.closest("#dzTimeline, #dzTlGrid, .tl2, #dzXsheet, .xs2") ? "celdas" : (t && t.closest && t.closest("#dzCanvas") ? "mesa" : ultimoToque);
  }, true);

  const escribiendo = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

  /** Atajos (en captura: antes que el copiar-cuadro de siempre). */
  global.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    const k = (e.key || "").toLowerCase();
    if (k !== "c" && k !== "x" && k !== "v") return;
    if (escribiendo(e.target) || ultimoToque === "celdas") return;
    const vista = document.getElementById("designView");
    if (!vista || vista.hidden) return;
    if ((window.getSelection() || "").toString().trim()) return;   // texto elegido: el copiar de siempre
    const els = seleccion();
    if (k === "c" && els.length) {
      e.preventDefault(); e.stopImmediatePropagation();
      const n = copiar(els);
      avisar("Copié " + plural(n, "objeto", "objetos") + " · Ctrl+V los pega en el mismo lugar (también en otro cuadro)");
    } else if (k === "x") {
      e.preventDefault(); e.stopImmediatePropagation();
      if (!els.length) return avisar("Elegí con la flecha lo que querés cortar");
      const n = cortar(els);
      avisar("✂ Corté " + plural(n, "objeto", "objetos") + " · Ctrl+V los pega en el mismo lugar (también en otro cuadro)");
    } else if (k === "v" && ultimo === "objetos" && piezas && piezas.length) {
      e.preventDefault(); e.stopImmediatePropagation();
      const n = pegar();
      if (n) avisar("Pegué " + plural(n, "objeto", "objetos") + " en el mismo lugar · están elegidos, listos para mover");
    }
  }, true);

  // el copiar-cuadro de siempre deja de lado los objetos copiados: Ctrl+V pega lo último
  function envolverCuadro() {
    const orig = global.dzCuadroCopiar;
    if (typeof orig !== "function" || orig.__cortarPegar) return;
    const env = function (...a) { ultimo = "cuadro"; return orig.apply(this, a); };
    env.__cortarPegar = true; global.dzCuadroCopiar = env;
  }
  // el menú Edición: Cortar · Copiar · Pegar
  function envolverMenu() {
    const orig = global.dzMenuAction;
    if (typeof orig !== "function" || orig.__cortarPegar) return;
    const env = function (act, ...resto) {
      if (act === "cortar" || act === "copiar") {
        const els = seleccion();
        if (!els.length) return act === "copiar" && typeof global.dzCuadroCopiar === "function" ? global.dzCuadroCopiar() : avisar("Elegí con la flecha lo que querés cortar");
        const n = act === "cortar" ? cortar(els) : copiar(els);
        return avisar((act === "cortar" ? "✂ Corté " : "Copié ") + plural(n, "objeto", "objetos") + " · Ctrl+V los pega en el mismo lugar");
      }
      if (act === "pegar") {
        if (ultimo === "objetos" && piezas && piezas.length) { const n = pegar(); return n && avisar("Pegué " + plural(n, "objeto", "objetos") + " en el mismo lugar"); }
        return typeof global.dzCuadroPegar === "function" ? global.dzCuadroPegar() : undefined;
      }
      return orig.call(this, act, ...resto);
    };
    env.__cortarPegar = true; global.dzMenuAction = env;
  }
  const arrancar = () => { envolverCuadro(); envolverMenu(); };
  global.LOW = global.LOW || {};
  LOW.cortarPegar = { copiar, cortar, pegar, seleccion, get piezas() { return piezas; }, get ultimo() { return ultimo; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(arrancar, 0), { once: true });
  else setTimeout(arrancar, 0);
})(window);
