/* EL PAVIMENTADOR DEL ESTUDIO 3D: calles de ciudad con clics sobre el piso.
   CDP :9223 + mock :8791.

   Pedido de Mauro (v3.31): «el módulo 3D como un SimCity para construir una
   ciudad para el escenario», empezando por «un pavimentador que dibuje calles
   de ciudades». Con el mouse de verdad y una cámara fija desde arriba:
   1. Calles (R): clic, clic, Enter → una calle por el recorrido marcado, EN el
      piso, con calzada de 7,5 m y veredas de 2,5 m a cada lado.
   2. Esc a mitad del recorrido no deja nada; Backspace quita el último punto.
   3. Una segunda calle que cruza (terminada con doble clic) rearma la primera:
      el cruce le corta los cordones y le pone sendas.
   4. Un clic en la punta de una calle del mismo ancho la CONTINÚA (sigue
      siendo una sola calle).
   5. Avenida: 14 m de calzada.
   6. Ctrl+Z saca la calle y rehacer la devuelve; las calles viajan con el
      proyecto (.low3d) y vuelven con sus cruces. */
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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 60000);
    pending.set(n, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const aPantalla = (p) => ev(`(()=>{ const e = __low3d, r = e.canvasElement().getBoundingClientRect(), c = e.camera; c.updateMatrixWorld(true);
    const v = new c.position.constructor(...${JSON.stringify(p)}).project(c); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; })()`);
  const mover = (p) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, buttons: 0 });
  const clic = async (mundo, veces = 1) => {
    const p = await aPantalla(mundo);
    // un clic que cae fuera del lienzo (o sobre un panel) es un error de la PRUEBA, no del estudio
    const bajo = await ev(`(document.elementFromPoint(${p.x}, ${p.y}) || {}).tagName || "nada"`);
    if (bajo !== "CANVAS") throw Error("PRUEBA MAL ARMADA: el punto " + JSON.stringify(mundo) + " cae sobre " + bajo);
    await mover(p);
    for (let k = 1; k <= veces; k++) {
      await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: k });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: k });
    }
    await w(150);
  };
  const tecla = async (key, code, vk, modifiers = 0) => { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers }); await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers }); await w(200); };
  const camara = (pos, mira) => ev(`(()=>{ const e = __low3d; e.camera.position.set(...${JSON.stringify(pos)}); e.controls.target.set(...${JSON.stringify(mira)});
    e.camera.lookAt(e.controls.target); e.controls.update(); return true; })()`);
  /** Cada calle: tipo, eje (x, z) en el mundo, la caja de su malla y cuántas piezas tiene. */
  const calles = () => ev(`__low3d.strokes.filter(s => s.calle).map(s => { s.object.updateMatrixWorld(true);
    const r = v => Math.round(v * 100) / 100;
    const caja = __low3d.cajaDe(s.object);
    return { id: s.id, tipo: s.calle, eje: s.points.map(p => { const q = p.clone().applyMatrix4(s.object.matrixWorld); return [r(q.x), r(q.z)]; }),
      caja, piezas: s.object.children.length, y: caja ? [caja.min[1], caja.max[1]] : null }; })`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
    await ev(`try{localStorage.clear()}catch(e){}; __low3d.newProject(); __low3d.setView("persp");
      // la caja de una malla, para medir (sin depender de clases internas del estudio)
      __low3d.cajaDe = (o) => { const pts = []; o.traverse(m => { const g = m.geometry; if (!g || !g.attributes.position) return; m.updateMatrixWorld(true);
        const a = g.attributes.position; for (let i = 0; i < a.count; i++) pts.push(new o.position.constructor(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix4(m.matrixWorld)); });
        if (!pts.length) return null; const r = v => Math.round(v * 100) / 100, k = ["x", "y", "z"];
        return { min: k.map(c => r(Math.min(...pts.map(p => p[c])))), max: k.map(c => r(Math.max(...pts.map(p => p[c])))) }; }; true`);
    await camara([0, 95, 28], [0, 0, 0]); await w(200);

    // ── 1. una calle
    // Calles vive en el grupo «Construir» de la barra (con la Caja): flechita → Calles
    const centro = (sel) => ev(`(()=>{ const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    const clicPantalla = async (p) => { await mover(p); await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 }); await w(200); };
    const caret = await centro(".studio-tool-rail .studio-grupo .studio-grupo-caret");
    if (!caret) mal("el botón Construir de la barra no tiene su flechita", {});
    if ((await ev(`document.querySelector(".studio-tool-rail .studio-grupo").dataset.tool`)) !== "box") mal("el grupo Construir no arranca mostrando la Caja", {});
    await clicPantalla(caret);
    const item = await centro('.studio-grupo-menu [data-tool="calle"]');
    if (!item) mal("la lista de Construir no tiene Calles", await ev(`[...document.querySelectorAll(".studio-grupo-menu button")].map(b => b.textContent)`));
    await clicPantalla(item);
    const elegida = await ev(`({ tool: __lowStore.getState().currentTool, boton: document.querySelector(".studio-tool-rail .studio-grupo").dataset.tool, menu: !!document.querySelector(".studio-grupo-menu") })`);
    if (elegida.tool !== "calle" || elegida.boton !== "calle" || elegida.menu) mal("elegir Calles en la lista no la dejó en uso (o el botón no la muestra, o la lista no se cerró)", elegida);
    // y la tecla R también
    await ev(`__lowStore.setCurrentTool("pencil"); true`); await w(100);
    await tecla("r", "KeyR", 82);
    if ((await ev(`__lowStore.getState().currentTool`)) !== "calle") mal("la tecla R no eligió Calles", {});
    // el ancho elegido se recuerda entre sesiones: arranca en «Calle» a propósito
    await ev(`document.querySelector('[data-calle="calle"]').click(); true`); await w(100);
    await clic([-20, 0, 0]); await clic([20, 0, 0]); await tecla("Enter", "Enter", 13);
    let c = await calles();
    if (c.length !== 1 || c[0].tipo !== "calle") mal("clic, clic, Enter no hizo una calle", c);
    const ej = c[0].eje;
    if (Math.abs(ej[0][0] + 20) > 0.6 || Math.abs(ej.at(-1)[0] - 20) > 0.6 || ej.some(p => Math.abs(p[1]) > 0.6)) mal("la calle no va por el recorrido marcado", ej);
    if (!c[0].caja || c[0].y[0] < -0.001 || c[0].y[1] > 0.1) mal("la calle no está EN el piso", c[0]);
    const ancho = c[0].caja.max[2] - c[0].caja.min[2];
    if (Math.abs(ancho - (7.5 + 2 * 2.5)) > 0.4) mal("la calle no mide 7,5 m de calzada + 2,5 m de vereda por lado", { ancho, caja: c[0].caja });
    const piezasSola = c[0].piezas;

    // ── 2. Esc no deja nada; Backspace quita el último punto
    await clic([-20, 0, 15]); await clic([0, 0, 15]); await tecla("Escape", "Escape", 27);
    if ((await calles()).length !== 1) mal("Esc a mitad del recorrido dejó una calle", await calles());
    await clic([-20, 0, 15]); await clic([0, 0, 15]); await clic([10, 0, 22]);
    await tecla("Backspace", "Backspace", 8); await tecla("Enter", "Enter", 13);
    c = await calles();
    const segunda = c.find(x => x.eje.some(p => Math.abs(p[1] - 15) < 0.7));
    if (c.length !== 2 || !segunda || segunda.eje.some(p => p[1] > 16)) mal("Backspace no quitó el último punto del recorrido", c);
    await tecla("z", "KeyZ", 90, 2); await w(200);
    if ((await calles()).length !== 1) mal("Ctrl+Z no sacó la calle", await calles());
    await tecla("z", "KeyZ", 90, 2 | 8); await w(200);
    if ((await calles()).length !== 2) mal("rehacer no devolvió la calle", await calles());
    await tecla("z", "KeyZ", 90, 2); await w(200);

    // ── 3. una calle que cruza, terminada con doble clic
    await clic([0, 0, -18]); await clic([0, 0, 18], 2);
    c = await calles();
    if (c.length !== 2) mal("el doble clic no terminó la segunda calle", c);
    const primera = c.find(x => Math.abs(x.eje[0][1]) < 0.7 && Math.abs(x.eje[0][0]) > 5);
    if (!primera || primera.piezas <= piezasSola) mal("el cruce no rearmó la primera calle (cordones cortados, sendas)", { antes: piezasSola, despues: primera && primera.piezas });

    // ── 4. continuar desde la punta
    await clic([20, 0, 0]); await clic([30, 0, -10]); await tecla("Enter", "Enter", 13);
    c = await calles();
    const larga = c.find(x => x.eje.some(p => Math.abs(p[0] + 20) < 0.7) && x.eje.some(p => Math.abs(p[0] - 30) < 0.7));
    if (c.length !== 2 || !larga) mal("un clic en la punta de la calle no la continuó (quedó otra calle)", c);

    // ── 5. avenida
    if (!(await ev(`!!document.querySelector('[data-calle="avenida"]')`))) mal("no está el botón Avenida", {});
    await ev(`document.querySelector('[data-calle="avenida"]').click(); true`); await w(100);
    await clic([-20, 0, -30]); await clic([20, 0, -30]); await tecla("Enter", "Enter", 13);
    c = await calles();
    const av = c.find(x => x.tipo === "avenida");
    if (!av) mal("no se hizo la avenida", c);
    const anchoAv = av.caja.max[2] - av.caja.min[2];
    if (Math.abs(anchoAv - (14 + 2 * 3.5)) > 0.5) mal("la avenida no mide 14 m de calzada + 3,5 m de vereda", { anchoAv });

    // ── 6. viaja con el proyecto
    const vuelta = await ev(`(()=>{ const antes = __low3d.strokes.filter(s => s.calle).map(s => s.object.children.length).join();
      const p = JSON.parse(JSON.stringify(__low3d.exportProject())); __low3d.newProject(); const limpio = __low3d.strokes.filter(s => s.calle).length;
      __low3d.importProject(p); const s = __low3d.strokes.filter(s => s.calle);
      return { limpio, n: s.length, tipos: s.map(x => x.calle).sort().join(), piezas: s.map(x => x.object.children.length).join(), antes,
        ids: new Set(__low3d.strokes.map(x => x.id)).size === __low3d.strokes.length }; })()`);
    if (vuelta.limpio !== 0 || vuelta.n !== 3 || vuelta.tipos !== "avenida,calle,calle") mal("las calles no viajan con el proyecto", vuelta);
    if (vuelta.piezas !== vuelta.antes) mal("al abrir el proyecto las calles no vuelven con sus cruces", vuelta);
    if (!vuelta.ids) mal("ids repetidos después de abrir", vuelta);

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
    console.log("E2E pavimentador (calles 3D) OK " + JSON.stringify({ ancho, anchoAv, piezasSola, piezasCruce: primera.piezas }));
  } finally {
    ws.close();
    try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  }
}

main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
