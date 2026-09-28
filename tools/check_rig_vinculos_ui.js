/* EL VINCULO ENTRE HUESO Y DIBUJO TIENE QUE SOBREVIVIR.  CDP :9223 + mock.
 *
 * POR QUE EXISTE. Reportado tres veces con tres caras distintas: «una pieza no
 * quedo asociada al hueso como deberia», «hay una pieza que se mueve suelta
 * cuando muevo otras, como en espejo», y el cartel «animando solo el
 * esqueleto» apareciendo con el personaje a la vista. Las tres eran lo mismo.
 *
 * MEDIDO ANTES DEL ARREGLO, dibujando seis trazos con el lapiz y colocando el
 * esqueleto «Humano · stickman» de la biblioteca:
 *
 *   piezas en la mesa ................ 6
 *   piezas CON id .................... 0
 *   id guardados en el documento ..... 0
 *   vinculos que dejo Repartir ....... 6   (pieza_3 … pieza_8)
 *   vinculos que apuntan a algo real . 0
 *   posar un hueso movio .............. nada
 *
 * Y Repartir informaba «6 piezas repartidas entre 7 huesos».
 *
 * LA CAUSA. Un vinculo ES el id del elemento. El reparto le ponia un id a cada
 * pieza, pero solo al elemento VIVO de la mesa: nunca al documento. La mesa se
 * rearma desde el documento en cuanto algo la repinta —cambiar de cuadro,
 * volver de otro modo—, los id se van con el DOM viejo, y todos los vinculos
 * quedan apuntando a elementos que ya no existen.
 *
 * LO QUE SE CUIDA, y por que en este orden:
 *
 * 1. Despues de Repartir no queda NINGUN vinculo colgado.
 * 2. Los id estan GUARDADOS en el documento, no solo en la mesa. Esto es lo
 *    que de verdad fallaba: sin esto el punto 1 pasa igual, porque la mesa
 *    todavia no se repinto.
 * 3. Sobreviven a un REPINTADO (cambiar de cuadro y volver). Es el momento
 *    exacto en el que se perdian.
 * 4. Posar un hueso mueve SU pieza. Es la unica prueba de que el vinculo
 *    sirve para algo; los tres puntos anteriores pueden pasar y el personaje
 *    seguir quieto.
 * 5. Todo eso SOBREVIVE a guardar y volver a abrir. Un animador cierra el
 *    programa y vuelve al dia siguiente: si los vinculos no viajan en el
 *    archivo, los cuatro puntos anteriores pasan igual y el rig aparece roto
 *    recien manana, que es la peor forma de enterarse.
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
  for (let i = 0; i < 120; i++) {
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
      [[660,170,700,170],[680,210,680,340],[680,240,570,290],[680,240,790,290],[680,340,620,470],[680,340,740,470]])
    await trazo(x1, y1, x2, y2, 10);
  await w(600);

  await ev(`(async()=>{ const wait = ms => new Promise(x=>setTimeout(x,ms));
    if (!DZ.rigMode && typeof dzRigToggle==="function") { dzRigToggle(); await wait(800); }
    const s = document.querySelector("#rigLibrary"); if (s) s.value = "human_simple";
    document.querySelector("#rigLibraryAdd").click(); await wait(1200);
    document.querySelector("#rigRepartir").click(); await wait(1500); return true; })()`);

  const MIRAR = `(() => {
    const hoja = document.querySelector("#dzCanvas > svg");
    const nodos = Object.values(DZ.doc.scene.rig.nodes || {});
    const conArte = nodos.filter(n => n.elementId);
    const guardado = (DZ.doc.drawing && DZ.doc.drawing.content) || "";
    return { huesos: nodos.length, vinculos: conArte.length,
      colgados: conArte.filter(n => !hoja.querySelector("#" + CSS.escape(n.elementId))).map(n => n.elementId),
      idsGuardados: conArte.filter(n => guardado.indexOf('id="' + n.elementId + '"') >= 0).length,
      piezasEnLaMesa: [...hoja.querySelectorAll("path,rect,circle,ellipse,polygon")]
        .filter(n => !n.closest(".dz-onion,.dz-penui,#dzRigOverlay") && n.getAttribute("data-paper") === null).length };
  })()`;

  const recien = await ev(MIRAR);
  if (!recien.vinculos) mal("Repartir no vinculó ninguna pieza", recien);
  if (recien.colgados.length)
    mal("Repartir dejó vínculos que apuntan a elementos que no están en la mesa", recien);
  if (recien.idsGuardados < recien.vinculos)
    mal("los id de las piezas NO quedaron guardados en el documento: viven sólo en la mesa y " +
        "el primer repintado se los lleva, dejando todos los vínculos colgados", recien);

  // 3. el momento exacto en que se perdían: un repintado
  await ev(`(async()=>{ const wait = ms => new Promise(x=>setTimeout(x,ms));
    if (typeof dzGoFrame === "function") { dzGoFrame(1); await wait(600); dzGoFrame(0); await wait(700); }
    return true; })()`);
  const tras = await ev(MIRAR);
  if (tras.colgados.length)
    mal("después de cambiar de cuadro y volver, los vínculos quedaron colgados", tras);

  // 4. la única prueba que importa: posar mueve el dibujo
  const posa = await ev(`(async () => {
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    const hoja = document.querySelector("#dzCanvas > svg");
    const conArte = Object.values(DZ.doc.scene.rig.nodes || {}).filter(n => n.elementId);
    const suyo = conArte.find(n => n.parentId) || conArte[0];
    const el = hoja.querySelector("#" + CSS.escape(suyo.elementId));
    if (!el) return { sinElemento: true, pieza: suyo.elementId };
    const antes = el.getBoundingClientRect();
    DZ.doc.setRigKey(suyo.id, dzRigCur(), { x: 0, y: 0, r: 25, sx: 1, sy: 1 });
    if (typeof dzRigApplyLive === "function") dzRigApplyLive(dzRigCur());
    await wait(700);
    const el2 = hoja.querySelector("#" + CSS.escape(suyo.elementId));
    const desp = el2 ? el2.getBoundingClientRect() : null;
    return { hueso: suyo.id, pieza: suyo.elementId,
      corrimiento: desp ? +Math.hypot(desp.x - antes.x, desp.y - antes.y).toFixed(1) : null };
  })()`);
  if (posa.sinElemento) mal("la pieza vinculada no está en la mesa al posar", posa);
  if (!(posa.corrimiento > 1))
    mal("posar el hueso no movió su dibujo: el vínculo existe pero no sirve", posa);

  /* 5. GUARDAR Y VOLVER A ABRIR. Un animador cierra el programa y vuelve al
     dia siguiente. Si los vinculos no viajan en el archivo, todo lo anterior
     pasa igual y el rig aparece roto recien manana, que es la peor forma de
     enterarse. Se hace el viaje completo: serializar, reconstruir, repintar. */
  const viaje = await ev(`(async () => {
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    const texto = JSON.stringify(DZ.doc.toJSON());
    const doc2 = LOW.animation.LowDoc.fromJSON(JSON.parse(texto));
    DZ.doc = doc2;
    if (typeof dzCanvasSet === "function") dzCanvasSet((doc2.drawing && doc2.drawing.content) || "");
    if (typeof dzBuildLayers === "function") dzBuildLayers();
    if (typeof dzRigApplyLive === "function") dzRigApplyLive(0);
    await wait(900);
    const hoja = document.querySelector("#dzCanvas > svg");
    const c = Object.values(doc2.scene.rig.nodes || {}).filter(n => n.elementId);
    return { bytes: texto.length, vinculos: c.length,
      colgados: c.filter(n => !hoja.querySelector("#" + CSS.escape(n.elementId))).map(n => n.elementId),
      claves: Object.values(doc2.scene.rig.nodes || {}).reduce((s, n) => s + Object.keys(n.keys || {}).length, 0) };
  })()`);
  if (viaje.vinculos < tras.vinculos)
    mal("al guardar y reabrir se perdieron vínculos", { antes: tras.vinculos, despues: viaje.vinculos });
  if (viaje.colgados.length)
    mal("al guardar y reabrir los vínculos quedaron colgados: el rig se rompe recién al día siguiente", viaje);
  if (!viaje.claves)
    mal("al guardar y reabrir se perdieron las claves del rig", viaje);

  const crasheos = errores.filter((e) => /TypeError|ReferenceError/.test(e));
  if (crasheos.length) mal("el rig tiró errores", crasheos.slice(0, 3));

  console.log("E2E los vínculos del rig sobreviven OK " + JSON.stringify({ ...tras, posa, viaje }));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
