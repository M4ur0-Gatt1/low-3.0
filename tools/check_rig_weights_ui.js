/* Malla, flexi-binding y pesos (biblia §4.3, niveles 2 y 3) sobre Chromium.
   CDP :9223 + mock :8791.

   El recorrido completo que exige la biblia antes de mostrar un nivel en el
   panel: crear la malla, repartir pesos por distancia, verlos, corregirlos a
   mano, comprobar que el hueso DEFORMA el dibujo, deshacer, guardar y reabrir. */
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
    const r = await send("Runtime.evaluate", { expression: 'typeof dzMeshCrear==="function" && !!api', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("C:\\\\mock\\\\rig-weights.svg"); await dzDocInit(); await wait(500);
    if(!DZ.rigMode) dzRigToggle(); await wait(300);
    dzRigSetMode("build"); await wait(200);
    const svg=document.querySelector("#dzCanvas > svg"); svg.innerHTML="";
    const mk=(id,x)=>{const g=document.createElementNS("http://www.w3.org/2000/svg","g");
      g.id=id; g.innerHTML='<rect x="'+x+'" y="60" width="90" height="40" fill="#4a6a8a"/>';
      svg.appendChild(g);};
    mk("brazo",20); mk("antebrazo",110);
    if(typeof dzDocCommit==="function") dzDocCommit();
    DZ.doc.ensureRigNodes([
      {id:"brazo",name:"brazo",parentId:null,head:{x:20,y:80},tail:{x:110,y:80},pivot:{x:20,y:80}},
      {id:"antebrazo",name:"antebrazo",parentId:"brazo",head:{x:110,y:80},tail:{x:200,y:80},pivot:{x:110,y:80}},
    ],"Preparar rig");
    await wait(300);
    const pieza="brazo";
    dzRigSelectNode(pieza); dzRigPanelSync(); await wait(250);
    const estado=()=>document.querySelector("#rigMeshEstado").textContent;
    const btn=(id)=>document.querySelector("#"+id);
    const suma=(o)=>Object.values(o).reduce((n,v)=>n+v,0);
    const inicial={estado:estado(),crear:!btn("rigMeshCreate").disabled,auto:!btn("rigMeshAuto").disabled,
      pintar:!btn("rigMeshPaint").disabled};
    btn("rigMeshCreate").click(); await wait(350);
    const malla=DZ.doc.scene.rigMesh(pieza);
    const creada={hay:!!malla,cols:malla&&malla.cols,estado:estado(),sinPesos:!(malla.weights&&malla.weights.length)};
    btn("rigMeshAuto").click(); await wait(350);
    const pesos=DZ.doc.scene.rigMesh(pieza).weights;
    const auto={cantidad:pesos.length,estado:estado(),
      normalizados:pesos.every(o=>Math.abs(suma(o)-1)<1e-6),
      dispersos:pesos.every(o=>Object.keys(o).length<=3),
      izquierdaAlBrazo:(pesos[0].brazo||0)>(pesos[0].antebrazo||0),
      derechaAlAntebrazo:(pesos[3].antebrazo||0)>(pesos[3].brazo||0)};
    btn("rigMeshPaint").click(); await wait(350);
    const overlay=document.querySelector("#dzMeshOverlay");
    const pintando={visible:!overlay.hasAttribute("hidden"),
      vertices:overlay.querySelectorAll(".dz-mesh-vertice").length,
      hilos:overlay.querySelectorAll(".dz-mesh-hilo").length,
      activo:btn("rigMeshPaint").classList.contains("active"),
      colorea:new Set([...overlay.querySelectorAll(".dz-mesh-vertice")].map(n=>n.getAttribute("fill"))).size>1};
    const v0=overlay.querySelector('.dz-mesh-vertice[data-i="3"]')||overlay.querySelector(".dz-mesh-vertice");
    const indice=+v0.dataset.i;
    const cv=document.querySelector("#dzCanvas").getBoundingClientRect();
    const cx=cv.left+(+v0.getAttribute("cx")), cy=cv.top+(+v0.getAttribute("cy"));
    const antes={...DZ.doc.scene.rigMesh(pieza).weights[indice]};
    overlay.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,clientX:cx,clientY:cy}));
    for(let i=0;i<5;i++){window.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,clientX:cx+i,clientY:cy}));await wait(20);}
    window.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,clientX:cx,clientY:cy}));
    await wait(350);
    const despues=DZ.doc.scene.rigMesh(pieza).weights[indice];
    const pintado={cambio:JSON.stringify(antes)!==JSON.stringify(despues),
      suma1:Math.abs(suma(despues)-1)<1e-6,subio:(despues[pieza]||0)>(antes[pieza]||0)};
    dzUndo(); await wait(300);
    const trasUndo=JSON.stringify(DZ.doc.scene.rigMesh(pieza).weights[indice])===JSON.stringify(antes);
    const reposo=DZ.doc.scene.rigMesh(pieza).rest;
    DZ.doc.setRigKey("antebrazo",6,{x:0,y:0,r:40,sx:1,sy:1}); await wait(300);
    const posado=DZ.doc.scene.rigMeshSkinnedAt(pieza,6);
    const dist=(i)=>Math.hypot(posado[i].x-reposo[i].x,posado[i].y-reposo[i].y);
    const deforma={movio:posado.some((p,i)=>dist(i)>0.5),aplica:!!DZ.doc.scene.rigMallaAt(pieza,6),
      masCercaDelHueso:dist(3)>dist(0)};
    const copia=LOW.animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(DZ.doc.toJSON())));
    const persiste=(copia.scene.rigMesh(pieza).weights||[]).length===reposo.length;
    btn("rigMeshRemove").click(); await wait(300);
    const quitada={sinMalla:!DZ.doc.scene.rigMesh(pieza),overlayOculto:overlay.hasAttribute("hidden"),
      estado:estado()};
    return {inicial,creada,auto,pintando,pintado,trasUndo,deforma,persiste,quitada,
      errores:(window.__errs||[]).slice(0,3)};
  })()`;

  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const v = result.result?.value;

  if (!v?.inicial?.crear || v.inicial.auto || v.inicial.pintar)
    throw Error("REGRESIÓN: el panel ofrece pesos antes de que exista la malla: " + JSON.stringify(v?.inicial));
  if (!v.creada?.hay || v.creada.cols !== 4 || !v.creada.sinPesos)
    throw Error("REGRESIÓN: crear la malla no deja una rejilla en reposo: " + JSON.stringify(v.creada));
  if (v.auto?.cantidad !== 16 || !v.auto.normalizados || !v.auto.dispersos)
    throw Error("REGRESIÓN: los pesos automáticos no son dispersos ni normalizados: " + JSON.stringify(v.auto));
  if (!v.auto.izquierdaAlBrazo || !v.auto.derechaAlAntebrazo)
    throw Error("REGRESIÓN: el flexi-binding no reparte por distancia al hueso: " + JSON.stringify(v.auto));
  if (!v.pintando?.visible || v.pintando.vertices !== 16 || v.pintando.hilos !== 24 ||
      !v.pintando.activo || !v.pintando.colorea)
    throw Error("REGRESIÓN: el pincel de pesos no muestra la rejilla ni la influencia: " + JSON.stringify(v.pintando));
  if (!v.pintado?.cambio || !v.pintado.suma1 || !v.pintado.subio)
    throw Error("REGRESIÓN: pintar no cambia el peso o rompe la normalización: " + JSON.stringify(v.pintado));
  if (!v.trasUndo) throw Error("REGRESIÓN: pintar pesos dejó de deshacerse");
  if (!v.deforma?.movio || !v.deforma.aplica || !v.deforma.masCercaDelHueso)
    throw Error("REGRESIÓN: mover el hueso no deforma la malla según los pesos: " + JSON.stringify(v.deforma));
  if (!v.persiste) throw Error("REGRESIÓN: los pesos no sobreviven a guardar y reabrir");
  if (!v.quitada?.sinMalla || !v.quitada.overlayOculto || v.quitada.estado !== "sin malla")
    throw Error("REGRESIÓN: quitar la malla no deja la pieza como estaba: " + JSON.stringify(v.quitada));
  if (v.errores?.length) throw Error("REGRESIÓN: excepciones en malla/pesos: " + v.errores.join(" | "));
  if (errors.length) throw Error("REGRESIÓN: excepciones UI: " + errors.slice(0, 3).join(" | "));

  console.log("E2E malla y pesos OK", JSON.stringify(v));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
