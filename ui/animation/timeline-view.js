/* ══════════════════════════════════════════════════════════════════════════
   TIMELINE — la misma escena, leída en horizontal

   La X-sheet mira el tiempo hacia abajo (planilla de papel); la timeline lo
   mira hacia la derecha (una fila por capa). Son dos vistas del MISMO modelo,
   como en OpenToonz: lo que se cambia en una aparece en la otra al instante,
   porque ninguna guarda estado propio.

   Sirve para lo que la vertical no: ver muchas capas a la vez y arrastrar
   bloques de exposición de un lado a otro.

   @module animation/timeline-view
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};
  const icon = (id) => `<svg class="ico"><use href="#${id}"/></svg>`;

  const ANCHO = 16;        // valor inicial; el usuario puede escalar la vista
  const EXTRA = 24;        // frames de más al final, para seguir armando
  const VIEW_STORAGE_KEY = "low.timeline.view.v1";

  class TimelineView {
    constructor(host, doc) {
      this.host = typeof host === "string" ? document.querySelector(host) : host;
      this.doc = doc;
      this.playback = null;
      this.onionEnabled = true;
      this.toggleOnion = null;
      this.openOnion = null;
      this.loadAudio = null;
      this.status = null;
      this.view = this._loadView();
      this._pendingScrollFrame = null;
      this._desuscribir = doc ? doc.subscribe((_d, reason) => this._docChanged(reason)) : null;
    }
    setDoc(doc) {
      this._cancelRange?.();
      if (this._desuscribir) this._desuscribir();
      this.doc = doc;
      this._desuscribir = doc ? doc.subscribe((_d, reason) => this._docChanged(reason)) : null;
      this.render();
    }
    dispose() { this._cancelRange?.(); if (this._desuscribir) this._desuscribir(); if (this.host) this.host.innerHTML = ""; }
    _docChanged(reason) { if(reason === "range") {
      const r=this.doc.scene.range;
      const a=document.querySelector('#tlIn'),z=document.querySelector('#tlOut');
      if(a)a.value=r.in;if(z)z.value=r.out;
    } if (reason === "frame") this._updateCursor(); else this.render(); }

    _timeline() { return animation.timeline || {}; }
    _loadView() {
      let saved = null;
      const storage = global.LOW?.safeMode?.preferenceStorage || global.localStorage;
      try { saved = JSON.parse(storage && storage.getItem(VIEW_STORAGE_KEY)); }
      catch (_) { /* preferencias dañadas: usar valores seguros */ }
      const timeline = this._timeline();
      return timeline.normalizeViewState ? timeline.normalizeViewState(saved) : {
        frameWidth: ANCHO, density: "normal", hideEmpty: false, focusSelected: false, collapsed: {} };
    }
    _saveView() {
      const storage = global.LOW?.safeMode?.preferenceStorage || global.localStorage;
      try { if (storage) storage.setItem(VIEW_STORAGE_KEY, JSON.stringify(this.view)); }
      catch (_) { /* la escena sigue funcionando aunque el navegador no permita storage */ }
    }
    _setView(patch, scrollFrame = null) {
      const timeline = this._timeline();
      const next = Object.assign({}, this.view, patch || {});
      this.view = timeline.normalizeViewState ? timeline.normalizeViewState(next) : next;
      this._pendingScrollFrame = scrollFrame;
      this._saveView();
      this.render();
    }
    _frameWidth() { return Math.max(6, Number(this.view && this.view.frameWidth) || ANCHO); }
    _nameWidth() {
      const timeline = this._timeline();
      return timeline.nameWidth ? timeline.nameWidth(this.view && this.view.compact) : 128;
    }
    _isCollapsed(id) { return !!(this.view && this.view.collapsed && this.view.collapsed[id]); }
    _toggleCollapsed(id) {
      const collapsed = Object.assign({}, this.view.collapsed || {});
      if (collapsed[id]) delete collapsed[id]; else collapsed[id] = true;
      this._setView({ collapsed });
    }
    _zoom(direction) {
      const timeline = this._timeline(), widths = timeline.FRAME_WIDTHS || [6, 8, 12, 16, 24, 32, 48];
      let index = widths.indexOf(this._frameWidth());
      if (index < 0) index = widths.findIndex((value) => value >= this._frameWidth());
      const node = this.host && this.host.querySelector(".tl2");
      const anchor = node ? Math.max(1, 1 + (node.scrollLeft +
        Math.max(0, node.clientWidth - this._nameWidth()) / 2) / this._frameWidth()) : this.doc.frame;
      const next = widths[Math.max(0, Math.min(widths.length - 1, index + direction))];
      this._setView({ frameWidth: next }, anchor);
    }
    _fit(kind) {
      const timeline = this._timeline();
      if (!timeline.rangeFor || !timeline.fitFrameWidth) return;
      const range = timeline.rangeFor(kind, this.doc, { audio: this.audio, mocap: this.doc.mocap });
      const width = timeline.fitFrameWidth(this.host.clientWidth || 800, range.from, range.to,
        this._nameWidth());
      this._setView({ frameWidth: width }, range.from);
      if (this.status) this.status(`Timeline: F${range.from}–F${range.to} encajada`);
    }

    /** El tramo vive en el modelo, pero el export y el transporte leen los
     *  casilleros In/Out de la barra. Si se escribe uno solo, terminan
     *  diciendo cosas distintas: se arrastra el tramo y el export saca otro. */
    _escribirTramo(desde, hasta) {
      if (this.playback) this.playback.setRange(desde, hasta);
      else this.doc.setPlaybackRange(desde, hasta);
    }

    _arrastrarTramo(ev, borde, pista, total, tramo) {
      if (ev.button !== 0) return;
      ev.preventDefault(); ev.stopPropagation();
      this._cancelRange?.(); this.playback?.stop();
      const pointerId = ev.pointerId, rect = pista.getBoundingClientRect();
      const scroll = pista.scrollLeft, width = this._frameWidth();
      let preview = null, done = false;
      const cleanup = () => {
        done = true; this._rangePreview = null; this._cancelRange = null;
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", cancelPointer);
        document.removeEventListener("keydown", key, true);
        window.removeEventListener("blur", cancel);
      };
      const cancel = () => { if (done) return; cleanup(); this.render(); };
      const cancelPointer = e => { if(e.pointerId===pointerId) cancel(); };
      const key = e => { if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();cancel();} };
      const move = e => {
        if(done || e.pointerId!==pointerId) return;
        const f=Math.max(1,Math.min(total,1+Math.floor((e.clientX-rect.left+scroll)/width)));
        let a=borde==="in"?f:tramo.in, z=borde==="out"?f:tramo.out;
        if(a>z)[a,z]=[z,a];
        preview={in:a,out:z}; this._rangePreview=preview; this.render();
      };
      const up = e => {
        if(done || e.pointerId!==pointerId) return;
        cleanup(); if(preview) this._escribirTramo(preview.in,preview.out);
        this.render();
      };
      this._cancelRange=cancel;
      document.addEventListener("pointermove",move);
      document.addEventListener("pointerup",up);
      document.addEventListener("pointercancel",cancelPointer);
      document.addEventListener("keydown",key,true);
      window.addEventListener("blur",cancel);
    }
    _updateCursor() {
      if (!this.host || !this.doc) return;
      this.host.querySelectorAll(".actual").forEach((n) => n.classList.remove("actual"));
      this.host.querySelectorAll(`[data-frame="${this.doc.frame}"]`).forEach((n) => n.classList.add("actual"));
      // sólo el CONTADOR: la celda también lleva «+ Capa», y reescribir su
      // textContent entero se lo llevaba puesto en cada cuadro
      const label = this.host.querySelector(".tl2-rulername .tl2-framepos") || this.host.querySelector(".tl2-rulername");
      if (label) label.textContent = this.view.compact ? String(this.doc.frame)
        : `${this.doc.frame} / ${this.doc.scene.playRange().out}`;
      const active = this.host.querySelector(`.tl2-cell[data-layer-id="${this.doc.layerId}"][data-frame="${this.doc.frame}"]`);
      if (active && (global.LOW && global.LOW.core && global.LOW.core.scrollDentro)) global.LOW.core.scrollDentro(active, { limite: this.host });
    }

    _frames() {
      const doc = this.doc;
      const timeline = this._timeline();
      const extent = doc && timeline.extent
        ? timeline.extent(doc.scene, { audio: this.audio, mocap: doc.mocap, current: doc.frame })
        : (doc ? doc.scene.lastFrame() : 0);
      return Math.max(extent + EXTRA, 48, doc ? doc.frame + 8 : 0);
    }

    render() {
      if (!this.host || !this.doc) return;
      const doc = this.doc, sc = doc.scene;
      const total = this._frames();
      const cameraKeys = (sc.camera && sc.camera.keys) || {};
      const compositionKeys = new Set();
      for (const plane of Object.values((sc.composition && sc.composition.planes) || {}))
        for (const frame of Object.keys((plane && plane.keys) || {})) compositionKeys.add(Number(frame));
      const old = this.host.querySelector(".tl2");
      const oldScroll = old ? { left: old.scrollLeft, top: old.scrollTop } : { left: 0, top: 0 };
      const cont = document.createElement("div");
      cont.className = "tl2";
      cont.style.setProperty("--tl-frame-w", this._frameWidth() + "px");
      const rowHeight = this._timeline().rowHeight ? this._timeline().rowHeight(this.view.density) : 24;
      cont.style.setProperty("--tl-row-h", rowHeight + "px");
      cont.style.setProperty("--tl-name-w", this._nameWidth() + "px");
      cont.dataset.density = this.view.density;
      cont.dataset.compact = this.view.compact ? "1" : "0";

      // ── herramientas de celdas ──
      const tools = document.createElement("div"); tools.className = "tl2-tools";
      const group = (label) => { const g = document.createElement("span"); g.className = "tl2-toolgroup"; g.dataset.label = label; g.setAttribute("role", "group"); g.setAttribute("aria-label", label); tools.appendChild(g); return g; };
      const button = (host, icon, title, action, active=false, badge="") => {
        const b = document.createElement("button");
        b.title = title; b.setAttribute("aria-label", title);
        b.className = (active ? "on " : "") + (badge ? "tl2-badge" : "");
        if (active) b.setAttribute("aria-pressed", "true");
        if (icon) b.innerHTML = `<svg class="tl2-icon" aria-hidden="true"><use href="#${icon}"></use></svg>`;
        if (badge) b.innerHTML += `<span aria-hidden="true">${badge}</span>`;
        b.onclick = action; host.appendChild(b); return b;
      };
      const selected = () => doc.cellSelection || { fromLayerId: doc.layerId, toLayerId: doc.layerId,
        anchorLayerId: doc.layerId, anchorFrame: doc.frame, from: doc.frame, to: doc.frame };
      const foldButton = (id) => {
        const folded = this._isCollapsed(id), b = document.createElement("button");
        b.className = "tl2-fold";
        b.innerHTML = icon(folded ? "i-chev-r" : "i-chev-d");
        b.title = folded ? "Expandir pista" : "Minimizar pista";
        b.setAttribute("aria-label", b.title); b.setAttribute("aria-expanded", String(!folded));
        b.onclick = (event) => { event.stopPropagation(); this._toggleCollapsed(id); };
        return b;
      };
      const edit = group("Dibujos");
      button(edit, "i-blank-frame", "Crear un dibujo vacío en la celda actual", () => {
        doc.createBlankDrawing();
        doc.emit("frame");
      }, false, "Vacío");
      button(edit, "i-copy", "Duplicar dibujo: copia independiente en esta celda", () => doc.createBlankDrawing(true), false, "Duplicar");
      button(edit, "i-level", "Crear un nivel y una columna", () => { doc.addLayer(); doc.emit("frame"); });
      // HIST-02: el mismo comando que usan la X-sheet y el teclado
      const clipboard = group("Celdas"), cells = animation.shortcuts && animation.shortcuts.cells;
      button(clipboard, "i-cut", "Cortar las celdas seleccionadas", () => {
        if (cells) cells.cut(doc, selected());
      });
      button(clipboard, "i-copy", "Copiar las celdas seleccionadas", () => {
        const r = cells && cells.copy(doc, selected());
        if (r && this.status) this.status(cells.medida(r) + " copiadas");
      });
      button(clipboard, "i-paste", "Reexponer celdas copiadas: conserva el dibujo compartido dentro del mismo nivel", () => {
        const r = cells && cells.paste(doc);
        if (this.status) this.status(r ? cells.medida(r) + " reexpuestas; en el mismo nivel comparten dibujo" : "Copiá celdas antes de reexponer");
      }, false, "Reexponer");
      const timing = group("Exposición");
      button(timing, "i-insert", "Insertar una celda antes del fotograma actual", () => doc.apply("insert", doc.frame, 1));
      button(timing, "i-eraser", "Vaciar las celdas sin borrar sus dibujos", () => doc.clearCells(selected(), "Vaciar rango"));
      button(timing, "i-exposure-less", "Acortar la exposición actual", () => doc.apply("stepChange", doc.frame, -1));
      button(timing, "i-exposure-more", "Extender la exposición actual", () => doc.apply("stepChange", doc.frame, +1));
      const sequence = group("Secuencia");
      button(sequence, "", "Exponer cada dibujo por un fotograma", () => doc.applySelectedTiming("step", selected(), 1), false, "1F");
      button(sequence, "", "Exponer cada dibujo por dos fotogramas", () => doc.applySelectedTiming("step", selected(), 2), false, "2F");
      button(sequence, "", "Exponer cada dibujo por tres fotogramas", () => doc.applySelectedTiming("step", selected(), 3), false, "3F");
      button(sequence, "i-autoexpose", "Completar los huecos sosteniendo el dibujo anterior", () => doc.applySelectedTiming("autoexpose", selected()));
      button(sequence, "i-dedupe", "Dejar una celda por dibujo", () => doc.applySelectedTiming("dedupe", selected()));
      button(sequence, "i-loop", "Repetir el rango seleccionado", () => doc.applySelectedTiming("repeat", selected(), 1));
      button(sequence, "i-reverse", "Invertir el orden del rango seleccionado", () => doc.applySelectedTiming("reverse", selected()));
      button(sequence, "i-swing", "Crear un ciclo ping-pong con el rango", () => doc.applySelectedTiming("swing", selected()));
      const media = group("Referencias");
      button(media, "i-onion", "Activar el papel cebolla", () => { if (this.toggleOnion) this.toggleOnion(); }, this.onionEnabled);
      button(media, "i-mixer", "Abrir los faders de papel cebolla", () => { if (this.openOnion) this.openOnion(); });
      button(media, "i-audio", "Cargar una pista de audio", () => { if (this.loadAudio) this.loadAudio(); });
      const view = group("Vista");
      button(view, "", "Alejar el tiempo (Ctrl+rueda)", () => this._zoom(-1), false, "−");
      button(view, "", "Acercar el tiempo (Ctrl+rueda)", () => this._zoom(1), false, "+");
      button(view, "", "Encajar toda la escena", () => this._fit("scene"), false, "▭");
      button(view, "", "Encajar la selección de celdas", () => this._fit("selection"), false, "⌗");
      button(view, "", "Encajar el tramo de reproducción", () => this._fit("play"), false, "↔");
      button(view, "i-eye-off", "Ocultar pistas sin exposiciones", () =>
        this._setView({ hideEmpty: !this.view.hideEmpty }), this.view.hideEmpty);
      button(view, "i-cursor", "Mostrar sólo la capa seleccionada", () =>
        this._setView({ focusSelected: !this.view.focusSelected }), this.view.focusSelected);
      const densitySymbol = this.view.density === "compact" ? "≡" : this.view.density === "comfortable" ? "☰" : "≣";
      button(view, "", "Cambiar altura de las pistas", () => {
        const values = this._timeline().DENSITIES || ["compact", "normal", "comfortable"];
        const next = values[(values.indexOf(this.view.density) + 1) % values.length];
        this._setView({ density: next });
      }, false, densitySymbol);
      // Compactar a lo ANCHO: la columna de nombres se reduce a sus controles y
      // el nombre pasa al tooltip. Es lo único que ocupa ancho fijo en todas las
      // filas; el tiempo que se ve lo sigue mandando el zoom.
      button(view, "", this.view.compact ? "Ensanchar la columna de pistas" : "Compactar la columna de pistas",
        () => this._setView({ compact: !this.view.compact }), this.view.compact, "⇤");
      cont.appendChild(tools);

      // ── regla de frames ──
      const regla = document.createElement("div");
      regla.className = "tl2-ruler";
      const nombre = document.createElement("div");
      nombre.className = "tl2-name tl2-rulername";
      const pos = document.createElement("span");
      pos.className = "tl2-framepos";
      pos.textContent = this.view.compact ? String(doc.frame) : `${doc.frame} / ${sc.playRange().out}`;
      pos.title = `Cuadro ${doc.frame} de ${sc.playRange().out}`;
      /* «+ CAPA», CON PALABRAS Y SIEMPRE A LA VISTA. Reportado: «no veo cómo
         generar una nueva capa» y «el + sirve para agregar un frame». La única
         entrada era el segundo ícono, sin texto, de una barra de 29. Va en la
         celda de la regla porque la regla es fija arriba: debajo de la última
         capa se iba de la vista en cuanto había dos capas (medido). */
      const mas = document.createElement("button");
      mas.type = "button"; mas.className = "tl2-addlayer";
      mas.textContent = this.view.compact ? "+" : "+ Capa";
      mas.title = "Nueva capa de animación (una columna más en la X-sheet)";
      mas.setAttribute("aria-label", mas.title);
      mas.onclick = (e) => { e.stopPropagation(); doc.addLayer(); doc.emit("frame"); };
      nombre.append(pos, mas);
      regla.appendChild(nombre);
      const pista = document.createElement("div");
      pista.className = "tl2-track";
      // TRAMO ACTIVO: de que cuadro a que cuadro se anima. Lo de afuera se
      // atenua y no se reproduce. Los dos bordes se arrastran, como la zona
      // activa de Toon Boom / OpenToonz; antes solo se podian escribir a mano.
      const ultimo = Math.max(1, sc.lastFrame() || 1);
      const abierto = !(sc.range.out > 0);
      const tramo = this._rangePreview || { in: Math.max(1, sc.range.in || 1),
                      out: abierto ? ultimo : Math.max(1, sc.range.out) };
      const majorStep = this._timeline().majorTickStep
        ? this._timeline().majorTickStep(this._frameWidth()) : 6;
      for (let f = 1; f <= total; f++) {
        const t = document.createElement("i");
        const major = (f - 1) % majorStep === 0;
        t.className = "tl2-tick" + (major ? " seg" : "") + (f === doc.frame ? " actual" : "")
          + (cameraKeys[f] ? " camkey" : "")
          + (compositionKeys.has(f) ? " compkey" : "")
          + (f < tramo.in || f > tramo.out ? " fuera" : "")
          + (f === tramo.in ? " borde-in" : "") + (f === tramo.out ? " borde-out" : "");
        if (cameraKeys[f] && compositionKeys.has(f)) t.title = `Claves de cámara y composición en el frame ${f}`;
        else if (cameraKeys[f]) t.title = `Clave de cámara en el frame ${f}`;
        else if (compositionKeys.has(f)) t.title = `Clave de profundidad/composición en el frame ${f}`;
        t.dataset.frame = String(f);
        if (major) t.textContent = String(f);
        // SCRUBBING: arrastrar por la regla recorre la animación con la mano.
        // Es la forma real de revisar un movimiento — el playback te muestra el
        // resultado, el scrub te deja buscar el frame exacto donde algo falla.
        t.onpointerdown = (ev) => {
          if (ev.button !== 0) return;
          ev.preventDefault();
          if (this.playback) this.playback.stop();
          const rect = pista.getBoundingClientRect();
          const aFrame = (x) => Math.max(1, Math.min(total,
            1 + Math.floor((x - rect.left + pista.scrollLeft) / this._frameWidth())));
          const ir = (x) => {
            const f = aFrame(x);
            if (f !== doc.frame) { doc.goTo(f); if (this.audio) this.audio.scrub(f); }
          };
          ir(ev.clientX);
          const mover = (e2) => ir(e2.clientX);
          const soltar = () => {
            document.removeEventListener("pointermove", mover);
            document.removeEventListener("pointerup", soltar);
          };
          document.addEventListener("pointermove", mover);
          document.addEventListener("pointerup", soltar);
        };
        // manija de cada borde: se agarra y se arrastra para mover el tramo
        for (const borde of (f === tramo.in ? ["in"] : []).concat(f === tramo.out ? ["out"] : [])) {
          const mango = document.createElement("b");
          mango.className = "tl2-mango " + borde;
          mango.title = borde === "in" ? "Primer cuadro del tramo \u2014 arrastr\u00e1"
                                       : "\u00daltimo cuadro del tramo \u2014 arrastr\u00e1";
          mango.onpointerdown = (ev) => this._arrastrarTramo(ev, borde, pista, total, tramo);
          t.appendChild(mango);
        }
        pista.appendChild(t);
      }
      // doble clic en un hueco de la regla: volver a toda la escena
      pista.ondblclick = (ev) => {
        if (ev.target.closest(".tl2-mango")) return;
        this._escribirTramo(1, 0);
        this.render();
        if (this.status) this.status("Tramo activo: toda la escena");
      };
      regla.appendChild(pista);
      cont.appendChild(regla);

      // ── mesa de luz rápida ──
      // Los marcadores se fijan sin mover el playhead: sirven para calcar una
      // pose lejana mientras se dibuja en el fotograma actual.
      const luz = document.createElement("div");
      luz.className = "tl2-lighttable" + (this._isCollapsed("references") ? " collapsed" : "");
      const luzNombre = document.createElement("div"); luzNombre.className = "tl2-name";
      const luzTitulo = document.createElement("span"); luzTitulo.textContent = "Referencias";
      const limpiar = document.createElement("button"); limpiar.textContent = "Limpiar";
      limpiar.title = "Quitar todas las referencias fijas";
      limpiar.onclick = () => { doc.onionCfg = { ...(doc.onionCfg || {}), fixed: [] };
        doc.touch(); doc.emit("onion"); };
      luzNombre.title = "Referencias";
      luzNombre.append(foldButton("references"), luzTitulo, limpiar); luz.appendChild(luzNombre);
      const luzTrack = document.createElement("div"); luzTrack.className = "tl2-track";
      const cfg = animation.onion.config(doc.onionCfg);
      const fixed = new Set((cfg.fixed || []).map(Number));
      for (let f = 1; f <= total; f++) {
        const c = document.createElement("i"), drawing = doc.layer && doc.layer.cellAt(f);
        c.className = "tl2-lightcell" + (fixed.has(f) ? " marked " + (f < doc.frame ? "before" : "after") : "")
          + (f === doc.frame ? " current" : "") + (drawing == null ? " empty" : "");
        c.dataset.frame = String(f);
        c.title = drawing == null ? `Frame ${f}: no hay dibujo para fijar` :
          (fixed.has(f) ? `Quitar referencia fija del frame ${f}` : `Fijar el frame ${f} como referencia`);
        luzTrack.appendChild(c);
      }
      // Clic y arrastre pinta o borra una serie de referencias, igual que los
      // marcadores de la barra de tiempo de OpenToonz.
      luzTrack.onpointerdown = (event) => {
        if (event.button !== 0) return;
        const start = event.target.closest && event.target.closest(".tl2-lightcell");
        if (!start || start.classList.contains("empty") || start.classList.contains("current")) return;
        event.preventDefault();
        const values = new Set((cfg.fixed || []).map(Number));
        const turnOn = !values.has(+start.dataset.frame);
        const painted = new Set();
        const paint = (cell) => {
          if (!cell || cell.classList.contains("empty") || cell.classList.contains("current")) return;
          const frame = +cell.dataset.frame; if (painted.has(frame)) return; painted.add(frame);
          if (turnOn) values.add(frame); else values.delete(frame);
          cell.classList.toggle("marked", turnOn);
          cell.classList.toggle("before", turnOn && frame < doc.frame);
          cell.classList.toggle("after", turnOn && frame > doc.frame);
        };
        paint(start);
        const move = (e) => paint(document.elementFromPoint(e.clientX, e.clientY)?.closest?.(".tl2-lightcell"));
        const up = () => {
          document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", up);
          doc.onionCfg = { ...cfg, fixed: [...values].sort((a, b) => a - b) };
          doc.touch(); doc.emit("onion");
        };
        document.addEventListener("pointermove", move); document.addEventListener("pointerup", up);
      };
      luz.appendChild(luzTrack); cont.appendChild(luz);

      // ── pista del esqueleto: una pose global reúne las claves de todas las
      // piezas sin inventar otro timeline. Doble clic clava; Alt+clic borra.
      const rigNodes = Object.values((sc.rig && sc.rig.nodes) || {});
      if (rigNodes.length) {
        const fila = document.createElement("div");
        fila.className = "tl2-row tl2-rig" + (this._isCollapsed("rig") ? " collapsed" : "");
        const cab = document.createElement("div"); cab.className = "tl2-name";
        const badge = document.createElement("span"); badge.textContent = "◇";
        const nombreRig = document.createElement("span"); nombreRig.textContent = "Esqueleto";
        cab.title = "Esqueleto";
        cab.append(foldButton("rig"), badge, nombreRig); fila.appendChild(cab);
        const track = document.createElement("div"); track.className = "tl2-track";
        for (let f = 1; f <= total; f++) {
          const keyed = rigNodes.some(node => node.keys && node.keys[f]);
          const c = document.createElement("i"); c.dataset.frame = String(f);
          c.className = "tl2-cell rig" + (keyed ? " rigkey" : "") + (f === doc.frame ? " actual" : "");
          c.title = keyed ? `Pose del esqueleto en F${f} · Alt+clic: borrar` : `F${f} · doble clic: crear pose global`;
          c.onclick = e => { if (e.altKey && keyed) doc.deleteRigPoseKeys(null, f); else doc.goTo(f); };
          c.ondblclick = () => {
            const poses = Object.fromEntries(rigNodes.map(node => [node.id, sc.rigPose(node.id, f)]));
            doc.setRigPoseKeys(poses, f, "Clave global del rig");
          };
          track.appendChild(c);
        }
        fila.appendChild(track); cont.appendChild(fila);
      }

      // ── SUSTITUCIONES: cuándo cambia el dibujo de una pieza ──
      // La mano abierta que pasa a puño ya funcionaba, pero el cuadro exacto en
      // que ocurre era invisible: un timing que no se ve no se puede corregir.
      // El cambio se marca fuerte; el sostenido, tenue, para leer de un vistazo
      // cuánto dura cada dibujo.
      const swaps = this._timeline().switchTrack
        ? this._timeline().switchTrack(sc, total) : [];
      if (swaps.some(Boolean)) {
        const fila = document.createElement("div");
        fila.className = "tl2-row tl2-swap" + (this._isCollapsed("swaps") ? " collapsed" : "");
        const cab = document.createElement("div"); cab.className = "tl2-name";
        const badge = document.createElement("span"); badge.textContent = "▣";
        const nombre = document.createElement("span"); nombre.textContent = "Sustituciones";
        cab.title = "Sustituciones de dibujo";
        cab.append(foldButton("swaps"), badge, nombre); fila.appendChild(cab);
        const track = document.createElement("div"); track.className = "tl2-track";
        for (let f = 1; f <= total; f++) {
          const mark = swaps[f];
          const c = document.createElement("i"); c.dataset.frame = String(f);
          c.className = "tl2-cell swap" + (mark && mark.change ? " swapkey" : "")
            + (mark && mark.held ? " swaphold" : "") + (f === doc.frame ? " actual" : "");
          // Lo que ENTRA y lo que viene sostenido se dicen por separado: en un
          // cuadro puede cambiar la cabeza mientras la mano sólo continúa.
          const partes = [];
          if (mark && mark.labels.length) partes.push("entra " + mark.labels.join(" · "));
          if (mark && mark.holds.length) partes.push("sostiene " + mark.holds.join(" · "));
          c.title = mark
            ? `F${f} · ` + partes.join(" · ") + (mark.change ? " · Alt+clic: borrar el cambio" : "")
            : `F${f} · sin sustituciones`;
          c.onclick = (e) => {
            if (e.altKey && mark && mark.change)
              mark.slots.forEach((slotId) => doc.deleteRigSwitchKey(slotId, f));
            else doc.goTo(f);
          };
          track.appendChild(c);
        }
        fila.appendChild(track); cont.appendChild(fila);
      }

      // ── una fila por capa ──
      const visibleLayers = this._timeline().visibleLayers
        ? this._timeline().visibleLayers(sc.layers, this.view, doc.layerId) : sc.layers;
      /* La de ADELANTE arriba, como en Harmony, Photoshop o After Effects. En
         el modelo el índice 0 es la de más atrás (así compone el export), así
         que las filas se recorren al revés. La X-sheet sigue como OpenToonz:
         la columna de más a la derecha es la de adelante. */
      for (const ly of visibleLayers.slice().reverse()) {
        const fila = document.createElement("div");
        fila.className = "tl2-row" + (ly.id === doc.layerId ? " sel" : "")
          + (this._isCollapsed(ly.id) ? " collapsed" : "")
          + (ly.locked ? " bloqueada" : "") + (ly.lightTable ? " luz" : "");
        fila.dataset.layerRow = ly.id;

        const cab = document.createElement("div");
        cab.className = "tl2-name";
        const ojo = document.createElement("button");
        ojo.className = "tl2-eye";
        ojo.textContent = ly.visible ? "◉" : "◌";
        ojo.title = ly.visible ? "Ocultar la capa" : "Mostrar la capa";
        ojo.innerHTML = icon(ly.visible ? "i-eye" : "i-eye-off");
        ojo.setAttribute("aria-label", ojo.title);
        ojo.onclick = (e) => { e.stopPropagation(); doc.setLayerProperty(ly.id, "visible", !ly.visible,
          ly.visible ? "Ocultar capa" : "Mostrar capa"); };
        const lock = document.createElement("button");
        lock.className = "tl2-eye"; lock.innerHTML = icon(ly.locked ? "i-lock" : "i-unlock");
        lock.title = ly.locked ? "Desbloquear capa" : "Bloquear capa"; lock.setAttribute("aria-label", lock.title);
        lock.onclick = (e) => { e.stopPropagation(); doc.setLayerProperty(ly.id, "locked", !ly.locked,
          ly.locked ? "Desbloquear capa" : "Bloquear capa"); };
        const txt = document.createElement("span");
        txt.textContent = ly.name;
        cab.title = ly.name;          // compactada, el nombre vive en el tooltip
        // MESA DE LUZ de esta capa: se ve lavada para calcar encima (no cambia el render)
        const luz = document.createElement("button");
        luz.className = "tl2-eye tl2-luz" + (ly.lightTable ? " on" : "");
        luz.innerHTML = icon("i-sun");
        luz.title = ly.lightTable ? "Mesa de luz: apagar (la capa vuelve a verse normal)"
          : "Mesa de luz: ver esta capa lavada para calcar encima";
        luz.setAttribute("aria-label", luz.title); luz.setAttribute("aria-pressed", String(!!ly.lightTable));
        luz.onclick = (e) => { e.stopPropagation(); doc.setLayerProperty(ly.id, "lightTable", !ly.lightTable,
          ly.lightTable ? "Apagar mesa de luz" : "Mesa de luz"); };
        const props = document.createElement("button");
        props.className = "tl2-eye tl2-props" + ((ly.opacity != null && ly.opacity < 1) || (ly.blend && ly.blend !== "normal") ? " on" : "");
        props.innerHTML = icon("i-mixer");
        props.title = "Opacidad, modo de fusión y orden de la capa";
        props.setAttribute("aria-label", props.title);
        props.onclick = (e) => { e.stopPropagation(); if (typeof global.dzCapaPropiedades === "function") global.dzCapaPropiedades(doc, ly.id, props); };
        cab.append(foldButton(ly.id), ojo, lock, luz, props, txt);
        // ARRASTRAR el nombre para reordenar. Tipo propio: las celdas también se
        // arrastran (exposiciones) y no se pueden confundir.
        cab.draggable = true;
        cab.ondragstart = (e) => { e.dataTransfer.setData("application/x-low-capa", ly.id); e.dataTransfer.effectAllowed = "move"; };
        cab.ondragover = (e) => { if ([...e.dataTransfer.types].includes("application/x-low-capa")) { e.preventDefault(); fila.classList.add("soltar"); } };
        cab.ondragleave = () => fila.classList.remove("soltar");
        cab.ondrop = (e) => {
          fila.classList.remove("soltar");
          const origen = e.dataTransfer.getData("application/x-low-capa");
          if (!origen || origen === ly.id) return;
          e.preventDefault();
          doc.moveLayer(origen, sc.layers.findIndex((l) => l.id === ly.id));
        };
        cab.onclick = () => doc.selectLayer(ly.id);
        // renombrar como en la X-sheet: el mismo gesto en los dos lugares
        cab.ondblclick = async (e) => {
          if (e.target.closest("button") || typeof global.dzPromptModal !== "function") return;
          const n = await global.dzPromptModal("Nombre de la capa", "nombre", ly.name);
          if (n) doc.setLayerProperty(ly.id, "name", n, "Renombrar capa");
        };
        fila.appendChild(cab);

        const track = document.createElement("div");
        track.className = "tl2-track";
        for (let f = 1; f <= total; f++) {
          const v = ly.cellAt(f);
          const hold = ly.isHold(f);
          const inicio = v != null && !hold;
          const c = document.createElement("i");
          c.dataset.frame = String(f); c.dataset.layerId = ly.id;
          c.className = "tl2-cell" + (v == null ? "" : " llena")
            + (inicio ? " inicio" : "") + (hold ? " hold" : "")
            + (this._inSelection(ly.id, f) ? " rango" : "")
            + (f === doc.frame ? " actual" : "");
          if (inicio) c.textContent = String(v);
          c.title = v == null ? `Frame ${f}` : `Frame ${f} · dibujo ${v}${hold ? " (sostenido)" : ""}`;
          c.onclick = (e) => {
            const prior = doc.cellSelection;
            if (e.shiftKey && prior) doc.selectCellRange(prior.anchorLayerId, prior.anchorFrame, ly.id, f);
            else doc.selectCellRange(ly.id, f, ly.id, f);
            doc.selectLayer(ly.id); doc.goTo(f); this.render();
          };
          // arrastrar un bloque de exposición a otro frame
          if (inicio) {
            c.draggable = true;
            c.ondragstart = (e) => {
              e.dataTransfer.setData("text/plain", JSON.stringify({
                layerId: ly.id, from: ly.holdStart(f), largo: ly.holdLength(f) }));
              e.dataTransfer.effectAllowed = "move";
            };
          }
          c.ondragover = (e) => { e.preventDefault(); };
          c.ondrop = (e) => {
            e.preventDefault();
            try {
              const d = JSON.parse(e.dataTransfer.getData("text/plain"));
              if (d.layerId !== ly.id) return;    // por ahora, dentro de la misma capa
              doc.apply("move", d.from, d.from + d.largo - 1, f);
            } catch (_) { /* soltaron cualquier cosa */ }
          };
          track.appendChild(c);
        }
        fila.appendChild(track);
        cont.appendChild(fila);
      }

      // ── pista de AUDIO (si hay) ──
      if (this.audio && this.audio.peaks.length) {
        const fila = document.createElement("div");
        fila.className = "tl2-row tl2-audio" + (this._isCollapsed("audio") ? " collapsed" : "");
        const cab = document.createElement("div");
        cab.className = "tl2-name";
        const mudo = document.createElement("button");
        mudo.className = "tl2-eye";
        mudo.textContent = this.audio.muted ? "🔇" : "🔊";
        mudo.title = this.audio.muted ? "Activar el sonido" : "Silenciar";
        mudo.onclick = (e) => { e.stopPropagation(); this.audio.setMuted(!this.audio.muted); this.render(); };
        const nom = document.createElement("span");
        nom.textContent = this.audio.name || "audio";
        nom.title = "Arrastrá la onda para correr el audio y calzarlo con la acción";
        cab.title = this.audio.name || "audio";
        cab.append(foldButton("audio"), mudo, nom);
        fila.appendChild(cab);

        const track = document.createElement("div");
        track.className = "tl2-track tl2-wave";
        for (let f = 1; f <= total; f++) {
          const pico = this.audio.peakAt(f);
          const b = document.createElement("i");
          b.className = "tl2-peak" + (f === doc.frame ? " actual" : "");
          b.style.setProperty("--h", Math.round(pico * 100) + "%");
          b.title = `Frame ${f}`;
          track.appendChild(b);
        }
        // arrastrar la onda = correr el audio en frames (calzarlo con la acción)
        track.onpointerdown = (ev) => {
          if (ev.button !== 0) return;
          ev.preventDefault();
          const x0 = ev.clientX, off0 = this.audio.offset;
          const mover = (e2) => {
            this.audio.offset = off0 + Math.round((e2.clientX - x0) / this._frameWidth());
            this.render();
          };
          const soltar = () => {
            document.removeEventListener("pointermove", mover);
            document.removeEventListener("pointerup", soltar);
            this.audio.setOffset(this.audio.offset);
          };
          document.addEventListener("pointermove", mover);
          document.addEventListener("pointerup", soltar);
        };
        fila.appendChild(track);
        cont.appendChild(fila);
      }

      this.host.innerHTML = "";
      this.host.appendChild(cont);
      cont.scrollTop = oldScroll.top;
      if (this._pendingScrollFrame != null) {
        cont.scrollLeft = Math.max(0, (this._pendingScrollFrame - 1) * this._frameWidth());
        this._pendingScrollFrame = null;
      } else cont.scrollLeft = oldScroll.left;
      // Ctrl+rueda escala el tiempo, sin secuestrar el scroll normal.
      cont.onwheel = (event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        this._zoom(event.deltaY > 0 ? -1 : 1);
      };
      // Sólo el primer montaje lleva el cursor a la vista. Un render por una
      // preferencia no debe saltar de posición ni desorientar al animador.
      if (!old) {
        const act = cont.querySelector(".tl2-cell.actual") || cont.querySelector(".tl2-tick.actual");
        if (act && (global.LOW && global.LOW.core && global.LOW.core.scrollDentro)) global.LOW.core.scrollDentro(act, { limite: this.host });
      }
    }
    _inSelection(layerId, frame) {
      const s = this.doc && this.doc.cellSelection;
      if (!s) return false;
      const layers = this.doc.scene.layers, i = layers.findIndex((l) => l.id === layerId);
      const a = layers.findIndex((l) => l.id === s.fromLayerId), b = layers.findIndex((l) => l.id === s.toLayerId);
      return i >= a && i <= b && frame >= s.from && frame <= s.to;
    }
  }

  animation.TimelineView = TimelineView;
  animation.TL_ANCHO = ANCHO;
})(window);
