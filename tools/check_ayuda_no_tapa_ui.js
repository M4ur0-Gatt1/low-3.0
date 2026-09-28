/* EL GLOBO DE AYUDA NO PUEDE TAPAR EL BOTON QUE EXPLICA.
   CDP :9223 + mock :8791.

   POR QUE EXISTE. Reportado dos veces mirando la pantalla. Primero «aparece
   doble cartel» —el globo propio y el tooltip nativo del navegador, los dos
   leyendo el mismo `title`— y despues, ya con uno solo, «el tooltip sigue
   siendo incomodisimo, TAPA EL BOTON».

   Lo segundo era de posicion: el globo se ponia SIEMPRE a la derecha y, si no
   entraba, se lo empujaba adentro de la ventana con un `min`. Para los botones
   del panel de la derecha eso significa aterrizar justo encima del boton y de
   sus vecinos — que es donde uno esta mirando.

   Lo que se cuida, para CADA boton con ayuda que este cerca de un borde:

   1. Aparece UN solo cartel (no vuelve el nativo).
   2. El globo NO se superpone con el boton que explica.
   3. El globo queda DENTRO de la ventana.

   Los botones de la derecha son los que importan: los del medio siempre
   entraron bien y por eso el defecto sobrevivio tanto. */
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
    if (await ev('typeof openDesign==="function" && !!api').catch(() => false)) break;
    await w(400);
  }

  await ev(`(async()=>{
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit();
    if (typeof closeL3d==="function") closeL3d();
    await wait(500);
    // el panel del rig es donde se vio el defecto: vive pegado al borde derecho
    if (!DZ.anim && typeof dzAnimToggle==="function") await dzAnimToggle();
    await wait(400);
    if (!DZ.rigMode && typeof dzRigToggle==="function") dzRigToggle();
    await wait(400);
    return true;
  })()`);

  /* Se eligen los botones con ayuda MAS PEGADOS a cada borde: son los que el
     posicionamiento viejo empujaba encima de si mismos. */
  const candidatos = await ev(`(()=>{
    const vistos = [...document.querySelectorAll('#designView button[title], #designView [data-tool][title], #dzToolsDrawer button[title]')]
      .filter(b => { const r = b.getBoundingClientRect(); return r.width > 4 && r.height > 4; });
    const conCaja = vistos.map((b, i) => { const r = b.getBoundingClientRect();
      return { i, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
               distDerecha: Math.round(innerWidth - r.right), distIzq: Math.round(r.left) }; });
    conCaja.sort((a, b) => a.distDerecha - b.distDerecha);
    const derecha = conCaja.slice(0, 4);
    const izquierda = [...conCaja].sort((a, b) => a.distIzq - b.distIzq).slice(0, 3);
    return { total: conCaja.length, elegidos: [...derecha, ...izquierda].map(c => c.i) };
  })()`);
  if (!candidatos.total) mal("no hay botones con ayuda para medir", candidatos);

  const medidos = [];
  for (const indice of candidatos.elegidos) {
    /* Se MARCA el boton y despues se mide ESE. Identificarlo por indice no
       sirve: los paneles se redibujan entre el hover y la medicion, y el que
       queda en esa posicion ya es otro. (Me paso: la primera version acuso un
       solapamiento que era de un boton distinto.) */
    const caja = await ev(`(()=>{
      document.querySelectorAll('[data-probando]').forEach(n => delete n.dataset.probando);
      const b = [...document.querySelectorAll('#designView button[title], #designView [data-tool][title], #dzToolsDrawer button[title]')]
        .filter(x => { const r = x.getBoundingClientRect(); return r.width > 4 && r.height > 4; })[${indice}];
      if (!b) return null; b.dataset.probando = "1"; const r = b.getBoundingClientRect();
      return { x: r.left + r.width/2, y: r.top + r.height/2 }; })()`);
    if (!caja) continue;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: Math.round(caja.x), y: Math.round(caja.y) });
    await w(420);                                    // el globo tarda 180 ms
    const m = await ev(`(()=>{
      const g = document.querySelector('.dz-tool-tooltip');
      const b = document.querySelector('[data-probando]');
      // lo que evita el cartel doble no es la marca: es que el boton NO
      // tenga title mientras el globo esta, porque el nativo sale de ahi
      const guardado = [...document.querySelectorAll('[data-titulo-ayuda]')].length;
      if (!g || !b) return { hayGlobo: !!g, guardado };
      const rg = g.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const pisa = !(rg.right <= rb.left || rg.left >= rb.right || rg.bottom <= rb.top || rg.top >= rb.bottom);
      return { hayGlobo: true, guardado, pisa, conTitleNativo: b.hasAttribute('title'),
               dentro: rg.left >= 0 && rg.top >= 0 && rg.right <= innerWidth && rg.bottom <= innerHeight,
               nativos: [...document.querySelectorAll('#designView button[title]')].length,
               globo: { x: Math.round(rg.x), y: Math.round(rg.y), w: Math.round(rg.width), h: Math.round(rg.height) },
               boton: { x: Math.round(rb.x), y: Math.round(rb.y), w: Math.round(rb.width), h: Math.round(rb.height) } };
    })()`);
    medidos.push({ indice, ...m });
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 5, y: 5 });
    await w(200);
  }

  const conGlobo = medidos.filter((m) => m.hayGlobo);
  if (conGlobo.length < 3) mal("casi ningún botón mostró el globo: no se llega a medir", medidos);
  const tapados = conGlobo.filter((m) => m.pisa);
  if (tapados.length) mal("el globo TAPA el botón que explica", tapados.slice(0, 3));
  const afuera = conGlobo.filter((m) => !m.dentro);
  if (afuera.length) mal("el globo se sale de la ventana", afuera.slice(0, 3));
  // el cartel doble: mientras el globo está, ese botón no conserva su `title`
  const conTitulo = conGlobo.filter((m) => m.conTitleNativo);
  if (conTitulo.length) mal("el botón conservó su title con el globo puesto: el navegador dibuja " +
    "su tooltip nativo encima y vuelve el cartel doble", conTitulo.slice(0, 2));

  console.log("E2E la ayuda no tapa el botón OK " + JSON.stringify({
    medidos: conGlobo.length, tapados: 0, ejemplo: conGlobo[0] }));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
