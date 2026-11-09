/* INTERCALAR TODA LA SECUENCIA EN LA APP (v3.57). CDP :9223 + mock :8791.

   1. Animación → «Intercalar toda la secuencia…» con el mouse de verdad abre
      el diálogo, que cuenta cuántos dibujos va a crear.
   2. Con dos claves (cuadro 1 y cuadro 7, sostenidas) y «en unos», nacen 5
      intermedios en los cuadros 2 a 6; las claves siguen en 1 y 7 y la escena
      no se alarga (el timing no cambió).
   3. Los intermedios quedan EN EL MEDIO y en orden: el círculo va de x=100 a
      x=700 pasando por posiciones crecientes.
   4. Un solo Ctrl+Z vuelve todo: celdas y dibujos (no quedan huérfanos). */
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
  const clic = async (sel) => {
    const r = await ev(`(()=>{ const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: "center" }); const b = n.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (!r) mal("no está en la pantalla: " + sel, {});
    for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button: "left", clickCount: 1 });
    await w(300);
  };

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: pageUrl });
    for (let i = 0; i < 80; i++) {
      if (await ev('document.readyState==="complete" && typeof dzDocInit==="function" && typeof dzTweenBuild==="function" && !!api').catch(() => false)) break;
      await w(250);
    }
    const estado = `(()=>{ const sc = DZ.doc.scene, ly = sc.layer(window.__capa), lv = sc.level(ly.levelId);
      const cx = (n) => { const d = lv.byNumber(n); const m = d && /cx="([\\d.]+)"/.exec(d.content); return m ? +(+m[1]).toFixed(1) : null; };
      return { cells: ly.cells.slice(0, 8), dibujos: lv.drawings.length, ultimo: sc.lastFrame(), cx: ly.cells.slice(0, 7).map(cx) }; })()`;
    await ev(`(async()=>{ try{localStorage.clear()}catch(e){}
      await openDesign("mock.svg"); await dzDocInit(); await new Promise(r=>setTimeout(r,600));
      const sc = DZ.doc.scene, ly = sc.layers[0], lv = sc.level(ly.levelId);
      lv.drawings = [];
      // con la estructura que deja el lienzo (grupos de color y línea), como dos
      // dibujos hechos a mano: el emparejador del morph compara la misma forma
      const dib = (x) => "<g data-low-art=\\"colour\\"></g><g data-low-art=\\"line\\"><circle cx=\\"" + x + "\\" cy=\\"300\\" r=\\"40\\" fill=\\"#f0450e\\"></circle></g>";
      lv.addDrawing(1, dib(100));
      lv.addDrawing(2, dib(700));
      ly.cells = [1, 1, 1, 1, 1, 1, 2];
      window.__capa = ly.id; DZ.doc.layerId = ly.id; DZ.doc.goTo(1); DZ.doc.emit("level"); DZ.doc.emit("cells");
      // el lienzo tiene que mostrar el dibujo 1 que se armó por código: si no,
      // al volcar el lienzo (lo primero que hace intercalar) pisa el dibujo 1
      if (typeof dzCanvasSet === "function") dzCanvasSet(lv.byNumber(1).content);
      await new Promise(r=>setTimeout(r,300)); return true; })()`);
    const antes = await ev(estado);

    // 1. desde el menú, con el mouse
    await clic('.dz-menu[data-menu="animacion"]');
    await clic('.dz-menu[data-menu="animacion"] [data-act="intercalar-secuencia"]');
    if (!(await ev(`!!document.querySelector("#isGo")`))) mal("Animación → Intercalar toda la secuencia no abrió el diálogo", {});
    await ev(`(()=>{ const s = document.querySelector("#isPaso"); s.value = "1"; s.dispatchEvent(new Event("input")); const c = document.querySelector("#isCurva"); c.value = "lineal"; return true; })()`);
    const cuenta = await ev(`document.querySelector("#isCuenta").textContent`);
    if (!/5 dibujos/.test(cuenta)) mal("el diálogo no cuenta los 5 intermedios", { cuenta });
    await clic("#isGo");
    await w(400);

    // 2. el timing no cambió
    const despues = await ev(estado);
    if (despues.cells[0] !== 1 || despues.cells[6] !== 2) mal("las claves se movieron", despues.cells);
    if (despues.ultimo !== antes.ultimo) mal("la escena cambió de largo (el timing se movió)", { antes: antes.ultimo, despues: despues.ultimo });
    if (new Set(despues.cells.slice(1, 6)).size !== 5 || despues.cells.slice(1, 6).some((c) => c === 1 || c === 2)) mal("no nacieron 5 intermedios distintos en los cuadros 2 a 6", despues.cells);
    if (despues.dibujos !== antes.dibujos + 5) mal("no se crearon 5 dibujos", { antes: antes.dibujos, despues: despues.dibujos });

    // 3. en el medio y en orden (lineal: 200, 300, 400, 500, 600)
    const xs = despues.cx;
    if (!xs.every((x, i) => i === 0 || x > xs[i - 1])) mal("los intermedios no avanzan en orden", xs);
    if (Math.abs(xs[3] - 400) > 2) mal("con curva lineal, el del medio no está en el medio", xs);

    // 4. un solo Ctrl+Z
    await ev(`dzUndo(); new Promise(r => setTimeout(() => r(1), 300))`);
    const vuelta = await ev(estado);
    if (JSON.stringify(vuelta.cells) !== JSON.stringify(antes.cells) || vuelta.dibujos !== antes.dibujos) mal("un Ctrl+Z no volvió todo (celdas y dibujos)", { antes, vuelta });

    const errB = errores.filter((x) => !/ResizeObserver/.test(String(x)));
    if (errB.length) mal("errores en la página", errB);
    console.log("E2E intercalar la secuencia OK " + JSON.stringify({ cuenta, xs }));
  } finally {
    try { await send("Page.close"); } catch (_) { /* ya cerrada */ }
    ws.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
