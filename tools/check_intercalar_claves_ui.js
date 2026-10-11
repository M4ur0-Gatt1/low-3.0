/* POSE A POSE CON FOTOGRAMAS CLAVE: Alt+K, Alt+D, mover, Alt+T. CDP :9223 + mock :8791.

   Reporte de Mauro (oct-2026, LOW 3.16): «no me acuerdo cómo se usa el flujo
   de interpolación con los fotogramas clave, o no anda».

   Con las teclas y el ratón de verdad, en un .low, no andaba por dos lados:
   · Alt+D («Duplicar este cuadro al final: dibujar sobre la copia») creaba un
     dibujo VACÍO. En el cuadro 2 sólo se veía el fantasma de cebolla del 1, y
     no había nada que elegir ni mover para hacer la segunda pose.
   · Al intercalar, lo movido con la flecha tiene `transform="matrix(…)"` y la
     clave anterior no tiene ninguno. Un atributo sólo se interpolaba si estaba
     en los DOS lados, así que los intermedios quedaban en la pose de partida.

   El flujo: círculo en el 1 → Alt+K → Alt+D → elegir el círculo del 2 y
   arrastrarlo 800 a la derecha y 200 arriba → Alt+K → «,» → Alt+T con 3
   intermedios. Comprueba que:
   1. el cuadro 2 nace con la copia y se la puede elegir;
   2. los intermedios avanzan de la primera pose a la segunda, con la curva natural;
   3. a mitad de un giro de 90°, el objeto no se achica. */
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
  const P = (x, y) => ev(`(()=>{ const q = dzToScreen(${x}, ${y}), r = document.querySelector("#dzCanvas").getBoundingClientRect(); return [q.x + r.left, q.y + r.top]; })()`);
  const clicXY = async ([x, y]) => { await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y, { buttons: 1, clickCount: 1 }); await wait(40); await mouse("mouseReleased", x, y, { buttons: 0, clickCount: 1 }); await wait(400); };
  const clicEl = async (sel) => clicXY(await ev(`(()=>{ const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`));
  const tecla = async (key, code, vk, mods = 0, text) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers: mods });
    if (text) await send("Input.dispatchKeyEvent", { type: "char", key, code, text, windowsVirtualKeyCode: vk });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers: mods }); await wait(500);
  };
  const estado = () => ev(`[...document.querySelectorAll("#dzStatusbar span")].map(s => s.textContent).pop()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} window.__paginaVieja = 1; return true; })()');
    await send("Page.reload");
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }

    // 3. el giro a mitad de camino conserva el tamaño (función pura)
    const giro = await ev(`(()=>{ const m = dzTweenTransform("", "rotate(90)", .5).match(/-?[\\d.e]+/g).map(Number); return { escala: Math.hypot(m[0], m[1]), grados: Math.atan2(m[1], m[0]) * 180 / Math.PI }; })()`);
    assert.ok(Math.abs(giro.escala - 1) < 1e-3 && Math.abs(giro.grados - 45) < .1, "a mitad del giro el objeto cambia de tamaño: " + JSON.stringify(giro));

    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev(`(()=>{ if (typeof closeL3d === "function") closeL3d();
      dzCanvasSet('<g data-low-art="colour"></g><g data-low-art="line"><circle id="bola" cx="400" cy="540" r="80" fill="none" stroke="#111" stroke-width="12"/></g>');
      dzDocCommit(); DZ.zoom = .5; DZ.panX = 0; DZ.panY = 0; dzApplyZoom(); dzSetTool("select"); dzDeselect(); return 1; })()`);
    await wait(500);
    await clicXY(await P(1000, 950));
    await tecla("k", "KeyK", 75, 1);
    await tecla("d", "KeyD", 68, 1);

    // 1. el cuadro 2 nace con la copia
    assert.equal(await ev("DZ.doc.frame"), 2, "Alt+D no llevó al cuadro 2");
    const copia = await ev(`(DZ.doc.drawing && DZ.doc.drawing.content || "").includes("<circle")`);
    assert.ok(copia, "Alt+D creó el cuadro 2 VACÍO: no hay nada que mover para la pose siguiente");
    await clicXY(await P(456, 484));   // el borde a 45°: lejos de las manijas de escala
    assert.equal(await ev("DZ.sel && DZ.sel.tagName"), "circle", "en el cuadro 2 no se puede elegir el círculo");
    const a = await P(456, 484), b = await P(1256, 284);
    await mouse("mouseMoved", a[0], a[1]); await mouse("mousePressed", a[0], a[1], { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i++) { await mouse("mouseMoved", a[0] + (b[0] - a[0]) * i / 12, a[1] + (b[1] - a[1]) * i / 12, { buttons: 1 }); await wait(25); }
    await mouse("mouseReleased", b[0], b[1], { buttons: 0, clickCount: 1 }); await wait(500);
    await clicXY(await P(1000, 950));
    await tecla("k", "KeyK", 75, 1);
    await tecla(",", "Comma", 188, 0, ",");
    assert.equal(await ev("DZ.doc.frame"), 1, "«,» no volvió al cuadro 1");

    // 2. Alt+T con 3 intermedios
    await tecla("t", "KeyT", 84, 1);
    assert.ok(await ev(`!!document.getElementById("twGo")`), "Alt+T no abrió la ventana de intercalar");
    await ev(`(()=>{ const n = document.getElementById("twN"); n.value = 3; n.dispatchEvent(new Event("input", { bubbles: true })); return 1; })()`);
    await clicEl("#twGo"); await wait(1200);
    assert.match(await estado(), /3 cuadro\(s\) intermedio/, "no intercaló: " + await estado());
    const pos = await ev(`(()=>{ const ly = DZ.doc.layer, out = [];
      for (let f = 1; f <= 5; f++) { const d = DZ.doc.scene.drawingAt(ly.id, f); const c = d && d.content.match(/<circle[^>]*>/);
        const t = c && c[0].match(/matrix\\(([^)]*)\\)/), v = t ? t[1].split(/[ ,]+/).map(Number) : [1, 0, 0, 1, 0, 0]; out.push(c ? [Math.round(v[4]), Math.round(v[5])] : null); }
      return out; })()`);
    assert.ok(pos.every(Boolean), "falta el círculo en algún cuadro: " + JSON.stringify(pos));
    assert.deepEqual(pos[0], [0, 0], "la primera pose se movió: " + JSON.stringify(pos));
    assert.ok(Math.abs(pos[4][0] - 800) < 3 && Math.abs(pos[4][1] + 200) < 3, "la segunda pose no quedó en (800, -200): " + JSON.stringify(pos));
    for (let i = 1; i < 5; i++) assert.ok(pos[i][0] > pos[i - 1][0] && pos[i][1] < pos[i - 1][1], "los intermedios no van de una pose a la otra: " + JSON.stringify(pos));
    assert.ok(pos[2][0] - pos[1][0] > pos[1][0] - pos[0][0], "la curva natural no acelera en el medio: " + JSON.stringify(pos));

    assert.deepEqual(errores, [], "errores de JS: " + errores.join(" | "));
    console.log("OK intercalar entre claves:", JSON.stringify(pos), "· giro", JSON.stringify(giro));
  } finally {
    ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
