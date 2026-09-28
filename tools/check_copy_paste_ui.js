/* Copiar y pegar un dibujo de un cuadro a otro. CDP :9223 + mock :8791.

   Este recorrido existe por un bug que BORRABA TRABAJO: pegar avisaba «pegado»,
   el lienzo mostraba el dibujo, y a los 260 ms el volcado con retardo escribia
   el lienzo desactualizado ENCIMA de la copia. Por eso todas las esperas de acá
   pasan los 400 ms a proposito: si se miden antes, el bug pasa desapercibido.

   Tambien fija la REGLA, que antes dependia de si la X-sheet estaba montada:
   sin rango se copia el dibujo y se pega una copia aparte; con rango se copian
   celdas; Ctrl+Shift+V reexpone el mismo dibujo. */
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
  // 120 s y no 40: el guion de este recorrido corre entero dentro de UN
  // Runtime.evaluate y hace decenas de esperas pautadas. Con la maquina cargada
  // —dieciseis recorridos en rafaga— se pasaba de 40 s y fallaba por lentitud,
  // no por regresion. Es el mismo error que confundir un runner flojo con un
  // defecto del producto.
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 120000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 60; i++) {
    const r = await send("Runtime.evaluate", { expression: 'typeof dzCuadroCopiar==="function" && !!api', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit(); await wait(500);
    DZ.doc.scene.expose(DZ.doc.scene.layers[0].id,8,1);
    if(!DZ.anim) await dzAnimToggle(); await wait(700);
    // con la X-sheet montada sus atajos capturan primero: es el caso en el que
    // Ctrl+V hacia otra cosa distinta
    await dzXsMount(); await wait(800);

    const tecla=(k,shift)=>{ const ev=new KeyboardEvent("keydown",{key:k,ctrlKey:true,
      shiftKey:!!shift,bubbles:true,cancelable:true});
      document.dispatchEvent(ev); return ev.defaultPrevented; };
    const trazo=()=>{ const d=DZ.doc.drawing; return !!d && (d.content||"").includes("M20 20"); };

    // dibujar en el lienzo, como un trazo de verdad
    DZ.doc.goTo(1); await wait(300);
    const svg=document.querySelector("#dzCanvas > svg");
    const p=document.createElementNS("http://www.w3.org/2000/svg","path");
    p.setAttribute("d","M20 20 L120 60 L60 140"); p.setAttribute("stroke","#111");
    p.setAttribute("fill","none"); p.setAttribute("stroke-width","4");
    (svg.querySelector('[data-low-art="line"]')||svg).appendChild(p);
    dzDocCommit(); await wait(400);
    const origen={cuadro:DZ.doc.frame, dibujo:DZ.doc.drawing.number, trazo:trazo()};

    // ── copiar y pegar en otro cuadro
    DZ.doc.cellSelection=null;
    const atajoC=tecla("c"); await wait(300);
    const copiado={atajoTomado:atajoC, hay:!!DZ.clipCuadro};
    DZ.doc.goTo(3); await wait(400);
    const vacioAntes=!trazo();
    const atajoV=tecla("v");
    await wait(300);
    const alInstante={trazo:trazo(), dibujo:DZ.doc.drawing?DZ.doc.drawing.number:null};
    // LA espera que importa: el volcado con retardo corre a los 260 ms
    await wait(900);
    const pasadoElVolcado={trazo:trazo(), dibujo:DZ.doc.drawing?DZ.doc.drawing.number:null};
    // y si me voy y vuelvo, que es cuando el animador lo descubria
    DZ.doc.goTo(1); await wait(400); DZ.doc.goTo(3); await wait(500);
    const alVolver={trazo:trazo(), dibujo:DZ.doc.drawing?DZ.doc.drawing.number:null,
      atajoTomado:atajoV};

    // el original no se toca al retocar la copia
    const original=DZ.doc.level.drawings.find(d=>d.number===origen.dibujo);
    const copiaAparte={numeroDistinto:alVolver.dibujo!==origen.dibujo,
      originalIntacto:!!original&&String(original.content||"").includes("M20 20")};

    // ── con un RANGO seleccionado se copian celdas, no el dibujo
    DZ.doc.goTo(1);
    DZ.doc.cellSelection={fromLayerId:DZ.doc.layerId,toLayerId:DZ.doc.layerId,from:1,to:2,
      anchorLayerId:DZ.doc.layerId,anchorFrame:1};
    tecla("c"); await wait(400);
    const conRango={celdas:!!(LOW.animation.shortcuts.clip&&LOW.animation.shortcuts.clip.range),
      dice:(document.querySelector("#sbHint")||{}).textContent||""};

    // ── Ctrl+Shift+V reexpone el MISMO dibujo
    DZ.doc.cellSelection=null; DZ.doc.goTo(6); await wait(300);
    tecla("v",true); await wait(900);
    const reuso={dibujo:DZ.doc.drawing?DZ.doc.drawing.number:null,
      dice:(document.querySelector("#sbHint")||{}).textContent||""};

    return {origen,copiado,vacioAntes,alInstante,pasadoElVolcado,alVolver,copiaAparte,
      conRango,reuso,errores:(window.__errs||[]).slice(0,3)};
  })()`;

  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const v = result.result?.value;
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  if (!v?.origen?.trazo) mal("el recorrido no llegó a dibujar nada: no prueba nada", v?.origen);
  if (!v.copiado.atajoTomado || !v.copiado.hay) mal("Ctrl+C no copió el dibujo", v.copiado);
  if (!v.vacioAntes) mal("el cuadro destino no estaba vacío: la prueba no distingue", v.vacioAntes);
  if (!v.alInstante.trazo) mal("Ctrl+V no pega el dibujo", v.alInstante);
  if (!v.pasadoElVolcado.trazo)
    mal("el dibujo pegado se pierde a los 260 ms: el volcado con retardo escribe el lienzo viejo encima",
      { alInstante: v.alInstante, despues: v.pasadoElVolcado });
  if (!v.alVolver.trazo) mal("el dibujo pegado no está al volver al cuadro", v.alVolver);
  if (!v.copiaAparte.numeroDistinto)
    mal("Ctrl+V pegó una referencia y no una copia: retocarla cambiaría el original", v.copiaAparte);
  if (!v.copiaAparte.originalIntacto) mal("pegar dañó el dibujo original", v.copiaAparte);
  if (!v.conRango.celdas || !/celdas copiadas/.test(v.conRango.dice))
    mal("con un rango seleccionado dejó de copiar celdas", v.conRango);
  if (v.reuso.dibujo !== v.origen.dibujo || !/MISMO dibujo/.test(v.reuso.dice))
    mal("Ctrl+Shift+V dejó de reexponer el mismo dibujo", v.reuso);
  if (v.errores?.length) throw Error("REGRESIÓN: excepciones al copiar y pegar: " + v.errores.join(" | "));

  console.log("E2E copiar y pegar OK", JSON.stringify(v));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
