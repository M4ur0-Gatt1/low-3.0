/* EXPORTAR DESDE UN DOCUMENTO NUEVO. CDP :9223 + mock :8791.

   POR QUE EXISTE ESTE RECORRIDO. Desde que LOW abre con «Nuevo documento», el
   trabajo vive en un `.low` y `DZ.path` —la ruta del .svg suelto, el camino
   viejo— queda en null. Pero TODAS las salidas siguen mandandole `DZ.path` al
   puente:

       api.export_anim(DZ.path, pngs, fps, kind)
       api.export_premiere(DZ.path, pngs, xml, wav, nombre)

   Medido en la APP REAL (v4.41.3, documento recien creado, un rectangulo
   dibujado, exportar secuencia PNG):

       TypeError: argument should be a str or an os.PathLike object
       where __fspath__ returns a str, not 'NoneType'

   y el estado se quedaba clavado en «Guardando la secuencia...». O sea: con el
   flujo por defecto del programa NO SE PODIA EXPORTAR NADA. Es el final de todo
   el trabajo: sin esto, lo que se anima no sale de LOW.

   Aca se espia el puente y se exige que reciba una RUTA DE VERDAD. El documento
   nuevo ya tiene la suya —`DZ.doc.path`, el .low que se creo—; era cuestion de
   usarla. */
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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 150000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate",
    { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('typeof dzDoExportDoc==="function" && typeof dzMenuAction==="function" && !!api').catch(() => false);
    if (listo === true) break;
    await w(400);
  }
  await ev('(()=>{ try{localStorage.clear()}catch(e){} return true; })()');

  // ── el camino de una persona: «Nuevo documento», dibujar, exportar ──────
  await ev(`dzMenuAction("nuevo")`);
  await w(2800);
  await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');
  const montaje = await ev(`(()=>{
    if (!DZ.doc) return { error: "«Nuevo documento» no dejó documento" };
    const svg = document.querySelector('#dzCanvas > svg');
    const r = document.createElementNS(svg.namespaceURI, 'rect');
    r.setAttribute('x', 300); r.setAttribute('y', 200);
    r.setAttribute('width', 400); r.setAttribute('height', 300); r.setAttribute('fill', '#f0450e');
    dzArtAppend(svg, r); dzDocCommit(); dzMarkDirty();
    // EL PUENTE, ESPIADO: no se toca el backend, se anota con qué lo llaman.
    window.__salidas = [];
    api.export_anim = (ruta, pngs, fps, kind) => {
      window.__salidas.push({ cual: "export_anim", ruta: ruta == null ? null : String(ruta), cuantos: pngs.length, kind });
      return { path: "export/prueba", n: pngs.length };
    };
    api.export_premiere = (ruta, pngs, xml, wav, nombre) => {
      window.__salidas.push({ cual: "export_premiere", ruta: ruta == null ? null : String(ruta), cuantos: pngs.length });
      return { path: "export/prueba.xml" };
    };
    if (typeof api.refresh_tree !== "function") api.refresh_tree = () => ({ tree: {} });
    return { docPath: DZ.doc.path || null, path: DZ.path || null, cuadros: DZ.doc.scene.lastFrame() };
  })()`);
  if (montaje.error) mal(montaje.error, montaje);
  if (!montaje.docPath)
    mal("el documento nuevo no tiene ruta propia: sin eso no hay dónde exportar", montaje);

  for (const salida of ["png", "gif", "sheet", "premiere"]) {
    await ev(`(async()=>{ try { await dzDoExportDoc(${JSON.stringify(salida)}); } catch (e) { window.__falla = String(e && e.message || e); } })()`);
    await w(1400);
  }
  const resultado = await ev(`({ salidas: window.__salidas || [], falla: window.__falla || null,
    aviso: document.querySelector('#dzStatus')?.textContent || "" })`);

  if (resultado.falla)
    mal("exportar desde un documento nuevo tira una excepción", resultado);
  if (!resultado.salidas.length)
    mal("exportar desde un documento nuevo no llegó al puente: no sale nada del programa", resultado);
  const sinRuta = resultado.salidas.filter(s => !s.ruta);
  if (sinRuta.length)
    mal("se le manda al puente una ruta VACÍA: `Path(None)` revienta en Python y el " +
      "trabajo no sale de LOW. Un .low no tiene DZ.path —tiene DZ.doc.path—, y es el " +
      "flujo por defecto del programa", { sinRuta, salidas: resultado.salidas, montaje });
  const raras = resultado.salidas.filter(s => !/\.(low|svg)$/i.test(s.ruta));
  if (raras.length)
    mal("la ruta que recibe el puente no es la del documento", { raras, montaje });

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));

  console.log("E2E exportar documento nuevo OK " + JSON.stringify({
    salidas: resultado.salidas.map(s => s.cual + (s.kind ? ":" + s.kind : "")),
    ruta: resultado.salidas[0]?.ruta?.split(/[\\/]/).pop()
  }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
