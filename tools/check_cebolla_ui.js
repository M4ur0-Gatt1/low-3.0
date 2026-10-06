/* EL PAPEL CEBOLLA SE VE Y SUS FADERS SE PUEDEN USAR. CDP :9223 + mock :8791.

   POR QUE EXISTE. Reportado en v3.0.1 con capturas: «el dial del papel cebolla
   no anda nada, cuando quiero hacer clic se scrollea el sidebar, y el papel
   cebolla tampoco». Tres defectos MEDIDOS, y ninguno se veia en el mock porque
   el mock no tiene hoja de papel:
   1. Los fantasmas se dibujaban DEBAJO de la hoja blanca opaca que trae un
      documento nuevo (rect[data-low-page] 1920x1080 #ffffff).
   2. A mitad de un arrastre, el panel lateral saltaba 387 px: el fader agarrado
      se iba de la pantalla y el puntero terminaba moviendo otro canal.
   3. A 1000x560, al cambiar de cuadro la barra de la linea de tiempo se iba
      hacia arriba y quedaba cortada: el boton del papel cebolla no se alcanzaba.

   Se mide en el documento NUEVO (con su hoja) y a media pantalla.
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
  const alcanzable = (expr) => ev(`(()=>{const e=${expr};if(!e)return null;const r=e.getBoundingClientRect();if(!r.width||!r.height)return null;
    const x=r.x+r.width/2,y=r.y+r.height/2,h=document.elementFromPoint(x,y);return {x,y,ok:h===e||e.contains(h),tapa:h&&(h.tagName+'.'+String(h.className).slice(0,30))};})()`);
  const click = async (expr, msg) => { const p = await alcanzable(expr); assert.ok(p, msg + ": no está en pantalla");
    assert.ok(p.ok, msg + ": está pero lo tapa " + p.tapa);
    await mouse("mousePressed", p.x, p.y, 1); await mouse("mouseReleased", p.x, p.y, 0); await wait(300); };
  const BOTON = `[...document.querySelectorAll('.tl2-tools button')].find(b=>/Activar el papel cebolla/.test(b.getAttribute('aria-label')||''))`;
  const FADERS = `[...document.querySelectorAll('.tl2-tools button')].find(b=>/faders/.test(b.getAttribute('aria-label')||''))`;
  /** El color que TERMINA en pantalla en un punto del dibujo: se rasteriza el
   *  lienzo vivo entero (hoja, fantasmas y dibujo, en su orden). */
  const pixel = (x, y) => ev(`(async()=>{const svg=document.querySelector('#dzCanvas > svg');const vb=svg.viewBox.baseVal;
    const cl=svg.cloneNode(true);cl.removeAttribute('style');/* el zoom y el centrado del editor no son del dibujo */const txt=new XMLSerializer().serializeToString(cl);const img=new Image();img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(txt);await img.decode();
    const c=document.createElement('canvas');c.width=vb.width/2;c.height=vb.height/2;const g=c.getContext('2d');g.drawImage(img,0,0,c.width,c.height);
    return [...g.getImageData(Math.round((${x}-vb.x)/2),Math.round((${y}-vb.y)/2),1,1).data];})()`);
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 560, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzDocumentNew==="function"&&typeof api!=="undefined"&&!!api').catch(() => false)) break; await wait(250); }
    await ev(`(async()=>{await dzDocumentNew();if(typeof closeL3d==='function')closeL3d();const s=document.getElementById('lowSplash');if(s)s.remove();
      if(typeof dzEnsureAnimationWorkspace==='function')await dzEnsureAnimationWorkspace();await new Promise(r=>setTimeout(r,700));dzDocCommit();
      const d=DZ.doc,pg=document.querySelector('#dzCanvas > svg > rect[data-low-page]');window.__hoja=!!pg;const papel=pg?pg.outerHTML:'';
      // cuadro 1: un círculo de trazo GRUESO; cuadro 2: un rectángulo lejos
      d.writeDrawing(papel+'<g data-low-art="colour"></g><g data-low-art="line"><circle cx="500" cy="500" r="120" fill="none" stroke="#111" stroke-width="40"/></g>');
      const n=d.level.addDrawing(d.level.nextNumber(),papel+'<g data-low-art="colour"></g><g data-low-art="line"><rect x="1300" y="300" width="200" height="160" fill="none" stroke="#111" stroke-width="8"/></g>');
      d.setCell(2,n.number);d.goTo(2);await new Promise(r=>setTimeout(r,500));})()`);
    assert.equal(await ev("window.__hoja"), true, "el documento nuevo tiene que traer su hoja: sin ella la prueba no mide el caso real");

    // 3. la barra se alcanza a media pantalla después de cambiar de cuadro
    const b = await alcanzable(BOTON);
    assert.ok(b && b.ok, "a 1000x560 el botón del papel cebolla no se alcanza: " + JSON.stringify(b));
    if (!(await ev("!!DZ.onionOn"))) await click(BOTON, "botón del papel cebolla");

    // 1. el fantasma del cuadro 1 SE VE sobre la hoja (punto del trazo del círculo)
    const conCebolla = await pixel(380, 500);
    await ev("DZ.onionOn=false;dzOnionRender();"); await wait(150);
    const sinCebolla = await pixel(380, 500);
    await ev("DZ.onionOn=true;dzOnionRender();"); await wait(150);
    assert.ok(sinCebolla[0] > 245 && sinCebolla[1] > 245 && sinCebolla[2] > 245, "sin papel cebolla ahí tiene que haber papel blanco: " + sinCebolla);
    const tinte = 765 - (conCebolla[0] + conCebolla[1] + conCebolla[2]);
    assert.ok(tinte > 40, "el fantasma del cuadro 1 no se VE: el papel lo tapa. Pixel con cebolla " + conCebolla);

    // 2. arrastrar un fader: el panel no se mueve y la opacidad cambia
    await click(FADERS, "botón de los faders");
    const fad = await ev(`(()=>{const inp=[...document.querySelectorAll('#onMixer input[type=range]')].filter(i=>{const r=i.getBoundingClientRect();return r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight;});
      const e=inp.find(i=>{const l=i.closest('.onion2-channel')&&i.closest('.onion2-channel').querySelector('label');return l&&l.textContent.trim()==='−1';});if(!e)return null;e.dataset.probe='1';const r=e.getBoundingClientRect();
      const dock=document.getElementById('dzAnimationDock');return {x:r.x+r.width/2,y:r.y+r.height*0.75,valor:+e.value,dock:dock?dock.scrollTop:0};})()`);
    assert.ok(fad, "no hay un fader a la vista");
    await mouse("mousePressed", fad.x, fad.y, 1);
    for (let i = 1; i <= 6; i++) await mouse("mouseMoved", fad.x, fad.y - i * 8, 1);
    const medio = await ev(`(()=>{const d=document.getElementById('dzAnimationDock');const e=document.querySelector('#onMixer input[data-probe]');return {dock:d?d.scrollTop:0,valor:e?+e.value:null};})()`);
    await mouse("mouseReleased", fad.x, fad.y - 48, 0); await wait(300);
    assert.equal(medio.dock, fad.dock, "el panel saltó durante el arrastre del fader: " + JSON.stringify({ antes: fad, medio }));
    assert.ok(medio.valor > fad.valor, "arrastrar el fader hacia arriba no subió su valor: " + JSON.stringify({ antes: fad, medio }));
    const op = await ev(`[...document.querySelectorAll('#dzCanvas > svg > g.dz-onion')].filter(g=>!g.classList.contains('dz-capa')).map(g=>+g.getAttribute('opacity'))`);
    assert.ok(op.length && op[0] > 0.38, "el fantasma no tomó la opacidad del fader: " + JSON.stringify(op));

    assert.deepEqual(errors, []);
    console.log("E2E papel cebolla OK", JSON.stringify({ conCebolla, sinCebolla, fader: { antes: fad.valor, medio: medio.valor }, opacidad: op }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
setTimeout(() => process.exit(1), 60000).unref();
