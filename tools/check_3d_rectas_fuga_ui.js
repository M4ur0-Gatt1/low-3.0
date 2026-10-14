/* RECTAS A LOS EJES EN EL ESTUDIO 3D, y la goma y la selección con cajas.
   CDP :9223 + mock :8791.

   Mauro: «el trazo no sigue la fuga». En el 3D una recta fuga sola si va
   paralela a un eje del espacio; a mano nunca sale exacta. Como el «Draw
   Shape» de Feather, al SOLTAR: un trazo casi recto a menos de 22° de un eje
   de su superficie pasa a ser la recta exacta sobre ese eje. Las curvas no se
   tocan. Con eventos reales, sobre una caja de 2 × 2 × 2 m:
   1. En la cara de adelante, una recta tirada con 10° de error sale horizontal
      exacta (paralela a la arista), en la cara.
   2. Una curva en la misma cara queda como se dibujó.
   3. Con Shift no se corrige (sigue torcida 10°).
   4. En el piso, una recta con 10° de error sale exacta a lo largo de Z.
   5. Desde Frente, también.
   6. Con «Rectas a los ejes» apagado, queda como se dibujó.
   Y dos defectos de las cajas (v3.29.3):
   7. Un clic de goma que erra la línea y cae en la cara NO borra la caja; el
      lazo de goma sobre la cara borra las líneas y deja la caja.
   8. Un trazo que se ve a través de la cara de una caja se elige con un clic. */
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
  const mouse = (type, p, extra = {}) => send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, ...extra });
  /** Un gesto por puntos de PANTALLA, con modificadores (8 = Shift). */
  const gesto = async (pts, modifiers = 0) => {
    await mouse("mouseMoved", pts[0], { modifiers });
    await mouse("mousePressed", pts[0], { button: "left", buttons: 1, clickCount: 1, modifiers });
    for (const p of pts.slice(1)) { await mouse("mouseMoved", p, { button: "left", buttons: 1, modifiers }); await w(8); }
    await mouse("mouseReleased", pts.at(-1), { button: "left", buttons: 0, clickCount: 1, modifiers });
    await w(150);
  };
  /** Del mundo: n puntos de a a b. */
  const recta = async (a, b, n = 16) => { const out = []; for (let i = 0; i <= n; i++) out.push(await aPantalla(a.map((v, k) => v + (b[k] - v) * i / n))); return out; };
  const clic = async (p) => { await mouse("mouseMoved", p); await mouse("mousePressed", p, { button: "left", buttons: 1, clickCount: 1 }); await mouse("mouseReleased", p, { button: "left", buttons: 0, clickCount: 1 }); await w(150); };
  const camara = (pos, mira) => ev(`(()=>{ const e = __low3d; e.camera.position.set(...${JSON.stringify(pos)}); e.controls.target.set(...${JSON.stringify(mira)});
    e.camera.lookAt(e.controls.target); e.controls.update(); return true; })()`);
  const herramienta = (t) => ev(`(()=>{ document.querySelector('[data-tool="${t}"]').click(); return true; })()`);
  /** El último trazo: cuántos puntos, su dirección y sus rangos en el mundo. */
  const ultimo = () => ev(`(()=>{ const s = __low3d.strokes.filter(s => s.kind === "stroke").at(-1); if (!s) return null; s.object.updateMatrixWorld(true);
    const p = s.points.map(q => q.clone().applyMatrix4(s.object.matrixWorld)), r = v => Math.round(v * 1000) / 1000;
    const d = p.at(-1).clone().sub(p[0]).normalize();
    return { n: p.length, dir: d.toArray().map(r), y: [r(Math.min(...p.map(q => q.y))), r(Math.max(...p.map(q => q.y)))], z: [r(Math.min(...p.map(q => q.z))), r(Math.max(...p.map(q => q.z)))] }; })()`);
  const grados = (dir, eje) => Math.acos(Math.min(1, Math.abs(dir[0] * eje[0] + dir[1] * eje[1] + dir[2] * eje[2]))) * 180 / Math.PI;
  const cuantos = () => ev(`({ cajas: __low3d.strokes.filter(s => s.kind === "box").length, trazos: __low3d.strokes.filter(s => s.kind === "stroke").length })`);
  const t10 = Math.tan(10 * Math.PI / 180);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
    await ev(`try{localStorage.clear()}catch(e){}; __low3d.newProject(); __low3d.setView("persp"); true`);
    if (!(await ev(`!!document.querySelector(".studio-fuga[aria-pressed=true]")`))) mal("no está prendido «Rectas a los ejes» en la barra", {});
    await camara([0, 5, 9], [0, 0.5, 0]); await w(200);
    // una caja de 2 × 2 × 2
    await herramienta("box");
    await gesto(await recta([-1, 0, 1], [1, 0, -1], 12));
    for (const y of [0.5, 1, 1.5, 2]) await mouse("mouseMoved", await aPantalla([0, y, 0]));
    await clic(await aPantalla([0, 2, 0]));
    if ((await cuantos()).cajas !== 1) mal("no se armó la caja", await cuantos());
    await herramienta("pencil");

    // 1. recta con 10° de error en la cara de adelante → horizontal exacta
    await gesto(await recta([-0.8, 0.6, 1], [0.8, 0.6 + 1.6 * t10, 1]));
    let t = await ultimo();
    if (grados(t.dir, [1, 0, 0]) > 0.05 || Math.abs(t.z[0] - 1) > 0.01 || Math.abs(t.z[1] - 1) > 0.01) mal("la recta en la cara no quedó exacta sobre la arista (X), en la cara", t);

    // 2. una curva en la misma cara no se toca
    const arco = []; for (let i = 0; i <= 18; i++) { const a = Math.PI * i / 18; arco.push(await aPantalla([-0.6 * Math.cos(a), 1.2 + 0.5 * Math.sin(a), 1])); }
    await gesto(arco);
    t = await ultimo();
    if (t.n < 5 || t.y[1] - t.y[0] < 0.3) mal("una curva en la cara quedó enderezada", t);

    // 3. con Shift no se corrige: sigue torcida
    await gesto(await recta([-0.8, 0.3, 1], [0.8, 0.3 + 1.6 * t10, 1]), 8);
    t = await ultimo();
    if (grados(t.dir, [1, 0, 0]) < 5) mal("con Shift la recta se corrigió igual", t);

    // 4. en el piso, a lo largo de Z con 10° de error → exacta en Z
    await gesto(await recta([2.5, 0, 2], [2.5 + 2.5 * t10, 0, -0.5]));
    t = await ultimo();
    if (grados(t.dir, [0, 0, 1]) > 0.05 || Math.abs(t.y[0]) > 0.01 || Math.abs(t.y[1]) > 0.01) mal("en el piso la recta no quedó exacta a lo largo de Z", t);

    // 5. desde Frente
    await ev(`__low3d.setView("front"); true`); await w(300);
    await gesto(await recta([-0.7, 1.6, 1], [0.7, 1.6 + 1.4 * t10, 1]));
    t = await ultimo();
    if (grados(t.dir, [1, 0, 0]) > 0.05 || Math.abs(t.z[0] - 1) > 0.01) mal("desde Frente la recta en la cara no quedó exacta", t);
    await ev(`__low3d.setView("persp"); true`); await w(300); await camara([0, 5, 9], [0, 0.5, 0]); await w(200);

    // 6. apagado: queda como se dibujó
    await ev(`(()=>{ document.querySelector(".studio-fuga").click(); return true; })()`); await w(150);
    if (await ev(`__low3d.getImanFuga()`)) mal("el botón no apagó «Rectas a los ejes»", {});
    await gesto(await recta([-0.8, 1.5, 1], [0.8, 1.5 + 1.6 * t10, 1]));
    t = await ultimo();
    if (grados(t.dir, [1, 0, 0]) < 5) mal("con «Rectas a los ejes» apagado la recta se corrigió igual", t);
    await ev(`(()=>{ document.querySelector(".studio-fuga").click(); return true; })()`);

    // 7. la goma no borra la caja
    const antes = await cuantos();
    await herramienta("eraser");
    await clic(await aPantalla([0.5, 1.9, 1]));        // en la cara, lejos de toda línea
    if ((await cuantos()).cajas !== 1) mal("un clic de goma en la cara BORRÓ la caja entera", await cuantos());
    const lazo = [[-0.95, 0.05, 1], [0.95, 0.05, 1], [0.95, 1.95, 1], [-0.95, 1.95, 1], [-0.95, 0.05, 1]];
    const pl = []; for (let i = 0; i + 1 < lazo.length; i++) for (let k = 0; k < 6; k++) pl.push(await aPantalla(lazo[i].map((v, j) => v + (lazo[i + 1][j] - v) * k / 6)));
    await gesto(pl);
    const despues = await cuantos();
    if (despues.cajas !== 1) mal("el lazo de goma sobre la cara borró la caja", despues);
    if (!(despues.trazos < antes.trazos)) mal("el lazo de goma no borró las líneas de la cara", { antes, despues });

    // 8. un trazo visto a través de la cara se elige con un clic
    await herramienta("pencil");
    await camara([0, 1, -0.2], [0, 1, -5]); await w(150);   // adentro: la pared del fondo
    await gesto(await recta([-0.4, 1, -1], [0.4, 1, -1]));
    await camara([0, 5, 9], [0, 0.5, 0]); await w(150);
    await herramienta("move");
    await clic(await aPantalla([0, 1, -1]));
    const elegido = await ev(`[...__low3d.selected].map(s => s.kind)`);
    if (elegido.join() !== "stroke") mal("un trazo visto a través de la caja no se pudo elegir (agarró la caja)", elegido);

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
    console.log("E2E rectas a los ejes y cajas OK", JSON.stringify(despues));
  } finally { ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { } }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
setTimeout(() => process.exit(1), 150000).unref();
