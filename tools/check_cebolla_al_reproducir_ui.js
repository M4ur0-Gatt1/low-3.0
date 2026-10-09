/* EL PAPEL CEBOLLA NO TITILA EN EL PLAY. CDP :9223 + mock :8791.

   Reporte de Mauro (oct-2026, LOW 3.12): «la cámara, al hacer zoom, hace un
   centelleo». En su video se reproduce un movimiento de cámara con el papel
   cebolla prendido: en cada cuadro los fantasmas rojos y verdes saltan de
   lugar y de color. Krita, TVPaint y OpenToonz no muestran la cebolla
   mientras se reproduce.

   Con el ratón de verdad: tres dibujos en tres cuadros, papel cebolla
   prendido.
   1. Parado en el cuadro 2 hay fantasmas a la vista.
   2. Durante el play, en ninguna muestra hay un fantasma a la vista.
   3. Las capas de la mesa (`dz-onion dz-capa`) SÍ se ven durante el play:
      van por el mismo camino y tienen que seguir avanzando.
   4. Al parar, los fantasmas vuelven. */
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
  const pantalla = (x, y) => ev(`(()=>{ const q = dzToScreen(${x}, ${y}), r = document.querySelector("#dzCanvas").getBoundingClientRect(); return [q.x + r.left, q.y + r.top]; })()`);
  const circulo = async (cx, cy, rad) => {
    const pts = []; for (let i = 0; i <= 40; i++) { const t = i / 40 * Math.PI * 2; pts.push(await pantalla(cx + Math.cos(t) * rad, cy + Math.sin(t) * rad)); }
    await mouse("mouseMoved", pts[0][0], pts[0][1]); await mouse("mousePressed", pts[0][0], pts[0][1], { buttons: 1, clickCount: 1 });
    for (const [x, y] of pts.slice(1)) { await mouse("mouseMoved", x, y, { buttons: 1 }); await wait(8); }
    await mouse("mouseReleased", pts.at(-1)[0], pts.at(-1)[1], { buttons: 0, clickCount: 1 }); await wait(600);
  };
  // fantasmas A LA VISTA: los de la cebolla, sin contar las capas de la mesa
  const visibles = `[...document.querySelectorAll('#dzCanvas > svg g.dz-onion:not(.dz-capa):not(.dz-capa-defs)')].filter(g => getComputedStyle(g).display !== "none").length`;

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
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); DZ.zoom = .5; DZ.panX = 0; DZ.panY = 0; dzApplyZoom(); dzSetTool("brush"); return true; })()'); await wait(300);

    for (const f of [1, 2, 3]) {
      await ev(`(()=>{ DZ.doc.goTo(${f}); return true; })()`); await wait(400);
      await circulo(700 + f * 120, 540, 150 + f * 20);
    }
    const celdas = await ev("DZ.doc.scene.layers[0].cells.slice(0, 3)");
    assert.equal(celdas.filter(Boolean).length, 3, "no quedaron tres dibujos en tres cuadros: " + JSON.stringify(celdas));
    await ev(`(()=>{ if (!DZ.onionOn) { DZ.onionOn = true; dzOnionRender(); } DZ.doc.goTo(2); return true; })()`); await wait(500);

    // ── 1. parado: hay fantasmas ────────────────────────────────────────────
    const parado = await ev(visibles);
    assert.ok(parado > 0, "con el papel cebolla prendido, en el cuadro 2 no hay fantasmas a la vista");

    // ── 2. y 3. durante el play ────────────────────────────────────────────
    await ev(`(()=>{ DZ.doc.scene.fps = 12; DZ.playback.play(); return DZ.playback.playing; })()`);
    let max = 0, capaOculta = false;
    for (let i = 0; i < 25; i++) {
      await wait(40);
      max = Math.max(max, await ev(visibles));
      if (i === 10) {
        // una capa de la mesa puesta a mano: con el play tiene que seguir viéndose
        capaOculta = await ev(`(()=>{ const svg = document.querySelector("#dzCanvas > svg"), g = document.createElementNS("http://www.w3.org/2000/svg", "g");
          g.setAttribute("class", "dz-onion dz-capa"); svg.appendChild(g); const oculta = getComputedStyle(g).display === "none"; g.remove(); return oculta; })()`);
      }
    }
    const cuadros = await ev("DZ.doc.frame");
    await ev("DZ.playback.stop()"); await wait(500);
    assert.equal(max, 0, "durante el play se ven fantasmas del papel cebolla (hasta " + max + " a la vez): titilan en cada cuadro");
    assert.ok(!capaOculta, "durante el play se escondieron también las capas de la mesa");
    assert.ok(cuadros >= 1, cuadros);

    // ── 4. al parar vuelven ────────────────────────────────────────────────
    await ev(`(()=>{ DZ.doc.goTo(2); return true; })()`); await wait(500);
    const despues = await ev(visibles);
    assert.ok(despues > 0, "al parar el play, el papel cebolla no volvió");

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E papel cebolla fuera del play OK " + JSON.stringify({ parado, durante: max, despues }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
