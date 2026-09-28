/* LA PAPELERA DEL PROYECTO: la única acción destructiva del módulo 2D.
   CDP :9223 + mock :8791.

   POR QUÉ EXISTE ESTE RECORRIDO. Haciendo el inventario de capacidades (A01 del
   plan maestro) busqué quién probaba «Mover documento a la papelera…» y la
   respuesta fue NADIE: ni un guard, ni un contrato, ni una prueba de puente.
   Mueve un archivo del trabajo de alguien y no tenía una sola comprobación.

   LO QUE SE PERSIGUE, en orden de gravedad:

   1. QUE CANCELAR NO BORRE NADA. Es la aserción que importa: si el puente se
      llama antes de que la persona confirme, el «¿estás seguro?» es decorado.
   2. Que el aviso DIGA QUÉ ARCHIVO, porque con dos documentos abiertos «¿mover
      a la papelera?» no alcanza para decidir.
   3. Que se vea PELIGROSO. Una acción que se lleva un archivo no puede
      presentarse con el mismo botón que «Aceptar».
   4. Que al confirmar se llame UNA vez, con la ruta del documento abierto, y
      que el documento se cierre.

   El puente no se toca: `api.trash_design` se reemplaza por un espía que anota
   y no mueve nada. Lo que hace el puente de verdad —mover y no borrar, rechazar
   rutas de afuera, no pisar nombres repetidos— lo prueba
   `check_papelera_backend.py`. Acá se prueba el FLUJO. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map(), errores = [];
  ws.onmessage = event => { const m = JSON.parse(event.data);
    if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (!m.id || !pending.has(m.id)) return; const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 180000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate",
    { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const ok = await ev('typeof dzMenuAction==="function" && !!api').catch(() => false);
    if (ok === true) break;
    await w(400);
  }

  /** El clic del mouse de verdad. Un botón de un modal se puede llamar por su
   *  onclick, pero entonces no se prueba que se pueda APRETAR: eso ya dejó
   *  pasar un panel muerto antes. */
  const clickEn = async (sel) => {
    const caja = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});
      if(!e) return null; const r=e.getBoundingClientRect(); if(!r.width||!r.height) return null;
      return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};})()`);
    if (!caja) throw Error("no pude clickear " + sel);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: caja.x, y: caja.y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: caja.x, y: caja.y, button: "left", buttons: 1, clickCount: 1 });
    await w(80);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: caja.x, y: caja.y, button: "left", buttons: 0, clickCount: 1 });
  };

  // ── montaje: un documento abierto y el puente espiado
  const montaje = await ev(`(async()=>{
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg");
    await new Promise(r=>setTimeout(r,600));
    window.__papelera = [];
    // El espia NO mueve nada: anota la ruta y contesta como el puente.
    api.trash_design = (ruta) => { window.__papelera.push(ruta);
      return {trashed:true, path:ruta, recovery_path:ruta+".papelera"}; };
    if (typeof api.refresh_tree !== "function") api.refresh_tree = () => ({tree:{}});
    return { ruta: String(DZ.path || (DZ.doc && DZ.doc.path) || ""),
      estudioVisible: !document.querySelector("#designView").hidden };
  })()`);
  if (!montaje.ruta) throw Error("REGRESIÓN: el montaje no dejó un documento con archivo :: " + JSON.stringify(montaje));

  // ── 1. pedir la papelera: aparece el aviso
  await ev('(()=>{ dzMenuAction("borrar-documento"); return true; })()');
  let aviso = null;
  for (let i = 0; i < 30; i++) {
    aviso = await ev(`(()=>{const ov=document.querySelector("#overlay");
      if(!ov||ov.hidden) return null;
      const ok=ov.querySelector("#dzCfOk"), no=ov.querySelector("#dzCfX");
      return { texto:(ov.textContent||"").replace(/\\s+/g," ").trim().slice(0,160),
        hayAceptar:!!ok, hayCancelar:!!no,
        etiquetaOk: ok?(ok.textContent||"").trim():null,
        peligroso: !!(ok && ok.className.split(/\\s+/).includes("danger")) };})()`);
    if (aviso) break;
    await w(400);
  }

  // ── 2. CANCELAR. La aserción que importa.
  let trasCancelar = null;
  if (aviso) {
    await clickEn("#dzCfX");
    await w(700);
    trasCancelar = await ev(`({ llamadas: window.__papelera.length,
      estudioVisible: !document.querySelector("#designView").hidden,
      sigueElDoc: !!(DZ.path || DZ.doc),
      modalCerrado: (()=>{const o=document.querySelector("#overlay"); return !o||o.hidden;})() })`);
  }

  // SE JUZGA ACÁ MISMO, no al final. Con la confirmación ignorada, cancelar
  // igual manda el archivo a la papelera y el documento se cierra; entonces el
  // paso siguiente no encuentra el modal y falla con «no pude clickear», que
  // esconde el motivo. Es la misma lección que en el recorrido de arranque: una
  // aserción que se evalúa tarde la tapa cualquier excepción anterior.
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const nombre = String(montaje.ruta).split(/[\\/]/).pop();

  if (!aviso) mal("«Mover a la papelera» NO pide confirmación: se lleva el archivo de una", { montaje });
  if (!aviso.hayCancelar || !aviso.hayAceptar) mal("el aviso de la papelera no ofrece las dos salidas", aviso);
  if (nombre && aviso.texto.indexOf(nombre) < 0)
    mal("el aviso no dice QUÉ archivo se va a la papelera: con dos documentos abiertos " +
      "no hay manera de decidir", { nombre, aviso });
  if (!/papelera/i.test(aviso.texto))
    mal("el aviso no dice que el archivo va a la papelera y se puede recuperar", aviso);
  if (!aviso.peligroso)
    mal("la acción destructiva se presenta con el botón de siempre: una acción que se " +
      "lleva un archivo tiene que verse peligrosa", aviso);

  if (!trasCancelar) mal("no se pudo cancelar el aviso", { aviso });
  if (trasCancelar.llamadas !== 0)
    mal("CANCELAR LLAMÓ AL PUENTE: el archivo se iba a la papelera aunque la persona " +
      "dijera que no. El «¿estás seguro?» sería decorado", trasCancelar);
  if (!trasCancelar.sigueElDoc || !trasCancelar.estudioVisible)
    mal("cancelar igual cerró el documento", trasCancelar);
  if (!trasCancelar.modalCerrado) mal("cancelar no cerró el aviso", trasCancelar);

  // ── 3. CONFIRMAR
  await ev('(()=>{ dzMenuAction("borrar-documento"); return true; })()');
  for (let i = 0; i < 30; i++) {
    const hay = await ev('(()=>{const o=document.querySelector("#overlay"); return !!(o&&!o.hidden&&o.querySelector("#dzCfOk"));})()');
    if (hay === true) break;
    await w(400);
  }
  await clickEn("#dzCfOk");
  await w(1200);
  const trasConfirmar = await ev(`({ llamadas: window.__papelera.slice(),
    estudioVisible: !document.querySelector("#designView").hidden,
    titulo: (document.querySelector("#dzTitle")||{}).textContent||"",
    sigueElDoc: !!(DZ.path || DZ.doc) })`);

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }

  if (trasConfirmar.llamadas.length !== 1)
    mal("confirmar llamó al puente " + trasConfirmar.llamadas.length + " veces en vez de una",
      trasConfirmar);
  if (trasConfirmar.llamadas[0] !== montaje.ruta)
    mal("confirmar mandó a la papelera OTRA ruta que la del documento abierto",
      { pedido: trasConfirmar.llamadas[0], abierto: montaje.ruta });
  if (trasConfirmar.sigueElDoc || trasConfirmar.estudioVisible)
    mal("el documento sigue abierto después de mandarlo a la papelera: se estaría " +
      "trabajando sobre un archivo que ya no está", trasConfirmar);
  if (!/sin documento/i.test(trasConfirmar.titulo))
    mal("el título no dice que ya no hay documento", trasConfirmar);

  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));

  console.log("E2E papelera OK " + JSON.stringify({
    aviso: { nombra: true, peligroso: aviso.peligroso, ok: aviso.etiquetaOk },
    cancelar: { llamadas: trasCancelar.llamadas, docIntacto: trasCancelar.sigueElDoc },
    confirmar: { llamadas: trasConfirmar.llamadas.length, cerroElDoc: !trasConfirmar.sigueElDoc },
  }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
