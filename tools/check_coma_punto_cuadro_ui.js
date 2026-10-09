/* «,» Y «.» CAMBIAN DE CUADRO. CDP :9223 + mock :8791.

   Reporte de Mauro (oct-2026, LOW 3.12.1): «el punto y la coma para cuadro
   anterior y cuadro siguiente no andan: muestran la leyenda pero no mueven el
   cuadro».

   La causa: el atajo movía `DZ.anim.idx` sobre `DZ.anim.frames`, el modelo
   VIEJO de los .svg sueltos. En un .low esa lista está vacía y, en el espacio
   de Dibujo, `DZ.anim` ni existe: la barra de estado anunciaba «Cuadro
   siguiente» y no pasaba nada. Los botones ◀ ▶ de la línea de tiempo ya
   usaban el documento (DZ.playback). Es la familia «asume DZ.path».

   Con el teclado de verdad, en el espacio de Dibujo y en el de Animación:
   «.» avanza un cuadro, «,» retrocede, y en el cuadro 1 «,» no se va a 0. */
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
  // la tecla como la manda el teclado: keydown + char + keyup
  const tecla = async (key) => {
    const code = key === "." ? "Period" : "Comma", vk = key === "." ? 190 : 188;
    await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, text: key, windowsVirtualKeyCode: vk });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk });
    await wait(250);
  };
  const cuadro = () => ev("DZ.doc ? DZ.doc.frame : null");

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    // una pestaña headless no tiene el foco: sin esto las teclas no llegan a la página
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    for (const espacio of ["drawing", "animation"]) {
      await send("Page.navigate", { url });
      for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
      await ev(`(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active",${JSON.stringify(espacio)});}catch(e){} window.__paginaVieja = 1; return true; })()`);
      await send("Page.reload");
      for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
      await ev(`dzMenuAction("nuevo")`); await wait(2600);
      await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); return true; })()');
      assert.equal(await cuadro(), 1, espacio + ": el documento nuevo no arranca en el cuadro 1");

      await tecla(".");
      assert.equal(await cuadro(), 2, espacio + ": «.» no avanzó al cuadro 2 (anim: " + await ev("JSON.stringify(DZ.anim && { idx: DZ.anim.idx, n: DZ.anim.frames.length })") + ")");
      await tecla(".");
      assert.equal(await cuadro(), 3, espacio + ": un segundo «.» no avanzó al cuadro 3");
      await tecla(",");
      assert.equal(await cuadro(), 2, espacio + ": «,» no retrocedió al cuadro 2");
      await tecla(","); await tecla(",");
      assert.equal(await cuadro(), 1, espacio + ": «,» en el cuadro 1 tiene que quedarse en el 1");
    }
    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E «,» y «.» cambian de cuadro OK (Dibujo y Animación)");
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
