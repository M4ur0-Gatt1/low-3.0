/* LINE ART CUADRO A CUADRO DESDE EL 3D (v3.63). CDP :9223 + mock :8791.

   Una calle con casas y edificios (volúmenes de la biblioteca), una cámara de
   toma. La misma toma, renderizada en PNG:
   · normal: los volúmenes salen llenos;
   · Line Art: salen sólo sus bordes y siluetas — mucho menos pintado, el
     interior de las caras transparente — y no vacío (hay líneas).
   Y el panel Toma tiene la casilla «Sólo líneas (Line Art)», que viaja en el
   origen de la toma (para «Actualizar en el 2D»). */
const endpoint = "http://127.0.0.1:9223";
const base = "http://127.0.0.1:8791/ui/";

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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 120000);
    pending.set(n, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const evHost = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const evIframe = (expr) => evHost(`document.querySelector("#l3dFrame").contentWindow.eval(${JSON.stringify(expr)})`);
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: base + "index.html?mock=1" });
    for (let i = 0; i < 90; i++) { if (await evHost('document.readyState==="complete"&&typeof openL3d==="function"&&!!api').catch(() => false)) break; await w(400); }
    await evHost(`(async()=>{ try{localStorage.clear()}catch(e){} dzMenuAction("nuevo"); await new Promise(r=>setTimeout(r,2800)); if (typeof closeL3d==="function") closeL3d(); return true; })()`);
    await evHost(`openL3d()`);
    for (let i = 0; i < 120; i++) { if (await evIframe("!!window.__low3d").catch(() => false)) break; await w(250); }
    await w(500);
    await evIframe(`(async()=>{ const e = __low3d; e.newProject(); e.setView("persp"); __lowStore.setCurrentTool("pieza"); await new Promise(r => setTimeout(r, 400));
      const pz = (id) => { document.querySelector('.biblio3d-grilla [data-pieza="' + id + '"]').click(); return e.getPiezaActiva(); };
      const V = e.camera.position.constructor;
      e.colocarPieza(pz("plano-casa"), new V(-3, 0, 0), { escala: 1, giro: 0 });
      e.colocarPieza(pz("plano-edificio"), new V(4, 0, -6), { escala: 1, giro: 0 });
      e.camera.position.set(2, 4, 14); e.controls.target.set(0, 2, 0); e.camera.lookAt(e.controls.target); e.controls.update();
      e.tomaPonerClave(1); return true; })()`);
    await w(300);
    const medir = (lineArt) => evIframe(`(async()=>{ const f = await __low3d.tomaRender([1], 480, 270, { formato: "png", lineArt: ${lineArt} });
      const im = new Image(); im.src = f[0].data; await im.decode(); const c = document.createElement("canvas"); c.width = 480; c.height = 270; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
      const px = g.getImageData(0, 0, 480, 270).data; let pintados = 0, oscuros = 0; for (let i = 0; i < px.length; i += 4) { if (px[i + 3] > 30) { pintados++; if (px[i] < 90 && px[i + 1] < 90 && px[i + 2] < 90) oscuros++; } }
      return { pintados, oscuros }; })()`);
    const normal = await medir(false), linea = await medir(true);
    if (!(normal.pintados > 2000)) mal("la escena normal no tiene volúmenes a la vista (la prueba no armó la escena)", normal);
    if (!(linea.pintados > 150)) mal("el Line Art salió vacío", linea);
    if (!(linea.pintados < normal.pintados * 0.6)) mal("el Line Art no es sólo líneas: pinta casi lo mismo que lo normal", { normal, linea });
    if (!(linea.oscuros > linea.pintados * 0.5)) mal("las líneas del Line Art no son oscuras", linea);
    // después del Line Art, la escena vuelve a ser la de siempre
    const otra = await medir(false);
    if (Math.abs(otra.pintados - normal.pintados) > normal.pintados * 0.02) mal("después del Line Art la escena no volvió a sus materiales", { normal, otra });

    // la casilla en el panel Toma
    await evIframe(`document.querySelector('[data-panel="toma"]').click(); true`);
    await w(400);
    if (!(await evIframe(`!!document.querySelector(".toma3d-lineart")`))) mal("el panel Toma no tiene «Sólo líneas (Line Art)»", {});

    const errB = errores.filter((x) => !/ResizeObserver/.test(String(x)));
    if (errB.length) mal("errores en la página", errB);
    console.log("E2E Line Art desde el 3D OK " + JSON.stringify({ normal, linea }));
  } finally {
    try { await send("Page.close"); } catch (_) { /* ya cerrada */ }
    ws.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
