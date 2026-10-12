/* DIBUJAR SOBRE LA PERSPECTIVA DEL ESTUDIO 3D. CDP :9223 + mock :8791.

   Reportado por Mauro después de la v3.26: «el sistema 3D lo dejaste todo roto,
   no se puede dibujar en las perspectivas». Dos causas, con el mouse de verdad:
   1. En perspectiva el estudio sólo dibuja sobre una superficie, y las líneas
      del esquema son dibujo: sobre la calle no pasaba nada. Ahora el piso, las
      paredes y el techo del esquema son soporte: un trazo sobre el piso queda
      en el piso (y = 0) y uno sobre la fachada, en la fachada (x = 8).
   2. Con el panel Perspectiva abierto, al soltar cada trazo el panel releía la
      cámara y te devolvía a la vista perspectiva: no se podía dibujar en Frente.
   Y sin la perspectiva de layout, todo sigue como antes (se dibuja con un plano). */
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

  // ── 0. sin perspectiva de layout: en perspectiva sin soporte no se dibuja (como siempre)
  await trazo(600, 600, 160, 0);
  if ((await ultimo()).n !== 0) mal("sin soporte, en perspectiva no debería dibujarse (regla del estudio)", await ultimo());

  // ── 1. Calle, 1 punto, SIN plano ni guía: el piso y la fachada son soporte
  await ev(`(()=>{ __low3d.setPerspectiva({ activa: true, esquema: "calle", puntos: 1, giro: 0, inclinacion: 0, altura: 1.6 }); return true; })()`);
  await w(500);
  await trazo(560, 600, 240, 0);                      // abajo del horizonte, en el medio: el piso
  let t = await ultimo();
  if (t.n !== 1) mal("sobre el piso de la calle no se pudo dibujar", t);
  if (Math.abs(t.y[0]) > 0.2 || Math.abs(t.y[1]) > 0.2) mal("el trazo sobre el piso no quedó en el piso (y = 0)", t);
  await trazo(1150, 250, 0, 160);                     // a la derecha, arriba: la fachada (x = 8)
  t = await ultimo();
  if (t.n !== 2) mal("sobre la fachada no se pudo dibujar", t);
  if (Math.abs(t.x[0] - 8) > 0.3 || Math.abs(t.x[1] - 8) > 0.3) mal("el trazo sobre la fachada no quedó en la fachada (x = 8)", t);

  // ── 2. con el panel abierto, dibujar en Frente NO te devuelve a perspectiva
  await ev(`(()=>{ document.querySelector('[data-panel="persp"]').click(); return true; })()`); await w(300);
  await ev(`(()=>{ const s = document.querySelector('[aria-label="Vista de cámara"]'); s.value = "front"; s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  await w(400);
  if ((await ev(`__low3d.currentView()`)) !== "front") mal("no se pudo pasar a la vista Frente", {});
  await trazo(300, 400, 150, 30);
  await w(300);
  const vista = await ev(`__low3d.currentView()`);
  if (vista !== "front") mal("con el panel Perspectiva abierto, dibujar en Frente te devolvió a " + vista, {});
  t = await ultimo();
  if (t.n !== 3) mal("en Frente, con la perspectiva de layout prendida, no se dibujó", t);

  // ── 3. Habitación: el piso, el techo y la pared del fondo
  await ev(`(()=>{ document.querySelector('[aria-label="Cerrar inspector"]')?.click(); __low3d.setPerspectiva({ activa: true, esquema: "habitacion", puntos: 1, giro: 0, inclinacion: 0, altura: 1.5 }); return true; })()`);
  await w(500);
  await trazo(620, 380, 120, 0);                      // al centro: la pared del fondo (z = -8)
  t = await ultimo();
  if (t.n !== 4 || Math.abs(t.z[0] + 8) > 0.3 || Math.abs(t.z[1] + 8) > 0.3) mal("en la habitación, el trazo al fondo no quedó en la pared del fondo", t);

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
  console.log("E2E dibujar sobre la perspectiva 3D OK");
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
