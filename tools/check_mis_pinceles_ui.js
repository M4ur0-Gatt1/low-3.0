/* MIS PINCELES: LA BIBLIOTECA PROPIA. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026, LOW 3.17): «tener la posibilidad de generar
   pinceles propios en la biblioteca local de LOW».

   Hasta la 3.17 el Estudio sólo duplicaba un pincel al almacén del navegador
   (sin archivo, sin exportar) y lo retocado de una biblioteca se perdía al
   cerrar. Con el ratón de verdad, en el Estudio:
   1. Un pincel propio VIEJO del almacén del navegador se muda a «Mis
      pinceles» al arrancar (y deja el almacén).
   2. «Nuevo pincel» crea uno en Mis pinceles y lo guarda en el archivo.
   3. Retocar «Tinta limpia» crea «Tinta limpia · personalizado» en Mis
      pinceles; el de fábrica no cambia.
   4. «Punta desde la selección» con una estrella negra elegida en la mesa:
      pincel nuevo con punta, y se dibuja con él.
   5. «Punta desde imagen…» con un PNG: pincel nuevo con esa punta.
   6. Renombrar y Borrar (con su ventana).
   7. Exportar → un .lowbrush con todos los propios.
   8. Recargar: siguen ahí, con los MISMOS ids. */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const clicXY = async ([x, y]) => { await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y, { buttons: 1, clickCount: 1 }); await wait(40); await mouse("mouseReleased", x, y, { buttons: 0, clickCount: 1 }); await wait(350); };
  const clicEl = async (sel) => {
    const c = await ev(`(()=>{ const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: "nearest" }); const r = e.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; })()`);
    assert.ok(c, "no se ve: " + sel); await clicXY(c);
  };
  const P = (x, y) => ev(`(()=>{ const q = dzToScreen(${x}, ${y}), r = document.querySelector("#dzCanvas").getBoundingClientRect(); return [q.x + r.left, q.y + r.top]; })()`);
  const mios = () => ev(`LOW.drawing.misPinceles.mios().map(p => ({ id: p.id, name: p.name, tip: !!p.tipData }))`);
  const guardados = () => ev(`(api.__pinceles["mis-pinceles"] || { brushes: [] }).brushes.map(p => p.name)`);
  const cargar = async (marca) => {
    for (let i = 0; i < 120; i++) { if (await ev(`${marca ? "!window.__paginaVieja&&" : ""}document.readyState==="complete"&&typeof dzMenuAction==="function"`).catch(() => false)) break; await wait(300); }
    await wait(1200);
  };
  /** ¿la punta tiene tinta? cuenta píxeles con alfa en el PNG */
  const tinta = (pid) => ev(`(async()=>{ const p = LOW.drawing.brushes.get(${JSON.stringify(pid)}); if (!p || !p.tipData) return 0;
    const im = new Image(); await new Promise(r => { im.onload = r; im.src = p.tipData; }); const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
    const x = c.getContext("2d"); x.drawImage(im, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 64) n++; return n; })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    await cargar(false);
    // un pincel propio de las versiones anteriores, en el almacén del navegador
    await ev(`(()=>{ try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem("low.workspace.active", "drawing");
      localStorage.setItem("low.brushes.v1", JSON.stringify([{ id: "custom-viejo", name: "Mi tinta de antes", engine: "vector", size: 9, custom: true }])); } catch (e) {} window.__paginaVieja = 1; return 1; })()`);
    await send("Page.reload"); await cargar(true);

    // 1. la mudanza
    let m = await mios();
    assert.ok(m.some((p) => p.id === "custom-viejo" && p.name === "Mi tinta de antes"), "el pincel propio viejo no se mudó a Mis pinceles: " + JSON.stringify(m));
    assert.deepEqual(await guardados(), ["Mi tinta de antes"], "la mudanza no quedó guardada en el archivo");
    assert.equal(await ev(`JSON.parse(localStorage.getItem("low.brushes.v1") || "[]").length`), 0, "el pincel viejo sigue en el almacén del navegador");

    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev(`(()=>{ if (typeof closeL3d === "function") closeL3d();
      dzCanvasSet('<g data-low-art="colour"></g><g data-low-art="line"><path id="estrella" d="M 400 300 L 430 390 L 520 390 L 448 445 L 475 535 L 400 480 L 325 535 L 352 445 L 280 390 L 370 390 Z" fill="#000" stroke="none"/></g>');
      dzDocCommit(); DZ.zoom = .5; DZ.panX = 0; DZ.panY = 0; dzApplyZoom(); dzSetTool("select"); dzDeselect(); return 1; })()`);
    await wait(400);
    await ev("dzBrushStudioOpen(), 1"); await wait(500);
    assert.ok(await ev(`!!document.querySelector(".mp-barra")`), "el Estudio no tiene la barra de Mis pinceles");

    // 2. Nuevo pincel
    await clicEl('[data-mp="nuevo"]'); await wait(700);
    m = await mios();
    const nuevo = m.find((p) => /^Pincel nuevo/.test(p.name));
    assert.ok(nuevo, "Nuevo pincel no creó nada en Mis pinceles: " + JSON.stringify(m));
    assert.ok((await guardados()).includes(nuevo.name), "el pincel nuevo no se guardó en el archivo");

    // 3. retocar uno de fábrica
    const tamFabrica = await ev(`LOW.drawing.brushes.get("clean-ink").size`);
    await clicEl('nav [data-filter="all"]');   // después de «Nuevo» el Estudio muestra Mis pinceles: volver a Todos
    await clicEl('.bst-brush[data-id="clean-ink"]');
    await ev(`(()=>{ const i = document.querySelector('.bst-controls input[data-p="size"]'); i.value = 33; i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); return 1; })()`);
    await wait(700);
    m = await mios();
    const perso = m.find((p) => p.name === "Tinta limpia · personalizado");
    assert.ok(perso, "retocar Tinta limpia no la copió a Mis pinceles: " + JSON.stringify(m));
    assert.equal(await ev(`LOW.drawing.brushes.get(${JSON.stringify(perso.id)}).size`), 33, "la copia no tiene el tamaño nuevo");
    assert.equal(await ev(`LOW.drawing.brushes.get("clean-ink").size`), tamFabrica, "se modificó el pincel de fábrica");

    // 4. punta desde la selección: elegir la estrella con la flecha y tocar el botón
    await ev(`(()=>{ dzSetTool("select"); return 1 })()`);
    await clicXY(await P(400, 420));
    assert.equal(await ev("DZ.sel && DZ.sel.id"), "estrella", "no se eligió la estrella");
    await clicEl('[data-mp="seleccion"]'); await wait(900);
    m = await mios();
    const deDibujo = m.find((p) => /^Punta propia/.test(p.name) && p.tip);
    assert.ok(deDibujo, "Punta desde la selección no creó un pincel con punta: " + JSON.stringify(m));
    assert.ok(await tinta(deDibujo.id) > 200, "la punta hecha con la estrella está vacía");
    // dibujar con ese pincel
    const antes = await ev(`document.querySelectorAll("#dzCanvas > svg [data-low-art] > *").length`);
    await ev(`(()=>{ const p = LOW.drawing.brushes.get(${JSON.stringify(deDibujo.id)}); dzBrushSelect(p); dzSetTool("brush"); return 1 })()`);
    const a = await P(700, 700), b = await P(1300, 760);
    await mouse("mouseMoved", a[0], a[1]); await mouse("mousePressed", a[0], a[1], { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 16; i++) { await mouse("mouseMoved", a[0] + (b[0] - a[0]) * i / 16, a[1] + (b[1] - a[1]) * i / 16, { buttons: 1 }); await wait(20); }
    await mouse("mouseReleased", b[0], b[1], { buttons: 0, clickCount: 1 }); await wait(700);
    assert.ok(await ev(`document.querySelectorAll("#dzCanvas > svg [data-low-art] > *").length`) > antes, "no se pudo dibujar con el pincel de punta propia");

    // 5. punta desde imagen: un PNG con un círculo negro sobre blanco
    await ev(`(()=>{ const c = document.createElement("canvas"); c.width = c.height = 120; const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, 120, 120); x.fillStyle = "#000"; x.beginPath(); x.arc(60, 60, 40, 0, 7); x.fill();
      window.__mockImagen = { data: c.toDataURL("image/png").split(",")[1], mime: "image/png", name: "circulo.png" }; return 1; })()`);
    await ev("dzBrushStudioOpen(), 1"); await wait(400);
    await clicEl('[data-mp="imagen"]'); await wait(900);
    m = await mios();
    const deImagen = m.find((p) => p.name === "circulo" && p.tip);
    assert.ok(deImagen, "Punta desde imagen no creó el pincel «circulo»: " + JSON.stringify(m));
    const px = await tinta(deImagen.id);
    assert.ok(px > 1500, "la punta del círculo no tiene la tinta esperada: " + px);

    // 6. renombrar y borrar (el elegido es «circulo»)
    await clicEl('[data-mp="renombrar"]');
    await ev(`(()=>{ const i = document.getElementById("mpNombre"); i.value = "Mi círculo"; return 1; })()`);
    await clicEl("#mpOk"); await wait(600);
    m = await mios();
    assert.ok(m.some((p) => p.id === deImagen.id && p.name === "Mi círculo"), "renombrar no cambió el nombre: " + JSON.stringify(m));
    await ev(`(()=>{ DZ_BRUSH_STUDIO.selected = ${JSON.stringify(nuevo.id)}; DZ_BRUSH_STUDIO.render(); return 1; })()`);
    await clicEl('[data-mp="borrar"]');
    await clicEl("#mpOk"); await wait(700);
    m = await mios();
    assert.ok(!m.some((p) => p.id === nuevo.id), "Borrar no sacó el pincel: " + JSON.stringify(m));
    assert.ok(!(await guardados()).includes(nuevo.name), "el pincel borrado sigue en el archivo");

    // 7. exportar (con el filtro de Mis pinceles)
    await clicEl('nav [data-mp="filtro"]');
    await clicEl('[data-mp="exportar"]'); await wait(600);
    const exportada = await ev(`(api.__exportada || { brushes: [] }).brushes.map(p => p.name).sort()`);
    assert.deepEqual(exportada, m.map((p) => p.name).sort(), "lo exportado no son los pinceles propios");

    // 8. recargar: siguen, con los mismos ids
    const ids = m.map((p) => p.id).sort();
    await ev("window.__paginaVieja = 1"); await send("Page.reload"); await cargar(true);
    const despues = (await mios()).map((p) => p.id).sort();
    assert.deepEqual(despues, ids, "al recargar, Mis pinceles cambió");

    assert.deepEqual(errores, [], "errores de JS: " + errores.join(" | "));
    console.log("OK mis pinceles:", JSON.stringify((await mios()).map((p) => p.name)));
  } finally {
    ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
