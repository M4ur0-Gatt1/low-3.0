/* EL MARCO DE SELECCIÓN, COMO ILLUSTRATOR. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026, LOW 3.16): «pasá el marco a como Illustrator: lo
   que ya funciona en otros programas lo copiamos; tiene que ser intuitivo y
   familiar para quien usa Toon Boom, Moho, Illustrator, After Effects».

   Antes, de izquierda a derecha el marco exigía que el objeto quedara ENTERO
   adentro (la convención de AutoCAD): con la tableta casi nunca pasa, y el
   marco «no elegía nada». Y el contacto se medía por la CAJA: un arco grande
   cuya caja cruzaba el marco se elegía aunque su línea pasara lejos.

   Con el ratón de verdad, en un .low, tres cosas:
     · un círculo entero adentro del marco;
     · una raya que CRUZA el borde del marco;
     · un arco grande cuya caja cruza el marco pero cuya línea no.
   1. Marco de izquierda a derecha → el círculo y la raya, no el arco.
   2. Marco de derecha a izquierda → lo mismo.
   3. Con Alt → sólo el círculo (lo que queda entero adentro).
   4. Shift suma al marco anterior. */
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
  const marco = async ([x1, y1], [x2, y2], modifiers = 0) => {
    await mouse("mouseMoved", x1, y1, { modifiers }); await mouse("mousePressed", x1, y1, { buttons: 1, clickCount: 1, modifiers });
    for (let i = 1; i <= 12; i++) { await mouse("mouseMoved", x1 + (x2 - x1) * i / 12, y1 + (y2 - y1) * i / 12, { buttons: 1, modifiers }); await wait(20); }
    await mouse("mouseReleased", x2, y2, { buttons: 0, clickCount: 1, modifiers }); await wait(450);
  };
  const elegidos = () => ev(`(()=>{ const s = new Set([...(DZ.multi || []), DZ.sel].filter(Boolean).map(n => n.id)); return [...s].sort(); })()`);
  const soltar = async () => { await ev("dzDeselect(), 1"); await wait(150); };

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
    // el marco va de (500,350) a (1100,750)
    // · circulo: centro (800,550) r 80 → entero adentro
    // · raya: de (1000,550) a (1400,550) → cruza el borde derecho
    // · arco: semicírculo grande de (300,300) a (1500,300) que baja hasta y=900 por los lados
    //   y pasa por ABAJO del marco: su caja (300..1500, 300..900) cubre el marco entero, su línea no lo toca
    const D = '<g data-low-art="colour"></g><g data-low-art="line">'
      + '<circle id="circulo" cx="800" cy="550" r="80" fill="none" stroke="#111" stroke-width="10"/>'
      + '<path id="raya" d="M 1000 550 L 1400 550" fill="none" stroke="#111" stroke-width="10"/>'
      + '<path id="arco" d="M 300 300 L 300 900 L 1500 900 L 1500 300" fill="none" stroke="#111" stroke-width="10"/></g>';
    await ev(`(()=>{ if (typeof closeL3d === "function") closeL3d(); dzCanvasSet(${JSON.stringify(D)}); dzDocCommit();
      DZ.zoom = .5; DZ.panX = 0; DZ.panY = 0; dzApplyZoom(); dzSetTool("select"); dzDeselect(); return 1; })()`);
    await wait(500);
    const a = await P(500, 350), b = await P(1100, 750);

    await marco(a, b);
    assert.deepEqual(await elegidos(), ["circulo", "raya"], "de izquierda a derecha el marco no elige lo que toca (o eligió el arco por su caja)");
    await soltar();

    await marco(b, a);
    assert.deepEqual(await elegidos(), ["circulo", "raya"], "de derecha a izquierda el marco no elige lo mismo");
    await soltar();

    await marco(a, b, 1);   // Alt
    assert.deepEqual(await elegidos(), ["circulo"], "con Alt el marco no elige sólo lo que queda entero adentro");

    // Shift suma: un marco chico sobre la raya, con el círculo ya elegido
    const c = await P(1250, 500), d = await P(1350, 600);
    await marco(c, d, 8);
    assert.deepEqual(await elegidos(), ["circulo", "raya"], "Shift no sumó la raya a lo elegido");

    assert.deepEqual(errores, [], "errores de JS: " + errores.join(" | "));
    console.log("OK marco como Illustrator: toca en las dos direcciones, por el trazo y no la caja; Alt contiene; Shift suma");
  } finally {
    ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
