/* LA PUNTERÍA RESPETA LO MOVIDO. CDP :9223 + mock :8791.

   Reporte de Mauro (oct-2026, LOW 3.15): «el seleccionador para seleccionar
   muchos objetos juntos no anda».

   Medido en la app real: el marco anda en un dibujo recién hecho, pero la
   puntería (`dzHitTest`) probaba el punto contra la geometría SIN su
   `transform`. Todo lo que tiene uno —lo movido con la flecha blanca, lo que
   está dentro de un grupo movido, lo rotado o escalado— se «tocaba» donde
   ESTUVO, no donde se ve. Entonces:
   · apretar en el hueco donde estuvo agarraba el objeto (y lo arrastraba) en
     vez de empezar el marco;
   · apretar sobre el objeto no lo encontraba, y empezaba un marco.

   Con el ratón de verdad, en un .low, una raya movida con `transform` y un
   grupo trasladado y escalado:
   1. Clic donde SE VE la raya → la elige.
   2. Clic donde se ve el círculo del grupo → elige el grupo.
   3. Marco que empieza donde ESTABA la raya (hoy vacío) → es un marco, la
      raya no se mueve, y elige las dos cosas. */
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
  /* de unidades del dibujo a la pantalla */
  const P = (x, y) => ev(`(()=>{ const q = dzToScreen(${x}, ${y}), r = document.querySelector("#dzCanvas").getBoundingClientRect(); return [q.x + r.left, q.y + r.top]; })()`);
  const clic = async ([x, y]) => { await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y, { buttons: 1, clickCount: 1 }); await wait(40); await mouse("mouseReleased", x, y, { buttons: 0, clickCount: 1 }); await wait(350); };
  const arrastre = async ([x1, y1], [x2, y2]) => {
    await mouse("mouseMoved", x1, y1); await mouse("mousePressed", x1, y1, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 14; i++) { await mouse("mouseMoved", x1 + (x2 - x1) * i / 14, y1 + (y2 - y1) * i / 14, { buttons: 1 }); await wait(20); }
    await mouse("mouseReleased", x2, y2, { buttons: 0, clickCount: 1 }); await wait(450);
  };
  const elegido = () => ev(`({ sel: DZ.sel ? (DZ.sel.id || DZ.sel.tagName) : null, multi: (DZ.multi || []).map(n => n.id || n.tagName).sort() })`);
  const caja = (sel) => ev(`(()=>{ const b = document.querySelector("#dzCanvas > svg").querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [Math.round(b.left), Math.round(b.top)]; })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} window.__paginaVieja = 1; return true; })()');
    await send("Page.reload");
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    // la raya está dibujada en (200..500, 400) pero MOVIDA: se ve en (900..1200, 600);
    // el grupo tiene un círculo en (300, 800) trasladado a (1500, 600) y escalado ×1,5
    const D = '<g data-low-art="colour"></g><g data-low-art="line">'
      + '<path id="raya" d="M 200 400 L 500 400" fill="none" stroke="#111" stroke-width="14" transform="matrix(1 0 0 1 700 200)"/>'
      + '<g id="grupo" transform="translate(1500 600) scale(1.5) translate(-300 -800)"><circle id="redondo" cx="300" cy="800" r="60" fill="#c33"/></g></g>';
    await ev(`(()=>{ if (typeof closeL3d === "function") closeL3d(); if (DZ.onionOn) { DZ.onionOn = false; dzOnionRender(); }
      dzCanvasSet(${JSON.stringify(D)}); dzDocCommit(); DZ.zoom = .5; DZ.panX = 0; DZ.panY = 0; dzApplyZoom(); dzSetTool("select"); dzDeselect(); return 1; })()`);
    await wait(500);

    // 1. clic donde SE VE la raya
    await clic(await P(1050, 600));
    let e = await elegido();
    assert.equal(e.sel, "raya", "un clic sobre la raya que se ve no la elige: " + JSON.stringify(e));
    await clic(await P(1000, 950)); // hueco: suelta

    // 2. clic sobre el círculo del grupo, donde se ve
    await clic(await P(1500, 600));
    e = await elegido();
    assert.equal(e.sel, "grupo", "un clic sobre el círculo del grupo no elige el grupo: " + JSON.stringify(e));
    await clic(await P(1000, 950));
    e = await elegido();
    assert.equal(e.sel, null, "el clic en el hueco no suelta la selección: " + JSON.stringify(e));

    // 3. marco que empieza donde ESTABA la raya (hoy vacío) y cubre las dos cosas
    const antes = await caja("#raya");
    await arrastre(await P(350, 400), await P(1700, 750));
    const despues = await caja("#raya");
    assert.deepEqual(despues, antes, "empezar el marco en el hueco donde estaba la raya la arrastró: " + JSON.stringify([antes, despues]));
    e = await elegido();
    assert.deepEqual(e.multi, ["grupo", "raya"], "el marco no eligió las dos cosas: " + JSON.stringify(e));

    assert.deepEqual(errores, [], "errores de JS: " + errores.join(" | "));
    console.log("OK punteria transformada: clic sobre lo movido y sobre el grupo, marco desde el hueco");
  } finally {
    ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
