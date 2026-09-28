/* ══════════════════════════════════════════════════════════════════════════
   PRESUPUESTOS DE RENDIMIENTO (biblia §10)

   La biblia tiene seis presupuestos escritos desde el principio y ninguno se
   habia medido nunca. Decia «no se optimiza por intuicion»: tampoco se
   verificaba. Esto lo mide.

   LA ESCENA PATRON, que §10 nombra sin definir, queda definida acá y es parte
   del contrato: 3 capas x 24 cuadros, cada dibujo con 30 trazos de 40 puntos.
   Es una escena de tamaño medio real, no un caso de laboratorio vacio.

   CÓMO SE MIDE SIN QUE EL RELOJ DE CI MIENTA. Un runner cargado tarda tres o
   cuatro veces más que esta máquina, así que un umbral en milisegundos ajustado
   al presupuesto daría fallas falsas todo el tiempo. Se hacen dos cosas:

     · TIEMPOS: se miden y se IMPRIMEN siempre, y la puerta usa un margen
       generoso (`LOW_PERF_FACTOR`, 4 por omisión). Una regresión de verdad
       —quintuplicar la latencia de un trazo— igual la agarra; el ruido del
       runner, no.
     · TRABAJO: se cuenta cuántas veces se serializa el SVG y cuántos nodos se
       crean por punto de trazo. Eso NO depende de la máquina, así que la puerta
       es estricta. Es la única clase de presupuesto que se puede exigir sin
       margen, y es la que descubre las regresiones antes de que se sientan.

       node tools/check_perf_budgets.js
       LOW_PERF_FACTOR=1 node tools/check_perf_budgets.js   # exigir el presupuesto crudo
   ══════════════════════════════════════════════════════════════════════════ */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const FACTOR = Math.max(1, Number(process.env.LOW_PERF_FACTOR) || 4);
const PUNTOS_MAX = 60;   // los puntos del trazo que se mide

/* §10, tal como está escrito. El margen se aplica al comparar, no acá. */
const PRESUPUESTO = {
  trazoPrimerPintado: 16,      // ms hasta que el trazo se ve
  cuadroMasLargo: 33,          // ms — 30 FPS es el piso que §10 no permite bajar
  guardadoBloqueo: 250,        // ms de hilo principal bloqueado de una vez
  aperturaBloqueo: 400,        // ms — abrir tiene que dejar pintar el progreso
};

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
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 120000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 80; i++) {
    const r = await send("Runtime.evaluate", { expression: // Esperar por CONDICION: mas abajo el recorrido usa LOW.workspace.workspaces,
    // que se monta despues de las funciones sueltas. Bajo carga la prueba llegaba
    // antes y moria con «Cannot read properties of undefined (reading 'activate')».
    'typeof dzDocInit==="function" && typeof dzSerialize==="function" && !!api && !!window.LOW?.workspace?.workspaces', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const cuadro=()=>new Promise(r=>requestAnimationFrame(()=>r(performance.now())));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit(); await wait(600);

    // ── ESCENA PATRÓN ────────────────────────────────────────────────────
    // 3 capas x 24 cuadros, 30 trazos de 40 puntos por dibujo. Se escribe
    // directo al modelo: simular 86.400 puntos con el puntero tardaria horas y
    // lo que se quiere medir es el programa CON la escena, no el llenado.
    const sc=DZ.doc.scene;
    const trazo=(semilla)=>{ let d="M"+(semilla%400)+" "+(semilla%300);
      for(let i=1;i<40;i++) d+=" L"+((semilla*7+i*13)%1900)+" "+((semilla*11+i*17)%1000);
      return "<path d='"+d+"' fill='none' stroke='#1a1a1a' stroke-width='3'/>"; };
    const contenido=(n)=>{ let s="";
      for(let t=0;t<30;t++) s+=trazo(n*97+t*31);
      return "<g data-low-art='colour'></g><g data-low-art='line'>"+s+"</g>"; };
    while(sc.layers.length<3){ if(typeof DZ.doc.addLayer==="function") DZ.doc.addLayer(); else break; }
    const capas=sc.layers.slice(0,3);
    capas.forEach((ly,ci)=>{
      const lv=sc.level(ly.levelId);
      // OJO: expose(id,24,1) expone el MISMO dibujo 24 veces — es un sostenido,
      // no 24 dibujos. La escena patron necesita material distinto por cuadro o
      // se mide un documento veinticuatro veces mas chico de lo que dice medir.
      for(let f=1;f<=24;f++){
        const n=f;
        if(!lv.byNumber(n)) lv.addDrawing(n,contenido(ci*24+f));
        else lv.byNumber(n).content=contenido(ci*24+f);
        sc.expose(ly.id,f,n);
      }
    });
    DZ.doc.layerId=capas[0].id;
    DZ.doc.goTo(1); await wait(500);
    const escena={capas:capas.length, cuadros:24,
      pesoKB:Math.round(JSON.stringify(sc.toJSON()).length/1024),
      trazosPorDibujo:30, puntosPorTrazo:40};

    // ── 1. LATENCIA DEL TRAZO: pointerdown hasta que se ve ──────────────
    LOW.workspace.workspaces.activate("drawing",dzWsAplicar); await wait(300);
    const lienzo=document.querySelector("#dzCanvas"), hoja=lienzo.querySelector(":scope > svg");
    dzSetTool("brush"); await wait(200);
    const caja=lienzo.getBoundingClientRect();
    const px=Math.round(caja.left+caja.width*.3), py=Math.round(caja.top+caja.height*.5);
    const puntero=(t,x,y)=>lienzo.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,
      pointerId:1,pointerType:"pen",isPrimary:true,button:t==="pointerdown"?0:-1,
      buttons:t==="pointerup"?0:1,clientX:x,clientY:y,pressure:.7}));

    const antesDe=hoja.querySelectorAll("*").length;
    const t0=performance.now();
    puntero("pointerdown",px,py);
    puntero("pointermove",px+6,py+3);
    // El trabajo de la app: cuanto tarda en que el trazo EXISTA en la hoja.
    // Medirlo hasta el cuadro siguiente tenia un piso de 16,7 ms por la cadencia
    // de la pantalla, asi que el numero oscilaba entre 3 y 18 ms sin que nada
    // cambiara: se medía el monitor, no el programa. El presupuesto de §10 dice
    // «respuesta visual inicial menor a 16 ms», y lo que se puede exigir es que
    // el trabajo entre en un cuadro; que se PINTE depende del monitor.
    const trazoTrabajo=Math.round((performance.now()-t0)*100)/100;
    const aparecio=hoja.querySelectorAll("*").length>antesDe;
    const t1=await cuadro();
    const trazoPrimerPintado=Math.round((t1-t0)*100)/100;

    // ── 2. FPS DE INTERACCIÓN mientras se arrastra ──────────────────────
    // Se cuenta el cuadro MÁS LARGO, no el promedio: un promedio de 60 FPS con
    // un tirón de 200 ms se siente mal y el promedio no lo muestra.
    let serializaciones=0;
    const serialOriginal=window.dzSerialize;
    window.dzSerialize=function(){ serializaciones++; return serialOriginal.apply(this,arguments); };
    const nodosAntes=hoja.querySelectorAll("*").length;
    const gaps=[]; let ultimo=performance.now(), corriendo=true, picoNodos=nodosAntes;
    const medir=()=>{ const ahora=performance.now(); gaps.push(ahora-ultimo); ultimo=ahora;
      const n=hoja.querySelectorAll("*").length; if(n>picoNodos) picoNodos=n;
      if(corriendo) requestAnimationFrame(medir); };
    requestAnimationFrame(medir);
    const PUNTOS=60;
    for(let i=1;i<=PUNTOS;i++){
      puntero("pointermove",px+i*9,py+Math.round(Math.sin(i/3)*40));
      await new Promise(r=>requestAnimationFrame(r));
    }
    corriendo=false;
    puntero("pointerup",px+PUNTOS*9,py); await wait(500);
    window.dzSerialize=serialOriginal;
    const nodosQueQuedan=hoja.querySelectorAll("*").length-nodosAntes;

    // El pico de nodos durante el gesto es el costo de la PREVISUALIZACION y
    // crece con el trazo por diseño (un sello por punto). Lo que NO puede
    // crecer es lo que QUEDA: un trazo es una cinta, y una cinta de 60 puntos
    // y otra de 180 tienen que dejar lo mismo. Si eso crece, cada trazo engorda
    // la hoja para siempre y el archivo se vuelve inmanejable.
    const antes2=hoja.querySelectorAll("*").length;
    const py2=py+120;
    puntero("pointerdown",px,py2);
    for(let i=1;i<=180;i++){
      puntero("pointermove",px+i*3,py2+Math.round(Math.sin(i/9)*30));
      if(i%12===0) await new Promise(r=>requestAnimationFrame(r));
    }
    puntero("pointerup",px+540,py2); await wait(600);
    const nodosTrazoLargo=hoja.querySelectorAll("*").length-antes2;
    const utiles=gaps.slice(2);          // los dos primeros arrancan frios
    const cuadroMasLargo=Math.round(Math.max(...utiles)*100)/100;
    const fpsMedio=Math.round(1000/(utiles.reduce((a,b)=>a+b,0)/utiles.length)*10)/10;
    // El pincel reescribe UNA cinta, asi que contar nodos al final daba 0 o
    // negativo y no medía nada. Lo que dice si la hoja crece por punto es el
    // PICO durante el gesto: si un trazo de 60 puntos deja sesenta nodos, se ve
    // acá y no cuando el archivo pesa cuarenta megas.
    const nodosDelGesto=picoNodos-nodosAntes;
    const serialPorPunto=Math.round(serializaciones/PUNTOS*100)/100;

    // ── 3. REPRODUCCIÓN: ¿mantiene el fps del proyecto? ─────────────────
    // Se cuentan CUADROS PERDIDOS, que no dependen de lo rápida que sea la
    // máquina en absoluto: es cuántos cuadros avanzó contra cuántos debía.
    if(!DZ.playback) DZ.playback=new LOW.animation.Playback(DZ.doc);
    const fps=Math.max(1,Number(sc.fps)||24);
    DZ.doc.goTo(1);
    // Se cuentan los AVISOS de cambio de cuadro, no la diferencia de numeros:
    // con el bucle encendido la escena vuelve al 1 y restar daba 11 avances
    // donde en realidad hubo 36. Casi firme que la reproduccion estaba rota.
    let avanzados=0;
    const soltar=DZ.doc.subscribe((_d,motivo)=>{ if(motivo==="frame") avanzados++; });
    const arranque=performance.now();
    DZ.playback.play();
    await wait(1500);
    const corrido=performance.now()-arranque;
    DZ.playback.stop();
    soltar();
    const esperados=Math.round(corrido/1000*fps);
    const reproduccion={fps, esperados, avanzados,
      perdidos:Math.max(0,esperados-avanzados),
      perdidosPorciento:Math.round(Math.max(0,esperados-avanzados)/Math.max(1,esperados)*1000)/10};

    // ── 4. GUARDADO: cuánto bloquea el hilo principal de una sola vez ───
    const bloqueoDe=async(fn)=>{
      const g=[]; let u=performance.now(), on=true;
      const tic=()=>{ const a=performance.now(); g.push(a-u); u=a; if(on) requestAnimationFrame(tic); };
      requestAnimationFrame(tic);
      // Se espera un cuadro ANTES de correr fn: si no, el reloj arranca en frio
      // y hay que descartar la primera muestra... que es exactamente la que trae
      // el bloqueo. Con un freno artificial de 1600 ms el medidor devolvia 18 ms
      // y el arnés era decorativo. Ahora todas las muestras valen.
      await new Promise(r=>requestAnimationFrame(r));
      await fn();
      await wait(400); on=false;
      return Math.round(Math.max(...g)*100)/100;
    };
    const guardadoBloqueo=await bloqueoDe(async()=>{ dzDocCommit(); await dzSceneSave(false); });

    // ── 5. APERTURA de la escena patrón ─────────────────────────────────
    const json=JSON.stringify(DZ.doc.toJSON());
    const aperturaBloqueo=await bloqueoDe(async()=>{
      const datos=JSON.parse(json);
      DZ.doc=LOW.animation.LowDoc.fromJSON(datos);
      DZ.doc.setHistory(DZ.history);
      await wait(0);
    });
    DZ.doc.goTo(1); await wait(300);

    // ── 6. RECUPERACIÓN: el punto seguro existe tras editar ─────────────
    dzMarkDirty(); await wait(700);
    // el punto se escribe con retardo (450 ms en DocumentRecovery) y ademas
    // dzMarkDirty lo programa a los 320: hay que esperar los dos
    await wait(900);
    const punto=LOW.workspace.recovery ? LOW.workspace.recovery.get(DZ.path) : null;
    const recuperacion={hayPunto:!!punto, tieneContenido:!!(punto&&punto.content),
      pesoKB:punto?Math.round(String(punto.content||"").length/1024):0};

    return {escena, trazo:{trazoTrabajo, trazoPrimerPintado, aparecio},
      interaccion:{cuadroMasLargo, fpsMedio, muestras:utiles.length,
        nodosDelGesto, nodosQueQuedan, nodosTrazoLargo, serialPorPunto},
      reproduccion, guardadoBloqueo, aperturaBloqueo, recuperacion,
      errores:(window.__errs||[]).slice(0,3)};
  })()`;

  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const v = result.result?.value;

  // ── Informe: los números SIEMPRE se imprimen, pase o falle la puerta ──
  const linea = (que, valor, presu, unidad) => {
    const techo = presu == null ? null : presu * FACTOR;
    const estado = techo == null ? "—" : (valor <= presu ? "OK" : valor <= techo ? "margen" : "EXCEDE");
    console.log("  %s %s %s%s%s", estado.padEnd(7), que.padEnd(34),
      String(valor) + (unidad || ""), presu != null ? "   presupuesto " + presu + (unidad || "") : "",
      techo != null ? "   techo x" + FACTOR + " " + Math.round(techo) + (unidad || "") : "");
  };
  console.log("ESCENA PATRÓN: %d capas x %d cuadros · %d trazos de %d puntos por dibujo · %d KB",
    v.escena.capas, v.escena.cuadros, v.escena.trazosPorDibujo, v.escena.puntosPorTrazo, v.escena.pesoKB);
  console.log("TIEMPOS (margen x%d para no confundir un runner cargado con una regresión):", FACTOR);
  linea("trazo: trabajo de la app", v.trazo.trazoTrabajo, PRESUPUESTO.trazoPrimerPintado, " ms");
  console.log("  (hasta el cuadro siguiente: %s ms — incluye la cadencia del monitor, piso ~16,7)",
    v.trazo.trazoPrimerPintado);
  linea("cuadro más largo arrastrando", v.interaccion.cuadroMasLargo, PRESUPUESTO.cuadroMasLargo, " ms");
  linea("guardado: bloqueo máximo", v.guardadoBloqueo, PRESUPUESTO.guardadoBloqueo, " ms");
  linea("apertura: bloqueo máximo", v.aperturaBloqueo, PRESUPUESTO.aperturaBloqueo, " ms");
  console.log("  (fps medio arrastrando: %s · %d muestras)", v.interaccion.fpsMedio, v.interaccion.muestras);
  console.log("TRABAJO (no depende de la máquina · puerta estricta):");
  linea("serializaciones por punto", v.interaccion.serialPorPunto, null, "");
  linea("pico de nodos durante el gesto", v.interaccion.nodosDelGesto, null, " (60 puntos, previsualización)");
  linea("nodos que QUEDAN, trazo de 60", v.interaccion.nodosQueQuedan, null, "");
  linea("nodos que QUEDAN, trazo de 180", v.interaccion.nodosTrazoLargo, null, "");
  console.log("RECUPERACIÓN: punto seguro de %d KB tras editar", v.recuperacion.pesoKB);
  console.log("REPRODUCCIÓN: %d fps · esperados %d · avanzados %d · perdidos %d (%s%%)",
    v.reproduccion.fps, v.reproduccion.esperados, v.reproduccion.avanzados,
    v.reproduccion.perdidos, v.reproduccion.perdidosPorciento);

  const mal = (m, d) => { throw Error("PRESUPUESTO §10 INCUMPLIDO: " + m + " :: " + JSON.stringify(d)); };

  // el recorrido tiene que haber medido algo de verdad
  if (!v.trazo.aparecio) mal("el trazo no llegó a dibujarse: no se midió nada", v.trazo);
  if (v.interaccion.muestras < 20) mal("no hubo suficientes cuadros para medir", v.interaccion);
  if (v.escena.pesoKB < 200) mal("la escena patrón salió más chica de lo definido", v.escena);

  // TRABAJO: puerta estricta, no depende de la máquina
  if (v.interaccion.serialPorPunto > 1)
    mal("se serializa el SVG más de una vez por punto de trazo: eso ahoga el dibujo", v.interaccion);
  // Lo que queda no puede crecer con la longitud del trazo: eso es lo que hace
  // que un archivo se vuelva inmanejable después de una jornada.
  if (v.interaccion.nodosQueQuedan > 6 || v.interaccion.nodosTrazoLargo > 6)
    mal("un trazo deja más de 6 nodos SVG en la hoja", v.interaccion);
  // Medido: 60 puntos dejan -1 y 180 dejan 1 — el trazo se colapsa en UNA cinta
  // sin importar su largo, que es exactamente lo que tiene que pasar. La holgura
  // de 3 es por el barrido de la previsualización anterior, no por el trazo.
  if (Math.abs(v.interaccion.nodosTrazoLargo - v.interaccion.nodosQueQuedan) > 3)
    mal("lo que deja un trazo CRECE con su longitud: tres veces más puntos dejan más nodos",
      v.interaccion);
  if (v.interaccion.nodosDelGesto > PUNTOS_MAX * 2)
    mal("la previsualización del trazo crea más de dos nodos por punto", v.interaccion);

  // REPRODUCCIÓN: cuadros perdidos, también independiente de la máquina
  if (v.reproduccion.perdidosPorciento > 50)
    mal("la reproducción pierde más de la mitad de los cuadros en la escena patrón", v.reproduccion);

  // TIEMPOS: con margen
  const conMargen = (que, valor, presu) => {
    if (valor > presu * FACTOR) mal(que + " excede el presupuesto incluso con margen x" + FACTOR,
      { valor, presupuesto: presu, techo: presu * FACTOR });
  };
  conMargen("el trabajo de la app al iniciar un trazo", v.trazo.trazoTrabajo, PRESUPUESTO.trazoPrimerPintado);
  conMargen("el cuadro más largo arrastrando", v.interaccion.cuadroMasLargo, PRESUPUESTO.cuadroMasLargo);
  conMargen("el bloqueo al guardar", v.guardadoBloqueo, PRESUPUESTO.guardadoBloqueo);
  conMargen("el bloqueo al abrir", v.aperturaBloqueo, PRESUPUESTO.aperturaBloqueo);

  if (!v.recuperacion.hayPunto || !v.recuperacion.tieneContenido)
    mal("no queda punto de recuperación con contenido tras editar la escena patrón", v.recuperacion);
  if (v.errores?.length) throw Error("PRESUPUESTOS: excepciones durante la medición: " + v.errores.join(" | "));

  console.log("PRESUPUESTOS §10 OK");
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
