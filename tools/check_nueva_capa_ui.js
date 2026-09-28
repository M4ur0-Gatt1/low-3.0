/* NUEVA CAPA DE ANIMACION, con clics reales. CDP :9223 + mock :8791.

   POR QUE EXISTE. Reportado: «no veo como generar una nueva capa o columna en
   la linea de tiempo» y «el boton + sirve para agregar un frame, no una
   columna». MEDIDO en v4.51.0: el menu Capa no tenia la accion y en la linea
   de tiempo la unica entrada era el segundo icono, sin texto, de 29.

   Lo que se cuida:
   1. En la linea de tiempo hay un boton que DICE «+ Capa», visible y
      alcanzable por el clic (no tapado), debajo de la ultima capa.
   2. Apretarlo crea una capa, la deja ACTIVA, y el boton sigue abajo de todo.
   3. Lo que importa de verdad: DIBUJAR en la capa nueva deja el dibujo en ESA
      capa, no en la anterior.
   4. Deshacer la quita.
   5. Capa -> Nueva capa de animacion, desde el menu, con clics reales.
   6. Doble clic en el nombre de la capa en la linea de tiempo la renombra
      (el aviso lo promete).
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
  const mouse = async (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", clickCount: 1, ...extra });
  const centro = (sel) => ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return null;const r=e.getBoundingClientRect();
    if(!r.width||!r.height)return null;const x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);
    return {x,y,alcanza:hit===e||e.contains(hit),texto:e.textContent.trim()};})()`);
  const click = async (sel, n = 1) => { const p = await centro(sel); assert.ok(p, "no está en pantalla: " + sel);
    assert.ok(p.alcanza, "está pero algo lo tapa: " + sel);
    await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: n }); await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: n });
    await wait(150); return p; };
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('typeof openDesign==="function"&&!!api').catch(() => false)) break; await wait(300); }
    await ev(`(async()=>{try{localStorage.clear()}catch(e){};await openDesign('mock.svg');await dzDocInit();
      if(typeof closeL3d==='function')closeL3d();const s=document.getElementById('lowSplash');if(s)s.remove();
      await new Promise(r=>setTimeout(r,800));})()`);
    // la línea de tiempo se abre como la abre un usuario: su pestaña
    await click("#dzTlPestania"); await wait(600);

    // 1. el botón con palabras
    const boton = await centro(".tl2-addlayer");
    assert.ok(boton, "no hay botón «+ Capa» en la línea de tiempo");
    assert.equal(boton.texto, "+ Capa");
    assert.ok(boton.alcanza, "«+ Capa» está pero algo lo tapa");

    // 2. crear
    const antes = await ev("DZ.doc.scene.layers.length");
    const vieja = await ev("DZ.doc.layerId");
    await click(".tl2-addlayer"); await wait(250);
    const r2 = await ev(`(()=>{const L=DZ.doc.scene.layers;const nueva=L[L.length-1];
      return {n:L.length,activa:DZ.doc.layerId===nueva.id,nombre:nueva.name,
        filaNueva:[...document.querySelectorAll('.tl2-row .tl2-name span')].some(s=>s.textContent===nueva.name)};})()`);
    assert.equal(r2.n, antes + 1, "«+ Capa» no creó una capa: " + JSON.stringify(r2));
    assert.equal(r2.activa, true, "la capa nueva tiene que quedar activa para dibujar en ella");
    assert.equal(r2.filaNueva, true, "la capa nueva no aparece en la línea de tiempo");
    // con varias capas la lista scrollea: el botón NO puede irse de la vista
    // (debajo de la última capa se iba en cuanto había dos — medido)
    await click(".tl2-addlayer"); await click(".tl2-addlayer"); await wait(200);
    const conScroll = await ev(`(()=>{const b=document.querySelector('.tl2-addlayer');let p=b.parentElement;
      while(p&&!(p.scrollHeight>p.clientHeight+2&&/(auto|scroll)/.test(getComputedStyle(p).overflowY)))p=p.parentElement;
      if(p)p.scrollTop=p.scrollHeight;return {hayScroll:!!p};})()`);
    await wait(150);
    const sigue = await centro(".tl2-addlayer");
    assert.ok(sigue && sigue.alcanza, "con 4 capas y la lista abajo de todo, «+ Capa» se fue de la vista: " + JSON.stringify({ conScroll, sigue }));
    // y se distinguen: «Capa 2» no entraba por un píxel y todas se leían «Capa…»
    const cortados = await ev(`[...document.querySelectorAll('.tl2-row .tl2-name span')].filter(s=>/^Capa \d+$/.test(s.textContent)&&s.scrollWidth>s.clientWidth).map(s=>s.textContent)`);
    assert.deepEqual(cortados, [], "nombres de capa cortados: no se distingue cuál es cuál");
    // se vuelve a la capa recién creada en el primer clic, para dibujar ahí
    await ev(`DZ.doc.selectLayer(DZ.doc.scene.layers[${antes}].id)`); await wait(200);
    // 3. dibujar en la capa nueva
    await ev("dzSetTool('pencil')"); await wait(100);
    const hoja = await ev(`(()=>{const r=document.querySelector('#dzCanvas > svg').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})()`);
    const x0 = hoja.x + hoja.w * 0.7, y0 = hoja.y + hoja.h * 0.3;
    await mouse("mousePressed", x0, y0, { buttons: 1 });
    for (let i = 1; i <= 12; i++) await mouse("mouseMoved", x0 + i * 6, y0 + i * 4, { buttons: 1 });
    await mouse("mouseReleased", x0 + 72, y0 + 48, { buttons: 0 }); await wait(700);
    const r3 = await ev(`(()=>{const L=DZ.doc.scene.layers;const nueva=L[${antes}];const vieja=DZ.doc.scene.layer(${JSON.stringify(vieja)});
      const f=DZ.doc.frame;const cn=nueva.cellAt(f);const d=cn!=null?nueva.levelId&&DZ.doc.scene.level(nueva.levelId).byNumber(cn):null;
      return {celdaNueva:cn,contenido:d?(d.content||'').length:0,celdaVieja:vieja.cellAt(f)};})()`);
    assert.ok(r3.celdaNueva != null && r3.contenido > 0, "dibujar en la capa nueva no dejó el dibujo en ELLA: " + JSON.stringify(r3));

    // 4. deshacer hasta quitarla (el trazo y después la capa)
    for (let i = 0; i < 8 && (await ev("DZ.doc.scene.layers.length")) > antes; i++) { await ev("dzUndo()"); await wait(250); }
    assert.equal(await ev("DZ.doc.scene.layers.length"), antes, "Deshacer no quitó la capa");

    // 5. menú Capa → Nueva capa de animación
    await click('[data-menu="capa"]'); await wait(200);
    await click('[data-act="capa-animacion-nueva"]'); await wait(250);
    assert.equal(await ev("DZ.doc.scene.layers.length"), antes + 1, "el menú Capa → Nueva capa de animación no creó la capa");

    // 6. doble clic renombra desde la línea de tiempo
    const nombre = await ev("DZ.doc.scene.layers[DZ.doc.scene.layers.length-1].name");
    const cab = await ev(`(()=>{const s=[...document.querySelectorAll('.tl2-row .tl2-name span')].find(s=>s.textContent===${JSON.stringify(nombre)});
      const r=s.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await mouse("mousePressed", cab.x, cab.y, { buttons: 1, clickCount: 1 }); await mouse("mouseReleased", cab.x, cab.y, { buttons: 0, clickCount: 1 });
    await mouse("mousePressed", cab.x, cab.y, { buttons: 1, clickCount: 2 }); await mouse("mouseReleased", cab.x, cab.y, { buttons: 0, clickCount: 2 });
    await wait(300);
    const modal = await ev(`(()=>{const t=document.querySelector('#dzPrIn');if(!t||!t.offsetParent)return false;
      const ok=t.value.trim()===${JSON.stringify(nombre)};t.value='Brazo';return ok;})()`);
    assert.equal(modal, true, "doble clic en el nombre no abrió el renombrar (con el nombre actual)");
    await click("#dzPrOk"); await wait(300);
    assert.equal(await ev("DZ.doc.scene.layers[DZ.doc.scene.layers.length-1].name"), "Brazo", "renombrar no aplicó el nombre");

    assert.deepEqual(errors, []);
    console.log("E2E nueva capa OK", JSON.stringify({ boton, creada: r2, dibujo: r3 }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
setTimeout(() => process.exit(1), 60000).unref();
