/* EL TIEMPO COMO INSTRUMENTO: tomas retroactivas y comping en Interpretar.
   CDP :9223 + mock :8791. Teclas REALES de Espacio (Input.dispatchKeyEvent).

   Lo que se cuida:
   1. No hay botón de grabar: cada pasada completa de golpes (poses + 1) queda
      sola como TOMA en un carril. Dos pasadas con ritmos distintos = dos carriles.
   2. Una pasada cortada por una pausa larga NO se convierte en una toma mala:
      se descarta y se avisa.
   3. Comping: clic en la pose 4 de un carril -> B toma ESA duración de ESA toma
      y el segmento queda marcado como elegido.
   4. «Usar» pone la toma entera en B.
   5. Cerrar y volver a abrir conserva las tomas (captura retroactiva).
   6. Con carriles, a media pantalla (1000x560) «Aplicar» sigue a la vista.
   7. La demo no toca el documento.
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
  const espacio = async () => {
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 });
  };
  /** Una pasada: 8 golpes (7 poses + el final) con los intervalos dados. */
  const pasada = async (intervalos) => { for (let i = 0; i < 8; i++) { await espacio(); if (i < 7) await wait(intervalos[i]); } await wait(120); };
  const click = async (expr) => {
    const p = await ev(`(()=>{const e=${expr};if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    assert.ok(p, "no está: " + expr);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...p, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...p, button: "left", buttons: 0, clickCount: 1 });
    await wait(150);
  };
  const carriles = () => ev(`[...document.querySelectorAll('.rhythm-lane')].map(l=>[...l.querySelectorAll('.rhythm-lane-track button')].map(b=>+b.style.flexGrow||+b.style.flex.split(' ')[0]))`);
  const b = () => ev(`[...document.querySelectorAll('.rhythm-pose input')].map(e=>+e.value)`);
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof lowInterpretar==="function"&&typeof api!=="undefined"&&!!api&&typeof dzDocumentNew==="function"').catch(() => false)) break; await wait(200); }
    await ev(`(async()=>{await dzDocumentNew();if(typeof closeL3d==='function')closeL3d();const s=document.getElementById('lowSplash');if(s)s.remove();
      await new Promise(r=>setTimeout(r,700));dzDocCommit();  // el documento nuevo termina de volcar su lienzo: eso no es de la demo
      window.__antes=JSON.stringify(DZ.doc.scene.toJSON());lowInterpretar({sample:true});})()`);
    await wait(300);
    assert.equal(await ev("document.querySelectorAll('.rhythm-lane').length"), 0, "no tiene que haber tomas al empezar");

    // 1. dos pasadas, sin grabar: parejo, y después con la «Suspensión» larga
    await pasada([90, 90, 90, 90, 90, 90, 90]);
    await wait(300);
    await pasada([90, 90, 90, 420, 90, 90, 90]);
    const c1 = await carriles();
    assert.equal(c1.length, 2, "dos pasadas tienen que dar dos carriles: " + JSON.stringify(c1));
    assert.ok(c1[0][3] > c1[1][3] * 2, "la toma nueva (arriba) tiene la pose 4 más larga: " + JSON.stringify(c1));
    assert.match(await ev("document.querySelector('.rhythm-hint').textContent"), /lista/);

    // 2. pasada cortada por una pausa larga
    await espacio(); await wait(90); await espacio(); await wait(90); await espacio();
    await wait(2700);
    await espacio();
    assert.match(await ev("document.querySelector('[data-takes-state]').textContent"), /cortada/, "la pasada cortada tiene que avisarse");
    assert.equal((await carriles()).length, 2, "una pasada cortada NO puede convertirse en toma");
    await ev("document.querySelector('[data-fixed]').click()"); await wait(100);          // sin ajuste: se ven los F tocados
    await click(`document.querySelectorAll('.rhythm-lane')[0].querySelector('.rhythm-lane-use')`);
    // 3. comping: la pose 4 desde la toma de ABAJO (la pareja)
    const antes = await b();
    await click(`document.querySelectorAll('.rhythm-lane')[1].querySelectorAll('.rhythm-lane-track button')[3]`);
    const despues = await b(), c2 = await carriles();
    assert.equal(despues[3], c2[1][3], "comping: la pose 4 tiene que durar lo de la toma elegida: " + JSON.stringify({ antes, despues, c2 }));
    assert.equal(despues[0], antes[0], "comping de UNA pose no puede cambiar las otras");
    assert.equal(await ev(`document.querySelectorAll('.rhythm-lane')[1].querySelectorAll('.rhythm-lane-track button')[3].classList.contains('elegida')`), true);
    // 4. «Usar» la toma entera
    await click(`document.querySelectorAll('.rhythm-lane')[1].querySelector('.rhythm-lane-use')`);
    assert.deepEqual(await b(), c2[1], "«Usar» tiene que poner la toma entera en B");

    // 6. media pantalla con carriles
    await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 560, deviceScaleFactor: 1, mobile: false }); await wait(300);
    assert.equal(await ev(`(()=>{const d=document.querySelector('#lowInterpretar'),dr=d.getBoundingClientRect(),a=d.querySelector('[data-action="apply"]').getBoundingClientRect();return a.top>=dr.top&&a.bottom<=dr.bottom&&dr.bottom<=innerHeight;})()`),
      true, "con carriles, a 1000x560 «Aplicar» se fue de la vista");
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false }); await wait(200);

    // 5. cerrar y volver: las tomas siguen
    await click(`document.querySelector('[data-action="close"]')`);
    await ev("lowInterpretar({sample:true})"); await wait(300);
    assert.equal((await carriles()).length, 2, "al volver a abrir se perdieron las tomas");

    // 7. la demo no tocó el documento
    assert.equal(await ev("JSON.stringify(DZ.doc.scene.toJSON())===window.__antes"), true, "la demo cambió el documento");
    assert.deepEqual(errors, []);
    console.log("E2E tomas OK", JSON.stringify({ carriles: c1, comping: despues }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
setTimeout(() => process.exit(1), 60000).unref();
