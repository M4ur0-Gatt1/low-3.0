/* DIBUJAR NO SE VUELVE LENTO POR EL PANEL DE CAPAS, con clics reales.
   CDP :9223 + mock :8791.

   POR QUE EXISTE. Reportado en v3.29.0: «para dibujar vectores se pone
   lento». MEDIDO en la app real: soltar el lápiz costaba 13 ms con 25 trazos
   y 59 ms con 200, en línea recta. Causa: después de CADA trazo el panel de
   capas rearmaba una fila por elemento del dibujo (221 filas para ver nueve).

   Lo que se cuida (dibujo de 300 trazos):
   1. El panel arma una tanda acotada y una fila «… y N elementos más».
   2. Un trazo nuevo con el pincel NO hace crecer la lista armada.
   3. Seleccionar con un clic en el lienzo un elemento que quedó al fondo de
      la lista: su fila aparece y queda marcada.
   4. Tocar «… más» arma otra tanda.
   5. Tocar una fila sigue seleccionando su elemento.
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
  const pos = (sel) => ev(`(()=>{const e=${sel};if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  const clicEn = async (p) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...p });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...p, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...p, button: "left", buttons: 0, clickCount: 1 }); await wait(300); };
  const clic = async (sel, msg) => { await ev(`(()=>{const e=${sel};if(e)LOW.core&&LOW.core.scrollDentro?LOW.core.scrollDentro(e,{limite:document.querySelector('#dzLayers').parentElement}):0;})()`);
    const p = await pos(sel); assert.ok(p, msg + ": no está"); await clicEn(p); };
  const panel = () => ev(`(()=>{const b=document.querySelector('#dzLayers');const m=b.querySelector('.dz-lay-mas');
    return {filas:b.querySelectorAll('.dz-lay-row').length,mas:m?m.textContent:null,sel:!!b.querySelector('.dz-lay-row.sel'),
      elementos:document.querySelectorAll('#dzCanvas > svg g[data-low-art="line"] > *').length};})()`);
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzDocumentNew==="function"&&typeof api!=="undefined"&&!!api').catch(() => false)) break; await wait(250); }
    // 300 trazos chicos; el PRIMERO (el de más al fondo de la lista) es un
    // rectángulo grande y lleno, solo en una esquina, para poder clickearlo
    await ev(`(async()=>{await dzDocumentNew();if(typeof closeL3d==='function')closeL3d();const s=document.getElementById('lowSplash');if(s)s.remove();
      await new Promise(r=>setTimeout(r,700));dzDocCommit();
      const svg=document.querySelector('#dzCanvas > svg'),pg=svg.querySelector('rect[data-low-page]'),papel=pg?pg.outerHTML:'';
      let t='<rect id="alFondo" x="60" y="60" width="300" height="220" fill="#2a6fdb"/>';
      for(let i=0;i<299;i++){const x=500+(i%30)*45,y=420+Math.floor(i/30)*55;t+='<path d="M'+x+' '+y+' q12 -20 24 0 t24 0" fill="none" stroke="#111" stroke-width="5"/>';}
      dzCanvasSet(papel+'<g data-low-art="colour"></g><g data-low-art="line">'+t+'</g>');dzDocCommit();DZ.history.clear();
      dzSetTool('brush');await new Promise(r=>setTimeout(r,400));})()`);

    // el panel de capas se ve en el espacio Dibujo (en Animación está oculto)
    await clic(`[...document.querySelectorAll('.dz-ws-tab')].find(b=>b.textContent.trim()==='Dibujo')`, "pestaña del espacio Dibujo");
    await wait(400);
    assert.ok(await ev(`document.querySelector('#dzLayers').getClientRects().length>0`), "el panel de capas no se ve en el espacio Dibujo");

    // 1. tanda acotada + «más»
    const inicio = await panel();
    assert.equal(inicio.elementos, 300);
    assert.ok(inicio.filas <= 70, "el panel armó " + inicio.filas + " filas para 300 elementos");
    assert.ok(inicio.mas && /elementos más/.test(inicio.mas), "falta la fila «… y N elementos más»: " + JSON.stringify(inicio));

    // 2. un trazo de pincel real no hace crecer la lista armada
    const hoja = await ev(`(()=>{const r=document.querySelector('#dzCanvas > svg').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
    const x0 = hoja.x + hoja.w * 0.55, y0 = hoja.y + hoja.h * 0.15;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0, y: y0, pointerType: "pen", force: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: x0, y: y0, button: "left", buttons: 1, clickCount: 1, pointerType: "pen", force: 0.6 });
    for (let i = 1; i <= 15; i++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x0 + i * 6, y: y0 + Math.sin(i / 2) * 8, buttons: 1, pointerType: "pen", force: 0.6 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x0 + 90, y: y0, button: "left", buttons: 0, clickCount: 1, pointerType: "pen", force: 0 });
    await wait(900);
    const trasTrazo = await panel();
    assert.equal(trasTrazo.elementos, 301, "el trazo de pincel no se dibujó: " + JSON.stringify(trasTrazo));
    assert.ok(trasTrazo.filas <= 70, "después de un trazo la lista se armó entera: " + trasTrazo.filas + " filas");

    // 3. seleccionar en el lienzo el elemento del fondo de la lista
    await ev(`(async()=>{dzSetTool('select');await new Promise(r=>setTimeout(r,200));})()`);
    const p = await pos(`document.querySelector('#alFondo')`);
    await clicEn(p);
    const conSel = await panel();
    assert.equal(await ev(`DZ.sel && DZ.sel.id`), "alFondo", "el clic en el lienzo no seleccionó el rectángulo");
    assert.equal(conSel.sel, true, "el elemento seleccionado quedó sin fila en el panel: " + JSON.stringify(conSel));
    await ev(`dzDeselect()`); await wait(200);
    assert.ok((await panel()).filas <= 70, "soltar la selección no volvió a la tanda corta");

    // 4. «más» arma otra tanda
    const antes = (await panel()).filas;
    await clic(`document.querySelector('#dzLayers .dz-lay-mas')`, "fila «… más»");
    const masFilas = await panel();
    assert.ok(masFilas.filas > antes + 100, "«… más» no armó otra tanda: " + antes + " → " + masFilas.filas);

    // 5. una fila sigue seleccionando su elemento
    await clic(`[...document.querySelectorAll('#dzLayers .dz-lay-row')].find(r=>!r.classList.contains('art-root'))`, "una fila de trazo");
    assert.ok(await ev(`!!DZ.sel && DZ.sel.tagName.toLowerCase()==='path'`), "tocar una fila no seleccionó su elemento");

    assert.deepEqual(errors, []);
    console.log("E2E capas con tope OK", JSON.stringify({ inicio, trasTrazo, conSel, masFilas }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
setTimeout(() => process.exit(1), 90000).unref();
