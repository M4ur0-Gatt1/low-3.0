/* LA CÁMARA 2D QUE SE ENTIENDE. CDP :9223 + mock :8791.

   Reporte de Mauro (oct-2026, LOW 3.6.0), en el espacio Cámara, cuadro 35
   «interpolada»: «creo que me faltan opciones de movimientos de cámara; acá
   se me movió la cámara pero no tengo idea de cómo se movió».

   Con el mouse y el teclado de verdad:
   1. La pestaña Cámara ENTRA en modo cámara y muestra el panel.
   2. Arrastrar el encuadre deja una clave, y Ctrl+Z la saca (antes la cámara
      no entraba al historial: Ctrl+Z deshacía otra cosa). Ctrl+Y la vuelve.
   3. Los campos del panel ANDAN: Zoom 150 deja la clave con ese zoom.
   4. «Paneo →» con duración 12 deja claves en 1 y 13 y la cámara pasa por el
      medio; queda UN paso de historial con nombre.
   5. La lista de claves: clic en F013 va al cuadro 13.
   6. La curva «Corte» del tramo deja la cámara quieta hasta la clave siguiente.
   7. «Temblor» agrega claves y vuelve exacta al encuadre; UN Ctrl+Z lo saca.
   8. El recorrido se pinta sobre el lienzo, y no es un <svg> (pasaría por dibujo).
   9. «Ver por la cámara» encuadra la vista en la cámara de cada cuadro y al
      apagarlo vuelve la vista de antes.
   10. Lo que la movía sin querer:
       - otra herramienta apaga el modo cámara (antes: botón prendido, encuadre muerto);
       - cerrar la línea de tiempo apaga el modo ENTERO: un arrastre sobre el
         encuadre ya no deja clave;
       - Ventana → Cámara prende y apaga el modo (estaba invertido). */
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
  const centro = (sel) => ev(`(()=>{ const e = ${sel}; if (!e) return null; e.scrollIntoView?.({ block: "nearest" }); const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } : null; })()`);
  const clic = async (sel, que) => {
    const p = await centro(sel); assert.ok(p, "no se ve " + que);
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(250);
  };
  const arrastrar = async (p, dx, dy) => {
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 10; i++) { await mouse("mouseMoved", p.x + dx * i / 10, p.y + dy * i / 10, { buttons: 1 }); await wait(16); }
    await mouse("mouseReleased", p.x + dx, p.y + dy, { buttons: 0, clickCount: 1 }); await wait(250);
  };
  const tecla = async (key, code, vk, mods = 0) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers: mods });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers: mods }); await wait(300);
  };
  const CTRL = 2;
  const escribir = async (sel, texto) => {
    await clic(sel, sel);
    await ev(`(()=>{ const e = ${sel}; e.select(); return true; })()`);
    await send("Input.insertText", { text: texto });
    await tecla("Enter", "Enter", 13); await ev(`(()=>{ document.activeElement?.blur?.(); return true; })()`); await wait(200);
  };
  const claves = () => ev(`Object.keys(dzCamKeys()).map(Number).sort((a,b)=>a-b)`);
  const P = (s) => `document.querySelector('#dzCamPanel ${s}')`;

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 820, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!window.LOW?.camara2d').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} return true; })()');
    await send("Page.reload", { ignoreCache: true });
    for (let i = 0; i < 120; i++) { if (await ev('!!document.querySelector("#dzBienvenida2D [data-a=nuevo]:not([disabled])")').catch(() => false)) break; await wait(300); }
    await clic(`document.querySelector('#dzBienvenida2D [data-a="nuevo"]')`, "Nuevo documento"); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');

    // ── 1. la pestaña Cámara ENTRA en modo cámara ───────────────────────────
    await clic(`[...document.querySelectorAll("#dzWorkspaces .dz-ws-tab")].find(b => b.textContent.trim() === "Cámara")`, "la pestaña Cámara");
    await wait(800);
    const modo = await ev(`({ cam: !!DZ.camMode, tool: DZ.tool, panel: !!document.querySelector("#dzCamPanel:not([hidden])"), dataTool: document.querySelector("#dzCanvas").dataset.tool })`);
    assert.deepEqual(modo, { cam: true, tool: "camera", panel: true, dataTool: "camera" }, "la pestaña Cámara no entra en modo cámara: " + JSON.stringify(modo));
    assert.deepEqual(await claves(), [], "un documento nuevo ya trae claves de cámara");

    // ── 2. arrastrar deja clave; Ctrl+Z la saca; Ctrl+Y la vuelve ───────────
    const enc = await centro(`document.querySelector("#dzCam")`);
    await arrastrar({ x: enc.x - enc.w * 0.2, y: enc.y }, 90, 0);
    const trasArrastre = await claves();
    assert.deepEqual(trasArrastre, [1], "arrastrar el encuadre no dejó UNA clave en el cuadro 1: " + JSON.stringify(trasArrastre));
    const cx1 = await ev(`dzCamKeys()[1].cx`), cx0 = await ev(`dzCamDefault().cx`);
    assert.ok(cx1 > cx0 + 20, "el arrastre no movió la cámara: " + cx1 + " vs " + cx0);
    await ev(`(()=>{ document.activeElement?.blur?.(); return true; })()`);
    await tecla("z", "KeyZ", 90, CTRL);
    assert.deepEqual(await claves(), [], "Ctrl+Z no saca la clave de cámara (antes deshacía otra cosa)");
    await tecla("y", "KeyY", 89, CTRL);
    assert.deepEqual(await claves(), [1], "Ctrl+Y no vuelve la clave de cámara");
    await tecla("z", "KeyZ", 90, CTRL);

    // ── 3. los campos ANDAN ────────────────────────────────────────────────
    await escribir(P('[data-c="zoom"]'), "150");
    const z = await ev(`(()=>{ const k = dzCamKeys()[1]; return k ? Math.round(dzVB()[2] / k.w * 100) : null; })()`);
    assert.equal(z, 150, "el campo Zoom del panel no deja la clave con ese zoom");
    await tecla("z", "KeyZ", 90, CTRL);
    assert.deepEqual(await claves(), [], "Ctrl+Z no deshace el cambio de zoom del panel");

    // ── 4. «Paneo →» en 12 cuadros ──────────────────────────────────────────
    await escribir(P('[data-a="duracion"]'), "12");
    const pasos0 = await ev(`DZ.history.undoStack.length`);
    await clic(P('[data-m="paneo-der"]'), "«Paneo →»");
    const paneo = await ev(`({ claves: Object.keys(dzCamKeys()).map(Number), a: dzCamAt(1).cx, m: dzCamAt(7).cx, b: dzCamAt(13).cx,
      pasos: DZ.history.undoStack.length - ${pasos0}, nombre: DZ.history.undoStack[DZ.history.undoStack.length - 1]?.label })`);
    assert.deepEqual(paneo.claves, [1, 13], "«Paneo →» en 12 cuadros no deja claves en 1 y 13: " + JSON.stringify(paneo));
    assert.ok(paneo.b > paneo.a && paneo.m > paneo.a && paneo.m < paneo.b, "la cámara no pasa por el medio del paneo: " + JSON.stringify(paneo));
    assert.equal(paneo.pasos, 1, "el paneo no es UN paso de historial");
    assert.match(paneo.nombre || "", /Paneo a la derecha/, "el paso de historial no dice qué movimiento fue");

    // ── 5. la lista: clic en F013 va al cuadro 13 ───────────────────────────
    const filas = await ev(`[...document.querySelectorAll("#dzCamPanel .cam2d-lista li[data-f]")].map(li => li.dataset.f)`);
    assert.deepEqual(filas, ["1", "13"], "la lista de claves no muestra las claves: " + JSON.stringify(filas));
    await clic(P('.cam2d-lista li[data-f="13"] b'), "la fila F013");
    assert.equal(await ev(`DZ.doc.frame`), 13, "clic en la clave F013 no va al cuadro 13");
    // la barra de opciones de la herramienta sigue al cuadro (quedaba con los
    // valores del cuadro en que se eligió la herramienta)
    const barra = await ev(`({ x: +document.querySelector("#toCamX")?.value, cx: Math.round(dzCamAt(13).cx * 10) / 10 })`);
    assert.equal(barra.x, barra.cx, "la X de la barra no sigue al cuadro: " + JSON.stringify(barra));
    // el dial de la mesa no tapa el encuadre (su esquina de zoom cae abajo a la derecha)
    const capas = await ev(`({ dial: +getComputedStyle(document.querySelector("#dzDisc")).zIndex, cam: +getComputedStyle(document.querySelector("#dzCam")).zIndex })`);
    assert.ok(capas.dial < capas.cam, "el dial de la mesa queda encima del encuadre de cámara: " + JSON.stringify(capas));

    // ── 6. la curva «Corte» ─────────────────────────────────────────────────
    await clic(P('.cam2d-lista li[data-f="1"] b'), "la fila F001");
    await ev(`(()=>{ const s = document.querySelector('#dzCamPanel [data-a="curva"]'); s.focus(); s.value = "hold"; s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
    const corte = await ev(`({ ease: dzCamKeys()[1].ease, m: dzCamAt(12).cx, a: dzCamKeys()[1].cx, b: dzCamAt(13).cx })`);
    assert.equal(corte.ease, "hold", "la curva no quedó en la clave del tramo");
    assert.equal(corte.m, corte.a, "con «Corte», la cámara no se queda quieta hasta la clave siguiente: " + JSON.stringify(corte));
    await tecla("z", "KeyZ", 90, CTRL);
    assert.equal(await ev(`dzCamKeys()[1].ease || "inout"`), "inout", "Ctrl+Z no deshace la curva");

    // ── 7. temblor: un paso, vuelve exacto ──────────────────────────────────
    await clic(P('.cam2d-lista li[data-f="13"] b'), "la fila F013");
    const base = await ev(`JSON.stringify(dzCamAt(13))`);
    await clic(P('[data-a="temblor"]'), "«Temblor»");
    const tiembla = await ev(`({ n: Object.keys(dzCamKeys()).length, fin: JSON.stringify(dzCamAt(25)), mueve: dzCamAt(15).cx !== dzCamAt(13).cx })`);
    assert.ok(tiembla.n > 5 && tiembla.mueve, "«Temblor» no agrega claves que muevan la cámara: " + JSON.stringify(tiembla));
    assert.equal(tiembla.fin, base, "el temblor no vuelve exacto al encuadre");
    await tecla("z", "KeyZ", 90, CTRL);
    assert.deepEqual(await claves(), [1, 13], "UN Ctrl+Z no saca el temblor entero");

    // ── 8. el recorrido ─────────────────────────────────────────────────────
    const rec = await ev(`(()=>{ const c = document.querySelector("#dzCamRecorrido"); if (!c || c.hidden) return null;
      const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 40) n++;
      return { pintados: n, svg: document.querySelectorAll("#dzCanvas > svg ~ svg.cam2d-recorrido, #dzCamRecorrido svg").length, tag: c.tagName }; })()`);
    assert.ok(rec && rec.pintados > 80, "el recorrido de la cámara no se pinta: " + JSON.stringify(rec));
    assert.equal(rec.tag, "CANVAS", "el recorrido tiene que ser un <canvas>, no un <svg>");

    // ── 9. ver por la cámara ────────────────────────────────────────────────
    const vista0 = await ev(`({ z: DZ.zoom, px: DZ.panX || 0, py: DZ.panY || 0 })`);
    await clic(P('[data-a="porcamara"]'), "«Ver por la cámara»");
    await wait(600);
    const mira = await ev(`(()=>{ const b = document.querySelector("#dzCam").getBoundingClientRect(), c = document.querySelector("#dzCanvas").getBoundingClientRect();
      return { cx: Math.round(b.x + b.width / 2 - (c.x + c.width / 2)), cy: Math.round(b.y + b.height / 2 - (c.y + c.height / 2)),
        llenaAncho: b.width / (c.width - 40), llenaAlto: b.height / (c.height - 40) }; })()`);
    assert.ok(Math.abs(mira.cx) <= 3 && Math.abs(mira.cy) <= 3, "«Ver por la cámara» no centra el encuadre: " + JSON.stringify(mira));
    assert.ok(Math.max(mira.llenaAncho, mira.llenaAlto) > 0.97, "«Ver por la cámara» no llena la vista con el encuadre: " + JSON.stringify(mira));
    await clic(P('.cam2d-lista li[data-f="1"] b'), "la fila F001");
    await wait(300);
    const mira1 = await ev(`(()=>{ const b = document.querySelector("#dzCam").getBoundingClientRect(), c = document.querySelector("#dzCanvas").getBoundingClientRect();
      return { cx: Math.round(b.x + b.width / 2 - (c.x + c.width / 2)), cy: Math.round(b.y + b.height / 2 - (c.y + c.height / 2)) }; })()`);
    assert.ok(Math.abs(mira1.cx) <= 3 && Math.abs(mira1.cy) <= 3, "al cambiar de cuadro, la vista no sigue a la cámara: " + JSON.stringify(mira1));
    await clic(P('[data-a="porcamara"]'), "«Ver por la cámara»");
    const vista1 = await ev(`({ z: DZ.zoom, px: DZ.panX || 0, py: DZ.panY || 0 })`);
    assert.deepEqual(vista1, vista0, "apagar «Ver por la cámara» no vuelve la vista de antes");

    // ── 10. lo que la movía sin querer ──────────────────────────────────────
    // a. otra herramienta apaga el modo
    await clic(`document.querySelector('.dz-toolbtn[data-tool="pencil"]')`, "el lápiz");
    const conLapiz = await ev(`({ cam: !!DZ.camMode, boton: document.querySelector("#dzCamBtn").classList.contains("active"), panel: !!document.querySelector("#dzCamPanel:not([hidden])") })`);
    assert.deepEqual(conLapiz, { cam: false, boton: false, panel: false }, "elegir el lápiz no apaga el modo cámara: " + JSON.stringify(conLapiz));
    // b. cerrar la línea de tiempo con el modo cámara prendido
    await ev(`(()=>{ if (!DZ.camMode) dzCamToggle(); return DZ.camMode; })()`);
    await ev(`(async()=>{ if (DZ.anim) await dzAnimToggle(); return !DZ.anim; })()`);
    await wait(300);
    const cerrada = await ev(`({ cam: !!DZ.camMode, tool: DZ.tool, dataTool: document.querySelector("#dzCanvas").dataset.tool })`);
    assert.ok(!cerrada.cam && cerrada.dataTool !== "camera" && cerrada.tool !== "camera", "cerrar la línea de tiempo deja la herramienta cámara a medias: " + JSON.stringify(cerrada));
    const antesSinQuerer = JSON.stringify(await ev(`dzCamKeys()`));
    await ev(`(()=>{ if (typeof dzCamGuiaActiva === "function" && !dzCamGuiaActiva()) dzCamGuiaAlternar?.(); dzCamOverlay(); return true; })()`);
    const guia = await centro(`document.querySelector("#dzCam:not([hidden])")`);
    if (guia) {
      await ev('(()=>{ dzSetTool("select"); return true; })()');
      await arrastrar({ x: guia.x, y: guia.y }, 70, 30);
      assert.equal(JSON.stringify(await ev(`dzCamKeys()`)), antesSinQuerer, "con el modo cámara apagado, un arrastre sobre el encuadre dejó una clave");
    }
    // c. Ventana → Cámara prende y apaga el MODO
    await ev(`(()=>{ if (!DZ.anim) dzAnimToggle(); return true; })()`); await wait(500);
    // con la GUÍA a la vista (#dzCam visible sin el modo): ahí la orden se invertía
    const guiaVisible = await ev(`(()=>{ if (DZ.camMode) dzCamToggle(); if (typeof dzCamGuiaActiva === "function" && !dzCamGuiaActiva()) dzCamGuiaAlternar?.(); dzCamOverlay(); return !document.querySelector("#dzCam").hidden && !DZ.camMode; })()`);
    assert.ok(guiaVisible, "no se pudo dejar la guía de cámara a la vista para probar Ventana → Cámara");
    await ev(`(()=>{ dzWindowPanelSet("camera", true); return true; })()`);
    const ventanaSi = await ev(`!!DZ.camMode`);
    await ev(`(()=>{ dzWindowPanelSet("camera", false); return true; })()`);
    const ventanaNo = await ev(`!!DZ.camMode`);
    assert.deepEqual([ventanaSi, ventanaNo], [true, false], "Ventana → Cámara no prende y apaga el modo (estaba invertido con la guía a la vista)");

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E cámara 2D OK", JSON.stringify({ paneo: paneo.claves, temblor: tiembla.n, recorrido: rec.pintados, porCamara: mira }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e); process.exit(1); });
