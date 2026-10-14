/* DIBUJAR EN PERSPECTIVA EN EL ESTUDIO 3D: EL PISO ES APOYO. CDP :9223 + mock :8791.
   Historia: en v3.26 sólo se podía dibujar en perspectiva sobre las caras de un
   «esquema» (Calle, Habitación). En v3.29.3 los esquemas se fueron (Mauro: «de lo
   más inútil y tiene mucho ruido») y, como en Feather, el PISO es la primera
   superficie. Medido antes: arrastrar sobre la cuadrícula no dibujaba NADA y el
   aviso iba a un tooltip que no se veía. Con el mouse de verdad:
   0. Sin guías, en perspectiva: un trazo sobre el piso queda en el piso (y = 0).
   1. Mirando al cielo no hay dónde apoyar: no se dibuja y el aviso SE VE.
   2. Un trazo que arranca en la PUNTA de otro sigue en el piso (no toma la
      inclinación del tubo del trazo anterior).
   3. En la vista Arriba, una planta se dibuja EN el piso (y = 0), no flotando.
   4. Con el panel Cámara abierto, dibujar en Frente NO te devuelve a perspectiva. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/estudio3d/index.html";

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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 60000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const trazo = async (x, y, dx, dy) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 16; i++) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + dx * i / 16, y: y + dy * i / 16, button: "left", buttons: 1 }); await w(12); }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x + dx, y: y + dy, button: "left", buttons: 0, clickCount: 1 });
    await w(300);
  };
  /** Los puntos del último trazo, en el mundo. */
  const ultimo = () => ev(`(()=>{ const p = __low3d.exportProject(), s = p.strokes.at(-1); if (!s) return { n: 0 };
    const pts = s.points.map(q => [q[0] + s.position[0], q[1] + s.position[1], q[2] + s.position[2]]);
    const r = (v) => Math.round(v * 100) / 100;
    return { n: p.strokes.length, x: [r(Math.min(...pts.map(q => q[0]))), r(Math.max(...pts.map(q => q[0])))],
      y: [r(Math.min(...pts.map(q => q[1]))), r(Math.max(...pts.map(q => q[1])))], z: [r(Math.min(...pts.map(q => q[2]))), r(Math.max(...pts.map(q => q[2])))] }; })()`);

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
  await ev(`try{localStorage.clear()}catch(e){}; __low3d.newProject(); document.querySelector('[data-tool="pencil"]').click(); true`);
  await w(300);

  const vista = (v) => ev(`(()=>{ const s = document.querySelector('[aria-label="Vista de cámara"]'); s.value = ${JSON.stringify(v)}; s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  /** Del mundo a la pantalla, con la cámara del estudio. */
  const aPantalla = (p) => ev(`(()=>{ const e = __low3d, r = e.canvasElement().getBoundingClientRect(), c = e.camera;
    const v = new c.position.constructor(...${JSON.stringify(p)}).project(c); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; })()`);
  /** El último trazo, punto por punto, en el mundo. */
  const puntos = () => ev(`(()=>{ const p = __low3d.exportProject(), s = p.strokes.at(-1); if (!s) return [];
    return s.points.map(q => [q[0] + s.position[0], q[1] + s.position[1], q[2] + s.position[2]]); })()`);

  // ── 0. sin guías, en perspectiva: el piso es apoyo
  await trazo(560, 600, 240, -20);
  let t = await ultimo();
  if (t.n !== 1) mal("en perspectiva, sobre el piso, no se pudo dibujar", t);
  if (Math.abs(t.y[0]) > 0.05 || Math.abs(t.y[1]) > 0.05) mal("el trazo sobre el piso no quedó en el piso (y = 0)", t);

  // ── 1. mirando al cielo: no se dibuja, y el aviso se ve
  const horizonte = await ev(`(()=>{ const e = __low3d, r = e.canvasElement().getBoundingClientRect(), c = e.camera;
    const f = new c.position.constructor(); c.getWorldDirection(f); f.y = 0; f.normalize();
    const v = c.position.clone().add(f.multiplyScalar(5000)).project(c); return r.top + (1 - v.y) / 2 * r.height; })()`);
  await trazo(600, Math.max(140, horizonte - 120), 160, 0);
  if ((await ultimo()).n !== 1) mal("mirando al cielo se dibujó algo (no hay dónde apoyar)", await ultimo());
  const aviso = await ev(`(()=>{ const c = document.querySelector(".studio-context"); return { clase: c.className, texto: c.textContent }; })()`);
  if (!/is-aviso/.test(aviso.clase) || !/no hay dónde apoyar/i.test(aviso.texto)) mal("arrastrar sin apoyo no dijo por qué (el aviso no se ve)", aviso);

  // ── 2. arrancar en la punta del trazo anterior: sigue en el piso
  const punta = (await puntos()).at(-1);
  const P = await aPantalla(punta);
  await trazo(P.x, P.y, -60, 140);
  const seguido = await puntos();
  if ((await ultimo()).n !== 2) mal("arrancando en la punta de un trazo no se dibujó", await ultimo());
  const fuera = Math.max(...seguido.map(q => Math.abs(q[1])));
  if (fuera > 0.05) mal("el trazo que arranca en la punta de otro se despegó del piso (tomó el tubo)", { yMax: +fuera.toFixed(3) });

  // ── 3. en la vista Arriba, la planta va EN el piso
  await vista("top"); await w(400);
  await trazo(500, 350, 200, 60);
  t = await ultimo();
  if (t.n !== 3) mal("en la vista Arriba no se dibujó", t);
  if (Math.abs(t.y[0]) > 0.05 || Math.abs(t.y[1]) > 0.05) mal("en la vista Arriba la planta quedó flotando sobre el piso", t);

  // ── 4. con el panel Cámara abierto, dibujar en Frente NO te devuelve a perspectiva
  await ev(`(()=>{ document.querySelector('[data-panel="persp"]').click(); return true; })()`); await w(300);
  await vista("front"); await w(400);
  if ((await ev(`__low3d.currentView()`)) !== "front") mal("no se pudo pasar a la vista Frente", {});
  await trazo(300, 400, 150, 30);
  await w(300);
  const enVista = await ev(`__low3d.currentView()`);
  if (enVista !== "front") mal("con el panel Cámara abierto, dibujar en Frente te devolvió a " + enVista, {});
  t = await ultimo();
  if (t.n !== 4) mal("en Frente, con el panel Cámara abierto, no se dibujó", t);

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
  console.log("E2E dibujar en perspectiva sobre el piso del 3D OK");
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
