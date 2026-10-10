/* UN CÍRCULO A MANO + SHIFT AL SOLTAR = UN CÍRCULO PERFECTO. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026, LOW 3.13): «tenía un atajo para dibujar un
   círculo manteniendo Alt o Shift al cerrar un pseudo círculo con la tableta;
   esa función no me está andando». En el 2D no existía: el lápiz y el pincel
   dejaban el trazo tal cual.

   Con el ratón de verdad (y la tecla apretada al soltar):
   1. Lápiz: un círculo torcido, abierto apenas, con Shift al soltar → queda
      un círculo de verdad (la distancia al centro casi no varía).
   2. Lápiz: una elipse torcida con Alt al soltar → queda una elipse (cada
      punto cumple la ecuación de la elipse) y conserva la proporción.
   3. Lápiz: el mismo círculo torcido SIN tecla queda torcido (no se toca lo
      que uno dibujó si no lo pide).
   4. Lápiz: un trazo abierto con Shift al soltar → una recta.
   5. Pincel: con Shift sale el círculo con el pincel (una cinta rellena).
   6. Ctrl+Z lo saca entero.
   Se dibuja a zoom 29 %, como en la pantalla de Mauro: ahí el suavizado del
   trazo a mano le sacaba casi todos los puntos a la forma y le dejaba bultos
   (se medía «redonda» a 50 % y se veía torcida en la app real). */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const tab = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl), pending = new Map(), errores = []; let id = 0;
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ({ data }) => { const m = JSON.parse(data);
    if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.j(Error(m.error.message)) : p.r(m.result); } };
  const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; pending.set(n, { r, j }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
  const pantalla = (x, y) => ev(`(()=>{ const q = dzToScreen(${x}, ${y}), r = document.querySelector("#dzCanvas").getBoundingClientRect(); return [q.x + r.left, q.y + r.top]; })()`);
  /* un trazo con el ratón; `mods` se aprieta en el último tramo y al soltar (1 Alt, 8 Shift) */
  const trazo = async (puntos, mods = 0) => {
    const pts = []; for (const [x, y] of puntos) pts.push(await pantalla(x, y));
    await mouse("mouseMoved", pts[0][0], pts[0][1]); await mouse("mousePressed", pts[0][0], pts[0][1], { buttons: 1, clickCount: 1 });
    pts.slice(1).forEach(() => {});
    for (let i = 1; i < pts.length; i++) { await mouse("mouseMoved", pts[i][0], pts[i][1], { buttons: 1, modifiers: i > pts.length - 6 ? mods : 0 }); await wait(6); }
    await mouse("mouseReleased", pts.at(-1)[0], pts.at(-1)[1], { buttons: 0, clickCount: 1, modifiers: mods }); await wait(500);
  };
  /* un círculo «a mano»: radio que ondula, y no cierra del todo */
  const torcido = (cx, cy, rx, ry) => Array.from({ length: 58 }, (_, i) => {
    const t = i / 60 * Math.PI * 2 + .3, w = 1 + .09 * Math.sin(5 * t) + .05 * Math.cos(3 * t);
    return [cx + Math.cos(t) * rx * w, cy + Math.sin(t) * ry * w];
  });
  // el último trazo de la hoja, medido sobre su recorrido en unidades del documento
  const medir = () => ev(`(()=>{ const svg = document.querySelector("#dzCanvas > svg");
    const todos = [...svg.querySelectorAll('[data-low-art="line"] path, [data-low-art="line"] > *')].filter(n => n.tagName === "path");
    const p = todos.at(-1); if (!p) return null; const L = p.getTotalLength(), q = [];
    for (let s = 0; s <= L; s += L / 160) { const a = p.getPointAtLength(s); q.push([a.x, a.y]); }
    const cx = q.reduce((s, a) => s + a[0], 0) / q.length, cy = q.reduce((s, a) => s + a[1], 0) / q.length;
    const d = q.map(a => Math.hypot(a[0] - cx, a[1] - cy)), m = d.reduce((s, v) => s + v, 0) / d.length;
    const sd = Math.sqrt(d.reduce((s, v) => s + (v - m) ** 2, 0) / d.length);
    const xs = q.map(a => a[0]), ys = q.map(a => a[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const rx = w / 2, ry = h / 2, ex = (Math.max(...xs) + Math.min(...xs)) / 2, ey = (Math.max(...ys) + Math.min(...ys)) / 2;
    const elipse = Math.max(...q.map(a => Math.abs(((a[0] - ex) / rx) ** 2 + ((a[1] - ey) / ry) ** 2 - 1)));
    // recta: distancia máxima a la cuerda entre el primero y el último
    const [a0, a1] = [q[0], q.at(-1)], cl = Math.hypot(a1[0] - a0[0], a1[1] - a0[1]) || 1;
    const recta = Math.max(...q.map(a => Math.abs((a1[0] - a0[0]) * (a0[1] - a[1]) - (a0[0] - a[0]) * (a1[1] - a0[1])) / cl));
    return { n: todos.length, redondez: +(sd / m).toFixed(4), proporcion: +(w / h).toFixed(3), elipse: +elipse.toFixed(3), recta: +recta.toFixed(2), largo: +cl.toFixed(1), relleno: p.getAttribute("fill") }; })()`);
  const contar = () => ev(`document.querySelectorAll('#dzCanvas > svg [data-low-art="line"] path').length`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); DZ.zoom = .29; DZ.panX = 0; DZ.panY = 0; dzApplyZoom(); dzSetTool("pencil"); return 1; })()'); await wait(300);

    // ── 3. sin tecla: queda como se dibujó ──────────────────────────────────
    await trazo(torcido(500, 400, 180, 180));
    const sinTecla = await medir();
    assert.ok(sinTecla && sinTecla.redondez > .04, "el trazo sin tecla no quedó torcido (la prueba no dibuja a mano): " + JSON.stringify(sinTecla));

    // ── 1. Shift al soltar: círculo perfecto ────────────────────────────────
    await trazo(torcido(1100, 400, 180, 180), 8);
    const circulo = await medir();
    assert.ok(circulo && circulo.redondez < .005, "Shift al soltar no dejó un círculo perfecto: " + JSON.stringify(circulo));

    // ── 2. Alt al soltar: elipse ────────────────────────────────────────────
    await trazo(torcido(1500, 700, 260, 130), 1);
    const elipse = await medir();
    assert.ok(elipse && elipse.elipse < .02 && Math.abs(elipse.proporcion - 2) < .25, "Alt al soltar no dejó una elipse con la proporción dibujada: " + JSON.stringify(elipse));

    // ── 4. trazo abierto + Shift: recta ─────────────────────────────────────
    const ondulada = Array.from({ length: 40 }, (_, i) => [300 + i * 20, 900 + Math.sin(i / 3) * 25]);
    await trazo(ondulada, 8);
    const recta = await medir();
    assert.ok(recta && recta.recta < 1.5 && recta.largo > 700, "Shift al soltar un trazo abierto no dejó una recta: " + JSON.stringify(recta));

    // ── 5. pincel ───────────────────────────────────────────────────────────
    await ev('(()=>{ dzSetTool("brush"); return 1; })()'); await wait(200);
    const antesPincel = await contar();
    await trazo(torcido(800, 800, 150, 150), 8);
    const pincel = await ev(`(()=>{ const ps = [...document.querySelectorAll('#dzCanvas > svg [data-low-art="line"] path')]; const p = ps.at(-1);
      const b = p.getBBox(); return { n: ps.length, w: +b.width.toFixed(1), h: +b.height.toFixed(1), fill: getComputedStyle(p).fill }; })()`);
    assert.ok(pincel.n > antesPincel && Math.abs(pincel.w - pincel.h) < 4, "con el pincel, Shift al soltar no dejó un círculo: " + JSON.stringify(pincel));

    // ── 6. Ctrl+Z lo saca entero ────────────────────────────────────────────
    await ev('(()=>{ const a = document.activeElement; if (a && a.blur) a.blur(); return 1; })()');
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 }); await wait(500);
    assert.equal(await contar(), antesPincel, "Ctrl+Z no sacó el círculo del pincel");

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E forma rápida OK " + JSON.stringify({ sinTecla: sinTecla.redondez, circulo: circulo.redondez, elipse: elipse.elipse, proporcion: elipse.proporcion, recta: recta.recta }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
