/* BRUSH-02: cada parametro VISIBLE del pincel produce una diferencia medible
   en el trazo. CDP :9223 + mock :8791.

   La fila de la matriz decia «hoy hay parametros que no se puede afirmar que
   hagan algo». Medido dibujando el mismo gesto y comparando el resultado, de
   los nueve deslizadores del Estudio, en un pincel vectorial solo dos movian
   la aguja —Tamano y Suavizado—, y ninguno de los dos por el motor: los dos
   viajan por DZ.drawW y DZ.smooth, que dzBrushSelect copia al elegir.

   La causa: OCHO de los veintidos pinceles incorporados no declaran `engine`,
   y dzBrushFinalElement comparaba brush.engine contra los dos nombres antes de
   normalizar. Al no coincidir ninguno caia al camino viejo (dzBrushRibbon),
   que solo entiende grosor: el motor entero quedaba sin usar.

   Este recorrido mide el trazo REAL —se elige el pincel como lo elige el
   Estudio y se dibuja el gesto— y exige que cada parametro cambie algo, o que
   este declarado inerte con su motivo. Un deslizador vivo que no hace nada es
   el defecto; uno apagado que explica por que, no. */
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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 300000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 60; i++) {
    const r = await send("Runtime.evaluate", { expression: 'typeof dzBrushFinalElement==="function" && typeof dzBrushMotor==="function" && !!api', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const errs=[]; window.addEventListener("error", ev=>errs.push(String(ev.message)));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit(); await wait(600);
    LOW.workspace.workspaces.activate("drawing",dzWsAplicar); await wait(300);
    DZ.pressureMin=.1; DZ.pressureMax=.9;
    const lienzo=document.querySelector("#dzCanvas"), hoja=()=>lienzo.querySelector(":scope > svg");
    dzSetTool("brush"); await wait(150);
    const caja=lienzo.getBoundingClientRect();
    const px=Math.round(caja.left+caja.width*.22), py=Math.round(caja.top+caja.height*.45);
    const N=22;

    // Un gesto con presion creciente, inclinacion y curva: si un parametro
    // depende de alguna de esas cosas, este trazo se la da. Y es SIEMPRE el
    // mismo, asi que cualquier diferencia viene del pincel.
    const pt=(t,i)=>{ const f=i/(N-1);
      lienzo.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,pointerId:1,
        pointerType:"pen",isPrimary:true,button:t==="pointerdown"?0:-1,buttons:t==="pointerup"?0:1,
        clientX:px+Math.round(f*380), clientY:py+Math.round(Math.sin(f*6)*40),
        pressure:.12+f*.78, tiltX:Math.round(f*50), tiltY:Math.round(f*25)})); };

    const trazoCon=async(base,patch)=>{
      const b={...base,...patch,id:"p_"+Math.random().toString(36).slice(2)};
      LOW.drawing.brushes.save(b); dzBrushSelect(b); await wait(90);
      hoja().innerHTML="";
      pt("pointerdown",0); for(let i=1;i<N;i++){ pt("pointermove",i); await wait(8); }
      pt("pointerup",N-1); await wait(340);
      const n=hoja().querySelector('[data-low="brush"],[data-low="raster-brush"],[data-low="imported-brush"]');
      if(!n) return {vacio:true};
      let bb=null; try{bb=n.getBBox()}catch(_){}
      return {porElMotor:!!n.getAttribute("data-brush-id"),
        firma:(n.getAttribute("d")||"")+"|"+(n.getAttribute("fill-opacity")||"")+"|"+n.innerHTML,
        caja:bb?{w:+bb.width.toFixed(2),h:+bb.height.toFixed(2)}:null}; };

    // 1. Ningun pincel incorporado puede saltearse el motor.
    const incorporados=LOW.drawing.brushes.all().filter(b=>LOW.drawing.brushes.isBuiltin(b.id));
    const control=await trazoCon(LOW.drawing.brushes.get("clean-ink"),{});
    const sinDeclarar=incorporados.filter(b=>b.engine!=="raster"&&b.engine!=="vector").map(b=>b.id);
    const motorSiempre=incorporados.every(b=>["raster","vector"].includes(dzBrushMotor(b)));

    // 2. Cada parametro visible, en los dos motores.
    const VIS=[["size",.5,160],["opacity",0,1],["spacing",.01,1],["smoothing",0,1],
      ["pressureSize",0,1],["pressureOpacity",0,1],["tiltSize",0,1],["scatter",0,2],["hardness",0,1]];
    const vector=LOW.drawing.brushes.get("clean-ink"), raster=LOW.drawing.brushes.get("dry-brush");
    const tabla={};
    for(const [clave,min,max] of VIS){
      const av=await trazoCon(vector,{[clave]:min}), bv=await trazoCon(vector,{[clave]:max});
      const ar=await trazoCon(raster,{[clave]:min}), br=await trazoCon(raster,{[clave]:max});
      tabla[clave]={vector:av.firma!==bv.firma, raster:ar.firma!==br.firma,
        vacio:!!(av.vacio||bv.vacio||ar.vacio||br.vacio)};
    }

    // 3. Los que el motor no puede usar tienen que estar DECLARADOS inertes y
    //    aparecer apagados en la pantalla, no vivos y mudos.
    const inertes=LOW.drawing.BrushStudio.INERTES;
    dzBrushStudioOpen(); await wait(400);
    dzBrushSelect(LOW.drawing.brushes.get("clean-ink"));
    DZ_BRUSH_STUDIO.selected=DZ.brushPreset; DZ_BRUSH_STUDIO.render(); await wait(250);
    const raiz=document.querySelector("#dzBrushStudio");
    const apagados=[...raiz.querySelectorAll(".bst-controls input[disabled]")].map(i=>i.dataset.p).sort();
    const conMotivo=[...raiz.querySelectorAll(".bst-controls label.inerte")].every(l=>(l.title||"").length>30);

    DZ.brushPreset='clean-ink';DZ.anchoFijo=false;
    const varying=[[0,0,.1,0,0,0,0],[50,0,1,45,0,0,10],[100,0,.2,0,0,0,100]];
    const normal=dzBrushFinalElement(varying,'#111').getAttribute('d');
    document.querySelector('#dzAnchoFijo').click();
    const fixed=dzBrushFinalElement(varying,'#111').getAttribute('d');
    const uniform=dzBrushFinalElement(varying.map(p=>[p[0],p[1],1,0,0,0,p[6]]),'#111').getAttribute('d');
    if(!DZ.anchoFijo||fixed===normal||fixed!==uniform)throw Error('Ancho fijo no desactiva dinámica del ancho');
    document.querySelector('#dzAnchoFijo').click();
    if(dzBrushFinalElement(varying,'#111').getAttribute('d')!==normal)throw Error('No vuelve presión variable');
    return {control, sinDeclarar, motorSiempre, tabla,
      inertesVector:Object.keys(inertes.vector||{}).sort(), apagados, conMotivo,
      errs:errs.slice(0,3)};
  })()`;

  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const v = result.result?.value;
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  if (v?.control?.vacio) mal("el pincel no deja ningún trazo", v?.control);
  if (!v.control.porElMotor)
    mal("un pincel incorporado se saltea el MOTOR y cae al camino viejo: sus parámetros " +
      "no pueden hacer nada", v.control);
  if (!v.motorSiempre)
    mal("hay pinceles sin motor resoluble: la regla es que lo que no es raster es vector",
      { sinDeclarar: v.sinDeclarar });

  const inertes = new Set(v.inertesVector);
  for (const clave in v.tabla) {
    const fila = v.tabla[clave];
    if (fila.vacio) mal("con " + clave + " en un extremo el pincel no dibuja nada", fila);
    if (!fila.raster) mal("el parámetro " + clave + " no cambia NADA en un pincel raster", fila);
    if (!fila.vector && !inertes.has(clave))
      mal("el parámetro " + clave + " no cambia NADA en un pincel vectorial, y no está " +
        "declarado inerte: es un deslizador que se mueve y miente", fila);
    if (fila.vector && inertes.has(clave))
      mal("el parámetro " + clave + " está declarado inerte pero sí cambia el trazo: " +
        "la pantalla lo apaga sin motivo", fila);
  }

  if (v.apagados.join(",") !== v.inertesVector.join(","))
    mal("lo declarado inerte no coincide con lo que la pantalla apaga",
      { apagados: v.apagados, declarados: v.inertesVector });
  if (!v.conMotivo)
    mal("un deslizador apagado no dice POR QUÉ: apagarlo sin explicación es peor que dejarlo",
      v.apagados);

  if (v.errs?.length) throw Error("REGRESIÓN: excepciones midiendo el pincel: " + v.errs.join(" | "));

  const vivos = Object.entries(v.tabla).filter(([, f]) => f.vector).map(([k]) => k);
  console.log("E2E parámetros del pincel OK", JSON.stringify({
    vectorialesVivos: vivos, inertesDeclarados: v.inertesVector,
    sinDeclararEngine: v.sinDeclarar.length, apagados: v.apagados }));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
