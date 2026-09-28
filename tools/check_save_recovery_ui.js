/* P0 de la matriz: SAVE-03, SAVE-04 y RECV-02 sobre Chromium. CDP :9223 + mock :8791.

   Una escritura que falla no puede dejar el documento "limpio" ni borrar el
   punto de recuperación, y el trabajo recuperable no se carga ni se descarta en
   silencio. Se prueba con el puente devolviendo lo que devuelve de verdad
   cuando el disco falla: un OBJETO {error, path}, sin lanzar excepción. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map(), errors = [];
  ws.onmessage = event => { const m = JSON.parse(event.data);
    if (m.method === "Page.javascriptDialogOpening") return ws.send(JSON.stringify({ id: ++id, method: "Page.handleJavaScriptDialog", params: { accept: true } }));
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (!m.id || !pending.has(m.id)) return; const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 30000);
    pending.set(n, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 60; i++) {
    const ready = await send("Runtime.evaluate", { expression: 'typeof openDesign==="function" && typeof dzSave==="function" && !!api', returnByValue: true });
    if (ready.result?.value) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }

  const expression = `(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    await openDesign("C:\\\\mock\\\\save-p0.svg"); await dzDocInit(); await wait(400);
    const recovery=LOW.workspace.recovery, ruta=DZ.path;
    const real=api.save_file;
    const fallar=()=>{api.save_file=async()=>({error:"disco lleno",path:ruta,recoverable:true})};
    const funcionar=()=>{api.save_file=async(p,c)=>({path:p||ruta,name:"save-p0.svg",bytes:c.length,atomic:true})};

    // SAVE-03/04 — guardado manual con el disco fallando
    recovery.saveNow(ruta,'<g id="trabajo"/>',{op:"trazo"});
    fallar(); DZ.dirty=true; await dzSave(); await wait(200);
    const manual={sucio:DZ.dirty,punto:!!recovery.get(ruta)};

    // SAVE-03/04 — auto-guardado con el disco fallando (nadie lo esta mirando)
    recovery.clear(ruta); DZ.dirty=true; await dzPersist(); await wait(250);
    const punto=recovery.get(ruta);
    const auto={sucio:DZ.dirty,punto:!!punto,op:punto&&punto.metadata&&punto.metadata.op,
      tieneHora:!!(punto&&punto.savedAt),tieneRuta:!!(punto&&punto.path),tieneContenido:!!(punto&&punto.content)};

    // el camino feliz sigue limpiando lo que corresponde
    funcionar(); DZ.dirty=true; await dzSave(); await wait(200);
    const exito={sucio:DZ.dirty,punto:!!recovery.get(ruta)};
    api.save_file=real;

    // RECV-02 — tres salidas, comparacion dibujada y cancelar que conserva
    const disco='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="90" height="50" x="5" y="5" fill="#4a6a8a"/></svg>';
    const guardado={path:ruta,content:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><circle cx="50" cy="30" r="25" fill="#d08a3a"/></svg>',
      metadata:{op:"pincel",frame:3,tool:"brush"},savedAt:Date.now()-90000};
    const p1=dzRecoveryDecide(ruta,disco,guardado); await wait(200);
    const salidas=[...document.querySelectorAll("#modal .m-actions button")].map(b=>b.id);
    const aviso=(document.querySelector("#modal .m-msg")||{}).textContent||"";
    document.querySelector("#dzRcCompare").click(); await wait(250);
    const comparar={paneles:document.querySelectorAll(".dz-rc-pane").length,
      dibujaDisco:!!document.querySelector("#dzRcDisk svg"),dibujaRecuperado:!!document.querySelector("#dzRcMem svg"),
      salidas:[...document.querySelectorAll("#modal .m-actions button")].map(b=>b.id)};
    document.querySelector("#dzRcRecover").click();
    const recuperar=await p1;
    const p2=dzRecoveryDecide(ruta,disco,guardado); await wait(150);
    closeModal();                       // Escape / clic fuera: no elige nada
    const cancelar=await p2;
    const p3=dzRecoveryDecide(ruta,disco,guardado); await wait(150);
    document.querySelector("#dzRcDiscard").click();
    const descartar=await p3;
    return {manual,auto,exito,salidas,aviso,comparar,recuperar,cancelar,descartar};
  })()`;

  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const v = result.result?.value;

  if (!v?.manual?.sucio || !v.manual.punto)
    throw Error("REGRESIÓN SAVE-03: una escritura fallida dio el documento por guardado o borró el punto de recuperación: " + JSON.stringify(v.manual));
  if (!v.auto?.sucio || !v.auto.punto || !v.auto.op || !v.auto.tieneHora || !v.auto.tieneRuta || !v.auto.tieneContenido)
    throw Error("REGRESIÓN SAVE-03: el auto-guardado fallido no conservó el trabajo con ruta, contenido, hora y operación: " + JSON.stringify(v.auto));
  if (v.exito?.sucio || v.exito?.punto)
    throw Error("REGRESIÓN SAVE-04: un guardado confirmado debe limpiar el documento y su punto de recuperación: " + JSON.stringify(v.exito));
  const esperadas = ["dzRcDiscard", "dzRcCompare", "dzRcRecover"];
  if (JSON.stringify(v.salidas) !== JSON.stringify(esperadas))
    throw Error("REGRESIÓN RECV-02: faltan Recuperar, Comparar o Descartar: " + JSON.stringify(v.salidas));
  if (!/pincel/.test(v.aviso) || !/recuperaci/i.test(v.aviso))
    throw Error("REGRESIÓN RECV-02: el aviso no dice cuándo ni con qué operación se guardó el punto: " + JSON.stringify(v.aviso));
  if (v.comparar?.paneles !== 2 || !v.comparar.dibujaDisco || !v.comparar.dibujaRecuperado)
    throw Error("REGRESIÓN RECV-02: Comparar no muestra las dos versiones dibujadas: " + JSON.stringify(v.comparar));
  if (v.recuperar !== "recover" || v.descartar !== "discard")
    throw Error("REGRESIÓN RECV-02: Recuperar o Descartar no devuelven su decisión: " + JSON.stringify(v));
  if (v.cancelar !== "keep")
    throw Error("REGRESIÓN RECV-02: cerrar sin elegir descartó el trabajo en vez de conservarlo: " + JSON.stringify(v.cancelar));
  if (errors.length) throw Error("REGRESIÓN: excepciones UI: " + errors.slice(0, 3).join(" | "));

  console.log("E2E guardado y recuperación OK", JSON.stringify(v));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* cierre best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
