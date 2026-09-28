/* Function Editor (biblia §6) sobre Chromium. CDP :9223 + mock :8791.

   Verifica las ocho condiciones que la biblia le exige al editor de curvas:
   canales por propiedad, curvas Bezier editables, las cuatro tangentes, edición
   numérica, regiones de tiempo, copiar y pegar SÓLO el timing, filtro por lo
   seleccionado y una única cabeza lectora compartida con Timeline y X-sheet. */
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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 40000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 60; i++) {
    const r = await send("Runtime.evaluate", { expression: 'typeof dzFnToggle==="function" && !!api', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    await openDesign("C:\\\\mock\\\\fn.svg"); await dzDocInit(); await wait(500);
    LOW.workspace.workspaces.activate("animation",dzWsAplicar); await wait(500);
    const doc=DZ.doc;
    doc.ensureRigNodes([{id:"brazo_L",name:"brazo L"},{id:"pierna_R",name:"pierna R"}],"Preparar rig");
    const path="bones/brazo_L/pose/r", otro="bones/pierna_R/pose/x";
    doc.setRigChannelKey(path,1,0); doc.setRigChannelKey(path,12,45); doc.setRigChannelKey(path,24,-10);
    doc.setRigChannelKey(otro,1,0); doc.setRigChannelKey(otro,10,80);
    await wait(200);
    dzFnToggle(); await wait(500);
    const panel=document.querySelector("#dzFnEditor"), v=DZ.fnView, canal=()=>doc.scene.rigChannel(path);
    const abierto={visible:!panel.hidden,canales:panel.querySelectorAll(".fn2-lista button").length,
      curvas:panel.querySelectorAll(".fn2-curva").length,claves:panel.querySelectorAll(".fn2-clave").length,
      cabeza:panel.querySelectorAll(".fn2-cabeza").length};
    const clave=[...panel.querySelectorAll(".fn2-clave")].find(c=>+c.dataset.frame===12);
    clave.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,clientX:0,clientY:0}));
    window.dispatchEvent(new PointerEvent("pointerup",{bubbles:true}));
    await wait(200);
    const seleccion={frame:v.selected&&v.selected.frame,manijas:panel.querySelectorAll(".fn2-manija").length,
      campoFrame:panel.querySelector('[data-n="frame"]').value,campoValor:panel.querySelector('[data-n="value"]').value};
    panel.querySelector('[data-t="escalon"]').click(); await wait(180);
    const escalon={interp:canal().interpolation,hold:!!(canal().ease||{})[12]?.hold,valor18:doc.scene.rigChannelValue(path,18)};
    panel.querySelector('[data-t="lineal"]').click(); await wait(180);
    const lineal={interp:canal().interpolation,valor18:doc.scene.rigChannelValue(path,18)};
    panel.querySelector('[data-t="suave"]').click(); await wait(180);
    const suave={interp:canal().interpolation,eo:(canal().ease||{})[12]?.eo,valor18:doc.scene.rigChannelValue(path,18)};
    panel.querySelector('[data-n="frame"]').value="14";
    panel.querySelector('[data-n="frame"]').dispatchEvent(new Event("change",{bubbles:true}));
    await wait(250);
    const numerica={hay14:canal().keys[14]!=null,hay12:canal().keys[12]!=null,sigue:v.selected&&v.selected.frame};
    panel.querySelector('[data-a="copiar"]').click(); await wait(120);
    const copiada=!!v.clip;
    v.selected={path,frame:1}; v.render(); await wait(120);
    const valorAntes=canal().keys[1];
    panel.querySelector('[data-a="pegar"]').click(); await wait(200);
    const curva={valorIntacto:canal().keys[1]===valorAntes,easeEscrita:!!(canal().ease||{})[1]};
    v.selected={path,frame:14}; v.render(); await wait(100);
    const antes=Object.keys(canal().keys).length;
    panel.querySelector('[data-a="borrar"]').click(); await wait(220);
    const despues=Object.keys(canal().keys).length;
    dzUndo(); await wait(250);
    const borrado={antes,despues,trasUndo:Object.keys(doc.scene.rigChannel(path).keys).length};
    const caja=panel.querySelector(".fn2-svg").getBoundingClientRect();
    v.selected={path,frame:1}; v.render(); await wait(100);
    const clavesAntes=Object.keys(canal().keys).length;
    panel.querySelector(".fn2-svg").dispatchEvent(new MouseEvent("dblclick",
      {bubbles:true,clientX:caja.left+caja.width*.7,clientY:caja.top+caja.height*.5}));
    await wait(250);
    const creada=Object.keys(doc.scene.rigChannel(path).keys).length>clavesAntes;
    const cuadroAntes=doc.frame;
    panel.querySelector(".fn2-svg").dispatchEvent(new PointerEvent("pointerdown",
      {bubbles:true,clientX:caja.left+caja.width*.45,clientY:caja.top+caja.height*.9}));
    window.dispatchEvent(new PointerEvent("pointerup",{bubbles:true}));
    await wait(250);
    const sincronia={antes:cuadroAntes,despues:doc.frame};
    // filtro: con un hueso seleccionado se ven SOLO sus canales
    DZ.rigSelectedId="pierna_R"; v.render(); await wait(150);
    const conFiltro=[...panel.querySelectorAll(".fn2-lista button span")].map(n=>n.textContent);
    panel.querySelector('[data-a="filtro"]').click(); await wait(150);
    const sinFiltro=[...panel.querySelectorAll(".fn2-lista button span")].map(n=>n.textContent);
    panel.querySelector('[data-a="filtro"]').click(); DZ.rigSelectedId=null; await wait(120);
    // región de tiempo
    panel.querySelector('[data-r="in"]').value="10";
    panel.querySelector('[data-r="in"]').dispatchEvent(new Event("change",{bubbles:true}));
    panel.querySelector('[data-r="out"]').value="20";
    panel.querySelector('[data-r="out"]').dispatchEvent(new Event("change",{bubbles:true}));
    await wait(250);
    const region={rango:v.rango,f0:v.enc&&v.enc.f0,f1:v.enc&&v.enc.f1,
      clavesDibujadas:panel.querySelectorAll(".fn2-clave").length};
    return {abierto,seleccion,escalon,lineal,suave,numerica,copiada,curva,borrado,creada,sincronia,
      filtro:{conFiltro,sinFiltro},region,errores:(window.__errs||[]).slice(0,3)};
  })()`;

  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const v = result.result?.value;

  if (!v?.abierto?.visible || v.abierto.canales < 2 || !v.abierto.curvas || v.abierto.claves < 3 || !v.abierto.cabeza)
    throw Error("REGRESIÓN: el editor de funciones no dibuja canales, curvas, claves y cabeza lectora: " + JSON.stringify(v?.abierto));
  if (v.seleccion?.frame !== 12 || v.seleccion.manijas !== 2 || v.seleccion.campoFrame !== "12" || v.seleccion.campoValor !== "45")
    throw Error("REGRESIÓN: seleccionar una clave no muestra sus manijas ni sus valores: " + JSON.stringify(v.seleccion));
  if (v.escalon?.interp !== "step" || !v.escalon.hold || v.escalon.valor18 !== 45)
    throw Error("REGRESIÓN: la tangente Escalón no sostiene el valor: " + JSON.stringify(v.escalon));
  if (v.lineal?.interp !== "linear" || v.suave?.interp !== "bezier")
    throw Error("REGRESIÓN: las tangentes Lineal y Suave no cambian la interpolación: " + JSON.stringify({ l: v.lineal, s: v.suave }));
  if (!(Math.abs(v.suave.valor18 - v.lineal.valor18) > 0.5))
    throw Error("REGRESIÓN: una curva Bezier editada no cambia el movimiento: " + JSON.stringify({ l: v.lineal, s: v.suave }));
  if (!v.numerica?.hay14 || v.numerica.hay12 || v.numerica.sigue !== 14)
    throw Error("REGRESIÓN: la edición numérica no mueve la clave: " + JSON.stringify(v.numerica));
  if (!v.copiada || !v.curva?.valorIntacto || !v.curva.easeEscrita)
    throw Error("REGRESIÓN: copiar y pegar curva debe mover el timing sin tocar los valores: " + JSON.stringify(v.curva));
  if (v.borrado?.despues !== v.borrado.antes - 1 || v.borrado.trasUndo !== v.borrado.antes)
    throw Error("REGRESIÓN: borrar una clave no es reversible: " + JSON.stringify(v.borrado));
  if (!v.creada) throw Error("REGRESIÓN: el doble clic dejó de crear claves");
  if (v.sincronia?.antes === v.sincronia?.despues)
    throw Error("REGRESIÓN: el editor no comparte la cabeza lectora con la Timeline: " + JSON.stringify(v.sincronia));
  if (!v.filtro?.conFiltro?.length || v.filtro.conFiltro.length >= v.filtro.sinFiltro.length ||
      !v.filtro.conFiltro.every(n => /pierna/.test(n)))
    throw Error("REGRESIÓN: el filtro por selección no acota los canales: " + JSON.stringify(v.filtro));
  if (v.region?.f0 !== 10 || v.region.f1 !== 20 || v.region.clavesDibujadas < 1)
    throw Error("REGRESIÓN: la región de tiempo no acota lo que se edita: " + JSON.stringify(v.region));
  if (v.errores?.length) throw Error("REGRESIÓN: excepciones en el editor: " + v.errores.join(" | "));
  if (errors.length) throw Error("REGRESIÓN: excepciones UI: " + errors.slice(0, 3).join(" | "));

  console.log("E2E function editor OK", JSON.stringify(v));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
