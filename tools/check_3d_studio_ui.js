/* Verificación del estudio compilado, con WebGL y controles reales. */
const fs=require('fs');
const endpoint=process.env.LOW_3D_CDP||'http://127.0.0.1:9223';
const url=process.env.LOW_3D_URL||'http://127.0.0.1:8791/ui/estudio3d/index.html';
async function main(){
 const embedded=!!process.env.LOW_3D_EMBEDDED;
 const target=embedded?(await(await fetch(endpoint+'/json')).json()).find(t=>t.type==='page') : await(await fetch(endpoint+'/json/new?about:blank',{method:'PUT'})).json();
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let id=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data),p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);}};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error('Timeout '+method));},40000);pending.set(n,{resolve:v=>{clearTimeout(t);resolve(v);},reject:e=>{clearTimeout(t);reject(e);}});ws.send(JSON.stringify({id:n,method,params}));});
 let inFrame=false;
 const evaluate=async expression=>{if(inFrame)expression=`document.querySelector('#l3dFrame').contentWindow.eval(${JSON.stringify(expression)})`;const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 try{
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
 await send('Emulation.setDeviceMetricsOverride',{width:Number(process.env.LOW_3D_WIDTH)||1366,height:768,deviceScaleFactor:1,mobile:false});
 if(embedded){await evaluate('openL3d()');await new Promise(r=>setTimeout(r,1200));inFrame=true;}else await send('Page.navigate',{url});
 let ready=false;for(let i=0;i<120;i++){if(await evaluate('!!window.__low3d && !!window.__lowStore')){ready=true;break;}await new Promise(r=>setTimeout(r,250));}
 if(!ready)throw Error('El motor 3D no arrancó');
 await new Promise(r=>setTimeout(r,500));
 console.log(await evaluate('JSON.stringify({canvas:[...document.querySelectorAll("canvas")].map(c=>({w:c.clientWidth,h:c.clientHeight})),buttons:document.querySelectorAll("button").length,tool:window.__lowStore.getState().currentTool})'));
 if(!process.env.LOW_3D_BASELINE){
   const assert=async(expression,message)=>{if(!await evaluate(expression))throw Error(message);};
   const click=async selector=>{await evaluate(`(()=>{const el=document.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Control ausente: '+${JSON.stringify(selector)});el.click();})()`);await new Promise(r=>setTimeout(r,80));};
   const key=async(key,code,modifiers=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers});await new Promise(r=>setTimeout(r,80));};
   const stroke=async(x,y,dx,dy)=>{await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});for(let i=1;i<=14;i++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:x+dx*i/14,y:y+dy*Math.sin(i/14*Math.PI),button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:x+dx,y,button:'left',clickCount:1});await new Promise(r=>setTimeout(r,150));};
   await assert('!!document.querySelector(".studio-chrome")','Falta la nueva interfaz');
   await assert('!document.querySelector(".studio-inspector") && document.querySelectorAll("button").length<=26','La vista inicial vuelve a saturarse de paneles');
   await evaluate('__low3d.newProject();__low3d.setView("front")');
   await click('[data-tool="pencil"]');await stroke(350,330,180,55);
   await assert('__low3d.exportProject().strokes.length===1','Dibujar en el lienzo no genera geometría');
   await assert(`!document.querySelector('[aria-label="Deshacer (Ctrl+Z)"]').disabled`,'Deshacer no refleja el historial');
   await click('[aria-label="Deshacer (Ctrl+Z)"]');await assert('__low3d.exportProject().strokes.length===0','Deshacer no elimina el trazo');
   await click('[aria-label="Rehacer (Ctrl+Shift+Z)"]');await assert('__low3d.exportProject().strokes.length===1','Rehacer no restaura el trazo');
   await click('.studio-header-actions button:nth-child(2)');
   await click('.studio-option-grid button:first-child');
   await evaluate('__low3d.selectObjectById(__lowStore.getState().objects[0].id);document.querySelector(".studio-inspector input[type=number]").focus()');
   await key('Backspace','Backspace');await key('z','KeyZ',2);
   await assert('__low3d.exportProject().strokes.length===1','Editar un campo borra o deshace el dibujo');
   await evaluate('document.activeElement.blur()');
   await click('[aria-label="Cerrar inspector"]');
   await evaluate('__low3d.setView("top")');
   await assert(`document.querySelector('[aria-label="Vista de cámara"]').value==="top"`,'La UI no sigue los cambios de cámara del motor');
   const cube=await evaluate('(()=>{const r=document.querySelector(".nav-cubo").getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()');
   await send('Input.dispatchMouseEvent',{type:'mousePressed',...cube,button:'left',clickCount:1});
   await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:cube.x-15,y:cube.y-10,button:'left',buttons:1});
   await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:cube.x-15,y:cube.y-10,button:'left',clickCount:1});
   await new Promise(r=>setTimeout(r,120));
   await assert('__low3d.currentView()==="persp" && __low3d.camera.isPerspectiveCamera','Orbitar cambia el rótulo pero deja una cámara ortográfica');
   await click('[aria-label="Encuadrar selección o escena (Inicio)"]');
   await assert('__low3d.controls.target.length()>0.01','Encuadrar no centra el contenido seleccionado');
   await key('Tab','Tab');await assert('!!document.querySelector(".studio-chrome.is-focused")','Tab no entra en concentración');
   await key('Escape','Escape');await assert('!document.querySelector(".studio-chrome.is-focused")','Esc no recupera la interfaz');
   await click('[aria-label="Todas las herramientas"]');
   await assert('document.querySelectorAll(".studio-inspector").length===1','Hay inspectores duplicados');
   await click('[aria-label="Dibujo libre — sin guía; rueda ajusta profundidad (F)"]');
   await assert('__lowStore.getState().currentTool==="pencil-free"','La paleta perdió dibujo libre');
   await click('[aria-label="Cerrar inspector"]');
   await click('.studio-header-actions button:nth-child(3)');
   await assert(`!!document.querySelector('.studio-scene-section') && !!document.querySelector('button[title="Nueva capa"]')`,'Escena perdió objetos o capas');
   await click('[title="Nueva capa"]');await assert('__lowStore.getState().layers.length===2','No agrega capas');
   await click('[aria-label="Cerrar inspector"]');
   const saved=await evaluate('JSON.stringify(__low3d.exportProject())');
   await evaluate(`__low3d.importProject(JSON.parse(${JSON.stringify(saved)}))`);
   await assert('__low3d.exportProject().strokes.length===1 && __lowStore.getState().layers.length===2','El proyecto no conserva dibujo y capas');
   await click('[aria-label="Usar fondo oscuro"]');await assert('document.querySelector(".low-studio").dataset.theme==="dark"','Tema oscuro no cambia');
   await click('[aria-label="Usar fondo claro"]');
   const rectangles=await evaluate('JSON.stringify([...document.querySelectorAll(".studio-header,.studio-tool-rail,.studio-brush-strip,.studio-view-strip,.nav-cubo")].map(n=>{const r=n.getBoundingClientRect();return{class:n.className,x:r.x,y:r.y,w:r.width,h:r.height}}))');
   await assert('(()=>{const nodes=[...document.querySelectorAll(".studio-header,.studio-tool-rail,.studio-brush-strip,.studio-view-strip,.nav-cubo")];return nodes.every(n=>{const r=n.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;});})()','Controles fuera de pantalla');
   await evaluate('window.dispatchEvent(new MessageEvent("message",{data:{type:"low:saved",path:"C:/prueba/anterior.low3d"}}))');
   await new Promise(r=>setTimeout(r,80));
   await assert('document.querySelector(".studio-project-menu").textContent.includes("anterior.low3d")','El nombre no sigue el archivo guardado');
   await click('[aria-label="Archivo del proyecto"]');await click('[role="menuitem"]');
   await evaluate('(()=>{const b=[...document.querySelectorAll("button")].find(b=>b.textContent==="Empezar de nuevo");const r=b.getBoundingClientRect();if(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)!==b)throw Error("Modal tapado por interfaz");b.click();})()');
   await new Promise(r=>setTimeout(r,80));
   await assert('document.querySelector(".studio-project-menu").textContent.includes("Sin título") && __low3d.exportProject().strokes.length===0','Nuevo conserva la ruta o el dibujo anterior');
   await evaluate(`__low3d.importProject(JSON.parse(${JSON.stringify(saved)}))`);
   console.log('3D OK: dibujo, Undo/Redo, campos protegidos, cámara, encuadre, concentración, herramientas, capas, persistencia y proyecto nuevo',rectangles);
 }
 if(process.env.LOW_3D_SCREENSHOT){if(process.env.LOW_3D_DARK){await evaluate(`document.querySelector('[aria-label="Usar fondo oscuro"]')?.click()`);await new Promise(r=>setTimeout(r,150));}const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(process.env.LOW_3D_SCREENSHOT,Buffer.from(shot.data,'base64'));}
 }finally{ws.close();if(!embedded)await fetch(endpoint+'/json/close/'+target.id);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
