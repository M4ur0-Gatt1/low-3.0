/* ══════════════════════════════════════════════════════════════════════════
   GUÍAS DESDE LA REGLA, COMO EN ILLUSTRATOR

   Pedido de Mauro (oct-2026): «quiero que agregues la posibilidad de poner
   guías como en Illustrator a partir de la regla».

   MEDIDO en la 3.37 (con el mouse de verdad): las reglas (Ctrl+R) y el
   arrastre desde la regla ya existían, pero
   - las guías se creaban en los datos y NO SE VEÍAN: su capa nace `hidden` y
     sólo se mostraba si `DZ.guidesOn === false`, que al arrancar no vale eso;
   - la regla estaba corrida 18 px: el «0» caía a 18 px de la hoja (las marcas
     se ubicaban desde el borde del lienzo y la regla arranca 18 px adentro);
   - no estaban en ningún menú, no se guardaban, no se deshacían y no imantaban.

   Acá, lo de Illustrator:
   - ARRASTRAR desde la regla de arriba (horizontal) o de la izquierda
     (vertical); con Alt, la otra orientación. Mientras se arrastra se lee la
     posición; cerca del borde o del centro de la hoja se imanta; Shift = de 10
     en 10.
   - Mover una guía arrastrándola; soltarla sobre una regla la BORRA; elegirla
     (clic) y Supr también. Doble clic: escribir la posición exacta.
   - IMANTAR: lo que arrastrás (bordes y centro) y las formas que dibujás se
     pegan a las guías (el mismo imán de alineación de siempre).
   - Vista → Reglas / Mostrar guías (Ctrl+Ñ) / Bloquear guías (Ctrl+Alt+Ñ) /
     Imantar a las guías (Ctrl+Shift+Ñ) / Borrar las guías. Ñ es la tecla del
     «;» de Illustrator en los teclados en castellano.
   - Las guías son de la ESCENA: se guardan con el documento y cada cambio es
     un paso de Ctrl+Z.

   @module drawing/guias
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const doc = global.document;
  const D = () => (typeof DZ !== "undefined" ? DZ : null);   // DZ es una variable global de app.js, no una propiedad de window
  const $ = (s) => doc.querySelector(s);
  const SVGNS = "http://www.w3.org/2000/svg";
  const REGLA = 18;   // el ancho de las reglas (app.css .dz-rl-*)

  /* ── las guías de la escena ── */
  let sueltas = [];   // sin documento abierto
  function escena() { const d = D(); return d && d.doc && d.doc.scene ? d.doc.scene : null; }
  function guias() {
    const sc = escena();
    if (!sc) return sueltas;
    if (!Array.isArray(sc.guias)) sc.guias = [];
    return sc.guias;
  }
  const copia = (gs) => gs.map((g) => ({ axis: g.axis, u: g.u }));
  /** app.js lee DZ.guides para saber si redibujar al hacer zoom: que lea las de la escena. */
  function engancharDZ() {
    const d = D();
    if (!d || d.__guiasDeEscena) return;
    try {
      Object.defineProperty(d, "guides", { configurable: true, get: guias,
        set(v) { const g = guias(); g.splice(0, g.length, ...(Array.isArray(v) ? v : [])); } });
      d.__guiasDeEscena = true;
    } catch (_) { /* DZ sellado: se sigue con las propias */ }
  }

  /* ── preferencias de vista (de cada uno, no del documento) ── */
  const pref = (k, def) => { try { const v = global.localStorage.getItem("low.guias." + k); return v == null ? def : v === "1"; } catch (_) { return def; } };
  const guardarPref = (k, v) => { try { global.localStorage.setItem("low.guias." + k, v ? "1" : "0"); } catch (_) { /* sin almacenamiento */ } };
  let bloqueadas = pref("bloqueadas", false);
  let iman = pref("iman", true);
  const visibles = () => { const d = D(); return !d || d.guidesOn !== false; };
  let elegida = -1;

  /* ── historial: cada cambio de guías es un paso de Ctrl+Z ── */
  function paso(texto, antes, despues) {
    const d = D();
    if (!d || JSON.stringify(antes) === JSON.stringify(despues)) return;
    escena()?.touch?.();
    if (!d.history && global.LOW?.core?.HistoryManager) d.history = new global.LOW.core.HistoryManager({ limit: 180 });
    d.history?.push({ label: texto, domain: "document", before: antes, after: despues,
      apply: (_dir, v) => { const g = guias(); g.splice(0, g.length, ...copia(v)); elegida = -1; dibujar(); } });
    if (typeof global.dzMarkDirty === "function") global.dzMarkDirty();
  }

  /* ── las reglas: las marcas desde el borde de CADA regla (estaban corridas 18 px) ── */
  function reglas() {
    const d = D(), cv = $("#dzCanvas");
    if (!d || !cv || !cv.querySelector(":scope > svg") || typeof global.dzToScreen !== "function") return;
    const caja = cv.getBoundingClientRect();
    const o = global.dzToScreen(0, 0);
    const escala = Math.abs(global.dzToScreen(1, 0).x - o.x) || 1;
    const paso_ = global.dzNiceStep(64 / escala);
    if (d.rulers) {
      for (const id of ["#dzRlTop", "#dzRlBottom"]) {
        const rl = $(id); if (!rl) continue;
        const dx = rl.getBoundingClientRect().left - caja.left;
        const a = global.dzToUser(caja.left, caja.top).x, b = global.dzToUser(caja.right, caja.top).x;
        let h = "";
        for (let t = Math.ceil(Math.min(a, b) / paso_) * paso_; t <= Math.max(a, b); t += paso_) {
          h += `<span class="dz-tk" style="left:${(global.dzToScreen(t, 0).x - dx).toFixed(1)}px"><i>${Math.round(t)}</i></span>`;
          h += `<span class="dz-tk mn" style="left:${(global.dzToScreen(t + paso_ / 2, 0).x - dx).toFixed(1)}px"></span>`;
        }
        rl.innerHTML = h;
      }
      for (const id of ["#dzRlLeft", "#dzRlRight"]) {
        const rl = $(id); if (!rl) continue;
        const dy = rl.getBoundingClientRect().top - caja.top;
        const a = global.dzToUser(caja.left, caja.top).y, b = global.dzToUser(caja.left, caja.bottom).y;
        let h = "";
        for (let t = Math.ceil(Math.min(a, b) / paso_) * paso_; t <= Math.max(a, b); t += paso_) {
          h += `<span class="dz-tk v" style="top:${(global.dzToScreen(0, t).y - dy).toFixed(1)}px"><i>${Math.round(t)}</i></span>`;
          h += `<span class="dz-tk v mn" style="top:${(global.dzToScreen(0, t + paso_ / 2).y - dy).toFixed(1)}px"></span>`;
        }
        rl.innerHTML = h;
      }
    }
    if (d.grid) {
      const g = $("#dzGrid2d"), celda = paso_ * escala;
      if (g) {
        g.style.backgroundSize = `${celda}px ${celda}px, ${celda}px ${celda}px, ${celda * 5}px ${celda * 5}px, ${celda * 5}px ${celda * 5}px`;
        g.style.backgroundPosition = `${o.x}px ${o.y}px`;
      }
    }
    dibujar();
  }

  /* ── las guías en pantalla: una línea por guía (sigue a la mesa girada) ── */
  function dibujar() {
    const box = $("#dzGuides");
    if (!box) return;
    const gs = guias();
    box.hidden = !visibles();
    box.classList.toggle("bloqueadas", bloqueadas);
    // como en Illustrator: las guías se agarran con las flechas; con el lápiz o
    // una forma se dibuja encima (arrancar a 2 px de una guía agarraba la guía)
    const herr = (D() && D().tool) || "select";
    box.classList.toggle("agarrables", !bloqueadas && (herr === "select" || herr === "direct"));
    box.textContent = "";
    if (!gs.length || box.hidden || typeof global.dzToScreen !== "function" || !$("#dzCanvas > svg")) return;
    const svg = doc.createElementNS(SVGNS, "svg");
    svg.setAttribute("class", "dz-guias-svg");
    gs.forEach((g, i) => {
      const L = 1e5;
      const a = g.axis === "h" ? global.dzToScreen(-L, g.u) : global.dzToScreen(g.u, -L);
      const b = g.axis === "h" ? global.dzToScreen(L, g.u) : global.dzToScreen(g.u, L);
      for (const clase of ["dz-guia-agarre", "dz-guia"]) {
        const ln = doc.createElementNS(SVGNS, "line");
        ln.setAttribute("x1", a.x.toFixed(1)); ln.setAttribute("y1", a.y.toFixed(1));
        ln.setAttribute("x2", b.x.toFixed(1)); ln.setAttribute("y2", b.y.toFixed(1));
        ln.setAttribute("class", clase + (i === elegida ? " on" : ""));
        ln.dataset.i = i; ln.dataset.axis = g.axis;
        if (clase === "dz-guia-agarre") ln.addEventListener("pointerdown", (e) => agarrar(e, i));
        svg.appendChild(ln);
      }
    });
    box.appendChild(svg);
  }

  /* ── arrastrar: tirar una nueva desde la regla o mover una ── */
  let lectura = null;
  function leer(e, g) {
    if (!lectura) { lectura = doc.createElement("div"); lectura.className = "dz-guia-lectura"; $("#dzCanvas").appendChild(lectura); }
    const cv = $("#dzCanvas").getBoundingClientRect();
    lectura.textContent = (g.axis === "h" ? "y " : "x ") + Math.round(g.u) + " px";
    lectura.style.left = (e.clientX - cv.left + 14) + "px";
    lectura.style.top = (e.clientY - cv.top + 14) + "px";
    lectura.hidden = false;
  }
  /** Cerca del borde o del centro de la hoja, la guía se pega ahí; Shift: de 10 en 10. */
  function ajustar(g, u, e) {
    if (e.shiftKey) return Math.round(u / 10) * 10;
    const sc = escena(), d = D();
    const largo = sc ? (g.axis === "h" ? sc.height : sc.width) : null;
    if (largo) {
      const tol = (typeof DZ_ALIGN_PX !== "undefined" ? DZ_ALIGN_PX : 6) / ((d && d.zoom) || 1);
      for (const v of [0, largo / 2, largo]) if (Math.abs(u - v) < tol) return v;
    }
    return Math.round(u * 10) / 10;
  }
  function sobreRegla(e) {
    const d = D(), cv = $("#dzCanvas").getBoundingClientRect();
    if (!d || !d.rulers) return e.clientX < cv.left || e.clientY < cv.top || e.clientX > cv.right || e.clientY > cv.bottom;
    const rx = e.clientX - cv.left, ry = e.clientY - cv.top;
    return rx < REGLA || ry < REGLA || rx > cv.width - REGLA || ry > cv.height - REGLA;
  }
  function arrastrar(e, i, antes, nueva) {
    e.preventDefault(); e.stopPropagation();
    const pid = e.pointerId;
    const g = guias()[i];
    if (!g) return;
    // elegir una guía suelta el dibujo elegido (como en Illustrator): Supr es de la guía
    if (D() && D().sel && typeof global.dzDeselect === "function") global.dzDeselect();
    elegida = i; dibujar();
    const mover = (ev) => {
      if (ev.pointerId !== pid) return;
      const p = global.dzToUser(ev.clientX, ev.clientY);
      g.u = ajustar(g, g.axis === "h" ? p.y : p.x, ev);
      dibujar(); leer(ev, g);
    };
    const soltar = (ev) => {
      if (ev.pointerId !== pid) return;
      doc.removeEventListener("pointermove", mover, true);
      doc.removeEventListener("pointerup", soltar, true);
      doc.removeEventListener("pointercancel", soltar, true);
      if (lectura) lectura.hidden = true;
      const gs = guias();
      if (ev.type === "pointercancel" || sobreRegla(ev)) {
        gs.splice(gs.indexOf(g), 1); elegida = -1;
        if (!nueva) global.dzSetStatus?.("Guía borrada · Ctrl+Z la vuelve");
      } else {
        elegida = gs.indexOf(g);
        global.dzSetStatus?.((g.axis === "h" ? "Guía horizontal en y " : "Guía vertical en x ") + Math.round(g.u) +
          " px · arrastrala para moverla, a la regla para borrarla · doble clic para escribir la posición");
      }
      dibujar();
      paso(nueva ? "Agregar guía" : "Mover guía", antes, copia(gs));
    };
    doc.addEventListener("pointermove", mover, true);
    doc.addEventListener("pointerup", soltar, true);
    doc.addEventListener("pointercancel", soltar, true);
    leer(e, g);
  }
  // el doble clic se cuenta acá: el primer clic redibuja la línea y el
  // `dblclick` le llegaba a otro elemento (nunca se abría el campo)
  let ultimoClic = { i: -1, t: 0 };
  function agarrar(e, i) {
    if (bloqueadas || e.button !== 0) return;
    const ahora = performance.now();
    if (ultimoClic.i === i && ahora - ultimoClic.t < 450) { ultimoClic = { i: -1, t: 0 }; escribir(e, i); return; }
    ultimoClic = { i, t: ahora };
    arrastrar(e, i, copia(guias()), false);
  }
  /** Tirar una guía desde una regla (reemplaza la de app.js). Alt: la otra orientación. */
  function tirarDeRegla(e, eje) {
    if (e.button !== 0) return;
    const d = D();
    if (d && d.guidesOn === false) mostrar(true);
    if (bloqueadas) { bloqueadas = false; guardarPref("bloqueadas", false); }
    const axis = e.altKey ? (eje === "h" ? "v" : "h") : eje;
    const antes = copia(guias());
    const p = global.dzToUser(e.clientX, e.clientY);
    guias().push({ axis, u: axis === "h" ? p.y : p.x });
    arrastrar(e, guias().length - 1, antes, true);
  }
  /** Doble clic: la posición exacta, escrita. */
  function escribir(e, i) {
    if (bloqueadas) return;
    e.preventDefault(); e.stopPropagation();
    const g = guias()[i]; if (!g) return;
    const cv = $("#dzCanvas"), caja = cv.getBoundingClientRect();
    const campo = doc.createElement("input");
    campo.type = "number"; campo.className = "dz-guia-campo"; campo.step = "1";
    campo.value = String(Math.round(g.u * 10) / 10);
    campo.setAttribute("aria-label", g.axis === "h" ? "Posición de la guía (y, px)" : "Posición de la guía (x, px)");
    campo.style.left = (e.clientX - caja.left + 8) + "px"; campo.style.top = (e.clientY - caja.top - 14) + "px";
    cv.appendChild(campo); campo.focus(); campo.select();
    let listo = false;
    const cerrar = (aplicar) => {
      if (listo) return; listo = true;
      const v = Number(campo.value);
      campo.remove();
      if (aplicar && Number.isFinite(v)) { const antes = copia(guias()); g.u = v; dibujar(); paso("Mover guía", antes, copia(guias())); }
    };
    campo.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); cerrar(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); cerrar(false); }
    });
    campo.addEventListener("blur", () => cerrar(true));
  }

  /* ── los comandos (menú Vista y teclas) ── */
  function mostrar(on) {
    const d = D(); if (!d) return;
    d.guidesOn = on === undefined ? d.guidesOn === false : !!on;
    $("#dzGuidesBtn")?.classList.toggle("active", d.guidesOn);
    if (!d.guidesOn) elegida = -1;
    dibujar(); marcarMenu();
    global.dzSetStatus?.(d.guidesOn ? "Guías visibles" : "Guías ocultas · Ctrl+Ñ las vuelve a mostrar");
  }
  function bloquear(on) {
    bloqueadas = on === undefined ? !bloqueadas : !!on; guardarPref("bloqueadas", bloqueadas);
    if (bloqueadas) elegida = -1;
    dibujar(); marcarMenu();
    global.dzSetStatus?.(bloqueadas ? "Guías bloqueadas: no se mueven ni se borran por accidente" : "Guías desbloqueadas");
  }
  function imantar(on) {
    iman = on === undefined ? !iman : !!on; guardarPref("iman", iman);
    marcarMenu();
    global.dzSetStatus?.(iman ? "Imantar a las guías: lo que movés y dibujás se pega a ellas" : "Sin imán de guías");
  }
  function borrarTodas() {
    const antes = copia(guias()); if (!antes.length) return;
    guias().splice(0); elegida = -1; dibujar();
    paso("Borrar las guías", antes, []);
    global.dzSetStatus?.("Guías borradas · Ctrl+Z las vuelve");
  }
  const COMANDOS = {
    "guias-reglas": () => global.dzRulersToggle(),
    "guias-ver": () => mostrar(),
    "guias-bloquear": () => bloquear(),
    "guias-iman": () => imantar(),
    "guias-borrar": borrarTodas,
  };
  const ENTRADAS = [
    ["guias-reglas", "Reglas", "Ctrl+R"],
    ["guias-ver", "Mostrar guías", "Ctrl+Ñ"],
    ["guias-bloquear", "Bloquear guías", "Ctrl+Alt+Ñ"],
    ["guias-iman", "Imantar a las guías", "Ctrl+Shift+Ñ"],
    ["guias-borrar", "Borrar las guías", ""],
  ];
  function ponerMenu() {
    const dd = $('[data-menu="vista"] .dz-dd');
    if (!dd || dd.querySelector('[data-act="guias-reglas"]')) return;
    const ancla = dd.querySelector('[data-act="fit"]');
    const hr = doc.createElement("hr");
    const items = ENTRADAS.map(([act, texto, k]) => {
      const s = doc.createElement("span");
      s.dataset.act = act; s.className = "dz-menu-tilde";
      s.innerHTML = texto + (k ? " <kbd>" + k + "</kbd>" : "");
      return s;
    });
    const tras = ancla ? ancla.nextSibling : null;
    dd.insertBefore(hr, tras);
    for (const s of items) dd.insertBefore(s, tras);
    marcarMenu();
  }
  function marcarMenu() {
    const d = D(), on = { "guias-reglas": !!(d && d.rulers), "guias-ver": visibles(), "guias-bloquear": bloqueadas, "guias-iman": iman };
    for (const [act, v] of Object.entries(on)) doc.querySelector('[data-menu="vista"] [data-act="' + act + '"]')?.classList.toggle("on", v);
  }
  function envolverMenu() {
    const orig = global.dzMenuAction;
    if (typeof orig !== "function" || orig.__guias) return;
    const f = function (act) {
      if (COMANDOS[act]) { const r = COMANDOS[act](); marcarMenu(); return r; }
      return orig.apply(this, arguments);
    };
    Object.assign(f, orig); f.__guias = true;
    global.dzMenuAction = f;
  }
  const escribiendo = (el) => !!(el && el.closest && el.closest('input,textarea,select,[contenteditable="true"],[contenteditable=""]'));
  function teclas(e) {
    if (escribiendo(e.target)) return;
    // Ctrl+Ñ (la tecla del «;»): mostrar / bloquear (Alt) / imantar (Shift)
    if ((e.ctrlKey || e.metaKey) && (e.code === "Semicolon" || e.key === ";" || e.key === "ñ" || e.key === "Ñ")) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.altKey) bloquear(); else if (e.shiftKey) imantar(); else mostrar();
      return;
    }
    // la guía elegida: Supr la borra (y no el dibujo elegido), Esc la suelta
    if (elegida >= 0 && guias()[elegida] && !bloqueadas && visibles()) {
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault(); e.stopImmediatePropagation();
        const antes = copia(guias()); guias().splice(elegida, 1); elegida = -1; dibujar();
        paso("Borrar guía", antes, copia(guias()));
        global.dzSetStatus?.("Guía borrada · Ctrl+Z la vuelve");
      } else if (e.key === "Escape") { elegida = -1; dibujar(); }
    }
  }

  /* ── el imán: lo que se mueve y las formas que se dibujan ── */
  function envolverImanes() {
    const refs = global.dzAlignRefs;
    if (typeof refs === "function" && !refs.__guias) {
      const f = function () {
        const r = refs.apply(this, arguments);
        if (r && iman && visibles()) for (const g of guias()) (g.axis === "v" ? r.xs : r.ys)?.push({ v: g.u, guia: true });
        return r;
      };
      Object.assign(f, refs); f.__guias = true;
      global.dzAlignRefs = f;
    }
    // la forma arranca en el ANCLA (donde se apretó): también se pega
    const abajo = global.dzFormaDown;
    if (typeof abajo === "function" && !abajo.__guias) {
      const f = function (e) {
        const r = abajo.apply(this, arguments);
        const g = typeof DZ_FORMA !== "undefined" ? DZ_FORMA : null;   // el gesto en curso de panels/shape-tool.js
        if (g && g.ancla && iman && visibles()) { g.ancla = pegarPunto(g.ancla); global.dzFormaAplicar(global.dzToUser(e.clientX, e.clientY), e.shiftKey, e.altKey); }
        return r;
      };
      Object.assign(f, abajo); f.__guias = true;
      global.dzFormaDown = f;
    }
    const forma = global.dzFormaAplicar;
    if (typeof forma === "function" && !forma.__guias) {
      const f = function (p, ...resto) {
        return forma.call(this, iman && visibles() && p ? pegarPunto(p) : p, ...resto);
      };
      Object.assign(f, forma); f.__guias = true;
      global.dzFormaAplicar = f;
    }
  }
  /** Un punto del lienzo pegado a la guía más cercana de cada eje (si está cerca). */
  function pegarPunto(p) {
    const d = D(), tol = (typeof DZ_ALIGN_PX !== "undefined" ? DZ_ALIGN_PX : 6) / ((d && d.zoom) || 1);
    let x = p.x, y = p.y, mx = tol, my = tol;
    for (const g of guias()) {
      if (g.axis === "v" && Math.abs(p.x - g.u) < mx) { mx = Math.abs(p.x - g.u); x = g.u; }
      if (g.axis === "h" && Math.abs(p.y - g.u) < my) { my = Math.abs(p.y - g.u); y = g.u; }
    }
    return x === p.x && y === p.y ? p : { ...p, x, y };
  }

  /* ── al abrir otra escena, sus guías ── */
  function envolverAperturas() {
    for (const nombre of ["dzDocInit", "dzSceneOpen", "dzApplySvgText"]) {
      const orig = global[nombre];
      if (typeof orig !== "function" || orig.__guias) continue;
      const f = function () {
        const r = orig.apply(this, arguments);
        const despues = () => { elegida = -1; reglas(); };
        if (r && typeof r.then === "function") r.then(despues, () => {}); else despues();
        return r;
      };
      Object.assign(f, orig); f.__guias = true;
      global[nombre] = f;
    }
  }

  function arrancar() {
    engancharDZ();
    global.dzRulersRender = reglas;
    global.dzGuidesRender = dibujar;
    global.dzRulerPull = tirarDeRegla;
    global.dzGuidesToggle = () => mostrar();
    // (las reglas llaman a dzRulerPull por su nombre: ya llegan acá) el botón de
    // guías quedó atado a la función vieja, que al arrancar no cambiaba nada
    const boton = $("#dzGuidesBtn");
    if (boton) boton.onclick = () => mostrar();
    const orig = global.dzRulersToggle;
    if (typeof orig === "function" && !orig.__guias) {
      const f = function () { const r = orig.apply(this, arguments); marcarMenu(); return r; };
      Object.assign(f, orig); f.__guias = true; global.dzRulersToggle = f;
    }
    const herr = global.dzSetTool;
    if (typeof herr === "function" && !herr.__guias) {
      const f = function () { const r = herr.apply(this, arguments); dibujar(); return r; };
      Object.assign(f, herr); f.__guias = true; global.dzSetTool = f;
    }
    envolverMenu(); envolverImanes(); envolverAperturas(); ponerMenu();
    // en la ventana y en captura: antes que el teclado de app.js (si no, Supr
    // borraba el dibujo elegido en vez de la guía)
    global.addEventListener("keydown", teclas, true);
    $('[data-menu="vista"]')?.addEventListener("pointerenter", marcarMenu);
    reglas();
  }

  global.LOW = global.LOW || {};
  global.LOW.drawing = global.LOW.drawing || {};
  global.LOW.drawing.guias = { guias, mostrar, bloquear, imantar, borrarTodas, pegarPunto, estado: () => ({ visibles: visibles(), bloqueadas, iman, elegida }) };
  // después de app.js y de los módulos que envuelven lo mismo
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", () => setTimeout(arrancar, 0), { once: true });
  else setTimeout(arrancar, 0);
})(typeof window !== "undefined" ? window : globalThis);
