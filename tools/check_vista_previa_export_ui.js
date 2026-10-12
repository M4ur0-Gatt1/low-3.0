/* ▶ VISTA PREVIA DE LA EXPORTACIÓN. CDP :9223 + mock :8791.

   Pedido de Mauro (v3.23): «quiero poder reproducir una preview antes de
   exportar, dentro de la pantalla». Antes, lo que salía del export —el tramo
   In/Out, por la cámara, con el rig y los cuadros vacíos como papel— se veía
   recién al abrir el archivo.

   Se recorre con clics y teclas de verdad:
   1. El modal de exportar ofrece «▶ Vista previa» y abre el reproductor.
   2. Prepara TODOS los cuadros del tramo y muestra el dibujo correcto de cada
      uno (se mide el píxel: el cuadro 1 tiene el dibujo a la izquierda, el 4 a
      la derecha).
   3. Las flechas recorren cuadro a cuadro y hacen sonar el pedacito de audio.
   4. Espacio reproduce (la vista previa, no la mano del lienzo ni la timeline),
      con el audio desde el cuadro donde está; en bucle vuelve a empezar y
      vuelve a arrancar el audio; Espacio pausa y corta el audio.
   5. Sin bucle, se detiene en el último cuadro.
   6. Esc cierra: corta la reproducción y el audio, sin bucle de fondo.
   7. Los botones de exportar de la vista previa exportan de verdad. */
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
    let caja = null;
    for (let i = 0; i < 25 && !caja; i++) {
      caja = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});
        if(!e) return null; const r=e.getBoundingClientRect(); if(!r.width||!r.height) return null;
        return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};})()`);
      if (!caja) await w(200);
    }
    if (!caja) throw Error("no pude clickear " + sel);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: caja.x, y: caja.y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: caja.x, y: caja.y, button: "left", buttons: 1, clickCount: 1 });
    await w(80);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: caja.x, y: caja.y, button: "left", buttons: 0, clickCount: 1 });
  };
  const TECLAS = {
    Space: { key: " ", code: "Space", keyCode: 32, text: " " },
    ArrowRight: { key: "ArrowRight", code: "ArrowRight", keyCode: 39 },
    ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", keyCode: 37 },
    Escape: { key: "Escape", code: "Escape", keyCode: 27 },
  };
  const tecla = async (nombre) => {
    const k = TECLAS[nombre];
    await send("Input.dispatchKeyEvent", { type: k.text ? "keyDown" : "rawKeyDown", key: k.key, code: k.code,
      windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode, text: k.text });
    await w(40);
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: k.key, code: k.code,
      windowsVirtualKeyCode: k.keyCode, nativeVirtualKeyCode: k.keyCode });
    await w(60);
  };
  const estado = () => ev(`(LOW.animation.vistaPrevia && LOW.animation.vistaPrevia.estado()) || null`);
  /** Cuán oscura es cada mitad del cuadro que se VE en el lienzo. */
  const mitades = () => ev(`(()=>{ const c = document.getElementById("lowPrevLienzo"); if (!c) return null;
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let izq = 0, der = 0;
    for (let y = 0; y < c.height; y += 4) for (let x = 0; x < c.width; x += 4) {
      const o = (y * c.width + x) * 4, oscuro = d[o] < 100 ? 1 : 0;
      if (x < c.width / 2) izq += oscuro; else der += oscuro; }
    return { izq, der, w: c.width, h: c.height }; })()`);

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('document.readyState==="complete"&&typeof dzExportModal==="function"&&typeof dzDoExportDoc==="function"&&!!api').catch(() => false);
    if (listo === true) break;
    await w(400);
  }

  const montaje = await ev(`(async()=>{
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg");
    if (typeof dzDocInit === "function") await dzDocInit();
    await new Promise(r=>setTimeout(r,600));
    if (typeof closeL3d === "function") closeL3d();
    if (!DZ.anim) await dzAnimToggle();
    await new Promise(r=>setTimeout(r,700));
    const sc = DZ.doc.scene, ly = sc.layers[0], lv = sc.level(ly.levelId);
    // dos dibujos que se distinguen por el píxel: un bloque a la izquierda y
    // otro a la derecha
    const bloque = x => '<g data-low-art="line"><rect x="' + x + '" y="200" width="500" height="680" fill="#111111"/></g>';
    // dibujos PROPIOS (el 1 ya existe: es el diseño de ejemplo del mock)
    lv.addDrawing(901, bloque(100)); lv.addDrawing(902, bloque(1320));
    for (const f of [1,2,3]) sc.expose(ly.id, f, 901);
    for (const f of [4,5,6]) sc.expose(ly.id, f, 902);
    if (!/x="100"/.test(dzCuadroSvgTexto(1)) || /fill="#F0450E"/i.test(dzCuadroSvgTexto(1)) || !/x="1320"/.test(dzCuadroSvgTexto(4)))
      return { error: "los cuadros no quedaron con los dibujos de la prueba" };
    // el lienzo tiene que mostrar lo que quedó en el modelo: exportar (y la
    // vista previa) guardan primero el lienzo en el cuadro actual, como al
    // dibujar de verdad; si muestra el dibujo viejo, pisa el de la prueba
    DZ.doc.goTo(1); dzCanvasSet(DZ.doc.drawing ? DZ.doc.drawing.content : "");
    sc.range = { in:1, out:6 };
    // el audio de la escena, espiado: se anota cuándo arranca, para y suena
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
    const pista = new LOW.animation.AudioTrack(DZ.doc); pista.buffer = buf; pista.name = "voz.wav";
    window.__audio = [];
    const playFrom = pista.playFrom.bind(pista), stop = pista.stop.bind(pista), scrub = pista.scrub.bind(pista);
    pista.playFrom = f => { window.__audio.push("play:" + f); return playFrom(f); };
    pista.stop = () => { window.__audio.push("stop"); return stop(); };
    pista.scrub = f => { window.__audio.push("scrub:" + f); return scrub(f); };
    DZ.doc.audio = pista;
    window.__log = [];
    api.pick_export_target = async (ruta, kind) => { window.__log.push({ cual:"pick", kind }); return { path:"D:\\\\Previa\\\\salida", dir:"D:\\\\Previa" }; };
    api.export_anim = async (ruta, pngs, fps, kind, destino) => { window.__log.push({ cual:"anim", kind, cuantos:pngs.length, destino }); return { path: destino, n: pngs.length }; };
    if (typeof api.refresh_tree !== "function") api.refresh_tree = () => ({tree:{}});
    return { cuadros: dzExportCuadros().length, fps: +document.getElementById("tlFps").value };
  })()`);
  if (montaje.error || montaje.cuadros !== 6) mal("el montaje no dejó seis cuadros", montaje);

  // ── 1. el botón en el modal de exportar
  await clickEn("#tlExport");
  const hay = await ev(`!!document.querySelector("#modal #mPrev")`);
  if (!hay) mal("el modal de exportar no ofrece la vista previa", await ev(`(document.querySelector("#modal")||{}).textContent`));
  await clickEn("#mPrev");

  // ── 2. prepara todo el tramo y muestra el dibujo de cada cuadro
  let st = null;
  for (let i = 0; i < 100; i++) { st = await estado(); if (st && st.listo) break; await w(200); }
  if (!st || !st.listo) mal("la vista previa no terminó de prepararse", st);
  if (st.total !== 6 || st.cuadro !== 1) mal("no preparó los seis cuadros del tramo", st);
  const m1 = await mitades();
  if (!(m1.izq > 500 && m1.der < m1.izq / 50 && Math.abs(m1.izq - 0) > 0)) mal("el cuadro 1 no muestra su dibujo a la izquierda", m1);
  if (Math.abs(m1.w / m1.h - 16 / 9) > 0.02) mal("el cuadro no tiene la forma de la escena", m1);

  // los controles y los botones de exportar, a la vista sin hacer scroll —a
  // pantalla completa y a media pantalla—: el lienzo no los puede empujar afuera
  for (const [ancho, alto] of [[1366, 768], [1000, 560]]) {
    await send("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto, deviceScaleFactor: 1, mobile: false });
    await w(250);
    const fuera = await ev(`(()=>{ const m = document.getElementById("modal").getBoundingClientRect();
      return ["#lowPrevPlay", "#lowPrevBarra", '[data-x="mp4"]', '[data-x="premiere"]', "#lowPrevCerrar", "#lowPrevLienzo"]
        .filter(s => { const r = document.querySelector("#modal " + s).getBoundingClientRect();
          return !r.height || r.top < m.top || r.bottom > Math.min(m.bottom, innerHeight) + 1; }); })()`);
    if (fuera.length) mal("a " + ancho + "×" + alto + " quedan controles fuera de la vista", fuera);
  }
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await w(200);

  // ── 3. flechas: cuadro a cuadro, con el pedacito de audio
  await ev(`(()=>{ window.__audio.length = 0; document.getElementById("lowPrevPlay").focus(); return true; })()`);
  for (let k = 0; k < 3; k++) await tecla("ArrowRight");
  st = await estado();
  if (st.cuadro !== 4) mal("las flechas no recorren cuadro a cuadro", st);
  const m4 = await mitades();
  if (!(m4.der > 500 && m4.izq < m4.der / 50 && Math.abs(m4.der - m1.izq) < m1.izq * 0.1)) mal("el cuadro 4 no muestra su dibujo a la derecha", { m4, m1 });
  if (!(await ev(`window.__audio.includes("scrub:4")`))) mal("recorrer no hace sonar el audio del cuadro", await ev(`window.__audio`));
  await tecla("ArrowLeft");
  if ((await estado()).cuadro !== 3) mal("la flecha izquierda no vuelve un cuadro", await estado());

  // ── 4. Espacio reproduce LA VISTA PREVIA, con audio y en bucle
  await ev(`(()=>{ window.__audio.length = 0; return true; })()`);
  await tecla("Space");
  st = await estado();
  const lado = await ev(`({ mano: DZ.spaceDown === true, timeline: !!(DZ.anim && DZ.anim.playing) })`);
  if (!st.reproduciendo) mal("Espacio no reproduce la vista previa", { st, lado });
  if (lado.mano || lado.timeline) mal("Espacio se fue al lienzo o a la timeline en vez de a la vista previa", lado);
  if (!(await ev(`window.__audio.includes("play:3")`))) mal("el audio no arranca desde el cuadro donde está", await ev(`window.__audio`));
  await w(Math.ceil(6 / Math.max(1, montaje.fps || 24) * 1000) * 2 + 400);
  const vueltas = await ev(`window.__audio.filter(x => x === "play:1").length`);
  if (vueltas < 1) mal("en bucle no vuelve a empezar (ni vuelve a arrancar el audio)", await ev(`window.__audio`));
  await tecla("Space");
  st = await estado();
  if (st.reproduciendo) mal("Espacio no pausa", st);
  if ((await ev(`window.__audio.at(-1)`)) !== "stop") mal("pausar no corta el audio", await ev(`window.__audio`));
  const quieto = st.i; await w(300);
  if ((await estado()).i !== quieto) mal("pausado sigue avanzando", await estado());

  // ── 5. sin bucle se detiene en el último cuadro
  await clickEn("#lowPrevBucle");
  await clickEn("#lowPrevPlay");
  await w(Math.ceil(6 / Math.max(1, montaje.fps || 24) * 1000) + 700);
  st = await estado();
  if (st.reproduciendo || st.cuadro !== 6) mal("sin bucle no se detiene en el último cuadro", st);

  // ── 6. Esc cierra y corta todo
  await clickEn("#lowPrevPlay");
  await w(100);
  await ev(`(()=>{ window.__audio.length = 0; return true; })()`);
  await tecla("Escape");
  await w(250);
  const cerrado = await ev(`({ oculto: document.getElementById("overlay").hidden, estado: LOW.animation.vistaPrevia.estado(), audio: window.__audio.slice() })`);
  if (!cerrado.oculto) mal("Esc no cierra la vista previa", cerrado);
  if (cerrado.estado) mal("cerrada, la vista previa sigue viva", cerrado);
  if (!cerrado.audio.includes("stop")) mal("cerrar no corta el audio", cerrado);
  await w(400);
  if ((await ev(`window.__audio.filter(x => x.startsWith("play")).length`)) > 0)
    mal("después de cerrar sigue un bucle de fondo arrancando el audio", await ev(`window.__audio`));

  // ── 7. exportar desde la vista previa
  await clickEn("#tlExport");
  await clickEn("#mPrev");
  for (let i = 0; i < 100; i++) { st = await estado(); if (st && st.listo) break; await w(200); }
  await clickEn('#modal .lowprev-caja [data-x="png"]');
  let salida = null;
  for (let i = 0; i < 90 && !salida; i++) { salida = await ev(`window.__log.find(x => x.cual === "anim") || null`); if (!salida) await w(300); }
  if (!salida || salida.cuantos !== 6 || !(await ev(`window.__log.some(x => x.cual === "pick")`)))
    mal("exportar desde la vista previa no exportó los seis cuadros", { log: await ev(`window.__log`), errores,
      estado: await ev(`(document.querySelector("#dzStatus")||{}).textContent`), previa: st });
  if (await estado()) mal("al exportar, la vista previa quedó viva", await estado());

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));
  console.log("E2E vista previa OK " + JSON.stringify({ cuadros: 6, pixel: { f1: m1, f4: m4 }, bucle: vueltas, exporta: salida.cuantos }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
