const endpoint=process.argv[2]||"http://127.0.0.1:9223";
const url=process.argv[3]||"http://127.0.0.1:8791/ui/index.html?mock=1";
async function main(){
 const existing=url==="-";
 const target=existing?(await(await fetch(endpoint+"/json")).json()).find(t=>t.type==="page"):
   await(await fetch(endpoint+"/json/new?about:blank",{method:"PUT"})).json();
 const ws=new WebSocket(target.webSocketDebuggerUrl); await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>{pending.delete(n);reject(Error("Timeout "+method));},90000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id:n,method,params}));});
 try{
 await send("Page.enable");await send("Runtime.enable");await send("Network.enable");await send("Network.setCacheDisabled",{cacheDisabled:true});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:0,y:0,button:'left',clickCount:1});
 await send("Emulation.setDeviceMetricsOverride",{width:1366,height:768,deviceScaleFactor:1,mobile:false});
 await send("Emulation.setFocusEmulationEnabled",{enabled:true});
 if(!existing)await send("Page.navigate",{url});
 else await send("Page.reload",{ignoreCache:true});
 let ready=false;for(let i=0;i<80;i++){const r=await send("Runtime.evaluate",{expression:'!!globalThis.LOW?.rigging?.flexibleLimbUI && !!api',returnByValue:true});if(r.result?.value){ready=true;break;}await new Promise(r=>setTimeout(r,250));}
 if(!ready)throw Error("La herramienta de articulación no arrancó");
 await send("Emulation.setFocusEmulationEnabled",{enabled:true});
 const result=await send("Runtime.evaluate",{awaitPromise:true,returnByValue:true,expression:`(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms));const assert=(v,m)=>{if(!v)throw Error(m)};
 await openDesign(${JSON.stringify(process.argv[4]||"mock.svg")});await dzDocInit();await wait(500);
 if(typeof closeL3d==='function')closeL3d();
 if(!DZ.anim)await dzAnimToggle();
 if(!DZ.rigMode)dzRigToggle();dzRigSetMode("build");await wait(200);
 let svg=document.querySelector("#dzCanvas > svg");svg.innerHTML='<path id="limbtest" d="M100 180 L500 180 L500 220 L100 220 Z" fill="#ed853b"/>';
 dzDocCommit();await wait(100);svg=document.querySelector("#dzCanvas > svg");
 const original=DZ.doc.drawing.content;dzSelect(svg.querySelector("#limbtest"));
 const before=DZ.history.undoStack.length;
 document.querySelector("#rigLimbCut").click();
 const screen=p=>new DOMPoint(p.x,p.y).matrixTransform(svg.getScreenCTM());
 const event=(type,p)=>{const q=screen(p);document.querySelector("#dzCanvas").dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,button:0,clientX:q.x,clientY:q.y}));};
 event("pointerdown",{x:300,y:160});event("pointermove",{x:300,y:240});
 const guide=document.querySelector(".rig-limb-guide polyline");
 assert(guide && guide.getAttribute("points").split(" ").length===2,"No previsualiza la línea de corte");
 assert(DZ.doc.drawing.content===original && DZ.history.undoStack.length===before,"La vista previa modifica el dibujo o historial");
 document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
 assert(!document.querySelector(".rig-limb-guide"),"Esc deja la vista previa activa");
 event("pointermove",{x:400,y:240});
 assert(DZ.doc.drawing.content===original && DZ.history.undoStack.length===before,"Cancelar cambia el dibujo");
 document.querySelector("#rigLimbArm").click();
 for(const p of [{x:100,y:200},{x:300,y:200},{x:500,y:200}]){
 const q=new DOMPoint(p.x,p.y).matrixTransform(svg.getScreenCTM());
 document.querySelector("#dzCanvas").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,button:0,clientX:q.x,clientY:q.y}));}
 await wait(350);
 const sc=DZ.doc.scene, mesh=sc.rigMesh("limbtest");
 assert(mesh,"Los tres clics no crearon malla: "+document.querySelector("#rigLimbHint").textContent);
 assert(sc.rigNode("limbtest:lower").parentId==="limbtest:upper","Sin cadena articulada");
 assert(mesh.weights.every(w=>Math.abs(Object.values(w).reduce((a,b)=>a+b,0)-1)<1e-6),"Pesos inválidos");
 assert(DZ.history.undoStack.length-before===1,"Crear articulación requiere más de un Undo: "+JSON.stringify(DZ.history.undoStack.slice(before).map(e=>e.label)));
 const beforePose=DZ.history.undoStack.length;
 assert(!document.querySelector('#rigLimbPose').hidden,'Falta el siguiente paso visible');
 document.querySelector('#rigLimbPose').click();
 assert(DZ.rigSubmode==='fk'&&DZ.rigTool==='pose'&&DZ.rigSelectedId==='limbtest:lower','Posar no prepara herramienta y articulación');
 assert(DZ.history.undoStack.length===beforePose,'Entrar a posar crea una clave o historial');
 dzRigSetMode('build');
 dzUndo();await wait(150);assert(!DZ.doc.scene.rigMesh("limbtest"),"Undo conserva la malla");assert(DZ.doc.drawing.content===original,"Undo no devuelve el dibujo original");
 document.querySelector('#rigLimbPose').click();assert(DZ.rigSubmode==='build','Posar reutiliza una articulación deshecha');
 dzRedo();await wait(150);assert(DZ.doc.scene.rigMesh("limbtest"),"Redo no recupera el rig");
 const base=document.querySelector("#limbtest").getAttribute("d");
 DZ.doc.setRigKey("limbtest:lower",1,{r:70,x:0,y:0,sx:1,sy:1});await wait(200);dzRigApplyLive(1);
 const painted=document.querySelector("#limbtest").getAttribute("d");assert(painted!==base,"El hueso no dobla el dibujo visible");
 const exported=new DOMParser().parseFromString(dzRigView(dzCuadroSvgTexto(1),1),'image/svg+xml');
 assert(exported.querySelector('#limbtest')?.getAttribute('d')===painted,'Exportar pierde la deformación visible del codo');
 const mapper=DZ.doc.scene.rigMallaAt("limbtest",1), root=mapper.punto({x:100,y:200}), tip=mapper.punto({x:500,y:200});
 assert(Math.hypot(root.x-100,root.y-200)<1,"El hombro se mueve al doblar el codo");assert(tip.y>300,"La muñeca no sigue al codo");
 const restored=LOW.animation.LowDoc.fromJSON(JSON.stringify(DZ.doc.toJSON()));
 assert(restored.scene.rigMallaAt("limbtest",1),"Guardar/reabrir pierde el doblez");
 dzRigSetMode("build");
 svg=document.querySelector("#dzCanvas > svg");const rect=document.createElementNS(svg.namespaceURI,"rect");rect.id="legtest";rect.setAttribute("x","600");rect.setAttribute("y","100");rect.setAttribute("width","40");rect.setAttribute("height","400");rect.setAttribute("fill","#46b5ca");svg.appendChild(rect);dzDocCommit();
 dzSelect(document.querySelector("#legtest"));document.querySelector("#rigLimbLeg").click();
 document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}));
 assert(!document.querySelector(".rig-limb-guide")&&!DZ.doc.scene.rigNode("legtest"),"Cancelar modifica el dibujo o deja el gesto activo");
 dzSelect(document.querySelector("#legtest"));document.querySelector("#rigLimbLeg").click();
 svg=document.querySelector("#dzCanvas > svg");
 for(const p of [{x:620,y:100},{x:620,y:300},{x:620,y:500}]){const q=new DOMPoint(p.x,p.y).matrixTransform(svg.getScreenCTM());document.querySelector("#dzCanvas").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,button:0,clientX:q.x,clientY:q.y}));}
 await wait(300);assert(DZ.doc.scene.rigMesh("legtest"),"No crea rodilla sobre rectángulo");assert(document.querySelector("#legtest").tagName.toLowerCase()==="path","El rectángulo no se convirtió en geometría flexible");
 DZ.doc.setRigKey("legtest:lower",1,{r:-60,x:0,y:0,sx:1,sy:1});dzRigApplyLive(1);
 assert(DZ.doc.scene.rigMallaAt("legtest",1).punto({x:620,y:500}).x>700,"La rodilla no dobla");
 dzRigSetMode("build");svg=document.querySelector("#dzCanvas > svg");
 const shape=document.createElementNS(svg.namespaceURI,"rect");shape.id="cuttest";shape.setAttribute("x","700");shape.setAttribute("y","100");shape.setAttribute("width","200");shape.setAttribute("height","100");shape.setAttribute("fill","#7fc975");svg.appendChild(shape);dzDocCommit();
 const precut=DZ.doc.drawing.content;dzSelect(document.querySelector("#cuttest"));const cutBefore=DZ.history.undoStack.length;
 document.querySelector("#rigLimbCut").click();
 for(const p of [{x:800,y:50},{x:800,y:250}]){const q=new DOMPoint(p.x,p.y).matrixTransform(svg.getScreenCTM());document.querySelector("#dzCanvas").dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,button:0,clientX:q.x,clientY:q.y}));}
 await wait(300);const pieces=[...document.querySelectorAll('#dzCanvas [id^="cuttest"]')];
 assert(pieces.length===2,"El corte no produce dos piezas");assert(pieces.every(p=>p.getBBox().width>95&&p.getBBox().width<105),"El corte altera el ancho de las piezas");
 assert(DZ.history.undoStack.length-cutBefore===1,"El corte requiere varios Undo");dzUndo();await wait(150);assert(DZ.doc.drawing.content===precut,"Undo no vuelve a unir el dibujo cortado");dzRedo();await wait(150);assert(document.querySelectorAll('#dzCanvas [id^="cuttest"]').length===2,"Redo pierde una pieza");
 svg=document.querySelector('#dzCanvas > svg');const group=document.createElementNS(svg.namespaceURI,'g');group.id='complexLimb';group.setAttribute('transform','translate(1000 350)');group.setAttribute('fill','#b778bf');group.innerHTML='<g transform="scale(1 .7)"><path d="M0 0 Q150 -10 300 0 L300 40 Q150 50 0 40 Z"/><path d="M20 10L280 10" fill="none" stroke="#553360" stroke-width="3"/></g>';svg.append(group);dzDocCommit();
 const groupBefore=DZ.doc.drawing.content;LOW.rigging.flexibleLimbUI.build(document.querySelector('#complexLimb'),[{x:1000,y:364},{x:1150,y:364},{x:1300,y:364}],'arm');
 const complex=document.querySelector('#complexLimb');assert(complex.querySelectorAll('path').length===2&&!complex.hasAttribute('transform')&&!complex.querySelector('[transform]'),'Grupo transformado pierde trazos o conserva transformaciones duplicadas');
 const groupBase=complex.querySelector('path').getAttribute('d');DZ.doc.setRigKey('complexLimb:lower',1,{r:45});dzRigApplyLive(1);
 const groupLive=document.querySelector('#complexLimb path').getAttribute('d');assert(groupLive!==groupBase,'Grupo no se deforma');
 const groupExport=new DOMParser().parseFromString(dzRigView(dzCuadroSvgTexto(1),1),'image/svg+xml');assert(groupExport.querySelector('#complexLimb path').getAttribute('d')===groupLive&&groupExport.querySelector('#complexLimb').getAttribute('fill')==='#b778bf','Export de grupo cambia geometría o estilo');
 return {vertices:mesh.rest.length,undo:1,visible:painted!==base,root,tip,persiste:true,rodilla:true,cancelar:true,corte:2};})()`});
 if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
 console.log("E2E articulación flexible OK",JSON.stringify(result.result.value));
 const evalValue=async expression=>{const r=await send("Runtime.evaluate",{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 await evalValue("closeL3d()");
 await evalValue(`(()=>{dzDocCommit();const content=DZ.doc.drawing.content,undo=DZ.history.undoStack.length;dzSelect(document.querySelector('#cuttest'));dzDocCommit();if(DZ.doc.drawing.content!==content||DZ.history.undoStack.length!==undo)throw Error('Seleccionar crea una edición fantasma');})()`);
 await send("Emulation.setFocusEmulationEnabled",{enabled:true});
 const pos=await evalValue(`(()=>{dzSelect(document.querySelector('#cuttest'));LOW.rigging.flexibleLimbUI.start('cut');window.__limbBefore={content:DZ.doc.drawing.content,undo:DZ.history.undoStack.length};const r=document.querySelector('#dzCanvas').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 await send("Input.dispatchMouseEvent",{type:"mousePressed",...pos,button:"left",clickCount:1});
 await send("Input.dispatchMouseEvent",{type:"mouseReleased",...pos,button:"left",clickCount:1});
 const initialGuide=await evalValue("document.querySelector('.rig-limb-guide polyline').getAttribute('points')");
 await send("Input.dispatchMouseEvent",{type:"mouseMoved",x:pos.x+30,y:pos.y+40});
 await new Promise(r=>setTimeout(r,100));
 if(await evalValue("document.querySelector('.rig-limb-guide polyline').getAttribute('points')")===initialGuide)throw Error("La guía queda inmóvil al mover el puntero");
 if(!await evalValue(`(()=>{const p=document.querySelector('.rig-limb-guide polyline');return !!p&&p.getAttribute('points')?.split(' ').length===2;})()`))throw Error("La guía no responde al puntero físico");
 await send("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape"});
 await send("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape"});
 if(!await evalValue(`!document.querySelector('.rig-limb-guide')&&DZ.doc.drawing.content===__limbBefore.content&&DZ.history.undoStack.length===__limbBefore.undo`)){throw Error("Cancelar físicamente altera el dibujo o deja la guía");}
 console.log("Vista previa con puntero físico y Escape OK");
 const poseDrag=await evalValue(`(()=>{dzRigSetMode('fk');dzRigSetTool('pose');dzRigSelectNode('limbtest:lower');dzRigApplyLive(1);const el=document.querySelector('.dz-rig-bone-tip[data-id="limbtest:lower"]');const r=el.getBoundingClientRect();const joint=document.querySelector('.dz-rig-joint[data-id="limbtest:lower"]').getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2,cx=joint.x+joint.width/2,cy=joint.y+joint.height/2,a=-.3;window.__poseBefore={path:document.querySelector('#limbtest').getAttribute('d'),rig:JSON.stringify(DZ.doc.scene.rig),undo:DZ.history.undoStack.length};return{x,y,toX:cx+(x-cx)*Math.cos(a)-(y-cy)*Math.sin(a),toY:cy+(x-cx)*Math.sin(a)+(y-cy)*Math.cos(a)};})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:poseDrag.x,y:poseDrag.y,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:poseDrag.toX,y:poseDrag.toY,button:'left',buttons:1});
 await new Promise(r=>setTimeout(r,100));
 if(!await evalValue(`document.querySelector('#limbtest').getAttribute('d')!==__poseBefore.path&&JSON.stringify(DZ.doc.scene.rig)===__poseBefore.rig`))throw Error('Posar no deforma la malla durante el arrastre sin hornear claves');
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:poseDrag.toX,y:poseDrag.toY,button:'left',clickCount:1});
 await new Promise(r=>setTimeout(r,100));
 if(!await evalValue(`DZ.history.undoStack.length===__poseBefore.undo+1`))throw Error('Posar requiere mas de un Undo');
 await evalValue('dzUndo();dzRigApplyLive(1)');
 console.log('Pose física: deformación durante arrastre y un Undo OK');
 const weightPoint=await evalValue(`(()=>{dzRigSelectNode('limbtest:lower');dzMeshPanelSync();if(dzMeshBoneId()!=='limbtest')throw Error('El codo no encuentra la malla portadora');if(!DZ.meshPaint)dzMeshPaintToggle();window.__weightsBefore={data:JSON.stringify(DZ.doc.scene.rigMesh('limbtest').weights),undo:DZ.history.undoStack.length};const el=document.querySelector('#dzMeshOverlay [data-i="5"]'),r=el.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...weightPoint,button:'left',clickCount:1});
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
 await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape'});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',...weightPoint,button:'left',clickCount:1});
 if(!await evalValue(`JSON.stringify(DZ.doc.scene.rigMesh('limbtest').weights)===__weightsBefore.data&&DZ.history.undoStack.length===__weightsBefore.undo`))throw Error('Cancelar pintura cambia pesos');
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...weightPoint,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',...weightPoint,button:'left',clickCount:1});
 if(!await evalValue(`(()=>{const weights=DZ.doc.scene.rigMesh('limbtest').weights,before=JSON.parse(__weightsBefore.data);return weights[5]['limbtest:lower']>before[5]['limbtest:lower']&&!weights[5].limbtest&&DZ.history.undoStack.length===__weightsBefore.undo+1;})()`))throw Error('Pintar no afecta el hueso influyente o crea peso en portador');
 await evalValue("dzUndo();dzMeshOverlayRender();document.querySelector('#rigMeshOperation').value='lock'");
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...weightPoint,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',...weightPoint,button:'left',clickCount:1});
 if(!await evalValue("DZ.doc.scene.rigMesh('limbtest').locked[5]===true"))throw Error('El pincel no bloquea pesos');
 await evalValue("window.__lockedWeights=JSON.stringify(DZ.doc.scene.rigMesh('limbtest').weights);document.querySelector('#rigMeshOperation').value='smooth'");
 await send('Input.dispatchMouseEvent',{type:'mousePressed',...weightPoint,button:'left',clickCount:1});
 await send('Input.dispatchMouseEvent',{type:'mouseReleased',...weightPoint,button:'left',clickCount:1});
 if(!await evalValue("JSON.stringify(DZ.doc.scene.rigMesh('limbtest').weights)===__lockedWeights"))throw Error('Suavizar cambia pesos bloqueados');
 await evalValue("dzUndo();document.querySelector('#rigMeshOperation').value='paint';DZ.meshPaint=false;dzMeshPanelSync();dzMeshOverlayRender();dzRigApplyLive(1)");
 console.log('Pesos del codo: pintura física, cancelación e influencia correcta OK');
 await evalValue(`dzRigSetMode('fk');dzRigSelectNode('limbtest:lower');dzRigApplyLive(1);window.__correctionBefore={rig:JSON.stringify(DZ.doc.scene.rig),content:DZ.doc.drawing.content,undo:DZ.history.undoStack.length,path:document.querySelector('#limbtest').getAttribute('d')};LOW.rigging.limbCorrectiveUI.start()`);
 const dragPoint=async()=>{
   const p=await evalValue(`(()=>{const c=document.querySelector('.rig-corrective-overlay circle[data-vertex="5"]');if(!c)throw Error(document.querySelector('#rigCorrectiveHint').textContent);const r=c.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
   await send("Input.dispatchMouseEvent",{type:"mousePressed",...p,button:"left",clickCount:1});
   await new Promise(r=>setTimeout(r,40));
   await send("Input.dispatchMouseEvent",{type:"mouseMoved",x:p.x,y:p.y-24,button:"left",buttons:1});
   await new Promise(r=>setTimeout(r,100));
   await send("Input.dispatchMouseEvent",{type:"mouseReleased",x:p.x,y:p.y-24,button:"left",clickCount:1});
 };
 await dragPoint();
 if(process.env.LOW_LIMB_EDITOR_SCREENSHOT){const shot=await send('Page.captureScreenshot',{format:'png'});require('fs').writeFileSync(process.env.LOW_LIMB_EDITOR_SCREENSHOT,Buffer.from(shot.data,'base64'));}
 if(!await evalValue(`JSON.stringify(DZ.doc.scene.rig)===__correctionBefore.rig&&DZ.doc.drawing.content===__correctionBefore.content&&document.querySelector('#limbtest').getAttribute('d')!==__correctionBefore.path`))throw Error("Corregir no previsualiza o modifica estado antes de guardar");
 await send("Input.dispatchKeyEvent",{type:"keyDown",key:"Escape",code:"Escape"});
 await send("Input.dispatchKeyEvent",{type:"keyUp",key:"Escape",code:"Escape"});
 if(!await evalValue(`!document.querySelector('.rig-corrective-overlay')&&DZ.history.undoStack.length===__correctionBefore.undo&&document.querySelector('#limbtest').getAttribute('d')===__correctionBefore.path`))throw Error("Cancelar correctivo no restaura pose/historial");
 await evalValue("LOW.rigging.limbCorrectiveUI.start()");await dragPoint();
 const savePosition=await evalValue(`(()=>{const r=document.querySelector('#rigCorrectiveSave').getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 await send("Input.dispatchMouseEvent",{type:"mousePressed",...savePosition,button:"left",clickCount:1});
 await send("Input.dispatchMouseEvent",{type:"mouseReleased",...savePosition,button:"left",clickCount:1});
 const proof=await evalValue(`(async()=>{
   const assert=(v,m)=>{if(!v)throw Error(m)},wait=ms=>new Promise(r=>setTimeout(r,ms));await wait(180);
   assert(!document.querySelector('.rig-corrective-overlay'),'Guardar no cierra correctivo');
   const ids=Object.keys(DZ.doc.scene.rig.actions);assert(ids.length===1,'No guarda una acción correctiva');
   assert(DZ.history.undoStack.length===__correctionBefore.undo+1,'Guardar necesita más de un Undo');
   const id=ids[0],at70=DZ.doc.scene.rigMeshSkinnedAt('limbtest',1)[5];
   const live=document.querySelector('#limbtest').getAttribute('d');assert(live!==__correctionBefore.path,'La corrección no se aplica');
   dzUndo();await wait(80);dzRigApplyLive(1);assert(document.querySelector('#limbtest').getAttribute('d')===__correctionBefore.path,'Undo deja correctivo aplicado');
   dzRedo();await wait(80);dzRigApplyLive(1);assert(document.querySelector('#limbtest').getAttribute('d')===live,'Redo pierde correctivo');
   const restored=LOW.animation.LowDoc.fromJSON(JSON.stringify(DZ.doc.toJSON()));
   const p=restored.scene.rigMeshSkinnedAt('limbtest',1)[5];assert(Math.hypot(p.x-at70.x,p.y-at70.y)<1e-6,'Reabrir pierde correctivo');
   for(const angle of [0,35,70,-35]){
     restored.setRigKey('limbtest:lower',1,{r:angle});
     const d=restored.scene.rigMeshActionOffsets('limbtest',1,144)[5];
     const expected=angle<=0?0:angle/70;
     const full=DZ.doc.scene.rigMeshActionOffsets('limbtest',1,144)[5];
     assert(Math.abs(Math.hypot(d.x,d.y)-Math.hypot(full.x,full.y)*expected)<1e-5,'Correctivo no sigue el ángulo '+angle);
   }
   const exported=new DOMParser().parseFromString(dzRigView(dzCuadroSvgTexto(1),1),'image/svg+xml');
   assert(exported.querySelector('#limbtest').getAttribute('d')===live,'Exportar pierde correctivo');
   assert(DZ.doc.drawing.content===__correctionBefore.content,'Correctivo hornea geometría en dibujo');
   const localOffset=DZ.doc.scene.rigMeshActionOffsets('limbtest',1,144)[5];
   restored.setRigKey('limbtest:lower',1,{r:70});restored.setRigKey('limbtest:upper',1,{r:90});
   const rotated=restored.scene.rigMeshActionOffsets('limbtest',1,144)[5];
   assert(Math.hypot(rotated.x+localOffset.y,rotated.y-localOffset.x)<1e-4,'El correctivo no acompaña la rotación del personaje');
   const png=await dzSvgToPng(exported.documentElement.outerHTML,512);assert(png?.startsWith('data:image/png'),'No rasteriza el fotograma corregido');
   window.__correctiveExport={live,png};
   return {corrective:id,undo:1,angles:[0,35,70,-35],reopened:true,exportMatches:true};
 })()`);
 console.log("Correctivo físico, cancelación, acción, Undo/Redo, ángulos y exportación OK",JSON.stringify(proof));
 const diskBase=process.env.LOW_LIMB_SAVE_BASE||null;
 const savedProof=await evalValue(`(async()=>{
   const base=${JSON.stringify(diskBase)},originalSave=api.save_file,originalOpen=api.open_file;
   const paths=base?[base+'.low',base+'-reopened.low']:['C:/mock/corrective-save.low','C:/mock/corrective-reopened.low'];
   let payload='';
   try{
     if(!base){api.save_file=async(path,content)=>{payload=content;return{path,name:'corrective.low',atomic:true}};api.open_file=async path=>({path,name:'corrective.low',content:payload});}
     DZ.doc.path=paths[0];if(!await dzSceneSave(false))throw Error('Guardar escena falló');
     if(base){const read=await api.open_file(paths[0]);if(!read?.content)throw Error('El archivo guardado no se puede leer');const copy=await api.save_file(paths[1],read.content);if(copy?.error)throw Error(copy.error);}
     const beforeDoc=DZ.doc;
     if(!await dzSceneOpen(paths[1])||DZ.doc===beforeDoc)throw Error('Reabrir no carga un documento nuevo');
     await new Promise(r=>setTimeout(r,250));dzRigApplyLive(1);
     if(document.querySelector('#limbtest')?.getAttribute('d')!==__correctiveExport.live)throw Error('La escena reabierta cambia el correctivo visible');
     const text=dzRigView(dzCuadroSvgTexto(1),1),parsed=new DOMParser().parseFromString(text,'image/svg+xml');
     if(parsed.querySelector('#limbtest')?.getAttribute('d')!==__correctiveExport.live)throw Error('Exportar desde escena reabierta cambia la forma');
     return {nativeDisk:!!base,saved:true,reopened:true,exportMatches:true};
   }finally{api.save_file=originalSave;api.open_file=originalOpen;}
 })()`);
 console.log('Guardar y reabrir por el flujo de LOW OK',JSON.stringify(savedProof));
 if(process.env.LOW_LIMB_SCREENSHOT){const shot=await send("Page.captureScreenshot",{format:"png"});require("fs").writeFileSync(process.env.LOW_LIMB_SCREENSHOT,Buffer.from(shot.data,"base64"));}
 }finally{await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:0,y:0,button:'left',clickCount:1}).catch(()=>{});ws.close();if(!existing)await fetch(endpoint+"/json/close/"+target.id);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
