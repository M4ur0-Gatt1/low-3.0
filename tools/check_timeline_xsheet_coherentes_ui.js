/* TIMELINE Y X-SHEET MUESTRAN SIEMPRE EL DOCUMENTO. CDP :9223 + mock :8791.

   Fase 1 del plan de implementación (oct-2026), P0.3. Las dos son VISTAS del
   mismo LowDoc; no hay copia de datos que sincronizar. Lo que puede fallar es
   que una vista no se entere de un cambio y quede mostrando algo VIEJO —ya
   pasó: la X-sheet decía «(vacío)» con dos capas, por una carrera—.

   El ORÁCULO: para cada capa y cada cuadro, el valor del modelo
   (`ly.cellAt(f)`: número de dibujo o vacío) tiene que ser exactamente lo que
   dice la celda de la Timeline Y la de la X-sheet. Se comprueba después de
   cada operación, venga de donde venga:

   · el botón de timing de la TIMELINE (2F sobre una selección),
   · el botón de timing de la X-SHEET (3F),
   · cambios del documento (exponer, insertar, borrar un dibujo, capa nueva),
   · Ctrl+Z y Ctrl+Y con el teclado, varias veces. */
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
  const clicEn = async (expr, que) => {
    let p = null;
    for (let i = 0; i < 30 && !p; i++) {
      p = await ev(`(()=>{const e=${expr}; if(!e) return null; e.scrollIntoView({block:"nearest",inline:"nearest"}); const r=e.getBoundingClientRect();
        if(!r.width||!r.height) return null; return {x:r.x+r.width/2, y:r.y+r.height/2};})()`);
      if (!p) await wait(100);
    }
    assert.ok(p, que);
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(350); };
  const tecla = async (key, code, vk, mods = 0) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, modifiers: mods, windowsVirtualKeyCode: vk });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers: mods, windowsVirtualKeyCode: vk }); await wait(350); };

  // EL ORÁCULO
  const oraculo = async (paso) => {
    const r = await ev(`(()=>{ const doc = DZ.doc, sc = doc.scene, malas = [];
      const hasta = Math.max(sc.lastFrame(), 12);
      const valor = (t) => { if (!t) return "sin celda"; const m = /dibujo (\\d+)/i.exec(t.title || ""); return m ? Number(m[1]) : null; };
      for (const ly of sc.layers) for (let f = 1; f <= hasta; f++) {
        const modelo = ly.cellAt(f) == null ? null : Number(ly.cellAt(f));
        const tl = document.querySelector('.tl2-cell[data-layer-id="' + ly.id + '"][data-frame="' + f + '"]');
        const xs = document.querySelector('.xs2-cell[data-layer-id="' + ly.id + '"][data-frame="' + f + '"]');
        const vt = valor(tl), vx = valor(xs);
        if (vt !== modelo || vx !== modelo) malas.push(ly.name + " F" + f + ": modelo " + modelo + " · timeline " + vt + " · x-sheet " + vx);
      }
      return { malas: malas.slice(0, 6), total: malas.length, capas: sc.layers.length }; })()`);
    assert.equal(r.total, 0, paso + ": la Timeline o la X-sheet NO muestran el documento (" + r.total + " celdas distintas): " + r.malas.join(" | "));
    return r;
  };
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!window.LOW?.workspace?.workspaces').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); if (typeof dzXsSetVisible === "function") dzXsSetVisible(true); return true; })()');
    await wait(800);
    // el material: tres dibujos en la Capa 1 con holds, A A A B B C
    await ev(`(()=>{ const doc = DZ.doc, ly = doc.layer, lv = doc.level;
      const dib = (n) => '<g data-low-art="colour"></g><g data-low-art="line"><path d="M' + n * 20 + ' 10 L 300 300" stroke="#111"/></g>';
      if (!lv.byNumber(1)) lv.addDrawing(1, dib(1)); else lv.byNumber(1).content = dib(1);
      lv.addDrawing(2, dib(2)); lv.addDrawing(3, dib(3));
      [1,1,1,2,2,3].forEach((n, i) => ly.setCell(i + 1, n));
      doc.history.clear(); doc.emit("cells"); doc.emit("level"); doc.emit("frame"); return true; })()`);
    await wait(700);
    await oraculo("arranque");

    // 1. botón de timing de la TIMELINE: seleccionar F1..F6 y «2F»
    await ev(`(()=>{ DZ.doc.selectCellRange(DZ.doc.layerId, 1, DZ.doc.layerId, 6); DZ.tlView.render(); return true; })()`);
    await clicEn(`[...document.querySelectorAll(".tl2-tools button")].find(b => b.textContent.trim() === "2F")`, "no está el «2F» de la Timeline");
    await wait(400);
    const tras2 = await oraculo("«2F» desde la Timeline");

    // 2. botón de timing de la X-SHEET: «3F» sobre la misma selección
    await ev(`(()=>{ const xs = DZ.xsView; xs.sel = { layerId: DZ.doc.layerId, from: 1, to: 4 }; xs.render(); return true; })()`);
    await clicEn(`[...document.querySelectorAll("#dzXsheet button, #dzXsheet .xs2-op")].find(b => b.textContent.trim() === "3F")`, "no está el «3F» de la X-sheet");
    await wait(400);
    await oraculo("«3F» desde la X-sheet");

    // 3. cambios del documento
    await ev(`DZ.doc.setCell(14, 2)`); await wait(300); await oraculo("exponer un dibujo");
    await ev(`DZ.doc.apply("insert", 2, 2)`); await wait(300); await oraculo("insertar cuadros");
    await ev(`DZ.doc.deleteDrawing(3)`); await wait(300); await oraculo("borrar un dibujo");
    await ev(`(()=>{ DZ.doc.addLayer("Capa 2"); DZ.doc.setCell(3, 1); return true; })()`); await wait(600);
    const conDos = await oraculo("capa nueva con una exposición");
    assert.equal(conDos.capas, 2, "no se creó la segunda capa");

    // 4. Ctrl+Z hasta el principio y Ctrl+Y de vuelta, mirando en cada paso
    const pasos = await ev("DZ.history.undoStack.length");
    assert.ok(pasos >= 6, "las operaciones no dejaron pasos de historial: " + pasos);
    for (let i = 0; i < pasos; i++) { await tecla("z", "KeyZ", 90, 2); await oraculo("Ctrl+Z nº " + (i + 1)); }
    for (let i = 0; i < pasos; i++) { await tecla("y", "KeyY", 89, 2); await oraculo("Ctrl+Y nº " + (i + 1)); }

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    assert.deepEqual(graves.slice(0, 3), [], "hubo excepciones durante el recorrido");
    console.log("E2E Timeline y X-sheet coherentes OK · " + pasos + " pasos deshechos y rehechos · celdas por vista tras «2F»: " + tras2.capas + " capa(s)");
  } finally {
    ws.close(); try { await fetch(endpoint + "/json/close/" + tab.id); } catch (_) { }
  }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
