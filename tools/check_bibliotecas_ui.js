/* BIBLIOTECAS DE PINCELES INSTALADAS. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026): «quiero que incorpores pinceles de otros
   softwares para instalar bibliotecas como las de Photoshop… y que le
   instales bibliotecas de pinceles». La lectura de cada formato la prueba
   tools/check_brush_import_backend.py; acá, lo que ve y hace el usuario:

   1. «Instalar biblioteca…» del Estudio (clic real) instala lo que devuelve
      el backend: sus pinceles aparecen, el primero queda elegido y el Estudio
      filtra esa biblioteca.
   2. El selector de pincel la muestra como su propio grupo.
   3. Un trazo con un pincel de la biblioteca usa SU punta (mapa de bits); uno
      con VARIANTES (punta animada de GIMP/Krita) también.
   4. Las bibliotecas NO se escriben en el almacén del navegador (5 MB): una
      biblioteca de Photoshop con cientos de puntas no entraría.
   5. Al recargar, LOW las vuelve a cargar del backend.
   6. «Quitar biblioteca» la desinstala. */
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
  const clicEn = async (sel, nombre) => {
    const p = await ev(`(()=>{ const e = ${sel}; if (!e) return null; e.scrollIntoView({ block: "nearest" }); const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
    assert.ok(p, "no está «" + nombre + "»");
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(500);
  };
  const cargar = async () => {
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!window.LOW?.drawing?.bibliotecas').catch(() => false)) break; await wait(300); }
  };
  // la «biblioteca» que devuelve el backend: dos puntas dibujadas en la página
  const PREPARAR = `(()=>{ const punta = (dibujar) => { const c = document.createElement("canvas"); c.width = c.height = 64; const x = c.getContext("2d"); x.fillStyle = "#000"; dibujar(x); return c.toDataURL("image/png"); };
    const estrella = punta((x) => { x.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 10 : 30, a = i * Math.PI / 5; x.lineTo(32 + r * Math.cos(a), 32 + r * Math.sin(a)); } x.fill(); });
    const barra = punta((x) => x.fillRect(4, 28, 56, 8));
    const lib = { id: "prueba-photoshop-1a2b3c4d", name: "Prueba de Photoshop", format: "abr", brushes: [
      { name: "Estrella importada", engine: "raster", size: 30, opacity: 1, flow: 1, spacing: .5, pressureSize: 0, tipData: estrella, sourceFormat: "abr" },
      { name: "Follaje animado", engine: "raster", size: 30, opacity: 1, flow: 1, spacing: .5, pressureSize: 0, tipData: estrella, tipVariants: [estrella, barra], angleFollowsStroke: false, sourceFormat: "gih" } ] };
    api.__pinceles[lib.id] = lib;
    api.import_brush_pack = async () => ({ libraries: [{ id: lib.id, name: lib.name, format: lib.format, count: lib.brushes.length }], errors: [] });
    return 1; })()`;
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });
    await cargar();
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); dzSetTool("brush"); return true; })()'); await wait(400);
    await ev(PREPARAR);

    // ── 1. instalar desde el Estudio, con el clic de verdad ─────────────────
    await clicEn(`[...document.querySelectorAll("button")].find(e => /^Pinceles/.test(e.textContent.trim()) && e.getBoundingClientRect().width > 0)`, "Pinceles…");
    await clicEn(`document.querySelector('.bst-search [data-a="import"]')`, "Instalar biblioteca…");
    await wait(600);
    const inst = await ev(`({ activo: DZ.brushPreset, pinceles: LOW.drawing.brushes.all().filter(p => p.libraryId === "prueba-photoshop-1a2b3c4d").map(p => p.name),
      filtro: DZ_BRUSH_STUDIO.filter, lista: [...document.querySelectorAll(".bst-brush b")].map(b => b.textContent) })`);
    assert.deepEqual(inst.pinceles, ["Estrella importada", "Follaje animado"], "la biblioteca no quedó instalada: " + JSON.stringify(inst));
    assert.equal(inst.activo, "lib-prueba-photoshop-1a2b3c4d-1", "no quedó elegido el primer pincel de la biblioteca");
    assert.deepEqual(inst.lista, ["Estrella importada", "Follaje animado"], "el Estudio no muestra la biblioteca recién instalada: " + JSON.stringify(inst));

    // ── 2. el selector de la barra la muestra como su propio grupo ──────────
    const grupo = await ev(`(()=>{ const s = document.querySelector("#toBrushPreset"); if (!s) return null; const g = [...s.querySelectorAll("optgroup")].find(o => /Prueba de Photoshop/.test(o.label)); return g ? [...g.querySelectorAll("option")].map(o => o.textContent) : []; })()`);
    assert.deepEqual(grupo, ["Estrella importada", "Follaje animado"], "el selector de pincel no muestra la biblioteca como grupo: " + JSON.stringify(grupo));

    // ── 3. el trazo usa SU punta, y las variantes también ───────────────────
    await wait(400);
    const trazos = await ev(`(()=>{ const pts = []; for (let k = 0; k <= 30; k++) pts.push([100 + k * 12, 300, .8, 0, 0, 0, k * 8]);
      const uno = (id) => { const el = dzBrushRenderElement(pts, "#123456", { brush: LOW.drawing.brushes.get(id), size: 30 }); return { bitmap: el.getAttribute("data-low-bitmap"), low: el.getAttribute("data-low"), imagenes: el.querySelectorAll("image").length }; };
      return { estrella: uno("lib-prueba-photoshop-1a2b3c4d-1"), follaje: uno("lib-prueba-photoshop-1a2b3c4d-2") }; })()`);
    assert.deepEqual(trazos.estrella, { bitmap: "1", low: "imported-brush", imagenes: 1 }, "el pincel de la biblioteca no se dibuja con su punta: " + JSON.stringify(trazos));
    assert.equal(trazos.follaje.bitmap, "1", "el pincel con variantes no se dibuja: " + JSON.stringify(trazos));

    // ── 3b. un TOQUE con un sello de la biblioteca deja UN sello (un árbol, una
    // casa); antes un trazo de un solo punto se descartaba y no quedaba nada
    await ev(`(()=>{ dzBrushSelect(LOW.drawing.brushes.get("lib-prueba-photoshop-1a2b3c4d-1")); DZ.drawW = 60; return 1; })()`);
    const H = await ev('(()=>{ const r = document.querySelector("#dzCanvas > svg").getBoundingClientRect(); return { x: r.x + r.width * .5, y: r.y + r.height * .5 }; })()');
    const antesToque = await ev(`document.querySelectorAll("#dzCanvas > svg > g[data-low-art] > *").length`);
    await mouse("mouseMoved", H.x, H.y, { pointerType: "pen", force: 0 }); await mouse("mousePressed", H.x, H.y, { buttons: 1, clickCount: 1, pointerType: "pen", force: .8 });
    await wait(40); await mouse("mouseReleased", H.x, H.y, { buttons: 0, clickCount: 1, pointerType: "pen", force: 0 }); await wait(500);
    const toque = await ev(`(()=>{ const el = [...document.querySelectorAll("#dzCanvas > svg > g[data-low-art] > *")].at(-1); return { nuevos: document.querySelectorAll("#dzCanvas > svg > g[data-low-art] > *").length - ${antesToque}, low: el && el.getAttribute("data-low"), sellos: el && +el.getAttribute("data-dab-count") }; })()`);
    assert.equal(toque.nuevos, 1, "un toque con un sello de la biblioteca no dejó el sello: " + JSON.stringify(toque));
    assert.deepEqual([toque.low, toque.sellos], ["imported-brush", 1], "el toque no dejó UN solo sello de la punta importada: " + JSON.stringify(toque));

    // ── 4. nada de la biblioteca en el almacén del navegador ────────────────
    const guardado = await ev(`(()=>{ LOW.drawing.brushes.save({ id: "custom-mio", name: "Mío", size: 5 }); return localStorage.getItem("low.brushes.v1") || ""; })()`);
    assert.ok(guardado.includes("custom-mio"), "el pincel propio no se guardó");
    assert.ok(!guardado.includes("Estrella importada") && !guardado.includes("data:image"), "la biblioteca se escribió en el almacén del navegador (" + guardado.length + " caracteres)");

    // ── 5. al recargar, vuelve del backend ──────────────────────────────────
    const libGuardada = await ev(`JSON.stringify(api.__pinceles)`);
    await cargar();
    await ev(`(()=>{ api.__pinceles = Object.assign(api.__pinceles || {}, ${libGuardada}); return LOW.drawing.bibliotecas.cargarTodas(); })()`); await wait(300);
    assert.equal(await ev(`LOW.drawing.brushes.all().filter(p => p.libraryId === "prueba-photoshop-1a2b3c4d").length`), 2, "al recargar, la biblioteca no volvió a cargarse");

    // ── 6. quitar la biblioteca desde el Estudio ─────────────────────────────
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ dzSetTool("brush"); dzBrushStudioOpen(); DZ_BRUSH_STUDIO.filter = "lib:prueba-photoshop-1a2b3c4d"; DZ_BRUSH_STUDIO.render(); return 1; })()'); await wait(400);
    await clicEn(`document.querySelector('[data-a="quitarlib"]')`, "Quitar biblioteca");
    const quitada = await ev(`({ pinceles: LOW.drawing.brushes.all().filter(p => p.libraryId).length, backend: Object.keys(api.__pinceles).length })`);
    assert.deepEqual(quitada, { pinceles: 0, backend: 0 }, "«Quitar biblioteca» no la desinstaló: " + JSON.stringify(quitada));

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    assert.deepEqual(graves.slice(0, 3), [], "hubo excepciones durante el recorrido");
    console.log("E2E bibliotecas de pinceles OK · instalar, grupo, punta propia, variantes, no ocupa el almacén, recargar y quitar");
  } finally {
    ws.close(); try { await fetch(endpoint + "/json/close/" + tab.id); } catch (_) { }
  }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
