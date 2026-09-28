/* UN VENDOR QUE NO CARGO NO PUEDE DEJAR LA APLICACION A MEDIO ARMAR.
   CDP :9223 + mock :8791.

   POR QUE EXISTE ESTE RECORRIDO. Salio de un fallo real, no de imaginar un
   caso. En la maquina de Mauro, con la v4.45.0 recien instalada:

       [js] init: CodeMirror is not defined
       [fallo] fallo-20260919-210512.json

   y lo que el reporto fue otra cosa: «el sistema de seleccion se rompio, no
   selecciona bien, arrastrando no selecciona nada, y la pantalla de inicio se
   queda clavada». Tres sintomas, una causa: `init()` es UNA funcion y
   `CodeMirror(...)` esta en su TERCERA linea, asi que al tirar ahi no corrio
   NADA de lo que viene despues —incluido el cableado de seleccion—.

   Al relanzar arranco bien, o sea que la carga del vendor falla de a ratos.

   Este recorrido REPRODUCE la falla a proposito —se borra `CodeMirror` y se
   bloquea su pedido— y exige que, aun asi:

   1. `init` TERMINE (el «init ok» llega al puente);
   2. la seleccion quede cableada y un arrastre seleccione de verdad;
   3. la aplicacion lo DIGA, en vez de quedarse muda a medio armar.

   Las tres importan juntas: una aplicacion que sigue pero no avisa deja al
   usuario buscando el defecto donde no esta, que es exactamente lo que paso. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map(), errores = [];
  ws.onmessage = event => { const m = JSON.parse(event.data);
    if (m.method === "Runtime.exceptionThrown")
      errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (!m.id || !pending.has(m.id)) return; const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 120000);
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

  // SE BLOQUEA EL VENDOR: asi se reproduce el arranque que fallo.
  await send("Network.setBlockedURLs", { urls: ["*codemirror.min.js*"] });
  await send("Page.navigate", { url: pageUrl });

  for (let i = 0; i < 90; i++) {
    if (await ev('typeof openDesign==="function" && !!api').catch(() => false)) break;
    await w(400);
  }

  const estado = await ev(`(async()=>{
    const wait = ms => new Promise(r=>setTimeout(r,ms));
    await wait(900);
    return { sinVendor: typeof window.__sinCodeMirror !== "undefined" && !!window.__sinCodeMirror,
             hayEditorInerte: typeof CodeMirror === "function",
             avisa: !!(document.querySelector("#cmwrap") &&
               /no cargó|no cargo/i.test(document.querySelector("#cmwrap").textContent || "")),
             // lo que prueba que init TERMINO: se cableo lo de mas abajo
             herramientas: typeof dzSetTool === "function",
             lienzoListo: typeof openDesign === "function",
             // reportErr deja aca lo que tiro init: es la marca de que se corto
             initTiro: (window.__errs || []).filter((e) => /^init:/.test(String(e))),
             vendorPresente: typeof window.__sinCodeMirror === "undefined" };
  })()`);
  // Se distinguen los dos desenlaces, que NO son lo mismo: que el vendor haya
  // cargado igual (no se reprodujo nada) o que init se haya cortado (volvio el
  // defecto). Confundirlos manda a buscar donde no es.
  if (estado.initTiro.length)
    mal("init se cortó: volvió el defecto que este recorrido cuida", estado);
  if (estado.vendorPresente && !estado.sinVendor)
    mal("no se llegó a reproducir la falla: el vendor cargó igual", estado);
  if (!estado.hayEditorInerte) mal("sin vendor no quedó ningún editor usable", estado);
  if (!estado.avisa) mal("la aplicación no avisa que el editor no cargó: queda muda", estado);

  // 2. LA SELECCION TIENE QUE ESTAR VIVA
  const sel = await ev(`(async()=>{
    const wait = ms => new Promise(r=>setTimeout(r,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg");
    if (typeof dzDocInit==="function") await dzDocInit();
    if (typeof closeL3d==="function") closeL3d();
    await wait(600);
    dzSetTool("select"); await wait(200);
    const svg = document.querySelector("#dzCanvas > svg");
    if (!svg) return { error: "sin lienzo" };
    const r = svg.getBoundingClientRect();
    return { caja: { x: Math.round(r.x), y: Math.round(r.y),
                     w: Math.round(r.width), h: Math.round(r.height) },
             pintados: svg.querySelectorAll("path,rect,circle,ellipse,polygon,g[data-low]").length };
  })()`);
  if (sel.error) mal("no se pudo abrir un diseño sin el vendor", sel);

  const c = sel.caja;
  const desde = { x: c.x + 6, y: c.y + 6 }, hasta = { x: c.x + c.w - 6, y: c.y + c.h - 6 };
  const raton = (type, p, buttons, button) => send("Input.dispatchMouseEvent",
    { type, x: Math.round(p.x), y: Math.round(p.y), button: button || "none",
      buttons: buttons || 0, clickCount: 1 });
  await raton("mouseMoved", desde, 0);
  await raton("mousePressed", desde, 1, "left");
  for (let i = 1; i <= 10; i++)
    await raton("mouseMoved", { x: desde.x + (hasta.x - desde.x) * i / 10,
                                y: desde.y + (hasta.y - desde.y) * i / 10 }, 1);
  await raton("mouseReleased", hasta, 0, "left");
  await w(500);
  const tras = await ev('({ multi: (DZ.multi||[]).length })');
  if (!tras.multi) mal("sin el vendor, arrastrar no selecciona nada: init quedó a medias",
    { ...estado, ...sel, ...tras });

  await send("Network.setBlockedURLs", { urls: [] });
  console.log("E2E arranque sin vendor OK " + JSON.stringify({ ...estado, seleccionados: tras.multi,
    pintados: sel.pintados, erroresNoAtrapados: errores.length }));
  if (errores.length) console.log("  errores sueltos: " +
    JSON.stringify([...new Set(errores.map(e => String(e).split(String.fromCharCode(10))[0]))].slice(0, 6)));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
