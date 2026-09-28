/* ══════════════════════════════════════════════════════════════════════════
   DOCUMENTO DE ANIMACIÓN — el dueño del estado

   Hasta ahora cada frame era un archivo suelto en disco y navegar significaba
   abrir otro archivo (`openDesign(ruta)`). Eso hacía imposible un hold — dos
   frames con el mismo dibujo eran dos archivos — y volvía lento cualquier
   cambio de frame.

   Acá la escena entera vive en memoria como un `Scene`, y navegar es solo
   cambiar qué dibujo se muestra. El disco se toca al guardar, no al moverse.

   Reparto de responsabilidades:
     scene-model.js  qué es una escena           (datos)
     exposures.js    operaciones de timing        (datos)
     document.js     qué dibujo se está editando  (este archivo)
     app.js          pintar y escuchar eventos    (vista)

   @module animation/document
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};
  /** ¿El contenido de un dibujo está vacío? Cuentan como vacío los planos de
   *  arte Color/Línea que el lienzo agrega solos, si no tienen nada adentro. */
  animation.drawingIsEmpty = (contenido) =>
    !contenido || /^(\s*<g\b[^>]*\bdata-low-art="(?:colour|line)"[^>]*>\s*<\/g>)*\s*$/.test(String(contenido));

  /** Nombres de las operaciones, para que el historial diga qué se deshace. */
  const ETIQUETAS = {
    step: "Cambiar el paso", each: "Comprimir", stepChange: "Cambiar la exposición",
    insert: "Insertar frame", clear: "Vaciar celdas", remove: "Quitar frames",
    move: "Mover exposición", repeat: "Repetir", reverse: "Invertir",
    swing: "Ida y vuelta", resetStep: "Volver a 1s", dedupe: "Sacar holds",
    autoexpose: "Sostener dibujos", fillHandle: "Estirar exposición",
  };

  class LowDoc {
    constructor(scene) {
      this.scene = scene || new animation.Scene({ fps: 24 });
      if (!this.scene.levels.length) {
        const lv = this.scene.addLevel("Nivel 1");
        this.scene.addLayer(lv.id, "Capa 1");
      }
      this.frame = 1;
      this.layerId = this.scene.layers[0] ? this.scene.layers[0].id : null;
      this.dirty = false;
      this.listeners = new Set();
      this.cellSelection = null;
      this.path = null;            // archivo .lowscene, si ya se guardó
      this.onionCfg = animation.onion ? animation.onion.config() : {};
      this.mocap = null;
    }

    // ── estado actual ────────────────────────────────────────────────────
    get layer() { return this.scene.layer(this.layerId); }
    get level() { const ly = this.layer; return ly ? this.scene.level(ly.levelId) : null; }
    /** El dibujo que se está editando ahora. */
    get drawing() { return this.scene.drawingAt(this.layerId, this.frame); }
    /** Número de dibujo en la celda actual (null si está vacía). */
    get cell() { const ly = this.layer; return ly ? ly.cellAt(this.frame) : null; }

    // ── historial ────────────────────────────────────────────────────────
    /** Historial compartido con el resto del editor (LOW.core.HistoryManager).
     *  Es UNA sola pila: así Ctrl+Z deshace lo último que hiciste, sea un trazo
     *  o un cambio de timing, en el orden real en que pasaron las cosas. */
    setHistory(h) { this.history = h; return this; }

    /** Registra un cambio de CELDAS de una capa. Guarda el array de celdas —
     *  números, nada pesado — antes y después. */
    _histCells(label, layerId, antes) {
      if (!this.history) return;
      const ly = this.scene.layer(layerId);
      if (!ly) return;
      const despues = ly.cells.slice();
      if (JSON.stringify(antes) === JSON.stringify(despues)) return;   // no pasó nada
      const doc = this;
      this.history.push({
        label, domain: "anim", before: antes, after: despues,
        apply: (_dir, valor) => {
          const capa = doc.scene.layer(layerId);
          if (!capa || !valor) return;
          capa.cells = valor.slice();
          doc.emit("cells");
          const d = doc.drawing;
          doc.emit("frame");
          void d;
        },
      });
    }

    /** Registra un cambio de CONTENIDO de un dibujo. */
    _histDrawing(label, levelId, number, antes, despues, coalesce = null) {
      if (!this.history || antes === despues) return;
      const doc = this;
      const drawing = this.scene.level(levelId)?.byNumber(number);
      if (coalesce && coalesce.drawingTarget === drawing &&
          this.history.undoStack.at(-1) === coalesce && !this.history.redoStack.length) {
        coalesce.after = despues;
        this.history.emit();
        return;
      }
      this.history.push({
        label, domain: "anim", before: antes, after: despues, drawingTarget: drawing,
        apply: (_dir, valor) => {
          const lv = doc.scene.level(levelId);
          const d = lv && lv.byNumber(number);
          if (!d) return;
          d.content = valor || "";
          doc.emit("content");
          doc.emit("frame");     // que el lienzo vuelva a pintar lo que corresponde
        },
      });
    }

    /** Registra una operacion atomica que afecta varias columnas y, si hace
     * falta, los dibujos de sus niveles. Es la base de rangos, pegado y drop. */
    _histRange(label, before, after) {
      if (!this.history || JSON.stringify(before) === JSON.stringify(after)) return;
      const doc = this;
      const restore = (snap) => {
        for (const item of snap.layers || []) {
          const ly = doc.scene.layer(item.id);
          if (ly) ly.cells = item.cells.slice();
        }
        for (const item of snap.levels || []) {
          const lv = doc.scene.level(item.id);
          if (!lv) continue;
          lv.drawings = item.drawings.map((d) => new animation.Drawing(d));
        }
        doc.touch(); doc.emit("cells"); doc.emit("level"); doc.emit("frame");
      };
      this.history.push({ label, domain: "anim", before, after,
        apply: (_dir, value) => restore(value) });
    }

    /** La instantánea de una capa y su nivel, lista para mandar por la red.
     *  Es la MISMA forma que usa el historial para rangos y pegado, así que no
     *  hay un segundo formato que mantener al día. */
    snapshotPara(layerId, levelId) {
      return this._snapshot(layerId ? [layerId] : [], levelId ? [levelId] : []);
    }

    /** Aplica lo que hizo otro. Deliberadamente NO pasa por el historial: el
     *  Ctrl+Z de uno no puede deshacer el trabajo del que está al lado. Cada
     *  quien deshace lo suyo, que es lo que espera cualquiera que dibuja. */
    applyRemoteSnapshot(snap) {
      if (!snap) return false;
      let algo = false;
      for (const item of snap.layers || []) {
        const ly = this.scene.layer(item.id);
        if (ly && Array.isArray(item.cells)) { ly.cells = item.cells.slice(); algo = true; }
      }
      for (const item of snap.levels || []) {
        const lv = this.scene.level(item.id);
        if (!lv || !Array.isArray(item.drawings)) continue;
        lv.drawings = item.drawings.map((d) => new animation.Drawing(d));
        algo = true;
      }
      if (!algo) return false;
      this.touch(); this.emit("cells"); this.emit("level"); this.emit("frame");
      return true;
    }

    _snapshot(layerIds, levelIds) {
      return {
        layers: [...new Set(layerIds || [])].map((id) => this.scene.layer(id)).filter(Boolean)
          .map((ly) => ({ id: ly.id, cells: ly.cells.slice() })),
        levels: [...new Set(levelIds || [])].map((id) => this.scene.level(id)).filter(Boolean)
          .map((lv) => ({ id: lv.id, drawings: lv.drawings.map((d) => d.toJSON()) })),
      };
    }

    subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
    emit(motivo) { this.listeners.forEach((fn) => { try { fn(this, motivo); } catch (_) { /* un oyente roto no frena al resto */ } }); }
    touch() { this.dirty = true; this.scene.touch(); return this; }

    /** Cambia la resolución lógica del archivo. El tamaño del panel o monitor
     *  jamás llama a este método: esas variaciones pertenecen al zoom. */
    setSize(width, height, { history = true } = {}) {
      const before = { width: this.scene.width, height: this.scene.height };
      if (!this.scene.setSize(width, height)) return false;
      const after = { width: this.scene.width, height: this.scene.height };
      this.dirty = true; this.emit("document");
      if (history && this.history) {
        const doc = this;
        this.history.push({ label: "Cambiar tamaño del documento", domain: "document",
          before, after, apply: (_direction, value) => {
            doc.scene.setSize(value.width, value.height);
            doc.dirty = true; doc.emit("document");
          } });
      }
      return true;
    }

    // ── navegación ───────────────────────────────────────────────────────
    goTo(frame) {
      const f = Math.max(1, Math.round(frame) || 1);
      if (f === this.frame) return this.frame;
      this.frame = f;
      this.emit("frame");
      return f;
    }
    /** Frame siguiente/anterior (uno a uno). */
    step(delta) { return this.goTo(this.frame + delta); }
    /** Dibujo siguiente/anterior, salteando los holds (Shift+↑/↓). */
    stepDrawing(dir) {
      const ly = this.layer;
      if (!ly) return this.frame;
      const f = animation.exposures.nextDrawingFrame(ly, this.frame, dir >= 0 ? 1 : -1);
      return f == null ? this.frame : this.goTo(f);
    }
    selectLayer(id) { if (this.scene.layer(id)) { this.layerId = id; this.emit("layer"); } }

    selectCellRange(aLayer, aFrame, bLayer, bFrame) {
      const layers = this.scene.layers;
      const ai = layers.findIndex((l) => l.id === aLayer), bi = layers.findIndex((l) => l.id === bLayer);
      if (ai < 0 || bi < 0) return null;
      const left = Math.min(ai, bi), right = Math.max(ai, bi);
      return this.cellSelection = { anchorLayerId: aLayer, anchorFrame: aFrame,
        fromLayerId: layers[left].id, toLayerId: layers[right].id,
        from: Math.min(aFrame, bFrame), to: Math.max(aFrame, bFrame) };
    }

    setLayerProperty(id, key, value, label) {
      const ly = this.scene.layer(id);
      if (!ly || !["name", "visible", "locked", "opacity", "z", "blend", "lightTable"].includes(key)) return false;
      // los valores se normalizan IGUAL que al cargar: si no, una fusión inválida
      // se vería en la sesión y desaparecería al reabrir
      if (key === "blend" && !animation.LAYER_BLENDS.includes(value)) return false;
      if (key === "opacity") value = Math.max(0, Math.min(1, Number(value) || 0));
      if (key === "lightTable" || key === "visible" || key === "locked") value = !!value;
      const before = ly[key];
      if (before === value) return false;
      ly[key] = value; this.touch(); this.emit("layers");
      if (this.history) {
        const doc = this;
        this.history.push({ label: label || "Cambiar capa", domain: "anim", before, after: value,
          apply: (_dir, next) => { const layer = doc.scene.layer(id); if (!layer) return;
            layer[key] = next; doc.touch(); doc.emit("layers"); doc.emit("frame"); } });
      }
      return true;
    }

    /** Aplica una lista de capas como estado (para Undo/Redo de orden, alta y
     *  baja): mismo camino en las dos direcciones, sin copias a mano. */
    _setLayersState(state) {
      // Se REUSAN las capas que ya existen (sólo cambia el orden) y se crean las
      // que faltan: rearmarlas todas dejaba colgada cualquier referencia a una
      // capa —la cazó la prueba: tras deshacer un reordenar, la capa que uno
      // tenía en la mano ya no era la de la escena—.
      const vivas = new Map(this.scene.layers.map((l) => [l.id, l]));
      this.scene.layers = state.layers.map((l) => vivas.get(l.id) || new animation.Layer(l));
      for (const lv of state.levels || []) if (!this.scene.level(lv.id)) this.scene.levels.push(new animation.Level(lv));
      this.scene.levels = this.scene.levels.filter((lv) => !(state.dropLevels || []).includes(lv.id));
      this.layerId = this.scene.layer(state.layerId) ? state.layerId : (this.scene.layers[0] ? this.scene.layers[0].id : null);
      this.touch(); this.emit("layers"); this.emit("cells"); this.emit("frame");
    }
    _layersSnapshot() {
      return { layers: this.scene.layers.map((l) => l.toJSON()), layerId: this.layerId };
    }
    _pushLayersChange(label, before, after) {
      if (!this.history) return;
      const doc = this;
      this.history.push({ label, domain: "anim", before, after,
        apply: (_dir, value) => doc._setLayersState(value) });
    }

    /** Mueve una capa a otro lugar del apilado. Índice 0 = la de más ATRÁS
     *  (así compone el export); la línea de tiempo la muestra abajo de todo. */
    moveLayer(id, index) {
      const at = this.scene.layers.findIndex((l) => l.id === id);
      if (at < 0) return false;
      const to = Math.max(0, Math.min(this.scene.layers.length - 1, Math.round(index)));
      if (to === at) return false;
      const before = this._layersSnapshot();
      const [ly] = this.scene.layers.splice(at, 1);
      this.scene.layers.splice(to, 0, ly);
      const after = this._layersSnapshot();
      this.touch(); this.emit("layers"); this.emit("frame");
      this._pushLayersChange(to > at ? "Traer capa adelante" : "Llevar capa atrás", before, after);
      return true;
    }

    /** Quita una capa. Nunca la última: una escena sin capas no tiene dónde
     *  dibujar. Su nivel se va con ella si ninguna otra capa lo usa, y vuelve
     *  entero con Deshacer. */
    removeLayer(id) {
      const at = this.scene.layers.findIndex((l) => l.id === id);
      if (at < 0 || this.scene.layers.length <= 1) return false;
      const ly = this.scene.layers[at];
      const compartido = this.scene.layers.some((l) => l !== ly && l.levelId === ly.levelId);
      const lv = !compartido && this.scene.level(ly.levelId);
      const before = { ...this._layersSnapshot(), levels: lv ? [lv.toJSON()] : [] };
      this.scene.layers.splice(at, 1);
      if (lv) this.scene.levels = this.scene.levels.filter((x) => x !== lv);
      if (this.layerId === id) this.layerId = (this.scene.layers[Math.max(0, at - 1)] || this.scene.layers[0]).id;
      const after = { ...this._layersSnapshot(), dropLevels: lv ? [lv.id] : [] };
      this.touch(); this.emit("layers"); this.emit("cells"); this.emit("frame");
      this._pushLayersChange("Eliminar capa", before, after);
      return true;
    }

    /** Duplica una capa ENCIMA de la original, con un nivel propio: los dibujos
     *  se copian, así retocar la copia no toca la original. */
    duplicateLayer(id) {
      const at = this.scene.layers.findIndex((l) => l.id === id);
      if (at < 0) return null;
      const src = this.scene.layers[at], lvSrc = this.scene.level(src.levelId);
      const before = this._layersSnapshot();
      const lv = this.scene.addLevel((lvSrc ? lvSrc.name : src.name) + " copia", lvSrc ? lvSrc.type : undefined);
      if (lvSrc) for (const d of lvSrc.drawings) lv.addDrawing(d.number, d.content);
      const data = src.toJSON(); delete data.id;
      const copia = new animation.Layer({ ...data, name: src.name + " copia", levelId: lv.id });
      this.scene.layers.splice(at + 1, 0, copia);
      this.layerId = copia.id;
      const after = { ...this._layersSnapshot(), levels: [lv.toJSON()] };
      before.dropLevels = [lv.id];
      this.touch(); this.emit("layers"); this.emit("cells"); this.emit("frame");
      this._pushLayersChange("Duplicar capa", before, after);
      return copia;
    }

    setCompositionTransform(id, transform, { frame = null, source = {}, label = "Transformar plano" } = {}) {
      let plane = this.scene.compositionPlane(id);
      if (!plane) plane = this.scene.ensureCompositionPlane(id, source);
      if (!plane || plane.locked) return false;
      const keyed = frame != null, key = keyed ? Math.max(1, Math.round(frame)) : null;
      const before = keyed ? (plane.keys[key] ? JSON.parse(JSON.stringify(plane.keys[key])) : null)
        : JSON.parse(JSON.stringify(plane.transform));
      if (!this.scene.setCompositionTransform(id, transform, key)) return false;
      const after = JSON.parse(JSON.stringify(keyed ? plane.keys[key] : plane.transform));
      // Mover un plano NO es cambiar de cuadro. Emitia "frame", y el manejador
      // de cuadro reemplaza el lienzo entero desde el documento y deselecciona:
      // medido en la app real, el primer cambio de un valor vaciaba la lista de
      // planos y perdia la seleccion, asi que el SEGUNDO cambio no hacia nada.
      // Ahora viaja por "composition", que aplica las transformaciones al
      // lienzo sin tocar su contenido.
      this.dirty = true; this.emit("composition");
      if (this.history) {
        const doc = this;
        this.history.push({ label, domain: "composition", before, after,
          apply: (_direction, value) => {
            const target = doc.scene.ensureCompositionPlane(id, source);
            if (keyed) { if (value == null) delete target.keys[key]; else target.keys[key] = JSON.parse(JSON.stringify(value)); }
            else target.transform = JSON.parse(JSON.stringify(value));
            doc.touch(); doc.emit("composition");
          } });
      }
      return true;
    }

    /* ── STORYBOARD ────────────────────────────────────────────────────────
       La secuencia entera es chica, así que cada gesto guarda un antes y un
       después completos: una sola entrada de historial por intención, sin
       parches que puedan dejar el orden a medias. */
    _storyboardChange(label, mutate) {
      const before = animation.clone(this.scene.storyboard);
      const result = mutate(this.scene.storyboard);
      if (result === false) return false;
      this.scene.storyboard = animation.storyboardData(this.scene.storyboard);
      const after = animation.clone(this.scene.storyboard);
      if (JSON.stringify(before) === JSON.stringify(after)) return result;
      this.touch(); this.emit("storyboard");
      if (this.history) {
        const doc = this;
        this.history.push({ label, domain: "storyboard", before, after,
          apply: (_direction, value) => {
            doc.scene.storyboard = animation.storyboardData(value);
            doc.touch(); doc.emit("storyboard");
          } });
      }
      return result;
    }

    /** Agrega un panel. Sin índice va al final; con índice, se mete ANTES del
     *  que estaba ahí, que es como se piensa «un plano más acá». */
    addStoryboardBoard(data = {}, index = null) {
      let id = null;
      this._storyboardChange("Agregar panel", (storyboard) => {
        const board = animation.storyboardBoard(data, storyboard.boards.length);
        id = board.id;
        const at = index == null ? storyboard.boards.length
          : Math.max(0, Math.min(storyboard.boards.length, Math.round(index)));
        storyboard.boards.splice(at, 0, board);
        return id;
      });
      return id;
    }

    /** Varios paneles de una vez (importar un proyecto): UNA sola entrada de
     *  Undo, no una por panel. Devuelve los ids en orden. */
    addStoryboardBoards(list = [], label = "Importar paneles") {
      const ids = [];
      if (!Array.isArray(list) || !list.length) return ids;
      this._storyboardChange(label, (storyboard) => {
        for (const data of list) {
          const board = animation.storyboardBoard(data || {}, storyboard.boards.length);
          storyboard.boards.push(board); ids.push(board.id);
        }
        return true;
      });
      return ids;
    }

    updateStoryboardBoard(id, patch = {}, label = "Editar panel") {
      return this._storyboardChange(label, (storyboard) => {
        const board = storyboard.boards.find((b) => b.id === id);
        if (!board) return false;
        // El id no se toca desde un patch: es la identidad del panel y hay
        // referencias colgando de él.
        const { id: _ignorado, ...resto } = patch || {};
        Object.assign(board, resto, { shot: { ...board.shot, ...(patch.shot || {}) } });
        return true;
      });
    }

    removeStoryboardBoard(id) {
      return this._storyboardChange("Quitar panel", (storyboard) => {
        const at = storyboard.boards.findIndex((b) => b.id === id);
        if (at < 0) return false;
        storyboard.boards.splice(at, 1);
        return true;
      });
    }

    moveStoryboardBoard(id, index) {
      return this._storyboardChange("Reordenar paneles", (storyboard) => {
        const at = storyboard.boards.findIndex((b) => b.id === id);
        if (at < 0) return false;
        const destino = Math.max(0, Math.min(storyboard.boards.length - 1, Math.round(index)));
        if (destino === at) return false;
        const [board] = storyboard.boards.splice(at, 1);
        storyboard.boards.splice(destino, 0, board);
        return true;
      });
    }

    // ── edición ──────────────────────────────────────────────────────────
    /** Asegura que haya un dibujo en la celda actual y lo devuelve. Si la celda
     *  está vacía crea uno nuevo: empezar a dibujar en un frame vacío tiene que
     *  funcionar sin ceremonia. */
    ensureDrawing() {
      const ly = this.layer, lv = this.level;
      if (!ly || !lv || ly.locked) return null;
      let num = ly.cellAt(this.frame);
      if (num == null) {
        num = lv.nextNumber();
        lv.addDrawing(num, "");
        ly.setCell(this.frame, num);
        this.touch();
        this.emit("cells");
      }
      return lv.byNumber(num);
    }
    /** Guarda el contenido dibujado en el dibujo actual. */
    writeDrawing(contenido, { label = "Dibujar", coalesce = null } = {}) {
      const lyAntes = this.layer ? this.layer.cells.slice() : null;
      const habia = this.cell != null;
      /* NADA DIBUJADO NO ES UN DIBUJO. El lienzo le pone a toda hoja los dos
         planos de arte vacíos (Color y Línea), y el volcado con retardo los
         escribía: con eso, agregar una capa creaba un dibujo fantasma en su
         cuadro, y Deshacer quedaba en BUCLE —volvía el dibujo a "", el lienzo
         lo repintaba con los planos, el volcado lo reescribía y apilaba otro
         «Dibujar»—. Medido: ocho Ctrl+Z seguidos no llegaban a la capa. */
      if (animation.drawingIsEmpty(contenido) &&
          (!habia || animation.drawingIsEmpty(this.drawing ? this.drawing.content : ""))) return false;
      const d = this.ensureDrawing();
      if (!d) return false;
      const antes = d.content;
      d.content = contenido || "";
      this.touch();
      this.emit("content");
      // si la celda estaba vacía, el dibujo se acaba de crear: eso también
      // tiene que poder deshacerse
      if (!habia && lyAntes) this._histCells("Dibujar en un frame vacío", this.layerId, lyAntes);
      this._histDrawing(label, this.layer && this.layer.levelId, d.number, antes, d.content, coalesce);
      return true;
    }
    /** Expone un número de dibujo en la celda (escribirlo en la xsheet). */
    setCell(frame, drawingNumber, layerId) {
      const id = layerId || this.layerId;
      const ly = this.scene.layer(id);
      const antes = ly ? ly.cells.slice() : null;
      const ok = this.scene.expose(id, frame, drawingNumber);
      if (ok) {
        this.touch(); this.emit("cells");
        // Si lo que cambió es la celda donde uno ESTÁ PARADO, cambió el dibujo
        // que hay sobre la mesa: hay que avisarlo o el lienzo se queda con el
        // anterior. Y un lienzo desactualizado no es sólo un problema visual —
        // el volcado con retardo (dzMarkDirty) escribe el lienzo ENCIMA del
        // dibujo del modelo, así que lo viejo se come a lo nuevo. Así se perdía
        // lo que uno pegaba con Ctrl+V en el cuadro donde ya estaba parado.
        if (id === this.layerId && frame === this.frame) this.emit("frame");
        if (antes) this._histCells("Exponer dibujo", id, antes);
      }
      return ok;
    }
    /** Aplica una operación de `exposures` sobre la capa actual y avisa. */
    apply(op, ...args) {
      const ly = this.layer;
      const fn = animation.exposures[op];
      if (!ly || typeof fn !== "function") return false;
      const antes = ly.cells.slice();
      const propioAntes = ly.id === this.layerId ? antes[this.frame - 1] : undefined;
      const ok = fn(ly, ...args);
      if (ok) {
        this.touch(); this.emit("cells");
        // misma razón que en setCell: si la operación cambió el dibujo del
        // cuadro donde uno está, la mesa tiene que volver a pintarse
        if (ly.id === this.layerId && ly.cells[this.frame - 1] !== propioAntes)
          this.emit("frame");
        this._histCells(ETIQUETAS[op] || "Cambiar exposición", ly.id, antes);
      }
      return ok;
    }

    // -- PALETA (el color, ni el material ni el tiempo) --------------------
    /** La paleta del nivel actual. Si el nivel no tenia, se le crea una y se le
     *  deja puesta con los cinco colores de arranque: dibujar nunca puede
     *  exigir "primero arma una paleta". */
    get palette() {
      const ly = this.layer, lv = this.level;
      if (!ly || !lv) return null;
      let pal = this.scene.levelPalette(lv.id);
      if (!pal) {
        pal = this.scene.addPalette("Paleta del nivel");
        if (animation.palette) animation.palette.seed(pal);
        this.scene.setLevelPalette(lv.id, pal.id);
      }
      return pal;
    }

    /** Cambia el color de un estilo. Recolorea, de una, todo lo que lo usa.
     *
     *  `registrar` en false es para MIENTRAS se arrastra el selector de color:
     *  ahi llegan decenas de cambios por segundo y no tiene sentido llenar el
     *  historial de pasos intermedios. Se registra una vez, al soltar, con el
     *  color de partida que guardo la vista. */
    setStyleColor(index, color, registrar = true, colorAntes) {
      const pal = this.palette;
      const st = pal && pal.byIndex(index);
      if (!st) return false;
      const antes = colorAntes || st.color;
      st.setColor(color);
      this.touch(); this.emit("palette");
      if (registrar && antes !== st.color)
        this._histStyle("Cambiar un color", pal.id, st.id, antes, st.color);
      return true;
    }
    /** Opacidad global del estilo. Sigue la misma regla gestual que el color:
     *  preview continuo mientras se arrastra y una sola entrada al soltar. */
    setStyleOpacity(index, opacity, registrar = true, opacityAntes) {
      const pal = this.palette;
      const st = pal && pal.byIndex(index);
      if (!st || pal.locked) return false;
      const antes = opacityAntes == null ? st.opacity : animation.Style.normalizeOpacity(opacityAntes);
      st.setOpacity(opacity);
      this.touch(); this.emit("palette");
      if (registrar && antes !== st.opacity && this.history) {
        const doc=this, palId=pal.id, stId=st.id;
        this.history.push({ label:"Cambiar opacidad de estilo", domain:"anim", before:antes, after:st.opacity,
          apply:(_dir,value)=>{const p=doc.scene.palette(palId),s=p&&p.style(stId);if(s){s.setOpacity(value);doc.emit("palette");}} });
      }
      return true;
    }
    _histStyle(label, paletteId, styleId, antes, despues) {
      if (!this.history || antes === despues) return;
      const doc = this;
      this.history.push({
        label, domain: "anim", before: antes, after: despues,
        apply: (_dir, valor) => {
          const p = doc.scene.palette(paletteId);
          const s = p && p.style(styleId);
          if (s) { s.setColor(valor); doc.emit("palette"); }
        },
      });
    }

    addStyle(color, name) {
      const pal = this.palette;
      if (!pal) return null;
      const st = pal.addStyle(name || `Estilo ${pal.nextIndex()}`, color || "#000000");
      this.touch(); this.emit("palette");
      if (this.history) {
        const doc = this, palId = pal.id, datos = st.toJSON();
        this.history.push({
          label: "Estilo nuevo", domain: "anim", before: null, after: datos.index,
          apply: (dir) => {
            const p = doc.scene.palette(palId);
            if (!p) return;
            if (dir === "undo") p.removeStyle(datos.id);
            else if (!p.style(datos.id)) p.styles.push(new animation.Style(datos));
            doc.emit("palette");
          },
        });
      }
      return st;
    }
    renameStyle(index, name) {
      const pal = this.palette;
      const st = pal && pal.byIndex(index);
      if (!st || !name || st.name === name) return false;
      const antes = st.name;
      st.rename(name);
      this.touch(); this.emit("palette");
      if (this.history) {
        const doc = this, palId = pal.id, stId = st.id;
        this.history.push({
          label: "Renombrar estilo", domain: "anim", before: antes, after: st.name,
          apply: (_dir, valor) => {
            const p = doc.scene.palette(palId);
            const s = p && p.style(stId);
            if (s) { s.name = valor; doc.emit("palette"); }
          },
        });
      }
      return true;
    }
    setStyleGroup(index, group) {
      const pal=this.palette, st=pal&&pal.byIndex(index);
      if(!st||pal.locked)return false;
      const before=String(st.meta?.group||""), after=String(group||"").trim();
      if(before===after)return true;
      st.meta=st.meta||{};if(after)st.meta.group=after;else delete st.meta.group;
      this.touch();this.emit("palette");
      if(this.history){const doc=this,palId=pal.id,stId=st.id;this.history.push({label:"Cambiar grupo de estilo",domain:"anim",before,after,apply:(_dir,value)=>{const p=doc.scene.palette(palId),s=p&&p.style(stId);if(s){s.meta=s.meta||{};if(value)s.meta.group=value;else delete s.meta.group;doc.emit("palette");}}});}
      return true;
    }
    /** Saca un estilo únicamente cuando ya no tiene referencias. Un estilo
     *  usado primero debe reasignarse: así ningún dibujo queda apuntando a una
     *  identidad inexistente ni aparece misteriosamente con otro color. */
    removeStyle(index) {
      const pal = this.palette;
      const st = pal && pal.byIndex(index);
      if (!st || pal.locked) return false;
      const uso = animation.palette?.usage(this.scene, pal)?.[Number(index)];
      if (uso && uso.total) return false;
      const datos = st.toJSON();
      pal.removeStyle(st.id);
      this.touch(); this.emit("palette");
      if (this.history) {
        const doc = this, palId = pal.id;
        this.history.push({
          label: "Borrar estilo", domain: "anim", before: datos, after: null,
          apply: (dir) => {
            const p = doc.scene.palette(palId);
            if (!p) return;
            if (dir === "undo") { if (!p.style(datos.id)) p.styles.push(new animation.Style(datos)); }
            else p.removeStyle(datos.id);
            doc.emit("palette");
          },
        });
      }
      return true;
    }
    /** STYLE-02 de la matriz: reasignar y borrar son UNA operación reversible.
     *  Hechas por separado, un solo Ctrl+Z deshacía el borrado y dejaba los
     *  usos ya reasignados —o al revés—, que es justo la referencia huérfana
     *  que la matriz prohíbe. Devuelve qué pasó, sin inventar éxitos. */
    replaceStyle(from, to) {
      const pal = this.palette;
      if (!pal || pal.locked || !animation.palette) return { reasignados: 0, borrado: false };
      const origen = pal.byIndex(from), destino = pal.byIndex(to);
      if (!origen || !destino || origen.id === destino.id) return { reasignados: 0, borrado: false };
      const enTransaccion = !!this.history && !this.history.transaction;
      if (enTransaccion) this.history.begin("Reasignar y borrar estilo");
      let reasignados = 0, borrado = false;
      try {
        reasignados = this.reassignStyle(from, to);
        borrado = this.removeStyle(from);
      } finally {
        // se confirma lo que YA se aplicó al modelo: cancelar dejaría el
        // documento cambiado y sin forma de volver atrás
        if (enTransaccion) this.history.commit();
      }
      return { reasignados, borrado };
    }
    /** LEVEL-01: renombrar no puede cambiar la identidad. El id interno del
     *  Level es lo que referencian capas, celdas y paletas; sólo cambia el
     *  nombre que ve la persona, y se deshace. */
    renameLevel(levelId, nombre) {
      const lv = this.scene.level(levelId);
      const limpio = String(nombre == null ? "" : nombre).trim();
      if (!lv || !limpio || limpio === lv.name) return false;
      const antes = lv.name;
      lv.name = limpio;
      this.touch(); this.emit("level"); this.emit("layers");
      if (this.history) {
        const doc = this;
        this.history.push({
          label: "Renombrar nivel", domain: "anim", before: antes, after: limpio,
          apply: (dir, valor) => {
            const nivel = doc.scene.level(levelId);
            if (!nivel) return;
            nivel.name = valor;
            doc.touch(); doc.emit("level"); doc.emit("layers");
          },
        });
      }
      return true;
    }
    /** Pasa todo lo que usaba un estilo a usar otro: para unificar dos colores
     *  y para vaciar un estilo antes de borrarlo. */
    reassignStyle(from, to) {
      const pal = this.palette;
      if (!pal || !animation.palette || !pal.byIndex(to)) return 0;
      const antes = this._snapContenidos();
      const n = animation.palette.reassign(this.scene, from, to, pal);
      if (!n) return 0;
      this.touch(); this.emit("content"); this.emit("palette");
      this._histContenidos("Reasignar estilo", antes);
      return n;
    }
    /** ADOPTAR: mete en la paleta los colores de lo que ya estaba dibujado.
     *  No cambia ningun color: habilita cambiarlos. */
    adoptColors() {
      const pal = this.palette;
      if (!pal || !animation.palette) return null;
      const contAntes = this._snapContenidos();
      const estilosAntes = pal.styles.map((s) => s.toJSON());
      const r = animation.palette.adopt(this.scene, pal);
      if (!r.elementos) return r;
      this.touch(); this.emit("content"); this.emit("palette");
      if (this.history) {
        const doc = this, palId = pal.id;
        const after = { estilos: pal.styles.map((s) => s.toJSON()), cont: this._snapContenidos() };
        this.history.push({
          label: "Adoptar los colores del dibujo", domain: "anim",
          before: { estilos: estilosAntes, cont: contAntes }, after,
          apply: (_dir, valor) => {
            const p = doc.scene.palette(palId);
            if (p && valor) p.styles = valor.estilos.map((s) => new animation.Style(s));
            doc._restaurarContenidos(valor && valor.cont);
            doc.emit("content"); doc.emit("palette"); doc.emit("frame");
          },
        });
      }
      return r;
    }
    /** Copia del contenido de todos los dibujos, para poder deshacer las
     *  operaciones que escriben en varios a la vez. */
    _snapContenidos() {
      const out = {};
      for (const lv of this.scene.levels)
        for (const d of lv.drawings) out[lv.id + "/" + d.number] = d.content;
      return out;
    }
    _restaurarContenidos(snap) {
      if (!snap) return;
      for (const lv of this.scene.levels)
        for (const d of lv.drawings) {
          const v = snap[lv.id + "/" + d.number];
          if (v != null) d.content = v;
        }
    }
    _histContenidos(label, antes) {
      if (!this.history) return;
      const doc = this, despues = this._snapContenidos();
      this.history.push({
        label, domain: "anim", before: antes, after: despues,
        apply: (_dir, valor) => {
          doc._restaurarContenidos(valor);
          doc.emit("content"); doc.emit("frame");
        },
      });
    }

    /** Lee un rectangulo de la XSheet. Las coordenadas son inclusivas. */
    readCells(range) {
      const layers = this.scene.layers;
      const a = Math.max(0, layers.findIndex((l) => l.id === range.fromLayerId));
      const b0 = layers.findIndex((l) => l.id === range.toLayerId);
      const b = b0 < 0 ? a : b0;
      const left = Math.min(a, b), right = Math.max(a, b);
      const from = Math.max(1, Math.min(range.from, range.to));
      const to = Math.max(from, Math.max(range.from, range.to));
      return {
        width: right - left + 1, height: to - from + 1,
        columns: layers.slice(left, right + 1).map((ly) => {
          const lv = this.scene.level(ly.levelId);
          const cells = animation.exposures.read(ly, from, to);
          const used = new Set(cells.filter((n) => n != null));
          return { levelId: ly.levelId, cells,
            drawings: lv ? lv.drawings.filter((d) => used.has(d.number)).map((d) => d.toJSON()) : [] };
        }),
      };
    }

    clearCells(range, label) {
      const layers = this.scene.layers;
      const a = layers.findIndex((l) => l.id === range.fromLayerId);
      const b = layers.findIndex((l) => l.id === range.toLayerId);
      if (a < 0 || b < 0) return false;
      const selected = layers.slice(Math.min(a, b), Math.max(a, b) + 1);
      const before = this._snapshot(selected.map((l) => l.id), []);
      const from = Math.max(1, Math.min(range.from, range.to));
      const to = Math.max(from, Math.max(range.from, range.to));
      selected.forEach((ly) => { if (!ly.locked) animation.exposures.clear(ly, from, to); });
      this.touch(); this.emit("cells");
      this._histRange(label || "Vaciar rango", before, this._snapshot(selected.map((l) => l.id), []));
      return true;
    }

    /** Pega una matriz desde su esquina superior izquierda. Cada columna se
     * adapta al nivel de destino: conserva numeros libres y remapea colisiones
     * sin perder ni sobrescribir dibujos existentes. */
    pasteCells(clip, startLayerId, startFrame, options) {
      if (!clip || !clip.columns || !clip.columns.length) return false;
      const opts = options || {};
      const layers = this.scene.layers;
      const start = layers.findIndex((l) => l.id === startLayerId);
      if (start < 0) return false;
      const targets = layers.slice(start, start + clip.columns.length);
      if (!targets.length) return false;
      const layerIds = targets.map((l) => l.id), levelIds = targets.map((l) => l.levelId);
      const before = this._snapshot(layerIds, levelIds);
      const frame = Math.max(1, Math.round(startFrame) || 1);
      targets.forEach((ly, ci) => {
        if (ly.locked) return;
        const source = clip.columns[ci], lv = this.scene.level(ly.levelId);
        if (!source || !lv) return;
        const remap = new Map();
        for (const drawing of source.drawings || []) {
          const existing = lv.byNumber(drawing.number);
          if (!existing) { lv.drawings.push(new animation.Drawing(drawing)); remap.set(drawing.number, drawing.number); }
          else if (existing.content === drawing.content) remap.set(drawing.number, drawing.number);
          else { const n = lv.nextNumber(); lv.addDrawing(n, drawing.content); remap.set(drawing.number, n); }
        }
        const values = (source.cells || []).map((n) => n == null ? null : (remap.get(n) || n));
        if (opts.insert) animation.exposures.insert(ly, frame, values.length);
        animation.exposures.write(ly, frame, values);
      });
      this.touch(); this.emit("cells"); this.emit("level");
      this._histRange(opts.label || "Pegar rango", before, this._snapshot(layerIds, levelIds));
      return true;
    }

    exposeDrawings(levelId, numbers, targetLayerId, startFrame, options) {
      const lv = this.scene.level(levelId);
      const list = (numbers || []).map(Number).filter((n) => lv && lv.byNumber(n));
      if (!lv || !list.length) return false;
      return this.pasteCells({ columns: [{ levelId, cells: list,
        drawings: list.map((n) => lv.byNumber(n).toJSON()) }] },
        targetLayerId, startFrame, { insert: !!(options && options.insert), label: "Exponer dibujos" });
    }
    // ── operaciones sobre DIBUJOS (el material, no el tiempo) ────────────
    /** Duplica un dibujo con número nuevo. Es lo que se hace para partir de una
     *  pose y modificarla, en vez de dibujar de cero. */
    duplicateDrawing(number) {
      const lv = this.level;
      const src = lv && lv.byNumber(number);
      if (!src) return null;
      const n = lv.nextNumber();
      const nuevo = lv.addDrawing(n, src.content);
      this.touch(); this.emit("level");
      if (this.history) {
        const doc = this;
        this.history.push({
          label: "Duplicar dibujo", domain: "anim", before: null, after: n,
          apply: (dir) => {
            const l = doc.scene.level(lv.id);
            if (!l) return;
            if (dir === "undo") l.removeDrawing(n);
            else l.addDrawing(n, src.content);
            doc.emit("level"); doc.emit("frame");
          },
        });
      }
      return nuevo;
    }

    /** Cambia el número de un dibujo y arrastra sus exposiciones: renumerar no
     *  puede dejar celdas apuntando a un dibujo que ya no existe. */
    renumberDrawing(from, to) {
      const lv = this.level;
      if (!lv || lv.byNumber(to)) return false;      // destino ocupado
      if (!lv.renumber(from, to)) return false;
      const cambios = [];
      for (const ly of this.scene.layers) {
        if (ly.levelId !== lv.id) continue;
        const antes = ly.cells.slice();
        ly.cells = ly.cells.map((c) => (c === from ? to : c));
        cambios.push({ id: ly.id, antes, despues: ly.cells.slice() });
      }
      this.touch(); this.emit("cells"); this.emit("level");
      if (this.history) {
        const doc = this;
        this.history.push({
          label: "Renumerar dibujo", domain: "anim", before: from, after: to,
          apply: (dir) => {
            const l = doc.scene.level(lv.id);
            if (!l) return;
            l.renumber(dir === "undo" ? to : from, dir === "undo" ? from : to);
            for (const c of cambios) {
              const capa = doc.scene.layer(c.id);
              if (capa) capa.cells = (dir === "undo" ? c.antes : c.despues).slice();
            }
            doc.emit("cells"); doc.emit("level"); doc.emit("frame");
          },
        });
      }
      return true;
    }

    /** Borra un dibujo del nivel Y vacía las celdas que lo exponían. Es la
     *  única operación que SÍ destruye un dibujo, y por eso es explícita. */
    deleteDrawing(number) {
      const lv = this.level;
      const d = lv && lv.byNumber(number);
      if (!d) return false;
      const copia = { number: d.number, content: d.content, name: d.name };
      const cambios = [];
      for (const ly of this.scene.layers) {
        if (ly.levelId !== lv.id) continue;
        const antes = ly.cells.slice();
        ly.cells = ly.cells.map((c) => (c === number ? null : c));
        cambios.push({ id: ly.id, antes, despues: ly.cells.slice() });
      }
      lv.removeDrawing(number);
      this.touch(); this.emit("cells"); this.emit("level");
      if (this.history) {
        const doc = this;
        this.history.push({
          label: "Borrar dibujo", domain: "anim", before: copia, after: null,
          apply: (dir) => {
            const l = doc.scene.level(lv.id);
            if (!l) return;
            if (dir === "undo") { const nd = l.addDrawing(copia.number, copia.content); nd.name = copia.name; }
            else l.removeDrawing(copia.number);
            for (const c of cambios) {
              const capa = doc.scene.layer(c.id);
              if (capa) capa.cells = (dir === "undo" ? c.antes : c.despues).slice();
            }
            doc.emit("cells"); doc.emit("level"); doc.emit("frame");
          },
        });
      }
      return true;
    }

    /** Primer frame donde se expone un dibujo (para saltar a él desde la tira). */
    frameOfDrawing(number) {
      const ly = this.layer;
      if (!ly) return null;
      const total = ly.lastFrame();
      for (let f = 1; f <= total; f++) if (ly.cellAt(f) === number) return f;
      return null;
    }

    addLayer(nombre) {
      const lv = this.scene.addLevel(nombre || `Nivel ${this.scene.levels.length + 1}`);
      const ly = this.scene.addLayer(lv.id, nombre || `Capa ${this.scene.layers.length + 1}`);
      this.layerId = ly.id;
      this.touch(); this.emit("layers");
      if (this.history) {
        const doc = this, levelData = lv.toJSON(), layerData = ly.toJSON();
        this.history.push({ label: "Agregar capa", domain: "anim", before: null, after: layerData,
          apply: (dir) => {
            if (dir === "undo") {
              doc.scene.layers = doc.scene.layers.filter((x) => x.id !== layerData.id);
              doc.scene.levels = doc.scene.levels.filter((x) => x.id !== levelData.id);
              doc.layerId = doc.scene.layers[0] ? doc.scene.layers[0].id : null;
            } else {
              if (!doc.scene.level(levelData.id)) doc.scene.levels.push(new animation.Level(levelData));
              if (!doc.scene.layer(layerData.id)) doc.scene.layers.push(new animation.Layer(layerData));
              doc.layerId = layerData.id;
            }
            doc.touch(); doc.emit("layers"); doc.emit("frame");
          } });
      }
      return ly;
    }

    /** Crea una columna de referencia a partir de imágenes por cuadro. Es una
     *  operación atómica: Undo quita nivel y capa; Redo restaura exactamente
     *  dibujos y exposiciones, sin tocar el resto de la escena. */
    addReferenceSequence(items, nombre) {
      const valid=(items||[]).filter(x=>x&&Number(x.frame)>0&&x.content!=null);
      if(!valid.length)return null;
      const lv=this.scene.addLevel(nombre||"Rotoscopía","reference");
      const ly=this.scene.addLayer(lv.id,nombre||"Rotoscopía"); ly.opacity=.35;
      valid.forEach((item,index)=>{const number=index+1;lv.addDrawing(number,String(item.content));ly.setCell(Math.round(item.frame),number);});
      const levelData=lv.toJSON(),layerData=ly.toJSON(),previousLayerId=this.layerId;
      this.layerId=ly.id;this.touch();this.emit("layers");this.emit("level");this.emit("cells");this.emit("frame");
      if(this.history){const doc=this;this.history.push({label:"Crear nivel de rotoscopía",domain:"mocap",before:null,after:{levelData,layerData},apply:(dir,value)=>{
        if(dir==="undo"){doc.scene.layers=doc.scene.layers.filter(x=>x.id!==layerData.id);doc.scene.levels=doc.scene.levels.filter(x=>x.id!==levelData.id);doc.layerId=previousLayerId;}
        else{if(!doc.scene.level(levelData.id))doc.scene.levels.push(new animation.Level(value.levelData));if(!doc.scene.layer(layerData.id))doc.scene.layers.push(new animation.Layer(value.layerData));doc.layerId=layerData.id;}
        doc.touch();doc.emit("layers");doc.emit("level");doc.emit("cells");doc.emit("frame");}});}
      return ly;
    }

    // ── rig canónico ────────────────────────────────────────────────────
    _ensureRigBoneRecord(rig, data) {
      const id = data.id;
      const initialHead = data.head || data.pivot || null;
      if (!rig.bones[id]) rig.bones[id] = { id, type: "bone", name: data.name || id,
        parentId: data.parentId || null,
        pivot: initialHead ? { x: +initialHead.x || 0, y: +initialHead.y || 0 } : null,
        head: initialHead ? { x: +initialHead.x || 0, y: +initialHead.y || 0 } : null,
        tail: data.tail ? { x: +data.tail.x || 0, y: +data.tail.y || 0 } : null,
        rest: data.rest || { x: 0, y: 0, r: 0, sx: 1, sy: 1 }, keys: {},
        pinned: !!data.pinned, inherit: { translation: true, rotation: true, scale: true },
        limits: data.limits || { min: -180, max: 180 } };
      const bone = rig.bones[id];
      if (data.name) bone.name = data.name;
      if (data.role) bone.role = data.role;
      if (data.control) bone.control = animation.clone(data.control);
      if (data.inherit) bone.inherit = { ...bone.inherit, ...data.inherit };
      rig.nodes = rig.bones;
      return bone;
    }

    _ensureRigArtLink(rig, data) {
      const id = data.id, elementId = data.elementId || id;
      const bone = this._ensureRigBoneRecord(rig, data);
      bone.elementId = elementId;
      bone.binding = { mode: data.binding?.mode || bone.binding?.mode || "rigid", elementId };
      const slotId = data.slotId || `slot:${id}`, attachmentId = data.attachmentId || `attachment:${id}`,
        bindingId = data.bindingId || `binding:${id}`;
      rig.slots[slotId] ||= { id: slotId, name: data.name || id, boneId: id,
        drawOrder: Object.keys(rig.slots).length, activeAttachmentId: attachmentId, visible: true };
      rig.attachments[attachmentId] ||= { id: attachmentId, slotId, type: "drawing", elementId,
        name: data.name || id, levelId: data.levelId || null, drawingNumber: data.drawingNumber ?? null };
      rig.bindings[bindingId] ||= { id: bindingId, mode: bone.binding.mode, boneId: id,
        slotId, attachmentId, elementId };
      rig.nodes = rig.bones;
      return bone;
    }

    _syncRigPoseChannels(rig, id, keys, { replaceEase = false } = {}) {
      for (const property of ["x", "y", "r", "sx", "sy"]) {
        const path = animation.rigChannelPath(id, property), previous = rig.channels[path] || {},
          values = {}, ease = {};
        for (const [frame, pose] of Object.entries(keys || {})) {
          const sx = pose.sx == null ? (pose.s == null ? 1 : +pose.s) : +pose.sx;
          const sy = pose.sy == null ? (pose.s == null ? 1 : +pose.s) : +pose.sy;
          values[frame] = property === "sx" ? sx : property === "sy" ? sy : (+pose[property] || 0);
          // el canal es el que termina interpolando: sin esto la curva no se veria
          // Una curva editada para una propiedad es autoritativa. Corregir una
          // pose no debe volver a igualar X, Y, giro y escala accidentalmente.
          if (!replaceEase && previous.ease?.[frame]) ease[frame] = animation.rigEaseData(previous.ease[frame]);
          else if (pose && pose.ease) ease[frame] = animation.rigEaseData(pose.ease);
        }
        if (Object.keys(values).length) rig.channels[path] = animation.rigChannelData(path,
          { ...(rig.channels[path] || {}), keys: values, ease });
        else delete rig.channels[path];
      }
    }

    /** La curva de una clave: `eo` como sale, `ei` como llega, `hold` escalon. */
    setRigKeyEase(id, frame, ease) {
      if (!id) return false;
      return this._rigChange("Cambiar la curva de una clave", (rig) => {
        const node = rig.nodes[id], f = Math.max(1, Math.round(frame));
        if (!node || !node.keys[f]) return false;
        if (ease) node.keys[f].ease = animation.rigEaseData(ease);
        else delete node.keys[f].ease;
        this._syncRigPoseChannels(rig, id, node.keys, { replaceEase: true });
        return true;
      });
    }

    /** Después de cada gesto, las cadenas con el extremo clavado vuelven a
     *  resolverse contra su objetivo retenido. Así mover la cadera no arrastra
     *  el pie apoyado, y la corrección queda DENTRO del mismo gesto: una sola
     *  entrada de Undo, como cualquier otra intención del animador.
     *  `skip` evita que la cadena que el propio gesto está posando se pise. */
    _enforceRigPins(rig, frame, skip = null) {
      const f = Math.max(1, Math.round(Number(frame) || this.frame || 1));
      for (const c of this.scene.rigPinnedConstraints(f)) {
        if (c.id === skip) continue;
        const target = this.scene.rigTargetAt(c.id, f);
        if (!target) continue;
        const solved = this.scene.rigSolveIK(c.id, f, target);
        if (solved) this._writeRigPoses(rig, solved.poses, f);
      }
    }

    _rigChange(label, mutate, options = {}) {
      const before = animation.rigToJSON(this.scene.rig);
      const result = mutate(this.scene.rig);
      if (result !== false && options.pins !== false)
        this._enforceRigPins(this.scene.rig, options.frame, options.skipPin);
      this.scene.rig.nodes = this.scene.rig.bones;
      this.scene.rig.diagnostics = animation.rigDiagnostics(this.scene.rig);
      const after = animation.rigToJSON(this.scene.rig);
      if (JSON.stringify(before) === JSON.stringify(after)) return result;
      this.touch(); this.emit("rig"); this.emit("frame");
      if (this.history) {
        const doc = this;
        this.history.push({ label, domain: "rig", before, after,
          apply: (_dir, value) => {
            doc.scene.rig = animation.rigData(value);
            doc.touch(); doc.emit("rig"); doc.emit("frame");
          } });
      }
      return result;
    }

    ensureRigBone(id, data = {}) {
      if (!id) return null;
      return this._rigChange("Crear hueso", (rig) => this._ensureRigBoneRecord(rig, { ...data, id }));
    }

    setRigBoneGeometry(id, head, tail) {
      return this._rigChange("Editar hueso", (rig) => {
        const bone = rig.bones[id];
        if (!bone || !head || !tail) return false;
        const h = { x: +head.x || 0, y: +head.y || 0 }, t = { x: +tail.x || 0, y: +tail.y || 0 };
        if (Math.hypot(t.x - h.x, t.y - h.y) < 2) return false;
        bone.head = h; bone.pivot = h; bone.tail = t; return true;
      });
    }

    ensureRigNode(id, data = {}) {
      if (!id) return null;
      return this._rigChange("Crear nodo de rig", (rig) => {
        return this._ensureRigArtLink(rig, { ...data, id });
      });
    }

    /** Registra varias piezas como una sola operación. Además de evitar
     * repintados intermedios, hace que Preparar dibujo tenga un único Undo. */
    ensureRigNodes(items, label = "Preparar rig") {
      const entries = (items || []).filter((item) => item && item.id);
      if (!entries.length) return [];
      return this._rigChange(label, (rig) => {
        const created = new Set();
        for (const data of entries) {
          if (!rig.bones[data.id]) created.add(data.id);
          const node = this._ensureRigArtLink(rig, data);
          if (!node.pivot && data.pivot) node.pivot = { x: +data.pivot.x || 0, y: +data.pivot.y || 0 };
        }
        for (const data of entries) {
          const node = rig.nodes[data.id];
          if (!node || (!created.has(data.id) && !data.reparent)) continue;
          node.parentId = data.parentId && data.parentId !== data.id && rig.nodes[data.parentId]
            ? data.parentId : null;
          if (data.pinned != null) node.pinned = !!data.pinned;
        }
        return entries.map((entry) => entry.id);
      });
    }

    /** Edita varias geometrías como una sola articulación. En un esqueleto la
     * punta del padre y la cabeza del hijo son el mismo punto conceptual; esta
     * operación evita que una edición abra huecos entre ambos. */
    setRigBoneGeometries(updates, label = "Editar articulación") {
      const entries = Object.entries(updates || {}).filter(([, value]) => value?.head && value?.tail);
      if (!entries.length) return false;
      return this._rigChange(label, (rig) => {
        let changed = false;
        for (const [id, value] of entries) {
          const bone = rig.bones[id]; if (!bone) continue;
          const head = { x:+value.head.x||0, y:+value.head.y||0 };
          const tail = { x:+value.tail.x||0, y:+value.tail.y||0 };
          if (Math.hypot(tail.x-head.x, tail.y-head.y) < 2) continue;
          bone.head=head; bone.pivot={...head}; bone.tail=tail; changed=true;
        }
        return changed;
      });
    }

    /** Inserta un esqueleto completo como una sola operación de Undo. Las
     * plantillas y el alambre manual terminan en los mismos registros. */
    ensureRigBones(items, label = "Insertar esqueleto") {
      const entries=(items||[]).filter(x=>x&&x.id); if(!entries.length)return [];
      return this._rigChange(label, rig=>{
        for(const data of entries){
          const bone=this._ensureRigBoneRecord(rig,data);
          if(data.head){bone.head={x:+data.head.x||0,y:+data.head.y||0};bone.pivot={...bone.head};}
          if(data.tail)bone.tail={x:+data.tail.x||0,y:+data.tail.y||0};
          if(data.limits)bone.limits={...data.limits};
          if(data.pinned!=null)bone.pinned=!!data.pinned;
          if(data.role)bone.role=data.role;
          if(data.control)bone.control=animation.clone(data.control);
        }
        for(const data of entries)rig.bones[data.id].parentId=data.parentId&&rig.bones[data.parentId]?data.parentId:null;
        rig.nodes=rig.bones; return entries.map(x=>x.id);
      });
    }

    /** Migra el fallo de versiones anteriores donde "Registrar" convertía
     * cada objeto de dibujo en un nodo con pivote. Sólo quita nodos aislados,
     * sin hueso, claves, jerarquía ni raíz fijada; un rig real queda intacto. */
    removeLegacyRigArtNodes(elementIds) {
      const wanted = new Set((elementIds || []).filter(Boolean));
      if (!wanted.size) return [];
      return this._rigChange("Separar objetos y huesos", (rig) => {
        const parentIds = new Set(Object.values(rig.nodes || {}).map(n => n.parentId).filter(Boolean));
        const removed = [];
        for (const [id, node] of Object.entries(rig.nodes || {})) {
          if (!wanted.has(node.elementId || id)) continue;
          // El registrador antiguo copiaba el pivote en `head`, pero nunca
          // creaba `tail`; una cola real es la señal inequívoca de hueso.
          if (node.tail || node.parentId || parentIds.has(id) || node.pinned) continue;
          if (Object.keys(node.keys || {}).length) continue;
          delete rig.nodes[id];
          for (const [slotId, slot] of Object.entries(rig.slots || {})) if (slot.boneId === id) {
            for (const [attachmentId, attachment] of Object.entries(rig.attachments || {}))
              if (attachment.slotId === slotId) delete rig.attachments[attachmentId];
            delete rig.slots[slotId];
          }
          for (const [bindingId, binding] of Object.entries(rig.bindings || {}))
            if (binding.boneId === id || !rig.slots[binding.slotId] || !rig.attachments[binding.attachmentId])
              delete rig.bindings[bindingId];
          for (const path of Object.keys(rig.channels || {}))
            if (path.startsWith(`bones/${encodeURIComponent(id)}/`)) delete rig.channels[path];
          removed.push(id);
        }
        return removed;
      });
    }

    setRigKey(id, frame, pose) {
      if (!id) return false;
      return this._rigChange("Crear clave de rig", (rig) => {
        const node = rig.nodes[id] || this._ensureRigArtLink(rig, { id });
        const sx = pose.sx == null ? (pose.s == null ? 1 : +pose.s) : +pose.sx;
        const sy = pose.sy == null ? (pose.s == null ? 1 : +pose.s) : +pose.sy;
        // Los topes del hueso valen para TODA clave, venga de donde venga —el
        // solver de IK ya los respetaba y posar a mano los ignoraba—, PERO el
        // rango completo no es un tope: con -180/180 el hueso gira libre y
        // puede dar vueltas enteras.
        const r = animation.rigAplicarTope(node.limits, +pose.r || 0);
        const f = Math.max(1, Math.round(frame));
        // Volver a posar sobre una clave no le borra la curva que ya tenia:
        // el animador ajusta el timing una vez y despues corrige la pose.
        const ease = pose.ease || node.keys[f]?.ease;
        node.keys[f] = { x: +pose.x || 0, y: +pose.y || 0, r, sx, sy };
        if (ease) node.keys[f].ease = animation.rigEaseData(ease);
        this._syncRigPoseChannels(rig, id, node.keys);
        return true;
        // El cuadro va explícito: si un apoyo está clavado, la corrección
        // tiene que caer donde se posó y no donde esté parado el playhead.
      }, { frame: Math.max(1, Math.round(frame)) });
    }

    replaceRigKeys(id, keys, label = "Editar claves de rig") {
      if (!id) return false;
      return this._rigChange(label, (rig) => {
        const node = rig.nodes[id] || this._ensureRigArtLink(rig, { id });
        node.keys = animation.clone(keys || {});
        this._syncRigPoseChannels(rig, id, node.keys); return true;
      });
    }

    deleteRigKey(id, frame) {
      return this._rigChange("Borrar clave de rig", (rig) => {
        const node = rig.nodes[id]; if (!node || !node.keys[frame]) return false;
        delete node.keys[frame]; this._syncRigPoseChannels(rig, id, node.keys); return true;
      });
    }

    setRigParent(id, parentId) {
      return this._rigChange("Cambiar jerarquía del rig", (rig) => {
        const node = rig.nodes[id], parent = parentId && rig.nodes[parentId];
        if (!node || (parentId && !parent) || id === parentId) return false;
        let p = parent;
        while (p) { if (p.id === id) return false; p = p.parentId && rig.nodes[p.parentId]; }
        node.parentId = parentId || null; return true;
      });
    }

    setRigPivot(id, pivot) {
      return this._rigChange("Cambiar pivote del rig", (rig) => {
        const node = rig.nodes[id]; if (!node) return false;
        node.pivot = pivot ? { x: +pivot.x || 0, y: +pivot.y || 0 } : null; return true;
      });
    }

    removeRigNode(id) {
      return this._rigChange("Quitar pieza del rig", (rig) => {
        if (!rig.nodes[id]) return false;
        delete rig.nodes[id];
        Object.values(rig.nodes).forEach((node) => { if (node.parentId === id) node.parentId = null; });
        for (const [slotId, slot] of Object.entries(rig.slots || {})) if (slot.boneId === id) {
          for (const [attachmentId, attachment] of Object.entries(rig.attachments || {}))
            if (attachment.slotId === slotId) delete rig.attachments[attachmentId];
          delete rig.slots[slotId];
        }
        for (const [bindingId, binding] of Object.entries(rig.bindings || {}))
          if (binding.boneId === id || !rig.slots[binding.slotId] || !rig.attachments[binding.attachmentId])
            delete rig.bindings[bindingId];
        for (const path of Object.keys(rig.channels || {}))
          if (path.startsWith(`bones/${encodeURIComponent(id)}/`)) delete rig.channels[path];
        for (const [constraintId, c] of Object.entries(rig.constraints || {}))
          if ([c.rootId, c.midId, c.effectorId, c.targetBoneId, ...(c.reads || []), ...(c.writes || [])].includes(id)) {
            delete rig.constraints[constraintId];
            rig.constraintOrder = rig.constraintOrder.filter((entry) => entry !== constraintId);
          }
        return true;
      });
    }

    setRigPinned(id, pinned) {
      return this._rigChange(pinned ? "Fijar pieza del rig" : "Liberar pieza del rig", (rig) => {
        const node = rig.nodes[id]; if (!node) return false;
        node.pinned = !!pinned; return true;
      });
    }

    setRigLimits(id, min, max) {
      return this._rigChange("Cambiar límites del hueso", (rig) => {
        const node = rig.nodes[id]; if (!node) return false;
        const lo = Math.max(-360, Math.min(360, +min || 0));
        const hi = Math.max(-360, Math.min(360, +max || 0));
        node.limits = { min: Math.min(lo, hi), max: Math.max(lo, hi) }; return true;
      });
    }

    ensureRigSlot(boneId, data = {}) {
      if (!boneId || !this.scene.rigNode(boneId)) return false;
      return this._rigChange("Crear slot del rig", (rig) => {
        const id = data.id || `slot:${boneId}`;
        rig.slots[id] ||= { id, name: data.name || id, boneId,
          drawOrder: Number.isFinite(+data.drawOrder) ? +data.drawOrder : Object.keys(rig.slots).length,
          activeAttachmentId: null, visible: data.visible !== false };
        return id;
      });
    }

    addRigAttachment(slotId, data = {}) {
      if (!this.scene.rigSlot(slotId)) return false;
      return this._rigChange("Agregar sustitución del rig", (rig) => {
        const id = data.id || `attachment:${slotId}:${Object.keys(rig.attachments).length + 1}`;
        if (rig.attachments[id]) return id;
        rig.attachments[id] = { id, slotId, type: data.type || "drawing",
          name: data.name || id, elementId: data.elementId || null,
          levelId: data.levelId || null, drawingNumber: data.drawingNumber ?? null,
          meta: animation.clone(data.meta || {}) };
        if (!rig.slots[slotId].activeAttachmentId) rig.slots[slotId].activeAttachmentId = id;
        return id;
      });
    }

    setRigBinding(data = {}) {
      return this._rigChange("Vincular arte al rig", (rig) => {
        const bone = rig.bones[data.boneId], slot = rig.slots[data.slotId],
          attachment = rig.attachments[data.attachmentId];
        if (!bone || !slot || !attachment || slot.boneId !== bone.id || attachment.slotId !== slot.id) return false;
        const allowed = new Set(["rigid", "weightedMesh", "curve", "envelope", "warp"]);
        const mode = allowed.has(data.mode) ? data.mode : "rigid";
        const id = data.id || `binding:${attachment.id}`;
        rig.bindings[id] = { ...animation.clone(data), id, mode, boneId: bone.id,
          slotId: slot.id, attachmentId: attachment.id, elementId: attachment.elementId || null };
        return id;
      });
    }

    /** Vincula un elemento del dibujo a un hueso YA existente en una sola
     * operación con undo. Es lo que conecta el esqueleto (creado con «Crear
     * hueso») con las piezas: sin esto el hueso se posa solo y no arrastra el
     * dibujo. Crea slot + attachment + binding rigid y marca el bone con su
     * elementId para que la mesa sepa qué elemento transformar. */
    bindRigElement(boneId, elementId, mode = "rigid") {
      if (!boneId || !elementId || !this.scene.rigNode(boneId)) return false;
      return this._rigChange("Vincular dibujo al hueso", (rig) => {
        return animation.rigBinding.bindElement(rig, boneId, elementId, mode);
      });
    }

    clearRig() {
      return this._rigChange("Eliminar esqueleto completo", (rig) => {
        if (!Object.keys(rig.nodes || {}).length) return false;
        rig.bones = {}; rig.nodes = rig.bones;
        rig.slots = {}; rig.attachments = {}; rig.bindings = {};
        rig.meshes = {}; rig.deformers = {}; rig.constraints = {};
        rig.constraintOrder = []; rig.controllers = {}; rig.actions = {};
        // `controls` es el store REAL de los diales (`controllers` es una clave
        // heredada que nadie lee). Sin esta línea, borrar el esqueleto completo
        // dejaba las definiciones de control vivas sin huesos ni canal, y como
        // createRigControl rechaza un id existente, el artista no podía volver
        // a crear un control con el mismo nombre. Ver tools/repro_c01_controles.js
        rig.controls = {};
        rig.channels = {}; rig.switches = {}; rig.physics = {};
        return true;
      });
    }

    replaceRig(data, label = "Cargar personaje de biblioteca") {
      const before = animation.rigToJSON(this.scene.rig);
      const afterRig = animation.rigData(data || {});
      const after = animation.rigToJSON(afterRig);
      if (JSON.stringify(before) === JSON.stringify(after)) return false;
      this.scene.rig = afterRig; this.touch(); this.emit("rig"); this.emit("frame");
      if (this.history) {
        const doc = this;
        this.history.push({ label, domain: "rig", before, after,
          apply: (_dir, value) => { doc.scene.rig = animation.rigData(value); doc.touch(); doc.emit("rig"); doc.emit("frame"); } });
      }
      return true;
    }
    /** Cambia varios dibujos como UNA operación. El coloreo por rango usa este
     *  contrato para que Ctrl+Z nunca deje medio nivel pintado y medio nivel
     *  sin pintar. Los cambios inválidos o idénticos se ignoran. */
    applyDrawingContents(changes, label = "Colorear dibujos") {
      const valid = [], levelIds = new Set();
      for (const change of changes || []) {
        const lv = this.scene.level(change && change.levelId);
        const d = lv && lv.byNumber(change.number);
        const content = change && typeof change.content === "string" ? change.content : null;
        if (!d || content == null || d.content === content) continue;
        valid.push({ d, content }); levelIds.add(lv.id);
      }
      if (!valid.length) return 0;
      const before = this._snapshot([], [...levelIds]);
      for (const change of valid) change.d.content = change.content;
      const after = this._snapshot([], [...levelIds]);
      this.touch(); this.emit("content"); this.emit("level"); this.emit("frame");
      this._histRange(label, before, after);
      return valid.length;
    }

    /** Suelta el arte de un hueso sin borrar el hueso, el slot ni sus dibujos
     * alternativos. Permite corregir un reparto sin reconstruir el esqueleto. */
    unbindRigElement(boneId) {
      if (!boneId || !this.scene.rigNode(boneId)) return false;
      return this._rigChange("Soltar dibujo del hueso", (rig) => {
        return animation.rigBinding.unbindElement(rig, boneId);
      });
    }

    /** Repara escenas antiguas donde dos huesos reclaman el mismo dibujo.
     * Conserva el primer dueño estable y suelta solamente los reclamos
     * duplicados; nunca borra arte, huesos, slots ni attachments. */
    repairRigBindingOwnership() {
      return this._rigChange("Reparar vínculos duplicados", (rig) => {
        return animation.rigBinding.repairOwnership(rig);
      });
    }

    /** Suma un dibujo alternativo al slot de una pieza: la otra mano, la otra
     *  boca. No lo activa — eso lo decide una clave de sustitucion. */
    addRigVariant(boneId, elementId, name) {
      if (!boneId || !elementId || !this.scene.rigNode(boneId)) return null;
      const slotId = `slot:${boneId}`;
      let creado = null;
      this._rigChange("Sumar un dibujo a la pieza", (rig) => {
        if (!rig.slots[slotId]) return false;
        const ya = Object.values(rig.attachments)
          .find((a) => a.slotId === slotId && a.elementId === elementId);
        if (ya) { creado = ya.id; return false; }
        const hermanos = Object.values(rig.attachments).filter((a) => a.slotId === slotId);
        const id = `attachment:${boneId}:${elementId}`;
        rig.attachments[id] = { id, slotId, type: "drawing", elementId,
          name: name || elementId, levelId: null, drawingNumber: null, order: hermanos.length };
        creado = id;
        return true;
      });
      return creado;
    }

    removeRigVariant(attachmentId) {
      return this._rigChange("Quitar un dibujo de la pieza", (rig) => {
        const a = rig.attachments[attachmentId];
        if (!a) return false;
        const hermanos = Object.values(rig.attachments).filter((x) => x.slotId === a.slotId);
        if (hermanos.length < 2) return false;          // el ultimo dibujo no se saca
        delete rig.attachments[attachmentId];
        const sw = (rig.switches || {})[a.slotId];
        if (sw) {
          for (const f of Object.keys(sw.keys)) if (sw.keys[f] === attachmentId) delete sw.keys[f];
          if (!Object.keys(sw.keys).length) delete rig.switches[a.slotId];
        }
        const queda = hermanos.find((x) => x.id !== attachmentId) || null;
        const slot = rig.slots[a.slotId];
        if (slot && slot.activeAttachmentId === attachmentId)
          slot.activeAttachmentId = queda ? queda.id : null;
        // Si la pieza apuntaba justo al dibujo que se saca, hay que repuntarla:
        // si no, queda mostrando un dibujo que ya no es una de sus versiones y
        // se terminan viendo los dos a la vez.
        const bone = queda && rig.bones[slot?.boneId];
        if (bone && bone.elementId === a.elementId) {
          bone.elementId = queda.elementId;
          if (bone.binding) bone.binding.elementId = queda.elementId;
          const bind = rig.bindings[`binding:${bone.id}`];
          if (bind) { bind.elementId = queda.elementId; bind.attachmentId = queda.id; }
        }
        return true;
      });
    }

    /* ── JUEGOS DE VISTAS (C04): el giro de cabeza con dibujos ───────────
       Atan un slot a un control: animás el control y aparece la vista que
       toca. Antes había que clavar la sustitución cuadro por cuadro, que es
       justo el trabajo que un control de actuación viene a sacar. */

    /** Crea el juego y lo ata a un control. No inventa vistas: nace vacío y se
     *  le van agregando los dibujos que EXISTEN. */
    createRigViewSet(id, { slotId, driverPath, min = -90, max = 90, name } = {}) {
      if (!id || !slotId || !driverPath) return false;
      return this._rigChange("Crear juego de vistas", (rig) => {
        if (!rig.slots[slotId]) return false;
        rig.viewSets = rig.viewSets || {};
        if (rig.viewSets[id]) return false;
        rig.viewSets[id] = { id, name: name || id, slotId, enabled: true,
          driver: { path: String(driverPath), min: +min, max: +max }, views: [] };
        return true;
      });
    }
    /** Suma una vista dibujada en un punto del recorrido. `order` es el orden
     *  de slots que esa vista impone: de perfil la nariz cruza la cara y lo
     *  que estaba atrás pasa adelante. */
    addRigView(viewSetId, attachmentId, at, { name, order } = {}) {
      return this._rigChange("Agregar vista al juego", (rig) => {
        const juego = (rig.viewSets || {})[viewSetId];
        if (!juego || !rig.attachments[attachmentId]) return false;
        if (juego.views.some((v) => v.attachmentId === attachmentId)) return false;
        juego.views.push({ attachmentId: String(attachmentId), at: +at,
          name: name || "", order: Array.isArray(order) ? order.map(String) : null });
        juego.views.sort((a, b) => a.at - b.at || a.attachmentId.localeCompare(b.attachmentId));
        return true;
      });
    }
    /** Mueve una vista a otro punto del recorrido, sin tocar el dibujo. */
    setRigViewAt(viewSetId, attachmentId, at) {
      return this._rigChange("Mover la vista en el recorrido", (rig) => {
        const juego = (rig.viewSets || {})[viewSetId];
        const vista = juego && juego.views.find((v) => v.attachmentId === attachmentId);
        if (!vista || !Number.isFinite(+at) || vista.at === +at) return false;
        vista.at = +at;
        juego.views.sort((a, b) => a.at - b.at || a.attachmentId.localeCompare(b.attachmentId));
        return true;
      });
    }
    /** Saca una vista del juego. NO borra el dibujo: el dibujo sigue en el
     *  nivel y en el slot; lo que se saca es que este giro lo use. */
    removeRigView(viewSetId, attachmentId) {
      return this._rigChange("Quitar vista del juego", (rig) => {
        const juego = (rig.viewSets || {})[viewSetId];
        if (!juego) return false;
        const antes = juego.views.length;
        juego.views = juego.views.filter((v) => v.attachmentId !== attachmentId);
        return juego.views.length !== antes;
      });
    }
    removeRigViewSet(viewSetId) {
      return this._rigChange("Quitar juego de vistas", (rig) => {
        if (!rig.viewSets || !rig.viewSets[viewSetId]) return false;
        delete rig.viewSets[viewSetId];
        return true;
      });
    }
    /** Guarda el CORRECTIVO de una vista: cuánto se corre una pieza mientras
     *  esa vista manda. Al girar la cabeza las piezas de encima no caen solas
     *  en su lugar —de tres cuartos el ojo se corre y la oreja se achica—, y
     *  eso no se puede interpolar porque el dibujo cambió de golpe.
     *
     *  Pasar una pose vacía (o todo en cero) BORRA el correctivo: así se saca
     *  sin tener que inventar otro comando. */
    setRigViewFix(viewSetId, attachmentId, pieceId, pose = {}) {
      if (!pieceId) return false;
      return this._rigChange("Corregir la pieza en esta vista", (rig) => {
        const juego = (rig.viewSets || {})[viewSetId];
        const vista = juego && juego.views.find((v) => v.attachmentId === attachmentId);
        if (!vista) return false;
        const limpio = {};
        for (const prop of ["x", "y", "r", "sx", "sy"]) {
          const n = Number(pose[prop]);
          if (Number.isFinite(n) && n !== 0) limpio[prop] = n;
        }
        const antes = JSON.stringify((vista.fix || {})[pieceId] || null);
        if (!Object.keys(limpio).length) {
          if (!vista.fix || !vista.fix[pieceId]) return false;
          delete vista.fix[pieceId];
          if (!Object.keys(vista.fix).length) vista.fix = null;
          return true;
        }
        vista.fix = vista.fix || {};
        vista.fix[pieceId] = limpio;
        return antes !== JSON.stringify(limpio);
      });
    }
    /* ── CONJUNTOS DE CONTROLES (C05) ────────────────────────────────────
       Un conjunto es la receta de una cara: qué controles hay y qué piezas
       necesita. Aplicarlo crea los controles y, para cada pieza, el juego de
       vistas listo para recibir los dibujos — se apoya en C04 en vez de
       inventar otro mecanismo. */

    /** Aplica un conjunto a este personaje.
     *
     *  EXIGE EL MAPA rol→pieza, que es lo que el plan pide como «vinculación
     *  explícita»: el conjunto no adivina cuál es el ojo izquierdo. Si falta
     *  algún rol NO aplica nada y devuelve qué falta, porque aplicar a medias
     *  deja controles colgados de ninguna pieza: se mueven, no pasa nada, y
     *  después hay que descubrir por qué.
     *
     *  Es idempotente: aplicar dos veces el mismo conjunto no duplica ni pisa
     *  lo que ya está — devuelve lo que ya existía. */
    applyControlSet(setId, mapa = {}, { prefijo = "" } = {}) {
      const sets = LOW.rigging && LOW.rigging.controlSets;
      const conjunto = sets && sets.porId(setId);
      if (!conjunto) return { ok: false, motivo: "no existe ese conjunto", faltan: [] };
      const faltan = sets.faltantes(conjunto, mapa);
      if (faltan.length) return { ok: false, motivo: "faltan piezas por vincular", faltan };
      // una pieza mapeada que no existe es peor que una sin mapear: miente
      const inexistentes = Object.entries(mapa)
        .filter(([, pieza]) => !this.scene.rigNode(pieza))
        .map(([rol, pieza]) => ({ key: rol, pieza }));
      if (inexistentes.length)
        return { ok: false, motivo: "hay piezas vinculadas que no existen", faltan: inexistentes };

      const pre = prefijo || conjunto.id;
      const creados = { controles: [], juegos: [], yaEstaban: [] };
      for (const c of conjunto.controles) {
        const id = pre + "_" + c.key;
        if (this.scene.rigControl(id)) { creados.yaEstaban.push(id); continue; }
        if (this.createRigControl(id, { name: c.name, min: c.min, max: c.max, default: c.default }) === false)
          continue;
        creados.controles.push(id);
        if (!c.rol) continue;                      // un control sin pieza mueve lo que ya está
        const pieza = mapa[c.rol];
        const slot = this.ensureRigSlot(pieza, { name: pieza });
        const slotId = typeof slot === "string" ? slot : (slot && slot.id) || null;
        if (!slotId) continue;
        const juegoId = "vistas_" + id;
        // el juego nace VACÍO a propósito: los dibujos los pone quien dibuja,
        // y hasta que estén el panel de C04 dice que el giro no existe
        if (this.createRigViewSet(juegoId, { slotId, name: c.name,
          driverPath: LOW.animation.rigControlPath(id), min: c.min, max: c.max }) !== false)
          creados.juegos.push(juegoId);
      }
      // el vínculo queda ESCRITO en la escena: quién aplicó qué y sobre qué
      // piezas. Sin esto, mañana no hay manera de saber por qué existe un
      // control llamado «boca_forma» ni a qué pieza corresponde.
      this._rigChange("Aplicar conjunto de controles", (rig) => {
        rig.controlSets = rig.controlSets || {};
        rig.controlSets[pre] = { id: pre, setId: conjunto.id, name: conjunto.name,
          mapa: { ...mapa }, controles: [...creados.controles, ...creados.yaEstaban] };
        return true;
      });
      return { ok: true, ...creados };
    }
    /** Los conjuntos ya aplicados a este personaje, con su mapa. */
    controlSetsAplicados() { return Object.values(this.scene.rig.controlSets || {}); }

    /* NO HAY un «grabar corrección» automático todavía, y es a propósito: el
       gesto natural es acomodar la pieza a ojo con la vista puesta, pero eso
       escribe en la pose PROPIA de la pieza, que vale para todas las vistas.
       Pasar ese desplazamiento al correctivo exige además sacarlo de la pose,
       o la corrección queda aplicada dos veces. Mientras esa cuenta no esté
       medida con un personaje real, el correctivo se pone con valores
       explícitos y no se finge un automatismo que puede duplicar. */

    /** Clava en el cuadro la vista que el juego elige AHORA. Es el puente con
     *  las sustituciones que ya existían: el giro se maneja con el control y,
     *  cuando hace falta forzar un cuadro, se hornea como sustitución normal. */
    bakeRigViewAt(viewSetId, frame) {
      const juego = this.scene.rigViewSet(viewSetId);
      const vista = this.scene.rigViewAt(viewSetId, frame == null ? this.frame : frame);
      if (!juego || !vista) return false;
      return this.setRigSwitchKey(juego.slotId, frame == null ? this.frame : frame, vista.attachmentId);
    }

    /** Clava que dibujo se ve en este cuadro. Un dibujo no se interpola: vale
     *  desde su clave hasta la siguiente. */
    setRigSwitchKey(slotId, frame, attachmentId) {
      return this._rigChange("Cambiar el dibujo en el cuadro", (rig) => {
        const f = Math.max(1, Math.round(frame));
        if (!rig.slots[slotId] || !rig.attachments[attachmentId]) return false;
        rig.switches = rig.switches || {};
        rig.switches[slotId] = rig.switches[slotId] || { slotId, keys: {} };
        if (rig.switches[slotId].keys[f] === attachmentId) return false;
        rig.switches[slotId].keys[f] = attachmentId;
        return true;
      });
    }

    /** LIPSYNC: todas las claves de boca de una toma, en UNA operación.
     *  Escribirlas de a una dejaba cien pasos de historial para algo que el
     *  animador piensa como un solo gesto —«sincronizá esta toma»— y volvía
     *  imposible descartarlo con un Ctrl+Z si no gustó. */
    applyLipsync(slotId, keys, label = "Lipsync") {
      const marcos = Object.keys(keys || {}).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
      if (!marcos.length || !this.scene.rig.slots[slotId]) return 0;
      const enTransaccion = !!this.history && !this.history.transaction;
      if (enTransaccion) this.history.begin(label);
      let puestas = 0;
      for (const f of marcos) if (this.setRigSwitchKey(slotId, f, keys[f])) puestas++;
      if (enTransaccion) this.history.commit();
      return puestas;
    }
    /** Borra las claves de boca de un tramo: rehacer un lipsync empieza por
     *  sacar el anterior, o quedan mezcladas dos sincronizaciones distintas. */
    clearRigSwitchRange(slotId, desde, hasta) {
      return this._rigChange("Borrar el lipsync del tramo", (rig) => {
        const sw = (rig.switches || {})[slotId];
        if (!sw) return false;
        const a = Math.max(1, Math.round(desde || 1)), b = Math.max(a, Math.round(hasta || a));
        let algo = false;
        for (const f of Object.keys(sw.keys).map(Number))
          if (f >= a && f <= b) { delete sw.keys[f]; algo = true; }
        if (!Object.keys(sw.keys).length) delete rig.switches[slotId];
        return algo;
      });
    }

    deleteRigSwitchKey(slotId, frame) {
      return this._rigChange("Borrar el cambio de dibujo", (rig) => {
        const f = Math.max(1, Math.round(frame)), sw = (rig.switches || {})[slotId];
        if (!sw || !sw.keys[f]) return false;
        delete sw.keys[f];
        if (!Object.keys(sw.keys).length) delete rig.switches[slotId];
        return true;
      });
    }

    /** Le pone a una pieza una curva de control para doblarse. `rest` es la
     *  curva en reposo: mientras la pose sea igual, el dibujo no cambia. */
    createRigDeformer(boneId, rest) {
      if (!boneId || !this.scene.rigNode(boneId)) return false;
      const pts = (rest || []).map((q) => ({ x: +q.x || 0, y: +q.y || 0 }));
      if (pts.length < 2) return false;
      return this._rigChange("Crear deformador de curva", (rig) => {
        rig.deformers = rig.deformers || {};
        if (rig.deformers[boneId]) return false;
        rig.deformers[boneId] = { id: `deformer:${boneId}`, boneId, type: "curve",
          enabled: true, rest: pts, keys: {} };
        const bone = rig.bones[boneId];
        if (bone && bone.binding) bone.binding.mode = "curve";
        return true;
      });
    }

    removeRigDeformer(boneId) {
      return this._rigChange("Quitar el deformador", (rig) => {
        if (!rig.deformers || !rig.deformers[boneId]) return false;
        delete rig.deformers[boneId];
        const bone = rig.bones[boneId];
        if (bone && bone.binding) bone.binding.mode = "rigid";
        return true;
      });
    }

    /** Clava la forma de la curva en un cuadro. */
    setRigDeformerKey(boneId, frame, pts) {
      return this._rigChange("Doblar la pieza", (rig) => {
        const d = rig.deformers && rig.deformers[boneId];
        if (!d) return false;
        const curva = (pts || []).map((q) => ({ x: +q.x || 0, y: +q.y || 0 }));
        if (curva.length !== d.rest.length) return false;
        d.keys[Math.max(1, Math.round(frame))] = curva;
        return true;
      });
    }

    deleteRigDeformerKey(boneId, frame) {
      return this._rigChange("Borrar el doblez de este cuadro", (rig) => {
        const d = rig.deformers && rig.deformers[boneId], f = Math.max(1, Math.round(frame));
        if (!d || !d.keys[f]) return false;
        delete d.keys[f]; return true;
      });
    }

    /* == MALLA DE DEFORMACIÓN (nivel profesional, biblia §4.3) ==============
       Una rejilla regular de cols×rows puntos sobre el bounding box de la pieza.
       Mientras la rejilla posada sea igual al reposo, el dibujo no cambia. */
    createRigMesh(boneId, opts) {
      if (!boneId || !this.scene.rigNode(boneId)) return false;
      opts = opts || {};
      const nx = Math.max(2, Math.min(12, (opts.cols | 0) || 3));
      const ny = Math.max(2, Math.min(12, (opts.rows | 0) || 3));
      const box = opts.box || {};
      const bx = +box.x || 0, by = +box.y || 0;
      const bw = +(box.width != null ? box.width : box.w) || 0;
      const bh = +(box.height != null ? box.height : box.h) || 0;
      if (!(bw > 0) || !(bh > 0)) return false;
      const rest = [];
      for (let r = 0; r < ny; r++) for (let c = 0; c < nx; c++)
        rest.push({ x: bx + bw * c / (nx - 1), y: by + bh * r / (ny - 1) });
      return this._rigChange("Crear malla de deformación", (rig) => {
        rig.meshes = rig.meshes || {};
        if (rig.meshes[boneId]) return false;
        rig.meshes[boneId] = { id: `mesh:${boneId}`, boneId, type: "mesh",
          enabled: true, cols: nx, rows: ny, rest, keys: {} };
        const bone = rig.bones[boneId];
        if (bone && bone.binding) bone.binding.mode = "weightedMesh";
        return true;
      });
    }

    /* ── CONTROLES: los diales de cara, manos y ojos (§4.3) ──────────────
       Un control es un canal con nombre y recorrido. Al ser un canal, se le
       ponen claves por cuadro, aparece en el Function Editor con sus curvas y
       cualquier Smart Bone puede tomarlo como conductor. */
    createRigControl(id, data = {}) {
      const clave = String(id || "").trim();
      if (!clave) return false;
      const min = Number.isFinite(+data.min) ? +data.min : 0;
      const max = Number.isFinite(+data.max) ? +data.max : 1;
      if (Math.abs(max - min) < 1e-9) return false;
      return this._rigChange("Crear control", (rig) => {
        rig.controls = rig.controls || {};
        if (rig.controls[clave]) return false;
        // Pasa por el MISMO sanitizador que la persistencia para que un control
        // recien creado sea identico a uno cargado de biblioteca. Sin esto nacia
        // sin `kind` y lo ganaba recien al guardar y reabrir: la UI tendria que
        // tratar dos formas del mismo objeto.
        rig.controls[clave] = { id: clave, name: data.name || clave, min, max,
          default: Number.isFinite(+data.default) ? +data.default : min,
          group: data.group || "", ...animation.rigControlWidget(data, min, max) };
        return true;
      });
    }
    removeRigControl(id) {
      return this._rigChange("Quitar el control", (rig) => {
        if (!rig.controls || !rig.controls[id]) return false;
        delete rig.controls[id];
        // el canal del dial se va con él, y las acciones que lo conducían
        // quedan sin conductor en vez de seguir aportando a ciegas
        delete rig.channels[animation.rigControlPath(id)];
        for (const accion of Object.values(rig.actions || {}))
          if (accion.driver && accion.driver.path === animation.rigControlPath(id)) accion.driver = null;
        return true;
      });
    }
    /** Mover un dial DEJA CLAVE en el cuadro actual: un control que no se
     *  anima no sirve para actuar, sirve para mirar. */
    setRigControlValue(id, frame, value) {
      const control = this.scene.rigControl(id);
      if (!control) return false;
      const lo = Math.min(control.min, control.max), hi = Math.max(control.min, control.max);
      const v = Math.max(lo, Math.min(hi, +value || 0));
      return this.setRigChannelKey(animation.rigControlPath(id), frame, v,
        { label: "Mover el control «" + (control.name || id) + "»" });
    }
    setRigControlRange(id, min, max) {
      return this._rigChange("Cambiar el recorrido del control", (rig) => {
        const control = rig.controls && rig.controls[id];
        if (!control) return false;
        const lo = Number.isFinite(+min) ? +min : control.min;
        const hi = Number.isFinite(+max) ? +max : control.max;
        if (Math.abs(hi - lo) < 1e-9) return false;
        control.min = lo; control.max = hi;
        control.default = Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), control.default));
        return true;
      });
    }

    /** Parte VISUAL del control: forma del mando y su lugar sobre el personaje.
     *  Reusa el mismo sanitizador que la persistencia, asi que lo que se guarda
     *  aca es exactamente lo que sobrevive a guardar y reabrir. */
    setRigControlWidget(id, data = {}) {
      return this._rigChange("Cambiar el mando del control", (rig) => {
        const control = rig.controls && rig.controls[id];
        if (!control) return false;
        const previo = JSON.stringify([control.kind, control.x, control.y, control.options, control.link]);
        const widget = animation.rigControlWidget({ ...control, ...data }, control.min, control.max);
        delete control.x; delete control.y; delete control.options; delete control.link;
        Object.assign(control, widget);
        // Sin cambio real no se ensucia el historial.
        return JSON.stringify([control.kind, control.x, control.y, control.options, control.link]) !== previo;
      });
    }

    /** Cambiar el ROTULO de un control. Es la operación que el artista necesita
     *  cuando escribió mal un nombre, y no arrastra nada: el `id` es la
     *  referencia (va en la ruta del canal `controls/<id>` y en
     *  `action.driver.path`), mientras `name` es sólo lo que se ve en el panel.
     *  Por eso renombrar NO exige migrar el canal ni reapuntar los drivers. */
    setRigControlName(id, name) {
      return this._rigChange("Renombrar el control", (rig) => {
        const control = rig.controls && rig.controls[id];
        if (!control) return false;
        const limpio = String(name || "").trim();
        if (!limpio || limpio === control.name) return false;
        control.name = limpio;
        return true;
      });
    }

    /* ── SMART BONES: acciones conducidas por ángulo ──────────────────────
       Una acción guarda la CORRECCIÓN (cómo debería verse el codo doblado) y
       el driver la dosifica según el ángulo real. El artista la graba una vez
       y vale para toda la animación. */

    /** Crea una acción y la ata a un canal conductor. Por defecto el ángulo del
     *  hueso indicado, de 0° a 90°: el recorrido típico de una articulación. */
    createRigAction(id, data = {}) {
      const clave = String(id || "").trim();
      if (!clave) return false;
      const driverPath = data.driverPath ||
        (data.driverControl ? animation.rigControlPath(data.driverControl) : null) ||
        (data.driverBone ? animation.rigChannelPath(data.driverBone, data.driverProperty || "r") : null);
      if (!driverPath) return false;
      return this._rigChange("Crear acción de Smart Bone", (rig) => {
        rig.actions = rig.actions || {};
        if (rig.actions[clave]) return false;
        rig.actions[clave] = {
          id: clave, name: data.name || clave, enabled: true,
          length: Math.max(2, Math.round(+data.length || 2)),
          driver: { path: driverPath,
            min: Number.isFinite(+data.min) ? +data.min : 0,
            max: Number.isFinite(+data.max) ? +data.max : 90 },
          channels: {},
        };
        return true;
      });
    }
    removeRigAction(id) {
      return this._rigChange("Quitar la acción", (rig) => {
        if (!rig.actions || !rig.actions[id]) return false;
        delete rig.actions[id];
        return true;
      });
    }
    setRigActionDriver(id, driver = {}) {
      return this._rigChange("Cambiar el conductor de la acción", (rig) => {
        const accion = rig.actions && rig.actions[id];
        if (!accion) return false;
        const path = driver.path || accion.driver?.path;
        if (!path) return false;
        const min = Number.isFinite(+driver.min) ? +driver.min : accion.driver?.min ?? 0;
        const max = Number.isFinite(+driver.max) ? +driver.max : accion.driver?.max ?? 90;
        if (Math.abs(max - min) < 1e-9) return false;   // un rango de cero no conduce nada
        accion.driver = { path, min, max };
        return true;
      });
    }
    /** Una clave DENTRO de la acción: su tiempo es el de la acción, no el de la
     *  escena. El cuadro 1 es el estado en el extremo `min` del driver. */
    setRigActionKey(id, path, frame, value) {
      if (!id || !path) return false;
      return this._rigChange("Clave de la acción", (rig) => {
        const accion = rig.actions && rig.actions[id];
        if (!accion) return false;
        const f = Math.max(1, Math.round(frame));
        accion.channels[path] = accion.channels[path] || animation.rigChannelData(path, {});
        accion.channels[path].keys[f] = +value || 0;
        if (f > accion.length) accion.length = f;
        return true;
      });
    }
    /** GRABAR: toma la pose actual de las piezas y la guarda como el estado de
     *  la acción en uno de sus extremos. Es la forma honesta de crear un Smart
     *  Bone: se dobla el codo, se acomoda el dibujo y se graba lo acomodado.
     *  Guarda DIFERENCIAS contra el cuadro 1 de la acción, que es lo que la
     *  acción aporta después. */
    recordRigAction(id, boneIds, extremo = "max", frameEscena = null) {
      const accion = this.scene.rig.actions && this.scene.rig.actions[id];
      if (!accion) return false;
      const ids = (boneIds && boneIds.length ? boneIds : Object.keys(this.scene.rig.nodes || {}))
        .filter((b) => this.scene.rigNode(b));
      if (!ids.length) return false;
      const f = frameEscena == null ? this.frame : frameEscena;
      const destino = extremo === "min" ? 1 : accion.length;
      const enTransaccion = !!this.history && !this.history.transaction;
      if (enTransaccion) this.history.begin("Grabar la acción");
      let algo = false;
      for (const bone of ids) {
        const pose = this.scene.rigPoseBase(bone, f);
        if (!pose) continue;
        for (const property of ["x", "y", "r", "sx", "sy"]) {
          const valor = property === "sx" || property === "sy"
            ? (pose[property] == null ? 1 : pose[property]) : (pose[property] || 0);
          const neutro = property === "sx" || property === "sy" ? 1 : 0;
          const path = animation.rigChannelPath(bone, property);
          const canal = accion.channels[path];
          const yaEnUno = canal && canal.keys[1] != null;
          // el otro extremo tiene que existir, o la acción no tendría contra
          // qué comparar y aportaría el valor absoluto de la pose
          if (destino !== 1 && !yaEnUno) this.setRigActionKey(id, path, 1, neutro);
          if (destino === 1 || Math.abs(valor - neutro) > 1e-9 || yaEnUno) {
            this.setRigActionKey(id, path, destino, valor);
            algo = true;
          }
        }
      }
      if (enTransaccion) this.history.commit();
      return algo;
    }

    /** FLEXI-BINDING: reparte los pesos de la malla por distancia a los huesos.
     *  Es el punto de partida, no el resultado final: deja una deformación
     *  razonable en un clic y después se corrige a mano lo que importa. */
    autoRigMeshWeights(boneId, opciones = {}) {
      const malla = this.scene.rigMesh(boneId);
      if (!malla) return false;
      const huesos = Object.values(this.scene.rig.nodes || {})
        .filter((n) => n && n.head && n.tail);
      if (!huesos.length) return false;
      const pesos = animation.rigAutoWeights(huesos, malla.rest, opciones);
      if (!pesos.length) return false;
      return this._rigChange("Pesos automáticos por distancia", (rig) => {
        const m = rig.meshes && rig.meshes[boneId];
        if (!m) return false;
        m.weights = pesos.map((w,i) => ({ ...(m.locked?.[i]?m.weights[i]:w) }));
        return true;
      });
    }
    /** Escribe los pesos enteros de una malla (lo usa importar y deshacer). */
    setRigMeshWeights(boneId, pesos, label = "Editar pesos de la malla") {
      if (!Array.isArray(pesos)) return false;
      return this._rigChange(label, (rig) => {
        const m = rig.meshes && rig.meshes[boneId];
        if (!m || pesos.length !== m.rest.length) return false;
        m.weights = pesos.map((w) => animation.rigNormalizeWeights(w));
        return true;
      });
    }
    /** PINCEL DE PESOS: suma (o resta) influencia de UN hueso en los vértices
     *  indicados y renormaliza. Todo el trazo entra como una sola operación:
     *  pintar es un gesto, no cincuenta pasos de historial. */
    paintRigMeshWeight(boneId, indices, huesoDestino, delta, label = "Pintar pesos") {
      const malla = this.scene.rigMesh(boneId);
      if (!malla || !huesoDestino || !this.scene.rigNode(huesoDestino)) return false;
      const puntos = [...new Set((indices || []).map((i) => i | 0))]
        .filter((i) => i >= 0 && i < malla.rest.length && !malla.locked?.[i]);
      if (!puntos.length) return false;
      const cantidad = Math.max(-1, Math.min(1, +delta || 0));
      if (!cantidad) return false;
      return this._rigChange(label, (rig) => {
        const m = rig.meshes && rig.meshes[boneId];
        if (!m) return false;
        if (!Array.isArray(m.weights) || m.weights.length !== m.rest.length)
          m.weights = m.rest.map(() => ({}));
        for (const i of puntos) {
          const actual = { ...(m.weights[i] || {}) };
          const previo = actual[huesoDestino] || 0;
          const nuevo = Math.max(0, Math.min(1, previo + cantidad));
          if (nuevo <= 1e-6) delete actual[huesoDestino];
          else actual[huesoDestino] = nuevo;
          // si el pincel deja el vértice sin ningún hueso, vuelve a seguir al
          // suyo: un vértice sin pesos se quedaría clavado mientras el resto
          // de la pieza se mueve, que es peor que cualquier peso mal puesto
          if (!Object.keys(actual).length) actual[boneId] = 1;
          m.weights[i] = animation.rigNormalizeWeights(actual);
        }
        return true;
      });
    }

    setRigMeshLocks(boneId,indices,locked) {
      return this._rigChange(locked?'Bloquear pesos':'Desbloquear pesos',rig=>{
        const mesh=rig.meshes?.[boneId];if(!mesh)return false;
        const points=[...new Set(indices||[])].filter(i=>Number.isInteger(i)&&i>=0&&i<mesh.rest.length);
        if(!points.some(i=>!!mesh.locked?.[i]!==!!locked))return false;
        mesh.locked ||= mesh.rest.map(()=>false);for(const i of points)mesh.locked[i]=!!locked;return true;
      });
    }
    smoothRigMeshWeights(boneId,indices,strength=.5) {
      return this._rigChange('Suavizar pesos',rig=>{
        const mesh=rig.meshes?.[boneId];if(!mesh?.weights?.length)return false;
        const source=mesh.weights.map(w=>({...w})),amount=Math.max(0,Math.min(1,Number(strength)||0));let changed=false;
        for(const i of new Set(indices||[])){
          if(!Number.isInteger(i)||i<0||i>=mesh.rest.length||mesh.locked?.[i])continue;
          const row=Math.floor(i/mesh.cols),col=i%mesh.cols,neighbors=[i];
          if(col>0)neighbors.push(i-1);if(col<mesh.cols-1)neighbors.push(i+1);
          if(row>0)neighbors.push(i-mesh.cols);if(row<mesh.rows-1)neighbors.push(i+mesh.cols);
          const result={};for(const n of neighbors)for(const [id,w] of Object.entries(source[n]||{}))result[id]=(result[id]||0)+w*amount/neighbors.length;
          for(const [id,w] of Object.entries(source[i]||{}))result[id]=(result[id]||0)+w*(1-amount);
          const normalized=animation.rigNormalizeWeights(result);
          if(JSON.stringify(normalized)!==JSON.stringify(source[i])){mesh.weights[i]=normalized;changed=true;}
        }
        return changed;
      });
    }
    removeRigMesh(boneId) {
      return this._rigChange("Quitar la malla", (rig) => {
        if (!rig.meshes || !rig.meshes[boneId]) return false;
        delete rig.meshes[boneId];
        const prefix=`meshes/${encodeURIComponent(boneId)}/`;
        for(const [id,action] of Object.entries(rig.actions||{})){
          const paths=Object.keys(action.channels||{}).filter(path=>path.startsWith(prefix));
          for(const path of paths)delete action.channels[path];
          if(paths.length&&!Object.keys(action.channels).length)delete rig.actions[id];
        }
        const bone = rig.bones[boneId];
        if (bone && bone.binding && bone.binding.mode === "weightedMesh") bone.binding.mode = "rigid";
        return true;
      });
    }

    /** Clava la rejilla posada (cols*rows puntos) en un cuadro. */
    setRigMeshKey(boneId, frame, pts) {
      const f = Math.max(1, Math.round(frame));
      return this._rigChange("Deformar la malla", (rig) => {
        const m = rig.meshes && rig.meshes[boneId];
        if (!m) return false;
        const grid = (pts || []).map((q) => ({ x: +q.x || 0, y: +q.y || 0 }));
        if (grid.length !== m.cols * m.rows) return false;
        m.keys[f] = grid; return true;
      }, { frame: f });
    }

    /** Mueve UN punto de control en un cuadro (para el arrastre en la mesa):
        parte de la rejilla vigente en ese cuadro y sobreescribe sólo ese índice. */
    setRigMeshPoint(boneId, index, x, y, frame) {
      const f = Math.max(1, Math.round(frame));
      const m = this.scene.rigMesh ? this.scene.rigMesh(boneId) : null;
      if (!m) return false;
      const n = m.cols * m.rows;
      if (!(index >= 0 && index < n)) return false;
      const base = (this.scene.rigMeshAt && this.scene.rigMeshAt(boneId, f)) || m.rest;
      const grid = base.map((q) => ({ x: +q.x || 0, y: +q.y || 0 }));
      grid[index] = { x: +x || 0, y: +y || 0 };
      return this.setRigMeshKey(boneId, f, grid);
    }

    deleteRigMeshKey(boneId, frame) {
      return this._rigChange("Borrar la deformación de este cuadro", (rig) => {
        const m = rig.meshes && rig.meshes[boneId], f = Math.max(1, Math.round(frame));
        if (!m || !m.keys[f]) return false;
        delete m.keys[f]; return true;
      });
    }

    setRigActiveAttachment(slotId, attachmentId) {
      return this._rigChange("Cambiar sustitución del rig", (rig) => {
        const slot = rig.slots[slotId], attachment = rig.attachments[attachmentId];
        if (!slot || !attachment || attachment.slotId !== slotId) return false;
        slot.activeAttachmentId = attachmentId; return true;
      });
    }

    setRigSlotOrder(slotIds) {
      return this._rigChange("Cambiar orden visual del rig", (rig) => {
        const requested = [...new Set(slotIds || [])];
        if (requested.length !== Object.keys(rig.slots).length || requested.some((id) => !rig.slots[id])) return false;
        requested.forEach((id, index) => { rig.slots[id].drawOrder = index; });
        return true;
      });
    }

    setRigChannelKey(path, frame, value, data = {}) {
      if (!path) return false;
      return this._rigChange(data.label || "Crear clave de propiedad", (rig) => {
        const f = Math.max(1, Math.round(frame));
        const match = /^bones\/([^/]+)\/pose\/(x|y|r|sx|sy)$/.exec(path);
        const node = match ? rig.bones[decodeURIComponent(match[1])] : null;
        if (match && !node) return false;
        rig.channels[path] ||= animation.rigChannelData(path, data);
        rig.channels[path].keys[f] = animation.clone(value);
        if (match) {
          const id = decodeURIComponent(match[1]), property = match[2];
          // la clave guarda la pose BASE: el aporte de las acciones no se hornea
          node.keys[f] ||= animation.clone(this.scene.rigPoseBase(id, f));
          node.keys[f][property] = +value || 0;
        }
        return true;
      });
    }

    upsertRigConstraint(data = {}) {
      if (!data.id) return false;
      return this._rigChange(data.label || "Editar constraint del rig", (rig) => {
        const previous = rig.constraints[data.id], previousOrder = [...rig.constraintOrder];
        rig.constraints[data.id] = animation.rigConstraintData(data.id, data,
          previous ? previous.order : rig.constraintOrder.length);
        if (!rig.constraintOrder.includes(data.id)) rig.constraintOrder.push(data.id);
        rig.constraintOrder.sort((a, b) => rig.constraints[a].order - rig.constraints[b].order || a.localeCompare(b));
        if (animation.rigConstraintHasCycle(rig)) {
          if (previous) rig.constraints[data.id] = previous; else delete rig.constraints[data.id];
          rig.constraintOrder = previousOrder; return false;
        }
        return data.id;
      });
    }

    setRigConstraintOrder(ids) {
      return this._rigChange("Ordenar constraints del rig", (rig) => {
        const order = [...new Set(ids || [])];
        if (order.length !== Object.keys(rig.constraints).length || order.some((id) => !rig.constraints[id])) return false;
        rig.constraintOrder = order;
        order.forEach((id, index) => { rig.constraints[id].order = index; });
        return true;
      });
    }

    setRigPoseKeys(poses, frame, label = "Clavar pose del rig") {
      const f = Math.max(1, Math.round(frame));
      return this._rigChange(label, (rig) => {
        let changed = false;
        for (const [id, pose] of Object.entries(poses || {})) {
          const node = rig.nodes[id]; if (!node) continue;
          const sx = pose.sx == null ? (pose.s == null ? 1 : +pose.s) : +pose.sx;
          const sy = pose.sy == null ? (pose.s == null ? 1 : +pose.s) : +pose.sy;
          node.keys[f] = { x: +pose.x || 0, y: +pose.y || 0, r: +pose.r || 0, sx, sy };
          this._syncRigPoseChannels(rig, id, node.keys);
          changed = true;
        }
        return changed;
      });
    }
    setRigPoseSequence(sequence, label = "Aplicar movimiento capturado") {
      return this._rigChange(label, (rig) => {
        let changed=false;
        for(const [rawFrame,poses] of Object.entries(sequence||{})){const f=Math.max(1,Math.round(Number(rawFrame)||1));for(const [id,pose] of Object.entries(poses||{})){const node=rig.nodes[id];if(!node)continue;const sx=pose.sx==null?1:+pose.sx,sy=pose.sy==null?1:+pose.sy;node.keys[f]={x:+pose.x||0,y:+pose.y||0,r:+pose.r||0,sx,sy};this._syncRigPoseChannels(rig,id,node.keys);changed=true;}}
        return changed;
      });
    }

    /** Edita las tangentes de una sola propiedad. La pose se conserva: sólo
     *  cambia el momento en que esa propiedad recorre el tramo. */
    setRigChannelEase(path, frame, ease, data = {}) {
      if (!path) return false;
      return this._rigChange(data.label || "Cambiar curva de propiedad", (rig) => {
        const channel = rig.channels[path], f = Math.max(1, Math.round(frame));
        if (!channel || channel.keys?.[f] == null) return false;
        channel.ease ||= {};
        channel.ease[f] = animation.rigEaseData(ease);
        return true;
      });
    }

    /** Pega un timing completo sobre un tramo en una sola operación de Undo. */
    /** Borra una clave de un canal. Un editor de curvas sin borrar no es un
     *  editor: se puede crear timing pero no corregirlo. Si la clave venía de
     *  una pose de hueso, también sale de ahí, o el canal y la pose quedarían
     *  contando historias distintas sobre el mismo cuadro. */
    removeRigChannelKey(path, frame) {
      if (!path) return false;
      return this._rigChange("Borrar clave de propiedad", (rig) => {
        const channel = rig.channels[path], f = Math.max(1, Math.round(frame));
        if (!channel || channel.keys[f] == null) return false;
        delete channel.keys[f];
        if (channel.ease) delete channel.ease[f];
        const match = /^bones\/([^/]+)\/pose\/(x|y|r|sx|sy)$/.exec(path);
        if (match) {
          const node = rig.bones[decodeURIComponent(match[1])];
          // la pose sólo se va cuando NINGUNA propiedad la sostiene
          if (node && node.keys[f] && !["x", "y", "r", "sx", "sy"].some((prop) =>
            rig.channels[animation.rigChannelPath(decodeURIComponent(match[1]), prop)]?.keys?.[f] != null))
            delete node.keys[f];
        }
        if (!Object.keys(channel.keys).length) delete rig.channels[path];
        return true;
      });
    }
    /** La curva de UNA clave de un canal cualquiera (no sólo de un hueso):
     *  `eo` como sale, `ei` como llega, `hold` para escalón. */
    setRigChannelEase(path, frame, ease) {
      if (!path) return false;
      return this._rigChange("Cambiar la curva de una clave", (rig) => {
        const channel = rig.channels[path], f = Math.max(1, Math.round(frame));
        if (!channel || channel.keys[f] == null) return false;
        channel.ease ||= {};
        if (ease) channel.ease[f] = animation.rigEaseData(ease);
        else delete channel.ease[f];
        if (channel.interpolation === "linear" && ease && !ease.hold) channel.interpolation = "bezier";
        return true;
      });
    }
    /** Modo de interpolación del canal entero: escalón, recta o curva. */
    setRigChannelInterpolation(path, modo) {
      if (!path) return false;
      return this._rigChange("Cambiar la interpolación del canal", (rig) => {
        const channel = rig.channels[path];
        if (!channel) return false;
        const valor = modo === "step" ? "step" : modo === "linear" ? "linear" : "bezier";
        if (channel.interpolation === valor) return false;
        channel.interpolation = valor;
        return true;
      });
    }
    pasteRigChannelCurve(path, fromFrame, toFrame, curve, data = {}) {
      if (!path || !curve) return false;
      return this._rigChange(data.label || "Pegar curva de propiedad", (rig) => {
        const channel = rig.channels[path], a = Math.max(1, Math.round(fromFrame)),
          b = Math.max(1, Math.round(toFrame));
        if (!channel || channel.keys?.[a] == null || channel.keys?.[b] == null) return false;
        const out = animation.rigEaseData(curve.out), incoming = animation.rigEaseData(curve.in);
        channel.ease ||= {};
        channel.ease[a] = out; channel.ease[b] = incoming;
        channel.interpolation = curve.interpolation === "step" ? "step" :
          (curve.interpolation === "linear" ? "linear" : "bezier");
        return true;
      });
    }

    deleteRigPoseKeys(ids, frame, label = "Borrar pose global del rig") {
      const f = Math.max(1, Math.round(frame)), wanted = new Set(ids || Object.keys(this.scene.rig.nodes));
      return this._rigChange(label, (rig) => {
        let changed = false;
        for (const [id, node] of Object.entries(rig.nodes)) {
          if (wanted.has(id) && node.keys && node.keys[f]) {
            delete node.keys[f]; this._syncRigPoseChannels(rig, id, node.keys); changed = true;
          }
        }
        for (const c of Object.values(rig.constraints || {})) {
          if (c.targetKeys && c.targetKeys[f]) { delete c.targetKeys[f]; changed = true; }
        }
        return changed;
      });
    }

    createRigIK(rootId, midId, effectorId, data = {}) {
      const effector = this.scene.rigNode(effectorId);
      const initialTarget = data.target || (effector && effector.pivot
        ? this.scene.rigWorldPoint(effectorId, this.frame, effector.pivot) : null);
      return this._rigChange("Crear cadena IK", (rig) => {
        const root = rig.nodes[rootId], mid = rig.nodes[midId], end = rig.nodes[effectorId];
        if (!root || !mid || !end || mid.parentId !== rootId || end.parentId !== midId ||
            !root.pivot || !mid.pivot || !end.pivot) return false;
        rig.constraints = rig.constraints || {};
        const id = data.id || `ik_${rootId}_${effectorId}`;
        rig.constraints[id] = { id, type: "ik2", rootId, midId, effectorId,
          enabled: true, bend: data.bend === -1 ? -1 : 1,
          mix: 1, order: rig.constraintOrder.length, reads: [], writes: [rootId, midId], dependsOn: [],
          target: initialTarget || { x: end.pivot.x, y: end.pivot.y }, targetKeys: {} };
        if (!rig.constraintOrder.includes(id)) rig.constraintOrder.push(id);
        return id;
      });
    }

    deleteRigConstraint(id) {
      return this._rigChange("Borrar cadena IK", (rig) => {
        if (!rig.constraints || !rig.constraints[id]) return false;
        delete rig.constraints[id];
        rig.constraintOrder = rig.constraintOrder.filter((entry) => entry !== id); return true;
      });
    }

    setRigIKBend(id, bend) {
      return this._rigChange("Invertir flexión IK", (rig) => {
        const c = rig.constraints && rig.constraints[id]; if (!c) return false;
        c.bend = bend === -1 ? -1 : 1; return true;
      });
    }

    /** Convierte poses resueltas en claves reales del cuadro. Una pose que no
     *  queda clavada no es una pose: no se reproduce ni se guarda. */
    /** Escribe poses como CLAVES. Todo lo que llega acá se midió sobre lo que se
     *  ve, y lo que se ve incluye el aporte de las acciones (Smart Bones). Si se
     *  guardara tal cual, ese aporte quedaría horneado en la clave y volvería a
     *  sumarse encima: el brazo se iría al doble en cuanto el codo se doblara.
     *  Por eso se descuenta el aporte antes de guardar: la clave es siempre
     *  pose BASE, y la acción sigue siendo lo único que pone la corrección. */
    _writeRigPoses(rig, poses, frame) {
      for (const [nodeId, pose] of Object.entries(poses || {})) {
        const node = rig.nodes[nodeId]; if (!node) continue;
        const extra = this.scene.rigActionDelta ? this.scene.rigActionDelta(nodeId, frame) : null;
        const sin = (valor, campo, neutro) => (+valor || neutro) - (extra ? extra[campo] : 0);
        node.keys[frame] = {
          x: sin(pose.x, "x", 0), y: sin(pose.y, "y", 0), r: sin(pose.r, "r", 0),
          sx: (pose.sx == null ? 1 : +pose.sx) - (extra ? extra.sx : 0),
          sy: (pose.sy == null ? 1 : +pose.sy) - (extra ? extra.sy : 0) };
        this._syncRigPoseChannels(rig, nodeId, node.keys);
      }
    }

    setRigIKTarget(id, frame, target) {
      const solved = this.scene.rigSolveIK(id, frame, target);
      if (!solved) return false;
      const f = Math.max(1, Math.round(frame));
      return this._rigChange("Posar cadena IK", (rig) => {
        const c = rig.constraints && rig.constraints[id]; if (!c) return false;
        c.targetKeys = c.targetKeys || {};
        c.targetKeys[f] = { x: solved.target.x, y: solved.target.y };
        this._writeRigPoses(rig, solved.poses, f);
        return true;
      });
    }

    /** Mover el pole ES mover el codo o la rodilla: se clava el punto y se
     *  vuelve a resolver con el mismo objetivo, todo en un solo Undo. */
    setRigIKPole(id, frame, pole) {
      if (!pole || !Number.isFinite(+pole.x) || !Number.isFinite(+pole.y)) return false;
      const f = Math.max(1, Math.round(frame)), point = { x: +pole.x, y: +pole.y };
      return this._rigChange("Mover el pole de la cadena IK", (rig) => {
        const c = rig.constraints && rig.constraints[id];
        if (!c || c.type !== "ik2") return false;
        c.poleKeys = c.poleKeys || {};
        c.poleKeys[f] = point;
        if (!c.pole) c.pole = { ...point };
        // Se resuelve con el rig YA modificado: el solver tiene que ver el pole
        // nuevo, si no la rodilla se quedaría del lado viejo hasta el próximo gesto.
        const solved = this.scene.rigSolveIK(id, f, this.scene.rigTargetAt(id, f));
        if (solved) this._writeRigPoses(rig, solved.poses, f);
        return true;
      });
    }

    /** Match IK→FK: lleva objetivo y flexión adonde la cadena YA está. Encender
     *  IK después de esto no mueve un píxel. */
    matchRigIK(id, frame) {
      const f = Math.max(1, Math.round(frame));
      const match = this.scene.rigMatchIK(id, f);
      if (!match) return false;
      return this._rigChange("Emparejar IK con la pose actual", (rig) => {
        const c = rig.constraints && rig.constraints[id]; if (!c) return false;
        c.targetKeys = c.targetKeys || {};
        c.targetKeys[f] = { x: match.target.x, y: match.target.y };
        if (!match.ambiguous) {
          // Si la cadena ya usa pole, el lado se conserva moviendo el pole;
          // si no, alcanza con el flag y no se le inventan claves al animador.
          if (c.pole || Object.keys(c.poleKeys || {}).length) {
            c.poleKeys = c.poleKeys || {};
            c.poleKeys[f] = { x: match.pole.x, y: match.pole.y };
          } else c.bend = match.bend;
        }
        return true;
      });
    }

    /** Clavar o soltar el extremo de una cadena. Clavar NO mueve nada: primero
     *  lleva el objetivo adonde el extremo ya está —es un match— y recién ahí
     *  lo retiene. Soltar es igual de explícito y también deja su cuadro: un
     *  apoyo que se pierde sin clave no se puede volver a encontrar. */
    setRigPin(id, frame, pinned) {
      const c = this.scene.rigConstraint(id);
      if (!c || c.type !== "ik2") return false;
      const f = Math.max(1, Math.round(frame));
      const match = pinned ? this.scene.rigMatchIK(id, f) : null;
      return this._rigChange(pinned ? "Clavar el extremo de la cadena" : "Soltar el extremo de la cadena",
        (rig) => {
          const con = rig.constraints && rig.constraints[id]; if (!con) return false;
          con.pinKeys = con.pinKeys || {};
          con.pinKeys[f] = pinned ? 1 : 0;
          if (match) {
            con.targetKeys = con.targetKeys || {};
            con.targetKeys[f] = { x: match.target.x, y: match.target.y };
          }
          return true;
        }, { frame: f, skipPin: id });
    }

    /** Match FK←IK: hornea la pose evaluada del cuadro como claves y apaga la
     *  cadena. Apagar IK deja el dibujo donde estaba, también en un cuadro
     *  interpolado. */
    matchRigFK(id, frame) {
      const c = this.scene.rigConstraint(id);
      if (!c || c.type !== "ik2") return false;
      const f = Math.max(1, Math.round(frame)), poses = {};
      for (const nodeId of [c.rootId, c.midId]) {
        const pose = this.scene.rigPose(nodeId, f);
        if (pose) poses[nodeId] = pose;
      }
      if (!Object.keys(poses).length) return false;
      return this._rigChange("Pasar la cadena a FK", (rig) => {
        const con = rig.constraints && rig.constraints[id]; if (!con) return false;
        this._writeRigPoses(rig, poses, f);
        con.enabled = false;
        return true;
      });
    }

    // ── serialización ────────────────────────────────────────────────────
    toJSON() {
      return { format: "lowscene", version: 1, savedAt: new Date().toISOString(),
               frame: this.frame, layerId: this.layerId, scene: this.scene.toJSON(),
               // la ONDA se guarda con la escena: así se sigue viendo al
               // reabrir aunque el archivo de audio no esté a mano, y no hay
               // que volver a decodificarlo
               audio: this.audio ? this.audio.toJSON() : null,
               mocap: this.mocap ? this.mocap.toJSON() : null,
               onion: this.onionCfg ? JSON.parse(JSON.stringify(this.onionCfg)) : null };
    }
    static fromJSON(data) {
      const d = (typeof data === "string") ? JSON.parse(data) : data;
      if (!d || d.format !== "lowscene") throw new Error("El archivo no es una escena de LOW");
      const doc = new LowDoc(new animation.Scene(d.scene));
      doc.frame = Math.max(1, Number(d.frame) || 1);
      if (d.layerId && doc.scene.layer(d.layerId)) doc.layerId = d.layerId;
      if (d.audio && animation.AudioTrack) {
        doc.audio = new animation.AudioTrack(doc).fromJSON(d.audio);
      }
      if (d.mocap && animation.MotionCaptureTrack) {
        doc.mocap = new animation.MotionCaptureTrack(doc).fromJSON(d.mocap);
      }
      if (d.onion) doc.onionCfg = animation.onion ? animation.onion.config(d.onion) : d.onion;
      const repaired = doc.repairRigBindingOwnership();
      doc.rigRepairCount = repaired || 0;
      // Una reparación automática debe poder guardarse; una escena sana abre
      // limpia como siempre.
      doc.dirty = repaired > 0;
      return doc;
    }
    /** Migra una animación vieja (lista de archivos + su contenido) al modelo.
     *  Cada archivo pasa a ser un dibujo numerado, expuesto un frame cada uno:
     *  se ve igual que antes, pero ya se le pueden hacer holds. */
    static fromLegacy(frames, contents, fps, nombre) {
      const sc = animation.Scene.fromLegacy({ frames, contents: contents || {}, fps: fps || 12, name: nombre });
      const doc = new LowDoc(sc);
      doc.dirty = true;
      return doc;
    }
  }

  animation.LowDoc = LowDoc;
})(window);
