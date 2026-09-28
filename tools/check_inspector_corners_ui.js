/* Biblia §3/§5: property edits and rounded corners are reversible intentions. */
const assert = require('node:assert/strict');
const endpoint = process.argv[2] || 'http://127.0.0.1:9223';
const pageUrl = process.argv[3] || 'http://127.0.0.1:8791/ui/index.html?mock=1';
async function main() {
  const tab = await (await fetch(endpoint + '/json/new?about:blank', {method:'PUT'})).json();
  const socket = new WebSocket(tab.webSocketDebuggerUrl), pending = new Map(), errors = []; let id = 0;
  await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  socket.onmessage=({data})=>{const m=JSON.parse(data);
    if(m.method==='Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    const task=pending.get(m.id); if(task){pending.delete(m.id);m.error?task.reject(Error(m.error.message)):task.resolve(m.result);}};
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});socket.send(JSON.stringify({id:n,method,params}));});
  const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);return r.result.value;};
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const point=async selector=>ev(`(()=>{const el=document.querySelector(${JSON.stringify(selector)}); el.scrollIntoView({block:'nearest'}); const r=el.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  const down=async(p,modifiers=0)=>send('Input.dispatchMouseEvent',{type:'mousePressed',...p,button:'left',buttons:1,clickCount:1,modifiers});
  const move=async(p,modifiers=0)=>send('Input.dispatchMouseEvent',{type:'mouseMoved',...p,buttons:1,modifiers});
  const up=async(p,modifiers=0)=>send('Input.dispatchMouseEvent',{type:'mouseReleased',...p,button:'left',buttons:0,clickCount:1,modifiers});
  const click=async selector=>{const p=await point(selector);await down(p);await up(p);};
  const key=async(key,code,modifiers=0)=>{const windowsVirtualKeyCode=({KeyA:65,Tab:9,Escape:27})[code]||0;
    await send('Input.dispatchKeyEvent',{type:'keyDown',key,code,modifiers,windowsVirtualKeyCode});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code,modifiers,windowsVirtualKeyCode});};
  const state=()=>ev(`(()=>{const el=document.querySelector('#acceptanceRect');return {tag:el.tagName,rx:el.getAttribute('rx'),corners:el.getAttribute('data-low-corners'),fill:el.getAttribute('fill'),dirty:DZ.dirty,undo:DZ.history.undoStack.length,redo:DZ.history.redoStack.length,svg:dzSerialize(document.querySelector('#dzCanvas > svg'))};})()`);
  const setup=()=>ev(`(()=>{dzVectorGestureCancel('test-reset'); clearTimeout(DZ_DOC_TIMER); clearTimeout(DZ_RECOVERY_TIMER);
    dzSetTool('select'); const svg=document.querySelector('#dzCanvas > svg');
    svg.querySelector('#acceptanceRect')?.remove(); const el=document.createElementNS(SVGNS,'rect');
    for(const [k,v] of Object.entries({id:'acceptanceRect',x:600,y:350,width:600,height:350,fill:'#cc5522',stroke:'#111111','stroke-width':8}))el.setAttribute(k,v);
    dzArtAppend(svg,el); dzDocCommit(); dzDeselect(); dzSelect(el); DZ.history.clear();DZ.dirty=false; return true;})()`);
  try {
    await send('Page.enable');await send('Runtime.enable');await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});
    await send('Emulation.setDeviceMetricsOverride',{width:1500,height:1000,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:pageUrl});
    for(let i=0;i<100;i++){if(await ev('typeof dzCornerDown === "function" && typeof api !== "undefined" && !!api'))break;await wait(150);}
    await ev(`(async()=>{localStorage.clear();await openDesign('mock.svg');await dzDocInit();if(typeof closeL3d==='function')closeL3d();})()`);
    await wait(900);await setup();
    const initial=await state();
    await click('#dzFill');
    const focused=await state();
    await key('a','KeyA',2);await send('Input.insertText',{text:'#2288aa'});await key('Tab','Tab');await wait(420);
    const edited=await state();
    if(!process.argv.includes('--baseline')) {
      assert.equal(await ev('DZ.doc.drawing.content===dzCanvasInner()'),true,'Inspector commits to the canonical drawing');
      await ev('dzUndo()');await wait(350);assert.equal((await state()).svg,initial.svg,'Inspector Undo restores original content');
      await ev('dzRedo()');await wait(350);assert.equal((await state()).svg,edited.svg,'Inspector Redo survives the commit delay');
      await ev(`dzSelect(document.querySelector('#acceptanceRect'))`);
      await click('#dzX');await key('a','KeyA',2);
      await send('Input.insertText',{text:'610'});await wait(350);
      await key('a','KeyA',2);await send('Input.insertText',{text:'620'});await key('Tab','Tab');await wait(350);
      assert.equal((await state()).undo,2,'Multiple input events across debounce delays coalesce');
      await ev('dzUndo()');await wait(350);
      assert.equal(await ev("document.querySelector('#acceptanceRect').getAttribute('x')"),'600');
    }
    await setup();
    const beforeCorner=await state(), p=await point('[data-corner="tl"]');
    await down(p,1);await move({x:p.x+25,y:p.y+25},1);
    const preview=await state();
    await key('Escape','Escape');await up({x:p.x+25,y:p.y+25},1);await wait(400);
    const cancelled=await state();
    if(process.argv.includes('--baseline')) {
      console.log(JSON.stringify({focusUndo:focused.undo-initial.undo,inspectorDirty:edited.dirty,
        cornerPreview:preview.corners,cornerCancelRestored:cancelled.svg===beforeCorner.svg,cancelUndo:cancelled.undo-beforeCorner.undo}));return;
    }
    assert.equal(focused.undo,initial.undo,'Focusing a property must not create Undo');
    assert.equal(edited.fill,'#2288aa');assert.equal(edited.dirty,true,'Inspector input must reach dirty tracking');
    assert.equal(edited.undo,1,'A field edit is one intention');
    assert.notEqual(preview.svg,beforeCorner.svg,'Corner pointer gesture must produce a visible preview');
    assert.equal(cancelled.svg,beforeCorner.svg,'Escape must restore exact original geometry and element type');
    assert.equal(cancelled.undo,beforeCorner.undo,'Cancelled corner gesture must not consume Undo');
    await setup();
    const start=await state(), q=await point('[data-corner="tl"]');
    await down(q,1);await move({x:q.x+30,y:q.y+30},1);await up({x:q.x+30,y:q.y+30},1);await wait(400);
    const rounded=await state();assert.equal(rounded.tag,'path');assert.equal(rounded.undo,1);
    assert.equal(rounded.corners.split(' ').filter(v=>Number(v)>0).length,1,'Alt changes only one corner');
    await ev('dzUndo()');await wait(350);assert.equal((await state()).svg,start.svg,'One Undo restores the rectangle');
    await ev('dzRedo()');await wait(350);assert.equal((await state()).svg,rounded.svg,'Redo restores the rounded corner');
    assert.equal(await ev('LOW.animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(DZ.doc.toJSON()))).drawing.content===dzCanvasInner()'),true,'Serialized scene reopens with rounded geometry');
    for(const cancel of ['pointercancel','tool','frame']) {
      await setup();const before=await state(), handle=await point('[data-corner="tl"]');
      await down(handle,1);await move({x:handle.x+35,y:handle.y+35},1);await wait(400);
      assert.equal(await ev("DZ.doc.drawing.content.includes('data-low-corners')"),false,'Preview must not enter the canonical drawing');
      if(cancel==='pointercancel')await ev("document.dispatchEvent(new PointerEvent('pointercancel',{pointerId:DZPointerController.active.pointerId}))");
      else if(cancel==='tool')await ev("dzSetTool('brush')");
      else await ev('dzDocGoTo(1)');
      await up({x:handle.x+35,y:handle.y+35},1);await wait(350);
      assert.equal((await state()).svg,before.svg,cancel+' restores geometry');
      assert.equal((await state()).undo,0,cancel+' does not consume Undo');
    }
    await setup();const still=await state(), handle=await point('[data-corner="tl"]');
    await down(handle,1);await up(handle,1);await wait(350);
    assert.equal((await state()).svg,still.svg,'Alt click does not convert the rectangle');
    assert.equal((await state()).undo,0);
    const exact=await point('[data-corner="tl"]');
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...exact,button:'left',buttons:1,clickCount:2});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...exact,button:'left',buttons:0,clickCount:2});
    await wait(70);await click('#dzPrIn');await key('a','KeyA',2);await send('Input.insertText',{text:'45'});await click('#dzPrOk');await wait(350);
    assert.equal((await state()).rx,'45.0');assert.equal((await state()).undo,1,'Exact radius is one intention');
    await ev(`dzSelect(document.querySelector('#acceptanceRect'))`);
    await click('#dzW');await key('a','KeyA',2);await send('Input.insertText',{text:'-5'});await key('Tab','Tab');
    assert.equal(await ev("document.querySelector('#acceptanceRect').getAttribute('width')"),'600','Negative width is rejected');
    assert.equal((await state()).undo,1,'Invalid field input does not consume Undo');
    const save=await ev(`(async()=>{
      const expected=dzCanvasInner(), originalSave=api.save_file, originalOpen=api.open_file;
      let saved=''; const oldDoc=DZ.doc;
      try {
        api.save_file=async(path,content)=>{saved=content;return {path:'inspector-saved.low',name:'inspector-saved.low'};};
        if(!await dzSceneSave(true))throw Error('Scene save failed');
        api.open_file=async()=>({path:'inspector-reopened.low',name:'inspector-reopened.low',content:saved});
        if(!await dzSceneOpen('inspector-reopened.low'))throw Error('Scene reopen failed');
        return {fresh:DZ.doc!==oldDoc,model:DZ.doc.drawing.content===expected,canvas:dzCanvasInner()===expected};
      }finally{api.save_file=originalSave;api.open_file=originalOpen;}
    })()`);
    assert.deepEqual(save,{fresh:true,model:true,canvas:true},'Save/open bridge restores model and visible canvas');
    await ev(`dzSelect(document.querySelector('#acceptanceRect'))`);await wait(150);
    const screenshotPath=process.env.LOW_E2E_SCREENSHOT;
    if(screenshotPath){const shot=await send('Page.captureScreenshot',{format:'png'});require('node:fs').writeFileSync(screenshotPath,Buffer.from(shot.data,'base64'));}
    await ev(`(()=>{const rect=document.querySelector('#acceptanceRect'),text=document.createElementNS(SVGNS,'text');
      text.id='acceptanceText';text.setAttribute('x','600');text.setAttribute('y','500');text.setAttribute('font-size','70');text.textContent='LOW';
      rect.replaceWith(text);dzDocCommit();dzSelect(text);DZ.history.clear();})()`);
    const originalText=await ev('dzCanvasInner()');
    await click('[data-italic="1"]');await wait(350);
    assert.equal(await ev("document.querySelector('#acceptanceText').getAttribute('font-style')"),'italic');
    assert.equal(await ev('DZ.history.undoStack.length'),1,'Italic is one intention');
    await ev('dzUndo()');await wait(350);assert.equal(await ev('dzCanvasInner()'),originalText);
    assert.deepEqual(errors,[]);console.log('INSPECTOR + CORNERS UI OK: focus, canonical edits, coalescing, Escape/pointercancel/tool/frame, Alt, Undo/Redo, scene roundtrip');
  } finally {socket.close();await fetch(endpoint+'/json/close/'+tab.id).catch(()=>{});}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
setTimeout(()=>{console.error('Inspector/corners test timed out');process.exit(1);},45000).unref();
