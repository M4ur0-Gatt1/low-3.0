// Real pointer and keyboard regression for the drawing tools reported by Mauro.
const endpoint=process.argv[2]||'http://127.0.0.1:9223';
const url=process.argv[3]||'http://127.0.0.1:8791/ui/index.html?mock=1';
(async()=>{
 const target=await(await fetch(endpoint+'/json/new?about:blank',{method:'PUT'})).json();
 const ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
 let id=0;const pending=new Map();
 ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.method==='Page.javascriptDialogOpening'){ws.send(JSON.stringify({id:++id,method:'Page.handleJavaScriptDialog',params:{accept:false}}));return;}const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);};
 const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;const timer=setTimeout(()=>reject(Error('Timeout '+method)),60000);pending.set(n,{resolve:v=>{clearTimeout(timer);resolve(v);},reject:e=>{clearTimeout(timer);reject(e);}});ws.send(JSON.stringify({id:n,method,params}));});
 const value=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const point=async selector=>value(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
 const screen=async(x,y)=>value(`(()=>{const p=new DOMPoint(${x},${y}).matrixTransform(document.querySelector('#dzCanvas > svg').getScreenCTM());return{x:p.x,y:p.y};})()`);
 const mouse=(type,p)=>send('Input.dispatchMouseEvent',{type,...p,button:type==='mouseMoved'?'none':'left',buttons:type==='mousePressed'?1:0,clickCount:1});
 // El `mouseMoved` previo no es decorativo: sin el, Chromium entrega el
 // `mousePressed` sin que el destino se haya enterado del puntero, y el clic
 // aterriza de manera inconsistente —el foco no entra al cuadro de texto y el
 // recorrido termina culpando al producto—. Aparecio como un fallo SOLO en CI.
 const click=async p=>{await mouse('mouseMoved',p);await mouse('mousePressed',p);await mouse('mouseReleased',p);};
 const button=async s=>click(await point(s));
 // El boton de una herramienta secundaria vive en el cajon `#dzToolsDrawer`, que
 // nace cerrado (`display:none`): sin abrirlo con el `...` devuelve un rectangulo
 // de 0x0 y el clic termina en la barra de menu, no en la herramienta.
 // CI es mas lenta que cualquier maquina de escritorio y este recorrido no
 // esperaba en ningun paso: escribia el texto antes de que el cuadro de texto
 // existiera y despues culpaba al producto con «Texto no se aplica».
 const esperar=async(expresion,queCosa,vueltas=40)=>{
  for(let i=0;i<vueltas;i++){ if(await value(expresion))return true; await wait(120); }
  // Con el estado a la vista: sin esto, un fallo que solo pasa en CI cuesta una
  // vuelta entera de compilacion para saber cual de las dos cosas se rompio.
  const estado=await value(`({sesion:!!DZ_TEXT_EDIT, caja:!!document.querySelector('.dz-text-editor'),
    tecleado:document.querySelector('.dz-text-editor textarea')?.value,
    foco:document.activeElement?.tagName, doc:!!DZ.doc, cuadro:DZ.doc?.frame,
    mismoDoc:DZ_TEXT_EDIT?DZ_TEXT_EDIT.doc===DZ.doc:null,
    hojaViva:!!document.querySelector('#dzCanvas > svg'),
    textos:document.querySelectorAll('#dzCanvas > svg text').length,
    aviso:(document.querySelector('#dzStatus')||{}).textContent?.trim().slice(0,120)})`).catch(()=>null);
  throw Error('no llego a tiempo: '+queCosa+' :: '+JSON.stringify(estado));
 };
 // `Input.insertText` escribe en el elemento ENFOCADO, asi que abrir el cuadro
 // de texto y EXIGIR que el cursor quede adentro es parte de lo que se prueba:
 // un cuadro de texto sin cursor es un cuadro donde teclear no hace nada.
 const abrirTexto=async punto=>{
  await button('#dzAddText'); await click(punto);
  await esperar('!!DZ_TEXT_EDIT&&!!document.querySelector(".dz-text-editor textarea")','el cuadro de texto no se abrio');
  await esperar('document.activeElement===document.querySelector(".dz-text-editor textarea")',
    'el cuadro de texto abrio SIN el cursor adentro: teclear no escribiria en ninguna parte');
 };
 const abrirCajon=async selector=>{
  for(let i=0;i<20;i++){
   const caja=await value(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});
     if(!n)return null;const r=n.getBoundingClientRect();
     return{w:r.width,h:r.height,enCajon:!!n.closest('#dzToolsDrawer'),
       cajonAbierto:!document.querySelector('#dzToolsDrawer')?.hidden};})()`);
   if(!caja)throw Error('no existe '+selector);
   if(caja.w&&caja.h)return;
   if(!caja.enCajon)throw Error(selector+' no tiene caja y no esta en el cajon '+JSON.stringify(caja));
   if(!caja.cajonAbierto)await button('#dzToolsMore');
   await wait(120);
  }
  throw Error('el cajon de herramientas no se abrio para '+selector);
 };
 const key=async key=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key});};
 try{
 await send('Page.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});await send('Emulation.setFocusEmulationEnabled',{enabled:true});await send('Page.navigate',{url});
 for(let i=0;i<80;i++){if(await value('typeof api!=="undefined"&&!!api&&typeof dzTextToolStart==="function"'))break;await wait(150);}
 await value(`(async()=>{await openDesign('mock.svg');await dzDocInit();closeL3d();LOW.workspace.workspaces.activate('drawing',dzWsAplicar);window.hoja=()=>document.querySelector('#dzCanvas > svg');hoja().innerHTML='';dzDocCommit();})()`);
 await abrirTexto(await screen(600,300));
 await send('Input.insertText',{text:'Texto editable'});
 // Se comprueba que lo tecleado LLEGO antes de apretar Aplicar. Sin esto, un
 // insertText que no aterriza deja el textarea vacio, Aplicar no hace nada
 // —porque no hay nada que aplicar— y el recorrido acusa al producto.
 if(await value('document.querySelector(".dz-text-editor textarea")?.value')!=='Texto editable')
  throw Error('lo tecleado no llego al cuadro de texto: '+JSON.stringify(await value('({valor:document.querySelector(".dz-text-editor textarea")?.value,foco:document.activeElement?.tagName})')));
 if(!await value('!!DZ_TEXT_EDIT&&!hoja().querySelector("text")'))throw Error('Texto se escribe antes de Aplicar');
 await button('.dz-text-editor button');
 await esperar('!!hoja().querySelector("text")','Aplicar no dejo el texto en la hoja');
 if(!await value('hoja().querySelector("text")?.textContent==="Texto editable"'))throw Error('Texto no se aplica');
 await value('dzUndo()');if(await value('!!document.querySelector("#dzCanvas text")'))throw Error('Texto no deshace');
 await abrirTexto(await screen(600,300));
 await send('Input.insertText',{text:'Cancelar'});
 if(await value('document.querySelector(".dz-text-editor textarea")?.value')!=='Cancelar')
  throw Error('lo tecleado no llego al cuadro de texto la segunda vez');
 await key('Escape');await wait(250);
 if(await value('!!hoja().querySelector("text")||!!DZ_TEXT_EDIT'))throw Error('Texto cancelado deja contenido');
 console.log('Texto: clic, escritura, aplicar, Undo y Escape OK');
 // UN REPINTADO DEL LIENZO NO PUEDE LLEVARSE LO TECLEADO. Es la causa de fondo
 // del fallo que este recorrido daba SOLO en CI: el lienzo se repinta solo —un
 // cambio de contenido, la cebolla, un companero de equipo— y en cada repintado
 // el nodo <svg> se REEMPLAZA. La sesion de texto se ataba a ese nodo, asi que
 // la caja desaparecia a mitad de la frase y «Aplicar» no aplicaba nada.
 await abrirTexto(await screen(500,420));
 await send('Input.insertText',{text:'Sobrevive'});
 await value('(()=>{const v=document.querySelector("#dzCanvas > svg");v.replaceWith(v.cloneNode(true));return true;})()');
 await wait(350);
 if(!await value('!!DZ_TEXT_EDIT&&!!document.querySelector(".dz-text-editor")'))
  throw Error('un repintado del lienzo cerro la edicion de texto y se llevo lo tecleado, sin decir nada');
 await button('.dz-text-editor button');
 await esperar('document.querySelector("#dzCanvas > svg text")?.textContent==="Sobrevive"','aplicar despues de un repintado no dejo el texto en la hoja');
 await value('dzUndo()');await wait(200);
 console.log('Texto: sobrevive a un repintado del lienzo OK');

 await value(`(()=>{const testSvg=hoja();DZ.brushPreset='dry-brush';DZ.drawW=20;const brush=dzBrushFinalElement([[600,500,1],[700,500,1],[800,500,1]],'#111');brush.id='test-brush';const layer=document.createElementNS(testSvg.namespaceURI,'g');layer.setAttribute('data-low-art','line');layer.append(brush);testSvg.append(layer);dzDocCommit();dzBienvenida2DPintar();dzSetTool('select');})()`);
 const dab=await point('#test-brush ellipse');await click(dab);
 if(!await value('DZ.sel?.id==="test-brush"'))throw Error('Seleccionó círculo interno '+JSON.stringify(await value('({selected:DZ.sel?.outerHTML?.slice(0,120),tool:DZ.tool,rect:document.querySelector("#test-brush").getBoundingClientRect().toJSON()})'))+' point '+JSON.stringify(dab));
 await abrirCajon('button[data-tool="handler"]');await button('button[data-tool="handler"]');
 if(await value('DZ.tool')!=='handler')throw Error('apretar la bomba no cambio de herramienta');
 await mouse('mousePressed',dab);
 if(!await value('!!HANDLER&&HANDLER.el?.id==="test-brush"'))throw Error('la bomba no agarro el trazo apretado');
 await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:dab.x,y:dab.y-40,buttons:1});await mouse('mouseReleased',{x:dab.x,y:dab.y-40});await wait(400);
 if(!await value('+document.querySelector("#test-brush").getAttribute("data-low-brush-size")>20'))throw Error('Bomba no engrosa pincel');
 await value('dzUndo()');if(!await value('+document.querySelector("#test-brush").getAttribute("data-low-brush-size")===20'))throw Error('Bomba no deshace');
 console.log('Pincel texturado: selección atómica y bomba física con Undo OK');
 await value(`(()=>{const testSvg=hoja();testSvg.innerHTML='<rect data-low-page="1" width="1920" height="1080" fill="white"/><rect x="600" y="200" width="200" height="180" fill="none" stroke="black" stroke-width="4"/>';dzDeselect();dzDocCommit();dzColoringPrefsSet('scope','drawing');DZ.fillColor='#b83232';dzSetTool('bucket');})()`);
 await click(await screen(650,250));for(let i=0;i<100;i++){if(!await value('!!DZ.coloringBusy'))break;await wait(100);}
 if(!await value(`(()=>{const p=hoja().querySelector('[data-low="fill"]');if(!p)return false;const b=p.getBBox();return b.x>=598&&b.y>=198&&b.x+b.width<=802&&b.y+b.height<=382;})()`))throw Error('Relleno se sale del rectángulo');
 const before=await value('DZ.doc.drawing.content');await click(await screen(350,250));for(let i=0;i<100;i++){if(!await value('!!DZ.coloringBusy'))break;await wait(100);}
 if(await value('DZ.doc.drawing.content')!==before)throw Error('Balde llena exterior de la hoja');
 console.log('Balde: borde recto y exterior sin relleno OK');
 await abrirCajon('button[data-tool="handler"]');await send('Input.dispatchMouseEvent',{type:'mouseMoved',...await point('button[data-tool="handler"]')});await wait(250);
 if(!await value('!!document.querySelector(".dz-tool-tooltip")'))throw Error('Falta ayuda visible');
 console.log('Ayuda al pasar el puntero OK');
 if(process.env.LOW_DRAWING_SCREENSHOT){const shot=await send('Page.captureScreenshot',{format:'png'});require('fs').writeFileSync(process.env.LOW_DRAWING_SCREENSHOT,Buffer.from(shot.data,'base64'));}
 }finally{ws.close();await fetch(endpoint+'/json/close/'+target.id);}
})().catch(e=>{console.error(e.stack);process.exit(1);});
