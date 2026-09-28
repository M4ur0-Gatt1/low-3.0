/* EL FLUJO DEL ESQUELETO: que se pueda editar, y que se pueda pegar al dibujo.
   CDP :9223 + mock :8791.

   POR QUE EXISTE ESTE RECORRIDO. Mauro, con el rig abierto y el muñeco a la
   vista: «el flujo para unir un esqueleto a un dibujo no esta andando, no se
   puede editar el esqueleto de ejemplo, no se entiende el funcionamiento».

   La causa era una sola y estaba adentro del modelo: un esqueleto puede tener
   PIVOTES y no tener COLA. El personaje de ejemplo nacía así —19 huesos, cero
   colas— y en la mesa se veía entero, porque el dibujo del hueso se apaña con
   la articulación del padre. Pero para el programa no había hueso:

     · «Editar» sobre el cuerpo caía en «elegir» y no movía nada,
     · no había punta que arrastrar para alargarlo,
     · y «Repartir» contestaba «primero dibujá el alambre» con el esqueleto
       puesto encima del personaje, que es justo el paso que él quería dar.

   Este recorrido exige las tres cosas con gestos de persona. */
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
  const arrastrar = async (a, b) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x, y: a.y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i++)
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", buttons: 1,
        x: Math.round(a.x + (b.x - a.x) * i / 12), y: Math.round(a.y + (b.y - a.y) * i / 12) });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", buttons: 0, clickCount: 1 });
    await w(450);
  };
  const enPantalla = (ux, uy) => ev(`(()=>{const s=new DOMPoint(${ux},${uy})
    .matrixTransform(document.querySelector('#dzCanvas > svg').getScreenCTM());
    return {x:Math.round(s.x), y:Math.round(s.y)};})()`);

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('typeof dzRigEjemplo==="function" && typeof dzRigRepartirDibujo==="function" && !!api').catch(() => false);
    if (listo === true) break;
    await w(400);
  }
  await ev('(()=>{ try{localStorage.clear()}catch(e){} return true; })()');
  await ev(`(async()=>{ await openDesign('mock.svg'); await dzDocInit();
    if (typeof closeL3d==="function") closeL3d(); })()`);
  await w(700);

  // ── 1. EL PERSONAJE DE EJEMPLO ES UN ESQUELETO DE VERDAD ──────────────────
  //      Es la puerta de entrada al rig: si el ejemplo no se puede tocar, el
  //      resto del entorno queda sin explicar.
  await ev(`(async()=>{ DZ.dirty = false; await (async()=>{ const esperar=ms=>new Promise(r=>setTimeout(r,ms));
      const p = dzRigEjemplo();
      // La confirmacion es nueva y es deliberada: el ejemplo REEMPLAZA el
      // dibujo de la mesa. Se acepta, que es lo que haria una persona.
      for (let i=0;i<20;i++){ const ok=document.querySelector("#dzEjOk");
        if(ok){ ok.click(); break; } await esperar(100); }
      return p; })(); })()`);
  await w(900);
  const ejemplo = await ev(`(()=>{ const ns = Object.values(DZ.doc.scene.rig.nodes);
    return { huesos: ns.length, conAlambre: ns.filter(n=>n.head&&n.tail).length,
      sinCola: ns.filter(n=>!n.tail).map(n=>n.id).slice(0,4) }; })()`);
  if (!ejemplo.huesos) mal("el personaje de ejemplo no dejó ningún hueso", ejemplo);
  if (ejemplo.conAlambre !== ejemplo.huesos)
    mal("el esqueleto de ejemplo tiene huesos SIN COLA: para el programa no son " +
      "huesos, y por eso no se pueden editar ni repartir", ejemplo);

  // ── 2. EDITAR EL ESQUELETO DE EJEMPLO MUEVE EL HUESO ──────────────────────
  //      Construir → Editar, y arrastrar el cuerpo del hueso del brazo.
  await ev('dzRigSetMode("build"); dzRigSetTool("edit")');
  await w(300);
  const antes = await ev(`(()=>{ const n = DZ.doc.scene.rigNode("brazo_der");
    return { head:{...n.head}, tail:{...n.tail} }; })()`);
  const medio = { x: (antes.head.x + antes.tail.x) / 2, y: (antes.head.y + antes.tail.y) / 2 };
  const desde = await enPantalla(medio.x, medio.y);
  const hasta = { x: desde.x + 46, y: desde.y + 34 };
  await arrastrar(desde, hasta);
  const despues = await ev(`(()=>{ const n = DZ.doc.scene.rigNode("brazo_der");
    return { head:{...n.head}, tail:{...n.tail} }; })()`);
  const corrio = Math.hypot(despues.head.x - antes.head.x, despues.head.y - antes.head.y);
  if (corrio < 4)
    mal("con «Editar» no se puede mover el hueso del esqueleto de ejemplo: " +
      "el gesto cae en «elegir» porque el hueso no tiene cola", { antes, despues, corrio });

  // ── 3. UNIR UN ESQUELETO A UN DIBUJO ──────────────────────────────────────
  //      Dibujo con piezas → esqueleto de la biblioteca encima → Repartir.
  await ev(`(()=>{ const svg = document.querySelector('#dzCanvas > svg'); svg.innerHTML = "";
    const mk = (id,x,y,an,al) => { const r = document.createElementNS(svg.namespaceURI,'rect');
      r.id = id; r.setAttribute('x',x); r.setAttribute('y',y);
      r.setAttribute('width',an); r.setAttribute('height',al); r.setAttribute('fill','#333');
      dzArtAppend(svg, r); };
    mk('torso',470,300,110,230); mk('brazo_i',580,315,150,45); mk('brazo_d',320,315,150,45);
    mk('pierna_i',480,530,45,190); mk('pierna_d',528,530,45,190); mk('cabeza',490,210,70,80);
    dzDocCommit(); return true; })()`);
  await ev('(async()=>{ if (typeof dzRigClearAll === "function") { } })()');
  await ev(`(()=>{ const doc = DZ.doc;
    for (const id of Object.keys(doc.scene.rig.nodes)) doc.removeRigNode?.(id);
    return Object.keys(doc.scene.rig.nodes).length; })()`);
  await ev('(async()=>{ await dzRigOpen(); })()'); await w(500);
  await ev('dzRigLibraryAdd("human_standard")'); await w(700);
  const colocado = await ev(`(()=>{ const ns = Object.values(DZ.doc.scene.rig.nodes);
    return { huesos: ns.length, conAlambre: ns.filter(n=>n.head&&n.tail).length,
      vinculados: ns.filter(n=>n.elementId).length }; })()`);
  if (colocado.huesos < 4) mal("la biblioteca no colocó el esqueleto", colocado);
  await ev('document.querySelector("#rigRepartir").click()'); await w(700);
  const reparto = await ev(`(()=>{ const ns = Object.values(DZ.doc.scene.rig.nodes);
    const piezas = dzRigDrawableElements().map(e=>e.id);
    return { atados: ns.filter(n=>n.elementId && piezas.includes(n.elementId))
        .map(n=>n.id+"→"+n.elementId),
      aviso: document.querySelector('#dzStatus')?.textContent || "" }; })()`);
  if (/primero dibuj/i.test(reparto.aviso))
    mal("«Repartir» rechaza un esqueleto que está puesto sobre el personaje", reparto);
  if (reparto.atados.length < 3)
    mal("«Repartir» no pega el dibujo al esqueleto: con seis piezas debajo del " +
      "alambre tendría que atar la mayoría", reparto);

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }

  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));

  console.log("E2E rig OK " + JSON.stringify({
    ejemplo: ejemplo.conAlambre + "/" + ejemplo.huesos + " huesos con alambre",
    editar: Math.round(corrio) + " unidades movido",
    repartir: reparto.atados.length + " piezas atadas"
  }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
