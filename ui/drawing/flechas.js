/* ══════════════════════════════════════════════════════════════════════════
   LAS FLECHAS MUEVEN LO SELECCIONADO (como en Illustrator)

   Pedido de Mauro (oct-2026, LOW 3.13): «el atajo para mover los frames
   debe ser únicamente el punto y la coma, no las flechas. Las flechas deben
   mover los vectores en la pantalla de dibujo o animación, como en
   Illustrator: tengo un círculo que quiero desplazar lo mínimo posible, de a
   un pasito, y en lugar de eso se mueve la línea de tiempo».

   Las tomaban los atajos de animación (animation/shortcuts.js, en captura):
   ← → cambiaban de cuadro y ↑ ↓ de dibujo, hubiera algo seleccionado o no.
   Ahora:
     · ← → ↑ ↓      corren lo seleccionado 1 unidad del documento
     · Shift+flecha  10 unidades
     · los cuadros: «,» y «.»; los dibujos (saltando sostenidos): Alt+, Alt+.
     · Alt+← → sigue moviendo los CUADROS elegidos en la línea de tiempo,
       pero sólo si no hay nada elegido en la mesa
   Varias flechas seguidas son UN paso de Ctrl+Z, como un arrastre.

   Usa lo mismo que el arrastre de la flecha (dzReadPos/dzWritePos): la
   unidad es la del documento, no la de la pantalla, así que el paso es el
   mismo a cualquier zoom.

   @module drawing/flechas
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const PASO = 1, PASO_GRANDE = 10, JUNTAS_MS = 900;
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const DIR = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  const avisar = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };

  function seleccion() {
    const d = dz();
    if (!d) return [];
    const varios = d.multi && d.multi.length > 1 ? d.multi.slice() : (d.sel ? [d.sel] : []);
    return varios.filter((n) => n && n.isConnected && n.ownerSVGElement);
  }
  function escribiendo(el) {
    if (!el) return false;
    const t = (el.tagName || "").toLowerCase();
    return t === "input" || t === "textarea" || t === "select" || el.isContentEditable;
  }
  /* una flecha con el foco en un panel que las usa (la grilla de la línea de
     tiempo, la planilla, un menú) es de ese panel */
  const PANELES = ".dz-timeline, #dzTlGrid, #dzXsheet, .dz-modal, #overlay, [role=menu], [role=listbox], .cm-editor, .CodeMirror";

  let ultimo = { t: 0, els: [] };
  let aviso = 0;

  function mover(e) {
    const d = dz(), paso = e.shiftKey ? PASO_GRANDE : PASO, [ux, uy] = DIR[e.key];
    const els = seleccion();
    const ahora = performance.now();
    const misma = els.length === ultimo.els.length && els.every((n, i) => n === ultimo.els[i]);
    // varias flechas seguidas sobre lo mismo = un solo paso de deshacer
    if (!misma || ahora - ultimo.t > JUNTAS_MS) global.dzSnapshot();
    ultimo = { t: ahora, els };
    for (const n of els) global.dzWritePos(n, global.dzReadPos(n), ux * paso, uy * paso);
    if (typeof global.dzPositionHandle === "function") global.dzPositionHandle();
    if (typeof global.dzMarkDirty === "function") global.dzMarkDirty();
    clearTimeout(aviso);
    aviso = setTimeout(() => { if (typeof global.dzBuildInspector === "function" && d.sel) global.dzBuildInspector(d.sel); }, 250);
  }

  document.addEventListener("keydown", (e) => {
    if (!DIR[e.key] || e.ctrlKey || e.metaKey || e.defaultPrevented) return;
    const vista = document.getElementById("designView");
    if (!vista || vista.hidden) return;
    if (escribiendo(e.target) || escribiendo(document.activeElement)) return;
    if (e.target && e.target.closest && e.target.closest(PANELES)) return;
    const d = dz();
    if (!d) return;
    const els = seleccion();
    e.preventDefault();
    if (!els.length) {
      if (!e.altKey) avisar("Las flechas mueven lo seleccionado (Shift: de a 10) · los cuadros van con «,» y «.», los dibujos con Alt+, y Alt+.");
      return;
    }
    if (d.rigMode) { avisar("En el esqueleto las piezas se posan arrastrándolas: las flechas no mueven huesos"); return; }
    mover(e);
  });

  /** Lo usa animation/shortcuts.js: con algo elegido en la mesa, Alt+← → es
   *  de la mesa y no mueve cuadros de la línea de tiempo. */
  global.dzHaySeleccionEnMesa = () => seleccion().length > 0;
  global.LOW = global.LOW || {};
  global.LOW.drawing = global.LOW.drawing || {};
  global.LOW.drawing.flechas = { PASO, PASO_GRANDE, seleccion };
})(window);
