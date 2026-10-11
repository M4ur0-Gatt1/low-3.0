/* MESA SOLA (F) Y MODO DIBUJO (Tab). CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026, LOW 3.17): «quiero que la F sirva para dejar la
   mesa de trabajo sola, como en Photoshop». Y al revisarlo: el «Modo dibujo»
   de Tab dejaba a la vista la X-sheet, los dibujos del nivel, la línea de
   tiempo nueva y las pestañas (los paneles que se sumaron después de su lista).

   Con las teclas de verdad, en Animación, con un mapa de atajos GUARDADO por
   una versión anterior (que trae zoomfit:"f"):
   1. F → queda la hoja sola: no se ve la X-sheet, ni la línea de tiempo, ni
      las herramientas, ni el menú. Se puede dibujar igual (N + un trazo).
   2. F otra vez → vuelve todo.
   3. Tab → la hoja y las herramientas; nada más. Esc → vuelve todo.
   4. Ctrl+0 (como Photoshop) y Alt+F → ajustan a la pantalla (no esconden
      nada); Shift+F sigue enderezando la mesa. */
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
  const tecla = async (key, code, vk, mods = 0, text) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers: mods });
    if (text) await send("Input.dispatchKeyEvent", { type: "char", key, code, text, windowsVirtualKeyCode: vk, modifiers: mods });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers: mods }); await wait(600);
  };
  /** ¿se ve? (tiene caja y nada lo esconde) */
  const ve = (sel) => ev(`(()=>{ const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return "no existe"; const r = e.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return false;
    for (let n = e; n; n = n.parentElement) { const s = getComputedStyle(n); if (s.display === "none" || s.visibility === "hidden") return false; } return true; })()`);
  const cuantoSeVe = () => ev(`(()=>{ const out = {}; for (const [k, s] of Object.entries({ hoja: "#dzCanvas", xsheet: "#dzXsheet", tiempo: "#dzTlGrid", herramientas: ".dz-tools", menu: "#dzMenubar", pestanias: "#dzWorkspaces", estado: "#dzStatusbar" })) {
    const e = document.querySelector(s); if (!e) { out[k] = "no existe"; continue; } const r = e.getBoundingClientRect(); let v = r.width > 0 && r.height > 0;
    for (let n = e; v && n; n = n.parentElement) { const st = getComputedStyle(n); if (st.display === "none" || st.visibility === "hidden") v = false; } out[k] = v; } return out; })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    // un mapa guardado por una versión anterior: trae zoomfit:"f" sin que nadie lo haya elegido
    await ev(`(()=>{ try{ localStorage.clear(); sessionStorage.clear(); localStorage.setItem("low.workspace.active","animation");
      localStorage.setItem("low.dzkeys", JSON.stringify({ zoomfit: "f", zen: "tab", pencil: "n" })); }catch(e){} window.__paginaVieja = 1; return true; })()`);
    await send("Page.reload");
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev(`(()=>{ if (typeof closeL3d === "function") closeL3d(); return 1; })()`);
    const todo = await cuantoSeVe();
    assert.deepEqual(todo, { hoja: true, xsheet: true, tiempo: true, herramientas: true, menu: true, pestanias: true, estado: true }, "el punto de partida no muestra todo: " + JSON.stringify(todo));
    await mouse("mousePressed", 600, 300, { buttons: 1, clickCount: 1 }); await mouse("mouseReleased", 600, 300, { clickCount: 1 }); await wait(200);

    // 1. F: la hoja sola, y se puede dibujar
    await tecla("f", "KeyF", 70, 0, "f");
    let v = await cuantoSeVe();
    assert.deepEqual(v, { hoja: true, xsheet: false, tiempo: false, herramientas: false, menu: false, pestanias: false, estado: false }, "F no dejó la hoja sola: " + JSON.stringify(v));
    assert.equal(await ve(".dz-mesa-salir"), true, "no está el botón para volver");
    await tecla("n", "KeyN", 78, 0, "n");
    assert.equal(await ev("DZ.tool"), "pencil", "en la mesa sola no se pudo elegir el lápiz con N");
    const antes = await ev(`document.querySelectorAll("#dzCanvas > svg [data-low-art] > *").length`);
    await mouse("mouseMoved", 500, 300); await mouse("mousePressed", 500, 300, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i++) { await mouse("mouseMoved", 500 + i * 30, 300 + Math.sin(i) * 20, { buttons: 1 }); await wait(18); }
    await mouse("mouseReleased", 860, 300, { buttons: 0, clickCount: 1 }); await wait(600);
    assert.ok(await ev(`document.querySelectorAll("#dzCanvas > svg [data-low-art] > *").length`) > antes, "en la mesa sola no se pudo dibujar");

    // 2. F otra vez: vuelve todo
    await tecla("f", "KeyF", 70, 0, "f");
    v = await cuantoSeVe();
    assert.deepEqual(v, todo, "F otra vez no devolvió los paneles: " + JSON.stringify(v));

    // 3. Tab: hoja y herramientas; Esc vuelve
    await tecla("Tab", "Tab", 9);
    v = await cuantoSeVe();
    assert.deepEqual(v, { hoja: true, xsheet: false, tiempo: false, herramientas: true, menu: false, pestanias: false, estado: false }, "Tab no dejó sólo hoja y herramientas (la X-sheet o la línea de tiempo nueva quedaban a la vista): " + JSON.stringify(v));
    await tecla("Escape", "Escape", 27);
    v = await cuantoSeVe();
    assert.deepEqual(v, todo, "Esc no devolvió los paneles: " + JSON.stringify(v));

    // 4. Ctrl+0 (como Photoshop) y Alt+F ajustan a la pantalla y no esconden nada
    await ev("DZ.zoom = 3; dzApplyZoom(), 1");
    await tecla("0", "Digit0", 48, 2);
    v = await cuantoSeVe();
    assert.deepEqual(v, todo, "Ctrl+0 escondió paneles: " + JSON.stringify(v));
    assert.ok(await ev("DZ.zoom") < 3, "Ctrl+0 no ajustó a la pantalla");
    await ev("DZ.zoom = 3; dzApplyZoom(), 1");
    await tecla("f", "KeyF", 70, 1);
    assert.ok(await ev("DZ.zoom") < 3, "Alt+F no ajustó a la pantalla");
    assert.deepEqual(await cuantoSeVe(), todo, "Alt+F escondió paneles");
    // Shift+F sigue siendo «Enderezar la mesa»
    await ev("DZ.viewRot = 30; dzApplyZoom(), 1");
    await tecla("F", "KeyF", 70, 8, "F");
    assert.equal(await ev("DZ.viewRot || 0"), 0, "Shift+F ya no endereza la mesa");

    assert.deepEqual(errores, [], "errores de JS: " + errores.join(" | "));
    console.log("OK mesa sola: F deja la hoja sola (y se dibuja), Tab hoja + herramientas, Esc y F vuelven, Ctrl+0 y Alt+F ajustan, Shift+F endereza");
  } finally {
    ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
