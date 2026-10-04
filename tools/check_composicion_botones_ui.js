/* COMPOSICIÓN: LOS BOTONES Y CAMPOS RESPONDEN AL MOUSE DE VERDAD. CDP :9223 + mock :8791.

   Reporte de Mauro (oct-2026, LOW 3.2.4): «en el menú de composición hay un
   montón de opciones en la barra de arriba —perspectiva, arriba, cámara,
   centrar— pero nada de esos botones andan».

   CAUSA (medida en la app real): la mesa multiplano vive DENTRO de #dzCanvas,
   y el lienzo (dzPointerDown) captura el puntero en cualquier apretón que no
   sea de un panel suyo: el soltar y el CLIC iban al lienzo, nunca al botón. Y
   como hacía preventDefault, los campos del inspector no tomaban el foco.
   check_multiplane_ui.js no lo veía porque apretaba con `boton.click()` desde
   JS, que no pasa por el puntero. Acá todo es con eventos de mouse reales.

   Y ENTER en un campo del inspector: el plano se movía en la mesa pero el
   valor recién llegaba al documento al salir del campo (los campos numéricos
   no mandan `change` con Enter). */
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
  /** Clic real sobre el elemento: el botón tiene que recibir el CLIC, no sólo el apretón. */
  const apretar = async (sel) => {
    const p = await ev(`(()=>{ const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    assert.ok(p, "no está «" + sel + "» en la Composición");
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(300);
  };
  const vista = () => ev(`document.querySelector("#dzComposition3D .cmp3-world").style.transform`);
  const activo = (a) => ev(`document.querySelector('#dzComposition3D [data-a="${a}"]').classList.contains("active")`);
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!window.LOW?.workspace?.workspaces').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');
    await wait(500);
    await ev(`(()=>{ DZ.doc.writeDrawing('<g data-low-art="colour"><circle cx="960" cy="540" r="300" fill="#e02020"/></g><g data-low-art="line"><path d="M600 300 L1300 800" stroke="#111" stroke-width="20"/></g>'); DZ.doc.emit("frame"); return 1; })()`);
    await wait(500);
    // a la Composición con la HERRAMIENTA DE SELECCIÓN, que es la que capturaba el puntero
    await ev(`(()=>{ dzSetTool("select"); LOW.workspace.workspaces.activate("composite", dzWsAplicar); return 1; })()`);
    await wait(900);
    assert.ok(await ev(`!!document.querySelector("#dzComposition3D .cmp3-toolbar") && !document.querySelector("#dzComposition3D").hidden`), "no se abrió la mesa de Composición");

    await apretar('#dzComposition3D [data-v="front"]');
    assert.match(await vista(), /rotateX\(0deg\) rotateY\(0deg\)/, "«Frente» no cambió la vista");
    await apretar('#dzComposition3D [data-v="top"]');
    assert.match(await vista(), /rotateX\(-89\.9deg\)/, "«Arriba» no cambió la vista");
    await apretar('#dzComposition3D [data-v="perspective"]');
    assert.match(await vista(), /rotateX\(-18deg\) rotateY\(28deg\)/, "«Perspectiva» no volvió a la vista en perspectiva");

    await apretar('#dzComposition3D [data-v="front"]');
    await apretar('#dzComposition3D [data-a="home"]');
    assert.match(await vista(), /rotateX\(-18deg\) rotateY\(28deg\)/, "«Centrar» no reencuadró la vista");

    await apretar('#dzComposition3D [data-a="grid"]');
    assert.equal(await ev(`document.querySelector("#dzComposition3D").classList.contains("no-grid")`), true, "«Grid» no ocultó la cuadrícula");
    await apretar('#dzComposition3D [data-a="grid"]');
    const snap0 = await activo("snap");
    await apretar('#dzComposition3D [data-a="snap"]');
    assert.equal(await activo("snap"), !snap0, "«Snap» no se prendió/apagó");
    const auto0 = await activo("autokey");
    await apretar('#dzComposition3D [data-a="autokey"]');
    assert.equal(await activo("autokey"), !auto0, "«Auto-key» no se prendió/apagó");
    if (!auto0) await apretar('#dzComposition3D [data-a="autokey"]');

    await apretar('#dzComposition3D [data-v="camera"]');
    assert.equal(await ev(`document.querySelector("#dzComposition3D").classList.contains("cmp3-en-camara")`), true, "«Cámara» no pasó a mirar por la cámara");
    // y la toma SE VE: entera adentro del recuadro, con la proporción de la escena
    // (antes el SVG quedaba más alto que el recuadro y la escena caía fuera de la vista)
    const toma = await ev(`(()=>{ const l = document.querySelector("#dzComposition3D .cmp3-camview"), s = l && l.querySelector("svg");
      if (!s) return null; const r = s.getBoundingClientRect(), b = l.getBoundingClientRect();
      return { adentro: r.top >= b.top - 1 && r.bottom <= b.bottom + 1 && r.left >= b.left - 1 && r.right <= b.right + 1,
        proporcion: +(r.width / r.height).toFixed(2), escena: +(DZ.doc.scene.width / DZ.doc.scene.height).toFixed(2), alto: Math.round(r.height) }; })()`);
    assert.ok(toma && toma.adentro && Math.abs(toma.proporcion - toma.escena) < 0.03 && toma.alto > 80,
      "la vista Cámara no muestra la toma entera y en proporción: " + JSON.stringify(toma));
    await apretar('#dzComposition3D [data-v="perspective"]');

    // «Escalonar Z»: reparte los planos en profundidad (un paso de historial)
    const z0 = await ev(`JSON.stringify([...document.querySelectorAll("#dzComposition3D .cmp3-card span")].map(s => s.textContent))`);
    await apretar('#dzComposition3D [data-a="stagger"]'); await wait(300);
    const z1 = await ev(`JSON.stringify([...document.querySelectorAll("#dzComposition3D .cmp3-card span")].map(s => s.textContent))`);
    assert.notEqual(z1, z0, "«Escalonar Z» no cambió la profundidad de los planos: " + z1);

    // un CAMPO del inspector: clic, escribir, Enter
    await apretar('#dzComposition3D .cmp3-inspector input[data-p="x"]');
    assert.equal(await ev(`document.activeElement && document.activeElement.dataset.p`), "x", "el campo X del inspector no toma el foco con el clic");
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", modifiers: 2, windowsVirtualKeyCode: 65 });
    await send("Input.insertText", { text: "250" });
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 }); await wait(400);
    assert.match(await ev(`document.querySelector("#dzComposition3D .cmp3-card.selected").style.transform`), /translate3d\(250px/, "escribir X = 250 en el inspector no movió el plano");
    // ENTER CONFIRMA: el valor llega al documento con un paso de historial,
    // sin tener que salir del campo (antes sólo se movía la mesa)
    const conf = await ev(`({ hist: DZ.history.undoStack.at(-1)?.label, x: Object.values(DZ.doc.scene.composition.planes).some(p => p.transform && p.transform.x === 250) })`);
    assert.deepEqual(conf, { hist: "Transformar plano en escenario 3D", x: true }, "Enter en el campo X no confirmó el valor en el documento: " + JSON.stringify(conf));

    // con el LÁPIZ activo los botones también responden, y no dejan trazos en el dibujo
    await wait(600);
    const dib0 = await ev(`DZ.doc.drawing ? DZ.doc.drawing.content.length : 0`), antesTxt = await ev(`DZ.doc.drawing.content`);
    await ev(`(()=>{ dzSetTool("pencil"); return 1; })()`); await wait(200);
    await apretar('#dzComposition3D [data-v="front"]');
    assert.match(await vista(), /rotateX\(0deg\) rotateY\(0deg\)/, "con el lápiz activo, «Frente» no cambió la vista");
    await wait(400);
    assert.equal(await ev(`DZ.doc.drawing ? DZ.doc.drawing.content.length : 0`), dib0, "apretar la barra de Composición con el lápiz dibujó en la escena: " + JSON.stringify([antesTxt, await ev(`DZ.doc.drawing.content`)]));
    await ev(`(()=>{ dzSetTool("select"); return 1; })()`);

    await apretar('#dzComposition3D [data-a="2d"]'); await wait(500);
    assert.equal(await ev(`(()=>{ const r = document.querySelector("#dzComposition3D"); return !r || r.hidden || getComputedStyle(r).display === "none"; })()`), true, "«2D» no salió de la mesa de Composición");

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    assert.deepEqual(graves.slice(0, 3), [], "hubo excepciones durante el recorrido");
    console.log("E2E Composición: barra e inspector responden al mouse real");
  } finally {
    ws.close(); try { await fetch(endpoint + "/json/close/" + tab.id); } catch (_) { }
  }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
