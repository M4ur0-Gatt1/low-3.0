/* Aceptación de jerarquía y documentos múltiples en Chromium. CDP :9223 + mock :8791. */
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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 30000);
    pending.set(n, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  // VIEWPORT FIJO: el riel reparte herramientas segun el alto REAL de la
  // ventana. Sin fijarlo, la misma prueba dice que el cuentagotas y la pluma
  // "desaparecieron" segun con que tamano haya arrancado el navegador.
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  const esperarApp = async () => { for (let i = 0; i < 60; i++) {
    const ready = await send("Runtime.evaluate", { expression: 'typeof dzDocumentTabActivate==="function" && !!api', returnByValue: true });
    if (ready.result?.value) return; await new Promise(resolve => setTimeout(resolve, 250)); } };
  await esperarApp();
  // AISLAMIENTO: los recorridos comparten el navegador y por lo tanto el
  // localStorage. El riel de herramientas RECUERDA lo que el usuario mando al
  // cajon, asi que un recorrido anterior que lo tocara dejaba a este acusando
  // que el cuentagotas y la pluma "desaparecieron" del riel. Se arranca limpio.
  await send("Runtime.evaluate", { expression: 'try{localStorage.clear()}catch(e){}' });
  await send("Page.navigate", { url: pageUrl });
  await esperarApp();
  const expression = `(async()=>{
    await openDesign("C:\\mock\\personaje-a.svg");
    const first=DZ.activeDocumentTab,svg=document.querySelector('#dzCanvas > svg');
    svg.setAttribute('data-document-proof','A');dzMarkDirty();
    await openDesign("C:\\mock\\fondo-b.svg");
    const second=DZ.activeDocumentTab;
    await dzDocumentTabActivate(first);
    const restored=document.querySelector('#dzCanvas > svg')?.getAttribute('data-document-proof');
    await dzDocumentTabActivate(second);
    // Cerrar una pestaña con cambios ya no abre un confirm() del sistema sino el
    // modal propio: la prueba lo responde como una persona, haciendo clic. Que
    // el boton aparezca es parte de lo que se verifica.
    const cierre=dzDocumentTabClose(second);
    let confirmado=false;
    for(let i=0;i<60;i++){const b=document.querySelector('#dzCfOk');if(b){confirmado=true;b.click();break;}await new Promise(r=>setTimeout(r,25));}
    const cerrado=await cierre;
    const menu=[...document.querySelectorAll('#dzMenubar > .dz-menu')].map(n=>n.dataset.menu);
    const tools=[...document.querySelectorAll('.dz-tools > [data-tool],.dz-tools > #dzShapePicker,.dz-tools > #dzAddText,.dz-tools > #dzAddLine')].map(n=>n.dataset.tool||n.id);
    const tabs=document.querySelector('#dzDocumentTabs'),opts=document.querySelector('#dzToolOpts'),body=document.querySelector('.dz-body');
    // La cabecera son TRES filas, como en Photoshop: menú, barra de opciones
    // (herramienta + documento + vista) y pestañas. Cuatro filas se comían
    // ~40px de lienzo en todas las pantallas.
    const barra=document.querySelector('.dz-optionsbar'), iconos=document.querySelector('.art-bar-inline');
    const banda=(n)=>{const r=n.getBoundingClientRect();return {t:Math.round(r.top),b:Math.round(r.bottom)};};
    const cabecera={filas:[banda(document.querySelector('.dz-menubar')),banda(barra),banda(tabs)],
      alto:Math.round(tabs.getBoundingClientRect().bottom),
      opcionesEnUnaFila:!!iconos&&Math.abs(banda(iconos).t-banda(opts).t)<24
        &&banda(iconos).b<=banda(barra).b+1,
      pestanasAfuera:!barra.contains(tabs)};
    const tr=tabs.getBoundingClientRect(),orr=opts.getBoundingClientRect(),br=body.getBoundingClientRect();
    return {cabecera,count:DZ.documentTabs.length,active:DZ.activeDocumentTab===first,restored,confirmado,cerrado,
      dirty:DZ.documentTabs[0]?.dirty,titleHidden:getComputedStyle(document.querySelector('#dzTitle')).display==='none',
      menu,tools,tabsRole:tabs.getAttribute('role'),between:tr.top>=orr.bottom-1&&tr.bottom<=br.top+1,
      tabButtons:tabs.querySelectorAll('[role="tab"]').length,errors:window.__errs||[]};
  })()`;
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const value = result.result?.value;
  const expectedMenu = ["archivo", "edicion", "capa", "animacion", "vista", "ventana", "ayuda"];
  const primaryTools = ["select", "direct", "nodes", "brush", "pencil", "eraser", "bucket", "dropper", "pen"];
  // Las primarias van al PRINCIPIO del riel: antes se verificaban al final, que
  // era justamente el síntoma (las flechas quedaban fuera de la vista).
  const ok = value?.count === 1 && value.active && value.restored === "A" && value.dirty && value.titleHidden &&
    value.confirmado && value.cerrado &&
    JSON.stringify(value.menu) === JSON.stringify(expectedMenu) &&
    JSON.stringify(value.tools.slice(0, 9)) === JSON.stringify(primaryTools) &&
    value.tabsRole === "tablist" && value.between && value.tabButtons === 1 && !errors.length && !value.errors.length;
  const c = value?.cabecera;
  if (!c?.opcionesEnUnaFila)
    throw Error("REGRESIÓN: la barra de iconos volvió a ocupar una fila propia: " + JSON.stringify(c));
  if (!c.pestanasAfuera)
    throw Error("REGRESIÓN: las pestañas quedaron adentro de la barra de opciones: " + JSON.stringify(c));
  if (c.filas.some((f, i) => i && f.t < c.filas[i - 1].b - 1))
    throw Error("REGRESIÓN: las filas de la cabecera se superponen: " + JSON.stringify(c.filas));
  if (c.alto > 115)
    throw Error("REGRESIÓN: la cabecera volvió a crecer (" + c.alto + "px sobre un tope de 115): " + JSON.stringify(c.filas));
  if (!ok) throw Error("REGRESIÓN documentos/jerarquía: " + JSON.stringify({ value, errors }));
  console.log("E2E DOCUMENTOS OK", JSON.stringify(value));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* cierre best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
