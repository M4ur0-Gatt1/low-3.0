/* LO DE AUTOCAD EN EL 2D (v3.43). CDP :9223 + mock :8791.

   Pedido de Mauro: «si te parece que hay algún comportamiento de AutoCAD que se
   pueda copiar y sea útil a este sistema, sumalo… no te conformes con poco».
   Con el mouse y el teclado de verdad:
   1. F3 prende las REFERENCIAS A OBJETOS; al pasar cerca de la punta de una
      línea se ve la marca de AutoCAD (□ «Punto final»).
   2. Un trazo que arranca cerca de esa punta arranca EXACTO en ella.
   3. Un trazo que termina cerca del medio de una línea termina en su PUNTO MEDIO.
   4. … cerca del cruce de dos líneas, en la INTERSECCIÓN.
   5. … y si cae a plomo sobre una línea, en la PERPENDICULAR desde donde arrancó.
   6. F3 otra vez las apaga: el trazo arranca donde se apretó.
   7. DESFASE desde la línea de comandos («O 10»): un clic arriba deja una copia
      paralela a 10 mm (37,8 px) del lado del clic; Shift+clic, de los dos lados;
      un rectángulo se desfasa con las esquinas en punta; Ctrl+Z saca la copia.
   8. MATRIZ rectangular (2 × 3), polar (6 alrededor) y en trayecto (5 a lo
      largo de una línea).
   9. IGUALAR PROPIEDADES («MA»): lo elegido pasa su color y su grosor a lo que
      se toca; Esc termina; Enter con la línea vacía repite el comando.
  10. Un texto que no es un comando no se toma como comando. */
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
  const clic = async (p, modifiers = 0) => { await mouse("mouseMoved", p[0], p[1], { modifiers }); await mouse("mousePressed", p[0], p[1], { buttons: 1, clickCount: 1, modifiers }); await mouse("mouseReleased", p[0], p[1], { buttons: 0, clickCount: 1, modifiers }); await wait(250); };
  const tecla = async (key, code, vk, modifiers = 0, text) => {
    await send("Input.dispatchKeyEvent", { type: text ? "keyDown" : "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers, ...(text ? { text } : {}) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers }); await wait(120);
  };
  const escribir = async (txt) => { for (const ch of txt) { const up = ch.toUpperCase(); await tecla(ch, /\d/.test(ch) ? "Digit" + ch : ch === " " ? "Space" : "Key" + up, up.charCodeAt(0), 0, ch); } };
  const trazo = async (a, b, pasos = 14) => {
    await mouse("mouseMoved", a[0], a[1]); await wait(60);
    await mouse("mousePressed", a[0], a[1], { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= pasos; i++) { await mouse("mouseMoved", a[0] + (b[0] - a[0]) * i / pasos, a[1] + (b[1] - a[1]) * i / pasos, { buttons: 1 }); await wait(12); }
    await wait(60);
    await mouse("mouseReleased", b[0], b[1], { buttons: 0, clickCount: 1 }); await wait(300);
  };
  // las líneas de lápiz con sus puntos en el dibujo
  const lineas = () => ev(`(()=>{ const svg = document.querySelector("#dzCanvas > svg");
    return [...svg.querySelectorAll('g[data-low-art] path[fill="none"]')].filter(e => !e.closest(".dz-penui,g.dz-onion")).map(e => { const a = e.getAttribute("data-low-pencil-points"); return a ? JSON.parse(a) : null; }); })()`);
  const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const nuevo = async () => {
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev(`(()=>{ if (typeof closeL3d === "function") closeL3d(); dzSetTool("pencil"); DZ.smooth = 0; DZ.drawW = 2; return true; })()`); await wait(300);
  };
  const comandoCad = async (txt) => {
    await tecla("k", "KeyK", 75, 2); await wait(250);
    assert.strictEqual(await ev(`document.activeElement && document.activeElement.id`), "dzPrompt", "Ctrl+K no llevó a la línea de comandos");
    await escribir(txt); await tecla("Enter", "Enter", 13, 0, "\r"); await wait(300);
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

    // la línea A, horizontal
    await trazo(P(-200, 0), P(0, 0), 20);
    let L = await lineas();
    assert.strictEqual(L.length, 1, "no se dibujó la línea A");
    const A = L[0], Afin = A[A.length - 1], Aini = A[0];

    // ── 1. F3 y la marca ──
    assert.strictEqual(await ev(`!!DZ.refent`), false, "las referencias a objetos tienen que venir apagadas");
    await ev(`(()=>{ document.activeElement && document.activeElement.blur && document.activeElement.blur(); return true; })()`);
    await tecla("F3", "F3", 114);
    assert.strictEqual(await ev(`!!DZ.refent`), true, "F3 no prendió las referencias a objetos");
    const finPantalla = await ev(`(()=>{ const M = document.querySelector("#dzCanvas > svg").getScreenCTM(); return [M.a * ${Afin[0]} + M.c * ${Afin[1]} + M.e, M.b * ${Afin[0]} + M.d * ${Afin[1]} + M.f]; })()`);
    await mouse("mouseMoved", finPantalla[0] + 5, finPantalla[1] + 4); await wait(120);
    const mk = await ev(`(()=>{ const m = document.querySelector("#dzRefentMarca"); if (!m || m.hidden) return null; const r = m.getBoundingClientRect(); return { tipo: m.getAttribute("data-tipo"), x: r.left, y: r.top, txt: m.textContent }; })()`);
    assert.ok(mk && mk.tipo === "fin" && /Punto final/.test(mk.txt), "al pasar cerca de la punta no se vio la marca de «Punto final»: " + JSON.stringify(mk));
    assert.ok(Math.hypot(mk.x - finPantalla[0], mk.y - finPantalla[1]) < 1.5, "la marca no está sobre la punta: " + JSON.stringify({ mk, finPantalla }));

    // ── 2. arrancar en la punta ──
    await trazo([finPantalla[0] + 5, finPantalla[1] + 4], P(60, 120));
    L = await lineas();
    const B = L[L.length - 1];
    assert.ok(d2(B[0], Afin) < 0.01, "el trazo no arrancó exacto en la punta de A: " + JSON.stringify({ b0: B[0], Afin }));

    // ── 3. terminar en el punto medio ──
    const medio = [(Aini[0] + Afin[0]) / 2, (Aini[1] + Afin[1]) / 2];
    await trazo(P(-150, -90), P(-98, 3));
    L = await lineas();
    const Cl = L[L.length - 1], cFin = Cl[Cl.length - 1];
    assert.ok(Math.abs(cFin[0] - medio[0]) < 1.5 && Math.abs(cFin[1] - medio[1]) < 0.5, "el trazo no terminó en el punto medio de A: " + JSON.stringify({ cFin, medio }));

    // ── 4. la intersección ──
    await trazo(P(-50, -60), P(-50, 110), 20);
    L = await lineas();
    const Dv = L[L.length - 1];
    await trazo(P(-46, 4), P(-10, 80));
    L = await lineas();
    const E = L[L.length - 1], xD = Dv[0][0];
    assert.ok(Math.abs(E[0][0] - xD) < 0.8 && Math.abs(E[0][1] - Aini[1]) < 0.8, "el trazo no arrancó en la intersección de A y D: " + JSON.stringify({ e0: E[0], xD, yA: Aini[1] }));

    // ── 5. la perpendicular desde donde arrancó ──
    await trazo(P(-170, -100), P(-167, 2));
    L = await lineas();
    const F = L[L.length - 1], f0 = F[0], fFin = F[F.length - 1];
    assert.ok(Math.abs(fFin[1] - Aini[1]) < 0.5 && Math.abs(fFin[0] - f0[0]) < 0.8, "el trazo no terminó a plomo sobre A (perpendicular): " + JSON.stringify({ f0, fFin, yA: Aini[1] }));

    // ── 6. F3 las apaga ──
    await tecla("F3", "F3", 114);
    assert.strictEqual(await ev(`!!DZ.refent`), false, "F3 no apagó las referencias a objetos");
    await trazo([finPantalla[0] + 6, finPantalla[1] + 5], P(30, 150));
    L = await lineas();
    assert.ok(d2(L[L.length - 1][0], Afin) > 3, "apagadas, el trazo igual se enganchó en la punta");

    // ── 7. DESFASE ──
    await nuevo();
    await trazo(P(-200, 0), P(100, 0), 24);
    await ev(`(()=>{ dzSetTool("select"); return true; })()`); await wait(200);
    await clic(P(-50, 0));
    assert.ok(await ev(`!!DZ.sel`), "no se pudo elegir la línea con la flecha");
    const antes = (await lineas()).length;
    await comandoCad("O 10");
    assert.ok(/Desfase de 10 mm/.test(await ev(`(document.querySelector("#sbHint")?.textContent || "") + (document.querySelector("#dzStatus")?.textContent || "")`)), "«O 10» no pidió el lado del desfase");
    await clic(P(-50, -60));
    L = await lineas();
    assert.strictEqual(L.length, antes + 1, "el desfase no dejó una copia: " + (L.length - antes));
    const orig = L[0], cop = L[L.length - 1], sep = 10 * 96 / 25.4;
    const dy = orig[Math.floor(orig.length / 2)][1] - cop[Math.floor(cop.length / 2)][1];
    assert.ok(Math.abs(dy - sep) < 1, "la copia no quedó a 10 mm arriba (del lado del clic): " + dy.toFixed(2) + " de " + sep.toFixed(2));
    await ev(`dzUndo(); true`); await wait(300);
    assert.strictEqual((await lineas()).length, antes, "Ctrl+Z no sacó la copia del desfase");
    await clic(P(-50, 0));
    await comandoCad("O 5");
    await clic(P(-50, 50), 8);
    assert.strictEqual((await lineas()).length, antes + 2, "con Shift+clic el desfase no salió de los dos lados");
    // un rectángulo: esquinas en punta
    await ev(`(()=>{ const host = document.querySelector('#dzCanvas > svg g[data-low-art="line"]'); const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("x", "300"); r.setAttribute("y", "200"); r.setAttribute("width", "200"); r.setAttribute("height", "120"); r.setAttribute("fill", "none"); r.setAttribute("stroke", "#111"); r.setAttribute("stroke-width", "2"); r.id = "rectPrueba"; host.appendChild(r); return true; })()`);
    const ladoRect = await ev(`(()=>{ const M = document.querySelector("#dzCanvas > svg").getScreenCTM(); return [M.a * 300 + M.e, M.d * 260 + M.f]; })()`);
    await clic(ladoRect);
    assert.strictEqual(await ev(`DZ.sel && DZ.sel.id`), "rectPrueba", "no se pudo elegir el rectángulo");
    await comandoCad("O 5");
    await clic([ladoRect[0] - 40, ladoRect[1]]);
    const rr = await ev(`(()=>{ const s = DZ.sel; if (!s || s.id === "rectPrueba") return null; const b = s.getBBox(); return { d: s.getAttribute("d"), x: b.x, y: b.y, w: b.width, h: b.height }; })()`);
    const m5 = 5 * 96 / 25.4;
    assert.ok(rr && (rr.d.match(/L/g) || []).length === 3 && /Z$/.test(rr.d.trim()), "el rectángulo desfasado no tiene sus cuatro esquinas: " + JSON.stringify(rr));
    assert.ok(Math.abs(rr.x - (300 - m5)) < 0.5 && Math.abs(rr.w - (200 + 2 * m5)) < 0.5 && Math.abs(rr.h - (120 + 2 * m5)) < 0.5, "el rectángulo desfasado no creció 5 mm por lado: " + JSON.stringify(rr));

    // ── 8. MATRIZ ──
    await nuevo();
    await trazo(P(-300, -150), P(-270, -150), 8);
    await ev(`(()=>{ dzSetTool("select"); return true; })()`); await wait(200);
    await clic(P(-285, -150));
    await comandoCad("AR");
    assert.ok(await ev(`!document.querySelector("#overlay").hidden && !!document.querySelector("#mzHacer")`), "«AR» no abrió la matriz");
    await ev(`(()=>{ document.querySelector('input[name="matrizTipo"][value="rect"]').click(); const p = (id, v) => { const i = document.querySelector(id); i.value = String(v); }; p("#mzFilas", 2); p("#mzCols", 3); p("#mzDx", 20); p("#mzDy", 15); return true; })()`);
    await clic(await ev(`(()=>{ const r = document.querySelector("#mzHacer").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    let tr = await ev(`[...document.querySelectorAll('#dzCanvas > svg g[data-low-art] path[fill="none"]')].map(e => e.getAttribute("transform") || "")`);
    assert.strictEqual(tr.length, 6, "la matriz rectangular 2 × 3 no dejó 6 (con el original): " + tr.length);
    assert.ok(tr.some((t) => /translate\(151\.18 56\.69\)/.test(t)), "la matriz rectangular no puso la última copia a 40 mm × 15 mm: " + JSON.stringify(tr));
    // polar: 6 alrededor de su centro, girando
    await ev(`dzUndo(); true`); await wait(300);
    await clic(P(-285, -150));
    await comandoCad("AR");
    await ev(`(()=>{ document.querySelector('input[name="matrizTipo"][value="polar"]').click(); document.querySelector("#mzN").value = "6"; document.querySelector("#mzAng").value = "360"; document.querySelector("#mzRotar").checked = true; document.querySelector("#mzCentro").value = "seleccion"; return true; })()`);
    await clic(await ev(`(()=>{ const r = document.querySelector("#mzHacer").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    tr = await ev(`[...document.querySelectorAll('#dzCanvas > svg g[data-low-art] path[fill="none"]')].map(e => e.getAttribute("transform") || "")`);
    assert.strictEqual(tr.length, 6, "la matriz polar de 6 no dejó 6: " + tr.length);
    assert.ok(tr.some((t) => /rotate\(300\.000 /.test(t)), "la matriz polar no giró de a 60°: " + JSON.stringify(tr));
    // en trayecto: el chiquito a lo largo de una línea larga
    await ev(`dzUndo(); true`); await wait(300);
    await ev(`(()=>{ dzSetTool("pencil"); return true; })()`); await wait(150);
    await trazo(P(-250, 80), P(250, 80), 30);
    await ev(`(()=>{ dzSetTool("select"); return true; })()`); await wait(200);
    await clic(P(-285, -150)); await clic(P(0, 80), 8);
    assert.strictEqual(await ev(`(DZ.multi || []).length`), 2, "no quedaron elegidas las dos (lo que se repite y el trayecto)");
    await comandoCad("AR");
    await ev(`(()=>{ document.querySelector('input[name="matrizTipo"][value="trayecto"]').click(); document.querySelector("#mzM").value = "5"; document.querySelector("#mzAlinear").checked = true; return true; })()`);
    await clic(await ev(`(()=>{ const r = document.querySelector("#mzHacer").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`));
    const cajas = await ev(`[...document.querySelectorAll('#dzCanvas > svg g[data-low-art] path[fill="none"]')].filter(e => /translate/.test(e.getAttribute("transform") || "")).map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; })`);
    assert.strictEqual(cajas.length, 5, "la matriz en trayecto no dejó 5 copias: " + cajas.length);
    const ys = cajas.map((q) => q[1]), xs = cajas.map((q) => q[0]).sort((a, b) => a - b);
    assert.ok(Math.max(...ys) - Math.min(...ys) < 4 && Math.abs(ys[0] - P(0, 80)[1]) < 4, "las copias no quedaron sobre el trayecto: " + JSON.stringify(cajas));
    assert.ok(Math.abs(xs[0] - P(-250, 80)[0]) < 6 && Math.abs(xs[4] - P(250, 80)[0]) < 6, "las copias no van de punta a punta del trayecto: " + JSON.stringify(xs));

    // ── 9. IGUALAR PROPIEDADES ──
    await nuevo();
    await trazo(P(-200, -60), P(0, -60));
    await ev(`(()=>{ DZ.drawColor = "#d11f3a"; DZ.drawW = 9; return true; })()`);
    await trazo(P(-200, 60), P(0, 60));
    await ev(`(()=>{ dzSetTool("select"); return true; })()`); await wait(200);
    await clic(P(-100, 60));
    await comandoCad("MA");
    await clic(P(-100, -60));
    let est = await ev(`[...document.querySelectorAll('#dzCanvas > svg g[data-low-art] path[fill="none"]')].map(e => [e.getAttribute("stroke"), e.getAttribute("stroke-width")])`);
    assert.deepStrictEqual(est[0], ["#d11f3a", "9"], "igualar propiedades no pasó el color y el grosor: " + JSON.stringify(est));
    await tecla("Escape", "Escape", 27);
    assert.ok(/listo/.test(await ev(`(document.querySelector("#sbHint")?.textContent || "") + (document.querySelector("#dzStatus")?.textContent || "")`)), "Esc no terminó igualar propiedades");
    // Enter con la línea vacía repite el último comando
    await tecla("k", "KeyK", 75, 2); await wait(200);
    await tecla("Enter", "Enter", 13, 0, "\r"); await wait(300);
    assert.ok(/Igualar propiedades: tocá/.test(await ev(`(document.querySelector("#sbHint")?.textContent || "") + (document.querySelector("#dzStatus")?.textContent || "")`)), "Enter con la línea vacía no repitió «MA»");
    await tecla("Escape", "Escape", 27);

    // ── 10. un pedido común no es un comando ──
    assert.strictEqual(await ev(`LOW.drawing.autocad.comando("hacé el fondo azul")`), false, "un pedido a la IA se tomó como comando");

    assert.deepStrictEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E autocad OK", JSON.stringify({ marca: mk.tipo, desfase: +dy.toFixed(2), rect: rr && { w: +rr.w.toFixed(1) } }));
  } finally {
    ws.close();
    await fetch(endpoint + "/json/close/" + tab.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
