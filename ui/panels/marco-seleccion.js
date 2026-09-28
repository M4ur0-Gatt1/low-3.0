/* ══════════════════════════════════════════════════════════════════════════
   EL MARCO DE SELECCIÓN — saber QUÉ está seleccionado, de un vistazo

   Reportado: «la selección en grupo es muy poco satisfactoria, no se sabe si
   uno seleccionó todo o sólo una pieza; debe ser clara la gráfica al respecto,
   como en Illustrator».

   MEDIDO ANTES DE TOCAR NADA, con cinco piezas en la hoja:

     una pieza      →  1 clase `.dz-sel`, sin recuadro, sin texto
     TRES piezas    →  NINGUNA clase, sin recuadro, sin texto
     un grupo       →  1 clase `.dz-sel`, sin recuadro, sin texto

   O sea: con tres piezas seleccionadas la pantalla se ve **igual que sin nada
   seleccionado**, y una pieza se ve **igual que un grupo entero**. No es que
   la gráfica sea poco clara: en el caso de varias, no hay gráfica.

   Lo que hace este módulo, que es lo que hace Illustrator:

   1. Un MARCO alrededor de todo lo seleccionado, así se ve el alcance.
   2. Cada pieza marcada por separado, así se ve qué entró y qué no.
   3. El marco DICE de qué se trata: una pieza, varias (con el número), o un
      grupo. Un grupo y tres piezas sueltas no son lo mismo y no pueden verse
      igual: en uno movés el conjunto, en el otro movés tres cosas.

   El marco es un div sobre el lienzo, NO un elemento adentro del SVG: lo que
   se dibuja adentro del SVG termina en el archivo guardado.

   @module panels/marco-seleccion
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const panels = LOW.panels = LOW.panels || {};
  const estado = () => (typeof DZ !== "undefined") ? DZ : null;

  const ID = "dzSelMarco";
  let pedido = 0;

  function caja() {
    let n = document.getElementById(ID);
    if (n) return n;
    const cv = document.querySelector("#dzCanvas");
    if (!cv) return null;
    n = document.createElement("div");
    n.id = ID;
    n.className = "dz-selmarco";
    n.hidden = true;
    n.innerHTML = '<i class="dz-selmarco-et"></i>';
    cv.appendChild(n);
    return n;
  }

  /** Lo que está seleccionado ahora, como lista de elementos vivos. */
  function seleccionados() {
    const DZ = estado();
    if (!DZ) return [];
    const varios = (DZ.multi || []).filter((n) => n && n.isConnected);
    if (varios.length) return varios;
    return (DZ.sel && DZ.sel.isConnected) ? [DZ.sel] : [];
  }

  /** ¿Es un grupo? Un `g` con hijos dibujados es «el conjunto», y moverlo
   *  mueve todo lo de adentro: merece decirse distinto que tres piezas. */
  const esGrupo = (el) => !!el && el.tagName && el.tagName.toLowerCase() === "g" &&
    el.querySelectorAll("path,rect,circle,ellipse,polygon,line,polyline,text,image").length > 1;

  function union(elementos) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const el of elementos) {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;
      x1 = Math.min(x1, r.left); y1 = Math.min(y1, r.top);
      x2 = Math.max(x2, r.right); y2 = Math.max(y2, r.bottom);
    }
    if (!isFinite(x1)) return null;
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }

  function texto(elementos) {
    if (elementos.length > 1) return elementos.length + " piezas";
    const el = elementos[0];
    if (esGrupo(el)) {
      const n = el.querySelectorAll("path,rect,circle,ellipse,polygon,line,polyline,text,image").length;
      return "grupo · " + n + " piezas";
    }
    return "1 pieza";
  }

  /** Dibuja el marco y marca cada pieza. */
  function dibujar() {
    const marco = caja();
    if (!marco) return;
    const elegidos = seleccionados();
    // la marca por pieza: se ve QUÉ entró, no sólo cuánto
    const cv = document.querySelector("#dzCanvas");
    const hoja = cv && cv.querySelector(":scope > svg");
    if (hoja) hoja.querySelectorAll(".dz-msel").forEach((n) => n.classList.remove("dz-msel"));
    if (!elegidos.length) { marco.hidden = true; return; }
    if (elegidos.length > 1) elegidos.forEach((n) => n.classList && n.classList.add("dz-msel"));

    const u = union(elegidos);
    if (!u) { marco.hidden = true; return; }
    const cvr = cv.getBoundingClientRect();
    Object.assign(marco.style, {
      left: (u.x - cvr.left + cv.scrollLeft - 2) + "px",
      top: (u.y - cvr.top + cv.scrollTop - 2) + "px",
      width: (u.w + 4) + "px",
      height: (u.h + 4) + "px",
    });
    const grupo = elegidos.length === 1 && esGrupo(elegidos[0]);
    marco.classList.toggle("varias", elegidos.length > 1);
    marco.classList.toggle("grupo", grupo);
    const et = marco.querySelector(".dz-selmarco-et");
    if (et) et.textContent = texto(elegidos);
    marco.hidden = false;
  }

  /** Se junta por cuadro: `dzSelect` se llama varias veces en un mismo gesto. */
  function pronto() {
    if (pedido) return;
    pedido = global.requestAnimationFrame(() => {
      pedido = 0;
      try { dibujar(); } catch (_) { /* el marco no puede tumbar la selección */ }
    });
  }

  /** Envuelve las funciones de selección que ya existen. `app.js` no cambia:
   *  está justo en el techo del presupuesto de §12. */
  function envolver() {
    let puestas = 0;
    for (const nombre of ["dzSelect", "dzDeselect", "dzClearMulti"]) {
      const original = global[nombre];
      if (typeof original !== "function" || original.__conMarco) continue;
      const envuelta = function (...args) {
        const r = original.apply(this, args);
        pronto();
        return r;
      };
      envuelta.__conMarco = true;
      global[nombre] = envuelta;
      puestas++;
    }
    return puestas;
  }

  panels.marcoSeleccion = { dibujar, pronto, envolver, seleccionados, esGrupo, texto, ID };
  global.dzMarcoSeleccion = pronto;

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", envolver, { once: true });
  else envolver();
})(window);
