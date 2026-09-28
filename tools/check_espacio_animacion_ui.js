/* EL ESPACIO DE ANIMACION TIENE QUE MOSTRAR LA ANIMACION.
   CDP :9223 + mock :8791.

   POR QUE EXISTE ESTE RECORRIDO. Mauro, con un documento nuevo abierto:
   «el panel de animacion no muestra nada».

   Medido: creando un documento nuevo y tocando la pestaña «Animacion», DZ.anim
   quedaba en false y la grilla, la X-sheet, la tira de niveles y las capas se
   quedaban OCULTAS. Lo unico que aparecia era la barra de transporte.

   La causa: `dzAnimToggle()` arranca con

       if (!DZ.path) return sysMsg("Abri un diseno primero ...")

   y UN .low NO TIENE `DZ.path` —sus cuadros viven en el documento, no en un
   .svg del arbol—. O sea que el camino nuevo de documento entraba al espacio
   de Animacion y la Timeline nunca se encendia.

   Se prueba por los DOS caminos, porque solo uno estaba roto y el otro tapaba
   el agujero: un .svg suelto (que si tiene DZ.path) y un documento nuevo. */
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

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  // La ventana de Mauro: media pantalla. Es donde lo vio.
  await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 560, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('typeof dzMenuAction==="function" && !!api && !!window.LOW?.workspace?.workspaces').catch(() => false);
    if (listo === true) break;
    await w(400);
  }
  await ev('(()=>{ try{localStorage.clear()}catch(e){} return true; })()');

  const foto = () => ev(`(()=>{ const vive = sel => { const n = document.querySelector(sel);
      if (!n) return false; const r = n.getBoundingClientRect();
      return !n.hidden && r.width > 0 && r.height > 0; };
    return { espacio: LOW.workspace?.workspaces?.activeId, animEncendida: !!DZ.anim,
      hayDoc: !!DZ.doc, hayPath: !!DZ.path,
      transporte: vive("#dzTimeline"), grilla: vive("#dzTlGrid"), filas: vive("#dzTlgRows"),
      tiraNiveles: vive("#dzLevelStrip"), dock: vive("#dzAnimationDock"),
      aviso: document.querySelector("#dzStatus")?.textContent || "" }; })()`);

  const entrarAAnimacion = async () => {
    await ev(`(()=>{ const b = [...document.querySelectorAll('#dzWorkspaces > *')]
      .find(x => /Anima/i.test(x.textContent));
      if (!b) throw Error("no hay pestaña de Animación"); b.click(); return true; })()`);
    await w(1600);
    return foto();
  };

  // ── 1. DOCUMENTO NUEVO (.low): el camino por el que entra cualquiera que
  //       arranca LOW y aprieta «Nuevo documento». Es el que estaba roto.
  await ev(`dzMenuAction("nuevo")`);
  await w(2600);
  await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');
  const nuevo = await entrarAAnimacion();
  if (!nuevo.hayDoc) mal("«Nuevo documento» no dejó un documento abierto", nuevo);
  if (!nuevo.animEncendida)
    mal("con un documento NUEVO, entrar al espacio de Animación no enciende la " +
      "Timeline: un .low no tiene DZ.path y dzAnimToggle se va por «abrí un diseño " +
      "primero». El panel de animación no muestra nada", nuevo);
  for (const parte of ["transporte", "grilla", "filas", "tiraNiveles"])
    if (!nuevo[parte])
      mal("en el espacio de Animación no se ve «" + parte + "»: el panel de " +
        "animación tiene que mostrar la animación", nuevo);

  // ── 2. EL ESPACIO YA ERA ANIMACION AL CREAR EL DOCUMENTO. Este es el caso de
  //       la app real, y el que el mock tapaba: LOW recuerda el ultimo espacio
  //       usado, asi que quien trabaja en Animacion vuelve a entrar ahi. Con la
  //       barra de transporte YA visible, dzWsAplicar decidia «la timeline ya
  //       esta abierta» mirando si el div se ve —no si esta ENCENDIDA— y no la
  //       prendia nunca. Medido en la app instalada: DZ.anim en false con la
  //       barra de 1366x38 a la vista y todo lo demas oculto.
  await ev(`(()=>{ try{ localStorage.setItem("low.workspace.active","animation"); }catch(e){} return true; })()`);
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('typeof dzMenuAction==="function" && !!api && !!window.LOW?.workspace?.workspaces').catch(() => false);
    if (listo === true) break;
    await w(400);
  }
  await ev(`dzMenuAction("nuevo")`);
  await w(3000);
  await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');
  const recordado = await foto();
  if (recordado.espacio !== "animation")
    mal("el espacio recordado no se respetó: la prueba no está midiendo el caso", recordado);
  if (!recordado.animEncendida || !recordado.grilla || !recordado.tiraNiveles)
    mal("entrando a LOW con Animación como espacio recordado, la Timeline queda " +
      "APAGADA con la barra de transporte a la vista: el espacio decide si prenderla " +
      "mirando si el div se ve, no si está encendida. Es lo que Mauro ve: «el panel " +
      "de animación no tiene el sidebar»", recordado);

  // ── 3. EL CAMINO VIEJO (.svg suelto) sigue andando: es el que tapaba el
  //       agujero, y romperlo al arreglar el otro seria cambiar un defecto por otro.
  await ev(`(()=>{ const b = [...document.querySelectorAll('#dzWorkspaces > *')]
    .find(x => /Dibujo/i.test(x.textContent)); if (b) b.click(); return true; })()`);
  await w(900);
  await ev(`(async()=>{ await openDesign('mock.svg'); await dzDocInit();
    if (typeof closeL3d === "function") closeL3d(); })()`);
  await w(1200);
  const viejo = await entrarAAnimacion();
  if (!viejo.animEncendida || !viejo.grilla)
    mal("se rompió el camino viejo: con un .svg abierto el espacio de Animación " +
      "tampoco enciende", viejo);

  // ── 4. TODOS LOS ESPACIOS MUESTRAN LO QUE PROMETEN ──────────────────────
  //       Cada espacio declara sus paneles. Que uno diga «layers visible» y el
  //       CSS lo esconda no es un detalle: es lo que hace imposible auditar el
  //       resto, y fue como se me escapo el de Animacion. Se recorren los siete
  //       con un documento abierto y se exige que cada panel pedido SE VEA.
  const pendientes = await ev(`[...document.querySelectorAll('#dzWorkspaces > *')].map(b=>b.textContent.trim())`);
  const faltantes = [];
  for (const nombre of pendientes) {
    await ev(`(()=>{ const b = [...document.querySelectorAll('#dzWorkspaces > *')]
      .find(x => x.textContent.trim() === ` + JSON.stringify(nombre) + `); if (b) b.click(); return true; })()`);
    await w(1300);
    const r = await ev(`(()=>{ const cat = LOW.workspace.PANEL_CATALOG;
      const activa = LOW.workspace.workspaces.activeId;
      const def = LOW.workspace.workspaces.get(activa);
      const pedidos = (def?.panels || []).filter(p => !p.hidden).map(p => p.id);
      const faltan = [];
      for (const pid of pedidos) {
        const meta = cat[pid]; if (!meta) { faltan.push(pid + "(sin catálogo)"); continue; }
        const n = document.querySelector(meta.element);
        if (!n) { faltan.push(pid + "(sin nodo)"); continue; }
        const c = n.getBoundingClientRect();
        if (n.hidden || c.width <= 0 || c.height <= 0) faltan.push(pid);
      }
      return { activa, pedidos: pedidos.length, faltan }; })()`);
    if (r.faltan.length) faltantes.push({ espacio: r.activa, noSeVen: r.faltan });
  }
  if (faltantes.length)
    mal("hay espacios que prometen paneles que NO se ven: o el espacio no los " +
      "enciende, o su definición miente y hay que corregirla", faltantes);

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));

  console.log("E2E espacio Animación OK " + JSON.stringify({
    documentoNuevo: { anim: nuevo.animEncendida, grilla: nuevo.grilla, niveles: nuevo.tiraNiveles },
    svgSuelto: { anim: viejo.animEncendida, grilla: viejo.grilla }
  }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
