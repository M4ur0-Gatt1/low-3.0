/* CAPAS COMO EN HARMONY / PHOTOSHOP, con clics reales. CDP :9223 + mock :8791.

   POR QUE EXISTE. Pedido: ver todas las capas mientras se dibuja, decidir cual
   va arriba, «el foquito» de mesa de luz para calcar, y los modos de fusion
   «como en Harmony o Photoshop». MEDIDO en v4.51.0: el lienzo mostraba SOLO la
   capa activa, el export ignoraba la opacidad de capa y no habia fusion,
   mesa de luz por capa ni forma de reordenar.

   Lo que se cuida:
   1. La capa de ADELANTE es la fila de ARRIBA (Harmony/Photoshop).
   2. Con la Capa 2 activa se ve la Capa 1 debajo, y no se guarda dentro de la 2.
   3. Mesa de luz (clic en el sol): la capa se ve lavada en la mesa; el export
      NO cambia.
   4. Opacidad y fusion desde el panel de propiedades, con clics: el export las
      aplica. La fusion se mide en PIXELES del PNG exportado: azul en
      Multiplicar sobre el circulo rojo da negro; en Normal, azul.
   5. «Adelante / Atras» cambia el apilado en la mesa y en la linea de tiempo.
   6. Cada cambio es un Deshacer.
   7. Duplicar y Eliminar desde el panel (con el modal propio, no confirm()).
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
  const clickEn = async (expr, msg) => {
    const p = await ev(`(()=>{const e=${expr};if(!e)return null;e.scrollIntoView&&e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect();
      if(!r.width||!r.height)return null;const x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return {x,y,ok:h===e||e.contains(h)};})()`);
    assert.ok(p, (msg || "no está en pantalla") + ": " + expr);
    assert.ok(p.ok, "está pero algo lo tapa: " + expr);
    await mouse("mousePressed", p.x, p.y, 1); await mouse("mouseReleased", p.x, p.y, 0); await wait(250);
  };
  const fila = (name, sel) => `[...document.querySelectorAll('.tl2-row[data-layer-row]')].find(r=>r.querySelector('.tl2-name span')?.textContent===${JSON.stringify(name)})?.querySelector(${JSON.stringify(sel)})`;
  const pixelExport = (x, y) => ev(`(async()=>{const png=await dzSvgToPng(dzCuadroSvgTexto(1),1920);const img=new Image();img.src=png;await img.decode();
    const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const g=c.getContext('2d');g.drawImage(img,0,0);
    const k=c.width/DZ.doc.scene.width;return [...g.getImageData(Math.round(${x}*k),Math.round(${y}*k),1,1).data];})()`);
  const cerca = (a, b, tol = 12) => a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) <= tol);
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
    // la Capa 2 lleva un rectángulo AZUL sobre el círculo rojo de la Capa 1 (510,620 r150)
    await ev(`(()=>{DZ.doc.writeDrawing('<g data-low-art="colour"></g><g data-low-art="line"><rect x="440" y="560" width="140" height="120" fill="#0000ff"/></g>');DZ.doc.emit('frame');})()`);
    await wait(300);

    // 1. la de adelante arriba
    const filas = await ev(`[...document.querySelectorAll('.tl2-row[data-layer-row]')].map(r=>r.querySelector('.tl2-name span').textContent)`);
    assert.deepEqual(filas, ["Capa 2", "Capa 1"], "la capa de adelante (la última creada) tiene que ser la fila de arriba");

    // 2. la otra capa se ve y no se guarda en la activa
    const mesa = await ev(`(()=>{const g=[...document.querySelectorAll('#dzCanvas > svg > g.dz-capa')];
      return {n:g.length,circulo:g.some(x=>x.querySelector('circle')),debajo:g.length&&g[0].compareDocumentPosition(document.querySelector('#dzCanvas > svg > g[data-low-art]'))&4,
        guardadaEnLaActiva:DZ.doc.drawing.content.includes('circle')};})()`);
    assert.equal(mesa.n, 1, "la Capa 1 no se ve en la mesa: " + JSON.stringify(mesa));
    assert.ok(mesa.circulo && mesa.debajo, "la Capa 1 tiene que verse DEBAJO de la activa: " + JSON.stringify(mesa));
    assert.equal(mesa.guardadaEnLaActiva, false, "la Capa 1 se guardó dentro de la Capa 2");

    const normal = await pixelExport(510, 620);
    assert.ok(cerca(normal, [0, 0, 255]), "en Normal el azul de adelante tapa al rojo: " + normal);

    // 3. mesa de luz de la Capa 1, con clic en el sol
    await clickEn(fila("Capa 1", ".tl2-luz"), "no hay botón de mesa de luz en la fila");
    const luz = await ev(`(()=>{const g=document.querySelector('#dzCanvas > svg > g.dz-capa');const ly=DZ.doc.scene.layers[0];
      return {modelo:ly.lightTable,opacidad:+g.getAttribute('opacity'),filtro:g.style.filter,pulsado:${fila("Capa 1", ".tl2-luz")}.getAttribute('aria-pressed')};})()`);
    assert.equal(luz.modelo, true); assert.equal(luz.pulsado, "true");
    assert.ok(luz.opacidad < 0.5 && /grayscale/.test(luz.filtro), "la mesa de luz no lava la capa: " + JSON.stringify(luz));
    // (630,620): DENTRO del circulo naranja de la Capa 1 (510,620 r150 -> x 360..660)
    // y FUERA del rectangulo azul de la Capa 2 (x 440..580). Medir en (700,600) era
    // medir el fondo blanco: la prueba fallaba sola, sin defecto del programa.
    const luzPix = await pixelExport(630, 620);   // el valor VA en el mensaje: sin eso, cada hipotesis cuesta una corrida entera
    assert.ok(cerca(luzPix, [0xF0, 0x45, 0x0E], 20), "la mesa de luz NO puede cambiar el export · medido " + JSON.stringify(luzPix));
    await ev("dzUndo()"); await wait(200);
    assert.equal(await ev("DZ.doc.scene.layers[0].lightTable"), false, "Deshacer no apagó la mesa de luz");

    // 4. fusión desde el panel de propiedades de la Capa 2
    await clickEn(fila("Capa 2", ".tl2-props"), "no hay botón de propiedades en la fila");
    assert.equal(await ev("!!document.querySelector('.dz-capa-props')"), true, "no se abrió el panel de propiedades");
    await ev(`(()=>{const s=document.querySelector('.dz-capa-props select[data-capa=fusion]');s.value='multiply';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait(200);
    assert.equal(await ev("DZ.doc.scene.layers[1].blend"), "multiply");
    const mult = await pixelExport(510, 620);
    assert.ok(cerca(mult, [0, 0, 0], 16), "azul MULTIPLICAR sobre rojo tiene que dar negro en el export: " + mult);
    // opacidad 50 %
    await ev(`(()=>{const s=document.querySelector('.dz-capa-props input[data-capa=opacidad]');s.value='50';s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait(200);
    assert.equal(await ev("DZ.doc.scene.layers[1].opacity"), 0.5);
    assert.match(await ev("dzCuadroSvgTexto(1)"), /opacity="0\.500"/, "el export no aplica la opacidad de capa");
    await ev("dzUndo()"); await ev("dzUndo()"); await wait(200);
    assert.deepEqual(await ev("[DZ.doc.scene.layers[1].blend,DZ.doc.scene.layers[1].opacity]"), ["normal", 1], "Deshacer no volvió fusión y opacidad");

    // 5. orden: llevar la Capa 2 atrás desde el panel
    await clickEn(fila("Capa 2", ".tl2-props"));
    await clickEn(`[...document.querySelectorAll('.dz-capa-props button')].find(b=>/Atrás/.test(b.textContent))`);
    const orden = await ev(`(()=>({modelo:DZ.doc.scene.layers.map(l=>l.name),filas:[...document.querySelectorAll('.tl2-row[data-layer-row]')].map(r=>r.querySelector('.tl2-name span').textContent),
      circuloEncima:(()=>{const g=document.querySelector('#dzCanvas > svg > g.dz-capa');return !!g&&!!(document.querySelector('#dzCanvas > svg > g[data-low-art="line"]').compareDocumentPosition(g)&4);})()}))()`);
    assert.deepEqual(orden.modelo, ["Capa 2", "Capa 1"]);
    assert.deepEqual(orden.filas, ["Capa 1", "Capa 2"], "la línea de tiempo no refleja el nuevo orden");
    assert.equal(orden.circuloEncima, true, "en la mesa la Capa 1 tiene que quedar ENCIMA de la activa");
    assert.ok(cerca(await pixelExport(510, 620), [0xF0, 0x45, 0x0E], 20), "en el export ahora el rojo tapa al azul");
    await ev("dzUndo()"); await wait(200);
    assert.deepEqual(await ev("DZ.doc.scene.layers.map(l=>l.name)"), ["Capa 1", "Capa 2"], "Deshacer no devolvió el orden");

    // 7. duplicar y eliminar desde el panel
    await clickEn(fila("Capa 2", ".tl2-props"));
    await clickEn(`[...document.querySelectorAll('.dz-capa-props button')].find(b=>b.textContent==='Duplicar')`);
    assert.deepEqual(await ev("DZ.doc.scene.layers.map(l=>l.name)"), ["Capa 1", "Capa 2", "Capa 2 copia"]);
    await clickEn(fila("Capa 2 copia", ".tl2-props"));
    await clickEn(`[...document.querySelectorAll('.dz-capa-props button')].find(b=>b.textContent==='Eliminar')`);
    await wait(200);
    await clickEn(`[...document.querySelectorAll('.modal button, #modal button, .m-actions button')].find(b=>/Eliminar/.test(b.textContent)&&b.offsetParent)`, "no apareció el modal de confirmación");
    await wait(250);
    assert.deepEqual(await ev("DZ.doc.scene.layers.map(l=>l.name)"), ["Capa 1", "Capa 2"], "Eliminar no quitó la copia");

    assert.deepEqual(errors, []);
    console.log("E2E capas Harmony OK", JSON.stringify({ normal, mult, filas }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
setTimeout(() => process.exit(1), 90000).unref();
