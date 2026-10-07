/* DIBUJAR UN CÍRCULO CHICO CON LA TABLETA NO SELECCIONA NADA. CDP :9223 + mock :8791.

   Reporte de Mauro (oct-2026): «cuando doy la vuelta completa con la tableta,
   como dibujando un pequeño círculo, se activa la herramienta de selección…
   me pasa siempre o casi siempre». En la captura: el marco «1 pieza» sobre lo
   recién dibujado.

   La causa: Windows convierte la PULSACIÓN LARGA del lápiz en un clic derecho
   (la punta queda dentro de un radio chico un instante: un círculo chico y
   lento nunca sale de ese radio). El clic derecho en el lienzo SELECCIONA lo
   que hay abajo para abrir el menú, y abajo estaba el trazo recién hecho.
   El botón lateral del lápiz, apretado sin querer al girarlo, hace lo mismo.

   Con el lápiz simulado (pointerType "pen") por CDP:
   1. Un círculo chico con el Lápiz y, enseguida, el clic derecho del lápiz
      (lo que manda Windows): no selecciona, no abre menú, sigue el Lápiz.
   2. El clic derecho del MOUSE sigue abriendo el menú y seleccionando.
   3. El clic derecho del lápiz con la punta EN EL AIRE (el botón lateral,
      lejos de un trazo) también abre el menú. */
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
  const pen = (type, x, y, force, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", pointerType: "pen", force, ...extra });
  const derecho = async (x, y, tipo) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "right", buttons: 2, clickCount: 1, pointerType: tipo });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "right", buttons: 0, clickCount: 1, pointerType: tipo });
    await wait(250);
  };
  const estado = () => ev(`({ tool: DZ.tool, sel: !!DZ.sel, menu: !!document.querySelector(".ctx-command-menu") })`);
  const cerrarMenu = () => ev(`(()=>{ if (typeof closeCtxMenu === "function") closeCtxMenu(); if (typeof dzDeselect === "function") dzDeselect(); return true; })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); dzSetTool("pencil"); return true; })()'); await wait(200);
    const c = await ev(`(()=>{ const r = document.querySelector("#dzCanvas > svg").getBoundingClientRect(); return [r.x + r.width * .5, r.y + r.height * .5]; })()`);

    // ── 1. el círculo chico con el lápiz y el clic derecho de Windows ───────
    const p = (t) => [c[0] + Math.cos(t) * 14, c[1] + Math.sin(t) * 14];
    const [x0, y0] = p(0);
    await pen("mouseMoved", x0, y0, 0); await pen("mousePressed", x0, y0, .6, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 24; i++) { const [x, y] = p(i / 24 * Math.PI * 2); await pen("mouseMoved", x, y, .6, { buttons: 1 }); await wait(20); }
    await pen("mouseReleased", x0, y0, 0, { buttons: 0, clickCount: 1 });
    await wait(60);
    await derecho(x0, y0, "pen");
    const tras = await estado();
    assert.ok(await ev(`document.querySelectorAll('#dzCanvas > svg g[data-low-art] path').length >= 1`), "el círculo no se dibujó");
    assert.deepEqual(tras, { tool: "pencil", sel: false, menu: false }, "la pulsación larga del lápiz al cerrar un círculo seleccionó el trazo o abrió el menú: " + JSON.stringify(tras));
    // según el controlador, Windows lo manda como si fuera del MOUSE: también se descarta
    const [x1, y1] = p(Math.PI);
    await pen("mouseMoved", x0, y0, 0); await pen("mousePressed", x0, y0, .6, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i++) { const [x, y] = p(i / 12 * Math.PI * 2); await pen("mouseMoved", x, y, .6, { buttons: 1 }); await wait(20); }
    await pen("mouseReleased", x0, y0, 0, { buttons: 0, clickCount: 1 }); await wait(60);
    await derecho(x1, y1, "mouse");
    const comoMouse = await estado();
    assert.deepEqual(comoMouse, { tool: "pencil", sel: false, menu: false }, "la pulsación larga que Windows manda como clic del mouse seleccionó el trazo: " + JSON.stringify(comoMouse));

    // ── 2. el clic derecho del mouse sigue andando ─────────────────────────
    await wait(800);
    await derecho(x0, y0, "mouse");
    const mouse = await estado();
    assert.ok(mouse.menu && mouse.sel, "el clic derecho del mouse ya no abre el menú ni selecciona: " + JSON.stringify(mouse));
    await cerrarMenu(); await wait(200);

    // ── 3. el botón lateral con la punta en el aire, lejos de un trazo ─────
    await pen("mouseMoved", c[0] + 200, c[1] + 100, 0); await wait(900);
    await derecho(c[0] + 200, c[1] + 100, "pen");
    const lateral = await estado();
    assert.ok(lateral.menu, "el botón lateral del lápiz (en el aire, lejos de un trazo) ya no abre el menú: " + JSON.stringify(lateral));
    await cerrarMenu();

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E pulsación larga del lápiz OK", JSON.stringify({ tras, mouse, lateral }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e); process.exit(1); });
