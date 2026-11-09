/* MOVER VARIOS CUADROS Y CUADRO DE BARRIDO EN LA APP (v3.62). CDP :9223 + mock :8791.

   1. Animación → «Mover varios cuadros…» (con el mouse): X = 50 en los
      cuadros 1 a 9, sin atenuación: los tres dibujos de la capa se corren 50
      (medido en el cuadro exportado), cada uno una sola vez. Un Ctrl+Z vuelve.
   2. Con atenuación lineal y el cuadro actual en el 5: el dibujo del medio
      se corre entero y los de las puntas menos.
   3. Animación → «Cuadro de barrido…» en el cuadro 4 (el círculo vino de
      x=100 a x=400): la dirección medida es (300, 0) y quedan 3 copias
      DETRÁS del dibujo, corridas hacia atrás. Un Ctrl+Z las saca. */
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
  const centro = async (sel) => {
    const r = await ev(`(()=>{ const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: "center" }); const b = n.getBoundingClientRect(); return { x: b.left + Math.min(b.width / 2, 60), y: b.top + b.height / 2 }; })()`);
    if (!r) mal("no está en la pantalla: " + sel, {});
    return r;
  };
  const clic = async (sel) => { const r = await centro(sel); for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button: "left", clickCount: 1 }); await w(300); };
  /** Dónde queda, en la hoja, el elemento marcado de cada dibujo (por data-n). */
  const posiciones = `(()=>{ const sc = DZ.doc.scene, lv = DZ.doc.level, out = {};
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.setAttribute("style", "position:absolute;left:-9999px;visibility:hidden"); document.body.appendChild(svg);
    for (const d of lv.drawings) { svg.innerHTML = d.content; const el = svg.querySelector("[data-n]:not([data-barrido] *)"); if (!el) continue;
      const b = el.getBBox(), m = svg.getScreenCTM().inverse().multiply(el.getScreenCTM()); const p = new DOMPoint(b.x, b.y).matrixTransform(m); out[d.number] = Math.round(p.x); }
    svg.remove(); return out; })()`;

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: pageUrl });
    for (let i = 0; i < 80; i++) {
      if (await ev('document.readyState==="complete" && typeof dzDocInit==="function" && !!api && !!window.LOW?.animation?.variosCuadros').catch(() => false)) break;
      await w(250);
    }
    await ev(`(async()=>{ try{localStorage.clear()}catch(e){}
      await openDesign("mock.svg"); await dzDocInit(); await new Promise(r=>setTimeout(r,600));
      const sc = DZ.doc.scene, ly = sc.layers[0], lv = sc.level(ly.levelId);
      const dib = (n, x) => '<g data-low-art="colour"></g><g data-low-art="line"><circle data-n="' + n + '" cx="' + x + '" cy="300" r="20"></circle></g>';
      lv.drawings = []; lv.addDrawing(1, dib(1, 100)); lv.addDrawing(2, dib(2, 400)); lv.addDrawing(3, dib(3, 700));
      ly.cells = [1, 1, 1, 2, 2, 2, 3, 3, 3];
      DZ.doc.layerId = ly.id; DZ.doc.goTo(5); dzCanvasSet(lv.byNumber(2).content); DZ.doc.emit("cells"); DZ.doc.emit("level");
      await new Promise(r=>setTimeout(r,300)); return true; })()`);
    const p0 = await ev(posiciones);

    // 1. sin atenuación, con el mouse desde el menú
    await clic('.dz-menu[data-menu="animacion"]');
    await clic('.dz-menu[data-menu="animacion"] [data-act="mover-varios"]');
    if (!(await ev(`!!document.querySelector("#vcOk")`))) mal("Animación → Mover varios cuadros no abrió el diálogo", {});
    await ev(`(()=>{ document.querySelector("#vcDesde").value = "1"; document.querySelector("#vcHasta").value = "9"; document.querySelector("#vcDx").value = "50"; return true; })()`);
    await clic("#vcOk");
    const p1 = await ev(posiciones);
    if (![1, 2, 3].every((n) => p1[n] - p0[n] === 50)) mal("no se corrieron los tres dibujos 50 (cada uno una vez)", { p0, p1 });
    await ev(`(async()=>{ dzUndo(); await new Promise(r=>setTimeout(r,300)); return true; })()`);
    const pu = await ev(posiciones);
    if (JSON.stringify(pu) !== JSON.stringify(p0)) mal("un Ctrl+Z no los devolvió", { p0, pu });

    // 2. atenuación lineal, centro en el 5
    await ev(`(()=>{ LOW.animation.variosCuadros.moverVarios({ desde: 1, hasta: 9, dx: 100, curva: "lineal" }); return true; })()`);
    const p2 = await ev(posiciones);
    const d = [1, 2, 3].map((n) => p2[n] - p0[n]);
    if (d[1] !== 100 || !(d[0] > 0 && d[0] < 100) || !(d[2] > 0 && d[2] < 100)) mal("con atenuación, el del medio no se movió entero o los de las puntas no menos", { d });
    await ev(`(async()=>{ dzUndo(); await new Promise(r=>setTimeout(r,300)); return true; })()`);

    // 3. el barrido en el cuadro 4
    await ev(`(async()=>{ DZ.doc.goTo(4); dzCanvasSet(DZ.doc.drawing.content); await new Promise(r=>setTimeout(r,200)); return true; })()`);
    await clic('.dz-menu[data-menu="animacion"]');
    await clic('.dz-menu[data-menu="animacion"] [data-act="barrido"]');
    const dir = await ev(`({ dx: +document.querySelector("#smDx").value, dy: +document.querySelector("#smDy").value })`);
    if (dir.dx !== 300 || dir.dy !== 0) mal("la dirección del barrido no es la del movimiento (300, 0)", dir);
    await clic("#smOk");
    const sm = await ev(`(()=>{ const c = DZ.doc.drawing.content; const g = document.createElement("div"); g.innerHTML = "<svg>" + c + "</svg>";
      const linea = g.querySelector('[data-low-art="line"]'); const hijos = [...linea.children];
      return { copias: hijos.filter(h => h.hasAttribute("data-barrido")).length, ultimoEsElDibujo: !hijos[hijos.length - 1].hasAttribute("data-barrido"),
        t: hijos[0].getAttribute("transform"), ids: g.querySelectorAll("[data-barrido] [id]").length }; })()`);
    if (sm.copias !== 3 || !sm.ultimoEsElDibujo || !/^translate\(-\d/.test(sm.t || "") || sm.ids) mal("el barrido no dejó 3 copias detrás, corridas hacia atrás y sin ids repetidos", sm);
    await ev(`(async()=>{ dzUndo(); await new Promise(r=>setTimeout(r,300)); return true; })()`);
    if (/data-barrido/.test(await ev(`DZ.doc.drawing.content`))) mal("un Ctrl+Z no sacó el barrido", {});

    const errB = errores.filter((x) => !/ResizeObserver/.test(String(x)));
    if (errB.length) mal("errores en la página", errB);
    console.log("E2E varios cuadros y barrido OK " + JSON.stringify({ atenuacion: d, direccion: dir, copias: sm.copias }));
  } finally {
    try { await send("Page.close"); } catch (_) { /* ya cerrada */ }
    ws.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
