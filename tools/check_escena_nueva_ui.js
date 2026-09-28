/* UN DOCUMENTO NUEVO ES UN ARCHIVO .low.
   CDP :9223 + mock :8791.

   POR QUE EXISTE ESTE RECORRIDO. Mauro pregunto si ya existian los archivos
   `.low`. Se midio su workspace: **157 dibujos sueltos `diseno_*.svg` —138 de
   ellos en blanco, de 323 bytes— y CERO `.low`**. El formato propio del
   programa no lo usaba nadie, porque «Nuevo documento» escribia un SVG suelto y
   la escena —capas, exposiciones, rig, camara— se quedaba en memoria hasta que
   alguien apretara Guardar y pasara por el dialogo.

   LO QUE SE PERSIGUE, en orden de gravedad:

   1. QUE EL ARCHIVO EXISTA ANTES DE EMPEZAR A TRABAJAR, y que sea `.low`. Un
      documento que todavia no es un archivo es trabajo que se pierde si algo
      sale mal.
   2. QUE LO ESCRITO SEA LA ESCENA DE VERDAD: JSON del modelo, con su nivel, su
      capa y el dibujo 1 expuesto. Un `.low` vacio o con otra cosa adentro seria
      peor que no tenerlo, porque parece que hay trabajo guardado.
   3. QUE Ctrl+S GUARDE EN ESE ARCHIVO, sin dialogo. Si volviera a preguntar,
      estariamos donde empezamos.
   4. QUE NO SE SIEMBRE UN SVG SUELTO al crear.
   5. Que el documento quede abierto y usable: pestaña, titulo y papel en la
      hoja —no un damero vacio—. */
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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 180000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate",
    { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const clickEn = async (sel) => {
    const caja = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});
      if(!e) return null; const r=e.getBoundingClientRect(); if(!r.width||!r.height) return null;
      return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};})()`);
    if (!caja) throw Error("no pude clickear " + sel);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: caja.x, y: caja.y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: caja.x, y: caja.y, button: "left", buttons: 1, clickCount: 1 });
    await w(80);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: caja.x, y: caja.y, button: "left", buttons: 0, clickCount: 1 });
  };

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('typeof dzEscenaNueva==="function" && typeof dzMenuAction==="function" && !!api').catch(() => false);
    if (listo === true) break;
    await w(400);
  }

  // Espías: ni el .svg suelto ni el diálogo de guardar pueden aparecer solos.
  await ev(`(()=>{
    try{localStorage.clear()}catch(e){}
    window.__svgSueltos = 0; window.__guardados = [];
    const nuevoSvg = api.new_design;
    api.new_design = (...a) => { window.__svgSueltos++; return nuevoSvg.apply(api, a); };
    const guardar = api.save_file;
    api.save_file = (ruta, contenido, sugerido) => {
      window.__guardados.push({ ruta:String(ruta||""), sugerido:String(sugerido||""), bytes:(contenido||"").length });
      return guardar ? guardar.call(api, ruta, contenido, sugerido)
        : { path: String(ruta||"C:/mock/escena_1.low"), name:"escena_1.low" };
    };
    return true;
  })()`);

  // ── 1. «Nuevo documento» por el camino de la primera pantalla
  const invitacion = await ev(`!!document.querySelector('.bien2d [data-a="nuevo"]')`);
  if (invitacion) await clickEn('.bien2d [data-a="nuevo"]');
  else await ev('dzMenuAction("nuevo")');

  let creado = null;
  for (let i = 0; i < 40; i++) {
    creado = await ev(`(()=>{ const e = (window.__lowEscenas||[])[0];
      if(!e || !DZ.doc) return null;
      return { ruta: e.path, nombre: e.name, contenido: e.content,
        docPath: String(DZ.doc.path||""), svgPath: String(DZ.path||""),
        svgSueltos: window.__svgSueltos, sucio: !!DZ.doc.dirty,
        titulo: (document.querySelector("#dzTitle")||{}).textContent||"",
        estudioVisible: !document.querySelector("#designView").hidden,
        pestanas: (DZ.documentTabs||[]).length,
        papel: !!document.querySelector('#dzCanvas > svg [data-low-page]') };})()`);
    if (creado) break;
    await w(400);
  }

  if (!creado) mal("«Nuevo documento» NO creó ningún archivo de escena: el trabajo " +
    "arranca sin existir en el disco", { invitacion, svgSueltos: await ev("window.__svgSueltos") });
  if (!/\.low$/i.test(creado.ruta))
    mal("el documento nuevo no es un archivo .low", creado);
  if (creado.docPath !== creado.ruta)
    mal("el documento abierto no apunta al archivo que se acaba de crear: Ctrl+S " +
      "no sabría dónde guardar", creado);
  if (creado.svgSueltos !== 0)
    mal("crear un documento sigue sembrando un SVG suelto en disenos/: son los 138 " +
      "archivos en blanco que aparecieron al medir el workspace", creado);
  if (creado.svgPath)
    mal("quedó además un dibujo suelto como documento activo", creado);

  // ── 2. lo que se escribió ES la escena
  let escena = null;
  try { escena = JSON.parse(creado.contenido); } catch (_) { /* lo dice la aserción */ }
  if (!escena) mal("lo que se escribió en el .low no es JSON: el archivo existe pero no " +
    "se puede abrir, que es peor que no tenerlo", { muestra: String(creado.contenido).slice(0, 120) });
  const sc = escena.scene || escena;
  const niveles = (sc.levels || []).length, capas = (sc.layers || []).length;
  const dibujos = ((sc.levels || [])[0] || {}).drawings || [];
  if (!niveles || !capas)
    mal("el .low salió sin nivel ni capa: no es una escena, es un archivo vacío con " +
      "nombre de escena", { niveles, capas });
  if (!dibujos.length || !String(dibujos[0].content || "").includes("data-low-page"))
    mal("el .low salió sin el dibujo 1 con su papel: al abrirlo no habría hoja donde " +
      "dibujar", { dibujos: dibujos.length, muestra: String((dibujos[0] || {}).content || "").slice(0, 80) });
  if (!creado.papel)
    mal("el documento abrió sin papel en la hoja: el damero vacío es justo lo que " +
      "hace parecer que el programa está roto", creado);
  if (!creado.estudioVisible || creado.pestanas < 1)
    mal("el documento nuevo no quedó abierto y con su pestaña", creado);
  if (creado.sucio)
    mal("el documento nuevo nace «con cambios sin guardar», así que cerrarlo pregunta " +
      "por un trabajo que nadie hizo", creado);

  // ── 3. Ctrl+S guarda EN ESE ARCHIVO, sin diálogo
  await ev(`(()=>{ const p=document.createElementNS("http://www.w3.org/2000/svg","path");
    p.setAttribute("d","M100 100 L 500 400"); p.setAttribute("stroke","#111");
    p.setAttribute("stroke-width","6"); p.setAttribute("fill","none");
    document.querySelector('#dzCanvas > svg').appendChild(p);
    dzDocCommit(); return true; })()`);
  await w(400);
  await send("Input.dispatchKeyEvent", { type: "keyDown", key: "s", code: "KeyS", modifiers: 2, windowsVirtualKeyCode: 83 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "s", code: "KeyS", modifiers: 2, windowsVirtualKeyCode: 83 });
  let guardado = null;
  for (let i = 0; i < 30; i++) {
    guardado = await ev(`(()=>{ const g=(window.__guardados||[])[0]; if(!g) return null;
      return { ...g, docPath:String(DZ.doc?.path||""), sucio:!!DZ.doc?.dirty }; })()`);
    if (guardado) break;
    await w(300);
  }

  // ── 4. ABRIR UN .low QUE YA EXISTE no puede vaciarlo. Es la otra mitad, y es
  //       la que perdía trabajo: sin hoja de dibujo en el lienzo —el caso de
  //       arrancar y abrir, que es lo que ofrece la primera pantalla— el editor
  //       escribía el dibujo en la hoja de ROTOSCOPÍA, que está oculta, y el
  //       primer commit leía el lienzo vacío y lo escribía ENCIMA del documento.
  const abierto = await ev(`(async()=>{
    const A = LOW.animation, doc = new A.LowDoc();
    doc.scene.setSize(1920,1080);
    const capa = doc.scene.layers[0], nivel = doc.scene.level(capa.levelId);
    nivel.addDrawing(1, '<rect data-low-page="1" x="0" y="0" width="1920" height="1080" fill="#ffffff"/>' +
      '<path id="trazo-viejo" d="M100 100 L 900 900" stroke="#111111" stroke-width="8" fill="none"/>');
    doc.scene.expose(capa.id, 1, 1);
    (window.__lowFiles = window.__lowFiles || {})["C:/mock/con-dibujo.low"] =
      { path:"C:/mock/con-dibujo.low", name:"con-dibujo.low", content: JSON.stringify(doc.toJSON()) };
    const ok = await dzSceneOpen("C:/mock/con-dibujo.low");
    await new Promise(r=>setTimeout(r,700));
    const enPantalla = !!document.querySelector('#dzCanvas > svg #trazo-viejo');
    // y el commit de siempre, que es el que borraba
    dzDocCommit();
    await new Promise(r=>setTimeout(r,400));
    return { ok, enPantalla,
      largoEnElModelo: (DZ.doc && DZ.doc.drawing || {}).content?.length || 0,
      trazoEnElModelo: String((DZ.doc && DZ.doc.drawing || {}).content || "").includes("trazo-viejo"),
      hojaEsOverlay: ["dzRigOverlay","dzMocapSheet","dzMeshOverlay"]
        .includes((document.querySelector('#dzCanvas > svg')||{}).id) };
  })()`);
  if (!abierto.ok) mal("no se pudo abrir un .low con dibujo adentro", abierto);
  if (abierto.hojaEsOverlay)
    mal("la hoja del dibujo es una hoja del EDITOR (rotoscopía, esqueleto o malla): " +
      "todo lo que se dibuje va a parar a un overlay oculto", abierto);
  if (!abierto.enPantalla)
    mal("se abrió un .low con dibujo y en la hoja no se ve NADA", abierto);
  if (!abierto.trazoEnElModelo || abierto.largoEnElModelo < 100)
    mal("abrir el .low VACIÓ el documento: el commit siguiente escribió el lienzo " +
      "vacío encima del dibujo, y un Ctrl+S dejaría el archivo en blanco en el disco",
      abierto);

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }

  if (!guardado) mal("Ctrl+S no guardó nada con un documento nuevo abierto", creado);
  if (guardado.ruta !== creado.ruta)
    mal("Ctrl+S no guardó en el archivo del documento —mandó la ruta vacía, que es la " +
      "que abre el diálogo—: el .low recién creado quedaría sin los cambios",
      { pidio: guardado.ruta, esperaba: creado.ruta });
  if (guardado.bytes < 200)
    mal("lo que se mandó a guardar es demasiado chico para ser la escena", guardado);

  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));

  console.log("E2E escena nueva OK " + JSON.stringify({
    archivo: creado.nombre, svgSueltos: creado.svgSueltos,
    escena: { niveles, capas, dibujos: dibujos.length },
    ctrlS: { enElArchivo: true, bytes: guardado.bytes },
    abrirUnLow: { seVe: abierto.enPantalla, noLoVacia: abierto.trazoEnElModelo },
  }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
