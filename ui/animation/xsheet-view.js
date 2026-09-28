/* ══════════════════════════════════════════════════════════════════════════
   X-SHEET — la planilla de exposición

   Filas = frames, columnas = capas, celdas = qué dibujo se ve ahí. Lo que se
   escribe en una celda es el NÚMERO del dibujo, no el dibujo: por eso el mismo
   número repetido es un hold y no una copia.

   Lo que la hace usable (y que la timeline anterior no tenía):
     · el hold se ve — solo la primera celda del bloque lleva número, el resto
       es una línea vertical continua, como en una planilla de papel;
     · se escribe el número directo en la celda para sustituir un dibujo;
     · la manija de abajo estira la exposición arrastrando;
     · las operaciones de timing (2s, 3s, extender, mover) están a un clic.

   Esta vista NO guarda estado: lee del documento y le pide cambios. Todo el
   estado vive en el modelo.

   @module animation/xsheet-view
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};

  const FILAS_EXTRA = 12;   // filas vacías después del final, para seguir armando

  class XsheetView {
    constructor(host, doc) {
      this.host = typeof host === "string" ? document.querySelector(host) : host;
      this.doc = doc;
      this.sel = null;              // rectangular, inclusive selection
      this.dropPreview = null;
      this._desuscribir = doc ? doc.subscribe((_d, reason) => this._docChanged(reason)) : null;
    }
    setDoc(doc) {
      if (this._desuscribir) this._desuscribir();
      this.doc = doc;
      this._desuscribir = doc ? doc.subscribe((_d, reason) => this._docChanged(reason)) : null;
      this.render();
    }
    dispose() { if (this._desuscribir) this._desuscribir(); this.host && (this.host.innerHTML = ""); }
    _docChanged(reason) { if (reason === "frame") this._updateCursor(); else this.render(); }
    _updateCursor() {
      if (!this.host || !this.doc) return;
      this.host.querySelectorAll(".xs2-row.actual").forEach((n) => n.classList.remove("actual"));
      this.host.querySelectorAll(".xs2-cell.cursor").forEach((n) => n.classList.remove("cursor"));
      const row = this.host.querySelector(`.xs2-row[data-frame="${this.doc.frame}"]`);
      if (row) row.classList.add("actual");
      const cell = this.host.querySelector(`.xs2-cell[data-layer-id="${this.doc.layerId}"][data-frame="${this.doc.frame}"]`);
      if (cell) cell.classList.add("cursor");
      const info = this.host.querySelector(".xs2-tpinfo");
      if (info) info.textContent = `${this.doc.frame} / ${this.doc.scene.playRange().out}`;
      if (row && row.scrollIntoView) row.scrollIntoView({ block: "nearest" });
    }

    /** Cuántas filas mostrar. */
    _filas() {
      const ultimo = this.doc ? this.doc.scene.lastFrame() : 0;
      return Math.max(ultimo + FILAS_EXTRA, 24, this.doc ? this.doc.frame + 4 : 0);
    }

    render() {
      if (!this.host || !this.doc) return;
      const doc = this.doc, sc = doc.scene;
      const filas = this._filas();
      const marcas = animation.onion
        ? animation.onion.markers(sc, doc.layerId, doc.frame, doc.onionCfg)
        : [];
      const porFrame = new Map(marcas.map((m) => [m.frame, m]));

      const tabla = document.createElement("div");
      tabla.className = "xs2";

      // ── encabezado: una columna por capa ──
      const head = document.createElement("div");
      head.className = "xs2-head";
      head.appendChild(this._celda("xs2-corner", "#"));
      for (const ly of sc.layers) {
        const h = document.createElement("div");
        h.className = "xs2-col-head" + (ly.id === doc.layerId ? " sel" : "");
        h.textContent = ly.name;
        h.title = "Clic: capa activa · doble clic: renombrar";
        h.onclick = () => doc.selectLayer(ly.id);
        h.ondblclick = async () => {
          const n = await dzPromptModal("Nombre de la capa", "nombre", ly.name);
          if (n) doc.setLayerProperty(ly.id, "name", n, "Renombrar capa");
        };
        head.appendChild(h);
      }
      const mas = document.createElement("button");
      mas.className = "xs2-addcol";
      mas.textContent = "+ Capa";
      mas.title = "Nueva capa de animación (una columna más)";
      mas.onclick = () => doc.addLayer();
      head.appendChild(mas);

      /* Las tres columnas que §6 pide además de los niveles: «filas son
         fotogramas; columnas son niveles, cámara, audio y efectos». Hasta la
         v4.27.0 la hoja tenía sólo el número de cuadro y una columna por capa,
         así que la mitad de lo que la biblia define no estaba.

         Van a la derecha del botón de agregar capa —que pertenece a los
         niveles— y son de LECTURA y navegación: muestran qué pasa en cada
         cuadro y llevan ahí al hacer clic. La edición de claves de cámara sigue
         donde ya estaba, en el panel de cámara: `dzCamKeyToggle` exige el modo
         cámara y opera sobre el cuadro actual, y meter una segunda forma de
         crear claves desde acá sería inventar una operación que nadie pidió. */
      const pista = doc.audio;
      head.appendChild(this._colFija("cam", "CÁM",
        "Cámara: un rombo por cada clave. Clic en la celda: ir a ese cuadro"));
      head.appendChild(this._colFija("aud", "AUDIO", pista
        ? "Audio: el nivel de «" + (pista.name || "la pista") + "» en cada cuadro, " +
          "con el desplazamiento ya aplicado"
        : "Audio: no hay pista cargada en esta escena"));
      head.appendChild(this._colFija("fx", "EFEC",
        "Efectos: claves de composición por cuadro — profundidad y transformación de los planos"));
      tabla.appendChild(head);

      // ── cuerpo ──
      const cuerpo = document.createElement("div");
      cuerpo.className = "xs2-body";
      for (let f = 1; f <= filas; f++) {
        const fila = document.createElement("div");
        fila.dataset.frame = String(f);
        fila.className = "xs2-row" + (f === doc.frame ? " actual" : "") + (f % 6 === 1 ? " seg" : "");

        // número de frame + marca de papel cebolla
        const num = document.createElement("div");
        num.className = "xs2-fnum";
        num.textContent = f;
        const marca = porFrame.get(f);
        if (marca) {
          const rombo = document.createElement("i");
          rombo.className = "xs2-onion";
          rombo.style.background = marca.color;
          rombo.title = marca.tipo === "fixed" ? "Papel cebolla fijo" : "Papel cebolla";
          num.appendChild(rombo);
        }
        num.onclick = () => doc.goTo(f);
        // clic derecho en el número: fijar/soltar marca de papel cebolla
        num.oncontextmenu = (e) => {
          e.preventDefault();
          doc.onionCfg = animation.onion.toggleFixed(doc.onionCfg || animation.onion.DEFAULTS, f);
          doc.emit("onion");
        };
        fila.appendChild(num);

        for (const ly of sc.layers) {
          fila.appendChild(this._celdaXs(ly, f));
        }
        fila.appendChild(this._celdaCamara(f));
        fila.appendChild(this._celdaAudio(f));
        fila.appendChild(this._celdaEfectos(f));
        cuerpo.appendChild(fila);
      }
      tabla.appendChild(cuerpo);

      this.host.innerHTML = "";
      if (this.playback) this.host.appendChild(this._transporte());
      this.host.appendChild(this._barra());
      this.host.appendChild(tabla);

      // dejar visible el frame actual sin saltos bruscos
      const act = cuerpo.querySelector(".xs2-row.actual");
      if (act && act.scrollIntoView) act.scrollIntoView({ block: "nearest" });
    }

    _celda(cls, txt) {
      const d = document.createElement("div");
      d.className = cls;
      d.textContent = txt;
      return d;
    }
    _icon(id) { return `<svg class="ico"><use href="#${id}"/></svg>`; }

    /** Encabezado de una de las tres columnas fijas de §6. */
    _colFija(clase, texto, titulo) {
      const h = document.createElement("div");
      h.className = "xs2-col-head xs2-fija xs2-" + clase;
      h.textContent = texto;
      h.title = titulo;
      return h;
    }
    /** El armazón común de las tres: misma clase, mismo clic, mismo cuadro. */
    _celdaFija(clase, f) {
      const c = document.createElement("div");
      c.className = "xs2-cell xs2-fija xs2-" + clase +
        (f === this.doc.frame ? " cursor" : "");
      c.onclick = () => this.doc.goTo(f);
      return c;
    }
    /** CÁMARA: un rombo por clave. Sale de scene.camera.keys, que es lo que
     *  usa la cámara para interpolar; no hay una segunda fuente. */
    _celdaCamara(f) {
      const c = this._celdaFija("cam", f);
      const claves = (this.doc.scene.camera && this.doc.scene.camera.keys) || {};
      const k = claves[f] != null ? claves[f] : claves[String(f)];
      if (k == null) { c.title = "Cuadro " + f + " — sin clave de cámara"; return c; }
      const rombo = document.createElement("i");
      rombo.className = "xs2-camkey";
      c.appendChild(rombo);
      const z = Number(k.zoom); const partes = [];
      if (Number.isFinite(z) && Math.abs(z - 1) > 1e-3) partes.push("zoom " + z.toFixed(2));
      if (Number.isFinite(Number(k.x)) || Number.isFinite(Number(k.y)))
        partes.push("x " + Math.round(Number(k.x) || 0) + " · y " + Math.round(Number(k.y) || 0));
      c.title = "Clave de cámara en el cuadro " + f + (partes.length ? " — " + partes.join(" · ") : "");
      return c;
    }
    /** AUDIO: el nivel del cuadro, con una barra proporcional. Se pide por
     *  `peakAt`, que ya aplica el desplazamiento de la pista: leer `peaks`
     *  crudo mostraría el audio corrido respecto de lo que se escucha. */
    _celdaAudio(f) {
      const c = this._celdaFija("aud", f);
      const pista = this.doc.audio;
      if (!pista || typeof pista.peakAt !== "function") {
        c.classList.add("vacia");
        c.title = "Sin audio en esta escena";
        return c;
      }
      const nivel = Math.max(0, Math.min(1, Number(pista.peakAt(f)) || 0));
      const barra = document.createElement("i");
      barra.className = "xs2-onda";
      barra.style.setProperty("--nivel", (nivel * 100).toFixed(1) + "%");
      c.appendChild(barra);
      c.title = "Cuadro " + f + " — nivel " + Math.round(nivel * 100) + "%" +
        (pista.offset ? " (desplazamiento " + pista.offset + " cuadros)" : "");
      return c;
    }
    /** EFECTOS: cuántos planos tienen clave de composición en este cuadro.
     *  Es lo que hace que la profundidad y la transformación cambien con el
     *  tiempo, y hasta ahora no se veía en ninguna parte de la hoja. */
    _celdaEfectos(f) {
      const c = this._celdaFija("fx", f);
      const planos = (this.doc.scene.composition && this.doc.scene.composition.planes) || {};
      const conClave = Object.values(planos).filter(p => {
        const k = p && p.keys;
        return k && (k[f] != null || k[String(f)] != null);
      });
      if (!conClave.length) { c.title = "Cuadro " + f + " — sin claves de composición"; return c; }
      c.classList.add("hay");
      c.textContent = conClave.length > 1 ? String(conClave.length) : "";
      if (conClave.length === 1) {
        const punto = document.createElement("i");
        punto.className = "xs2-fxkey";
        c.appendChild(punto);
      }
      c.title = conClave.length === 1
        ? "Clave de composición en el cuadro " + f + " (1 plano)"
        : "Claves de composición en el cuadro " + f + " (" + conClave.length + " planos)";
      return c;
    }

    /** Una celda de la planilla. */
    _celdaXs(ly, f) {
      const doc = this.doc;
      const val = ly.cellAt(f);
      const esHold = ly.isHold(f);
      const inicio = val != null && !esHold;
      const enSel = this._inSelection(ly.id, f);
      const c = document.createElement("div");
      c.className = "xs2-cell" + (enSel ? " rango" : "")
        + (this._inDropPreview(ly.id, f) ? " drop-preview" : "")
        + (val == null ? " vacia" : "")
        + (esHold ? " hold" : "")
        + (inicio ? " inicio" : "")
        + (ly.id === doc.layerId && f === doc.frame ? " cursor" : "");
      // Solo la PRIMERA celda del bloque muestra el número; el resto es la
      // línea de continuación. Así se lee de un vistazo dónde cambia el dibujo,
      // que es lo único que importa cuando mirás timing.
      c.textContent = inicio ? String(val) : "";
      c.title = val == null ? "Vacía" : `Dibujo ${val}${esHold ? " (sostenido)" : ""}`;

      c.onclick = (e) => {
        doc.selectLayer(ly.id);
        if (e.shiftKey && this.sel && this.sel.layerId === ly.id) {
          // Shift+clic extiende la selección desde donde estabas: así se agarra
          // un tramo entero para copiarlo o cambiarle el timing de una
          this.sel = { layerId: ly.id, from: Math.min(this.sel.from, f), to: Math.max(this.sel.from, f) };
          this.render();
          return;
        }
        this.sel = { layerId: ly.id, from: f, to: f };
        doc.goTo(f);
      };
      // doble clic: escribir el número del dibujo (sustitución directa)
      c.ondblclick = async () => {
        const n = await dzPromptModal(`Dibujo en el frame ${f}`, "número de dibujo (vacío = borrar la exposición)", val == null ? "" : String(val));
        if (n === null) return;
        const t = n.trim();
        doc.setCell(f, t === "" ? null : Math.max(1, parseInt(t, 10) || 1), ly.id);
      };
      // arrastrar hacia abajo: estirar la exposición (manija de relleno)
      c.onpointerdown = (e) => {
        if (val == null || e.button !== 0) return;
        const y0 = e.clientY, alto = c.getBoundingClientRect().height || 18;
        let hasta = f;
        const mover = (ev) => {
          const nf = f + Math.max(0, Math.round((ev.clientY - y0) / alto));
          if (nf !== hasta) { hasta = nf; }
        };
        const soltar = () => {
          document.removeEventListener("pointermove", mover);
          document.removeEventListener("pointerup", soltar);
          if (hasta > f) doc.apply("fillHandle", ly.holdStart(f), f, hasta);
        };
        document.addEventListener("pointermove", mover);
        document.addEventListener("pointerup", soltar);
      };
      // Selection owns the cell drag; the fill handle below owns timing stretch.
      c.onclick = () => {};
      c.onpointerdown = (e) => {
        if (e.button !== 0 || e.target.closest(".xs2-fill")) return;
        e.preventDefault();
        const anchor = e.shiftKey && this.sel
          ? { layerId: this.sel.anchorLayerId, frame: this.sel.anchorFrame }
          : { layerId: ly.id, frame: f };
        const update = (layerId, frame) => {
          this.sel = doc.selectCellRange(anchor.layerId, anchor.frame, layerId, frame);
          doc.selectLayer(layerId); doc.goTo(frame); this.render();
        };
        update(ly.id, f);
        const mover = (ev) => {
          const hit = document.elementFromPoint(ev.clientX, ev.clientY);
          const cell = hit && hit.closest ? hit.closest(".xs2-cell") : null;
          if (cell && cell.dataset.layerId) update(cell.dataset.layerId, Number(cell.dataset.frame));
        };
        const soltar = () => { document.removeEventListener("pointermove", mover);
          document.removeEventListener("pointerup", soltar); };
        document.addEventListener("pointermove", mover); document.addEventListener("pointerup", soltar);
      };
      c.dataset.layerId = ly.id; c.dataset.frame = String(f);
      c.oncontextmenu = (e) => {
        doc.selectLayer(ly.id);
        doc.goTo(f);
        this.sel = doc.selectCellRange(ly.id, f, ly.id, f);
        const run = (action, payload = {}) => () => global.lowAnimationPanelCommand?.({
          action, payload: { index: f - 1, ...payload }
        });
        if (typeof global.showCtxMenu === "function") global.showCtxMenu(e, [
          { icon:"＋", label:"Nuevo dibujo", shortcut:"D", action:run("new-drawing") },
          { icon:"□", label:"Frame vacío", action:run("add-blank") },
          { icon:"⧉", label:"Duplicar exposición", action:run("add") },
          "separator",
          { icon:"✂", label:"Cortar celdas", shortcut:"Ctrl+X", action:run("cut-cells") },
          { icon:"▣", label:"Copiar celdas", shortcut:"Ctrl+C", action:run("copy-cells") },
          { icon:"▤", label:"Pegar celdas", shortcut:"Ctrl+V", action:run("paste-cells") },
          { icon:"×", label:"Vaciar exposición", shortcut:"Supr", action:run("clear-cells") },
          "separator",
          { icon:"Ⅱ", label:"Trabajar en doses", action:run("step-2") },
          { icon:"↦", label:"Extender exposición", action:run("longer-exposure") },
          { icon:"⇄", label:"Invertir selección", action:run("reverse-cells") },
          { icon:"⌫", label:"Quitar tiempo", action:run("delete") }
        ]);
        else e.preventDefault();
      };
      c.ondragover = (e) => {
        if (!Array.from(e.dataTransfer.types || []).includes("application/x-low-level-drawings")) return;
        e.preventDefault(); c.classList.add("drop-target");
        try {
          const data = animation.levelDrag || JSON.parse(e.dataTransfer.getData("application/x-low-level-drawings") || "null");
          const count = data && data.numbers ? data.numbers.length : 1;
          this.dropPreview = { layerId: ly.id, from: f, to: f + count - 1 };
          this.host.querySelectorAll(".xs2-cell").forEach((cell) => cell.classList.toggle("drop-preview",
            cell.dataset.layerId === ly.id && Number(cell.dataset.frame) >= f && Number(cell.dataset.frame) < f + count));
        } catch (_) { /* Firefox no deja leer el payload antes del drop */ }
      };
      c.ondragleave = () => c.classList.remove("drop-target");
      c.ondrop = (e) => {
        e.preventDefault(); c.classList.remove("drop-target"); this.dropPreview = null;
        try {
          const data = JSON.parse(e.dataTransfer.getData("application/x-low-level-drawings"));
          doc.exposeDrawings(data.levelId, data.numbers, ly.id, f, { insert: e.shiftKey && !e.altKey });
          this.sel = this._selection(ly.id, f, ly.id, f + data.numbers.length - 1);
        } catch (_) { /* ignore external drops */ }
      };
      if (val != null && ly.cellAt(f + 1) !== val) {
        const handle = document.createElement("i"); handle.className = "xs2-fill";
        handle.onpointerdown = (e) => {
          e.preventDefault(); e.stopPropagation();
          const y0 = e.clientY, alto = c.getBoundingClientRect().height || 18;
          let hasta = f;
          const mover = (ev) => { hasta = f + Math.max(0, Math.round((ev.clientY - y0) / alto)); };
          const soltar = () => { document.removeEventListener("pointermove", mover);
            document.removeEventListener("pointerup", soltar);
            if (hasta > f) doc.apply("fillHandle", ly.holdStart(f), f, hasta); };
          document.addEventListener("pointermove", mover); document.addEventListener("pointerup", soltar);
        };
        c.appendChild(handle);
      }
      return c;
    }

    _selection(aLayer, aFrame, bLayer, bFrame) {
      return this.doc.selectCellRange(aLayer, aFrame, bLayer, bFrame);
    }
    _inSelection(layerId, frame) {
      if (!this.sel) return false;
      const layers = this.doc.scene.layers;
      const i = layers.findIndex((l) => l.id === layerId);
      const a = layers.findIndex((l) => l.id === this.sel.fromLayerId);
      const b = layers.findIndex((l) => l.id === this.sel.toLayerId);
      return i >= a && i <= b && frame >= this.sel.from && frame <= this.sel.to;
    }
    _inDropPreview(layerId, frame) {
      const p = this.dropPreview;
      return !!p && p.layerId === layerId && frame >= p.from && frame <= p.to;
    }

    /** Transporte: reproducir, navegar, FPS y rango. */
    _transporte() {
      const doc = this.doc, pb = this.playback;
      const b = document.createElement("div");
      b.className = "xs2-tp";
      const transportIcons = ["i-skip-start", "i-chev-l", pb.playing ? "i-pause" : "i-play",
        "i-chev-r", "i-step-next", "i-loop"];
      let transportIcon = 0;
      const btn = (_txt, title, fn, act) => {
        const x = document.createElement("button");
        x.className = "xs2-tpb" + (act ? " on" : "");
        x.innerHTML = this._icon(transportIcons[transportIcon++]);
        x.title = title; x.setAttribute("aria-label", title); x.onclick = fn;
        b.appendChild(x); return x;
      };
      btn("⏮", "Primer frame (Inicio)", () => pb.first());
      btn("◀", "Dibujo anterior (↑)", () => pb.stepDrawing(-1));
      btn(pb.playing ? "⏸" : "▶", "Reproducir / parar (Espacio)", () => pb.toggle(), pb.playing);
      btn("▶|", "Dibujo siguiente (↓)", () => pb.stepDrawing(+1));
      btn("⏭", "Último frame (Fin)", () => pb.last());
      btn("↻", "Repetir (L)", () => pb.setLoop(!pb.loop), pb.loop);

      const fps = document.createElement("input");
      fps.type = "number"; fps.min = 1; fps.max = 120; fps.value = doc.scene.fps;
      fps.className = "xs2-num"; fps.title = "Cuadros por segundo";
      fps.onchange = () => pb.setFps(+fps.value);
      b.append(this._et("FPS"), fps);

      const r = doc.scene.playRange();
      const inp = (v, title, fn) => {
        const i = document.createElement("input");
        i.type = "number"; i.min = 1; i.value = v; i.className = "xs2-num"; i.title = title;
        i.onchange = () => fn(+i.value);
        return i;
      };
      b.append(this._et("Rango"),
        inp(r.in, "Primer frame del rango", (v) => pb.setRange(v, doc.scene.range.out)),
        inp(r.out, "Último frame del rango", (v) => pb.setRange(doc.scene.range.in, v)));

      const info = document.createElement("b");
      info.className = "xs2-tpinfo";
      info.textContent = pb.playing && pb.medidoFps
        ? `${doc.frame} · ${pb.medidoFps} fps reales`
        : `${doc.frame} / ${r.out}`;
      b.appendChild(info);
      return b;
    }
    _et(txt) {
      const s = document.createElement("span");
      s.className = "xs2-et"; s.textContent = txt;
      return s;
    }

    /** Barra de operaciones de timing. Son las que se usan todo el tiempo. */
    _barra() {
      const doc = this.doc;
      const b = document.createElement("div");
      b.className = "xs2-bar";
      const rango = () => {
        const ly = doc.layer;
        const s = this.sel && this.sel.fromLayerId === doc.layerId && this.sel.toLayerId === doc.layerId && this.sel.to > this.sel.from
          ? this.sel : null;
        return s ? [s.from, s.to] : [1, Math.max(1, ly ? ly.lastFrame() : 1)];
      };
      const btn = (txt, title, fn) => {
        const x = document.createElement("button");
        x.className = "xs2-op"; x.textContent = txt; x.title = title;
        x.onclick = fn; b.appendChild(x); return x;
      };
      btn("1F", "Un fotograma por dibujo: saca los sostenidos", () => { const [a, z] = rango(); doc.apply("step", a, z, 1); });
      btn("2F", "Cada dibujo dura 2 fotogramas", () => { const [a, z] = rango(); doc.apply("step", a, z, 2); });
      btn("3F", "Cada dibujo dura 3 fotogramas", () => { const [a, z] = rango(); doc.apply("step", a, z, 3); });
      btn("+", "Alargar la exposición del frame actual", () => doc.apply("stepChange", doc.frame, +1));
      btn("−", "Acortar la exposición del frame actual", () => doc.apply("stepChange", doc.frame, -1));
      btn("⤒", "Insertar un frame vacío acá", () => doc.apply("insert", doc.frame, 1));
      btn("⌫", "Quitar este frame y correr lo que sigue", () => doc.apply("remove", doc.frame, doc.frame));
      btn("↔", "Rellenar los huecos sosteniendo cada dibujo", () => { const [a, z] = rango(); doc.apply("autoexpose", a, z); });
      btn("⟲", "Invertir el orden", () => { const [a, z] = rango(); doc.apply("reverse", a, z); });
      btn("⇄", "Ida y vuelta (swing)", () => { const [a, z] = rango(); doc.apply("swing", a, z); });
      return b;
    }
  }

  animation.XsheetView = XsheetView;
})(window);
