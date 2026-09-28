/* LAS HERRAMIENTAS DE VECTOR TIENEN DE DONDE AGARRAR.
   CDP :9223 + mock :8791.

   POR QUE EXISTE ESTE RECORRIDO. Mauro, probando la v4.38.1: «las herramientas
   de vector no funcionan en general y las que andan son una poronga. Por
   ejemplo el inflador debe ser como el inflador de linea de OpenToonz: lo que
   debe inflar es la linea, el contorno, ensancharla o desinflarla si lo uso con
   Alt. Tambien falta alguna herramienta para añadir puntos de vector en las
   lineas ya creadas».

   MIDIENDO cada herramienta con arrastres de verdad aparecio la causa comun:
   **una curva recien dibujada tiene DOS anclas, las dos en las puntas**, y
   todas las herramientas de vector trabajan sobre anclas. En el medio de la
   linea no habia nada que agarrar. El iman decia «Deformacion aplicada» y no
   movia NADA; los nodos no daban donde tocar. No estaban rotas: trabajaban
   sobre puntos que no existian.

   LO QUE SE PERSIGUE:

   1. AGREGAR UN PUNTO a una linea ya dibujada, y que agregarlo NO LA DEFORME.
      Un punto que cambia la curva es una deformacion disfrazada de ayuda.
   2. QUE EL INFLADOR INFLE LA LINEA, no la forma. Sobre un trazo de pincel la
      hinchazon es LOCAL —engorda donde pasas, como el Pump de OpenToonz— y con
      Alt desinfla.
   3. QUE EL IMAN DEFORME DE VERDAD apoyado en el medio de una curva, donde
      antes no habia ancla. */
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
  const clic = async (p, mods = 0) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, buttons: 0, modifiers: mods });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1, modifiers: mods });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1, modifiers: mods });
    await w(350);
  };
  const arrastrar = async (a, b, mods = 0) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x, y: a.y, buttons: 0, modifiers: mods });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", buttons: 1, clickCount: 1, modifiers: mods });
    for (let i = 1; i <= 12; i++)
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", buttons: 1, modifiers: mods,
        x: Math.round(a.x + (b.x - a.x) * i / 12), y: Math.round(a.y + (b.y - a.y) * i / 12) });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", buttons: 0, clickCount: 1, modifiers: mods });
    await w(400);
  };
  const enPantalla = (ux, uy) => ev(`(()=>{const s=new DOMPoint(${ux},${uy})
    .matrixTransform(document.querySelector('#dzCanvas > svg').getScreenCTM());
    return {x:Math.round(s.x), y:Math.round(s.y)};})()`);

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('typeof dzPuntoAgregar==="function" && typeof dzInflarLinea==="function" && !!api').catch(() => false);
    if (listo === true) break;
    await w(400);
  }
  await ev(`(async()=>{ try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); if (typeof dzDocInit==="function") await dzDocInit();
    if (typeof closeL3d==="function") closeL3d(); await new Promise(r=>setTimeout(r,600)); })()`);

  const curva = () => ev(`(()=>{const svg=document.querySelector('#dzCanvas > svg');
    svg.querySelectorAll('#curva').forEach(n=>n.remove());
    const p=document.createElementNS(svg.namespaceURI,'path');
    p.id='curva'; p.setAttribute('d','M 400 500 C 600 300 900 700 1200 400');
    p.setAttribute('fill','none'); p.setAttribute('stroke','#111111'); p.setAttribute('stroke-width','10');
    dzArtAppend(svg,p); dzDeselect(); dzDocCommit(); return true;})()`);
  const forma = () => ev(`(()=>{const p=document.querySelector('#curva'); if(!p) return null;
    return { anclas:(p.getAttribute('d').match(/[MLCQ]/g)||[]).length,
      nodos:document.querySelectorAll('.dz-node').length,
      trazo:[0.2,0.5,0.8].map(f=>{const q=p.getPointAtLength(p.getTotalLength()*f);
        return Math.round(q.x)+','+Math.round(q.y);}).join(' ') };})()`);

  // ── 1. AGREGAR UN PUNTO, y que la curva no se mueva
  await curva();
  await ev('dzSetTool("nodes")'); await w(250);
  const antes = await forma();
  const medio = await enPantalla(806, 499);      // el punto medio de esa curva
  await clic(medio);                              // primer clic: elige la línea
  const elegida = await forma();
  if (elegida.nodos < 2)
    mal("con la herramienta de nodos, un clic sobre la línea no muestra sus puntos: " +
      "no hay por dónde empezar a editarla", { antes, elegida });
  if (elegida.anclas !== antes.anclas)
    mal("elegir una línea con la herramienta de nodos YA la modificó: elegir no puede " +
      "cambiar el dibujo", { antes, elegida });
  await clic(medio);                              // segundo clic: agrega el punto
  const conPunto = await forma();
  if (conPunto.anclas <= antes.anclas)
    mal("un segundo clic sobre la línea NO agrega un punto: sin poder agregar puntos, " +
      "una curva dibujada tiene dos anclas en las puntas y en el medio no hay nada " +
      "que agarrar — que es por lo que las herramientas de vector parecían rotas",
      { antes, conPunto });
  const desvio = (a, b) => {
    const p = a.split(" ").map(q => q.split(",").map(Number));
    const q = b.split(" ").map(r => r.split(",").map(Number));
    return Math.max(...p.map((v, i) => Math.hypot(v[0] - q[i][0], v[1] - q[i][1])));
  };
  if (desvio(antes.trazo, conPunto.trazo) > 1.5)
    mal("agregar un punto DEFORMÓ la curva: partir un tramo tiene que dar la misma " +
      "línea, si no es una deformación disfrazada de ayuda",
      { antes: antes.trazo, despues: conPunto.trazo, desvio: desvio(antes.trazo, conPunto.trazo) });
  if (conPunto.nodos <= elegida.nodos)
    mal("el punto se agregó pero no aparece para agarrarlo", { elegida, conPunto });
  await ev('dzUndo()'); await w(450);
  const trasUndo = await forma();
  if (trasUndo.anclas !== antes.anclas)
    mal("Ctrl+Z no saca el punto agregado de una", { antes, trasUndo });

  // ── 2. EL INFLADOR INFLA LA LÍNEA. Sobre un trazo de pincel, LOCALMENTE.
  await ev(`(()=>{const svg=document.querySelector('#dzCanvas > svg');
    svg.querySelectorAll('#pincel').forEach(n=>n.remove());
    DZ.brushPreset='dry-brush'; DZ.drawW=14;
    const pts=[]; for(let i=0;i<=30;i++) pts.push([400+i*26, 850, 1]);
    const g=dzBrushFinalElement(pts,'#111'); g.id='pincel';
    const capa=document.createElementNS(svg.namespaceURI,'g'); capa.setAttribute('data-low-art','line');
    capa.append(g); svg.append(capa); dzDocCommit(); dzSetTool('inflator'); return true;})()`);
  const presiones = () => ev(`(()=>{const g=document.querySelector('#pincel');
    const p=JSON.parse(g.getAttribute('data-low-brush-points'));
    return { punta:+p[2][2].toFixed(3), medio:+p[15][2].toFixed(3), otraPunta:+p[28][2].toFixed(3) };})()`);
  const pAntes = await presiones();
  const sobreElPincel = await enPantalla(790, 850);
  await arrastrar(sobreElPincel, { x: sobreElPincel.x + 8, y: sobreElPincel.y });
  const pInflado = await presiones();
  if (!(pInflado.medio > pAntes.medio * 1.2))
    mal("el inflador NO engrosó la línea donde pasó el cursor: es lo que se pidió, " +
      "que infle la línea y no la forma", { pAntes, pInflado });
  if (pInflado.punta > pAntes.punta * 1.05 || pInflado.otraPunta > pAntes.otraPunta * 1.05)
    mal("el inflador engordó TODA la línea en vez de sólo donde pasó: el Pump de " +
      "OpenToonz hincha localmente, que es para lo que sirve", { pAntes, pInflado });
  await arrastrar(sobreElPincel, { x: sobreElPincel.x + 8, y: sobreElPincel.y }, 1);   // Alt
  const pDesinflado = await presiones();
  if (!(pDesinflado.medio < pInflado.medio))
    mal("con Alt el inflador no desinfla", { pInflado, pDesinflado });

  // ── 3. Y CON LA OPCIÓN «toda la línea» cambia el grosor parejo, diciéndolo.
  //       Desde v4.40.0 el comportamiento POR DEFECTO es por tramo —lo pidió
  //       Mauro— y esto de acá prueba la opción, que es la que sigue siendo
  //       global; el por defecto lo cuida `check_taller_vector_ui`.
  await ev('dzInflarModoSet("pareja")');
  await ev(`(()=>{const svg=document.querySelector('#dzCanvas > svg');
    svg.querySelectorAll('#comun').forEach(n=>n.remove());
    const p=document.createElementNS(svg.namespaceURI,'path');
    p.id='comun'; p.setAttribute('d','M 400 950 L 1200 950'); p.setAttribute('fill','none');
    p.setAttribute('stroke','#111'); p.setAttribute('stroke-width','8');
    dzArtAppend(svg,p); dzDocCommit(); return true;})()`);
  const sobreElComun = await enPantalla(800, 950);
  await arrastrar(sobreElComun, { x: sobreElComun.x + 8, y: sobreElComun.y });
  const comun = await ev(`({ sw:+document.querySelector('#comun').getAttribute('stroke-width'),
    aviso:(document.querySelector("#dzStatus")||{}).textContent||"" })`);
  if (!(comun.sw > 8))
    mal("sobre un trazo común el inflador no engrosó nada", comun);
  if (!/toda la línea|toda la linea/i.test(comun.aviso))
    mal("el aviso no dice que en este trazo se infla TODA la línea: es la diferencia " +
      "con el pincel, y callarla es prometer algo que no hizo", comun);

  await ev('dzInflarModoSet("tramo")');   // se deja el modo por defecto

  // ── 4. EL IMÁN deforma apoyado en el medio, donde no había ancla
  await curva();
  await ev('dzSetTool("magnet")'); await w(250);
  const antesIman = await forma();
  await arrastrar(medio, { x: medio.x, y: medio.y - 110 });
  const trasIman = await forma();

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }

  if (trasIman.trazo === antesIman.trazo)
    mal("el imán NO deformó nada apoyado en el medio de la curva, donde no hay ancla: " +
      "es justo lo que hacía decir que las herramientas de vector no funcionan, y " +
      "encima el aviso decía «Deformación aplicada»", { antesIman, trasIman });

  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));

  console.log("E2E herramientas de vector OK " + JSON.stringify({
    agregarPunto: { anclas: antes.anclas + "→" + conPunto.anclas, sinDeformar: true },
    inflador: { local: pAntes.medio + "→" + pInflado.medio, puntasIntactas: true,
      alt: pInflado.medio + "→" + pDesinflado.medio, trazoComun: comun.sw },
    iman: { deforma: true },
  }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
