/* EL EDITOR DE ELEMENTOS DE LA ESCENOGRAFÍA (v3.33). CDP :9223 + mock :8791.

   Pedido de Mauro: «falta el generador: que yo pueda dibujar las piezas 3D e ir
   armando el kit… tengo que poder generar cada elemento 3D y guardarlo en su
   biblioteca». Con el mouse de verdad:
   1. En una escena con cosas, «+ Nuevo elemento» → nombre y categoría →
      «Dibujarlo»: la mesa queda VACÍA para dibujar (tu escena espera afuera) y
      el autoguardado sigue guardando TU escena, no el elemento a medias.
   2. Se dibuja: una caja (tecla X, base y altura) y un trazo encima.
   3. «Guardar en la escenografía»: vuelve tu escena entera, con su Ctrl+Z, y
      el elemento queda en TU copia de la escenografía de fábrica, con su
      miniatura. La caja se guardó como VOLUMEN macizo (no como andamio).
   4. Colocarlo: un clic lo pone en el piso, con su cuerpo y su trazo.
   5. ✎ Editar el elemento: la mesa lo muestra en el origen; «Cancelar»
      vuelve a la escena sin cambiar nada. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = (process.argv[3] || "http://127.0.0.1:8791/ui/") + "estudio3d/index.html";

async function main() {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map(), errores = [];
  ws.onmessage = (event) => { const m = JSON.parse(event.data);
    if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (!m.id || !pending.has(m.id)) return; const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 60000);
    pending.set(n, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const aPantalla = (p) => ev(`(()=>{ const e = __low3d, r = e.canvasElement().getBoundingClientRect(), c = e.camera; c.updateMatrixWorld(true);
    const v = new c.position.constructor(...${JSON.stringify(p)}).project(c); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; })()`);
  const mover = (p, buttons = 0) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, buttons, button: buttons ? "left" : "none" });
  const enLienzo = async (p, m) => { const bajo = await ev(`(document.elementFromPoint(${p.x}, ${p.y}) || {}).tagName || "nada"`); if (bajo !== "CANVAS") throw Error("PRUEBA MAL ARMADA: " + JSON.stringify(m) + " cae sobre " + bajo); };
  const arrastrar = async (ma, mb, pasos = 14) => {
    const a = await aPantalla(ma), b = await aPantalla(mb); await enLienzo(a, ma); await enLienzo(b, mb);
    await mover(a); await send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= pasos; i++) { await mover({ x: a.x + (b.x - a.x) * i / pasos, y: a.y + (b.y - a.y) * i / pasos }, 1); await w(8); }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", buttons: 0, clickCount: 1 }); await w(200);
  };
  const clicMundo = async (m) => { const p = await aPantalla(m); await enLienzo(p, m); await mover(p);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 }); await w(200); };
  const clicEn = async (sel) => {
    const p = await ev(`(()=>{ const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.getClientRects().length); if (!b) return null; b.scrollIntoView({ block: "nearest" }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!p) mal("falta en pantalla: " + sel, {});
    await mover(p); await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 }); await w(300);
  };
  const tecla = async (key, code, vk, modifiers = 0) => { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers }); await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers }); await w(200); };
  const escribir = (sel, v) => ev(`(()=>{ const i = document.querySelector(${JSON.stringify(sel)}); const proto = i.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event(i.tagName === "SELECT" ? "change" : "input", { bubbles: true })); return true; })()`);
  const camara = (pos, mira) => ev(`(()=>{ const e = __low3d; e.camera.position.set(...${JSON.stringify(pos)}); e.controls.target.set(...${JSON.stringify(mira)}); e.camera.lookAt(e.controls.target); e.controls.update(); return true; })()`);
  const estado = () => ev(`({ n: __low3d.strokes.length, cajas: __low3d.strokes.filter(s => s.kind === "box").length, ed: __low3d.enEdicion(), deshacer: __low3d.historyState ? __low3d.historyState().undo : null })`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
    await ev(`try{localStorage.clear(); localStorage.setItem("low3d:guia-fondos","1")}catch(e){}; location.reload(); true`);
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d && document.readyState === 'complete'").catch(() => false)) break; await w(250); }
    await w(400);
    await ev(`__low3d.newProject(); true`);
    await camara([0, 9, 14], [0, 1, 0]); await w(200);
    // TU ESCENA: dos cajas y un trazo
    await tecla("x", "KeyX", 88);
    await arrastrar([-6, 0, 2], [-4, 0, 0]); await mover(await aPantalla([-5, 2, 1])); await clicMundo([-5, 2, 1]);
    await arrastrar([4, 0, 2], [6, 0, 0]); await mover(await aPantalla([5, 3, 1])); await clicMundo([5, 3, 1]);
    await tecla("p", "KeyP", 80);
    await arrastrar([-3, 0, 4], [3, 0, 4]);
    const escena = await estado();
    if (escena.n !== 3 || escena.cajas !== 2) mal("no se armó la escena de partida", escena);

    // ── 1. «+ Nuevo elemento» → Dibujarlo
    await ev(`__lowStore.setCurrentTool("pieza"); true`); await w(400);
    await clicEn(".biblio3d-nuevo");
    await escribir('[aria-label="Nombre del elemento"]', "Kiosco");
    await escribir('[aria-label="Categoría del elemento"]', "calle");
    await clicEn(".biblio3d-empezar");
    let st = await estado();
    if (!st.ed || st.ed.nombre !== "Kiosco" || st.n !== 0) mal("«Dibujarlo» no dejó la mesa vacía en modo edición", st);
    if (!(await ev(`!!document.querySelector(".biblio3d-editando")`))) mal("el panel no muestra que se está editando un elemento", {});

    // ── 2. dibujar el elemento: una caja y un trazo
    await camara([0, 6, 9], [0, 1, 0]); await w(200);
    await tecla("x", "KeyX", 88);
    await arrastrar([-1, 0, 1], [1, 0, -1]); await mover(await aPantalla([0, 2.5, 0])); await clicMundo([0, 2.5, 0]);
    await tecla("p", "KeyP", 80);
    await arrastrar([-1.5, 0, 2], [1.5, 0, 2]);
    st = await estado();
    if (st.n !== 2 || st.cajas !== 1) mal("en el editor no se pudo dibujar (caja + trazo)", st);
    await w(1200);                                            // el autoguardado (900 ms)
    const resguardo = await ev(`(()=>{ const a = JSON.parse(localStorage.getItem("low3d:autosave") || "null"); return a ? a.strokes.length : -1; })()`);
    if (resguardo !== 3) mal("editando un elemento, el autoguardado pisó tu escena con el elemento", { resguardo });

    // ── 3. guardar en la escenografía
    await clicEn(".biblio3d-guardar-edicion"); await w(500);
    st = await estado();
    if (st.ed || st.n !== 3 || st.cajas !== 2) mal("al guardar no volvió tu escena como estaba", st);
    const guardado = await ev(`(()=>{ const kits = JSON.parse(localStorage.getItem("low3d:kits") || "[]"); const k = kits.find(k => k.piezas.some(p => p.nombre === "Kiosco")); if (!k) return null;
      const p = k.piezas.find(p => p.nombre === "Kiosco"); return { kit: k.nombre, cat: p.categoria, items: p.items.length, macizos: p.items.filter(i => i.solid).length, cajas: p.items.filter(i => i.caja).length, tam: p.tam }; })()`);
    if (!guardado || guardado.kit !== "Color plano (mía)" || guardado.cat !== "calle") mal("el elemento no quedó en tu copia de la escenografía", guardado);
    if (guardado.items !== 2 || guardado.macizos !== 1 || guardado.cajas !== 0) mal("la caja del elemento no se guardó como volumen macizo", guardado);
    if (Math.abs(guardado.tam[1] - 2.5) > 0.3) mal("el elemento no tiene el alto que se dibujó", guardado);
    const carta = await ev(`(()=>{ const b = [...document.querySelectorAll(".biblio3d-grilla [data-pieza]")].find(b => b.textContent.trim() === "Kiosco"); return b ? { mini: !!b.querySelector("img") } : null; })()`);
    for (let i = 0; i < 20 && carta && !carta.mini; i++) { await w(200); Object.assign(carta, await ev(`(()=>{ const b = [...document.querySelectorAll(".biblio3d-grilla [data-pieza]")].find(b => b.textContent.trim() === "Kiosco"); return { mini: !!(b && b.querySelector("img")) }; })()`)); }
    if (!carta || !carta.mini) mal("el elemento nuevo no aparece en la biblioteca con su miniatura", carta);
    await tecla("z", "KeyZ", 90, 2);
    if ((await estado()).n !== 2) mal("después de guardar el elemento, el Ctrl+Z de tu escena no funciona", await estado());
    await tecla("z", "KeyZ", 90, 2 | 8);

    // ── 4. colocarlo
    await ev(`(()=>{ [...document.querySelectorAll(".biblio3d-grilla [data-pieza]")].find(b => b.textContent.trim() === "Kiosco").click(); return true; })()`); await w(200);
    await camara([0, 9, 14], [0, 1, 0]); await w(200);
    await clicMundo([0, 0, -3]);
    // apoyado = lo MÁS BAJO de lo que se ve toca el piso (v3.43: con el grosor en
    // píxeles, el caño del trazo tiene su radio y el elemento sube eso para no
    // hundirse; medir el origen del objeto ya no dice si apoya)
    const puesto = await ev(`(()=>{ const s = __low3d.strokes.filter(s => __low3d.groupNames.get(s.groupId) === "Kiosco"); let y = Infinity;
      for (const r of s) { r.object.updateMatrixWorld(true); r.object.traverse(o => { if (o.isMesh && o.geometry) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); y = Math.min(y, b.min.y); } }); }
      return { n: s.length, macizo: s.filter(r => r.solid).length, y }; })()`);
    if (puesto.n !== 2 || puesto.macizo !== 1 || Math.abs(puesto.y) > 0.02) mal("el elemento no se colocó con su cuerpo y su trazo en el piso", puesto);

    // ── 5. editar y cancelar
    const antes = (await estado()).n;
    await ev(`(()=>{ [...document.querySelectorAll(".biblio3d-carta")].find(c => c.textContent.includes("Kiosco")).querySelector(".biblio3d-editar").click(); return true; })()`); await w(400);
    st = await estado();
    if (!st.ed || st.n !== 2) mal("✎ Editar no mostró el elemento en la mesa", st);
    await clicEn(".biblio3d-editor .persp3d-boton:not(.biblio3d-guardar-edicion)"); await w(400);
    st = await estado();
    if (st.ed || st.n !== antes) mal("Cancelar no volvió a la escena sin cambios", { st, antes });

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
    console.log("E2E editor de elementos OK " + JSON.stringify({ guardado, puesto }));
  } finally {
    ws.close();
    try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  }
}

main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
