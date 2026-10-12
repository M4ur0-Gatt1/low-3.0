/* LIPSYNC DESDE EL TEXTO, EN EL EDITOR. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026, LOW 3.20): escribir un diálogo y que LOW arme la
   animación de la boca en la línea de tiempo, con las bocas del personaje.

   Con el teclado y el ratón de verdad, una escena de 120 cuadros, una boca de
   ocho dibujos (uno por visema, con su nombre) y una clave a mano en F100:
   1. La sección «Desde el texto» reconoce la boca y asigna cada visema a su
      dibujo por el nombre.
   2. Escribir el diálogo e inicio 10: la vista previa muestra los visemas.
   3. «Crear las claves»: claves desde F10, sin dos iguales seguidas, todas en
      el tramo del diálogo, con la M de «mamá» cerrando los labios; la clave a
      mano de F100 sigue ahí; UN paso de historial; la reproducción (rigSwitchAt)
      ve la boca correcta.
   4. Volver a generarlo desde F30: no quedan restos del de F10.
   5. Ctrl+Z y Ctrl+Y.
   6. Se guarda con la escena: el JSON reabierto trae el diálogo, el mapa y las
      claves.
   7. A 12 fps el mismo diálogo ocupa la mitad de cuadros.
   8. Respeta el final de la escena y lo avisa.
   9. Elegir a mano la boca de un visema cambia las claves y queda guardado.
   10. Otro personaje con sólo tres bocas (cerrada/media/abierta): se reparten
       por orden y las claves usan sólo esas tres. */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
  const clicEl = async (sel, nombre) => {
    const c = await ev(`(()=>{ const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; })()`);
    assert.ok(c, "no se ve: " + nombre);
    for (const t of ["mouseMoved", "mousePressed", "mouseReleased"]) await mouse(t, c[0], c[1], { buttons: t === "mousePressed" ? 1 : 0, clickCount: 1 });
    await wait(400);
  };
  /** escribir de verdad en un campo: foco, borrar, teclear */
  const escribir = async (sel, texto) => {
    await clicEl(sel, sel);
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
    await send("Input.insertText", { text: String(texto) }); await wait(350);
  };
  const tecla = async (k, mods) => { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: k, code: "Key" + k.toUpperCase(), windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers: mods }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: k, code: "Key" + k.toUpperCase(), windowsVirtualKeyCode: k.toUpperCase().charCodeAt(0), modifiers: mods }); await wait(500); };
  const claves = (slot) => ev(`(()=>{ const sw = DZ.doc.scene.rigSwitch(${JSON.stringify(slot)}); if (!sw) return []; return Object.keys(sw.keys).map(Number).sort((a, b) => a - b).map(f => [f, sw.keys[f].split(":").pop()]); })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!(LOW.lipsyncTextoPanel)').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); sessionStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} window.__paginaVieja = 1; return true; })()');
    await send("Page.reload");
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!(LOW.lipsyncTextoPanel)').catch(() => false)) break; await wait(300); }
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    // la boca: ocho dibujos, uno por visema, con el nombre del visema
    const BOCAS = [["boca_rest", "Reposo"], ["boca_ae", "A_E"], ["boca_o", "O"], ["boca_u", "U"], ["boca_fv", "F_V"], ["boca_ln", "L_N"], ["boca_sz", "S_Z"], ["boca_mbp", "M_B_P"]];
    const slot = await ev(`(async()=>{ const wait = ms => new Promise(r => setTimeout(r, ms));
      if (typeof closeL3d === "function") closeL3d();
      const B = ${JSON.stringify(BOCAS)};
      dzCanvasSet('<g data-low-art="colour"></g><g data-low-art="line">' + B.map(([id], i) => '<g id="' + id + '"><rect x="40" y="60" width="60" height="' + (4 + i * 6) + '" fill="#c55"/></g>').join("") + '</g>');
      dzDocCommit();
      DZ.doc.scene.expose(DZ.doc.scene.layers[0].id, 120, 1);
      if (!DZ.rigMode) dzRigToggle(); await wait(300); dzRigSetMode("build"); await wait(200);
      DZ.doc.ensureRigNodes([{ id: "boca_rest", name: "boca", parentId: null, head: { x: 40, y: 70 }, tail: { x: 100, y: 70 }, pivot: { x: 40, y: 70 } }], "rig");
      await wait(300); dzRigSelectNode("boca_rest");
      for (const [id, n] of B.slice(1)) DZ.doc.addRigVariant("boca_rest", id, n);
      // el dibujo base también se llama como su visema
      const s = dzRigSlotDe(DZ.doc.scene.rigNode("boca_rest"));
      DZ.doc.setRigSwitchKey(s, 100, "attachment:boca_rest:boca_o");   // una clave a mano, que tiene que sobrevivir
      dzRigPanelSync(); await wait(400); return s; })()`);
    await ev(`(()=>{ const a = DZ.doc.scene.rigVariants(${JSON.stringify(slot)})[0]; a.name = "Reposo"; dzRigPanelSync(); return a.id; })()`); await wait(300);

    // 1. la sección y el mapa automático por nombre
    assert.ok(await ev(`!!document.querySelector("#rigLipTextoCaja") && document.querySelector("#rigLipTextoCaja").getBoundingClientRect().height > 0`), "no está la sección «Desde el texto»");
    const auto = await ev(`[...document.querySelectorAll("#rigLipMapaFilas select")].map(s => s.dataset.visema + "=" + s.options[0].textContent)`);
    for (const [v, n] of [["V1_A_E", "A_E"], ["V2_O", "O"], ["V7_M_B_P", "M_B_P"], ["V6_S_Z", "S_Z"], ["V0_Rest", "Reposo"]])
      assert.ok(auto.includes(v + "=Automático (" + n + ")"), "el visema " + v + " no se asignó a «" + n + "» por el nombre: " + JSON.stringify(auto));

    // 2. escribir el diálogo e inicio 10
    await escribir("#rigLipTexto", "¡Hola! ¿Cómo estás, mamá?");
    await escribir("#rigLipInicio", "10");
    await wait(300);
    const previa = await ev(`document.querySelector("#rigLipPrevia").textContent`);
    assert.match(previa, /F10–F\d+ · \d+ cambios de boca/, "la vista previa no muestra el tramo: " + previa);
    assert.ok(/M · B · P · V/.test(previa) && /A · E · I/.test(previa), "la vista previa no muestra los visemas: " + previa);

    // 3. crear las claves
    const pasos = await ev("DZ.history.undoStack.length");
    await clicEl("#rigLipTextoGen", "Crear las claves");
    const c1 = await claves(slot);
    const dialogo = c1.filter(([f]) => f !== 100);
    assert.equal(dialogo[0][0], 10, "la primera clave no está en F10: " + JSON.stringify(c1));
    assert.equal(dialogo[0][1], "boca_o", "«Hola» no empieza con la O (la H es muda): " + JSON.stringify(c1));
    assert.ok(dialogo.every(([, v], i) => i === 0 || v !== dialogo[i - 1][1]), "hay dos claves seguidas con la misma boca: " + JSON.stringify(dialogo));
    assert.ok(dialogo.some(([, v]) => v === "boca_mbp"), "la M de «mamá» no cierra los labios: " + JSON.stringify(dialogo));
    assert.equal(dialogo[dialogo.length - 1][1], "boca_rest", "la boca no termina en reposo");
    assert.ok(c1.some(([f, v]) => f === 100 && v === "boca_o"), "se perdió la clave a mano de F100: " + JSON.stringify(c1));
    assert.equal(await ev("DZ.history.undoStack.length") - pasos, 1, "crear las claves no fue UN paso de historial");
    const fin1 = dialogo[dialogo.length - 1][0];
    assert.equal(await ev(`DZ.doc.scene.rigSwitchAt(${JSON.stringify(slot)}, 11).split(":").pop()`), "boca_o", "la reproducción no ve la boca del cuadro 11");

    // 4. regenerar desde F30: sin restos del de F10
    await escribir("#rigLipInicio", "30");
    await clicEl("#rigLipTextoGen", "Crear las claves (otra vez)");
    const c2 = await claves(slot);
    assert.ok(!c2.some(([f]) => f >= 10 && f < 30), "quedaron restos del diálogo en F10–F29: " + JSON.stringify(c2));
    assert.equal(c2.filter(([f]) => f !== 100)[0][0], 30, "el diálogo regenerado no empieza en F30");
    assert.ok(c2.some(([f, v]) => f === 100 && v === "boca_o"), "regenerar se llevó la clave a mano de F100");
    assert.equal(await ev(`Object.keys(DZ.doc.lipsyncTexto(${JSON.stringify(slot)}).dialogos).length`), 1, "regenerar duplicó el diálogo guardado");

    // 5. Ctrl+Z / Ctrl+Y
    await clicEl("#dzCanvas", "lienzo");
    await tecla("z", 2);
    assert.deepEqual(await claves(slot), c1, "Ctrl+Z no volvió al diálogo en F10");
    await tecla("z", 2);
    assert.deepEqual(await claves(slot), [[100, "boca_o"]], "el segundo Ctrl+Z no dejó sólo la clave a mano");
    await tecla("y", 2); await tecla("y", 2);
    assert.deepEqual(await claves(slot), c2, "Ctrl+Y no rehízo");

    // 6. se guarda con la escena
    const guardado = await ev(`(()=>{ const sc = new LOW.animation.Scene(JSON.parse(JSON.stringify(DZ.doc.scene.toJSON()))); const s = sc.rig.slots[${JSON.stringify(slot)}];
      const sw = sc.rigSwitch(${JSON.stringify(slot)}); return { dialogos: Object.values((s.lipsyncTexto || {}).dialogos || {}).map(d => [d.texto, d.inicio, d.fin]), claves: Object.keys(sw.keys).length }; })()`);
    assert.deepEqual(guardado.dialogos.map((d) => d.slice(0, 2)), [["¡Hola! ¿Cómo estás, mamá?", 30]], "el diálogo no se guarda con la escena: " + JSON.stringify(guardado));
    assert.equal(guardado.claves, c2.length, "las claves no se guardan con la escena");

    // 7. a 12 fps ocupa la mitad de cuadros
    const largo24 = c2.filter(([f]) => f !== 100).pop()[0] - 30;
    await escribir("#tlFps", "12"); await ev(`(document.querySelector("#tlFps").dispatchEvent(new Event("change", { bubbles: true })), LOW.lipsyncTextoPanel.previa(), 1)`);
    await clicEl("#rigLipTextoGen", "Crear las claves a 12 fps");
    const c12 = (await claves(slot)).filter(([f]) => f !== 100);
    const largo12 = c12[c12.length - 1][0] - 30;
    assert.equal(await ev(`Object.keys(DZ.doc.lipsyncTexto(${JSON.stringify(slot)}).dialogos).length`), 1, "después de Ctrl+Z y Ctrl+Y, regenerar duplicó el diálogo (y dejó restos)");
    assert.ok(Math.abs(largo12 - largo24 / 2) <= 2, "a 12 fps no ocupa la mitad de cuadros: " + JSON.stringify({ largo24, largo12 }));
    await escribir("#tlFps", "24"); await ev(`(document.querySelector("#tlFps").dispatchEvent(new Event("change", { bubbles: true })), 1)`);

    // 8. el final de la escena (120)
    await escribir("#rigLipInicio", "112");
    const aviso = await ev(`document.querySelector("#rigLipPrevia").textContent`);
    assert.match(aviso, /final de la escena/, "no avisa que el diálogo pasa el final de la escena: " + aviso);
    await clicEl("#rigLipTextoGen", "Crear las claves al final");
    assert.ok((await claves(slot)).every(([f]) => f <= 120), "hay claves después del final de la escena");

    // 9. elegir a mano la boca de un visema
    await escribir("#rigLipInicio", "30");
    await ev(`document.querySelector("#rigLipMapa").open = true, 1`);
    await ev(`(()=>{ const s = document.querySelector('#rigLipMapaFilas select[data-visema="V2_O"]'); s.value = "attachment:boca_rest:boca_u"; s.dispatchEvent(new Event("change", { bubbles: true })); return 1; })()`); await wait(300);
    await clicEl("#rigLipTextoGen", "Crear las claves con la O cambiada");
    const c9 = (await claves(slot)).filter(([f]) => f !== 100);
    assert.equal(c9[0][1], "boca_u", "la O no usa la boca elegida a mano: " + JSON.stringify(c9));
    assert.equal(await ev(`DZ.doc.lipsyncTexto(${JSON.stringify(slot)}).mapa.V2_O`), "attachment:boca_rest:boca_u", "la boca elegida no quedó guardada");

    // 10. otro personaje con tres bocas: por orden, sólo esas tres
    const slot3 = await ev(`(async()=>{ const wait = ms => new Promise(r => setTimeout(r, ms));
      const svg = document.querySelector("#dzCanvas > svg g[data-low-art='line']");
      ["b2_cerrada", "b2_media", "b2_abierta"].forEach((id, i) => { const g = document.createElementNS("http://www.w3.org/2000/svg", "g"); g.id = id; g.innerHTML = "<rect x='300' y='60' width='60' height='" + (4 + i * 10) + "' fill='#55c'/>"; svg.appendChild(g); });
      dzDocCommit();
      DZ.doc.ensureRigNodes([{ id: "b2_cerrada", name: "boca 2", parentId: null, head: { x: 300, y: 70 }, tail: { x: 360, y: 70 }, pivot: { x: 300, y: 70 } }], "rig");
      await wait(200); dzRigSelectNode("b2_cerrada");
      DZ.doc.addRigVariant("b2_cerrada", "b2_media", "media"); DZ.doc.addRigVariant("b2_cerrada", "b2_abierta", "abierta");
      dzRigPanelSync(); await wait(400); return dzRigSlotDe(DZ.doc.scene.rigNode("b2_cerrada")); })()`);
    await escribir("#rigLipTexto", "Mamá, papá");
    await escribir("#rigLipInicio", "5");
    await clicEl("#rigLipTextoGen", "Crear las claves del segundo personaje");
    const c3 = await claves(slot3);
    assert.ok(c3.length > 3 && c3.every(([, v]) => ["b2_cerrada", "b2_media", "b2_abierta"].includes(v)), "con tres bocas usó otra cosa: " + JSON.stringify(c3));
    assert.ok(c3.some(([, v]) => v === "b2_cerrada") && c3.some(([, v]) => v === "b2_abierta"), "con tres bocas no cierra y abre: " + JSON.stringify(c3));
    assert.ok((await claves(slot)).some(([f]) => f === 100), "el segundo personaje tocó las claves del primero");

    assert.deepEqual(errores, [], "errores de JS: " + errores.join(" | "));
    console.log("OK lipsync desde el texto: mapa por nombre, vista previa, claves sin duplicar, regenerar sin restos, Ctrl+Z/Y, guardado, fps, final de escena, mapa a mano, tres bocas");
  } finally {
    ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
