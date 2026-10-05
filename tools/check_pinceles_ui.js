/* PINCELES: TEXTURAS, EFECTOS Y SENSIBILIDAD, CON EL MOUSE Y EL LÁPIZ DE VERDAD.
   CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026): «mejoremos los pinceles, aumentemos la variedad
   y mejoremos la sensibilidad a la tableta; quiero pinceles de efectos y de
   texturas». Lo que se exige, y lo que estaba roto antes:

   1. CON EL MOUSE el trazo no tiembla: la presión es 1 en todo el trazo (el
      camino rápido le daba 0,5 y el ancho saltaba entre 0,52 y 1). CON EL
      LÁPIZ la presión sigue la mano, sin zigzag entre calibrada y cruda; en
      RÁFAGA no se pierde ninguna muestra.
   2. Los 40 pinceles se dibujan; los de textura llevan su filtro de grano, los
      de efecto su brillo o sus sellos con forma.
   3. EL GRANO SE VE EN LOS PÍXELES: el lápiz grafito varía su tinta, la tinta
      limpia no.
   4. Dos capas con trazos texturados: en el export NINGÚN id se repite (antes
      cada dibujo numeraba desde 1 y un trazo usaba el filtro de otro).
   5. La paleta recolorea un trazo texturado.
   6. El Estudio filtra por categoría, muestra una miniatura real de cada
      pincel y cambiar la Textura de un pincel la aplica. */
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
  const clicEn = async (p, nombre) => { assert.ok(p, "no está «" + nombre + "»");
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(400); };
  const centro = (expr) => ev(`(()=>{ const e = ${expr}; if (!e) return null; e.scrollIntoView({ block: "nearest" }); const r = e.getBoundingClientRect();
    if (!r.width) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  /** Un trazo sobre la hoja, de izquierda a derecha, en la fila `f` (0..1). */
  const trazo = async (f, { pen = false, pasos = 30 } = {}) => {
    const H = await ev('(()=>{ const r = document.querySelector("#dzCanvas > svg").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()');
    const x0 = H.x + H.w * .2, x1 = H.x + H.w * .8, y = H.y + H.h * f;
    const extra = (t) => pen ? { pointerType: "pen", force: .1 + .8 * t } : {};
    await mouse("mouseMoved", x0, y, extra(0)); await mouse("mousePressed", x0, y, { buttons: 1, clickCount: 1, ...extra(0) });
    for (let i = 1; i <= pasos; i++) { const t = i / pasos; await mouse("mouseMoved", x0 + (x1 - x0) * t, y, { buttons: 1, ...extra(t) }); await wait(10); }
    await mouse("mouseReleased", x1, y, { buttons: 0, clickCount: 1, ...extra(1) }); await wait(500);
    return pasos + 1;
  };
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
    // lo que llega al trazo, antes de refinarlo
    await ev(`(()=>{ const o = window._drawFinish; window._drawFinish = function () { window.__pts = DRAW_TRACK ? DRAW_TRACK.pts.map(p => [p[0], p[2]]) : null; return o.apply(this, arguments); }; return 1; })()`);
    await ev(`(()=>{ dzSetTool("brush"); DZ.brushPreset = "clean-ink"; DZ.drawW = 10; return 1; })()`);

    // ── 1. mouse y lápiz ────────────────────────────────────────────────────
    await trazo(.25);
    const raton = await ev(`(()=>{ const p = window.__pts || []; return { n: p.length, min: Math.min(...p.map(x => x[1])), max: Math.max(...p.map(x => x[1])) }; })()`);
    assert.ok(raton.n > 5, "el trazo de mouse no llegó: " + JSON.stringify(raton));
    assert.ok(raton.min > .999, "con el MOUSE la presión no es pareja (el ancho tiembla): " + JSON.stringify(raton));
    // con CALIBRACIÓN (inicio .1, máximo .8): una de las dos copias de cada
    // muestra salteaba la calibración y la presión zigzagueaba
    await ev(`(()=>{ DZ.pressureMin = .1; DZ.pressureMax = .8; return 1; })()`);
    const enviados = await trazo(.4, { pen: true, pasos: 40 });
    await ev(`(()=>{ DZ.pressureMin = 0; DZ.pressureMax = 1; return 1; })()`);
    const lapiz = await ev(`(()=>{ const p = window.__pts || []; let sube = 0; for (let i = 1; i < p.length; i++) if (p[i][1] >= p[i - 1][1] - 1e-6) sube++;
      return { n: p.length, sube: sube / Math.max(1, p.length - 1), ini: p[0] && p[0][1], fin: p.at(-1) && p.at(-1)[1] }; })()`);
    assert.ok(lapiz.sube > .95 && lapiz.fin > lapiz.ini + .4, "la presión del lápiz no sigue la mano (rampa de .1 a .9, calibrada .1–.8): zigzaguea entre la calibrada y la cruda · " + JSON.stringify(lapiz));
    void enviados;

    // ── 1b. en RÁFAGA (como bajo carga): dos muestras distintas llegan con la
    // misma hora; ninguna muestra que el navegador entrega puede perderse.
    await ev(`(()=>{ window.__vistas = []; document.querySelector("#dzCanvas").addEventListener("pointermove", (e) => {
      for (const c of (e.getCoalescedEvents ? e.getCoalescedEvents() : [e])) if (c.buttons) window.__vistas.push(c.clientX + "," + c.clientY); }, true); return 1; })()`);
    {
      const H = await ev('(()=>{ const r = document.querySelector("#dzCanvas > svg").getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()');
      const x0 = Math.round(H.x + H.w * .2), y = Math.round(H.y + H.h * .9);
      await mouse("mouseMoved", x0, y, { pointerType: "pen", force: .5 }); await mouse("mousePressed", x0, y, { buttons: 1, clickCount: 1, pointerType: "pen", force: .5 });
      await Promise.all(Array.from({ length: 60 }, (_, i) => mouse("mouseMoved", x0 + 6 * (i + 1), y + (i % 2) * 2, { buttons: 1, pointerType: "pen", force: .5 })));
      await wait(200); await mouse("mouseReleased", x0 + 360, y, { buttons: 0, clickCount: 1, pointerType: "pen", force: 0 }); await wait(500);
    }
    const rafaga = await ev(`({ vistas: new Set(window.__vistas).size, puntos: (window.__pts || []).length })`);
    assert.ok(rafaga.vistas > 5, "la ráfaga no llegó a la hoja: " + JSON.stringify(rafaga));
    assert.ok(rafaga.puntos >= rafaga.vistas, "en ráfaga se perdieron muestras: el navegador entregó " + rafaga.vistas + " y el trazo tiene " + rafaga.puntos + " puntos");

    // ── 2. los 40 pinceles se dibujan, con su textura o su efecto ──────────
    const todos = await ev(`(()=>{ const out = [], pts = []; for (let k = 0; k <= 40; k++) pts.push([100 + k * 10, 300 + Math.sin(k / 6) * 30, .2 + .8 * Math.sin(k / 40 * Math.PI), 0, 0, 0, k * 8]);
      for (const b of LOW.drawing.brushes.all()) {
        let el = null, error = null; try { el = dzBrushRenderElement(pts, "#334455", { brush: b, size: Math.min(b.size || 6, 24) }); } catch (e) { error = e.message; }
        out.push({ id: b.id, ok: !!el, error, filtro: !!(el && el.querySelector && el.querySelector("filter feTurbulence")), brillo: !!(el && el.querySelector && el.querySelector("filter feGaussianBlur")),
          formas: el ? el.querySelectorAll("use").length : 0, textura: b.texture || null, glow: b.glow || 0, shape: b.shape || null,
          raster: b.engine === "raster", borde: !!(LOW.drawing.efectos.BORDES[b.texture]), bitmap: !!(el && el.getAttribute && el.getAttribute("data-low-bitmap") === "1") });
      } return out; })()`);
    assert.ok(todos.length >= 40, "hay " + todos.length + " pinceles");
    for (const b of todos) {
      assert.ok(b.ok, b.id + " no dibuja nada" + (b.error ? ": " + b.error : ""));
      // raster: el MAPA DE BITS (punta, grano); vectorial y bordes: filtro SVG
      if (b.raster && b.textura !== "pixel" && !b.id.includes("eraser")) assert.ok(b.bitmap, b.id + ": es raster y no pasa por el mapa de bits");
      if (b.textura && b.textura !== "pixel" && (!b.raster || b.borde)) assert.ok(b.filtro, b.id + ": declara textura «" + b.textura + "» y no lleva su filtro");
      if (b.glow) assert.ok(b.brillo, b.id + ": declara brillo y no brilla");
      if (b.shape && b.shape !== "ellipse") assert.ok(b.bitmap || b.formas > 0, b.id + ": declara forma «" + b.shape + "» y no la pinta");
    }

    // ── 3. el grano en los píxeles ──────────────────────────────────────────
    const grano = await ev(`(async()=>{
      const pts = []; for (let k = 0; k <= 40; k++) pts.push([100 + k * 20, 200, .8, 0, 0, 0, k * 8]);
      const medir = async (id) => { const el = dzBrushRenderElement(pts, "#000000", { brush: LOW.drawing.brushes.get(id), size: 30 });
        const t = '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="400" viewBox="0 0 1000 400">' + el.outerHTML + "</svg>";
        const img = new Image(); await new Promise((r, j) => { img.onload = r; img.onerror = () => j(Error("no rasteriza " + id)); img.src = URL.createObjectURL(new Blob([t], { type: "image/svg+xml" })); });
        const c = document.createElement("canvas"); c.width = 1000; c.height = 400; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
        const d = x.getImageData(300, 196, 400, 8).data, a = []; for (let i = 3; i < d.length; i += 4) a.push(d[i]);
        const m = a.reduce((s, v) => s + v, 0) / a.length; return +Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length).toFixed(1); };
      return { grafito: await medir("graphite-pencil"), tiza: await medir("chalk"), limpia: await medir("clean-ink") }; })()`);
    assert.ok(grano.grafito > 10 && grano.tiza > 10, "el grano no se ve en los píxeles: " + JSON.stringify(grano));
    assert.ok(grano.limpia < 3, "la tinta limpia salió con grano: " + JSON.stringify(grano));

    // ── 4. dos capas con trazos texturados: ningún id repetido en el export ──
    await ev(`(()=>{ DZ.doc.goTo(5); DZ.brushPreset = "graphite-pencil"; return 1; })()`); await wait(400);
    await trazo(.55);
    await ev(`(()=>{ DZ.doc.addLayer("Capa 2"); DZ.doc.emit("frame"); return 1; })()`); await wait(600);
    await ev(`(()=>{ DZ.doc.goTo(5); DZ.brushPreset = "sparkles"; return 1; })()`); await wait(400);
    await trazo(.7);
    await ev(`(()=>{ DZ.doc.addLayer("Capa 3"); DZ.doc.emit("frame"); DZ.doc.goTo(5); DZ.brushPreset = "graphite-pencil"; return 1; })()`); await wait(600);
    await trazo(.8);
    const ids = await ev(`(()=>{ const t = dzCuadroSvgTexto(5); const todos = [...t.matchAll(/ id="([^"]+)"/g)].map(m => m[1]);
      const rep = todos.filter((v, i) => todos.indexOf(v) !== i); const refs = [...t.matchAll(/url\\(#([^)]+)\\)/g)].map(m => m[1]);
      return { n: todos.length, repetidos: [...new Set(rep)], huerfanos: refs.filter(r => !todos.includes(r)), capas: DZ.doc.scene.layers.length }; })()`);
    assert.equal(ids.capas, 3);
    assert.ok(ids.n >= 3, "el export no trae las definiciones de los trazos: " + JSON.stringify(ids));
    assert.deepEqual(ids.repetidos, [], "en el export se repiten ids entre capas: un trazo usaría el filtro de otro · " + JSON.stringify(ids));
    assert.deepEqual(ids.huerfanos, [], "hay trazos que apuntan a filtros que no están: " + JSON.stringify(ids));

    // ── 4b. dos CUADROS dibujados sin verse (papel cebolla apagado) y después
    // juntos: el fantasma del cuadro 10 entra a la hoja con sus id. Antes los
    // dos dibujos numeraban igual (brush_fx_1) y el trazo del cuadro 12 usaba
    // el filtro del fantasma.
    await ev(`(()=>{ DZ.onionOn = false; dzOnionRender(); DZ.doc.selectLayer(DZ.doc.scene.layers[0].id); DZ.doc.goTo(10); DZ.brushPreset = "graphite-pencil"; return 1; })()`); await wait(500);
    await trazo(.3);
    await ev(`(()=>{ DZ.doc.goTo(12); DZ.brushPreset = "sparkles"; return 1; })()`); await wait(500);
    await trazo(.6);
    await ev(`(()=>{ DZ.onionOn = true; dzOnionRender(); return 1; })()`); await wait(400);
    const hoja = await ev(`(()=>{ const svg = document.querySelector("#dzCanvas > svg"), todos = [...svg.querySelectorAll("[id]")].map(n => n.id);
      const rep = [...new Set(todos.filter((v, i) => todos.indexOf(v) !== i))];
      const vivo = [...svg.querySelectorAll(':scope > g[data-low-art] > [data-low="raster-brush"]')].at(-1);
      const fid = vivo && (vivo.getAttribute("filter") || "").replace(/url\\(#|\\)/g, "");
      const def = fid && svg.querySelector("#" + CSS.escape(fid));
      return { fantasmas: svg.querySelectorAll(":scope > g.dz-onion:not(.dz-capa):not(.dz-capa-defs)").length, repetidos: rep, suFiltroEsSuyo: !!(def && vivo.contains(def)), vivo: vivo && vivo.getAttribute("data-brush-id"), fid, hayDef: !!def, frame: DZ.doc.frame }; })()`);
    assert.ok(hoja.fantasmas >= 1, "el papel cebolla no mostró el cuadro 10: la prueba no junta los dos dibujos");
    assert.deepEqual(hoja.repetidos, [], "el fantasma y el dibujo activo repiten ids: un trazo usa el filtro del otro · " + JSON.stringify(hoja));
    assert.equal(hoja.suFiltroEsSuyo, true, "el trazo del cuadro 12 apunta a un filtro que no es el suyo: " + JSON.stringify(hoja));

    // ── 5. la paleta recolorea un trazo texturado ───────────────────────────
    await ev(`(()=>{ DZ.onionOn = false; dzOnionRender(); DZ.doc.goTo(10); return 1; })()`); await wait(500);   // el trazo grafito del cuadro 10, sin fantasmas encima
    const paleta = await ev(`(async()=>{ const el = [...document.querySelectorAll('#dzCanvas > svg > g[data-low-art] > [data-low-fx]')].at(-1);
      if (!el) return { sin: true }; const idx = +el.getAttribute("data-fil"); const antes = getComputedStyle(el.querySelector("path")).fill;
      DZ.doc.setStyleColor(idx, "#2a9d3a"); await new Promise(r => setTimeout(r, 400));
      const nuevo = [...document.querySelectorAll('#dzCanvas > svg > g[data-low-art] > [data-low-fx]')].at(-1);
      return { antes, despues: getComputedStyle(nuevo.querySelector("path")).fill }; })()`);
    assert.ok(!paleta.sin, "no quedó ningún trazo texturado en la hoja");
    assert.equal(paleta.despues, "rgb(42, 157, 58)", "la paleta no recoloreó el trazo texturado: " + JSON.stringify(paleta));

    // ── 6. el Estudio de pinceles ───────────────────────────────────────────
    await clicEn(await centro(`[...document.querySelectorAll("button")].find(e => /^Pinceles/.test(e.textContent.trim()) && e.getBoundingClientRect().width > 0)`), "Pinceles…");
    await clicEn(await centro(`document.querySelector('[data-filter="efecto"]')`), "Efectos");
    const estudio = await ev(`({ lista: [...document.querySelectorAll(".bst-brush b")].map(b => b.textContent), mini: document.querySelectorAll(".bst-tip.con-trazo").length })`);
    assert.ok(estudio.lista.includes("Neón") && estudio.lista.includes("Destellos") && !estudio.lista.includes("Tinta limpia"), "el filtro Efectos no filtra: " + JSON.stringify(estudio.lista));
    assert.equal(estudio.mini, estudio.lista.length, "no todos los pinceles tienen su miniatura real");
    await clicEn(await centro(`document.querySelector('.bst-brush[data-id="neon"]')`), "Neón");
    assert.ok(await ev(`!!document.querySelector(".bst-preview svg filter feGaussianBlur")`), "la vista previa del Neón no brilla: no usa el render de la mesa");
    // la Textura de un pincel liso: es un <select> nativo, se elige su opción
    await clicEn(await centro(`document.querySelector('[data-filter="tinta"]')`), "Tintas");
    await clicEn(await centro(`document.querySelector('.bst-brush[data-id="clean-ink"]')`), "Tinta limpia");
    await ev(`(()=>{ const s = document.querySelector('.bst-controls select[data-p="texture"]'); s.value = "chalk"; s.dispatchEvent(new Event("change")); return 1; })()`); await wait(400);
    const cambio = await ev(`(()=>{ const b = LOW.drawing.brushes.get(DZ.brushPreset); return { id: b.id, texture: b.texture, base: LOW.drawing.brushes.isBuiltin(b.id) }; })()`);
    assert.equal(cambio.texture, "chalk", "elegir la textura en el Estudio no la aplicó: " + JSON.stringify(cambio));
    assert.equal(cambio.base, false, "cambió el pincel incorporado en vez de crear uno propio");

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    assert.deepEqual(graves.slice(0, 3), [], "hubo excepciones durante el recorrido");
    console.log("E2E pinceles OK · " + todos.length + " pinceles · grano " + JSON.stringify(grano));
  } finally {
    ws.close(); try { await fetch(endpoint + "/json/close/" + tab.id); } catch (_) { }
  }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
