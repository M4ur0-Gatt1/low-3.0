/* INTERPOLACIÓN DE MOVIMIENTO (🏃) EN UN .low. CDP :9223 + mock :8791.

   Reporte de Mauro (oct-2026, LOW 3.16): «no me acuerdo cómo se usa el flujo
   de interpolación de movimiento, o no anda».

   No andaba. `dzReadPos` pasó a devolver una MATRIZ y `dzPosDelta` —la resta
   entre el inicio y el final— seguía esperando el formato viejo (cx, x, tx):
   daba NaN, y los seis cuadros generados escribían el objeto en
   matrix(1 0 0 1 NaN NaN). El objeto desaparecía de todos los cuadros.

   Con el ratón de verdad: un círculo, la flecha lo elige, 🏃 fija el inicio,
   se lo arrastra 800 unidades a la derecha, 🏃 otra vez, «Generar».
   Comprueba que:
   1. la ventana se abre;
   2. hay 7 cuadros: el inicio y los 6 del viaje;
   3. el círculo va de 0 a 800, siempre hacia adelante, y nunca en NaN;
   4. con la curva natural, el tramo del medio es más largo que el primero. */
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
  const clicXY = async ([x, y]) => { await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y, { buttons: 1, clickCount: 1 }); await wait(40); await mouse("mouseReleased", x, y, { buttons: 0, clickCount: 1 }); await wait(400); };
  const clicEl = async (sel) => clicXY(await ev(`(()=>{ const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`));
  const estado = () => ev(`[...document.querySelectorAll("#dzStatusbar span")].map(s => s.textContent).pop()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} window.__paginaVieja = 1; return true; })()');
    await send("Page.reload");
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev(`(()=>{ if (typeof closeL3d === "function") closeL3d();
      dzCanvasSet('<g data-low-art="colour"></g><g data-low-art="line"><circle id="bola" cx="400" cy="540" r="80" fill="none" stroke="#111" stroke-width="12"/></g>');
      dzDocCommit(); DZ.zoom = .5; DZ.panX = 0; DZ.panY = 0; dzApplyZoom(); dzSetTool("select"); dzDeselect(); return 1; })()`);
    await wait(500);

    // el borde del círculo a 45°: lejos de las manijas de escala
    await clicXY(await P(456, 484));
    assert.equal(await ev("DZ.sel && DZ.sel.id"), "bola", "el clic no eligió el círculo");
    await clicEl("#tlMove");
    assert.match(await estado(), /INICIO fijado/, "el primer 🏃 no fijó el inicio");
    const a = await P(456, 484), b = await P(1256, 484);
    await mouse("mouseMoved", a[0], a[1]); await mouse("mousePressed", a[0], a[1], { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i++) { await mouse("mouseMoved", a[0] + (b[0] - a[0]) * i / 12, a[1], { buttons: 1 }); await wait(25); }
    await mouse("mouseReleased", b[0], b[1], { buttons: 0, clickCount: 1 }); await wait(400);
    await clicEl("#tlMove");
    assert.ok(await ev(`!!document.getElementById("mtGo")`), "el segundo 🏃 no abrió la ventana: " + await estado());
    await clicEl("#mtGo"); await wait(2500);
    assert.match(await estado(), /6 cuadros generados/, "no generó: " + await estado());

    const xs = await ev(`(()=>{ const ly = DZ.doc.layer, out = [];
      for (let f = 1; f <= 7; f++) { const d = DZ.doc.scene.drawingAt(ly.id, f); const c = d && d.content.match(/<circle[^>]*>/);
        const t = c && c[0].match(/matrix\\(([^)]*)\\)/); out.push(t ? +t[1].split(/[ ,]+/)[4] : (c ? 0 : null)); }
      return out; })()`);
    assert.equal(await ev(`DZ.doc.layer.cells.filter(c => c != null).length`), 7, "no hay 7 cuadros: " + JSON.stringify(xs));
    assert.ok(xs.every((x) => Number.isFinite(x)), "el círculo quedó en NaN o faltó en algún cuadro: " + JSON.stringify(xs));
    assert.ok(Math.abs(xs[0]) < 1 && Math.abs(xs[6] - 800) < 2, "no va de 0 a 800: " + JSON.stringify(xs));
    for (let i = 1; i < 7; i++) assert.ok(xs[i] > xs[i - 1], "no avanza siempre: " + JSON.stringify(xs));
    assert.ok(xs[3] - xs[2] > xs[1] - xs[0], "la curva natural no acelera en el medio: " + JSON.stringify(xs));

    assert.deepEqual(errores, [], "errores de JS: " + errores.join(" | "));
    console.log("OK interpolacion de movimiento:", JSON.stringify(xs.map(Math.round)));
  } finally {
    ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
