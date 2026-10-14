/* LA REPRODUCCIÓN NO SE CORTA, con el botón real de play. CDP :9223 + mock :8791.

   POR QUE EXISTE. Reportado en v3.29.0: «en la visión de play se ve feo,
   como cortada la reproducción». MEDIDO con la escena real de Mauro a 24 fps:
   en 2 s se pintaban 32 de 48 cuadros. Dos causas:
   - el reproductor esperaba un cuadro entero DESPUÉS de trabajar, así que
     cada vuelta duraba trabajo + 41,7 ms y el reloj mandaba saltear;
   - pintar un cuadro de una escena pesada no entra en 41,7 ms, y además en
     cada cuadro la tira de dibujos se rearmaba entera y la línea de tiempo
     barría todo su árbol buscando el cursor.

   Lo que se cuida (escena sintética pesada sobre una hoja real con papel):
   1. Sin pre-render, apretando play: se pintan casi todos los cuadros (con
      el reloj viejo se pierde uno de cada cuatro).
   2. Con los cuadros pre-renderizados: se ve la IMAGEN del cuadro que toca
      (lienzo encima de la hoja) y se pintan casi todos.
   3. Al parar: la imagen se va y queda la hoja real del cuadro donde paró.
   4. Editar invalida las imágenes: nunca se reproduce algo viejo.
   5. La tira de dibujos NO se rearma en cada cuadro (sólo mueve «actual»).
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
  const clic = async (sel, msg) => {
    const p = await ev(`(()=>{const e=${sel};if(!e||!e.offsetParent)return null;const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    assert.ok(p, msg + ": no está visible");
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...p, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...p, button: "left", buttons: 0, clickCount: 1 });
  };
  // Cuenta los cuadros que de verdad llegaron a pantalla: el frame del
  // documento leído en cada repintado del navegador, no los eventos «frame».
  const reproducir = async (ms) => {
    await ev(`(()=>{DZ.playback.stop();DZ.doc.goTo(1);window.__vistos=new Set();window.__imagenes=[];window.__corre=true;
      const R=LOW.animation.reproduccionFluida;
      const loop=()=>{if(!window.__corre)return;window.__vistos.add(DZ.doc.frame);
        if(R.estado.mostrado!=null)window.__imagenes.push([R.estado.mostrado,DZ.doc.frame]);requestAnimationFrame(loop);};
      requestAnimationFrame(loop);})()`);
    await wait(300);
    await clic(`document.querySelector('#tlPlay')`, "botón de play");
    await wait(ms);
    await clic(`document.querySelector('#tlPlay')`, "botón de pausa");
    await wait(250);
    return ev(`(()=>{window.__corre=false;return {pintados:window.__vistos.size,imagenes:window.__imagenes.length,
      malas:window.__imagenes.filter(([a,b])=>a!==b).length,playing:DZ.playback.playing};})()`);
  };
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 560, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzDocumentNew==="function"&&typeof api!=="undefined"&&!!api').catch(() => false)) break; await wait(250); }
    // 48 dibujos distintos, cada uno con cientos de trazos: pintar
    // un cuadro cuesta de verdad, como en una escena real
    await ev(`(async()=>{await dzDocumentNew();if(typeof closeL3d==='function')closeL3d();const s=document.getElementById('lowSplash');if(s)s.remove();
      if(typeof dzEnsureAnimationWorkspace==='function')await dzEnsureAnimationWorkspace();await new Promise(r=>setTimeout(r,700));dzDocCommit();
      const d=DZ.doc,pg=document.querySelector('#dzCanvas > svg > rect[data-low-page]'),papel=pg?pg.outerHTML:'';let semilla=7;const azar=()=>(semilla=(semilla*16807)%2147483647)/2147483647;
      for(let f=1;f<=48;f++){let t='';for(let i=0;i<260;i++){const x=azar()*1800+60,y=azar()*1000+40;
          t+='<path d="M'+x.toFixed(1)+' '+y.toFixed(1)+' q'+(azar()*80-40).toFixed(1)+' '+(azar()*80-40).toFixed(1)+' '+(azar()*120-60).toFixed(1)+' '+(azar()*120-60).toFixed(1)+'" fill="none" stroke="#222" stroke-width="'+(2+azar()*6).toFixed(1)+'"/>';}
        // marca de cuadro: un círculo lleno que se corre en x
        t+='<circle cx="'+(100+f*35)+'" cy="560" r="60" fill="#d01010"/>';
        // el PAPEL va sólo en el dibujo 1, como en una escena real: los dibujos que se
        // crean después nacen transparentes (así se apilaban en v3.29.1)
        const n=d.level.addDrawing(d.level.nextNumber(),(f===1?papel:'')+'<g data-low-art="colour"></g><g data-low-art="line">'+t+'</g>');d.setCell(f,n.number);}
      d.setPlaybackRange(1,48);d.scene.fps=24;d.goTo(1);d.emit('level');DZ.history.clear();await new Promise(r=>setTimeout(r,600));})()`);
    assert.equal(await ev("!!document.querySelector('#dzCanvas > svg rect[data-low-page]')"), true, "la hoja tiene que tener papel, como un documento real");

    // 5. la tira de dibujos no se rearma al cambiar de cuadro
    const tiraEstable = await ev(`(async()=>{const a=document.querySelector('.ls2-item');DZ.doc.goTo(5);await new Promise(r=>setTimeout(r,100));
      return {mismo:document.querySelector('.ls2-item')===a,actual:+(document.querySelector('.ls2-item.actual')||{dataset:{}}).dataset.num,cell:DZ.doc.cell};})()`);
    assert.equal(tiraEstable.mismo, true, "la tira de dibujos se rearmó entera por un cambio de cuadro");
    assert.equal(tiraEstable.actual, tiraEstable.cell, "la tira no marca el dibujo del cuadro actual: " + JSON.stringify(tiraEstable));

    // 1. sin imágenes preparadas
    await ev("LOW.animation.reproduccionFluida.activa=false");
    const sin = await reproducir(2000);
    assert.equal(sin.playing, false, "la pausa no paró");
    assert.ok(sin.pintados >= 42, "la reproducción se corta: se pintaron " + sin.pintados + " de 48 cuadros en 2 s");

    // 2. con los cuadros pre-renderizados
    await ev(`(async()=>{const R=LOW.animation.reproduccionFluida;R.activa=true;await R.preparar();while(R.estado.preparando)await new Promise(r=>setTimeout(r,100));})()`);
    assert.equal(await ev("LOW.animation.reproduccionFluida.estado.cache.size"), 48, "no se prepararon los 48 cuadros");
    const con = await reproducir(2000);
    assert.ok(con.pintados >= 44, "con los cuadros listos igual se corta: " + con.pintados + " de 48");
    assert.ok(con.imagenes > 20, "reproduciendo no se mostró la imagen pre-renderizada: " + JSON.stringify(con));
    assert.equal(con.malas, 0, "la imagen mostrada no era la del cuadro que tocaba: " + JSON.stringify(con));
    // la imagen es la del cuadro: el círculo rojo está donde va en ese cuadro.
    // Se muestra ANTES el cuadro 30: en v3.29.1 cada imagen se pintaba encima de la
    // anterior sin borrarla y, con dibujos transparentes, la reproducción acumulaba
    // todos los cuadros (reportado por Mauro con captura).
    const pixel = await ev(`(async()=>{const R=LOW.animation.reproduccionFluida;DZ.doc.goTo(10);
      R.mostrar(30);R.mostrar(10);const c=document.getElementById("dzReproFluida");
      const svg=document.querySelector('#dzCanvas > svg'),vb=svg.viewBox.baseVal,k=c.width/vb.width;
      const g=c.getContext('2d');const en=(x)=>Array.from(g.getImageData(Math.round((x-vb.x)*k),Math.round((560-vb.y)*k),1,1).data);
      const fondo=Array.from(g.getImageData(Math.round((1700-vb.x)*k),Math.round((200-vb.y)*k),1,1).data);
      const r={aca:en(100+10*35),alla:en(100+30*35),fondo};R.ocultar();return r;})()`);
    assert.ok(pixel.aca[0] > 150 && pixel.aca[1] < 90, "la imagen del cuadro 10 no tiene su marca roja: " + JSON.stringify(pixel));
    assert.ok(!(pixel.alla[0] > 150 && pixel.alla[1] < 90), "la reproducción ACUMULA cuadros: mostrando el 10 sigue la marca del 30: " + JSON.stringify(pixel));
    assert.equal(pixel.fondo[3], 255, "la imagen del cuadro es transparente: deja ver la hoja vieja de abajo: " + JSON.stringify(pixel));

    // 3. al parar se ve la hoja real
    await ev(`(async()=>{DZ.doc.goTo(1);await new Promise(r=>setTimeout(r,200));})()`);
    await clic(`document.querySelector('#tlPlay')`, "botón de play");
    await wait(700);
    await clic(`document.querySelector('#tlPlay')`, "botón de pausa");
    await wait(300);
    const parado = await ev(`(()=>{const c=document.getElementById('dzReproFluida');const f=DZ.doc.frame;
      const marca=document.querySelector('#dzCanvas > svg circle[fill="#d01010"]');
      return {frame:f,oculto:!c||c.hidden,marcaX:marca?+marca.getAttribute('cx'):null,listaPendiente:!!LOW.animation.reproduccionFluida.estado.listaPendiente};})()`);
    assert.equal(parado.oculto, true, "al parar sigue la imagen encima de la hoja");
    assert.equal(parado.listaPendiente, false, "al parar no se rearmó la lista de elementos que se postergó durante el play");
    assert.equal(parado.marcaX, 100 + parado.frame * 35, "al parar la hoja no muestra el cuadro donde quedó: " + JSON.stringify(parado));

    // 4. editar tira las imágenes
    await ev(`(async()=>{DZ.doc.goTo(3);DZ.doc.writeDrawing(DZ.doc.drawing.content+'<rect x="10" y="10" width="50" height="50"/>');await new Promise(r=>setTimeout(r,100));})()`);
    await clic(`document.querySelector('#tlPlay')`, "botón de play");
    await wait(150);
    const tras = await ev(`(()=>{const R=LOW.animation.reproduccionFluida;return {viejas:R.estado.cache.size,mostrado:R.estado.mostrado};})()`);
    await clic(`document.querySelector('#tlPlay')`, "botón de pausa");
    assert.ok(tras.viejas < 48, "después de editar se siguen usando las imágenes viejas: " + JSON.stringify(tras));

    assert.deepEqual(errors, []);
    console.log("E2E reproducción fluida OK", JSON.stringify({ sin, con, parado, tras }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
setTimeout(() => process.exit(1), 120000).unref();
