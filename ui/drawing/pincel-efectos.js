/* ══════════════════════════════════════════════════════════════════════════
   TEXTURAS Y EFECTOS DE LOS PINCELES

   Pedido de Mauro (oct-2026): «mejoremos los pinceles, aumentemos la
   variedad… quiero pinceles de efectos y de texturas».

   LO QUE HABÍA, MEDIDO: el campo `texture` de los pinceles vectoriales no se
   usaba —el «Lápiz de animación» decía `graphite` y salía liso—, y en los
   raster la «textura» era variar el tamaño de cada sello según su número de
   orden. No había grano de papel, ni acuarela, ni brillo.

   QUÉ HACE ESTE MÓDULO: arma, para un pincel, el <filter> SVG que le da su
   textura o su efecto. Todo es SVG puro —feTurbulence, feDisplacementMap,
   feMorphology, feGaussianBlur—, así que viaja dentro del dibujo, se ve igual
   en la mesa y en el export, y no pesa como una imagen.

   EL GRANO QUEDA FIJO EN LA HOJA (primitiveUnits = espacio del dibujo), como
   el de un papel de verdad: dos trazos que se cruzan comparten el grano, y
   mover el trazo no lo arrastra.

   Y las FORMAS de sello de los pinceles de efectos (destello, pasto, hoja,
   confeti, rayado, punto), en coordenadas de radio 1.

   @module drawing/pincel-efectos
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const drawing = LOW.drawing = LOW.drawing || {};
  const n = (v, d = 3) => (+v).toFixed(d).replace(/\.?0+$/, "") || "0";

  /** Granos: frecuencia (por unidad del dibujo), octavas y cuánto del ruido
   *  corta la tinta (k, b: alfa = k·ruido + b). `dir`: grano estirado (pincel
   *  seco, lienzo). */
  const GRANOS = {
    graphite: { f: .55, oct: 2, k: 2.4, b: -.45, nombre: "Grafito" },
    charcoal: { f: .16, oct: 3, k: 3.2, b: -1.0, nombre: "Carbón" },
    chalk: { f: .26, oct: 3, k: 3.6, b: -1.15, nombre: "Tiza" },
    pastel: { f: .2, oct: 2, k: 2.8, b: -.7, nombre: "Pastel" },
    crayon: { f: .11, oct: 4, k: 4.0, b: -1.4, nombre: "Crayón" },
    paper: { f: .85, oct: 1, k: 1.8, b: -.05, nombre: "Papel" },
    canvas: { f: [.5, .06], oct: 2, k: 2.6, b: -.55, nombre: "Lienzo" },
    dry: { f: [.03, .45], oct: 2, k: 2.6, b: -.55, nombre: "Seco" },
    spray: { f: .9, oct: 1, k: 3.0, b: -1.1, nombre: "Spray" },
    gouache: { f: .4, oct: 2, k: 1.6, b: .1, nombre: "Gouache" },
  };
  /** Bordes: no cortan la tinta, la deforman. */
  const BORDES = { rough: { nombre: "Áspero" }, watercolor: { nombre: "Acuarela" }, wet: { nombre: "Húmedo" } };
  const TEXTURAS = Object.keys(GRANOS).concat(Object.keys(BORDES));

  /** El <filter> de un pincel, o null si es liso y sin efecto. `brush` ya
   *  normalizado (o con sus campos crudos). */
  function filtro(brush, id, caja) {
    const tex = brush && brush.texture, glow = +(brush && brush.glow) || 0;
    const grano = tex && GRANOS[tex], borde = tex && BORDES[tex];
    if (!grano && !borde && !(glow > 0)) return null;
    const size = Math.max(.5, +brush.size || 6);
    const fuerza = Math.max(0, Math.min(1, brush.textureStrength ?? .6));
    const escala = Math.max(.2, Math.min(5, brush.textureScale ?? 1));
    const semilla = ((brush.seed >>> 0) % 97) + 1;
    const pasos = [];
    let entrada = "SourceGraphic";
    if (borde) {
      // ACUARELA/HÚMEDO/ÁSPERO: el borde se ondula (desplazamiento por ruido) y,
      // en la acuarela, el pigmento se junta en el borde (más oscuro) y el centro queda lavado
      const ond = tex === "rough" ? size * .3 : size * (tex === "wet" ? .3 : .32);   // más da un borde dentado, no una mancha de agua
      const fr = tex === "rough" ? .09 / escala : .025 / escala;
      pasos.push(`<feTurbulence type="fractalNoise" baseFrequency="${n(fr, 4)}" numOctaves="3" seed="${semilla}" result="ondas"/>`,
        `<feDisplacementMap in="SourceGraphic" in2="ondas" scale="${n(ond * (.5 + fuerza), 2)}" xChannelSelector="R" yChannelSelector="G" result="ondulado"/>`);
      entrada = "ondulado";
      if (tex !== "rough") {
        const r = Math.max(.6, size * .06);
        pasos.push(`<feMorphology in="ondulado" operator="erode" radius="${n(r, 2)}" result="adentro"/>`,
          `<feComposite in="ondulado" in2="adentro" operator="out" result="borde"/>`,
          `<feComponentTransfer in="ondulado" result="lavado"><feFuncA type="linear" slope="${n(1 - .45 * fuerza)}"/></feComponentTransfer>`,
          `<feMerge result="acuarela"><feMergeNode in="lavado"/><feMergeNode in="borde"/></feMerge>`);
        entrada = "acuarela";
      }
    }
    if (grano) {
      const f = Array.isArray(grano.f) ? grano.f.map((x) => n(x / escala, 4)).join(" ") : n(grano.f / escala, 4);
      const k = fuerza * grano.k, b = 1 - fuerza + fuerza * grano.b;
      pasos.push(`<feTurbulence type="fractalNoise" baseFrequency="${f}" numOctaves="${grano.oct}" seed="${semilla}" result="ruido"/>`,
        `<feColorMatrix in="ruido" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 ${n(k)} 0 0 0 ${n(b)}" result="grano"/>`,
        `<feComposite in="${entrada}" in2="grano" operator="in" result="granulado"/>`);
      entrada = "granulado";
    }
    if (glow > 0) {
      // BRILLO: la tinta desenfocada debajo, dos veces (halo con cuerpo), y la
      // tinta nítida encima. Con `neon`, además un núcleo claro en el centro.
      // un halo cercano con cuerpo y uno lejano y tenue (el «bloom»)
      const sd = Math.max(1, glow * size * .9);
      pasos.push(`<feGaussianBlur in="${entrada}" stdDeviation="${n(sd, 2)}" result="halo"/>`,
        `<feGaussianBlur in="${entrada}" stdDeviation="${n(sd * 2.6, 2)}" result="lejos"/>`,
        `<feComponentTransfer in="lejos" result="bloom"><feFuncA type="linear" slope=".55"/></feComponentTransfer>`);
      // NEÓN: el núcleo es una tinta CLARA del mismo color (no blanco puro) y
      // angosto: el tubo encendido, no un caño blanco con borde
      const nucleo = brush.neon
        ? [`<feMorphology in="${entrada}" operator="erode" radius="${n(Math.max(.4, size * .26), 2)}" result="fino"/>`,
           `<feGaussianBlur in="fino" stdDeviation="${n(Math.max(.3, size * .05), 2)}" result="finoSuave"/>`,
           `<feComponentTransfer in="finoSuave" result="nucleo"><feFuncR type="linear" slope=".25" intercept=".75"/><feFuncG type="linear" slope=".25" intercept=".75"/><feFuncB type="linear" slope=".25" intercept=".75"/></feComponentTransfer>`] : [];
      pasos.push(...nucleo, `<feMerge><feMergeNode in="bloom"/><feMergeNode in="halo"/><feMergeNode in="halo"/><feMergeNode in="${entrada}"/>${brush.neon ? '<feMergeNode in="nucleo"/>' : ""}</feMerge>`);
    }
    // LA REGIÓN DEL FILTRO. En porcentaje de la caja del trazo, un trazo largo y
    // angosto cortaba el halo con un borde recto (medido con «Brillo suave»).
    // Si se conoce la caja, la región va en unidades del dibujo: la caja más
    // lo que alcanza el halo (3 desvíos del desenfoque más ancho).
    if (caja && caja.w > 0 && caja.h > 0) {
      const alcance = glow > 0 ? 3 * Math.max(1, glow * size * .9) * 2.6 + size : borde ? size * 1.5 : size * .5;
      return `<filter id="${id}" filterUnits="userSpaceOnUse" x="${n(caja.x - alcance, 1)}" y="${n(caja.y - alcance, 1)}" width="${n(caja.w + 2 * alcance, 1)}" height="${n(caja.h + 2 * alcance, 1)}" color-interpolation-filters="sRGB">${pasos.join("")}</filter>`;
    }
    const margen = glow > 0 ? 60 : borde ? 25 : 8;
    return `<filter id="${id}" x="-${margen}%" y="-${margen}%" width="${100 + 2 * margen}%" height="${100 + 2 * margen}%" color-interpolation-filters="sRGB">${pasos.join("")}</filter>`;
  }

  /** Formas de sello, radio 1, centradas en 0,0. «Arriba» es -y. */
  const FORMAS = {
    star: "M0 -1 L.2 -.2 L1 0 L.2 .2 L0 1 L-.2 .2 L-1 0 L-.2 -.2 Z",
    blade: "M-.24 1 Q-.12 .1 0 -1 Q.14 .1 .24 1 Z",
    leaf: "M0 -1 C.62 -.52 .62 .52 0 1 C-.62 .52 -.62 -.52 0 -1 Z",
    square: "M-1 -1 H1 V1 H-1 Z",
    line: "M-1 -.07 H1 V.07 H-1 Z",
    dot: "M1 0 A1 1 0 1 0 -1 0 A1 1 0 1 0 1 0 Z",
  };

  /** Un color #rrggbb girado `grados` en el círculo cromático. */
  function girarTono(color, grados) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(color || "").trim());
    if (!m || !grados) return color;
    const v = parseInt(m[1], 16), r = (v >> 16 & 255) / 255, g = (v >> 8 & 255) / 255, b = (v & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    let h = 0, s = 0;
    if (d) {
      s = d / (1 - Math.abs(2 * l - 1));
      h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
    }
    h = ((h + grados) % 360 + 360) % 360;
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), o = l - c / 2;
    const [r2, g2, b2] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    const hex = (q) => Math.round((q + o) * 255).toString(16).padStart(2, "0");
    return "#" + hex(r2) + hex(g2) + hex(b2);
  }

  drawing.efectos = { filtro, FORMAS, GRANOS, BORDES, TEXTURAS, girarTono };
})(typeof window !== "undefined" ? window : globalThis);
