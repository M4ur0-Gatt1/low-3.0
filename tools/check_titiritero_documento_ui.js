/* EL TITIRITERO CON UN DOCUMENTO NUEVO. CDP :9223 + mock :8791.

   POR QUE EXISTE ESTE RECORRIDO. El titiritero captura la mesa muchas veces por
   segundo mientras movés el muñeco con la mano, y al cortar guarda la toma.
   Guardarla era escribir archivos `nombre_fNNN.svg` al lado del diseño:

       api.record_take(DZ.path, snaps)

   Con un `.low` eso no existe —`DZ.path` en null, y el puente encima exige que
   el archivo se llame `_fNNN.svg`—. Asi que con el flujo por defecto del
   programa, «Nuevo documento», el titiritero contestaba «abri un diseno
   primero» y no se podia actuar NADA.

   Es la misma familia que la exportacion sin ruta y que el espacio de Animacion
   apagado: codigo del camino viejo del .svg suelto que nadie porto al documento.
   Aca se exige que la toma quede GRABADA EN EL DOCUMENTO: dibujos nuevos en el
   nivel y cuadros expuestos despues del ultimo, sin pisar lo que ya habia. */
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

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('typeof dzPuppetToggle==="function" && typeof dzMenuAction==="function" && !!api').catch(() => false);
    if (listo === true) break;
    await w(400);
  }
  await ev('(()=>{ try{localStorage.clear()}catch(e){} return true; })()');

  await ev(`dzMenuAction("nuevo")`);
  await w(2800);
  await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');
  const antes = await ev(`(()=>{ if (!DZ.doc) return { error: "sin documento" };
    const sc = DZ.doc.scene, capa = DZ.doc.layer || sc.layers[0], nivel = sc.level(capa.levelId);
    const svg = document.querySelector('#dzCanvas > svg');
    const r = document.createElementNS(svg.namespaceURI, 'rect');
    r.setAttribute('x', 100); r.setAttribute('y', 100);
    r.setAttribute('width', 200); r.setAttribute('height', 200); r.setAttribute('fill', '#111');
    dzArtAppend(svg, r); dzDocCommit();
    return { path: DZ.path || null, ultimoCuadro: sc.lastFrame(),
      dibujos: nivel.numbers(), capa: capa.id }; })()`);
  if (antes.error) mal(antes.error, antes);
  if (antes.path) mal("el montaje no está midiendo el caso: este documento tiene DZ.path", antes);

  // ── ACTUAR: se arranca el titiritero y se corta, como una persona ────────
  await ev(`dzPuppetToggle()`);
  const arranco = await ev(`({ contando: !!(DZ.pup && DZ.pup.counting),
    aviso: document.querySelector('#dzStatus')?.textContent || "" })`);
  if (!arranco.contando)
    mal("el titiritero no arranca con un documento nuevo: contesta que abras un " +
      "diseño, y con «Nuevo documento» no hay ninguno que abrir", arranco);

  // la cuenta regresiva son ~2,1 s; después graba a los fps de la timeline
  await w(4200);
  const grabando = await ev(`({ grabando: !!(DZ.pup && DZ.pup.recording),
    capturas: (DZ.pup && DZ.pup.snaps || []).length })`);
  if (!grabando.grabando) mal("el titiritero no llegó a grabar", grabando);
  if (!grabando.capturas) mal("el titiritero graba sin capturar nada", grabando);

  await ev(`(async()=>{ await dzPuppetStop(); })()`);
  await w(1500);
  const despues = await ev(`(()=>{ const sc = DZ.doc.scene,
      capa = DZ.doc.layer || sc.layers[0], nivel = sc.level(capa.levelId);
    return { ultimoCuadro: sc.lastFrame(), dibujos: nivel.numbers(),
      aviso: document.querySelector('#dzStatus')?.textContent || "" }; })()`);

  if (/abr[íi] un dise/i.test(despues.aviso))
    mal("la toma no se guardó: el titiritero sigue pidiendo un .svg", despues);
  if (despues.dibujos.length <= antes.dibujos.length)
    mal("la actuación no dejó dibujos nuevos en el documento: se grabó en el aire", { antes, despues });
  if (despues.ultimoCuadro <= antes.ultimoCuadro)
    mal("la actuación no agregó cuadros a la escena", { antes, despues });
  // y no puede pisar lo que ya estaba: los dibujos viejos siguen ahí
  for (const n of antes.dibujos)
    if (!despues.dibujos.includes(n))
      mal("la toma PISÓ un dibujo que ya existía: una actuación se agrega atrás, " +
        "no reemplaza lo animado", { antes, despues });

  // ── 2. LOS GENERADORES DE MOVIMIENTO, misma familia ─────────────────────
  //       «recorrido», «caminata» y «rebote» insertaban cada cuadro con
  //       api.insert_frame(DZ.path,...), que escribe archivos _fNNN.svg. Sin
  //       DZ.path no podian generar NADA. Ahora los cuadros entran al documento
  //       DESPUES del actual, corriendo lo que seguia (insertar de OpenToonz).
  const antesTween = await ev(`(()=>{ const sc = DZ.doc.scene,
      capa = DZ.doc.layer || sc.layers[0];
    DZ.doc.goTo(2);
    return { cuadro: DZ.doc.frame, celdas: capa.cells.slice(0, 6), ultimo: sc.lastFrame() }; })()`);
  const tween = await ev(`(async()=>{
    const base = dzSerialize(document.querySelector('#dzCanvas > svg'));
    const primero = document.querySelector('#dzCanvas > svg rect');
    if (!primero) return { error: "sin elemento que mover" };
    // el "camino" es la lista de indices de hijo desde la raiz (ver dzElAt)
    const elPath = (() => { const camino = []; let n = primero;
      const raiz = document.querySelector('#dzCanvas > svg');
      while (n && n !== raiz) { camino.unshift([...n.parentNode.children].indexOf(n)); n = n.parentNode; }
      return camino; })();
    const err = await dzTweenFrames(base, elPath, [[10,0],[20,0],[30,0]]);
    return { err: err || null }; })()`);
  if (tween.error) mal("el montaje del recorrido falló", tween);
  if (tween.err)
    mal("generar un recorrido con un documento nuevo falla: los cuadros se insertaban " +
      "como archivos _fNNN.svg y un .low no los tiene", tween);
  const despuesTween = await ev(`(()=>{ const sc = DZ.doc.scene,
      capa = DZ.doc.layer || sc.layers[0];
    return { celdas: capa.cells.slice(0, 8), ultimo: sc.lastFrame() }; })()`);
  if (despuesTween.ultimo < antesTween.ultimo + 3)
    mal("el recorrido no agregó sus tres cuadros al documento", { antesTween, despuesTween });
  // y lo que estaba DESPUÉS del cuadro actual se corrió, no se pisó
  if (despuesTween.celdas[1] !== antesTween.celdas[1])
    mal("el recorrido pisó el cuadro donde estaba parado en vez de insertar después",
      { antesTween, despuesTween });
  if (despuesTween.celdas[5] !== antesTween.celdas[2])
    mal("insertar cuadros no corrió los que seguían: se perdió lo que ya estaba animado",
      { antesTween, despuesTween });

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));

  console.log("E2E titiritero OK " + JSON.stringify({
    recorrido: antesTween.ultimo + "→" + despuesTween.ultimo,
    capturas: grabando.capturas,
    cuadros: antes.ultimoCuadro + "→" + despues.ultimoCuadro,
    dibujos: antes.dibujos.length + "→" + despues.dibujos.length
  }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
