/* UNIR PUNTAS: dos líneas que se tocan en la punta pasan a ser una (v3.35).
   CDP :9223 + mock :8791.

   Pedido de Mauro: «al tocar dos puntas, dos extremos de línea, las líneas se
   unifiquen; es algo que se puede activar o desactivar en la herramienta».
   Con el mouse de verdad, en el Lápiz y en el Pincel:
   1. Apagado (como viene): un trazo que empieza en la punta de otro queda
      aparte — dos líneas.
   2. «Unir puntas» en la barra de la herramienta lo prende (y se recuerda).
   3. Un trazo que empieza en la punta de una línea la CONTINÚA: sigue
      habiendo una línea, que va del comienzo de la vieja al final del nuevo.
   4. Un trazo que une las puntas de DOS líneas deja una sola.
   5. Ctrl+Z deshace la unión junto con el trazo.
   6. De otro color no se une (cambiaría cómo se ve lo que ya estaba).
   7. En el Pincel, igual: una línea de pincel con todos los puntos. */
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
  const trazo = async (a, b, pasos = 16) => {
    await mouse("mouseMoved", a[0], a[1]); await mouse("mousePressed", a[0], a[1], { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= pasos; i++) { await mouse("mouseMoved", a[0] + (b[0] - a[0]) * i / pasos, a[1] + (b[1] - a[1]) * i / pasos + Math.sin(i / pasos * Math.PI) * 6, { buttons: 1 }); await wait(12); }
    await mouse("mouseReleased", b[0], b[1], { buttons: 0, clickCount: 1 }); await wait(260);
  };
  // las líneas de la capa, con sus puntas EN PANTALLA (lo que el usuario ve)
  const lineas = (sel) => ev(`(()=>{ const svg = document.querySelector("#dzCanvas > svg"), M = svg.getScreenCTM();
    return [...svg.querySelectorAll(${JSON.stringify(sel)})].filter(e => !e.closest("g.dz-onion")).map(e => {
      const attr = e.getAttribute("data-low-brush-points") || e.getAttribute("data-low-pencil-points");
      const pts = attr ? JSON.parse(attr) : null; const s = (p) => [Math.round(M.a * p[0] + M.c * p[1] + M.e), Math.round(M.b * p[0] + M.d * p[1] + M.f)];
      return { n: pts ? pts.length : 0, ini: pts ? s(pts[0]) : null, fin: pts ? s(pts[pts.length - 1]) : null };
    }); })()`);
  const LAPIZ = 'g[data-low-art] path[fill="none"]', PINCEL = "[data-low-brush-points]";
  const cerca = (p, q, tol = 6) => p && q && Math.hypot(p[0] - q[0], p[1] - q[1]) <= tol;

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    // sin lo que otra prueba dejó guardado (las opciones se leen al cargar): borrar y RECARGAR
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} location.reload(); return true; })()');
    await wait(500);
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); dzSetTool("pencil"); DZ.smooth = 0; return true; })()'); await wait(300);
    const c = await ev(`(()=>{ const r = document.querySelector("#dzCanvas > svg").getBoundingClientRect(); return [Math.round(r.x + r.width * .5), Math.round(r.y + r.height * .5)]; })()`);
    const P = (dx, dy) => [c[0] + dx, c[1] + dy];

    // ── 1. apagado: dos líneas ──
    assert.strictEqual(await ev(`!!DZ.unirPuntas`), false, "«Unir puntas» tiene que venir apagado");
    await trazo(P(-260, -120), P(-140, -120));
    let L = await lineas(LAPIZ);
    assert.strictEqual(L.length, 1, "no se dibujó la primera línea: " + JSON.stringify(L));
    assert.ok(L[0].fin, "el lápiz no guarda los puntos de su línea: sin ellos no se puede unir");
    await trazo(L[0].fin, P(-40, -80));
    L = await lineas(LAPIZ);
    assert.strictEqual(L.length, 2, "con «Unir puntas» apagado, el trazo que empieza en una punta se unió igual: " + JSON.stringify(L));

    // ── 2. el botón de la barra lo prende ──
    const boton = await ev(`(()=>{ const b = document.querySelector("#dzToolOpts [data-unir-puntas]"); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    assert.ok(boton, "la barra del Lápiz no tiene «Unir puntas»");
    await mouse("mouseMoved", boton[0], boton[1]); await mouse("mousePressed", boton[0], boton[1], { buttons: 1, clickCount: 1 }); await mouse("mouseReleased", boton[0], boton[1], { buttons: 0, clickCount: 1 }); await wait(200);
    assert.strictEqual(await ev(`!!DZ.unirPuntas && localStorage.getItem("low.unirPuntas") === "1"`), true, "el botón no prendió «Unir puntas» o no se recuerda");

    // ── 3. continuar una línea ──
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); dzSetTool("pencil"); DZ.smooth = 0; return true; })()'); await wait(300);
    await trazo(P(-260, -120), P(-140, -120));
    const A = (await lineas(LAPIZ))[0];
    await trazo(A.fin, P(-20, -60));
    L = await lineas(LAPIZ);
    assert.strictEqual(L.length, 1, "un trazo que empieza en la punta de otro no la continuó: " + JSON.stringify(L));
    assert.ok(cerca(L[0].ini, A.ini) && cerca(L[0].fin, P(-20, -60), 8), "la línea unida no va del comienzo de la vieja al final del nueva: " + JSON.stringify({ A, L }));

    // ── 4. unir DOS líneas: queda una ──
    await trazo(P(120, -60), P(260, -100));
    const B = (await lineas(LAPIZ)).find((x) => cerca(x.ini, P(120, -60), 8));
    assert.ok(B && (await lineas(LAPIZ)).length === 2, "no se dibujó la segunda línea suelta");
    await trazo(L[0].fin, B.ini);
    const antesDeshacer = await lineas(LAPIZ);
    assert.strictEqual(antesDeshacer.length, 1, "un trazo que une las puntas de dos líneas no dejó una sola: " + JSON.stringify(antesDeshacer));
    assert.ok(cerca(antesDeshacer[0].ini, A.ini) && cerca(antesDeshacer[0].fin, B.fin), "la línea final no va de punta a punta: " + JSON.stringify(antesDeshacer));

    // ── 5. Ctrl+Z deshace la unión con el trazo ──
    await ev(`dzUndo(); true`); await wait(400);
    assert.strictEqual((await lineas(LAPIZ)).length, 2, "Ctrl+Z no devolvió las dos líneas sueltas");

    // ── 6. otro color no se une ──
    await ev(`(()=>{ DZ.drawColor = "#2255ff"; return true; })()`);
    const L6 = await lineas(LAPIZ);
    await trazo(L6[0].fin, P(60, 140));
    assert.strictEqual((await lineas(LAPIZ)).length, 3, "una línea de OTRO color se unió (cambia cómo se ve lo que estaba)");
    await ev(`(()=>{ DZ.drawColor = "#1a1a1a"; return true; })()`);

    // ── 7. el Pincel ──
    await ev('(()=>{ dzSetTool("brush"); return true; })()'); await wait(300);
    await trazo(P(-260, 120), P(-140, 160));
    const F = (await lineas(PINCEL))[0];
    assert.ok(F && F.n > 2, "el pincel no guardó sus puntos");
    await trazo(F.fin, P(-20, 120));
    const G = await lineas(PINCEL);
    assert.strictEqual(G.length, 1, "en el Pincel, el trazo que empieza en la punta no la continuó: " + JSON.stringify(G));
    assert.ok(G[0].n > F.n && cerca(G[0].ini, F.ini) && cerca(G[0].fin, P(-20, 120), 8), "la línea de pincel unida no tiene todos los puntos: " + JSON.stringify({ F, G }));

    assert.deepStrictEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E unir puntas OK", JSON.stringify({ lapiz: antesDeshacer[0], pincel: G[0] }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
