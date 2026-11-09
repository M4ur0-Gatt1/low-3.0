/* GRUPOS DE CAPAS EN LA LÍNEA DE TIEMPO (v3.58). CDP :9223 + mock :8791.

   Con el mouse de verdad:
   1. clic derecho en el nombre de una capa → «Agrupar esta capa…» → nombre:
      aparece el encabezado del grupo con su nombre y la capa adentro;
   2. clic derecho en otra capa → «Mover al grupo «Personaje»»: suma la capa;
   3. el ojo del grupo oculta sus capas DE VERDAD: el cuadro exportado ya no
      las tiene (dzCuadroSvgTexto) y la de afuera sigue;
   4. plegar esconde sus filas; desplegar las devuelve;
   5. clic derecho en el encabezado → «Desagrupar»; un Ctrl+Z lo vuelve a armar;
   6. un nombre con HTML no se ejecuta en el cuadro de renombrar. */
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
  const clic = async (sel, button = "left") => {
    const r = await centro(sel);
    for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button, clickCount: 1 });
    await w(300);
  };
  const derecho = async (sel) => {
    const r = await centro(sel);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "right", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "right", clickCount: 1 });
    await w(300);
  };
  const elegirMenu = async (texto) => {
    const ok = await ev(`(()=>{ const b = [...document.querySelectorAll(".ctx-menu .ctx-item")].find(x => x.textContent.includes(${JSON.stringify(texto)})); if (!b) return [...document.querySelectorAll(".ctx-menu .ctx-label")].map(x => x.textContent); b.click(); return true; })()`);
    if (ok !== true) mal("el menú no tiene «" + texto + "»", ok);
    await w(300);
  };
  const escribir = async (texto) => {
    await ev(`(()=>{ const i = document.querySelector("#dzPrIn"); i.value = ${JSON.stringify(texto)}; return true; })()`);
    await clic("#dzPrOk");
  };

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
      const sc = DZ.doc.scene;
      const crear = (nombre, figura) => { const lv = sc.addLevel(nombre); lv.addDrawing(1, figura); const ly = sc.addLayer(lv.id, nombre); sc.expose(ly.id, 1, 1); return ly.id; };
      window.__c = { cuerpo: crear("Cuerpo", "<rect data-prueba='cuerpo' width='50' height='50'/>"),
                     cabeza: crear("Cabeza", "<circle data-prueba='cabeza' r='20'/>"),
                     fondo: crear("Fondo", "<rect data-prueba='fondo' width='900' height='500'/>") };
      DZ.doc.goTo(1); DZ.doc.emit("layers"); await new Promise(r=>setTimeout(r,400)); return true; })()`);
    const fila = (cid) => `.tl2-row[data-layer-row="${cid}"] .tl2-name`;
    const ids = await ev(`window.__c`);

    // 1. agrupar con el clic derecho
    await derecho(fila(ids.cuerpo));
    await elegirMenu("Agrupar esta capa");
    await escribir("Personaje");
    const g = await ev(`DZ.doc.scene.layer(window.__c.cuerpo).grupo`);
    if (!g) mal("«Agrupar esta capa…» no creó el grupo", {});
    const cab = await ev(`(document.querySelector('.tl2-row[data-grupo-row="${g}"] .tl2-grupo-nombre') || {}).textContent || ""`);
    if (!/^Personaje \(1\)/.test(cab)) mal("no apareció el encabezado del grupo", { cab });

    // 2. mover otra capa al grupo
    await derecho(fila(ids.cabeza));
    await elegirMenu("Mover al grupo «Personaje»");
    const miembros = await ev(`DZ.doc.capasDeGrupo("${g}").map(l => l.name)`);
    if (miembros.length !== 2 || !miembros.includes("Cabeza")) mal("«Mover al grupo» no sumó la capa", miembros);

    // 3. el ojo del grupo oculta de verdad
    await clic(`.tl2-row[data-grupo-row="${g}"] .tl2-eye`);
    const cuadro = await ev(`dzCuadroSvgTexto(1)`);
    if (/data-prueba=.cuerpo|data-prueba=.cabeza/.test(cuadro) || !/data-prueba=.fondo/.test(cuadro))
      mal("ocultar el grupo no sacó sus capas del cuadro exportado (o sacó la de afuera)", { cuadro: cuadro.slice(0, 300) });
    await clic(`.tl2-row[data-grupo-row="${g}"] .tl2-eye`);
    if (!/data-prueba=.cuerpo/.test(await ev(`dzCuadroSvgTexto(1)`))) mal("mostrar el grupo no devolvió sus capas", {});

    // 4. plegar
    await clic(`.tl2-row[data-grupo-row="${g}"] .tl2-fold`);
    if (await ev(`!!document.querySelector('${fila(ids.cuerpo)}')`)) mal("plegar no escondió las filas del grupo", {});
    await clic(`.tl2-row[data-grupo-row="${g}"] .tl2-fold`);
    if (!(await ev(`!!document.querySelector('${fila(ids.cuerpo)}')`))) mal("desplegar no devolvió las filas", {});

    // 5. desagrupar y Ctrl+Z
    await derecho(`.tl2-row[data-grupo-row="${g}"] .tl2-name`);
    await elegirMenu("Desagrupar");
    if (await ev(`!!DZ.doc.grupo("${g}") || !!document.querySelector('.tl2-row[data-grupo-row]')`)) mal("Desagrupar no deshizo el grupo", {});
    await ev(`dzUndo(); new Promise(r => setTimeout(() => r(1), 300))`);
    if (!(await ev(`DZ.doc.capasDeGrupo("${g}").length === 2 && !!document.querySelector('.tl2-row[data-grupo-row="${g}"]')`))) mal("Ctrl+Z no volvió a armar el grupo", {});

    // 6. un nombre con HTML no se ejecuta al renombrar
    await ev(`window.__xss = 0; DZ.doc.setGrupo("${g}", "nombre", '</textarea><img src=x onerror="window.__xss=1">'); true`);
    await w(300);
    await derecho(`.tl2-row[data-grupo-row="${g}"] .tl2-name`);
    await elegirMenu("Renombrar el grupo");
    await w(300);
    const xss = await ev(`({ ejecuto: window.__xss, valor: (document.querySelector("#dzPrIn") || {}).value || "" })`);
    if (xss.ejecuto || !xss.valor.includes("<img")) mal("el nombre con HTML se ejecutó (o no se mostró tal cual) en el cuadro de renombrar", xss);
    await clic("#dzPrX");

    const errB = errores.filter((x) => !/ResizeObserver/.test(String(x)));
    if (errB.length) mal("errores en la página", errB);
    console.log("E2E grupos de capas OK " + JSON.stringify({ grupo: cab, miembros }));
  } finally {
    try { await send("Page.close"); } catch (_) { /* ya cerrada */ }
    ws.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
