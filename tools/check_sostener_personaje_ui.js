/* EL PERSONAJE TIENE QUE ESTAR EN TODOS LOS CUADROS QUE SE ANIMAN.
   CDP :9223 + mock :8791.

   POR QUE EXISTE. Reportado: «no entiendo como se anima, porque el personaje
   no esta en todos los frames, esta solo en el primer frame, pero el
   esqueleto si esta en todos».

   No estaba haciendo nada mal. En cut-out el dibujo se hace UNA vez y se
   SOSTIENE a lo largo del plano; lo que cambia cuadro a cuadro son las poses.
   Con el arte expuesto solo en el cuadro 1, del 2 en adelante el rig no tiene
   a quien mover.

   LO QUE FALLABA ERA LA PANTALLA, no el modelo:

   · El bloque del rig decia «Rig listo para animar · todas las piezas
     detectadas estan vinculadas», EN VERDE, mientras posar en el cuadro 12
     no movia nada. No miraba la exposicion.
   · La barra de estado si lo decia —«F12: este cuadro no tiene al personaje ·
     sostene su dibujo»— pero pedia una maniobra con una manija chica de la
     hoja de tiempos y no ofrecia la accion. Dos partes de la pantalla
     contando cosas distintas, y ninguna con el boton.

   LO QUE SE CUIDA:

   1. Cuando el personaje NO llega hasta donde llega la animacion, el panel lo
      DICE y deja de estar en verde.
   2. Y ofrece UN boton que lo resuelve.
   3. El boton SOSTIENE de verdad: despues, el cuadro lejano tiene al
      personaje.
   4. Y entonces posar ALLA mueve el dibujo — que es la unica prueba de que
      sirvio para algo.
   5. Sostener NO PISA lo que ya estaba expuesto: es un hold, no un borron.
   6. Cuando ya cubre el rango, el aviso NO aparece: un cartel permanente deja
      de leerse a la semana.
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
  await ev(`(async()=>{
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit();
    if (typeof closeL3d==="function") closeL3d();
    await wait(800);
    if (!DZ.anim && typeof dzAnimToggle==="function") { await dzAnimToggle(); await wait(700); }
    const hoja = document.querySelector("#dzCanvas > svg");
    [...hoja.querySelectorAll("path,rect,circle,ellipse,polygon")].forEach(n => {
      if (!n.closest(".dz-onion,.dz-penui,#dzRigOverlay") && n.getAttribute("data-paper") === null) n.remove(); });
    await wait(300); dzSetTool("pencil"); await wait(300); return true; })()`);
  for (const [x1, y1, x2, y2] of
      [[680,210,680,340],[680,240,570,290],[680,240,790,290],[680,340,620,470]])
    await trazo(x1, y1, x2, y2, 10);
  await w(500);

  // esqueleto + reparto, y una clave LEJOS: ahí es donde falta el personaje
  const montaje = await ev(`(async()=>{
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    if (!DZ.rigMode && typeof dzRigToggle==="function") { dzRigToggle(); await wait(800); }
    const s = document.querySelector("#rigLibrary"); if (s) s.value = "human_simple";
    document.querySelector("#rigLibraryAdd").click(); await wait(1200);
    document.querySelector("#rigRepartir").click(); await wait(1400);
    const n = Object.values(DZ.doc.scene.rig.nodes).filter(x => x.elementId)[0];
    if (!n) return { sinVinculos: true };
    DZ.doc.setRigKey(n.id, 1, { x:0, y:0, r:0, sx:1, sy:1 });
    DZ.doc.setRigKey(n.id, 12, { x:0, y:0, r:40, sx:1, sy:1 });
    if (typeof dzRigPanelSync === "function") dzRigPanelSync();
    await wait(600);
    return { hueso: n.id, pieza: n.elementId }; })()`);
  if (montaje.sinVinculos) mal("no se pudo montar un rig vinculado para medir", montaje);

  const MIRAR = `(() => {
    const c = typeof dzPersonajeHasta === "function" ? dzPersonajeHasta() : null;
    const box = document.getElementById("rigReadiness");
    const aviso = document.getElementById("rigSostener");
    return { cuenta: c,
      estadoDelBloque: box ? box.dataset.state : null,
      hayAviso: !!aviso,
      dice: aviso ? (aviso.querySelector(".rig-sostener-txt")||{}).textContent : null,
      hayBoton: !!(aviso && aviso.querySelector("button")) }; })()`;

  const antes = await ev(MIRAR);
  if (!antes.cuenta) mal("no se puede contar hasta dónde llega el personaje", antes);
  if (!antes.cuenta.falta)
    mal("el montaje no dejó al personaje corto: no se está midiendo nada", antes);

  // 1 y 2: lo dice, no queda en verde, y ofrece el botón
  if (!antes.hayAviso)
    mal("el personaje llega al cuadro " + antes.cuenta.expuesto + " y la animación al " +
        antes.cuenta.necesario + ", y el panel no lo dice", antes);
  if (antes.estadoDelBloque === "ready")
    mal("el bloque sigue en verde diciendo «listo para animar» con el personaje corto", antes);
  if (!antes.hayBoton) mal("lo dice pero no ofrece cómo resolverlo", antes);
  if (!/\d/.test(antes.dice || "")) mal("el aviso no dice hasta qué cuadro llega", antes);

  // 5: lo que ya estaba expuesto no se pisa
  const marcaPrevia = await ev(`(() => {
    const s = LOW.animation.sostenerPersonaje, ly = s.capa(DZ.doc);
    return { cuadro1: ly.cellAt(1) }; })()`);

  await ev(`document.querySelector("#rigSostener button").click()`);
  await w(900);
  const despues = await ev(MIRAR);

  // 3: sostuvo de verdad
  if (despues.cuenta.falta)
    mal("el botón no sostuvo al personaje: sigue faltando hasta el cuadro " + despues.cuenta.necesario, despues);
  // 6: y el aviso se va
  if (despues.hayAviso) mal("ya cubre el rango y el aviso sigue ahí", despues);

  const trasSostener = await ev(`(() => {
    const s = LOW.animation.sostenerPersonaje, ly = s.capa(DZ.doc);
    return { cuadro1: ly.cellAt(1), cuadro12: ly.cellAt(12) }; })()`);
  if (trasSostener.cuadro1 !== marcaPrevia.cuadro1)
    mal("sostener pisó lo que ya estaba expuesto en el cuadro 1", { marcaPrevia, trasSostener });
  if (trasSostener.cuadro12 == null)
    mal("después de sostener, el cuadro 12 sigue sin personaje", trasSostener);

  /* 7. F5, el atajo de Toon Boom. Confirmado en la documentación de Harmony
     22 (Timeline Keyboard Shortcuts): F5 = «Extend Exposure». Quien viene de
     ahí lo aprieta sin pensar, así que tiene que hacer lo mismo — y tiene
     que CORTAR el evento, porque F5 recarga la página en el navegador y en
     WebView2: perder el trabajo por pedir un sostenido sería peor que no
     tener el atajo. */
  const conF5 = await ev(`(async () => {
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    // se deja corto otra vez, para que haya algo que sostener
    const s = LOW.animation.sostenerPersonaje, ly = s.capa(DZ.doc);
    const n = Object.values(DZ.doc.scene.rig.nodes).filter(x => x.elementId)[0];
    for (let f = 2; f <= 20; f++) { try { ly.setCell(f, null); } catch (e) {} }
    DZ.doc.setRigKey(n.id, 16, { x:0, y:0, r:20, sx:1, sy:1 });
    if (typeof dzRigPanelSync === "function") dzRigPanelSync();
    await wait(400);
    return { antes: dzPersonajeHasta() }; })()`);
  if (conF5.antes && conF5.antes.falta) {
    let recargo = false;
    const alNavegar = () => { recargo = true; };
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "F5", code: "F5", windowsVirtualKeyCode: 116, nativeVirtualKeyCode: 116 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "F5", code: "F5", windowsVirtualKeyCode: 116, nativeVirtualKeyCode: 116 });
    await w(900);
    const trasF5 = await ev(`(() => ({ cuenta: dzPersonajeHasta(),
      siguePagina: typeof dzPersonajeHasta === "function" && !!DZ.doc }))()`);
    if (!trasF5.siguePagina)
      mal("F5 recargó la página: se pierde el trabajo por pedir un sostenido", { conF5, trasF5 });
    if (trasF5.cuenta && trasF5.cuenta.falta)
      mal("F5 no sostuvo al personaje (en Toon Boom Harmony F5 es «Extend Exposure»)",
          { antes: conF5.antes, despues: trasF5.cuenta });
  }

  // 4: la única prueba que importa — posar ALLÁ mueve el dibujo
  const posa = await ev(`(async () => {
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    if (typeof dzGoFrame === "function") { dzGoFrame(11); await wait(700); }
    const hoja = document.querySelector("#dzCanvas > svg");
    const el = hoja.querySelector("#" + CSS.escape(${JSON.stringify(montaje.pieza)}));
    if (!el) return { sinPieza: true };
    const a = el.getBoundingClientRect();
    DZ.doc.setRigKey(${JSON.stringify(montaje.hueso)}, dzRigCur(), { x:0, y:0, r:70, sx:1, sy:1 });
    if (typeof dzRigApplyLive === "function") dzRigApplyLive(dzRigCur());
    await wait(700);
    const el2 = hoja.querySelector("#" + CSS.escape(${JSON.stringify(montaje.pieza)}));
    const b = el2 ? el2.getBoundingClientRect() : null;
    return { corrimiento: b ? +Math.hypot(b.x - a.x, b.y - a.y).toFixed(1) : null,
      estado: (document.querySelector("#dzStatus")||{}).textContent.slice(0, 90) }; })()`);
  if (posa.sinPieza) mal("en el cuadro lejano la pieza no está en la mesa ni después de sostener", posa);
  if (!(posa.corrimiento > 1))
    mal("sostener puso al personaje pero posar allá sigue sin moverlo", posa);

  const crasheos = errores.filter((e) => /TypeError|ReferenceError/.test(e));
  if (crasheos.length) mal("sostener tiró errores", crasheos.slice(0, 3));

  console.log("E2E sostener al personaje OK " + JSON.stringify({ antes: antes.cuenta, despues: despues.cuenta, posa }));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
