const assert=require('node:assert/strict');
const endpoint=process.argv[2]||'http://127.0.0.1:9223',url=process.argv[3]||'http://127.0.0.1:8791/ui/index.html?mock=1';
async function main(){
  const tab=await(await fetch(endpoint+'/json/new?about:blank',{method:'PUT'})).json();
  const ws=new WebSocket(tab.webSocketDebuggerUrl),pending=new Map(),errors=[];let id=0;
  await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
  ws.onmessage=({data})=>{const m=JSON.parse(data);if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.text);const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.j(Error(m.error.message)):p.r(m.result);}};
  const send=(method,params={})=>new Promise((r,j)=>{const n=++id;pending.set(n,{r,j});ws.send(JSON.stringify({id:n,method,params}));});
  const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const click=async selector=>{const p=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1});await wait(100);};
  const button=text=>`.sb2-tools button[aria-label="${text}"]`;
  try{
    await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
    await send('Emulation.setDeviceMetricsOverride',{width:1366,height:900,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url});
    for(let i=0;i<100;i++){if(await ev('typeof dzSbMount==="function"&&typeof api!=="undefined"&&!!api'))break;await wait(150);}
    await ev(`(async()=>{localStorage.clear();await openDesign('mock.svg');await dzDocInit();closeL3d();await dzSbMount();})()`);await wait(600);
    await click(button('Agregar un panel al final'));
    assert.equal(await ev("document.querySelector('[data-sb=create]').disabled"),true);
    await click('[data-sb=capture]');
    for(let i=0;i<50;i++){if(await ev('!!DZ.doc.scene.storyboard.boards[0].drawingRef?.png'))break;await wait(100);}
    assert.equal(await ev('DZ.doc.scene.storyboard.boards[0].drawingRef.kind'),'drawing');
    await ev('dzUndo()');assert.equal(await ev('DZ.doc.scene.storyboard.boards[0].drawingRef'),null);
    await ev('dzRedo()');await wait(100);
    await click(button('Duplicar el plano elegido con imagen y notas'));
    assert.equal(await ev('DZ.doc.scene.storyboard.boards.length'),2);
    await ev(`document.querySelector('#dzCanvas > svg rect').setAttribute('fill','#2244bb');dzMarkDirty();`);
    await click('[data-sb=capture]');await wait(200);
    assert.equal(await ev('DZ.doc.scene.storyboard.boards[0].drawingRef.png!==DZ.doc.scene.storyboard.boards[1].drawingRef.png'),true,'Each panel retains its own image');
    await ev(`DZ.doc.updateStoryboardBoard(DZ.doc.scene.storyboard.boards[0].id,{duration:3,action:'Entrada'});DZ.doc.updateStoryboardBoard(DZ.doc.scene.storyboard.boards[1].id,{duration:5,dialogue:'Hola'});`);
    await ev(`DZ.doc.updateStoryboardBoard(DZ.doc.scene.storyboard.boards[1].id,{name:'020',notes:'Mira a camara'})`);
    const original=await ev('JSON.stringify(DZ.doc.scene.toJSON())');
    if(process.env.LOW_E2E_SCREENSHOT){const shot=await send('Page.captureScreenshot',{format:'png'});require('node:fs').writeFileSync(process.env.LOW_E2E_SCREENSHOT,Buffer.from(shot.data,'base64'));}
    await ev('window.__storySource=DZ.doc;window.__sourceTab=DZ.activeDocumentTab');
    await click('[data-sb=create]');await wait(250);
    assert.equal(await ev('DZ.doc!==window.__storySource&&DZ.doc.scene.range.out===8'),true);
    assert.equal(await ev('DZ.doc.layer.cellAt(3)===1&&DZ.doc.layer.cellAt(4)===2&&DZ.doc.layer.cellAt(8)===2'),true);
    assert.equal(await ev("!!document.querySelector('#dzCanvas > svg image')"),true,'Animatic actually renders artwork');
    assert.equal(await ev('dzCuadroSvgTexto(1).includes(DZ.doc.scene.storyboard.boards[0].drawingRef.png)&&dzCuadroSvgTexto(4).includes(DZ.doc.scene.storyboard.boards[1].drawingRef.png)'),true,'Export path resolves the right image at each cut');
    assert.equal(await ev('LOW.animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(DZ.doc.toJSON()))).scene.range.out'),8);
    await ev('dzDocumentTabActivate(window.__sourceTab)');await wait(250);
    assert.equal(await ev('DZ.doc===window.__storySource'),true,'Original storyboard remains available');
    assert.deepEqual(errors,[]);{// revision sube al volcar el lienzo antes de cambiar de pestaña: no es contenido
      const sinRev=t=>{const o=JSON.parse(t);delete o.revision;return JSON.stringify(o);};
      assert.equal(sinRev(await ev('JSON.stringify(window.__storySource.scene.toJSON())')),sinRev(original),'Creating the animatic leaves the source unchanged');}
    console.log('STORYBOARD WORKFLOW OK: capture, Undo/Redo, duplicate, independent animatic, persistence, source tab');
  }finally{ws.close();await fetch(endpoint+'/json/close/'+tab.id);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});setTimeout(()=>process.exit(1),45000).unref();
