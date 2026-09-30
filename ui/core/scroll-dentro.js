/* ══════════════════════════════════════════════════════════════════════════
   DEJAR ALGO A LA VISTA SIN MOVER EL RESTO DE LA PANTALLA

   `scrollIntoView` desplaza TODOS los contenedores con scroll que tenga
   encima, no sólo la lista a la que pertenece. La X-sheet y la tira de dibujos
   lo llamaban en cada repintado para mostrar la celda actual, y con eso
   arrastraban el panel lateral entero:
   - MEDIDO en v3.0.1: a mitad del arrastre de un fader del papel cebolla,
     #dzAnimationDock saltaba 0 → 387 px, el fader agarrado quedaba fuera de
     la pantalla y el puntero movía otro canal;
   - al abrir el papel cebolla, el panel quedaba con el mezclador ARRIBA,
     fuera de la vista (el dock bajado 179 px para mostrar la celda de la
     X-sheet).
   Reportado: «cuando quiero hacer clic se scrollea el sidebar».

   Esto hace lo mismo que `block/inline: "nearest"` pero SÓLO en el contenedor
   con scroll más cercano. Lo de afuera no se toca.

   @module core/scroll-dentro
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const core = LOW.core = LOW.core || {};

  const puedeY = (n, cs) => /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1;
  const puedeX = (n, cs) => /(auto|scroll)/.test(cs.overflowX) && n.scrollWidth > n.clientWidth + 1;

  /** El contenedor con scroll más cercano en cada eje (pueden ser distintos). */
  function contenedores(el, limite) {
    let y = null, x = null;
    for (let n = el && el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement) {
      // `limite`: no salir del propio componente. Una X-sheet sin scroll propio
      // tiene como «más cercano» al panel lateral, y eso es justo lo que no hay
      // que mover.
      if (limite && !limite.contains(n)) break;
      const cs = getComputedStyle(n);
      if (!y && puedeY(n, cs)) y = n;
      if (!x && puedeX(n, cs)) x = n;
      if (x || y) break;          // sólo el MÁS cercano: el primero que scrollee en algún eje
    }
    return { x, y };
  }

  function scrollDentro(el, { block = "nearest", inline = "nearest", limite = null } = {}) {
    if (!el || !el.getBoundingClientRect) return false;
    const { x, y } = contenedores(el, limite);
    const r = el.getBoundingClientRect();
    let movio = false;
    if (y && block) {
      const b = y.getBoundingClientRect();
      if (r.top < b.top) { y.scrollTop -= (b.top - r.top); movio = true; }
      else if (r.bottom > b.bottom) { y.scrollTop += Math.min(r.bottom - b.bottom, r.top - b.top); movio = true; }
    }
    if (x && inline) {
      const b = x.getBoundingClientRect();
      if (r.left < b.left) { x.scrollLeft -= (b.left - r.left); movio = true; }
      else if (r.right > b.right) { x.scrollLeft += Math.min(r.right - b.right, r.left - b.left); movio = true; }
    }
    return movio;
  }

  core.scrollDentro = scrollDentro;
})(typeof window !== "undefined" ? window : globalThis);
