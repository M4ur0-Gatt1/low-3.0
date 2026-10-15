/* CAVAR CON LA CAJA: hacia arriba construye, hacia abajo cava un hueco.
   CDP :9223 + mock :8791.

   Mauro: «el gesto de la construcción de la caja: hacia abajo cava el hueco,
   hacia arriba construye». Con el mouse de verdad:
   1. Base de 2 × 2 m en el piso y la altura arrastrada HACIA ABAJO 1,5 m: queda
      un hueco bajo el piso (de y = −1,5 a y = 0), al ras.
   2. El hueco no tiene tapa: dibujando desde arriba, el trazo cae en el FONDO
      del hueco (y = −1,5), no en la tapa al ras del piso.
   3. Hacia arriba sigue construyendo (y ≥ 0).
   4. El hueco viaja con el proyecto (.low3d) y vuelve sin tapa. */
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
  const aP = (p) => ev(`(()=>{ const e = __low3d, r = e.canvasElement().getBoundingClientRect(), c = e.camera; c.updateMatrixWorld(true);
    const v = new c.position.constructor(...${JSON.stringify(p)}).project(c); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; })()`);
  const mouse = (t, p, x = {}) => send("Input.dispatchMouseEvent", { type: t, x: p.x, y: p.y, ...x });
  const arrastrar = async (a, b, n = 14) => { await mouse("mouseMoved", a); await mouse("mousePressed", a, { button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= n; i++) await mouse("mouseMoved", { x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }, { button: "left", buttons: 1 });
    await mouse("mouseReleased", b, { button: "left", buttons: 0, clickCount: 1 }); await w(150); };
  const clic = async (p) => { await mouse("mouseMoved", p); await mouse("mousePressed", p, { button: "left", buttons: 1, clickCount: 1 }); await mouse("mouseReleased", p, { button: "left", buttons: 0, clickCount: 1 }); await w(200); };
  const camara = (pos, mira) => ev(`(()=>{ const e = __low3d; e.camera.position.set(...${JSON.stringify(pos)}); e.controls.target.set(...${JSON.stringify(mira)});
    e.camera.lookAt(e.controls.target); e.controls.update(); return true; })()`);
  const herramienta = (t) => ev(`(()=>{ document.querySelector('[data-tool="${t}"]').click(); return true; })()`);
  const cajas = () => ev(`__low3d.strokes.filter(s => s.kind === "box").map(s => ({ y: Math.round(s.object.position.y * 1000) / 1000, alto: Math.round(s.object.scale.y * 1000) / 1000, hueco: !!s.object.userData.hueco }))`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
    await ev(`try{localStorage.clear(); localStorage.setItem("low3d:guia-fondos","1")}catch(e){}; __low3d.newProject(); __low3d.setView("persp"); true`);
    await camara([0, 6, 7], [0, -0.5, 0]); await w(200);

    // 1. hacia abajo: un hueco de 1,5 m
    await herramienta("box");
    await arrastrar(await aP([-1, 0, 1]), await aP([1, 0, -1]));
    for (const y of [-0.4, -0.9, -1.5]) await mouse("mouseMoved", await aP([0, y, 0]));
    await clic(await aP([0, -1.5, 0]));
    let c = await cajas();
    if (c.length !== 1) mal("no quedó el hueco", c);
    if (!c[0].hueco || Math.abs(c[0].y + 1.5) > 0.08 || Math.abs(c[0].alto - 1.5) > 0.08) mal("arrastrar hacia abajo no cavó un hueco de 1,5 m bajo el piso (al ras)", c[0]);

    // 2. sin tapa: dibujar desde arriba cae en el fondo
    await camara([0.2, 8, 0.6], [0, -1.5, 0]); await w(200);
    await herramienta("pencil");
    await arrastrar(await aP([-0.5, -1.5, 0]), await aP([0.5, -1.5, 0.2]));
    const t = await ev(`(()=>{ const s = __low3d.strokes.filter(s => s.kind === "stroke").at(-1); if (!s) return null; s.object.updateMatrixWorld(true);
      const p = s.points.map(q => q.clone().applyMatrix4(s.object.matrixWorld)); return [Math.min(...p.map(q => q.y)), Math.max(...p.map(q => q.y))].map(v => Math.round(v * 1000) / 1000); })()`);
    if (!t || Math.abs(t[0] + 1.5) > 0.05 || Math.abs(t[1] + 1.5) > 0.05) mal("dibujando desde arriba no se llega al fondo del hueco (tiene tapa)", { y: t });

    // 3. hacia arriba sigue construyendo
    await camara([0, 6, 9], [3, 0.5, 0]); await w(200);
    await herramienta("box");
    await arrastrar(await aP([3, 0, 1]), await aP([5, 0, -1]));
    for (const y of [0.5, 1, 2]) await mouse("mouseMoved", await aP([4, y, 0]));
    await clic(await aP([4, 2, 0]));
    c = await cajas();
    const arriba = c.find((x) => !x.hueco);
    if (!arriba || Math.abs(arriba.y) > 1e-6 || Math.abs(arriba.alto - 2) > 0.1) mal("hacia arriba no construyó una caja apoyada en el piso", c);

    // 4. el proyecto
    const vuelta = await ev(`(()=>{ const p = __low3d.exportProject(); __low3d.newProject(); __low3d.importProject(JSON.parse(JSON.stringify(p)));
      return __low3d.strokes.filter(s => s.kind === "box").map(s => { let tapa = 0; const m = s.object.children[0]; const idx = m.geometry.getIndex(); return { hueco: !!s.object.userData.hueco, triangulos: idx ? idx.count / 3 : 0 }; }); })()`);
    const h = vuelta.find((x) => x.hueco), b = vuelta.find((x) => !x.hueco);
    if (!h || !b || h.triangulos !== 10 || b.triangulos !== 12) mal("el hueco no vuelve como hueco sin tapa al reabrir", vuelta);

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
    console.log("E2E cavar con la caja OK", JSON.stringify({ cajas: c, fondo: t }));
  } finally { ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { } }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
setTimeout(() => process.exit(1), 120000).unref();
