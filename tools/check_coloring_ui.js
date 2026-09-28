/* Recorrido E2E del coloreo real en Chromium.
   Requiere CDP en :9223 y el proyecto servido en :8791. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  // Pestaña PROPIA: engancharse a "la primera página" tomaba la que estuviera
  // abierta (el panel del navegador, otra corrida) y la prueba medía otra cosa.
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  if (!target?.webSocketDebuggerUrl) throw Error("Chromium no expuso una página CDP");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map();
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    // El confirm() de recuperación de escena CONGELA el renderer: sin atenderlo
    // la prueba no falla, se cuelga con «CDP sin respuesta».
    if (msg.method === "Page.javascriptDialogOpening")
      return ws.send(JSON.stringify({ id: ++id, method: "Page.handleJavaScriptDialog", params: { accept: false } }));
    if (!msg.id || !pending.has(msg.id)) return;
    const task = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? task.fail(Error(JSON.stringify(msg.error))) : task.ok(msg.result);
  };
  const send = (method, params = {}) => new Promise((ok, fail) => {
    const callId = ++id, timer = setTimeout(() => { pending.delete(callId); fail(Error("CDP sin respuesta: " + method)); }, 60000);
    pending.set(callId, { ok: value => { clearTimeout(timer); ok(value); }, fail: error => { clearTimeout(timer); fail(error); } });
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable");
  // Los scripts se piden con ?v=<versión>: sin esto Chromium sirve el archivo
  // anterior y la prueba certifica código que ya no existe.
  await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Page.navigate", { url: pageUrl });
  // Esperar por CONDICION y no por reloj: un sleep fijo alcanza en la maquina de
  // trabajo y se queda corto en un runner cargado, y entonces openDesign corre
  // antes de que el puente exista y falla con «api es null». Pasó de verdad al
  // agregar un script despues de app.js, que ensancho la ventana entre «las
  // funciones existen» y «el puente esta listo».
  for (let intento = 0; intento < 80; intento++) {
    const listo = await send("Runtime.evaluate", { returnByValue: true,
      expression: 'typeof openDesign === "function" && !!api' });
    if (listo.result?.value === true) break;
    await new Promise(ok => setTimeout(ok, 250));
  }
  const expression = `(async()=>{
    await openDesign("C:\\\\mock\\\\color-test.svg");
    await dzDocInit();
    const doc=DZ.doc,lv=doc.level;
    doc.setCell(1,1);doc.setCell(2,2);
    const drawing=x=>'<g data-low-art="colour" aria-label="Color"></g><g data-low-art="line" aria-label="Línea"><rect x="'+x+'" y="220" width="260" height="300" fill="none" stroke="#111111" stroke-width="12"/></g>';
    lv.byNumber(1).content=drawing(240);lv.byNumber(2).content=drawing(330);
    doc.goTo(1);dzCanvasSet(lv.byNumber(1).content);
    DZ.fillColor="#f0450e";DZ.coloringPrefs=LOW.animation.coloring.normalizeSettings({mode:"paint",scope:"level",gap:2});
    const svg=document.querySelector("#dzCanvas > svg"),point=svg.createSVGPoint();point.x=360;point.y=350;
    const probe=await dzFillAnalyze(svg,dzVB(),{x:360,y:350},2);
    const debug={width:probe.width,height:probe.height,regions:probe.regions.map(r=>({area:r.area,bbox:r.bbox})),components:probe.components,picked:probe.region?.bbox||null,prepared:dzFillPrepareSvg(svg,dzVB()).outerHTML.slice(0,1200)};
    const screen=point.matrixTransform(svg.getScreenCTM());
    await dzBucketApply({clientX:screen.x,clientY:screen.y,shiftKey:false,preventDefault(){},stopPropagation(){}});
    const after=lv.drawings.map(d=>d.content),report=DZ.lastColorReport;
    const painted=after.every(c=>c.includes("data-low-zone=")&&c.includes("data-fil=")&&c.indexOf('data-low-art="colour"')<c.indexOf('data-low-art="line"'));
    doc.history.undo();const undone=lv.drawings.every(d=>!d.content.includes("data-low-zone="));
    doc.history.redo();const redone=lv.drawings.every(d=>d.content.includes("data-low-zone="));
    return {painted,undone,redone,changed:report?.changed,skipped:report?.skipped?.length,status:document.querySelector("#dzStatus")?.textContent,debug,bucketDebug:DZ.lastColorDebug};
  })()`;
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  ws.close();
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const value = result.result?.value;
  if (!value?.painted || !value.undone || !value.redone || value.changed !== 2 || value.skipped !== 0)
    throw Error("REGRESIÓN de coloreo multicuadro: " + JSON.stringify(value));
  console.log("E2E COLOR OK: zona estable, Color Art y undo atómico", JSON.stringify({
    changed: value.changed, skipped: value.skipped, undo: value.undone, redo: value.redone
  }));
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) {}
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
