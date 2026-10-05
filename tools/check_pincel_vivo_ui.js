/* EL PINCEL MIENTRAS SE DIBUJA, LAS ESQUINAS Y EL MAPA DE BITS. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026): «no los veo bien a los pinceles, falta más
   precisión y mejores efectos». Lo que se midió y se exige:

   1. EN VIVO: mientras se arrastra un pincel raster, sobre la hoja se ve el
      pincel de verdad (una capa con tinta donde pasa el lápiz), no rayitas;
      la capa está dentro del área de dibujo (en el body quedaba DETRÁS del
      editor y no se veía) y se va al soltar. Con un vectorial, el trazo en
      vivo es su contorno real.
   2. LAS ESQUINAS: una V aguda dibujada con el lápiz se separaba hasta 8 px
      del recorrido (la curva la volvía U). Tiene que quedar a menos de 3.
   3. EL MAPA DE BITS: un trazo de carboncillo es UNA imagen (no cientos de
      elipses), con máscara y color: la paleta lo recolorea. */
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
  const pen = (type, x, y, force, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", pointerType: "pen", force, ...extra });
  const hoja = () => ev('(()=>{ const r = document.querySelector("#dzCanvas > svg").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()');
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!window.LOW?.workspace?.workspaces').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');
    await wait(500);

    // ── 1. en vivo: carboncillo (raster) ────────────────────────────────────
    await ev(`(()=>{ dzSetTool("brush"); dzBrushSelect(LOW.drawing.brushes.get("charcoal")); DZ.drawW = 60; return 1; })()`);
    let H = await hoja();
    const x0 = H.x + H.w * .15, y = H.y + H.h * .3, x1 = H.x + H.w * .85;
    await pen("mouseMoved", x0, y, 0); await pen("mousePressed", x0, y, .4, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 25; i++) { await pen("mouseMoved", x0 + (x1 - x0) * i / 50, y, .6, { buttons: 1 }); await wait(14); }
    await wait(120);
    const medio = await ev(`(()=>{ const c = document.querySelector("canvas.dz-pincel-vivo"); if (!c) return { capa: false };
      const r = c.getBoundingClientRect(), d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let tinta = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) tinta++;
      // ¿hay tinta justo donde pasó el lápiz?
      const dpr = c.width / r.width, px = Math.round((${x0} + (${x1} - ${x0}) * .25 - r.left) * dpr), py = Math.round((${y} - r.top) * dpr);
      const aca = c.getContext("2d").getImageData(Math.max(0, px - 6), Math.max(0, py - 6), 12, 12).data; let tintaAca = 0; for (let i = 3; i < aca.length; i += 4) tintaAca = Math.max(tintaAca, aca[i]);
      return { capa: true, adentro: !!c.closest("#dzCanvas"), tinta, tintaAca, rayitas: DRAW_TRACK ? DRAW_TRACK.el.querySelectorAll(":scope > path").length : -1 }; })()`);
    assert.ok(medio.capa, "mientras se dibuja con un pincel raster no hay vista en vivo (sólo rayitas)");
    assert.ok(medio.adentro, "la capa en vivo no está dentro del área de dibujo: queda detrás del editor y no se ve");
    assert.ok(medio.tintaAca > 100, "la capa en vivo no tiene tinta donde pasó el lápiz: " + JSON.stringify(medio));
    assert.equal(medio.rayitas, 0, "además de la vista en vivo siguen las rayitas");
    for (let i = 26; i <= 50; i++) { await pen("mouseMoved", x0 + (x1 - x0) * i / 50, y, .6, { buttons: 1 }); await wait(10); }
    await pen("mouseReleased", x1, y, 0, { buttons: 0, clickCount: 1 }); await wait(600);
    const final = await ev(`(()=>{ const el = [...document.querySelectorAll("#dzCanvas > svg > g[data-low-art] > *")].at(-1);
      return { capaQueda: !!document.querySelector("canvas.dz-pincel-vivo"), bitmap: el && el.getAttribute("data-low-bitmap"), imagenes: el ? el.querySelectorAll("image").length : 0,
        elipses: el ? el.querySelectorAll("ellipse").length : 0, fil: el && el.getAttribute("data-fil") }; })()`);
    assert.equal(final.capaQueda, false, "la capa en vivo quedó después de soltar");
    assert.equal(final.bitmap, "1", "el carboncillo no quedó como mapa de bits: " + JSON.stringify(final));
    assert.deepEqual([final.imagenes, final.elipses], [1, 0], "el trazo raster tiene que ser UNA imagen, sin elipses: " + JSON.stringify(final));

    // ── 3. la paleta recolorea el mapa de bits ──────────────────────────────
    const paleta = await ev(`(async()=>{ const el = [...document.querySelectorAll("#dzCanvas > svg > g[data-low-art] > [data-low-bitmap]")].at(-1);
      const idx = +el.getAttribute("data-fil"); DZ.doc.setStyleColor(idx, "#2a9d3a"); await new Promise(r => setTimeout(r, 400));
      const nuevo = [...document.querySelectorAll("#dzCanvas > svg > g[data-low-art] > [data-low-bitmap]")].at(-1);
      return getComputedStyle(nuevo.querySelector("rect")).fill; })()`);
    assert.equal(paleta, "rgb(42, 157, 58)", "la paleta no recolorea el trazo de mapa de bits");

    // ── 1b. en vivo: un vectorial dibuja su contorno real ───────────────────
    await ev(`(()=>{ dzBrushSelect(LOW.drawing.brushes.get("graphite-pencil")); DZ.drawW = 30; return 1; })()`);
    H = await hoja();
    const yv = H.y + H.h * .5;
    await pen("mouseMoved", x0, yv, 0); await pen("mousePressed", x0, yv, .4, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 20; i++) { await pen("mouseMoved", x0 + (x1 - x0) * i / 40, yv - Math.sin(i / 6) * 30, .3 + .6 * i / 20, { buttons: 1 }); await wait(14); }
    await wait(120);
    const vivoV = await ev(`(()=>{ const g = DRAW_TRACK && DRAW_TRACK.el, p = g && g.querySelector("g > path"); return { d: p ? (p.getAttribute("d") || "").length : 0, filtro: !!(g && g.querySelector("filter feTurbulence")), rayitas: g ? g.querySelectorAll(":scope > path").length : -1 }; })()`);
    await pen("mouseReleased", x0 + (x1 - x0) / 2, yv, 0, { buttons: 0, clickCount: 1 }); await wait(500);
    assert.ok(vivoV.d > 50 && vivoV.rayitas === 0, "mientras se dibuja con un pincel vectorial no se ve su contorno: " + JSON.stringify(vivoV));
    assert.ok(vivoV.filtro, "la vista en vivo del lápiz grafito no lleva su textura");

    // ── 2. la V aguda queda en punta ────────────────────────────────────────
    await ev(`(()=>{ dzSetTool("pencil"); return 1; })()`);
    H = await hoja();
    const a = [H.x + H.w * .4, H.y + H.h * .62], b = [a[0] + 60, a[1] + 120], c = [a[0] + 120, a[1]];
    const pts = []; for (let i = 0; i <= 24; i++) { const t = i / 24; pts.push(i <= 12 ? [a[0] + (b[0] - a[0]) * t * 2, a[1] + (b[1] - a[1]) * t * 2] : [b[0] + (c[0] - b[0]) * (t - .5) * 2, b[1] + (c[1] - b[1]) * (t - .5) * 2]); }
    await pen("mouseMoved", pts[0][0], pts[0][1], 0); await pen("mousePressed", pts[0][0], pts[0][1], .6, { buttons: 1, clickCount: 1 });
    for (const p of pts.slice(1)) { await pen("mouseMoved", p[0], p[1], .6, { buttons: 1 }); await wait(8); }
    await pen("mouseReleased", c[0], c[1], 0, { buttons: 0, clickCount: 1 }); await wait(500);
    const v = await ev(`(()=>{ const el = [...document.querySelectorAll("#dzCanvas > svg > g[data-low-art] > *")].at(-1), m = el.getScreenCTM();
      const L = el.getTotalLength(), s = []; for (let i = 0; i <= 400; i++) { const q = el.getPointAtLength(L * i / 400); s.push([m.a * q.x + m.c * q.y + m.e, m.b * q.x + m.d * q.y + m.f]); }
      const A = ${JSON.stringify(a)}, B = ${JSON.stringify(b)}, C = ${JSON.stringify(c)};
      const seg = (p, u, w) => { const dx = w[0]-u[0], dy = w[1]-u[1], t = Math.max(0, Math.min(1, ((p[0]-u[0])*dx + (p[1]-u[1])*dy) / (dx*dx + dy*dy))); return Math.hypot(p[0]-u[0]-t*dx, p[1]-u[1]-t*dy); };
      return { desvio: +Math.max(...s.map(q => Math.min(seg(q, A, B), seg(q, B, C)))).toFixed(2), punta: +Math.min(...s.map(q => Math.hypot(q[0]-B[0], q[1]-B[1]))).toFixed(2) }; })()`);
    assert.ok(v.desvio < 3, "la V se redondea: el trazo se separa " + v.desvio + " px del recorrido del lápiz (era 7,9)");
    assert.ok(v.punta < 4, "el trazo no llega a la punta de la V: queda a " + v.punta + " px");

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    assert.deepEqual(graves.slice(0, 3), [], "hubo excepciones durante el recorrido");
    console.log("E2E pincel en vivo, esquinas y mapa de bits OK · V " + JSON.stringify(v) + " · vivo " + JSON.stringify({ tinta: medio.tinta }));
  } finally {
    ws.close(); try { await fetch(endpoint + "/json/close/" + tab.id); } catch (_) { }
  }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
