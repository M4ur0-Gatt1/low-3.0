/* Smart Bones desde el panel (biblia §4.3, «Acciones conducidas por ángulo»).
   CDP :9223 + mock :8791.

   El recorrido que hace un artista: elegir el hueso conductor, crear la acción,
   acomodar la pieza, grabar, y comprobar que la corrección entra sola según el
   ángulo — y que no se hornea dos veces en las claves. */
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
    const r = await send("Runtime.evaluate", { expression: 'typeof dzSmartNueva==="function" && !!api', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("C:\\\\mock\\\\smart.svg"); await dzDocInit(); await wait(500);
    if(!DZ.rigMode) dzRigToggle(); await wait(300);
    dzRigSetMode("build"); await wait(200);
    const svg=document.querySelector("#dzCanvas > svg"); svg.innerHTML="";
    const mk=(id,x)=>{const g=document.createElementNS("http://www.w3.org/2000/svg","g");
      g.id=id; g.innerHTML='<rect x="'+x+'" y="60" width="90" height="40" fill="#4a6a8a"/>';
      svg.appendChild(g);};
    mk("brazo",20); mk("codo",110);
    if(typeof dzDocCommit==="function") dzDocCommit();
    DZ.doc.ensureRigNodes([
      {id:"brazo",name:"brazo",parentId:null,head:{x:20,y:80},tail:{x:110,y:80},pivot:{x:20,y:80}},
      {id:"codo",name:"codo",parentId:"brazo",head:{x:110,y:80},tail:{x:200,y:80},pivot:{x:110,y:80}},
    ],"Preparar rig");
    await wait(300);
    const btn=(k)=>document.querySelector("#"+k);
    const lista=()=>document.querySelector("#rigSmartList");
    const estado=()=>document.querySelector("#rigSmartEstado").textContent;

    // sin hueso elegido no se puede crear una accion
    DZ.rigSelectedId=null; DZ.sel=null; dzRigPanelSync(); await wait(150);
    const vacio={estado:estado(),nuevoDeshabilitado:btn("rigSmartNew").disabled,
      grabarDeshabilitado:btn("rigSmartRecord").disabled};

    dzRigSelectNode("codo"); dzRigPanelSync(); await wait(200);
    btn("rigSmartNew").click(); await wait(300);
    const acciones=DZ.doc.scene.rig.actions;
    const id=Object.keys(acciones)[0];
    const creada={cantidad:Object.keys(acciones).length,estado:estado(),
      driver:acciones[id].driver.path,min:acciones[id].driver.min,max:acciones[id].driver.max,
      enLista:lista().options.length,driverVisible:document.querySelector("#rigSmartDriver").textContent};

    // acomodar el brazo y grabarlo como la correccion del extremo
    DZ.doc.setRigKey("brazo",1,{x:0,y:0,r:0,sx:1,sy:1});
    DZ.doc.goTo(1);
    DZ.doc.setRigKey("brazo",1,{x:0,y:18,r:0,sx:1,sy:1});
    dzRigSelectNode("brazo"); dzRigPanelSync(); await wait(200);
    lista().value=id; btn("rigSmartRecord").click(); await wait(350);
    const canal=DZ.doc.scene.rig.actions[id].channels["bones/brazo/pose/y"];
    const grabada={hayCanal:!!canal,enUno:canal&&canal.keys[1],enDos:canal&&canal.keys[2]};

    // ahora el brazo vuelve a su lugar y la correccion la pone la accion
    DZ.doc.setRigKey("brazo",1,{x:0,y:0,r:0,sx:1,sy:1});
    DZ.doc.setRigChannelKey("bones/codo/pose/r",1,0);
    DZ.doc.setRigChannelKey("bones/codo/pose/r",10,90);
    await wait(200);
    const y=(f)=>DZ.doc.scene.rigPose("brazo",f).y;
    const conduce={enCero:y(1),enNoventa:y(10),aMitad:y(5.5),
      baseIntacta:DZ.doc.scene.rigPoseBase("brazo",10).y};

    // el rango se corrige desde el panel
    lista().value=id;
    document.querySelector("#rigSmartMax").value="45";
    document.querySelector("#rigSmartMax").dispatchEvent(new Event("change",{bubbles:true}));
    await wait(300);
    const rango={max:DZ.doc.scene.rig.actions[id].driver.max,
      aporteAntes:y(5.5)};

    // escribir una clave NO puede hornear el aporte de la accion
    DZ.doc.setRigChannelKey("bones/codo/pose/r",1,90);
    await wait(150);
    const antesDeClave=DZ.doc.scene.rigPose("brazo",1).y;
    DZ.doc.setRigChannelKey("bones/brazo/pose/r",1,5);
    await wait(150);
    const sinHornear={antes:antesDeClave,despues:DZ.doc.scene.rigPose("brazo",1).y};

    // persistencia y borrado
    const copia=LOW.animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(DZ.doc.toJSON())));
    const persiste=!!(copia.scene.rig.actions[id]&&copia.scene.rig.actions[id].driver.path);
    lista().value=id; btn("rigSmartRemove").click(); await wait(300);
    const quitada={sinAcciones:!Object.keys(DZ.doc.scene.rig.actions).length,estado:estado()};
    // CONTROLES (§4.3, ultimo nivel): un dial con nombre, animable, que puede
    // conducir una accion igual que el angulo de un hueso.
    const estadoDial=()=>document.querySelector("#rigDialEstado").textContent;
    const dialAntes={estado:estadoDial(),filas:document.querySelectorAll("#rigDialLista .rig2-dial").length};
    const pedido=dzDialNuevo();
    for(let i=0;i<60;i++){const inp=document.querySelector("#dzPrIn");
      if(inp){inp.value="boca abierta";document.querySelector("#dzPrOk").click();break;}await wait(25);}
    await pedido; await wait(350);
    const dialId=Object.keys(DZ.doc.scene.rig.controls||{})[0];
    const dialCreado={estado:estadoDial(),filas:document.querySelectorAll("#rigDialLista .rig2-dial").length,id:dialId};
    const rangoDial=document.querySelector("#rigDialLista .rig2-dial input[type=range]");
    rangoDial.value="0.8"; rangoDial.dispatchEvent(new Event("change",{bubbles:true}));
    await wait(350);
    const canalDial=DZ.doc.scene.rigChannel("controls/"+dialId);
    const dialMovido={hayCanal:!!canalDial,valor:DZ.doc.scene.rigControlValue(dialId,DZ.doc.frame),
      claves:canalDial?Object.keys(canalDial.keys).length:0};
    dzFnToggle(); await wait(450);
    const nombresCanal=[...document.querySelectorAll("#dzFnEditor .fn2-lista button span")].map(n=>n.textContent);
    const dialEnEditor=nombresCanal.some(n=>/dial/.test(n));
    dzFnToggle(); await wait(200);
    DZ.doc.createRigAction('linktest',{driverBone:'codo'});dzSmartPanelSync('linktest');
    const conductor=document.querySelector('#rigSmartConductor');conductor.value='controls/boca_abierta';conductor.dispatchEvent(new Event('change'));
    if(DZ.doc.scene.rig.actions.linktest.driver.path!=='controls/boca_abierta')throw Error('No vincula el dial');
    DZ.doc.setRigActionKey('linktest','bones/brazo/pose/y',1,0);
    DZ.doc.setRigActionKey('linktest','bones/brazo/pose/y',2,40);
    const previewBefore=JSON.stringify(DZ.doc.scene.toJSON()),previewUndo=DZ.history.undoStack.length;
    const preview=document.querySelector('#rigSmartPreview');
    preview.value='0';preview.dispatchEvent(new Event('input'));const at0=document.querySelector('#brazo').getAttribute('transform');
    preview.value='1';preview.dispatchEvent(new Event('input'));const at1=document.querySelector('#brazo').getAttribute('transform');
    preview.value='.5';preview.dispatchEvent(new Event('input'));const atHalf=document.querySelector('#brazo').getAttribute('transform');
    if(at0===at1||atHalf===at0||atHalf===at1)throw Error('Mezcla no previsualiza los tres estados');
    if(JSON.stringify(DZ.doc.scene.toJSON())!==previewBefore||DZ.history.undoStack.length!==previewUndo)throw Error('Mezcla modifica documento o Undo');
    document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
    if(dzSmartPreviewSession)throw Error('Escape deja preview activa');
    DZ.doc.removeRigControl('boca_abierta');dzSmartPanelSync('linktest');
    if(!document.querySelector('#rigSmartRecord').disabled||!document.querySelector('#rigSmartValidation').textContent.includes('referencias'))throw Error('No explica conductor eliminado');
    return {vacio,creada,grabada,conduce,rango,sinHornear,persiste,quitada,
      dialAntes,dialCreado,dialMovido,dialEnEditor,
      errores:(window.__errs||[]).slice(0,3)};
  })()`;

  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const v = result.result?.value;

  if (v?.vacio?.estado !== "sin acciones" || !v.vacio.nuevoDeshabilitado || !v.vacio.grabarDeshabilitado)
    throw Error("REGRESIÓN: el panel ofrece Smart Bones sin hueso ni acción: " + JSON.stringify(v?.vacio));
  if (v.creada?.cantidad !== 1 || v.creada.driver !== "bones/codo/pose/r" || v.creada.enLista !== 1)
    throw Error("REGRESIÓN: crear la acción no la ata al ángulo del hueso elegido: " + JSON.stringify(v.creada));
  if (!/codo/.test(v.creada.driverVisible))
    throw Error("REGRESIÓN: el panel no dice qué conduce la acción: " + JSON.stringify(v.creada.driverVisible));
  if (!v.grabada?.hayCanal || v.grabada.enUno !== 0 || Math.abs(v.grabada.enDos - 18) > 1e-6)
    throw Error("REGRESIÓN: grabar no guarda reposo y corrección: " + JSON.stringify(v.grabada));
  if (Math.abs(v.conduce.enCero) > 1e-6 || Math.abs(v.conduce.enNoventa - 18) > 1e-6)
    throw Error("REGRESIÓN: el ángulo no dosifica la corrección: " + JSON.stringify(v.conduce));
  if (!(v.conduce.aMitad > 3 && v.conduce.aMitad < 15))
    throw Error("REGRESIÓN: a mitad de rango la acción no aporta la mitad: " + JSON.stringify(v.conduce));
  if (Math.abs(v.conduce.baseIntacta) > 1e-6)
    throw Error("REGRESIÓN: la acción se metió en la pose base: " + JSON.stringify(v.conduce));
  if (v.rango?.max !== 45)
    throw Error("REGRESIÓN: el rango del conductor no se puede corregir: " + JSON.stringify(v.rango));
  if (Math.abs(v.sinHornear.antes - v.sinHornear.despues) > 1e-6)
    throw Error("REGRESIÓN: escribir una clave horneó el aporte de la acción y se aplica dos veces: " + JSON.stringify(v.sinHornear));
  if (!v.persiste) throw Error("REGRESIÓN: las acciones no sobreviven a guardar y reabrir");
  if (!v.quitada?.sinAcciones || v.quitada.estado !== "sin acciones")
    throw Error("REGRESIÓN: quitar la acción no la saca del panel: " + JSON.stringify(v.quitada));
  if (v.dialAntes?.estado !== "sin controles" || v.dialAntes.filas)
    throw Error("REGRESIÓN: el panel de controles no arranca vacío: " + JSON.stringify(v.dialAntes));
  if (v.dialCreado?.filas !== 1 || v.dialCreado.id !== "boca_abierta")
    throw Error("REGRESIÓN: crear un control desde el panel: " + JSON.stringify(v.dialCreado));
  if (!v.dialMovido?.hayCanal || Math.abs(v.dialMovido.valor - 0.8) > 1e-6 || v.dialMovido.claves !== 1)
    throw Error("REGRESIÓN: mover el dial no deja clave en el cuadro actual: " + JSON.stringify(v.dialMovido));
  if (!v.dialEnEditor)
    throw Error("REGRESIÓN: el dial dejó de aparecer como canal en el editor de curvas");
  if (v.errores?.length) throw Error("REGRESIÓN: excepciones en Smart Bones: " + v.errores.join(" | "));
  if (errors.length) throw Error("REGRESIÓN: excepciones UI: " + errors.slice(0, 3).join(" | "));

  console.log("E2E smart bones OK", JSON.stringify(v));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
