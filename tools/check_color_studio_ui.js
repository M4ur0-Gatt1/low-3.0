/* Aceptación del Color Studio real en Chromium. Requiere CDP :9223 y mock :8791. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const screenshotPath = process.argv[4] || "";
const fs = require("fs");
async function main() {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  if (!target?.webSocketDebuggerUrl) throw Error("Chromium no expuso CDP");
  const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((ok, fail) => { ws.onopen=ok; ws.onerror=fail; });
  let id=0; const pending=new Map(), errors=[];
  ws.onmessage = (event) => { const m=JSON.parse(event.data);
    if(m.method==="Page.javascriptDialogOpening") return ws.send(JSON.stringify({id:++id,method:"Page.handleJavaScriptDialog",params:{accept:false}}));
    if(m.method==="Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);
    if(!m.id||!pending.has(m.id))return; const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);
  };
  const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id,t=setTimeout(()=>{pending.delete(n);reject(Error("CDP sin respuesta: "+method));},30000);pending.set(n,{resolve:v=>{clearTimeout(t);resolve(v);},reject:e=>{clearTimeout(t);reject(e);}});ws.send(JSON.stringify({id:n,method,params}));});
  await send("Page.enable");await send("Runtime.enable");await send("Network.enable");await send("Network.setCacheDisabled",{cacheDisabled:true});await send("Page.navigate",{url:pageUrl});
  for(let i=0;i<60;i++){const r=await send("Runtime.evaluate",{expression:'document.readyState==="complete"&&typeof openDesign==="function"&&!!LOW.animation?.PaletteView&&typeof api!=="undefined"&&!!api',returnByValue:true});if(r.result?.value)break;await new Promise(r=>setTimeout(r,250));}
  const expression=`(async()=>{
    await openDesign("C:\\\\mock\\\\color-studio.svg"); await dzDocInit();
    LOW.workspace.workspaces.activate("color",dzWsAplicar); await new Promise(r=>setTimeout(r,180));
    const q=s=>document.querySelector(s), all=s=>[...document.querySelectorAll(s)];
    const before=DZ.doc.palette.byIndex(1).color;
    const hex=q("[data-color-hex]"); hex.value="#336699";hex.dispatchEvent(new Event("change",{bubbles:true}));
    const changed=DZ.doc.palette.byIndex(1).color; DZ.history.undo(); const undone=DZ.doc.palette.byIndex(1).color;
    const opacity=q('[data-style-opacity]');opacity.value='42';opacity.dispatchEvent(new Event('input',{bubbles:true}));opacity.dispatchEvent(new Event('change',{bubbles:true}));
    const opacityChanged=DZ.doc.palette.byIndex(1).opacity;DZ.history.undo();const opacityUndone=DZ.doc.palette.byIndex(1).opacity;
    const countBefore=DZ.doc.palette.styles.length;
    const imported=await DZ.palView._importFile(new File(['GIMP Palette\\nName: Test\\n#\\n12 34 56 Noche\\n200 120 20 Ocre\\n'],'test.gpl',{type:'text/plain'}));
    const countImported=DZ.doc.palette.styles.length,importGroup=DZ.doc.palette.styles.slice(-2).every(s=>s.meta.group==='test');DZ.history.undo();const countUndoImport=DZ.doc.palette.styles.length;
    q('[data-target="paint"]').click(); all('.pal2-item')[2].click();
    const search=q('.pal2-search');search.value='línea';search.dispatchEvent(new Event('input',{bubbles:true}));
    const filtered=all('.pal2-item:not([hidden])').length;
    const canvas=q('.dz-canvas').getBoundingClientRect(), inspector=q('#dzInspector').getBoundingClientRect();
    const legacyRows=all('#dzStyle > .dz-style-row').filter(el=>getComputedStyle(el).display!=='none'&&el.getClientRects().length).length;
    return {before,changed,undone,target:DZ.palTarget,style:DZ.palStyle,fill:DZ.fillColor,
      spectrum:!!q('.pal2-spectrum'),channels:all('.pal2-channels input').length,harmonies:all('.pal2-harmony-row button').length,
      rows:all('.pal2-item').length,filtered,recent:all('.pal2-recent-row button').length,search:!!search,colorClass:q('#designView').classList.contains('color-workspace'),
      exchange:{imported,countBefore,countImported,countUndoImport,importGroup,fileButtons:all('.pal2-filebar button').length,groupFilter:!!q('.pal2-group-filter')},
      opacity:{changed:opacityChanged,undone:opacityUndone,control:!!opacity},
      legacyRows,
      overlap:Math.max(0,Math.min(canvas.right,inspector.right)-Math.max(canvas.left,inspector.left)),
      inspectorWidth:Math.round(inspector.width),errors:window.__errs||[]};
  })()`;
  const result=await send("Runtime.evaluate",{expression,awaitPromise:true,returnByValue:true});
  const value=result.result?.value; if(result.exceptionDetails)throw Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
  const ok=value?.changed==="#336699"&&value.undone===value.before&&value.target==="paint"&&value.style===3&&value.fill==="#ffffff"&&value.spectrum&&value.channels===6&&value.harmonies===6&&value.rows>=5&&value.filtered===1&&value.recent>=2&&value.search&&value.opacity?.changed===.42&&value.opacity.undone===1&&value.opacity.control&&value.exchange?.imported===2&&value.exchange.countImported===value.exchange.countBefore+2&&value.exchange.countUndoImport===value.exchange.countBefore&&value.exchange.importGroup&&value.exchange.fileButtons===2&&value.exchange.groupFilter&&value.colorClass&&value.legacyRows===0&&value.overlap<=1&&value.inspectorWidth>=292&&!errors.length&&!value.errors.length;
  if(!ok)throw Error("REGRESIÓN Color Studio: "+JSON.stringify({value,errors}));
  console.log("E2E COLOR STUDIO OK",JSON.stringify(value));
  if(screenshotPath){await new Promise(r=>setTimeout(r,1500));const shot=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});fs.writeFileSync(screenshotPath,Buffer.from(shot.data,"base64"));}
  ws.close();try{await fetch(endpoint+"/json/close/"+target.id);}catch(_){ }
}
main().catch(e=>{console.error(e.stack||e);process.exit(1);});
