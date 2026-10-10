/* SEGUIR UN RECORRIDO: EL OBJETO VA POR EL ARCO, MARCA POR MARCA. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026, LOW 3.14): dibujar en una capa de REFERENCIA un
   recorrido (un infinito, tipo Moebius) con rayitas para los intermedios, y
   que el objeto de la otra capa recorra ese camino solo, respetando las
   marcas: «así ahorraría bastante tiempo de intercalado».

   La escena es la de su captura: capa «Referencia» con un infinito y 10
   marcas con espaciado DESPAREJO (juntas en una punta, separadas en el
   medio), sostenida; capa «Pelota» con un círculo sobre la primera marca.
   Con el ratón de verdad:
   1. Se elige el círculo, se aprieta el botón de la línea de tiempo; la
      ventana dice «15 marcas» (una de ellas en el cruce del infinito).
   2. «Generar» → los cuadros 1…10 de la capa Pelota tienen el círculo SOBRE
      cada marca, en orden y en el sentido del trazo (±4 unidades).
   3. Cada cuadro es un dibujo propio; la capa de referencia no cambió.
   4. Un Ctrl+Z saca todo.
   5. Con «que gire siguiendo el recorrido», el objeto gira con la tangente. */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// el infinito (lemniscata de Bernoulli) y las marcas, en unidades del documento
const CX = 960, CY = 540, A = 520;
const lem = (t) => { const d = 1 + Math.sin(t) ** 2; return [CX + A * Math.cos(t) / d, CY + A * Math.sin(t) * Math.cos(t) / d]; };
const N = 240, camino = Array.from({ length: N + 1 }, (_, i) => lem(i / N * Math.PI * 2));
// marcas: parámetros con espaciado desparejo (empieza en la punta derecha, t=0)
// y UNA EN EL CRUCE de la segunda pasada (3π/2): ahí el recorrido pasa dos veces por
// el mismo punto; mal asignada, la pelota saltaba al cruce fuera de orden
const TS = [0, .12, .3, .55, .9, 1.3, 1.7, 2.05, 2.35, 2.6, 3.3, 4.0, 3 * Math.PI / 2, 5.2, 5.8];
const marcas = TS.map((t) => { const p = lem(t), q = lem(t + .01), a = Math.atan2(q[1] - p[1], q[0] - p[0]) + Math.PI / 2;
  return { p, d: "M " + (p[0] - Math.cos(a) * 22).toFixed(1) + " " + (p[1] - Math.sin(a) * 22).toFixed(1) + " L " + (p[0] + Math.cos(a) * 22).toFixed(1) + " " + (p[1] + Math.sin(a) * 22).toFixed(1) }; });
const REF = '<g data-low-art="colour"></g><g data-low-art="line"><path d="M ' + camino.map((p) => p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" L ") +
  '" fill="none" stroke="#999" stroke-width="6"/>' + marcas.map((m) => '<path d="' + m.d + '" fill="none" stroke="#999" stroke-width="5"/>').join("") + "</g>";
// la pelota NO está exacto sobre la primera marca (como cuando se dibuja a mano):
// medido en la app real, eso sumaba un cuadro extra al empezar
const P0 = [marcas[0].p[0] + 2, marcas[0].p[1] + 8];   // corrida 8 a lo largo del trazo (ahí el infinito va vertical)
const PELOTA = '<g data-low-art="colour"></g><g data-low-art="line"><circle data-pelota="1" cx="' + P0[0].toFixed(1) + '" cy="' + P0[1].toFixed(1) + '" r="40" fill="none" stroke="#111" stroke-width="8"/></g>';

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
  const clicEn = async (xy) => { await mouse("mouseMoved", xy[0], xy[1]); await mouse("mousePressed", xy[0], xy[1], { buttons: 1, clickCount: 1 }); await mouse("mouseReleased", xy[0], xy[1], { buttons: 0, clickCount: 1 }); await wait(350); };
  const centro = (expr) => ev(`(()=>{ const e = (${expr}); if (!e) return null; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; })()`);
  const pantalla = (x, y) => ev(`(()=>{ const q = dzToScreen(${x}, ${y}), r = document.querySelector("#dzCanvas").getBoundingClientRect(); return [q.x + r.left, q.y + r.top]; })()`);
  /* el centro de la pelota en el dibujo de un cuadro (con su transform), y el giro */
  const pelotaEn = (f) => ev(`(()=>{ const ly = DZ.doc.scene.layers.find(l => l.name === "Pelota"), dw = DZ.doc.scene.drawingAt(ly.id, ${f});
    if (!dw) return null; const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 1920 1080");
    s.setAttribute("width", 1920); s.setAttribute("height", 1080); s.style.cssText = "position:absolute;left:-9000px;top:0"; document.body.appendChild(s);
    s.innerHTML = dw.content; const c = s.querySelector("circle[data-pelota]"); let out = null;
    if (c) { const m = s.getScreenCTM().inverse().multiply(c.getScreenCTM()); const x = +c.getAttribute("cx"), y = +c.getAttribute("cy");
      out = { x: +(m.a * x + m.c * y + m.e).toFixed(1), y: +(m.b * x + m.d * y + m.f).toFixed(1), giro: +(Math.atan2(m.b, m.a) * 180 / Math.PI).toFixed(1), n: dw.number }; }
    s.remove(); return out; })()`);
  const soltarFoco = () => ev('(()=>{ const a = document.activeElement; if (a && a.blur) a.blur(); return 1; })()');

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} window.__paginaVieja = 1; return true; })()');
    await send("Page.reload");
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); if (DZ.onionOn) { DZ.onionOn = false; dzOnionRender(); } return 1; })()');

    // la escena: «Referencia» (la capa que ya hay) sostenida 1…20, y «Pelota» encima
    // se escribe como lo hace la app: lo que está en el lienzo se vuelca a la capa activa
    // (escribir el documento por debajo del lienzo lo pisaba el volcado pendiente)
    await ev(`(()=>{ const doc = DZ.doc, ref = doc.scene.layers[0]; ref.name = "Referencia"; doc.goTo(1);
      dzCanvasSet(${JSON.stringify(REF)}); dzDocCommit(); const n = ref.cellAt(1); for (let f = 2; f <= 20; f++) doc.setCell(f, n, ref.id); return 1; })()`);
    await wait(500);
    await ev(`(()=>{ const doc = DZ.doc; doc.addLayer("Pelota"); doc.goTo(1); dzCanvasSet(${JSON.stringify(PELOTA)}); dzDocCommit(); doc.emit("layers"); doc.emit("frame"); return 1; })()`);
    await wait(900);
    await ev(`(()=>{ const ly = DZ.doc.scene.layers.find(l => l.name === "Pelota"); DZ.doc.selectLayer(ly.id); DZ.doc.goTo(1); dzCanvasSet(DZ.doc.drawing.content); DZ.zoom = .55; DZ.panX = 0; DZ.panY = 0; dzApplyZoom(); return 1; })()`);
    await wait(800);
    const refAntes = await ev(`JSON.stringify(DZ.doc.scene.layers.find(l => l.name === "Referencia").cells.slice(0, 22))`);

    // ── 1. elegir la pelota y apretar el botón ──────────────────────────────
    await ev('(()=>{ dzSetTool("select"); return 1; })()');
    await clicEn(await pantalla(P0[0] + 40, P0[1]));
    assert.ok(await ev(`!!(DZ.sel && DZ.sel.matches && DZ.sel.matches("circle[data-pelota]"))`), "no quedó elegida la pelota: " + await ev("DZ.sel && DZ.sel.outerHTML.slice(0, 80)"));
    const boton = await centro(`document.getElementById("tlRecorrido")`);
    assert.ok(boton, "la línea de tiempo no tiene el botón «Seguir un recorrido»");
    await clicEn(boton); await wait(400);
    const desc = await ev(`(document.getElementById("recDesc") || {}).textContent || ""`);
    assert.ok(/15 marcas/.test(desc), "la ventana no encontró las 15 marcas del recorrido: " + JSON.stringify(desc) + " · estado: " + await ev(`[...document.querySelectorAll("#dzStatusbar span")].map(s => s.textContent).pop()`) + " · lectura: " + await ev(`(()=>{ try { const r = LOW.animation.recorrido.leerReferencia(DZ.doc, DZ.doc.scene.layers.find(l => l.name === "Referencia").id, 1); return JSON.stringify(r.error || { total: r.total, marcas: r.marcas.length, cerrado: r.cerrado }); } catch (e) { return "EXC " + e.message; } })()`));
    assert.ok(/cerrado/i.test(desc), "el infinito no se reconoció como recorrido cerrado: " + JSON.stringify(desc));

    // ── 2. generar: la pelota sobre cada marca ──────────────────────────────
    await clicEn(await centro(`document.getElementById("recGo")`)); await wait(800);
    const lejos = [], numeros = [];
    for (let k = 0; k < marcas.length; k++) {
      const p = await pelotaEn(1 + k);
      if (!p) { lejos.push("F" + (1 + k) + ": sin pelota"); continue; }
      numeros.push(p.n);
      const e = Math.hypot(p.x - marcas[k].p[0], p.y - marcas[k].p[1]);
      if (e > 4) lejos.push("F" + (1 + k) + ": " + JSON.stringify(p) + " vs marca " + marcas[k].p.map((v) => +v.toFixed(1)));
    }
    assert.deepEqual(lejos, [], "la pelota no quedó sobre cada marca, en orden");

    // ── 3. dibujos propios; la referencia, intacta ──────────────────────────
    assert.equal(new Set(numeros).size, marcas.length, "los cuadros comparten dibujo: " + numeros);
    assert.equal(await ev(`JSON.stringify(DZ.doc.scene.layers.find(l => l.name === "Referencia").cells.slice(0, 22))`), refAntes, "la capa de referencia cambió");

    // ── 4. un Ctrl+Z saca todo ──────────────────────────────────────────────
    await soltarFoco();
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 }); await wait(600);
    const tras = await ev(`DZ.doc.scene.layers.find(l => l.name === "Pelota").cells.filter(c => c != null).length`);
    assert.equal(tras, 1, "un Ctrl+Z no sacó los cuadros del recorrido (quedan " + tras + " celdas)");

    // ── 5. que gire siguiendo el recorrido ──────────────────────────────────
    await ev(`(()=>{ DZ.doc.goTo(1); dzCanvasSet(DZ.doc.drawing.content); dzSetTool("select"); return 1; })()`); await wait(500);
    await clicEn(await pantalla(P0[0] + 40, P0[1]));
    await clicEn(await centro(`document.getElementById("tlRecorrido")`)); await wait(400);
    await clicEn(await centro(`document.getElementById("recGirar")`));
    await clicEn(await centro(`document.getElementById("recGo")`)); await wait(800);
    const g0 = await pelotaEn(1), g5 = await pelotaEn(6);
    assert.ok(g0 && g5 && Math.abs(g0.giro) < 1 && Math.abs(g5.giro) > 20, "con «que gire», la pelota no giró con el recorrido: " + JSON.stringify({ g0, g5 }));
    assert.ok(Math.hypot(g5.x - marcas[5].p[0], g5.y - marcas[5].p[1]) < 4, "al girar, la pelota se salió de su marca: " + JSON.stringify(g5));

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E seguir un recorrido OK " + JSON.stringify({ desc, cuadros: numeros.length, giro5: g5.giro }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
