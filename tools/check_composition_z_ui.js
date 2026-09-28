/* DOS CAMBIOS SEGUIDOS EN COMPOSICION, Y EL SALTO DEL PAPEL CEBOLLA.
   CDP :9223 + mock :8791.

   El reporte: «el eje Z sigue sin poder cambiar». Con el dato que lo desatasco:
   en su pantalla X valia 240 e Y −290 —o sea que SI se habian escrito— y Z
   seguia en 0. Si el camino de escritura estuviera roto, X e Y tambien
   fallarian; algo pisaba especificamente al SEGUNDO cambio.

   Medido en la app real (WebView2), la traza fue inequivoca:

     == X ==            seleccion: "ly:1"   esta en la lista: SI
     vista.onTransform  {x:240}             se escribe
     applyToCanvas      (repintado)
     == Z ==            seleccion: null     esta en la lista: NO

   La causa: `setCompositionTransform` emitia "frame", y el manejador de "frame"
   es el de CAMBIO DE CUADRO: reemplaza el lienzo entero desde el documento y
   llama a dzDeselect(). Eso vaciaba la lista de planos, la vista perdia la
   seleccion, y el cambio siguiente caia en el `if (!active) return` de input()
   sin hacer nada ni decir nada. Mover un plano no es cambiar de cuadro.

   Y el otro reporte, del mismo panel de al lado: «al hacer clic en el
   controlador tipo consola de sonido del papel cebolla hace un salto de
   pantalla, no me deja usarlo». Medido: enfocar un fader movia #onMixer de 0 a
   159 en horizontal y #dzAnimationDock de 0 a 114 en vertical —el
   `scroll-into-view` implicito del foco—, asi que el panel se corria bajo el
   puntero. */
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
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 60; i++) {
    const r = await send("Runtime.evaluate", { expression: 'typeof dzCompositionAplicar==="function" && typeof dzOnionScrollFoto==="function" && !!api', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const errs=[]; window.addEventListener("error", e=>errs.push(String(e.message)));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit(); await w(700);
    LOW.workspace.workspaces.activate("drawing",dzWsAplicar); await w(600);
    // ── EL SALTO del papel cebolla.
    if (document.querySelector("#dzOnionPanel").hidden) await dzOnionPanelToggle();
    await w(700);
    dzOnionMixerPreset("curve"); await w(400);
    const mixer=document.querySelector("#onMixer");
    const ins=[...mixer.querySelectorAll(".onion2-channel input[type=range]")];
    const nodos=[]; for(let n=mixer;n&&n!==document.documentElement;n=n.parentElement) nodos.push(n);
    const foto=()=>nodos.map(n=>[n.id||n.tagName,n.scrollLeft,n.scrollTop]);
    mixer.scrollLeft=0; await w(250);
    const antesClic=foto();
    const u=ins[Math.floor(ins.length/2)];
    const r=u.getBoundingClientRect();
    u.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerId:9,
      pointerType:"mouse",isPrimary:true,button:0,buttons:1,
      clientX:Math.round(r.x+r.width/2), clientY:Math.round(r.y+r.height/2)}));
    u.focus(); await w(400);
    const despuesClic=foto();
    const saltos=antesClic.map((a,i)=>({nodo:a[0], izq:[a[1],despuesClic[i][1]], arriba:[a[2],despuesClic[i][2]]}))
      .filter(c=>c.izq[0]!==c.izq[1]||c.arriba[0]!==c.arriba[1]);
    const cebolla={saltos, conFoco:document.activeElement===u,
      desbordaElMixer:mixer.scrollWidth>mixer.clientWidth+1};

    LOW.workspace.workspaces.activate("composite",dzWsAplicar); await w(900);
    dzCompositionViewShow(true); await w(700);
    dzCompositionViewRender(); await w(500);
    const v=window.DZ_COMPOSITION_VIEW;
    if(!v || !v.planes.length) return {sinPlanos:true, errs};
    const raiz=v.root;
    const id=v.planes[v.planes.length-1].id;
    v.select(id); await w(400);
    const campo=k=>raiz.querySelector('.cmp3-inspector input[data-p="'+k+'"]');
    const lee=()=>{ const t=DZ.doc.scene.compositionTransformAt(id,DZ.doc.frame)||{};
      return {x:Math.round(t.x||0), y:Math.round(t.y||0), z:Math.round(t.z||0)}; };
    const escribir=async(k,valor)=>{ const c=campo(k); c.value=String(valor);
      c.dispatchEvent(new Event("input",{bubbles:true})); await w(200);
      c.dispatchEvent(new Event("change",{bubbles:true})); await w(700); };

    // ── DOS CAMBIOS SEGUIDOS. El segundo es el que fallaba.
    await escribir("x",240);
    const trasX={valores:lee(), planos:v.planes.length, seleccion:v.selected,
      sigueElegido:v.planes.some(p=>p.id===v.selected)};
    await escribir("z",150);
    const trasZ={valores:lee(), planos:v.planes.length, seleccion:v.selected};
    // y un TERCERO, para que no sea suerte
    await escribir("y",-90);
    const trasY={valores:lee(), planos:v.planes.length};

    // ── EL LIENZO NO SE REPINTA al mover un plano. Esta es LA prueba del
    //    arreglo, y hay que montarla con cuidado: si el contenido del lienzo es
    //    igual al que el documento tiene guardado, un repintado lo restaura
    //    identico y no se nota nada. Por eso se agrega un testigo al lienzo SIN
    //    volcarlo al documento: si el cambio de composicion dispara el manejador
    //    de cuadro —que hace dzCanvasSet(dibujo.content)— el testigo desaparece.
    //    Es exactamente lo que vaciaba la lista de planos en la app real.
    const hoja=()=>document.querySelector("#dzCanvas > svg");
    const NS="http://www.w3.org/2000/svg";
    const testigo=document.createElementNS(NS,"rect");
    testigo.setAttribute("data-testigo","1"); testigo.setAttribute("x",10);
    testigo.setAttribute("y",10); testigo.setAttribute("width",30);
    testigo.setAttribute("height",30); testigo.setAttribute("fill","#0f0");
    hoja().appendChild(testigo);
    const hijosAntes=hoja().children.length;
    await escribir("z",200);
    const lienzo={hijosAntes, hijosDespues:hoja().children.length,
      testigoVive:!!hoja().querySelector("[data-testigo]"),
      planosTrasTestigo:v.planes.length, seleccionTrasTestigo:v.selected,
      zTrasTestigo:lee().z};

    // ── ESCALONAR Z, con la mesa ya tocada.
    const zAntes=v.planes.map(p=>Math.round((p.transform||{}).z||0));
    raiz.querySelector('[data-a="stagger"]').click(); await w(900);
    const stagger={antes:zAntes, despues:v.planes.map(p=>Math.round((p.transform||{}).z||0))};

    // ── SIN PLANO ELEGIDO el campo lo DICE, en vez de quedarse mudo.
    v.selected="no-existe-este-plano";
    await escribir("z",99);
    const mudo={rotulo:raiz.querySelector(".cmp3-mode").textContent};
    v.select(id); await w(300);

    return {trasX,trasZ,trasY,lienzo,stagger,mudo,cebolla,errs:errs.slice(0,4)};
  })()`;

  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  const v = r.result?.value;
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  if (v?.sinPlanos) mal("la mesa de composición no tiene planos", v);

  if (v.trasX.valores.x !== 240) mal("el PRIMER cambio no se escribe", v.trasX);
  if (!v.trasX.planos) mal("mover un plano VACÍA la lista de planos: el cambio siguiente " +
    "no va a hacer nada", v.trasX);
  if (!v.trasX.sigueElegido) mal("mover un plano PIERDE la selección: el cambio siguiente cae " +
    "en el `if (!active) return` y no hace nada", v.trasX);

  if (v.trasZ.valores.z !== 150) mal("el SEGUNDO cambio (la Z) no se escribe: es exactamente " +
    "el reporte «el eje Z sigue sin poder cambiar»", v.trasZ);
  if (v.trasZ.valores.x !== 240) mal("escribir la Z se llevó puesto el X anterior", v.trasZ);
  if (v.trasY.valores.y !== -90) mal("el TERCER cambio no se escribe", v.trasY);
  if (v.trasY.valores.z !== 150 || v.trasY.valores.x !== 240)
    mal("cada cambio pisa los anteriores", v.trasY);

  if (!v.lienzo.testigoVive)
    mal("mover un plano REPINTA el lienzo desde el documento y se lleva lo que había " +
      "sin volcar: eso es lo que vaciaba la lista de planos y perdía la selección", v.lienzo);
  if (v.lienzo.hijosDespues !== v.lienzo.hijosAntes)
    mal("mover un plano cambia el CONTENIDO del lienzo: sólo debería aplicar la " +
      "transformación", v.lienzo);
  if (!v.lienzo.planosTrasTestigo || v.lienzo.zTrasTestigo !== 200)
    mal("con el lienzo desincronizado del documento, mover un plano rompe la mesa", v.lienzo);

  if (!v.stagger.despues.some((z, i) => z !== v.stagger.antes[i]))
    mal("Escalonar Z no cambia ninguna profundidad", v.stagger);
  if (v.stagger.despues.every(z => z === 0))
    mal("Escalonar Z deja todos los planos en 0", v.stagger);

  if (!/Eleg|planos/i.test(v.mudo.rotulo))
    mal("sin plano elegido el campo se queda MUDO: es lo que hacía parecer que el " +
      "inspector estaba muerto", v.mudo);

  if (!v.cebolla.desbordaElMixer)
    mal("el mixer dejó de desbordar: la prueba del salto ya no probaría nada", v.cebolla);
  if (v.cebolla.saltos.length)
    mal("tocar un fader del papel cebolla SALTA la pantalla: el panel se corre bajo el " +
      "puntero", v.cebolla.saltos);
  if (!v.cebolla.conFoco)
    mal("el fader quedó sin foco: no se podría manejar con el teclado", v.cebolla);

  if (v.errs?.length) throw Error("REGRESIÓN: excepciones: " + v.errs.join(" | "));
  if (errores.length) throw Error("REGRESIÓN: excepciones: " + errores.slice(0, 3).join(" | "));

  console.log("E2E Z de composición y papel cebolla OK", JSON.stringify({
    tresCambios: v.trasY.valores, planos: v.trasY.planos, stagger: v.stagger,
    lienzoIntacto: {testigo:v.lienzo.testigoVive, hijos:v.lienzo.hijosDespues, z:v.lienzo.zTrasTestigo}, salto: v.cebolla.saltos.length, foco: v.cebolla.conFoco }));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
