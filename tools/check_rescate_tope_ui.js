/* EL ALMACEN DE RESCATE TIENE QUE TENER FONDO. CDP :9223 + mock :8791.

   POR QUE EXISTE. Cada escena que se abre deja su punto de recuperacion y NADA
   los borraba. MEDIDO en la maquina de pruebas el 27-sep-2026: 64 escenas
   viejas guardadas, de 2,5 a 12 KB cada una.

   El navegador da ~5 MB por origen. Cuando se llena, `setItem` TIRA, el catch
   se lo tragaba y `saveNow` devolvia false: LOW dejaba de guardar el rescate
   EN SILENCIO. El dia que se cierra mal no hay nada que recuperar, y nada dijo
   por que. Es el peor defecto posible en el unico lugar que existe para no
   perder el trabajo.

   Se exige:
   1. El almacen se poda solo: guardar muchas escenas no deja un historial
      infinito, y lo que sobrevive es lo MAS NUEVO.
   2. Con la cuota casi llena, guardar el rescate SIGUE FUNCIONANDO: se hace
      lugar tirando lo mas viejo. Perder un rescate viejo es barato; perder el
      de ahora, no. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map();
  ws.onmessage = event => { const m = JSON.parse(event.data);
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
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    if (await ev('!!window.LOW?.workspace?.sceneRecovery').catch(() => false) === true) break;
    await w(400);
  }
  await ev('(()=>{ try{localStorage.clear()}catch(e){} return true; })()');

  // ── 1. GUARDAR MUCHAS NO DEJA UN HISTORIAL INFINITO ──────────────────────
  const podado = await ev(`(()=>{ const store = LOW.workspace.sceneRecovery;
    const escena = (n) => ({ format: "lowscene", scene: { id: "sc_prueba_" + n, name: "Escena " + n,
      fps: 24, width: 1920, height: 1080, layers: [], levels: [] } });
    for (let n = 1; n <= 30; n++) store.saveNow("scene:sc_prueba_" + n, escena(n), { name: "Escena " + n });
    const quedan = store.list();
    return { cuantos: quedan.length,
      nombres: quedan.map(r => r.name),
      claves: Object.keys(localStorage).filter(k => /scene%3Asc_prueba/.test(k)).length }; })()`);
  if (podado.cuantos > 16)
    mal("el almacén de rescate no se poda: guardar 30 escenas dejó " + podado.cuantos +
      " puntos de recuperación. Con eso se llena la cuota del navegador y el rescate " +
      "deja de guardarse EN SILENCIO", podado);
  if (podado.claves !== podado.cuantos)
    mal("quedaron claves huérfanas en el almacén: el índice dice una cosa y el " +
      "localStorage tiene otra", podado);
  // lo que sobrevive tiene que ser lo MAS NUEVO
  if (!podado.nombres.includes("Escena 30"))
    mal("la poda se llevó la escena más nueva: justo la que hace falta recuperar", podado);

  // ── 2. CON LA CUOTA LLENA, EL RESCATE DE AHORA SE GUARDA IGUAL ───────────
  const conCuota = await ev(`(async()=>{ const store = LOW.workspace.sceneRecovery;
    const escena = (n) => ({ format: "lowscene", scene: { id: "sc_gordo_" + n, name: "Gorda " + n,
      fps: 24, width: 1920, height: 1080, layers: [], levels: [],
      relleno: "x".repeat(140000) } });                    // ~140 KB por escena
    // Se llena con lo que LOW mismo guarda —escenas gordas—, que es como se
    // llena en la vida real. Llenarlo con datos ajenos probaria otra cosa: LOW
    // no puede ni debe borrar lo que no es suyo.
    let puestas = 0, lleno = false;
    for (let n = 1; n <= 60 && !lleno; n++) {
      try { localStorage.setItem("low.scene.recovery.v2.scene%3Asc_gordo_" + n,
        JSON.stringify({ schema: 2, kind: "lowscene", identity: "scene:sc_gordo_" + n,
          name: "Gorda " + n, savedAt: Date.now() - (60 - n) * 1000, metadata: {},
          content: escena(n) })); puestas++; }
      catch (_) { lleno = true; }
    }
    // y el índice tiene que conocerlas, o la poda no sabe qué tirar
    try { localStorage.setItem("low.scene.recovery.v2.index",
      JSON.stringify(Array.from({ length: puestas }, (_, i) => "scene:sc_gordo_" + (i + 1)))); }
    catch (_) { /* si no entra ni el indice, la poda igual lo resuelve */ }
    const guardo = store.saveNow("scene:sc_ahora", escena(99), { name: "La de ahora" });
    const leido = store.get("scene:sc_ahora");
    return { lleno, puestas, guardo, recuperable: !!leido && leido.name === "La de ahora" }; })()`);
  if (!conCuota.lleno)
    mal("no se llegó a llenar el almacenamiento: la prueba no está midiendo el caso", conCuota);
  if (!conCuota.guardo || !conCuota.recuperable)
    mal("con el almacenamiento lleno, LOW deja de guardar el punto de recuperación y " +
      "no lo dice: el día que se cierra mal no hay nada que recuperar", conCuota);

  await ev('(()=>{ try{localStorage.clear()}catch(e){} return true; })()');
  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  console.log("E2E tope del rescate OK " + JSON.stringify({
    tras30: podado.cuantos + " puntos", masNueva: podado.nombres[0],
    conCuotaLlena: conCuota.guardo ? "se guardó igual" : "no"
  }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
