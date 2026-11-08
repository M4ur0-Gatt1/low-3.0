/* ══════════════════════════════════════════════════════════════════════════
   MODIFICADORES DE CAPA (los «modifiers» de Grease Pencil, sin destruir)

   Pedido de Mauro (nov-2026): lo que Blender trae para animación 2D. Un
   modificador cambia CÓMO SE VE una capa sin tocar sus dibujos: se saca y la
   capa vuelve a ser la de antes. Se apilan en el orden de la lista.

     · TIEMPO (Time Offset): la capa muestra otro cuadro de sí misma —
       desfasada, en bucle, de ida y vuelta, al revés o clavada en uno—. Un
       ciclo de caminata para una multitud sin duplicar celdas.
     · TEMBLOR (Noise / «boil»): la línea tiembla un poco y cambia cada N
       cuadros, como el dibujo hecho a mano que nunca queda quieto.
     · SE DIBUJA SOLO (Build): en un tramo de cuadros, los trazos aparecen
       uno tras otro, en el orden en que se dibujaron.

   Como el movimiento de capa: se aplican en la mesa a las OTRAS capas, al
   reproducir y al exportar. La capa que se está dibujando se ve como es, para
   editar lo que de verdad hay. Lo puro de este archivo (qué cuadro, qué
   semilla, cuántos trazos) se prueba sin la app.

   @module animation/modificadores
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const animation = (global.LOW = global.LOW || {}).animation = global.LOW.animation || {};

  // los EFECTOS (los «Shader FX» de Grease Pencil) van en la misma lista: se
  // arman, junto con el temblor, como UN filtro SVG por capa (filtroCapa)
  const EFECTOS = ["desenfoque", "sombra", "resplandor", "colorear"];
  const TIPOS = ["tiempo", "temblor", "trazado", ...EFECTOS];
  const color = (v, def) => (typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v : def);
  const MODOS_TIEMPO = ["normal", "bucle", "ida-vuelta", "invertido", "fijo"];
  const entero = (v, a, b, def) => (Number.isFinite(Number(v)) ? Math.max(a, Math.min(b, Math.round(Number(v)))) : def);
  const real = (v, a, b, def) => (Number.isFinite(Number(v)) ? Math.max(a, Math.min(b, Number(v))) : def);

  /** Normaliza la lista de modificadores de una capa. [] si no hay. */
  function modsData(d) {
    return (Array.isArray(d) ? d : []).filter((m) => m && TIPOS.includes(m.tipo)).slice(0, 12).map((m) => {
      const activo = m.activo !== false;
      if (m.tipo === "tiempo") return { tipo: "tiempo", activo, modo: MODOS_TIEMPO.includes(m.modo) ? m.modo : "normal",
        desfase: entero(m.desfase, -100000, 100000, 0), desde: entero(m.desde, 1, 100000, 1), hasta: entero(m.hasta, 1, 100000, 24),
        fijo: entero(m.fijo, 1, 100000, 1) };
      if (m.tipo === "temblor") return { tipo: "temblor", activo, amplitud: real(m.amplitud, 0, 80, 3), cada: entero(m.cada, 1, 24, 2),
        escala: real(m.escala, 0.001, 0.5, 0.03), semilla: entero(m.semilla, 0, 9999, 1) };
      if (m.tipo === "trazado") return { tipo: "trazado", activo, desde: entero(m.desde, 1, 100000, 1), hasta: entero(m.hasta, 1, 100000, 24) };
      if (m.tipo === "desenfoque") return { tipo: "desenfoque", activo, radio: real(m.radio, 0, 100, 4) };
      if (m.tipo === "sombra") return { tipo: "sombra", activo, dx: real(m.dx, -500, 500, 8), dy: real(m.dy, -500, 500, 8),
        radio: real(m.radio, 0, 100, 4), color: color(m.color, "#000000"), opacidad: real(m.opacidad, 0, 1, 0.5) };
      if (m.tipo === "resplandor") return { tipo: "resplandor", activo, radio: real(m.radio, 0, 100, 10), color: color(m.color, "#ffd76a"),
        intensidad: real(m.intensidad, 0, 1, 0.8) };
      return { tipo: "colorear", activo, color: color(m.color, "#3a6ea5"), cantidad: real(m.cantidad, 0, 1, 1) };
    });
  }

  /** EL FILTRO DE LA CAPA en ese cuadro: el temblor y los efectos, en el
   *  orden de la lista. Mismo texto en la mesa y en el export. null si la
   *  capa no tiene ninguno prendido. */
  function filtroCapa(id, mods, frame) {
    const lista = (mods || []).filter((m) => m.activo !== false && (m.tipo === "temblor" || EFECTOS.includes(m.tipo)));
    if (!lista.length) return null;
    let prev = "SourceGraphic", n = 0, cuerpo = "";
    const r = () => "r" + (++n);
    for (const m of lista) {
      if (m.tipo === "temblor") {
        const t = temblorEn([m], frame);
        if (!t) continue;
        const ru = r(), o = r();
        cuerpo += `<feTurbulence type="fractalNoise" baseFrequency="${+t.escala.toFixed(4)}" numOctaves="2" seed="${t.semilla}" result="${ru}"/>` +
          `<feDisplacementMap in="${prev}" in2="${ru}" scale="${+t.amplitud.toFixed(2)}" xChannelSelector="R" yChannelSelector="G" result="${o}"/>`;
        prev = o;
      } else if (m.tipo === "desenfoque") {
        const o = r();
        cuerpo += `<feGaussianBlur in="${prev}" stdDeviation="${+m.radio.toFixed(2)}" result="${o}"/>`;
        prev = o;
      } else if (m.tipo === "colorear") {
        const fl = r(), si = r(), o = r();
        cuerpo += `<feFlood flood-color="${m.color}" result="${fl}"/><feComposite in="${fl}" in2="${prev}" operator="in" result="${si}"/>` +
          `<feComposite in="${prev}" in2="${si}" operator="arithmetic" k1="0" k2="${+(1 - m.cantidad).toFixed(3)}" k3="${+m.cantidad.toFixed(3)}" k4="0" result="${o}"/>`;
        prev = o;
      } else {
        // sombra y resplandor: la silueta borroneada, teñida, DEBAJO de lo que había
        const sombra = m.tipo === "sombra";
        const bl = r(), of = r(), fl = r(), ti = r(), o = r();
        cuerpo += `<feGaussianBlur in="${prev}" stdDeviation="${+m.radio.toFixed(2)}" result="${bl}"/>` +
          `<feOffset in="${bl}" dx="${sombra ? +m.dx.toFixed(2) : 0}" dy="${sombra ? +m.dy.toFixed(2) : 0}" result="${of}"/>` +
          `<feFlood flood-color="${m.color}" flood-opacity="${+(sombra ? m.opacidad : m.intensidad).toFixed(3)}" result="${fl}"/>` +
          `<feComposite in="${fl}" in2="${of}" operator="in" result="${ti}"/>` +
          `<feMerge result="${o}"><feMergeNode in="${ti}"/>${sombra ? "" : `<feMergeNode in="${ti}"/>`}<feMergeNode in="${prev}"/></feMerge>`;
        prev = o;
      }
    }
    if (!cuerpo) return null;
    // la región se agranda para que la sombra, el resplandor y el temblor no se corten
    return `<filter id="${id}" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">${cuerpo}</filter>`;
  }
  const activos = (mods, tipo) => (mods || []).filter((m) => m.activo !== false && m.tipo === tipo);

  /** TIEMPO: el cuadro de la capa que se muestra en `frame`. Se encadenan en
   *  el orden de la lista. El tramo [desde, hasta] es el que se repite. */
  function cuadroFuente(mods, frame) {
    let f = Math.round(Number(frame) || 1);
    for (const m of activos(mods, "tiempo")) {
      const a = Math.min(m.desde, m.hasta), b = Math.max(m.desde, m.hasta), n = b - a + 1;
      const g = f + m.desfase;
      if (m.modo === "fijo") f = m.fijo;
      else if (m.modo === "normal") f = g;
      else if (m.modo === "bucle") f = a + ((((g - a) % n) + n) % n);
      else if (m.modo === "invertido") f = b - ((((g - a) % n) + n) % n);
      else {                                   // ida y vuelta: a … b … a … (sin repetir las puntas)
        const p = Math.max(1, 2 * (n - 1)), k = (((g - a) % p) + p) % p;
        f = a + (k < n ? k : p - k);
      }
      f = Math.max(1, f);
    }
    return f;
  }

  /** TEMBLOR: la semilla del ruido en ese cuadro (cambia cada `cada`
   *  cuadros: «en dos» tiembla en dos). null si no tiembla. */
  function temblorEn(mods, frame) {
    const t = activos(mods, "temblor")[0];
    if (!t || !(t.amplitud > 0)) return null;
    return { amplitud: t.amplitud, escala: t.escala, semilla: t.semilla * 97 + Math.floor((Math.max(1, frame) - 1) / t.cada) };
  }
  /** El <filter> del temblor (mismo texto en la mesa y en el export). */
  function filtroTemblor(id, t) {
    return `<filter id="${id}" x="-5%" y="-5%" width="110%" height="110%" filterUnits="objectBoundingBox">` +
      `<feTurbulence type="fractalNoise" baseFrequency="${+t.escala.toFixed(4)}" numOctaves="2" seed="${t.semilla}" result="ruido"/>` +
      `<feDisplacementMap in="SourceGraphic" in2="ruido" scale="${+t.amplitud.toFixed(2)}" xChannelSelector="R" yChannelSelector="G"/></filter>`;
  }

  /** SE DIBUJA SOLO: cuántos de `total` trazos se ven en `frame`. null si
   *  no hay modificador (se ven todos). Antes del tramo, ninguno; después,
   *  todos. */
  function trazosVisibles(mods, frame, total) {
    const m = activos(mods, "trazado")[0];
    if (!m) return null;
    const a = Math.min(m.desde, m.hasta), b = Math.max(m.desde, m.hasta);
    if (frame < a) return 0;
    if (frame >= b) return total;
    return Math.min(total, Math.floor(((frame - a + 1) / (b - a + 1)) * total));
  }

  /** Aplica «se dibuja solo» a un contenedor con el dibujo (DOM): esconde los
   *  trazos que todavía no aparecieron. Cuenta las HOJAS de los grupos de
   *  línea y color (los trazos), en orden. Devuelve cuántos ve. */
  function aplicarTrazado(g, mods, frame) {
    const hojas = [...g.querySelectorAll('[data-low-art] > *, [data-low-art] g > *')].filter((n) => !n.children.length);
    const n = trazosVisibles(mods, frame, hojas.length);
    hojas.forEach((h, i) => { if (n == null || i < n) h.removeAttribute("visibility"); else h.setAttribute("visibility", "hidden"); });
    return n == null ? hojas.length : n;
  }

  /** ¿La capa tiene algún modificador que cambie cómo se ve? */
  const tieneMods = (ly) => !!(ly && ly.mods && ly.mods.some((m) => m.activo !== false));

  animation.modificadores = { TIPOS, EFECTOS, MODOS_TIEMPO, modsData, cuadroFuente, temblorEn, filtroTemblor, filtroCapa, trazosVisibles, aplicarTrazado, tieneMods };
})(typeof window !== "undefined" ? window : globalThis);
