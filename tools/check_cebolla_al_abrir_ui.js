/* PAPEL CEBOLLA EN UNA ESCENA ABIERTA (no recién creada). CDP :9223 + mock :8791.

   Reporte de Mauro (oct-2026, LOW 3.3.0): «el manejador del papel cebolla
   estilo OpenToonz no anda, eran los puntitos sobre la línea de tiempo; deben
   andar todos los sistemas de papel cebolla que teníamos, ahora no anda nada».

   MEDIDO en la app real, abriendo la escena desde Recientes:
   1. DZ.onionOn quedaba en false. Cerrar o cambiar de solapa lo apaga y sólo
      se prendía al CREAR un documento: abrir uno nunca lo volvía a prender, así
      que no andaba nada —relativos, fijos, faders—.
   2. Aun prendido, el papel cebolla VIEJO (dzOnionUpdate, el de antes del
      documento de escena) corría después de abrir, borraba TODOS los
      fantasmas y no pintaba nada.
   3. El botón «Papel cebolla» de la barra tenía su marca en «abierto» con el
      panel oculto: el primer clic «lo cerraba» y no se veía ningún cambio.

   Acá se abre una escena guardada con dzSceneOpen —lo que llama Recientes— y
   se aprieta todo con el mouse de verdad. */
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
  const clicEn = async (p, nombre) => {
    assert.ok(p, "no está «" + nombre + "» en pantalla");
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(450);
  };
  const centro = (expr) => ev(`(()=>{ const e = ${expr}; if (!e) return null; e.scrollIntoView({ block: "nearest", inline: "nearest" });
    const r = e.getBoundingClientRect(); if (!r.width) return null; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  /** Las opacidades de los fantasmas del documento que están en la hoja. */
  const fantasmas = () => ev(`[...document.querySelectorAll("#dzCanvas > svg > g.dz-onion:not(.dz-capa):not(.dz-capa-defs):not(.dz-onion-pose)")]
    .map(g => +(+g.getAttribute("opacity")).toFixed(2))`);
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
    // tres dibujos: F1, F6 y F12, guardados como una escena .low
    const DIB = (x) => '<g data-low-art="colour"></g><g data-low-art="line"><circle cx="' + x + '" cy="500" r="90" fill="none" stroke="#111" stroke-width="12"/></g>';
    for (const [f, x] of [[1, 400], [6, 900], [12, 1400]]) {
      await ev(`(()=>{ DZ.doc.goTo(${f}); return 1; })()`); await wait(350);
      await ev(`(()=>{ DZ.doc.writeDrawing(${JSON.stringify(DIB(x))}); DZ.doc.emit("frame"); return 1; })()`); await wait(450);
    }
    await ev(`(()=>{ const d = DZ.doc; d.goTo(12); const json = d.toJSON();
      (window.__lowFiles = window.__lowFiles || {})["C:\\\\mock\\\\cebolla.low"] = { path: "C:\\\\mock\\\\cebolla.low", name: "cebolla.low", content: json };
      d.dirty = false; DZ.dirty = false; return 1; })()`);
    // cerrar el documento (deja el papel cebolla apagado) y ABRIR la escena guardada
    await ev(`(async()=>{ await dzMenuAction("cerrar-documento"); return 1; })()`); await wait(1200);
    assert.equal(await ev(`!!DZ.doc`), false, "no se cerró el documento: la prueba no reproduce el camino de abrir");
    assert.equal(await ev(`(async()=>{ return await dzSceneOpen("C:\\\\mock\\\\cebolla.low"); })()`), true, "no se pudo abrir la escena guardada");
    await wait(1800);
    const abierto = await ev(`({ on: DZ.onionOn, frame: DZ.doc.frame, cells: DZ.doc.layer.cells.length })`);
    assert.equal(abierto.on, true, "al ABRIR una escena el papel cebolla queda apagado: " + JSON.stringify(abierto));
    assert.equal((await fantasmas()).length, 2, "al abrir la escena en F" + abierto.frame + " no se ven los fantasmas de los dos dibujos anteriores: " + JSON.stringify(await fantasmas()));

    // el botón de la línea de tiempo apaga y prende
    const toggle = await centro(`[...document.querySelectorAll(".tl2-tools button")].find(b => /papel cebolla/i.test(b.title))`);
    await clicEn(toggle, "Activar el papel cebolla");
    assert.equal((await fantasmas()).length, 0, "el botón de papel cebolla de la línea de tiempo no lo apagó");
    await clicEn(toggle, "Activar el papel cebolla");
    assert.equal((await fantasmas()).length, 2, "el botón de papel cebolla de la línea de tiempo no lo volvió a prender");

    // el PANEL se abre con UN clic
    await clicEn(await centro(`document.querySelector("#tlOnion")`), "Papel cebolla (panel)");
    assert.equal(await ev(`(()=>{ const p = document.querySelector("#dzOnionPanel"); return !p.hidden && p.getBoundingClientRect().width > 0; })()`), true,
      "el primer clic en «Papel cebolla» no abrió el panel");
    // fader −2 a cero: queda sólo el dibujo anterior
    // el pie del fader: un clic ahí lo lleva a cero
    const pieDelFader = (canal) => ev(`(()=>{ const ch = [...document.querySelectorAll("#onMixer .onion2-channel")].find(c => c.querySelector("label")?.textContent === "${canal}");
      const i = ch && ch.querySelector("input"); if (!i) return null; const r = i.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height - 3 }; })()`);
    await clicEn(await pieDelFader("−2"), "fader −2");
    assert.deepEqual(await fantasmas(), [0.38], "bajar el fader −2 no sacó el dibujo de dos atrás: " + JSON.stringify(await fantasmas()));

    // los PUNTITOS de la línea de tiempo: fijar F1 lo trae aunque el fader no lo incluya
    await clicEn(await centro(`document.querySelector('.tl2-lightcell[data-frame="1"]')`), "punto de referencia del F1");
    assert.deepEqual(await ev(`DZ.doc.onionCfg.fixed`), [1], "el punto del F1 no lo fijó como referencia");
    assert.equal((await fantasmas()).length, 2, "fijar el F1 con el punto de la línea de tiempo no trajo su fantasma: " + JSON.stringify(await fantasmas()));
    await clicEn(await centro(`document.querySelector('.tl2-lightcell[data-frame="1"]')`), "punto de referencia del F1");
    assert.deepEqual(await fantasmas(), [0.38], "volver a apretar el punto del F1 no quitó la referencia");

    // «+ acá» del panel fija el cuadro actual
    await ev(`(()=>{ DZ.doc.goTo(6); return 1; })()`); await wait(400);
    await clicEn(await centro(`document.querySelector("#onFixAdd")`), "+ acá");
    assert.deepEqual(await ev(`DZ.doc.onionCfg.fixed`), [6], "«+ acá» no fijó el cuadro actual");

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    assert.deepEqual(graves.slice(0, 3), [], "hubo excepciones durante el recorrido");
    console.log("E2E papel cebolla en una escena abierta OK · relativo, fijos, faders y panel");
  } finally {
    ws.close(); try { await fetch(endpoint + "/json/close/" + tab.id); } catch (_) { }
  }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
