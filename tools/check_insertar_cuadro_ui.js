/* INSERTAR UN CUADRO DESPUÉS DEL ACTUAL (Alt+N vacío · Alt+I copia). CDP :9223 + mock :8791.

   Encontrado al probar cortar y pegar (oct-2026, LOW 3.19): los botones dicen
   «Agregar un frame VACÍO DESPUÉS del actual (Alt+N)» e «Insertar copia de
   este cuadro JUSTO DESPUÉS (Alt+I)», pero en un .low:
   · el vacío se insertaba ANTES: el dibujo actual se corría adelante y uno
     quedaba parado en la celda vacía;
   · la «copia» re-exponía el MISMO dibujo: retocar uno cambiaba el otro.

   Con las teclas de verdad, cuadro 1 = dibujo A, cuadro 2 = dibujo B:
   1. En el 1, Alt+N → quedo en el 2, vacío; el 1 sigue siendo A; B pasa al 3.
   2. En el 1, Alt+I → quedo en el 2 con una copia de A que es OTRO dibujo
      (retocarla no cambia el 1); lo que seguía se corre. */
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
  const altTecla = async (k) => {
    const c = "Key" + k.toUpperCase(), vk = k.toUpperCase().charCodeAt(0);
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code: c, windowsVirtualKeyCode: vk, modifiers: 1 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: c, windowsVirtualKeyCode: vk, modifiers: 1 }); await wait(500);
  };
  /** qué hay en cada cuadro: «A», «B», «vacío» (por el cx del círculo) y el número de dibujo */
  const cuadros = () => ev(`(()=>{ const ly = DZ.doc.layer, out = []; for (let f = 1; f <= 4; f++) { const n = ly.cellAt(f), d = DZ.doc.scene.drawingAt(ly.id, f);
    const cx = d && (d.content.match(/cx="(\\d+)"/) || [])[1]; out.push(n == null ? "-" : (cx === "400" ? "A" : cx === "900" ? "B" : cx ? "?" + cx : "vacío") + "#" + n); } return out; })()`);

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
    const prep = `(()=>{ if (typeof closeL3d === "function") closeL3d();
      const D = (x) => '<g data-low-art="colour"></g><g data-low-art="line"><circle cx="' + x + '" cy="540" r="90" fill="none" stroke="#111" stroke-width="10"/></g>';
      DZ.doc.goTo(1); dzCanvasSet(D(400)); dzDocCommit(); DZ.doc.goTo(2); DZ.doc.createBlankDrawing(false); dzCanvasSet(D(900)); dzDocCommit(); dzDocGoTo(1); return 1; })()`;
    await ev(prep); await wait(400);
    const [a0, b0] = await cuadros();
    assert.ok(a0.startsWith("A") && b0.startsWith("B"), "el punto de partida no es A, B: " + JSON.stringify(await cuadros()));
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 600, y: 300, button: "left", buttons: 1, clickCount: 1 }); await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 600, y: 300, button: "left", clickCount: 1 }); await wait(200);

    // 1. Alt+N: cuadro vacío DESPUÉS, y quedo en él
    await altTecla("n");
    let c = await cuadros();
    assert.equal(await ev("DZ.doc.frame"), 2, "Alt+N no me llevó al cuadro nuevo (el 2): " + JSON.stringify(c));
    assert.equal(c[0], a0, "Alt+N cambió el cuadro 1 (insertaba ANTES): " + JSON.stringify(c));
    assert.ok(c[1] === "-" || c[1].startsWith("vacío"), "el cuadro 2 no quedó vacío: " + JSON.stringify(c));
    assert.equal(c[2], b0, "lo que seguía no se corrió al 3: " + JSON.stringify(c));

    // 2. Alt+I en el 1: copia DESPUÉS, que es otro dibujo
    await ev("dzDocGoTo(1), 1"); await wait(300);
    await altTecla("i");
    c = await cuadros();
    assert.equal(await ev("DZ.doc.frame"), 2, "Alt+I no me llevó a la copia (el 2): " + JSON.stringify(c));
    assert.equal(c[0], a0, "Alt+I cambió el cuadro 1: " + JSON.stringify(c));
    assert.ok(c[1].startsWith("A") && c[1] !== a0, "el 2 no es una copia de A con su propio número de dibujo: " + JSON.stringify(c));
    // retocar la copia no toca el original
    await ev(`(()=>{ dzCanvasSet('<g data-low-art="colour"></g><g data-low-art="line"><circle cx="777" cy="540" r="90" fill="none" stroke="#111" stroke-width="10"/></g>'); dzDocCommit(); return 1; })()`); await wait(200);
    c = await cuadros();
    assert.equal(c[0], a0, "retocar la copia cambió el cuadro 1 (era el mismo dibujo): " + JSON.stringify(c));

    assert.deepEqual(errores, [], "errores de JS: " + errores.join(" | "));
    console.log("OK insertar cuadro: Alt+N vacío después (y voy a él), Alt+I copia independiente después");
  } finally {
    ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
