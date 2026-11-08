/* MODIFICADORES Y EFECTOS DE CAPA EN LA APP (v3.60). CDP :9223 + mock :8791.

   1. Clic derecho en la capa «Ciclo» → «Modificadores y efectos…» → agregar
      «Tiempo», modo Bucle de 1 a 2 → Aplicar (un Ctrl+Z).
   2. En el cuadro 3, la mesa y el export muestran el dibujo 1 de «Ciclo»
      (el bucle), y su dibujo 3 sigue intacto en el nivel.
   3. Temblor + sombra: en la mesa la capa lleva su <filter> (con
      desplazamiento y sombra) y el export también.
   4. «Se dibuja solo» de 1 a 4 sobre un dibujo de 4 trazos: en el cuadro 2
      del export se ven 2.
   5. Ctrl+Z vuelve atrás cada «Aplicar»; sin modificadores, el export es el de
      siempre. */
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
  const derecho = async (sel) => { const r = await centro(sel); for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button: "right", clickCount: 1 }); await w(300); };

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: pageUrl });
    for (let i = 0; i < 80; i++) {
      if (await ev('document.readyState==="complete" && typeof dzDocInit==="function" && !!api && !!window.LOW?.animation?.modificadoresUI').catch(() => false)) break;
      await w(250);
    }
    await ev(`(async()=>{ try{localStorage.clear()}catch(e){}
      await openDesign("mock.svg"); await dzDocInit(); await new Promise(r=>setTimeout(r,600));
      LOW.workspace.workspaces.activate("animation", dzWsAplicar); await new Promise(r=>setTimeout(r,400));
      const sc = DZ.doc.scene;
      const dib = (n, trazos) => "<g data-low-art=\\"colour\\"></g><g data-low-art=\\"line\\">" +
        Array.from({ length: trazos }, (_, k) => "<rect data-n=\\"" + n + "\\" data-k=\\"" + k + "\\" x=\\"" + (k * 30) + "\\" y=\\"10\\" width=\\"20\\" height=\\"20\\"></rect>").join("") + "</g>";
      const lv = sc.addLevel("Ciclo"); for (let n = 1; n <= 4; n++) lv.addDrawing(n, dib(n, 4));
      const ly = sc.addLayer(lv.id, "Ciclo"); for (let f = 1; f <= 4; f++) sc.expose(ly.id, f, f);
      const lv2 = sc.addLevel("Otra"); lv2.addDrawing(1, dib(9, 1)); const ly2 = sc.addLayer(lv2.id, "Otra"); sc.expose(ly2.id, 1, 1);
      window.__c = { ciclo: ly.id, otra: ly2.id };
      DZ.doc.selectLayer(ly2.id); DZ.doc.goTo(1); DZ.doc.emit("layers"); await new Promise(r=>setTimeout(r,400)); return true; })()`);
    const ids = await ev(`window.__c`);
    const exportBase = await ev(`dzCuadroSvgTexto(3)`);

    // 1. el diálogo
    await derecho(`.tl2-row[data-layer-row="${ids.ciclo}"] .tl2-name`);
    const item = await ev(`(()=>{ const b = [...document.querySelectorAll(".ctx-menu .ctx-item")].find(x => x.textContent.includes("Modificadores y efectos")); if (!b) return false; b.click(); return true; })()`);
    if (!item) mal("el menú de la capa no ofrece «Modificadores y efectos…»", {});
    await w(300);
    await ev(`(()=>{ document.querySelector("#mdNuevo").value = "tiempo"; return true; })()`);
    await clic("#mdAgregar");
    await ev(`(()=>{ const b = document.querySelector(".md-bloque"); const s = b.querySelector('[data-campo="modo"]'); s.value = "bucle"; s.dispatchEvent(new Event("change"));
      const d = b.querySelector('[data-campo="desde"]'); d.value = "1"; d.dispatchEvent(new Event("input"));
      const h = b.querySelector('[data-campo="hasta"]'); h.value = "2"; h.dispatchEvent(new Event("input")); return true; })()`);
    await clic("#mdAplicar");
    const mods = await ev(`DZ.doc.scene.layer(window.__c.ciclo).mods`);
    if (!mods || mods[0].tipo !== "tiempo" || mods[0].modo !== "bucle" || mods[0].hasta !== 2) mal("el diálogo no aplicó el modificador de tiempo", mods);

    // 2. el bucle, en la mesa y en el export
    await ev(`(async()=>{ DZ.doc.goTo(3); dzOnionRender(); await new Promise(r=>setTimeout(r,300)); return true; })()`);
    const mesa = await ev(`(document.querySelector('#dzCanvas > svg > g.dz-capa[data-capa="${ids.ciclo}"]') || {}).innerHTML || ""`);
    if (!/data-n="1"/.test(mesa) || /data-n="3"/.test(mesa)) mal("en el cuadro 3 la mesa no muestra el dibujo 1 del bucle", { mesa: mesa.slice(0, 160) });
    const exp3 = await ev(`dzCuadroSvgTexto(3)`);
    if (!/data-n="1"/.test(exp3) || /data-n="3"/.test(exp3)) mal("en el cuadro 3 el export no sale con el bucle", { exp3: exp3.slice(0, 300) });
    if (!/data-n="3"/.test(await ev(`DZ.doc.scene.level(DZ.doc.scene.layer(window.__c.ciclo).levelId).byNumber(3).content`))) mal("el bucle tocó los dibujos", {});

    // 3. temblor y sombra
    await ev(`(async()=>{ DZ.doc.setLayerMods(window.__c.ciclo, [...DZ.doc.scene.layer(window.__c.ciclo).mods, { tipo: "temblor", amplitud: 4 }, { tipo: "sombra", dx: 6, dy: 6 }]); dzOnionRender(); await new Promise(r=>setTimeout(r,300)); return true; })()`);
    const fx = await ev(`({ filtro: (document.querySelector('#dzCanvas > svg > g.dz-capa[data-capa="${ids.ciclo}"]') || {}).getAttribute?.("filter") || "",
      defs: (document.querySelector("#dzCanvas > svg > g.dz-capa-fx") || {}).innerHTML || "" })`);
    if (fx.filtro !== `url(#dzFx_${ids.ciclo})` || !/feDisplacementMap/.test(fx.defs) || !/feOffset[^>]+dx="6"/.test(fx.defs)) mal("en la mesa la capa no lleva su filtro de temblor y sombra", { filtro: fx.filtro, defs: fx.defs.slice(0, 200) });
    const exp3b = await ev(`dzCuadroSvgTexto(3)`);
    if (!new RegExp(`<filter id="lowFx_${ids.ciclo}"`).test(exp3b) || !new RegExp(`<g filter="url\\(#lowFx_${ids.ciclo}\\)">`).test(exp3b)) mal("el export no lleva el filtro de la capa", { exp: exp3b.slice(0, 400) });

    // 4. se dibuja solo
    await ev(`(async()=>{ DZ.doc.setLayerMods(window.__c.ciclo, [{ tipo: "trazado", desde: 1, hasta: 4 }]); await new Promise(r=>setTimeout(r,200)); return true; })()`);
    const vis = await ev(`(()=>{ const t = dzCuadroSvgTexto(2); const g = document.createElement("div"); g.innerHTML = t;
      return [...g.querySelectorAll('rect[data-n]')].filter(r => r.getAttribute("visibility") !== "hidden").length; })()`);
    if (vis !== 2) mal("«se dibuja solo»: en el cuadro 2 de 4 no se ven 2 trazos", { vis });

    // 5. Ctrl+Z
    for (let k = 0; k < 3; k++) await ev(`(async()=>{ dzUndo(); await new Promise(r=>setTimeout(r,150)); return true; })()`);
    if (await ev(`!!DZ.doc.scene.layer(window.__c.ciclo).mods`)) mal("tres Ctrl+Z no sacaron los modificadores", {});
    const exportFinal = await ev(`dzCuadroSvgTexto(3)`);
    if (exportFinal !== exportBase) mal("sin modificadores, el export no volvió a ser el de antes", {});

    const errB = errores.filter((x) => !/ResizeObserver/.test(String(x)));
    if (errB.length) mal("errores en la página", errB);
    console.log("E2E modificadores y efectos OK " + JSON.stringify({ bucle: "cuadro 3 → dibujo 1", filtro: fx.filtro, trazosEnCuadro2: vis }));
  } finally {
    try { await send("Page.close"); } catch (_) { /* ya cerrada */ }
    ws.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
