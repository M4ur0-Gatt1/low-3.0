/* Recorrido E2E real en Chromium: lienzo -> biblioteca -> humano -> Animar.
   Requiere un Chromium con CDP en http://127.0.0.1:9223. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const stage = name => console.error("E2E etapa: " + name);
  stage("conectar");
  // Pestaña PROPIA: engancharse a "la primera página" tomaba la que estuviera
  // abierta (el panel del navegador, otra corrida) y la prueba medía otra cosa.
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  if (!target?.webSocketDebuggerUrl) throw Error("Chromium no expuso una página CDP");
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  stage("CDP conectado");
  let id = 0; const pending = new Map();
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    // El confirm() de recuperación de escena CONGELA el renderer: sin atenderlo
    // la prueba no falla, se cuelga con «CDP sin respuesta».
    if (msg.method === "Page.javascriptDialogOpening")
      return ws.send(JSON.stringify({ id: ++id, method: "Page.handleJavaScriptDialog", params: { accept: false } }));
    if (msg.method === "Page.javascriptDialogOpening") {
      ws.send(JSON.stringify({ id:++id, method:"Page.handleJavaScriptDialog",
        params:{ accept:false } }));
      return;
    }
    if (!msg.id || !pending.has(msg.id)) return;
    const { ok, fail } = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? fail(Error(JSON.stringify(msg.error))) : ok(msg.result);
  };
  const send = (method, params = {}) => new Promise((ok, fail) => {
    const callId = ++id;
    const timer = setTimeout(() => {
      pending.delete(callId); fail(Error("CDP sin respuesta en " + method));
    }, 15000);
    pending.set(callId, { ok:value => { clearTimeout(timer); ok(value); },
      fail:error => { clearTimeout(timer); fail(error); } });
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable");
  // Los scripts se piden con ?v=<versión>: sin esto Chromium sirve el archivo
  // anterior y la prueba certifica código que ya no existe.
  await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
  stage("navegar");
  // Arranque determinista: el workspace guardado de una corrida anterior decide
  // si la X-sheet esta abierta, y con la X-sheet abierta Supr lo maneja ella.
  // Sin esto la prueba mide el estado que dejo OTRA prueba, no una regresion.
  await send("Page.navigate", { url: pageUrl });
  await new Promise(ok => setTimeout(ok, 600));
  await send("Runtime.evaluate", { expression: "try{localStorage.clear()}catch(e){}" });
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
  stage("ejecutar flujo");
  const expression = `(async()=>{
    await openDesign("C:\\\\mock\\\\rig-test.svg");
    await dzDocInit();
    if(!DZ.rigMode) dzRigToggle();
    dzRigLibraryAdd("human_standard");
    dzRigPanelSync();
    const button=document.querySelector("#rigModeAnim");
    const before={disabled:button.disabled,bones:Object.keys(DZ.doc.scene.rig.bones||{}).length};
    button.click();
    const rig={...before,submode:DZ.rigSubmode,tool:DZ.rigTool,active:button.classList.contains("on")};
    const svg=document.querySelector("#dzCanvas > svg");
    const rect=document.createElementNS("http://www.w3.org/2000/svg","rect");
    rect.setAttribute("x","100"); rect.setAttribute("y","100");
    rect.setAttribute("width","120"); rect.setAttribute("height","80");
    // El inflador infla la LINEA desde v4.39.0 —lo pidio Mauro: «lo que debe
    // inflar es la linea, el contorno»—, asi que el sujeto necesita contorno.
    // Lo que este tramo prueba sigue siendo lo mismo: que un gesto vectorial
    // cambie algo y que cancelarlo lo devuelva EXACTO.
    rect.setAttribute("fill","#e5322d"); rect.setAttribute("stroke","#111");
    rect.setAttribute("stroke-width","6"); svg.appendChild(rect); dzSelect(rect);
    const box=rect.getBoundingClientRect(), cx=box.left+box.width/2, cy=box.top+box.height/2;
    const event=(type,x,y)=>({type,clientX:x,clientY:y,pointerId:71,shiftKey:false,
      target:rect,preventDefault(){},stopPropagation(){}});
    const original=rect.getAttribute("width");
    const contorno=rect.getAttribute("stroke-width");
    dzInflatorDown(event("pointerdown",box.right,cy));
    dzInflatorMove(event("pointermove",box.right+80,cy));
    const changed=rect.getAttribute("stroke-width")!==contorno;
    const cancelled=dzVectorGestureCancel("e2e");
    const vector={changed,cancelled,restored:rect.getAttribute("stroke-width")===contorno,
      idle:!window.LOW.input.pointerController.active};
    // Flujo real del cuadro delimitador: rotar y luego escalar. La geometría
    // SVG debe permanecer intacta y ambos gestos deben seguir al puntero.
    dzSelect(rect);
    const rb0=rect.getBoundingClientRect(), rc={x:rb0.left+rb0.width/2,y:rb0.top+rb0.height/2};
    dzRotateDown({clientX:rc.x,clientY:rb0.top-30,pointerId:72,target:rect,
      preventDefault(){},stopPropagation(){}});
    document.dispatchEvent(new PointerEvent("pointermove",{clientX:rb0.right+30,clientY:rc.y,pointerId:72,bubbles:true}));
    document.dispatchEvent(new PointerEvent("pointerup",{clientX:rb0.right+30,clientY:rc.y,pointerId:72,bubbles:true}));
    const afterRotate=rect.getBoundingClientRect(), transformAfterRotate=rect.getAttribute("transform");
    dzHandleDown({clientX:afterRotate.right,clientY:afterRotate.bottom,pointerId:73,target:rect,
      preventDefault(){},stopPropagation(){}});
    document.dispatchEvent(new PointerEvent("pointermove",{clientX:afterRotate.right+60,clientY:afterRotate.bottom+60,pointerId:73,bubbles:true}));
    document.dispatchEvent(new PointerEvent("pointerup",{clientX:afterRotate.right+60,clientY:afterRotate.bottom+60,pointerId:73,bubbles:true}));
    const afterScale=rect.getBoundingClientRect();
    const transform={rotated:(transformAfterRotate||"").startsWith("matrix("),
      grew:afterScale.width>afterRotate.width&&afterScale.height>afterRotate.height,
      geometryIntact:rect.getAttribute("width")===original&&rect.getAttribute("height")==="80",
      finite:[afterScale.left,afterScale.top,afterScale.width,afterScale.height].every(Number.isFinite)};
    const samples=dzPuntosDeMuestra(rect), localCenter=svg.createSVGPoint();
    localCenter.x=160; localCenter.y=140;
    const expectedCenter=localCenter.matrixTransform(rect.getCTM());
    const rigSampling={count:samples.length,
      transformed:Math.hypot(samples[0].x-expectedCenter.x,samples[0].y-expectedCenter.y)<.01};
    DZ.dirty=false;
    await (async()=>{ const esperar=ms=>new Promise(r=>setTimeout(r,ms));
      const p = dzRigEjemplo();
      // confirmacion nueva y deliberada: el ejemplo REEMPLAZA el dibujo
      for (let i=0;i<20;i++){ const ok=document.querySelector("#dzEjOk");
        if(ok){ ok.click(); break; } await esperar(100); }
      return p; })();
    const exampleIds=Object.keys(DZ_EJEMPLO_RIG);
    const example={pieces:exampleIds.length,allVisible:exampleIds.every(id=>document.getElementById(id)),
      allBound:exampleIds.every(id=>DZ.doc.scene.rigNode(id)?.binding?.elementId===id),
      shoulders:["hombro_izq","hombro_der"].every(id=>DZ.doc.scene.rigNode(id))};
    DZ.doc.setRigKey("brazo_der",12,{x:4,y:-3,r:28,sx:1,sy:1});
    const saved=JSON.parse(JSON.stringify(DZ.doc.toJSON()));
    const reopened=LOW.animation.LowDoc.fromJSON(saved), reopenedArm=reopened.scene.rigNode("brazo_der");
    const exported=dzRigView(svg.outerHTML,12);
    const persistence={bindings:Object.keys(reopened.scene.rig.bindings||{}).length,
      pose:reopenedArm?.keys?.[12]?.r,diagnostics:(reopened.scene.rig.diagnostics||[]).length,
      exportPosed:exported.includes("matrix("),exportClean:!exported.includes("data-rigbase")};
    const track=new LOW.animation.MotionCaptureTrack(DZ.doc);
    track.setPose(1,{hips:{x:.45,y:.7},neck:{x:.45,y:.4},left_ankle:{x:.35,y:.92},right_ankle:{x:.55,y:.92}},1);
    track.setPose(5,{hips:{x:.55,y:.7},neck:{x:.55,y:.4},left_ankle:{x:.35,y:.92},right_ankle:{x:.55,y:.92}},1);
    track.analysisOptions.backgroundTime=1.25;
    track.setSilhouette(2,{width:2,height:1,runs:[2,1],coverage:1,confidence:.2,occluded:true,corrected:false});DZ.doc.mocap=track;dzMocapWire();
    const rigModeBeforeMocap=DZ.rigMode;DZ.rigMode=false;document.querySelector("#dzRigPanel").hidden=true;await dzMocapOpen();
    const mocapIndependent=!DZ.rigMode&&!document.querySelector("#dzMocapPanel").hidden&&document.querySelector("#dzRigPanel").hidden;
    DZ.rigMode=rigModeBeforeMocap;
    const complete=document.querySelector("#mocapPoseInterpolation"),footLock=document.querySelector("#mocapFootLock"),tolerance=document.querySelector("#mocapKeyTolerance"),poseConfidence=document.querySelector("#mocapPoseConfidence");
    complete.checked=true;complete.dispatchEvent(new Event("change",{bubbles:true}));footLock.checked=true;footLock.dispatchEvent(new Event("change",{bubbles:true}));tolerance.value="3";tolerance.dispatchEvent(new Event("input",{bubbles:true}));poseConfidence.value="0.6";poseConfidence.dispatchEvent(new Event("input",{bubbles:true}));
    track.poseAnalysis={detected:2,missed:1,missedFrames:[4],retained:0,model:"pose_landmarker_lite"};
    const poseState=dzMocapPoseStatus(),poseIssueVisible=!document.querySelector("#mocapNextPoseIssue").hidden&&!document.querySelector("#mocapPoseTools").hidden;
    document.querySelector("#mocapNextIssue").click();const issueNavigation=DZ.doc.frame===2;
    document.querySelector("#mocapValidate").click();const validated=DZ.doc.mocap.silhouetteAt(2).corrected===true&&DZ.doc.mocap.silhouetteAt(2).confidence===1;
    DZ.doc.history.undo();const validationUndo=DZ.doc.mocap.silhouetteAt(2).corrected===false;DZ.doc.history.redo();const validationRedo=DZ.doc.mocap.silhouetteAt(2).corrected===true;
    document.querySelector("#mocapNextPoseIssue").click();const poseIssueNavigation=DZ.doc.frame===4;
    const rotoSvg=LOW.animation.mocapMaskSvgContent(track.silhouetteAt(2),{width:1920,height:1080});
    const mocap={generated:poseState.report.generatedFrames,spine:poseState.report.chainFrames.spine,
      optionSaved:DZ.doc.mocap.analysisOptions.poseInterpolation===true&&DZ.doc.mocap.analysisOptions.footLock===true&&DZ.doc.mocap.analysisOptions.keyTolerance===3&&DZ.doc.mocap.analysisOptions.backgroundTime===1.25&&DZ.doc.mocap.analysisOptions.poseConfidence===.6,
      footContacts:poseState.contacts?.ranges?.left?.length===1&&poseState.contacts?.ranges?.right?.length===1,
      applyVisible:!document.querySelector("#mocapApplyRig").hidden,detectorVisible:!!document.querySelector("#mocapDetectPose")&&!document.querySelector("#mocapDetectPose").hidden,status:document.querySelector("#mocapPoseStatus").textContent,
      issueNavigation,poseIssueVisible,poseIssueNavigation,validated,validationUndo,validationRedo,
      rotoscopeSvg:!!rotoSvg&&rotoSvg.includes("<path")&&!rotoSvg.includes("data:image"),independent:mocapIndependent};
    dzSelect(document.getElementById("mano_izq"));
    dzReleaseFocus();
    window.__deleteSeen=null;
    window.addEventListener("keydown",e=>{window.__deleteSeen=e.key;},{once:true});
    const objectBefore={selected:DZ.sel?.id,activeTag:document.activeElement?.tagName,
      shortcuts:!!window.__lowAnimKeys,node:!!DZ.doc.scene.rigNode("mano_izq")};
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"Delete",bubbles:true,cancelable:true}));
    const objectDeleted=!document.getElementById("mano_izq");
    dzRigSetMode("build"); const selectedBoundBone=dzRigSelectNode("mano_der")&&DZ.rigSelectedId==="mano_der"; dzRigPanelSync();
    dzReleaseFocus();
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"Delete",bubbles:true,cancelable:true}));
    const boneDeleted=!DZ.doc.scene.rigNode("mano_der");
    const deletion={objectDeleted,boneDeleted,selectedBoundBone,objectBefore,eventSeen:window.__deleteSeen};
    const canvas={width:DZ.doc.scene.width,height:DZ.doc.scene.height};
    let mediaPipe={loaded:false,inference:false,worker:false,error:""};
    try{const detector=LOW.animation.createMocapPoseWorker(new URL("animation/mocap-pose-worker.js",document.baseURI).href);if(!detector)throw Error("Worker corporal no disponible");
      await detector.call("init",{moduleUrl:new URL("vendor/mediapipe/vision_bundle.mjs",document.baseURI).href,wasmRoot:new URL("vendor/mediapipe/wasm",document.baseURI).href,modelUrl:new URL("models/pose_landmarker_lite.task",document.baseURI).href,minimum:.45});
      const testCanvas=document.createElement("canvas");testCanvas.width=256;testCanvas.height=256;const bitmap=await createImageBitmap(testCanvas),detected=await detector.call("detect",{bitmap,timestamp:0},[bitmap]);mediaPipe={loaded:true,inference:Array.isArray(detected.landmarks),worker:true,poses:detected.landmarks.length,error:""};detector.close();}
    catch(error){mediaPipe.error=String(error?.message||error);}
    const staleSheet=document.querySelector("#dzMocapSheet");staleSheet.hidden=false;staleSheet.innerHTML='<circle cx="10" cy="10" r="5"/>';
    document.querySelector("#dzMocapPanel").hidden=false;DZ.mocapObjectUrl="blob:stale-test";dzDocumentReset();
    const documentReset={sheetHidden:staleSheet.hidden,sheetEmpty:!staleSheet.children.length,panelHidden:document.querySelector("#dzMocapPanel").hidden,blobCleared:DZ.mocapObjectUrl==null};
    return {rig,vector,transform,rigSampling,example,persistence,mocap,deletion,canvas,mediaPipe,documentReset};
  })()`;
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  stage("evaluar resultado");
  ws.close();
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description
    || result.exceptionDetails.text || "Excepción en la interfaz");
  const value = result.result?.value, rig=value?.rig, vector=value?.vector;
  if (!rig || rig.disabled || rig.bones < 1 || rig.submode !== "fk" || rig.tool !== "pose" || !rig.active)
    throw Error("REGRESIÓN: Animar no abrió con esqueleto solo: " + JSON.stringify(value));
  if (!vector?.changed || !vector.cancelled || !vector.restored || !vector.idle)
    throw Error("REGRESIÓN: gesto vectorial no se pudo cancelar limpiamente: " + JSON.stringify(value));
  if (!value.transform?.rotated || !value.transform.grew || !value.transform.geometryIntact || !value.transform.finite)
    throw Error("REGRESIÓN: giro/escala del cuadro delimitador: " + JSON.stringify(value));
  if (value.rigSampling?.count !== 5 || !value.rigSampling.transformed)
    throw Error("REGRESIÓN: Repartir compara pieza y hueso en sistemas distintos: " + JSON.stringify(value));
  if (value.example?.pieces < 18 || !value.example.allVisible || !value.example.allBound || !value.example.shoulders)
    throw Error("REGRESIÓN: personaje completo de Ayuda incompleto o sin vincular: " + JSON.stringify(value));
  if (value.persistence?.bindings < 18 || value.persistence.pose !== 28 || value.persistence.diagnostics ||
      !value.persistence.exportPosed || !value.persistence.exportClean)
    throw Error("REGRESIÓN: rig no sobrevive guardar/reabrir/exportar: " + JSON.stringify(value));
  if (value.mocap?.generated !== 5 || value.mocap?.spine !== 5 || !value.mocap.optionSaved || !value.mocap.applyVisible || !value.mocap.detectorVisible ||
       !value.mocap.footContacts || !value.mocap.issueNavigation || !value.mocap.poseIssueVisible || !value.mocap.poseIssueNavigation || !value.mocap.validated || !value.mocap.validationUndo || !value.mocap.validationRedo || !value.mocap.rotoscopeSvg || !value.mocap.independent)
    throw Error("REGRESIÓN: diagnóstico/opciones de retargeting no funcionan en la interfaz: " + JSON.stringify(value));
  if (!value.deletion?.objectDeleted || !value.deletion?.selectedBoundBone || !value.deletion?.boneDeleted)
    throw Error("REGRESIÓN: Supr no elimina objeto y hueso según contexto: " + JSON.stringify(value));
  if (value.canvas?.width !== 1920 || value.canvas?.height !== 1080)
    throw Error("REGRESIÓN: el lienzo nuevo no es Full HD: " + JSON.stringify(value));
  if (!value.mediaPipe?.loaded || !value.mediaPipe?.inference || !value.mediaPipe?.worker)
    throw Error("REGRESIÓN: MediaPipe, el modelo corporal o su worker local no cargan: " + JSON.stringify(value));
  if (!value.documentReset?.sheetHidden || !value.documentReset?.sheetEmpty || !value.documentReset?.panelHidden || !value.documentReset?.blobCleared)
    throw Error("REGRESIÓN: el documento nuevo conserva manchas o recursos del video anterior: " + JSON.stringify(value));
  console.log("E2E 2D OK: rig, vectores y personaje completo de Ayuda", JSON.stringify(value));
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) {}
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
