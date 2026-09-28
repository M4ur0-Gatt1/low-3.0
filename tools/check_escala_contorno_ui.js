/* ACHICAR O DEFORMAR UNA FORMA NO CAMBIA EL ESPESOR DE SU CONTORNO.
   CDP :9223 + mock :8791.

   POR QUE EXISTE ESTE RECORRIDO. Lo reporto Mauro con la v4.37.0 instalada:
   «cuando achico una forma o la deformo no tiene que cambiar el espesor de
   ninguno de los lados».

   Redimensionar escribia una `transform` con la escala, y en SVG una
   transformacion escala TODO: la geometria y tambien el trazo. Con la
   deformacion libre —Shift en una esquina— el factor es distinto por eje, asi
   que los lados verticales se pintaban con el factor X y los horizontales con
   el factor Y. Medido antes del arreglo, achicando un rectangulo de contorno 12:

       matrix(0.050445 0 0 0.715134 …)
       lado vertical   → 0,32 px pintados
       lado horizontal → 4,52 px pintados     (catorce veces mas grueso)

   LO QUE SE PERSIGUE:

   1. QUE LOS CUATRO LADOS QUEDEN IGUALES entre si despues de deformar libre.
   2. QUE QUEDEN IGUALES A COMO ESTABAN antes de tocar la forma. Que los cuatro
      lados sean iguales entre si no alcanza: escalar el trazo de forma pareja
      tambien los deja iguales, y el contorno igual cambio de grosor.
   3. QUE LA FORMA SI CAMBIE DE TAMAÑO. Si no, cumplir (1) y (2) es trivial
      —basta con no hacer nada— y la prueba estaria certificando una herramienta
      rota.
   4. QUE UNA FORMA ENTINTADA conserve su `data-grosor`, que es de donde sale el
      ancho de la cinta al volver a entintarla.
   5. Que se pueda deshacer de una. */
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

  /** Arrastre del tirador con el mouse de verdad. `shift` = deformación libre. */
  const arrastrarTirador = async (lado, dx, dy, shift) => {
    const h = await ev(`(()=>{const b=document.querySelector("#dzSelBox");
      if(!b||b.hidden) return null; const n=b.querySelector(".dz-sh.${lado}");
      if(!n) return null; const r=n.getBoundingClientRect();
      if(!r.width||!r.height) return null;
      return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};})()`);
    if (!h) throw Error("no encontré el tirador " + lado + " de la caja de selección");
    const mods = shift ? 8 : 0;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: h.x, y: h.y, buttons: 0, modifiers: mods });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: h.x, y: h.y, button: "left", buttons: 1, clickCount: 1, modifiers: mods });
    for (let i = 1; i <= 10; i++)
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", buttons: 1, modifiers: mods,
        x: Math.round(h.x + dx * i / 10), y: Math.round(h.y + dy * i / 10) });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: h.x + dx, y: h.y + dy, button: "left", buttons: 0, clickCount: 1, modifiers: mods });
    await w(450);
  };

  /** El espesor REALMENTE PINTADO de cada lado, en píxeles de pantalla: el
   *  `stroke-width` multiplicado por la escala con la que se dibuja cada eje. */
  const espesores = (sel) => ev(`(()=>{const el=document.querySelector(${JSON.stringify(sel)});
    if(!el) return null; const m=el.getScreenCTM(); const sw=+(el.getAttribute("stroke-width")||0);
    const c=el.getBBox();
    return { vertical: Math.abs(m.a)*sw, horizontal: Math.abs(m.d)*sw, sw,
      transform: el.getAttribute("transform"), ancho: Math.round(c.width), alto: Math.round(c.height) };})()`);

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('typeof dzEscalaGeometrica==="function" && typeof dzBoxHandleDown==="function" && !!api').catch(() => false);
    if (listo === true) break;
    await w(400);
  }

  const montaje = await ev(`(async()=>{
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); if (typeof dzDocInit==="function") await dzDocInit();
    if (typeof closeL3d==="function") closeL3d();
    await new Promise(r=>setTimeout(r,600));
    const svg=document.querySelector('#dzCanvas > svg');
    const r=document.createElementNS(svg.namespaceURI,'rect');
    r.id='forma'; r.setAttribute('x',600); r.setAttribute('y',300);
    r.setAttribute('width',600); r.setAttribute('height',400);
    r.setAttribute('fill','none'); r.setAttribute('stroke','#111111'); r.setAttribute('stroke-width',12);
    dzArtAppend(svg,r); dzSetTool('select'); dzSelect(r); dzDocCommit();
    return { hayCaja: !document.querySelector('#dzSelBox').hidden };
  })()`);
  if (!montaje.hayCaja) mal("la forma no quedó seleccionada: sin caja no hay tiradores", montaje);

  const antes = await espesores("#forma");
  if (!antes || !antes.vertical) mal("no pude medir el contorno antes de tocar nada", { antes });

  // ── 1. DEFORMACIÓN LIBRE: Shift en la esquina, mucho más en un eje que en otro
  await arrastrarTirador("se", -300, -60, true);
  const libre = await espesores("#forma");
  if (!libre) mal("la forma desapareció al deformarla", {});
  if (Math.abs(libre.ancho - antes.ancho) < 20 && Math.abs(libre.alto - antes.alto) < 20)
    mal("la forma NO cambió de tamaño: la prueba estaría certificando una herramienta " +
      "rota, porque no cambiar el espesor sin cambiar el tamaño es trivial",
      { antes, libre });
  if (Math.abs(libre.vertical - libre.horizontal) > 0.05)
    mal("después de deformar libre, los lados quedaron con DISTINTO espesor: " +
      libre.vertical.toFixed(2) + " px los verticales contra " + libre.horizontal.toFixed(2) +
      " px los horizontales", libre);
  if (Math.abs(libre.vertical - antes.vertical) > 0.05)
    mal("deformar CAMBIÓ el espesor del contorno: era " + antes.vertical.toFixed(2) +
      " px y quedó en " + libre.vertical.toFixed(2) + " px", { antes, libre });
  if (libre.transform)
    mal("la forma quedó con una transformación encima: en SVG eso escala también el " +
      "trazo, que es de donde venía el defecto", libre);

  // ── 2. ACHIQUE PROPORCIONAL: sin Shift, que es el caso de todos los días
  const antesProp = await espesores("#forma");
  await arrastrarTirador("se", -60, -60, false);
  const prop = await espesores("#forma");
  if (Math.abs(prop.ancho - antesProp.ancho) < 5 && Math.abs(prop.alto - antesProp.alto) < 5)
    mal("el achique proporcional no cambió el tamaño", { antesProp, prop });
  if (Math.abs(prop.vertical - antesProp.vertical) > 0.05 ||
      Math.abs(prop.horizontal - antesProp.horizontal) > 0.05)
    mal("achicar proporcionalmente adelgazó el contorno: de " + antesProp.vertical.toFixed(2) +
      " px a " + prop.vertical.toFixed(2) + " px", { antesProp, prop });

  // ── 3. Y SE DESHACE DE UNA
  await ev('dzUndo()');
  await w(500);
  const trasUndo = await espesores("#forma");
  if (!trasUndo || Math.abs(trasUndo.ancho - antesProp.ancho) > 5)
    mal("Ctrl+Z no devolvió la forma al tamaño anterior", { antesProp, trasUndo });

  // ── 3b. LA FLECHA DEL TIRADOR GIRA CON LA FORMA. La caja de selección gira
  //        con un `transform`, pero el cursor de cada tirador está escrito en el
  //        CSS y ésos no giran: con la forma a 90° el tirador que estira a lo
  //        ancho mostraba la flecha VERTICAL. La flecha decía una cosa y el
  //        arrastre hacía otra. Lo reportó Mauro.
  const flechas = (giro) => ev(`(()=>{
    const svg=document.querySelector('#dzCanvas > svg');
    svg.querySelectorAll('#giro').forEach(n=>n.remove());
    const r=document.createElementNS(svg.namespaceURI,'rect'); r.id='giro';
    r.setAttribute('x',600); r.setAttribute('y',400);
    r.setAttribute('width',500); r.setAttribute('height',200);
    r.setAttribute('fill','none'); r.setAttribute('stroke','#111111'); r.setAttribute('stroke-width','6');
    ${giro ? "r.setAttribute('transform','rotate(" + giro + " 850 500)');" : ""}
    dzArtAppend(svg,r); dzSetTool('select'); dzSelect(r); dzPositionHandle();
    const caja=document.querySelector('#dzSelBox');
    const lee=(c)=>{const n=caja.querySelector('.dz-sh.'+c); return n?getComputedStyle(n).cursor:null;};
    return { e:lee('e'), n:lee('n'), ne:lee('ne') };})()`);
  const derecha = await flechas(0), girada = await flechas(90);
  if (derecha.e !== "ew-resize" || derecha.n !== "ns-resize")
    mal("sin girar, la flecha del tirador ya no corresponde a lo que estira", derecha);
  if (girada.e !== "ns-resize" || girada.n !== "ew-resize")
    mal("con la forma girada 90°, la flecha del tirador NO gira con ella: el que estira " +
      "a lo ancho muestra la flecha vertical y el otro al revés, así que la flecha dice " +
      "una cosa y el arrastre hace otra", { derecha, girada });
  if (girada.ne !== "nwse-resize")
    mal("la flecha de la esquina no acompaña el giro", girada);

  // ── 4. UNA FORMA ENTINTADA conserva su grosor de pincel
  const entintada = await ev(`(()=>{
    const svg=document.querySelector('#dzCanvas > svg');
    const g=document.createElementNS(svg.namespaceURI,'g');
    g.id='entintada'; g.setAttribute('data-low','forma-pincel');
    g.setAttribute('data-d','M 600 300 L 1200 300 L 1200 700 L 600 700 Z');
    g.setAttribute('data-relleno','none'); g.setAttribute('data-trazo','#111111');
    g.setAttribute('data-grosor','14');
    dzArtAppend(svg,g); dzFormaPincelRender(g);
    const geo=dzEscalaCapturar(g);
    const aplico=dzEscalaGeometrica(g,geo,0.2,0.8,600,300);   // achique libre
    return { esPincel: typeof dzFormaPincelEs==="function" && dzFormaPincelEs(g), aplico,
      grosor: g.getAttribute('data-grosor'), transform: g.getAttribute('transform'),
      d: g.getAttribute('data-d'), hijos: g.children.length };})()`);
  if (!entintada.esPincel || !entintada.aplico)
    mal("la forma entintada no se pudo escalar por geometría: caería en la " +
      "transformación, que le cambia el espesor de la cinta", entintada);
  if (entintada.grosor !== "14")
    mal("escalar una forma entintada le cambió el `data-grosor`, que es de donde sale " +
      "el ancho de la cinta al volver a entintarla", entintada);
  if (entintada.transform) mal("la forma entintada quedó con una transformación encima", entintada);
  if (!/L 720 300/.test(entintada.d) || !entintada.hijos)
    mal("la geometría de la forma entintada no se escaló, o no se volvió a entintar", entintada);

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }

  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));

  console.log("E2E espesor del contorno OK " + JSON.stringify({
    deformarLibre: { de: antes.ancho + "×" + antes.alto, a: libre.ancho + "×" + libre.alto,
      espesor: libre.vertical.toFixed(2) + " px en los cuatro lados" },
    achicar: { espesorIgual: true },
    entintada: { grosor: entintada.grosor },
  }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
