/* SEGUIR UN RECORRIDO CON PERSPECTIVA: SE ACHICA SOLO AL IR HACIA EL FONDO. CDP :9223 + mock :8791.

   Pedido de Mauro (3.52): «que la pelota vaya hacia atrás; tendría que
   achicarla cuadro por cuadro para dar la sensación de profundidad; si pudiera
   dibujar en perspectiva se podría hacer automático». La cuenta del layout
   clásico: lo que apoya en el piso mide en proporción a su distancia (en la
   hoja) al horizonte.

   Escena: perspectiva de 1 punto con el horizonte en y = 300; capa
   «Referencia» con un recorrido que va hacia el fondo (de y 1000 a y 470) y 8
   marcas cada vez más juntas; en «Personaje», una pelota (r 60) sobre el
   arranque. Con el ratón de verdad:
   1. La ventana trae «según la perspectiva» elegido y dice el tamaño final.
   2. Generar: en cada cuadro la pelota está sobre su marca y su tamaño es
      (y − 300) / (1000 − 300) del original (±3 %). Un Ctrl+Z lo saca todo.
   3. Sin perspectiva en la escena, esa opción está apagada; «a mano: al final
      50 %» deja la pelota a la mitad en el último cuadro, repartido por lo
      recorrido.
   4. Un recorrido que cruza el horizonte se avisa (no se inventa un tamaño
      negativo). */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const HZ = 300, X = 960, Y0 = 1000, R = 60;
const YS = [1000, 880, 780, 690, 615, 555, 510, 478];
const REF = '<g data-low-art="colour"></g><g data-low-art="line"><path fill="none" stroke="#999" stroke-width="6" d="M ' + X + " " + Y0 + " L " + X + ' 470"/>' +
  YS.map((y) => '<path fill="none" stroke="#999" stroke-width="5" d="M ' + (X - 22) + " " + y + " L " + (X + 22) + " " + y + '"/>').join("") + "</g>";
const PERSONAJE = '<g data-low-art="colour"></g><g data-low-art="line"><circle data-cual="pelota" cx="' + X + '" cy="' + Y0 + '" r="' + R + '" fill="#f0450e" stroke="#111" stroke-width="4"/></g>';
const esperada = (y) => (y - HZ) / (Y0 - HZ);

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
  /* la pelota en el dibujo de un cuadro: centro y ancho, en unidades del documento */
  const pelota = (f) => ev(`(()=>{ const ly = DZ.doc.scene.layers.find(l => l.name === "Personaje"), dw = DZ.doc.scene.drawingAt(ly.id, ${f}); if (!dw) return null;
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg"); s.setAttribute("viewBox", "0 0 1920 1080"); s.setAttribute("width", 1920); s.setAttribute("height", 1080);
    s.style.cssText = "position:absolute;left:-9000px;top:0"; document.body.appendChild(s); s.innerHTML = dw.content;
    const ns = [...s.querySelectorAll('[data-cual="pelota"]')]; if (ns.length !== 1) { s.remove(); return { copias: ns.length }; }
    const n = ns[0], b = n.getBBox(), m = s.getScreenCTM().inverse().multiply(n.getScreenCTM()), x = b.x + b.width / 2, y = b.y + b.height / 2;
    const out = { x: +(m.a * x + m.c * y + m.e).toFixed(1), y: +(m.b * x + m.d * y + m.f).toFixed(1), w: +(b.width * Math.hypot(m.a, m.b)).toFixed(1) };
    s.remove(); return out; })()`);
  const abrirVentana = async () => {
    await ev(`(()=>{ DZ.doc.goTo(1); dzCanvasSet(DZ.doc.drawing.content); dzSetTool("select"); return 1; })()`); await wait(400);
    await clicEn(await pantalla(X + R - 2, Y0));
    await clicEn(await centro(`document.getElementById("tlRecorrido")`)); await wait(600);
    return ev(`(()=>{ const g = (i) => document.getElementById(i) || {}; return { persp: !!g("recTamPersp").checked, perspApagada: !!g("recTamPersp").disabled,
      igual: !!g("recTamNo").checked, info: g("recTamInfo").textContent || "", desc: g("recDesc").textContent || "", sel: DZ.sel ? DZ.sel.getAttribute("data-cual") : null }; })()`);
  };

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
      dzCanvasSet(${JSON.stringify(REF)}); dzDocCommit(); const n = ref.cellAt(1); for (let f = 2; f <= 12; f++) doc.setCell(f, n, ref.id);
      doc.scene.perspective = { vps: [{ x: ${X}, y: ${HZ} }], visible: true, origen: "prueba" }; return 1; })()`);
    await wait(400);
    await ev(`(()=>{ const doc = DZ.doc; doc.addLayer("Personaje"); doc.goTo(1); dzCanvasSet(${JSON.stringify(PERSONAJE)}); dzDocCommit(); doc.emit("layers"); doc.emit("frame");
      DZ.zoom = .55; DZ.panX = 0; DZ.panY = 0; dzApplyZoom(); return 1; })()`);
    await wait(800);
    const w0 = (await pelota(1)).w;

    // ── 1. la ventana propone la perspectiva y dice el tamaño final ─────────
    const v1 = await abrirVentana();
    assert.equal(v1.sel, "pelota", "el clic no eligió la pelota: " + JSON.stringify(v1));
    assert.ok(v1.persp && !v1.perspApagada, "con perspectiva en la escena, la ventana no trae «según la perspectiva» elegido: " + JSON.stringify(v1));
    const finalPct = Math.round(esperada(YS[YS.length - 1]) * 100);
    assert.ok(new RegExp("a " + finalPct + " %").test(v1.info), "la ventana no anticipa el tamaño final (" + finalPct + " %): " + JSON.stringify(v1.info));

    // ── 2. generar: en cada marca, del tamaño que da la perspectiva ─────────
    const pasos0 = await ev("DZ.doc.history ? DZ.doc.history.undoStack.length : 0");
    await clicEn(await centro(`document.getElementById("recGo")`)); await wait(1000);
    const mal = [];
    for (let k = 0; k < YS.length; k++) {
      const p = await pelota(1 + k), e = esperada(YS[k]);
      if (!p || p.copias !== undefined) { mal.push("F" + (1 + k) + " " + JSON.stringify(p)); continue; }
      if (Math.hypot(p.x - X, p.y - YS[k]) > 4) mal.push("F" + (1 + k) + " fuera de la marca " + JSON.stringify(p));
      if (Math.abs(p.w / w0 - e) > 0.03) mal.push("F" + (1 + k) + " tamaño " + (p.w / w0).toFixed(3) + " en vez de " + e.toFixed(3));
    }
    assert.deepEqual(mal, [], "la pelota no se achica con la perspectiva (o no sigue las marcas)");
    const pasos = (await ev("DZ.doc.history ? DZ.doc.history.undoStack.length : 0")) - pasos0;
    assert.equal(pasos, 1, "seguir el recorrido con perspectiva no es UN paso de Ctrl+Z");
    await ev("(()=>{ dzUndo(); return 1; })()"); await wait(600);
    const trasUndo = await pelota(YS.length);
    assert.ok(!trasUndo || trasUndo.copias === 0 || Math.abs(trasUndo.w / w0 - 1) < 0.02, "Ctrl+Z no sacó los cuadros achicados: " + JSON.stringify(trasUndo));

    // ── 3. sin perspectiva: la opción se apaga y el tamaño a mano funciona ──
    await ev("(()=>{ DZ.doc.scene.perspective = null; return 1; })()");
    const v3 = await abrirVentana();
    assert.ok(v3.perspApagada && v3.igual && !v3.persp, "sin perspectiva en la escena, la ventana sigue ofreciendo «según la perspectiva» (o no arranca en «igual»): " + JSON.stringify(v3));
    await ev(`(()=>{ const p = document.getElementById("recTamPct"); p.value = "50"; p.dispatchEvent(new Event("input", { bubbles: true })); return 1; })()`); await wait(200);
    const info3 = await ev('(document.getElementById("recTamInfo") || {}).textContent || ""');
    assert.ok(/a 50 %/.test(info3), "elegir «a mano: 50 %» no anticipa el tamaño: " + JSON.stringify(info3));
    await clicEn(await centro(`document.getElementById("recGo")`)); await wait(1000);
    const ult = await pelota(YS.length), medio = await pelota(4);
    assert.ok(ult && Math.abs(ult.w / w0 - 0.5) < 0.03, "a mano 50 %: el último cuadro no queda a la mitad: " + JSON.stringify(ult));
    const recorrido = (y) => (Y0 - y) / (Y0 - YS[YS.length - 1]);   // por lo recorrido, no por cuadro
    assert.ok(medio && Math.abs(medio.w / w0 - (1 - 0.5 * recorrido(YS[3]))) < 0.03, "a mano: el tamaño no se reparte por lo recorrido: " + JSON.stringify(medio));

    // ── 4. un recorrido que cruza el horizonte se avisa ─────────────────────
    const cruza = await ev(`(()=>{ const R = LOW.animation.recorrido, hz = R.horizonteDe({ perspective: { vps: [{ x: 960, y: 300 }] } });
      return R.escalasPorHorizonte([{ x: 960, y: 900 }, { x: 960, y: 600 }, { x: 960, y: 200 }], hz); })()`);
    assert.ok(cruza && /horizonte/.test(cruza.error || ""), "un recorrido que cruza el horizonte no se avisa: " + JSON.stringify(cruza));

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E recorrido con perspectiva OK " + JSON.stringify({ final: finalPct + " %", info: v1.info, aMano: info3 }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
