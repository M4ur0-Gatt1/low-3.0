/* CIERRE DEL PLAN 3D DE LAYOUTS (v3.29.3). CDP :9223 + mock :8791.
   Detalles que salieron al revisar el motor, con eventos reales:
   1. Una recta llevada a su eje que termina enganchada a una esquina FUERA del
      eje (5 cm corrida) no se tuerce: la punta va a la proyección de la esquina.
   2. El piso visto de CANTO (cerca del horizonte un píxel son metros): no se
      dibuja un trazo cortado sin aviso; se dice «demasiado lejos o de canto».
   3. Una guía MOVIDA sigue siendo apoyo en su lugar nuevo (su respaldo
      infinito quedaba donde estaba antes), y también al reabrir el proyecto.
   4. «Con las cajas»: las cajas salen al 2D como volumen gris; sin la casilla,
      no salen (son andamio). */
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
  const gesto = async (pts) => {
    await mouse("mouseMoved", pts[0]);
    await mouse("mousePressed", pts[0], { button: "left", buttons: 1, clickCount: 1 });
    for (const p of pts.slice(1)) { await mouse("mouseMoved", p, { button: "left", buttons: 1 }); await w(8); }
    await mouse("mouseReleased", pts.at(-1), { button: "left", buttons: 0, clickCount: 1 });
    await w(150);
  };
  const recta = async (a, b, n = 16) => { const out = []; for (let i = 0; i <= n; i++) out.push(await aPantalla(a.map((v, k) => v + (b[k] - v) * i / n))); return out; };
  const clic = async (p) => { await mouse("mouseMoved", p); await mouse("mousePressed", p, { button: "left", buttons: 1, clickCount: 1 }); await mouse("mouseReleased", p, { button: "left", buttons: 0, clickCount: 1 }); await w(150); };
  const camara = (pos, mira) => ev(`(()=>{ const e = __low3d; e.camera.position.set(...${JSON.stringify(pos)}); e.controls.target.set(...${JSON.stringify(mira)});
    e.camera.lookAt(e.controls.target); e.controls.update(); return true; })()`);
  const herramienta = (t) => ev(`(()=>{ document.querySelector('[data-tool="${t}"]').click(); return true; })()`);
  const ultimo = () => ev(`(()=>{ const s = __low3d.strokes.filter(s => s.kind === "stroke").at(-1); if (!s) return null; s.object.updateMatrixWorld(true);
    const p = s.points.map(q => q.clone().applyMatrix4(s.object.matrixWorld)), r = v => Math.round(v * 1000) / 1000;
    return { n: __low3d.strokes.filter(s => s.kind === "stroke").length, a: p[0].toArray().map(r), b: p.at(-1).toArray().map(r),
      y: [r(Math.min(...p.map(q => q.y))), r(Math.max(...p.map(q => q.y)))] }; })()`);
  const caja = async (a, b, alto) => {
    await herramienta("box");
    await gesto(await recta(a, b, 12));
    const c = [(a[0] + b[0]) / 2, alto, (a[2] + b[2]) / 2];
    for (const f of [0.3, 0.6, 1]) await mouse("mouseMoved", await aPantalla([c[0], alto * f, c[2]]));
    await clic(await aPantalla(c));
  };

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
    await ev(`try{localStorage.clear()}catch(e){}; __low3d.newProject(); __low3d.setView("persp"); true`);
    await camara([0, 5, 9], [0, 0.5, 0]); await w(200);

    // ── 1. recta que termina en una esquina corrida 5 cm del eje
    await caja([-1, 0, 1], [1, 0, -1], 2);
    await herramienta("pencil");
    const t10 = Math.tan(8 * Math.PI / 180);
    await gesto(await recta([-3, 0, 1.05], [0.99, 0, 1.05 - 3.99 * t10]));   // termina cerca de la esquina (1, 0, 1)
    let t = await ultimo();
    if (!t) mal("no se dibujó la recta en el piso", {});
    if (Math.abs(t.a[2] - 1.05) > 0.01 || Math.abs(t.b[2] - 1.05) > 0.01) mal("la recta se torció hacia la esquina que estaba fuera de su eje", t);
    if (Math.abs(t.b[0] - 1) > 0.05) mal("la punta no quedó a ras de la esquina (su proyección sobre el eje)", t);

    // ── 2. el piso de canto: aviso, no un trazo cortado
    const antes = (await ultimo()).n;
    await camara([0, 0.4, 10], [0, 0.4, -100]); await w(200);
    const horiz = await aPantalla([0, 0, -10000]);
    await gesto([{ x: horiz.x - 150, y: horiz.y + 2 }, { x: horiz.x - 50, y: horiz.y + 2 }, { x: horiz.x + 50, y: horiz.y + 2 }, { x: horiz.x + 150, y: horiz.y + 3 }]);
    const aviso = await ev(`(document.querySelector(".studio-context")||{}).textContent || ""`);
    if ((await ultimo()).n !== antes) mal("sobre el piso de canto se dibujó (un trazo cortado)", await ultimo());
    if (!/demasiado lejos|de canto/i.test(aviso)) mal("sobre el piso de canto no se dijo por qué no se dibuja", { aviso });

    // ── 3. una guía movida sigue siendo apoyo en su lugar nuevo
    await ev(`__low3d.setView("front"); true`); await w(300);
    await herramienta("guide");
    await gesto(await recta([-4, 1, 0], [-2.5, 1, 0]));       // desde Frente, una recta horizontal: un plano horizontal en y = 1
    const guia = await ev(`(()=>{ const e = __low3d, g = e.guides.at(-1); if (!g) return null; return { n: e.guides.length, y: g.plane && -g.plane.constant / (g.plane.normal.y || 1) }; })()`);
    if (!guia || Math.abs(guia.y - 1) > 0.05) mal("no se armó la guía horizontal en y = 1", guia);
    await ev(`(()=>{ const g = __low3d.guides.at(-1); g.mesh.position.y += 1.5; g.mesh.updateMatrixWorld(true); return true; })()`);   // como la deja el gizmo
    await ev(`__low3d.setView("persp"); true`); await w(300);
    // la guía nace donde está el centro de órbita (z = -100 tras el paso 2):
    // se la mira de arriba, donde está
    const gp = await ev(`__low3d.guides.at(-1).mesh.position.toArray()`);
    await camara([gp[0], 7, gp[2] + 10], [gp[0], 2.5, gp[2]]); await w(200);
    await herramienta("pencil");
    // sobre la malla de la guía (1,5 m de ancho, 6 de fondo), en su lugar nuevo
    await gesto(await recta([gp[0] - 0.5, 2.5, gp[2] + 0.8], [gp[0] + 0.5, 2.5, gp[2] - 0.6]));
    t = await ultimo();
    if (!t || Math.abs(t.y[0] - 2.5) > 0.02 || Math.abs(t.y[1] - 2.5) > 0.02) mal("la guía movida no sirve de apoyo en su lugar nuevo (y = 2,5)", t);
    // lejos de la malla, su plano infinito NO es apoyo (v3.34, la lógica de
    // Feather: se dibuja sobre lo que se ve); cae en el piso que está debajo
    await gesto(await recta([gp[0] + 3, 2.5, gp[2] + 3], [gp[0] + 5, 2.5, gp[2] + 1]));
    t = await ultimo();
    if (t && Math.abs(t.y[0] - 2.5) < 0.05) mal("lejos de la guía, el trazo cayó en su plano infinito (en la nada)", t);
    // y al reabrir el proyecto
    await ev(`(()=>{ const p = __low3d.exportProject(); __low3d.newProject(); __low3d.importProject(JSON.parse(JSON.stringify(p))); return true; })()`);
    await camara([gp[0], 7, gp[2] + 10], [gp[0], 2.5, gp[2]]); await w(200);
    await herramienta("pencil");
    await gesto(await recta([gp[0] + 0.5, 2.5, gp[2] + 1], [gp[0] - 0.5, 2.5, gp[2] - 0.4]));
    t = await ultimo();
    if (!t || Math.abs(t.y[0] - 2.5) > 0.02) mal("al reabrir, la guía movida volvió a apoyar en su lugar viejo", t);

    // ── 4. «con las cajas»
    await ev(`(()=>{ const e = __low3d; e.newProject(); e.setView("persp"); return true; })()`);
    await camara([0, 5, 9], [0, 0.5, 0]); await w(200);
    await caja([-1, 0, 1], [1, 0, -1], 2);
    const alfa = (cajas) => ev(`(async()=>{ const r = __low3d.mandarAl2D(320, 180, { cajas: ${cajas} }); const im = new Image(); im.src = r.png; await im.decode();
      const c = document.createElement("canvas"); c.width = 320; c.height = 180; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, 320, 180).data; let m = 0; for (let i = 3; i < d.length; i += 4) m = Math.max(m, d[i]); return m; })()`);
    const sin = await alfa(false), con = await alfa(true);
    if (sin !== 0) mal("sin la casilla, la caja salió en el layout", { sin });
    if (con < 250) mal("con «con las cajas», la caja no salió opaca en el layout", { con });
    const vuelve = await ev(`(()=>{ let op = null; __low3d.boxesGroup.traverse(o => { if (o.userData.caraDeCaja) op = o.material.opacity; }); return op; })()`);
    if (!(vuelve < 0.5)) mal("después de mandar, la caja quedó opaca en el estudio", { vuelve });

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
    console.log("E2E cierre del plan 3D OK", JSON.stringify({ sin, con }));
  } finally { ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { } }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
setTimeout(() => process.exit(1), 150000).unref();
