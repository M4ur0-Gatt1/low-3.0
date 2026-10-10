/* LAS FLECHAS MUEVEN LO SELECCIONADO, NO EL TIEMPO. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026, LOW 3.13): «el atajo para mover los frames
   debe ser únicamente el punto y la coma, no las flechas. Las flechas deben
   mover los vectores en la pantalla, como en Illustrator: tengo un círculo
   que quiero desplazar lo mínimo posible, de a un pasito, y en lugar de eso
   se mueve la línea de tiempo».

   Las flechas estaban tomadas por los atajos de animación (en captura): ← →
   cambiaban de cuadro y ↑ ↓ de dibujo, aunque hubiera algo seleccionado.

   Con el teclado y el ratón de verdad, en el espacio de Animación:
   1. Un círculo seleccionado: → lo corre 1 unidad, Shift+→ 10, ← y ↑ hacia
      su lado; el cuadro NO cambia.
   2. Tres flechas seguidas se deshacen con UN Ctrl+Z.
   3. Sin nada seleccionado, las flechas no cambian de cuadro.
   4. «.» y «,» siguen cambiando de cuadro; Alt+. y Alt+, van de dibujo en
      dibujo (lo que antes hacían ↑ ↓). */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const FLECHA = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40 };

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
  const flecha = async (k, mods = 0) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code: k, windowsVirtualKeyCode: FLECHA[k], modifiers: mods });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: k, windowsVirtualKeyCode: FLECHA[k], modifiers: mods });
    await wait(120);
  };
  const tecla = async (key, code, vk, mods = 0, text) => {
    await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers: mods, ...(text ? { text } : {}) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers: mods });
    await wait(200);
  };
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
  const pantalla = (x, y) => ev(`(()=>{ const q = dzToScreen(${x}, ${y}), r = document.querySelector("#dzCanvas").getBoundingClientRect(); return [q.x + r.left, q.y + r.top]; })()`);
  // dónde está el círculo, en unidades del documento
  // (sin los fantasmas del papel cebolla, que copian el dibujo de al lado)
  const lugar = () => ev(`(()=>{ const c = [...document.querySelectorAll('#dzCanvas > svg circle[data-prueba]')].find(n => !n.closest('.dz-onion')); const r = c.getBoundingClientRect();
    const a = dzToUser(r.left, r.top); return { x: +a.x.toFixed(2), y: +a.y.toFixed(2) }; })()`);
  const soltarFoco = () => ev('(()=>{ const a = document.activeElement; if (a && a.blur) a.blur(); return 1; })()');

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} window.__paginaVieja = 1; return true; })()');
    await send("Page.reload");
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); DZ.zoom = .5; DZ.panX = 0; DZ.panY = 0; dzApplyZoom(); return 1; })()'); await wait(300);

    // dos dibujos (cuadros 1 y 3, con un sostenido en el 2) y un círculo en el 1
    const DIB = (x) => '<g data-low-art="colour"></g><g data-low-art="line"><circle data-prueba="1" cx="' + x + '" cy="540" r="120" fill="none" stroke="#111" stroke-width="10"/></g>';
    await ev(`(()=>{ DZ.doc.goTo(1); DZ.doc.writeDrawing(${JSON.stringify(DIB(700))}); DZ.doc.goTo(3); DZ.doc.writeDrawing(${JSON.stringify(DIB(1100))});
      DZ.doc.setCell(2, DZ.doc.scene.layers[0].cellAt(1)); DZ.doc.goTo(1); DZ.doc.emit("frame"); return 1; })()`);
    await wait(600);

    // ── 1. seleccionar con el ratón y mover con las flechas ────────────────
    await ev('(()=>{ dzSetTool("select"); return 1; })()');
    const borde = await pantalla(700 + 120, 540);
    await mouse("mouseMoved", borde[0], borde[1]); await mouse("mousePressed", borde[0], borde[1], { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", borde[0], borde[1], { buttons: 0, clickCount: 1 }); await wait(400);
    assert.ok(await ev("!!DZ.sel"), "no quedó seleccionado el círculo para moverlo");
    await soltarFoco();
    const p0 = await lugar();
    await flecha("ArrowRight");
    const p1 = await lugar();
    assert.equal(await ev("DZ.doc.frame"), 1, "→ con algo seleccionado cambió de cuadro (se movió la línea de tiempo)");
    assert.ok(Math.abs(p1.x - p0.x - 1) < .2 && Math.abs(p1.y - p0.y) < .2, "→ no corrió el círculo 1 unidad: " + JSON.stringify({ p0, p1 }));
    await flecha("ArrowRight", 8);
    const p2 = await lugar();
    assert.ok(Math.abs(p2.x - p1.x - 10) < .2, "Shift+→ no corrió el círculo 10 unidades: " + JSON.stringify({ p1, p2 }));
    await flecha("ArrowLeft"); await flecha("ArrowUp");
    const p3 = await lugar();
    assert.ok(Math.abs(p3.x - p2.x + 1) < .2 && Math.abs(p3.y - p2.y + 1) < .2, "← y ↑ no lo corrieron hacia su lado: " + JSON.stringify({ p2, p3 }));
    assert.equal(await ev("DZ.doc.frame"), 1, "las flechas cambiaron de cuadro");

    // ── 2. tres flechas seguidas = un solo Ctrl+Z ───────────────────────────
    // (una pausa: las flechas de recién son otra tanda, otro paso de deshacer)
    await wait(1100);
    const antes = await lugar();
    await flecha("ArrowDown"); await flecha("ArrowDown"); await flecha("ArrowDown");
    const abajo = await lugar();
    assert.ok(Math.abs(abajo.y - antes.y - 3) < .3, "tres ↓ no bajaron 3 unidades: " + JSON.stringify({ antes, abajo }));
    await wait(900);
    await tecla("z", "KeyZ", 90, 2);
    await wait(400);
    const deshecho = await lugar();
    assert.ok(Math.abs(deshecho.y - antes.y) < .3 && Math.abs(deshecho.x - antes.x) < .3, "un Ctrl+Z no deshizo las tres flechas juntas: " + JSON.stringify({ antes, abajo, deshecho }));

    // ── 3. sin selección, las flechas no tocan el tiempo ────────────────────
    await ev('(()=>{ if (typeof dzDeselect === "function") dzDeselect(); else { DZ.sel = null; DZ.multi = []; } return 1; })()'); await soltarFoco();
    for (const k of ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"]) await flecha(k);
    assert.equal(await ev("DZ.doc.frame"), 1, "sin selección, las flechas cambiaron de cuadro");

    // ── 4. «.» «,» cuadros; Alt+. Alt+, dibujos ─────────────────────────────
    await tecla(".", "Period", 190, 0, ".");
    assert.equal(await ev("DZ.doc.frame"), 2, "«.» no avanzó un cuadro");
    await tecla(",", "Comma", 188, 0, ",");
    assert.equal(await ev("DZ.doc.frame"), 1, "«,» no retrocedió un cuadro");
    await tecla(".", "Period", 190, 1);
    assert.equal(await ev("DZ.doc.frame"), 3, "Alt+. no saltó al dibujo siguiente (saltando el sostenido del 2)");
    await tecla(",", "Comma", 188, 1);
    assert.equal(await ev("DZ.doc.frame"), 1, "Alt+, no volvió al dibujo anterior");

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E flechas mueven lo seleccionado OK " + JSON.stringify({ p0, p1, p2, p3 }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
