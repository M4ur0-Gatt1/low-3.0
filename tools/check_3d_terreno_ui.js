/* EL PAISAJE DEL ESTUDIO 3D: TERRENO, RÍOS Y LAGOS. CDP :9223 + mock :8791.

   Pedido de Mauro (v3.31): «también quiero poder hacer ríos, lagos, montañas,
   todos los elementos para componer espacios y paisajes». Con el mouse de verdad:
   1. Construir → Terreno: arrastrar en círculos levanta una MONTAÑA donde se
      pinta (y no lejos de ahí). Ctrl+Z la saca entera; rehacer la devuelve.
   2. Shift invierte: hunde (un valle).
   3. Sobre la montaña se dibuja (el trazo queda en la ladera) y se colocan
      piezas (la base del árbol a la altura del terreno).
   4. Río: clic, clic, clic, Enter → cava un cauce y el agua nunca sube río abajo.
   5. Lago: un contorno → una hondonada con su espejo de agua.
   6. Todo viaja con el proyecto (.low3d) y sale en los fondos de las tomas. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = (process.argv[3] || "http://127.0.0.1:8791/ui/") + "estudio3d/index.html";

async function main() {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map(), errores = [];
  ws.onmessage = (event) => { const m = JSON.parse(event.data);
    if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (!m.id || !pending.has(m.id)) return; const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 90000);
    pending.set(n, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const aPantalla = (p) => ev(`(()=>{ const e = __low3d, r = e.canvasElement().getBoundingClientRect(), c = e.camera; c.updateMatrixWorld(true);
    const v = new c.position.constructor(...${JSON.stringify(p)}).project(c); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; })()`);
  const mover = (p, buttons = 0, modifiers = 0) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, buttons, button: buttons ? "left" : "none", modifiers });
  const enLienzo = async (p, mundo) => { const bajo = await ev(`(document.elementFromPoint(${p.x}, ${p.y}) || {}).tagName || "nada"`);
    if (bajo !== "CANVAS") throw Error("PRUEBA MAL ARMADA: " + JSON.stringify(mundo) + " cae sobre " + bajo); };
  /** Un gesto por puntos del MUNDO (en el piso), con el botón apretado. */
  const gesto = async (mundos, modifiers = 0) => {
    const ps = []; for (const m of mundos) { const p = await aPantalla(m); await enLienzo(p, m); ps.push(p); }
    await mover(ps[0], 0, modifiers);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: ps[0].x, y: ps[0].y, button: "left", buttons: 1, clickCount: 1, modifiers });
    for (const p of ps.slice(1)) { await mover(p, 1, modifiers); await w(8); }
    const u = ps.at(-1);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: u.x, y: u.y, button: "left", buttons: 0, clickCount: 1, modifiers });
    await w(250);
  };
  const clicMundo = async (m) => { const p = await aPantalla(m); await enLienzo(p, m); await mover(p);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 }); await w(180); };
  const tecla = async (key, code, vk, modifiers = 0) => { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers }); await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers }); await w(250); };
  const alto = (x, z) => ev(`Math.round(__low3d.alturaTerreno(${x}, ${z}) * 100) / 100`);
  const camara = (pos, mira) => ev(`(()=>{ const e = __low3d; e.camera.position.set(...${JSON.stringify(pos)}); e.controls.target.set(...${JSON.stringify(mira)});
    e.camera.lookAt(e.controls.target); e.controls.update(); return true; })()`);
  const circulos = (cx, cz, r, vueltas = 3, n = 60) => Array.from({ length: n * vueltas + 1 }, (_, k) => { const a = k / n * Math.PI * 2; return [cx + Math.cos(a) * r, 0, cz + Math.sin(a) * r]; });

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
    await ev(`try{localStorage.clear(); localStorage.setItem("low3d:guia-fondos","1")}catch(e){}; location.reload(); true`);
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d && document.readyState === 'complete'").catch(() => false)) break; await w(250); }
    await w(400);
    await ev(`__low3d.newProject(); true`);
    await camara([0, 120, 70], [0, 0, 0]); await w(200);

    // ── 1. Terreno: levantar una montaña
    await ev(`(()=>{ document.querySelector(".studio-tool-rail .studio-grupo .studio-grupo-caret").click(); return true; })()`); await w(200);
    if (!(await ev(`!!document.querySelector('.studio-grupo-menu [data-tool="terreno"]') && !!document.querySelector('.studio-grupo-menu [data-tool="rio"]') && !!document.querySelector('.studio-grupo-menu [data-tool="lago"]')`)))
      mal("Construir no tiene Terreno, Río y Lago", await ev(`[...document.querySelectorAll(".studio-grupo-menu button")].map(b => b.textContent)`));
    await ev(`(()=>{ document.querySelector('.studio-grupo-menu [data-tool="terreno"]').click(); return true; })()`); await w(200);
    if (!(await ev(`!!document.querySelector('[data-terreno="levantar"][aria-pressed="true"]')`))) mal("la barra no muestra el pincel de terreno (Levantar)", {});
    if ((await ev(`__low3d.terrenoInfo().plano`)) !== true) mal("un proyecto nuevo no arranca con el terreno plano", {});
    await gesto(circulos(0, 0, 6, 4));
    const cima = await alto(0, 0), lejos = await alto(40, 40);
    if (!(cima > 3)) mal("arrastrar en círculos no levantó una montaña", { cima });
    if (lejos !== 0) mal("el pincel tocó lejos de donde se pintó", { lejos });
    const malla = await ev(`!!__low3d.scene.getObjectByName("terreno").children.find(m => m.userData.terreno)`);
    if (!malla) mal("la montaña no se ve (no hay malla de terreno)", {});
    await tecla("z", "KeyZ", 90, 2);
    if ((await ev(`__low3d.terrenoInfo().plano`)) !== true) mal("Ctrl+Z no sacó la montaña entera", { cima: await alto(0, 0) });
    await tecla("z", "KeyZ", 90, 2 | 8);
    if (Math.abs((await alto(0, 0)) - cima) > 0.01) mal("rehacer no devolvió la montaña", { antes: cima, ahora: await alto(0, 0) });

    // ── 2. Shift: hundir
    await gesto(circulos(30, -20, 5, 3), 8);
    const valle = await alto(30, -20);
    if (!(valle < -2)) mal("con Shift el pincel no hundió (valle)", { valle });

    // ── 3. dibujar en la ladera y colocar un árbol en la montaña
    await ev(`__lowStore.setCurrentTool("pencil"); true`); await w(150);
    await gesto([[-4, 0, 3], [-2, 0, 4], [0, 0, 4.5], [2, 0, 4], [4, 0, 3]].map(([x, , z]) => [x, 0, z]));
    const trazo = await ev(`(()=>{ const s = __low3d.strokes.filter(s => s.kind === "stroke" && !s.calle).at(-1); if (!s) return null; s.object.updateMatrixWorld(true);
      const d = s.points.map(p => { const q = p.clone().applyMatrix4(s.object.matrixWorld); return Math.abs(q.y - __low3d.alturaTerreno(q.x, q.z)); }); return { n: d.length, peor: Math.max(...d) }; })()`);
    // el trazo se marca por la pantalla: cada punto cae en la LADERA (sobre el terreno, no en y = 0)
    if (!trazo || trazo.peor > 0.6) mal("el trazo no quedó sobre la ladera de la montaña", trazo);
    await ev(`(async()=>{ __lowStore.setCurrentTool("pieza"); await new Promise(r => setTimeout(r, 400)); document.querySelector('.biblio3d-grilla [data-pieza="plano-pino"]').click(); return true; })()`); await w(200);
    const enCima = await aPantalla([0, cima, 0]);
    await mover(enCima);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: enCima.x, y: enCima.y, button: "left", buttons: 1, clickCount: 1, modifiers: 8 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: enCima.x, y: enCima.y, button: "left", buttons: 0, clickCount: 1, modifiers: 8 }); await w(250);
    const pino = await ev(`(()=>{ const s = __low3d.strokes.filter(s => __low3d.groupNames.get(s.groupId) === "Pino"); if (!s.length) return null; let y = Infinity, x = 0, z = 0;
      for (const r of s) { r.object.updateMatrixWorld(true); const p = r.object.getWorldPosition(new r.object.position.constructor()); if (p.y < y) { y = p.y; x = p.x; z = p.z; } }
      return { y: Math.round(y * 100) / 100, suelo: Math.round(__low3d.alturaTerreno(x, z) * 100) / 100 }; })()`);
    if (!pino || Math.abs(pino.y - pino.suelo) > 0.35 || pino.y < 1) mal("el pino no quedó apoyado en la montaña", pino);

    // ── 4. un río
    await ev(`__lowStore.setCurrentTool("rio"); true`); await w(150);
    for (const m of [[-70, 0, 30], [-30, 0, 34], [10, 0, 30], [60, 0, 36]]) await clicMundo(m);
    await tecla("Enter", "Enter", 13);
    let info = await ev(`__low3d.terrenoInfo()`);
    const rio = info.aguas.find(a => a.tipo === "rio");
    if (!rio) mal("clic a clic + Enter no hizo un río", info);
    if (!((await alto(-10, 32)) < -0.5)) mal("el río no cavó su cauce", { cauce: await alto(-10, 32) });
    if (rio.nivel.some((n, i) => i && n > rio.nivel[i - 1] + 1e-6)) mal("el agua del río SUBE en algún tramo", rio.nivel);

    // ── 5. un lago
    await ev(`__lowStore.setCurrentTool("lago"); true`); await w(150);
    for (const m of [[-50, 0, -40], [-30, 0, -42], [-28, 0, -26], [-48, 0, -24]]) await clicMundo(m);
    await tecla("Enter", "Enter", 13);
    info = await ev(`__low3d.terrenoInfo()`);
    const lago = info.aguas.find(a => a.tipo === "lago");
    if (!lago) mal("el contorno + Enter no hizo un lago", info);
    if (!((await alto(-39, -33)) < -1.5)) mal("el lago no cavó su hondonada", { fondo: await alto(-39, -33) });
    if (!(lago.nivel[0] > (await alto(-39, -33)))) mal("el agua del lago no está por encima del fondo", { lago, fondo: await alto(-39, -33) });
    const espejos = await ev(`__low3d.scene.getObjectByName("terreno").children.filter(m => m.userData.agua).length`);
    if (espejos !== 2) mal("no se ven el agua del río y la del lago", { espejos });
    await tecla("z", "KeyZ", 90, 2);
    if ((await ev(`__low3d.terrenoInfo().aguas.length`)) !== 1 || !((await alto(-39, -33)) > -0.5)) mal("Ctrl+Z no sacó el lago con su hondonada", await ev(`__low3d.terrenoInfo()`));
    await tecla("z", "KeyZ", 90, 2 | 8);

    // ── 6. viaja con el proyecto y sale en las tomas
    const muestras = [[0, 0], [30, -20], [-10, 32], [-39, -33]];
    const antes = []; for (const [x, z] of muestras) antes.push(await alto(x, z));
    const vuelta = await ev(`(()=>{ const p = JSON.parse(JSON.stringify(__low3d.exportProject())); __low3d.newProject(); const plano = __low3d.terrenoInfo().plano;
      __low3d.importProject(p); return { plano, kb: Math.round(JSON.stringify(p).length / 1024), aguas: __low3d.terrenoInfo().aguas.map(a => a.tipo).join() }; })()`);
    const despues = []; for (const [x, z] of muestras) despues.push(await alto(x, z));
    if (!vuelta.plano || vuelta.aguas !== "rio,lago" || despues.some((v, i) => Math.abs(v - antes[i]) > 0.02)) mal("el paisaje no viaja con el proyecto", { vuelta, antes, despues });
    const fondo = await ev(`(async()=>{ const e = __low3d; e.strokes.slice().forEach(() => 0);
      e.camera.position.set(0, 60, 90); e.controls.target.set(0, 0, 0); e.camera.lookAt(e.controls.target); e.controls.update();
      e.tomaPonerClave(1); const r = await e.tomaRender([1], 320, 180, { formato: "png" });
      const img = await new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = r[0].data; });
      const c = document.createElement("canvas"); c.width = 320; c.height = 180; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
      const d = x.getImageData(0, 0, 320, 180).data; let verde = 0, azul = 0;
      for (let k = 0; k < d.length; k += 4) { if (d[k + 3] < 200) continue; if (d[k + 1] > d[k] + 15 && d[k + 1] > d[k + 2]) verde++; if (d[k + 2] > d[k] + 25 && d[k + 2] > d[k + 1]) azul++; }
      return { verde, azul }; })()`);
    if (fondo.verde < 2000 || fondo.azul < 50) mal("el paisaje (pasto y agua) no sale en el fondo de la toma", fondo);

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
    console.log("E2E paisaje 3D (terreno, río, lago) OK " + JSON.stringify({ cima, valle, rio: rio.nivel.length, lago: lago.nivel[0], kb: vuelta.kb, fondo }));
  } finally {
    ws.close();
    try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  }
}

main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
