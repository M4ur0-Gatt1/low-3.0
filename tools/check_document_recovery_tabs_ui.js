/* P0 multi-documento: dos .lowscene y dos SVG no pueden mezclarse ni borrar
   los checkpoints ajenos. Requiere Chromium CDP :9223 + mock HTTP :8791. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map(), errors = [];
  ws.onmessage = event => { const m = JSON.parse(event.data);
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (!m.id || !pending.has(m.id)) return;
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 30000);
    pending.set(n, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: pageUrl });
    for (let i = 0; i < 80; i++) {
      const ready = await send("Runtime.evaluate", { expression: 'typeof dzSceneOpen==="function" && !!LOW.workspace.sceneRecovery && !!api', returnByValue: true });
      if (ready.result?.value) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const expression = `(async()=>{
      const scene=(name,mark)=>{const d=new LOW.animation.LowDoc();d.scene.name=name;d.writeDrawing('<path id="'+mark+'" d="M1 1L9 9"/>');d.dirty=false;return d.toJSON();};
      const paths={a:'C:\\\\mock\\\\escena-a.lowscene',b:'C:\\\\mock\\\\escena-b.lowscene',
        s1:'C:\\\\mock\\\\rapido-a.svg',s2:'C:\\\\mock\\\\rapido-b.svg'};
      const dialogs=[{path:paths.a,name:'escena-a.lowscene',content:scene('A','A-base')},
        {path:paths.b,name:'escena-b.lowscene',content:scene('B','B-base')}];
      let lowSceneImageRequests=0;
      const original={open:api.open_dialog,image:api.image_data,save:api.save_file,create:api.new_design,
        make:api.make_frame,sceneGet:api.scene_get};
      api.open_dialog=async()=>dialogs.shift()||null;
      api.image_data=async path=>{if(/\\.lowscene$/i.test(path)){lowSceneImageRequests++;return {error:'una escena no es SVG'};}
        const mark=path===paths.s1?'SVG-A':'SVG-B';return {path,name:path.split(/[/\\\\]/).pop(),svg:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 60"><path id="'+mark+'"/></svg>'};};
      api.save_file=async(path,content,name)=>({path:path||paths.a,name:name||String(path).split(/[/\\\\]/).pop(),bytes:String(content).length,atomic:true});
      api.make_frame=async path=>({path}); api.scene_get=async()=>({scene:{}});
      try {
        // Higiene que todos los demas recorridos tienen y este no tenia: sin
        // esto una corrida hereda pestañas y preferencias de la anterior, y en
        // rafaga (CI corre diecisiete seguidos en el mismo navegador) el estado
        // heredado cambia lo que se esta midiendo.
        try{ localStorage.clear(); }catch(_){ }
        LOW.workspace.sceneRecovery.list().forEach(r=>LOW.workspace.sceneRecovery.clear(r.identity));
        LOW.workspace.recovery.clear(paths.s1); LOW.workspace.recovery.clear(paths.s2);
        await dzSceneOpen(); const tabA=DZ.activeDocumentTab,docA=DZ.doc;
        docA.writeDrawing('<path id="A-vivo" d="M2 2L20 20"/>'); dzCanvasSet(docA.drawing.content);
        await dzSceneOpen(); const tabB=DZ.activeDocumentTab,docB=DZ.doc;
        docB.writeDrawing('<path id="B-vivo" d="M3 3L30 30"/>'); dzCanvasSet(docB.drawing.content);
        // Activar una pestaña repinta el lienzo, y leerlo en el mismo tirón
        // sincrónico devuelve lo anterior. Acá pasaba en CI y no en la máquina
        // de trabajo: la aserción fallaba por lentitud, no por regresión. Se
        // espera por CONDICIÓN —que el lienzo muestre la marca de esa escena—
        // con tope, así sigue fallando de verdad si nunca se sincroniza.
        const dormir=ms=>new Promise(r=>setTimeout(r,ms));
        const lienzoCon=async(marca)=>{
          for(let i=0;i<60;i++){ if(dzCanvasInner().includes(marca)) return true; await dormir(50); }
          return false;
        };
        await dzDocumentTabActivate(tabA);
        await lienzoCon("A-vivo");
        const recBefore=LOW.workspace.sceneRecovery.list();
        const backA={same:DZ.doc===docA,mark:DZ.doc.drawing.content,canvas:dzCanvasInner()};
        DZ.doc.writeDrawing('<path id="A-aislado" d="M4 4L40 40"/>'); dzCanvasSet(DZ.doc.drawing.content);
        await dzDocumentTabActivate(tabB);
        await lienzoCon("B-vivo");
        const backB={same:DZ.doc===docB,mark:DZ.doc.drawing.content,canvas:dzCanvasInner()};
        await dzDocumentTabActivate(tabA);
        await lienzoCon("A-aislado");
        const idA=dzSceneRecoveryIdentity(DZ.doc,dzDocumentTabCurrent());
        const tabBState=DZ.documentTabs.find(t=>t.id===tabB);
        const idB=dzSceneRecoveryIdentity(tabBState.runtime.doc,tabBState);
        await dzSceneSave(false);
        const sceneRecovery={before:recBefore.map(r=>r.identity),aGone:!LOW.workspace.sceneRecovery.get(idA),bAlive:!!LOW.workspace.sceneRecovery.get(idB)};

        // Crear un documento nuevo debe aparcar A, no resetearlo.
        docA.writeDrawing('<path id="A-antes-nuevo" d="M5 5L50 50"/>'); dzCanvasSet(docA.drawing.content);
        api.new_design=async()=>({path:'C:\\\\mock\\\\nuevo.svg',name:'nuevo.svg'});
        await dzDocumentNew(); const newTab=DZ.activeDocumentTab;
        await dzDocumentTabActivate(tabA);
        const afterNew={same:DZ.doc===docA,mark:DZ.doc.drawing.content,newTab:!!DZ.documentTabs.find(t=>t.id===newTab)};

        // El cambio ocurre antes del debounce de 320 ms: aun asi A y B deben
        // quedar recuperables por ruta, sin compartir contenido.
        await openDesign(paths.s1); let svg=document.querySelector('#dzCanvas > svg');svg.insertAdjacentHTML('beforeend','<circle id="rapido-A"/>');dzMarkDirty();
        await openDesign(paths.s2); const ra=LOW.workspace.recovery.get(paths.s1);
        svg=document.querySelector('#dzCanvas > svg');svg.insertAdjacentHTML('beforeend','<circle id="rapido-B"/>');dzMarkDirty();
        const svgTabA=dzDocumentTabFind(paths.s1); await dzDocumentTabActivate(svgTabA.id);
        const rb=LOW.workspace.recovery.get(paths.s2);
        await dzSave();
        const svgRecovery={aHad:!!ra,bHad:!!rb,separate:!!ra&&!!rb&&/rapido-A/.test(ra.content)&&!/rapido-B/.test(ra.content)&&/rapido-B/.test(rb.content),
          aGone:!LOW.workspace.recovery.get(paths.s1),bAlive:!!LOW.workspace.recovery.get(paths.s2)};
        // Contexto para cuando esto falle en una maquina que no es esta: sin
        // saber cuantas pestañas habia ni si el lienzo llego a sincronizarse, un
        // fallo intermitente no se puede diagnosticar desde el log.
        const contexto={pestanas:DZ.documentTabs.length,
          activa:DZ.activeDocumentTab===tabA?"A":(DZ.activeDocumentTab===tabB?"B":"otra"),
          clavesGuardadas:(()=>{ try{ return Object.keys(localStorage).length }catch(_){ return -1 } })(),
          sincronizoA:dzCanvasInner().includes("A-aislado")||dzCanvasInner().includes("A-vivo")};
        return {tabs:DZ.documentTabs.length,lowSceneImageRequests,backA,backB,afterNew,sceneRecovery,svgRecovery,contexto};
      } finally {api.open_dialog=original.open;api.image_data=original.image;api.save_file=original.save;api.new_design=original.create;
        api.make_frame=original.make;api.scene_get=original.sceneGet;}
    })()`;
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    const v = result.result?.value;
    if (v?.lowSceneImageRequests !== 0) throw Error("REGRESIÓN: una .lowscene pasó por image_data: " + JSON.stringify(v));
    if (!v?.backA?.same || !/A-vivo/.test(v.backA.mark) || !/A-vivo/.test(v.backA.canvas) || /B-vivo/.test(v.backA.canvas))
      throw Error("REGRESIÓN: la escena A perdió o mezcló su LowDoc: " + JSON.stringify(v?.backA) +
        " · contexto: " + JSON.stringify(v?.contexto));
    if (!v?.backB?.same || !/B-vivo/.test(v.backB.mark) || !/B-vivo/.test(v.backB.canvas) || /A-aislado/.test(v.backB.canvas))
      throw Error("REGRESIÓN: la escena B perdió o mezcló su LowDoc: " + JSON.stringify(v?.backB));
    if (!v?.afterNew?.same || !/A-antes-nuevo/.test(v.afterNew.mark) || !v.afterNew.newTab)
      throw Error("REGRESIÓN: Documento nuevo destruyó el documento anterior: " + JSON.stringify(v?.afterNew));
    if (v?.sceneRecovery?.before?.length !== 2 || !v.sceneRecovery.aGone || !v.sceneRecovery.bAlive)
      throw Error("REGRESIÓN: recuperación de escenas no está aislada: " + JSON.stringify(v?.sceneRecovery));
    if (!v?.svgRecovery?.aHad || !v.svgRecovery.bHad || !v.svgRecovery.separate || !v.svgRecovery.aGone || !v.svgRecovery.bAlive)
      throw Error("REGRESIÓN: recuperación SVG inmediata no está aislada: " + JSON.stringify(v?.svgRecovery));
    if (errors.length) throw Error("REGRESIÓN: excepciones UI: " + errors.slice(0, 4).join(" | "));
    console.log("E2E MULTI-DOCUMENTO/RECUPERACIÓN OK", JSON.stringify(v));
  } finally {
    ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
  }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
