/* MOVER CON SHIFT: EL OBJETO SE QUEDA SOBRE SU LÍNEA. CDP :9223 + mock :8791.

   Pedido de Mauro (v3.27): «si estoy con la herramienta selección y muevo un
   objeto apretando Shift, que mantenga la línea en la que está». Como en
   Illustrator: con Shift el arrastre queda horizontal, vertical o a 45°, la
   que más se parezca al gesto; y Shift sobre algo YA elegido no lo saca si se
   arrastra (sólo un clic sin mover lo saca de la selección).

   Con el mouse de verdad:
   1. Sin Shift, un arrastre torcido mueve en los dos ejes (control).
   2. Con Shift, casi horizontal → sólo horizontal.
   3. Con Shift, casi vertical → sólo vertical.
   4. Con Shift, en diagonal → exactamente a 45°.
   5. Shift apretado DESDE el clic sobre lo elegido: arrastra en línea y sigue elegido.
   6. Shift+clic sin mover sobre lo elegido: lo saca de la selección.
   7. Ctrl+Z deshace un movimiento. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const SHIFT = 8;

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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 120000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  /** Arrastre de mouse real; `shift` = "todo" (desde el clic) o "medio" (se aprieta ya arrastrando). */
  const arrastrar = async (x, y, dx, dy, shift = null) => {
    const mod = (i) => (shift === "todo" || (shift === "medio" && i > 2)) ? SHIFT : 0;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1, modifiers: mod(0) });
    for (let i = 1; i <= 10; i++) {
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + dx * i / 10, y: y + dy * i / 10, button: "left", buttons: 1, modifiers: mod(i) });
      await w(12);
    }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x + dx, y: y + dy, button: "left", buttons: 0, clickCount: 1, modifiers: mod(10) });
    await w(200);
  };
  /** Centro del objeto en la pantalla y en el lienzo. */
  const centro = () => ev(`(()=>{ const el = window.__obj; const r = el.getBoundingClientRect();
    const sx = r.left + r.width / 2, sy = r.top + r.height / 2; const u = dzToUser(sx, sy);
    return { sx, sy, x: u.x, y: u.y, elegido: DZ.sel === el || (DZ.multi || []).includes(el) }; })()`);

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    if (await ev('document.readyState==="complete"&&typeof dzSetTool==="function"&&!!api&&!!LOW.drawing.selection').catch(() => false)) break;
    await w(400);
  }
  const listo = await ev(`(async()=>{ try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); if (typeof dzDocInit === "function") await dzDocInit(); await new Promise(r=>setTimeout(r,600));
    if (typeof closeL3d === "function") closeL3d(); dzMenuAction("fit"); dzSetTool("select");
    // un objeto propio, chico y aislado, para no depender del diseño de ejemplo
    const svg = document.querySelector("#dzCanvas > svg");
    const r = document.createElementNS(svg.namespaceURI, "rect");
    r.setAttribute("x", 1300); r.setAttribute("y", 200); r.setAttribute("width", 160); r.setAttribute("height", 120); r.setAttribute("fill", "#33aa55");
    dzArtAppend(svg, r); dzDocCommit(); dzBuildLayers(); window.__obj = r; return true; })()`);
  if (!listo) mal("no se pudo montar", {});

  // 1. sin Shift: un arrastre torcido mueve en los dos ejes
  let a = await centro();
  await arrastrar(a.sx, a.sy, 90, 25);
  let b = await centro();
  if (!(Math.abs(b.x - a.x) > 20 && Math.abs(b.y - a.y) > 5)) mal("sin Shift el objeto no se movió libre", { a, b });

  // 2. Shift (apretado ya arrastrando), casi horizontal → sólo horizontal
  a = await centro();
  await arrastrar(a.sx, a.sy, 110, 22, "medio");
  b = await centro();
  if (Math.abs(b.y - a.y) > 0.01 || Math.abs(b.x - a.x) < 20) mal("con Shift un arrastre casi horizontal no quedó horizontal", { a, b });

  // 3. casi vertical → sólo vertical
  a = await centro();
  await arrastrar(a.sx, a.sy, -18, 95, "medio");
  b = await centro();
  if (Math.abs(b.x - a.x) > 0.01 || Math.abs(b.y - a.y) < 20) mal("con Shift un arrastre casi vertical no quedó vertical", { a, b });

  // 4. en diagonal → exactamente 45°
  a = await centro();
  await arrastrar(a.sx, a.sy, -70, -58, "medio");
  b = await centro();
  if (Math.abs(Math.abs(b.x - a.x) - Math.abs(b.y - a.y)) > 0.01 || Math.abs(b.x - a.x) < 20) mal("con Shift en diagonal no quedó a 45°", { a, b });

  // 5. Shift desde el clic sobre lo elegido: arrastra en línea y sigue elegido
  a = await centro();
  if (!a.elegido) mal("el objeto no quedó elegido después de moverlo", a);
  await arrastrar(a.sx, a.sy, 100, -15, "todo");
  b = await centro();
  if (!b.elegido) mal("Shift+arrastrar lo elegido lo sacó de la selección", b);
  if (Math.abs(b.y - a.y) > 0.01 || Math.abs(b.x - a.x) < 20) mal("Shift desde el clic no movió en línea", { a, b });

  // 6. Shift+clic sin mover sobre lo elegido: lo saca
  a = await centro();
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.sx, y: a.sy, button: "left", buttons: 1, clickCount: 1, modifiers: SHIFT });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: a.sx, y: a.sy, button: "left", buttons: 0, clickCount: 1, modifiers: SHIFT });
  await w(200);
  b = await centro();
  if (b.elegido) mal("Shift+clic sin mover sobre lo elegido no lo sacó de la selección", b);
  if (Math.hypot(b.x - a.x, b.y - a.y) > 0.01) mal("Shift+clic sin mover lo movió", { a, b });

  // 7. Ctrl+Z deshace el último movimiento
  const antesZ = await centro();
  await ev(`(()=>{ dzDocCommit(); dzUndo(); return true; })()`); await w(300);
  const despuesZ = await ev(`(()=>{ const el = document.querySelector('#dzCanvas > svg rect[fill="#33aa55"]'); window.__obj = el; return !!el; })()`);
  const c = despuesZ ? await centro() : null;
  if (!c || Math.abs(c.x - antesZ.x) < 1) mal("Ctrl+Z no deshizo el movimiento en línea", { antesZ, c });

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
  console.log("E2E mover en línea OK");
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
