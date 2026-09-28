/* LAS COLUMNAS QUE §6 PIDE EN EL X-SHEET. CDP :9223 + mock :8791.

   §6 dice, literal: «filas son fotogramas; columnas son niveles, camara, audio
   y efectos». Hasta la v4.27.0 la hoja tenia el numero de cuadro y una columna
   por capa, y nada mas: la mitad de lo que la biblia define no estaba, y el
   balance lo tenia anotado como el hueco de implementacion del X-sheet.

   Este recorrido comprueba que las tres columnas MUESTREN LO QUE PASA, no que
   existan. Y hay una asercion que es la que de verdad importa:

   · EL AUDIO RESPETA SU DESPLAZAMIENTO. La pista tiene un `offset` en cuadros
     para calzarla con la accion, y `peakAt` ya lo aplica. Si la columna leyera
     `peaks` crudo, mostraria la onda CORRIDA respecto de lo que se escucha —el
     error mas facil de cometer aca y el mas dificil de notar mirando, porque la
     columna se veria perfectamente bien—.

   Las otras dos se comprueban contra el modelo, no contra un numero fijo: las
   claves de camara salen de scene.camera.keys, que es lo que la camara usa para
   interpolar, y las de efectos de las claves de composicion por plano. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map(), errores = [];
  ws.onmessage = event => { const m = JSON.parse(event.data);
    if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (!m.id || !pending.has(m.id)) return; const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 180000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 950, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 60; i++) {
    const r = await send("Runtime.evaluate", { expression: 'typeof dzXsMount==="function" && !!api', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const errs=[]; window.addEventListener("error", e=>errs.push(String(e.message)));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit(); await w(700);
    // Sin entrar al espacio de animacion, #designView queda en display:none y
    // TODO mide cero: no se puede comprobar si una columna se estira.
    LOW.workspace.workspaces.activate("animation",dzWsAplicar); await w(800);
    const doc=DZ.doc, sc=doc.scene;

    // El panel puede quedar abierto pero sin tamaño segun la disposicion, y sin
    // caja no se puede medir si las columnas se estiran o no. Se le da medida a
    // proposito: es andamio de la prueba, no del producto.
    const abrir=async()=>{ const p=document.querySelector("#dzXsheet");
      if(p){ p.hidden=false; p.style.height="360px"; p.style.minHeight="360px";
        p.style.width="520px"; p.style.minWidth="520px"; }
      if(typeof dzXsMount==="function") await dzXsMount();
      await w(700); };
    await abrir();

    // ── SIN AUDIO todavia: la columna lo dice y no se cae.
    let sinAudio=null;
    {
      const celdas=[...document.querySelectorAll(".xs2-cell.xs2-aud")];
      sinAudio={celdas:celdas.length, vacias:celdas.filter(c=>c.classList.contains("vacia")).length,
        dice:(celdas[0]||{}).title||"", ondas:document.querySelectorAll(".xs2-onda").length,
        cabecera:(document.querySelector(".xs2-col-head.xs2-aud")||{}).title||""};
    }

    // ── Escena con las TRES cosas, y el audio DESPLAZADO a proposito.
    const DESFASE=2;
    sc.camera=sc.camera||{keys:{}};
    sc.camera.keys={2:{x:0,y:0,zoom:1}, 8:{x:120,y:-40,zoom:1.25}, 15:{x:0,y:0,zoom:1}};
    const picos=Array.from({length:20},(_,i)=>Math.min(1,(i%5)/4));
    if(LOW.animation.AudioTrack){
      doc.audio=new LOW.animation.AudioTrack(doc);
      doc.audio.name="voz.wav"; doc.audio.offset=DESFASE; doc.audio.peaks=picos.slice();
    }
    const pid="prueba:0", pid2="prueba:1";
    sc.ensureCompositionPlane(pid,{}); sc.ensureCompositionPlane(pid2,{});
    sc.setCompositionTransform(pid,{z:120},4);
    sc.setCompositionTransform(pid,{z:0},10);
    sc.setCompositionTransform(pid2,{z:60},10);      // dos planos en el MISMO cuadro
    doc.emit("frame"); await w(400);
    await abrir();

    const fila=f=>document.querySelector('.xs2-row[data-frame="'+f+'"]');
    const cel=(f,cls)=>fila(f) && fila(f).querySelector(".xs2-cell."+cls);

    // ── 1. LAS TRES COLUMNAS, en su orden y despues de las capas.
    const cabezas=[...document.querySelectorAll(".xs2-col-head")].map(h=>h.textContent);
    const fijas=[...document.querySelectorAll(".xs2-col-head.xs2-fija")].map(h=>h.textContent);
    const orden={cabezas, fijas,
      despuesDeLasCapas:cabezas.indexOf(fijas[0])>0,
      anchoFijo:(()=>{ const c=document.querySelector(".xs2-col-head.xs2-cam");
        return c?Math.round(c.getBoundingClientRect().width):0; })()};

    // ── 2. CAMARA: un rombo por clave, en los cuadros de la clave y no en otros.
    const conRombo=[...document.querySelectorAll(".xs2-cell.xs2-cam")]
      .filter(c=>c.querySelector(".xs2-camkey"))
      .map(c=>Number(c.parentElement.dataset.frame)).sort((a,b)=>a-b);
    const camara={enLaEscena:Object.keys(sc.camera.keys).map(Number).sort((a,b)=>a-b),
      enLaHoja:conRombo,
      tituloDeUna:(cel(8,"xs2-cam")||{}).title||"",
      tituloDeUnaSin:(cel(9,"xs2-cam")||{}).title||""};

    // ── 3. AUDIO: el nivel de cada cuadro tiene que salir de peakAt, que aplica
    //    el desplazamiento. Se compara la barra contra el pico CORRIDO.
    const leerAncho=f=>{ const b=cel(f,"xs2-aud") && cel(f,"xs2-aud").querySelector(".xs2-onda");
      return b?parseFloat(b.style.getPropertyValue("--nivel")):null; };
    const muestras=[3,5,7,9].map(f=>({f, enLaHoja:leerAncho(f),
      porPeakAt:Math.round(doc.audio.peakAt(f)*1000)/10,
      crudoSinDesfase:Math.round((picos[f-1]||0)*1000)/10}));
    const audio={muestras, desfase:doc.audio.offset,
      // si alguna muestra distingue las dos lecturas, la prueba SIRVE
      elDesfaseSeNota:muestras.some(m=>Math.abs(m.porPeakAt-m.crudoSinDesfase)>1),
      cabecera:(document.querySelector(".xs2-col-head.xs2-aud")||{}).title||"",
      ondas:document.querySelectorAll(".xs2-onda").length};

    // ── 4. EFECTOS: marca donde hay clave, y CUENTA cuando hay mas de un plano.
    const efectos={enCuatro:(cel(4,"xs2-fx")||{}).textContent,
      puntoEnCuatro:!!(cel(4,"xs2-fx")&&cel(4,"xs2-fx").querySelector(".xs2-fxkey")),
      enDiez:(cel(10,"xs2-fx")||{}).textContent,
      marcadoEnDiez:!!(cel(10,"xs2-fx")&&cel(10,"xs2-fx").classList.contains("hay")),
      enCinco:(cel(5,"xs2-fx")||{}).textContent,
      marcadoEnCinco:!!(cel(5,"xs2-fx")&&cel(5,"xs2-fx").classList.contains("hay")),
      tituloDeDiez:(cel(10,"xs2-fx")||{}).title||""};

    // ── 5. CLIC en cualquiera de las tres lleva a ese cuadro.
    doc.goTo(1); await w(300);
    const antes=doc.frame;
    cel(8,"xs2-cam").click(); await w(350);
    const trasCam=doc.frame;
    await abrir();
    cel(6,"xs2-aud").click(); await w(350);
    const trasAud=doc.frame;
    const navega={antes, trasCam, trasAud};

    return {sinAudio,orden,camara,audio,efectos,navega,errs:errs.slice(0,4)};
  })()`;

  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  const v = r.result?.value;
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  if (v?.orden?.fijas?.join(",") !== "CÁM,AUDIO,EFEC")
    mal("faltan las columnas que §6 pide —cámara, audio y efectos— o están en otro orden",
      v?.orden);
  if (!v.orden.despuesDeLasCapas)
    mal("las columnas fijas quedaron antes de los niveles: el espacio de la hoja es de las capas",
      v.orden);
  if (!(v.orden.anchoFijo > 10 && v.orden.anchoFijo < 40))
    mal("la columna de cámara no tiene ancho fijo y angosto: se estira como una capa",
      v.orden);

  if (v.camara.enLaHoja.join(",") !== v.camara.enLaEscena.join(","))
    mal("los rombos de cámara no coinciden con las claves de la escena", v.camara);
  if (!/[Cc]lave de cámara/.test(v.camara.tituloDeUna))
    mal("una clave de cámara no se explica al pasar el mouse", v.camara);
  if (/^Clave/.test(v.camara.tituloDeUnaSin))
    mal("un cuadro SIN clave dice que tiene una", v.camara);

  if (v.audio.ondas < 10) mal("la columna de audio no dibuja la onda", v.audio);
  if (!v.audio.elDesfaseSeNota)
    mal("la prueba no distingue leer con desplazamiento de leer crudo: con estos picos no " +
      "probaría nada", v.audio);
  for (const m of v.audio.muestras) {
    if (m.enLaHoja == null) mal("falta la barra de audio del cuadro " + m.f, v.audio);
    if (Math.abs(m.enLaHoja - m.porPeakAt) > 0.6)
      mal("el nivel del cuadro " + m.f + " no es el de peakAt", { muestra: m, desfase: v.audio.desfase });
    if (Math.abs(m.enLaHoja - m.crudoSinDesfase) < 0.6 && Math.abs(m.porPeakAt - m.crudoSinDesfase) > 1)
      mal("la columna lee `peaks` CRUDO: muestra la onda corrida respecto de lo que se " +
        "escucha", { muestra: m, desfase: v.audio.desfase });
  }
  if (!/voz\.wav/.test(v.audio.cabecera))
    mal("la cabecera de audio no dice de qué pista es la onda", v.audio);

  if (!v.efectos.puntoEnCuatro)
    mal("una clave de composición de UN plano no se marca", v.efectos);
  if (v.efectos.enCuatro !== "")
    mal("con un solo plano se escribe un número en vez de marcar el punto", v.efectos);
  if (v.efectos.enDiez !== "2" || !v.efectos.marcadoEnDiez)
    mal("con dos planos en el mismo cuadro no se ve cuántos son", v.efectos);
  if (v.efectos.marcadoEnCinco || v.efectos.enCinco !== "")
    mal("un cuadro sin claves de composición aparece marcado", v.efectos);
  if (!/2 planos/.test(v.efectos.tituloDeDiez))
    mal("no se dice cuántos planos tienen clave en ese cuadro", v.efectos);

  if (v.navega.trasCam !== 8)
    mal("clic en la columna de cámara no lleva a ese cuadro", v.navega);
  if (v.navega.trasAud !== 6)
    mal("clic en la columna de audio no lleva a ese cuadro", v.navega);

  if (v.sinAudio.ondas !== 0)
    mal("sin pista cargada se dibuja onda igual", v.sinAudio);
  if (v.sinAudio.vacias !== v.sinAudio.celdas || !/[Ss]in audio/.test(v.sinAudio.dice))
    mal("sin pista, la columna de audio no lo dice", v.sinAudio);

  if (v.errs?.length) throw Error("REGRESIÓN: excepciones en el X-sheet: " + v.errs.join(" | "));
  if (errores.length) throw Error("REGRESIÓN: excepciones: " + errores.slice(0, 3).join(" | "));

  console.log("E2E columnas del X-sheet OK", JSON.stringify({ columnas: v.orden.fijas,
    camara: v.camara.enLaHoja, desfaseDelAudio: v.audio.desfase,
    muestras: v.audio.muestras.map(m => m.f + ":" + m.enLaHoja),
    efectos: { unPlano: v.efectos.puntoEnCuatro, dosPlanos: v.efectos.enDiez },
    navega: v.navega }));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
