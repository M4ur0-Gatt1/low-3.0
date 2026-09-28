/* EL TALLER: espacios de trabajo, inflar por tramo, formas editables y la zona
   de camara marcada.
   CDP :9223 + mock :8791.

   POR QUE EXISTE ESTE RECORRIDO. Cuatro cosas que pidio Mauro probando la
   v4.39.0 recien instalada:

   1. «no se en que version perdimos los paneles con los diferentes espacios de
      trabajo que teniamos arriba a la derecha, eso es fundamental». Era una
      REGRESION MIA: el flujo nuevo de documento (v4.36.0) no pasa por
      `openDesign`, que era quien montaba las pestañas de espacios.
   2. «la idea es que infle por tramo entre un punto y el otro, no que infle
      todo parejo; quiza sirve lo de que infle parejo pero como una OPCION de
      la herramienta, no como comportamiento por defecto».
   3. «la herramienta de nodo para agregar tambien quiero que funcione en las
      formas, para poder dibujar a partir de formas basicas y editarlas».
   4. «tambien quiero que marque en la pantalla la zona de la camara».

   Lo que se persigue de cada una esta en su bloque. */
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
  const clic = async (p) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 });
    await w(400);
  };
  const arrastrar = async (a, b, mods = 0) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x, y: a.y, buttons: 0, modifiers: mods });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", buttons: 1, clickCount: 1, modifiers: mods });
    for (let i = 1; i <= 12; i++)
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", buttons: 1, modifiers: mods,
        x: Math.round(a.x + (b.x - a.x) * i / 12), y: Math.round(a.y + (b.y - a.y) * i / 12) });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", buttons: 0, clickCount: 1, modifiers: mods });
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
    const listo = await ev('typeof dzMenuAction==="function" && typeof dzInflarModo==="function" && !!api').catch(() => false);
    if (listo === true) break;
    await w(400);
  }
  await ev('(()=>{ try{localStorage.clear()}catch(e){} return true; })()');

  // ── 1. LOS ESPACIOS DE TRABAJO, por el camino que usa una persona: arrancar
  //       LOW y apretar «Nuevo documento». Era una regresión de v4.36.0.
  await ev('dzMenuAction("nuevo")');
  let espacios = null;
  for (let i = 0; i < 40; i++) {
    espacios = await ev(`(()=>{ const box=document.querySelector('#dzWorkspaces');
      if(!box || !box.children.length) return null;
      const r=box.getBoundingClientRect();
      return { pestanas:[...box.children].map(b=>b.textContent),
        visible:r.width>0&&r.height>0, dentroDeLaVentana:r.right<=innerWidth+1,
        activo: LOW.workspace.workspaces.activeId,
        hayActiva: !!box.querySelector('.active') };})()`);
    if (espacios) break;
    await w(400);
  }
  if (!espacios)
    mal("«Nuevo documento» deja el estudio SIN las pestañas de espacios de trabajo: " +
      "es la regresión que reportó Mauro —el camino nuevo no pasa por openDesign, " +
      "que era quien las montaba—", { espacios: await ev("document.querySelector('#dzWorkspaces')?.children.length") });
  if (espacios.pestanas.length < 5 || !espacios.pestanas.includes("Dibujo"))
    mal("faltan espacios de trabajo en la barra", espacios);
  if (!espacios.visible || !espacios.dentroDeLaVentana)
    mal("las pestañas de espacios no se ven o quedan fuera de la ventana", espacios);
  if (!espacios.hayActiva || !espacios.activo)
    mal("ninguna pestaña queda marcada como activa: no se sabe en qué espacio se está", espacios);

  // ── 2. LA ZONA DE CÁMARA, marcada sin comerse el dibujo
  const camara = await ev(`(()=>{ const c=document.querySelector('#dzCam');
    const r=c.getBoundingClientRect(), cs=getComputedStyle(c);
    const centro={x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};
    return { visible:!c.hidden, guia:c.classList.contains('guia'), modoCamara:!!DZ.camMode,
      agarra:cs.pointerEvents, tam:Math.round(r.width)+'x'+Math.round(r.height),
      debajo:(()=>{const n=document.elementFromPoint(centro.x,centro.y);
        return { etiqueta:n?.tagName, esLaCamara:!!n?.closest?.('#dzCam') };})() };})()`);
  if (!camara.visible || !camara.guia)
    mal("la zona de cámara NO se marca en pantalla mientras se dibuja: no saber qué " +
      "entra en el plano se paga al exportar", camara);
  if (camara.modoCamara)
    mal("marcar la zona de cámara metió al estudio en modo cámara: es una guía, no un modo", camara);
  if (camara.agarra !== "none" || camara.debajo.esLaCamara)
    mal("la guía de cámara se come el puntero: con ella puesta no se podría dibujar", camara);
  await ev('dzMenuAction("camara-guia")'); await w(400);
  const apagada = await ev(`({ visible:!document.querySelector('#dzCam').hidden })`);
  if (apagada.visible) mal("no se puede apagar la guía de cámara", apagada);
  await ev('dzMenuAction("camara-guia")'); await w(400);

  // ── 3. INFLAR POR TRAMO es lo que pasa por defecto, y «toda la línea» es una
  //       opción. Un trazo de lápiz tiene UN grosor: para engordar un pedazo
  //       la línea pasa a ancho variable.
  if (await ev("dzInflarModo()") !== "tramo")
    mal("el inflador no arranca en «por tramo»: se pidió que inflar parejo sea una " +
      "opción, no el comportamiento por defecto", { modo: await ev("dzInflarModo()") });
  await ev(`(()=>{const svg=document.querySelector('#dzCanvas > svg');
    svg.querySelectorAll('#lapiz').forEach(n=>n.remove());
    const p=document.createElementNS(svg.namespaceURI,'path'); p.id='lapiz';
    p.setAttribute('d','M 300 600 L 1500 600'); p.setAttribute('fill','none');
    p.setAttribute('stroke','#111111'); p.setAttribute('stroke-width','9');
    dzArtAppend(svg,p); dzDocCommit(); dzSetTool('inflator'); return true;})()`);
  const anchoEn = (x) => ev(`(()=>{const el=document.querySelector('#lapiz'); if(!el) return null;
    if(!el.hasAttribute('data-low-brush-points')) return { variable:false, sw:el.getAttribute('stroke-width') };
    const p=JSON.parse(el.getAttribute('data-low-brush-points'));
    let mejor=p[0], d=Infinity; for(const q of p){ const dd=Math.abs(q[0]-${x}); if(dd<d){d=dd;mejor=q;} }
    return { variable:true, presion:+mejor[2].toFixed(2), puntos:p.length };})()`);
  const antesTramo = await anchoEn(700);
  const enLaLinea = await enPantalla(700, 600);
  await arrastrar(enLaLinea, { x: enLaLinea.x + 6, y: enLaLinea.y });
  const aca = await anchoEn(700), alla = await anchoEn(1350);
  if (!aca?.variable)
    mal("inflar por tramo no pasó la línea a ancho variable: con un solo grosor para " +
      "toda la línea es imposible engordar un pedazo", { antesTramo, aca });
  if (!(aca.presion > 1.2))
    mal("el tramo bajo el cursor no engordó", { aca });
  if (alla.presion > 1.05)
    mal("infló TODA la línea en vez del tramo: es justo lo que se pidió cambiar",
      { aca, alla });

  // ── 4. UNA FORMA BÁSICA se puede editar por puntos. Antes el editor decía
  //       «ese elemento no tiene nodos editables» y ahí se terminaba.
  await ev(`(()=>{const svg=document.querySelector('#dzCanvas > svg');
    svg.querySelectorAll('#caja').forEach(n=>n.remove());
    const r=document.createElementNS(svg.namespaceURI,'rect'); r.id='caja';
    r.setAttribute('x',500); r.setAttribute('y',300); r.setAttribute('width',600); r.setAttribute('height',380);
    r.setAttribute('fill','none'); r.setAttribute('stroke','#111111'); r.setAttribute('stroke-width','8');
    dzArtAppend(svg,r); dzDocCommit(); dzSetTool('nodes'); return true;})()`);
  const borde = await enPantalla(800, 300);
  const antesForma = await ev(`({ tag:document.querySelector('#caja').tagName,
    sw:document.querySelector('#caja').getAttribute('stroke-width') })`);
  await clic(borde);
  const convertida = await ev(`(()=>{const el=document.querySelector('#caja');
    return { tag:el.tagName, nodos:document.querySelectorAll('.dz-node').length,
      sw:el.getAttribute('stroke-width'), seleccionada: DZ.sel === el,
      aviso:(document.querySelector('#dzStatus')||{}).textContent||"" };})()`);
  // LO QUE SE EDITA ES LO QUE ESTÁ SELECCIONADO. Sin esto la caja de selección
  // marca una forma y los nodos están sobre otra, y todo lo que trabaja sobre
  // la selección actúa sobre la que no es. Lo reportó Mauro: «a veces
  // selecciona la última forma editada aunque esté trabajando sobre otra».
  if (!convertida.seleccionada)
    mal("editar los puntos de una forma deja la selección en OTRA: la caja marca una " +
      "cosa y los nodos están sobre otra", convertida);
  if (convertida.nodos < 4)
    mal("una forma básica sigue sin poder editarse por puntos: no se puede dibujar a " +
      "partir de formas y después ajustarlas", { antesForma, convertida });
  if (convertida.sw !== antesForma.sw)
    mal("al pasar la forma a trazado le cambió el grosor del contorno", { antesForma, convertida });
  if (!/trazado/i.test(convertida.aviso))
    mal("la forma se convirtió y no se avisó: la persona no se entera de que su " +
      "rectángulo ya no es un rectángulo", convertida);
  await clic(borde);
  const conPunto = await ev(`document.querySelectorAll('.dz-node').length`);
  if (conPunto <= convertida.nodos)
    mal("sobre la forma convertida no se puede agregar un punto", { convertida, conPunto });

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }

  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));

  console.log("E2E taller OK " + JSON.stringify({
    espacios: espacios.pestanas.length + " pestañas · activa " + espacios.activo,
    camara: { guia: true, seComeElPuntero: false },
    inflar: { porTramo: aca.presion, restoIntacto: alla.presion },
    forma: { nodos: convertida.nodos + "→" + conPunto },
  }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
