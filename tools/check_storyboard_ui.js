/* Recorrido E2E real en Chromium: storyboard y generador de tomas.
   Verifica con clics reales que pedir un plano ubique la cámara, que la
   decisión quede en la escena y que el tiempo de la secuencia sea real.
   Requiere un Chromium con CDP en http://127.0.0.1:9223 y el proyecto servido
   en http://127.0.0.1:8791. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const stage = name => console.error("E2E etapa: " + name);
  stage("conectar");
  // Pestaña propia: una corrida anterior no puede dejar el recorrido a medias.
  const created = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  if (!created?.webSocketDebuggerUrl) throw Error("Chromium no expuso una página CDP");
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map(); const errores = [];
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    // La recuperación de escena abre un confirm() nativo que congela el
    // renderer: sin esto la prueba no falla, se cuelga.
    if (msg.method === "Page.javascriptDialogOpening")
      return ws.send(JSON.stringify({ id: ++id, method: "Page.handleJavaScriptDialog", params: { accept: false } }));
    if (msg.method === "Runtime.exceptionThrown")
      errores.push((msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text || "").slice(0, 200));
    if (!msg.id || !pending.has(msg.id)) return;
    const task = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? task.fail(Error(JSON.stringify(msg.error))) : task.ok(msg.result);
  };
  const send = (method, params = {}) => new Promise((ok, fail) => {
    const callId = ++id;
    const timer = setTimeout(() => { pending.delete(callId); fail(Error("CDP sin respuesta en " + method)); }, 30000);
    pending.set(callId, { ok: value => { clearTimeout(timer); ok(value); },
      fail: error => { clearTimeout(timer); fail(error); } });
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable");
  // Los scripts se piden con ?v=<versión>: sin desactivar la caché, Chromium
  // devuelve el archivo anterior y la prueba certifica código que ya no existe.
  await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
  stage("navegar");
  // LA VENTANA SE FIJA ACÁ, y no es un detalle: este recorrido comprueba que el
  // panel flotante no tape el escenario, y eso depende del ancho. Sin fijarla se
  // hereda el tamaño con que quedó el Chromium de turno; en mi máquina eran
  // 764×485 y el panel tapaba de verdad, así que el guard acusaba una regresión
  // que no existía —falla contra el mismo código que estaba verde dos horas
  // antes, y también contra el árbol anterior—. 1366×768 es lo que usa CI.
  await send("Emulation.setDeviceMetricsOverride",
    { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  // Esperar por CONDICIoN, no por reloj: con la maquina cargada un sleep fijo
  // se queda corto, la app todavia no expuso sus funciones y la prueba falla
  // por lentitud en vez de por una regresion real.
  const listo = async () => {
    for (let intento = 0; intento < 60; intento++) {
      const r = await send("Runtime.evaluate", { returnByValue: true, expression:
        `typeof openDesign === "function" && typeof dzDocInit === "function"
         && !!document.querySelector("#dzMenubar .dz-menu[data-menu='ventana']")
         && !!api` });
      if (r.result?.value === true) return true;
      await new Promise(ok => setTimeout(ok, 250));
    }
    throw Error("la aplicacion no terminó de arrancar en 15 s");
  };
  await listo();

  stage("ejecutar flujo");
  const expression = `(async()=>{
    const espera=ms=>new Promise(r=>setTimeout(r,ms));
    await openDesign("C:\\mock\\rig-test.svg");
    await dzDocInit();
    await espera(300);

    // 1. Se abre desde el menú real, no por API.
    document.querySelector('#dzMenubar .dz-menu[data-menu="ventana"]')
      .dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true}));
    await espera(200);
    document.querySelector('#dzMenubar [data-act="storyboard"]')
      .dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true}));
    await espera(700);
    const panel=document.querySelector("#dzStoryboard");
    const apertura={visible:!!panel&&!panel.hidden,
      vacioAvisa:!!document.querySelector("#dzSbBody .sb2-empty")};

    const boton=t=>[...document.querySelectorAll("#dzSbBody .sb2-tools button")].find(x=>x.textContent===t);
    const filas=()=>[...document.querySelectorAll("#dzSbBody .sb2-board")];
    const campo=i=>document.querySelectorAll("#dzSbBody .sb2-field select")[i];
    const doc=DZ.doc;

    // 2. Un panel nuevo ya trae una toma generada, no un hueco.
    boton("+ Panel").click(); await espera(350);
    const primero=doc.scene.storyboard.boards[0];
    const alta={hayPanel:filas().length===1,
      traeCamara:!!primero.shot.camera&&Number.isFinite(primero.shot.camera.z),
      tipoReal:primero.shot.type==="plano-medio"};

    // 3. Pedir un plano mueve la cámara y la decisión queda guardada.
    const zAntes=doc.scene.storyboard.boards[0].shot.camera.z;
    campo(0).value="primer-plano"; campo(0).dispatchEvent(new Event("change",{bubbles:true}));
    await espera(400);
    const conPP=doc.scene.storyboard.boards[0];
    const generar={acerco:conPP.shot.camera.z>zAntes, guardado:conPP.shot.type==="primer-plano",
      // lo que el generador arma, el clasificador lo reconoce
      coherente:LOW.storyboard.shots.classify(conPP.shot.camera,
        conPP.shot.subject,doc.scene.width/doc.scene.height).id==="primer-plano",
      etiqueta:document.querySelectorAll("#dzSbBody .sb2-shot")[0].textContent};

    const yAntes=doc.scene.storyboard.boards[0].shot.camera.y;
    campo(1).value="contrapicado"; campo(1).dispatchEvent(new Event("change",{bubbles:true}));
    await espera(400);
    const conAngulo=doc.scene.storyboard.boards[0];
    generar.contrapicadoBaja=conAngulo.shot.camera.y>yAntes;
    generar.mismoPlano=conAngulo.shot.type==="primer-plano";

    // 4. El tiempo de la secuencia es la suma real de los paneles.
    boton("+ Panel").click(); await espera(300);
    boton("+ Panel").click(); await espera(300);
    const fps=doc.scene.fps||24;
    const tiempo={paneles:filas().length, total:doc.scene.boardDuration(),
      esperado:3*fps, texto:document.querySelector("#dzSbBody .sb2-total").textContent,
      rangos:doc.scene.boardTiming().map(t=>t.from+"-"+t.to).join(",")};

    // 5. Reordenar y quitar pasan por Undo como cualquier intención.
    filas()[2].click(); await espera(200);
    boton("↑").click(); await espera(350);
    const ordenTrasSubir=doc.scene.storyboard.boards.map(b=>b.id).join(",");
    dzUndo(); await espera(350);
    const historial={reordenaYSeDeshace:doc.scene.storyboard.boards.map(b=>b.id).join(",")!==ordenTrasSubir};
    dzRedo(); await espera(300);
    historial.rehace=doc.scene.storyboard.boards.map(b=>b.id).join(",")===ordenTrasSubir;

    // 6. ESCENARIO 3D: three.js se carga recién acá y el encuadre que se ve
    //    tiene que ser el mismo que dice el modelo.
    filas()[0].click(); await espera(200);
    boton("Escenario 3D").click();
    await espera(3500);                       // carga diferida del motor
    const raiz=document.querySelector("#dzStoryboardStage");
    const escenario={abierto:!!raiz&&!raiz.hidden, motor:typeof THREE!=="undefined"&&THREE.REVISION,
      lienzo:!!document.querySelector("#dzSbStageView canvas"),
      // el panel flotante no puede quedar tapando lo que hay que mirar
      noTapa:(()=>{const p=document.querySelector("#dzStoryboard").getBoundingClientRect(),
        v=document.querySelector("#dzSbStageView").getBoundingClientRect();
        return p.right < v.left + v.width*0.45;})()};
    const stage=DZ.sbStage;
    escenario.figuras=stage.figuras.children.length;
    document.querySelector("#sbStageAdd").click(); await espera(450);
    escenario.trasAgregar=stage.figuras.children.length;
    escenario.repartoGuardado=doc.scene.storyboard.boards[0].shot.cast.length;

    // El encuadre de verdad: se proyecta el cuerpo con la cámara del escenario.
    const selPlano=document.querySelectorAll("#dzSbBody .sb2-field select")[0];
    selPlano.value="plano-americano"; selPlano.dispatchEvent(new Event("change",{bubbles:true}));
    await espera(450); dzSbStageSync(); await espera(300);
    document.querySelector("#sbStageCamara").click(); await espera(600);
    const foco=stage._focused();
    const py=y=>new THREE.Vector3(foco.x,y,foco.z).project(stage.shotCamera).y;
    const encuadre={modo:stage.mode, coronillaDentro:py(foco.height)<1&&py(foco.height)>0.5,
      rodillasEnElBorde:Math.abs(py(foco.height*0.28)+1)<0.25, piesAfuera:py(0)<-1};

    // 7. La referencia: una foto real de lo que ve la cámara, no un cuadro vacío.
    document.querySelector("#sbStageShot").click(); await espera(900);
    const png=doc.scene.storyboard.boards[0].drawingRef?.png||"";
    const bitmap=await new Promise(ok=>{const i=new Image();i.onload=()=>ok(i);i.onerror=()=>ok(null);i.src=png;});
    let colores=0;
    if(bitmap){
      const c=document.createElement("canvas");c.width=bitmap.width;c.height=bitmap.height;
      const ctx=c.getContext("2d");ctx.drawImage(bitmap,0,0);
      const d=ctx.getImageData(0,0,c.width,c.height).data,set=new Set();
      for(let i=0;i<d.length;i+=4*97) set.add(d[i]+","+d[i+1]+","+d[i+2]);
      colores=set.size;
    }
    const referencia={esPng:png.startsWith("data:image/png"),
      medida:bitmap?bitmap.width+"x"+bitmap.height:"",
      noEstaVacia:colores>6, miniatura:!!document.querySelector("#dzSbBody img.sb2-thumb")};

    // 8. Sobrevive guardar y reabrir: es documento, no estado de panel.
    const copia=LOW.animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
    // Se compara contra el documento VIVO, no contra un valor escrito a mano:
    // así la prueba no envejece cada vez que cambia el recorrido de arriba.
    const vivo=doc.scene.storyboard.boards[0], guardado=copia.scene.storyboard.boards[0];
    const persiste={paneles:copia.scene.storyboard.boards.length===doc.scene.storyboard.boards.length,
      toma:guardado.shot.type===vivo.shot.type&&guardado.shot.angle===vivo.shot.angle,
      duracion:copia.scene.boardDuration()===doc.scene.boardDuration(),
      reparto:guardado.shot.cast.length===vivo.shot.cast.length,
      referencia:!!guardado.drawingRef&&guardado.drawingRef.png===vivo.drawingRef.png};

    /* 9. LA ANIMATICA. Un storyboard existe para juzgar el RITMO antes de
          animar, y para eso hay que poder MIRARLO corriendo. Sin esto la
          herramienta era una lista con duraciones escritas: no se podia ver.
          Se mide que el panel en el aire CAMBIA con el tiempo —que es la
          unica prueba de que reproduce de verdad y no ilumina uno fijo— y que
          al terminar devuelve el rango de la escena como estaba. */
    const rangoAntes={...doc.scene.range};
    const btnAnim=[...document.querySelectorAll("#dzSbBody .sb2-tools button")]
      .find(x=>x.textContent.includes("Animática"));
    const animatica={hayBoton:!!btnAnim, paneles:doc.scene.storyboard.boards.length};
    if(btnAnim){
      btnAnim.click();
      await espera(120);
      animatica.arranco=!!DZ.playback&&DZ.playback.playing;
      animatica.visor=!!document.querySelector("#dzSbBody .sb2-visor");
      animatica.enAire=!!document.querySelector("#dzSbBody .sb2-board.enAire");
      // que el panel en el aire CAMBIE: se anotan los ids que pasan
      const vistos=new Set();
      for(let i=0;i<40;i++){
        const v=doc.scene.boardAt(doc.frame);
        if(v) vistos.add(v.id);
        if(vistos.size>1) break;
        await espera(120);
      }
      animatica.panelesQuePasaron=vistos.size;
      animatica.cuadroAvanzo=doc.frame>1;
      // parar y comprobar que la escena queda como estaba
      const btnParar=[...document.querySelectorAll("#dzSbBody .sb2-tools button")]
        .find(x=>x.textContent.includes("Parar"))||btnAnim;
      btnParar.click();
      await espera(400);
      animatica.paro=!DZ.playback.playing;
      animatica.rangoDevuelto=doc.scene.range.in===rangoAntes.in&&doc.scene.range.out===rangoAntes.out;
      animatica.visorSeVa=!document.querySelector("#dzSbBody .sb2-visor");
    }

    return {apertura,alta,generar,tiempo,historial,escenario,encuadre,referencia,persiste,animatica};
  })()`;
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails)
    throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Excepción en la interfaz");
  const value = result.result?.value || {};

  stage("verificar");
  const { apertura, alta, generar, tiempo, historial, escenario, encuadre, referencia, persiste, animatica } = value;
  if (!apertura?.visible || !apertura.vacioAvisa)
    throw Error("REGRESIÓN: el storyboard no abre desde el menú o no explica que está vacío: " + JSON.stringify(apertura));
  if (!alta?.hayPanel || !alta.traeCamara || !alta.tipoReal)
    throw Error("REGRESIÓN: un panel nuevo no llega con una toma generada: " + JSON.stringify(alta));
  if (!generar?.acerco || !generar.guardado || !generar.coherente)
    throw Error("REGRESIÓN: pedir un plano no ubica la cámara o el generador se contradice: " + JSON.stringify(generar));
  if (!generar.contrapicadoBaja || !generar.mismoPlano)
    throw Error("REGRESIÓN: el ángulo no mueve la cámara o cambia el plano: " + JSON.stringify(generar));
  if (tiempo?.paneles !== 3 || tiempo.total !== tiempo.esperado || tiempo.rangos !== "1-24,25-48,49-72")
    throw Error("REGRESIÓN: el tiempo de la secuencia no es la suma de los paneles: " + JSON.stringify(tiempo));
  if (!historial?.reordenaYSeDeshace || !historial.rehace)
    throw Error("REGRESIÓN: reordenar paneles no entra en el historial: " + JSON.stringify(historial));
  if (!escenario?.abierto || !escenario.motor || !escenario.lienzo)
    throw Error("REGRESIÓN: el escenario 3D no abre o no carga el motor: " + JSON.stringify(escenario));
  if (!escenario.noTapa)
    throw Error("REGRESIÓN: el panel del storyboard tapa el escenario: " + JSON.stringify(escenario));
  if (escenario.figuras !== 1 || escenario.trasAgregar !== 2 || escenario.repartoGuardado !== 2)
    throw Error("REGRESIÓN: el reparto del escenario no se arma ni se guarda: " + JSON.stringify(escenario));
  if (encuadre?.modo !== "camara" || !encuadre.coronillaDentro || !encuadre.rodillasEnElBorde || !encuadre.piesAfuera)
    throw Error("REGRESIÓN: lo que ve la cámara no coincide con el plano pedido: " + JSON.stringify(encuadre));
  if (!referencia?.esPng || !referencia.noEstaVacia || !referencia.miniatura)
    throw Error("REGRESIÓN: la referencia no se toma, sale vacía o no llega a la lista: " + JSON.stringify(referencia));
  if (!persiste?.paneles || !persiste.toma || !persiste.duracion || !persiste.reparto || !persiste.referencia)
    throw Error("REGRESIÓN: el storyboard no sobrevive guardar y reabrir: " + JSON.stringify(persiste));
  if (!animatica?.hayBoton)
    throw Error("REGRESIÓN: no hay manera de reproducir el board: sin animática el storyboard no se puede mirar");
  if (!animatica.arranco || !animatica.cuadroAvanzo)
    throw Error("REGRESIÓN: la animática no reproduce: " + JSON.stringify(animatica));
  if (!animatica.visor || !animatica.enAire)
    throw Error("REGRESIÓN: reproduciendo no se ve qué panel está en el aire: " + JSON.stringify(animatica));
  if (animatica.panelesQuePasaron < 2)
    throw Error("REGRESIÓN: la animática se queda en un panel: no está pasando el board, " + JSON.stringify(animatica));
  if (!animatica.paro || !animatica.visorSeVa)
    throw Error("REGRESIÓN: la animática no se puede parar: " + JSON.stringify(animatica));
  if (!animatica.rangoDevuelto)
    throw Error("REGRESIÓN: la animática dejó la escena con el rango recortado: " + JSON.stringify(animatica));
  if (errores.length)
    throw Error("REGRESIÓN: la interfaz lanzó excepciones: " + errores.slice(0, 3).join(" | "));
  console.log("E2E storyboard OK: generador de tomas, tiempo, historial y persistencia", JSON.stringify(value));
  try { await fetch(endpoint + "/json/close/" + created.id); } catch (_) {}
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
