/* ELEGIR DÓNDE SE GUARDA LO EXPORTADO. CDP :9223 + mock :8791.

   Pedido de Mauro (v3.23): «cuando exporto los archivos quiero poder elegir
   dónde los guardo; ahora se arma una carpeta por defecto y no la puedo
   cambiar». Antes, elegir un formato en el modal mandaba al puente sólo la ruta
   del documento y todo caía en `export/`.

   Se recorre con clics de verdad y el puente espiado:
   1. El modal avisa que se va a elegir dónde guardar.
   2. MP4: se pregunta el destino ANTES de rasterizar, y el puente recibe el
      archivo elegido.
   3. Cancelar el diálogo no exporta nada y lo dice.
   4. Secuencia PNG y Premiere reciben la carpeta elegida.
   5. Un puente viejo que no sabe preguntar exporta igual, a export/. */
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
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  const clickEn = async (sel) => {
    let caja = null;
    for (let i = 0; i < 25 && !caja; i++) {
      caja = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});
        if(!e) return null; const r=e.getBoundingClientRect(); if(!r.width||!r.height) return null;
        return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};})()`);
      if (!caja) await w(200);
    }
    if (!caja) throw Error("no pude clickear " + sel);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: caja.x, y: caja.y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: caja.x, y: caja.y, button: "left", buttons: 1, clickCount: 1 });
    await w(80);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: caja.x, y: caja.y, button: "left", buttons: 0, clickCount: 1 });
  };
  const estado = () => ev(`(document.querySelector("#dzStatus")||{}).textContent?.trim() || ""`);
  /** Abre el modal desde la timeline y elige una salida; espera a que el
   *  puente conteste (o a que el estado diga que se canceló). */
  const exportar = async (salida) => {
    await ev(`(()=>{ window.__log = []; const s = document.querySelector("#dzStatus"); if (s) s.textContent = ""; return true; })()`);
    await clickEn("#tlExport");
    await clickEn(`#modal [data-x="${salida}"]`);
    for (let i = 0; i < 90; i++) {
      const listo = await ev(`window.__log.some(x => x.cual !== "pick") || /cancelada/i.test((document.querySelector("#dzStatus")||{}).textContent||"")`);
      if (listo) break;
      await w(300);
    }
    return ev(`window.__log.slice()`);
  };

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('document.readyState==="complete"&&typeof dzExportModal==="function"&&typeof dzDoExportDoc==="function"&&!!api').catch(() => false);
    if (listo === true) break;
    await w(400);
  }

  const montaje = await ev(`(async()=>{
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg");
    if (typeof dzDocInit === "function") await dzDocInit();
    await new Promise(r=>setTimeout(r,600));
    if (typeof closeL3d === "function") closeL3d();
    if (!DZ.anim) await dzAnimToggle();
    await new Promise(r=>setTimeout(r,700));
    const sc = DZ.doc.scene, ly = sc.layers[0], lv = sc.level(ly.levelId);
    const dibujo = '<g data-low-art="line"><path d="M100 100 L 400 400" stroke="#111" stroke-width="6" fill="none"/></g>';
    lv.addDrawing(1, dibujo); sc.expose(ly.id,1,1); sc.expose(ly.id,2,1); sc.expose(ly.id,3,1);
    sc.range = { in:1, out:3 };
    window.__log = [];
    window.__respuesta = null;
    api.pick_export_target = async (ruta, kind, nombre) => {
      window.__log.push({ cual:"pick", kind, ruta: ruta == null ? null : String(ruta), nombre });
      return window.__respuesta ? window.__respuesta(kind) : {};
    };
    api.export_anim = async (ruta, pngs, fps, kind, destino, nombre) => {
      window.__log.push({ cual:"anim", kind, cuantos:pngs.length, destino: destino == null ? null : destino, nombre });
      return { path: destino || "export/prueba", n: pngs.length };
    };
    api.export_premiere = async (ruta, pngs, xml, wav, nombre, destino) => {
      window.__log.push({ cual:"premiere", cuantos:pngs.length, destino: destino == null ? null : destino });
      return { path: destino || "export/prueba_premiere", name: nombre + ".xml", frames: pngs.length, audio: false };
    };
    if (typeof api.refresh_tree !== "function") api.refresh_tree = () => ({tree:{}});
    return { cuadros: dzExportCuadros().length };
  })()`);
  if (montaje.cuadros !== 3) mal("el montaje no dejó tres cuadros", montaje);

  // ── 1. el modal dice que se elige dónde guardar, ya no «carpeta export/»
  await clickEn("#tlExport");
  const texto = await ev(`(document.querySelector("#modal")||{}).textContent||""`);
  if (!/dónde guardarlo/.test(texto) || /carpeta export\//.test(texto))
    mal("el modal sigue prometiendo la carpeta export/ fija", texto.replace(/\s+/g, " ").slice(0, 200));
  await ev(`(()=>{ if (typeof closeModal === "function") closeModal(); return true; })()`);
  await w(200);

  // ── 2. MP4: se pregunta ANTES de rasterizar y el puente recibe el archivo
  const archivo = "D:\\Entregas\\caminata_final.mp4";
  await ev(`(()=>{ window.__respuesta = k => ({ path: ${JSON.stringify(archivo)}, dir: "D:\\\\Entregas" }); return true; })()`);
  let log = await exportar("mp4");
  const pick = log.find(x => x.cual === "pick"), anim = log.find(x => x.cual === "anim");
  if (!pick) mal("elegir MP4 no preguntó dónde guardar: va a la carpeta por defecto", log);
  if (pick.kind !== "mp4") mal("se preguntó por otro formato", pick);
  if (!anim) mal("después de elegir el lugar no se exportó", log);
  if (log.indexOf(pick) > log.indexOf(anim)) mal("se preguntó después de exportar", log);
  if (anim.destino !== archivo) mal("el puente no recibió el archivo elegido", anim);
  if (anim.cuantos !== 3) mal("no salieron los tres cuadros", anim);
  const est = await estado();
  if (est.indexOf("caminata_final.mp4") < 0) mal("el aviso no dice dónde quedó", est);

  // ── 3. cancelar el diálogo: no se exporta nada
  await ev(`(()=>{ window.__respuesta = k => ({ cancel: true }); return true; })()`);
  log = await exportar("gif");
  if (log.some(x => x.cual === "anim")) mal("cancelar el diálogo exportó igual", log);
  if (!/cancelada/i.test(await estado())) mal("cancelar no avisa nada", await estado());

  // ── 4. secuencia PNG y Premiere: la carpeta elegida
  await ev(`(()=>{ window.__respuesta = k => ({ path: "D:\\\\Secuencias", dir: "D:\\\\Secuencias" }); return true; })()`);
  log = await exportar("png");
  const png = log.find(x => x.cual === "anim");
  if (!log.some(x => x.cual === "pick" && x.kind === "png") || !png || png.destino !== "D:\\Secuencias")
    mal("la secuencia PNG no fue a la carpeta elegida", log);
  log = await exportar("premiere");
  const prem = log.find(x => x.cual === "premiere");
  if (!prem || prem.destino !== "D:\\Secuencias") mal("Premiere no fue a la carpeta elegida", log);

  // ── 5. un puente que no sabe preguntar: exporta igual, como siempre
  await ev(`(()=>{ api.pick_export_target = undefined; return true; })()`);
  log = await exportar("png");
  const viejo = log.find(x => x.cual === "anim");
  if (!viejo || viejo.destino != null) mal("sin poder preguntar, la exportación se rompió", log);

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));
  console.log("E2E destino de exportación OK " + JSON.stringify({ mp4: anim.destino, cancelar: true,
    png: png.destino, premiere: prem.destino, puenteViejo: "export/" }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
