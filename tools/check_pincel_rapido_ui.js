/* EL CLIC DERECHO DEL LÁPIZ ABRE EL PINCEL (v3.35). CDP :9223 + mock :8791.

   Pedidos de Mauro: «quiero que el clic derecho del lápiz de la tableta
   muestre las opciones de pincel o del lápiz: el suavizado, el espesor y la
   presión; quiero poder desactivar, activar o variar la presión del pincel»
   y «el dial de suavizado no muestra el porcentaje».

   Con el lápiz simulado por CDP (pointerType "pen"):
   1. Con el Pincel, el botón lateral (clic derecho del lápiz) abre el panel
      ahí, sin dibujar y sin el menú de siempre.
   2. Espesor y Suavizado del panel son los de la barra y el inspector.
   3. Presión: apagarla = «Ancho fijo»; prenderla de nuevo.
   4. Variación 50 %: el trazo de pincel guarda la mitad de «presión → tamaño»
      del pincel, y el trazo hecho con presión sale menos variable.
   5. Esc lo cierra. El clic derecho del MOUSE sigue abriendo el menú.
   6. Con el Lápiz: el panel dice «Lápiz» y la presión aparece apagada.
   7. Si Windows manda el botón lateral como clic del mouse, con el lápiz
      flotando sobre la hoja, también abre el panel.
   8. A media pantalla (1000×560) el suavizado y su valor en % se ven en la
      barra (antes quedaban fuera de la vista). */
const assert = require("assert");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const tab = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(), errores = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data);
    if (d.method === "Runtime.exceptionThrown") errores.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    const p = pending.get(d.id); if (p) { pending.delete(d.id); d.error ? p.j(Error(d.error.message)) : p.r(d.result); } };
  const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; pending.set(n, { r, j }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const pen = (type, x, y, force, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", pointerType: "pen", force, ...extra });
  const derecho = async (x, y, tipo) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "right", buttons: 2, clickCount: 1, pointerType: tipo });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "right", buttons: 0, clickCount: 1, pointerType: tipo });
    await wait(250);
  };
  const flotar = async (x, y) => { for (let i = 0; i < 4; i++) { await pen("mouseMoved", x - 12 + i * 4, y, 0); await wait(30); } };
  const estado = () => ev(`(()=>{ const p = document.querySelector("#dzPincelRapido"); const r = p && !p.hidden ? p.getBoundingClientRect() : null;
    return { panel: !!r, x: r ? Math.round(r.x) : 0, y: r ? Math.round(r.y) : 0, menu: !!document.querySelector(".ctx-command-menu"),
      trazos: document.querySelectorAll("#dzCanvas > svg [data-low-brush-points], #dzCanvas > svg g[data-low-art] path[fill='none']").length,
      titulo: p ? (p.querySelector(".pr-cab strong") || {}).textContent : "" }; })()`);
  const control = (k, v) => ev(`(()=>{ const i = document.querySelector('#dzPincelRapido [data-pr="${k}"]'); i.value = ${JSON.stringify(String(v))}; i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  const tocar = async (k) => {
    const p = await ev(`(()=>{ const b = document.querySelector('#dzPincelRapido [data-pr="${k}"]'); const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    await pen("mouseMoved", p[0], p[1], 0); await pen("mousePressed", p[0], p[1], .5, { buttons: 1, clickCount: 1 }); await pen("mouseReleased", p[0], p[1], 0, { buttons: 0, clickCount: 1 }); await wait(150);
  };
  const preparar = async (ancho, alto) => {
    await send("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    // sin lo que otra prueba dejó guardado (las opciones se leen al cargar): borrar y RECARGAR
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} location.reload(); return true; })()');
    await wait(500);
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); dzSetTool("brush"); DZ.brushPreset = "clean-ink"; dzToolOptsRender(); return true; })()'); await wait(300);
    return ev(`(()=>{ const r = document.querySelector("#dzCanvas > svg").getBoundingClientRect(); return [Math.round(r.x + r.width * .5), Math.round(r.y + r.height * .5)]; })()`);
  };

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    const c = await preparar(1500, 900);

    // ── 1. el botón lateral abre el panel, sin dibujar ni menú ──
    await flotar(c[0], c[1]); await wait(900);
    await derecho(c[0], c[1], "pen");
    let s = await estado();
    assert.ok(s.panel, "el clic derecho del lápiz no abrió el panel del pincel: " + JSON.stringify(s));
    assert.ok(!s.menu && s.trazos === 0, "el clic derecho del lápiz dibujó o abrió el menú: " + JSON.stringify(s));
    assert.ok(Math.abs(s.x - c[0]) < 60 && Math.abs(s.y - c[1]) < 60, "el panel no se abrió donde está la punta: " + JSON.stringify({ s, c }));
    assert.ok(/Tinta limpia/.test(s.titulo), "el panel no dice qué pincel es: " + s.titulo);

    // ── 2. espesor y suavizado: los de la barra y el inspector ──
    await control("espesor", 20); await control("suavizado", 70);
    const sync = await ev(`({ w: DZ.drawW, barW: +document.querySelector("#toW").value, insW: +document.querySelector("#dzDrawW").value,
      s: DZ.smooth, barS: document.querySelector("#toSmoothLbl").textContent, insS: +document.querySelector("#dzSmooth").value })`);
    assert.deepStrictEqual(sync, { w: 20, barW: 20, insW: 20, s: 70, barS: "70", insS: 70 }, "el panel no mueve el espesor o el suavizado de la barra y el inspector");

    // ── 3. presión: apagar = ancho fijo ──
    await tocar("presion");
    assert.strictEqual(await ev(`DZ.anchoFijo === true && document.querySelector('#dzPincelRapido [data-pr="variacion"]').disabled`), true, "apagar la presión no dejó el ancho fijo (o la variación sigue activa)");
    await tocar("presion");
    assert.strictEqual(await ev(`DZ.anchoFijo === false`), true, "no se pudo volver a prender la presión");

    // ── 4. variación 50 %: se guarda con el trazo ──
    await control("variacion", 50);
    await ev(`(()=>{ LOW.drawing.pincelRapido.cerrar(); return true; })()`);
    const trazoConPresion = async (dy) => {
      await pen("mouseMoved", c[0] - 200, c[1] + dy, 0); await pen("mousePressed", c[0] - 200, c[1] + dy, .1, { buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 20; i++) { await pen("mouseMoved", c[0] - 200 + i * 15, c[1] + dy, .1 + .85 * i / 20, { buttons: 1 }); await wait(15); }
      await pen("mouseReleased", c[0] + 100, c[1] + dy, 0, { buttons: 0, clickCount: 1 }); await wait(400);
    };
    await trazoConPresion(-150);
    const cfg = await ev(`(()=>{ const e = [...document.querySelectorAll("#dzCanvas > svg [data-low-brush-points]")].pop(); return { guardada: JSON.parse(e.getAttribute("data-low-brush-config")).pressureSize, pincel: LOW.drawing.brushes.get("clean-ink").pressureSize }; })()`);
    assert.ok(Math.abs(cfg.guardada - cfg.pincel * .5) < 1e-6, "la variación de presión al 50 % no quedó guardada en el trazo: " + JSON.stringify(cfg));

    // ── 5. Esc cierra; el mouse sigue con su menú ──
    await flotar(c[0] + 150, c[1] + 150); await wait(900); await derecho(c[0] + 150, c[1] + 150, "pen");
    assert.ok((await estado()).panel, "el panel no volvió a abrir");
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 }); await wait(150);
    assert.ok(!(await estado()).panel, "Esc no cerró el panel");
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: c[0] + 200, y: c[1] + 160, pointerType: "mouse" }); await wait(700);
    await derecho(c[0] + 200, c[1] + 160, "mouse");
    s = await estado();
    assert.ok(s.menu && !s.panel, "el clic derecho del MOUSE dejó de abrir el menú (o abrió el panel): " + JSON.stringify(s));
    await ev(`(()=>{ if (typeof closeCtxMenu === "function") closeCtxMenu(); if (typeof dzDeselect === "function") dzDeselect(); return true; })()`); await wait(200);

    // ── 6. con el Lápiz ──
    await ev('(()=>{ dzSetTool("pencil"); return true; })()'); await wait(200);
    await flotar(c[0] + 220, c[1] - 120); await wait(900); await derecho(c[0] + 220, c[1] - 120, "pen");
    s = await estado();
    assert.ok(s.panel && s.titulo === "Lápiz", "con el Lápiz el panel no abre o no dice «Lápiz»: " + JSON.stringify(s));
    assert.strictEqual(await ev(`document.querySelector('#dzPincelRapido [data-pr="presion"]').disabled`), true, "con el Lápiz la presión no aparece apagada");
    await tocar("unir");
    assert.strictEqual(await ev(`!!DZ.unirPuntas`), true, "«Unir puntas» del panel no prende la opción");
    await ev(`LOW.drawing.pincelRapido.cerrar()`);

    // ── 7. el controlador lo manda como clic del mouse, con el lápiz flotando ──
    await flotar(c[0] - 220, c[1] + 120); await derecho(c[0] - 220, c[1] + 120, "mouse");
    s = await estado();
    assert.ok(s.panel && !s.menu, "el botón lateral mandado como clic del mouse (lápiz flotando) no abrió el panel: " + JSON.stringify(s));
    await ev(`LOW.drawing.pincelRapido.cerrar()`);

    // ── 7b. LAS FORMAS REALES DEL BOTÓN LATERAL (v3.36.1: con la lapicera de
    //    Mauro «no hace nada»). Con el Pincel y lejos de lo dibujado:
    await ev('(()=>{ dzSetTool("brush"); LOW.drawing.pincelRapido.cerrar(); return true; })()'); await wait(800);
    const hay = () => ev(`document.querySelectorAll("#dzCanvas > svg [data-low-brush-points]").length`);
    const n0 = await hay();
    //  b1. BOTÓN + TOCAR: un toque corto y, al levantar, el clic derecho de Windows
    const T = [c[0] + 240, c[1] + 40];
    await pen("mouseMoved", T[0], T[1], 0); await wait(40);
    await pen("mousePressed", T[0], T[1], .5, { buttons: 1, clickCount: 1 }); await wait(60);
    await pen("mouseReleased", T[0], T[1], 0, { buttons: 0, clickCount: 1 }); await wait(30);
    await ev(`(()=>{ const el = document.elementFromPoint(${T[0]}, ${T[1]}); el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: ${T[0]}, clientY: ${T[1]}, button: 2 })); return true; })()`); await wait(250);
    s = await estado();
    assert.ok(s.panel && !s.menu, "BOTÓN + TOCAR (un toque y el clic derecho al levantar) no abrió el panel: " + JSON.stringify(s));
    assert.strictEqual(await hay(), n0, "el toque del botón lateral dejó un trazo");
    await ev(`LOW.drawing.pincelRapido.cerrar()`); await wait(800);
    //  b1'. LO QUE MANDA LA LAPICERA DE MAURO (medido en la app real): todo es
    //  button 0; el botón sólo se nota en el clic derecho «de lapicera» que
    //  Windows manda al levantar tras ~700 ms con la punta QUIETA
    const Q = [c[0] + 200, c[1] + 140];
    await pen("mouseMoved", Q[0], Q[1], 0); await wait(40);
    await pen("mousePressed", Q[0], Q[1], .3, { buttons: 1, clickCount: 1 });
    for (let i = 0; i < 6; i++) { await pen("mouseMoved", Q[0] + (i % 2), Q[1], .3 + i * .1, { buttons: 1 }); await wait(110); }
    await pen("mouseReleased", Q[0] + 1, Q[1], 0, { buttons: 0, clickCount: 1 }); await wait(5);
    await ev(`(()=>{ const el = document.elementFromPoint(${Q[0]}, ${Q[1]}); el.dispatchEvent(new PointerEvent("contextmenu", { bubbles: true, cancelable: true, clientX: ${Q[0]}, clientY: ${Q[1]}, pointerType: "pen", button: -1 })); return true; })()`); await wait(300);
    s = await estado();
    assert.ok(s.panel && !s.menu, "la lapicera de Mauro (punta quieta ~700 ms y el clic derecho al levantar) no abrió el panel: " + JSON.stringify(s));
    assert.strictEqual(await hay(), n0, "el toque quieto del botón dejó un punto en la hoja");
    await ev(`LOW.drawing.pincelRapido.cerrar()`); await wait(800);
    //  b2. BOTÓN APRETADO CON LA PUNTA APOYADA: button 0 con el bit del botón lateral (buttons 3)
    const U = [c[0] + 260, c[1] - 60];
    await pen("mouseMoved", U[0], U[1], 0); await wait(40);
    await pen("mousePressed", U[0], U[1], .5, { buttons: 3, clickCount: 1 }); await wait(60);
    await pen("mouseMoved", U[0] + 20, U[1], .5, { buttons: 3 }); await wait(30);
    await pen("mouseReleased", U[0] + 20, U[1], 0, { buttons: 0, clickCount: 1 }); await wait(250);
    s = await estado();
    assert.ok(s.panel && !s.menu, "el botón lateral apretado con la punta apoyada (buttons 3) no abrió el panel: " + JSON.stringify(s));
    assert.strictEqual(await hay(), n0, "el botón lateral con la punta apoyada dibujó");
    await ev(`LOW.drawing.pincelRapido.cerrar()`); await wait(800);
    //  b3. BOTÓN CON LA PUNTA EN EL AIRE: un movimiento del lápiz con el bit 2
    const V = [c[0] - 260, c[1] - 60];
    await pen("mouseMoved", V[0], V[1], 0); await wait(40);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: V[0] + 3, y: V[1], button: "right", buttons: 2, pointerType: "pen", force: 0 }); await wait(250);
    s = await estado();
    assert.ok(s.panel && !s.menu, "el botón lateral con la punta en el aire (movimiento con buttons 2) no abrió el panel: " + JSON.stringify(s));
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: V[0] + 6, y: V[1], button: "none", buttons: 0, pointerType: "pen", force: 0 });
    await ev(`LOW.drawing.pincelRapido.cerrar()`); await wait(800);
    //  b4. un TRAZO de verdad y el clic derecho de la pulsación larga: se sigue descartando
    await pen("mouseMoved", c[0] - 100, c[1] + 120, 0); await pen("mousePressed", c[0] - 100, c[1] + 120, .5, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 16; i++) { await pen("mouseMoved", c[0] - 100 + i * 6, c[1] + 120, .5, { buttons: 1 }); await wait(30); }
    await pen("mouseReleased", c[0] - 4, c[1] + 120, 0, { buttons: 0, clickCount: 1 }); await wait(30);
    await ev(`(()=>{ const el = document.elementFromPoint(${c[0] - 4}, ${c[1] + 120}); el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: ${c[0] - 4}, clientY: ${c[1] + 120}, button: 2 })); return true; })()`); await wait(250);
    s = await estado();
    assert.ok(!s.panel && !s.menu, "el clic derecho de la pulsación larga tras un trazo abrió el panel o el menú: " + JSON.stringify(s));

    // ── 7c. SHIFT+B (el botón de la lapicera con una tecla asignada: lo que
    //    sí anda con la Huion de Mauro) y la ayuda para configurarlo ──
    const tecla = async (key, code, vk, mods = 0) => { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers: mods });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers: mods }); await wait(250); };
    await ev(`(()=>{ document.activeElement?.blur?.(); return true; })()`);
    await pen("mouseMoved", c[0] - 120, c[1] + 60, 0); await wait(80);
    await tecla("B", "KeyB", 66, 8);
    s = await estado();
    assert.ok(s.panel && Math.abs(s.x - (c[0] - 120)) < 60, "Shift+B no abrió el panel del pincel donde está la lapicera: " + JSON.stringify(s));
    assert.ok(await ev(`!!document.querySelector('#dzPincelRapido [data-pr="ayuda-lapicera"]')`), "el panel no explica cómo ponérselo al botón de la lapicera");
    await ev(`(()=>{ document.activeElement?.blur?.(); return true; })()`);
    await tecla("B", "KeyB", 66, 8);
    assert.ok(!(await estado()).panel, "Shift+B otra vez no cerró el panel");
    await ev(`dzMenuAction("lapicera")`); await wait(300);
    assert.ok(await ev(`!!document.querySelector("#lapPrueba") && !document.querySelector("#overlay").hidden`), "Ayuda → «Configurar el botón de la lapicera…» no abrió la explicación");
    await tecla("B", "KeyB", 66, 8);
    const prueba = await ev(`({ cls: document.querySelector("#lapPrueba").className, txt: document.querySelector("#lapPrueba").textContent, panel: !!(document.querySelector("#dzPincelRapido") && !document.querySelector("#dzPincelRapido").hidden) })`);
    assert.ok(/ok/.test(prueba.cls) && /Anda/.test(prueba.txt) && !prueba.panel, "la prueba en vivo no reconoció Shift+B (o abrió el panel por detrás): " + JSON.stringify(prueba));
    await tecla("K", "KeyK", 75, 0);
    assert.match(await ev(`document.querySelector("#lapPrueba").textContent`), /Llegó «K»/, "la prueba en vivo no dice qué tecla llegó");
    await ev(`document.querySelector("#lapCerrar").click()`); await wait(200);
    assert.ok(await ev(`document.querySelector("#overlay").hidden`), "«Listo» no cerró la explicación");

    // ── 8. a media pantalla el suavizado y su % se ven ──
    await preparar(1000, 560);
    const barra = await ev(`(()=>{ const box = document.querySelector("#dzToolOpts"), l = document.querySelector("#toSmoothLbl"), r = box.getBoundingClientRect(), q = l.getBoundingClientRect();
      return { dentro: q.width > 0 && q.left >= r.left - 1 && q.right <= r.right + 1, sobra: box.scrollWidth - box.clientWidth,
        texto: l.textContent + getComputedStyle(l, "::after").content.replace(/"/g, "") }; })()`);
    assert.ok(barra.dentro && barra.sobra <= 1, "a media pantalla el suavizado queda fuera de la vista de la barra: " + JSON.stringify(barra));
    assert.ok(/^\d+ ?%$/.test(barra.texto), "el valor del suavizado no se lee como porcentaje: " + JSON.stringify(barra));

    assert.deepStrictEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E clic derecho del lápiz → pincel OK", JSON.stringify({ cfg, barra }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
