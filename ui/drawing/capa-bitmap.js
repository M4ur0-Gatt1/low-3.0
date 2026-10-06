/* ══════════════════════════════════════════════════════════════════════════
   CAPAS DE MAPA DE BITS

   Pedido de Mauro (oct-2026), por el reclamo de un usuario: «no sé si tenemos
   la opción de dibujar en bits como tienen OpenToonz o Toon Boom; quiero
   separar eso tal cual lo hacen esos programas».

   En OpenToonz el NIVEL tiene tipo (vectorial, Toonz raster, raster) y en
   Harmony la CAPA es vectorial o de mapa de bits: el tipo decide qué hacen el
   pincel, la goma y el balde. Acá igual: el nivel de LOW ya tenía `type`
   ("vector" | "raster" | "reference") y nadie lo usaba.

   En una capa de mapa de bits:
   - el dibujo es UNA HOJA DE PÍXELES: un <image> PNG (sin pérdida) del tamaño
     de la página, dentro del plano de arte. El contenido sigue siendo SVG, así
     que el papel cebolla, la planilla, las miniaturas y la exportación andan
     sin tocarlos;
   - todo lo que se dibuja (pincel, lápiz, formas, texto) SE VUELVE PÍXELES al
     terminar el trazo: cualquier pincel de LOW pinta en la hoja;
   - la GOMA BORRA PÍXELES, en vivo, del tamaño que se elija;
   - el BALDE RELLENA PÍXELES (inundación con tolerancia), por debajo de la línea;
   - la hoja no se selecciona ni se borra entera como si fuera un objeto.
   Todo con UN paso de Ctrl+Z por trazo.

   @module drawing/capa-bitmap
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const doc = global.document;
  const D = () => (typeof DZ !== "undefined" ? DZ : null);
  const $q = (s, r) => (r || doc).querySelector(s);
  const hoja = () => $q("#dzCanvas")?.querySelector(":scope > svg") || null;
  const RES = 1.5;                         // píxeles de la hoja por unidad del documento
  const SUP = "image[data-low-raster]";

  /* ── ¿ES DE MAPA DE BITS? ────────────────────────────────────────────── */
  function esBitmap(level) { const lv = level || D()?.doc?.level; return !!(lv && lv.type === "raster"); }
  function vbDe(svg) { return (svg.getAttribute("viewBox") || "0 0 1920 1080").split(/\s+/).map(Number); }

  /* ── LA HOJA DE PÍXELES ───────────────────────────────────────────────── */
  function superficie(svg, crear) {
    // SÓLO los planos de arte PROPIOS del dibujo (hijos directos de la hoja):
    // las otras capas y el papel cebolla se pintan adentro de la misma hoja
    // como COPIAS de sus planos (g.dz-capa, g.dz-onion), y la primera vez la
    // hoja de píxeles fue a parar adentro de la copia de otra capa
    let img = svg.querySelector(":scope > g[data-low-art] > " + SUP);
    if (img || !crear) return img;
    const v = vbDe(svg), host = svg.querySelector(':scope > g[data-low-art="line"]') || svg.querySelector(":scope > g[data-low-art]") || svg;
    img = doc.createElementNS("http://www.w3.org/2000/svg", "image");
    img.setAttribute("data-low-raster", "1");
    img.setAttribute("data-locked", "1");
    img.setAttribute("x", v[0]); img.setAttribute("y", v[1]);
    img.setAttribute("width", v[2]); img.setAttribute("height", v[3]);
    img.setAttribute("preserveAspectRatio", "none");
    img.setAttribute("style", "pointer-events:none");
    host.insertBefore(img, host.firstChild);
    return img;
  }
  const hrefDe = (img) => img.getAttribute("href") || img.getAttribute("xlink:href") || "";

  /** El <canvas> de la hoja (en memoria), con lo que ya tiene pintado. */
  let cache = { href: null, canvas: null };
  async function lienzoDe(svg, img) {
    const v = vbDe(svg), W = Math.round(v[2] * RES), H = Math.round(v[3] * RES), href = hrefDe(img);
    if (cache.canvas && cache.href === href && cache.canvas.width === W && cache.canvas.height === H) return cache.canvas;
    const c = doc.createElement("canvas"); c.width = W; c.height = H;
    if (href) { const im = new Image(); im.src = href; try { await im.decode(); c.getContext("2d").drawImage(im, 0, 0, W, H); } catch (_) { /* hoja vacía */ } }
    cache = { href, canvas: c };
    return c;
  }
  function guardar(img, canvas) {
    const href = canvas.toDataURL("image/png");
    img.setAttribute("href", href);
    cache = { href, canvas };
  }

  /* ── HORNEAR: lo dibujado se vuelve píxeles ───────────────────────────── */
  function porHornear(svg) {
    return [...svg.querySelectorAll(":scope > g[data-low-art] > *")].filter((el) =>
      !el.matches(SUP) && !el.closest("g.dz-onion, g.dz-capa, g.dz-penui, [data-low='ruler-guide']") && el.tagName !== "title");
  }
  let horneando = null;
  async function hornear(svg, elementos) {
    if (!elementos.length) return false;
    const v = vbDe(svg), img = superficie(svg, true), canvas = await lienzoDe(svg, img);
    // lo que hace falta para que se vea igual: defs (filtros, máscaras,
    // degradados) y el CSS de la paleta (los colores de los estilos)
    const defs = [...svg.querySelectorAll("defs, style")].filter((n) => !n.closest("g.dz-onion, g.dz-capa")).map((n) => n.outerHTML).join("");
    const marcas = elementos.map((el) => el.outerHTML).join("");
    const xml = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${v.join(" ")}" width="${canvas.width}" height="${canvas.height}">${defs}${marcas}</svg>`;
    const im = new Image();
    im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(xml);
    try { await im.decode(); } catch (_) { return false; }
    if (!svg.isConnected || superficie(svg) !== img) return false;   // cambió de cuadro mientras tanto
    canvas.getContext("2d").drawImage(im, 0, 0, canvas.width, canvas.height);
    elementos.forEach((el) => el.remove());
    guardar(img, canvas);
    return true;
  }

  /** Vuelca al documento en el MISMO paso de Ctrl+Z que el trazo. */
  function volcar(marca) {
    const dz = D();
    if (!dz || !dz.doc) { global.dzMarkDirty?.(); return; }
    const contenido = global.dzCanvasInner?.();
    if (contenido == null) return;
    const ultimo = dz.doc.history && dz.doc.history.undoStack.at(-1);
    // si el trazo ya se había volcado (con sus marcas vectoriales), el
    // horneado se suma a ESE paso; si no, entra cuando se vuelque
    const yaEstaba = ultimo && typeof ultimo.after === "string" && marca && ultimo.after.includes(marca);
    dz.doc.writeDrawing(contenido, yaEstaba ? { label: ultimo.label, coalesce: ultimo } : { label: "Pintar" });
  }

  let reloj = 0, puntero = false;
  doc.addEventListener("pointerdown", () => { puntero = true; }, true);
  doc.addEventListener("pointerup", () => { puntero = false; programar(); }, true);
  doc.addEventListener("pointercancel", () => { puntero = false; }, true);
  function ocupado() {
    return puntero || (typeof DRAW_TRACK !== "undefined" && DRAW_TRACK) || (typeof PEN !== "undefined" && PEN);
  }
  function programar() {
    clearTimeout(reloj);
    reloj = setTimeout(async () => {
      const svg = hoja();
      if (!svg || !esBitmap() || horneando) return;
      if (ocupado()) return programar();
      const els = porHornear(svg);
      if (!els.length) return;
      // la marca del trazo, ANTES de hornearlo: si el volcado del trazo ya
      // entró al historial, su paso la contiene y el horneado se suma a él
      const marca = els[0].outerHTML.slice(0, 160);
      horneando = hornear(svg, els);
      const hecho = await horneando;
      horneando = null;
      if (hecho) { volcar(marca); global.dzSetStatus?.("Mapa de bits: pintado en la hoja"); }
    }, 16);
  }
  /* Mirar el lienzo: lo que aparece en un plano de arte de una capa de mapa de
     bits se hornea en cuanto el trazo termina. */
  let observador = null;
  function observar() {
    const cv = $q("#dzCanvas");
    if (!cv || observador) return;
    observador = new MutationObserver((muts) => {
      if (!esBitmap()) return;
      for (const m of muts) for (const n of m.addedNodes) {
        const padre = n.nodeType === 1 && n.parentElement;
        if (padre && padre.matches("g[data-low-art]") && padre.parentElement === hoja() && !n.matches(SUP)) { programar(); return; }
      }
    });
    observador.observe(cv, { childList: true, subtree: true });
  }

  /* ── LA GOMA DE PÍXELES ───────────────────────────────────────────────── */
  const PREF = "low.bitmap.v1";
  const prefs = Object.assign({ goma: 24, tolerancia: 32 }, (() => { try { return JSON.parse(global.localStorage.getItem(PREF) || "{}"); } catch (_) { return {}; } })());
  const guardarPrefs = () => { try { global.localStorage.setItem(PREF, JSON.stringify(prefs)); } catch (_) { /* */ } };

  /* La hoja se muestra EN VIVO mientras se borra: el mismo <canvas> se pone
     encima de la imagen con la transformación exacta de la pantalla
     (getScreenCTM), y se borra ahí. Al soltar, vuelve a la imagen. */
  let goma = null;
  async function gomaEmpezar(e) {
    const svg = hoja(); if (!svg) return;
    const img = superficie(svg, false);
    if (!img) { global.dzSetStatus?.("Mapa de bits: no hay nada pintado para borrar en este cuadro"); return; }
    const canvas = await lienzoDe(svg, img);
    const m = img.getScreenCTM(); if (!m) return;
    const x = +img.getAttribute("x"), y = +img.getAttribute("y"), k = 1 / RES;
    const vista = canvas;
    Object.assign(vista.style, { position: "fixed", left: "0px", top: "0px", zIndex: 3400, pointerEvents: "none", transformOrigin: "0 0",
      transform: `matrix(${m.a * k}, ${m.b * k}, ${m.c * k}, ${m.d * k}, ${m.e + m.a * x + m.c * y}, ${m.f + m.b * x + m.d * y})` });
    doc.body.appendChild(vista);
    img.style.visibility = "hidden";
    global.dzSnapshot?.();
    goma = { id: e.pointerId, img, canvas, inv: m.inverse(), x, y, ultimo: null };
    gomaPaso(e);
  }
  function gomaPaso(e) {
    if (!goma) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(goma.inv);
    const px = (p.x - goma.x) * RES, py = (p.y - goma.y) * RES;
    const pres = (e.pointerType === "pen" && e.pressure > 0) ? .35 + .65 * e.pressure : 1;
    const ancho = Math.max(1, prefs.goma * RES * pres);
    const g = goma.canvas.getContext("2d");
    g.save(); g.globalCompositeOperation = "destination-out"; g.lineCap = g.lineJoin = "round"; g.lineWidth = ancho;
    g.beginPath();
    if (goma.ultimo) { g.moveTo(goma.ultimo[0], goma.ultimo[1]); g.lineTo(px, py); g.stroke(); }
    else { g.arc(px, py, ancho / 2, 0, Math.PI * 2); g.fill(); }
    g.restore();
    goma.ultimo = [px, py];
  }
  function gomaFin() {
    if (!goma) return;
    const { img, canvas } = goma; goma = null;
    canvas.remove(); canvas.removeAttribute("style");
    img.style.visibility = "";
    guardar(img, canvas);
    volcar(null);
    global.dzMarkDirty?.();
  }

  /* ── EL BALDE DE PÍXELES ──────────────────────────────────────────────── */
  async function baldeEn(e) {
    const svg = hoja(); if (!svg) return;
    const img = superficie(svg, true), canvas = await lienzoDe(svg, img);
    const m = img.getScreenCTM(); if (!m) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    const x0 = Math.floor((p.x - +img.getAttribute("x")) * RES), y0 = Math.floor((p.y - +img.getAttribute("y")) * RES);
    const W = canvas.width, H = canvas.height;
    if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return;
    const ctx = canvas.getContext("2d"), datos = ctx.getImageData(0, 0, W, H), px = datos.data;
    const i0 = (y0 * W + x0) * 4, ref = [px[i0], px[i0 + 1], px[i0 + 2], px[i0 + 3]], tol = prefs.tolerancia;
    const parecido = (i) => Math.abs(px[i] - ref[0]) <= tol && Math.abs(px[i + 1] - ref[1]) <= tol && Math.abs(px[i + 2] - ref[2]) <= tol && Math.abs(px[i + 3] - ref[3]) <= tol;
    const marca = new Uint8Array(W * H), pila = [y0 * W + x0];
    let cuenta = 0;
    while (pila.length) {
      const q = pila.pop(); if (marca[q]) continue;
      const yy = (q / W) | 0; let xa = q - yy * W, xb = xa;
      while (xa > 0 && parecido((yy * W + xa - 1) * 4)) xa--;
      while (xb < W - 1 && parecido((yy * W + xb + 1) * 4)) xb++;
      for (let xx = xa; xx <= xb; xx++) {
        const r = yy * W + xx; if (marca[r]) continue; marca[r] = 1; cuenta++;
        if (yy > 0 && !marca[r - W] && parecido((r - W) * 4)) pila.push(r - W);
        if (yy < H - 1 && !marca[r + W] && parecido((r + W) * 4)) pila.push(r + W);
      }
      if (cuenta > W * H * .98) break;
    }
    if (!cuenta) return;
    // un píxel más alrededor: el borde suavizado de la línea queda cubierto
    let hex = String(D()?.fillColor || "#E5322D").trim().replace("#", "");
    if (/^[0-9a-f]{3}$/i.test(hex)) hex = hex.split("").map((c) => c + c).join("");
    const rgb = /^[0-9a-f]{6}$/i.test(hex) ? parseInt(hex, 16) : 0xE5322D;
    const relleno = ctx.createImageData(W, H), f = relleno.data;
    for (let q = 0; q < W * H; q++) {
      if (!(marca[q] || (q % W > 0 && marca[q - 1]) || (q % W < W - 1 && marca[q + 1]) || marca[q - W] || marca[q + W])) continue;
      f[q * 4] = rgb >> 16 & 255; f[q * 4 + 1] = rgb >> 8 & 255; f[q * 4 + 2] = rgb & 255; f[q * 4 + 3] = 255;
    }
    const capa = doc.createElement("canvas"); capa.width = W; capa.height = H; capa.getContext("2d").putImageData(relleno, 0, 0);
    global.dzSnapshot?.();
    ctx.save(); ctx.globalCompositeOperation = "destination-over"; ctx.drawImage(capa, 0, 0); ctx.restore();   // por DEBAJO de la línea
    guardar(img, canvas);
    volcar(null);
    global.dzMarkDirty?.();
    global.dzSetStatus?.("Mapa de bits: rellenado");
  }

  /* ── EL GESTO: la goma y el balde en una capa de mapa de bits ─────────── */
  function enganchar() {
    observar();
    doc.addEventListener("pointerdown", (e) => {
      const dz = D(), cv = $q("#dzCanvas");
      if (!dz || !cv || !cv.contains(e.target) || !esBitmap() || e.button !== 0 || dz.spaceDown) return;
      if (typeof global.dzOnUiPanel === "function" && global.dzOnUiPanel(e)) return;
      if (dz.tool === "eraser") { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); try { cv.setPointerCapture(e.pointerId); } catch (_) { /* */ } gomaEmpezar(e); }
      else if (dz.tool === "bucket") { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation?.(); baldeEn(e); }
    }, true);
    doc.addEventListener("pointermove", (e) => {
      if (!goma || e.pointerId !== goma.id) return;
      e.preventDefault(); e.stopPropagation();
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of (evs.length ? evs : [e])) gomaPaso(ev);
    }, true);
    const fin = (e) => { if (goma && e.pointerId === goma.id) gomaFin(); };
    doc.addEventListener("pointerup", fin, true);
    doc.addEventListener("pointercancel", fin, true);
    // opciones en la barra de la herramienta: tamaño de la goma y tolerancia del balde
    const orig = global.dzToolOptsRender;
    if (typeof orig === "function" && !orig.__bitmap) {
      const f = function () {
        const r = orig.apply(this, arguments);
        try { opciones(); } catch (err) { console.warn("[mapa de bits]", err); }
        return r;
      };
      Object.assign(f, orig); f.__bitmap = true;
      global.dzToolOptsRender = f;
    }
    // la capa cambia: la barra dice si es de mapa de bits
    const d = D()?.doc;
    if (d && d.subscribe && !d.__bitmap) { d.__bitmap = true; d.subscribe((_x, motivo) => { if (motivo === "layers" || motivo === "frame") marcar(); }); }
    marcar();
  }
  function opciones() {
    const box = $q("#dzToolOpts"), dz = D();
    if (!box || !dz || !esBitmap()) return;
    const chip = doc.createElement("span");
    chip.className = "bmp-chip"; chip.textContent = "Mapa de bits";
    chip.title = "Esta capa es de mapa de bits: lo que dibujes se vuelve píxeles, la goma borra píxeles y el balde rellena píxeles";
    box.insertBefore(chip, box.children[1] || null);
    if (dz.tool === "eraser" || dz.tool === "bucket") {
      box.querySelectorAll(":scope > .dz-hint").forEach((n) => n.remove());
      const s = doc.createElement("span"); s.className = "bmp-opciones";
      s.innerHTML = dz.tool === "eraser"
        ? `<label title="Tamaño de la goma, en unidades del documento">Tamaño <input type="range" data-b="goma" min="2" max="200" value="${prefs.goma}"><b>${prefs.goma}</b></label><span class="dz-hint">borra píxeles · con lápiz, la presión achica la goma</span>`
        : `<label title="Cuánto se puede parecer un píxel al del clic para entrar en el relleno">Tolerancia <input type="range" data-b="tolerancia" min="0" max="128" value="${prefs.tolerancia}"><b>${prefs.tolerancia}</b></label><span class="dz-hint">rellena píxeles por debajo de la línea</span>`;
      s.addEventListener("input", (ev) => { const k = ev.target.dataset.b; if (!k) return; prefs[k] = +ev.target.value; const b = ev.target.parentElement.querySelector("b"); if (b) b.textContent = ev.target.value; guardarPrefs(); });
      box.appendChild(s);
    }
  }
  /* La barra dice si la capa es de mapa de bits. Se vuelve a pintar SÓLO
     cuando eso cambia: «frame» llega 24 veces por segundo al reproducir. */
  let eraBitmap = null;
  function marcar() {
    const cv = $q("#dzCanvas"), ahora = esBitmap();
    if (cv) cv.classList.toggle("capa-bitmap", ahora);
    if (ahora !== eraBitmap) { eraBitmap = ahora; global.dzToolOptsRender?.(); }
  }

  /* ── CREAR Y CONVERTIR ────────────────────────────────────────────────── */
  function nuevaCapa() {
    const dz = D();
    if (!dz || !dz.doc) { global.dzSetStatus?.("Abrí una escena de animación para agregarle capas"); return null; }
    const ly = dz.doc.addLayer(null, "raster");
    dz.doc.emit("frame");
    global.dzSetStatus?.("«" + ly.name + "» de mapa de bits creada · lo que dibujes en ella se vuelve píxeles");
    return ly;
  }

  function engancharMenu() {
    const item = $q('[data-act="capa-bitmap-nueva"]');
    if (!item || item.__bitmap) return;
    item.__bitmap = true;
    item.addEventListener("mousedown", () => nuevaCapa());
  }

  global.LOW = global.LOW || {};
  global.LOW.drawing = global.LOW.drawing || {};
  global.LOW.drawing.capaBitmap = { esBitmap, nuevaCapa, superficie, hornear: (svg) => hornear(svg, porHornear(svg)), prefs, RES };
  global.dzNuevaCapaBitmap = nuevaCapa;
  const arrancar = () => { enganchar(); engancharMenu(); };
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", arrancar, { once: true });
  else arrancar();
  // el documento puede llegar después (Nuevo, Abrir): se engancha al cambiar
  const prev = global.dzDocInit;
  if (typeof prev === "function" && !prev.__bitmap) {
    const f = function () { const r = prev.apply(this, arguments); Promise.resolve(r).then(() => { const d = D()?.doc; if (d && d.subscribe && !d.__bitmap) { d.__bitmap = true; d.subscribe((_x, m) => { if (m === "layers" || m === "frame") marcar(); }); } marcar(); }); return r; };
    Object.assign(f, prev); f.__bitmap = true;
    global.dzDocInit = f;
  }
})(typeof window !== "undefined" ? window : globalThis);
