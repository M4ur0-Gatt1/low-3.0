/* MIRAR NO ES CAMBIAR. CDP :9223 + mock :8791.

   POR QUE EXISTE. Medido el 3-oct-2026 en la app real con un .low recién
   guardado: apretar Play y Stop lo dejaba «SIN GUARDAR», sin un solo paso en
   el historial. Al reproducir se pasa por cuadros VACÍOS de alguna capa; el
   lienzo vacío se «organiza» (le pone sus planos de Color y Línea), eso llamaba
   a dzMarkDirty y DZ.dirty quedaba en true para siempre, aunque el volcado al
   documento confirmaba que no había cambiado nada.

   Cada falsa alarma de «¿Cerrar sin guardar?» enseña a apretar Descartar sin
   leer, y el día que sí hay trabajo, se pierde. Se exige: guardado, reproducir,
   parar y moverse por cuadros vacíos lo deja GUARDADO. Y la contracara: un
   trazo de verdad sí lo deja sin guardar. */
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
    let p = null;
    for (let i = 0; i < 30 && !p; i++) {
      p = await ev(`(()=>{const e=${expr}; if(!e) return null; const r=e.getBoundingClientRect();
        if(!r.width||!r.height) return null; return {x:r.x+r.width/2, y:r.y+r.height/2};})()`);
      if (!p) await wait(100);
    }
    assert.ok(p, que);
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(350); };
  const trazo = async () => {
    const h = await ev(`(()=>{const r=document.querySelector("#dzCanvas > svg").getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
    const x1 = h.x + h.w * 0.3, y = h.y + h.h * 0.5;
    await mouse("mouseMoved", x1, y); await mouse("mousePressed", x1, y, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 10; i++) { await mouse("mouseMoved", x1 + i * 25, y + Math.sin(i) * 12, { buttons: 1 }); await wait(12); }
    await mouse("mouseReleased", x1 + 250, y, { buttons: 0, clickCount: 1 }); await wait(700);
  };
  const sucio = () => ev(`(()=>{ const t = dzDocumentTabCurrent && dzDocumentTabCurrent();
    return { dz: !!DZ.dirty, doc: !!(DZ.doc && DZ.doc.dirty), pestana: !!(t && t.dirty), historia: DZ.history.undoStack.length }; })()`);
  const limpio = (e) => !e.dz && !e.doc && !e.pestana;
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!window.LOW?.workspace?.workspaces').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear()}catch(e){} return true; })()');
    // el puente de prueba no escribe: se le da un save_file que contesta como el real
    await ev(`(()=>{ api.save_file = async (ruta, contenido, nombre) => ({ path: ruta || "C:\\\\mock\\\\guardado.low", name: "guardado.low" }); return true; })()`);
    await ev(`dzMenuAction("nuevo")`); await wait(2200);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');
    await clicEn(`document.querySelector('[data-tool="brush"]')`, "no está el pincel");

    // dos cuadros dibujados en la Capa 1 y una Capa 2 vacía: hay cuadros VACÍOS
    await trazo();
    await clicEn(`document.querySelector('.tl2-cell[data-layer-id="'+DZ.doc.layerId+'"][data-frame="2"]')`, "no está la celda del cuadro 2");
    await trazo();
    await clicEn(`document.querySelector(".tl2-addlayer")`, "no está «+ Capa»");
    await ev(`dzMenuAction("guardar")`); await wait(700);
    const guardado = await sucio();
    assert.ok(limpio(guardado), "Guardar no dejó el documento guardado · " + JSON.stringify(guardado));

    // ── 1. REPRODUCIR Y PARAR ────────────────────────────────────────────────
    await clicEn(`document.querySelector("#tlPlay")`, "no está el botón de reproducir");
    await wait(900);
    await clicEn(`document.querySelector("#tlPlay")`, "no está el botón de reproducir");
    await wait(600);
    const trasPlay = await sucio();
    assert.ok(limpio(trasPlay),
      "reproducir y parar dejó el documento SIN GUARDAR sin cambiar nada: cerrar va a preguntar por cambios que no existen · " +
      JSON.stringify({ guardado, trasPlay }));
    assert.equal(trasPlay.historia, guardado.historia, "reproducir agregó pasos al historial · " + JSON.stringify(trasPlay));

    // ── 2. IR A MANO A UN CUADRO VACÍO ───────────────────────────────────────
    await clicEn(`document.querySelector('.tl2-cell[data-layer-id="'+DZ.doc.layerId+'"][data-frame="1"]')`, "no está la celda vacía de la Capa 2");
    await wait(600);
    const trasMirar = await sucio();
    assert.ok(limpio(trasMirar), "mirar un cuadro vacío dejó el documento sin guardar · " + JSON.stringify(trasMirar));

    // ── 3. LA CONTRACARA: un trazo de verdad SÍ queda sin guardar ────────────
    await trazo();
    const trasTrazo = await sucio();
    assert.ok(trasTrazo.doc && trasTrazo.dz && trasTrazo.pestana,
      "un trazo de verdad no dejó el documento sin guardar: se perdería al cerrar sin aviso · " + JSON.stringify(trasTrazo));

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    assert.deepEqual(graves.slice(0, 3), [], "hubo excepciones durante el recorrido");
    console.log("E2E mirar no es cambiar OK " + JSON.stringify({ trasPlay, trasMirar, trasTrazo }));
  } finally {
    ws.close(); try { await fetch(endpoint + "/json/close/" + tab.id); } catch (_) { }
  }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
