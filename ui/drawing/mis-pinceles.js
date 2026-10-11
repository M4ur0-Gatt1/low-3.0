/* ══════════════════════════════════════════════════════════════════════════
   MIS PINCELES: LA BIBLIOTECA PROPIA

   Pedido de Mauro (oct-2026, LOW 3.17): «me gustaría poder agregar más
   bibliotecas y tener la posibilidad de generar pinceles propios en la
   biblioteca local de LOW».

   Hasta la 3.17 el Estudio sólo dejaba DUPLICAR un pincel y mover sus
   deslizadores. Esa copia iba al almacén del navegador: unos 5 MB, sin un
   archivo a la vista, sin poder compartirla. Y retocar un pincel de una
   biblioteca instalada se perdía al cerrar LOW.

   Ahora hay una biblioteca «Mis pinceles», que es un archivo .lowbrush más en
   %APPDATA%/LOW/pinceles, al lado de las instaladas. Como en los programas
   que ya se conocen:
     · Nuevo pincel — uno redondo básico, para empezar de cero.
     · Retocar cualquier pincel (de fábrica o de una biblioteca) lo copia a
       Mis pinceles la primera vez («· personalizado»): el original no cambia.
     · Punta desde la selección — lo que está elegido en la mesa se vuelve la
       punta de un pincel nuevo: el «Definir pincel» de Photoshop. Lo oscuro
       es tinta, lo claro es transparente.
     · Punta desde imagen… — lo mismo con un PNG o JPG.
     · Renombrar y Borrar (sólo los propios).
     · Exportar… — cualquier biblioteca a un .lowbrush, para compartirla; se
       instala en otra máquina con «Instalar biblioteca…».
   Se guarda sola, un instante después de cada cambio. Los pinceles propios
   que estaban en el almacén del navegador se mudan al archivo la primera vez
   (y recién después se borran de ahí).

   @module drawing/mis-pinceles
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const ID = "mis-pinceles", NOMBRE = "Mis pinceles";
  const LADO = 256;   // el lado de una punta (el mismo tope que brush_import.py)
  const drawing = () => (global.LOW && global.LOW.drawing) || {};
  const B = () => drawing().brushes;
  const puente = () => (typeof api !== "undefined" && api) ? api : null;
  const avisar = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };
  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  const esMio = (p) => !!(p && p.libraryId === ID);
  const mios = () => (B() ? B().all().filter(esMio) : []);
  const nuevoId = () => "mio-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /** Un pincel listo para vivir en Mis pinceles. */
  function adoptar(p, cambios = {}) {
    const { libraryId, libraryName, fromLibrary, imported, cat, own, custom, ...resto } = p || {};
    return { ...resto, ...cambios, cat: "lib:" + ID, libraryId: ID, libraryName: NOMBRE, fromLibrary: true, imported: false, own: true };
  }
  /** Lo que se guarda en el archivo: sin las marcas de la sesión. */
  function paraGuardar(p) {
    const { libraryId, libraryName, fromLibrary, imported, cat, own, custom, ...resto } = p;
    return resto;
  }

  function anotarBiblioteca() {
    const inst = drawing().bibliotecas && drawing().bibliotecas.instaladas;
    if (!inst) return;
    const prev = inst.get(ID) || {};
    inst.set(ID, { ...prev, id: ID, name: NOMBRE, count: mios().length, format: "propia", own: true, builtin: false });
  }

  /* ── guardar: un instante después del último cambio, al archivo ─────────── */
  let reloj = null, guardando = Promise.resolve(true);
  function guardar(ya = false) {
    clearTimeout(reloj);
    const hacer = () => {
      const A = puente();
      anotarBiblioteca();
      if (!A || typeof A.save_own_brush_library !== "function") return Promise.resolve(false);
      guardando = guardando.then(() => A.save_own_brush_library({ id: ID, name: NOMBRE, brushes: mios().map(paraGuardar) }))
        .then((r) => { if (r && r.error) { avisar(" No pude guardar Mis pinceles: " + r.error); return false; } return true; })
        .catch((e) => { avisar(" No pude guardar Mis pinceles: " + (e && e.message || e)); return false; });
      return guardando;
    };
    if (ya) return hacer();
    reloj = setTimeout(hacer, 400);
    return guardando;
  }

  /** Mete un pincel en Mis pinceles, lo elige y lo guarda. */
  function sumar(estudio, p, aviso) {
    B().save(p, false);
    if (drawing().bitmap && drawing().bitmap.prepararPunta && p.tipData) drawing().bitmap.prepararPunta(p);
    if (estudio) { estudio.selected = p.id; estudio.filter = "lib:" + ID; estudio.options && estudio.options.onSelect && estudio.options.onSelect(p); }
    guardar();
    anotarBiblioteca();
    if (estudio) estudio.render();
    if (aviso) avisar(aviso);
    return p;
  }

  /* ── las puntas: de la selección o de una imagen ─────────────────────────── */
  /** Un lienzo con dibujo → máscara de punta: lo oscuro es tinta. Si así no
   *  queda nada (arte blanco sobre transparente) manda el alfa solo. Devuelve
   *  el PNG negro con alfa, cuadrado y centrado, como los importadores. */
  function mascara(lienzo) {
    const c = lienzo.getContext("2d", { willReadFrequently: true });
    const { width: w, height: h } = lienzo;
    const img = c.getImageData(0, 0, w, h), d = img.data;
    let tinta = 0, alfa = 0;
    const m = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const lum = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2];
      m[j] = Math.round((255 - lum) * d[i + 3] / 255);
      tinta += m[j]; alfa += d[i + 3];
    }
    const soloAlfa = tinta < alfa * .05;
    // recortar al contenido y centrar en un cuadrado
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const v = soloAlfa ? d[(y * w + x) * 4 + 3] : m[y * w + x];
      if (v > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    if (x1 < 0) return null;
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1, lado = Math.max(cw, ch) + 4;
    const out = document.createElement("canvas"); out.width = out.height = lado;
    const oc = out.getContext("2d"), oi = oc.createImageData(lado, lado), od = oi.data;
    const ox = Math.floor((lado - cw) / 2), oy = Math.floor((lado - ch) / 2);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const s = (y0 + y) * w + (x0 + x), t = ((oy + y) * lado + (ox + x)) * 4;
      od[t + 3] = soloAlfa ? d[s * 4 + 3] : m[s];   // negro con alfa: LOW tiñe la punta con el color del trazo
    }
    oc.putImageData(oi, 0, 0);
    return out.toDataURL("image/png");
  }

  function cargarImagen(src) {
    return new Promise((ok, mal) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => mal(new Error("no pude leer la imagen")); im.src = src; });
  }
  async function puntaDeImagen(src, ancho, alto) {
    const im = await cargarImagen(src);
    const w0 = ancho || im.naturalWidth || im.width, h0 = alto || im.naturalHeight || im.height;
    const k = Math.min(1, LADO / Math.max(w0, h0, 1));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w0 * k)); c.height = Math.max(1, Math.round(h0 * k));
    c.getContext("2d").drawImage(im, 0, 0, c.width, c.height);
    return mascara(c);
  }

  /** Lo elegido en la mesa, como un SVG suelto con sus posiciones reales. */
  function svgDeLaSeleccion() {
    const DZ_ = typeof DZ !== "undefined" ? DZ : null;
    if (!DZ_) return null;
    const els = (DZ_.multi && DZ_.multi.length > 1 ? DZ_.multi : [DZ_.sel]).filter((n) => n && n.isConnected);
    const hoja = document.querySelector("#dzCanvas > svg");
    if (!els.length || !hoja) return null;
    const raiz = hoja.getScreenCTM();
    if (!raiz) return null;
    const inv = raiz.inverse();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const ns = "http://www.w3.org/2000/svg", out = document.createElementNS(ns, "svg");
    const defs = hoja.querySelector(":scope > defs");
    if (defs) out.appendChild(defs.cloneNode(true));
    for (const el of els) {
      const r = el.getBoundingClientRect();
      for (const [px, py] of [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]]) {
        const x = inv.a * px + inv.c * py + inv.e, y = inv.b * px + inv.d * py + inv.f;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      // el clon va dentro de un grupo con la transformación de su padre: queda donde se ve
      const p = el.parentNode && el.parentNode.getScreenCTM ? inv.multiply(el.parentNode.getScreenCTM()) : null;
      const g = document.createElementNS(ns, "g");
      if (p) g.setAttribute("transform", `matrix(${p.a} ${p.b} ${p.c} ${p.d} ${p.e} ${p.f})`);
      const clon = el.cloneNode(true);
      clon.classList && clon.classList.remove("dz-sel", "dz-msel");
      g.appendChild(clon); out.appendChild(g);
    }
    if (!(x1 > x0 && y1 > y0)) return null;
    const pad = 2, w = x1 - x0 + 2 * pad, h = y1 - y0 + 2 * pad;
    out.setAttribute("xmlns", ns);
    out.setAttribute("viewBox", `${x0 - pad} ${y0 - pad} ${w} ${h}`);
    const k = LADO / Math.max(w, h);
    out.setAttribute("width", Math.max(1, Math.round(w * k))); out.setAttribute("height", Math.max(1, Math.round(h * k)));
    return { texto: new XMLSerializer().serializeToString(out), ancho: Math.round(w * k), alto: Math.round(h * k) };
  }

  /** Un pincel raster con esa punta, con los ajustes de un sello importado. */
  function pincelDePunta(nombre, tipData) {
    return adoptar({ id: nuevoId(), name: nombre, engine: "raster", size: 36, opacity: 1, flow: .8, spacing: .12,
      pressureSize: .7, pressureOpacity: .2, hardness: .8, angleFollowsStroke: false, tipData, sourceFormat: "low" });
  }

  async function puntaDesdeSeleccion(estudio) {
    const s = svgDeLaSeleccion();
    if (!s) return avisar(" Elegí con la flecha lo que querés usar como punta, y después tocá «Punta desde la selección»");
    let tip;
    try { tip = await puntaDeImagen("data:image/svg+xml;charset=utf-8," + encodeURIComponent(s.texto), s.ancho, s.alto); }
    catch (e) { return avisar(" No pude hacer la punta: " + (e && e.message || e)); }
    if (!tip) return avisar(" Lo elegido no tiene nada oscuro para usar de punta");
    sumar(estudio, pincelDePunta("Punta propia " + (mios().length + 1), tip), " Pincel nuevo con la punta de tu dibujo · está en Mis pinceles");
  }

  async function puntaDesdeImagen(estudio) {
    const A = puente();
    if (!A || typeof A.pick_image !== "function") return;
    const r = await A.pick_image();
    if (!r) return;
    if (r.error) return avisar(" " + r.error);
    let tip;
    try { tip = await puntaDeImagen("data:" + (r.mime || "image/png") + ";base64," + r.data); }
    catch (e) { return avisar(" No pude hacer la punta: " + (e && e.message || e)); }
    if (!tip) return avisar(" La imagen no tiene nada para usar de punta");
    const nombre = String(r.name || "Punta").replace(/\.[a-z0-9]+$/i, "").slice(0, 60) || "Punta";
    sumar(estudio, pincelDePunta(nombre, tip), " Pincel nuevo con la punta de «" + (r.name || "la imagen") + "» · está en Mis pinceles");
  }

  /* ── ventanas propias de LOW (no hay confirm() nativo) ───────────────────── */
  function preguntar(titulo, texto, valor, boton, alAceptar) {
    if (typeof global.openModal !== "function") return;
    global.openModal(`<h2>${esc(titulo)}</h2>${texto ? `<div class="sub">${esc(texto)}</div>` : ""}` +
      (valor != null ? `<input id="mpNombre" class="dz-win mp-nombre" maxlength="60" value="${esc(valor)}">` : "") +
      `<div class="m-actions"><button class="ghost" id="mCancel">Cancelar</button><button class="primary" id="mpOk">${esc(boton)}</button></div>`);
    const inp = document.getElementById("mpNombre");
    const ok = () => { const v = inp ? inp.value.trim() : true; if (inp && !v) return inp.focus(); global.closeModal(); alAceptar(v); };
    document.getElementById("mCancel").onclick = () => global.closeModal();
    document.getElementById("mpOk").onclick = ok;
    if (inp) { inp.focus(); inp.select(); inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); ok(); } else if (e.key === "Escape") global.closeModal(); }; }
  }

  function renombrar(estudio) {
    const p = B().get(estudio.selected);
    if (!esMio(p)) return;
    preguntar("Renombrar pincel", "", p.name, "Renombrar", (v) => {
      B().save({ ...p, name: v.slice(0, 60) }, false); guardar(); estudio.render(); avisar(" Pincel renombrado: " + v);
    });
  }
  function borrar(estudio) {
    const p = B().get(estudio.selected);
    if (!esMio(p)) return;
    preguntar("Borrar pincel", "«" + p.name + "» se borra de Mis pinceles. Los trazos que ya hiciste con él no cambian.", null, "Borrar", () => {
      const lista = mios(), i = lista.findIndex((x) => x.id === p.id);
      B().presets.delete(p.id);
      const resto = mios();
      estudio.selected = (resto[Math.min(i, resto.length - 1)] || B().all()[0] || {}).id || null;
      guardar(); anotarBiblioteca(); estudio.render(); avisar(" Borré «" + p.name + "» de Mis pinceles");
    });
  }
  async function exportar(estudio) {
    const A = puente(), lib = String(estudio.filter || "").startsWith("lib:") ? estudio.filter.slice(4) : ID;
    if (!A || typeof A.export_brush_library !== "function") return;
    if (lib === ID) { if (!mios().length) return avisar(" Mis pinceles está vacía: no hay nada para exportar"); await guardar(true); }
    const r = await A.export_brush_library(lib);
    if (!r || r.cancel) return;
    avisar(r.error ? " No pude exportar: " + r.error : " Exporté " + r.count + " pincel" + (r.count === 1 ? "" : "es") + " a " + r.path + " · se instala con «Instalar biblioteca…»");
  }

  /* ── el Estudio: sus botones nuevos y las dos reglas cambiadas ───────────── */
  function envolverEstudio() {
    const BS = drawing().BrushStudio;
    if (!BS || BS.prototype.__misPinceles) return false;
    BS.prototype.__misPinceles = true;

    // Duplicar: la copia va a Mis pinceles (un archivo), no al almacén del navegador
    BS.prototype.duplicate = function () {
      const p = this.library.get(this.selected); if (!p) return;
      sumar(this, adoptar(p, { id: nuevoId(), name: (p.name + " · copia").slice(0, 60) }), " Copia en Mis pinceles: retocala con los deslizadores");
    };

    // Retocar: lo que no es propio se copia a Mis pinceles la primera vez
    BS.prototype.change = function (input) {
      let p = this.library.get(this.selected); if (!p) return;
      let nuevo = false;
      if (!esMio(p)) { p = adoptar(p, { id: nuevoId(), name: (p.name + " · personalizado").slice(0, 60) }); this.selected = p.id; nuevo = true; }
      const valor = input.tagName === "SELECT" ? (input.value || null) : Number(input.value);
      p = { ...p, [input.dataset.p]: valor };
      this.library.save(p, false);
      guardar();
      const salida = input.closest("label") && input.closest("label").querySelector("output"); if (salida) salida.textContent = input.value;
      const titulo = this.root.querySelector(".bst-title strong"); if (titulo) titulo.textContent = p.name;
      if (this.options && this.options.onSelect) this.options.onSelect(p);
      this.preview(p);
      if (nuevo) { anotarBiblioteca(); avisar(" Lo retocado quedó como «" + p.name + "» en Mis pinceles: el original no cambia"); }
    };

    const render0 = BS.prototype.render;
    BS.prototype.render = function () {
      anotarBiblioteca();
      render0.call(this);
      try { decorar(this); } catch (e) { if (global.console) console.warn("[mis pinceles]", e); }
    };
    return true;
  }

  function decorar(estudio) {
    const root = estudio.root, activo = estudio.library.get(estudio.selected), mio = esMio(activo);
    // un filtro propio en la barra de familias
    const nav = root.querySelector("nav");
    if (nav && !nav.querySelector('[data-mp="filtro"]')) {
      const b = document.createElement("button");
      b.dataset.mp = "filtro"; b.textContent = NOMBRE; b.title = mios().length + " pincel" + (mios().length === 1 ? "" : "es") + " tuyo" + (mios().length === 1 ? "" : "s");
      if (estudio.filter === "lib:" + ID) b.classList.add("active");
      b.onclick = () => { estudio.filter = "lib:" + ID; estudio.render(); };
      nav.insertBefore(b, nav.children[2] || null);
    }
    // Mis pinceles es tuya: no se «quita» desde acá (se vacía borrando pinceles)
    if (estudio.filter === "lib:" + ID) { const q = root.querySelector('[data-a="quitarlib"]'); if (q) q.remove(); }
    // la barra de crear, arriba de la lista
    const lista = root.querySelector(".bst-list");
    if (lista && !root.querySelector(".mp-barra")) {
      const barra = document.createElement("div");
      barra.className = "mp-barra";
      const exportable = String(estudio.filter || "").startsWith("lib:");
      barra.innerHTML = `<button data-mp="nuevo" title="Un pincel redondo básico en Mis pinceles, para empezar de cero">Nuevo pincel</button>` +
        `<button data-mp="seleccion" title="Lo que está elegido en la mesa se vuelve la punta de un pincel nuevo: lo oscuro es tinta, lo claro es transparente">Punta desde la selección</button>` +
        `<button data-mp="imagen" title="Un PNG o JPG se vuelve la punta de un pincel nuevo: lo oscuro es tinta, lo claro es transparente">Punta desde imagen…</button>` +
        (exportable ? `<button data-mp="exportar" title="Guardar esta biblioteca como .lowbrush para compartirla: en otra máquina se instala con «Instalar biblioteca…»">Exportar…</button>` : "");
      lista.before(barra);
      barra.querySelector('[data-mp="nuevo"]').onclick = () => sumar(estudio, adoptar({ id: nuevoId(), name: "Pincel nuevo " + (mios().length + 1), engine: "vector", size: 8, opacity: 1, pressureSize: .8, smoothing: .4 }), " Pincel nuevo en Mis pinceles: ajustalo con los deslizadores");
      barra.querySelector('[data-mp="seleccion"]').onclick = () => puntaDesdeSeleccion(estudio);
      barra.querySelector('[data-mp="imagen"]').onclick = () => puntaDesdeImagen(estudio);
      const ex = barra.querySelector('[data-mp="exportar"]'); if (ex) ex.onclick = () => exportar(estudio);
    }
    // renombrar y borrar: sólo los propios
    const titulo = root.querySelector(".bst-title");
    if (titulo && mio && !titulo.querySelector('[data-mp="renombrar"]')) {
      const r = document.createElement("button"); r.dataset.mp = "renombrar"; r.textContent = "Renombrar"; r.onclick = () => renombrar(estudio);
      const x = document.createElement("button"); x.dataset.mp = "borrar"; x.textContent = "Borrar"; x.title = "Borrar este pincel de Mis pinceles"; x.onclick = () => borrar(estudio);
      titulo.append(r, x);
    }
  }

  /* ── la mudanza: lo propio del almacén del navegador pasa al archivo ────── */
  async function mudar() {
    const lib = B();
    if (!lib) return 0;
    const viejos = lib.all().filter((p) => !p.fromLibrary && !(lib.isBuiltin && lib.isBuiltin(p.id)));
    if (!viejos.length) return 0;
    for (const p of viejos) lib.presets.set(p.id, adoptar(p));
    const ok = await guardar(true);
    if (ok) { lib.persist(); avisar(" Tus " + viejos.length + " pincel" + (viejos.length === 1 ? "" : "es") + " propio" + (viejos.length === 1 ? "" : "s") + " ahora viven en la biblioteca Mis pinceles"); }
    else for (const p of viejos) lib.presets.set(p.id, { ...p });   // si no se pudo guardar, quedan donde estaban
    return ok ? viejos.length : 0;
  }

  async function arrancar() {
    envolverEstudio();
    const bib = drawing().bibliotecas;
    try { if (bib && bib.listo) await bib.listo; } catch (_) { /* sin bibliotecas */ }
    anotarBiblioteca();
    await mudar();
    try { if (bib && bib.refrescar) bib.refrescar(); } catch (_) { /* sin estudio */ }
  }

  drawing().misPinceles = { ID, NOMBRE, guardar, mios, adoptar, puntaDeImagen, svgDeLaSeleccion, mudar };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => setTimeout(arrancar, 0), { once: true });
  else setTimeout(arrancar, 0);
})(window);
