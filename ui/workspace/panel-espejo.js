/* ══════════════════════════════════════════════════════════════════════════
   EL PANEL SEPARADO ES EL MISMO PANEL

   Reporte de Mauro (oct-2026, LOW 3.12): «la división de ventanas de
   herramientas desacopladas todavía no funciona bien, pierde el estilo».

   QUÉ HABÍA. La ventana separada (animation_panel.html) es otra página, que
   VOLVÍA A DIBUJAR cada panel a mano a partir de una foto chica del estado.
   Por más que se le copiaran colores (design/panel-separado.css, v3.2), nunca
   fue el mismo panel. Medido en la app real:
   · Capas mostraba los ids internos (`dz-l-1`), glifos sueltos y una barra de
     opacidad; sin Fusión, sin Z, sin los botones de abajo.
   · Color decía «Elegí un elemento en el lienzo» en vez del muestrario, la
     opacidad, el grosor y el suavizado.
   · Herramientas era una grilla, con «Esculpir t…» escrito en vez del icono.
   · Papel cebolla no entraba en su ventana.
   Cada panel nuevo era un panel más para copiar a mano, y siempre quedaba
   atrás.

   QUÉ HACE ESTO. La ventana separada muestra EL PANEL DE VERDAD: su HTML, con
   las mismas hojas de estilo y los mismos iconos, y lo que se hace allá
   (clics, arrastres, campos, teclas) vuelve acá como eventos sobre el
   elemento real. No hay una segunda versión que mantener.

   · El original no se esconde: se muda a un rincón fuera de la pantalla
     (design/panel-espejo.css), del mismo tamaño que la otra ventana. Sigue
     vivo —el editor lo sigue repintando como siempre— y sus coordenadas
     sirven para los arrastres que llegan de allá.
   · Mientras está afuera, `panel.hidden` responde `false`: varios repintados
     se saltean un panel oculto (dzTlGridRender, el esqueleto) y el espejo
     quedaría congelado.
   · Las dos ventanas son del mismo origen (main.py abre la separada en
     http://127.0.0.1:<puerto>/animation_panel.html): hablan por un
     BroadcastChannel, en orden y sin pasar por Python.
   · Lo que el panel abre al tocarlo (un cajón, un menú) se muestra allá, en
     el lugar del clic, y acá queda invisible.

   Si la ventana se abre por file:// (modo seguro) no hay canal: queda el
   dibujo a mano de siempre, que sigue en animation_panel.html.

   @module workspace/panel-espejo
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  if (typeof BroadcastChannel !== "function") return;
  const LOW = global.LOW = global.LOW || {};
  const CANAL = "low-panel-espejo";
  /* qué elementos son cada panel. Una lista de selectores CSS: el primero
     que exista (color es el bloque de estilo entero, no sólo el muestrario). */
  const RAICES = {
    layers: [".dz-inspector"],
    tools: [".dz-tools"],
    color: ["#dzStyle, #dzPalette"],
    onion: ["#dzOnionPanel"],
    levelstrip: ["#dzLevelStrip"],
    rig: ["#dzRigPanel"],
    timeline: ["#dzTimeline", "#dzTlGrid"],
    xsheet: ["#dzXsheet"],
  };
  /* el riel conserva su ancho: estirado al ancho de la ventana deja de ser un
     riel y sus botones quedan desparramados */
  const ANCHO_PROPIO = new Set(["tools"]);
  const PROPIOS = ["--espejo-x", "--espejo-y", "--espejo-w", "--espejo-h", "--espejo-d"];

  const canal = new BroadcastChannel(CANAL);
  const activos = new Map();
  let host = null, despachando = false;

  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const afuera = (kind) => {
    const d = dz(); if (!d) return false;
    return !!(d.detached && d.detached.has(kind)) || !!(d.detachedAnimationPanels && d.detachedAnimationPanels.has(kind));
  };

  /* ── dónde vive el original mientras tanto ─────────────────────────────── */
  function anfitrion() {
    if (host && host.isConnected) return host;
    host = document.createElement("div");
    host.className = "dz-espejo-host"; host.setAttribute("aria-hidden", "true");
    (document.getElementById("designView") || document.body).appendChild(host);
    return host;
  }
  /** La cadena de contenedores del panel, de afuera hacia adentro, para que
   *  los selectores que dependen de ellos (`#designView .dz-op-head`, el tema
   *  de Moho) valgan igual en la otra ventana. */
  function cadena(el) {
    const out = [];
    for (let n = el.parentElement; n && n !== document.body && n !== document.documentElement; n = n.parentElement)
      out.unshift({ tag: n.tagName.toLowerCase(), id: n.id || "", cls: n.getAttribute("class") || "" });
    return out;
  }
  /** Cascarones sin caja (display: contents) con las mismas clases. Sin ids:
   *  un `#dzInspector` repetido haría dudar a `$()`. #designView no se repite:
   *  el anfitrión ya vive adentro. */
  function cascaron(anc) {
    let p = anfitrion();
    anc.filter((a) => a.id !== "designView").forEach((a) => {
      const s = document.createElement(a.tag === "body" ? "div" : a.tag);
      s.setAttribute("class", ((a.cls || "") + " dz-espejo-cascaron").trim());
      p.appendChild(s); p = s;
    });
    return p;
  }

  function empezar(kind) {
    if (activos.has(kind)) return activos.get(kind);
    const els = (RAICES[kind] || []).map((s) => document.querySelector(s)).filter(Boolean);
    if (!els.length) return null;
    const st = { kind, els, origen: [], anc: [], ocultoPedido: [], displays: [], w: 0, h: 0,
      sucio: true, seq: 0, firmaCss: "", simbolos: new Set(), flot: [], obs: null, sinCompat: false };
    els.forEach((el, i) => {
      st.anc[i] = cadena(el);
      st.origen[i] = { padre: el.parentNode, sig: el.nextSibling };
      st.ocultoPedido[i] = el.hidden;
      cascaron(st.anc[i]).appendChild(el);
      // `hidden` responde false mientras está afuera; lo que se pida queda anotado
      Object.defineProperty(el, "hidden", { configurable: true, get: () => false,
        set: (v) => { st.ocultoPedido[i] = !!v; } });
      el.removeAttribute("hidden");
      el.classList.add("dz-espejado");
      const d = getComputedStyle(el).display;
      st.displays[i] = d && d !== "none" ? d : "block";
      el.style.setProperty("--espejo-d", st.displays[i]);
    });
    st.obs = new MutationObserver((recs) => {
      for (const r of recs) {
        if (r.type === "attributes" && r.attributeName === "hidden" && st.els.includes(r.target)
          && r.target.hasAttribute("hidden")) r.target.removeAttribute("hidden");
      }
      st.sucio = true;
    });
    els.forEach((el) => {
      st.obs.observe(el, { subtree: true, childList: true, attributes: true, characterData: true });
      el.addEventListener("input", marcar, true); el.addEventListener("change", marcar, true);
    });
    activos.set(kind, st);
    vigilarFlotantes();
    return st;
  }
  function marcar() { activos.forEach((st) => { st.sucio = true; }); }

  function parar(kind) {
    const st = activos.get(kind);
    if (!st) return;
    activos.delete(kind);
    st.obs.disconnect();
    st.flot.forEach((f) => f.el.classList.remove("dz-espejo-flotante"));
    st.els.forEach((el, i) => {
      el.removeEventListener("input", marcar, true); el.removeEventListener("change", marcar, true);
      const o = st.origen[i];
      const casc = el.parentNode;
      if (o.padre && o.padre.isConnected) {
        if (o.sig && o.sig.parentNode === o.padre) o.padre.insertBefore(el, o.sig);
        else o.padre.appendChild(el);
      }
      // el cascarón vacío se va; si quedó algo adentro (otro panel), se queda
      let c = casc;
      while (c && c !== host && c.classList && c.classList.contains("dz-espejo-cascaron") && !c.childElementCount) {
        const p = c.parentNode; c.remove(); c = p;
      }
      delete el.hidden;
      el.hidden = st.ocultoPedido[i];
      el.classList.remove("dz-espejado", "dz-espejo-mostrar");
      PROPIOS.forEach((p) => el.style.removeProperty(p));
    });
    if (!activos.size) vigilarFlotantes();
    canal.postMessage({ t: "fin", kind });
  }

  /* ── el tamaño de la otra ventana ─────────────────────────────────────── */
  function medidas(st) {
    const banda = -40000 - Object.keys(RAICES).indexOf(st.kind) * 4000;
    let y = 0;
    st.els.forEach((el, i) => {
      const ultimo = i === st.els.length - 1;
      const pon = (p, v) => { if (el.style.getPropertyValue(p) !== v) el.style.setProperty(p, v); };
      pon("--espejo-x", banda + "px");
      pon("--espejo-y", y + "px");
      pon("--espejo-w", ANCHO_PROPIO.has(st.kind) ? "auto" : Math.max(120, st.w) + "px");
      pon("--espejo-h", ultimo ? Math.max(60, st.h - y) + "px" : "auto");
      // lo escondieron con style.display (no con `hidden`): se fuerza a la vista
      if (getComputedStyle(el).display === "none") el.classList.add("dz-espejo-mostrar");
      y += el.offsetHeight;
    });
  }

  /* ── la foto: el HTML real, con los valores vivos de los campos ───────── */
  function serializar(el) {
    const c = el.cloneNode(true);
    const a = el.querySelectorAll("input,select,textarea"), b = c.querySelectorAll("input,select,textarea");
    a.forEach((x, i) => {
      const y = b[i]; if (!y) return;
      if (x.type === "checkbox" || x.type === "radio") y.toggleAttribute("checked", x.checked);
      else if (x.tagName === "SELECT") [...y.options].forEach((o, j) => o.toggleAttribute("selected", j === x.selectedIndex));
      else if (x.tagName === "TEXTAREA") y.textContent = x.value;
      else if (x.type !== "file") y.setAttribute("value", x.value);
    });
    const ca = el.querySelectorAll("canvas"), cb = c.querySelectorAll("canvas");
    ca.forEach((x, i) => {
      const y = cb[i]; if (!y) return;
      const img = document.createElement("img");
      for (const at of y.attributes) img.setAttribute(at.name, at.value);
      try { img.src = x.toDataURL(); } catch (_) { /* lienzo contaminado: queda vacío */ }
      img.style.width = img.style.width || x.clientWidth + "px";
      img.style.height = img.style.height || x.clientHeight + "px";
      y.replaceWith(img);
    });
    c.classList.remove("dz-espejado", "dz-espejo-mostrar");
    if (!c.getAttribute("class")) c.removeAttribute("class");
    c.removeAttribute("hidden");
    PROPIOS.forEach((p) => c.style.removeProperty(p));
    if (!c.getAttribute("style")) c.removeAttribute("style");
    return c.outerHTML;
  }
  function atributos(n) {
    const o = {};
    for (const at of n.attributes) o[at.name] = at.value;
    return o;
  }
  function estilos() {
    const links = [...document.querySelectorAll('link[rel="stylesheet"]')]
      .filter((l) => !l.disabled).map((l) => l.getAttribute("href")).filter(Boolean);
    const textos = [...document.querySelectorAll("style")].map((s) => s.textContent || "");
    return { links, textos };
  }
  function simbolos(st, html) {
    const ids = new Set();
    html.replace(/href="#([^"]+)"/g, (_, id) => { ids.add(id); return ""; });
    const nuevos = [];
    ids.forEach((id) => {
      if (st.simbolos.has(id)) return;
      const s = document.getElementById(id);
      if (s && s.tagName.toLowerCase() === "symbol") { nuevos.push(s.outerHTML); st.simbolos.add(id); }
    });
    return nuevos;
  }

  function foto(st) {
    medidas(st);
    const raices = st.els.map((el, i) => ({ html: serializar(el), anc: st.anc[i] }));
    const flot = st.flot.filter((f) => visible(f.el)).map((f) => {
      const r = f.el.getBoundingClientRect();
      return { html: serializar(f.el), x: f.x, y: f.y, w: Math.ceil(r.width), h: Math.ceil(r.height) };
    });
    const todo = raices.map((r) => r.html).join("") + flot.map((f) => f.html).join("");
    const css = estilos(), firma = css.links.join("|") + "#" + css.textos.reduce((n, t) => n + t.length, 0);
    const out = { v: 1, seq: ++st.seq, raices, flot, simbolos: simbolos(st, todo),
      html: atributos(document.documentElement), body: atributos(document.body), propio: ANCHO_PROPIO.has(st.kind) };
    if (firma !== st.firmaCss) { out.css = css; st.firmaCss = firma; }
    return out;
  }

  function publicar() {
    activos.forEach((st) => {
      // lo acoplaron por un camino que no pasó por "dock": vuelve igual
      if (!afuera(st.kind)) { parar(st.kind); return; }
      // el editor lo devolvió a un muelle por su cuenta: se lo vuelve a buscar
      st.els.forEach((el, i) => {
        if (!el.isConnected) return;
        if (!el.classList.contains("dz-espejado") || !host || !host.contains(el)) {
          st.origen[i] = { padre: el.parentNode, sig: el.nextSibling };
          cascaron(st.anc[i]).appendChild(el); el.classList.add("dz-espejado"); st.sucio = true;
        }
      });
      // un flotante que se cerró ya no es del espejo
      const antes = st.flot.length;
      st.flot = st.flot.filter((f) => {
        if (f.el.isConnected && visible(f.el)) return true;
        f.el.classList.remove("dz-espejo-flotante"); return false;
      });
      if (st.flot.length !== antes) st.sucio = true;
      if (!st.sucio || !st.w) return;
      st.sucio = false;
      try { canal.postMessage({ t: "foto", kind: st.kind, foto: foto(st) }); }
      catch (e) { console.warn("panel separado: no pude mandar la foto", e); }
    });
  }
  let prontoT = 0;
  function pronto() { clearTimeout(prontoT); prontoT = setTimeout(publicar, 16); }
  setInterval(() => { if (activos.size) publicar(); }, 120);

  /* ── lo que el panel abre al tocarlo ──────────────────────────────────── */
  // los flotantes reclamados están invisibles A PROPÓSITO: eso no cuenta
  const visible = (el) => {
    if (el.hidden) return false;
    const cs = getComputedStyle(el);
    if (cs.display === "none") return false;
    return el.classList.contains("dz-espejo-flotante") || cs.visibility !== "hidden";
  };
  let reclamo = null, obsBody = null;
  function vigilarFlotantes() {
    if (activos.size && !obsBody) {
      obsBody = new MutationObserver((recs) => {
        if (!reclamo || performance.now() > reclamo.hasta) return;
        const st = activos.get(reclamo.kind); if (!st) return;
        const cand = new Set();
        recs.forEach((r) => {
          if (r.type === "childList") r.addedNodes.forEach((n) => { if (n.nodeType === 1 && n.parentNode === document.body) cand.add(n); });
          else if (r.target.parentNode === document.body) cand.add(r.target);
        });
        cand.forEach((el) => {
          if (el === host || st.flot.some((f) => f.el === el) || el.classList.contains("dz-espejo-flotante")) return;
          if (!visible(el)) return;
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) return;
          // un modal que tapa toda la ventana se queda acá: no entra en la otra
          if (r.width * r.height > innerWidth * innerHeight * .8) return;
          el.classList.add("dz-espejo-flotante");
          st.flot.push({ el, x: reclamo.x, y: reclamo.y });
          st.sucio = true; pronto();
        });
      });
      obsBody.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "class", "style"] });
    } else if (!activos.size && obsBody) { obsBody.disconnect(); obsBody = null; }
  }

  /* ── los eventos que llegan de la otra ventana ────────────────────────── */
  const capturaOriginal = { set: Element.prototype.setPointerCapture, rel: Element.prototype.releasePointerCapture };
  // un puntero sintético no se puede capturar: el editor lo intenta y tiraría
  Element.prototype.setPointerCapture = function (id) {
    try { return capturaOriginal.set.call(this, id); } catch (e) { if (!despachando) throw e; }
  };
  Element.prototype.releasePointerCapture = function (id) {
    try { return capturaOriginal.rel.call(this, id); } catch (e) { if (!despachando) throw e; }
  };

  function ubicar(st, ev) {
    const n = st.els.length;
    let el = ev.raiz < n ? st.els[ev.raiz] : (st.flot[ev.raiz - n] || {}).el;
    const raiz = el;
    for (const i of ev.camino || []) { el = el && el.children[i]; }
    if (!el || (ev.tag && el.tagName !== ev.tag)) return null;     // desincronizado: mejor nada
    return { el, raiz };
  }
  function recibir(kind, ev) {
    const st = activos.get(kind);
    if (!st || !ev) return;
    // un atajo apretado con la otra ventana al frente vale como apretado acá
    if (ev.tipo === "tecla" && ev.raiz == null) return tecla(document.body, ev);
    const u = ubicar(st, ev);
    if (!u) return;
    const { el, raiz } = u;
    const r = raiz.getBoundingClientRect();
    const cx = r.left + (+ev.x || 0), cy = r.top + (+ev.y || 0);
    const mods = { shiftKey: !!ev.shift, ctrlKey: !!ev.ctrl, altKey: !!ev.alt, metaKey: !!ev.meta };
    const raton = { bubbles: true, cancelable: true, composed: true, view: global, clientX: cx, clientY: cy,
      screenX: cx, screenY: cy, button: +ev.button || 0, buttons: +ev.buttons || 0, detail: +ev.detail || 0, ...mods };
    despachando = true;
    try {
      switch (ev.tipo) {
        case "pointerdown": case "pointermove": case "pointerup": case "pointercancel": {
          const ok = el.dispatchEvent(new PointerEvent(ev.tipo, { ...raton, pointerId: 1, isPrimary: true,
            pointerType: ev.ptype || "mouse", pressure: ev.tipo === "pointerup" ? 0 : (+ev.pressure || .5) }));
          if (ev.tipo === "pointerdown") st.sinCompat = !ok;
          // como el navegador: tras el puntero, el ratón (salvo que lo cancelen)
          const compat = { pointerdown: "mousedown", pointermove: "mousemove", pointerup: "mouseup" }[ev.tipo];
          if (compat && !st.sinCompat) el.dispatchEvent(new MouseEvent(compat, raton));
          if (ev.tipo === "pointerup" || ev.tipo === "pointercancel") st.sinCompat = false;
          break;
        }
        case "click": case "dblclick": case "contextmenu": case "auxclick":
          reclamo = { kind, hasta: performance.now() + 700, x: +ev.vx || 0, y: +ev.vy || 0 };
          el.dispatchEvent(new MouseEvent(ev.tipo, raton));
          break;
        case "input": case "change":
          if (el.type === "checkbox" || el.type === "radio") el.checked = !!ev.checked;
          else if ("value" in el) el.value = ev.value == null ? "" : String(ev.value);
          el.dispatchEvent(new Event(ev.tipo, { bubbles: true }));
          break;
        case "foco": try { el.focus({ preventScroll: true }); } catch (_) { /* no enfocable */ } break;
        case "desenfoco": if (document.activeElement === el) el.blur(); break;
        case "scroll": el.scrollTop = +ev.st || 0; el.scrollLeft = +ev.sl || 0; break;
        case "wheel":
          el.dispatchEvent(new WheelEvent("wheel", { ...raton, deltaX: +ev.dx || 0, deltaY: +ev.dy || 0, deltaMode: 0 }));
          break;
        case "tecla": tecla(el, ev); break;
      }
    } catch (e) { console.warn("panel separado: evento", ev.tipo, e); }
    finally { despachando = false; }
    st.sucio = true; pronto();
  }
  function tecla(el, ev) {
    const k = { key: ev.key, code: ev.code, bubbles: true, cancelable: true, composed: true,
      shiftKey: !!ev.shift, ctrlKey: !!ev.ctrl, altKey: !!ev.alt, metaKey: !!ev.meta, repeat: !!ev.repeat };
    (el || document.body).dispatchEvent(new KeyboardEvent(ev.ktipo === "keyup" ? "keyup" : "keydown", k));
    activos.forEach((st) => { st.sucio = true; }); pronto();
  }

  canal.onmessage = ({ data }) => {
    if (!data || !data.kind) return;
    if (data.t === "hola" || data.t === "tam") {
      if (!afuera(data.kind)) return;
      const st = empezar(data.kind); if (!st) return;
      st.w = Math.round(+data.w || 0); st.h = Math.round(+data.h || 0);
      if (data.t === "hola") { st.firmaCss = ""; st.simbolos = new Set(); }
      st.sucio = true; pronto();
    } else if (data.t === "ev") recibir(data.kind, data.ev);
  };

  // Acoplar —con el botón, con la X de la ventana o arrastrándola encima—
  // pasa siempre por lowPanelCommand("dock"): ahí el panel vuelve a su lugar.
  function envolverDock() {
    const orig = global.lowPanelCommand;
    if (typeof orig !== "function" || orig.__espejo) return;
    const env = function (msg) {
      try { if (msg && msg.action === "dock") parar(msg.kind); } catch (e) { console.warn(e); }
      return orig.apply(this, arguments);
    };
    env.__espejo = true;
    global.lowPanelCommand = env;
  }
  envolverDock();

  LOW.panelEspejo = { RAICES, activos, empezar, parar, publicar, recibir, get host() { return host; } };
})(window);
