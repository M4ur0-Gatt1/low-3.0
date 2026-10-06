/* LOS DIBUJOS DEL NIVEL SE BORRAN, con clics reales. CDP :9223 + mock :8791.

   POR QUE EXISTE. Reportado en v3.1.0: «los dibujos de nivel no se borran
   cuando los borro». MEDIDO: el menu de la tira (clic derecho) se cerraba en el
   pointerdown del PROPIO clic, el boton desaparecia antes de su click y NINGUN
   item hacia nada. Y aun borrando por comando, si el dibujo era el que estaba
   sobre la mesa, la mesa no se repintaba y el volcado del lienzo lo podia
   volver a guardar como dibujo nuevo.

   Lo que se cuida:
   1. Clic derecho > Borrar el dibujo > confirmar: el dibujo sale del nivel, de
      la tira y de la mesa.
   2. Ir a otro cuadro y volver NO lo resucita.
   3. Deshacer lo devuelve, con su celda.
   4. Otro item del mismo menu (Duplicar) tambien funciona: el defecto era del
      menu, no solo de Borrar.
*/
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const tab = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl), pending = new Map(), errors = []; let id = 0;
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ({ data }) => { const m = JSON.parse(data);
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.j(Error(m.error.message)) : p.r(m.result); } };
  const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; pending.set(n, { r, j }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const pos = (sel) => ev(`(()=>{const e=${sel};if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  const clic = async (sel, msg, button = "left") => { const p = await pos(sel); assert.ok(p, msg + ": no está");
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...p, button, buttons: button === "left" ? 1 : 2, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...p, button, buttons: 0, clickCount: 1 }); await wait(300); };
  const estado = () => ev(`({dibujos:DZ.doc.level.drawings.map(x=>x.number),celdas:DZ.doc.layer.cells.slice(0,3),tira:document.querySelectorAll('.ls2-item').length,
    rectEnLaMesa:!!document.querySelector('#dzCanvas > svg rect:not([data-low-page])')})`);
  const itemMenu = (txt) => `[...document.querySelectorAll('.ls2-menu button')].find(b=>b.textContent.startsWith(${JSON.stringify(txt)}))`;
  const miniatura = (n) => `[...document.querySelectorAll('.ls2-item')][${n}]`;
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzDocumentNew==="function"&&typeof api!=="undefined"&&!!api').catch(() => false)) break; await wait(250); }
    await ev(`(async()=>{await dzDocumentNew();if(typeof closeL3d==='function')closeL3d();const s=document.getElementById('lowSplash');if(s)s.remove();
      if(typeof dzEnsureAnimationWorkspace==='function')await dzEnsureAnimationWorkspace();await new Promise(r=>setTimeout(r,700));dzDocCommit();
      const d=DZ.doc;d.writeDrawing('<g data-low-art="line"><circle cx="500" cy="500" r="120" fill="none" stroke="#111" stroke-width="20"/></g>');
      const n=d.level.addDrawing(d.level.nextNumber(),'<g data-low-art="line"><rect x="900" y="300" width="200" height="160" fill="none" stroke="#111" stroke-width="8"/></g>');
      d.setCell(2,n.number);d.goTo(2);d.emit('level');DZ.history.clear();await new Promise(r=>setTimeout(r,500));})()`);
    const antes = await estado();
    assert.deepEqual(antes.dibujos, [1, 2]); assert.equal(antes.rectEnLaMesa, true);

    // 1. borrar el dibujo 2 (el que está sobre la mesa) con el menú
    await clic(miniatura(1), "miniatura del dibujo 2", "right");
    await clic(itemMenu("Borrar"), "«Borrar el dibujo» en el menú");
    await clic(`[...document.querySelectorAll('button')].filter(b=>b.offsetParent&&b.textContent.trim()==='Borrar').pop()`, "confirmación «Borrar»");
    await wait(400);
    const borrado = await estado();
    assert.deepEqual(borrado.dibujos, [1], "el dibujo no se borró del nivel: " + JSON.stringify(borrado));
    assert.equal(borrado.celdas[1], null, "la celda que lo exponía tiene que quedar vacía");
    assert.equal(borrado.tira, 1, "la tira sigue mostrando el dibujo borrado");
    assert.equal(borrado.rectEnLaMesa, false, "la mesa sigue mostrando el dibujo borrado");

    // 2. ir y volver no lo resucita
    await ev("DZ.doc.goTo(1)"); await wait(400); await ev("DZ.doc.goTo(2)"); await wait(400);
    const vuelta = await estado();
    assert.deepEqual(vuelta.dibujos, [1], "ir a otro cuadro y volver RESUCITÓ el dibujo borrado: " + JSON.stringify(vuelta));

    // 3. deshacer lo devuelve
    await ev("dzUndo()"); await wait(400);
    const deshecho = await estado();
    assert.deepEqual(deshecho.dibujos, [1, 2], "Deshacer no devolvió el dibujo: " + JSON.stringify(deshecho));
    assert.equal(deshecho.celdas[1], 2, "Deshacer no devolvió su celda");

    await ev("DZ.history.clear()");
    // 4. otro ítem del menú: Duplicar
    await clic(miniatura(0), "miniatura del dibujo 1", "right");
    await clic(itemMenu("Duplicar"), "«Duplicar» en el menú");
    await wait(300);
    assert.equal((await estado()).dibujos.length, 3, "«Duplicar» del menú tampoco hace nada");
    assert.equal(await ev('DZ.history.undoStack.length'), 1, 'Duplicar requiere más de un Deshacer');
    await ev('dzUndo()'); await wait(400);
    assert.deepEqual((await estado()).dibujos, [1,2], 'Undo duplicar deja un dibujo residual');
    assert.equal((await estado()).celdas[1], 2, 'Undo duplicar no devuelve la exposición anterior');
    await ev('dzRedo()'); await wait(400);
    assert.equal((await estado()).dibujos.length, 3, 'Redo duplicar');
    await ev('dzUndo(); DZ.history.clear()'); await wait(400);
    await clic(`document.querySelector('.ls2-add')`, 'nuevo dibujo del nivel');
    assert.equal(await ev('DZ.history.undoStack.length'), 1, 'Nuevo dibujo del nivel no es atómico');
    await ev('dzUndo()'); await wait(400);
    assert.deepEqual((await estado()).dibujos, [1,2], 'Undo nuevo dibujo deja dibujo residual');


    assert.deepEqual(errors, []);
    console.log("E2E borrar dibujo OK", JSON.stringify({ antes, borrado, deshecho }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
setTimeout(() => process.exit(1), 60000).unref();
