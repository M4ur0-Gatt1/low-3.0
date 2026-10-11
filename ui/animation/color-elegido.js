/* ══════════════════════════════════════════════════════════════════════════
   EL COLOR QUE ELEGÍS ES EL COLOR CON QUE QUEDA

   Reporte de Mauro (oct-2026, LOW 3.17): «no estoy pudiendo cambiar los
   colores del contorno de lo que dibujo… mientras dibujo muestra el color que
   elijo, pero al terminarlo se pone negro».

   Medido: en un .low el trazo terminado lleva su color (stroke="#e01010") y
   ADEMÁS el número del estilo activo de la paleta (data-stk="1"). La hoja de
   la paleta pinta el estilo 1 —negro— por encima, y el CSS le gana al
   atributo. El selector «Trazo» cambiaba `DZ.drawColor` (lo que se ve en vivo)
   pero no el estilo activo. Lo mismo al recolorear algo ya dibujado: el color
   se escribía y el estilo 1 seguía mandando.

   La regla, la de Toon Boom y OpenToonz: el color que elegís con un selector
   (Trazo o Relleno, en la barra o en el panel) PASA A SER un estilo de la
   paleta —el que ya tiene ese color, o uno nuevo «Color N»— y queda activo.
     · Un trazo nuevo sale con ese estilo, y se ve del color elegido.
     · Con algo elegido en la mesa, se recolorea a ese estilo: mientras se
       arrastra el selector se ve en vivo, y al soltarlo queda el estilo.
     · Arrastrar el selector no llena la paleta de colores intermedios: se
       resuelve una vez, al soltarlo (o al dibujar).
     · Recolorear un estilo DESDE la paleta sigue siendo lo de siempre: cambia
       todo lo que usa ese estilo. Elegir un estilo de la paleta deja sin
       efecto un color elegido antes con el selector.

   @module animation/color-elegido
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const SELECTORES = { ink: ["toColor", "dzPStroke"], paint: ["toFill", "dzPFill"] };
  const pendiente = { ink: null, paint: null };
  const tocados = new Set();          // lo elegido que se está recoloreando en vivo
  let reloj = null;

  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const hex = (c) => { const m = /^#?([0-9a-f]{6})$/i.exec(String(c || "").trim()); return m ? "#" + m[1].toLowerCase() : null; };
  const papelDe = (id) => (SELECTORES.ink.includes(id) ? "ink" : SELECTORES.paint.includes(id) ? "paint" : null);
  const A = () => (global.LOW && LOW.animation && LOW.animation.palette && LOW.animation.palette.ATTR) || { ink: "data-stk", paint: "data-fil" };
  /** La cinta del pincel es LÍNEA aunque se pinte con relleno. */
  const esCinta = (el) => !!(el && el.getAttribute && (el.getAttribute("data-low") === "brush" || el.hasAttribute("data-low-brush-color")));

  /** El estilo de la paleta para ese color: el que ya lo tiene, o uno nuevo. */
  function estiloPara(color) {
    const D = dz(), doc = D && D.doc, pal = doc && doc.palette;
    const c = hex(color);
    if (!pal || !c) return null;
    let st = pal.byColor(c);
    if (!st && !pal.locked) st = doc.addStyle(c, "Color " + pal.nextIndex());
    return st || null;
  }

  /** Lo pendiente de un papel pasa a ser su estilo activo. */
  function resolver(papel) {
    const D = dz(), color = pendiente[papel];
    if (!D || !color) return null;
    pendiente[papel] = null;
    // si después se eligió un estilo de la paleta, manda ése (el color del lápiz ya es otro)
    const actual = hex(papel === "paint" ? D.fillColor : D.drawColor);
    if (actual && actual !== color) return null;
    const st = estiloPara(color);
    if (!st) return null;
    if (!D.palStyles) D.palStyles = { ink: null, paint: null };
    D.palStyles[papel] = st.index;
    D.palStyle = st.index;
    try { if (D.palView) { D.palView.current = st.index; D.palView.render(); } } catch (_) { /* sin vista */ }
    return st;
  }

  /** Lo elegido en la mesa queda con el estilo del color elegido. */
  function asentar() {
    clearTimeout(reloj); reloj = null;
    if (!tocados.size) return;
    const AT = A(), cambios = [];
    for (const [el, papel, color] of tocados) {
      if (!el.isConnected) continue;
      const st = estiloPara(color);
      if (!st) continue;
      el.setAttribute(papel === "paint" ? AT.paint : AT.ink, String(st.index));
      cambios.push(st.index);
    }
    tocados.clear();
    if (cambios.length && typeof global.dzMarkDirty === "function") global.dzMarkDirty();
    try { if (typeof global.dzPalCssRender === "function") global.dzPalCssRender(); } catch (_) { /* sin hoja */ }
  }

  /* Los selectores: anotar el color elegido. «change» llega al soltar (o al
     cerrar el diálogo de color): ahí se resuelve el estilo. */
  document.addEventListener("input", (e) => {
    const papel = e.target && papelDe(e.target.id);
    if (papel) pendiente[papel] = hex(e.target.value);
  }, true);
  document.addEventListener("change", (e) => {
    const papel = e.target && papelDe(e.target.id);
    if (!papel) return;
    pendiente[papel] = hex(e.target.value);
    resolver(papel);
    asentar();
  }, true);

  /* Al dibujar: el trazo nuevo se marca con el estilo activo. Si hay un color
     elegido sin resolver (el selector todavía abierto), se resuelve antes. */
  function envolverActual() {
    const orig = global.dzPalActual;
    if (typeof orig !== "function" || orig.__colorElegido) return false;
    const env = function (papel, ...resto) {
      const p = papel === "paint" ? "paint" : "ink";
      if (pendiente[p]) resolver(p);
      return orig.call(this, papel, ...resto);
    };
    env.__colorElegido = true;
    global.dzPalActual = env;
    return true;
  }

  /* Recolorear lo elegido: el original escribe el atributo, pero el número
     de estilo seguía mandando. Mientras se arrastra, el elemento suelta su
     estilo (se ve el color en vivo); al soltar queda el estilo nuevo. */
  function envolverAplicar() {
    const orig = global.dzStyleApply;
    if (typeof orig !== "function" || orig.__colorElegido) return false;
    const env = function (attr, val, ...resto) {
      const D = dz();
      const pack = D ? ((D.multi || []).length > 1 ? D.multi : (D.sel ? [D.sel] : [])) : [];
      const color = hex(val);
      const r = orig.call(this, attr, val, ...resto);
      if (!r || !color || !(attr === "stroke" || attr === "fill") || !(D && D.doc)) return r;
      const AT = A();
      for (const el of pack) {
        if (!el || !el.setAttribute) continue;
        let papel = attr === "fill" ? "paint" : "ink";
        if (attr === "stroke" && esCinta(el)) {
          // la línea del pincel es su relleno: el trazo de color va ahí, no un contorno nuevo
          el.removeAttribute("stroke");
          el.setAttribute("fill", color);
          el.setAttribute("data-low-brush-color", color);
          el.removeAttribute(AT.paint);
          papel = "paint";
        } else {
          el.removeAttribute(papel === "paint" ? AT.paint : AT.ink);
        }
        for (const t of tocados) if (t[0] === el && t[1] === papel) tocados.delete(t);
        tocados.add([el, papel, color]);
      }
      // si no llega el «change» (un selector programático), igual se asienta
      clearTimeout(reloj); reloj = setTimeout(asentar, 600);
      return r;
    };
    env.__colorElegido = true;
    global.dzStyleApply = env;
    return true;
  }

  function arrancar() { envolverActual(); envolverAplicar(); }
  global.LOW = global.LOW || {};
  LOW.colorElegido = { pendiente, resolver, asentar, estiloPara };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar, { once: true });
  else arrancar();
})(window);
