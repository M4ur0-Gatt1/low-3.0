// Regression guard for the 2026-09-28 tradigital audit. UI uses the mock bridge.
const endpoint=process.argv[2]||'http://127.0.0.1:9223';
const pageUrl=process.argv[3]||'http://127.0.0.1:8791/ui/index.html?mock=1';
(async()=>{
 const t=await(await fetch(endpoint+'/json/new?about:blank',{method:'PUT'})).json();
 const ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);let id=0;const jobs=new Map();ws.onmessage=({data})=>{const m=JSON.parse(data);if(jobs.has(m.id)){jobs.get(m.id)(m);jobs.delete(m.id)}};
 const send=(method,params={})=>new Promise(r=>{jobs.set(++id,r);ws.send(JSON.stringify({id,method,params}))});
 const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.result.exceptionDetails)throw Error(JSON.stringify(r.result.exceptionDetails));return r.result.result.value};
 await send('Network.enable');await send('Network.setCacheDisabled',{cacheDisabled:true});await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:pageUrl});
 for(let i=0;i<100;i++){if(await ev('typeof api!=="undefined" && !!api && typeof dzDocumentNew==="function"'))break;await new Promise(r=>setTimeout(r,100));}
 await ev('(async()=>{await dzDocumentNew();if(typeof closeL3d==="function")closeL3d();await dzEnsureAnimationWorkspace();})()');await new Promise(r=>setTimeout(r,700));
 const check=(v,m)=>{if(!v)throw Error(m)};
 const click=async selector=>{const box=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing target');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...box,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...box,button:'left',clickCount:1});};
 await ev(`window.rhythmBefore=JSON.stringify(DZ.doc.scene.toJSON());lowInterpretar({sample:true});`);
 check(await ev(`document.querySelector('#lowInterpretar').open && document.querySelectorAll('.rhythm-pose').length===7`),'demo opens');
 // A MEDIA PANTALLA (1000x560) se tiene que poder USAR sin scrollear: las poses
 // —donde se cambia cada duración— y «Aplicar» quedaban fuera de la ventana.
 await send('Emulation.setDeviceMetricsOverride',{width:1000,height:560,deviceScaleFactor:1,mobile:false});await new Promise(r=>setTimeout(r,300));
 check(await ev(`(()=>{const d=document.querySelector('#lowInterpretar'),dr=d.getBoundingClientRect(),a=d.querySelector('[data-action="apply"]').getBoundingClientRect(),p=d.querySelector('.rhythm-pose input').getBoundingClientRect();
   return a.bottom<=dr.bottom&&a.top>=dr.top&&p.bottom<=dr.bottom&&p.top>=dr.top&&dr.bottom<=innerHeight;})()`),'at 1000x560 poses and Apply must be visible without scrolling');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await new Promise(r=>setTimeout(r,200));
 await ev(`(()=>{const e=document.querySelectorAll('.rhythm-pose input')[3];e.value=8;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 check(await ev(`[...document.querySelectorAll('.rhythm-pose input')].reduce((n,e)=>n+Number(e.value),0)===28`),'fixed duration');
 await click('[data-action="play"]');await new Promise(r=>setTimeout(r,200));
 check(await ev(`document.querySelector('[data-counter="a"]').textContent!=='1 / 28 F'`),'play moves');
 await click('[data-action="play"]');
 await click('[data-action="tap"]');
 for(let i=0;i<8;i++){await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space',windowsVirtualKeyCode:32});await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space',windowsVirtualKeyCode:32});await new Promise(r=>setTimeout(r,i===3?220:70));}
 check(await ev(`document.querySelector('.rhythm-hint').textContent.includes('lista')`),'space performance finishes');
 check(await ev(`JSON.stringify(DZ.doc.scene.toJSON())===window.rhythmBefore`),'demo changed scene');
 if(process.argv[4]){const shot=await send('Page.captureScreenshot',{format:'png'});require('fs').writeFileSync(process.argv[4],Buffer.from(shot.result.data,'base64'));}
 await click('[data-action="close"]');
 await ev(`(()=>{const d=DZ.doc;d.writeDrawing('<circle cx="300" cy="300" r="100" fill="#ed7049"/>');const next=d.level.addDrawing(d.level.nextNumber(),'<circle cx="600" cy="300" r="100" fill="#ed7049"/>');d.layer.cells=[d.cell,d.cell,next.number,next.number];d.emit('frame');DZ.history.clear();})()`);
 await click('#lowInterpretarOpen');
 check(await ev(`!!document.querySelector('#lowInterpretar')`),'real launcher');
 await ev('DZ.history.clear()');
 await ev(`(()=>{const e=document.querySelector('.rhythm-pose input');e.value=3;e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await click('[data-action="apply"]');
 check(await ev(`!document.querySelector('#lowInterpretar') && DZ.history.undoStack.length===1 && DZ.doc.layer.cells[2]===DZ.doc.layer.cells[0]`),'apply real scene atomic');
 check(await ev(`(()=>{DZ.history.undo();const good=DZ.doc.layer.cells[2]!==DZ.doc.layer.cells[0];DZ.history.redo();return good && DZ.doc.layer.cells[2]===DZ.doc.layer.cells[0];})()`),'undo redo');
 await click('#lowInterpretarOpen');await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
 check(await ev(`!document.querySelector('#lowInterpretar')`),'Escape closes');
 console.log('RHYTHM UI OK: demo, fixed duration, playback, browser key events, isolation, apply, Undo/Redo, Escape');
 ws.close();await fetch(endpoint+'/json/close/'+t.id);
})().catch(e=>{console.error(e);process.exit(1)});
setTimeout(()=>process.exit(2),30000).unref();
