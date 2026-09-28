/* ══════════════════════════════════════════════════════════════════════════
   FUNCTION EDITOR — las curvas del movimiento, editables

   El modelo ya guardaba canales por propiedad con claves, curvas por clave y
   modo de interpolación; lo que faltaba era la ventana para verlos y tocarlos.
   Sin eso, el timing sólo se podía corregir a ciegas moviendo poses.

   Lo que exige la biblia (§6) y qué hace acá cada cosa:

     canales por propiedad ....... la lista de la izquierda, uno por curva
     curvas Bezier editables ..... las manijas de la clave seleccionada
     tangentes ................... Libre · Suave · Lineal · Escalón
     edición numérica ............ cuadro y valor en la barra
     regiones de tiempo .......... In/Out acotan lo que se dibuja y se edita
     copiar y pegar curvas ....... sólo el TIMING, sin tocar los valores
     filtros ..................... "Selección" muestra los canales del hueso activo
     sincronía ................... la cabeza lectora es el cuadro del documento

   La vista NO guarda estado propio del documento: lee del modelo y escribe con
   los comandos del documento, así que Undo/Redo, guardado y reapertura salen
   gratis y no hay dos verdades sobre la misma curva.

   @module animation/function-editor
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};

  const SVGNS = "http://www.w3.org/2000/svg";
  const COLORES = ["#e0553f", "#45a7de", "#69b884", "#d8a44a", "#a97bd0", "#4fbfb0"];
  /* Presets de tangente. "Libre" no es un preset: es lo que queda cuando se
     arrastra una manija a mano, y por eso no aparece acá. */
  const TANGENTES = {
    suave: { eo: [.42, 0], ei: [.58, 1], hold: false },
    lineal: { eo: [.33, .33], ei: [.67, .67], hold: false },
    escalon: { eo: [.33, .33], ei: [.67, .67], hold: true },
  };

  const el = (tag, cls, txt) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  };
  const svgEl = (tag, attrs = {}) => {
    const n = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    return n;
  };
  /** Nombre legible de un canal: "bones/brazo_L/pose/r" → "brazo L · giro". */
  function etiqueta(path) {
    const control = /^controls\/(.+)$/.exec(path || "");
    if (control) return "dial · " + decodeURIComponent(control[1]).replace(/_/g, " ");
    const m = /^bones\/([^/]+)\/pose\/(x|y|r|sx|sy)$/.exec(path || "");
    if (!m) return String(path || "");
    const propiedad = { x: "X", y: "Y", r: "giro", sx: "escala X", sy: "escala Y" }[m[2]] || m[2];
    return decodeURIComponent(m[1]).replace(/_/g, " ") + " · " + propiedad;
  }

  class FunctionEditor {
    constructor(host, options = {}) {
      this.host = host;
      this.options = options;              // { getDoc, onFrame, status, getSelection }
      this.visibles = new Set();           // canales dibujados
      this.selected = null;                // { path, frame }
      this.filtro = "seleccion";           // "seleccion" | "todos"
      this.rango = null;                   // { in, out } · null = todo lo animado
      this.clip = null;                    // curva copiada (sólo timing)
      this.mount();
    }
    get doc() { return this.options.getDoc ? this.options.getDoc() : null; }

    mount() {
      this.host.innerHTML = `<div class="fn2-bar">
          <button data-a="filtro" title="Mostrar sólo los canales de lo seleccionado">Selección</button>
          <i></i>
          <span class="fn2-tan">Tangente</span>
          <button data-t="suave" title="Entrada y salida suaves (ease in/out)">Suave</button>
          <button data-t="lineal" title="Velocidad constante entre claves">Lineal</button>
          <button data-t="escalon" title="Sostiene el valor hasta la próxima clave">Escalón</button>
          <i></i>
          <label>Cuadro<input data-n="frame" type="number" min="1" step="1"></label>
          <label>Valor<input data-n="value" type="number" step="0.1"></label>
          <i></i>
          <button data-a="copiar" title="Copiar SÓLO el timing de este tramo">Copiar curva</button>
          <button data-a="pegar" title="Pegar el timing copiado en este tramo">Pegar curva</button>
          <button data-a="borrar" class="danger" title="Borrar la clave seleccionada (Supr)">Borrar clave</button>
          <i></i>
          <label>In<input data-r="in" type="number" min="1" step="1" placeholder="—"></label>
          <label>Out<input data-r="out" type="number" min="1" step="1" placeholder="—"></label>
        </div>
        <aside class="fn2-canales"><header>Canales</header><div class="fn2-lista"></div></aside>
        <div class="fn2-lienzo"><svg class="fn2-svg"></svg>
          <div class="fn2-vacio" hidden><p></p></div></div>`;
      this.lista = this.host.querySelector(".fn2-lista");
      this.svg = this.host.querySelector(".fn2-svg");
      this.vacio = this.host.querySelector(".fn2-vacio");
      this.host.tabIndex = 0;

      this.host.querySelector('[data-a="filtro"]').onclick = (e) => {
        this.filtro = this.filtro === "seleccion" ? "todos" : "seleccion";
        e.currentTarget.textContent = this.filtro === "seleccion" ? "Selección" : "Todos";
        this.render();
      };
      this.host.querySelectorAll("[data-t]").forEach((b) =>
        b.onclick = () => this.tangente(b.dataset.t));
      this.host.querySelector('[data-a="copiar"]').onclick = () => this.copiarCurva();
      this.host.querySelector('[data-a="pegar"]').onclick = () => this.pegarCurva();
      this.host.querySelector('[data-a="borrar"]').onclick = () => this.borrarClave();
      this.host.querySelectorAll("[data-n]").forEach((input) =>
        input.onchange = () => this.editarNumero(input.dataset.n, input.value));
      this.host.querySelectorAll("[data-r]").forEach((input) =>
        input.onchange = () => this.editarRango(input.dataset.r, input.value));
      this.host.onkeydown = (e) => {
        if (e.target.matches && e.target.matches("input")) return;
        if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); this.borrarClave(); }
      };
      this.svg.addEventListener("pointerdown", (e) => this.puntero(e));
      this.svg.addEventListener("dblclick", (e) => this.crearClave(e));
    }

    setDoc(doc) {
      if (this._desuscribir) this._desuscribir();
      this._desuscribir = doc ? doc.subscribe((_d, motivo) => {
        if (["rig", "frame", "anim", "content"].includes(motivo)) this.render();
      }) : null;
      this.render();
    }
    dispose() { if (this._desuscribir) this._desuscribir(); this.host.innerHTML = ""; }

    /** Canales que corresponde mostrar: todos, o los del hueso seleccionado. */
    canales() {
      const doc = this.doc;
      if (!doc || !doc.scene.rig) return [];
      const todos = Object.keys(doc.scene.rig.channels || {}).sort();
      if (this.filtro !== "seleccion") return todos;
      const sel = this.options.getSelection && this.options.getSelection();
      if (!sel) return todos;
      const prefijo = "bones/" + encodeURIComponent(sel) + "/";
      const propios = todos.filter((p) => p.startsWith(prefijo));
      // Los diales no son de un hueso: son del personaje. Filtrarlos junto con
      // las propiedades de la pieza los volvía invisibles justo cuando uno está
      // animando la cara con una pieza seleccionada.
      const diales = todos.filter((p) => p.startsWith("controls/"));
      return propios.length ? [...propios, ...diales] : todos;
    }

    /** Ventana de tiempo y de valor que se dibuja. */
    encuadre(paths) {
      const doc = this.doc, scene = doc && doc.scene;
      let f0 = Infinity, f1 = -Infinity, v0 = Infinity, v1 = -Infinity;
      for (const path of paths) {
        const canal = scene.rigChannel(path);
        for (const [f, v] of Object.entries(canal?.keys || {})) {
          const frame = +f, valor = +v;
          if (!Number.isFinite(frame) || !Number.isFinite(valor)) continue;
          f0 = Math.min(f0, frame); f1 = Math.max(f1, frame);
          v0 = Math.min(v0, valor); v1 = Math.max(v1, valor);
        }
      }
      if (!Number.isFinite(f0)) { f0 = 1; f1 = Math.max(2, doc ? doc.scene.length || 24 : 24); v0 = 0; v1 = 1; }
      if (this.rango) { f0 = this.rango.in ?? f0; f1 = this.rango.out ?? f1; }
      if (f1 <= f0) f1 = f0 + 1;
      if (v1 - v0 < 1e-6) { v0 -= 1; v1 += 1; }
      const margen = (v1 - v0) * .15;
      return { f0, f1, v0: v0 - margen, v1: v1 + margen };
    }

    render() {
      const doc = this.doc;
      const paths = doc ? this.canales() : [];
      this.lista.innerHTML = "";
      // el primer render elige qué se ve: todo lo que hay
      if (!this.visibles.size) paths.forEach((p) => this.visibles.add(p));
      paths.forEach((path, i) => {
        const fila = el("button", this.visibles.has(path) ? "active" : "");
        const punto = el("i"); punto.style.background = COLORES[i % COLORES.length];
        const nombre = el("span", "", etiqueta(path));
        const claves = Object.keys(doc.scene.rigChannel(path)?.keys || {}).length;
        fila.append(punto, nombre, el("small", "", claves + " cl."));
        fila.onclick = () => {
          if (this.visibles.has(path)) this.visibles.delete(path); else this.visibles.add(path);
          this.render();
        };
        this.lista.appendChild(fila);
      });

      const vistos = paths.filter((p) => this.visibles.has(p));
      this.vacio.hidden = !!vistos.length;
      if (!vistos.length) {
        this.vacio.querySelector("p").textContent = !doc
          ? "Abrí una animación para ver sus curvas."
          : paths.length
            ? "Ningún canal visible: elegí uno en la lista de la izquierda."
            : "Todavía no hay curvas. Animá una propiedad —mové un hueso y dejá dos claves— y su función aparece acá.";
        this.svg.innerHTML = "";
        this.sincronizarBarra();
        return;
      }
      this.dibujar(vistos, paths);
      this.sincronizarBarra();
    }

    dibujar(paths, todos) {
      const doc = this.doc, scene = doc.scene;
      const caja = this.svg.getBoundingClientRect();
      const W = Math.max(240, caja.width || 640), H = Math.max(120, caja.height || 220);
      const P = { l: 46, r: 12, t: 12, b: 22 };
      const enc = this.encuadre(paths);
      this.enc = enc; this.medida = { W, H, P };
      const X = (f) => P.l + (f - enc.f0) / (enc.f1 - enc.f0) * (W - P.l - P.r);
      const Y = (v) => P.t + (enc.v1 - v) / (enc.v1 - enc.v0) * (H - P.t - P.b);
      this.X = X; this.Y = Y;
      this.aFrame = (px) => enc.f0 + (px - P.l) / Math.max(1, W - P.l - P.r) * (enc.f1 - enc.f0);
      this.aValor = (py) => enc.v1 - (py - P.t) / Math.max(1, H - P.t - P.b) * (enc.v1 - enc.v0);

      this.svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      this.svg.innerHTML = "";
      const g = svgEl("g");

      // rejilla: cuadros abajo, valores a la izquierda
      const pasoF = Math.max(1, Math.round((enc.f1 - enc.f0) / 10));
      for (let f = Math.ceil(enc.f0); f <= enc.f1; f += pasoF) {
        g.appendChild(svgEl("line", { x1: X(f), y1: P.t, x2: X(f), y2: H - P.b, class: "fn2-grid" }));
        const t = svgEl("text", { x: X(f), y: H - 7, class: "fn2-eje" }); t.textContent = f;
        g.appendChild(t);
      }
      for (let i = 0; i <= 4; i++) {
        const v = enc.v0 + (enc.v1 - enc.v0) * i / 4;
        g.appendChild(svgEl("line", { x1: P.l, y1: Y(v), x2: W - P.r, y2: Y(v), class: "fn2-grid" }));
        const t = svgEl("text", { x: P.l - 6, y: Y(v) + 3, class: "fn2-eje fn2-eje-y" });
        t.textContent = Math.round(v * 100) / 100;
        g.appendChild(t);
      }

      // curvas: se muestrea el MODELO, así lo dibujado es lo que se reproduce
      paths.forEach((path) => {
        const color = COLORES[todos.indexOf(path) % COLORES.length];
        const canal = scene.rigChannel(path);
        if (!canal) return;
        const puntos = [];
        for (let f = Math.floor(enc.f0); f <= Math.ceil(enc.f1); f += .5)
          puntos.push(`${X(f).toFixed(1)},${Y(scene.rigChannelValue(path, f, 0)).toFixed(1)}`);
        g.appendChild(svgEl("polyline", { points: puntos.join(" "), class: "fn2-curva", stroke: color }));
        Object.keys(canal.keys || {}).map(Number).filter((f) => f >= enc.f0 - .5 && f <= enc.f1 + .5)
          .forEach((f) => {
            const sel = this.selected && this.selected.path === path && this.selected.frame === f;
            const c = svgEl("circle", { cx: X(f), cy: Y(+canal.keys[f] || 0), r: sel ? 5.5 : 4,
              class: "fn2-clave" + (sel ? " sel" : ""), fill: color,
              "data-path": path, "data-frame": f });
            g.appendChild(c);
          });
      });

      // manijas de la clave seleccionada: el tramo hacia la próxima clave
      const s = this.selected && this.tramoSeleccionado();
      if (s) {
        const canal = scene.rigChannel(s.path), ease = (canal.ease || {});
        const A = { f: s.a, v: +canal.keys[s.a] || 0 }, B = { f: s.b, v: +canal.keys[s.b] || 0 };
        const eo = (animation.rigEaseData(ease[s.a]) || {}).eo || [.33, .33];
        const ei = (animation.rigEaseData(ease[s.b]) || {}).ei || [.67, .67];
        const p = (t, y) => ({ x: X(A.f + (B.f - A.f) * t), y: Y(A.v + (B.v - A.v) * y) });
        const h1 = p(eo[0], eo[1]), h2 = p(ei[0], ei[1]);
        g.appendChild(svgEl("line", { x1: X(A.f), y1: Y(A.v), x2: h1.x, y2: h1.y, class: "fn2-manija-linea" }));
        g.appendChild(svgEl("line", { x1: X(B.f), y1: Y(B.v), x2: h2.x, y2: h2.y, class: "fn2-manija-linea" }));
        g.appendChild(svgEl("circle", { cx: h1.x, cy: h1.y, r: 4.5, class: "fn2-manija", "data-h": "eo" }));
        g.appendChild(svgEl("circle", { cx: h2.x, cy: h2.y, r: 4.5, class: "fn2-manija", "data-h": "ei" }));
      }

      // cabeza lectora: el mismo cuadro que la Timeline y la X-sheet
      const f = doc.frame;
      if (f >= enc.f0 && f <= enc.f1)
        g.appendChild(svgEl("line", { x1: X(f), y1: P.t, x2: X(f), y2: H - P.b, class: "fn2-cabeza" }));
      this.svg.appendChild(g);
    }

    /** Tramo (a→b) que arranca en la clave seleccionada. */
    tramoSeleccionado() {
      const s = this.selected, doc = this.doc;
      if (!s || !doc) return null;
      const canal = doc.scene.rigChannel(s.path);
      if (!canal) return null;
      const frames = Object.keys(canal.keys || {}).map(Number).sort((x, y) => x - y);
      const i = frames.indexOf(s.frame);
      if (i < 0 || i + 1 >= frames.length) return null;
      return { path: s.path, a: frames[i], b: frames[i + 1] };
    }

    sincronizarBarra() {
      const s = this.selected, doc = this.doc;
      const canal = s && doc && doc.scene.rigChannel(s.path);
      const hay = !!(canal && canal.keys[s.frame] != null);
      this.host.querySelectorAll("[data-t],[data-a=\"copiar\"],[data-a=\"pegar\"],[data-a=\"borrar\"]")
        .forEach((b) => b.disabled = !hay);
      const pegar = this.host.querySelector('[data-a="pegar"]');
      if (pegar) pegar.disabled = !hay || !this.clip;
      const f = this.host.querySelector('[data-n="frame"]'), v = this.host.querySelector('[data-n="value"]');
      f.disabled = v.disabled = !hay;
      f.value = hay ? s.frame : "";
      v.value = hay ? Math.round((+canal.keys[s.frame] || 0) * 1000) / 1000 : "";
      const rin = this.host.querySelector('[data-r="in"]'), rout = this.host.querySelector('[data-r="out"]');
      rin.value = this.rango && this.rango.in != null ? this.rango.in : "";
      rout.value = this.rango && this.rango.out != null ? this.rango.out : "";
    }

    // ── gestos ──────────────────────────────────────────────────────────────
    puntero(e) {
      const clave = e.target.closest(".fn2-clave"), manija = e.target.closest(".fn2-manija");
      if (manija) return this.arrastrarManija(e, manija.dataset.h);
      if (clave) {
        this.selected = { path: clave.dataset.path, frame: +clave.dataset.frame };
        this.render();
        return this.arrastrarClave(e);
      }
      // clic en el vacío: mover la cabeza lectora, como en la Timeline
      if (this.aFrame && this.options.onFrame) {
        const p = this.puntoLocal(e);
        this.options.onFrame(Math.max(1, Math.round(this.aFrame(p.x))));
      }
    }
    puntoLocal(e) {
      const r = this.svg.getBoundingClientRect();
      const W = this.medida ? this.medida.W : r.width, H = this.medida ? this.medida.H : r.height;
      return { x: (e.clientX - r.left) * (W / (r.width || 1)), y: (e.clientY - r.top) * (H / (r.height || 1)) };
    }
    arrastrarClave(e) {
      const doc = this.doc, s = this.selected;
      if (!doc || !s) return;
      const canal = doc.scene.rigChannel(s.path);
      if (!canal) return;
      const frameOriginal = s.frame, valorOriginal = +canal.keys[s.frame] || 0;
      let ultimo = { frame: frameOriginal, valor: valorOriginal };
      const mover = (ev) => {
        const p = this.puntoLocal(ev);
        ultimo = { frame: Math.max(1, Math.round(this.aFrame(p.x))), valor: this.aValor(p.y) };
        // vista previa sin tocar el historial: el gesto se confirma al soltar
        const c = doc.scene.rigChannel(s.path);
        if (!c) return;
        if (ultimo.frame !== frameOriginal && c.keys[ultimo.frame] != null) ultimo.frame = frameOriginal;
        delete c.keys[frameOriginal];
        c.keys[ultimo.frame] = ultimo.valor;
        this.selected = { path: s.path, frame: ultimo.frame };
        this.render();
      };
      const soltar = () => {
        global.removeEventListener("pointermove", mover);
        global.removeEventListener("pointerup", soltar);
        // se restaura el modelo y se aplica UNA vez, por los comandos
        const c = doc.scene.rigChannel(s.path);
        if (c) { delete c.keys[ultimo.frame]; c.keys[frameOriginal] = valorOriginal; }
        if (ultimo.frame === frameOriginal && Math.abs(ultimo.valor - valorOriginal) < 1e-9) return;
        const h = doc.history, tx = h && !h.transaction;
        if (tx) h.begin("Mover clave de propiedad");
        if (ultimo.frame !== frameOriginal) doc.removeRigChannelKey(s.path, frameOriginal);
        doc.setRigChannelKey(s.path, ultimo.frame, ultimo.valor, { label: "Mover clave de propiedad" });
        if (tx) h.commit();
        this.selected = { path: s.path, frame: ultimo.frame };
        this.render();
      };
      global.addEventListener("pointermove", mover);
      global.addEventListener("pointerup", soltar);
    }
    arrastrarManija(e, cual) {
      const doc = this.doc, s = this.tramoSeleccionado();
      if (!doc || !s) return;
      const canal = doc.scene.rigChannel(s.path);
      const A = { f: s.a, v: +canal.keys[s.a] || 0 }, B = { f: s.b, v: +canal.keys[s.b] || 0 };
      const frameDeLaClave = cual === "eo" ? s.a : s.b;
      const mover = (ev) => {
        const p = this.puntoLocal(ev);
        const t = Math.max(0, Math.min(1, (this.aFrame(p.x) - A.f) / Math.max(1e-6, B.f - A.f)));
        const y = (B.v - A.v) === 0 ? .5 : (this.aValor(p.y) - A.v) / (B.v - A.v);
        const previo = animation.rigEaseData((canal.ease || {})[frameDeLaClave]);
        const ease = cual === "eo" ? { ...previo, eo: [t, y] } : { ...previo, ei: [t, y] };
        doc.setRigChannelEase(s.path, frameDeLaClave, { ...ease, hold: false });
        this.render();
      };
      const soltar = () => {
        global.removeEventListener("pointermove", mover);
        global.removeEventListener("pointerup", soltar);
      };
      global.addEventListener("pointermove", mover);
      global.addEventListener("pointerup", soltar);
    }
    crearClave(e) {
      const doc = this.doc;
      if (!doc || !this.aFrame) return;
      const paths = this.canales().filter((p) => this.visibles.has(p));
      const path = (this.selected && this.selected.path) || paths[0];
      if (!path) return;
      const p = this.puntoLocal(e);
      const frame = Math.max(1, Math.round(this.aFrame(p.x)));
      if (doc.scene.rigChannel(path)?.keys?.[frame] != null) return;
      doc.setRigChannelKey(path, frame, this.aValor(p.y), { label: "Crear clave de propiedad" });
      this.selected = { path, frame };
      this.render();
      if (this.options.status) this.options.status("Clave nueva en el cuadro " + frame);
    }

    // ── comandos de la barra ────────────────────────────────────────────────
    tangente(nombre) {
      const doc = this.doc, s = this.selected;
      if (!doc || !s || !TANGENTES[nombre]) return;
      doc.setRigChannelEase(s.path, s.frame, TANGENTES[nombre]);
      if (nombre === "escalon") doc.setRigChannelInterpolation(s.path, "step");
      else if (nombre === "lineal") doc.setRigChannelInterpolation(s.path, "linear");
      else doc.setRigChannelInterpolation(s.path, "bezier");
      this.render();
      if (this.options.status) this.options.status("Tangente " + nombre);
    }
    copiarCurva() {
      const doc = this.doc, s = this.tramoSeleccionado();
      if (!doc || !s || !animation.rigCurveClipboardData) return;
      this.clip = animation.rigCurveClipboardData(doc.scene.rigChannel(s.path), s.a, s.b);
      this.sincronizarBarra();
      if (this.options.status) this.options.status(this.clip ? "Curva copiada" : "No hay curva para copiar");
    }
    pegarCurva() {
      const doc = this.doc, s = this.tramoSeleccionado();
      if (!doc || !s || !this.clip) return;
      doc.pasteRigChannelCurve(s.path, s.a, s.b, this.clip, { label: "Pegar curva de propiedad" });
      this.render();
      if (this.options.status) this.options.status("Curva pegada");
    }
    borrarClave() {
      const doc = this.doc, s = this.selected;
      if (!doc || !s) return;
      if (!doc.removeRigChannelKey(s.path, s.frame)) return;
      this.selected = null;
      this.render();
      if (this.options.status) this.options.status("Clave borrada · Ctrl+Z la devuelve");
    }
    editarNumero(campo, valor) {
      const doc = this.doc, s = this.selected;
      if (!doc || !s) return;
      const canal = doc.scene.rigChannel(s.path);
      if (!canal || canal.keys[s.frame] == null) return;
      if (campo === "value") {
        doc.setRigChannelKey(s.path, s.frame, Number(valor) || 0, { label: "Editar valor de clave" });
      } else {
        const destino = Math.max(1, Math.round(Number(valor) || 1));
        if (destino === s.frame || canal.keys[destino] != null) return this.sincronizarBarra();
        const v = +canal.keys[s.frame] || 0;
        const h = doc.history, tx = h && !h.transaction;
        if (tx) h.begin("Mover clave de propiedad");
        doc.removeRigChannelKey(s.path, s.frame);
        doc.setRigChannelKey(s.path, destino, v, { label: "Mover clave de propiedad" });
        if (tx) h.commit();
        this.selected = { path: s.path, frame: destino };
      }
      this.render();
    }
    editarRango(borde, valor) {
      const n = valor === "" ? null : Math.max(1, Math.round(Number(valor) || 1));
      this.rango = { ...(this.rango || {}), [borde === "in" ? "in" : "out"]: n };
      if (this.rango.in == null && this.rango.out == null) this.rango = null;
      this.render();
    }
  }

  animation.FunctionEditor = FunctionEditor;
  animation.functionEditorLabel = etiqueta;
  animation.FUNCTION_TANGENTS = TANGENTES;
})(window);
