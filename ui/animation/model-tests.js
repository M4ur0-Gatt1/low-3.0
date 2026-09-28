/* ══════════════════════════════════════════════════════════════════════════
   PRUEBAS FUNCIONALES DEL MODELO 2D

   No comprueban que el código "corra": comprueban que se pueda hacer el
   trabajo. La última prueba es el test de aceptación pedido — poses en 1,5,9,13,
   trabajar en 2s, extender un hold, mover una exposición y borrarla SIN perder
   el dibujo, guardar, reabrir y seguir donde se dejó.

   Se ejecuta desde la consola:  LOW.animation.runTests()

   @module animation/model-tests
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};

  function runTests() {
    const { Scene, exposures: X, onion } = animation;
    const res = [];
    const ok = (nombre, cond, detalle) => res.push({ nombre, ok: !!cond, detalle: detalle || "" });
    const cells = (ly, n) => Array.from({ length: n }, (_, i) => ly.cellAt(i + 1));

    // Inspector: una intención agrupa entradas sólo del mismo dibujo y cima.
    {
      const doc = new animation.LowDoc(); doc.writeDrawing('<rect x="0"/>');
      const h = new LOW.core.HistoryManager(); doc.setHistory(h);
      doc.writeDrawing('<rect x="1"/>', {label:'Editar propiedad'});
      const entry = h.undoStack.at(-1);
      doc.writeDrawing('<rect x="2"/>', {coalesce:entry});
      ok('propiedad agrupa entradas del mismo dibujo', h.undoStack.length === 1);
      h.undo(); ok('undo agrupado conserva el inicio', doc.drawing.content === '<rect x="0"/>');
      h.redo(); ok('redo agrupado conserva el final', doc.drawing.content === '<rect x="2"/>');
      doc.writeDrawing('<rect x="3"/>');
      doc.writeDrawing('<rect x="4"/>', {coalesce:entry});
      ok('no agrupa atravesando otra intención', h.undoStack.length === 3 && entry.after === '<rect x="2"/>');
      const latest = h.undoStack.at(-1);
      h.undo(); doc.writeDrawing('<rect x="5"/>', {coalesce:latest});
      ok('editar tras undo inicia otra rama', h.redoStack.length === 0 && h.undoStack.at(-1) !== latest);
      doc.goTo(2); doc.writeDrawing('<circle r="1"/>', {coalesce:h.undoStack.at(-1)});
      ok('otro dibujo no absorbe la intención anterior', doc.scene.level(doc.layer.levelId).byNumber(1).content === '<rect x="5"/>');
    }

    // ── 1. Drawing ≠ Frame: un dibujo expuesto en varios frames es UN dibujo ──
    {
      const sc = new Scene({ fps: 24 });
      const lv = sc.addLevel("A");
      const ly = sc.addLayer(lv.id, "A");
      sc.expose(ly.id, 1, 1); sc.expose(ly.id, 2, 1); sc.expose(ly.id, 3, 1);
      ok("un dibujo en 3 frames sigue siendo UN dibujo", lv.drawings.length === 1,
         `dibujos=${lv.drawings.length}`);
      ok("los 3 frames resuelven al mismo objeto",
         sc.drawingAt(ly.id, 1) === sc.drawingAt(ly.id, 3));
      ok("el hold se detecta", ly.isHold(2) && ly.holdLength(1) === 3,
         `largo=${ly.holdLength(1)}`);
    }

    // ── 2. Borrar una exposición NO borra el dibujo ──
    {
      const sc = new Scene();
      const lv = sc.addLevel("A"); const ly = sc.addLayer(lv.id, "A");
      sc.expose(ly.id, 1, 1); sc.expose(ly.id, 2, 2);
      lv.byNumber(2).content = "<path d='M0 0 L10 10'/>";
      X.clear(ly, 2, 2);
      ok("borrar la celda deja el dibujo en el nivel", !!lv.byNumber(2));
      ok("y conserva su contenido", lv.byNumber(2).content.includes("path"));
      ok("la celda quedó vacía", ly.cellAt(2) == null);
    }

    // ── 3. Trabajar en 2s ──
    {
      const sc = new Scene();
      const lv = sc.addLevel("A"); const ly = sc.addLayer(lv.id, "A");
      [1, 2, 3, 4].forEach((n) => sc.expose(ly.id, n, n));
      X.step(ly, 1, 4, 2);
      ok("step 2 → 1,1,2,2,3,3,4,4", JSON.stringify(cells(ly, 8)) === JSON.stringify([1,1,2,2,3,3,4,4]),
         JSON.stringify(cells(ly, 8)));
      X.each(ly, 1, 8, 2);
      ok("each 2 vuelve a 1s", JSON.stringify(cells(ly, 4)) === JSON.stringify([1,2,3,4]),
         JSON.stringify(cells(ly, 4)));
    }

    // ── 3b. Acortar la secuencia NO puede dejar cola vieja ──
    //  (apareció al probar la xsheet en pantalla: pasar de 2s a 1s dejaba los
    //   dibujos del final colgando y se veían celdas fantasma)
    {
      const sc = new Scene();
      const lv = sc.addLevel("A"); const ly = sc.addLayer(lv.id, "A");
      [1,2,3,4].forEach((n) => sc.expose(ly.id, n, n));
      X.step(ly, 1, 4, 2);                    // 1,1,2,2,3,3,4,4  (8 celdas)
      X.step(ly, 1, ly.lastFrame(), 1);       // vuelve a 1,2,3,4 (4 celdas)
      ok("volver a 1s no deja celdas fantasma", ly.lastFrame() === 4,
         `último frame=${ly.lastFrame()} · ${JSON.stringify(cells(ly, 8))}`);
      ok("y el contenido es el correcto",
         JSON.stringify(cells(ly, 4)) === JSON.stringify([1,2,3,4]), JSON.stringify(cells(ly, 4)));
      X.each(ly, 1, 4, 2);
      ok("each tampoco deja cola", ly.lastFrame() === 2, `último=${ly.lastFrame()}`);
    }

    // ── 4. Extender y acortar un hold ──
    {
      const sc = new Scene();
      const lv = sc.addLevel("A"); const ly = sc.addLayer(lv.id, "A");
      sc.expose(ly.id, 1, 1); sc.expose(ly.id, 2, 2); sc.expose(ly.id, 3, 3);
      X.stepChange(ly, 1, +2);
      ok("extender el hold empuja lo que sigue",
         JSON.stringify(cells(ly, 5)) === JSON.stringify([1,1,1,2,3]), JSON.stringify(cells(ly, 5)));
      X.stepChange(ly, 1, -2);
      ok("acortarlo lo devuelve", JSON.stringify(cells(ly, 3)) === JSON.stringify([1,2,3]),
         JSON.stringify(cells(ly, 3)));
    }

    // ── 5. Mover una exposición sin destruir nada ──
    {
      const sc = new Scene();
      const lv = sc.addLevel("A"); const ly = sc.addLayer(lv.id, "A");
      [1,2,3,4].forEach((n) => sc.expose(ly.id, n, n));
      X.move(ly, 1, 1, 4);
      ok("mover deja los 4 dibujos vivos", lv.drawings.length === 4);
      ok("y ninguna celda se perdió", cells(ly, 4).filter((c) => c != null).length === 4,
         JSON.stringify(cells(ly, 4)));
    }

    // ── 6. Navegar entre DIBUJOS salteando holds ──
    {
      const sc = new Scene();
      const lv = sc.addLevel("A"); const ly = sc.addLayer(lv.id, "A");
      [1,1,1,2,2,3].forEach((n, i) => sc.expose(ly.id, i + 1, n));
      ok("desde el frame 1, el próximo dibujo está en el 4", X.nextDrawingFrame(ly, 1, 1) === 4,
         String(X.nextDrawingFrame(ly, 1, 1)));
      ok("desde el 6, el anterior está en el 4", X.nextDrawingFrame(ly, 6, -1) === 4,
         String(X.nextDrawingFrame(ly, 6, -1)));
    }

    // ── 7. ONION SKIN sobre dibujos, no sobre frames ──
    {
      const sc = new Scene();
      const lv = sc.addLevel("A"); const ly = sc.addLayer(lv.id, "A");
      // 1,1,1,2,2,3 — parado en el frame 3 (último del hold del dibujo 1)
      [1,1,1,2,2,3].forEach((n, i) => sc.expose(ly.id, i + 1, n));
      lv.drawings.forEach((d) => { d.content = "<path d='M0 0 L1 1'/>"; });
      const r = onion.resolve(sc, ly.id, 3, { before: 1, after: 1 });
      const nums = r.map((s) => s.drawing.number).sort();
      ok("el papel cebolla NO repite el dibujo del hold", !nums.includes(1),
         `mostró ${JSON.stringify(nums)}`);
      ok("muestra el dibujo siguiente distinto (2)", nums.includes(2), JSON.stringify(nums));
      const r2 = onion.resolve(sc, ly.id, 4, { before: 1, after: 1 });
      const n2 = r2.map((s) => s.drawing.number).sort();
      ok("desde el 4 muestra el 1 (atrás) y el 3 (adelante)",
         n2.includes(1) && n2.includes(3), JSON.stringify(n2));
      const conColor = r2.every((s) => s.color && s.opacity > 0);
      ok("cada uno viene con color y opacidad", conColor);
      const mezclado = onion.resolve(sc, ly.id, 4, {
        beforeOpacity: [.81, 0, 0], afterOpacity: [.17, 0, 0]
      });
      const anterior = mezclado.find((s) => s.tipo === "before");
      const posterior = mezclado.find((s) => s.tipo === "after");
      ok("la mesa de luz controla la opacidad de cada lado por separado",
        anterior && posterior && anterior.opacity === .81 && posterior.opacity === .17,
        JSON.stringify(mezclado.map((s) => [s.tipo, s.opacity])));
      const apagado = onion.resolve(sc, ly.id, 4, {
        beforeOpacity: Array(10).fill(0), afterOpacity: Array(10).fill(0)
      });
      ok("un canal de la mesa de luz en cero queda realmente apagado", apagado.length === 0);
      const docLuz = new animation.LowDoc(sc);
      docLuz.onionCfg = onion.config({ beforeOpacity: [.7, .3, 0], afterOpacity: [.2, 0] });
      const luzReabierta = animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(docLuz.toJSON())));
      ok("el perfil completo de la mesa de luz se guarda con la escena",
        luzReabierta.onionCfg.beforeOpacity[1] === .3 && luzReabierta.onionCfg.afterOpacity[0] === .2);
    }

    // ── 8. Fill handle: repetir y continuar progresiones ──
    {
      const sc = new Scene();
      const lv = sc.addLevel("A"); const ly = sc.addLayer(lv.id, "A");
      sc.expose(ly.id, 1, 1); sc.expose(ly.id, 2, 3); sc.expose(ly.id, 3, 5);
      X.fillHandle(ly, 1, 3, 6);
      ok("continúa la progresión 1,3,5 → 7,9,11",
         JSON.stringify(cells(ly, 6)) === JSON.stringify([1,3,5,7,9,11]), JSON.stringify(cells(ly, 6)));
    }

    // ── HIST-02: los caminos de copiar/cortar/pegar son UN comando ──
    {
      const { LowDoc } = animation;
      const cells = animation.shortcuts && animation.shortcuts.cells;
      const armar = () => {
        const doc = new LowDoc();
        const ly = doc.scene.layers[0], lv = doc.scene.levels[0];
        [1, 2, 3].forEach((n) => lv.addDrawing(n, `<path d='M0 0 L${n} ${n}'/>`));
        [1, 2, 3].forEach((n) => doc.scene.expose(ly.id, n, n));
        doc.setHistory(new LOW.core.HistoryManager());
        return doc;
      };
      const rango = (doc) => ({ fromLayerId: doc.layerId, toLayerId: doc.layerId, from: 1, to: 3 });
      const foto = (doc) => JSON.stringify(doc.scene.layers.map((l) =>
        Array.from({ length: 8 }, (_, i) => l.cellAt(i + 1))));
      ok("existe un comando único de celdas", !!cells);
      if (cells) {
        // camino A: como lo llama la X-sheet / la barra de la Timeline
        const a = armar();
        cells.cut(a, rango(a)); a.goTo(5); cells.paste(a);
        // camino B: como lo llama el teclado, con la MISMA función
        const b = armar();
        cells.cut(b, rango(b)); b.goTo(5); cells.paste(b);
        ok("cortar y pegar produce el mismo estado por cualquier camino", foto(a) === foto(b),
          foto(a) + " vs " + foto(b));
        const c = armar();
        cells.copy(c, rango(c)); c.goTo(5); cells.paste(c);
        ok("copiar deja las celdas originales donde estaban",
          c.scene.layers[0].cellAt(1) === 1 && c.scene.layers[0].cellAt(5) === 1,
          foto(c));
        ok("y el rango copiado informa su medida", /2 x 3|1 x 3|3 x 1/.test(cells.medida(cells.copy(c, rango(c)))),
          cells.medida(cells.copy(c, rango(c))));
        const d = armar();
        d.goTo(2);
        const solo = cells.copy(d);      // sin selección: la celda actual
        ok("sin selección el comando trabaja sobre la celda actual",
          !!solo && solo.width === 1 && solo.height === 1, JSON.stringify(solo && { w: solo.width, h: solo.height }));
        const e = armar();
        cells.cut(e, rango(e));
        const antesDeDeshacer = foto(e);
        e.history.undo();
        ok("cortar por el comando entra en el historial y se deshace",
          foto(e) !== antesDeDeshacer && e.scene.layers[0].cellAt(1) === 1, foto(e));
      }
    }

    // ── LEVEL-01: el nombre es de la persona, el id es del documento ──
    {
      const { LowDoc } = animation;
      const doc = new LowDoc();
      const h = new LOW.core.HistoryManager();
      doc.setHistory(h);
      const nivel = doc.scene.levels[0];
      const idOriginal = nivel.id;
      ok("un nivel nace con un id interno propio", !!idOriginal && idOriginal !== nivel.name);
      ok("renombrar acepta un nombre descriptivo", doc.renameLevel(idOriginal, "  Cabeza  ") === true);
      ok("y lo guarda sin los espacios de más", doc.scene.level(idOriginal).name === "Cabeza");
      ok("el id NO cambia al renombrar", doc.scene.level(idOriginal).id === idOriginal);
      ok("un nombre vacío no borra el que había", doc.renameLevel(idOriginal, "   ") === false
        && doc.scene.level(idOriginal).name === "Cabeza");
      h.undo();
      ok("Ctrl+Z devuelve el nombre anterior y conserva el id",
        doc.scene.level(idOriginal).name !== "Cabeza" && doc.scene.level(idOriginal).id === idOriginal);
      h.redo();
      const reabierto = animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
      ok("al reabrir el nivel conserva id y nombre",
        !!reabierto.scene.level(idOriginal) && reabierto.scene.level(idOriginal).name === "Cabeza");
    }

    // ── 9. TEST DE ACEPTACIÓN: el flujo completo ──
    {
      const sc = new Scene({ fps: 24, name: "Prueba" });
      const lv = sc.addLevel("Personaje");
      const ly = sc.addLayer(lv.id, "Personaje");
      // poses en 1, 5, 9, 13
      [[1,1],[5,2],[9,3],[13,4]].forEach(([f, d]) => sc.expose(ly.id, f, d));
      lv.drawings.forEach((d) => { d.content = `<path d='M0 0 L${d.number} ${d.number}'/>`; });
      X.autoexpose(ly, 1, 16);
      ok("autoexpose sostiene cada pose hasta la siguiente",
         ly.cellAt(4) === 1 && ly.cellAt(8) === 2 && ly.cellAt(12) === 3,
         JSON.stringify(cells(ly, 16)));
      // intercalar un dibujo nuevo
      const inter = lv.addDrawing(5, "<path d='M0 0 L5 5'/>");
      sc.expose(ly.id, 3, inter.number);
      ok("se puede intercalar sin tocar el resto", ly.cellAt(3) === 5 && ly.cellAt(4) === 1);
      // pasar a 2s
      X.step(ly, 1, 16, 2);
      const enDos = cells(ly, 8);
      ok("pasar a 2s duplica cada exposición", enDos[0] === enDos[1] && enDos[2] === enDos[3],
         JSON.stringify(enDos));
      // extender un hold y borrar una exposición
      const antesDibujos = lv.drawings.length;
      X.stepChange(ly, 1, +2);
      X.clear(ly, 5, 5);
      ok("después de todo el timing, no se perdió ni un dibujo",
         lv.drawings.length === antesDibujos, `${lv.drawings.length} vs ${antesDibujos}`);
      // guardar → reabrir
      const json = JSON.stringify(sc.toJSON());
      const sc2 = new animation.Scene(JSON.parse(json));
      const ly2 = sc2.layers[0], lv2 = sc2.levels[0];
      ok("al reabrir, mismos dibujos", lv2.drawings.length === lv.drawings.length);
      ok("al reabrir, mismo timing",
         JSON.stringify(ly2.cells) === JSON.stringify(ly.cells));
      ok("al reabrir, el contenido de los dibujos sigue ahí",
         lv2.drawings.every((d) => d.content === lv.byNumber(d.number).content));
      ok("al reabrir, los fps se conservan", sc2.fps === 24);
    }

    // ── 10. DOCUMENTO: guardar → cerrar → reabrir → seguir ──
    {
      const { LowDoc } = animation;
      const doc = new LowDoc();
      doc.scene.fps = 24;
      doc.scene.name = "ciclo";
      [[1, 1], [5, 2], [9, 3]].forEach(([f, n]) => doc.setCell(f, n));
      doc.goTo(1); doc.writeDrawing("<path d='M1 1'/>");
      doc.goTo(5); doc.writeDrawing("<path d='M5 5'/>");
      doc.goTo(9); doc.writeDrawing("<path d='M9 9'/>");
      doc.apply("autoexpose", 1, 12);
      doc.scene.range = { in: 1, out: 12 };
      const antesCeldas = JSON.stringify(doc.layer.cells);

      const json = JSON.stringify(doc.toJSON());       // guardar
      const doc2 = LowDoc.fromJSON(JSON.parse(json));  // cerrar y reabrir
      ok("al reabrir vuelven los mismos dibujos", doc2.level.drawings.length === 3,
         String(doc2.level.drawings.length));
      ok("al reabrir vuelve el mismo timing", JSON.stringify(doc2.layer.cells) === antesCeldas);
      ok("al reabrir vuelve el contenido dibujado",
         doc2.level.byNumber(2).content.includes("M5 5"));
      ok("al reabrir vuelven fps, rango y nombre",
         doc2.scene.fps === 24 && doc2.scene.playRange().out === 12 && doc2.scene.name === "ciclo");
      ok("al reabrir queda en el frame donde estabas", doc2.frame === 9, String(doc2.frame));
      // y se puede seguir trabajando
      doc2.goTo(5);
      doc2.writeDrawing(doc2.drawing.content + "<path d='M7 7'/>");
      ok("se puede seguir dibujando sobre lo recuperado",
         doc2.level.byNumber(2).content.includes("M7 7"));
      ok("y sin crear dibujos de más", doc2.level.drawings.length === 3);
      doc2.goTo(20);
      ok("seleccionar una celda vacía la deja lista para dibujar", doc2.cell == null);
      doc2.writeDrawing("<path d='M20 20'/>");
      ok("el primer trazo en esa celda crea y expone el dibujo automáticamente",
        doc2.cell != null && doc2.drawing.content.includes("M20 20"));
    }

    // 11. Rangos rectangulares: copiar/cortar/pegar entre varias columnas.
    {
      const sc = new Scene();
      const la = sc.addLevel("A"), lb = sc.addLevel("B");
      const a = sc.addLayer(la.id, "A"), b = sc.addLayer(lb.id, "B");
      [1,2,3].forEach((n, i) => sc.expose(a.id, i + 1, n));
      [4,5,6].forEach((n, i) => sc.expose(b.id, i + 1, n));
      const doc = new animation.LowDoc(sc);
      const history = new LOW.core.HistoryManager(); doc.setHistory(history);
      const range = { fromLayerId: a.id, toLayerId: b.id, from: 1, to: 2 };
      const clip = doc.readCells(range);
      ok("copiar rectangulo conserva filas y columnas", clip.width === 2 && clip.height === 2);
      doc.clearCells(range, "Cortar rango");
      ok("cortar vacia las dos columnas", a.cellAt(1) == null && b.cellAt(2) == null);
      history.undo();
      ok("undo de cortar restaura el rectangulo completo", a.cellAt(1) === 1 && b.cellAt(2) === 5);
      doc.pasteCells(clip, a.id, 4);
      ok("pegar rectangulo conserva su geometria", a.cellAt(4) === 1 && b.cellAt(5) === 5);
      history.undo();
      ok("undo de pegar restaura todas las columnas", a.cellAt(4) == null && b.cellAt(5) == null);
    }

    // 12. Level Strip -> XSheet: importa material y permite insertar con undo.
    {
      const sc = new Scene();
      const source = sc.addLevel("Fuente"), target = sc.addLevel("Destino");
      const srcLayer = sc.addLayer(source.id, "Fuente"), dstLayer = sc.addLayer(target.id, "Destino");
      source.addDrawing(1, "<path id='uno'/>"); source.addDrawing(2, "<path id='dos'/>");
      target.addDrawing(1, "<path id='ocupado'/>");
      sc.expose(dstLayer.id, 1, 1);
      const doc = new animation.LowDoc(sc);
      const history = new LOW.core.HistoryManager(); doc.setHistory(history);
      doc.exposeDrawings(source.id, [1,2], dstLayer.id, 1, { insert: true });
      ok("drop insert desplaza contenido existente", dstLayer.cellAt(3) === 1);
      ok("drop remapea colision sin pisar dibujos", target.byNumber(1).content.includes("ocupado") && dstLayer.cellAt(1) !== 1);
      history.undo();
      ok("undo de drop restaura celdas y nivel", dstLayer.cellAt(1) === 1 && dstLayer.cellAt(2) == null && target.drawings.length === 1);
    }

    // 13. Gestion de capas y camara pertenecen al documento y tienen Undo.
    {
      const doc = new animation.LowDoc();
      const history = new LOW.core.HistoryManager(); doc.setHistory(history);
      const first = doc.layer;
      const secondForSelection = doc.addLayer("Seleccion"); history.clear();
      const selected = doc.selectCellRange(first.id, 2, secondForSelection.id, 6);
      ok("XSheet y Timeline comparten un rango canonico", selected.from === 2 && selected.to === 6 && selected.toLayerId === secondForSelection.id);
      doc.setLayerProperty(first.id, "locked", true, "Bloquear capa");
      ok("bloquear capa modifica el modelo canonico", first.locked === true);
      history.undo();
      ok("undo restaura propiedades de capa", first.locked === false);
      const added = doc.addLayer("Color");
      ok("agregar capa crea nivel y columna juntos", doc.scene.level(added.levelId) != null);
      history.undo();
      ok("undo de agregar capa quita nivel y columna", doc.scene.layer(added.id) == null && doc.scene.level(added.levelId) == null);
      history.redo();
      ok("redo recupera nivel y columna", doc.scene.layer(added.id) != null && doc.scene.level(added.levelId) != null);
      doc.scene.camera.keys[5] = { cx: 100, cy: 80, w: 640, rot: 2 };
      const reopened = animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
      ok("las claves de camara se guardan en la escena", reopened.scene.camera.keys[5].w === 640);
    }

    // 14. Rig canónico: claves, jerarquía, Undo, migración y reapertura.
    {
      const prepared = new animation.LowDoc();
      const preparedHistory = new LOW.core.HistoryManager(); prepared.setHistory(preparedHistory);
      prepared.ensureRigNodes([
        { id: "torso_auto", pivot: { x: 50, y: 50 }, pinned: true },
        { id: "brazo_auto", pivot: { x: 80, y: 45 }, parentId: "torso_auto" },
        { id: "mano_auto", pivot: { x: 120, y: 45 }, parentId: "torso_auto" },
      ]);
      ok("preparar dibujo registra todas las piezas en una operación",
        Object.keys(prepared.scene.rig.nodes).length === 3 && prepared.scene.rigNode("brazo_auto").parentId === "torso_auto");
      ok("cada pieza explicita su vínculo rígido con el arte",
        prepared.scene.rig.version === 4 && prepared.scene.rigNode("mano_auto").binding.mode === "rigid" &&
        prepared.scene.rigNode("mano_auto").binding.elementId === "mano_auto");
      preparedHistory.undo();
      ok("undo de preparar dibujo quita el rig completo", Object.keys(prepared.scene.rig.nodes).length === 0);
      preparedHistory.redo();
      ok("redo de preparar dibujo recupera jerarquía y pivotes",
        prepared.scene.rigNode("torso_auto").pinned && prepared.scene.rigNode("mano_auto").pivot.x === 120);

      const doc = new animation.LowDoc();
      const history = new LOW.core.HistoryManager(); doc.setHistory(history);
      doc.ensureRigNode("torso"); doc.ensureRigNode("brazo"); history.clear();
      doc.setRigParent("brazo", "torso");
      doc.setRigKey("brazo", 1, { x: 0, y: 0, r: 0, s: 1 });
      doc.setRigKey("brazo", 13, { x: 24, y: 10, r: 90, s: 1 });
      const mid = doc.scene.rigPose("brazo", 7);
      ok("rig interpola claves desde el modelo", mid.x === 12 && mid.r === 45, JSON.stringify(mid));
      history.undo();
      ok("undo borra la ultima clave de rig", !doc.scene.rigNode("brazo").keys[13]);
      history.redo();
      ok("redo recupera la clave de rig", doc.scene.rigNode("brazo").keys[13].r === 90);
      ok("rig impide ciclos de parenting", doc.setRigParent("torso", "brazo") === false);
      const reopened = animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
      ok("rig se conserva al guardar y reabrir", reopened.scene.rigNode("brazo").parentId === "torso" && reopened.scene.rigNode("brazo").keys[13].r === 90);
      const migrated = new animation.Scene({ rig: { mano: { 1: { x: 3, y: 4, r: 5, s: 1 } } } });
      ok("rig legacy migra a nodos canónicos", migrated.rigNode("mano").keys[1].x === 3);
      ok("rig legacy migra al esquema profesional v4", migrated.rig.version === 4 &&
        migrated.rig.setup.mode === "cutout" && migrated.rigNode("mano").binding.mode === "rigid");
      doc.setRigKey("torso", 1, { x: 10, y: 0, r: 90, s: 2 });
      doc.setRigKey("brazo", 1, { x: 5, y: 0, r: 15, s: 1 });
      const world = doc.scene.rigWorldPose("brazo", 1);
      ok("parenting propaga posición rotación y escala", Math.round(world.x) === 10 && Math.round(world.y) === 10 && world.r === 105 && world.sx === 2, JSON.stringify(world));
      doc.setRigPivot("brazo", { x: 12, y: 8 });
      ok("pivote pertenece al nodo canónico", doc.scene.rigNode("brazo").pivot.x === 12);
    }

    // 15. Cut-out completo: matriz jerárquica, IK, límites, Undo y persistencia.
    {
      const doc = new animation.LowDoc();
      const history = new LOW.core.HistoryManager(); doc.setHistory(history);
      doc.ensureRigNode("brazo", { pivot: { x: 0, y: 0 }, pinned: true });
      doc.ensureRigNode("antebrazo", { pivot: { x: 100, y: 0 } });
      doc.ensureRigNode("mano", { pivot: { x: 200, y: 0 } });
      doc.setRigParent("antebrazo", "brazo"); doc.setRigParent("mano", "antebrazo");
      doc.setRigKey("brazo", 1, { x: 0, y: 0, r: 90, s: 1 });
      const handAfterParent = doc.scene.rigWorldPoint("mano", 1, { x: 200, y: 0 });
      ok("la matriz jerárquica mueve la mano alrededor del hombro",
        Math.round(handAfterParent.x) === 0 && Math.round(handAfterParent.y) === 200,
        JSON.stringify(handAfterParent));
      const ik = doc.createRigIK("brazo", "antebrazo", "mano");
      ok("se crea IK sólo sobre una cadena válida", typeof ik === "string");
      const initialTarget = doc.scene.rigTargetAt(ik, 1);
      ok("crear IK conserva el extremo donde estaba, sin salto",
        Math.round(initialTarget.x) === 0 && Math.round(initialTarget.y) === 200,
        JSON.stringify(initialTarget));
      history.clear();
      doc.setRigIKTarget(ik, 5, { x: 100, y: 100 });
      const reached = doc.scene.rigWorldPoint("mano", 5, { x: 200, y: 0 });
      ok("IK de dos huesos alcanza el objetivo", Math.abs(reached.x - 100) < 0.01 && Math.abs(reached.y - 100) < 0.01,
        JSON.stringify(reached));
      ok("IK clava las dos rotaciones implicadas en una pose",
        !!doc.scene.rigNode("brazo").keys[5] && !!doc.scene.rigNode("antebrazo").keys[5]);
      ok("el objetivo IK queda animado por frame", doc.scene.rigTargetAt(ik, 5).y === 100);
      history.undo();
      ok("undo de IK restaura cadena y objetivo juntos",
        !doc.scene.rigNode("brazo").keys[5] && !doc.scene.rigConstraint(ik).targetKeys[5]);
      history.redo();
      doc.setRigKey("antebrazo", 7, { x: 10, y: 0, r: 0, sx: 1, sy: 1 });
      doc.setRigKey("mano", 7, { x: 5, y: 0, r: 0, sx: 1, sy: 1 });
      doc.setRigIKTarget(ik, 7, { x: 120, y: 120 });
      const reachedAfterFk = doc.scene.rigWorldPoint("mano", 7, { x: 200, y: 0 });
      ok("pasar de FK trasladado a IK no hace saltar la cadena",
        Math.abs(reachedAfterFk.x - 120) < 0.01 && Math.abs(reachedAfterFk.y - 120) < 0.01,
        JSON.stringify(reachedAfterFk));
      doc.setRigLimits("antebrazo", -20, 45);
      doc.setRigIKTarget(ik, 9, { x: 20, y: 120 });
      ok("los límites angulares restringen el solver IK",
        doc.scene.rigNode("antebrazo").keys[9].r <= 45.001);
      const reopened = animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
      ok("cadena, límites, claves y objetivo IK sobreviven guardar/reabrir",
        reopened.scene.rigConstraint(ik).targetKeys[9].y === 120 &&
        reopened.scene.rigNode("antebrazo").limits.max === 45);
      doc.removeRigNode("antebrazo");
      ok("quitar una pieza limpia constraints rotos y libera hijos",
        !doc.scene.rigConstraint(ik) && doc.scene.rigNode("mano").parentId == null);
    }

    // 16. Rig v4: huesos/arte separados, canales, orden y ciclos.
    {
      const legacy = new animation.Scene({ rig: { version: 3, nodes: {
        torso: { elementId: "svg_torso", pivot: { x: 40, y: 50 },
          keys: { 1: { x: 0, y: 0, r: 0, sx: 1, sy: 1 }, 11: { x: 20, y: 0, r: 10, sx: 1, sy: 1 } } }
      } } });
      const migratedSlot = legacy.rigSlot("slot:torso");
      const migratedAttachment = legacy.rigActiveAttachment("slot:torso");
      ok("v3 migra separando hueso, slot y attachment",
        legacy.rig.version === 4 && legacy.rigBone("torso") === legacy.rig.nodes.torso &&
        migratedSlot.boneId === "torso" && migratedAttachment.elementId === "svg_torso");
      ok("v3 migra el binding rígido fuera del hueso",
        legacy.rig.bindings["binding:torso"].attachmentId === "attachment:torso");
      ok("las claves v3 migran a canales por propiedad",
        legacy.rigChannelValue(animation.rigChannelPath("torso", "x"), 6) === 10);
      const serializedRig = legacy.toJSON().rig;
      ok("el JSON v4 guarda bones sin duplicar el adaptador nodes",
        !!serializedRig.bones.torso && serializedRig.nodes == null);

      const skeleton = new animation.LowDoc();
      const skeletonHistory = new LOW.core.HistoryManager(); skeleton.setHistory(skeletonHistory);
      skeleton.ensureRigBone("root", { name: "Raíz", head: { x: 10, y: 20 }, tail: { x: 80, y: 20 } });
      ok("un hueso puede existir sin pieza de arte ni slot",
        skeleton.scene.rigBone("root").elementId == null && Object.keys(skeleton.scene.rig.slots).length === 0);
      skeletonHistory.clear();
      skeleton.setRigBoneGeometry("root", { x: 20, y: 30 }, { x: 100, y: 30 });
      ok("la geometría del hueso se edita en Armado",
        skeleton.scene.rigBone("root").head.x === 20 && skeleton.scene.rigBone("root").tail.x === 100);
      skeletonHistory.undo();
      ok("undo restaura cabeza y punta del hueso juntas",
        skeleton.scene.rigBone("root").head.x === 10 && skeleton.scene.rigBone("root").tail.x === 80);
      const skeletonSlot = skeleton.ensureRigSlot("root", { id: "body-slot" });
      const skeletonAttachment = skeleton.addRigAttachment(skeletonSlot,
        { id: "body-front", elementId: "svg_body_front" });
      const skeletonBinding = skeleton.setRigBinding({ boneId: "root", slotId: skeletonSlot,
        attachmentId: skeletonAttachment, mode: "rigid" });
      ok("arte y binding se agregan después del esqueleto",
        skeleton.scene.rig.bindings[skeletonBinding].elementId === "svg_body_front" &&
        skeleton.scene.rigBone("root").elementId == null);
      const reopenedSkeleton = animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(skeleton.toJSON())));
      ok("un esqueleto puro sigue separado al guardar y reabrir",
        reopenedSkeleton.scene.rigBone("root").elementId == null &&
        reopenedSkeleton.scene.rigActiveAttachment("body-slot").elementId === "svg_body_front");

      skeleton.ensureRigBone("mano", { head: { x: 100, y: 30 }, tail: { x: 140, y: 30 } });
      skeleton.bindRigElement("mano", "mano_boceto");
      skeleton.bindRigElement("mano", "mano_final");
      ok("revincular una pieza actualiza hueso, binding y attachment juntos",
        skeleton.scene.rigBone("mano").elementId === "mano_final" &&
        skeleton.scene.rig.bindings["binding:mano"].elementId === "mano_final" &&
        skeleton.scene.rig.attachments["attachment:mano"].elementId === "mano_final");

      skeleton.ensureRigBone("mano_otra", { head: { x: 140, y: 30 }, tail: { x: 170, y: 30 } });
      skeleton.bindRigElement("mano_otra", "mano_final");
      ok("una pieza revinculada tiene un solo hueso dueño",
        !skeleton.scene.rigBone("mano").elementId &&
        skeleton.scene.rigBone("mano_otra").elementId === "mano_final" &&
        !skeleton.scene.rig.bindings["binding:mano"] &&
        animation.rigDiagnostics(skeleton.scene.rig).valid);
      skeleton.unbindRigElement("mano_otra");
      ok("soltar una pieza conserva el hueso y elimina sólo su vínculo",
        !!skeleton.scene.rigBone("mano_otra") &&
        !skeleton.scene.rigBone("mano_otra").elementId &&
        !skeleton.scene.rig.bindings["binding:mano_otra"]);

      const bindingCore = animation.rigBinding;
      const isolatedRig = { bones: { a: { id: "a" }, b: { id: "b" } }, slots: {}, attachments: {}, bindings: {} };
      bindingCore.bindElement(isolatedRig, "a", "pieza", "rigid");
      bindingCore.bindElement(isolatedRig, "b", "pieza", "rigid");
      ok("motor de binding transfiere una pieza sin duplicar propietarios",
        !isolatedRig.bones.a.elementId && isolatedRig.bones.b.elementId === "pieza" &&
        !isolatedRig.bindings["binding:a"] && isolatedRig.bindings["binding:b"].elementId === "pieza");
      ok("motor de binding suelta arte sin borrar hueso ni slot",
        bindingCore.unbindElement(isolatedRig, "b") === true && isolatedRig.bones.b &&
        isolatedRig.slots["slot:b"] && !isolatedRig.bindings["binding:b"]);

      const invalidOwners = animation.rigData({ bones: {
        a: { elementId: "arte_compartido" }, b: { elementId: "arte_compartido" }
      }});
      ok("el diagnóstico bloquea dos huesos dueños de una misma pieza",
        !animation.rigDiagnostics(invalidOwners).valid &&
        animation.rigDiagnostics(invalidOwners).errors.some(e => e.code === "duplicate-art-binding"));

      const legacyDuplicate = new animation.LowDoc();
      legacyDuplicate.ensureRigNode("dueño", { elementId: "pieza_repetida" });
      legacyDuplicate.ensureRigNode("duplicado", { elementId: "pieza_repetida" });
      const repairedDuplicate = animation.LowDoc.fromJSON(legacyDuplicate.toJSON());
      ok("abrir un proyecto viejo repara dueños duplicados sin borrar huesos",
        repairedDuplicate.rigRepairCount > 0 && repairedDuplicate.dirty &&
        repairedDuplicate.scene.rigBone("dueño") && repairedDuplicate.scene.rigBone("duplicado") &&
        animation.rigDiagnostics(repairedDuplicate.scene.rig).valid);

      // Rig rígido mínimo: torso → brazo → antebrazo → mano. La geometría
      // vinculada se evalúa con la matriz mundial del hueso y hereda padres.
      const skin = new animation.LowDoc(), skinHistory = new LOW.core.HistoryManager();
      skin.setHistory(skinHistory);
      skin.ensureRigBone("torso", { head:{x:0,y:0}, tail:{x:0,y:20} });
      skin.ensureRigBone("brazo", { parentId:"torso", head:{x:0,y:0}, tail:{x:10,y:0} });
      skin.ensureRigBone("antebrazo", { parentId:"brazo", head:{x:10,y:0}, tail:{x:20,y:0} });
      skin.ensureRigBone("mano", { parentId:"antebrazo", head:{x:20,y:0}, tail:{x:30,y:0} });
      ["torso","brazo","antebrazo","mano"].forEach(id => skin.bindRigElement(id, "forma_" + id));
      skinHistory.clear();
      skin.setRigKey("antebrazo", 1, { x:0, y:0, r:45, sx:1, sy:1 });
      const handPoint = skin.scene.rigWorldPoint("mano", 1, { x:30, y:0 });
      const torsoPoint = skin.scene.rigWorldPoint("torso", 1, { x:0, y:20 });
      ok("rotar el codo arrastra antebrazo y mano vinculados",
        Math.abs(handPoint.x - (10 + 20 / Math.sqrt(2))) < .001 &&
        Math.abs(handPoint.y - (20 / Math.sqrt(2))) < .001);
      ok("rotar el codo deja estable el torso",
        Math.abs(torsoPoint.x) < .001 && Math.abs(torsoPoint.y - 20) < .001);
      skinHistory.undo();
      const restoredHand = skin.scene.rigWorldPoint("mano", 1, { x:30, y:0 });
      ok("undo devuelve exactamente la mano a la pose de vínculo",
        Math.abs(restoredHand.x - 30) < .001 && Math.abs(restoredHand.y) < .001);

      const doc = new animation.LowDoc();
      const history = new LOW.core.HistoryManager(); doc.setHistory(history);
      doc.ensureRigNode("cabeza", { elementId: "frente" });
      const slotId = "slot:cabeza";
      const profileId = doc.addRigAttachment(slotId, { id: "cabeza_perfil", elementId: "perfil" });
      history.clear();
      doc.setRigActiveAttachment(slotId, profileId);
      ok("un slot cambia de sustitución sin tocar el hueso",
        doc.scene.rigActiveAttachment(slotId).elementId === "perfil" && doc.scene.rigBone("cabeza").elementId === "frente");
      history.undo();
      ok("undo restaura la sustitución activa",
        doc.scene.rigActiveAttachment(slotId).elementId === "frente");
      history.redo();

      doc.ensureRigNode("mano", { elementId: "mano" });
      const orderedSlots = ["slot:mano", "slot:cabeza"];
      history.clear(); doc.setRigSlotOrder(orderedSlots);
      ok("el orden visual vive en slots, no en huesos",
        doc.scene.rigSlot("slot:mano").drawOrder === 0 && doc.scene.rigSlot("slot:cabeza").drawOrder === 1);
      history.undo();
      ok("undo restaura el orden visual completo", doc.scene.rigSlot("slot:cabeza").drawOrder === 0);

      const xPath = animation.rigChannelPath("cabeza", "x");
      history.clear();
      doc.setRigChannelKey(xPath, 1, 0); doc.setRigChannelKey(xPath, 11, 20);
      ok("los canales por propiedad interpolan y alimentan la pose",
        doc.scene.rigChannelValue(xPath, 6) === 10 && doc.scene.rigPose("cabeza", 6).x === 10);
      history.undo();
      ok("undo de canal restaura clave y pose juntas",
        doc.scene.rigChannel(xPath).keys[11] == null && doc.scene.rigNode("cabeza").keys[11] == null);
      history.redo();
      const segment = animation.rigChannelSegment(doc.scene.rigChannel(xPath), 6);
      ok("timeline y editor de funciones comparten el mismo tramo",
        segment && segment.a === 1 && segment.b === 11 && segment.frame === 6 &&
        segment.valueA === 0 && segment.valueB === 20);

      history.clear();
      doc.setRigChannelEase(xPath, 1, { eo: [.18, .72], ei: [.65, .91] });
      doc.setRigPoseKeys({ cabeza: { x: 4, y: 6, r: 8, sx: 1, sy: 1 } }, 1);
      ok("editar una pose conserva la curva particular de X",
        Math.abs(doc.scene.rigChannel(xPath).ease[1].eo[0] - .18) < .001 &&
        doc.scene.rigChannel(animation.rigChannelPath("cabeza", "y")).ease[1] == null);
      const copiedCurve = animation.rigCurveClipboardData(doc.scene.rigChannel(xPath), 1, 11);
      const yPath = animation.rigChannelPath("cabeza", "y");
      history.clear();
      doc.pasteRigChannelCurve(yPath, 1, 11, { ...copiedCurve, interpolation: "bezier" });
      ok("copiar y pegar curva cambia el timing sin copiar valores",
        doc.scene.rigChannel(yPath).interpolation === "bezier" &&
        doc.scene.rigChannel(yPath).keys[1] === 6 &&
        Math.abs(doc.scene.rigChannel(yPath).ease[1].eo[0] - .18) < .001);
      history.undo();
      ok("deshacer pegado de curva restaura el canal completo",
        doc.scene.rigChannel(yPath).interpolation === "linear" &&
        doc.scene.rigChannel(yPath).ease[1] == null);

      history.clear();
      ok("se agrega una constraint ordenada",
        doc.upsertRigConstraint({ id: "follow", type: "transform", writes: ["cabeza"] }) === "follow");
      ok("una segunda constraint conserva orden estable",
        doc.upsertRigConstraint({ id: "hand", type: "transform", reads: ["cabeza"], writes: ["mano"] }) === "hand" &&
        doc.scene.rigOrderedConstraints().map((c) => c.id).join(",") === "follow,hand");
      ok("se rechaza una dependencia circular sin ensuciar el rig",
        doc.upsertRigConstraint({ id: "follow", type: "transform", reads: ["mano"], writes: ["cabeza"] }) === false &&
        doc.scene.rigConstraint("follow").reads.length === 0 && doc.scene.validateRig().valid);
      doc.setRigConstraintOrder(["hand", "follow"]);
      ok("las dependencias prevalecen sobre un orden manual inválido",
        doc.scene.rig.constraintOrder.join(",") === "hand,follow" &&
        doc.scene.rigOrderedConstraints().map((c) => c.id).join(",") === "follow,hand");
      history.undo();
      ok("undo restaura la preferencia de orden", doc.scene.rig.constraintOrder[0] === "follow");

      const reopened = animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
      ok("slots, attachments, canales y orden sobreviven guardar/reabrir",
        reopened.scene.rig.version === 4 && reopened.scene.rigActiveAttachment(slotId).elementId === "perfil" &&
        reopened.scene.rigChannelValue(xPath, 1) === 4 && reopened.scene.rigOrderedConstraints()[0].id === "follow");
      const broken = new animation.Scene({ rig: { version: 4,
        bones: { root: { id: "root" } },
        slots: { bad: { id: "bad", boneId: "missing", activeAttachmentId: "also-missing" } } } });
      ok("el diagnóstico detecta referencias rotas antes de exportar",
        broken.validateRig().valid === false && broken.validateRig().errors.length === 2);
    }

    // 17. El transporte visible controla el reproductor del documento único.
    {
      ok("reproductor canonico disponible", typeof animation.Playback === "function");
      if (animation.Playback) {
        const doc = new animation.LowDoc();
        doc.scene.range = { in: 1, out: 3 };
        const playback = new animation.Playback(doc);
        let cambios = 0; playback.subscribe(() => { cambios++; });
        playback.toggle();
        ok("play inicia el reloj canonico", playback.playing === true && cambios === 1);
        playback.toggle();
        ok("segundo play pausa y limpia el reloj", playback.playing === false && playback.raf === 0 && cambios === 2);
      }
    }

    // 18. La mesa tiene una resolución canónica independiente de la ventana.
    {
      const doc = new animation.LowDoc();
      const history = new LOW.core.HistoryManager(); doc.setHistory(history);
      ok("la resolución inicial de LOW es Full HD 1920×1080",
        doc.scene.width === 1920 && doc.scene.height === 1080,
        `${doc.scene.width}×${doc.scene.height}`);
      doc.setSize(1280, 720);
      ok("un formato de pantalla cambia el documento canónico",
        doc.scene.width === 1280 && doc.scene.height === 720);
      history.undo();
      ok("undo restaura juntas las dos dimensiones",
        doc.scene.width === 1920 && doc.scene.height === 1080,
        `${doc.scene.width}×${doc.scene.height}`);
      history.redo();
      const reopened = animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
      ok("la resolución definida se conserva al guardar y reabrir",
        reopened.scene.width === 1280 && reopened.scene.height === 720,
        `${reopened.scene.width}×${reopened.scene.height}`);
    }

    // 19. Paletas y estilos: el color es material canónico y sobrevive a guardar/reabrir.
    {
      const sc = new Scene();
      const lv = sc.addLevel("Personaje");
      const pal = sc.addPalette("Piel");
      sc.setLevelPalette(lv.id, pal.id);
      ok("el nivel queda vinculado a su paleta", sc.levelPalette(lv.id) === pal);

      const piel = pal.addStyle("Piel", "#f5c5a3", 1);
      const linea = pal.addStyle("Línea", "#1a1a1a", 0.9);
      ok("crear dos estilos los registra en la paleta", pal.styles.length === 2);
      ok("el estilo normaliza el color hex a minúsculas", piel.color === "#f5c5a3");
      ok("un estilo con nombre repetido no se duplica",
        pal.addStyle("Piel", "#ffffff") === piel && pal.styles.length === 2);

      linea.setColor("#000000").setOpacity(1);
      ok("cambiar color y opacidad muta el MISMO estilo",
        linea.color === "#000000" && linea.opacity === 1);

      pal.locked = true;
      ok("una paleta bloqueada no deja borrar estilos",
        pal.removeStyle(piel.id) === null && pal.styles.length === 2);
      pal.locked = false;

      const roundtrip = new Scene(JSON.parse(JSON.stringify(sc.toJSON())));
      ok("paleta y estilos se conservan al guardar/reabrir",
        roundtrip.palettes.length === 1 &&
        roundtrip.palette(sc.palettes[0].id).styles.length === 2);
      ok("el vínculo nivel→paleta sobrevive",
        roundtrip.levelPalette(roundtrip.levels[0].id)?.id === pal.id);

      sc.setLevelPalette(lv.id, null);
      ok("desvincular no borra la paleta",
        sc.palette(pal.id) !== null && sc.levelPalette(lv.id) === null);
      sc.setLevelPalette(lv.id, "no-existe");
      ok("vincular a una paleta inexistente se rechaza", sc.levelPalette(lv.id) === null);
    }

    // 20. El trazo referencia al estilo por NUMERO: cambiar el estilo recolorea
    //     todos los dibujos, y el dibujo no se reescribe.
    {
      const { LowDoc, palette: P } = animation;
      const doc = new LowDoc();
      const pal = doc.palette;
      ok("el nivel arranca con paleta y sin pedirla", !!pal && pal.styles.length === 5,
        pal ? String(pal.styles.length) : "sin paleta");
      ok("los estilos tienen numero, que es lo que se escribe en el dibujo",
        JSON.stringify(pal.indices()) === "[1,2,3,4,5]", JSON.stringify(pal.indices()));

      doc.goTo(1); doc.writeDrawing('<path d="M0 0" stroke="#1a1a1a" data-stk="1"/>');
      doc.goTo(2); doc.writeDrawing('<path d="M9 9" stroke="#1a1a1a" data-stk="1"/>' +
                                    '<path d="M1 1" fill="#ffffff" data-fil="3"/>');
      const uso = P.usage(doc.scene, pal);
      ok("la paleta sabe cuantos elementos usan cada estilo",
        uso[1] && uso[1].ink === 2 && uso[3] && uso[3].paint === 1, JSON.stringify(uso));

      const contenidoAntes = doc.level.byNumber(2).content;
      doc.setStyleColor(1, "#00aa55");
      ok("cambiar el estilo NO reescribe los dibujos",
        doc.level.byNumber(2).content === contenidoAntes);
      const hoja = P.css(pal);
      ok("el color nuevo lo resuelve la paleta, en un solo lugar",
        hoja.includes('[data-stk="1"]{stroke:#00aa55'));
      ok("y el color viejo ya no gobierna nada", !hoja.includes("#1a1a1a"));

      ok("un estilo usado no se puede borrar", doc.removeStyle(3) === false);
      ok("rechazar el borrado deja dibujo y paleta intactos",
        doc.level.byNumber(2).content === contenidoAntes && !!pal.byIndex(3));
      ok("la integridad referencial impide estilos sueltos",
        JSON.stringify(P.orphans(doc.scene, pal)) === "[]",
        JSON.stringify(P.orphans(doc.scene, pal)));

      const nuevo = doc.addStyle("#112233", "Contorno").index;
      const movidos = doc.reassignStyle(1, nuevo);
      ok("reasignar mueve todas las referencias", movidos === 2, String(movidos));
      ok("y ahora el estilo nuevo es el que las tiene",
        (P.usage(doc.scene, pal)[nuevo] || {}).ink === 2);
      ok("el estilo viejo se quedo sin uso", !P.usage(doc.scene, pal)[1]);

      if (LOW.core && LOW.core.HistoryManager) {
        const h = new LOW.core.HistoryManager();
        doc.setHistory(h);
        doc.setStyleColor(2, "#ff0000");
        h.undo();
        ok("Ctrl+Z devuelve el color anterior del estilo", pal.byIndex(2).color === "#f0450e",
          pal.byIndex(2).color);
        doc.setStyleOpacity(2, .35);
        ok("la opacidad del estilo entra en la hoja global", P.css(pal).includes("opacity:0.35"));
        h.undo();
        ok("Ctrl+Z devuelve la opacidad anterior del estilo", pal.byIndex(2).opacity === 1,
          String(pal.byIndex(2).opacity));
        doc.setStyleGroup(2,"Personaje");
        ok("un estilo puede organizarse en un grupo persistente", pal.byIndex(2).meta.group === "Personaje");
        h.undo();
        ok("Ctrl+Z devuelve la organización anterior", !pal.byIndex(2).meta.group);
      }

      // ── STYLE-02: reasignar + borrar es UNA operación reversible ──
      if (LOW.core && LOW.core.HistoryManager) {
        const h2 = new LOW.core.HistoryManager();
        doc.setHistory(h2);
        const sobrante = doc.addStyle("#445566", "Sobrante").index;
        const destino = doc.addStyle("#778899", "Destino").index;
        const dw = doc.level.byNumber(2);
        dw.content = `<path data-stk="${sobrante}" d="M0 0 L9 9"/>` + dw.content;
        const pasos = h2.undoStack.length;
        const r = doc.replaceStyle(sobrante, destino);
        ok("reasignar y borrar mueve los usos y saca el estilo",
          r.reasignados === 1 && r.borrado === true && !pal.byIndex(sobrante),
          JSON.stringify(r));
        ok("y lo hace en UN solo paso de historial", h2.undoStack.length - pasos === 1,
          String(h2.undoStack.length - pasos));
        ok("sin dejar referencias huérfanas",
          JSON.stringify(P.orphans(doc.scene, pal)) === "[]",
          JSON.stringify(P.orphans(doc.scene, pal)));
        h2.undo();
        ok("un Ctrl+Z devuelve el estilo Y sus usos, no la mitad",
          !!pal.byIndex(sobrante) && (P.usage(doc.scene, pal)[sobrante] || {}).ink === 1,
          JSON.stringify(P.usage(doc.scene, pal)[sobrante] || null));
        ok("y tampoco deja huérfanos al deshacer",
          JSON.stringify(P.orphans(doc.scene, pal)) === "[]",
          JSON.stringify(P.orphans(doc.scene, pal)));
        h2.redo();
        ok("y rehacer vuelve a dejarlo reasignado y borrado",
          !pal.byIndex(sobrante) && JSON.stringify(P.orphans(doc.scene, pal)) === "[]");
        doc.replaceStyle(destino, destino);
        ok("reasignar un estilo sobre sí mismo no hace nada", !!pal.byIndex(destino));
      }

      const doc2 = LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
      ok("al reabrir vuelve la paleta con sus numeros y colores",
        doc2.palette.byIndex(1).color === "#00aa55" && doc2.palette.byIndex(3).color === "#ffffff",
        doc2.palette.styles.map((s) => s.index + ":" + s.color).join(" "));

      const hsvRojo = P.hexToHsv("#ff0000");
      ok("Color Studio convierte HEX a HSV sin deriva",
        hsvRojo.h === 0 && hsvRojo.s === 100 && hsvRojo.v === 100, JSON.stringify(hsvRojo));
      ok("Color Studio convierte HSV a HEX sin deriva", P.hsvToHex(210, 67, 60) === "#326699",
        P.hsvToHex(210, 67, 60));
      const armonia = P.harmonies("#ff0000");
      ok("la armonía entrega base, análogos, complemento y tríada",
        armonia.length === 6 && armonia[3].color === "#00ffff", JSON.stringify(armonia));
      const acoBuffer = new ArrayBuffer(14), aco = new DataView(acoBuffer);
      aco.setUint16(0,1);aco.setUint16(2,1);aco.setUint16(4,0);aco.setUint16(6,65535);aco.setUint16(8,0);aco.setUint16(10,32896);aco.setUint16(12,0);
      ok("importa una muestra Adobe ACO RGB", P.parseACO(acoBuffer)[0]?.color === "#ff0080",
        JSON.stringify(P.parseACO(acoBuffer)));
      const aseBuffer = new ArrayBuffer(46), ase = new DataView(aseBuffer), sig = new Uint8Array(aseBuffer);
      "ASEF".split("").forEach((c,i)=>sig[i]=c.charCodeAt(0));ase.setUint16(4,1);ase.setUint16(6,0);ase.setUint32(8,1);ase.setUint16(12,1);ase.setUint32(14,28);ase.setUint16(18,4);
      "Sky".split("").forEach((c,i)=>ase.setUint16(20+i*2,c.charCodeAt(0)));["R","G","B"," "].forEach((c,i)=>sig[28+i]=c.charCodeAt(0));ase.setFloat32(32,.2);ase.setFloat32(36,.4);ase.setFloat32(40,.8);ase.setUint16(44,0);
      const parsedAse=P.parseASE(aseBuffer);
      ok("importa nombres y color desde Adobe ASE", parsedAse[0]?.name === "Sky" && parsedAse[0]?.color === "#3366cc", JSON.stringify(parsedAse));
      const gpl=P.exportGPL(pal), parsedGpl=P.parseGPL(gpl);
      ok("exportar e importar GPL conserva los colores compatibles", parsedGpl.length === pal.styles.length && parsedGpl[0].color === pal.styles[0].color);
    }

    // 21. ADOPTAR: lo dibujado antes de que la paleta gobernara entra a la paleta.
    {
      const { LowDoc, palette: P } = animation;
      const doc = new LowDoc();
      doc.goTo(1);
      doc.writeDrawing('<path d="M0 0" stroke="#f0450e" fill="none"/>' +
                       '<path d="M1 1" stroke="#f0450e" fill="none"/>' +
                       '<path d="M2 2" fill="#123456" stroke="none"/>');
      const pal = doc.palette;
      const estilosAntes = pal.styles.length;
      const r = doc.adoptColors();
      ok("adoptar alcanza a los tres elementos con color", r.elementos === 3, JSON.stringify(r));
      ok("el naranja ya estaba en la paleta: no se duplica",
        pal.styles.length === estilosAntes + 1, `${estilosAntes} -> ${pal.styles.length}`);
      const c = doc.level.byNumber(1).content;
      ok("los trazos quedaron referenciando su estilo",
        (c.match(/data-stk="2"/g) || []).length === 2, c);
      ok("y el color literal sigue ahi como respaldo", c.includes('stroke="#f0450e"'));
      ok('fill="none" no inventa un estilo: solo un elemento tenia relleno de verdad',
        (c.match(/data-fil="/g) || []).length === 1,
        String((c.match(/data-fil="/g) || []).length));
      doc.setStyleColor(2, "#0000ff");
      ok("ahora el dibujo viejo se recolorea desde la paleta",
        P.css(pal).includes('[data-stk="2"]{stroke:#0000ff'));
      const antes = doc.level.byNumber(1).content;
      doc.adoptColors();
      ok("adoptar de nuevo no agrega referencias repetidas",
        doc.level.byNumber(1).content === antes);
    }

    // 22. Regresiones nacidas de fallos reales de producción: guardar significa
    //     reconstruir TODO el proyecto, no sólo la planilla visible.
    {
      const { LowDoc } = animation;
      const doc = new LowDoc();
      const lv2 = doc.scene.addLevel("Fondos");
      const ly2 = doc.scene.addLayer(lv2.id, "Fondo ciudad");
      lv2.addDrawing(1, '<path id="edificios" data-fil="3"/>');
      doc.scene.expose(ly2.id, 1, 1);
      doc.scene.camera.keys[8] = { cx: 410, cy: 220, w: 720, rot: 3 };
      doc.onionCfg = { before: 2, after: 1, alpha: .4 };
      doc.setStyleColor(3, "#d4b38a");
      const reopened = LowDoc.fromJSON(JSON.stringify(doc.toJSON()));
      ok("Ctrl+S lógico conserva todos los levels y dibujos",
        reopened.scene.levels.length === 2 && reopened.scene.level(lv2.id).byNumber(1).content.includes("edificios"));
      ok("Ctrl+S lógico conserva exposiciones y cámara",
        reopened.scene.layer(ly2.id).cellAt(1) === 1 && reopened.scene.camera.keys[8].w === 720);
      ok("Ctrl+S lógico conserva paleta y papel cebolla",
        reopened.palette.byIndex(3).color === "#d4b38a" && reopened.onionCfg.before === 2);
      ok("un archivo reabierto queda limpio", reopened.dirty === false);
    }

    // 23. Undo se explica: la interfaz puede decir exactamente qué deshace y
    //     qué rehace, en vez de dejar Ctrl+Z como una caja negra.
    {
      const h = new LOW.core.HistoryManager();
      const estados = []; h.onChange = (s) => estados.push(s);
      let valor = 2;
      h.push({ label: "Mover celdas", before: 1, after: 2, apply: (_dir, v) => { valor = v; } });
      h.undo();
      ok("History anuncia la próxima acción de redo",
        valor === 1 && estados.at(-1).redoLabel === "Mover celdas", JSON.stringify(estados.at(-1)));
      h.redo();
      ok("History anuncia la próxima acción de undo",
        valor === 2 && estados.at(-1).undoLabel === "Mover celdas", JSON.stringify(estados.at(-1)));
    }

    // 24. Recovery es producto, no filesystem: identifica documento, contenido,
    //     metadata y permite descartar la copia sin tocar el original.
    {
      const memoria = new Map();
      const storage = { setItem:(k,v)=>memoria.set(k,v), getItem:k=>memoria.get(k) || null,
        removeItem:k=>memoria.delete(k) };
      const recovery = new LOW.workspace.DocumentRecovery(storage);
      ok("recovery guarda inmediatamente un checkpoint válido",
        recovery.saveNow("plano_03.lowscene", "contenido nuevo", { command:"Brush Stroke" }) === true);
      const found = recovery.get("plano_03.lowscene");
      ok("recovery explica de qué documento y operación viene",
        found.path === "plano_03.lowscene" && found.content === "contenido nuevo" && found.metadata.command === "Brush Stroke");
      recovery.clear("plano_03.lowscene");
      ok("descartar recovery no deja una restauración fantasma", recovery.get("plano_03.lowscene") === null);
    }

    // 25. Room/Workspace jamás forma parte del documento: resetear la interfaz
    //     no puede cambiar frame, selección, onion, dibujos ni historial.
    {
      const memoria = new Map();
      const storage = { setItem:(k,v)=>memoria.set(k,v), getItem:k=>memoria.get(k) || null,
        removeItem:k=>memoria.delete(k) };
      const ws = new LOW.workspace.Workspaces(storage);
      const doc = new animation.LowDoc(); doc.goTo(7); doc.writeDrawing('<path id="pose"/>');
      doc.onionCfg = { before:1, after:1 }; const before = JSON.stringify(doc.toJSON());
      ws.save("animation", [{ id:"canvas", dock:"right" }], "Animación rota");
      ws.reset("animation");
      ok("Reset Current Room recupera el preset", ws.get("animation").panels.some((p) => p.id === "xsheet"));
      ok("resetear Room no modifica el documento", JSON.stringify(doc.toJSON()).replace(/\"savedAt\":\"[^\"]+\"/, '"savedAt":"x"') ===
        before.replace(/\"savedAt\":\"[^\"]+\"/, '"savedAt":"x"'));
    }

    // 26. Registrar objetos no debe dejar el "doble esqueleto" histórico:
    // se limpian pivotes automáticos, pero jamás huesos ni animación real.
    {
      const doc = new animation.LowDoc();
      doc.ensureRigNodes([
        { id:"pieza_suelta", elementId:"pieza_suelta", pivot:{x:10,y:20} },
        { id:"pieza_animada", elementId:"pieza_animada", pivot:{x:5,y:5} }
      ]);
      doc.setRigKey("pieza_animada", 1, { x:0, y:0, r:0, sx:1, sy:1 });
      doc.ensureRigBone("hueso_real", { head:{x:0,y:0}, tail:{x:0,y:50}, elementId:"brazo" });
      const removed = doc.removeLegacyRigArtNodes(["pieza_suelta", "pieza_animada", "brazo"]);
      ok("la migración quita sólo el pivote automático aislado",
        removed.length === 1 && removed[0] === "pieza_suelta" && !doc.scene.rigNode("pieza_suelta"));
      ok("la migración conserva nodos animados y huesos reales",
        !!doc.scene.rigNode("pieza_animada") && !!doc.scene.rigNode("hueso_real"));
    }

    // 27. El giro de selección envuelve la matriz existente. Una escala previa
    // no puede convertir la rotación en deformación ni mover el centro.
    {
      const T = LOW.drawing.transforms;
      const base = { a:2, b:0, c:0, d:.5, e:30, f:40 };
      const center = T.point(base, { x:10, y:20 });
      const rotated = T.rigidRotate(base, 90, center);
      const fixed = T.point(rotated, { x:10, y:20 });
      const edge = T.point(rotated, { x:15, y:20 });
      ok("girar conserva exactamente el centro visual",
        Math.abs(fixed.x-center.x)<1e-8 && Math.abs(fixed.y-center.y)<1e-8,
        JSON.stringify({center,fixed}));
      ok("girar una forma escalada sigue el sentido del controlador sin deformarla",
        Math.abs(edge.x-center.x)<1e-8 && Math.abs(edge.y-(center.y+10))<1e-8,
        JSON.stringify({center,edge}));
      const clockwise=T.screenRotationDelta({x:100,y:50},{x:150,y:100},{x:100,y:100},{a:1,b:0,c:0,d:1,e:0,f:0});
      const mirrored=T.screenRotationDelta({x:100,y:50},{x:150,y:100},{x:100,y:100},{a:-1,b:0,c:0,d:1,e:0,f:0});
      ok("la rotación sigue el gesto visible en pantalla", Math.abs(clockwise-90)<.001, `giro=${clockwise}`);
      ok("un contenedor reflejado no invierte la manija", Math.abs(mirrored+90)<.001, `giro=${mirrored}`);
      const translated=T.rigidTranslate(rotated,{x:25,y:-12},T.identity());
      const movedCenter=T.point(translated,{x:10,y:20});
      ok("mover después de girar sigue la mano y no los ejes rotados",
        Math.abs(movedCenter.x-(center.x+25))<1e-8 && Math.abs(movedCenter.y-(center.y-12))<1e-8,
        JSON.stringify({center,movedCenter}));
      const anchor={x:42,y:75};
      const scaled=T.rigidScale(rotated,1.5,.75,anchor);
      const fixedAnchor=T.point(scaled,T.point({a:rotated.d,b:-rotated.b,c:-rotated.c,d:rotated.a,e:0,f:0},anchor));
      // La propiedad realmente importante se prueba sin depender de la inversa:
      // el punto que ya estaba en el ancla del padre permanece exactamente ahí.
      const localAnchor={x:(anchor.x-rotated.e)*rotated.d-(anchor.y-rotated.f)*rotated.c,
        y:-(anchor.x-rotated.e)*rotated.b+(anchor.y-rotated.f)*rotated.a};
      const det=rotated.a*rotated.d-rotated.b*rotated.c;
      localAnchor.x/=det; localAnchor.y/=det;
      const afterScale=T.point(scaled,localAnchor);
      ok("escalar una matriz previa conserva el ancla del cuadro delimitador",
        Math.abs(afterScale.x-anchor.x)<1e-8&&Math.abs(afterScale.y-anchor.y)<1e-8,
        JSON.stringify({anchor,afterScale,fixedAnchor}));
    }

    // 28. Las plantillas crean el mismo rig canónico que el alambre manual.
    {
      const lib=animation.rigLibrary, keys=Object.keys(lib.templates);
      ok("la biblioteca incluye humanos, perro, gato y caballo",
        keys.length>=6 && ["human_standard","human_simple","human_chibi","dog","cat","horse"].every(k=>keys.includes(k)),keys.join(","));
      for(const key of keys){
        const doc=new animation.LowDoc(), ids=lib.apply(doc,key,{x:0,y:0,width:1000,height:1000},"test");
        const nodes=Object.values(doc.scene.rig.nodes), valid=nodes.length===ids.length && nodes.every(n=>n.pivot&&n.head&&n.tail) && !(doc.scene.rig.diagnostics||[]).length;
        ok(`esqueleto ${key} trae pivotes y jerarquía funcional`,valid,JSON.stringify(doc.scene.rig.diagnostics||[]));
      }
      const eventDoc=new animation.LowDoc(), eventIds=lib.apply(eventDoc,{type:"click"},{x:0,y:0,width:500,height:500},"event");
      ok("un evento de interfaz no rompe el botón Colocar",eventIds.length===lib.templates.human_standard.bones.length,String(eventIds.length));
      const human=lib.templates.human_standard.bones;
      const shoulderL=human.find(b=>b.id==="clavicle_L"), shoulderR=human.find(b=>b.id==="clavicle_R");
      const lumbar=human.find(b=>b.id==="spine"), chest=human.find(b=>b.id==="chest"), upperChest=human.find(b=>b.id==="upper_chest");
      ok("el humano completo incluye dos articulaciones internas de columna",
        chest?.parentId==="spine" && upperChest?.parentId==="chest" &&
        Math.abs(lumbar.tail.y-chest.head.y)<1e-9 && Math.abs(chest.tail.y-upperChest.head.y)<1e-9,
        JSON.stringify({lumbar,chest,upperChest}));
      ok("el humano completo incluye ambos hombros entre columna y brazos",
        shoulderL?.parentId==="upper_chest" && shoulderR?.parentId==="upper_chest" &&
        human.find(b=>b.id==="upper_arm_L")?.parentId==="clavicle_L" &&
        human.find(b=>b.id==="upper_arm_R")?.parentId==="clavicle_R",JSON.stringify({shoulderL,shoulderR}));
      const faceDoc=new animation.LowDoc(), faceIds=lib.apply(faceDoc,"face_pro",{x:0,y:0,width:1000,height:1000},"face");
      const faceControls=faceIds.map(id=>faceDoc.scene.rigNode(id)).filter(n=>n?.role==="control"&&n.control?.label);
      ok("el rig facial trae controles nombrados y posables",faceControls.length>=18,String(faceControls.length));
      const faceReload=new animation.Scene({rig:faceDoc.scene.rig.toJSON?.()||faceDoc.scene.rig});
      ok("los controles profesionales sobreviven al guardado",faceReload.rigNode(faceIds[0])?.role==="control",faceReload.rigNode(faceIds[0])?.role);
      const linked=new animation.LowDoc();
      linked.ensureRigBones([
        {id:"parent",head:{x:0,y:0},tail:{x:100,y:0},pivot:{x:0,y:0}},
        {id:"child",parentId:"parent",head:{x:100,y:0},tail:{x:180,y:0},pivot:{x:100,y:0}}
      ]);
      linked.setRigBoneGeometries({
        parent:{head:{x:0,y:0},tail:{x:100,y:30}},
        child:{head:{x:100,y:30},tail:{x:180,y:0}}
      });
      ok("editar una articulación mantiene unidos padre e hijo",
        linked.scene.rigNode("parent").tail.y===linked.scene.rigNode("child").head.y,String(linked.scene.rigNode("child").head.y));
      const setupBeforePose = JSON.stringify(Object.fromEntries(
        Object.entries(linked.scene.rig.bones).map(([id, bone]) => [id,
          { head: bone.head, tail: bone.tail, pivot: bone.pivot, parentId: bone.parentId }])));
      linked.setRigKey("parent",1,{x:0,y:0,r:35,sx:1,sy:1});
      const parentTip=linked.scene.rigWorldPoint("parent",1,linked.scene.rigNode("parent").tail);
      const childHead=linked.scene.rigWorldPoint("child",1,linked.scene.rigNode("child").head);
      ok("la pose jerárquica no separa la articulación",
        Math.hypot(parentTip.x-childHead.x,parentTip.y-childHead.y)<1e-7,JSON.stringify({parentTip,childHead}));
      ok("Animar crea claves sin modificar la forma neutra del esqueleto",
        setupBeforePose === JSON.stringify(Object.fromEntries(
          Object.entries(linked.scene.rig.bones).map(([id, bone]) => [id,
            { head: bone.head, tail: bone.tail, pivot: bone.pivot, parentId: bone.parentId }]))));
      const clearDoc=new animation.LowDoc();
      clearDoc.setHistory(new LOW.core.HistoryManager());
      lib.apply(clearDoc,"human_standard",{x:0,y:0,width:1000,height:1000},"clear");
      const countBeforeClear=Object.keys(clearDoc.scene.rig.nodes).length;
      clearDoc.clearRig();
      ok("eliminar esqueleto quita huesos y datos de rig",countBeforeClear>0 && !Object.keys(clearDoc.scene.rig.nodes).length && !Object.keys(clearDoc.scene.rig.bindings).length);
      clearDoc.history.undo();
      ok("deshacer recupera el esqueleto completo",Object.keys(clearDoc.scene.rig.nodes).length===countBeforeClear,String(Object.keys(clearDoc.scene.rig.nodes).length));
      const preset=animation.characterLibrary.capture(clearDoc,"<g id='personaje'><path d='M0 0h10v10z'/></g>","Personaje propio","mine");
      const copy=animation.characterLibrary.read(JSON.parse(JSON.stringify(preset)));
      ok("un personaje reutilizable conserva arte y rig",copy.name==="Personaje propio"&&copy.drawing.includes("personaje")&&Object.keys(copy.rig.bones).length===countBeforeClear);
      const target=new animation.LowDoc(); target.setHistory(new LOW.core.HistoryManager());
      target.replaceRig(copy.rig); const loadedCount=Object.keys(target.scene.rig.nodes).length;
      target.scene.rig.nodes[Object.keys(target.scene.rig.nodes)[0]].name="copia editada";
      ok("cargar personaje produce una copia independiente",loadedCount===countBeforeClear&&!Object.values(copy.rig.bones).some(b=>b.name==="copia editada"));
    }

    // 29. La máquina de modos impide que una herramienta atraviese espacios.
    {
      const modes=LOW.application.createModeMachine();
      let state=modes.enterRig("build");
      ok("rig abre en Construir con Seleccionar",state.rig.phase==="build"&&state.rig.tool==="select",JSON.stringify(state));
      state=modes.setRigTool("create");
      ok("Construir permite crear huesos",state.rig.tool==="create",state.rig.tool);
      state=modes.setRigMode("fk");
      ok("Animar FK entra posando, no editando geometría",state.rig.phase==="animate"&&state.rig.solver==="fk"&&state.rig.tool==="pose",JSON.stringify(state));
      state=modes.setRigTool("edit");
      ok("Animar rechaza Editar esqueleto",state.rig.tool==="pose",state.rig.tool);
      state=modes.setRigMode("test");
      ok("Probar es un estado explícito y no una variante visual de Animar",
        state.rig.phase==="test"&&state.rig.tool==="pose",JSON.stringify(state));
      state=modes.setRigTool("create");
      ok("Probar rechaza herramientas que cambian el esqueleto",state.rig.tool==="pose",state.rig.tool);
      ok("rueda común queda bloqueada durante rigging",modes.wheelPolicy({altKey:false})==="block");
      ok("Alt+rueda conserva zoom sin tocar el rig",modes.wheelPolicy({altKey:true})==="zoom");
      ok("Escape prioriza soltar herramienta de rig",modes.cancelAction({rigSelection:true,canvasSelection:true})==="rig-tool");
      state=modes.exitRig();
      ok("salir de rig restaura Dibujo y Seleccionar",state.workspace==="drawing"&&!state.rig.active&&state.rig.tool==="select",JSON.stringify(state));

      const input=LOW.rigging.input.pointerAction;
      ok("Alambre sobre un hueso sólo crea y nunca mueve",input({phase:"build",tool:"create",target:"body"})==="create");
      ok("Editar es la única herramienta que cambia la geometría neutra",
        input({phase:"build",tool:"edit",target:"joint",isBone:true})==="edit-head" &&
        input({phase:"build",tool:"select",target:"joint",isBone:true})==="select");
      ok("Alt sobre una articulación edita sólo el pivote",
        input({phase:"build",tool:"edit",target:"joint",isBone:true,altKey:true})==="pivot");
      ok("Animar bloquea la traslación de una articulación hija",
        input({phase:"fk",tool:"pose",target:"joint",parentId:"padre"})==="locked-child");
      ok("Animar permite trasladar raíz y controles explícitos",
        input({phase:"fk",tool:"pose",target:"joint",parentId:null})==="translate" &&
        input({phase:"fk",tool:"pose",target:"joint",parentId:"padre",role:"control"})==="translate");
      ok("la punta rota en Animar y sólo edita longitud en Construir",
        input({phase:"fk",tool:"pose",target:"tip"})==="rotate" &&
        input({phase:"build",tool:"edit",target:"tip"})==="edit-tail");
      const gestures=LOW.rigging.input.createGestureController(); let cancellations=[];
      const oldToken=gestures.begin(reason=>cancellations.push(reason));
      const newToken=gestures.begin(reason=>cancellations.push(reason));
      ok("un gesto nuevo cancela el anterior",cancellations[0]==="superseded"&&!gestures.isCurrent(oldToken)&&gestures.isCurrent(newToken));
      ok("un pointerup viejo no puede confirmar el gesto nuevo",gestures.finish(oldToken)===false&&gestures.isCurrent(newToken));
      gestures.transition();
      ok("cambiar de modo cancela el gesto activo",cancellations.at(-1)==="transition"&&!gestures.isCurrent(newToken));
      const vm1=LOW.rigging.input.visualMetrics(1), vm25=LOW.rigging.input.visualMetrics(.25);
      ok("la silueta del hueso conserva proporción al cambiar zoom",
        vm25.headWidth===vm1.headWidth*.25&&vm25.tipWidth===vm1.tipWidth*.25,JSON.stringify({vm1,vm25}));

      const shared=LOW.input.createPointerController(); let ownerCancelled="";
      const drawToken=shared.begin({owner:"drawing",pointerId:7,cancel:r=>ownerCancelled=r});
      const rigToken=shared.begin({owner:"rig",pointerId:9});
      ok("rigging cancela limpiamente el trazo que poseía el puntero",
        ownerCancelled==="superseded"&&!shared.current(drawToken)&&shared.owns("rig",9));
      ok("un pointerup de otro dispositivo no confirma el gesto activo",
        !shared.finish(rigToken,7)&&shared.current(rigToken));
      ok("el dueño correcto puede cerrar la transacción",shared.finish(rigToken,9)&&!shared.active);
    }

    // 30. El marco de selección usa la convención profesional por dirección.
    {
      const S=LOW.drawing.selection;
      const region={left:0,top:0,right:100,bottom:100};
      const inside={left:10,top:10,right:40,bottom:40};
      const crossing={left:80,top:20,right:120,bottom:50};
      ok("marco izquierda a derecha exige contenido",S.marqueeMode(0,100)==="contained");
      ok("marco derecha a izquierda selecciona por contacto",S.marqueeMode(100,0)==="touching");
      ok("Alt invierte la regla del marco",S.marqueeMode(0,100,true)==="touching");
      ok("contenido acepta lo interno y rechaza lo cruzado",
        S.marqueeHit(inside,region,"contained")&&!S.marqueeHit(crossing,region,"contained"));
      ok("contacto captura también el objeto cruzado",S.marqueeHit(crossing,region,"touching"));
    }

    // 31. Preparación del rig: Probar y Animar tienen puertas diferentes.
    {
      const doc=new animation.LowDoc();
      let readiness=animation.rigReadiness(doc.scene.rig,["torso_art"]);
      ok("arte sin esqueleto no habilita Probar ni Animar",!readiness.readyToTest&&!readiness.readyToAnimate,JSON.stringify(readiness));
      doc.ensureRigBones([{id:"root",head:{x:0,y:0},tail:{x:0,y:100},pivot:{x:0,y:0},pinned:true}]);
      readiness=animation.rigReadiness(doc.scene.rig,["torso_art"]);
      ok("un esqueleto válido habilita Probar y Animar aunque no tenga arte",
        readiness.readyToTest&&readiness.readyToAnimate&&!readiness.hasBoundArt,JSON.stringify(readiness));
      const skeletonStatus=animation.rigWorkflowStatus(readiness,0);
      ok("la interfaz identifica la animación de esqueleto sin fingir un personaje vinculado",
        skeletonStatus.state==="skeleton"&&skeletonStatus.title==="Esqueleto animable",JSON.stringify(skeletonStatus));
      const templateDoc=new animation.LowDoc();
      animation.rigLibrary.apply(templateDoc,"human_standard",{x:0,y:0,width:1000,height:1000},"regression");
      const templateReport=animation.rigReadiness(templateDoc.scene.rig,[]);
      const templateAccess=animation.rigModeAccess(templateReport);
      ok("el humano de biblioteca habilita Animar sin personaje",
        templateAccess.animate&&templateAccess.test,JSON.stringify({templateReport,templateAccess}));
      const metadataOnly={...templateReport,errors:[{code:"missing-binding-attachment"}]};
      ok("un vínculo incompleto no vuelve a bloquear el esqueleto solo",
        animation.rigModeAccess(metadataOnly).animate,JSON.stringify(animation.rigModeAccess(metadataOnly)));
      const brokenHierarchy={...templateReport,errors:[{code:"bone-cycle"}]};
      ok("un ciclo real sí bloquea Animar",!animation.rigModeAccess(brokenHierarchy).animate);
      doc.bindRigElement("root","torso_art");
      readiness=animation.rigReadiness(doc.scene.rig,["torso_art","brazo_suelto"]);
      ok("un vínculo real habilita Animar y denuncia arte suelto",
        readiness.readyToAnimate&&readiness.hasBoundArt&&readiness.boundBoneCount===1&&readiness.unboundElementIds.includes("brazo_suelto"),JSON.stringify(readiness));
    }

    // 32. Video mocap: referencia, sincronía y seguimiento sobreviven al archivo.
    {
      const doc = new animation.LowDoc();
      const track = new animation.MotionCaptureTrack(doc).setSource({
        name:"actuacion.mp4", duration:2, width:1920, height:1080
      });
      track.setPose(13,{nose:{x:.5,y:.2},left_shoulder:{x:.4,y:.35}},.91);
      track.setSubjectRegion({x:.2,y:.1,w:.5,h:.8});
      track.analysisOptions={threshold:72,cleanup:6,backgroundTime:1.25,poseInterpolation:false,footLock:false,keyTolerance:3.5};
      track.poseEngine="mediapipe-pose";track.poseAnalysis={detected:12,missed:2,missedFrames:[15,18],retained:1,model:"pose_landmarker_lite"};
      doc.mocap = track;
      ok("video mocap traduce el cuadro a tiempo de video",Math.abs(track.timeAt(13,24)-.5)<.0001);
      track.setPose(14,{hips:{x:.5,y:.6}},1);ok("la pose manual queda asociada al cuadro exacto",track.poseAt(14).joints.hips.y===.6&&!track.poseAt(12));
      const reopened = animation.LowDoc.fromJSON(doc.toJSON());
      ok("video mocap persiste fuente, rango y muestras al reabrir",
        reopened.mocap&&reopened.mocap.source.name==="actuacion.mp4"&&reopened.mocap.poseAt(13).confidence===.91&&reopened.mocap.subjectRegion.w===.5&&reopened.mocap.analysisOptions.threshold===72&&reopened.mocap.analysisOptions.backgroundTime===1.25&&reopened.mocap.analysisOptions.poseInterpolation===false&&reopened.mocap.analysisOptions.footLock===false&&reopened.mocap.analysisOptions.keyTolerance===3.5&&reopened.mocap.poseEngine==="mediapipe-pose"&&reopened.mocap.poseAnalysis.detected===12&&reopened.mocap.poseAnalysis.missedFrames.join(",")==="15,18",
        JSON.stringify(reopened.mocap&&reopened.mocap.toJSON()));
      let rejected=false;
      try { animation.mocapEngines.register("roto",{}); } catch (_) { rejected=true; }
      ok("el registro rechaza motores que no analizan",rejected);
      ok("LOW incluye un motor local real de siluetas",
        animation.mocapEngines.list().includes("local-motion-silhouette"));
      ok("LOW incluye el detector corporal MediaPipe local",
        animation.mocapEngines.list().includes("mediapipe-pose"));
      ok("el detector corporal conserva fallback cuando no existe Worker",
        animation.createMocapPoseWorker("worker.js")===null);
      const mask=animation.decodeMocapMask({width:3,height:2,runs:[2,0,3,1,1,0]});
      ok("las siluetas persistentes reconstruyen su máscara",Array.from(mask).join(",")==="0,0,255,255,255,0");
      ok("una máscara corregida se puede volver a comprimir sin pérdidas",
        Array.from(animation.decodeMocapMask({width:3,height:2,runs:animation.encodeMocapMask(mask)})).join(",")===Array.from(mask).join(","));
      const maskSvg=animation.mocapMaskSvgContent({width:3,height:2,runs:[2,0,3,1,1,0]},{width:300,height:200});
      ok("una silueta útil crea geometría SVG visible y autónoma",
        maskSvg.includes("data-low-roto")&&maskSvg.includes("<path")&&!maskSvg.includes("data:image"),maskSvg);
      ok("una máscara vacía no crea un cuadro blanco de rotoscopía",
        animation.mocapMaskSvgContent({width:3,height:2,runs:[6,0]},{width:300,height:200})===null&&
        animation.mocapMaskStats({width:3,height:2,runs:[6,0]}).empty);
      const autoBackground=animation.medianMocapBackground([
        new Uint8ClampedArray([10,20,30,255]),new Uint8ClampedArray([220,210,200,255]),
        new Uint8ClampedArray([12,22,32,255]),new Uint8ClampedArray([11,21,31,255]),
        new Uint8ClampedArray([9,19,29,255])]);
      ok("el fondo automático descarta al actor transitorio mediante mediana",
        Array.from(autoBackground).join(",")==="11,21,31,255",Array.from(autoBackground).join(","));
      const noisy=new Uint8Array(100);for(let y=1;y<=3;y++)for(let x=1;x<=3;x++)noisy[y*10+x]=1;noisy[99]=1;
      const stable=animation.filterMocapMotionComponents(noisy,10,10,null);
      ok("el estabilizador quita ruido aislado sin perder al sujeto",stable.mask.reduce((sum,value)=>sum+value,0)===9&&stable.components===2&&stable.keptComponents===1,JSON.stringify(stable));
      const competing=new Uint8Array(100);for(let y=1;y<=2;y++)for(let x=1;x<=2;x++)competing[y*10+x]=1;for(let y=6;y<=7;y++)for(let x=7;x<=9;x++)competing[y*10+x]=1;
      const continuous=animation.filterMocapMotionComponents(competing,10,10,{x:.1,y:.1,w:.2,h:.2});
      ok("la continuidad mantiene al sujeto aunque aparezca otra mancha mayor",continuous.bounds.x<.3&&continuous.mask[11]===1&&continuous.mask[67]===0,JSON.stringify(continuous));
      const hidden=animation.filterMocapMotionComponents(new Uint8Array(100),10,10,continuous.bounds);
      ok("un cuadro sin sujeto queda marcado como oclusión revisable",hidden.occluded===true&&hidden.confidence===0&&hidden.bounds===null,JSON.stringify(hidden));
      const landmarks=Array.from({length:33},()=>null),put=(index,x,y,visibility=.9)=>{landmarks[index]={x,y,z:.1,visibility,presence:visibility};};
      put(0,.5,.15);put(11,.3,.35);put(12,.7,.35);put(13,.2,.5);put(14,.8,.5);put(15,.1,.65);put(16,.9,.65);put(23,.4,.62);put(24,.6,.62);put(25,.38,.78);put(26,.62,.78);put(27,.35,.95);put(28,.65,.95);put(19,.1,.7,.1);
      const body=animation.mediapipeLandmarksToLow(landmarks,{x:.2,y:.1,w:.5,h:.8},.45);
      ok("MediaPipe se traduce al contrato humano normalizado de LOW",Object.keys(body.joints).length===13&&Math.abs(body.joints.neck.x-.45)<.0001&&Math.abs(body.joints.hips.y-.596)<.0001&&body.confidence>.8,JSON.stringify(body));
      const semantic=animation.semanticMocapSilhouette({width:2,height:2,data:new Uint8Array([1,0,0,0])},{x:.25,y:.25,w:.5,h:.5},8,8,null);
      ok("la máscara semántica respeta la región marcada y el lienzo completo",semantic.semantic&&semantic.source==="mediapipe"&&semantic.bounds.x===.25&&semantic.bounds.y===.25&&semantic.bounds.w===.25&&semantic.bounds.h===.25,JSON.stringify(semantic));
      const mergedMasks=animation.mergeSemanticMocapSilhouettes({1:{source:"motion"},2:{corrected:true,source:"manual"}},{1:{source:"mediapipe"},2:{source:"mediapipe"},3:{source:"mediapipe"}});
      ok("reanalizar siluetas conserva cada corrección manual",mergedMasks[1].source==="mediapipe"&&mergedMasks[2].source==="manual"&&mergedMasks[3].source==="mediapipe",JSON.stringify(mergedMasks));
      const retained=animation.retainManualMocapPoses({1:{joints:{},confidence:1},2:{joints:{},source:"manual",corrected:true},3:{joints:{},source:"mediapipe"}});
      ok("reanalizar conserva marcas manuales y reemplaza sólo detecciones automáticas",!!retained[1]&&!!retained[2]&&!retained[3],JSON.stringify(retained));
      const history=new LOW.core.HistoryManager(),rotoDoc=new animation.LowDoc();rotoDoc.setHistory(history);
      const originalLayer=rotoDoc.layerId,roto=rotoDoc.addReferenceSequence([{frame:1,content:"<image/>"},{frame:3,content:"<image/>"}],"Roto");
      ok("las siluetas crean un nivel de calco con exposiciones",roto&&rotoDoc.level.drawings.length===2&&roto.cellAt(3)===2);
      history.undo();ok("deshacer quita atómicamente el nivel de calco",rotoDoc.layerId===originalLayer&&!rotoDoc.scene.layer(roto.id));
      history.redo();ok("rehacer restaura dibujos y exposiciones del calco",rotoDoc.scene.layer(roto.id)?.cellAt(3)===2);
      const rigDoc=new animation.LowDoc(),bones=animation.rigLibrary.instantiate("human_standard",{x:0,y:0,width:1000,height:1000},"mocap");
      rigDoc.ensureRigBones(bones);
      const mapped=animation.retargetHumanPose({joints:{hips:{x:.5,y:.68},neck:{x:.5,y:.43},left_shoulder:{x:.42,y:.44},left_elbow:{x:.34,y:.48},left_wrist:{x:.2,y:.58}}},rigDoc.scene.rig,{width:1000,height:1000});
      ok("retargeting sólo produce cadenas con puntos confirmados",mapped.mocap_root&&mapped.mocap_spine&&mapped.mocap_upper_arm_L&&mapped.mocap_forearm_L&&!mapped.mocap_upper_arm_R,JSON.stringify(mapped));
      const rigHistory=new LOW.core.HistoryManager();rigDoc.setHistory(rigHistory);
      ok("una secuencia mocap se aplica como lote atómico",rigDoc.setRigPoseSequence({1:mapped,3:mapped})&&rigDoc.scene.rigNode("mocap_spine").keys[3]);
      rigHistory.undo();ok("deshacer retargeting quita todas sus claves",!rigDoc.scene.rigNode("mocap_spine").keys[3]);
      rigHistory.redo();ok("rehacer retargeting recupera toda la secuencia",!!rigDoc.scene.rigNode("mocap_spine").keys[3]);
      const sparse=new animation.MotionCaptureTrack(doc);sparse.setPose(1,{hips:{x:.4,y:.7},neck:{x:.4,y:.4}},1);sparse.setPose(5,{hips:{x:.6,y:.7},neck:{x:.6,y:.4}},1);
      const completed=animation.mocapPoseSequence(sparse,true),middle=completed[3];
      ok("mocap completa sólo entre dos articulaciones confirmadas",middle&&Math.abs(middle.joints.hips.x-.5)<.0001&&middle.joints.hips.interpolated===true&&!completed[6],JSON.stringify(completed));
      const report=animation.mocapPoseReport(sparse,completed);
      ok("el diagnóstico distingue confirmación de cuadros generados",report.observedFrames===2&&report.confirmedFrames===2&&report.generatedFrames===5&&report.observedJoints===2&&report.chainFrames.spine===5,JSON.stringify(report));
      const auto=new animation.MotionCaptureTrack(doc);auto.setPose(1,{hips:{x:.5,y:.7},neck:{x:.5,y:.4}},.8,{source:"mediapipe"});auto.setPose(2,{hips:{x:.5,y:.7},neck:{x:.5,y:.4}},1,{source:"manual",corrected:true});const autoReport=animation.mocapPoseReport(auto);
      ok("el diagnóstico separa detección automática de revisión humana",autoReport.observedFrames===2&&autoReport.automaticFrames===1&&autoReport.manualFrames===1&&autoReport.confirmedFrames===1,JSON.stringify(autoReport));
      const walk={};for(let frame=1;frame<=5;frame++)walk[frame]={joints:{left_ankle:{x:.3+(frame-1)*.003,y:.92},right_ankle:{x:.62+frame*.04,y:.8},hips:{x:.5+(frame-1)*.003,y:.65}}};
      const contacts=animation.mocapFootContacts(walk),locked=animation.stabilizeMocapFootContacts(walk,contacts);
      ok("mocap detecta intervalos de apoyo sin confundir el pie en vuelo",contacts.ranges.left.length===1&&contacts.leftFrames.length===5&&!contacts.rightFrames.length,JSON.stringify(contacts));
      ok("pies firmes estabiliza el apoyo sin deformar la pose",Math.abs(locked[5].joints.left_ankle.x-locked[1].joints.left_ankle.x)<.0001&&Math.abs((locked[5].joints.hips.x-locked[5].joints.left_ankle.x)-(walk[5].joints.hips.x-walk[5].joints.left_ankle.x))<.0001,JSON.stringify(locked));
      const linear={};for(let frame=1;frame<=5;frame++)linear[frame]={bone:{x:frame*2,y:frame,r:frame*5,sx:1,sy:1}};
      const compact=animation.reduceRigPoseSequence(linear,.1);
      ok("la reducción elimina claves lineales redundantes",Object.keys(compact).length===2&&compact[1].bone&&compact[5].bone,JSON.stringify(compact));
      linear[3].bone.r=35;const directed=animation.reduceRigPoseSequence(linear,1);
      ok("la reducción conserva un cambio real de dirección",!!directed[3]?.bone,JSON.stringify(directed));
    }

    // 34. Coloreo: identidad, seguimiento seguro y undo atómico de un rango.
    {
      const C = animation.coloring;
      const w = 24, h = 24, mask = (x0, y0, x1, y1) => {
        const out = new Uint8Array(w * h);
        for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out[y * w + x] = 1;
        return C.describeMask(out, w, h);
      };
      const source = mask(2, 5, 8, 17), moved = mask(5, 5, 11, 17), wrong = mask(15, 3, 22, 10);
      let match = C.matchRegion(source, [wrong, moved], { predicted: { x: moved.centroid.x, y: moved.centroid.y } });
      ok("el coloreo sigue la misma zona aunque se mueva", match.accepted && match.candidate === moved,
        JSON.stringify({ confidence: match.confidence, reason: match.reason }));
      match = C.matchRegion(source, [moved, { ...moved }], { predicted: moved.centroid });
      ok("el coloreo no adivina entre dos zonas indistinguibles", !match.accepted && match.reason === "ambiguous",
        JSON.stringify({ confidence: match.confidence, reason: match.reason }));
      ok("cada zona de color recibe identidad estable", C.zoneId() !== C.zoneId());

      const doc = new animation.LowDoc(), history = new LOW.core.HistoryManager(); doc.setHistory(history);
      doc.setCell(1, 1); doc.setCell(2, 2);
      doc.level.byNumber(1).content = '<path id="a"/>';
      doc.level.byNumber(2).content = '<path id="b"/>';
      doc.goTo(1);
      ok("el alcance Cuadro no atraviesa un hold ni otro dibujo",
        C.scopeTargets(doc, "current").length === 1 && C.scopeTargets(doc, "current")[0].number === 1);
      doc.selectCellRange(doc.layerId, 1, doc.layerId, 2);
      ok("el alcance X-sheet procesa dibujos únicos del rango",
        C.scopeTargets(doc, "selection").map((item) => item.number).join(",") === "1,2");
      const count = doc.applyDrawingContents([
        { levelId: doc.level.id, number: 1, content: '<path id="a" data-low-zone="z"/>' },
        { levelId: doc.level.id, number: 2, content: '<path id="b" data-low-zone="z"/>' },
      ], "Colorear rango");
      ok("colorear un rango modifica todos sus dibujos", count === 2 && doc.level.drawings.every((d) => d.content.includes('data-low-zone="z"')));
      history.undo();
      ok("un solo Ctrl+Z deshace todo el rango coloreado",
        !doc.level.byNumber(1).content.includes("data-low-zone") && !doc.level.byNumber(2).content.includes("data-low-zone"));
      history.redo();
      ok("rehacer recupera el coloreo completo", doc.level.drawings.every((d) => d.content.includes('data-low-zone="z"')));
    }

    // 35. Timeline compacta: la vista escala sin inventar otro tiempo.
    {
      const T = animation.timeline, doc = new animation.LowDoc();
      const empty = doc.addLayer("Vacía"), active = doc.layer;
      doc.setCell(1, 1); doc.setCell(120, 1);
      doc.selectCellRange(active.id, 20, active.id, 40);
      const compact = T.normalizeViewState({ frameWidth: 7, density: "compact",
        hideEmpty: true, collapsed: { [active.id]: true, basura: false } });
      ok("la escala temporal usa peldaños estables y conserva sólo pliegues reales",
        compact.frameWidth === 6 && compact.density === "compact" && compact.collapsed[active.id] && !("basura" in compact.collapsed),
        JSON.stringify(compact));
      ok("ocultar vacías nunca esconde la capa seleccionada",
        T.visibleLayers(doc.scene.layers, compact, empty.id).some((layer) => layer.id === empty.id));
      ok("el foco muestra una sola capa sin modificar Scene",
        T.visibleLayers(doc.scene.layers, { focusSelected: true }, active.id).length === 1 && doc.scene.layers.length === 2);
      ok("la regla reduce etiquetas al alejar y las aumenta al acercar",
        T.majorTickStep(6) > T.majorTickStep(32));
      doc.scene.camera.keys[180] = { x: 0, y: 0, z: 1 };
      const extent = T.extent(doc.scene, { audio: { offset: 20, peaks: new Array(200) },
        mocap: { range: { out: 210 } }, current: 2 });
      ok("la extensión visual incluye dibujo, cámara, audio y mocap", extent === 220, String(extent));
      const selected = T.rangeFor("selection", doc);
      ok("encajar selección lee el rango del mismo LowDoc", selected.from === 20 && selected.to === 40, JSON.stringify(selected));
      ok("encajar calcula una escala acotada para escenas largas",
        T.fitFrameWidth(1000, 1, 240) === 6 && T.fitFrameWidth(1000, 1, 20) >= 32);
      ok("la densidad es sólo geometría de interfaz", T.rowHeight("compact") === 18 && T.rowHeight("comfortable") === 32);
    }

    // 36. Workspace: un panel tiene una sola ubicación y los grupos no dejan basura.
    {
      const DockLayout = LOW.workspace.DockLayout;
      const layout = new DockLayout();
      const inspector = layout.dock("inspector", "right", "right_main");
      layout.tab("palette", "inspector");
      ok("dos paneles pueden compartir un grupo como pestañas",
        inspector.tabs.join(",") === "inspector,palette" && inspector.activePanelId === "palette",
        JSON.stringify(layout.snapshot()));
      layout.float("palette", { x: 12, y: 18, width: 500, height: 400 });
      ok("desacoplar quita la pestaña del dock y conserva una sola instancia",
        inspector.tabs.join(",") === "inspector" && layout.locate("palette").kind === "float",
        JSON.stringify(layout.snapshot()));
      layout.close("inspector");
      ok("cerrar la última pestaña elimina también el grupo vacío",
        layout.groups.length === 0 && layout.locate("inspector").kind === "hidden",
        JSON.stringify(layout.snapshot()));
      layout.dock("palette", "left", "left_main");
      ok("reabrir un panel flotante lo traslada sin duplicarlo",
        layout.floating.length === 0 && layout.locate("palette").zone === "left",
        JSON.stringify(layout.snapshot()));

      const restored = new DockLayout({
        groups: [
          { id: "a", zone: "center", tabs: ["viewer", "palette"], activePanelId: "palette" },
          { id: "b", zone: "invalid", tabs: ["palette", "timeline", "timeline"] },
          { id: "empty", zone: "bottom", tabs: [] },
        ],
        floating: [{ panelId: "viewer", x: 3, y: 4, width: 2, height: 2 }, { panelId: "properties" }],
        hidden: ["timeline", "properties", "tools"],
      });
      const snapshot = restored.snapshot();
      const allIds = [
        ...snapshot.groups.flatMap((group) => group.tabs),
        ...snapshot.floating.map((item) => item.panelId),
        ...snapshot.hidden,
      ];
      ok("restaurar sanea zonas, duplicados y grupos vacíos",
        new Set(allIds).size === allIds.length && snapshot.groups.length === 2 &&
        snapshot.groups[1].zone === "right" && !snapshot.groups.some((group) => group.id === "empty"),
        JSON.stringify(snapshot));
      ok("las ventanas restauradas respetan tamaños mínimos",
        restored.locate("properties").kind === "float" && restored.locate("properties").width === 320 &&
        restored.locate("properties").height === 260,
        JSON.stringify(restored.locate("properties")));
    }

    // 37. IK/FK match: cambiar de modo es una decisión del animador, nunca un
    //     salto de la cadena. Ni el extremo ni el codo pueden moverse.
    {
      const doc = new animation.LowDoc();
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      doc.ensureRigNode("hombro", { pivot: { x: 0, y: 0 }, pinned: true });
      doc.ensureRigNode("codo", { pivot: { x: 100, y: 0 } });
      doc.ensureRigNode("muneca", { pivot: { x: 200, y: 0 } });
      doc.setRigParent("codo", "hombro"); doc.setRigParent("muneca", "codo");
      const ik = doc.createRigIK("hombro", "codo", "muneca");
      const punta = (f) => doc.scene.rigWorldPoint("muneca", f, { x: 200, y: 0 });
      const codo = (f) => doc.scene.rigWorldPoint("codo", f, { x: 100, y: 0 });

      // Pose armada a mano en FK, con el codo del lado CONTRARIO al que elige
      // la flexión por defecto: si el match no corrige el lado, el codo se da
      // vuelta al encender IK aunque la muñeca caiga en su sitio.
      doc.setRigKey("hombro", 10, { x: 0, y: 0, r: 40, sx: 1, sy: 1 });
      doc.setRigKey("codo", 10, { x: 0, y: 0, r: -70, sx: 1, sy: 1 });
      const puntaFk = punta(10), codoFk = codo(10);
      ok("la pose FK de partida dobla el codo", Math.abs(codoFk.y) > 1, JSON.stringify(codoFk));

      const emparejado = doc.matchRigIK(ik, 10);
      const objetivo = doc.scene.rigTargetAt(ik, 10);
      ok("match IK pone el objetivo donde ya estaba el extremo",
        emparejado && dist(objetivo, puntaFk) < 0.01, JSON.stringify({ objetivo, puntaFk }));
      doc.setRigIKTarget(ik, 10, objetivo);
      ok("encender IK después del match no mueve el extremo", dist(punta(10), puntaFk) < 0.01,
        JSON.stringify({ ahora: punta(10), antes: puntaFk }));
      ok("encender IK después del match no da vuelta el codo", dist(codo(10), codoFk) < 0.01,
        JSON.stringify({ ahora: codo(10), antes: codoFk }));

      // Y el camino de vuelta: apagar IK deja la cadena exactamente igual.
      doc.setRigIKTarget(ik, 20, { x: 40, y: 150 });
      const puntaIk = punta(20), codoIk = codo(20);
      doc.setRigKey("hombro", 30, { x: 0, y: 0, r: 0, sx: 1, sy: 1 });
      const interpolado = 25, puntaMedio = punta(interpolado), codoMedio = codo(interpolado);
      ok("apagar IK con match hornea la pose del cuadro pedido",
        doc.matchRigFK(ik, interpolado) && doc.scene.rigConstraint(ik).enabled === false);
      ok("apagar IK no mueve el extremo ni en un cuadro interpolado",
        dist(punta(interpolado), puntaMedio) < 0.01 && dist(codo(interpolado), codoMedio) < 0.01,
        JSON.stringify({ ahora: punta(interpolado), antes: puntaMedio }));
      ok("la cadena apagada conserva la pose IG del cuadro clave",
        dist(punta(20), puntaIk) < 0.01 && dist(codo(20), codoIk) < 0.01);
      ok("match FK deja claves reales, no una pose fantasma",
        !!doc.scene.rigNode("hombro").keys[interpolado] && !!doc.scene.rigNode("codo").keys[interpolado]);
    }

    // 38. Pole: el codo apunta a donde el animador dice, y esa decisión se
    //     anima y sobrevive al archivo. Un flag binario no alcanza.
    {
      const doc = new animation.LowDoc();
      doc.ensureRigNode("cadera", { pivot: { x: 0, y: 0 }, pinned: true });
      doc.ensureRigNode("rodilla", { pivot: { x: 100, y: 0 } });
      doc.ensureRigNode("pie", { pivot: { x: 200, y: 0 } });
      doc.setRigParent("rodilla", "cadera"); doc.setRigParent("pie", "rodilla");
      const ik = doc.createRigIK("cadera", "rodilla", "pie");
      const rodilla = (f) => doc.scene.rigWorldPoint("rodilla", f, { x: 100, y: 0 });

      doc.setRigIKPole(ik, 1, { x: 90, y: -260 });
      doc.setRigIKTarget(ik, 1, { x: 150, y: 0 });
      const arriba = rodilla(1);
      doc.setRigIKPole(ik, 1, { x: 90, y: 260 });
      doc.setRigIKTarget(ik, 1, { x: 150, y: 0 });
      const abajo = rodilla(1);
      ok("la rodilla sigue al pole y cambia de lado con él",
        arriba.y < -1 && abajo.y > 1, JSON.stringify({ arriba, abajo }));

      doc.setRigIKPole(ik, 20, { x: 90, y: -260 });
      const medio = doc.scene.rigPoleAt(ik, 10);
      ok("el pole se interpola entre claves como el objetivo",
        Math.abs(medio.y) < 260 && medio.y !== 260, JSON.stringify(medio));

      // Un pole exactamente sobre la línea no debe hacer temblar la rodilla.
      doc.setRigIKPole(ik, 30, { x: 75, y: 0 });
      doc.setRigIKTarget(ik, 30, { x: 150, y: 0 });
      const enLinea = rodilla(30);
      ok("un pole sobre la recta conserva la flexión previa en vez de oscilar",
        Number.isFinite(enLinea.x) && Number.isFinite(enLinea.y), JSON.stringify(enLinea));

      const reabierto = animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
      ok("el pole animado sobrevive guardar y reabrir",
        Math.round(reabierto.scene.rigPoleAt(ik, 20).y) === -260,
        JSON.stringify(reabierto.scene.rigPoleAt(ik, 20)));

      // El pole que se OFRECE cuando todavía no hay uno: aparecer no puede
      // mover la pierna, así que tiene que caer del lado por el que ya dobla.
      const sugerir = LOW.rigging.input.suggestedPole;
      const doblado = sugerir({ root: { x: 0, y: 0 }, joint: { x: 75, y: -60 }, effector: { x: 150, y: 0 } });
      ok("el pole sugerido sale del lado por el que la cadena ya dobla",
        doblado.y < -60, JSON.stringify(doblado));
      const estirado = sugerir({ root: { x: 0, y: 0 }, joint: { x: 100, y: 0 }, effector: { x: 200, y: 0 } });
      ok("con la cadena estirada el pole sugerido sale perpendicular, no al infinito",
        Math.abs(estirado.x - 100) < 0.01 && Math.abs(estirado.y) >= 40 && Number.isFinite(estirado.y),
        JSON.stringify(estirado));
      ok("sin cadena completa no se inventa un pole", sugerir({ root: { x: 0, y: 0 } }) === null);
    }

    // 39. Pins: un pie clavado no patina cuando se mueve la cadera. Es la
    //     diferencia entre una caminata y un personaje flotando.
    {
      const doc = new animation.LowDoc();
      const history = new LOW.core.HistoryManager(); doc.setHistory(history);
      const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
      doc.ensureRigNode("cadera", { pivot: { x: 0, y: 0 }, pinned: true });
      doc.ensureRigNode("muslo", { pivot: { x: 0, y: 0 } });
      doc.ensureRigNode("rodilla", { pivot: { x: 0, y: 100 } });
      doc.ensureRigNode("pie", { pivot: { x: 0, y: 200 } });
      doc.setRigParent("muslo", "cadera"); doc.setRigParent("rodilla", "muslo");
      doc.setRigParent("pie", "rodilla");
      const ik = doc.createRigIK("muslo", "rodilla", "pie");
      const pieEn = (f) => doc.scene.rigWorldPoint("pie", f, { x: 0, y: 200 });

      // Un apoyo real se planta con la rodilla flexionada: la pierna recta ya
      // está en extensión máxima y no le queda alcance para acompañar nada.
      doc.goTo(1);
      doc.setRigIKTarget(ik, 1, { x: 0, y: 170 });
      const apoyo = pieEn(1);
      ok("clavar el pie no lo mueve de donde está",
        doc.setRigPin(ik, 1, true) && dist(pieEn(1), apoyo) < 0.01, JSON.stringify(pieEn(1)));
      ok("el pin queda registrado en el cuadro", doc.scene.rigPinnedAt(ik, 1) === true);

      // La cadera se va para un costado: el pie tiene que quedarse.
      doc.setRigKey("cadera", 1, { x: 40, y: 0, r: 0, sx: 1, sy: 1 });
      ok("mover la cadera con el pie clavado no arrastra el pie",
        dist(pieEn(1), apoyo) < 0.5, JSON.stringify({ ahora: pieEn(1), apoyo }));
      ok("la pierna se acomodó de verdad, no se quedó quieta",
        !!doc.scene.rigNode("muslo").keys[1]);

      // El pin es un estado sostenido: vale hasta que se lo suelta.
      doc.goTo(10);
      ok("el pin se sostiene entre claves", doc.scene.rigPinnedAt(ik, 5) === true);
      ok("soltar el pie es una decisión explícita y con cuadro",
        doc.setRigPin(ik, 10, false) && doc.scene.rigPinnedAt(ik, 10) === false &&
        doc.scene.rigPinnedAt(ik, 5) === true);
      const sueltoAntes = pieEn(10);
      doc.setRigKey("cadera", 10, { x: 120, y: 0, r: 0, sx: 1, sy: 1 });
      ok("con el pie suelto la cadera vuelve a arrastrar la pierna",
        dist(pieEn(10), sueltoAntes) > 1, JSON.stringify({ ahora: pieEn(10), antes: sueltoAntes }));

      history.clear();
      doc.goTo(1);
      doc.setRigKey("cadera", 1, { x: -30, y: 0, r: 0, sx: 1, sy: 1 });
      ok("la corrección del pin entra en el MISMO undo que el gesto",
        dist(pieEn(1), apoyo) < 0.5 && history.undo() &&
        Math.round(doc.scene.rigNode("cadera").keys[1].x) === 40,
        JSON.stringify(doc.scene.rigNode("cadera").keys[1]));

      const reabierto = animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
      ok("los pines sobreviven guardar y reabrir",
        reabierto.scene.rigPinnedAt(ik, 5) === true && reabierto.scene.rigPinnedAt(ik, 10) === false);
    }

    // 40. Compactar la timeline a lo ANCHO. La columna de nombres es el único
    //     costo horizontal fijo: está en todas las filas y no se va con el
    //     scroll. Angostarla devuelve ancho real para tiempo, sin tocar la
    //     escala ni el documento.
    {
      const T = animation.timeline;
      const normal = T.normalizeViewState({}), compacta = T.normalizeViewState({ compact: true });
      ok("compactar a lo ancho es estado de VISTA, no de la escena",
        normal.compact === false && compacta.compact === true);
      ok("compactar angosta el encabezado sin cambiar la escala del tiempo",
        T.nameWidth(true) < T.nameWidth(false) && compacta.frameWidth === normal.frameWidth,
        JSON.stringify({ compacto: T.nameWidth(true), normal: T.nameWidth(false) }));
      const anchoNormal = T.fitFrameWidth(1000, 1, 100, T.nameWidth(false));
      const anchoCompacto = T.fitFrameWidth(1000, 1, 100, T.nameWidth(true));
      ok("encajar mide el encabezado real: compactada entra más tiempo por píxel",
        anchoCompacto > anchoNormal, JSON.stringify({ anchoNormal, anchoCompacto }));
      ok("una preferencia corrupta no rompe la vista",
        T.normalizeViewState({ compact: "sí" }).compact === true &&
        T.normalizeViewState(null).compact === false);
    }

    // 41. Sustituciones VISIBLES en el tiempo. Cambiar de mano abierta a puño
    //     ya funcionaba, pero en la timeline no se veía ni dónde ocurre ni
    //     cuánto se sostiene: un timing invisible no se puede corregir.
    {
      const T = animation.timeline, doc = new animation.LowDoc();
      // `ensureRigNode` ya crea el slot con el nombre del hueso: la pieza que ve
      // el artista se llama como el hueso, y eso es lo que debe decir la marca.
      doc.ensureRigNode("mano_izq", { pivot: { x: 0, y: 0 } });
      const slot = doc.ensureRigSlot("mano_izq");
      const abierta = doc.addRigAttachment(slot, { name: "abierta" });
      const puno = doc.addRigAttachment(slot, { name: "puño" });
      doc.setRigSwitchKey(slot, 4, puno);
      doc.setRigSwitchKey(slot, 9, abierta);

      const pista = T.switchTrack(doc.scene, 12);
      ok("marca el cuadro donde el dibujo CAMBIA, no los de alrededor",
        pista[4].change === true && !pista[3] && pista[5].change === false,
        JSON.stringify({ f3: pista[3], f4: pista[4], f5: pista[5] }));
      ok("el sostenido se ve hasta la sustitución siguiente",
        pista[5].held === true && pista[8].held === true && pista[9].change === true,
        JSON.stringify({ f8: pista[8], f9: pista[9] }));
      ok("la última sustitución se sostiene hasta el final del tramo",
        pista[12].held === true && !pista[13]);
      ok("cada marca dice qué pieza y qué dibujo, para el tooltip",
        pista[4].labels[0] === "mano_izq: puño" && pista[9].labels[0] === "mano_izq: abierta",
        JSON.stringify(pista[4].labels));
      // El slot se llama como el ID del hueso; la marca tiene que mostrar el
      // nombre VISIBLE de la pieza, no un identificador interno.
      doc.scene.rig.nodes["mano_izq"].name = "Mano izq.";
      ok("la marca prefiere el nombre visible de la pieza al identificador",
        T.switchTrack(doc.scene, 12)[4].labels[0] === "Mano izq.: puño",
        JSON.stringify(T.switchTrack(doc.scene, 12)[4].labels));
      ok("la marca de cambio sabe a qué slot borrarle la clave",
        pista[4].slots[0] === slot && pista[5].slots.length === 0);
      ok("el sostenido se lista aparte del cambio, no mezclado",
        pista[4].holds.length === 0 && pista[5].labels.length === 0 &&
        pista[5].holds[0] === "mano_izq: puño", JSON.stringify(pista[5]));

      // Caso mezclado: en un mismo cuadro una pieza CAMBIA y otra sólo sigue.
      // Antes las dos aparecían como cambio y el tooltip mentía.
      doc.ensureRigNode("cabeza", { pivot: { x: 0, y: 0 } });
      const slotCabeza = doc.ensureRigSlot("cabeza");
      doc.setRigSwitchKey(slotCabeza, 7, doc.addRigAttachment(slotCabeza, { name: "perfil" }));
      // `ensureRigSlot` bautiza el slot con SU id (`slot:<hueso>`), distinto del
      // nombre por defecto que pone `ensureRigNode`. Los dos son autogenerados
      // y ninguno se puede mostrar: la marca tiene que caer al nombre del hueso.
      doc.scene.rig.nodes["cabeza"].name = "Cabeza";
      doc.scene.rig.slots[slotCabeza].name = slotCabeza;
      const mezcla = T.switchTrack(doc.scene, 12)[7];
      ok("en un cuadro mixto, cambia una pieza y la otra sólo se sostiene",
        mezcla.labels.length === 1 && mezcla.labels[0] === "Cabeza: perfil" &&
        mezcla.holds.length === 1 && mezcla.holds[0] === "Mano izq.: puño" &&
        mezcla.slots.length === 1 && mezcla.slots[0] === slotCabeza,
        JSON.stringify(mezcla));

      // Una clave que apunta a un dibujo borrado no puede pintar una marca
      // fantasma. El comando la RECHAZA, así que sólo puede llegar desde un
      // archivo donde el dibujo se borró después: se inyecta como vendría de ahí.
      ok("el comando ni siquiera acepta una sustitución a un dibujo inexistente",
        doc.setRigSwitchKey(slot, 2, "attachment:inexistente") === false);
      doc.scene.rig.switches[slot].keys[2] = "attachment:inexistente";
      ok("una sustitución rota no deja marca fantasma", !T.switchTrack(doc.scene, 12)[2],
        JSON.stringify(T.switchTrack(doc.scene, 12)[2]));
      ok("sin sustituciones la pista queda vacía y no dibuja fila",
        T.switchTrack(new animation.LowDoc().scene, 8).every((m) => !m));
    }

    // ── trabajo remoto: la instantanea que viaja por la red ────────────────
    {
      const doc = new animation.LowDoc();
      doc.setHistory(new LOW.core.HistoryManager({ limit: 20 }));
      const ly = doc.scene.layers[0], lv = doc.scene.level(ly.levelId);
      doc.writeDrawing("<circle r='5'/>");
      const snap = doc.snapshotPara(ly.id, lv.id);
      ok("la instantanea lleva la capa y su nivel",
        snap.layers.length === 1 && snap.levels.length === 1);
      ok("y viaja como datos, sin funciones adentro",
        JSON.parse(JSON.stringify(snap)).levels[0].drawings[0].content === "<circle r='5'/>");

      const otro = new animation.LowDoc();
      otro.setHistory(new LOW.core.HistoryManager({ limit: 20 }));
      const pasos = otro.history.undoStack.length;
      // los ids tienen que coincidir para que la instantanea aterrice: es lo
      // que garantiza que los dos abrieron el MISMO proyecto
      const propio = otro.snapshotPara(otro.scene.layers[0].id,
        otro.scene.level(otro.scene.layers[0].levelId).id);
      const mezcla = { layers: [{ id: propio.layers[0].id, cells: snap.layers[0].cells.slice() }],
        levels: [{ id: propio.levels[0].id, drawings: snap.levels[0].drawings }] };
      ok("lo del otro entra en el documento", otro.applyRemoteSnapshot(mezcla));
      ok("y el dibujo queda tal cual",
        (otro.scene.level(otro.scene.layers[0].levelId).drawings[0] || {}).content === "<circle r='5'/>");
      ok("SIN tocar el historial propio: mi Ctrl+Z no deshace lo del otro",
        otro.history.undoStack.length === pasos);
      ok("una instantanea vacia no hace nada", !otro.applyRemoteSnapshot(null));
      ok("y una de ids desconocidos tampoco",
        !otro.applyRemoteSnapshot({ layers: [{ id: "no-existe", cells: [1] }], levels: [] }));
    }

    // ── cambiar el dibujo del cuadro donde uno esta avisa a las vistas ─────
    {
      const doc = new animation.LowDoc();
      doc.setHistory(new LOW.core.HistoryManager({ limit: 20 }));
      const ly = doc.scene.layers[0], lv = doc.scene.level(ly.levelId);
      doc.writeDrawing("<circle r='3'/>");
      const copia = doc.duplicateDrawing(doc.drawing.number);
      const avisos = [];
      doc.subscribe((_d, motivo) => avisos.push(motivo));

      doc.setCell(doc.frame, copia.number, ly.id);
      ok("cambiar la celda ACTUAL avisa que la mesa cambio", avisos.includes("frame"), avisos.join(","));

      avisos.length = 0;
      doc.setCell(doc.frame + 4, copia.number, ly.id);
      ok("cambiar una celda lejana NO repinta la mesa al pedo",
        !avisos.includes("frame") && avisos.includes("cells"), avisos.join(","));

      avisos.length = 0;
      doc.apply("clear", doc.frame, doc.frame);
      ok("vaciar el cuadro actual tambien avisa", avisos.includes("frame"), avisos.join(","));

      ok("y el duplicado es un dibujo APARTE, no el mismo",
        copia.number !== 1 && lv.drawings.length >= 2);
      const original = lv.byNumber(1);
      copia.content = "<rect/>";
      ok("retocar la copia no toca el original", (original.content || "").includes("circle"));
    }

    // ── NADA DIBUJADO NO ES UN DIBUJO (v4.51.1): los planos Color/Línea vacíos
    //    que pone el lienzo creaban un dibujo fantasma en cada capa nueva y
    //    dejaban Deshacer en bucle ──
    {
      const PLANOS = '<g data-low-art="colour" aria-label="Color"></g><g data-low-art="line" aria-label="Línea"></g>';
      ok("los planos de arte vacíos cuentan como dibujo vacío",
        animation.drawingIsEmpty(PLANOS) && animation.drawingIsEmpty("") && animation.drawingIsEmpty(null));
      ok("un plano con algo adentro NO está vacío",
        !animation.drawingIsEmpty('<g data-low-art="line"><path d="M0 0L1 1"/></g>'));
      const doc = new animation.LowDoc(), h = new LOW.core.HistoryManager(); doc.setHistory(h);
      const ly = doc.addLayer();
      const pila = h.undoStack.length;
      ok("volcar una hoja vacía en una capa nueva no crea dibujo",
        doc.writeDrawing(PLANOS) === false && ly.cellAt(doc.frame) == null && h.undoStack.length === pila);
      doc.writeDrawing('<g data-low-art="line"><path d="M0 0L9 9"/></g>');
      ok("dibujar de verdad sí crea el dibujo", ly.cellAt(doc.frame) != null);
      // Deshacer el trazo lo deja vacío; el lienzo repinta los planos y el volcado vuelve a escribir.
      for (let i = 0; i < 10 && h.undoStack.length > pila; i++) {   // tope: con el defecto, esto no termina
        h.undo();
        doc.writeDrawing(PLANOS);      // lo que hace dzMarkDirty después de repintar
      }
      ok("deshacer el trazo NO apila otro «Dibujar» (sin bucle)", h.undoStack.length === pila, h.undoStack.map((e) => e.label).join(","));
      h.undo();
      ok("y el siguiente Deshacer quita la capa", !doc.scene.layer(ly.id));
    }

    // ── CAPAS COMO EN HARMONY/PHOTOSHOP (v4.52): orden, fusión, mesa de luz,
    //    eliminar y duplicar, todo con Deshacer y por archivo ──
    {
      const doc = new animation.LowDoc(), h = new LOW.core.HistoryManager(); doc.setHistory(h);
      doc.writeDrawing('<rect id="a"/>');
      const A = doc.layer, B = doc.addLayer("B"), C = doc.addLayer("C");
      doc.writeDrawing('<circle id="c"/>');
      const orden = () => doc.scene.layers.map((l) => l.name).join(",");
      const inicio = orden();
      ok("reordenar: llevar C al fondo", doc.moveLayer(C.id, 0) && orden() === "C," + A.name + ",B", orden());
      h.undo(); ok("reordenar: Deshacer vuelve al orden", orden() === inicio, orden());
      h.redo(); ok("reordenar: Rehacer repite", orden().startsWith("C,"), orden());
      h.undo();
      ok("reordenar al mismo lugar no apila historial", doc.moveLayer(C.id, 2) === false);

      ok("fusión válida se aplica", doc.setLayerProperty(B.id, "blend", "multiply") && B.blend === "multiply");
      ok("fusión inválida se rechaza", doc.setLayerProperty(B.id, "blend", "linear-burn") === false && B.blend === "multiply");
      doc.setLayerProperty(B.id, "lightTable", true);
      doc.setLayerProperty(B.id, "opacity", 7);
      ok("opacidad fuera de rango se acota", B.opacity === 1);
      const reab = animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
      const rB = reab.scene.layer(B.id);
      ok("fusión y mesa de luz sobreviven a guardar y reabrir", rB && rB.blend === "multiply" && rB.lightTable === true);
      ok("una fusión inválida en el archivo vuelve a normal",
        new animation.Layer({ blend: "nada" }).blend === "normal" && new animation.Layer({}).lightTable === false);
      const lvRef = doc.scene.addLevel("Calco", "reference");
      ok("el nivel de calco conserva su tipo al reabrir",
        new animation.Scene(JSON.parse(JSON.stringify(doc.scene.toJSON()))).level(lvRef.id).type === "reference");

      const dup = doc.duplicateLayer(C.id);
      const lvDup = dup && doc.scene.level(dup.levelId), lvC = doc.scene.level(C.levelId);
      ok("duplicar pone la copia ENCIMA de la original", dup && doc.scene.layers.indexOf(dup) === doc.scene.layers.indexOf(C) + 1);
      ok("duplicar copia los dibujos en un nivel propio", lvDup && lvDup !== lvC && lvDup.byNumber(1) &&
        lvDup.byNumber(1).content.includes("circle"));
      lvDup.byNumber(1).content = "<rect/>";
      ok("retocar la copia no toca la original", lvC.byNumber(1).content.includes("circle"));
      const niveles = doc.scene.levels.length;
      h.undo();
      ok("Deshacer duplicar quita capa Y nivel", !doc.scene.layer(dup.id) && doc.scene.levels.length === niveles - 1);

      const nivelesAntes = doc.scene.levels.length;
      ok("eliminar una capa", doc.removeLayer(C.id) && !doc.scene.layer(C.id) && doc.scene.levels.length === nivelesAntes - 1);
      ok("eliminar la activa deja otra activa", !!doc.scene.layer(doc.layerId));
      h.undo();
      const vuelta = doc.scene.layer(C.id);
      ok("Deshacer eliminar la devuelve con su dibujo y en su lugar",
        vuelta && doc.scene.layers.indexOf(vuelta) === 2 && doc.scene.drawingAt(C.id, 1) &&
        doc.scene.drawingAt(C.id, 1).content.includes("circle"));
      const sola = new animation.LowDoc();
      ok("no se elimina la ÚLTIMA capa", sola.removeLayer(sola.layerId) === false && sola.scene.layers.length === 1);
    }

    const fallan = res.filter((r) => !r.ok);
    return { total: res.length, ok: res.length - fallan.length, fallan, detalle: res };
  }

  animation.runTests = runTests;
})(window);
