/* IMPORTAR STORYBOARDER, con clic real. CDP :9223 + mock :8791.

   POR QUE EXISTE. La puesta con monigotes 3D se hace en Storyboarder y se trae
   a LOW abriendo su .storyboarder. Lo que se cuida:
   1. El boton existe en el panel y trae los paneles AL FINAL, con toma,
      dialogo y duracion convertida a cuadros.
   2. La imagen sale APLANADA como la ve Storyboarder: el calco (reference) va
      DEBAJO del dibujo y con su opacidad. Se mide el pixel, no la existencia.
   3. Importar es UN solo Deshacer.
   4. Con imagen en todos los paneles, «Crear animatic» queda habilitado: el
      recorrido sigue sin pasos a mano.
   5. La barra del panel sigue A LA VISTA con el panel scrolleado hasta abajo
      (la captura de Mauro mostraba el generador sin + Panel ni Capturar).
   6. Cancelar el dialogo no toca nada.
*/
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const tab = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl), pending = new Map(), errors = []; let id = 0;
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ({ data }) => { const m = JSON.parse(data);
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.text);
    const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.j(Error(m.error.message)) : p.r(m.result); } };
  const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; pending.set(n, { r, j }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const click = async (selector) => {
    const p = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    assert.ok(p, "no está en pantalla: " + selector);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...p, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...p, button: "left", buttons: 0, clickCount: 1 });
    await wait(120);
  };
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 100; i++) { if (await ev('typeof dzSbMount==="function"&&typeof api!=="undefined"&&!!api')) break; await wait(150); }
    await ev(`(async()=>{localStorage.clear();await openDesign('mock.svg');await dzDocInit();closeL3d();await dzSbMount();})()`);
    await wait(500);
    assert.equal(await ev("!!document.querySelector('[data-sb=import-storyboarder]')"), true, "falta el botón Importar Storyboarder");

    // capas sintéticas: calco ROJO opaco en todo el cuadro, dibujo AZUL en la mitad izquierda
    await ev(`(()=>{
      const capa=(pintar)=>{const c=document.createElement('canvas');c.width=160;c.height=90;const x=c.getContext('2d');pintar(x);return c.toDataURL('image/png');};
      const ref=capa(x=>{x.fillStyle='#ff0000';x.fillRect(0,0,160,90);});
      const fill=capa(x=>{x.fillStyle='#0000ff';x.fillRect(0,0,80,90);});
      window.__sbCalls=0;
      pywebview.api.import_storyboarder=async()=>{window.__sbCalls++;return window.__sbCancel?{cancel:true}:{
        name:'escena',version:'2.0.1',fps:24,aspectRatio:16/9,defaultBoardTiming:2000,missing:[],
        boards:[
          {uid:'AAAAA',shot:'1A',newShot:true,duration:1500,dialogue:'Hola',action:'Entra',notes:'',
           layers:[{name:'reference',data:ref,opacity:0.5},{name:'fill',data:fill,opacity:1}],posterframe:null,audio:null,
           sg:{version:'2.0.1',data:{sceneObjects:{c:{type:'camera',fov:22.25}}}}},
          {uid:'BBBBB',shot:'1B',duration:null,dialogue:'',action:'',notes:'',layers:[{name:'fill',data:fill,opacity:1}],posterframe:null,audio:null,sg:null}
        ]};};
    })()`);

    // 6. cancelar no toca nada
    await ev("window.__sbCancel=true");
    const antes = await ev("JSON.stringify(DZ.doc.scene.storyboard)");
    await click("[data-sb=import-storyboarder]"); await wait(300);
    assert.equal(await ev("window.__sbCalls"), 1, "el clic no llegó al puente");
    assert.equal(await ev("JSON.stringify(DZ.doc.scene.storyboard)"), antes, "cancelar el diálogo cambió el storyboard");

    // 1. importar
    await ev("window.__sbCancel=false");
    await click("[data-sb=import-storyboarder]");
    for (let i = 0; i < 40; i++) { if (await ev("DZ.doc.scene.storyboard.boards.length===2")) break; await wait(100); }
    const b = await ev(`DZ.doc.scene.storyboard.boards.map(x=>({name:x.name,dur:x.duration,dia:x.dialogue,png:!!x.drawingRef?.png,app:x.source?.app,fov:x.source?.sg?.data?.sceneObjects?.c?.fov}))`);
    assert.equal(b.length, 2, "no importó los dos paneles: " + JSON.stringify(b));
    assert.deepEqual(b[0], { name: "1A", dur: 36, dia: "Hola", png: true, app: "storyboarder", fov: 22.25 });
    assert.equal(b[1].dur, 48, "sin duración tiene que usar defaultBoardTiming (2 s = 48 cuadros)");

    // 2. el pixel: izquierda = dibujo azul ENCIMA; derecha = calco rojo al 50% sobre papel blanco
    const px = await ev(`(async()=>{const img=new Image();img.src=DZ.doc.scene.storyboard.boards[0].drawingRef.png;await img.decode();
      const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const x=c.getContext('2d');x.drawImage(img,0,0);
      const at=(u,v)=>[...x.getImageData(Math.round(u*c.width),Math.round(v*c.height),1,1).data];return {izq:at(.2,.5),der:at(.8,.5)};})()`);
    assert.deepEqual(px.izq.slice(0, 3), [0, 0, 255], "el dibujo tiene que tapar al calco: " + JSON.stringify(px));
    assert.ok(Math.abs(px.der[0] - 255) <= 2 && Math.abs(px.der[1] - 128) <= 3 && Math.abs(px.der[2] - 128) <= 3,
      "el calco al 50% sobre papel blanco da rosa (255,128,128): " + JSON.stringify(px));

    // 4. el recorrido sigue: crear animatic habilitado
    assert.equal(await ev("document.querySelector('[data-sb=create]').disabled"), false, "con imagen en todos los paneles, Crear animatic tiene que estar habilitado");

    // 3. un solo deshacer
    await ev("dzUndo()"); await wait(100);
    assert.equal(await ev("DZ.doc.scene.storyboard.boards.length"), 0, "importar tiene que ser UN solo Deshacer");
    await ev("dzRedo()"); await wait(150);
    assert.equal(await ev("DZ.doc.scene.storyboard.boards.length"), 2);

    // 5. barra a la vista con el panel scrolleado hasta abajo
    // el panel al alto de la captura de Mauro (~240 px): con esto SÍ hay scroll
    await ev("document.querySelector('#dzStoryboard').style.height='240px'"); await wait(100);
    const barra = await ev(`(()=>{const body=document.querySelector('#dzSbBody');body.scrollTop=body.scrollHeight;
      const btn=document.querySelector('[data-sb=import-storyboarder]');const r=btn.getBoundingClientRect(),rb=body.getBoundingClientRect();
      const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      return {scrolled:body.scrollTop>0,dentro:r.top>=rb.top-1&&r.bottom<=rb.bottom+1,alcanza:hit===btn||btn.contains(hit)};})()`);
    assert.equal(barra.scrolled, true, "la prueba no llegó a scrollear el panel: no mediría nada " + JSON.stringify(barra));
    assert.equal(barra.dentro, true, "la barra se fue de la vista al scrollear: " + JSON.stringify(barra));
    assert.equal(barra.alcanza, true, "la barra se ve pero algo la tapa: " + JSON.stringify(barra));

    assert.deepEqual(errors, []);
    console.log("E2E importar Storyboarder OK", JSON.stringify({ paneles: b, pixel: px, barra }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
setTimeout(() => process.exit(1), 60000).unref();
