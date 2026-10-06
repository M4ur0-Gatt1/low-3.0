/* EL PINCEL POR DEFECTO, SUAVE. CDP :9223 + mock :8791.

   Reporte de un usuario (oct-2026, vía Mauro): «el pincel por defecto es un
   poco vectorial, tosco; que sea más fluido y suave».

   MEDIDO antes del arreglo, con el mismo trazo en S:
   - no había ningún pincel elegido al arrancar: el Pincel dibujaba con el
     camino viejo (dzBrushRibbon), 25 curvas por lado y extremos CORTADOS EN
     RECTO: 3 quiebres de más de 30° (hasta 105°) en el contorno;
   - con un pincel elegido, el motor hacía el contorno con SEGMENTOS RECTOS
     (6464 «L» para ese trazo, ~190 KB por trazo).

   Con el mouse de verdad:
   1. Al arrancar sin nada guardado hay un pincel elegido (Tinta limpia) y el
      selector lo muestra.
   2. Un trazo en S con el Pincel: contorno CURVO, sin quiebres de más de 30°
      (remates redondos), y liviano (menos de 20 KB).
   3. El pincel elegido se recuerda al reabrir.
   4. El suavizado se recuerda al reabrir (se guardaba en otra clave). */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

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
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
  const centro = (sel) => ev(`(()=>{ const e = ${sel}; if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } : null; })()`);
  const clic = async (sel, que) => {
    const p = await centro(sel); assert.ok(p, "no se ve " + que);
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(250);
  };
  const cargar = async () => {
    await send("Page.reload", { ignoreCache: true });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&!!document.querySelector("#dzBienvenida2D [data-a=nuevo]:not([disabled])")').catch(() => false)) break; await wait(300); }
  };
  const nuevo = async () => { await clic(`document.querySelector('#dzBienvenida2D [data-a="nuevo"]')`, "Nuevo documento"); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()'); };

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 820, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} return true; })()');
    await cargar(); await nuevo();

    // ── 1. hay un pincel elegido, y el selector lo muestra ─────────────────
    await clic(`document.querySelector('.dz-toolbtn[data-tool="brush"]')`, "el Pincel");
    const elegido = await ev(`({ preset: DZ.brushPreset || null, existe: !!LOW.drawing.brushes.get(DZ.brushPreset), selector: document.querySelector("#toBrushPreset")?.value || null })`);
    assert.equal(elegido.preset, "clean-ink", "al arrancar no hay pincel elegido (dibujaba el camino viejo): " + JSON.stringify(elegido));
    assert.ok(elegido.existe && elegido.selector === elegido.preset, "el selector no muestra el pincel que dibuja: " + JSON.stringify(elegido));

    // ── 2. un trazo en S: curvo, sin quiebres, liviano ─────────────────────
    const hoja = await centro(`document.querySelector("#dzCanvas > svg")`);
    const x0 = hoja.x - hoja.w * 0.2, y0 = hoja.y;
    await mouse("mouseMoved", x0, y0);
    await mouse("mousePressed", x0, y0, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 60; i++) { const t = i / 60; await mouse("mouseMoved", x0 + t * hoja.w * 0.4, y0 + Math.sin(t * Math.PI * 2) * hoja.h * 0.18, { buttons: 1 }); await wait(12); }
    await mouse("mouseReleased", x0 + hoja.w * 0.4, y0, { buttons: 0, clickCount: 1 });
    await wait(700);
    const m = await ev(`(()=>{ const el = [...document.querySelectorAll('#dzCanvas > svg [data-low="brush"]')].pop(); if (!el) return null;
      const p = [...el.querySelectorAll("path")].concat(el.tagName === "path" ? [el] : []).sort((a, b) => b.getTotalLength() - a.getTotalLength())[0];
      const d = p.getAttribute("d"), L = p.getTotalLength(), pts = [];
      for (let s = 0; s < L; s += .5) { const q = p.getPointAtLength(s); pts.push([q.x, q.y]); }
      let max = 0, sobre30 = 0;
      for (let i = 1; i < pts.length - 1; i++) {
        const a = Math.atan2(pts[i][1] - pts[i-1][1], pts[i][0] - pts[i-1][0]), b = Math.atan2(pts[i+1][1] - pts[i][1], pts[i+1][0] - pts[i][0]);
        let g = Math.abs(b - a); if (g > Math.PI) g = 2 * Math.PI - g; g = g * 180 / Math.PI; max = Math.max(max, g); if (g > 30) sobre30++; }
      return { largo: Math.round(L), bytes: d.length, curvas: (d.match(/[QC]/g) || []).length, rectas: (d.match(/L/g) || []).length, max: Math.round(max * 10) / 10, sobre30 }; })()`);
    assert.ok(m, "el Pincel no dejó trazo");
    assert.ok(m.curvas > 20 && m.rectas === 0, "el contorno no es curvo (segmentos rectos): " + JSON.stringify(m));
    assert.equal(m.sobre30, 0, "el contorno tiene quiebres de más de 30° (extremos cortados o facetas): " + JSON.stringify(m));
    assert.ok(m.bytes < 20000, "el trazo pesa demasiado en el archivo: " + JSON.stringify(m));

    // ── 3 y 4. el pincel y el suavizado se recuerdan ───────────────────────
    await ev(`(()=>{ const s = document.querySelector("#toBrushPreset"); s.value = "tapered-ink"; s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
    await ev(`(()=>{ const s = document.querySelector("#toSmooth"); if (!s) return false; s.value = "63"; s.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
    await cargar();
    const recuerda = await ev(`({ preset: DZ.brushPreset, smooth: DZ.smooth })`);
    assert.equal(recuerda.preset, "tapered-ink", "el pincel elegido no se recuerda al reabrir");
    assert.equal(recuerda.smooth, 63, "el suavizado no se recuerda al reabrir (se guardaba en otra clave)");

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E pincel suave OK", JSON.stringify({ trazo: m, recuerda }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e); process.exit(1); });
