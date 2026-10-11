/* EL RECORRIDO ES UN FLUJO: SE SUMAN OBJETOS Y RECORRIDOS. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026, LOW 3.15): «la animación de base es un flujo:
   le tengo que poder ir agregando objetos y que los que agregue sigan el
   recorrido, y sumar recorridos de cada objeto por separado; por ejemplo, si
   es un personaje con brazos, puedo querer dibujar el recorrido de cada
   brazo». Antes, pasar el segundo objeto REEMPLAZABA los cuadros con copias
   del primero: el movimiento ya hecho se perdía.

   Capa «Referencia» con DOS recorridos (A a la izquierda, B a la derecha),
   cada uno con sus marcas; en la capa «Personaje», una pelota junto a A y
   una caja junto a B. Con el ratón de verdad:
   1. La pelota → «Seguir un recorrido»: la ventana propone el recorrido
      MÁS CERCANO (A) y lo de fábrica es «sumar»; la pelota recorre A.
   2. La caja → propone B; la caja recorre B y la pelota SIGUE recorriendo A
      en esos mismos cuadros.
   3. Un objeto NUEVO (un rombo) junto a A → recorre A; los otros dos, igual.
   4. Volver a pasar la pelota por A no la duplica (una sola por cuadro). */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// recorrido A: un arco abierto a la izquierda; B: otro a la derecha
const A = (t) => [300 + 500 * t, 700 - 380 * Math.sin(Math.PI * t)];
const B = (t) => [1150 + 550 * t, 300 + 380 * Math.sin(Math.PI * t)];
const TA = [0, .08, .18, .3, .45, .6, .74, .86, .95, 1], TB = [0, .12, .25, .4, .55, .7, .85, 1];
const polilinea = (f) => "M " + Array.from({ length: 121 }, (_, i) => f(i / 120).map((v) => v.toFixed(1)).join(" ")).join(" L ");
const rayita = (f, t) => { const p = f(t), q = f(Math.min(1, t + .005)), r = f(Math.max(0, t - .005)), a = Math.atan2(q[1] - r[1], q[0] - r[0]) + Math.PI / 2;
  return '<path fill="none" stroke="#999" stroke-width="5" d="M ' + (p[0] - Math.cos(a) * 20).toFixed(1) + " " + (p[1] - Math.sin(a) * 20).toFixed(1) + " L " + (p[0] + Math.cos(a) * 20).toFixed(1) + " " + (p[1] + Math.sin(a) * 20).toFixed(1) + '"/>'; };
const REF = '<g data-low-art="colour"></g><g data-low-art="line"><path fill="none" stroke="#999" stroke-width="6" d="' + polilinea(A) + '"/>' +
  '<path fill="none" stroke="#999" stroke-width="6" d="' + polilinea(B) + '"/>' + TA.map((t) => rayita(A, t)).join("") + TB.map((t) => rayita(B, t)).join("") + "</g>";
const a0 = A(0), b0 = B(0);
const PERSONAJE = '<g data-low-art="colour"></g><g data-low-art="line">' +
  '<circle data-cual="pelota" cx="' + a0[0] + '" cy="' + a0[1] + '" r="30" fill="none" stroke="#111" stroke-width="8"/>' +
  '<rect data-cual="caja" x="' + (b0[0] - 25) + '" y="' + (b0[1] - 25) + '" width="50" height="50" fill="none" stroke="#111" stroke-width="8"/></g>';

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
  /* dónde está cada objeto (centro) en el dibujo de un cuadro, y cuántas copias hay */
  const objetos = (f) => ev(`(()=>{ const ly = DZ.doc.scene.layers.find(l => l.name === "Personaje"), dw = DZ.doc.scene.drawingAt(ly.id, ${f}); if (!dw) return null;
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 1920 1080"); s.setAttribute("width", 1920); s.setAttribute("height", 1080);
    s.style.cssText = "position:absolute;left:-9000px;top:0"; document.body.appendChild(s); s.innerHTML = dw.content; const out = {};
    for (const n of s.querySelectorAll("[data-cual]")) { const b = n.getBBox(), m = s.getScreenCTM().inverse().multiply(n.getScreenCTM()), x = b.x + b.width / 2, y = b.y + b.height / 2;
      const k = n.getAttribute("data-cual"); (out[k] = out[k] || []).push([+(m.a * x + m.c * y + m.e).toFixed(1), +(m.b * x + m.d * y + m.f).toFixed(1)]); }
    s.remove(); return out; })()`);
  const soltarFoco = () => ev('(()=>{ const a = document.activeElement; if (a && a.blur) a.blur(); return 1; })()');
  /* elegir con un clic en el borde, abrir la ventana y devolver lo que propone */
  const pasar = async (borde, esperaCamino) => {
    await ev(`(()=>{ DZ.doc.goTo(1); dzCanvasSet(DZ.doc.drawing.content); dzSetTool("select"); return 1; })()`); await wait(400);
    await clicEn(await pantalla(borde[0], borde[1]));
    await clicEn(await centro(`document.getElementById("tlRecorrido")`)); await wait(500);
    const v = await ev(`({ elegido: [DZ.sel, ...(DZ.multi || [])].filter(Boolean).map(n => n.getAttribute("data-cual") || n.tagName), desc: (document.getElementById("recDesc") || {}).textContent || "", camino: (document.querySelector("#recCamino option:checked") || {}).textContent || "",
      sumar: !!(document.getElementById("recSumar") || {}).checked })`);
    await clicEn(await centro(`document.getElementById("recGo")`)); await wait(900);
    return v;
  };
  const cerca = (p, q, tol = 4) => p && Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol;

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
    await ev(`(()=>{ const doc = DZ.doc, ref = doc.scene.layers[0]; ref.name = "Referencia"; doc.goTo(1);
      dzCanvasSet(${JSON.stringify(REF)}); dzDocCommit(); const n = ref.cellAt(1); for (let f = 2; f <= 20; f++) doc.setCell(f, n, ref.id); return 1; })()`);
    await wait(500);
    await ev(`(()=>{ const doc = DZ.doc; doc.addLayer("Personaje"); doc.goTo(1); dzCanvasSet(${JSON.stringify(PERSONAJE)}); dzDocCommit(); doc.emit("layers"); doc.emit("frame");
      DZ.zoom = .55; DZ.panX = 0; DZ.panY = 0; dzApplyZoom(); return 1; })()`);
    await wait(800);

    // ── 1. la pelota: recorrido A (el más cercano), sumando ─────────────────
    const v1 = await pasar([a0[0] + 30, a0[1]]);
    assert.ok(v1.sumar, "lo de fábrica no es «sumar a los cuadros que ya hay»");
    assert.ok(/el más cercano/.test(v1.camino) && /10 marcas/.test(v1.camino), "para la pelota no propuso el recorrido A (10 marcas, el más cercano): " + JSON.stringify(v1));
    for (let k = 0; k < TA.length; k++) { const o = await objetos(1 + k);
      assert.ok(o && o.pelota && cerca(o.pelota[0], A(TA[k])), "F" + (1 + k) + ": la pelota no está en la marca " + k + " de A: " + JSON.stringify(o && o.pelota)); }

    // ── 2. la caja: recorrido B, y la pelota sigue en A ─────────────────────
    const v2 = await pasar([b0[0] + 25, b0[1]]);
    assert.ok(/el más cercano/.test(v2.camino) && /8 marcas/.test(v2.camino), "para la caja no propuso el recorrido B (8 marcas): " + JSON.stringify(v2));
    const fallan = [];
    for (let k = 0; k < TB.length; k++) { const o = await objetos(1 + k);
      if (!o || !o.caja || !cerca(o.caja[0], B(TB[k]))) fallan.push("F" + (1 + k) + " caja " + JSON.stringify(o && o.caja));
      if (!o || !o.pelota || o.pelota.length !== 1 || !cerca(o.pelota[0], A(TA[k]))) fallan.push("F" + (1 + k) + " pelota " + JSON.stringify(o && o.pelota)); }
    assert.deepEqual(fallan, [], "sumar la caja rompió el movimiento de la pelota (o la caja no siguió B)");

    // ── 3. un objeto nuevo junto a A ─────────────────────────────────────────
    await ev(`(()=>{ DZ.doc.goTo(1); dzCanvasSet(DZ.doc.drawing.content); const g = document.querySelector('#dzCanvas > svg [data-low-art="line"]');
      const r = document.createElementNS("http://www.w3.org/2000/svg", "path"); r.setAttribute("data-cual", "rombo");
      r.setAttribute("d", "M ${a0[0] + 8} ${a0[1] - 40} l 20 20 l -20 20 l -20 -20 z"); r.setAttribute("fill", "none"); r.setAttribute("stroke", "#c00"); r.setAttribute("stroke-width", 6);
      g.appendChild(r); dzDocCommit(); return 1; })()`); await wait(400);
    const v3 = await pasar([a0[0] + 28, a0[1] - 20]);
    assert.deepEqual([...new Set(v3.elegido)], ["rombo"], "el clic no eligió sólo el rombo: " + JSON.stringify(v3));
    const fallan3 = [];
    for (let k = 0; k < TB.length; k++) { const o = await objetos(1 + k);
      if (!o || !o.rombo || o.rombo.length !== 1) { fallan3.push("F" + (1 + k) + " rombo " + JSON.stringify(o && o.rombo)); continue; }
      const corrido = [o.rombo[0][0] - A(TA[k])[0], o.rombo[0][1] - A(TA[k])[1]];
      if (Math.hypot(corrido[0] - 8, corrido[1] + 20) > 5) fallan3.push("F" + (1 + k) + " rombo fuera de A " + JSON.stringify(corrido));
      if (!o.pelota || o.pelota.length !== 1 || !cerca(o.pelota[0], A(TA[k]))) fallan3.push("F" + (1 + k) + " pelota " + JSON.stringify(o.pelota));
      if (!o.caja || !cerca(o.caja[0], B(TB[k]))) fallan3.push("F" + (1 + k) + " caja " + JSON.stringify(o.caja)); }
    assert.deepEqual(fallan3, [], "el objeto agregado después no siguió A, o se perdió lo que ya estaba · ventana: " + JSON.stringify(v3) + " · F1: " + JSON.stringify(await objetos(1)));

    // ── 4. volver a pasar la pelota no la duplica ───────────────────────────
    await pasar([a0[0] + 30, a0[1]]);
    const dobles = [];
    for (let k = 0; k < TA.length; k++) { const o = await objetos(1 + k); if (!o || !o.pelota || o.pelota.length !== 1) dobles.push("F" + (1 + k) + ": " + JSON.stringify(o && o.pelota)); }
    assert.deepEqual(dobles, [], "volver a pasar la pelota la duplicó");

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E el recorrido es un flujo OK " + JSON.stringify({ pelota: v1.camino, caja: v2.camino }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
