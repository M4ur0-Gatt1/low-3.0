/* UN TRAZO, UN DESHACER. CDP :9223 + mock :8791.

   POR QUE EXISTE. Medido el 3-oct-2026 en la app real con un documento nuevo:
   cada trazo dejaba DOS entradas en el historial —«Editar dibujo» y
   «Dibujar»—. El primer Ctrl+Z deshacia el trazo bien; el segundo restauraba
   una FOTO VIEJA DEL SVG y el lienzo quedaba VACIO: las otras capas
   desaparecian de la vista aunque seguian en el documento. Para quien esta
   aprendiendo, eso es «se me borro el dibujo».

   La causa: `dzSnapshot()` es el deshacer del modo viejo (.svg suelto) y se
   llama antes de cada cambio desde 67 lugares de app.js. Con un .low la
   historia es la del DOCUMENTO —el volcado del cambio apila «Dibujar»—, asi
   que la foto era una segunda entrada por cada trazo.

   Y un segundo cuidado, que es el que hace que la foto existiera: el volcado
   al documento va con 260 ms de retardo. Un Ctrl+Z RAPIDO cancelaba ese
   volcado: el trazo nuevo no llegaba a tener entrada y el Ctrl+Z se llevaba
   el ANTERIOR. Se exige tambien ese caso. */
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
  const clic = async (sel) => { const p = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null;
      const r=e.getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2};})()`);
    assert.ok(p, "no está en pantalla: " + sel);
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(300); };
  // un trazo de verdad, con el mouse, sobre la hoja
  const trazo = async (fy) => {
    const h = await ev(`(()=>{const r=document.querySelector("#dzCanvas > svg").getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
    const x1 = h.x + h.w * 0.25, x2 = h.x + h.w * 0.75, y = h.y + h.h * fy;
    await mouse("mouseMoved", x1, y); await mouse("mousePressed", x1, y, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i++) { await mouse("mouseMoved", x1 + (x2 - x1) * i / 12, y + Math.sin(i / 2) * 15, { buttons: 1 }); await wait(12); }
    await mouse("mouseReleased", x2, y, { buttons: 0, clickCount: 1 });
  };
  const ctrlZ = async () => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "z", code: "KeyZ", modifiers: 2, windowsVirtualKeyCode: 90 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", modifiers: 2, windowsVirtualKeyCode: 90 }); };
  const foto = () => ev(`(()=>{ const sc = DZ.doc.scene;
    const cuenta = (s) => (String(s || "").match(/<path/g) || []).length;
    return { historia: DZ.history.undoStack.length,
      etiquetas: DZ.history.undoStack.slice(-4).map(e => e.label),
      capas: sc.layers.length,
      trazosNivel1: (sc.levels[0]?.drawings || []).reduce((n, d) => n + cuenta(d.content), 0),
      enLaVista: document.querySelectorAll("#dzCanvas > svg path").length }; })()`);
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!window.LOW?.workspace?.workspaces').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear()}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); const s=document.getElementById("lowSplash"); if(s) s.remove(); return true; })()');
    assert.ok(await ev("!!DZ.doc"), "«Nuevo documento» no dejó un documento abierto");
    // ── 0. UN DOCUMENTO NUEVO NO NACE «SIN GUARDAR» NI CON ALGO PARA DESHACER ─
    //    Medido: a los ~250 ms ya figuraba sin guardar y con un «Dibujar» en el
    //    historial. Un volcado armado en la pantalla vacía (antes de que hubiera
    //    documento) disparaba sobre el nuevo, y el dibujo inicial no estaba en la
    //    forma en que el lienzo lo serializa (`<rect/>` contra `<rect></rect>`).
    //    Cerrar un documento sin tocar preguntaba «¿descartar cambios?»: una
    //    falsa alarma que enseña a apretar Descartar sin leer.
    await wait(900);
    const recien = await ev(`({ historia: DZ.history.undoStack.map(e => e.label),
      sinGuardar: !!(DZ.dirty || DZ.doc.dirty) })`);
    assert.deepEqual(recien, { historia: [], sinGuardar: false },
      "un documento recién creado, sin tocar, ya tiene historial o figura sin guardar · " + JSON.stringify(recien));
    await clic('[data-tool="brush"]');

    // ── 1. UN TRAZO = UNA ENTRADA ───────────────────────────────────────────
    const antes = await foto();
    await trazo(0.35); await wait(700);
    const tras1 = await foto();
    assert.equal(tras1.trazosNivel1, antes.trazosNivel1 + 1, "el trazo no llegó al documento · " + JSON.stringify(tras1));
    assert.equal(tras1.historia - antes.historia, 1,
      "un trazo dejó " + (tras1.historia - antes.historia) + " entradas en el historial: hacen falta " +
      "dos Ctrl+Z por trazo y el segundo restaura una foto vieja del lienzo · " + JSON.stringify(tras1));

    // ── 2. EL SEGUNDO Ctrl+Z NO VACÍA LA VISTA ───────────────────────────────
    //    Capa nueva y un trazo en ella. Dos Ctrl+Z: el trazo y la capa. Lo que
    //    estaba dibujado en la Capa 1 tiene que seguir A LA VISTA.
    await clic(".tl2-addlayer"); await wait(400);
    await trazo(0.65); await wait(700);
    const conB = await foto();
    assert.equal(conB.capas, 2, "no se creó la capa · " + JSON.stringify(conB));
    await ctrlZ(); await wait(500);
    const z1 = await foto();
    await ctrlZ(); await wait(500);
    const z2 = await foto();
    assert.equal(z2.capas, 1, "dos Ctrl+Z tenían que sacar el trazo y la capa nueva · " + JSON.stringify({ conB, z1, z2 }));
    assert.equal(z2.trazosNivel1, tras1.trazosNivel1, "deshacer tocó el dibujo de la Capa 1 · " + JSON.stringify(z2));
    assert.ok(z2.enLaVista >= 1,
      "después de deshacer, el lienzo quedó VACÍO aunque la Capa 1 tiene su dibujo: se restauró una " +
      "foto vieja del SVG · " + JSON.stringify({ conB, z1, z2 }));

    // ── 3. Ctrl+Z RÁPIDO: antes de que el volcado (260 ms) llegue ────────────
    await trazo(0.5);
    await ctrlZ(); await wait(700);
    const rapido = await foto();
    assert.equal(rapido.trazosNivel1, tras1.trazosNivel1,
      "un Ctrl+Z inmediato tiene que llevarse SOLO el trazo recién hecho: se llevó también otro, " +
      "o dejó el nuevo · " + JSON.stringify(rapido));
    assert.ok(rapido.enLaVista >= 1, "tras el Ctrl+Z rápido el lienzo no muestra lo que había · " + JSON.stringify(rapido));

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    assert.deepEqual(graves.slice(0, 3), [], "hubo excepciones durante el recorrido");
    console.log("E2E un trazo, un deshacer OK " + JSON.stringify({ tras1: tras1.etiquetas, z2, rapido }));
  } finally {
    ws.close(); try { await fetch(endpoint + "/json/close/" + tab.id); } catch (_) { }
  }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
