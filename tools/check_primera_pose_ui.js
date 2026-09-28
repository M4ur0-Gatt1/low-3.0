/* LA PRIMERA POSE NO SE PIERDE AL POSAR MAS ADELANTE.
   CDP :9223 + mock :8791.

   POR QUE EXISTE. MEDIDO en v4.50.0: con el personaje vinculado y sostenido,
   se clava UNA sola pose en el cuadro 8 y el cuadro 1 se mueve LOS MISMOS
   55 px. La primera pose se destruye y nadie avisa.

   No es un error de cuenta: con una sola clave esa pose vale para todos los
   cuadros —el modelo devuelve la primera clave para todo lo anterior, que es
   correcto—. Lo que falta es la clave en el cuadro 1. Toon Boom Harmony lo
   advierte en su guia de cut-out: «make sure there is a keyframe on the first
   frame of every layer of the model. This ensures that when you make the
   second pose later, your first pose will not be affected». Harmony te lo
   hace poner a mano; aca se pone solo y se avisa.

   LO QUE SE CUIDA:

   1. Al clavar la PRIMERA pose de un hueso en un cuadro que no es el 1,
      aparece tambien una clave en el 1.
   2. El cuadro 1 queda EXACTAMENTE quieto —cero pixeles— mientras el cuadro
      posado se mueve de verdad.
   3. Se DICE. Meter una clave que el animador no pidio sin avisar es otra
      forma de sorprenderlo.
   4. Si el hueso YA tiene claves, no se le agrega ninguna: ahi el animador
      esta trabajando con su propio timing y meterle claves es peor que no
      hacer nada.
   5. Y sobre todo: una pose HECHA en el cuadro 1 es sagrada. Si alguien posa
      en el 1 y despues en el 9, la proteccion no puede pisarle el 1 con el
      reposo — seria destruir exactamente lo que dice cuidar.

   UN ERROR MIO QUE CASI QUEDA ESCRITO COMO DEFECTO. La primera version de
   este guardia media el cuadro 1 con `dzGoFrame(1)`, y esa funcion es BASE
   CERO: hace `goTo(i + 1)`, asi que estaba midiendo el cuadro 2. La pose
   interpolada de ahi —45 grados por 1/7 = 6.43, unos 7 px— la tome por un
   «residuo del reposo» y llegue a anunciar un defecto del vinculo que NO
   EXISTE. La aritmetica fue la que lo delato: 6.43 es exactamente 45/7.
   Corregido el indice, el cuadro 1 se mueve CERO. Por eso el umbral de abajo
   es cero y no un porcentaje: cuando la medicion esta bien, el resultado es
   exacto y no hay por que aflojar la vara.

   `setRigKey` toma el cuadro tal cual (base uno) y `dzGoFrame` es base cero.
   Mezclarlos es facil y no avisa.

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
    if (typeof dzSostenerPersonaje === "function") dzSostenerPersonaje();
    await wait(700);
    const n = Object.values(DZ.doc.scene.rig.nodes).filter(x => x.elementId)[0];
    if (!n) return { sinVinculos: true };
    const hoja = document.querySelector("#dzCanvas > svg");
    /* OJO: dzGoFrame es BASE CERO —hace goTo(i + 1)—, mientras que setRigKey
       toma el cuadro tal cual (base uno). Mezclarlos me hizo medir el cuadro 2
       creyendo que era el 1, y tomar la pose interpolada de ahi —45 grados por
       1/7 = 6.43— por un defecto de reposo que no existe.
       (Sin comillas invertidas: esto vive DENTRO de un template literal.) */
    const donde = async (f) => { dzGoFrame(f - 1); await wait(500);
      const el = hoja.querySelector("#" + CSS.escape(n.elementId));
      const b = el ? el.getBoundingClientRect() : null;
      return b ? [Math.round(b.x), Math.round(b.y)] : null; };
    const dist = (a, b) => (a && b) ? +Math.hypot(b[0]-a[0], b[1]-a[1]).toFixed(1) : null;

    const f1 = await donde(1), f8 = await donde(8);
    // CONTROL DE RUIDO: ir y volver sin tocar nada no puede mover la pieza
    const ruido = dist(f1, await donde(1));

    dzGoFrame(7); await wait(400);                      // base cero: el cuadro 8
    dzRigSetKey(n.id, 8, { x:0, y:0, r:45, sx:1, sy:1 });
    await wait(600);
    const aviso = (document.querySelector("#dzStatus")||{}).textContent || "";
    const claves = Object.keys(DZ.doc.scene.rig.nodes[n.id].keys || {});
    const f1b = await donde(1), f8b = await donde(8);

    // 4. un hueso QUE YA TIENE claves no recibe ninguna de regalo
    const otro = Object.values(DZ.doc.scene.rig.nodes).filter(x => x.elementId && x.id !== n.id)[0];
    let yaTenia = null;
    if (otro) {
      dzRigSetKey(otro.id, 5, { x:0, y:0, r:10, sx:1, sy:1 });   // primera: le pone la del 1
      const trasPrimera = Object.keys(DZ.doc.scene.rig.nodes[otro.id].keys || {}).sort();
      dzRigSetKey(otro.id, 9, { x:0, y:0, r:20, sx:1, sy:1 });   // segunda: NO debe agregar nada
      const trasSegunda = Object.keys(DZ.doc.scene.rig.nodes[otro.id].keys || {}).sort();
      yaTenia = { trasPrimera, trasSegunda };
    }
    /* 5. UNA POSE HECHA EN EL CUADRO 1 ES SAGRADA. Si alguien posa en el 1 y
       despues en el 9, la proteccion no puede pisarle el 1 con el reposo: eso
       seria destruir exactamente lo que dice cuidar. */
    const tercero = Object.values(DZ.doc.scene.rig.nodes)
      .filter(x => x.elementId && x.id !== n.id && (!otro || x.id !== otro.id))[0];
    let poseEnElUno = null;
    if (tercero) {
      dzRigSetKey(tercero.id, 1, { x: 0, y: 0, r: 33, sx: 1, sy: 1 });
      const antesDelNueve = { ...DZ.doc.scene.rig.nodes[tercero.id].keys[1] };
      dzRigSetKey(tercero.id, 9, { x: 0, y: 0, r: 60, sx: 1, sy: 1 });
      const despuesDelNueve = { ...DZ.doc.scene.rig.nodes[tercero.id].keys[1] };
      poseEnElUno = { antesDelNueve, despuesDelNueve };
    }
    return { hueso: n.id, ruido, claves, aviso: aviso.slice(0, 120), poseEnElUno,
      cuadro1SeMovio: dist(f1, f1b), cuadro8SeMovio: dist(f8, f8b), yaTenia };
  })()`);

  if (r.sinVinculos) mal("no se pudo montar un rig vinculado para medir", r);
  if (r.ruido > 1) mal("la medición se mueve sola: no prueba nada", r);
  // 1. la clave en el 1 aparece
  if (!r.claves.includes("1"))
    mal("clavar la primera pose en el cuadro 8 no dejó clave en el cuadro 1: la primera pose " +
        "se pierde y nadie avisa", r);
  if (!r.claves.includes("8")) mal("no quedó la clave que se pidió", r);
  // 2. el cuadro 1 queda casi quieto mientras el 8 se mueve
  if (!(r.cuadro8SeMovio > 5)) mal("el cuadro posado no se movió: el montaje no mide nada", r);
  if (r.cuadro1SeMovio > 1)
    mal("posar en el cuadro 8 arrastró al cuadro 1: se movió " + r.cuadro1SeMovio +
        " px de los " + r.cuadro8SeMovio + " del cuadro posado · con la clave de reposo " +
        "puesta tiene que quedarse EXACTAMENTE quieto", r);
  // 3. lo dice
  if (!/cuadro 1|reposo/i.test(r.aviso))
    mal("puso una clave que nadie pidió sin decirlo", r);
  // 4. no se mete con un hueso que ya tiene claves
  /* La segunda pose tiene que agregar EXACTAMENTE la clave que se pidió (la
     del 9) y ninguna más. Comparar largos —como hacía la primera versión de
     este check— acusaba al módulo por la clave que el animador sí pidió. */
  if (r.yaTenia) {
    const esperado = [...new Set([...r.yaTenia.trasPrimera, "9"])].sort();
    const quedaron = [...r.yaTenia.trasSegunda].sort();
    if (JSON.stringify(quedaron) !== JSON.stringify(esperado))
      mal("la segunda pose dejó claves que nadie pidió: se esperaba " + esperado.join(",") +
          " y quedaron " + quedaron.join(",") + " · en un hueso que ya tiene claves manda el " +
          "timing del animador", r.yaTenia);
  }

  // 5. una pose hecha en el cuadro 1 no se pisa
  if (r.poseEnElUno) {
    const a = r.poseEnElUno.antesDelNueve, b = r.poseEnElUno.despuesDelNueve;
    if (JSON.stringify(a) !== JSON.stringify(b))
      mal("posar en el cuadro 9 le pisó la pose que había en el cuadro 1: era r=" +
          a.r + " y quedó r=" + b.r + " · proteger la primera pose no puede destruirla", r.poseEnElUno);
  }

  const crasheos = errores.filter((e) => /TypeError|ReferenceError/.test(e));
  if (crasheos.length) mal("protegerla tiró errores", crasheos.slice(0, 3));

  console.log("E2E la primera pose no se pierde OK " + JSON.stringify(r));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
