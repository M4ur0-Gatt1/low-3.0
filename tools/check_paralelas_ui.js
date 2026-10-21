/* PARALELAS: el lápiz y el pincel dibujan dos líneas a la vez (v3.42).
   CDP :9223 + mock :8791.

   Pedido de Mauro: «una herramienta de dibujo de paralelas con el pincel: si
   quiero hacer ambos lados de un brazo establezco una distancia, por ejemplo
   de 6 mm, y dibujo el brazo, las dos líneas al mismo tiempo… debe ser algo
   desmarcable, como el dibujo de simetría».
   Con el mouse y el teclado de verdad:
   1. Apagado (como viene): un trazo deja una línea.
   2. El botón ‖ junto al espejo la prende; Shift+M la apaga y la prende.
   3. Prendida, una insignia sobre la hoja lo avisa; la separación se escribe
      ahí (en mm) y se recuerda. (En la barra del Lápiz no entraba: a media
      pantalla sacaba de la vista el suavizado.)
   4. MIENTRAS se dibuja se ven las dos líneas (no al soltar).
   5. Al soltar quedan DOS líneas, a la separación pedida en todo el largo
      (10 mm = 37,8 px del dibujo), y no queda el eje escondido.
   6. Un solo Ctrl+Z las saca a las dos.
   7. La separación es la misma a cualquier zoom.
   8. Con el espejo, cuatro líneas.
   9. En el Pincel, igual: dos cintas de pincel.
  10. Con «Unir puntas» y la vista muy alejada, las dos paralelas no se sueldan
      entre sí (sus puntas quedan a menos de 8 px de pantalla).
  11. Apagada otra vez, un trazo deja una línea. */
const assert = require("assert");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const tab = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(), errores = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data);
    if (d.method === "Runtime.exceptionThrown") errores.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    const p = pending.get(d.id); if (p) { pending.delete(d.id); d.error ? p.j(Error(d.error.message)) : p.r(d.result); } };
  const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; pending.set(n, { r, j }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", pointerType: "mouse", ...extra });
  const clic = async (p) => { await mouse("mouseMoved", p[0], p[1]); await mouse("mousePressed", p[0], p[1], { buttons: 1, clickCount: 1 }); await mouse("mouseReleased", p[0], p[1], { buttons: 0, clickCount: 1 }); await wait(200); };
  const tecla = async (key, code, vk, modifiers = 0, text) => {
    await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers, ...(text ? { text } : {}) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers }); await wait(120);
  };
  // un trazo curvo (como el contorno de un brazo); `antesDeSoltar` mira lo que se ve en medio
  const trazo = async (a, b, pasos = 20, antesDeSoltar = null) => {
    await mouse("mouseMoved", a[0], a[1]); await mouse("mousePressed", a[0], a[1], { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= pasos; i++) { await mouse("mouseMoved", a[0] + (b[0] - a[0]) * i / pasos, a[1] + (b[1] - a[1]) * i / pasos + Math.sin(i / pasos * Math.PI) * 40, { buttons: 1 }); await wait(14); }
    let visto = null;
    if (antesDeSoltar) { await wait(80); visto = await antesDeSoltar(); }
    await mouse("mouseReleased", b[0], b[1], { buttons: 0, clickCount: 1 }); await wait(300);
    return visto;
  };
  // las líneas del dibujo con sus puntos EN EL DIBUJO
  const lineas = (sel) => ev(`(()=>{ const svg = document.querySelector("#dzCanvas > svg");
    return [...svg.querySelectorAll(${JSON.stringify(sel)})].filter(e => !e.closest("g.dz-onion") && !e.closest(".dz-penui")).map(e => {
      const attr = e.getAttribute("data-low-brush-points") || e.getAttribute("data-low-pencil-points");
      return { pts: attr ? JSON.parse(attr) : null, oculto: e.getAttribute("visibility") === "hidden", espejo: /scale\\(-1 1\\)/.test(e.getAttribute("transform") || "") };
    }); })()`);
  const LAPIZ = 'g[data-low-art] path[fill="none"]', PINCEL = "[data-low-brush-points]";
  // la separación entre dos líneas: de cada punto de una (salvo las puntas) al tramo más cercano de la otra
  const separaciones = (A, B) => {
    const dSeg = (p, a, b) => { const vx = b[0] - a[0], vy = b[1] - a[1], l = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / l)); return Math.hypot(p[0] - a[0] - vx * t, p[1] - a[1] - vy * t); };
    const out = [];
    for (let i = Math.floor(A.length * 0.1); i < Math.ceil(A.length * 0.9); i++) { let m = Infinity; for (let k = 1; k < B.length; k++) m = Math.min(m, dSeg(A[i], B[k - 1], B[k])); out.push(m); }
    return { min: Math.min(...out), max: Math.max(...out) };
  };
  const nuevo = async (herr = "pencil") => {
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev(`(()=>{ if (typeof closeL3d === "function") closeL3d(); dzSetTool(${JSON.stringify(herr)}); DZ.smooth = 0; return true; })()`); await wait(300);
  };

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} location.reload(); return true; })()');
    await wait(500);
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await nuevo();
    const c = await ev(`(()=>{ const r = document.querySelector("#dzCanvas > svg").getBoundingClientRect(); return [Math.round(r.x + r.width * .5), Math.round(r.y + r.height * .5)]; })()`);
    const P = (dx, dy) => [c[0] + dx, c[1] + dy];

    // ── 1. apagado: una línea ──
    assert.strictEqual(await ev(`!!DZ.paralelas`), false, "las paralelas tienen que venir apagadas");
    await trazo(P(-250, -150), P(-50, -150));
    assert.strictEqual((await lineas(LAPIZ)).length, 1, "apagadas, un trazo no dejó una sola línea");

    // ── 2. el botón ‖ y Shift+M ──
    // (junto al espejo, en «Más herramientas» ⋯)
    const enPantalla = (sel) => ev(`(()=>{ const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null; const r = b.getBoundingClientRect(); return r.width ? [r.x + r.width / 2, r.y + r.height / 2] : null; })()`);
    const apretarParalelas = async () => {
      if (!(await enPantalla("#dzParalelas"))) await clic(await enPantalla("#dzToolsMore"));
      const b = await enPantalla("#dzParalelas");
      assert.ok(b, "no está el botón de las paralelas junto al espejo (en «Más herramientas»)");
      await clic(b);
      await ev(`(()=>{ typeof dzToolsDrawerHide === "function" && dzToolsDrawerHide(); return true; })()`); await wait(150);
    };
    await apretarParalelas();
    assert.strictEqual(await ev(`!!DZ.paralelas && document.querySelector("#dzParalelas").getAttribute("aria-pressed") === "true"`), true, "el botón ‖ no prendió las paralelas");
    await ev(`(()=>{ document.activeElement && document.activeElement.blur && document.activeElement.blur(); return true; })()`);
    await tecla("M", "KeyM", 77, 8);
    assert.strictEqual(await ev(`!!DZ.paralelas`), false, "Shift+M no apagó las paralelas");
    await tecla("M", "KeyM", 77, 8);
    assert.strictEqual(await ev(`!!DZ.paralelas`), true, "Shift+M no prendió las paralelas");
    const insignia = () => ev(`(()=>{ const c = document.querySelector("#dzParalelasInsignia"); if (!c || c.hidden) return null; const r = c.getBoundingClientRect(), m = document.querySelector("#dzCanvas").getBoundingClientRect();
      return { dentro: r.left >= m.left && r.top >= m.top && r.right <= m.right, w: r.width }; })()`);
    const ins = await insignia();
    assert.ok(ins && ins.dentro, "prendidas, no se ve la insignia sobre la hoja: " + JSON.stringify(ins));

    // ── 3. la separación en la barra del Lápiz ──
    const campo = await ev(`(()=>{ const i = document.querySelector("#dzParalelasInsignia [data-paralelas-mm]"); if (!i) return null; const r = i.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    assert.ok(campo, "la insignia no tiene la separación de las paralelas");
    await clic(campo);
    await tecla("a", "KeyA", 65, 2);
    for (const ch of "10") await tecla(ch, "Digit" + ch, ch.charCodeAt(0), 0, ch);
    await tecla("Enter", "Enter", 13, 0, "\r");
    await ev(`(()=>{ document.activeElement && document.activeElement.blur(); return true; })()`); await wait(150);
    assert.strictEqual(await ev(`DZ.paralelasMm`), 10, "escribir 10 en la separación no la cambió");
    assert.strictEqual(await ev(`localStorage.getItem("low.paralelas.mm")`), "10", "la separación no se recuerda");

    // ── 4 y 5. dibujar: dos líneas en vivo y al soltar, a 10 mm ──
    const antes = (await lineas(LAPIZ)).length;
    const enVivo = await trazo(P(-250, 0), P(200, 0), 24, () => ev(`[...document.querySelectorAll("#dzCanvas > svg g[data-low-art] path[fill='none']")].filter(e => e.getAttribute("visibility") !== "hidden" && (e.getAttribute("d") || "").length > 20).length`));
    assert.ok(enVivo >= antes + 2, "mientras se dibuja no se ven las dos líneas (se vieron " + (enVivo - antes) + ")");
    let L = await lineas(LAPIZ);
    assert.strictEqual(L.length, antes + 2, "al soltar no quedaron dos líneas: " + (L.length - antes));
    assert.ok(!L.some((x) => x.oculto), "quedó el eje escondido en el dibujo");
    const sep = 10 * 96 / 25.4;
    let s = separaciones(L[antes].pts, L[antes + 1].pts);
    assert.ok(s.min > sep * 0.85 && s.max < sep * 1.15, "las dos líneas no quedaron a 10 mm (" + sep.toFixed(1) + " px) en todo el largo: " + JSON.stringify(s));

    // ── 6. un solo Ctrl+Z ──
    await ev(`dzUndo(); true`); await wait(400);
    assert.strictEqual((await lineas(LAPIZ)).length, antes, "un Ctrl+Z no sacó las dos líneas");

    // ── 7. la misma separación con otro zoom ──
    await ev(`(()=>{ DZ.zoom = 2; dzApplyZoom(); return true; })()`); await wait(300);
    await trazo(P(-150, 60), P(100, 60), 20);
    L = await lineas(LAPIZ);
    const s7 = separaciones(L[L.length - 2].pts, L[L.length - 1].pts);
    assert.ok(s7.min > sep * 0.85 && s7.max < sep * 1.15, "con zoom 2 la separación cambió: " + JSON.stringify(s7));
    await ev(`(()=>{ DZ.zoom = 1; dzApplyZoom(); return true; })()`); await wait(300);

    // ── 8. con el espejo: cuatro ──
    await nuevo();
    await ev(`(()=>{ dzMirrorToggle(); return true; })()`);
    await trazo(P(-300, -60), P(-80, 40));
    L = await lineas(LAPIZ);
    assert.strictEqual(L.length, 4, "con el espejo no quedaron cuatro líneas: " + L.length);
    assert.strictEqual(L.filter((x) => x.espejo).length, 2, "con el espejo, no se espejaron las dos paralelas");
    await ev(`(()=>{ dzMirrorToggle(); return true; })()`);

    // ── 9. el Pincel: dos cintas ──
    await nuevo("brush");
    await trazo(P(-250, 0), P(200, 0), 24);
    const B = await lineas(PINCEL);
    assert.strictEqual(B.length, 2, "en el Pincel no quedaron dos cintas: " + B.length);
    const s9 = separaciones(B[0].pts, B[1].pts);
    assert.ok(s9.min > sep * 0.8 && s9.max < sep * 1.2, "las cintas del pincel no quedaron a 10 mm: " + JSON.stringify(s9));

    // ── 10. «Unir puntas» y la vista alejada: no se sueldan entre sí ──
    await nuevo();
    await ev(`(()=>{ LOW.drawing.unirPuntas.poner(true); DZ.zoom = 0.2; dzApplyZoom(); return true; })()`); await wait(300);
    await trazo(P(-60, -20), P(40, -10), 14);
    const L10 = await lineas(LAPIZ);
    assert.strictEqual(L10.length, 2, "con «Unir puntas» y la vista alejada, las dos paralelas se soldaron en una: " + L10.length);
    await ev(`(()=>{ LOW.drawing.unirPuntas.poner(false); DZ.zoom = 1; dzApplyZoom(); return true; })()`); await wait(300);

    // ── 11. la ✕ de la insignia las apaga; apagadas, una línea ──
    const cruz = await ev(`(()=>{ const b = document.querySelector("#dzParalelasInsignia [data-paralelas-cerrar]"); if (!b || !b.getClientRects().length) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    assert.ok(cruz, "la insignia no tiene la ✕ para apagar");
    const lineasAntes = (await lineas(LAPIZ)).length;
    await clic(cruz);
    assert.strictEqual(await ev(`!!DZ.paralelas`), false, "la ✕ de la insignia no apagó las paralelas");
    assert.strictEqual(await insignia(), null, "apagadas, la insignia sigue a la vista");
    assert.strictEqual((await lineas(LAPIZ)).length, lineasAntes, "tocar la insignia dibujó sobre la hoja");
    await apretarParalelas(); await apretarParalelas();
    assert.strictEqual(await ev(`!!DZ.paralelas`), false, "el botón ‖ (dos veces) no dejó las paralelas apagadas");
    await nuevo();
    await trazo(P(-250, -150), P(-50, -150));
    assert.strictEqual((await lineas(LAPIZ)).length, 1, "apagadas otra vez, un trazo no dejó una línea");

    assert.deepStrictEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E paralelas OK", JSON.stringify({ sep: +sep.toFixed(1), lapiz: s, zoom2: s7, pincel: s9 }));
  } finally {
    ws.close();
    await fetch(endpoint + "/json/close/" + tab.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
