/* SELECCIONAR VARIOS CUADROS Y EL MENÚ DEL CLIC DERECHO. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026): «tengo que poder seleccionar varios frames al
   mismo tiempo en la línea de tiempo y tener acciones de clic derecho
   relacionadas a los frames: rellenar, duplicar, reexponer, etcétera».

   Con el mouse de verdad:
   1. ARRASTRAR de una celda a otra —cruzando capas— marca el rectángulo.
   2. El CLIC DERECHO sobre la selección abre el menú de acciones de cuadro.
   3. «Duplicar los dibujos» deja copias independientes; Ctrl+Z vuelve EXACTO.
   4. «Exponer en dos» cambia el timing de las dos capas; Ctrl+Z vuelve exacto.
   5. «Copiar» y «Reexponer» en otro cuadro: reexpone SIN crear dibujos.
   6. El CUADRO SELECTOR: arrastrar SIEMPRE selecciona —también sobre lo ya
      seleccionado, que en el LOW.exe 3.2.2 movía el bloque y desordenaba la
      capa— y el rectángulo se ve mientras se arrastra.
   7. Shift+arrastrar SUMA a la selección.
   8. Alt+arrastrar MUEVE la selección entera en un paso; Ctrl+Z la devuelve
      con su selección. */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const tab = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl), pending = new Map(), errores = []; let id = 0;
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ({ data }) => { const m = JSON.parse(data);
    if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.j(Error(m.error.message)) : p.r(m.result); } };
  const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; pending.set(n, { r, j }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
  const centroCelda = async (capa, cuadro) => {
    const p = await ev(`(()=>{ const ly = DZ.doc.scene.layers[${capa}];
      const c = document.querySelector('.tl2-cell[data-layer-id="' + ly.id + '"][data-frame="${cuadro}"]');
      if (!c) return null; c.scrollIntoView({ block: "nearest", inline: "nearest" }); const r = c.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    assert.ok(p, "no está la celda de la capa " + capa + ", cuadro " + cuadro); return p; };
  const tecla = async (key, code, vk, mods = 0) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, modifiers: mods, windowsVirtualKeyCode: vk });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers: mods, windowsVirtualKeyCode: vk }); await wait(350); };
  // arrastrar de una celda a otra con el mouse de verdad; mods: 1 Alt, 2 Ctrl, 8 Shift
  let marcoVisto = false;
  const arrastrar = async (c1, f1, c2, f2, { mods = 0, conMarco = false } = {}) => {
    const a = await centroCelda(c1, f1), b = await centroCelda(c2, f2);
    await mouse("mouseMoved", a.x, a.y, { modifiers: mods }); await mouse("mousePressed", a.x, a.y, { buttons: 1, clickCount: 1, modifiers: mods });
    for (let i = 1; i <= 8; i++) { await mouse("mouseMoved", a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8, { buttons: 1, modifiers: mods }); await wait(20);
      if (conMarco && i === 5 && await ev(`!!document.querySelector(".tl2-marco")`)) marcoVisto = true; }
    await mouse("mouseReleased", b.x, b.y, { buttons: 0, clickCount: 1, modifiers: mods }); await wait(400); };
  const estado = () => ev(`(()=>{ const sc = DZ.doc.toJSON().scene; delete sc.revision; return JSON.stringify(sc); })()`);
  const clicDerecho = async (capa, cuadro) => { const p = await centroCelda(capa, cuadro);
    await mouse("mouseMoved", p.x, p.y);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "right", buttons: 2, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "right", buttons: 0, clickCount: 1 });
    await wait(300);
    return ev(`[...document.querySelectorAll(".ctx-command-menu .ctx-item")].map(b => b.textContent.trim())`); };
  const elegir = async (texto) => {
    const p = await ev(`(()=>{ const b = [...document.querySelectorAll(".ctx-command-menu .ctx-item")].find(x => x.textContent.includes(${JSON.stringify(texto)}));
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, apagado: b.disabled }; })()`);
    assert.ok(p, "el menú no tiene «" + texto + "»"); assert.ok(!p.apagado, "«" + texto + "» está apagado");
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(450); };
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!window.LOW?.workspace?.workspaces').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');
    // Capa 1: A A A B B C · Capa 2: X X Y Y
    await ev(`(()=>{ const doc = DZ.doc; const dib = (n) => '<g data-low-art="colour"></g><g data-low-art="line"><path d="M' + n * 20 + ' 10 L 300 300" stroke="#111"/></g>';
      const l1 = doc.layer, v1 = doc.level; if (v1.byNumber(1)) v1.byNumber(1).content = dib(1); else v1.addDrawing(1, dib(1));
      v1.addDrawing(2, dib(2)); v1.addDrawing(3, dib(3)); [1,1,1,2,2,3].forEach((n, i) => l1.setCell(i + 1, n));
      doc.addLayer("Capa 2"); const l2 = doc.layer, v2 = doc.level; v2.addDrawing(1, dib(7)); v2.addDrawing(2, dib(8));
      [1,1,2,2].forEach((n, i) => l2.setCell(i + 1, n));
      doc.selectLayer(l1.id); doc.history.clear(); doc.emit("cells"); doc.emit("level"); doc.emit("frame"); return true; })()`);
    await wait(800);

    // ── 1. arrastrar: de la Capa 1 F2 a la Capa 2 F5 ─────────────────────────
    const a = await centroCelda(0, 2), b = await centroCelda(1, 5);
    await mouse("mouseMoved", a.x, a.y); await mouse("mousePressed", a.x, a.y, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 8; i++) { await mouse("mouseMoved", a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8, { buttons: 1 }); await wait(20); }
    await mouse("mouseReleased", b.x, b.y, { buttons: 0, clickCount: 1 }); await wait(400);
    const sel = await ev(`(()=>{ const s = DZ.doc.cellSelection, L = DZ.doc.scene.layers;
      return { capas: s ? [L.findIndex(l => l.id === s.fromLayerId), L.findIndex(l => l.id === s.toLayerId)].sort() : null,
        desde: s && s.from, hasta: s && s.to, marcadas: document.querySelectorAll(".tl2-cell.rango").length }; })()`);
    assert.deepEqual([sel.capas, sel.desde, sel.hasta], [[0, 1], 2, 5],
      "arrastrar de la Capa 1 F2 a la Capa 2 F5 no seleccionó ese rectángulo · " + JSON.stringify(sel));
    assert.equal(sel.marcadas, 8, "la selección no se ve: tenían que quedar 8 celdas marcadas · " + JSON.stringify(sel));

    // ── 2. clic derecho: el menú ─────────────────────────────────────────────
    const items = await clicDerecho(0, 3);
    for (const t of ["Copiar", "Reexponer", "Rellenar", "Duplicar los dibujos", "Dibujo nuevo en cada celda vacía", "Exponer en dos", "Invertir", "Vaciar"])
      assert.ok(items.some((x) => x.includes(t)), "el menú del clic derecho no tiene «" + t + "»: " + items.join(" | "));
    const selTrasMenu = await ev(`DZ.doc.cellSelection && [DZ.doc.cellSelection.from, DZ.doc.cellSelection.to]`);
    assert.deepEqual(selTrasMenu, [2, 5], "el clic derecho DENTRO de la selección la achicó");

    // ── 3. duplicar los dibujos ──────────────────────────────────────────────
    const s0 = await estado(), d0 = await ev(`DZ.doc.scene.levels.reduce((n, l) => n + l.drawings.length, 0)`);
    await elegir("Duplicar los dibujos");
    const dup = await ev(`({ dibujos: DZ.doc.scene.levels.reduce((n, l) => n + l.drawings.length, 0),
      c1: DZ.doc.scene.layers[0].cells.slice(0, 6), c2: DZ.doc.scene.layers[1].cells.slice(0, 5) })`);
    // Capa 1 F2..F5 = A A B B -> 2 copias; Capa 2 F2..F5 = X Y Y _ -> 2 copias
    assert.equal(dup.dibujos - d0, 4, "duplicar no creó las 4 copias esperadas · " + JSON.stringify(dup));
    assert.ok(dup.c1[0] === 1 && dup.c1[1] === dup.c1[2] && dup.c1[1] !== 1 && dup.c1[5] === 3,
      "las celdas no exponen las copias, o se tocó fuera de la selección · " + JSON.stringify(dup));
    await tecla("z", "KeyZ", 90, 2);
    assert.equal(await estado(), s0, "Ctrl+Z después de duplicar no volvió EXACTAMENTE al estado anterior");

    // ── 4. exponer en dos ────────────────────────────────────────────────────
    await clicDerecho(0, 3); await elegir("Exponer en dos");
    assert.notEqual(await estado(), s0, "«Exponer en dos» no cambió nada");
    await tecla("z", "KeyZ", 90, 2);
    assert.equal(await estado(), s0, "Ctrl+Z después de «Exponer en dos» no volvió exacto");

    // ── 5. copiar y reexponer en otro cuadro ─────────────────────────────────
    await clicDerecho(0, 3); await elegir("Copiar");
    const itemsFuera = await clicDerecho(0, 10);   // fuera de la selección: la celda pasa a ser la selección
    assert.ok(itemsFuera.some((x) => x.includes("Reexponer")), "no está «Reexponer» · menú: " + JSON.stringify(itemsFuera) + " · selección: " + JSON.stringify(await ev("DZ.doc.cellSelection")));
    await elegir("Reexponer");
    const reex = await ev(`({ dibujos: DZ.doc.scene.levels.reduce((n, l) => n + l.drawings.length, 0),
      c1: DZ.doc.scene.layers[0].cells.slice(9, 13), c2: DZ.doc.scene.layers[1].cells.slice(9, 13) })`);
    assert.equal(reex.dibujos, d0, "reexponer CREÓ dibujos: tenía que compartirlos · " + JSON.stringify(reex));
    assert.deepEqual(reex.c1, [1, 1, 2, 2], "la Capa 1 no recibió lo copiado en F10 · " + JSON.stringify(reex));

    await tecla("z", "KeyZ", 90, 2);
    assert.equal(await estado(), s0, "Ctrl+Z después de reexponer no volvió exacto");

    // ── 6. el CUADRO SELECTOR: arrastrar otra vez sobre lo seleccionado SELECCIONA ──
    // En el LOW.exe 3.2.2, reseleccionar 1-4 arrastrando de nuevo MOVÍA el
    // bloque: la capa quedaba desordenada y en el historial.
    await arrastrar(0, 1, 0, 4);
    await arrastrar(0, 1, 0, 4, { conMarco: true });
    assert.equal(await estado(), s0, "arrastrar sobre lo ya seleccionado cambió la escena (tenía que seleccionar, no mover)");
    assert.deepEqual(await ev(`[DZ.doc.cellSelection.from, DZ.doc.cellSelection.to]`), [1, 4], "el segundo arrastre no dejó 1-4 seleccionado");
    assert.ok(marcoVisto, "mientras se arrastra no se ve el cuadro selector");
    assert.equal(await ev(`document.querySelectorAll(".tl2-marco").length`), 0, "el cuadro selector quedó dibujado al soltar");

    // ── 7. Shift+arrastrar SUMA a lo seleccionado ────────────────────────────
    await arrastrar(0, 6, 1, 7, { mods: 8 });
    const suma = await ev(`(()=>{ const s = DZ.doc.cellSelection, L = DZ.doc.scene.layers;
      return [L.findIndex(l => l.id === s.fromLayerId), L.findIndex(l => l.id === s.toLayerId), s.from, s.to]; })()`);
    assert.deepEqual(suma, [0, 1, 1, 7], "Shift+arrastrar no sumó a la selección: " + JSON.stringify(suma));

    // ── 8. Alt+arrastrar MUEVE la selección entera, en un solo paso ─────────
    await arrastrar(0, 1, 0, 3);                                   // A A A de la Capa 1
    await arrastrar(0, 2, 0, 9, { mods: 1 });                      // agarrada por F2, soltada en F9
    const movida = await ev(`({ c1: DZ.doc.scene.layers[0].cells.slice(0, 10), c2: DZ.doc.scene.layers[1].cells.slice(0, 4),
      sel: [DZ.doc.cellSelection.from, DZ.doc.cellSelection.to], pasos: DZ.doc.history.undoStack.length })`);
    assert.deepEqual(movida.c1, [2, 2, 3, null, null, null, null, 1, 1, 1], "Alt+arrastrar no dejó el bloque donde se soltó · " + JSON.stringify(movida));
    assert.deepEqual(movida.c2, [1, 1, 2, 2], "mover la Capa 1 tocó la Capa 2");
    assert.deepEqual(movida.sel, [8, 10], "la selección no acompañó al bloque movido");
    await tecla("z", "KeyZ", 90, 2);
    assert.equal(await estado(), s0, "un solo Ctrl+Z no deshizo el movimiento entero");
    assert.deepEqual(await ev(`[DZ.doc.cellSelection.from, DZ.doc.cellSelection.to]`), [1, 3], "después de Ctrl+Z la selección quedó donde había ido el bloque, sobre celdas vacías");

    // ── 9. el botón REEXPONER: lista los dibujos del nivel y expone el elegido ──
    // Mauro (oct-2026): «el botón reexponer no hace nada o no sé cómo se usa»:
    // sin copia previa sólo avisaba en la barra de estado.
    await arrastrar(0, 7, 0, 9);
    const boton = await ev(`(()=>{ const b = [...document.querySelectorAll(".tl2-tools button")].find(x => /Reexponer/.test(x.textContent));
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    assert.ok(boton, "no está el botón «Reexponer» en la barra de la línea de tiempo");
    await mouse("mouseMoved", boton.x, boton.y); await mouse("mousePressed", boton.x, boton.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", boton.x, boton.y, { buttons: 0, clickCount: 1 }); await wait(350);
    const lista = await ev(`[...document.querySelectorAll(".ctx-command-menu .ctx-item")].map(b => [b.textContent.trim(), !!b.querySelector("svg.tl2-mini")])`);
    assert.ok(["Dibujo 1", "Dibujo 2", "Dibujo 3"].every((t) => lista.some(([x, mini]) => x.startsWith(t) && mini)),
      "«Reexponer» no muestra los dibujos del nivel con su miniatura: " + JSON.stringify(lista));
    // Capa 1 = A A A B B C: el dibujo 1 está en F1 (el primer cuadro también cuenta)
    assert.ok(lista.some(([x]) => (x === "Dibujo 1 · en F1" || x.startsWith("Dibujo 1 · en F1,"))), "la lista no dice dónde está expuesto el dibujo 1: " + JSON.stringify(lista));
    const d9 = await ev(`DZ.doc.scene.levels.reduce((n, l) => n + l.drawings.length, 0)`), h9 = await ev(`DZ.doc.history.undoStack.length`);
    await elegir("Dibujo 2");
    const reexp = await ev(`({ c: DZ.doc.scene.layers[0].cells.slice(6, 9), d: DZ.doc.scene.levels.reduce((n, l) => n + l.drawings.length, 0), h: DZ.doc.history.undoStack.length })`);
    assert.deepEqual(reexp.c, [2, 2, 2], "elegir «Dibujo 2» no lo expuso en F7..F9: " + JSON.stringify(reexp));
    assert.equal(reexp.d, d9, "reexponer creó dibujos");
    assert.equal(reexp.h - h9, 1, "reexponer dejó " + (reexp.h - h9) + " pasos en el historial");
    await tecla("z", "KeyZ", 90, 2);
    assert.equal(await estado(), s0, "Ctrl+Z después de reexponer el dibujo 2 no volvió exacto");
    // y desde el clic derecho, el mismo selector
    await clicDerecho(0, 8); await elegir("Reexponer un dibujo del nivel");
    await wait(200);
    assert.ok(await ev(`!!document.querySelector(".ctx-command-menu.tl2-reexponer")`), "el clic derecho no abre el selector de dibujos");
    await tecla("Escape", "Escape", 27);

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    assert.deepEqual(graves.slice(0, 3), [], "hubo excepciones durante el recorrido");
    console.log("E2E selección de varios cuadros y clic derecho OK · " + items.length + " acciones en el menú");
  } finally {
    ws.close(); try { await fetch(endpoint + "/json/close/" + tab.id); } catch (_) { }
  }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
