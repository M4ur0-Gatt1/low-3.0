/* MÁSCARA DE RECORTE Y TONO/LUZ, MEDIDOS EN PÍXELES. CDP :9223 + mock :8791.

   Fase 6 (composición), pedido de Mauro (oct-2026): «empezá con la máscara de
   recorte y tono/luz» —el equivalente del Cutter y del Tone/Highlight de
   Harmony—. No alcanza con que el modelo diga `clip: true`: se mide el color
   de los píxeles, en la MESA (captura de pantalla) y en el EXPORT (el SVG del
   cuadro rasterizado), y tienen que dar lo mismo.

   Escena: la Capa 1 (la base) es un círculo rojo en el centro.
   1. Una capa con un rectángulo azul que tapa TODA la hoja, recortada con la
      base: el azul se ve DENTRO del círculo y NO afuera. Igual con la capa
      recortada como activa (va por la hoja de estilos) y como copia.
   2. «＋ Sombra encima» (el botón del panel, clic real): una capa de sombra
      con un rectángulo sobre la mitad derecha. Adentro del círculo, a la
      derecha, el rojo se OSCURECE y no se ve el verde del matte; a la
      izquierda el rojo queda igual; afuera del círculo no se oscurece nada.
   3. Pasada a LUZ, la mitad derecha se ACLARA.
   4. Las definiciones de la mesa no se guardan dentro del dibujo, y Ctrl+Z
      deshace la capa de sombra entera. */
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
  const clic = async (p) => { await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(350); };
  const centro = (sel) => ev(`(()=>{ const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: "nearest" });
    const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  // puntos de la escena (unidades del dibujo)
  const P = { adentroIzq: [800, 540], adentroDer: [1120, 540], afueraDer: [1600, 120], afueraIzq: [200, 950] };
  /** Colores del EXPORT: el SVG del cuadro, rasterizado. */
  const export_ = () => ev(`(async()=>{ const t = dzCuadroSvgTexto(DZ.doc.frame); const img = new Image();
    const u = URL.createObjectURL(new Blob([t], { type: "image/svg+xml" }));
    await new Promise((r, j) => { img.onload = r; img.onerror = () => j(Error("el SVG del cuadro no se puede rasterizar")); img.src = u; });
    const c = document.createElement("canvas"); c.width = 1920; c.height = 1080; const x = c.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, 1920, 1080); x.drawImage(img, 0, 0);
    const P = ${JSON.stringify(P)}; const o = {};
    for (const k in P) o[k] = [...x.getImageData(P[k][0], P[k][1], 1, 1).data].slice(0, 3);
    return o; })()`);
  /** Colores de la MESA: captura de pantalla, leída en la página. */
  const mesa = async () => {
    await ev(`(()=>{ document.querySelectorAll(".dz-capa-props").forEach(n => n.remove()); return 1; })()`);
    await wait(250);
    const shot = await send("Page.captureScreenshot", { format: "png" });
    return ev(`(async()=>{ const img = new Image(); await new Promise((r) => { img.onload = r; img.src = "data:image/png;base64,${shot.data}"; });
      const c = document.createElement("canvas"); c.width = img.width; c.height = img.height; const x = c.getContext("2d"); x.drawImage(img, 0, 0);
      const svg = document.querySelector("#dzCanvas > svg"), m = svg.getScreenCTM(), pt = svg.createSVGPoint();
      const P = ${JSON.stringify(P)}; const o = {};
      for (const k in P) { pt.x = P[k][0]; pt.y = P[k][1]; const q = pt.matrixTransform(m);
        o[k] = [...x.getImageData(Math.round(q.x), Math.round(q.y), 1, 1).data].slice(0, 3); }
      return o; })()`);
  };
  const ROJO = [224, 32, 32];
  const cerca = (a, b, tol = 24) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
  const luma = (c) => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  const esAzul = (c) => c[2] > 150 && c[0] < 90;
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!window.LOW?.workspace?.workspaces').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');
    // Capa 1: círculo rojo (la base) · Capa 2: rectángulo azul que tapa la hoja.
    // Se escribe en la capa ACTIVA y se repinta entre paso y paso, como un trazo
    // real: escribir en el modelo con el lienzo mostrando otra capa hace que el
    // guardado del lienzo pise el dibujo.
    const ART = (forma) => '<g data-low-art="colour">' + forma + '</g><g data-low-art="line"></g>';
    const escribir = async (forma) => { await ev(`(()=>{ DZ.doc.writeDrawing(${JSON.stringify(ART(forma))}); DZ.doc.emit("frame"); return 1; })()`); await wait(500); };
    await wait(600);
    await escribir('<circle cx="960" cy="540" r="300" fill="rgb(224,32,32)"/>');
    await ev(`(()=>{ DZ.doc.addLayer("Azul"); DZ.doc.emit("frame"); return 1; })()`); await wait(600);
    await escribir('<rect x="0" y="0" width="1920" height="1080" fill="rgb(32,64,224)"/>');
    await ev(`(()=>{ const d = DZ.doc; d.selectLayer(d.scene.layers[0].id); d.goTo(1); d.history.clear(); d.emit("layers"); d.emit("frame"); return 1; })()`);
    await wait(900);
    const sinRecorte = await export_();
    assert.ok(esAzul(sinRecorte.afueraDer), "la escena de prueba no es la esperada (sin recorte, el azul tapa todo): " + JSON.stringify(sinRecorte));

    // ── 1. recortar el azul con la base, con el clic real en el panel ──────
    await ev(`(()=>{ DZ.doc.selectLayer(DZ.doc.scene.layers[1].id); DZ.doc.emit("frame"); return 1; })()`); await wait(500);
    const props = await centro(`.tl2-row .tl2-props[aria-label]`);
    const filaAzul = await ev(`(()=>{ const id = DZ.doc.scene.layers[1].id; const b = [...document.querySelectorAll(".tl2-props")].find(x => x.closest(".tl2-row")?.querySelector('[data-layer-id="' + id + '"]'));
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    assert.ok(filaAzul || props, "no está el botón de propiedades de la capa");
    await clic(filaAzul || props);
    const caja = await centro(`.dz-capa-props input[data-capa="recorte"]`);
    assert.ok(caja, "el panel de la capa no tiene «Recortar con la de abajo»");
    await clic(caja);
    assert.equal(await ev(`DZ.doc.scene.layers[1].clip`), true, "el clic en «Recortar» no recortó la capa");
    for (const [como, activa] of [["la recortada ACTIVA", 1], ["la recortada como COPIA", 0]]) {
      await ev(`(()=>{ DZ.doc.selectLayer(DZ.doc.scene.layers[${activa}].id); DZ.doc.emit("frame"); return 1; })()`); await wait(700);
      for (const [donde, c] of [["mesa", await mesa()], ["export", await export_()]]) {
        assert.ok(esAzul(c.adentroIzq) && esAzul(c.adentroDer), donde + " (" + como + "): el azul recortado no se ve DENTRO de la base: " + JSON.stringify(c));
        assert.ok(!esAzul(c.afueraDer) && !esAzul(c.afueraIzq), donde + " (" + como + "): el azul se ve AFUERA de la base, no se recortó: " + JSON.stringify(c));
      }
    }
    assert.equal(await ev(`/dzRecorte|dzTono/.test(dzCanvasInner())`), false, "las definiciones de la mesa se guardan dentro del dibujo");

    // ── 2. «＋ Sombra encima» desde el panel de la base ──────────────────────
    await ev(`(()=>{ const d = DZ.doc; d.setLayerProperty(d.scene.layers[1].id, "visible", false); d.selectLayer(d.scene.layers[0].id); d.emit("frame"); return 1; })()`); await wait(600);
    const h0 = await ev(`DZ.doc.history.undoStack.length`), estado0 = await ev(`JSON.stringify(DZ.doc.scene.layers.map(l => l.id))`);
    const propsBase = await ev(`(()=>{ const id = DZ.doc.scene.layers[0].id; const b = [...document.querySelectorAll(".tl2-props")].find(x => x.closest(".tl2-row")?.querySelector('[data-layer-id="' + id + '"]'));
      if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    assert.ok(propsBase, "no está el botón de propiedades de la Capa 1");
    await clic(propsBase);
    const botonSombra = await centro(`.dz-capa-props button[data-capa="nueva-sombra"]`);
    assert.ok(botonSombra, "el panel no tiene «＋ Sombra encima»");
    await clic(botonSombra);
    const nueva = await ev(`(()=>{ const L = DZ.doc.scene.layers; return { n: L.length, i: L.findIndex(l => l.id === DZ.doc.layerId), clip: DZ.doc.layer.clip, tono: DZ.doc.layer.tone && DZ.doc.layer.tone.kind }; })()`);
    // va encima de la base Y de las que ya la recortan (el azul, oculto): el apilado recortado sigue junto
    assert.deepEqual([nueva.i, nueva.clip, nueva.tono], [2, true, "sombra"], "la capa de sombra no quedó encima del apilado de la base, recortada y con tono: " + JSON.stringify(nueva));
    assert.equal(await ev(`LOW.animation.recorte.baseDeRecorte(DZ.doc.scene.layers, 2)`), 0, "la capa de sombra no se recorta con la Capa 1");
    // el matte: un rectángulo verde sobre la mitad derecha de la hoja (se dibuja en la capa activa)
    await wait(500);
    await escribir('<rect x="960" y="0" width="960" height="1080" fill="rgb(0,255,0)"/>');
    for (const [donde, c] of [["mesa", await mesa()], ["export", await export_()]]) {
      assert.ok(cerca(c.adentroIzq, ROJO), donde + ": la sombra tocó la mitad IZQUIERDA (no tiene matte ahí): " + JSON.stringify(c));
      assert.ok(luma(c.adentroDer) < luma(ROJO) - 12 && c.adentroDer[1] < 60, donde + ": la mitad derecha del personaje no se oscureció (o se ve el verde del matte): " + JSON.stringify(c));
      assert.ok(luma(c.afueraDer) > 235, donde + ": la sombra se ve AFUERA del personaje: no se recortó: " + JSON.stringify(c));
    }

    // ── 3. pasarla a LUZ ────────────────────────────────────────────────────
    await ev(`(()=>{ const d = DZ.doc; d.setLayerProperty(d.layerId, "tone", { kind: "luz" }); d.emit("frame"); return 1; })()`); await wait(700);
    for (const [donde, c] of [["mesa", await mesa()], ["export", await export_()]]) {
      assert.ok(luma(c.adentroDer) > luma(ROJO) + 12, donde + ": la luz no aclaró la mitad derecha: " + JSON.stringify(c));
      assert.ok(luma(c.afueraDer) > 235 && cerca(c.adentroIzq, ROJO), donde + ": la luz se salió del personaje: " + JSON.stringify(c));
    }

    // ── 4. Ctrl+Z vuelve atrás la luz, el dibujo y la capa de sombra ─────────
    for (let i = 0; i < 6 && (await ev(`DZ.doc.history.undoStack.length`)) > h0; i++) {
      await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "z", code: "KeyZ", modifiers: 2, windowsVirtualKeyCode: 90 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", modifiers: 2, windowsVirtualKeyCode: 90 }); await wait(300);
    }
    assert.equal(await ev(`JSON.stringify(DZ.doc.scene.layers.map(l => l.id))`), estado0, "deshacer no se llevó la capa de sombra");

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    assert.deepEqual(graves.slice(0, 3), [], "hubo excepciones durante el recorrido");
    console.log("E2E recorte y tono/luz OK · medido en la mesa y en el export");
  } finally {
    ws.close(); try { await fetch(endpoint + "/json/close/" + tab.id); } catch (_) { }
  }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
