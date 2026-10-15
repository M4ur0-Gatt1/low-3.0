/* EL PISO DEL ESTUDIO 3D NO TIENE FIN, Y SE VE EL CENTRO DE TRABAJO.
   CDP :9223 + mock :8791.

   Mauro (v3.30.0): «quiero que la cuadrícula del piso no tenga fin; que esté
   marcado un centro de trabajo con algún color tipo magenta y líneas de punto,
   pero que la cuadrícula esté en todos lados». Antes era una cuadrícula de
   20 × 20 m: lejos del centro no había piso.
   Se mira la PANTALLA (píxeles de verdad, no el modelo):
   1. Con la cámara a 800 m del centro mirando el piso, hay cuadrícula.
   2. Mirando el centro, hay magenta (los ejes y el círculo de puntos).
   3. Lejos del centro no hay magenta (es una marca, no un patrón).
   4. «Cuadrícula» la apaga y la prende. */
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
  /** Mide en la PANTALLA, dentro del lienzo y lejos de los paneles: cuántos
   *  píxeles se apartan del fondo (líneas) y cuántos son magenta. */
  const medir = async () => {
    await w(500);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    return ev(`(async()=>{ const im = new Image(); im.src = "data:image/png;base64,${shot.data}"; await im.decode();
      const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
      const x0 = 300, y0 = 250, w = 600, h = 300; const d = g.getImageData(x0, y0, w, h).data;
      const fondo = [d[0], d[1], d[2]]; let lineas = 0, magenta = 0;
      for (let i = 0; i < d.length; i += 4) {
        const dr = Math.abs(d[i] - fondo[0]) + Math.abs(d[i + 1] - fondo[1]) + Math.abs(d[i + 2] - fondo[2]);
        if (dr > 18) lineas++;
        if (d[i] > 150 && d[i + 1] < 110 && d[i + 2] > 70 && d[i] - d[i + 1] > 80) magenta++;
      }
      return { lineas, magenta }; })()`);
  };

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
    await ev(`try{localStorage.clear(); localStorage.setItem("low3d:guia-fondos","1")}catch(e){}; __low3d.newProject(); __low3d.setView("persp"); true`);

    // 1. lejos del centro: hay piso
    await camara([800, 6, 812], [800, 0, 800]);
    const lejos = await medir();
    if (lejos.lineas < 1500) mal("a 800 m del centro no hay cuadrícula: el piso se termina", lejos);
    // 3. y ahí no hay magenta
    if (lejos.magenta > 20) mal("lejos del centro aparece magenta (la marca del centro se repite)", lejos);

    // 2. mirando el centro: magenta
    await camara([0, 6, 9], [0, 0, 0]);
    const centro = await medir();
    if (centro.magenta < 150) mal("en el centro no se ve la marca magenta del centro de trabajo", centro);

    // 4. el botón «Cuadrícula»
    const vis = await ev(`(()=>{ const a = __low3d.toggleGrid(); const b = __low3d.toggleGrid(); return [a, b]; })()`);
    if (vis[0] !== false || vis[1] !== true) mal("«Cuadrícula» no apaga y prende el piso", vis);

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
    console.log("E2E piso infinito OK", JSON.stringify({ lejos, centro }));
  } finally { ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { } }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
setTimeout(() => process.exit(1), 90000).unref();
