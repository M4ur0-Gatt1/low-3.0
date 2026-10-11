/* ACOMPAÑAR EL MOVIMIENTO. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026, LOW 3.19, con un video de una caminata): «si ya
   tengo un objeto animado, quiero agregarle otro objeto y que siga el
   movimiento… una función nueva, para no mezclar el agrupado… quiero que la
   cabeza acompañe al cuerpo».

   Como en el video: el cuerpo animado en una capa, un dibujo por cuadro
   (copias que avanzan y se inclinan), y la cabeza dibujada SÓLO en el cuadro 1.
   Con el ratón de verdad:
   1. Clic en la cabeza, Shift+clic en el cuerpo, Animación → «Acompañar el
      movimiento»: en cada cuadro la cabeza aparece donde corresponde, con el
      mismo avance y la misma inclinación que el cuerpo.
   2. Volver a aplicarlo no la duplica.
   3. Ctrl+Z lo deshace de una vez.
   4. En un cuadro donde el cuerpo se REDIBUJÓ (otra forma), la cabeza sigue su
      centro.
   5. «Soltar del movimiento» la saca de los otros cuadros y la deja en el 1. */
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
  const clicXY = async ([x, y], mods = 0) => { await mouse("mouseMoved", x, y, { modifiers: mods }); await mouse("mousePressed", x, y, { buttons: 1, clickCount: 1, modifiers: mods }); await wait(30); await mouse("mouseReleased", x, y, { buttons: 0, clickCount: 1, modifiers: mods }); await wait(350); };
  const clicEl = async (expr, nombre) => {
    const c = await ev(`(()=>{ const e = (${expr}); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; })()`);
    assert.ok(c, "no se ve: " + nombre); await clicXY(c);
  };
  const menuAnimacion = async (act) => {
    await clicEl(`document.querySelector('[data-menu="animacion"]')`, "menú Animación");
    await clicEl(`document.querySelector('[data-act="${act}"]')`, act);
    for (let i = 0; i < 40 && !/acompaña|Solté|Elegí|No encontré/.test(await ev(`[...document.querySelectorAll("#dzStatusbar span")].map(s => s.textContent).pop() || ""`)); i++) await wait(100);
    await wait(300);
  };
  /** el centro de la cabeza y del cuerpo en el dibujo del cuadro f (unidades del dibujo) */
  const medir = (f) => ev(`(()=>{ const ly = DZ.doc.layer, dw = DZ.doc.scene.drawingAt(ly.id, ${f}); if (!dw) return null;
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 1920 1080"); s.setAttribute("width", 1920); s.setAttribute("height", 1080);
    s.style.cssText = "position:absolute;left:-9000px;top:0"; document.body.appendChild(s); s.innerHTML = dw.content;
    const c = (n) => { const b = n.getBBox(), m = s.getScreenCTM().inverse().multiply(n.getScreenCTM()), x = b.x + b.width / 2, y = b.y + b.height / 2; return [Math.round(m.a * x + m.c * y + m.e), Math.round(m.b * x + m.d * y + m.f)]; };
    const cabezas = [...s.querySelectorAll("circle")], cuerpo = s.querySelector("path");
    const out = { cabezas: cabezas.length, cabeza: cabezas[0] ? c(cabezas[0]) : null, cuerpo: cuerpo ? c(cuerpo) : null }; s.remove(); return out; })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); sessionStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} window.__paginaVieja = 1; return true; })()');
    await send("Page.reload");
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    // el cuerpo: un óvalo que en cada cuadro avanza 120 y se inclina 6° (alrededor de su centro, 500,600)
    // cuadros 1–5: la MISMA forma con otro transform; cuadro 6: redibujado (otra forma), corrido 700
    await ev(`(()=>{ if (typeof closeL3d === "function") closeL3d(); if (DZ.onionOn) { DZ.onionOn = false; dzOnionRender(); }
      const cuerpo = 'M 440 600 C 440 480 560 480 560 600 C 560 760 440 760 440 600 Z';
      const hoja = (k) => '<g data-low-art="colour"></g><g data-low-art="line"><path d="' + cuerpo + '" fill="none" stroke="#111" stroke-width="10" transform="translate(' + (120 * k) + ' 0) rotate(' + (6 * k) + ' 500 600)"/>' + (k === 0 ? '<circle cx="500" cy="420" r="55" fill="none" stroke="#111" stroke-width="10"/>' : '') + '</g>';
      for (let k = 0; k < 5; k++) { DZ.doc.goTo(k + 1); if (k > 0) DZ.doc.createBlankDrawing(false); dzCanvasSet(hoja(k)); dzDocCommit(); }
      DZ.doc.goTo(6); DZ.doc.createBlankDrawing(false);
      dzCanvasSet('<g data-low-art="colour"></g><g data-low-art="line"><path d="M 1150 610 C 1150 470 1270 490 1260 610 C 1250 770 1150 760 1150 610 Z" fill="none" stroke="#111" stroke-width="10"/></g>'); dzDocCommit();
      dzDocGoTo(1); DZ.zoom = .5; DZ.panX = 0; DZ.panY = 0; dzApplyZoom(); dzSetTool("select"); dzDeselect(); return DZ.doc.scene.lastFrame(); })()`);
    await wait(600);
    const f1 = await medir(1);
    const offset = [f1.cabeza[0] - f1.cuerpo[0], f1.cabeza[1] - f1.cuerpo[1]];

    // 1. cabeza, Shift+cuerpo, Animación → Acompañar el movimiento
    await clicXY(await P(555, 420));                 // borde derecho de la cabeza
    await clicXY(await P(560, 600), 8);              // borde derecho del cuerpo, con Shift
    assert.equal(await ev("DZ.sel && DZ.sel.tagName"), "path", "el último elegido (el que guía) no es el cuerpo");
    assert.equal(await ev("(DZ.multi || []).length"), 2, "no quedaron elegidos los dos");
    await menuAnimacion("acompanar");
    for (let f = 2; f <= 5; f++) {
      const m = await medir(f), k = f - 1, a = 6 * k * Math.PI / 180;
      assert.equal(m.cabezas, 1, "en el cuadro " + f + " no hay exactamente una cabeza: " + JSON.stringify(m));
      // la distancia cabeza-cuerpo gira con el cuerpo
      const esperado = [Math.round(offset[0] * Math.cos(a) - offset[1] * Math.sin(a)), Math.round(offset[0] * Math.sin(a) + offset[1] * Math.cos(a))];
      const real = [m.cabeza[0] - m.cuerpo[0], m.cabeza[1] - m.cuerpo[1]];
      assert.ok(Math.abs(real[0] - esperado[0]) <= 2 && Math.abs(real[1] - esperado[1]) <= 2, "en el cuadro " + f + " la cabeza no acompaña al cuerpo: " + JSON.stringify({ real, esperado }));
    }
    // 4. en el 6 el cuerpo está redibujado: la cabeza sigue su centro
    const m6 = await medir(6);
    assert.equal(m6.cabezas, 1, "en el cuadro redibujado no apareció la cabeza");
    assert.ok(Math.abs(m6.cabeza[0] - m6.cuerpo[0] - offset[0]) <= 3 && Math.abs(m6.cabeza[1] - m6.cuerpo[1] - offset[1]) <= 3, "en el cuadro redibujado la cabeza no sigue el centro del cuerpo: " + JSON.stringify(m6));

    // 2. volver a aplicarlo no duplica
    await clicXY(await P(555, 420)); await clicXY(await P(560, 600), 8);
    await menuAnimacion("acompanar");
    for (let f = 2; f <= 6; f++) assert.equal((await medir(f)).cabezas, 1, "volver a aplicarlo duplicó la cabeza en el cuadro " + f);

    // 3. Ctrl+Z: de una vez, vuelve a como estaba antes de la segunda vez (una cabeza por cuadro) y otra vez: sin cabezas
    for (let i = 0; i < 2; i++) { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 }); await wait(500); }
    for (let f = 2; f <= 6; f++) assert.equal((await medir(f)).cabezas, 0, "Ctrl+Z no sacó la cabeza del cuadro " + f);
    assert.equal((await medir(1)).cabezas, 1, "Ctrl+Z se llevó la cabeza del cuadro 1");

    // 5. aplicar y soltar
    await ev("dzDocGoTo(1), 1"); await wait(300);
    await clicXY(await P(555, 420)); await clicXY(await P(560, 600), 8);
    await menuAnimacion("acompanar");
    assert.equal((await medir(3)).cabezas, 1, "no se volvió a aplicar");
    await clicXY(await P(1000, 950)); await clicXY(await P(555, 420));
    assert.equal(await ev("DZ.sel && DZ.sel.tagName"), "circle", "no se eligió la cabeza");
    await menuAnimacion("soltar-acompanar");
    for (let f = 2; f <= 6; f++) assert.equal((await medir(f)).cabezas, 0, "Soltar no sacó la cabeza del cuadro " + f);
    assert.equal((await medir(1)).cabezas, 1, "Soltar se llevó la cabeza del cuadro 1");

    assert.deepEqual(errores, [], "errores de JS: " + errores.join(" | "));
    console.log("OK acompañar: la cabeza sigue avance e inclinación del cuerpo, centro si está redibujado, sin duplicar, Ctrl+Z, soltar");
  } finally {
    ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
