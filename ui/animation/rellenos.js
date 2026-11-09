/* ══════════════════════════════════════════════════════════════════════════
   RELLENOS CON DEGRADÉ O TEXTURA, Y TINTE (como el Fill Gradient, las
   texturas y el pincel de Tinte / Vertex Paint de Grease Pencil)

   1. RELLENOS. Clic derecho en un color de la paleta → «Relleno: degradé…»
      o «Relleno: textura…». Todo lo que use ese estilo como relleno pasa a
      rellenarse con el degradé o la textura, en todos los dibujos (el color
      sigue viviendo en la paleta: animation/palette.js, relleno/defs).
      Acá se ponen las definiciones en la mesa (un g.dz-onion: no se guarda)
      y adentro del cuadro exportado.

   2. TINTE. Edición → «Teñir lo elegido…» lleva lo elegido hacia un color,
      en la cantidad que digas, SIN cambiar la paleta: una sombra en un
      cuadro, un rubor, un reflejo. «Pincel de tinte» tiñe con cada clic lo
      que toques (Esc lo apaga). «Quitar el tinte» lo devuelve a su color.
      El tinte queda en el elemento (estilo propio con !important, que le
      gana a la paleta) y se marca con data-tinte. Ctrl+Z lo deshace.

   @module animation/rellenos
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const SVGNS = "http://www.w3.org/2000/svg";
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const avisar = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };
  const P = () => global.LOW && global.LOW.animation && global.LOW.animation.palette;
  const hoja = () => { const cv = document.querySelector("#dzCanvas"); return cv ? cv.querySelector(":scope > svg") : null; };

  /* ── 1. las definiciones de los rellenos ───────────────────────────────── */
  function defsDeLaPaleta() {
    const D = dz(), pal = D && D.doc && D.doc.palette;
    return pal && P() && P().defs ? P().defs(pal) : "";
  }
  function ponerEnLaMesa() {
    const svg = hoja();
    if (!svg) return;
    const texto = defsDeLaPaleta();
    let g = svg.querySelector(":scope > g.dz-paldefs");
    if (!texto) { if (g) g.remove(); return; }
    if (!g) { g = document.createElementNS(SVGNS, "g"); g.setAttribute("class", "dz-onion dz-paldefs"); svg.insertBefore(g, svg.firstChild); }
    if (g.innerHTML !== texto) g.innerHTML = texto;
  }
  function envolver(nombre, fabrica) {
    const original = global[nombre];
    if (typeof original !== "function" || original.__rellenos) return false;
    const nueva = fabrica(original);
    nueva.__rellenos = true;
    global[nombre] = nueva;
    return true;
  }
  function enganchar() {
    // la hoja de la paleta se repinta: las definiciones con ella
    envolver("dzPalCssRender", (orig) => function () { const r = orig.apply(this, arguments); try { ponerEnLaMesa(); } catch (_) { /* nunca tumba el lienzo */ } return r; });
    // el cuadro exportado lleva las definiciones adentro (va después de
    // capas-en-mesa.js, que también envuelve esta función)
    envolver("dzCuadroSvgTexto", (orig) => function () {
      const t = orig.apply(this, arguments);
      const d = typeof t === "string" && t ? defsDeLaPaleta() : "";
      return d ? t.replace(/^(<svg\b[^>]*>)/, "$1" + d) : t;
    });
    try { ponerEnLaMesa(); } catch (_) { /* sin documento todavía */ }
  }

  /** El diálogo de relleno de un estilo de la paleta. */
  function dialogoRelleno(index, tipo) {
    const D = dz(), doc = D && D.doc, pal = doc && doc.palette, st = pal && pal.byIndex(index);
    if (!st || typeof doc.setStyleRelleno !== "function") return false;
    if (tipo === "liso") { if (doc.setStyleRelleno(index, null)) avisar("El estilo " + index + " vuelve a rellenar liso"); return true; }
    if (typeof global.openModal !== "function") return false;
    const actual = (P() && P().relleno(st)) || {};
    const patrones = (P() && P().PATRONES) || [];
    global.openModal(`<h2>${tipo === "degrade" ? "Relleno con degradé" : "Relleno con textura"}</h2>
      <div class="sub" id="rlNombre"></div>
      <div class="dz-style-row"><span class="dz-hint">Segundo color</span><input type="color" id="rlColor2" value="${actual.color2 || "#ffffff"}"></div>
      ${tipo === "degrade"
        ? `<div class="dz-style-row"><span class="dz-hint">Ángulo °</span><input type="number" id="rlAngulo" class="dz-win" value="${actual.angulo == null ? 90 : actual.angulo}">
           <label><input type="checkbox" id="rlRadial"${actual.radial ? " checked" : ""}> Radial (del centro hacia afuera)</label></div>`
        : `<div class="dz-style-row"><span class="dz-hint">Patrón</span><select id="rlPatron" class="langsel">${patrones.map((p) => `<option value="${p}"${actual.patron === p ? " selected" : ""}>${p === "cuadricula" ? "cuadrícula" : p}</option>`).join("")}</select>
           <span class="dz-hint">Tamaño</span><input type="number" id="rlEscala" class="dz-win" value="${actual.escala || 16}"></div>`}
      <div class="m-actions"><button class="ghost" id="mCancel">Cancelar</button><button class="primary" id="rlOk">Aplicar</button></div>`);
    const $m = (s) => document.querySelector(s);
    $m("#rlNombre").textContent = "Estilo " + st.index + " «" + st.name + "»: todo lo que lo usa como relleno, en todos los dibujos";
    $m("#mCancel").onclick = () => global.closeModal();
    $m("#rlOk").onclick = () => {
      const r = tipo === "degrade"
        ? { tipo: "degrade", color2: $m("#rlColor2").value, angulo: Number($m("#rlAngulo").value) || 0, radial: $m("#rlRadial").checked }
        : { tipo: "textura", color2: $m("#rlColor2").value, patron: $m("#rlPatron").value, escala: Number($m("#rlEscala").value) || 16 };
      global.closeModal();
      if (doc.setStyleRelleno(index, r)) avisar("Estilo " + index + " con " + (tipo === "degrade" ? "degradé" : "textura") + " · Ctrl+Z lo deshace");
      if (typeof global.dzPalCssRender === "function") global.dzPalCssRender();
    };
    return true;
  }

  /* ── 2. tinte ──────────────────────────────────────────────────────────── */
  const aHex = (rgb) => { const m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(rgb || ""); return m ? [+m[1], +m[2], +m[3]] : null; };
  const mezcla = (a, b, t) => "#" + a.map((v, i) => Math.round(v + (b[i] - v) * t).toString(16).padStart(2, "0")).join("");
  const hojasDe = (el) => (el.children && el.children.length ? [...el.querySelectorAll("*")].filter((n) => !n.children.length && n.getBBox) : [el]);
  /** Tiñe elementos hacia `color` (#rrggbb) en `cantidad` (0 a 1). Parte del
   *  color que se ve (paleta incluida); si ya estaba teñido, del de antes del tinte. */
  function tenir(elementos, color, cantidad) {
    const c = aHex(color.replace(/^#(..)(..)(..)$/, (_, r, g, b) => `rgb(${parseInt(r, 16)},${parseInt(g, 16)},${parseInt(b, 16)})`));
    if (!c) return 0;
    let n = 0;
    for (const el of elementos) for (const h of hojasDe(el)) {
      if (h.closest(".dz-onion")) continue;
      quitarDe(h);
      const cs = getComputedStyle(h);
      for (const prop of ["fill", "stroke"]) {
        const base = aHex(cs[prop]);
        if (!base) continue;
        h.style.setProperty(prop, mezcla(base, c, Math.max(0, Math.min(1, cantidad))), "important");
      }
      h.setAttribute("data-tinte", color + ":" + (+cantidad).toFixed(2));
      n++;
    }
    return n;
  }
  function quitarDe(h) {
    if (!h.hasAttribute("data-tinte")) return false;
    h.style.removeProperty("fill"); h.style.removeProperty("stroke");
    if (!h.getAttribute("style")) h.removeAttribute("style");
    h.removeAttribute("data-tinte");
    return true;
  }
  function elegidos() {
    const D = dz();
    if (!D) return [];
    const multi = (D.multi || []).filter((n) => n && n.isConnected);
    return multi.length ? multi : (D.sel && D.sel.isConnected ? [D.sel] : []);
  }
  const antesDeCambiar = () => { if (typeof global.dzSnapshot === "function") global.dzSnapshot(); };
  const despuesDeCambiar = () => { if (typeof global.dzMarkDirty === "function") global.dzMarkDirty(); };
  let ultimoTinte = { color: "#3a6ea5", cantidad: 0.4 };

  function dialogoTenir() {
    const els = elegidos();
    if (!els.length) return avisar("Elegí lo que querés teñir (o usá el Pincel de tinte)");
    if (typeof global.openModal !== "function") return;
    global.openModal(`<h2>Teñir lo elegido</h2>
      <div class="sub">Lleva lo elegido hacia un color sin cambiar la paleta: una sombra en este cuadro, un rubor, un reflejo. «Quitar el tinte» lo devuelve.</div>
      <div class="dz-style-row"><span class="dz-hint">Color</span><input type="color" id="tnColor" value="${ultimoTinte.color}">
        <span class="dz-hint">Cantidad</span><input type="range" id="tnCant" min="0" max="1" step="0.05" value="${ultimoTinte.cantidad}"></div>
      <div class="m-actions"><button class="ghost" id="mCancel">Cancelar</button><button class="ghost" id="tnPincel">Pincel de tinte</button><button class="primary" id="tnOk">Teñir</button></div>`);
    const $m = (s) => document.querySelector(s);
    const leer = () => { ultimoTinte = { color: $m("#tnColor").value, cantidad: Number($m("#tnCant").value) }; };
    $m("#mCancel").onclick = () => global.closeModal();
    $m("#tnPincel").onclick = () => { leer(); global.closeModal(); pincel(true); };
    $m("#tnOk").onclick = () => {
      leer(); global.closeModal();
      antesDeCambiar();
      const n = tenir(els, ultimoTinte.color, ultimoTinte.cantidad);
      despuesDeCambiar();
      avisar(n ? "Teñido: " + n + " elemento" + (n === 1 ? "" : "s") + " · Ctrl+Z lo deshace" : "No había color que teñir en lo elegido");
    };
  }
  function quitarTinte() {
    const els = elegidos();
    const objetivo = els.length ? els.flatMap(hojasDe) : [...(hoja() ? hoja().querySelectorAll("[data-tinte]") : [])];
    if (!objetivo.some((h) => h.hasAttribute("data-tinte"))) return avisar("No hay tinte que quitar" + (els.length ? " en lo elegido" : " en este dibujo"));
    antesDeCambiar();
    const n = objetivo.filter(quitarDe).length;
    despuesDeCambiar();
    avisar("Tinte quitado de " + n + " elemento" + (n === 1 ? "" : "s"));
  }

  /** PINCEL DE TINTE: cada clic tiñe lo que toca. Esc lo apaga. */
  let pincelOn = false;
  function pincel(on) {
    pincelOn = on == null ? !pincelOn : !!on;
    const cv = document.querySelector("#dzCanvas");
    if (cv) cv.classList.toggle("dz-pincel-tinte", pincelOn);
    avisar(pincelOn ? "Pincel de tinte: tocá lo que querés teñir (" + Math.round(ultimoTinte.cantidad * 100) + " % hacia el color elegido) · Esc lo apaga" : "Pincel de tinte apagado");
  }
  document.addEventListener("pointerdown", (ev) => {
    if (!pincelOn) return;
    const svg = hoja();
    if (!svg || !svg.contains(ev.target) || ev.target === svg || ev.target.closest(".dz-onion, .dz-penui")) return;
    ev.preventDefault(); ev.stopPropagation();
    antesDeCambiar();
    if (tenir([ev.target], ultimoTinte.color, ultimoTinte.cantidad)) despuesDeCambiar();
  }, true);
  document.addEventListener("keydown", (ev) => { if (pincelOn && ev.key === "Escape") pincel(false); }, true);

  // las entradas del menú (se disparan al apretar; ver produccion.js)
  let ultimo = 0;
  for (const tipo of ["mousedown", "click"]) document.addEventListener(tipo, (ev) => {
    const item = ev.target && ev.target.closest && ev.target.closest('[data-act="tenir"], [data-act="quitar-tinte"], [data-act="pincel-tinte"]');
    if (!item || Date.now() - ultimo < 600) return;
    ultimo = Date.now();
    const act = item.getAttribute("data-act");
    if (act === "tenir") dialogoTenir(); else if (act === "quitar-tinte") quitarTinte(); else pincel();
  }, true);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();

  const a = (global.LOW = global.LOW || {}).animation = global.LOW.animation || {};
  a.rellenos = { dialogoRelleno, defsDeLaPaleta, ponerEnLaMesa, tenir, quitarDe, quitarTinte, pincel, dialogoTenir, mezcla };
})(typeof window !== "undefined" ? window : globalThis);
