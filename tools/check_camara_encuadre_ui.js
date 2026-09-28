/* EL ENCUADRE DE CAMARA NO PUEDE COMERSE EL DIBUJO.
   CDP :9223 + mock :8791.

   POR QUE EXISTE ESTE RECORRIDO. Salio de arreglar una prueba ajena: midiendo
   por que la bomba de grosor no agarraba un trazo, aparecio que la UI flotante
   del lienzo se lleva el puntero. El caso peor es el encuadre de camara, que es
   un div TRANSPARENTE de 1011x568 px con `cursor:move` y sin `pointer-events`
   propio: tapa practicamente toda la mesa.

   Lo medido antes del arreglo, con el encuadre puesto y el LAPIZ elegido:
   ningun trazo entraba —el dibujo no aparecia— y en vez de dibujar la camara
   SE MOVIA, de (68,191) a (132,215). Y cada cambio de camara deja clave en el
   cuadro, asi que intentar dibujar corria el plano de la escena y lo dejaba
   anotado en la linea de tiempo. Nada de eso avisaba nada.

   El encuadre SI tiene que agarrarse mientras la camara es la herramienta
   activa: asi se mueve el plano, y el aviso de la app lo dice. La regla es
   entonces «el encuadre agarra el puntero solo en modo camara», y eso es lo
   que este recorrido cuida por los dos lados:

   1. EN MODO CAMARA, arrastrar el encuadre MUEVE la camara. Si esto se rompe,
      la camara quedo inmovil y no hay manera de encuadrar.
   2. CON OTRA HERRAMIENTA, un trazo dentro del encuadre DIBUJA y la camara NO
      se mueve. Si esto se rompe, volvio el defecto.

   Las dos mitades importan: apagar el encuadre entero pasaria (2) y rompe (1),
   y por eso se prueban juntas. */
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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 120000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate",
    { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  /** Arrastre con mouse de verdad. El `mouseMoved` previo no es decorativo:
   *  sin el, CDP entrega el `mousePressed` sin que el destino se haya enterado
   *  del puntero y el gesto no arranca. */
  const arrastrar = async (desde, hasta, pasos = 8) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: desde.x, y: desde.y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: desde.x, y: desde.y, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= pasos; i++)
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", buttons: 1,
        x: Math.round(desde.x + (hasta.x - desde.x) * i / pasos),
        y: Math.round(desde.y + (hasta.y - desde.y) * i / pasos) });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: hasta.x, y: hasta.y, button: "left", buttons: 0, clickCount: 1 });
    await w(500);
  };
  const encuadre = () => ev(`(()=>{const n=document.querySelector("#dzCam");
    if(!n||n.hidden) return null; const r=n.getBoundingClientRect();
    return {x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height)};})()`);
  const trazos = () => ev(`document.querySelectorAll('#dzCanvas > svg path,#dzCanvas > svg polyline,#dzCanvas > svg g[data-low="brush"]').length`);

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  // Fijar el visor: el tamaño decide donde cae el encuadre, y un recorrido que
  // no lo fija acusa regresiones falsas segun la ventana de quien lo corra.
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('typeof dzCamToggle==="function" && typeof dzSetTool==="function" && !!api').catch(() => false);
    if (listo === true) break;
    await w(400);
  }

  const montaje = await ev(`(async()=>{
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg");
    if (typeof dzDocInit === "function") await dzDocInit();
    if (typeof closeL3d === "function") closeL3d();
    await new Promise(r=>setTimeout(r,500));
    return { hojas: !!document.querySelector("#dzCanvas > svg"), camara: !!document.querySelector("#dzCam") };
  })()`);
  if (!montaje.hojas || !montaje.camara) mal("el montaje no dejó una hoja y una cámara", montaje);

  // ── 1. EN MODO CÁMARA el encuadre se agarra y la cámara se mueve
  await ev('(()=>{ if(!DZ.camMode) dzCamToggle(); return true; })()');
  await w(500);
  const modo = await ev('({tool:DZ.tool, camMode:!!DZ.camMode, atributo:document.querySelector("#dzCanvas").dataset.tool})');
  const antesCam = await encuadre();
  if (!antesCam) mal("con la cámara encendida el encuadre no se ve", { modo });
  if (modo.atributo !== "camera")
    mal("el modo cámara no deja dicho en #dzCanvas cuál es la herramienta, y el CSS " +
      "decide con ese atributo si el encuadre agarra el puntero: la cámara queda inmóvil", modo);

  const centro = { x: antesCam.x + Math.round(antesCam.w / 2), y: antesCam.y + Math.round(antesCam.h / 2) };
  await arrastrar(centro, { x: centro.x + 70, y: centro.y + 30 });
  const movida = await encuadre();
  if (!movida || (Math.abs(movida.x - antesCam.x) < 12 && Math.abs(movida.y - antesCam.y) < 12))
    mal("en modo cámara, arrastrar el encuadre NO movió la cámara: no hay manera de encuadrar",
      { antes: antesCam, despues: movida });

  // ── 2. CON EL LÁPIZ, el mismo punto dibuja y la cámara se queda quieta
  await ev('(()=>{ dzSetTool("pencil"); return true; })()');
  await w(400);
  const conLapiz = await ev('({tool:DZ.tool, camMode:!!DZ.camMode, visible:!document.querySelector("#dzCam").hidden})');
  if (!conLapiz.visible)
    mal("elegir el lápiz escondió el encuadre: se pierde la referencia del plano mientras se dibuja", conLapiz);
  const encuadreAntes = await encuadre();
  const trazosAntes = await trazos();
  const p = { x: encuadreAntes.x + Math.round(encuadreAntes.w / 2), y: encuadreAntes.y + Math.round(encuadreAntes.h / 2) };
  await arrastrar(p, { x: p.x + 80, y: p.y + 40 });
  const trazosDespues = await trazos();
  const encuadreDespues = await encuadre();

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }

  if (trazosDespues <= trazosAntes)
    mal("con el encuadre de cámara a la vista NO SE PUEDE DIBUJAR dentro del cuadro: el marco " +
      "transparente se lleva el trazo", { trazosAntes, trazosDespues, conLapiz });
  if (Math.abs(encuadreDespues.x - encuadreAntes.x) > 4 || Math.abs(encuadreDespues.y - encuadreAntes.y) > 4)
    mal("dibujar movió la CÁMARA en vez de dejar el trazo: corre el plano de la escena y deja " +
      "clave en el cuadro sin que nadie lo pida",
      { antes: encuadreAntes, despues: encuadreDespues });

  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));

  console.log("E2E cámara/encuadre OK " + JSON.stringify({
    modoCamara: { mueve: { de: antesCam.x + "," + antesCam.y, a: movida.x + "," + movida.y } },
    conLapiz: { dibuja: trazosAntes + "→" + trazosDespues, camaraQuieta: true },
  }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
