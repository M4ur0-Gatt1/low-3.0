/* VER LA FUGA EN EL ESTUDIO 3D SIN PRENDER NADA. CDP :9223 + mock :8791.

   Mauro, con la v3.30.0: «no entiendo bien cómo anda, ¿cómo uso el punto de
   fuga acá?». Su captura: «Escena 3» y la pantalla en blanco. MEDIDO: sin
   tildar «Ver el cuadro del 2D» el estudio no mostraba ni el horizonte ni los
   puntos de fuga, y los puntos casi siempre caen fuera de la pantalla.
   1. En Perspectiva, sin tocar el panel Cámara: se ven el horizonte y los tres
      puntos de fuga (sin el marco del cuadro, que sigue siendo opcional).
   2. Un punto fuera de la vista tiene una FLECHA en el borde que lo señala.
   3. Con cosas dibujadas y la cámara mirando a la nada, aparece «No se ve nada
      de lo dibujado»; «Encuadrar lo dibujado» las vuelve a mostrar. */
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
  const camara = (pos, mira) => ev(`(()=>{ const e = __low3d; e.camera.position.set(...${JSON.stringify(pos)}); e.controls.target.set(...${JSON.stringify(mira)});
    e.camera.lookAt(e.controls.target); e.controls.update(); return true; })()`);
  const capa = () => ev(`(()=>{ const s = __low3d.vpEl; const g = (e) => s.querySelector('g[data-p="vp-' + e + '"]');
    return { visible: s.style.display !== "none", horizonte: !!s.querySelector('[data-p="horizonte"]'), marco: !!s.querySelector('[data-p="marco"]'),
      puntos: ["x", "y", "z"].filter(e => g(e)), afuera: ["x", "y", "z"].filter(e => g(e) && g(e).getAttribute("data-afuera")) }; })()`);
  const clicEn = async (sel) => {
    const p = await ev(`(()=>{ const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!p) mal("no está " + sel, {});
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 });
    await w(300);
  };

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
    await ev(`try{localStorage.clear()}catch(e){}; __low3d.newProject(); __low3d.setView("persp"); true`);
    if (await ev(`__low3d.getPerspectiva().activa`)) mal("el proyecto nuevo arrancó con el cuadro del 2D prendido (la prueba quiere verlo apagado)", {});

    // 1 y 2. sin prender nada: horizonte y puntos, con flechas los de afuera
    await camara([-4, 3, 8], [1, 1, 0]); await w(400);
    const c = await capa();
    if (!c.visible || !c.horizonte) mal("en Perspectiva, sin el cuadro del 2D, no se ve el horizonte", c);
    if (c.puntos.length < 2) mal("en Perspectiva no se marcan los puntos de fuga", c);
    if (c.marco) mal("el marco del cuadro del 2D apareció sin pedirlo", c);
    if (!c.afuera.length) mal("ningún punto quedó afuera con esta cámara: la prueba no prueba las flechas", c);
    const flecha = await ev(`(()=>{ const g = __low3d.vpEl.querySelector('g[data-afuera]'); const r = __low3d.canvasElement().getBoundingClientRect();
      const b = g.getBoundingClientRect(); return { adentro: b.left >= r.left && b.right <= r.right && b.top >= r.top && b.bottom <= r.bottom, letra: g.querySelector("text").textContent, punta: !!g.querySelector("polygon") }; })()`);
    if (!flecha.adentro || !flecha.punta || !/^[XYZ]$/.test(flecha.letra)) mal("el punto de afuera no tiene su flecha con letra en el borde de la vista", flecha);
    // en una vista ortogonal no hay fuga: no se muestra
    await ev(`__low3d.setView("front"); true`); await w(300);
    if ((await capa()).visible) mal("en la vista Frente se siguen mostrando puntos de fuga", await capa());
    await ev(`__low3d.setView("persp"); true`); await w(300);

    // 3. vista vacía → «Encuadrar lo dibujado»
    await camara([0, 5, 9], [0, 0.5, 0]); await w(200);
    await ev(`(()=>{ document.querySelector('[data-tool="pencil"]').click(); return true; })()`);
    const a = await ev(`(()=>{ const e = __low3d, r = e.canvasElement().getBoundingClientRect(), c = e.camera; c.updateMatrixWorld(true);
      const p = (q) => { const v = new c.position.constructor(...q).project(c); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; };
      return [p([-1, 0, 1]), p([1, 0, 1])]; })()`);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a[0].x, y: a[0].y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: a[0].x, y: a[0].y, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a[0].x + (a[1].x - a[0].x) * i / 12, y: a[0].y + (a[1].y - a[0].y) * i / 12, button: "left", buttons: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: a[1].x, y: a[1].y, button: "left", buttons: 0, clickCount: 1 });
    await w(700);
    if (await ev(`!!document.querySelector(".studio-vacia")`)) mal("con lo dibujado a la vista aparece «No se ve nada»", {});
    await camara([0, 5, 9], [0, 60, 200]); await w(1200);       // mirando al cielo
    if (!(await ev(`!!document.querySelector(".studio-vacia")`))) mal("mirando a la nada no aparece «No se ve nada de lo dibujado»", {});
    await clicEn(".studio-vacia button");
    await w(1200);
    if (await ev(`!!document.querySelector(".studio-vacia")`)) mal("«Encuadrar lo dibujado» no volvió a mostrar lo dibujado", {});

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
    console.log("E2E ver la fuga en el 3D OK", JSON.stringify(c));
  } finally { ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { } }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
setTimeout(() => process.exit(1), 120000).unref();
