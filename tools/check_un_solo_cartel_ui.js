/* UN SOLO CARTEL DE AYUDA, aunque la linea de tiempo se repinte. CDP :9223 + mock :8791.

   POR QUE EXISTE. Reportado en v3.0.0 con captura: «estan duplicados los
   tooltips del sistema, deja uno solo». El globo de LOW ya sacaba el `title`
   del boton para que el navegador no dibujara su tooltip nativo encima, pero
   en la linea de tiempo seguia saliendo doble:
   1. la FILA que contiene al boton tiene su propio `title` (el nombre de la
      capa), y ese seguia puesto;
   2. la linea de tiempo se REPINTA con el cursor quieto y el boton nuevo
      nacia con su `title`.

   Lo que se cuida, con el cursor real sobre el sol (mesa de luz) de una fila:
   1. aparece el globo, UNO solo;
   2. ningun elemento de la cadena bajo el cursor conserva `title` (de ahi sale
      el nativo);
   3. despues de repintar la linea de tiempo debajo del cursor, sigue sin haber
      `title` en la cadena y sigue habiendo un solo globo;
   4. al irse, los `title` VUELVEN (los usan los lectores de pantalla);
   5. el globo muestra solo el nombre, sin el parrafo de detalle.
*/
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const tab = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl), pending = new Map(), errors = []; let id = 0;
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ({ data }) => { const m = JSON.parse(data);
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.j(Error(m.error.message)) : p.r(m.result); } };
  const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; pending.set(n, { r, j }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const estado = (x, y) => ev(`(()=>{const bajo=document.elementFromPoint(${x},${y});const cadena=[];
    for(let n=bajo;n&&n.nodeType===1;n=n.parentElement)if(n.hasAttribute('title'))cadena.push(n.tagName+'.'+(n.className&&n.className.baseVal!==undefined?n.className.baseVal:n.className));
    const globos=[...document.querySelectorAll('.dz-tool-tooltip')];
    return {conTitle:cadena,globos:globos.length,texto:globos[0]?globos[0].textContent:'',detalle:globos.some(g=>g.querySelector('.dz-tth-d'))};})()`);
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof openDesign==="function"&&typeof api!=="undefined"&&!!api').catch(() => false)) break; await wait(300); }
    await ev(`(async()=>{try{localStorage.clear()}catch(e){};await openDesign('mock.svg');await dzDocInit();
      if(typeof closeL3d==='function')closeL3d();const s=document.getElementById('lowSplash');if(s)s.remove();
      document.getElementById('dzTlPestania').click();await new Promise(r=>setTimeout(r,700));})()`);
    const p = await ev(`(()=>{const b=document.querySelector('.tl2-row[data-layer-row] .tl2-luz');const r=b.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x - 30, y: p.y });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
    await wait(650);
    const a = await estado(p.x, p.y);
    assert.equal(a.globos, 1, "tiene que haber UN globo sobre el sol: " + JSON.stringify(a));
    assert.deepEqual(a.conTitle, [], "con el globo puesto quedan `title` en la cadena bajo el cursor (sale el nativo encima): " + JSON.stringify(a));
    assert.equal(a.detalle, false, "el globo tiene que ser sólo el nombre, sin párrafo de detalle");
    assert.ok(a.texto.length > 0 && a.texto.length <= 64, "el globo tiene que ser corto: " + JSON.stringify(a.texto));

    // la línea de tiempo se repinta con el cursor quieto
    await ev("DZ.tlView.render()"); await wait(120);
    await ev("DZ.tlView.render()"); await wait(400);
    const b = await estado(p.x, p.y);
    assert.deepEqual(b.conTitle, [], "tras repintar, el botón nuevo trajo su `title` y el nativo vuelve a salir: " + JSON.stringify(b));
    assert.ok(b.globos <= 1, "tras repintar hay más de un globo: " + JSON.stringify(b));

    // al irse, los title vuelven
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 5, y: 5, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 5, y: 5, button: "left", buttons: 0, clickCount: 1 });
    await wait(200);
    const c = await ev(`(()=>({guardados:document.querySelectorAll('[data-titulo-ayuda]').length,
      solConTitle:!!document.querySelector('.tl2-row[data-layer-row] .tl2-luz[title]'),globos:document.querySelectorAll('.dz-tool-tooltip').length}))()`);
    assert.equal(c.guardados, 0, "quedaron `title` sin devolver: " + JSON.stringify(c));
    assert.equal(c.solConTitle, true, "el sol perdió su `title` para siempre (los lectores de pantalla lo usan)");
    assert.equal(c.globos, 0, "el globo quedó colgado");

    assert.deepEqual(errors, []);
    console.log("E2E un solo cartel OK", JSON.stringify({ antes: a, trasRepintar: b, alIrse: c }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
setTimeout(() => process.exit(1), 60000).unref();
