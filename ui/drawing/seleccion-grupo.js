/* ══ ⬚ LAS HERRAMIENTAS DE SELECCIÓN, EN UN SOLO BOTÓN (como Toon Boom) ═════
   Pedido de Mauro: «quiero varias herramientas de selección en la herramienta
   de selección, tal cual en Toon Boom». El botón de la Flecha de la barra
   lateral es un grupo: la flechita de la esquina, mantenerlo pulsado o el
   clic derecho abren la lista, y el ícono del botón muestra la que está en uso.

   - HERRAMIENTAS: Rectángulo · Lazo · Polígono · Mismo color (clic en un
     trazo elige todos los de su color) · Selección directa (dentro de grupos).
   - ALCANCE (a qué dibujos va mover, escalar o girar): Este dibujo · Cuadros
     elegidos · Toda la capa (todos los cuadros). Si no es «este dibujo», el
     botón lleva un punto naranja: que nadie mueva toda la capa sin saberlo.
   - ACCIONES: Elegir todo (Ctrl+A) · Elegir toda la capa (Ctrl+Shift+A).

   Es lo mismo que la barra de opciones de arriba (seleccion-opciones.js): los
   dos se mantienen al día con el evento «low:seleccion-cambio». */
(function (global) {
  "use strict";
  const doc = global.document;
  const D = () => (typeof DZ !== "undefined" ? DZ : null);
  const opc = () => global.LOW && global.LOW.drawing && global.LOW.drawing.seleccionOpciones;

  const HERRAMIENTAS = [
    { tipo: "rect", icono: "i-cursor", nombre: "Selección con rectángulo", tecla: "V" },
    { tipo: "lazo", icono: "i-sel-lazo", nombre: "Selección con lazo" },
    { tipo: "poligono", icono: "i-sel-poligono", nombre: "Selección con polígono" },
    { tipo: "color", icono: "i-sel-color", nombre: "Selección por mismo color" },
    { tool: "direct", icono: "i-cursor-open", nombre: "Selección directa (dentro de grupos)", tecla: "D" },
  ];
  const ALCANCES = [
    { alcance: "dibujo", nombre: "Sólo este dibujo" },
    { alcance: "cuadros", nombre: "Cuadros elegidos en la línea de tiempo" },
    { alcance: "capa", nombre: "Toda la capa (todos los cuadros)" },
  ];
  const ACCIONES = [
    { act: "todo", icono: "i-cursor", nombre: "Elegir todo el dibujo", tecla: "Ctrl+A" },
    { act: "capa", icono: "i-sel-capa", nombre: "Elegir toda la capa y transformarla", tecla: "Ctrl+Shift+A" },
  ];

  let boton = null, menu = null, mantener = 0;

  function abrir() {
    if (!boton || !menu) return;
    pintarMenu();
    const r = boton.getBoundingClientRect();
    menu.hidden = false;
    const alto = menu.offsetHeight;
    menu.style.left = (r.right + 6) + "px";
    menu.style.top = Math.max(6, Math.min(global.innerHeight - alto - 6, r.top - 5)) + "px";
    const activo = menu.querySelector("button.on") || menu.querySelector("button");
    try { activo && activo.focus({ preventScroll: true }); } catch (_) { /* */ }
  }
  const cerrar = () => { if (menu) menu.hidden = true; };

  function pintarMenu() {
    const o = opc(); if (!o || !menu) return;
    const tool = D()?.tool || "select", p = o.prefs;
    const fila = (attrs, icono, nombre, tecla, on, check) => `<button type="button" role="menuitem" ${attrs}${on ? ' class="on" aria-checked="true"' : ""}>` +
      (check ? `<span class="sel-check">${on ? "✓" : ""}</span>` : `<svg class="ico"><use href="#${icono}"/></svg>`) +
      `<span>${nombre}</span>${tecla ? `<kbd>${tecla}</kbd>` : "<span></span>"}</button>`;
    menu.innerHTML = "<h4>Herramientas de selección</h4>" +
      HERRAMIENTAS.map((h) => fila(h.tool ? `data-tool-sel="${h.tool}"` : `data-tipo="${h.tipo}"`, h.icono, h.nombre, h.tecla,
        h.tool ? tool === h.tool : (tool === "select" && p.tipo === h.tipo))).join("") +
      "<hr><h4>Mover, escalar y girar en…</h4>" +
      ALCANCES.map((a) => fila(`data-alcance="${a.alcance}"`, "", a.nombre, "", p.alcance === a.alcance, true)).join("") +
      "<hr>" + ACCIONES.map((a) => fila(`data-accion="${a.act}"`, a.icono, a.nombre, a.tecla, false)).join("");
  }

  /** El ícono y el punto naranja del botón: qué selección está en uso. */
  function pintarBoton() {
    const o = opc(); if (!o || !boton) return;
    const h = HERRAMIENTAS.find((x) => x.tipo === o.prefs.tipo) || HERRAMIENTAS[0];
    const use = boton.querySelector("svg use");
    if (use && use.getAttribute("href") !== "#" + h.icono) use.setAttribute("href", "#" + h.icono);
    const badge = boton.querySelector(".dz-sel-badge");
    if (badge) {
      badge.hidden = o.prefs.alcance === "dibujo";
      badge.title = o.prefs.alcance === "capa" ? "Lo que se mueva va a toda la capa" : o.prefs.alcance === "cuadros" ? "Lo que se mueva va a los cuadros elegidos" : "";
    }
    boton.setAttribute("aria-label", h.nombre + (o.prefs.alcance === "capa" ? " · toda la capa" : o.prefs.alcance === "cuadros" ? " · cuadros elegidos" : ""));
  }

  function elegir(e) {
    const b = e.target.closest("button"); if (!b) return;
    const o = opc(); if (!o) return;
    cerrar();
    if (b.dataset.tipo) o.ponerTipo(b.dataset.tipo);
    else if (b.dataset.toolSel) global.dzSetTool?.(b.dataset.toolSel);
    else if (b.dataset.alcance) o.ponerAlcance(b.dataset.alcance);
    else if (b.dataset.accion === "todo") o.elegirTodo();
    else if (b.dataset.accion === "capa") o.elegirCapaEntera();
    pintarBoton();
  }

  function teclaMenu(e) {
    if (!menu || menu.hidden) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cerrar(); boton?.focus(); return; }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); e.stopPropagation();
      const bs = [...menu.querySelectorAll("button")], i = bs.indexOf(doc.activeElement);
      const j = (i + (e.key === "ArrowDown" ? 1 : -1) + bs.length) % bs.length;
      bs[j].focus();
    }
  }

  function enganchar() {
    boton = doc.querySelector('.dz-tools [data-tool="select"]');
    const vista = doc.getElementById("designView");
    if (!boton || !vista || !opc()) return;
    menu = doc.createElement("div");
    menu.className = "dz-sel-menu"; menu.id = "dzSelMenu"; menu.hidden = true;
    menu.setAttribute("role", "menu"); menu.setAttribute("aria-label", "Herramientas de selección");
    vista.appendChild(menu);
    menu.addEventListener("click", elegir);
    menu.addEventListener("keydown", teclaMenu);
    // la flechita de la esquina sólo abre la lista (no cambia de herramienta)
    boton.addEventListener("click", (e) => { if (e.target.closest(".dz-sel-caret")) { e.stopPropagation(); clearTimeout(mantener); abrir(); } }, true);
    // mantener pulsado, como en Toon Boom
    boton.addEventListener("pointerdown", (e) => { if (e.button !== 0) return; clearTimeout(mantener); mantener = setTimeout(abrir, 320); });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) boton.addEventListener(ev, () => clearTimeout(mantener));
    boton.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); abrir(); });
    doc.addEventListener("pointerdown", (e) => { if (menu && !menu.hidden && !menu.contains(e.target) && !boton.contains(e.target)) cerrar(); }, true);
    doc.addEventListener("low:seleccion-cambio", () => { pintarBoton(); if (!menu.hidden) pintarMenu(); });
    pintarBoton();
  }

  global.LOW = global.LOW || {};
  global.LOW.drawing = global.LOW.drawing || {};
  global.LOW.drawing.seleccionGrupo = { abrir, cerrar, HERRAMIENTAS, ALCANCES };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})(typeof window !== "undefined" ? window : globalThis);
