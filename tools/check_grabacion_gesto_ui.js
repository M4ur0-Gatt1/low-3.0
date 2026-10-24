/* LA ACTUACIÓN SE GRABA CON EL TIEMPO DEL GESTO, NO CON EL DE ATENDERLO (v3.47).
   CDP :9223 + mock :8791.

   «⏹ Grabación armada»: se agarra un elemento y se lo arrastra actuando el
   movimiento; al soltar, cada instante se vuelve un cuadro. Cada muestra
   anotaba la hora en que LOW ATENDÍA el movimiento (performance.now()), no la
   del gesto: con LOW ocupado, un movimiento parejo quedaba con un salto (un
   tramo quieto y otro de golpe). Lo mismo en la marioneta de huesos (🎥) y en
   el ritmo tocado con Espacio (check_tomas_ui).

   Se arrastra con muestras cada 50 ms (hora de la entrada, `timestamp` de CDP)
   y el hilo principal ocupado 600 ms en medio: las muestras tienen que quedar
   a 50 ms una de otra. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

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
    pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  await send("Page.navigate", { url });
  for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzDocumentNew==="function"&&typeof dzSetTool==="function"&&!!api').catch(() => false)) break; await w(200); }
  await ev(`(async () => { await dzDocumentNew(); const s = document.getElementById("lowSplash"); if (s) s.remove(); return true; })()`);
  await w(800);

  // un rectángulo en el dibujo, la flecha, y la grabación armada
  const centro = await ev(`(() => {
    const host = document.querySelector('#dzCanvas > svg g[data-low-art="line"]') || document.querySelector("#dzCanvas > svg");
    const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    r.id = "actor"; r.setAttribute("x", "700"); r.setAttribute("y", "400"); r.setAttribute("width", "160"); r.setAttribute("height", "120");
    r.setAttribute("fill", "#c33"); host.appendChild(r);
    dzSetTool("select");
    window.__rec = null; window.dzRecFinish = (rec) => { window.__rec = rec; DZ.rec = null; };
    DZ.rec = { armed: true };
    const q = r.getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2];
  })()`);
  await w(200);
  const T0 = Date.now() / 1000;
  const raton = (type, x, y, dt, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", timestamp: T0 + dt, ...extra });
  await raton("mouseMoved", centro[0], centro[1], 0);
  await raton("mousePressed", centro[0], centro[1], 0.01, { buttons: 1, clickCount: 1 });
  for (let k = 1; k <= 12; k++) {
    if (k === 6) send("Runtime.evaluate", { expression: "(()=>{ const t = performance.now(); while (performance.now() - t < 600) {} return 1; })()" });
    await raton("mouseMoved", centro[0] + k * 10, centro[1], 0.01 + k * 0.05, { buttons: 1 });
  }
  await raton("mouseReleased", centro[0] + 120, centro[1], 0.01 + 12 * 0.05 + 0.01, { buttons: 0, clickCount: 1 });
  let rec = null;
  for (let i = 0; i < 30 && !rec; i++) { rec = await ev(`window.__rec && { samples: window.__rec.samples }`); if (!rec) await w(100); }
  if (!rec) mal("PRUEBA MAL ARMADA: el arrastre con la grabación armada no terminó en dzRecFinish", {});
  const t = rec.samples.map((s) => s[2]), saltos = t.slice(1).map((x, i) => Math.round(x - t[i]));
  if (rec.samples.length < 10) mal("PRUEBA MAL ARMADA: el gesto dejó pocas muestras", { n: rec.samples.length });
  if (Math.max(...saltos.slice(1)) > 120) mal("con LOW ocupado, la actuación grabada tiene un salto que el gesto no tuvo (ms entre muestras)", saltos);
  const dur = t[t.length - 1];
  if (Math.abs(dur - 600) > 80) mal("la duración grabada no es la del gesto (600 ms)", { dur, saltos });
  if (errores.length) mal("errores de la página", errores);
  console.log("OK check_grabacion_gesto_ui:", JSON.stringify({ muestras: rec.samples.length, dur: Math.round(dur), saltos }));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
