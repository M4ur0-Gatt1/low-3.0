/* ══════════════════════════════════════════════════════════════════════════
   MESA SOLA (F) Y MODO DIBUJO (Tab), COMO EN PHOTOSHOP

   Pedido de Mauro (oct-2026, LOW 3.17): «quiero que la F sirva para dejar la
   mesa de trabajo sola, como en Photoshop».

   F antes era «Ajustar a la pantalla», que pasa a Ctrl+0 (como en Photoshop)
   o Alt+F. Y al revisarlo
   apareció una pérdida: el «Modo dibujo» de Tab escondía una LISTA de
   paneles (menú, inspector, línea de tiempo vieja, barra de estado) y los que
   se sumaron después —la X-sheet, los dibujos del nivel, la línea de tiempo
   nueva, las pestañas de documentos— quedaban a la vista. Una lista se
   desactualiza sola.

   Por eso acá no hay lista: se esconde TODO lo que no contiene a la hoja.
     · F — Mesa sola: queda la hoja y nada más.
     · Tab — Modo dibujo: la hoja y las herramientas.
   La misma tecla (o el botón de salida, o Esc) lo devuelve todo. Un panel
   nuevo, mañana, queda escondido sin que nadie se acuerde de agregarlo.

   @module workspace/mesa-sola
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const MODOS = {
    sola: { clase: "dz-mesa-sola", texto: "✕ volver a los paneles (F)", estado: "Mesa sola · F vuelve a mostrar todo" },
    dibujo: { clase: "dz-zen", texto: "✕ salir del modo dibujo (Tab)", estado: "Modo dibujo: la hoja y las herramientas · Tab vuelve a mostrar todo" },
  };
  const vista = () => document.getElementById("designView");
  const activo = () => { const v = vista(); return v ? Object.keys(MODOS).find((m) => v.classList.contains(MODOS[m].clase)) || null : null; };

  function boton(modo) {
    let b = document.getElementById("dzMesaSalir");
    if (!b) {
      b = document.createElement("button");
      b.id = "dzMesaSalir"; b.type = "button"; b.className = "dz-zen-exit dz-mesa-salir";
      b.onclick = () => poner(null);
      vista().appendChild(b);
    }
    b.textContent = modo ? MODOS[modo].texto : "";
    b.style.display = modo ? "block" : "none";
  }

  /** Pone un modo (o ninguno). Un modo distinto reemplaza al otro. */
  function poner(modo) {
    const v = vista();
    if (!v) return null;
    for (const m of Object.keys(MODOS)) v.classList.toggle(MODOS[m].clase, m === modo);
    document.body.classList.toggle("dz-mesa-sola-activa", modo === "sola");
    const viejo = document.getElementById("dzZenExit"); if (viejo) viejo.style.display = "none";   // el botón del modo viejo
    const zen = document.getElementById("dzZen"); if (zen) zen.classList.toggle("active", modo === "dibujo");
    boton(modo);
    if (modo && typeof global.dzSetStatus === "function") global.dzSetStatus(MODOS[modo].estado);
    setTimeout(() => { try { if (typeof global.dzFitView === "function") global.dzFitView(); } catch (_) { /* sin hoja */ } }, 60);
    return modo;
  }
  const alternar = (modo) => poner(activo() === modo ? null : modo);

  // Ctrl+0: ajustar a la pantalla, como en Photoshop (F pasó a ser Mesa sola).
  // Se ataja antes de que el navegador lo tome como «zoom de la página al 100 %».
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || (e.key !== "0" && e.code !== "Digit0" && e.code !== "Numpad0")) return;
    const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (!document.querySelector("#designView:not([hidden])")) return;
    e.preventDefault(); e.stopPropagation();
    if (typeof global.dzFitView === "function") global.dzFitView();
  }, true);

  // Esc también vuelve (si nada más lo está usando: la pluma, una ventana)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || e.defaultPrevented || !activo()) return;
    const m = document.getElementById("overlay");
    if (m && !m.hidden) return;
    if (typeof PEN !== "undefined" && PEN) return;
    poner(null);
  });

  global.dzMesaSolaToggle = () => alternar("sola");
  // el Modo dibujo de siempre (botón y Tab) pasa a esconder TODO menos hoja y herramientas
  global.dzZenToggle = () => alternar("dibujo");
  global.LOW = global.LOW || {};
  LOW.mesaSola = { poner, alternar, activo };
  // el botón del modo dibujo llamaba a la función vieja por referencia; el
  // menú Vista → «Mesa sola» pasa por dzMenuAction
  const enganchar = () => {
    const z = document.getElementById("dzZen"); if (z) z.onclick = () => global.dzZenToggle();
    const orig = global.dzMenuAction;
    if (typeof orig === "function" && !orig.__mesaSola) {
      const env = function (act, ...resto) { if (act === "mesasola") return global.dzMesaSolaToggle(); return orig.call(this, act, ...resto); };
      env.__mesaSola = true; global.dzMenuAction = env;
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(enganchar, 0), { once: true });
  else setTimeout(enganchar, 0);
})(window);
