/* Lipsync por amplitud desde el panel (biblia §12 SIGUIENTE·5).
   CDP :9223 + mock :8791.

   El recorrido del artista: elegir la pieza de la boca, cargar el audio,
   generar, y comprobar que el silencio cierra la boca, que se usan varias
   formas y que todo el lipsync es UN paso de historial. */
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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 40000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 60; i++) {
    const r = await send("Runtime.evaluate", { expression: 'typeof dzLipGenerar==="function" && !!api', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("C:\\mock\\lip.svg"); await dzDocInit(); await wait(500);
    if(!DZ.rigMode) dzRigToggle(); await wait(300);
    dzRigSetMode("build"); await wait(200);
    const svg=document.querySelector("#dzCanvas > svg"); svg.innerHTML="";
    ["boca_cerrada","boca_media","boca_abierta"].forEach((id,i)=>{
      const g=document.createElementNS("http://www.w3.org/2000/svg","g");
      g.id=id; g.innerHTML="<rect x='40' y='60' width='60' height='"+(4+i*10)+"' fill='#c55'/>";
      svg.appendChild(g);});
    if(typeof dzDocCommit==="function") dzDocCommit();
    DZ.doc.ensureRigNodes([{id:"boca_cerrada",name:"boca",parentId:null,
      head:{x:40,y:70},tail:{x:100,y:70},pivot:{x:40,y:70}}],"rig");
    await wait(300);
    dzRigSelectNode("boca_cerrada");
    const slotId=dzRigSlotDe(DZ.doc.scene.rigNode("boca_cerrada"));
    DZ.doc.addRigVariant("boca_cerrada","boca_media","media");
    DZ.doc.addRigVariant("boca_cerrada","boca_abierta","abierta");
    dzRigPanelSync(); await wait(350);
    const sinAudio={estado:document.querySelector("#rigLipEstado").textContent,
      generarBloqueado:document.querySelector("#rigLipGen").disabled,
      formas:document.querySelectorAll("#rigLipFormas .rig2-lip-forma").length};
    const picos=[];
    for(let i=0;i<48;i++) picos.push(i<8||i>32?0:(i%6<3?0.9:0.3));
    DZ.doc.audio={name:"voz.wav",offset:0,peaks:picos,duracionFrames:48,buffer:null};
    DZ.doc.scene.expose(DZ.doc.scene.layers[0].id,48,1);
    dzRigPanelSync(); await wait(300);
    const conAudio={estado:document.querySelector("#rigLipEstado").textContent,
      generarHabilitado:!document.querySelector("#rigLipGen").disabled};
    document.querySelector("#tlIn").value="1";
    document.querySelector("#tlOut").value="48";
    const pasos=DZ.history.undoStack.length;
    document.querySelector("#rigLipGen").click(); await wait(600);
    const sw=DZ.doc.scene.rigSwitch(slotId);
    const marcos=sw?Object.keys(sw.keys).map(Number).sort((a,b)=>a-b):[];
    const variantes=DZ.doc.scene.rigVariants(slotId).map(v=>v.id);
    const generado={claves:marcos.length,primera:marcos[0],
      pasos:DZ.history.undoStack.length-pasos,
      silencioCerrada:!!sw&&sw.keys[marcos[0]]===variantes[0],
      formasUsadas:new Set(Object.values(sw?sw.keys:{})).size,
      fueraDeRango:marcos.some(f=>f<1||f>48)};
    dzUndo(); await wait(400);
    const trasUndo=!DZ.doc.scene.rigSwitch(slotId);
    dzRedo(); await wait(300);
    document.querySelector("#rigLipClear").click(); await wait(400);
    const borrado=!DZ.doc.scene.rigSwitch(slotId);
    return {sinAudio,conAudio,generado,trasUndo,borrado,errores:(window.__errs||[]).slice(0,3)};
  })()`;

  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const v = result.result?.value;

  if (v?.sinAudio?.estado !== "sin audio" || !v.sinAudio.generarBloqueado || v.sinAudio.formas !== 3)
    throw Error("REGRESIÓN: el panel ofrece lipsync sin audio: " + JSON.stringify(v?.sinAudio));
  if (!/3 bocas/.test(v.conAudio?.estado || "") || !v.conAudio.generarHabilitado)
    throw Error("REGRESIÓN: con audio y bocas el panel sigue bloqueado: " + JSON.stringify(v.conAudio));
  if (!v.generado?.claves || v.generado.fueraDeRango)
    throw Error("REGRESIÓN: el lipsync no escribió claves dentro del rango: " + JSON.stringify(v.generado));
  if (!v.generado.silencioCerrada)
    throw Error("REGRESIÓN: el silencio dejó de cerrar la boca: " + JSON.stringify(v.generado));
  if (v.generado.formasUsadas < 2)
    throw Error("REGRESIÓN: el lipsync usa una sola boca: " + JSON.stringify(v.generado));
  if (v.generado.pasos !== 1)
    throw Error("REGRESIÓN: el lipsync dejó de ser UN paso de historial: " + JSON.stringify(v.generado));
  if (!v.trasUndo) throw Error("REGRESIÓN: Ctrl+Z no saca el lipsync entero");
  if (!v.borrado) throw Error("REGRESIÓN: Borrar no limpia las claves de boca del tramo");
  if (v.errores?.length) throw Error("REGRESIÓN: excepciones en lipsync: " + v.errores.join(" | "));

  console.log("E2E lipsync OK", JSON.stringify(v));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
