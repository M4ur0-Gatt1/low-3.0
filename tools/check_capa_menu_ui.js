/* CLIC DERECHO EN UNA CAPA. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026, LOW 3.18): «me falta el flujo para eliminar
   capas enteras de la línea de tiempo; quizá clic derecho y opciones de
   renombrar, mover, enviar al fondo, traer adelante o eliminar la capa».
   Eliminar existía, pero escondido en el botón de propiedades de la capa.

   Con el ratón de verdad, en Animación, con tres capas (A abajo, B, C arriba):
   1. Clic derecho en el NOMBRE de A en la línea de tiempo → menú de la capa.
   2. Renombrar… → «Fondo».
   3. Traer al frente → Fondo queda arriba de todo; Enviar al fondo → abajo.
   4. Subir una posición / Bajar una posición.
   5. Duplicar capa.
   6. Eliminar capa… pide confirmación; al aceptar la capa se va; Ctrl+Z la
      devuelve con sus dibujos.
   7. El clic derecho en la cabecera de la X-sheet abre el mismo menú.
   8. Con una sola capa, «Eliminar» está apagado. */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
  const centro = (expr) => ev(`(()=>{ const e = (${expr}); if (!e) return null; e.scrollIntoView({ block: "nearest" }); const r = e.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; })()`);
  const clic = async (expr, nombre, boton = "left") => {
    const c = await centro(expr); assert.ok(c, "no se ve: " + nombre);
    await mouse("mouseMoved", c[0], c[1]); await mouse("mousePressed", c[0], c[1], { button: boton, buttons: boton === "right" ? 2 : 1, clickCount: 1 });
    await wait(30); await mouse("mouseReleased", c[0], c[1], { button: boton, buttons: 0, clickCount: 1 }); await wait(400);
  };
  const nombreTl = (n) => `[...document.querySelectorAll(".tl2-row[data-layer-row]")].find(r => r.querySelector(".tl2-name").textContent.includes(${JSON.stringify(n)}))?.querySelector(".tl2-name")`;
  const item = (label) => `[...document.querySelectorAll(".ctx-menu .ctx-item")].find(b => b.querySelector(".ctx-label").textContent.startsWith(${JSON.stringify(label)}))`;
  const orden = () => ev(`DZ.doc.scene.layers.map(l => l.name)`);   // índice 0 = la de más atrás
  const menuAbierto = () => ev(`[...document.querySelectorAll(".ctx-menu .ctx-label")].map(n => n.textContent)`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); sessionStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} window.__paginaVieja = 1; return true; })()');
    await send("Page.reload");
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    // tres capas con un círculo cada una: A (la de fábrica), B, C
    await ev(`(()=>{ if (typeof closeL3d === "function") closeL3d();
      const D = (x) => '<g data-low-art="colour"></g><g data-low-art="line"><circle cx="' + x + '" cy="540" r="90" fill="none" stroke="#111" stroke-width="10"/></g>';
      DZ.doc.setLayerProperty(DZ.doc.layerId, "name", "A"); dzCanvasSet(D(400)); dzDocCommit();
      for (const [n, x] of [["B", 900], ["C", 1400]]) { DZ.doc.addLayer(n); DZ.doc.goTo(1); dzCanvasSet(D(x)); dzDocCommit(); }
      DZ.doc.emit("layers"); DZ.doc.emit("frame"); return 1; })()`);
    await wait(700);
    assert.deepEqual(await orden(), ["A", "B", "C"], "el punto de partida no son tres capas");

    // 1. clic derecho en el nombre de A
    await clic(nombreTl("A"), "nombre de la capa A", "right");
    const menu = await menuAbierto();
    for (const l of ["Renombrar…", "Duplicar capa", "Traer al frente", "Subir una posición", "Bajar una posición", "Enviar al fondo", "Eliminar capa…"])
      assert.ok(menu.includes(l), "el menú de la capa no tiene «" + l + "»: " + JSON.stringify(menu));

    // 2. renombrar
    await clic(item("Renombrar"), "Renombrar…");
    await ev(`(()=>{ const i = document.getElementById("dzPrIn"); i.value = "Fondo"; return 1; })()`);
    await clic(`document.getElementById("dzPrOk")`, "Aceptar");
    assert.deepEqual(await orden(), ["Fondo", "B", "C"], "renombrar no cambió el nombre");

    // 3. al frente y al fondo
    await clic(nombreTl("Fondo"), "Fondo", "right"); await clic(item("Traer al frente"), "Traer al frente");
    assert.deepEqual(await orden(), ["B", "C", "Fondo"], "Traer al frente no la puso arriba de todo");
    await clic(nombreTl("Fondo"), "Fondo", "right"); await clic(item("Enviar al fondo"), "Enviar al fondo");
    assert.deepEqual(await orden(), ["Fondo", "B", "C"], "Enviar al fondo no la puso abajo de todo");

    // 4. de a una posición (y lo que no se puede, apagado)
    await clic(nombreTl("Fondo"), "Fondo", "right");
    assert.ok(await ev(`${item("Bajar una posición")}.disabled`), "«Bajar» no está apagado en la de más atrás");
    await clic(item("Subir una posición"), "Subir");
    assert.deepEqual(await orden(), ["B", "Fondo", "C"], "Subir una posición no la subió una");
    await clic(nombreTl("Fondo"), "Fondo", "right"); await clic(item("Bajar una posición"), "Bajar");
    assert.deepEqual(await orden(), ["Fondo", "B", "C"], "Bajar una posición no la bajó una");

    // 5. duplicar
    await clic(nombreTl("C"), "C", "right"); await clic(item("Duplicar capa"), "Duplicar");
    assert.equal((await orden()).length, 4, "Duplicar capa no agregó una capa: " + JSON.stringify(await orden()));

    // 6. eliminar con confirmación, y Ctrl+Z la devuelve
    const antes = await orden();
    await clic(nombreTl("B"), "B", "right"); await clic(item("Eliminar capa"), "Eliminar capa…");
    assert.ok(await ev(`!!document.getElementById("dzCfOk")`), "Eliminar no pidió confirmación");
    assert.deepEqual(await orden(), antes, "se eliminó antes de confirmar");
    await clic(`document.getElementById("dzCfOk")`, "confirmar Eliminar");
    assert.ok(!(await orden()).includes("B"), "la capa B no se eliminó: " + JSON.stringify(await orden()));
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 }); await wait(600);
    assert.deepEqual(await orden(), antes, "Ctrl+Z no devolvió la capa eliminada");
    const dibujoB = await ev(`(()=>{ const b = DZ.doc.scene.layers.find(l => l.name === "B"); const d = DZ.doc.scene.drawingAt(b.id, 1); return !!(d && /cx="900"/.test(d.content)); })()`);
    assert.ok(dibujoB, "la capa volvió sin su dibujo");

    // 7. el mismo menú desde la cabecera de la X-sheet
    await clic(`[...document.querySelectorAll(".xs2-col-head")].find(h => h.textContent.trim() === "C")`, "cabecera C de la X-sheet", "right");
    assert.ok((await menuAbierto()).includes("Enviar al fondo"), "el clic derecho en la X-sheet no abre el menú de la capa");
    await ev("closeCtxMenu(), 1");

    // 8. con una sola capa, Eliminar apagado
    await ev(`(()=>{ for (const l of DZ.doc.scene.layers.slice(1)) DZ.doc.removeLayer(l.id); return DZ.doc.scene.layers.length; })()`); await wait(500);
    const unica = (await orden())[0];
    await clic(nombreTl(unica), "la única capa", "right");
    assert.ok(await ev(`${item("Eliminar capa")}.disabled`), "con una sola capa, Eliminar no está apagado");

    assert.deepEqual(errores, [], "errores de JS: " + errores.join(" | "));
    console.log("OK menú de capa: renombrar, al frente / al fondo, subir / bajar, duplicar, eliminar con confirmación y Ctrl+Z, también desde la X-sheet");
  } finally {
    ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
