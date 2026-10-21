/* ESPEJAR LO ELEGIDO EN 2D: SE ENCUENTRA, ESPEJA EL CONJUNTO Y EL RECUADRO
   QUEDA SOBRE EL OBJETO (v3.37). CDP :9223 + mock :8791.

   Pedido de Mauro: «una función que me di cuenta que falta en LOW 2D es la de
   espejar una imagen y/o objetos».

   MEDIDO en la 3.37.0, antes del arreglo (drawing/espejar.js):
   - existía sólo como «Voltear» en el inspector: Shift+H no hacía nada, y no
     estaba en el menú Edición ni en el clic derecho de la mesa;
   - con UN objeto espejado, el recuadro de transformación se dibujaba un alto
     entero más arriba (horizontal) o más abajo (vertical): y 234 en vez de 261;
   - los tiradores del recuadro de un objeto espejado tiraban del lado opuesto;
   - con VARIOS objetos cada uno se volteaba en su lugar: el conjunto no se
     espejaba (lo de la izquierda seguía a la izquierda);
   - un objeto girado se volteaba en sus propios ejes, no en los de la hoja.

   Con el teclado y el mouse de verdad:
   1. Un trazo: clic + Shift+H. Queda en el mismo lugar, espejado; el recuadro
      y el marco lo abrazan. Ctrl+Z lo deshace en UN paso; Ctrl+Y lo rehace.
   2. El tirador derecho del recuadro (el que se VE a la derecha) estira la
      derecha y deja quieta la izquierda.
   3. Dos objetos (clic + Shift+clic) + Shift+H: se espejan alrededor del
      centro de la selección (cambian de lado). Un solo Ctrl+Z los devuelve.
   4. Un objeto girado, desde el menú Edición → Espejar vertical: se espeja en
      los ejes de la hoja y el recuadro queda centrado sobre él.
   5. Clic derecho sobre la mesa → «Espejar horizontal».
   6. Una imagen importada + Shift+V: queda en su lugar, espejada, con el
      recuadro encima; Ctrl+Z la deja como estaba.
   7. El mapa único de atajos (panels/atajos.js) tiene Shift+H y Shift+V.
   8. «Toda la capa» (Ctrl+Shift+A) + Shift+H espeja los tres dibujos de la
      capa, y UN Ctrl+Z los devuelve (registrado por separado eran dos pasos:
      el primero deshacía los otros dibujos y el de la mesa quedaba espejado). */
const assert = require("node:assert/strict");
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
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
  const clic = async ([x, y], modifiers = 0) => {
    await mouse("mouseMoved", x, y, { modifiers }); await mouse("mousePressed", x, y, { buttons: 1, modifiers });
    await mouse("mouseReleased", x, y, { buttons: 0, modifiers }); await wait(300);
  };
  const arrastrar = async (a, dx, dy) => {
    await mouse("mouseMoved", a[0], a[1]); await mouse("mousePressed", a[0], a[1], { buttons: 1 });
    for (let i = 1; i <= 10; i++) { await mouse("mouseMoved", a[0] + dx * i / 10, a[1] + dy * i / 10, { buttons: 1 }); await wait(16); }
    await mouse("mouseReleased", a[0] + dx, a[1] + dy, { buttons: 0 }); await wait(400);
  };
  // modifiers: 2 = Ctrl, 8 = Shift
  const tecla = async (letra, modifiers) => {
    const K = letra.toUpperCase(), shift = modifiers & 8, ctrl = modifiers & 2;
    const base = { key: shift ? K : letra, code: "Key" + K, windowsVirtualKeyCode: K.charCodeAt(0), modifiers };
    await send("Input.dispatchKeyEvent", { type: ctrl ? "rawKeyDown" : "keyDown", ...base, ...(ctrl ? {} : { text: base.key }) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", ...base }); await wait(400);
  };
  const soltarFoco = () => ev('(()=>{ const a = document.activeElement; if (a && a.blur) a.blur(); return 1; })()');

  /* en la página: el objeto por id, su matriz en la hoja, de la hoja a la pantalla */
  const PAG = `const svg = document.querySelector("#dzCanvas > svg"), el = (i) => svg.querySelector("#" + i);
    const enHoja = (n) => svg.getScreenCTM().inverse().multiply(n.getScreenCTM());
    const aPant = (x, y) => { const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM()); return [p.x, p.y]; };
    const R = (r) => r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
    const box = document.querySelector("#dzSelBox"), marco = document.querySelector("#dzSelMarco");
    const cajas = () => ({ box: box && !box.hidden ? R(box.getBoundingClientRect()) : null, marco: marco && !marco.hidden ? R(marco.getBoundingClientRect()) : null });`;
  const medir = (ids) => ev(`(()=>{ ${PAG}
    const objs = ${JSON.stringify(ids)}.map(i => { const n = el(i); if (!n) return null; const M = enHoja(n), b = n.getBBox();
      const c = new DOMPoint(b.x + b.width / 2, b.y + b.height / 2).matrixTransform(M);
      return { id: i, r: R(n.getBoundingClientRect()), M: [M.a, M.b, M.c, M.d, M.e, M.f], tr: n.getAttribute("transform"), centro: [c.x, c.y],
        det: M.a * M.d - M.b * M.c }; });
    return { objs, ...cajas() }; })()`);
  const abraza = (a, b, tol) => a && b && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.w - b.w) <= tol * 2 && Math.abs(a.h - b.h) <= tol * 2;
  const cerca = (a, b, tol) => Math.abs(a - b) <= tol;
  const enPantalla = (x, y) => ev(`(()=>{ ${PAG} return aPant(${x}, ${y}); })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!(window.LOW&&LOW.atajos)').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');
    // un rectángulo a la izquierda, un trazo (triángulo, NO simétrico) a la derecha y una pieza girada 30°
    const DIB = '<g data-low-art="colour"></g><g data-low-art="line">' +
      '<rect id="izq" x="150" y="250" width="250" height="200" fill="#c33"/>' +
      '<path id="der" d="M1300 250 L1600 250 L1300 550 Z" fill="#36c" stroke="#111" stroke-width="8"/>' +
      '<path id="girado" d="M700 650 L950 650 L700 850 Z" fill="#3a3" transform="rotate(30 800 750)"/></g>';
    await ev(`(()=>{ DZ.doc.writeDrawing(${JSON.stringify(DIB)}); DZ.doc.emit("frame"); dzSetTool("select"); return 1; })()`); await wait(800);
    await soltarFoco();

    // ── 1. un trazo: clic + Shift+H ──
    await clic(await enPantalla(1380, 330));
    let m = await medir(["der"]);
    assert.ok(m.box, "el clic no eligió el trazo: " + JSON.stringify(m));
    const antes = m.objs[0];
    await soltarFoco();
    await tecla("h", 8);
    m = await medir(["der"]);
    let o = m.objs[0];
    assert.ok(o.det < 0, "Shift+H no espejó el trazo elegido: " + JSON.stringify({ antes: antes.tr, ahora: o.tr }));
    assert.ok(abraza(o.r, antes.r, 1.5), "al espejarlo, el trazo se movió de lugar: " + JSON.stringify({ antes: antes.r, ahora: o.r }));
    // el ángulo recto (1300, 250), arriba a la IZQUIERDA, ahora se ve arriba a la DERECHA
    const recto = await ev(`(()=>{ ${PAG} const p = new DOMPoint(1300, 250).matrixTransform(el("der").getScreenCTM()); return [p.x, p.y]; })()`);
    assert.ok(cerca(recto[0], o.r.x + o.r.w, 4), "el ángulo recto no pasó al lado derecho: " + JSON.stringify({ recto, r: o.r }));
    assert.ok(abraza(m.box, o.r, 5), "después de espejar, el recuadro de transformación no está sobre el trazo: " + JSON.stringify({ box: m.box, obj: o.r }));
    assert.ok(abraza(m.marco, o.r, 7), "después de espejar, el marco de selección no está sobre el trazo: " + JSON.stringify({ marco: m.marco, obj: o.r }));
    await tecla("z", 2);
    assert.equal(await ev(`document.querySelector("#dzCanvas > svg #der").getAttribute("transform")`), antes.tr, "Ctrl+Z no deshizo el espejado en UN paso");
    await tecla("y", 2);
    m = await medir(["der"]);
    assert.ok(m.objs[0].det < 0, "Ctrl+Y no rehízo el espejado");

    // ── 2. el tirador que se ve a la derecha estira la derecha ──
    await clic(await enPantalla(1520, 330));
    m = await medir(["der"]);
    assert.ok(abraza(m.box, m.objs[0].r, 5), "al volver a elegir el trazo espejado, el recuadro no está sobre él: " + JSON.stringify(m));
    const tirador = await ev(`(()=>{ const hs = [...document.querySelectorAll("#dzSelBox .dz-sh")].filter(h => getComputedStyle(h).display !== "none" && !h.hidden)
      .map(h => { const r = h.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
      const b = document.querySelector("#dzSelBox").getBoundingClientRect(), cy = b.y + b.height / 2;
      return hs.filter(p => Math.abs(p[1] - cy) < 6).sort((a, b) => b[0] - a[0])[0] || null; })()`);
    assert.ok(tirador, "no hay tirador a la derecha del recuadro");
    const r0 = m.objs[0].r;
    await arrastrar(tirador, 50, 0);
    m = await medir(["der"]);
    const r1 = m.objs[0].r;
    assert.ok(cerca(r1.x, r0.x, 3) && cerca(r1.x + r1.w, r0.x + r0.w + 50, 8),
      "el tirador derecho de un objeto espejado no estira la derecha (o mueve la izquierda): " + JSON.stringify({ antes: r0, despues: r1 }));
    assert.ok(abraza(m.box, r1, 5), "después de estirar, el recuadro no está sobre el trazo: " + JSON.stringify({ box: m.box, obj: r1 }));
    await tecla("z", 2);

    // ── 3. dos objetos: se espejan como CONJUNTO ──
    await clic(await enPantalla(275, 350));
    await clic(await enPantalla(1520, 330), 8);
    m = await medir(["izq", "der"]);
    assert.equal(await ev("(DZ.multi || []).filter(n => n && n.isConnected).length"), 2, "clic + Shift+clic no eligió los dos objetos");
    const U = { x1: Math.min(...m.objs.map(x => x.r.x)), x2: Math.max(...m.objs.map(x => x.r.x + x.r.w)) };
    const [iz0, de0] = m.objs;
    await soltarFoco();
    await tecla("h", 8);
    m = await medir(["izq", "der"]);
    const [iz1, de1] = m.objs;
    const espejo = (r) => U.x1 + U.x2 - (r.x + r.w);   // dónde tiene que quedar el borde izquierdo
    assert.ok(cerca(iz1.r.x, espejo(iz0.r), 3) && cerca(de1.r.x, espejo(de0.r), 3) && cerca(iz1.r.y, iz0.r.y, 2) && cerca(de1.r.y, de0.r.y, 2),
      "con dos objetos, no se espejó el conjunto (cada uno se volteó en su lugar): " + JSON.stringify({ U, antes: [iz0.r, de0.r], despues: [iz1.r, de1.r] }));
    assert.ok(cerca(m.box.x, U.x1, 4) && cerca(m.box.x + m.box.w, U.x2, 4), "con dos objetos, el recuadro no abraza el conjunto espejado: " + JSON.stringify({ box: m.box, U }));
    await tecla("z", 2);
    m = await medir(["izq", "der"]);
    assert.ok(abraza(m.objs[0].r, iz0.r, 1.5) && abraza(m.objs[1].r, de0.r, 1.5), "un solo Ctrl+Z no devolvió los dos objetos: " + JSON.stringify(m.objs.map(x => x.r)));

    // ── 4. un objeto girado, desde el menú Edición → Espejar vertical ──
    await ev("(()=>{ dzDeselect(); return 1; })()");
    const gc = await ev(`(()=>{ ${PAG} const n = el("girado"), b = n.getBBox(); const p = new DOMPoint(b.x + b.width * 0.3, b.y + b.height * 0.3).matrixTransform(n.getScreenCTM()); return [p.x, p.y]; })()`);
    await clic(gc);
    m = await medir(["girado"]);
    const g0 = m.objs[0];
    assert.ok(m.box, "el clic no eligió la pieza girada");
    await clic(await ev(`(()=>{ const r = document.querySelector('#dzMenubar [data-menu="edicion"]').getBoundingClientRect(); return [r.x + 12, r.y + r.height / 2]; })()`));
    const item = await ev(`(()=>{ const s = document.querySelector('#dzMenubar [data-act="espejar-v"]'); if (!s) return null; const r = s.getBoundingClientRect(); return r.width ? [r.x + r.width / 2, r.y + r.height / 2] : null; })()`);
    assert.ok(item, "el menú Edición no tiene «Espejar vertical» (o no se ve al abrirlo)");
    await clic(item);
    m = await medir(["girado"]);
    const g1 = m.objs[0];
    // espejo vertical en la HOJA alrededor de su centro: M' = Fv · M → a,c,e iguales; b,d cambian de signo; f = 2·cy − f
    const [a0, b0, c0, d0, e0, f0] = g0.M, [a1, b1, c1, d1, e1, f1] = g1.M, cy = g0.centro[1];
    assert.ok(cerca(a1, a0, 1e-3) && cerca(c1, c0, 1e-3) && cerca(e1, e0, 0.05) && cerca(b1, -b0, 1e-3) && cerca(d1, -d0, 1e-3) && cerca(f1, 2 * cy - f0, 0.05),
      "la pieza girada no se espejó en los ejes de la hoja: " + JSON.stringify({ antes: g0.M, despues: g1.M, cy }));
    const bc = [m.box.x + m.box.w / 2, m.box.y + m.box.h / 2], oc = await enPantalla(g1.centro[0], g1.centro[1]);
    assert.ok(cerca(bc[0], oc[0], 3) && cerca(bc[1], oc[1], 3), "el recuadro de la pieza girada y espejada no quedó centrado sobre ella: " + JSON.stringify({ box: m.box, centro: oc }));

    // ── 5. clic derecho sobre la mesa → «Espejar horizontal» ──
    const pIzq = await enPantalla(275, 350);
    const iz2 = (await medir(["izq"])).objs[0];
    await mouse("mouseMoved", pIzq[0], pIzq[1]);
    await mouse("mousePressed", pIzq[0], pIzq[1], { button: "right", buttons: 2 });
    await mouse("mouseReleased", pIzq[0], pIzq[1], { button: "right", buttons: 0 }); await wait(400);
    const op = await ev(`(()=>{ const b = [...document.querySelectorAll(".ctx-menu .ctx-item")].find(x => /Espejar horizontal/.test(x.textContent)); if (!b) return null; const r = b.getBoundingClientRect(); return { p: [r.x + r.width / 2, r.y + r.height / 2], off: b.disabled }; })()`);
    assert.ok(op, "el clic derecho sobre la mesa no ofrece «Espejar horizontal»");
    assert.ok(!op.off, "en el clic derecho, «Espejar horizontal» está apagado con un objeto elegido");
    await clic(op.p);
    const iz3 = (await medir(["izq"])).objs[0];
    assert.ok(iz3.det < 0 && iz2.det > 0 && abraza(iz3.r, iz2.r, 1.5), "«Espejar horizontal» del clic derecho no espejó el rectángulo en su lugar: " + JSON.stringify({ antes: iz2, despues: iz3 }));

    // ── 6. una imagen importada + Shift+V ──
    await ev(`(async()=>{ const c = document.createElement("canvas"); c.width = 300; c.height = 200; const g = c.getContext("2d"); g.fillStyle = "#c33"; g.fillRect(0, 0, 300, 100); g.fillStyle = "#33c"; g.fillRect(0, 100, 300, 100);
      const data = c.toDataURL("image/png"); api.import_ref_image = async () => ({ data, name: "arriba-rojo.png" }); await dzImportImage(); return 1; })()`);
    await wait(600);
    const im0 = await ev(`(()=>{ ${PAG} const n = svg.querySelector("image"); n.id = n.id || "imagenEspejo"; return n.id; })()`);
    m = await medir([im0]);
    const i0 = m.objs[0];
    assert.ok(abraza(m.box, i0.r, 4), "al importar, el recuadro no abraza la imagen: " + JSON.stringify(m));
    await soltarFoco();
    await tecla("v", 8);
    m = await medir([im0]);
    const i1 = m.objs[0];
    assert.ok(i1.det < 0, "Shift+V no espejó la imagen importada: " + JSON.stringify({ antes: i0.tr, ahora: i1.tr }));
    assert.ok(abraza(i1.r, i0.r, 1.5), "al espejarla, la imagen se movió: " + JSON.stringify({ antes: i0.r, ahora: i1.r }));
    // el borde de ARRIBA de la imagen (y local mínima) ahora se ve ABAJO
    const arriba = await ev(`(()=>{ ${PAG} const n = el(${JSON.stringify(im0)}), b = n.getBBox(); return new DOMPoint(b.x, b.y).matrixTransform(n.getScreenCTM()).y; })()`);
    assert.ok(cerca(arriba, i1.r.y + i1.r.h, 3), "el borde de arriba de la imagen no pasó abajo: " + JSON.stringify({ arriba, r: i1.r }));
    assert.ok(abraza(m.box, i1.r, 5), "después de espejar la imagen, el recuadro de transformación no está sobre ella: " + JSON.stringify({ box: m.box, img: i1.r }));
    assert.ok(abraza(m.marco, i1.r, 7), "después de espejar la imagen, el marco de selección no está sobre ella: " + JSON.stringify({ marco: m.marco, img: i1.r }));
    await tecla("z", 2);
    assert.equal(await ev(`document.querySelector("#dzCanvas > svg #" + ${JSON.stringify(im0)}).getAttribute("transform")`), i0.tr, "Ctrl+Z no dejó la imagen como estaba");

    // ── 7. el mapa único de atajos los anuncia ──
    const mapa = await ev(`({ h: DZ.keymap.espejarh, v: DZ.keymap.espejarv })`);
    assert.deepEqual(mapa, { h: "shift+h", v: "shift+v" }, "el mapa de atajos no tiene Espejar horizontal/vertical");

    // ── 8. toda la capa (Ctrl+Shift+A) + Shift+H: se espeja en TODOS sus dibujos, y un Ctrl+Z los devuelve ──
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    const capa = (x) => '<g data-low-art="colour"></g><g data-low-art="line"><path id="t" d="M' + x + ' 250 L' + (x + 300) + ' 250 L' + x + ' 550 Z" fill="#36c"/>' +
      '<rect id="q" x="1500" y="700" width="100" height="100" fill="#c33"/></g>';
    const cuadros = await ev(`(()=>{ const D = ${JSON.stringify([capa(200), capa(400), capa(600)])}; DZ.doc.goTo(1); DZ.doc.writeDrawing(D[0]);
      for (const f of [2, 3]) { if (DZ.doc.scene.lastFrame() < f) dzFrameInsert(true); DZ.doc.goTo(f); DZ.doc.writeDrawing(D[f - 1]); }
      DZ.doc.goTo(1); DZ.doc.emit("frame"); dzSetTool("select"); return DZ.doc.scene.lastFrame(); })()`);
    assert.equal(cuadros, 3, "no se armaron los tres cuadros de la capa");
    await wait(600); await soltarFoco();
    await tecla("a", 10);
    assert.equal(await ev("(DZ.multi || []).filter(n => n && n.isConnected).length"), 2, "Ctrl+Shift+A no eligió toda la capa");
    const transformes = `(()=>{ const o = []; for (const f of [1, 2, 3]) { const d = DZ.doc.scene.drawingAt(DZ.doc.layerId, f); o.push(((d && d.content) || "").match(/transform="[^"]*"/g)); } return o; })()`;
    await soltarFoco();
    await tecla("h", 8); await wait(400);
    const tc = await ev(transformes);
    assert.ok(tc.every((t) => t && t.length === 2 && t.every((s) => /matrix\(-1 0 0 1 /.test(s))), "con «Toda la capa», Shift+H no espejó los tres dibujos: " + JSON.stringify(tc));
    await tecla("z", 2); await wait(300);
    const tz = await ev(transformes);
    assert.deepEqual(tz, [null, null, null], "con «Toda la capa», un Ctrl+Z no deshizo el espejado en todos los dibujos: " + JSON.stringify(tz));

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E espejar 2D OK", JSON.stringify({ trazo: o.tr, imagen: i1.tr }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
