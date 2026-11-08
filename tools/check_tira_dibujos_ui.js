/* LA TIRA DE DIBUJOS SE ACTUALIZA EN EL LUGAR (v3.57). CDP :9223 + mock :8791.

   La tira «Dibujos del nivel» se rearmaba entera —una miniatura SVG por
   dibujo— dos veces por trazo. En una sesión larga eso era ~100 ms de bloqueo
   al apoyar el lápiz (tools/check_sesion_larga.js). Ahora, si el nivel y sus
   dibujos son los mismos, se tocan sólo clases, títulos y la miniatura que
   cambió. Esto comprueba que lo rápido no quedó desactualizado:
   1. dibujar en un cuadro cambia SU miniatura y deja las otras como estaban
      (los mismos elementos, sin rearmar);
   2. Ctrl+clic en una celda la marca como elegida;
   3. un dibujo nuevo aparece (cambió la forma: se rearma);
   4. renombrar el nivel cambia el encabezado;
   5. ir a otro nivel y volver muestra los dibujos correctos. */
const endpoint = "http://127.0.0.1:9223";
const pageUrl = "http://127.0.0.1:8791/ui/index.html?mock=1";

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

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: pageUrl });
    for (let i = 0; i < 80; i++) {
      if (await ev('document.readyState==="complete" && typeof dzDocInit==="function" && !!api && !!window.LOW?.workspace?.workspaces').catch(() => false)) break;
      await w(250);
    }
    await ev(`(async()=>{ try{localStorage.clear()}catch(e){}
      await openDesign("mock.svg"); await dzDocInit(); await new Promise(r=>setTimeout(r,600));
      LOW.workspace.workspaces.activate("animation", dzWsAplicar); await new Promise(r=>setTimeout(r,400));
      const sc = DZ.doc.scene, ly = sc.layers[0], lv = sc.level(ly.levelId);
      for (let n = 1; n <= 4; n++) { if (!lv.byNumber(n)) lv.addDrawing(n, "<path d='M0 0 L" + n * 100 + " 50' stroke='#000'/>"); sc.expose(ly.id, n, n); }
      DZ.doc.layerId = ly.id; DZ.doc.goTo(1); DZ.doc.emit("level"); await new Promise(r=>setTimeout(r,300)); return true; })()`);
    const tira = `(()=>{ const items = [...document.querySelectorAll(".ls2-item")]; return items.map(c => ({ n: +c.dataset.num, sel: c.classList.contains("selected"), act: c.classList.contains("actual"), svg: (c.querySelector(".ls2-thumb") || {}).innerHTML || "" })); })()`;
    if (!(await ev(`document.querySelectorAll(".ls2-item").length`))) mal("la tira de dibujos no está en la pantalla", {});

    // 1. un dibujo cambia: su miniatura cambia, las otras son los mismos elementos
    await ev(`window.__minis = [...document.querySelectorAll(".ls2-thumb")]; true`);
    // un trazo de verdad con el lápiz en el cuadro 2 (el camino real: lienzo → documento)
    const antes2 = await ev(`(document.querySelector('.ls2-item[data-num="2"] .ls2-thumb') || {}).innerHTML || ""`);
    await ev(`(async()=>{ DZ.doc.goTo(2); await new Promise(r=>setTimeout(r,200)); dzSetTool("brush"); await new Promise(r=>setTimeout(r,150));
      const l = document.querySelector("#dzCanvas"), c = l.getBoundingClientRect();
      const p = (t,x,y) => l.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,pointerId:1,pointerType:"pen",isPrimary:true,button:t==="pointerdown"?0:-1,buttons:t==="pointerup"?0:1,clientX:x,clientY:y,pressure:.7}));
      const x = c.left + c.width * .4, y = c.top + c.height * .5; p("pointerdown", x, y); for (let i = 1; i <= 20; i++) p("pointermove", x + i * 8, y + i * 3); p("pointerup", x + 160, y + 60);
      await new Promise(r=>setTimeout(r,700)); return true; })()`);
    const t1 = await ev(tira);
    const dos = t1.find((x) => x.n === 2);
    const modelo2 = await ev(`DZ.doc.level.byNumber(2).content`);
    if (modelo2.length <= 120) mal("el trazo no llegó al documento (la prueba no dibujó)", { modelo2 });
    if (!dos || dos.svg === antes2 || !dos.svg.includes(modelo2.slice(-60))) mal("la miniatura del dibujo cambiado no se actualizó", { antes: antes2.length, ahora: dos && dos.svg.length });
    const mismas = await ev(`(()=>{ const ahora = [...document.querySelectorAll(".ls2-thumb")]; return ahora.map((m, i) => m === window.__minis[i]); })()`);
    if (mismas.filter(Boolean).length !== mismas.length - 1 || mismas[1]) mal("se rearmaron miniaturas que no cambiaron (o no se rehízo la que sí)", mismas);
    if (!t1.find((x) => x.n === 2).act) mal("la celda actual no quedó marcada", t1);

    // 2. Ctrl+clic: elegida
    await ev(`document.querySelector('.ls2-item[data-num="3"]').dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true })); true`);
    await w(200);
    if (!(await ev(tira)).find((x) => x.n === 3).sel) mal("Ctrl+clic no marcó la celda como elegida", await ev(tira));

    // 3. un dibujo nuevo aparece
    await ev(`(async()=>{ DZ.doc.goTo(5); DZ.doc.createBlankDrawing(); await new Promise(r=>setTimeout(r,300)); return true; })()`);
    const t3 = await ev(tira);
    if (t3.length !== 5) mal("el dibujo nuevo no apareció en la tira", t3.map((x) => x.n));

    // 4. renombrar el nivel
    await ev(`(async()=>{ DZ.doc.renameLevel(DZ.doc.level.id, "Cabeza"); await new Promise(r=>setTimeout(r,300)); return true; })()`);
    const cab = await ev(`(document.querySelector(".ls2-head") || {}).textContent || ""`);
    if (!/^Cabeza/.test(cab)) mal("renombrar el nivel no cambió el encabezado", cab);

    // 5. otro nivel y volver
    const otro = await ev(`(async()=>{ const sc = DZ.doc.scene; const lv = sc.addLevel("Otro"); lv.addDrawing(1, "<circle r='5'/>"); const ly = sc.addLayer(lv.id, "Otro"); sc.expose(ly.id, 1, 1);
      const vuelta = DZ.doc.layerId; DZ.doc.layerId = ly.id; DZ.doc.goTo(1); DZ.doc.emit("level"); await new Promise(r=>setTimeout(r,300));
      const enOtro = document.querySelectorAll(".ls2-item").length; DZ.doc.layerId = vuelta; DZ.doc.emit("level"); await new Promise(r=>setTimeout(r,300));
      return { enOtro, deVuelta: document.querySelectorAll(".ls2-item").length }; })()`);
    if (otro.enOtro !== 1 || otro.deVuelta !== 5) mal("al cambiar de nivel la tira no mostró sus dibujos", otro);

    const errB = errores.filter((x) => !/ResizeObserver/.test(String(x)));
    if (errB.length) mal("errores en la página", errB);
    console.log("E2E tira de dibujos en el lugar OK " + JSON.stringify({ dibujos: t3.length, otro }));
  } finally {
    try { await send("Page.close"); } catch (_) { /* ya cerrada */ }
    ws.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
