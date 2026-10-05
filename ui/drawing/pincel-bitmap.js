/* ══════════════════════════════════════════════════════════════════════════
   EL PINCEL RASTER, PINTADO EN UN MAPA DE BITS (como Photoshop y Procreate)

   Pedido de Mauro (oct-2026): «no los veo bien a los pinceles… las texturas
   se ven pobres, los efectos son pobres». MEDIDO en el muestrario: un pincel
   raster eran hasta 1600 ELIPSES SVG con un tamaño que variaba según su
   número de orden; el carboncillo se veía como un collar de bolitas y el grano
   era un filtro de ruido encima. Un pincel de verdad SELLA una punta (una
   imagen) cientos de veces muy juntas y la tinta se acumula.

   ACÁ: los sellos del motor (brush-engine-pro.js) se estampan en un <canvas>
   en alta resolución, con una PUNTA de verdad:
     · redonda: borde según la dureza (degradé suave, sin escalones);
     · carbón, tiza, pastel, esponja, seco: borde irregular y poroso;
     · destello, pasto, hoja, confeti, rayita, punto: su forma (el destello
       con su halo);
     · importada: la imagen de la punta.
   Encima, el GRANO de la textura (ruido fractal que se repite sin costura),
   fijo en la HOJA como el de un papel. El resultado entra al dibujo como una
   MÁSCARA con el color encima: la paleta lo sigue recoloreando. Los pinceles
   con variación de color (confeti) entran como imagen a color.

   Lo que es de BORDE (acuarela, húmedo, áspero) y el BRILLO siguen siendo
   filtros SVG sobre el grupo: andan igual sobre cualquier dibujo.

   @module drawing/pincel-bitmap
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const drawing = LOW.drawing = LOW.drawing || {};
  const NS = "http://www.w3.org/2000/svg";
  const TIP = 128;                               // lado de la punta en píxeles
  const POROSAS = /charcoal|chalk|pastel|dry|spray|crayon|canvas/;
  const GRANOS = new Set(["graphite", "charcoal", "chalk", "pastel", "crayon", "paper", "canvas", "dry", "spray", "gouache"]);
  const lienzo = (w, h) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

  // ── ruido fractal que se repite sin costura (value noise con vuelta) ──
  function ruido(tam, celdas, octavas, semilla, dir) {
    const c = lienzo(tam, tam), x = c.getContext("2d"), img = x.createImageData(tam, tam);
    let s = (semilla * 9301 + 49297) >>> 0;
    const azar = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    const capas = [];
    for (let o = 0; o < octavas; o++) {
      const cx = Math.max(1, Math.round(celdas * (dir ? dir[0] : 1) * 2 ** o)), cy = Math.max(1, Math.round(celdas * (dir ? dir[1] : 1) * 2 ** o));
      const g = new Float32Array(cx * cy); for (let i = 0; i < g.length; i++) g[i] = azar();
      capas.push({ cx, cy, g, peso: 1 / 2 ** o });
    }
    const suave = (t) => t * t * (3 - 2 * t);
    const total = capas.reduce((a, c2) => a + c2.peso, 0);
    for (let py = 0; py < tam; py++) for (let px = 0; px < tam; px++) {
      let v = 0;
      for (const { cx, cy, g, peso } of capas) {
        const fx = px / tam * cx, fy = py / tam * cy, x0 = Math.floor(fx), y0 = Math.floor(fy);
        const tx = suave(fx - x0), ty = suave(fy - y0), x1 = (x0 + 1) % cx, y1 = (y0 + 1) % cy;
        const a = g[y0 * cx + x0], b = g[y0 * cx + x1], c3 = g[y1 * cx + x0], d = g[y1 * cx + x1];
        v += peso * (a + (b - a) * tx + (c3 - a) * ty + (a - b - c3 + d) * tx * ty);
      }
      const k = (py * tam + px) * 4; img.data[k + 3] = Math.round(255 * v / total);
    }
    x.putImageData(img, 0, 0);
    return c;
  }

  /** El DIENTE del papel: motas chicas e irregulares (ruido por píxel apenas
   *  desenfocado, con vuelta para que el mosaico no tenga costura), más una
   *  variación lenta. El ruido «de manchas» (value noise) puesto a alto
   *  contraste daba círculos: el carbón parecía plástico de burbujas. */
  function diente(tam, semilla, dir) {
    let sd = (semilla * 2246822519) >>> 0; const azar = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296);
    const a = new Float32Array(tam * tam); for (let i = 0; i < a.length; i++) a[i] = azar();
    const rx = dir ? Math.max(1, Math.round(1 / Math.max(.05, dir[0]))) : 1, ry = dir ? Math.max(1, Math.round(1 / Math.max(.05, dir[1]))) : 1;
    const desenfocar = (src, r, horizontal) => { const out = new Float32Array(src.length);
      for (let y = 0; y < tam; y++) for (let x = 0; x < tam; x++) { let s2 = 0;
        for (let k = -r; k <= r; k++) s2 += horizontal ? src[y * tam + (x + k + tam) % tam] : src[((y + k + tam) % tam) * tam + x];
        out[y * tam + x] = s2 / (2 * r + 1); } return out; };
    const b = desenfocar(desenfocar(a, rx, true), ry, false);
    const lento = ruido(tam, 4, 2, semilla + 5).getContext("2d").getImageData(0, 0, tam, tam).data;
    let mn = 1, mx = 0; for (const v of b) { mn = Math.min(mn, v); mx = Math.max(mx, v); }
    const c = lienzo(tam, tam), x = c.getContext("2d"), img = x.createImageData(tam, tam);
    for (let i = 0; i < b.length; i++) img.data[i * 4 + 3] = Math.round(255 * ((b[i] - mn) / (mx - mn || 1) * .8 + lento[i * 4 + 3] / 255 * .2));
    x.putImageData(img, 0, 0); return c;
  }

  /** LIENZO: una trama tejida (hilos que pasan por arriba y por abajo), con
   *  un poco de ruido para que no se vea de imprenta. */
  function trama(tam, semilla) {
    const c = ruido(tam, 32, 2, semilla % 7 + 11), x = c.getContext("2d"), img = x.getImageData(0, 0, tam, tam), hilos = 24;
    for (let py = 0; py < tam; py++) for (let px = 0; px < tam; px++) {
      const u = px / tam * hilos * Math.PI * 2, v = py / tam * hilos * Math.PI * 2;
      const tejido = .56 + .22 * Math.cos(u) + .22 * Math.cos(v);   // los hilos de la tela, cruzados
      const i = (py * tam + px) * 4 + 3; img.data[i] = Math.round(255 * Math.max(0, Math.min(1, tejido * .75 + .25 * img.data[i] / 255)));
    }
    x.putImageData(img, 0, 0); return c;
  }

  /** El grano de una textura: un mosaico cuyo ALFA es cuánta tinta deja pasar.
   *  Contraste y fuerza como en pincel-efectos.js (alfa = k·ruido + b). */
  const granos = new Map();
  function grano(tex, fuerza, semilla) {
    const clave = tex + "|" + fuerza.toFixed(2) + "|" + (semilla % 7);
    if (granos.has(clave)) return granos.get(clave);
    const G = (drawing.efectos && drawing.efectos.GRANOS[tex]) || { f: .3, oct: 2, k: 2.4, b: -.5 };
    const f = Array.isArray(G.f) ? G.f : [G.f, G.f], fmax = Math.max(f[0], f[1]), CELDAS = 8, tam = 256;
    const base = tex === "canvas" ? trama(tam, semilla) : diente(tam, semilla % 7 + 1, [f[0] / fmax, f[1] / fmax]);
    const x = base.getContext("2d"), img = x.getImageData(0, 0, tam, tam), k = fuerza * G.k, b = 1 - fuerza + fuerza * G.b;
    for (let i = 3; i < img.data.length; i += 4) img.data[i] = Math.max(0, Math.min(255, 255 * (k * img.data[i] / 255 + b)));
    x.putImageData(img, 0, 0);
    // el mosaico mide CELDAS / frecuencia unidades del dibujo: el mismo tamaño
    // de grano que el filtro SVG (frecuencia en ciclos por unidad)
    // el diente: motas de ~4 px del mosaico = 1/frecuencia unidades del dibujo
    const r = { lienzo: base, unidades: tex === "canvas" ? CELDAS / fmax : tam / 4 / fmax };
    granos.set(clave, r);
    return r;
  }

  // ── las puntas ──
  const puntas = new Map();
  const imagenes = new Map();   // tipData → HTMLImageElement decodificada
  /** Una punta importada se decodifica una vez; hasta que esté, no hay punta. */
  function prepararPunta(brush) {
    if (!brush || !brush.tipData || imagenes.has(brush.tipData)) return;
    const img = new Image(); img.decoding = "async"; img.src = brush.tipData;
    imagenes.set(brush.tipData, img);
  }
  function punta(brush) {
    const forma = brush.shape || "ellipse", dureza = Math.max(0, Math.min(1, brush.hardness ?? .8));
    const porosa = POROSAS.test(brush.texture || "") && forma === "ellipse" && brush.texture !== "dry";
    const clave = brush.tipData ? "img:" + brush.tipData.length + ":" + brush.tipData.slice(-24) : forma + "|" + dureza.toFixed(2) + "|" + (porosa ? brush.texture : "") + "|" + (brush.seed || 1);
    if (puntas.has(clave)) return puntas.get(clave);
    const c = lienzo(TIP, TIP), x = c.getContext("2d"), r = TIP / 2;
    if (brush.tipData) {
      const img = imagenes.get(brush.tipData);
      if (!img || !img.complete || !img.naturalWidth) { prepararPunta(brush); return null; }
      x.drawImage(img, 0, 0, TIP, TIP);
    } else if (forma === "ellipse" && brush.texture === "dry") {
      // PINCEL SECO: una fila de CERDAS a lo ancho del pincel. El sello gira con
      // la dirección del trazo, así que las vetas siguen al trazo (antes iban
      // siempre horizontales, era un grano de la hoja)
      let sd = ((brush.seed || 1) * 7919) >>> 0; const azar = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296);
      const n = 26;
      for (let i = 0; i < n; i++) {
        const yy = (i + .5) / n * TIP, grosor = TIP / n * (.45 + azar() * .7), largo = TIP * (.35 + azar() * .3);
        x.globalAlpha = .45 + azar() * .55; x.fillStyle = "#000";
        x.beginPath(); x.ellipse(r, yy, largo / 2, grosor / 2, 0, 0, Math.PI * 2); x.fill();
      }
      x.globalAlpha = 1;
    } else if (forma === "ellipse") {
      const g = x.createRadialGradient(r, r, 0, r, r, r);
      const dentro = Math.min(.985, dureza);
      g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(dentro, "rgba(0,0,0,1)");
      // caída suave (smoothstep en 5 paradas): sin el escalón de un degradé lineal
      for (let i = 1; i <= 5; i++) { const t = i / 5, a = 1 - t * t * (3 - 2 * t); g.addColorStop(dentro + (1 - dentro) * t, `rgba(0,0,0,${a.toFixed(3)})`); }
      x.fillStyle = g; x.fillRect(0, 0, TIP, TIP);
      if (porosa) {
        // BORDE irregular, cuerpo macizo: la punta de una barra de carbón no es
        // un círculo, pero tampoco un colador. Con agujeros adentro, cada sello
        // repetía el mismo dibujo y el trazo parecía plástico de burbujas; el
        // grano lo pone la HOJA, y cada sello gira al azar (ver render)
        const n = ruido(TIP, 7, 3, (brush.seed || 1) + 3).getContext("2d").getImageData(0, 0, TIP, TIP).data;
        const img = x.getImageData(0, 0, TIP, TIP);
        for (let py = 0; py < TIP; py++) for (let px = 0; px < TIP; px++) {
          const rr = Math.hypot(px - r, py - r) / r, i = (py * TIP + px) * 4 + 3;
          if (rr < .55) continue;
          const borde = Math.min(1, (rr - .55) / .45), ruidoEnBorde = n[i] / 255;
          img.data[i] = Math.round(img.data[i] * Math.max(0, Math.min(1, 1 - borde * (1.4 - 1.6 * ruidoEnBorde))));
        }
        x.putImageData(img, 0, 0);
      }
    } else {
      const d = drawing.efectos && drawing.efectos.FORMAS[forma];
      if (!d) return null;
      x.translate(r, r); x.scale(r * .92, r * .92);
      if (forma === "star") { x.shadowColor = "rgba(0,0,0,.85)"; x.shadowBlur = TIP * .12; }
      x.fillStyle = "#000"; x.fill(new Path2D(d));
      if (forma === "star") { x.shadowBlur = 0; x.globalAlpha = .55; x.beginPath(); x.arc(0, 0, .22, 0, Math.PI * 2); x.fill(); }
    }
    puntas.set(clave, c);
    return c;
  }
  /** La punta teñida de un color (confeti, hojas): una por color, en caché. */
  const tenidas = new Map();
  function puntaTenida(base, color) {
    const clave = color; let m = tenidas.get(base); if (!m) { m = new Map(); tenidas.set(base, m); }
    if (m.has(clave)) return m.get(clave);
    const c = lienzo(TIP, TIP), x = c.getContext("2d");
    x.drawImage(base, 0, 0); x.globalCompositeOperation = "source-in"; x.fillStyle = color; x.fillRect(0, 0, TIP, TIP);
    if (m.size > 64) m.clear();
    m.set(clave, c); return c;
  }

  let contador = 0;
  const idUnico = (base) => base + Date.now().toString(36) + (++contador).toString(36) + Math.random().toString(36).slice(2, 6);

  /** Los sellos de un trazo → el elemento SVG del dibujo, o null si no se
   *  puede (sin canvas, punta importada sin decodificar): ahí sigue el camino
   *  de siempre. `opciones.fx`: el <filter> de borde/brillo que va encima. */
  function render(dabs, brush, color, opciones = {}) {
    if (!dabs || !dabs.length || typeof document === "undefined" || brush.eraser) return null;
    const base = punta(brush);
    if (!base) return null;
    // la caja del trazo, con margen para el borde suave
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const d of dabs) { const r = Math.max(d.width, d.height) * .75 + 1; x0 = Math.min(x0, d.x - r); y0 = Math.min(y0, d.y - r); x1 = Math.max(x1, d.x + r); y1 = Math.max(y1, d.y + r); }
    const bw = x1 - x0, bh = y1 - y0;
    if (!(bw > 0 && bh > 0)) return null;
    // resolución: 1,5 px por unidad del dibujo (se ve nítido al acercar), con tope de 6 MP
    const k = Math.max(.35, Math.min(1.5, Math.sqrt(6e6 / (bw * bh))));
    const c = lienzo(bw * k, bh * k), x = c.getContext("2d");
    x.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    const aColor = dabs.some((d) => d.hue);
    // porosos y cerdas: cada sello con su giro (porosos) o una leve variación
    // (cerdas), para que el mismo dibujo de punta no se repita en fila
    const tex = brush.texture || "", girar = POROSAS.test(tex) && tex !== "dry" && (brush.shape || "ellipse") === "ellipse", cerdas = tex === "dry";
    let sd = ((brush.seed || 1) * 2654435761) >>> 0; const azar = () => ((sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (const d of dabs) {
      const tip = aColor ? puntaTenida(base, d.hue && drawing.efectos ? drawing.efectos.girarTono(color, d.hue) : color) : base;
      const giro = girar ? azar() * 360 : cerdas ? (azar() - .5) * 8 : 0, alfa = cerdas ? d.opacity * (.7 + azar() * .3) : d.opacity;
      x.save(); x.globalAlpha = Math.max(0, Math.min(1, alfa));
      x.translate(d.x, d.y); x.rotate(((d.angle || 0) + giro) * Math.PI / 180);
      x.drawImage(tip, -d.width / 2, -d.height / 2, d.width, d.height);
      x.restore();
    }
    // el GRANO, fijo en la hoja: un mosaico alineado a las coordenadas del dibujo
    if (brush.texture && GRANOS.has(brush.texture)) {
      const seco = brush.texture === "dry";   // las vetas las hacen las cerdas; el papel sólo las corta un poco
      const g = grano(seco ? "paper" : brush.texture, seco ? .35 : Math.max(0, Math.min(1, brush.textureStrength ?? .6)), (brush.seed || 1) >>> 0);
      const escala = (g.unidades / 256) * Math.max(.2, Math.min(5, brush.textureScale ?? 1));
      const patron = x.createPattern(g.lienzo, "repeat");
      if (patron && patron.setTransform) patron.setTransform(new DOMMatrix([escala, 0, 0, escala, 0, 0]));
      x.save(); x.globalCompositeOperation = "destination-in"; x.fillStyle = patron; x.fillRect(x0, y0, bw, bh); x.restore();
    }
    let datos;
    try { datos = c.toDataURL("image/webp", .9); } catch (_) { return null; }
    if (!/^data:image\/webp/.test(datos)) datos = c.toDataURL("image/png");
    const g = document.createElementNS(NS, "g");
    g.setAttribute("data-low", brush.tipData ? "imported-brush" : "raster-brush");
    g.setAttribute("data-brush-id", brush.id || "");
    g.setAttribute("data-low-bitmap", "1");
    g.setAttribute("data-dab-count", String(dabs.length));
    const defs = document.createElementNS(NS, "defs"); g.appendChild(defs);
    const caja = { x: x0.toFixed(2), y: y0.toFixed(2), width: bw.toFixed(2), height: bh.toFixed(2) };
    const imagen = document.createElementNS(NS, "image");
    for (const [a, v] of Object.entries(caja)) imagen.setAttribute(a, v);
    imagen.setAttribute("href", datos); imagen.setAttribute("preserveAspectRatio", "none");
    if (aColor) {
      // a COLOR: cada sello ya trae el suyo
      g.appendChild(imagen);
    } else {
      // MÁSCARA + color: la paleta (que pinta el elemento marcado) lo recolorea
      const m = document.createElementNS(NS, "mask"), mid = idUnico("brush_bm_");
      m.id = mid; m.setAttribute("maskUnits", "userSpaceOnUse");
      for (const [a, v] of Object.entries(caja)) m.setAttribute(a, v);
      m.setAttribute("mask-type", "alpha"); m.setAttribute("style", "mask-type:alpha");
      m.appendChild(imagen); defs.appendChild(m);
      const rect = document.createElementNS(NS, "rect");
      for (const [a, v] of Object.entries(caja)) rect.setAttribute(a, v);
      rect.setAttribute("mask", `url(#${mid})`);
      g.setAttribute("fill", color); g.appendChild(rect);
    }
    if (opciones.fx) {
      defs.insertAdjacentHTML("beforeend", opciones.fx);
      g.setAttribute("filter", `url(#${defs.lastElementChild.id})`);
    }
    return g;
  }

  drawing.bitmap = { render, punta, prepararPunta, grano, ruido, GRANOS };
  // las puntas importadas se decodifican al cargar y al guardar un pincel: así
  // el PRIMER trazo ya va por el mapa de bits (antes de decodificar, la punta
  // no existe y el trazo cae a los sellos de siempre)
  try {
    const lib = drawing.brushes;
    if (lib) {
      (lib.all() || []).forEach(prepararPunta);
      const guardar = lib.save.bind(lib);
      lib.save = function (preset, persist) { const r = guardar(preset, persist); prepararPunta(preset); return r; };
    }
  } catch (_) { /* sin biblioteca todavía */ }
})(typeof window !== "undefined" ? window : globalThis);
