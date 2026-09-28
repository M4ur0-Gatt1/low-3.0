/* «CORTAR PIEZA» NO PUEDE DEJARTE DIBUJANDO.  CDP :9223 + mock :8791.
 *
 * POR QUE EXISTE. Reportado: «la herramienta para cortar piezas dibuja
 * lineas». Y en la captura se veia: una curva negra atravesando al personaje,
 * con la barra de estado diciendo «Seleccioná el dibujo del brazo o la pierna
 * primero».
 *
 * LA CAUSA. Si no hay una pieza elegida, «Cortar pieza» avisa y no arranca —
 * pero deja la herramienta de dibujo activa. Uno igual arrastra sobre el
 * personaje esperando cortarlo, y lo que pasa es que DIBUJA encima. Avisar no
 * alcanza cuando el gesto siguiente hace algo destructivo.
 *
 * LO QUE SE CUIDA:
 *
 * 1. Tras rechazar, la herramienta activa es la de SELECCIÓN — así el mismo
 *    gesto que uno iba a hacer elige la pieza, que es lo que pide el mensaje.
 * 2. Arrastrar despues del rechazo NO agrega trazos al dibujo.
 * 3. Se sigue avisando: quedarse callado seria peor.
 */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const t0 = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(t0.webSocketDebuggerUrl);
  await new Promise((ok, f) => { ws.onopen = ok; ws.onerror = f; });
  let id = 0; const pend = new Map();
  ws.onmessage = e => { const m = JSON.parse(e.data); if (!m.id || !pend.has(m.id)) return;
    const p = pend.get(m.id); pend.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id;
    const to = setTimeout(() => { pend.delete(n); rej(Error("CDP sin respuesta: " + method)); }, 120000);
    pend.set(n, { resolve: v => { clearTimeout(to); res(v); }, reject: e => { clearTimeout(to); rej(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async x => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(String(r.exceptionDetails.exception?.description || "").split("\n")[0]);
    return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const trazo = async (x1, y1, x2, y2, pasos = 12) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", clickCount: 1 });
    for (let i = 1; i <= pasos; i++)
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", button: "left", buttons: 1,
        x: Math.round(x1 + (x2 - x1) * i / pasos), y: Math.round(y1 + (y2 - y1) * i / pasos) });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", clickCount: 1 });
    await w(320);
  };

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 120; i++) {
    if (await ev('typeof openDesign==="function" && !!api').catch(() => false)) break; await w(400);
  }
  await ev(`(async()=>{
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit();
    if (typeof closeL3d==="function") closeL3d();
    await wait(800);
    if (!DZ.anim && typeof dzAnimToggle==="function") { await dzAnimToggle(); await wait(700); }
    if (!DZ.rigMode && typeof dzRigToggle==="function") { dzRigToggle(); await wait(800); }
    return true; })()`);

  const boton = await ev(`(() => { const b = document.getElementById("rigLimbCut");
    if (!b) return null; const r = b.getBoundingClientRect();
    return r.width > 2 ? { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) } : null; })()`);
  if (!boton) mal("no está el botón «Cortar pieza» en el panel del rig", {});

  // el lápiz activo y NADA elegido: la situación exacta del reporte
  const antes = await ev(`(async () => {
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    if (typeof dzDeselect === "function") dzDeselect();
    DZ.sel = null; DZ.multi = [];
    if (typeof dzSetTool === "function") dzSetTool("pencil");
    await wait(400);
    const hoja = document.querySelector("#dzCanvas > svg");
    return { herramienta: DZ.tool, trazos: hoja ? hoja.querySelectorAll("path,polyline,line").length : 0 }; })()`);
  if (antes.herramienta !== "pencil") mal("no se pudo dejar el lápiz activo para la prueba", antes);

  await ev(`document.getElementById("rigLimbCut").click()`);
  await w(600);
  const tras = await ev(`(() => ({ herramienta: DZ.tool,
    estado: (document.querySelector("#dzStatus")||{}).textContent || "" }))()`);

  if (!tras.estado.trim()) mal("rechazó sin decir nada: quedarse callado es peor", tras);
  if (tras.herramienta !== "select")
    mal("«Cortar pieza» rechazó pero dejó activa la herramienta «" + tras.herramienta +
        "»: el siguiente arrastre DIBUJA sobre el personaje en vez de cortarlo", tras);

  // y se comprueba de verdad: arrastrar no puede agregar trazos
  await trazo(520, 260, 840, 380, 14);
  const despues = await ev(`(() => { const hoja = document.querySelector("#dzCanvas > svg");
    return { trazos: hoja ? hoja.querySelectorAll("path,polyline,line").length : 0 }; })()`);
  if (despues.trazos > antes.trazos)
    mal("arrastrar después del rechazo agregó " + (despues.trazos - antes.trazos) +
        " trazo(s) al dibujo", { antes: antes.trazos, despues: despues.trazos });

  console.log("E2E cortar no te deja dibujando OK " + JSON.stringify({ ...tras, trazos: despues.trazos }));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
