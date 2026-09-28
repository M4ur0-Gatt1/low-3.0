/* PONER EL ESQUELETO DE EJEMPLO NO PUEDE BORRAR EL DIBUJO SIN PREGUNTAR.
   CDP :9223 + mock :8791.

   POR QUE EXISTE. Reportado perdiendo trabajo: «al colocar el esqueleto entero
   borra el personaje, eso no debe pasar».

   Medido: `dzRigEjemplo()` mete el muñeco con `dzCanvasSet`, que PISA el
   contenido del lienzo, y la confirmacion solo aparecia si el documento estaba
   SUCIO o tenia mas de un cuadro. Un personaje ya guardado, de un solo cuadro,
   se reemplazaba sin una sola pregunta.

   Lo que se cuida:

   1. Con algo dibujado en la mesa, SE PREGUNTA antes de reemplazar.
   2. Cancelar NO toca el dibujo: sigue ahi, entero.
   3. Con la mesa vacia no molesta con una pregunta que no hace falta.

   Las tres juntas: preguntar siempre seria un fastidio, y no preguntar nunca
   cuesta el dibujo de alguien. */
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
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    if (await ev('typeof dzRigEjemplo==="function" && typeof openDesign==="function" && !!api').catch(() => false)) break;
    await w(400);
  }

  const r = await ev(`(async()=>{
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit();
    if (typeof closeL3d==="function") closeL3d();
    await wait(500);
    const hoja = () => document.querySelector("#dzCanvas > svg");
    const formas = () => LOW.panels.mesaTieneDibujo.formasEnLaMesa();
    const salida = { detector: typeof dzHayDibujoEnLaMesa === "function" };

    // 1. con dibujo en la mesa TIENE que preguntar
    salida.dibujadoAntes = formas();
    salida.detectaDibujo = !!dzHayDibujoEnLaMesa();
    DZ.dirty = false;                    // como un personaje ya GUARDADO
    const antesHTML = hoja().innerHTML;
    dzRigEjemplo();                      // sin await: queda esperando el modal
    await wait(700);
    const modal = document.querySelector("#modal");
    salida.pregunta = !!(modal && !modal.hidden && /[Rr]eemplaza/.test(modal.textContent || ""));
    salida.avisaQueSeVa = !!(modal && /aunque esté guardado|se va/i.test(modal.textContent || ""));

    // 2. cancelar no toca nada
    const cancelar = document.querySelector("#dzEjX");
    if (cancelar) cancelar.click();
    await wait(500);
    salida.trasCancelar = { formas: formas(), intacto: hoja().innerHTML === antesHTML };

    /* 3. con la mesa vacia no molesta, NI SIQUIERA con el alambre del rig
          encima. El overlay del rig dibuja lineas y circulos dentro del
          lienzo: contarlos como dibujo haria preguntar por un lienzo vacio,
          y esa pregunta de mas ensena a apretar «si» sin leer. */
    dzCanvasSet("");
    DZ.dirty = false;
    await wait(300);
    salida.vaciaDetecta = !!dzHayDibujoEnLaMesa();
    /* El papel cebolla SI vive adentro de la hoja (g.dz-onion), a diferencia
       del alambre del rig, que es un svg hermano y nunca se contaria. Por eso
       el fantasma es el caso que de verdad ejercita el filtro. */
    const fantasma = document.createElementNS("http://www.w3.org/2000/svg", "g");
    fantasma.setAttribute("class", "dz-onion");
    fantasma.innerHTML = '<path d="M10 10 L90 90"/><path d="M20 80 L80 20"/>';
    hoja().appendChild(fantasma);
    await wait(200);
    salida.formasDelFantasma = fantasma.querySelectorAll("path").length;
    salida.vaciaConFantasma = !!dzHayDibujoEnLaMesa();
    fantasma.remove();
    return salida;
  })()`);

  if (!r.detector) mal("no existe el detector de dibujo en la mesa", r);
  if (!r.dibujadoAntes) mal("el montaje no dejó nada dibujado: no se mide nada", r);
  if (!r.detectaDibujo) mal("no detecta que hay un dibujo en la mesa", r);
  if (!r.pregunta) mal("reemplaza el dibujo SIN preguntar: es el defecto reportado", r);
  if (!r.avisaQueSeVa) mal("pregunta, pero no dice que el dibujo guardado también se va", r);
  if (!r.trasCancelar.intacto || r.trasCancelar.formas !== r.dibujadoAntes)
    mal("cancelar igual tocó el dibujo", r);
  if (r.vaciaDetecta) mal("con la mesa vacía cree que hay dibujo: molestaría con una pregunta de más", r);
  if (!r.formasDelFantasma) mal("no se pudo poner un fantasma de papel cebolla: no se mide el filtro", r);
  if (r.vaciaConFantasma)
    mal("cuenta el papel cebolla como dibujo: preguntaría por un lienzo vacío", r);

  console.log("E2E el ejemplo no borra sin preguntar OK " + JSON.stringify(r));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
