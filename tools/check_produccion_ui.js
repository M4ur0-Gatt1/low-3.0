/* LA PLANILLA DE PRODUCCIÓN EN LA APP (v3.57). CDP :9223 + mock :8791.

   1. Ventana → «Planilla de producción…» abre el panel; sin planilla ofrece
      empezar con la guía de un corto.
   2. «Empezar con la guía de un corto»: tres etapas con sus pasos, 0 hechos.
   3. Tildar el guion con un clic de verdad: queda hecho en el DOCUMENTO, el
      contador sube y el archivo queda modificado.
   4. Ctrl+Z (el de LOW) lo destilda y el panel lo muestra.
   5. «Ir» del storyboard abre el storyboard; «Ir» de diseño de personajes
      abre el estudio 3D.
   6. Plegar una etapa esconde sus pasos.
   7. La planilla va en el JSON de la escena (lo que se guarda en el .low). */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const base = process.argv[3] || "http://127.0.0.1:8791/ui/";

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
  /** Un clic de verdad (eventos del navegador, no .click()) en el centro del elemento. */
  const clic = async (sel) => {
    const r = await ev(`(()=>{ const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: "center" }); const b = n.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; })()`);
    if (!r) mal("no está en la pantalla: " + sel, {});
    for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button: "left", clickCount: 1 });
    await w(250);
  };
  const estado = () => ev(`(()=>{ const p = DZ.doc.scene.produccion; const pasos = p ? p.etapas.flatMap(e => e.pasos) : [];
    return { hay: !!p, etapas: p ? p.etapas.length : 0, hechos: pasos.filter(x => x.estado === "hecho").length, total: pasos.length,
      guion: (pasos.find(x => x.id === "guion") || {}).estado || "",
      resumen: (document.querySelector("#dzProduccion .prod-resumen") || {}).textContent || "",
      tilde: !!(document.querySelector('#dzProduccion [data-paso="guion"] input') || {}).checked }; })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: base + "index.html?mock=1" });
    for (let i = 0; i < 90; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api').catch(() => false)) break; await w(400); }
    await ev(`(async()=>{ try{localStorage.clear()}catch(e){} dzMenuAction("nuevo"); await new Promise(r=>setTimeout(r,2800)); if (typeof closeL3d==="function") closeL3d(); return true; })()`);

    // 1. desde el menú Ventana, con el mouse de verdad: abrir el menú y elegir
    // (los ítems se disparan al apretar; el clic llega después)
    await clic('.dz-menu[data-menu="ventana"]');
    await clic('.dz-menu[data-menu="ventana"] [data-act="produccion"]');
    await w(300);
    if (!(await ev(`!!document.querySelector("#dzProduccion")`))) mal("Ventana → Planilla de producción no abrió el panel", {});
    if (!(await ev(`!!document.querySelector("#dzProduccion .prod-primario")`))) mal("sin planilla, no se ofrece empezar con la guía", {});

    // 2. empezar con la guía
    await clic("#dzProduccion .prod-primario");
    let e = await estado();
    if (!e.hay || e.etapas !== 3 || e.hechos !== 0 || e.total < 20) mal("la guía del corto no se armó", e);
    const nombres = await ev(`[...document.querySelectorAll("#dzProduccion .prod-etapa-nombre")].map(n => n.textContent)`);
    if (nombres.join() !== "Preproducción,Producción,Postproducción") mal("las etapas no son las del corto", nombres);

    // 3. tildar con un clic de verdad
    await ev(`DZ.dirty = false; true`);
    await clic('#dzProduccion [data-paso="guion"] input');
    e = await estado();
    if (e.guion !== "hecho" || e.hechos !== 1 || !e.tilde) mal("tildar el guion no lo dejó hecho en el documento", e);
    if (!/1 de/.test(e.resumen)) mal("el contador no subió", e);
    if (!(await ev(`!!DZ.dirty`))) mal("tildar no marcó el documento como modificado (se perdería al cerrar)", {});

    // 4. el Ctrl+Z de LOW lo destilda
    await ev(`dzUndo(); true`); await w(300);
    e = await estado();
    if (e.guion !== "pendiente" || e.tilde) mal("Ctrl+Z no destildó el guion (o el panel no se enteró)", e);
    await ev(`dzRedo(); true`); await w(300);
    e = await estado();
    if (e.guion !== "hecho" || !e.tilde) mal("Ctrl+Shift+Z no lo volvió a tildar", e);

    // 5. «Ir»
    await ev(`(()=>{ const sb = document.querySelector("#dzStoryboard"); if (sb) sb.hidden = true; return true; })()`);
    await clic('#dzProduccion [data-paso="storyboard"] .prod-ir');
    await w(600);
    if (!(await ev(`!!document.querySelector("#dzStoryboard") && !document.querySelector("#dzStoryboard").hidden`))) mal("«Ir» del storyboard no abrió el storyboard", {});
    await clic('#dzProduccion [data-paso="personajes"] .prod-ir');
    await w(600);
    if (!(await ev(`!document.querySelector("#l3dView").hidden`))) mal("«Ir» de diseño de personajes no abrió el estudio 3D", {});
    await ev(`closeL3d(); true`);

    // 6. plegar una etapa
    await clic('#dzProduccion [data-etapa="post"] .prod-etapa-tit');
    if (await ev(`!!document.querySelector('#dzProduccion [data-etapa="post"] .prod-paso')`)) mal("plegar la etapa no escondió sus pasos", {});

    // 7. lo que se guarda en el .low
    const json = await ev(`(()=>{ const j = JSON.parse(JSON.stringify(DZ.doc.scene.toJSON())); const g = j.produccion && j.produccion.etapas[0].pasos.find(x => x.id === "guion"); return g ? g.estado : null; })()`);
    if (json !== "hecho") mal("la planilla no va en el JSON de la escena", { json });

    // 8. un paso con HTML en el nombre (viene del archivo) no se ejecuta en el cuadro de la nota
    await ev(`(async()=>{ window.__xss = 0; LOW.produccion.renombrar("pre", "idea", '</textarea><img src=x onerror="window.__xss=1">'); await new Promise(r=>setTimeout(r,200)); return true; })()`);
    await clic('#dzProduccion [data-paso="idea"] .prod-nota');
    await w(300);
    const xss = await ev(`({ ejecuto: window.__xss, titulo: (document.querySelector("#modal h2") || {}).textContent || "" })`);
    if (xss.ejecuto || !xss.titulo.includes("<img")) mal("el nombre del paso con HTML se ejecutó (o no se mostró tal cual)", xss);
    await ev(`document.querySelector("#dzPrX").click(); true`);
    const errB = errores.filter((x) => !/ResizeObserver/.test(String(x)));
    if (errB.length) mal("errores en la página", errB);
    console.log("E2E planilla de producción OK " + JSON.stringify({ pasos: e.total, etapas: nombres }));
  } finally {
    try { await send("Page.close"); } catch (_) { /* ya cerrada */ }
    ws.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
