/* EL PROYECTO 3D VUELVE ENTERO Y SE PUEDE SEGUIR DIBUJANDO. CDP :9223 + mock :8791.

   El estudio RESTAURA el autoguardado cada vez que se abre, así que «cerrar y
   volver» pasa todo el tiempo. Tres defectos de ese camino (v3.29.2):
   1. IDS REPETIDOS: los trazos volvían con su id («stroke-3»), pero el
      contador arrancaba de cero: el primer trazo nuevo era otra vez
      «stroke-0», chocaba con uno existente y Ctrl+Z podía llevarse el que no era.
   2. LA FIGURA RELLENA VOLVÍA SIN CARA: sólo el contorno.
   3. EL PLANO DE APOYO de cada trazo (v3.29.3) tiene que volver con él: un trazo
      que arranca en la punta de uno restaurado sigue en el piso.
   Con el mouse de verdad: tres rectas y un rectángulo en el piso, recargar la
   página, dibujar uno más, Ctrl+Z. */
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
  const listo = async () => { for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) return; await w(250); } mal("el estudio no arrancó", {}); };
  /** Del mundo a la pantalla, con la cámara del estudio. */
  const aPantalla = (p) => ev(`(()=>{ const e = __low3d, r = e.canvasElement().getBoundingClientRect(), c = e.camera;
    const v = new c.position.constructor(...${JSON.stringify(p)}).project(c); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; })()`);
  const arrastrar = async (a, b) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x, y: a.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 14; i++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: a.x + (b.x - a.x) * i / 14, y: a.y + (b.y - a.y) * i / 14, button: "left", buttons: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", buttons: 0, clickCount: 1 });
    await w(150);
  };
  const enPiso = async (a, b) => arrastrar(await aPantalla(a), await aPantalla(b));
  const camara = () => ev(`(()=>{ __low3d.setView("persp"); const e = __low3d; e.camera.position.set(0, 9, 14); e.controls.target.set(0, 0, 0);
    e.camera.lookAt(e.controls.target); e.controls.update(); return true; })()`);
  const herramienta = (t) => ev(`(()=>{ const b = document.querySelector('[data-tool="${t}"]'); if (!b) throw Error("no está la herramienta ${t}"); b.click(); return true; })()`);
  const estado = () => ev(`(()=>{ const e = __low3d; return { ids: e.strokes.map(s => s.id),
    caras: e.strokes.filter(s => s.shape).map(s => { let c = 0; s.object.traverse(o => { if (o.userData && o.userData.esRelleno) c++; }); return c; }),
    apoyos: e.strokes.filter(s => !s.shape).map(s => !!s.apoyo) }; })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    await listo();
    await ev(`try{localStorage.clear()}catch(e){}; __low3d.newProject(); true`);
    await camara(); await w(200);

    // tres rectas y un rectángulo en el piso
    await herramienta("pencil");
    await enPiso([-4, 0, 2], [4, 0, 2]);
    await enPiso([-4, 0, -1], [4, 0, -1]);
    await enPiso([-4, 0, -4], [4, 0, -4]);
    await herramienta("rect");
    await enPiso([-2, 0, 4], [2, 0, 6]);
    const antes = await estado();
    if (antes.ids.length !== 4) mal("no se dibujaron las tres rectas y el rectángulo en el piso", antes);
    if (antes.caras[0] !== 1) mal("el rectángulo nació sin su cara", antes);
    if (!antes.apoyos.every(Boolean)) mal("un trazo nuevo no guardó su plano de apoyo", antes);

    // recargar: el estudio restaura el autoguardado
    await w(1400);                                     // el autoguardado espera 900 ms
    await send("Page.reload", { ignoreCache: true });
    await listo(); await w(500);
    const vuelto = await estado();
    if (vuelto.ids.length !== 4) mal("al reabrir no volvieron los cuatro objetos", vuelto);
    if (vuelto.caras[0] !== 1) mal("la figura rellena volvió SIN su cara", vuelto);
    if (!vuelto.apoyos.every(Boolean)) mal("el plano de apoyo de los trazos no volvió con el proyecto", vuelto);

    // uno más arrancando en la punta de un trazo restaurado: ids únicos y sigue en el piso
    await camara(); await w(200);
    await herramienta("pencil");
    const punta = await ev(`(()=>{ const s = __low3d.strokes.find(s => !s.shape); s.object.updateMatrixWorld(true); return s.points.at(-1).clone().applyMatrix4(s.object.matrixWorld).toArray(); })()`);
    await arrastrar(await aPantalla(punta), await aPantalla([punta[0] - 1, 0, punta[2] + 3]));
    const despues = await estado();
    if (despues.ids.length !== 5) mal("no se pudo dibujar después de reabrir", despues);
    if (new Set(despues.ids).size !== despues.ids.length) mal("hay ids REPETIDOS después de reabrir y dibujar", despues.ids);
    const alto = await ev(`(()=>{ const s = __low3d.strokes.at(-1); s.object.updateMatrixWorld(true);
      return Math.max(...s.points.map(p => Math.abs(p.clone().applyMatrix4(s.object.matrixWorld).y))); })()`);
    if (alto > 0.05) mal("arrancando en la punta de un trazo restaurado, el nuevo se despegó del piso", { yMax: alto });

    // Ctrl+Z saca SÓLO el nuevo
    await ev(`__low3d.undo(); true`); await w(150);
    const deshecho = await estado();
    if (deshecho.ids.join() !== vuelto.ids.join()) mal("Ctrl+Z no sacó sólo el trazo nuevo", { vuelto: vuelto.ids, deshecho: deshecho.ids });

    // «Nuevo proyecto» arranca con la vista de inicio: antes heredaba la cámara del
    // proyecto anterior (guardada en el autoguardado) y, si había quedado mirando
    // al cielo, en el proyecto nuevo no había piso donde dibujar
    await ev(`(()=>{ const e = __low3d; e.camera.position.set(0, 5, 9); e.controls.target.set(0, 9, -20); e.camera.lookAt(e.controls.target); e.controls.update(); e.newProject(); return true; })()`);
    await w(200);
    const inicio = await ev(`({ pos: __low3d.camera.position.toArray().map(v => Math.round(v * 100) / 100), mira: __low3d.controls.target.toArray().map(v => Math.round(v * 100) / 100), n: __low3d.strokes.length })`);
    if (inicio.pos.join() !== "0,1.2,6" || inicio.mira.join() !== "0,0.6,0") mal("«Nuevo proyecto» se quedó con la cámara del proyecto anterior", inicio);
    await herramienta("pencil");
    await arrastrar(await aPantalla([-1, 0, 2]), await aPantalla([1, 0, 2]));
    if ((await estado()).ids.length !== 1) mal("en un proyecto nuevo no se puede dibujar sobre el piso", await estado());

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
    console.log("E2E proyecto 3D al reabrir OK", JSON.stringify({ ids: despues.ids, yMax: +alto.toFixed(3) }));
  } finally { ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { } }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
setTimeout(() => process.exit(1), 120000).unref();
