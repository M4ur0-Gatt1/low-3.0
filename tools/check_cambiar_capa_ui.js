/* CAMBIAR DE CAPA NO PISA UN DIBUJO, con clics reales. CDP :9223 + mock :8791.

   POR QUE EXISTE. MEDIDO en v4.51.0: dos capas, la 1 con dibujo. Clic en el
   nombre de la Capa 1 -> el lienzo seguia mostrando la capa anterior, y un
   trazo hacia que el volcado escribiera ESE lienzo en la Capa 1: su dibujo se
   perdia (484 -> 247 caracteres, el circulo ya no estaba).

   Lo que se cuida:
   1. Elegir una capa muestra SU dibujo en el lienzo.
   2. Dibujar ahi suma al dibujo de esa capa; no lo reemplaza.
   3. Volver a la capa vacia la muestra vacia: no se lleva una copia de la otra.
   4. Lo que se dibujo en una capa no aparece en la otra.
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
  const mouse = (type, x, y, buttons) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons, clickCount: 1 });
  const clickEn = async (expr) => {
    const p = await ev(`(()=>{const e=${expr};if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    assert.ok(p, "no está en pantalla: " + expr);
    await mouse("mousePressed", p.x, p.y, 1); await mouse("mouseReleased", p.x, p.y, 0); await wait(300);
  };
  const nombre = (n) => `[...document.querySelectorAll('.tl2-row .tl2-name span')].find(s=>s.textContent===${JSON.stringify(n)})`;
  const trazo = async (fx, fy) => {
    const h = await ev(`(()=>{const r=document.querySelector('#dzCanvas > svg').getBoundingClientRect();return {x:r.x+r.width*${fx},y:r.y+r.height*${fy}};})()`);
    await mouse("mousePressed", h.x, h.y, 1);
    for (let i = 1; i <= 10; i++) await mouse("mouseMoved", h.x + i * 5, h.y + i * 3, 1);
    await mouse("mouseReleased", h.x + 50, h.y + 30, 0); await wait(800);
  };
  const estado = () => ev(`(()=>{const L=DZ.doc.scene.layers;const c=i=>{const d=DZ.doc.scene.drawingAt(L[i].id,1);return d?d.content:'';};
    return {activa:DZ.doc.scene.layer(DZ.doc.layerId).name,capa1:c(0).length,capa1Circulo:c(0).includes('circle'),
      capa2:c(1),capa2Paths:(c(1).match(/<path/g)||[]).length,
      lienzoCirculo:!!document.querySelector('#dzCanvas > svg circle'),lienzoPaths:document.querySelectorAll('#dzCanvas > svg path').length,
      // DESDE EL MODELO DE CAPAS (v4.52): las OTRAS capas se ven en la mesa a
      // proposito, dibujadas aparte en grupos g.dz-capa. Lo que nunca puede
      // pasar es que el dibujo ajeno este DENTRO del grupo de arte activo,
      // porque de ahi sale lo que se guarda en la capa.
      circuloEnLaActiva:[...document.querySelectorAll('#dzCanvas > svg > g[data-low-art]')].some(g=>g.querySelector('circle')),
      circuloDeOtraCapa:!!document.querySelector('#dzCanvas > svg > g.dz-capa circle')};})()`);
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('typeof openDesign==="function"&&!!api').catch(() => false)) break; await wait(300); }
    await ev(`(async()=>{try{localStorage.clear()}catch(e){};await openDesign('mock.svg');await dzDocInit();
      if(typeof closeL3d==='function')closeL3d();const s=document.getElementById('lowSplash');if(s)s.remove();
      await new Promise(r=>setTimeout(r,800));})()`);
    await clickEn(`document.getElementById('dzTlPestania')`); await wait(300);
    await clickEn(`document.querySelector('.tl2-addlayer')`); await wait(300);
    const inicio = await estado();
    assert.ok(inicio.capa1Circulo, "la escena de prueba tiene que arrancar con un círculo en la Capa 1");

    // 1 y 2: elegir la Capa 1 muestra su dibujo; dibujar suma, no reemplaza
    await clickEn(nombre("Capa 1"));
    const elegida = await estado();
    assert.equal(elegida.activa, "Capa 1");
    assert.equal(elegida.lienzoCirculo, true, "elegir la Capa 1 no mostró su dibujo en el lienzo: " + JSON.stringify(elegida));
    await ev("dzSetTool('pencil')");
    await trazo(0.75, 0.3);
    const tras1 = await estado();
    assert.equal(tras1.capa1Circulo, true, "dibujar en la Capa 1 BORRÓ su dibujo: " + JSON.stringify({ inicio, tras1 }));
    assert.ok(tras1.capa1 > inicio.capa1, "el trazo no se sumó a la Capa 1");

    // 3: volver a la capa vacía la muestra vacía
    await clickEn(nombre("Capa 2"));
    const vacia = await estado();
    assert.equal(vacia.activa, "Capa 2");
    // Antes se exigia que el circulo NO se viera. Desde el modelo de capas se ve
    // a proposito —es el punto: dibujar viendo las demas—, asi que lo que se
    // exige es lo que de verdad protege el dibujo: que no este en el grupo
    // activo (de ahi sale lo que se guarda) y que la Capa 2 siga vacia.
    assert.equal(vacia.circuloEnLaActiva, false, "el dibujo de la Capa 1 está DENTRO del grupo activo: el próximo volcado lo guarda en la Capa 2: " + JSON.stringify(vacia));
    assert.equal(vacia.circuloDeOtraCapa, true, "la Capa 1 tiene que verse en la mesa como capa de fondo (mesa de luz del modelo de capas): " + JSON.stringify(vacia));
    assert.equal(vacia.capa2Paths, 0, "la Capa 2 recibió una copia de la Capa 1: " + JSON.stringify(vacia));

    // 4: lo de una capa no aparece en la otra
    await trazo(0.2, 0.6);
    const tras2 = await estado();
    assert.equal(tras2.capa2Paths, 1, "la Capa 2 tiene que tener sólo su trazo: " + JSON.stringify(tras2));
    assert.equal(tras2.capa1, tras1.capa1, "dibujar en la Capa 2 cambió la Capa 1");
    await clickEn(nombre("Capa 1"));
    const final = await estado();
    assert.equal(final.lienzoCirculo, true, "al volver, la Capa 1 no se ve");
    assert.equal(final.capa1, tras1.capa1, "ir y volver cambió el dibujo de la Capa 1");

    assert.deepEqual(errors, []);
    console.log("E2E cambiar de capa OK", JSON.stringify({ inicio: inicio.capa1, tras1: tras1.capa1, capa2: tras2.capa2Paths }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
setTimeout(() => process.exit(1), 60000).unref();
