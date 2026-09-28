/* CON EL ESQUELETO PUESTO SE PUEDE DIBUJAR, Y EL ESQUELETO SE SIGUE VIENDO.
   CDP :9223 + mock :8791.

   POR QUE EXISTE, EN DOS ETAPAS.

   PRIMERO se reporto: «las herramientas del rigging tienen defectos, aparece
   como un pincel en lugar de hacer lo que deberia». Medido: con `DZ.rigMode`
   encendido el riel ofrecia las 17 herramientas de dibujo y `dzSetTool()` las
   aceptaba sin preguntar, asi que quedaba un pincel sobre el esqueleto y el
   gesto de mover una articulacion pintaba.

   DESPUES se reporto lo contrario: «no me deja dibujar sobre el esqueleto;
   tienen que andar los dos flujos». El primer arreglo se habia pasado: SALIA
   del modo rig, y MEDIDO se llevaba el esqueleto entero — 43 elementos en el
   overlay pasaban a 0 al elegir el lapiz. Se podia dibujar, pero no ENCIMA
   del esqueleto, que es para lo que uno lo quiere.

   La app ya tenia resuelto el caso y nadie lo estaba usando:
   `dzRigSetTool("draw")` pone el overlay en `rig-pass-through` —el puntero lo
   atraviesa hasta la mesa— y el alambre queda dibujado como guia. MEDIDO sin
   el envoltorio de por medio: rigMode true, 43 huesos a la vista, el puntero
   pasa, y el trazo se dibuja.

   LO QUE SE CUIDA, y las cinco juntas importan:

   1. Elegir un pincel con el esqueleto puesto pasa el rig a su modo DIBUJAR,
      asi el gesto ya no lo capturan los huesos. (El defecto original.)
   2. El ESQUELETO SIGUE VISIBLE. (El segundo reporte: sin esto, «dibujar
      sobre el esqueleto» es imposible.)
   3. Se aplica LA HERRAMIENTA QUE SE ELIGIO, no `pencil` a la fuerza: quien
      eligio el borrador quiere el borrador. Un boton que hace otra cosa es
      tan malo como uno muerto.
   4. Se DIBUJA de verdad: un arrastre sobre la mesa deja un trazo.
   5. Las que si sirven con el esqueleto —seleccion, mano, pivote— no cambian
      el modo: eso volveria inusable el armado.
   6. Las herramientas PROPIAS del rig mandan. «Cortes» le pide a la mesa la
      pinza para tener el cursor correcto, y levanta `DZ.rigToolSync` mientras
      lo hace; si el envoltorio no respeta esa bandera, elegir Cortes termina
      en modo Dibujar sin que nadie lo haya pedido.

   Un arreglo que solo rechace pasa (1) y rompe (3) y (4). Uno que salga del
   rig pasa (1), (3) y (4) y rompe (2): es exactamente lo que estaba mal. */
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
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    if (await ev('typeof dzSetTool==="function" && typeof openDesign==="function" && !!api').catch(() => false)) break;
    await w(400);
  }

  const r = await ev(`(async()=>{
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit();
    if (typeof closeL3d==="function") closeL3d();
    await wait(500);
    if (!DZ.anim && typeof dzAnimToggle==="function") { await dzAnimToggle(); await wait(700); }
    if (!DZ.rigMode && typeof dzRigToggle==="function") dzRigToggle();
    await wait(300);
    // Hace falta un esqueleto DE VERDAD: con el rig vacío no hay nada dibujado
    // en el overlay y «se perdió el esqueleto» no se puede distinguir de «nunca
    // hubo». El guardia se dio cuenta solo la primera vez que corrió.
    const sel = document.querySelector("#rigLibrary"); if (sel) sel.value = "human_simple";
    document.querySelector("#rigLibraryAdd")?.click(); await wait(1200);
    const salida = { entroAlRig: !!DZ.rigMode, guardPuesto: !!(dzSetTool && dzSetTool.__conModo) };

    // 3. las que SI sirven con el esqueleto no sacan del modo
    const quedanEnRig = {};
    for (const h of ["select", "hand", "pivot"]) {
      dzSetTool(h); await wait(150);
      quedanEnRig[h] = { tool: DZ.tool, rig: !!DZ.rigMode };
      if (!DZ.rigMode && typeof dzRigToggle==="function") { dzRigToggle(); await wait(200); }
    }
    salida.quedanEnRig = quedanEnRig;

    // 1 a 4: el pincel con el esqueleto puesto
    if (!DZ.rigMode && typeof dzRigToggle==="function") { dzRigToggle(); await wait(200); }
    dzSetTool("rigedit"); await wait(200);
    const huesos = () => { const ov = document.querySelector("#dzRigOverlay");
      return ov && !ov.hidden ? ov.querySelectorAll("line,circle,path").length : 0; };
    const trazos = () => { const hoja = document.querySelector("#dzCanvas > svg");
      return hoja ? [...hoja.querySelectorAll("path,polyline,line,rect,circle,ellipse,polygon")]
        .filter(n => !n.closest(".dz-onion,.dz-penui,#dzRigOverlay") && n.getAttribute("data-paper")===null).length : 0; };
    salida.antes = { tool: DZ.tool, rig: !!DZ.rigMode, huesos: huesos() };
    dzSetTool("brush"); await wait(400);
    const ov = document.querySelector("#dzRigOverlay");
    salida.conPincel = { tool: DZ.tool, rig: !!DZ.rigMode, rigTool: DZ.rigTool,
      huesos: huesos(), pasaElPuntero: !!(ov && ov.classList.contains("rig-pass-through")),
      aviso: (document.querySelector("#dzStatus") || {}).textContent || "" };
    salida.trazosAntes = trazos();

    /* 6. Las herramientas PROPIAS del rig mandan. Cortes y Pivote le piden a
       la mesa una herramienta de dibujo (pliers, pivot) para tener el cursor
       correcto, y levantan la bandera DZ.rigToolSync mientras lo hacen. Si el
       envoltorio no la respeta, elegir Cortes termina en modo Dibujar sin que
       nadie lo haya pedido.
       (Sin comillas invertidas: esto vive DENTRO de un template literal y una
       comilla invertida lo termina. Es la cuarta vez que me pasa.) */
    const pedidasPorElRig = {};
    for (const h of ["cut", "create", "edit"]) {
      if (typeof dzRigSetTool === "function") { dzRigSetTool(h); await wait(250); }
      pedidasPorElRig[h] = DZ.rigTool;
    }
    salida.pedidasPorElRig = pedidasPorElRig;
    return salida;
  })()`);

  // 4. y se dibuja de verdad, con eventos reales
  const antesDeDibujar = r.trazosAntes;
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 560, y: 430, button: "left", clickCount: 1 });
  for (let i = 1; i <= 12; i++)
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", button: "left", buttons: 1,
      x: 560 + Math.round(200 * i / 12), y: 430 + Math.round(50 * i / 12) });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 760, y: 480, button: "left", clickCount: 1 });
  await w(450);
  const trasDibujar = await ev(`(() => { const hoja = document.querySelector("#dzCanvas > svg");
    const ov = document.querySelector("#dzRigOverlay");
    return { trazos: hoja ? [...hoja.querySelectorAll("path,polyline,line,rect,circle,ellipse,polygon")]
        .filter(n => !n.closest(".dz-onion,.dz-penui,#dzRigOverlay") && n.getAttribute("data-paper")===null).length : 0,
      huesos: ov && !ov.hidden ? ov.querySelectorAll("line,circle,path").length : 0 }; })()`);

  if (!r.entroAlRig) mal("no se pudo entrar al modo rig: no se mide nada", r);
  if (!r.guardPuesto) mal("el guard de herramienta/modo no está enganchado", r);
  for (const [h, v] of Object.entries(r.quedanEnRig))
    if (!v.rig) mal("elegir «" + h + "» sacó del esqueleto, y esa sí sirve con el rig puesto", r);
  if (r.antes.tool !== "rigedit" || !r.antes.rig) mal("no quedó la herramienta de rig antes de probar", r);
  if (!r.antes.huesos) mal("el esqueleto no se veía ni antes de empezar: no se puede medir si se pierde", r);

  // 1. el gesto ya no lo capturan los huesos
  if (r.conPincel.rigTool !== "draw" || !r.conPincel.pasaElPuntero)
    mal("con el pincel puesto el esqueleto sigue capturando el puntero: el gesto de dibujar " +
        "va a mover una articulación, que es el defecto reportado", r);
  // 2. pero el esqueleto SIGUE A LA VISTA
  if (!r.conPincel.huesos)
    mal("elegir el pincel se llevó el esqueleto de la pantalla: así no se puede dibujar ENCIMA de él, " +
        "que es para lo que uno lo quiere", r);
  if (!r.conPincel.rig)
    mal("elegir el pincel salió del modo esqueleto: los dos flujos tienen que convivir", r);
  // 3. la herramienta elegida, no otra
  if (r.conPincel.tool !== "brush")
    mal("se aplicó «" + r.conPincel.tool + "» en vez del pincel que se eligió", r);
  if (!r.conPincel.aviso.trim())
    mal("cambió el modo sin decir nada: cambiar de modo en silencio pierde a cualquiera", r);
  // 4. y dibuja
  if (!(trasDibujar.trazos > antesDeDibujar))
    mal("arrastrar con el pincel no dejó ningún trazo: se ve el esqueleto pero no se puede dibujar",
        { antes: antesDeDibujar, ...trasDibujar });
  if (!trasDibujar.huesos)
    mal("el esqueleto desapareció al dibujar", trasDibujar);
  // 6. el rig manda sobre su propia herramienta
  for (const [pedida, quedo] of Object.entries(r.pedidasPorElRig || {}))
    if (quedo !== pedida)
      mal("se pidió la herramienta de rig «" + pedida + "» y quedó «" + quedo + "»: el envoltorio " +
          "está secuestrando la herramienta que el propio rig le pide a la mesa", r.pedidasPorElRig);

  const crasheos = errores.filter(e => /TypeError|ReferenceError/.test(String(e)));
  if (crasheos.length) mal("el cambio de herramienta tiró errores", crasheos.slice(0, 3));

  console.log("E2E dibujar con el esqueleto a la vista OK " + JSON.stringify({ ...r, trasDibujar }));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
