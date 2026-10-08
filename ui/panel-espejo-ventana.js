/* ══════════════════════════════════════════════════════════════════════════
   LA VENTANA SEPARADA MUESTRA EL PANEL DE VERDAD — el lado de esta ventana

   La otra mitad está en workspace/panel-espejo.js, que explica el porqué.
   Acá: se pide la foto del panel por el canal, se pinta con las MISMAS hojas
   de estilo y los mismos iconos que el estudio, y lo que se hace sobre ella
   vuelve al estudio como eventos sobre el elemento real.

   Las fotos siguientes no reemplazan el panel: se lo REMIENDA (morph), nodo
   por nodo, para que no salten el scroll, el foco ni el campo que se está
   escribiendo.

   Si en dos segundos nadie contesta (ventana abierta por file://, modo
   seguro), queda el dibujo a mano de siempre de animation_panel.html.
   ══════════════════════════════════════════════════════════════════════════ */
(function () {
  "use strict";
  if (typeof BroadcastChannel !== "function" || !/^https?:$/.test(location.protocol)) return;
  const kind = (location.hash.match(/kind=([a-z]+)/) || [])[1]
    || new URLSearchParams(location.search).get("kind") || "timeline";
  const canal = new BroadcastChannel("low-panel-espejo");
  const enviar = (m) => canal.postMessage(Object.assign({ kind }, m));
  let activo = false, raices = [], flot = [], cuerpo = null, barra = null, sprite = null, propio = false;

  /* El tamaño sale de la VENTANA, no del contenido: medido el cuerpo, un
     panel que se mide por su contenido (el riel) informaba 0, el estudio lo
     dejaba de 60 px y la ventana quedaba clavada en 60. */
  let ultimoTam = "";
  const tam = () => ({ w: Math.round(innerWidth), h: Math.round(innerHeight - (barra ? barra.offsetHeight : 34)) });
  const avisarTam = () => { const t = tam(), k = t.w + "x" + t.h; if (k === ultimoTam) return; ultimoTam = k; enviar(Object.assign({ t: "tam" }, t)); };
  // saludar hasta que conteste: la ventana puede abrir antes de que el estudio
  // termine de anotar el panel como separado
  let intentos = 0;
  const saludo = setInterval(() => { if (activo || ++intentos > 30) return clearInterval(saludo); enviar(Object.assign({ t: "hola" }, tam())); }, 400);
  enviar(Object.assign({ t: "hola" }, tam()));

  canal.onmessage = ({ data }) => {
    if (!data || data.kind !== kind) return;
    if (data.t === "foto" && data.foto) { if (!activo) activar(); pintar(data.foto); }
  };

  /* ── pasar de la página vieja al espejo ──────────────────────────────── */
  function activar() {
    activo = true; window.__lowEspejo = true;
    // fuera las hojas propias de esta página: pisarían las del estudio
    document.querySelectorAll("head style, head link[rel=stylesheet]").forEach((s) => { s.disabled = true; s.dataset.propia = "1"; });
    document.querySelectorAll(".top, .commands, .viewport").forEach((n) => { n.style.display = "none"; });
    // el sprite viejo de esta página repite ids (#i-cursor…) con otro dibujo, y
    // un <use> toma el PRIMERO del documento: escondido no alcanza, se va
    document.querySelectorAll(".icon-sprite").forEach((n) => n.remove());
    const base = document.createElement("style");
    base.dataset.espejoBase = "1";
    base.textContent =
      "html,body{margin:0!important;height:100%!important;overflow:hidden!important}" +
      "body.dz-espejo-ventana{display:flex!important;flex-direction:column!important;background:var(--bg,#151514)}" +
      ".espejo-barra{flex:none;height:34px;display:flex;align-items:center;gap:8px;padding:0 6px 0 12px;" +
      "background:var(--panel2,#232220);border-bottom:1px solid var(--moho-borde,rgba(0,0,0,.6));color:var(--fg2,#aaa59c);" +
      "font:600 11px/1 Figtree,'Segoe UI',sans-serif;letter-spacing:.06em;user-select:none}" +
      ".espejo-barra b{color:var(--accent,#F0450E);font-weight:800;letter-spacing:.08em}" +
      ".espejo-barra span{flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase}" +
      ".espejo-barra button{height:24px;padding:0 10px;border:0;border-radius:3px;background:var(--accent,#F0450E);color:#fff;" +
      "font:600 11px/1 Figtree,'Segoe UI',sans-serif;cursor:pointer}" +
      ".espejo-barra button:hover{filter:brightness(1.12)}" +
      "#espejo{flex:1 1 auto;min-height:0;position:relative;overflow:hidden;display:flex;flex-direction:column}" +
      "#espejo.propio{align-items:flex-start}" +
      "#espejoFlot{position:fixed;inset:0;pointer-events:none;z-index:2147483000}" +
      "#espejoFlot>*{pointer-events:auto}" +
      /* lo que en el estudio sirve para sacarlo o moverlo, acá no tiene sentido */
      "#espejo .dz-external,#espejo .dz-redock,#espejo .dz-op-x{display:none!important}";
    document.head.appendChild(base);
    barra = document.createElement("div"); barra.className = "espejo-barra";
    const titulo = (document.getElementById("mode") || {}).textContent || kind;
    barra.innerHTML = "<b>LOW</b><span></span><button type=\"button\" id=\"espejoAcoplar\">Acoplar</button>";
    barra.querySelector("span").textContent = titulo;
    barra.querySelector("button").title = "Volver a acoplar este panel en LOW";
    barra.querySelector("button").onclick = () => { const d = document.getElementById("dock"); if (d) d.click(); };
    cuerpo = document.createElement("div"); cuerpo.id = "espejo";
    const capa = document.createElement("div"); capa.id = "espejoFlot";
    document.body.append(barra, cuerpo, capa);
    sprite = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    sprite.setAttribute("aria-hidden", "true");
    sprite.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    sprite.appendChild(document.createElementNS("http://www.w3.org/2000/svg", "defs"));
    document.body.appendChild(sprite);
    addEventListener("resize", avisarTam);
    escuchar();
    avisarTam();
  }

  /* ── pintar la foto ──────────────────────────────────────────────────── */
  function desdeHtml(html) {
    const t = document.createElement("template"); t.innerHTML = html;
    return t.content.firstElementChild;
  }
  function estilos(css) {
    document.querySelectorAll("[data-espejo-css]").forEach((n) => n.remove());
    const ancla = document.querySelector("style[data-espejo-base]");
    (css.links || []).forEach((href) => {
      const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; l.dataset.espejoCss = "1";
      document.head.insertBefore(l, ancla);
    });
    (css.textos || []).forEach((txt) => {
      const s = document.createElement("style"); s.textContent = txt; s.dataset.espejoCss = "1";
      document.head.insertBefore(s, ancla);
    });
  }
  function copiarAtributos(n, attrs, extra) {
    if (!attrs) return;
    [...n.attributes].forEach((a) => { if (!(a.name in attrs)) n.removeAttribute(a.name); });
    Object.entries(attrs).forEach(([k, v]) => { if (n.getAttribute(k) !== v) n.setAttribute(k, v); });
    if (extra) n.classList.add(extra);
  }
  /** Los contenedores del panel en el estudio, sin caja propia. */
  function cascarones(anc) {
    let p = cuerpo;
    (anc || []).forEach((a) => {
      const s = document.createElement(a.tag === "body" || a.tag === "html" ? "div" : a.tag);
      if (a.id) s.id = a.id;
      if (a.cls) s.setAttribute("class", a.cls);
      s.style.setProperty("display", "contents", "important");
      p.appendChild(s); p = s;
    });
    return p;
  }
  function encajar(el, i, total) {
    const pon = (p, v) => el.style.setProperty(p, v, "important");
    pon("position", "relative"); pon("left", "auto"); pon("top", "auto"); pon("right", "auto"); pon("bottom", "auto");
    pon("margin", "0"); pon("transform", "none"); pon("max-width", "none"); pon("max-height", "none");
    pon("visibility", "visible");
    if (!propio) pon("width", "100%");
    if (i === total - 1) { pon("flex", "1 1 auto"); pon("min-height", "0"); pon("height", total > 1 ? "auto" : "100%"); }
    else { pon("flex", "none"); pon("height", "auto"); }
  }
  function pintar(f) {
    if (f.css) estilos(f.css);
    copiarAtributos(document.documentElement, f.html);
    copiarAtributos(document.body, f.body, "dz-espejo-ventana");
    propio = !!f.propio; cuerpo.classList.toggle("propio", propio);
    if (f.simbolos && f.simbolos.length) {
      const defs = sprite.firstChild;
      f.simbolos.forEach((s) => { const t = document.createElementNS("http://www.w3.org/2000/svg", "svg"); t.innerHTML = s;
        const sym = t.firstElementChild; if (!sym) return; const viejo = sym.id && document.getElementById(sym.id);
        if (viejo && sprite.contains(viejo)) viejo.remove(); defs.appendChild(sym); });
    }
    (f.raices || []).forEach((r, i) => {
      const nuevo = desdeHtml(r.html); if (!nuevo) return;
      if (!raices[i] || !raices[i].isConnected) {
        cascarones(r.anc).appendChild(nuevo); raices[i] = nuevo;
      } else raices[i] = morph(raices[i], nuevo);
      encajar(raices[i], i, f.raices.length);
    });
    // flotantes: lo que el panel abrió (un cajón, un menú)
    const capa = document.getElementById("espejoFlot");
    const lista = f.flot || [];
    lista.forEach((fl, j) => {
      const nuevo = desdeHtml(fl.html); if (!nuevo) return;
      if (!flot[j] || !flot[j].isConnected) { capa.appendChild(nuevo); flot[j] = nuevo; }
      else flot[j] = morph(flot[j], nuevo);
      const el = flot[j], W = innerWidth, H = innerHeight;
      const x = Math.max(4, Math.min(W - fl.w - 4, fl.x)), y = Math.max(38, Math.min(H - fl.h - 4, fl.y + 6));
      const pon = (p, v) => el.style.setProperty(p, v, "important");
      pon("position", "fixed"); pon("left", x + "px"); pon("top", y + "px"); pon("right", "auto"); pon("bottom", "auto");
      pon("transform", "none"); pon("visibility", "visible"); pon("margin", "0");
      pon("max-width", (W - 8) + "px"); pon("max-height", (H - 42) + "px");
    });
    flot.splice(lista.length).forEach((n) => n.remove());
    avisarTam();      // las hojas del estudio pueden cambiar el alto de la barra
  }

  /** Remienda `a` para que quede como `b`, conservando los nodos. */
  function morph(a, b) {
    if (a.nodeType !== b.nodeType || a.nodeName !== b.nodeName) { a.replaceWith(b); return b; }
    if (a.nodeType === 3 || a.nodeType === 8) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return a; }
    if (a.nodeType !== 1) return a;
    const raiz = raices.includes(a) || flot.includes(a);
    for (const at of [...a.attributes]) if (!b.hasAttribute(at.name) && !(raiz && at.name === "style")) a.removeAttribute(at.name);
    for (const at of b.attributes) {
      if (raiz && at.name === "style") continue;          // lo pone encajar()
      if (a.getAttribute(at.name) !== at.value) a.setAttribute(at.name, at.value);
    }
    if (raiz && b.hasAttribute("style")) {
      // el estilo propio del panel, debajo de lo que fuerza encajar()
      const fuerza = {}; for (const p of a.style) if (a.style.getPropertyPriority(p) === "important") fuerza[p] = a.style.getPropertyValue(p);
      a.setAttribute("style", b.getAttribute("style"));
      Object.entries(fuerza).forEach(([p, v]) => a.style.setProperty(p, v, "important"));
    }
    const ac = [...a.childNodes], bc = [...b.childNodes];
    for (let i = 0; i < bc.length; i++) { if (i < ac.length) morph(ac[i], bc[i]); else a.appendChild(bc[i]); }
    for (let i = bc.length; i < ac.length; i++) ac[i].remove();
    const enUso = document.activeElement === a;
    if (a.tagName === "INPUT" && !enUso) {
      if (a.type === "checkbox" || a.type === "radio") a.checked = b.hasAttribute("checked");
      else if (a.type !== "file") { const v = b.getAttribute("value") || ""; if (a.value !== v) a.value = v; }
    } else if (a.tagName === "SELECT" && !enUso) {
      const i = [...a.options].findIndex((o) => o.hasAttribute("selected")); if (i >= 0) a.selectedIndex = i;
    } else if (a.tagName === "TEXTAREA" && !enUso) { if (a.value !== b.textContent) a.value = b.textContent; }
    return a;
  }

  /* ── lo que se hace acá, allá ────────────────────────────────────────── */
  function ubicar(t) {
    if (!t || t.nodeType !== 1) t = t && t.parentElement;
    if (!t) return null;
    const todas = raices.concat(flot);
    for (let i = 0; i < todas.length; i++) {
      const r = todas[i];
      if (!r || !r.contains(t)) continue;
      const camino = [];
      for (let n = t; n !== r; n = n.parentElement) camino.unshift([...n.parentElement.children].indexOf(n));
      return { raiz: i, camino, r, el: t };
    }
    return null;
  }
  const campo = (t) => !!(t && t.closest && t.closest("input,select,textarea,[contenteditable=true]"));
  // la cabecera de un panel lo mueve o lo saca en el estudio: acá, nada
  const cabecera = (t) => !!(t.closest("[data-dock-wire]") && !t.closest("button,input,select,label"));
  function mandar(tipo, e, u, extra) {
    const rr = u.r.getBoundingClientRect();
    enviar({ t: "ev", ev: Object.assign({ tipo, raiz: u.raiz, camino: u.camino, tag: u.el.tagName,
      x: (e.clientX || 0) - rr.left, y: (e.clientY || 0) - rr.top, vx: e.clientX || 0, vy: e.clientY || 0,
      button: e.button, buttons: e.buttons, detail: e.detail, ptype: e.pointerType, pressure: e.pressure,
      shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey }, extra || {}) });
  }
  function escuchar() {
    let apretado = null, movida = null, rafMov = 0;
    const soltarMovida = () => { if (movida && apretado) mandar("pointermove", movida, apretado); movida = null; rafMov = 0; };
    document.addEventListener("pointerdown", (e) => {
      const u = ubicar(e.target); if (!u || campo(e.target) || cabecera(e.target)) return;
      apretado = u;
      try { e.target.setPointerCapture(e.pointerId); } catch (_) { /* nada */ }
      mandar("pointerdown", e, u);
    }, true);
    document.addEventListener("pointermove", (e) => {
      if (!apretado) return;
      movida = e; if (!rafMov) rafMov = requestAnimationFrame(soltarMovida);
    }, true);
    const fin = (tipo) => (e) => {
      if (!apretado) return;
      if (rafMov) { cancelAnimationFrame(rafMov); soltarMovida(); }
      mandar(tipo, e, apretado); apretado = null;
    };
    document.addEventListener("pointerup", fin("pointerup"), true);
    document.addEventListener("pointercancel", fin("pointercancel"), true);
    ["click", "dblclick", "contextmenu", "auxclick"].forEach((tipo) => document.addEventListener(tipo, (e) => {
      const u = ubicar(e.target); if (!u) return;
      if (tipo === "contextmenu") e.preventDefault();
      if (e.target.closest("a[href]")) e.preventDefault();
      // un tilde se manda como "change" (con su valor): mandar también el clic lo destildaría allá
      const tilde = e.target.closest("input[type=checkbox],input[type=radio]")
        || (e.target.closest("label") && e.target.closest("label").control
          && /checkbox|radio/.test(e.target.closest("label").control.type));
      if (tilde || (campo(e.target) && tipo === "click")) return;
      if (cabecera(e.target)) return;
      mandar(tipo, e, u);
    }, true));
    ["input", "change"].forEach((tipo) => document.addEventListener(tipo, (e) => {
      const u = ubicar(e.target); if (!u) return;
      mandar(tipo, e, u, { value: e.target.value, checked: !!e.target.checked });
    }, true));
    document.addEventListener("focusin", (e) => { const u = ubicar(e.target); if (u && campo(e.target)) mandar("foco", e, u); }, true);
    document.addEventListener("focusout", (e) => { const u = ubicar(e.target); if (u && campo(e.target)) mandar("desenfoco", e, u); }, true);
    let rafScroll = 0; const pendientes = new Set();
    document.addEventListener("scroll", (e) => {
      if (!ubicar(e.target)) return;
      pendientes.add(e.target);
      if (!rafScroll) rafScroll = requestAnimationFrame(() => {
        rafScroll = 0;
        pendientes.forEach((t) => { const u = ubicar(t); if (u) mandar("scroll", {}, u, { st: t.scrollTop, sl: t.scrollLeft }); });
        pendientes.clear();
      });
    }, true);
    document.addEventListener("wheel", (e) => {
      if (!(e.ctrlKey || e.altKey || e.metaKey)) return;     // la rueda sola desplaza acá mismo
      const u = ubicar(e.target); if (!u) return;
      e.preventDefault(); mandar("wheel", e, u, { dx: e.deltaX, dy: e.deltaY });
    }, { capture: true, passive: false });
    ["keydown", "keyup"].forEach((ktipo) => document.addEventListener(ktipo, (e) => {
      if (barra && barra.contains(e.target)) return;
      const datos = { ktipo, key: e.key, code: e.code, repeat: e.repeat, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey };
      const u = ubicar(e.target);
      if (u && campo(e.target)) {
        // en un campo se escribe acá; allá sólo importan las teclas que confirman
        if (ktipo === "keydown" && /^(Enter|Escape|Tab|ArrowUp|ArrowDown)$/.test(e.key))
          enviar({ t: "ev", ev: Object.assign({ tipo: "tecla", raiz: u.raiz, camino: u.camino, tag: u.el.tagName }, datos) });
        return;
      }
      // un atajo (Ctrl+Z, la barra espaciadora…) vale como apretado en el estudio
      if (e.ctrlKey || e.metaKey || e.key === " " || /^Arrow/.test(e.key)) e.preventDefault();
      enviar({ t: "ev", ev: Object.assign({ tipo: "tecla", raiz: null }, datos) });
    }, true));
  }
})();
