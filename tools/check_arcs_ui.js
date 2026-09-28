/* Arcos y espaciado sobre la mesa. CDP :9223 + mock :8791.

   Un movimiento vivo no viaja en linea recta ni a velocidad constante, y las
   dos cosas se juzgan mirando el ESPACIADO: puntos juntos son cuadros lentos,
   separados son rapidos. Antes el arco existia solo para piezas de rig y solo
   desde el panel de rigging; un objeto cualquiera no mostraba nada.

   Se comprueba lo que un animador necesita: que el arco aparezca, que la
   lectura diga si acelera o frena, que fijando dos arcos se pueda medir el
   overlapping, y que nada de esto se guarde dentro del dibujo. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map(), errors = [];
  ws.onmessage = event => { const m = JSON.parse(event.data);
    if (m.method === "Page.javascriptDialogOpening") return ws.send(JSON.stringify({ id: ++id, method: "Page.handleJavaScriptDialog", params: { accept: true } }));
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (!m.id || !pending.has(m.id)) return; const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result);
  };
  // 120 s y no 40: el guion de este recorrido corre entero dentro de UN
  // Runtime.evaluate y hace decenas de esperas pautadas. Con la maquina cargada
  // —dieciseis recorridos en rafaga— se pasaba de 40 s y fallaba por lentitud,
  // no por regresion. Es el mismo error que confundir un runner flojo con un
  // defecto del producto.
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 120000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 60; i++) {
    const r = await send("Runtime.evaluate", { expression: 'typeof dzArcoToggle==="function" && !!api', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit(); await wait(500);
    DZ.doc.scene.expose(DZ.doc.scene.layers[0].id,10,1);
    if(!DZ.anim) await dzAnimToggle(); await wait(700);

    const svg0=()=>document.querySelector("#dzCanvas > svg");
    // OJO al escribir estas pruebas: hay grupos [data-low-art] tambien DENTRO
    // del papel cebolla, y esos se descartan al serializar. Hay que apuntar al
    // de primer nivel o el dibujo se guarda vacio y la prueba no prueba nada.
    const arte=()=>svg0().querySelector(':scope > [data-low-art="line"]')||svg0();
    const pieza=(id,color)=>{
      let el=arte().querySelector("#"+id);
      if(!el){ el=document.createElementNS("http://www.w3.org/2000/svg","rect");
        el.setAttribute("width","20"); el.setAttribute("height","20");
        el.setAttribute("x","60"); el.setAttribute("y","300");
        el.setAttribute("fill",color); el.id=id; arte().appendChild(el); }
      return el;
    };
    // dos piezas con el MISMO perfil de velocidad, la segunda 2 cuadros tarde
    const perfil=[0,2,6,14,26,42,62,86,100,104];
    const atras=(k)=>perfil[Math.max(0,k-2)];
    for(let k=0;k<10;k++){
      DZ.doc.goTo(k+1); await wait(150);
      pieza("cadera","#c33").setAttribute("transform","translate("+perfil[k]+",0)");
      pieza("mano","#39c").setAttribute("transform","translate("+atras(k)+",-90)");
      dzDocCommit(); await wait(110);
    }
    DZ.doc.goTo(5); await wait(500);

    // 1. apagado no hay nada
    const apagadoInicial={capa:!!svg0().querySelector("g.dz-arco"),
      boton:!!document.querySelector("#tlArco"),
      marcado:document.querySelector("#tlArco").classList.contains("on")};

    // 2. elegir la cadera y prender
    dzSelect(arte().querySelector("#cadera")); await wait(300);
    const boton=document.querySelector("#tlArco");
    boton.click(); await wait(800);
    const capa=svg0().querySelector("g.dz-arco");
    const prendido={marcado:boton.classList.contains("on"), hayCapa:!!capa,
      soloPantalla:capa?capa.classList.contains("dz-penui"):false,
      sinRaton:capa?capa.getAttribute("pointer-events")==="none":false,
      trazos:capa?capa.querySelectorAll("polyline").length:0,
      puntos:capa?capa.querySelectorAll("circle").length:0,
      lectura:(document.querySelector("#sbHint")||{}).textContent||""};

    // 3. la cuenta: acelera, y dice donde va mas rapido
    const an=LOW.animation.analizarArco(dzArcoMuestras(dzArcoObjetivoActual()));
    const cuenta={n:an.puntos.length, tendencia:an.tendencia,
      masRapido:an.masRapido&&an.masRapido.f, masLento:an.masLento&&an.masLento.f};

    // 4. el punto del cuadro actual se distingue y sigue a la cabeza lectora
    // el punto del cuadro actual se pinta BLANCO y mas grande: se lo pregunta
    // por eso, no por un umbral de radios (que mide el degradado de velocidad,
    // no cual es el actual)
    const actuales=()=>[...svg0().querySelectorAll("g.dz-arco circle")]
      .filter(c=>c.getAttribute("fill")==="#fff");
    const radioMedio=()=>{ const t=[...svg0().querySelectorAll("g.dz-arco circle")]
      .map(c=>+c.getAttribute("r")); return t.reduce((a,b)=>a+b,0)/(t.length||1); };
    const antesX=actuales().map(c=>c.getAttribute("cx")).join();
    const antesGrande=actuales()[0]?+actuales()[0].getAttribute("r"):0;
    const medio=radioMedio();
    DZ.doc.goTo(8); await wait(600);
    const despuesX=actuales().map(c=>c.getAttribute("cx")).join();
    const sigueLaCabeza={cuantosBlancos:actuales().length,
      cambio:antesX!==despuesX && !!antesX,
      masGrandeQueElResto:antesGrande>medio};

    // 5. OVERLAPPING: fijar los dos arcos y medir el desfase
    dzArcoFijar(); await wait(300);
    dzSelect(arte().querySelector("#mano")); await wait(300);
    dzArcoFijar(); await wait(700);
    const dosArcos=svg0().querySelector("g.dz-arco");
    const overlapping={fijados:(DZ.arcoFijados||[]).length,
      trazos:dosArcos?dosArcos.querySelectorAll("polyline").length:0,
      lectura:(document.querySelector("#sbHint")||{}).textContent||"",
      desfase:LOW.animation.arcoDesfase(
        dzArcoMuestras({tipo:"el",id:"cadera",layerId:DZ.doc.layerId,nombre:"cadera"}),
        dzArcoMuestras({tipo:"el",id:"mano",layerId:DZ.doc.layerId,nombre:"mano"}))};

    // 6. algo quieto no inventa un arco
    for(let k=0;k<10;k++){ DZ.doc.goTo(k+1); await wait(90);
      pieza("piedra","#555").setAttribute("transform","translate(0,0)"); dzDocCommit(); await wait(80); }
    DZ.doc.goTo(5); await wait(400);
    DZ.arcoFijados=[];
    dzSelect(arte().querySelector("#piedra")); await wait(300);
    dzArcoRender(); await wait(300);
    dzSetStatus(dzArcoLectura(dzArcoObjetivoActual())); await wait(200);
    const quieto={lectura:(document.querySelector("#sbHint")||{}).textContent||"",
      trazos:(svg0().querySelector("g.dz-arco")||{querySelectorAll:()=>[]})
        .querySelectorAll("polyline").length};

    // 7. apagar limpia, y nada de esto se guarda en el dibujo
    boton.click(); await wait(500);
    const apagado={capa:!!svg0().querySelector("g.dz-arco"),
      marcado:boton.classList.contains("on"),
      fijados:(DZ.arcoFijados||[]).length};
    dzDocCommit(); await wait(300);
    const contenidos=[];
    for(let k=1;k<=10;k++){ const dw=DZ.doc.scene.drawingAt(DZ.doc.layerId,k);
      if(dw) contenidos.push(String(dw.content||"")); }
    const noSeGuarda=!contenidos.some(c=>c.includes("dz-arco"));

    return {apagadoInicial,prendido,cuenta,sigueLaCabeza,overlapping,quieto,apagado,
      noSeGuarda,cuadrosConPieza:contenidos.filter(c=>c.includes('id="cadera"')).length,
      errores:(window.__errs||[]).slice(0,3)};
  })()`;

  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const v = result.result?.value;
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  if (v?.cuadrosConPieza < 8)
    mal("el recorrido no llegó a animar la pieza: no prueba nada", v?.cuadrosConPieza);
  if (!v.apagadoInicial.boton) mal("no hay botón de arcos en la barra de la timeline", v.apagadoInicial);
  if (v.apagadoInicial.capa || v.apagadoInicial.marcado)
    mal("los arcos aparecen sin que nadie los prenda", v.apagadoInicial);

  if (!v.prendido.marcado || !v.prendido.hayCapa)
    mal("prender los arcos no dibuja la trayectoria", v.prendido);
  if (!v.prendido.soloPantalla || !v.prendido.sinRaton)
    mal("el arco no es sólo-pantalla: se guardaría en el dibujo o taparía los clics", v.prendido);
  if (v.prendido.puntos < 8) mal("falta el punto por cuadro: sin eso no hay espaciado que leer", v.prendido);
  if (!/acelera/.test(v.prendido.lectura) || !/más rápido en F/.test(v.prendido.lectura))
    mal("la lectura no dice si acelera ni dónde", v.prendido);

  if (v.cuenta.tendencia !== "acelera") mal("un movimiento que acelera se lee mal", v.cuenta);
  if (!(v.cuenta.masRapido > v.cuenta.masLento))
    mal("el cuadro más rápido debería estar después del más lento en este movimiento", v.cuenta);

  if (v.sigueLaCabeza.cuantosBlancos !== 1)
    mal("el punto del cuadro actual no está marcado, o hay más de uno", v.sigueLaCabeza);
  if (!v.sigueLaCabeza.cambio)
    mal("el arco no sigue a la cabeza lectora: el punto marcado no se mueve", v.sigueLaCabeza);
  if (!v.sigueLaCabeza.masGrandeQueElResto)
    mal("el punto del cuadro actual no se distingue del resto", v.sigueLaCabeza);

  if (v.overlapping.fijados !== 2) mal("no se pueden fijar dos arcos para comparar", v.overlapping);
  if (v.overlapping.trazos < 4) mal("con dos arcos fijados sólo se dibuja uno", v.overlapping);
  if (!v.overlapping.desfase || v.overlapping.desfase.cuadros !== 2)
    mal("no mide el desfase entre las dos piezas: son 2 cuadros", v.overlapping);
  if (!/overlapping/.test(v.overlapping.lectura) || !/ATRÁS/.test(v.overlapping.lectura))
    mal("no dice en palabras que una va atrás de la otra", v.overlapping);

  if (!/no se mueve/.test(v.quieto.lectura)) mal("algo quieto debería decir que no se mueve", v.quieto);
  if (v.quieto.trazos) mal("algo quieto no puede tener arco dibujado", v.quieto);

  if (v.apagado.capa || v.apagado.marcado || v.apagado.fijados)
    mal("apagar los arcos no deja la mesa limpia", v.apagado);
  if (!v.noSeGuarda) mal("el arco se guardó DENTRO del dibujo", v.noSeGuarda);
  if (v.errores?.length) throw Error("REGRESIÓN: excepciones con los arcos: " + v.errores.join(" | "));

  console.log("E2E arcos OK", JSON.stringify({ lectura: v.prendido.lectura,
    puntos: v.prendido.puntos, cuenta: v.cuenta, overlapping: v.overlapping.lectura,
    desfase: v.overlapping.desfase, quieto: v.quieto.lectura }));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
