/* MOVER CUADROS ELIGIÉNDOLOS EN LA LÍNEA DE TIEMPO. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026): «quiero poder mover los frames de lugar
   eligiéndolos en la línea de tiempo». Mover existía, escondido: sólo con
   Alt+arrastrar. Apretar sobre lo seleccionado no puede mover (él mismo pidió
   que arrastrar SIEMPRE seleccione: si no, al reseleccionar se desordenaba la
   escena), así que la selección lleva una MANIJA, como la barra de arrastre de
   las celdas de OpenToonz.

   Con el mouse de verdad:
   1. Seleccionar 2–3 arrastrando: aparece la manija en el primer cuadro.
   2. Llevar la manija al cuadro 6: los cuadros quedan en 6–7, en UN paso de
      historial, y la selección los acompaña. Ctrl+Z vuelve EXACTO.
   3. Arrastrar sobre lo seleccionado (fuera de la manija) sigue seleccionando:
      no mueve nada.
   4. Alt+→ corre la selección un cuadro.
   5. El menú del clic derecho ofrece mover un cuadro antes y después. */
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
  const centroCelda = async (capa, cuadro) => {
    const p = await ev(`(()=>{ const ly = DZ.doc.scene.layers[${capa}];
      const c = document.querySelector('.tl2-cell[data-layer-id="' + ly.id + '"][data-frame="${cuadro}"]');
      if (!c) return null; c.scrollIntoView({ block: "nearest", inline: "nearest" }); const r = c.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    assert.ok(p, "no está la celda de la capa " + capa + ", cuadro " + cuadro); return p; };
  const tecla = async (key, code, vk, mods = 0) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, modifiers: mods, windowsVirtualKeyCode: vk });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, modifiers: mods, windowsVirtualKeyCode: vk }); await wait(350); };
  // arrastrar de una celda a otra con el mouse de verdad; mods: 1 Alt, 2 Ctrl, 8 Shift
  let marcoVisto = false;
  const arrastrar = async (c1, f1, c2, f2, { mods = 0, conMarco = false } = {}) => {
    const a = await centroCelda(c1, f1), b = await centroCelda(c2, f2);
    await mouse("mouseMoved", a.x, a.y, { modifiers: mods }); await mouse("mousePressed", a.x, a.y, { buttons: 1, clickCount: 1, modifiers: mods });
    for (let i = 1; i <= 8; i++) { await mouse("mouseMoved", a.x + (b.x - a.x) * i / 8, a.y + (b.y - a.y) * i / 8, { buttons: 1, modifiers: mods }); await wait(20);
      if (conMarco && i === 5 && await ev(`!!document.querySelector(".tl2-marco")`)) marcoVisto = true; }
    await mouse("mouseReleased", b.x, b.y, { buttons: 0, clickCount: 1, modifiers: mods }); await wait(400); };
  const estado = () => ev(`(()=>{ const sc = DZ.doc.toJSON().scene; delete sc.revision; return JSON.stringify(sc); })()`);
  const clicDerecho = async (capa, cuadro) => { const p = await centroCelda(capa, cuadro);
    await mouse("mouseMoved", p.x, p.y);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "right", buttons: 2, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "right", buttons: 0, clickCount: 1 });
    await wait(300);
    return ev(`[...document.querySelectorAll(".ctx-command-menu .ctx-item")].map(b => b.textContent.trim())`); };
  const elegir = async (texto) => {
    const p = await ev(`(()=>{ const b = [...document.querySelectorAll(".ctx-command-menu .ctx-item")].find(x => x.textContent.includes(${JSON.stringify(texto)}));
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, apagado: b.disabled }; })()`);
    assert.ok(p, "el menú no tiene «" + texto + "»"); assert.ok(!p.apagado, "«" + texto + "» está apagado");
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(450); };
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!window.LOW?.workspace?.workspaces').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');
    // Capa 1: 1 2 3 4 (un dibujo distinto por cuadro)
    await ev(`(()=>{ const doc = DZ.doc; const dib = (n) => '<g data-low-art="colour"></g><g data-low-art="line"><path d="M' + n * 20 + ' 10 L 300 300" stroke="#111"/></g>';
      const l1 = doc.layer, v1 = doc.level; if (v1.byNumber(1)) v1.byNumber(1).content = dib(1); else v1.addDrawing(1, dib(1));
      v1.addDrawing(2, dib(2)); v1.addDrawing(3, dib(3)); v1.addDrawing(4, dib(4)); [1,2,3,4].forEach((n, i) => l1.setCell(i + 1, n));
      doc.history.clear(); doc.emit("cells"); doc.emit("level"); doc.emit("frame"); return true; })()`);
    await wait(500);
    const celdas = () => ev(`[1,2,3,4,5,6,7,8].map(f => DZ.doc.scene.layers[0].cellAt(f) ?? null)`);

    // ── 1. seleccionar 2–3: aparece la manija en el cuadro 2 ────────────────
    await arrastrar(0, 2, 0, 3);
    const asa = await ev(`(()=>{ const a = document.querySelector(".tl2-asa"); if (!a) return null; const c = a.closest(".tl2-cell"); const r = a.getBoundingClientRect();
      return { cuadro: Number(c.dataset.frame), x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; })()`);
    assert.ok(asa && asa.cuadro === 2 && asa.w >= 5, "la selección no muestra la manija para moverla en su primer cuadro: " + JSON.stringify(asa));

    // ── 2. llevar la manija al cuadro 6 ─────────────────────────────────────
    const antes = await estado(), pasos0 = await ev(`DZ.doc.history.undoStack.length`);
    const destino = await centroCelda(0, 6);
    await mouse("mouseMoved", asa.x, asa.y); await mouse("mousePressed", asa.x, asa.y, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 10; i++) { await mouse("mouseMoved", asa.x + (destino.x - asa.x) * i / 10, asa.y, { buttons: 1 }); await wait(25); }
    await mouse("mouseReleased", destino.x, asa.y, { buttons: 0, clickCount: 1 }); await wait(500);
    const movido = await celdas();
    assert.equal(movido[5], 2, "llevar la manija al cuadro 6 no movió el cuadro 2 ahí: " + JSON.stringify(movido));
    assert.equal(movido[6], 3, "el cuadro 3 no acompañó al 2: " + JSON.stringify(movido));
    assert.equal(await ev(`DZ.doc.history.undoStack.length`) - pasos0, 1, "mover no es UN paso de historial");
    const selMovida = await ev(`({ from: DZ.doc.cellSelection?.from, to: DZ.doc.cellSelection?.to })`);
    assert.deepEqual(selMovida, { from: 6, to: 7 }, "la selección no acompaña a los cuadros movidos");
    await ev(`(()=>{ document.activeElement?.blur?.(); return true; })()`);
    await tecla("z", "KeyZ", 90, 2);
    assert.equal(await estado(), antes, "Ctrl+Z no devuelve la línea de tiempo exacta");

    // ── 3. arrastrar sobre lo seleccionado (sin la manija) sigue seleccionando ─
    await arrastrar(0, 2, 0, 3);
    const antes3 = await estado();
    await arrastrar(0, 3, 0, 4);
    assert.equal(await estado(), antes3, "arrastrar sobre lo seleccionado (sin la manija) movió cuadros");
    assert.deepEqual(await ev(`({ from: DZ.doc.cellSelection?.from, to: DZ.doc.cellSelection?.to })`), { from: 3, to: 4 }, "arrastrar sobre lo seleccionado no reselecciona");

    // ── 4. Alt+→ corre la selección un cuadro ───────────────────────────────
    await ev(`(()=>{ document.activeElement?.blur?.(); return true; })()`);
    await tecla("ArrowRight", "ArrowRight", 39, 1);
    const corrido = await celdas();
    assert.deepEqual([corrido[3], corrido[4]], [3, 4], "Alt+→ no corre la selección un cuadro: " + JSON.stringify(corrido));
    assert.equal(await ev(`DZ.doc.cellSelection?.from`), 4, "la selección no acompaña a Alt+→");

    // ── 5. el menú ofrece mover ─────────────────────────────────────────────
    const menu = await clicDerecho(0, 4);
    assert.ok(menu.some((t) => /Mover un cuadro después/.test(t)) && menu.some((t) => /Mover un cuadro antes/.test(t)), "el menú no ofrece mover: " + JSON.stringify(menu));
    await tecla("Escape", "Escape", 27);

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E mover cuadros OK", JSON.stringify({ manija: asa.cuadro, movido, corrido }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e); process.exit(1); });
