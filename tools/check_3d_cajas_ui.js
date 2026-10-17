/* CAJAS EN EL ESTUDIO 3D: armar el espacio y dibujar en sus caras.
   CDP :9223 + mock :8791.

   Pedido de Mauro (v3.29.3): «el grueso de los fondos, espacios, layouts y
   paisajes la idea es hacerlos en el módulo 3D», como en Feather: primero las
   superficies, después el dibujo encima. Faltaban cajas para edificios y
   habitaciones. Con el mouse de verdad y una cámara fija:
   1. Caja (X): arrastrar la base en el piso, mover el mouse para la altura y
      clic → una caja de 2 × 2 m de base EN el piso (y = 0) y 2 m de alto.
      Esc a mitad del gesto no deja nada.
   2. Dibujar en su cara, en Perspectiva y desde Frente: todos los puntos en el
      plano de la cara (z = 1).
   3. Una línea que CRUZA la arista sigue en el plano de la cara: no dobla la
      esquina hacia la cara de al lado.
   4. Con la cámara ADENTRO de la caja (una habitación), se dibuja en la pared
      del fondo (z = −1).
   5. Ctrl+Z saca la caja y rehacer la devuelve; viaja con el proyecto (.low3d)
      y los ids siguen siendo únicos.
   6. La caja es andamio: «Mandar al 2D» no la saca al layout. */
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
  const arrastrar = async (a, b, pasos = 14) => {
    await mover(a);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= pasos; i++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x + (b.x - a.x) * i / pasos, y: a.y + (b.y - a.y) * i / pasos, button: "left", buttons: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", buttons: 0, clickCount: 1 });
    await w(150);
  };
  const clic = async (p) => {
    await mover(p);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 });
    await w(150);
  };
  const tecla = async (key, code, vk) => { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk }); await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk }); await w(150); };
  const camara = (pos, mira) => ev(`(()=>{ const e = __low3d; e.camera.position.set(...${JSON.stringify(pos)}); e.controls.target.set(...${JSON.stringify(mira)});
    e.camera.lookAt(e.controls.target); e.controls.update(); return true; })()`);
  const herramienta = (t) => ev(`(()=>{ document.querySelector('[data-tool="${t}"]').click(); return true; })()`);
  const cajas = () => ev(`__low3d.strokes.filter(s => s.kind === "box").map(s => ({ id: s.id, pos: s.object.position.toArray().map(v => Math.round(v * 1000) / 1000), tam: s.object.scale.toArray().map(v => Math.round(v * 1000) / 1000) }))`);
  /** El último trazo, en el mundo. */
  const ultimo = () => ev(`(()=>{ const s = __low3d.strokes.filter(s => s.kind === "stroke").at(-1); if (!s) return null; s.object.updateMatrixWorld(true);
    const p = s.points.map(q => q.clone().applyMatrix4(s.object.matrixWorld)), r = v => Math.round(v * 1000) / 1000;
    const rango = (k) => [r(Math.min(...p.map(q => q[k]))), r(Math.max(...p.map(q => q[k])))]; return { n: __low3d.strokes.filter(s => s.kind === "stroke").length, x: rango("x"), y: rango("y"), z: rango("z") }; })()`);
  const enCara = (t, k, valor, msg) => { if (!t || Math.abs(t[k][0] - valor) > 0.01 || Math.abs(t[k][1] - valor) > 0.01) mal(msg, t); };

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
    await ev(`try{localStorage.clear()}catch(e){}; __low3d.newProject(); __low3d.setView("persp"); true`);
    await camara([0, 5, 9], [0, 0.5, 0]); await w(200);

    // ── 1. Esc a mitad del gesto no deja nada; después, la caja de verdad
    await herramienta("box");
    if (!(await ev(`!!document.querySelector('[data-tool="box"]')`))) mal("no está la herramienta Caja", {});
    await arrastrar(await aPantalla([-1, 0, 1]), await aPantalla([1, 0, -1]));
    await mover(await aPantalla([0, 1.5, 0]));
    await ev(`(()=>{ __low3d.escapeConsume(); return true; })()`);
    if ((await cajas()).length) mal("Esc a mitad del gesto dejó una caja", await cajas());
    await arrastrar(await aPantalla([-1, 0, 1]), await aPantalla([1, 0, -1]));
    for (const y of [0.5, 1, 1.5, 2]) await mover(await aPantalla([0, y, 0]));
    await clic(await aPantalla([0, 2, 0]));
    let c = await cajas();
    if (c.length !== 1) mal("no quedó la caja", c);
    const [cx, cy, cz] = c[0].pos, [sx, sy, sz] = c[0].tam;
    if (Math.abs(cy) > 1e-6) mal("la base de la caja no quedó en el piso", c[0]);
    if (Math.abs(cx) > 0.05 || Math.abs(cz) > 0.05 || Math.abs(sx - 2) > 0.05 || Math.abs(sz - 2) > 0.05) mal("la base no es la de 2 × 2 m que se arrastró", c[0]);
    if (Math.abs(sy - 2) > 0.08) mal("la altura no es la que se marcó (2 m)", c[0]);

    // ── 2. dibujar en la cara de adelante (z = 1), en perspectiva
    await herramienta("pencil");
    await arrastrar(await aPantalla([-0.5, 0.5, 1]), await aPantalla([0.5, 1.5, 1]));
    enCara(await ultimo(), "z", 1, "en perspectiva, el trazo sobre la cara no quedó en la cara (z = 1)");

    // ── 3. cruzar la arista: sigue en el plano de la cara, no dobla la esquina
    await arrastrar(await aPantalla([0.2, 1, 1]), await aPantalla([1.6, 1, 1]), 20);
    let t = await ultimo();
    enCara(t, "z", 1, "el trazo que cruza la arista dobló hacia la cara de al lado");
    if (!(t.x[1] > 1.3)) mal("el trazo no siguió más allá de la arista", t);

    // ── 2b. desde Frente: la cara de adelante manda la profundidad
    await ev(`__low3d.setView("front"); true`); await w(300);
    await arrastrar(await aPantalla([-0.6, 0.3, 1]), await aPantalla([0.6, 0.6, 1]));
    enCara(await ultimo(), "z", 1, "desde Frente, el trazo sobre la caja no quedó en su cara (z = 1)");

    // ── 4. adentro de la caja: la pared del fondo
    await ev(`__low3d.setView("persp"); true`); await w(300);
    await camara([0, 1, 0.6], [0, 1, -5]); await w(200);
    await arrastrar(await aPantalla([-0.3, 0.8, -1]), await aPantalla([0.3, 1.2, -1]));
    enCara(await ultimo(), "z", -1, "desde adentro, el trazo no quedó en la pared del fondo (z = −1)");

    // ── 5. Ctrl+Z / rehacer, el proyecto y los ids
    const trazosAntes = (await ultimo()).n;
    await ev(`(()=>{ for (let i = 0; i < 4; i++) __low3d.undo(); return true; })()`); await w(150);
    if ((await cajas()).length !== 1 || (await ultimo())) mal("deshacer los trazos tocó la caja o dejó trazos", { cajas: await cajas(), ultimo: await ultimo() });
    await ev(`__low3d.undo(); true`); await w(150);
    if ((await cajas()).length !== 0) mal("Ctrl+Z no sacó la caja", await cajas());
    await ev(`(()=>{ for (let i = 0; i < 5; i++) __low3d.redo(); return true; })()`); await w(150);
    if ((await cajas()).length !== 1 || (await ultimo()).n !== trazosAntes) mal("rehacer no devolvió la caja y sus trazos", { cajas: await cajas() });
    const vuelta = await ev(`(()=>{ const p = __low3d.exportProject(); __low3d.newProject(); __low3d.importProject(JSON.parse(JSON.stringify(p)));
      const ids = __low3d.strokes.map(s => s.id); return { ids, cajas: __low3d.strokes.filter(s => s.kind === "box").map(s => s.object.scale.toArray().map(v => Math.round(v * 1000) / 1000)) }; })()`);
    if (vuelta.cajas.length !== 1 || Math.abs(vuelta.cajas[0][1] - sy) > 1e-3) mal("la caja no viaja con el proyecto", vuelta);
    await camara([0, 5, 9], [0, 0.5, 0]); await herramienta("box"); await w(100);
    await arrastrar(await aPantalla([2, 0, 1]), await aPantalla([3, 0, 0]));
    await mover(await aPantalla([2.5, 1, 0.5])); await clic(await aPantalla([2.5, 1, 0.5]));
    const ids = await ev(`__low3d.strokes.map(s => s.id)`);
    if (new Set(ids).size !== ids.length) mal("después de reabrir, una caja nueva repitió un id", ids);

    // ── 6. la caja es andamio: no sale al 2D
    const alfa = await ev(`(async()=>{ const e = __low3d; e.newProject(); e.setView("persp"); e.camera.position.set(0, 5, 9); e.controls.target.set(0, 0.5, 0); e.camera.lookAt(e.controls.target); e.controls.update();
      return true; })()`);
    void alfa;
    await herramienta("box");
    await arrastrar(await aPantalla([-1, 0, 1]), await aPantalla([1, 0, -1]));
    await mover(await aPantalla([0, 2, 0])); await clic(await aPantalla([0, 2, 0]));
    const maxAlfa = await ev(`(async()=>{ const r = __low3d.mandarAl2D(320, 180); if (!r) return -1;
      const im = new Image(); im.src = r.png; await im.decode(); const c = document.createElement("canvas"); c.width = 320; c.height = 180;
      const g = c.getContext("2d"); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, 320, 180).data; let m = 0; for (let i = 3; i < d.length; i += 4) m = Math.max(m, d[i]); return m; })()`);
    if (maxAlfa !== 0) mal("la caja salió en el layout del 2D (es andamio)", { maxAlfa });

    // ── 7. EN TODA LA CUADRÍCULA (Mauro, v3.33: «no funciona en toda la
    // cuadrícula… ¿o porque tenía terreno?»). Con la cámara de inicio (a la
    // altura de los ojos), el piso a más de ~23 m se rechazaba: la regla de
    // «medio metro por píxel» es para que el DIBUJO no salte, no para apoyar
    // una caja. Y sobre una ladera, la caja exigía una normal casi vertical.
    await ev(`(()=>{ const e = __low3d; e.newProject(); e.setView("persp"); return true; })()`); await w(200);
    await herramienta("box");
    // los puntos del gesto, sobre el SUELO (el piso o la superficie del terreno)
    const suelo = (x, z) => ev(`__low3d.alturaTerreno(${x}, ${z})`);
    const lejos = async (x, z) => {
      const a = await aPantalla([x - 2, await suelo(x - 2, z + 2), z + 2]), b = await aPantalla([x + 2, await suelo(x + 2, z - 2), z - 2]);
      await arrastrar(a, b);
      const h = await aPantalla([x, (await suelo(x, z)) + 4, z]); await mover(h); await clic(h);
    };
    await lejos(0, -40);
    c = await cajas();
    if (c.length !== 1 || Math.abs(c[0].pos[2] + 40) > 0.6 || Math.abs(c[0].pos[1]) > 1e-3) mal("una caja a 40 m de la cámara no se pudo armar (el piso lejano se rechazaba)", c);
    // sobre una LADERA del terreno (~34°: la caja exigía normal > 0,9): base horizontal, apoyada en lo más bajo debajo de ella
    await ev(`(()=>{ const e = __low3d, T = e.terreno; for (let k = 0; k < 4; k++) T.pincelar(14, -20, { modo: "levantar", radio: 18, fuerza: .8 }, 1); e.rearmarTerreno(); return true; })()`);
    const ladera = await ev(`({ y: __low3d.alturaTerreno(6, -20), n: __low3d.terreno.normalEn(6, -20) })`);
    if (!(ladera.y > 1 && ladera.n[1] < 0.9 && ladera.n[1] > 0.6)) mal("la prueba no armó una ladera razonable", ladera);
    // la cámara mirando la ladera de frente (desde la cámara de inicio se ve de canto: el rayo la roza)
    await camara([-22, 16, -8], [8, 3, -20]); await w(200);
    await lejos(6, -20);
    c = await cajas();
    const enLadera = c.find((k) => Math.abs(k.pos[0] - 6) < 0.8 && Math.abs(k.pos[2] + 20) < 0.8);
    if (!enLadera) mal("sobre una ladera del terreno no se pudo armar una caja", { c, ladera });
    const bajo = await ev(`Math.min(...[[-2,-2],[2,-2],[-2,2],[2,2],[0,0]].map(([dx,dz]) => __low3d.alturaTerreno(${enLadera.pos[0]} + dx * ${enLadera.tam[0]} / 4, ${enLadera.pos[2]} + dz * ${enLadera.tam[2]} / 4)))`);
    if (enLadera.pos[1] > bajo + 0.05) mal("la caja en la ladera quedó flotando (su base no está en lo más bajo debajo de ella)", { enLadera, bajo });

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
    console.log("E2E cajas del 3D OK", JSON.stringify({ caja: { pos: [cx, cy, cz], tam: [sx, sy, sz] } }));
  } finally { ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { } }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
setTimeout(() => process.exit(1), 150000).unref();
