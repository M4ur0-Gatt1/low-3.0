/* EL PAPEL CEBOLLA TIENE QUE MOSTRAR ALGO EN CUT-OUT.
   CDP :9223 + mock :8791.

   POR QUE EXISTE. MEDIDO en v4.50.0, con un personaje vinculado, sostenido y
   con poses distintas en los cuadros 1 y 8: parado en el 8 y con el papel
   cebolla encendido, los fantasmas dibujados eran CERO.

   La causa es sana y por eso cuesta verla: la cebolla compara DIBUJOS, y en
   cut-out todos los cuadros comparten el mismo —es un sostenido—. Lo que
   cambia son las POSES, y de eso no sabia nada. El animador enciende el papel
   cebolla, no ve nada, y concluye que esta roto.

   LO QUE SE CUIDA:

   1. Con un personaje sostenido y poses distintas, APARECEN fantasmas.
   2. El fantasma muestra OTRA pose, no una copia del actual. Un fantasma
      encima del dibujo, identico, es peor que ninguno: ensucia y no informa.
   3. Los fantasmas NO TIENEN `id`. El rig busca sus piezas con
      `svg.querySelector("#id")` sin acotar y el fantasma se inserta como
      PRIMER hijo: con los id puestos, posar movería al fantasma.
   4. Y se comprueba de verdad: con la cebolla encendida, posar sigue moviendo
      AL PERSONAJE.
   5. No capturan el puntero.
   6. Sin diferencia de pose no se agregan fantasmas: de los dibujos distintos
      ya se ocupa la cebolla de siempre y duplicarlos seria peor que faltar.
*/
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const t0 = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(t0.webSocketDebuggerUrl);
  await new Promise((ok, f) => { ws.onopen = ok; ws.onerror = f; });
  let id = 0; const pend = new Map(); const errores = [];
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.method === "Runtime.exceptionThrown") errores.push(String(m.params.exceptionDetails.exception?.description || "").split("\n")[0]);
    if (!m.id || !pend.has(m.id)) return;
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
  const trazo = async (x1, y1, x2, y2, pasos = 10) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", clickCount: 1 });
    for (let i = 1; i <= pasos; i++)
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", button: "left", buttons: 1,
        x: Math.round(x1 + (x2 - x1) * i / pasos), y: Math.round(y1 + (y2 - y1) * i / pasos) });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", clickCount: 1 });
    await w(240);
  };

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 140; i++) {
    if (await ev('typeof openDesign==="function" && !!api').catch(() => false)) break; await w(400);
  }
  await ev(`(async()=>{ const wait = ms => new Promise(x=>setTimeout(x,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit();
    if (typeof closeL3d==="function") closeL3d(); await wait(900);
    if (!DZ.anim && typeof dzAnimToggle==="function") { await dzAnimToggle(); await wait(700); }
    const hoja = document.querySelector("#dzCanvas > svg");
    [...hoja.querySelectorAll("path,rect,circle,ellipse,polygon")].forEach(n => {
      if (!n.closest(".dz-onion,.dz-penui,#dzRigOverlay") && n.getAttribute("data-paper")===null) n.remove(); });
    await wait(300); dzSetTool("pencil"); await wait(300); return true; })()`);
  for (const [a, b, c, d] of [[680,210,680,340],[680,240,570,290],[680,240,790,290],[680,340,620,470]])
    await trazo(a, b, c, d, 10);
  await w(500);

  const r = await ev(`(async()=>{
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    if (!DZ.rigMode && typeof dzRigToggle === "function") { dzRigToggle(); await wait(800); }
    const s = document.querySelector("#rigLibrary"); if (s) s.value = "human_simple";
    document.querySelector("#rigLibraryAdd").click(); await wait(1200);
    document.querySelector("#rigRepartir").click(); await wait(1400);
    const n = Object.values(DZ.doc.scene.rig.nodes).filter(x => x.elementId)[0];
    if (!n) return { sinVinculos: true };
    /* Sostener DESPUES de tener una clave lejana: «hasta donde» se calcula
       con la clave mas lejana, asi que sostener con el rig vacio no extiende
       nada y el cuadro de destino queda sin personaje. */
    dzRigSetKey(n.id, 12, { x:0, y:0, r:0, sx:1, sy:1 });
    if (typeof dzSostenerPersonaje === "function") dzSostenerPersonaje();
    await wait(900);

    const hoja = () => document.querySelector("#dzCanvas > svg");
    const vivo = () => [...hoja().querySelectorAll('[id="' + n.elementId + '"]')]
      .find(e => !e.closest("g.dz-onion")) || null;
    const caja = (el) => { if (!el) return null; const b = el.getBoundingClientRect();
      return [Math.round(b.x), Math.round(b.y)]; };
    const dist = (a, b) => (a && b) ? +Math.hypot(b[0]-a[0], b[1]-a[1]).toFixed(1) : null;

    // poses BIEN distintas entre el 1 y el 8
    dzRigSetKey(n.id, 1, { x:0, y:0, r:0,  sx:1, sy:1 });
    dzRigSetKey(n.id, 8, { x:0, y:0, r:70, sx:1, sy:1 });
    await wait(500);

    // 6. control: cebolla APAGADA, no puede haber fantasmas de pose
    DZ.onionOn = false;
    if (typeof dzOnionRender === "function") dzOnionRender();
    dzGoFrame(7); await wait(700);
    const apagada = hoja().querySelectorAll("g.dz-onion-pose").length;

    DZ.onionOn = true;
    if (typeof dzOnionCfgSet === "function") dzOnionCfgSet({ enabled: true, before: 2, after: 0 });
    if (typeof dzOnionRender === "function") dzOnionRender();
    await wait(800);

    const g = hoja().querySelectorAll("g.dz-onion-pose");
    const conId = [...g].reduce((s, x) => s + x.querySelectorAll("[id]").length, 0);
    const capturan = [...g].filter(x => x.getAttribute("pointer-events") !== "none").length;
    /* LA MISMA PIEZA, viva y fantasmeada. Comparar la caja del GRUPO fantasma
       contra una pieza no prueba nada —difieren igual, el grupo es todo el
       personaje— y dejaba pasar un fantasma pintado con la pose ACTUAL, que
       es una copia inutil. Como al fantasma se le sacan los id, la pieza se
       ubica por su POSICION entre los dibujables, que el clon conserva. */
    const SEL = "path,rect,circle,ellipse,polygon,line,polyline";
    const dibujables = (raiz) => [...raiz.querySelectorAll(SEL)]
      .filter(e => !e.closest(".dz-penui") && e.getAttribute("data-paper") === null);
    const vivos = dibujables(hoja()).filter(e => !e.closest("g.dz-onion"));
    const indice = vivos.indexOf(vivo());
    let separacion = null, indiceUsado = indice;
    if (g.length && indice >= 0) {
      const enElFantasma = dibujables(g[0])[indice];
      const a = vivo().getBoundingClientRect();
      if (enElFantasma) { const b = enElFantasma.getBoundingClientRect();
        separacion = +Math.hypot(b.x - a.x, b.y - a.y).toFixed(1); }
    }
    // 4. con la cebolla puesta, posar sigue moviendo AL PERSONAJE
    const antes = caja(vivo());
    dzRigSetKey(n.id, 8, { x:0, y:0, r:20, sx:1, sy:1 });
    await wait(800);
    const despues = caja(vivo());

    return { apagada, fantasmas: g.length, conId, capturan, separacion, indiceUsado,
      elPersonajeSeMovio: dist(antes, despues),
      aQuienEncuentraElRig: (() => { const el = hoja().querySelector('[id="' + n.elementId + '"]');
        return el ? (el.closest("g.dz-onion") ? "AL FANTASMA" : "a la pieza viva") : "a nadie"; })() };
  })()`);

  if (r.sinVinculos) mal("no se pudo montar un rig vinculado para medir", r);
  // 6. control
  if (r.apagada) mal("con la cebolla apagada igual aparecieron fantasmas de pose", r);
  // 1. aparecen
  if (!r.fantasmas)
    mal("con un personaje cut-out sostenido y poses distintas, el papel cebolla no muestra " +
        "NADA: el animador lo enciende y concluye que está roto", r);
  // 2. muestran otra pose
  if (r.indiceUsado < 0) mal("no se pudo ubicar la pieza dentro del fantasma para compararlas", r);
  if (!(r.separacion > 2))
    mal("la misma pieza está en el mismo lugar en el fantasma y en el dibujo actual: " +
        "el fantasma repite la pose de ahora en vez de mostrar la anterior, así que " +
        "ensucia y no informa", r);
  // 3. sin id
  if (r.conId)
    mal("los fantasmas conservan " + r.conId + " id: el rig los encontraría antes que a las " +
        "piezas vivas y posaría al fantasma", r);
  // 5. no capturan el puntero
  if (r.capturan) mal("hay fantasmas que capturan el puntero", r);
  // 4. y el rig sigue moviendo al personaje
  if (r.aQuienEncuentraElRig !== "a la pieza viva")
    mal("con la cebolla puesta el rig encuentra «" + r.aQuienEncuentraElRig + "»", r);
  if (!(r.elPersonajeSeMovio > 1))
    mal("con la cebolla puesta, posar dejó de mover al personaje", r);

  const crasheos = errores.filter((e) => /TypeError|ReferenceError/.test(e));
  if (crasheos.length) mal("la cebolla de poses tiró errores", crasheos.slice(0, 3));

  console.log("E2E cebolla de poses OK " + JSON.stringify(r));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
