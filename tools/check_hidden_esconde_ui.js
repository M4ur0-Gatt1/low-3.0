/* LO QUE ESTA `hidden` TIENE QUE ESTAR ESCONDIDO.  CDP :9223 + mock :8791.
 *
 * POR QUE EXISTE. Auditando botones mudos aparecio `#tlCamKey` —«dejar clave
 * de camara»—: el codigo lo apaga con `hidden = !DZ.camMode`, pero MEDIDO en
 * pantalla seguia ocupando 29x29 y se podia APRETAR. Apretarlo no hacia nada,
 * porque el modo camara estaba apagado. Un boton que se ve, se aprieta y no
 * hace nada es justo el defecto de uso que se estaba buscando.
 *
 * LA CAUSA ES DE LA HOJA DE ESTILOS, no del boton. El navegador esconde lo
 * que lleva `hidden` con una regla suya, pero cualquier regla nuestra que
 * fije `display` con una clase le gana por especificidad: `.ibtn { display:
 * inline-flex }` alcanza. Por eso app.css traia CUARENTA reglas sueltas
 * `.loquesea[hidden] { display:none }`, una por cada vez que el defecto
 * aparecio. Ahora hay una sola regla al final del archivo.
 *
 * MEDIDO ANTES DEL ARREGLO, recorriendo los siete espacios de trabajo:
 *
 *   #tlCamKey              29 x 29   (boton, apretable, no hacia nada)
 *   div.dz-tlg-head      1366 x 21
 *   #dzPalette            220 x 794  (el panel entero, en Limpieza)
 *   div.dz-tools          74 x 618   (la columna de herramientas, en 3D)
 *
 * Despues del arreglo: cero.  Este guardia recorre los mismos espacios y no
 * deja pasar ninguna fuga nueva — ni de un `hidden` que no esconde, ni de una
 * clase futura que vuelva a pisar el display.
 *
 * Uso: node tools/check_hidden_esconde_ui.js [endpoint] [url]
 */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map();
  ws.onmessage = event => { const m = JSON.parse(event.data);
    if (!m.id || !pending.has(m.id)) return; const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 60000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate",
    { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __error: String(r.exceptionDetails.exception?.description || "").split("\n")[0] };
    return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    if (await ev('typeof openDesign==="function" && !!api').catch(() => false)) break;
    await w(400);
  }
  await ev(`(async()=>{
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit();
    if (typeof closeL3d==="function") closeL3d();
    await wait(700);
    // prender lo que trae paneles: si nada se muestra, nada hay para esconder
    if (!DZ.anim && typeof dzAnimToggle==="function") { await dzAnimToggle(); await wait(500); }
    if (typeof dzRigToggle==="function" && !DZ.rigMode) { dzRigToggle(); await wait(400); dzRigToggle(); await wait(400); }
    return true; })()`);

  /** Todo lo que lleva `hidden` y sin embargo ocupa lugar en pantalla. */
  const MIRAR = `(() => [...document.querySelectorAll("[hidden]")]
    .map(n => { const r = n.getBoundingClientRect();
      const cs = getComputedStyle(n);
      return { sel: n.id ? "#" + n.id : (n.tagName.toLowerCase() + "." + (n.className || "").toString().trim().split(/\\s+/).slice(0,2).join(".")),
               ancho: Math.round(r.width), alto: Math.round(r.height),
               display: cs.display, clases: (n.className || "").toString().slice(0, 60),
               ayuda: (n.getAttribute("title") || "").slice(0, 50),
               apretable: n.tagName === "BUTTON" || n.tagName === "A" || !!n.onclick }; })
    .filter(x => x.display !== "none" && x.ancho > 2 && x.alto > 2))()`;

  const espacios = await ev(`(() => [...document.querySelectorAll("#dzWorkspaces .dz-ws-tab")]
      .map(b => (b.textContent || "").trim()).filter(Boolean))()`);

  const porClave = new Map();
  for (const espacio of (Array.isArray(espacios) && espacios.length ? espacios : ["Dibujo"])) {
    await ev(`(async () => { const wait = ms => new Promise(x=>setTimeout(x,ms));
      const t = [...document.querySelectorAll("#dzWorkspaces .dz-ws-tab")]
        .find(b => (b.textContent || "").trim() === ${JSON.stringify(espacio)});
      if (t) { t.click(); await wait(500); } return true; })()`);
    const fugas = await ev(MIRAR);
    if (!Array.isArray(fugas)) continue;
    for (const f of fugas) if (!porClave.has(f.sel)) porClave.set(f.sel, { espacio, ...f });
  }

  const todas = [...porClave.values()];
  const apretables = todas.filter((f) => f.apretable);

  if (apretables.length) {
    console.error("REGRESIÓN: hay botones apagados por código que SE VEN y SE PUEDEN APRETAR " +
      "(apretarlos no hace nada, porque el modo que los usa está apagado) :: " +
      JSON.stringify(apretables, null, 1));
    process.exit(1);
  }
  if (todas.length) {
    console.error("REGRESIÓN: hay elementos con `hidden` que igual ocupan la pantalla :: " +
      JSON.stringify(todas, null, 1));
    process.exit(1);
  }

  console.log("E2E `hidden` esconde OK " + JSON.stringify({ espacios: espacios.length, fugas: 0 }));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
