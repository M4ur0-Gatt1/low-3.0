/* ══════════════════════════════════════════════════════════════════════════
   LA MANO SE VE

   Reporte de Mauro (oct-2026): «muchas veces cuando aprieto la barra
   espaciadora para navegar con la manito, el ícono de la mano no aparece, lo
   que es bastante confuso».

   MEDIDO: el espacio ponía `cursor: grab` en el estilo de #dzCanvas, pero
   - con el Pincel, el Lápiz, la Goma, el Balde y las demás herramientas con
     cursor propio, una regla `cursor: none !important` (app.css, la que deja
     ver el anillo de la herramienta) le ganaba: no había mano NINGUNA y
     seguía el anillo del pincel;
   - con la Flecha, los trazos tienen su propio cursor por CSS y el del lienzo
     no los alcanzaba;
   - si la ventana perdía el foco con el espacio apretado, el «soltar» no
     llegaba nunca y la mano quedaba pegada.

   Acá: mientras el espacio está apretado, el lienzo lleva la clase `mano`
   (agarrando, `mano-agarra`), y el CSS la impone a todo lo que hay adentro;
   el anillo de la herramienta se esconde. Al perder el foco, se suelta.

   @module drawing/mano
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const doc = global.document;
  const lienzo = () => doc.querySelector("#dzCanvas");
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const escribiendo = (t) => /^(INPUT|TEXTAREA|SELECT)$/.test((t && t.tagName) || "") || !!(t && t.isContentEditable);

  function poner(clase, si) { const c = lienzo(); if (c) c.classList.toggle(clase, !!si); }
  function soltar() {
    poner("mano", false); poner("mano-agarra", false);
    const d = dz(); if (d && d.spaceDown) d.spaceDown = false;
  }

  doc.addEventListener("keydown", (e) => {
    if (e.code !== "Space" || escribiendo(e.target) || doc.querySelector("#designView")?.hidden) return;
    poner("mano", true);
  });
  doc.addEventListener("keyup", (e) => { if (e.code === "Space") { poner("mano", false); poner("mano-agarra", false); } });
  global.addEventListener("blur", soltar);
  doc.addEventListener("visibilitychange", () => { if (doc.hidden) soltar(); });

  // agarrando: espacio, botón del medio o la herramienta Mano
  doc.addEventListener("pointerdown", (e) => {
    const c = lienzo(), d = dz();
    if (!c || !d || !c.contains(e.target)) return;
    if (d.spaceDown || e.button === 1 || d.tool === "hand") poner("mano-agarra", true);
  }, true);
  const fin = () => poner("mano-agarra", false);
  doc.addEventListener("pointerup", fin, true);
  doc.addEventListener("pointercancel", fin, true);

  global.LOW = global.LOW || {};
  global.LOW.mano = { soltar };
})(typeof window !== "undefined" ? window : globalThis);
