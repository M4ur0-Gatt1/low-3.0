/* CAPAS DE MAPA DE BITS. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026), por el reclamo de un usuario: «no sé si tenemos
   la opción de dibujar en bits como tienen OpenToonz o Toon Boom; quiero
   separar eso tal cual lo hacen esos programas».

   Con el mouse de verdad:
   1. «▦» al lado de «+ Capa» crea una capa de MAPA DE BITS: su nivel es
      "raster", la fila lleva ▦ y la barra dice «Mapa de bits».
   2. Un trazo de pincel en ella se vuelve PÍXELES: queda una sola imagen en la
      hoja del dibujo (no vectores), en UN paso de Ctrl+Z, guardada en el
      documento, y la otra capa (vectorial) no se toca. (La primera versión
      metía la hoja de píxeles adentro de la COPIA de la otra capa que se
      dibuja en la mesa, y lo pintado se perdía.)
   3. La GOMA borra píxeles (no la imagen entera), en un paso; Ctrl+Z los vuelve.
   4. El BALDE rellena píxeles adentro de un círculo cerrado, con el color de
      relleno, sin tapar la línea.
   5. En la capa VECTORIAL el pincel sigue dejando vectores.
   6. El tipo se guarda con la escena (toJSON → fromJSON).
   7. Capa → Nueva capa de mapa de bits también la crea. */
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
  const clic = async (sel) => { const p = await ev(`(()=>{ const e = ${sel}; if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
    assert.ok(p, "no se ve " + sel);
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 }); await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(300); };
  const recorrer = async (puntos) => {
    const [x0, y0] = puntos[0];
    await mouse("mouseMoved", x0, y0); await mouse("mousePressed", x0, y0, { buttons: 1, clickCount: 1 });
    for (const [x, y] of puntos.slice(1)) { await mouse("mouseMoved", x, y, { buttons: 1 }); await wait(10); }
    const [xf, yf] = puntos.at(-1);
    await mouse("mouseReleased", xf, yf, { buttons: 0, clickCount: 1 }); await wait(900);
  };
  const tecla = async (key, code, vk, mods = 0) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers: mods });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers: mods }); await wait(500); };
  const pantalla = (x, y) => ev(`(()=>{ const q = dzToScreen(${x}, ${y}), r = document.querySelector("#dzCanvas").getBoundingClientRect(); return [q.x + r.left, q.y + r.top]; })()`);
  // lo pintado: cuántos píxeles tienen tinta, y el color de uno
  const pixeles = (px, py) => ev(`(async()=>{ const svg = document.querySelector("#dzCanvas > svg"), img = svg.querySelector(":scope > g[data-low-art] > image[data-low-raster]");
    if (!img) return null; const im = new Image(); im.src = img.getAttribute("href"); await im.decode();
    const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; const g = c.getContext("2d"); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; let tinta = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) tinta++;
    const R = LOW.drawing.capaBitmap.RES, x = Math.round((${px} - +img.getAttribute("x")) * R), y = Math.round((${py} - +img.getAttribute("y")) * R), k = (y * c.width + x) * 4;
    return { tinta, color: [d[k], d[k + 1], d[k + 2], d[k + 3]] }; })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!LOW.drawing?.capaBitmap').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} return true; })()');
    await ev('(()=>{ window.__paginaVieja = 1; return 1; })()').catch(() => 0);   // la página vieja sigue «lista» un instante tras el reload
    await send("Page.reload", { ignoreCache: true });
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!LOW.drawing?.capaBitmap').catch(() => false)) break; await wait(300); }
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); DZ.zoom = .6; dzApplyZoom(); return true; })()'); await wait(200);

    // en la Capa 1 (vectorial) un trazo de pincel: tiene que quedar vector
    await clic(`document.querySelector('.dz-toolbtn[data-tool="brush"]')`);
    const a1 = await pantalla(300, 200), b1 = await pantalla(700, 200);
    await recorrer(Array.from({ length: 21 }, (_, i) => [a1[0] + (b1[0] - a1[0]) * i / 20, a1[1]]));
    const capa1 = await ev(`(()=>{ const svg = document.querySelector("#dzCanvas > svg"); return { vectores: svg.querySelectorAll(':scope > g[data-low-art] [data-low="brush"]').length, imagen: !!svg.querySelector(":scope > g[data-low-art] > image[data-low-raster]") }; })()`);
    assert.deepEqual(capa1, { vectores: 1, imagen: false }, "en una capa VECTORIAL el pincel no dejó un vector: " + JSON.stringify(capa1));

    // ── 1. «▦» crea una capa de mapa de bits ────────────────────────────────
    await clic(`document.querySelector(".tl2-addbits")`);
    const nueva = await ev(`({ tipo: DZ.doc.level.type, capas: DZ.doc.scene.layers.length, marca: [...document.querySelectorAll(".tl2-name.tl2-bits")].map(n => n.textContent.trim()),
      chip: !!document.querySelector("#dzToolOpts .bmp-chip"), lienzo: document.querySelector("#dzCanvas").classList.contains("capa-bitmap") })`);
    assert.equal(nueva.tipo, "raster", "«▦» no crea una capa de mapa de bits: " + JSON.stringify(nueva));
    assert.equal(nueva.capas, 2);
    assert.ok(nueva.marca.length === 1 && /▦/.test(nueva.marca[0]), "la fila de la capa de mapa de bits no lleva ▦: " + JSON.stringify(nueva));
    assert.ok(nueva.chip && nueva.lienzo, "la barra no dice que la capa es de mapa de bits: " + JSON.stringify(nueva));

    // ── 2. un círculo de pincel se vuelve píxeles ───────────────────────────
    const centro = [960, 540], radio = 150;
    const circulo = [];
    for (let i = 0; i <= 48; i++) { const t = i / 48 * Math.PI * 2 + .01; circulo.push(await pantalla(centro[0] + Math.cos(t) * radio, centro[1] + Math.sin(t) * radio)); }
    const pasos0 = await ev(`DZ.doc.history.undoStack.length`);
    await recorrer(circulo);
    const pintado = await ev(`(()=>{ const svg = document.querySelector("#dzCanvas > svg"); return {
      imagenes: svg.querySelectorAll(":scope > g[data-low-art] > image[data-low-raster]").length,
      vectores: svg.querySelectorAll(":scope > g[data-low-art] > *:not(image[data-low-raster])").length,
      pasos: DZ.doc.history.undoStack.length - ${pasos0}, enElDocumento: (DZ.doc.drawing?.content || "").includes("data-low-raster"),
      capa1: (DZ.doc.scene.drawingAt(DZ.doc.scene.layers[0].id, 1)?.content || "").includes("data-low-raster") }; })()`);
    assert.deepEqual(pintado, { imagenes: 1, vectores: 0, pasos: 1, enElDocumento: true, capa1: false }, "el trazo no se volvió píxeles en la capa de mapa de bits: " + JSON.stringify(pintado));
    const tras = await pixeles(centro[0] + radio, centro[1]);
    assert.ok(tras && tras.tinta > 500, "la hoja de píxeles quedó vacía: " + JSON.stringify(tras));

    // ── 3. la goma borra píxeles ────────────────────────────────────────────
    await clic(`document.querySelector('.dz-toolbtn[data-tool="eraser"]')`);
    assert.ok(await ev(`!!document.querySelector('#dzToolOpts .bmp-opciones [data-b="goma"]')`), "la goma de mapa de bits no muestra su tamaño");
    const g0 = await pantalla(centro[0] + radio - 60, centro[1] - 60), g1 = await pantalla(centro[0] + radio + 60, centro[1] + 60);
    const antesGoma = await pixeles(centro[0], centro[1]), pasosG = await ev(`DZ.doc.history.undoStack.length`);
    await recorrer(Array.from({ length: 15 }, (_, i) => [g0[0] + (g1[0] - g0[0]) * i / 14, g0[1] + (g1[1] - g0[1]) * i / 14]));
    const trasGoma = await pixeles(centro[0], centro[1]);
    const goma = { antes: antesGoma.tinta, despues: trasGoma && trasGoma.tinta, pasos: await ev(`DZ.doc.history.undoStack.length`) - pasosG };
    assert.ok(trasGoma && goma.despues < goma.antes && goma.despues > goma.antes * .5, "la goma no borró píxeles (o borró la imagen entera): " + JSON.stringify(goma));
    assert.equal(goma.pasos, 1, "borrar no es UN paso de historial");
    await ev(`(()=>{ document.activeElement?.blur?.(); return true; })()`);
    await tecla("z", "KeyZ", 90, 2);
    const trasUndo = await pixeles(centro[0], centro[1]);
    assert.equal(trasUndo && trasUndo.tinta, goma.antes, "Ctrl+Z no vuelve los píxeles borrados");

    // ── 4. el balde rellena adentro del círculo, sin tapar la línea ────────
    await ev(`(()=>{ DZ.fillColor = "#33B5E8"; return true; })()`);
    await clic(`document.querySelector('.dz-toolbtn[data-tool="bucket"]')`);
    const adentro = await pantalla(centro[0], centro[1]);
    await mouse("mouseMoved", adentro[0], adentro[1]); await mouse("mousePressed", adentro[0], adentro[1], { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", adentro[0], adentro[1], { buttons: 0, clickCount: 1 }); await wait(900);
    const relleno = await pixeles(centro[0], centro[1]), linea = await pixeles(centro[0] + radio, centro[1]), afuera = await pixeles(centro[0] + radio + 80, centro[1]);
    assert.deepEqual(relleno.color.slice(0, 3), [0x33, 0xB5, 0xE8], "el balde no rellenó adentro del círculo con el color de relleno: " + JSON.stringify(relleno));
    assert.ok(linea.color[0] < 100 && linea.color[3] > 200, "el relleno tapó la línea: " + JSON.stringify(linea.color));
    assert.ok(afuera.color[3] < 20, "el relleno se escapó afuera del círculo: " + JSON.stringify(afuera.color));

    // ── 6. el tipo se guarda con la escena ──────────────────────────────────
    const guardado = await ev(`(()=>{ const j = DZ.doc.toJSON(); const otra = LOW.animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(j)));
      return otra.scene.levels.map(l => l.type); })()`);
    assert.deepEqual(guardado, ["vector", "raster"], "el tipo de la capa no se guarda con la escena: " + JSON.stringify(guardado));

    // ── 7. Capa → Nueva capa de mapa de bits ────────────────────────────────
    await clic(`[...document.querySelectorAll(".dz-menu")].find(m => /^Capa/.test(m.textContent.trim()))`);
    await clic(`document.querySelector('[data-act="capa-bitmap-nueva"]')`);
    const porMenu = await ev(`({ capas: DZ.doc.scene.layers.length, tipo: DZ.doc.level.type })`);
    assert.deepEqual(porMenu, { capas: 3, tipo: "raster" }, "Capa → Nueva capa de mapa de bits no la crea: " + JSON.stringify(porMenu));

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E capas de mapa de bits OK", JSON.stringify({ pintado, goma, relleno: relleno.color }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e); process.exit(1); });
