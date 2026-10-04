/* CERRAR UN DOCUMENTO TE DEJA EN EL ESTUDIO, Y REABRIRLO LO ABRE.
   CDP :9223 + mock :8791.

   POR QUE EXISTE. Medido el 3-oct-2026 en la app real con un .low guardado:
   Archivo -> Cerrar documento

   1. te SACABA del estudio 2D: ocultaba `#designView` y debajo quedaba la
      pantalla de código e IA («// Nuevo archivo», el agente). Desde que el 2D
      es la primera pantalla, cerrar el dibujo no puede tirarte a un editor de
      código: tiene que volver a la invitación del 2D, como al arrancar.
   2. dejaba la PESTAÑA del documento cerrado en `DZ.documentTabs`. Al reabrir
      el mismo archivo, `dzSceneOpen` encontraba esa pestaña y la «activaba»:
      devolvía true y NO ABRÍA NADA.

   La × de la pestaña y la X de la barra pasan por `dzDocumentTabClose`, que sí
   saca la pestaña, pero también ocultaban el estudio. Se prueban las tres. */
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
  const clicEn = async (expr, que) => {
    const p = await ev(`(()=>{const e=${expr}; if(!e) return null; const r=e.getBoundingClientRect();
      if(!r.width||!r.height) return null; return {x:r.x+r.width/2, y:r.y+r.height/2};})()`);
    assert.ok(p, que);
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(500); };
  const estado = () => ev(`(()=>{ const v = document.querySelector("#designView");
    return { estudio: !!(v && !v.hidden), invitacion: !!document.querySelector("#dzBienvenida2D"),
      pestanas: (DZ.documentTabs || []).length, hayDoc: !!DZ.doc, ruta: DZ.doc ? DZ.doc.path : null,
      sinGuardar: !!(DZ.dirty || (DZ.doc && DZ.doc.dirty)),
      lineaDeTiempo: ["#dzTimeline", "#dzTlGrid"].some(s => { const n = document.querySelector(s); return !!(n && !n.hidden && n.getBoundingClientRect().height > 0); }),
      modal: ((document.querySelector("#overlay:not([hidden]) #modal") || {}).textContent || "").trim().slice(0, 120) }; })()`);
  const nuevo = async () => { await ev(`dzMenuAction("nuevo")`); await wait(2200);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');
    const e = await estado(); assert.ok(e.hayDoc && e.ruta, "«Nuevo documento» no abrió nada · " + JSON.stringify(e)); return e.ruta; };
  const exigirCerrado = (e, como) => {
    assert.equal(e.hayDoc, false, como + ": el documento sigue abierto · " + JSON.stringify(e));
    assert.ok(e.estudio, como + ": te sacó del estudio 2D a la pantalla de código e IA · " + JSON.stringify(e));
    assert.ok(e.invitacion, como + ": el estudio quedó vacío, sin la invitación para crear o abrir · " + JSON.stringify(e));
    assert.equal(e.pestanas, 0, como + ": quedó la pestaña del documento cerrado colgada · " + JSON.stringify(e));
    // y la portada queda LIMPIA, como al arrancar: medido en la app real, la
    // línea de tiempo seguía abierta y vacía, con «8 cuadro(s)» y «2/2» del
    // documento que ya no estaba
    assert.ok(!e.lineaDeTiempo, como + ": la línea de tiempo quedó abierta y vacía debajo de la portada · " + JSON.stringify(e));
  };
  const reabrir = async (ruta, como) => {
    const ok = await ev(`dzSceneOpen(${JSON.stringify(ruta)})`); await wait(800);
    const e = await estado();
    assert.ok(ok && e.hayDoc && e.ruta === ruta,
      como + ": reabrir el mismo archivo no lo abrió (activaba la pestaña muerta) · " + JSON.stringify({ ok, e }));
    assert.equal(e.pestanas, 1, como + ": reabrir dejó " + e.pestanas + " pestañas · " + JSON.stringify(e));
    // recién abierto, sin tocar nada, NO tiene cambios: medido en la app real,
    // abrir desde la pantalla vacía dejaba DZ.dirty en true y cerrar preguntaba
    // «¿Cerrar igualmente?» por cambios que no existían
    await wait(600);
    const limpio = await estado();
    assert.equal(limpio.sinGuardar, false, como + ": el archivo recién abierto figura con cambios sin guardar · " + JSON.stringify(limpio));
  };
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!window.LOW?.workspace?.workspaces').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear()}catch(e){} return true; })()');

    // ── 1. Archivo -> Cerrar documento ───────────────────────────────────────
    const ruta = await nuevo();
    await ev(`dzMenuAction("cerrar-documento")`); await wait(700);
    exigirCerrado(await estado(), "Archivo -> Cerrar documento");
    await reabrir(ruta, "tras cerrar por el menú");

    // ── 2. la × de la pestaña, con el mouse ──────────────────────────────────
    await clicEn(`document.querySelector(".dz-document-tab .dz-document-close")`, "no se ve la × de la pestaña del documento");
    await wait(300);
    exigirCerrado(await estado(), "la × de la pestaña");
    await reabrir(ruta, "tras cerrar con la ×");

    // ── 3. la X de la barra del estudio ──────────────────────────────────────
    await clicEn(`document.querySelector("#dzClose")`, "no se ve la X de la barra");
    await wait(300);
    exigirCerrado(await estado(), "la X de la barra");

    // ── 4. ABRIR UN ARCHIVO QUE NO ESTÁ LO DICE EN PANTALLA ──────────────────
    //    `dzSceneOpen` avisaba con sysMsg, que escribe en el chat de IA: desde el
    //    estudio 2D no se ve, y «Abrir» parecía un botón muerto.
    await ev(`(()=>{ void dzSceneOpen("C:/mock/se-movio.low"); return true; })()`); await wait(600);
    const aviso = await ev(`((document.querySelector("#overlay:not([hidden]) #modal") || {}).textContent || "").trim()`);
    assert.ok(/no pude abrir/i.test(aviso), "abrir un archivo que no existe no avisa nada en el estudio · modal: " + JSON.stringify(aviso));
    await ev(`(()=>{ const b = document.querySelector("#overlay:not([hidden]) #modal button"); if (b) b.click(); return true; })()`); await wait(300);

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    assert.deepEqual(graves.slice(0, 3), [], "hubo excepciones durante el recorrido");
    console.log("E2E cerrar documento OK: las tres formas vuelven a la invitación del 2D y reabrir abre");
  } finally {
    ws.close(); try { await fetch(endpoint + "/json/close/" + tab.id); } catch (_) { }
  }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
