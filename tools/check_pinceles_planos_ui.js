/* LOS PINCELES PLANOS (v3.32). CDP :9223 + mock :8791.

   Pedido de Mauro: «quiero que mejoremos los pinceles de LOW para que también
   tenga algunos pinceles que se vean más planos; quiero más texturas y
   efectos; pensá que estamos armando un estudio de animación completo».
   1. La familia «Planos» está en la lista, con sus siete pinceles.
   2. Tinta plana: con el LÁPIZ apretando de 0,1 a 0,9 el ancho NO cambia
      (con «Tinta limpia», el mismo gesto sí cambia: la prueba mide algo).
   3. Relleno a mano: un contorno dibujado con el mouse se cierra y se LLENA
      (el centro queda pintado), sin línea alrededor.
   4. Sombra plana: multiplica. Sobre rojo puro, la sombra deja el verde y el
      azul en ~0 (normal los subiría a ~36 y ~55), también al pasar a píxeles
      como en la exportación.
   5. Las texturas y efectos nuevos pintan algo (no salen vacíos). */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(), errores = [];
  ws.onmessage = ({ data }) => { const m = JSON.parse(data);
    if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.j(Error(m.error.message)) : p.r(m.result); } };
  const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; pending.set(n, { r, j }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
  const hoja = () => ev('(()=>{ const r = document.querySelector("#dzCanvas > svg").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()');
  /** Un gesto por puntos (0..1 de la hoja), con presión de lápiz opcional. */
  const gesto = async (pts, presion) => {
    const H = await hoja(), P = pts.map(([fx, fy]) => [H.x + H.w * fx, H.y + H.h * fy]);
    const extra = (k) => presion ? { pointerType: "pen", force: presion(k / (P.length - 1)) } : {};
    await mouse("mouseMoved", P[0][0], P[0][1], extra(0)); await mouse("mousePressed", P[0][0], P[0][1], { buttons: 1, clickCount: 1, ...extra(0) });
    for (let k = 1; k < P.length; k++) { await mouse("mouseMoved", P[k][0], P[k][1], { buttons: 1, ...extra(k) }); await wait(10); }
    const u = P[P.length - 1]; await mouse("mouseReleased", u[0], u[1], { buttons: 0, clickCount: 1, ...extra(P.length - 1) }); await wait(500);
  };
  const recta = (fy, n = 40) => Array.from({ length: n + 1 }, (_, k) => [.2 + .6 * k / n, fy]);
  /** El ancho de la última cinta en el primer y el último cuarto (unidades de la hoja). */
  const anchos = () => ev(`(()=>{ const el = [...document.querySelectorAll("#dzCanvas > svg [data-low=brush]")].at(-1); if (!el) return null;
    const p = el.tagName === "path" ? el : el.querySelector("path"), L = p.getTotalLength(), pts = [];
    for (let k = 0; k <= 600; k++) { const q = p.getPointAtLength(L * k / 600); pts.push(q); }
    const xs = pts.map(q => q.x), x0 = Math.min(...xs), x1 = Math.max(...xs), ancho = (a, b) => { const sel = pts.filter(q => q.x > x0 + (x1 - x0) * a && q.x < x0 + (x1 - x0) * b); return Math.max(...sel.map(q => q.y)) - Math.min(...sel.map(q => q.y)); };
    return { inicio: +ancho(.15, .25).toFixed(2), final: +ancho(.75, .85).toFixed(2) }; })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!window.LOW?.workspace?.workspaces').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');
    await wait(400);

    // ── 1. la familia «Planos»
    const planos = await ev(`LOW.drawing.brushes.all().filter(b => b.cat === "plano").map(b => b.id)`);
    for (const idp of ["flat-ink", "cel-line", "flat-marker", "flat-brush", "flat-fill", "flat-shadow", "flat-light"]) assert.ok(planos.includes(idp), "falta el pincel plano " + idp + " :: " + planos);
    const grupo = await ev(`(()=>{ dzSetTool("brush"); dzToolOptsRender(); const s = document.querySelector("#toBrushPreset"); return s ? [...s.querySelectorAll("optgroup")].map(g => g.label) : []; })()`);
    assert.ok(grupo.includes("Planos"), "la lista de pinceles no muestra la familia «Planos» :: " + grupo);

    // ── 2. tinta plana: el ancho no depende de la presión
    await ev(`(()=>{ dzSetTool("brush"); DZ.brushPreset = "clean-ink"; DZ.drawW = 12; DZ.anchoFijo = false; return 1; })()`);
    await gesto(recta(.3), (t) => .1 + .8 * t);
    const limpia = await anchos();
    await ev(`(()=>{ DZ.brushPreset = "flat-ink"; return 1; })()`);
    await gesto(recta(.45), (t) => .1 + .8 * t);
    const plana = await anchos();
    assert.ok(limpia && limpia.final > limpia.inicio * 1.4, "la prueba no mide nada: con «Tinta limpia» el ancho tampoco cambió :: " + JSON.stringify(limpia));
    assert.ok(plana && Math.abs(plana.final - plana.inicio) < plana.inicio * .12, "la «Tinta plana» cambia de ancho con la presión :: " + JSON.stringify(plana));

    // ── 3. relleno a mano: un contorno se cierra y se llena
    await ev(`(()=>{ DZ.brushPreset = "flat-fill"; DZ.drawColor = "#2a7fd4"; return 1; })()`);
    const circulo = Array.from({ length: 49 }, (_, k) => { const a = k / 48 * Math.PI * 2; return [.5 + Math.cos(a) * .12, .72 + Math.sin(a) * .16]; });
    const antes = await ev(`document.querySelectorAll("#dzCanvas > svg [data-low=brush]").length`);
    await gesto(circulo);
    const relleno = await ev(`(()=>{ const els = [...document.querySelectorAll("#dzCanvas > svg [data-low=brush]")]; const el = els.at(-1); if (!el) return null;
      const svg = document.querySelector("#dzCanvas > svg"), b = el.getBBox(), m = svg.getScreenCTM(), cx = b.x + b.width / 2, cy = b.y + b.height / 2;
      const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy; const p = (el.tagName === "path" ? el : el.querySelector("path"));
      return { n: els.length, fill: el.getAttribute("fill"), stroke: el.getAttribute("stroke"), dentro: p.isPointInFill(pt), w: Math.round(b.width), h: Math.round(b.height) }; })()`);
    assert.ok(relleno && relleno.n === antes + 1, "el relleno a mano no dejó un elemento :: " + JSON.stringify(relleno));
    assert.ok(relleno.dentro, "el relleno a mano no llenó el centro del contorno :: " + JSON.stringify(relleno));
    assert.ok(!relleno.stroke || relleno.stroke === "none", "el relleno a mano lleva línea alrededor :: " + JSON.stringify(relleno));
    const H = await hoja();
    assert.ok(Math.abs(relleno.w - .24 * (await ev(`document.querySelector("#dzCanvas > svg").viewBox.baseVal.width`))) < 40, "el relleno no tiene el tamaño del contorno dibujado :: " + JSON.stringify({ relleno, H }));

    // ── 4. sombra plana: multiplica, también en píxeles
    const px = await ev(`(async()=>{
      const pts = []; for (let k = 0; k <= 24; k++) { const a = k / 24 * Math.PI * 2; pts.push([200 + Math.cos(a) * 120, 200 + Math.sin(a) * 120, 1, 0, 0, 0, k * 8]); }
      const medir = async (id) => { const el = dzBrushRenderElement(pts, "#5a4f7a", { brush: LOW.drawing.brushes.get(id), size: 4 });
        const t = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="#ff0000"/>' + el.outerHTML + "</svg>";
        const img = new Image(); await new Promise((r, j) => { img.onload = r; img.onerror = () => j(Error("no rasteriza " + id)); img.src = URL.createObjectURL(new Blob([t], { type: "image/svg+xml" })); });
        const c = document.createElement("canvas"); c.width = 400; c.height = 400; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        const d = x.getImageData(200, 200, 1, 1).data; return { r: d[0], g: d[1], b: d[2], blend: el.style.mixBlendMode || "" }; };
      const normal = { ...LOW.drawing.brushes.get("flat-shadow"), blend: null, id: "sombra-normal" };
      const medirNormal = async () => { const el = dzBrushRenderElement(pts, "#5a4f7a", { brush: normal, size: 4 });
        const t = '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect width="400" height="400" fill="#ff0000"/>' + el.outerHTML + "</svg>";
        const img = new Image(); await new Promise((r) => { img.onload = r; img.src = URL.createObjectURL(new Blob([t], { type: "image/svg+xml" })); });
        const c = document.createElement("canvas"); c.width = 400; c.height = 400; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        const d = x.getImageData(200, 200, 1, 1).data; return { r: d[0], g: d[1], b: d[2] }; };
      return { sombra: await medir("flat-shadow"), normal: await medirNormal() }; })()`);
    assert.equal(px.sombra.blend, "multiply", "la sombra plana no lleva el modo multiplicar :: " + JSON.stringify(px));
    assert.ok(px.normal.g > 25 && px.normal.b > 40, "la prueba no mide nada: sin multiplicar la sombra también deja el rojo puro :: " + JSON.stringify(px));
    assert.ok(px.sombra.g < 8 && px.sombra.b < 8 && px.sombra.r < 230, "la sombra plana no multiplica al pasar a píxeles :: " + JSON.stringify(px));

    // ── 5. las texturas y efectos nuevos pintan algo
    const nuevos = await ev(`(()=>{ const pts = []; for (let k = 0; k <= 30; k++) pts.push([100 + k * 20, 200 + Math.sin(k / 3) * 30, .8, 0, 0, 0, k * 8]);
      return ["tempera", "impasto", "soft-graphite", "ballpoint", "rain", "snow", "splatter", "clouds", "fur"].map(idb => { const b = LOW.drawing.brushes.get(idb);
        const el = b ? dzBrushRenderElement(pts, "#222222", { brush: b, size: 20 }) : null; return { id: idb, existe: !!b, pinta: !!el && el.outerHTML.length > 200 }; }); })()`);
    for (const n of nuevos) { assert.ok(n.existe, "falta el pincel " + n.id); assert.ok(n.pinta, "el pincel " + n.id + " no pinta nada"); }

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    assert.equal(graves.length, 0, "excepciones: " + graves.slice(0, 3).join(" | "));
    console.log("E2E pinceles planos OK " + JSON.stringify({ limpia, plana, relleno: { w: relleno.w, h: relleno.h }, sombra: px.sombra, normal: px.normal }));
  } finally {
    ws.close();
    try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  }
}

main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
