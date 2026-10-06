// Regression guard for the 2026-09-28 tradigital audit. UI uses the mock bridge.
const endpoint=process.argv[2]||'http://127.0.0.1:9223';
const pageUrl=process.argv[3]||'http://127.0.0.1:8791/ui/index.html?mock=1';
(async()=>{
 const t=await(await fetch(endpoint+'/json/new?about:blank',{method:'PUT'})).json();
 const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const jobs=new Map();ws.onmessage=({data})=>{const m=JSON.parse(data);if(jobs.has(m.id)){jobs.get(m.id)(m);jobs.delete(m.id)}};
 const send=(method,params={})=>new Promise(r=>{jobs.set(++id,r);ws.send(JSON.stringify({id,method,params}))});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.result.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails));return r.result.result.value};
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:pageUrl});
 for(let i=0;i<100;i++){if(await ev('document.readyState==="complete"&&typeof api!=="undefined" && !!api && typeof dzDocumentNew==="function"'))break;await new Promise(r=>setTimeout(r,100));}
 await ev('(async()=>{await dzDocumentNew();if(typeof closeL3d==="function")closeL3d();await dzEnsureAnimationWorkspace();})()');await new Promise(r=>setTimeout(r,700));
 const report=await ev(`(async()=>{
 const check=(v,m)=>{if(!v)throw Error(m)};const A=LOW.animation;
 DZ.doc.writeDrawing('<path id="testStroke" d="M 10 10 L 200 100"/>');DZ.doc.history.clear();
 const before=DZ.doc.drawing.content,number=DZ.doc.cell;
 document.querySelector('.tl2-tools button[title="Crear un dibujo vacío en la celda actual"]').click();
 check(!DZ.doc.drawing.content.includes('testStroke'),'Blank is not blank');check(DZ.history.undoStack.length===1,'Blank Undo count');
 DZ.history.undo();check(DZ.doc.cell===number && DZ.doc.drawing.content===before,'Blank Undo');DZ.history.redo();check(!DZ.doc.drawing.content.includes('testStroke'),'Blank Redo');
 const doc=new A.LowDoc();doc.setHistory(new LOW.core.HistoryManager());const pb=new A.Playback(doc);pb.setRange(10,20);doc.goTo(1);pb.play();check(pb.frame0===10,'Playback starts before In');pb.stop();
 doc.history.clear();pb.setFps(12);check(doc.history.undoStack.length===1,'FPS missing history');doc.history.undo();check(doc.scene.fps===24,'FPS Undo');doc.history.redo();check(doc.scene.fps===12,'FPS Redo');
 const first=doc.layer;for(let i=1;i<=24;i++)first.setCell(i,i);
 const second=doc.addLayer();for(let i=1;i<=24;i++)second.setCell(i,i);doc.layerId=first.id;
 doc.history.clear();const old=JSON.stringify([first.cells,second.cells]);
 doc.applySelectedTiming('step',{fromLayerId:first.id,toLayerId:second.id,from:8,to:8},2);
 check(first.cellAt(1)===1 && first.cellAt(7)===7 && first.cellAt(8)===8 && first.cellAt(9)===8 && first.cellAt(10)===9,'Timing scope first');
 check(second.cellAt(9)===8,'Timing ignores second layer');check(doc.history.undoStack.length===1,'Timing Undo count');
 doc.history.undo();check(JSON.stringify([first.cells,second.cells])===old,'Timing Undo');doc.history.redo();check(first.cellAt(9)===8&&second.cellAt(9)===8,'Timing Redo');
 const reopened=A.LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));check(reopened.scene.layer(first.id).cellAt(9)===8 && reopened.scene.fps===12,'Roundtrip');
 const host=document.createElement('div');document.body.appendChild(host);const view=new A.XsheetView(host,doc);view.sel={fromLayerId:first.id,toLayerId:first.id,from:4,to:4};const calls=[];const original=doc.applySelectedTiming;doc.applySelectedTiming=(...args)=>calls.push(args);view._barra().querySelectorAll('button')[1].click();check(calls[0][1].from===4&&calls[0][1].to===4,'Xsheet widens selection');doc.applySelectedTiming=original;view.dispose();host.remove();
 await dzVariations();check(document.querySelector('#dzStatus').textContent.includes('todavía no admite'),'Variations silent');
 const h=document.createElement('div');document.body.appendChild(h);const v=new A.TimelineView(h,doc);v.playback=pb;v.render();
 const begin=()=>v._arrastrarTramo({button:0,pointerId:91,preventDefault(){},stopPropagation(){}},'in',{scrollLeft:0,getBoundingClientRect:()=>({left:0})},40,{in:10,out:20});
 const move=(frame)=>document.dispatchEvent(new PointerEvent('pointermove',{pointerId:91,clientX:(frame-1)*v._frameWidth()+1}));
 const end=type=>document.dispatchEvent(new PointerEvent(type,{pointerId:91}));
 doc.setPlaybackRange(10,20);doc.history.clear();begin();move(12);move(14);
 check(doc.scene.range.in===10&&doc.history.undoStack.length===0,'Range preview mutated document');
 end('pointerup');check(doc.scene.range.in===14&&doc.history.undoStack.length===1,'Range gesture not atomic');
 doc.history.undo();check(doc.scene.range.in===10 && +document.querySelector('#tlIn').value===10,'Range Undo sync');doc.history.redo();check(doc.scene.range.in===14,'Range Redo');
 for(const how of ['pointercancel','Escape']){doc.setPlaybackRange(10,20);doc.history.clear();begin();move(16);if(how==='Escape')document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));else end(how);end('pointerup');check(doc.scene.range.in===10&&doc.history.undoStack.length===0,how+' committed range');}
 doc.history.clear();doc.setPlaybackRange(10,20);check(doc.history.undoStack.length===0,'Range no-op Undo');
 v.dispose();h.remove();
 DZ.doc.writeDrawing('<path id="copyTest"/>');DZ.history.clear();const originalNumber=DZ.doc.cell;DZ.doc.createBlankDrawing(true);check(DZ.doc.cell!==originalNumber&&DZ.doc.drawing.content.includes('copyTest')&&DZ.history.undoStack.length===1,'Duplicate independent command');DZ.history.undo();check(DZ.doc.cell===originalNumber,'Duplicate Undo');
 return {blank:'OK',timing:'OK',range:'OK',fps:'OK',persistence:'OK',variations:'OK',rangeGesture:'OK',duplicate:'OK'};
 })()`);
 console.log('TRADIGITAL UI OK',JSON.stringify(report));
 ws.close();await fetch(endpoint+'/json/close/'+t.id);
})().catch(e=>{console.error(e);process.exit(1)});
setTimeout(()=>process.exit(2),30000).unref();
