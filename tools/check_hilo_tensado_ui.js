/* LA REGLA / HILO TENSADO SIGUE ANDANDO. CDP :9223 + mock :8791.

   Mauro (oct-2026, LOW 3.17): «antes tenía una función que al apretar Shift
   me hacía las líneas como un hilo tensado, recto, muy útil para dibujar
   perspectivas y objetos 3D… me preocupa que se pierdan funcionalidades».

   Es la herramienta Regla / Hilo tensado (U). Este guardia la recorre entera
   con el ratón y el teclado de verdad, en un .low:
   1. U la elige; se ve en la barra de herramientas.
   2. Clic en A → banda elástica que sigue al puntero; clic en B → queda una
      línea de A a B, y sigue desde B (trazado continuo); Esc corta.
   3. Shift: la línea se ajusta a múltiplos de 15°.
   4. Clic derecho fija un punto de fuga: la línea siguiente se tensa hacia él
      (perspectiva). */
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
  const P = (x, y) => ev(`(()=>{ const q = dzToScreen(${x}, ${y}), r = document.querySelector("#dzCanvas").getBoundingClientRect(); return [q.x + r.left, q.y + r.top]; })()`);
  const clic = async ([x, y], { boton = "left", mods = 0 } = {}) => {
    await mouse("mouseMoved", x, y, { modifiers: mods }); await mouse("mousePressed", x, y, { button: boton, buttons: boton === "right" ? 2 : 1, clickCount: 1, modifiers: mods });
    await wait(30); await mouse("mouseReleased", x, y, { button: boton, buttons: 0, clickCount: 1, modifiers: mods }); await wait(250);
  };
  const tecla = async (key, code, vk, text) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk });
    if (text) await send("Input.dispatchKeyEvent", { type: "char", key, code, text, windowsVirtualKeyCode: vk });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk }); await wait(350);
  };
  /** las líneas dibujadas (en unidades del dibujo): [x1, y1, x2, y2] */
  const lineas = () => ev(`[...document.querySelectorAll('#dzCanvas > svg g[data-low-art] > *')].filter(n => !n.closest(".dz-onion")).map(n => {
    if (n.tagName === "line") return [+n.getAttribute("x1"), +n.getAttribute("y1"), +n.getAttribute("x2"), +n.getAttribute("y2")].map(Math.round);
    const L = n.getTotalLength ? n.getTotalLength() : 0; if (!L) return null; const a = n.getPointAtLength(0), b = n.getPointAtLength(L); return [a.x, a.y, b.x, b.y].map(Math.round); }).filter(Boolean)`);
  const angulo = (l) => Math.atan2(l[3] - l[1], l[2] - l[0]) * 180 / Math.PI;

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); sessionStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} window.__paginaVieja = 1; return true; })()');
    await send("Page.reload");
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev(`(()=>{ if (typeof closeL3d === "function") closeL3d(); DZ.zoom = .5; DZ.panX = 0; DZ.panY = 0; dzApplyZoom(); return 1; })()`);
    await mouse("mousePressed", 700, 300, { buttons: 1, clickCount: 1 }); await mouse("mouseReleased", 700, 300, { clickCount: 1 }); await wait(200);

    // 1. U la elige, y está a la vista en la barra
    await tecla("u", "KeyU", 85, "u");
    assert.equal(await ev("DZ.tool"), "ruler", "U no elige la Regla / Hilo tensado");
    const enBarra = await ev(`(()=>{ const b = document.querySelector('[data-tool="ruler"]'); if (!b) return "no existe"; const r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; })()`);
    assert.equal(enBarra, true, "la Regla / Hilo tensado no se ve en la barra de herramientas");

    // 2. A → banda elástica → B: una línea; sigue desde B; Esc corta
    await clic(await P(300, 300));
    const c = await P(900, 520);
    await mouse("mouseMoved", c[0], c[1]); await wait(200);
    const banda = await ev(`(()=>{ const r = typeof RULER !== "undefined" && RULER; return !!(r && r.el && r.el.isConnected); })()`);
    assert.ok(banda, "no aparece la banda elástica mientras se mueve");
    await clic(await P(900, 300));
    await clic(await P(900, 700));
    await tecla("Escape", "Escape", 27);
    let L = await lineas();
    assert.equal(L.length, 2, "no quedaron las dos líneas del trazado continuo: " + JSON.stringify(L));
    assert.ok(Math.abs(L[0][0] - 300) < 3 && Math.abs(L[0][2] - 900) < 3 && Math.abs(L[0][1] - 300) < 3, "la primera línea no va de A a B: " + JSON.stringify(L[0]));
    assert.ok(Math.abs(L[1][0] - 900) < 3 && Math.abs(L[1][1] - 300) < 3, "la segunda no sigue desde B: " + JSON.stringify(L[1]));
    // quedan en el DOCUMENTO, no sólo en pantalla: ir a otro cuadro y volver las redibuja desde el .low
    await wait(500);
    await ev(`(()=>{ DZ.doc.goTo(2); return 1; })()`); await wait(400);
    await ev(`(()=>{ DZ.doc.goTo(1); return 1; })()`); await wait(600);
    assert.equal((await lineas()).length, 2, "las líneas del hilo tensado no quedaron guardadas en el documento (o se guardó la banda punteada de la vista previa)");
    assert.equal(await ev(`(DZ.doc.drawing.content.match(/ruler-guide/g) || []).length`), 0, "la banda punteada de la vista previa quedó guardada en el dibujo");

    // 3. Shift: múltiplos de 15°
    await clic(await P(300, 900));
    await clic(await P(800, 760), { mods: 8 });   // 15,6° a mano → 15°
    await tecla("Escape", "Escape", 27);
    L = await lineas();
    const a = angulo(L[L.length - 1]);
    assert.ok(Math.abs(Math.round(a / 15) * 15 - a) < .5, "con Shift la línea no quedó en múltiplo de 15°: " + a.toFixed(2) + "°");

    // 4. punto de fuga: clic derecho, y la línea siguiente se tensa hacia él
    await clic(await P(1700, 200), { boton: "right" });
    assert.equal(await ev("(RULER && RULER.vp && RULER.vp.length) || 0"), 1, "el clic derecho no fijó un punto de fuga");
    await clic(await P(1100, 800));
    await clic(await P(1300, 760));
    await tecla("Escape", "Escape", 27);
    L = await lineas();
    const ul = L[L.length - 1];
    // la recta de A hacia el punto de fuga (1700,200): la línea tiene que estar sobre ella
    const dir = Math.atan2(200 - 800, 1700 - 1100) * 180 / Math.PI;
    assert.ok(Math.abs(angulo(ul) - dir) < 2, "la línea no se tensó hacia el punto de fuga: " + angulo(ul).toFixed(1) + "° vs " + dir.toFixed(1) + "°");

    assert.deepEqual(errores, [], "errores de JS: " + errores.join(" | "));
    console.log("OK hilo tensado: U, banda elástica, trazado continuo, Shift 15°, punto de fuga");
  } finally {
    ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
