/* Recorrido E2E real en Chromium: menú Ventana y vista de la Timeline.
   Verifica con eventos reales que ningún control de layout mienta sobre el
   estado de la interfaz ni toque el documento.
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
    try{localStorage.removeItem("low.timeline.view.v1");}catch(_){}
    const ventana=()=>document.querySelector('#dzMenubar .dz-menu[data-menu="ventana"]');
    const abrirVentana=()=>{document.querySelectorAll("#dzMenubar .dz-menu").forEach(m=>m.classList.remove("open"));
      ventana().dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true}));};
    const items=()=>[...document.querySelectorAll("#dzPanelMenu > button")];
    const item=nombre=>items().find(b=>b.textContent===nombre);
    const marcado=nombre=>!!item(nombre)&&item(nombre).classList.contains("checked");
    const visible=sel=>{const n=document.querySelector(sel);return !!n&&!n.hidden;};

    // 1. El menú Ventana debe listar paneles ANTES de abrir un diseño.
    abrirVentana();
    const arranque={cantidad:items().length,abierto:ventana().classList.contains("open")};

    // 2. Encender la Timeline por su ruta propia y volver a abrir el menú:
    //    la tilde tiene que reflejar la realidad, no la última vez que se usó.
    await openDesign("C:\\\\mock\\\\rig-test.svg");
    await dzDocInit();
    await espera(400);
    await dzAnimToggle();
    await espera(700);
    abrirVentana();
    const sincronia={timelineReal:visible("#dzTimeline"),timelineMenu:marcado("Línea de tiempo"),
      paletaReal:visible("#dzPalette"),paletaMenu:marcado("Paleta")};

    // 3. Un clic real en el menú apaga el panel y la tilde acompaña.
    const boton=item("Línea de tiempo");
    boton.dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true}));
    await espera(700);
    abrirVentana();
    const apagado={real:visible("#dzTimeline"),grilla:visible("#dzTlGrid"),menu:marcado("Línea de tiempo")};
    item("Línea de tiempo").dispatchEvent(new MouseEvent("mousedown",{bubbles:true,cancelable:true}));
    await espera(900);
    abrirVentana();
    const encendido={real:visible("#dzTimeline"),grilla:visible("#dzTlGrid"),menu:marcado("Línea de tiempo")};

    // 4. Vista de la Timeline: escala, densidad y pliegue son interfaz pura.
    const doc=DZ.doc;
    doc.setCell(1,1); doc.setCell(6,2);
    const conArte=doc.layerId;
    doc.addLayer("Vacía");          // queda sin exposiciones
    doc.selectLayer(conArte);        // la seleccionada nunca puede desaparecer
    await espera(500);
    const cont=()=>document.querySelector("#dzTlgRows .tl2");
    const anchoCss=()=>parseFloat(getComputedStyle(cont()).getPropertyValue("--tl-frame-w"))||0;
    const filas=()=>[...document.querySelectorAll("#dzTlgRows .tl2-row")].length;
    const sucioAntes=doc.dirty, pasosAntes=(doc.history&&doc.history.length)||0;
    const anchoInicial=anchoCss();
    cont().dispatchEvent(new WheelEvent("wheel",{deltaY:-120,ctrlKey:true,bubbles:true,cancelable:true}));
    await espera(300);
    const acercado=anchoCss();
    cont().dispatchEvent(new WheelEvent("wheel",{deltaY:120,ctrlKey:true,bubbles:true,cancelable:true}));
    await espera(300);
    const alejado=anchoCss();
    // rueda sin Ctrl: desplaza, nunca escala
    cont().dispatchEvent(new WheelEvent("wheel",{deltaY:120,bubbles:true,cancelable:true}));
    await espera(200);
    const trasRueda=anchoCss();

    const porTitulo=t=>[...document.querySelectorAll("#dzTlgRows .tl2-tools button")].find(b=>b.title===t);
    const altoFila=()=>parseFloat(getComputedStyle(cont()).getPropertyValue("--tl-row-h"))||0;
    const altoInicial=altoFila();
    porTitulo("Cambiar altura de las pistas").click(); await espera(250);
    const altoCambiado=altoFila();
    const filasAntes=filas();
    porTitulo("Ocultar pistas sin exposiciones").click(); await espera(300);
    const filasOcultas=filas();
    const seleccionadaSigue=[...document.querySelectorAll("#dzTlgRows .tl2-row.sel")].length===1;
    porTitulo("Ocultar pistas sin exposiciones").click(); await espera(300);
    const filasRestauradas=filas();
    // Compactar a lo ANCHO: el encabezado de pista se angosta de verdad y el
    // nombre queda accesible; la escala del tiempo no se toca.
    const anchoNombre=()=>document.querySelector("#dzTlgRows .tl2-name").getBoundingClientRect().width;
    const nombreAccesible=()=>{const c=[...document.querySelectorAll("#dzTlgRows .tl2-row .tl2-name")]
      .find(n=>n.title); return !!c&&c.title.length>0;};
    const compacto={nombreAntes:Math.round(anchoNombre()),escalaAntes:anchoCss(),
      tituloAntes:nombreAccesible()};
    porTitulo("Compactar la columna de pistas").click(); await espera(300);
    compacto.nombreDespues=Math.round(anchoNombre());
    compacto.escalaDespues=anchoCss();
    compacto.tituloDespues=nombreAccesible();
    compacto.marcado=!!document.querySelector('#dzTlgRows .tl2[data-compact="1"]');
    porTitulo("Ensanchar la columna de pistas").click(); await espera(300);
    compacto.vuelveAlAncho=Math.round(anchoNombre())===compacto.nombreAntes;
    porTitulo("Compactar la columna de pistas").click(); await espera(300);

    const plegar=[...document.querySelectorAll("#dzTlgRows .tl2-fold")][0];
    plegar.click(); await espera(250);
    const plegadas=[...document.querySelectorAll("#dzTlgRows .collapsed")].length;

    const vista={anchoInicial,acercado,alejado,trasRueda,altoInicial,altoCambiado,
      filasAntes,filasOcultas,filasRestauradas,seleccionadaSigue,plegadas,compacto,
      documentoIntacto:doc.dirty===sucioAntes&&((doc.history&&doc.history.length)||0)===pasosAntes};

    // 4bis. Clickear un chip de la barra de cuadros mueve la cabeza lectora.
    // Estuvo muerto: con documento abierto DZ.anim.frames queda vacio y
    // dzGoFrame salia antes de hacer nada, asi que se veian los chips y
    // ninguno movia el cuadro. Se navegaba solo por atajos y por la X-sheet.
    doc.scene.expose(doc.scene.layers[0].id,8,1); await espera(250);
    dzTlFramesRender(); await espera(250);
    const chips=[...document.querySelectorAll("#tlFrames .tl-frame")];
    const cuadroAntes=doc.frame;
    if(chips[5]) chips[5].click(); await espera(500);
    // el chip marcado se pregunta por su NUMERO, no por su posicion en una
    // lista ya filtrada: el render los reemplaza y el indice no es identidad
    const chipCur=document.querySelector("#tlFrames .tl-frame.cur .tl-n");
    const navegacion={chips:chips.length, antes:cuadroAntes, despues:doc.frame,
      marcado:chipCur?chipCur.textContent.trim():""};

    // 4ter. Los botones de exposicion se rotulan en FOTOGRAMAS. Decian «1s»
    // —de «on ones» en ingles— y en castellano eso se lee como segundos, que es
    // justo lo contrario de lo que hacen.
    const badges=[...document.querySelectorAll("button.tl2-badge span")].map(b=>b.textContent);
    await dzXsMount(); await espera(700);
    const opsXs=[...document.querySelectorAll(".xs2-op")].map(b=>b.textContent);
    const exposicion={timeline:badges.slice(0,3), xsheet:opsXs.slice(0,3),
      enSegundos:[...badges,...opsXs].filter(t=>/^[0-9]s$/.test(t))};

    // 5. La preferencia sobrevive al remontaje, pero jamás entra en la escena.
    const guardada=JSON.parse(localStorage.getItem("low.timeline.view.v1")||"null");
    const enEscena=JSON.stringify(doc.scene).includes("frameWidth");
    return {arranque,sincronia,apagado,encendido,vista,navegacion,exposicion,
      persistencia:{guardada:!!guardada&&guardada.frameWidth>0,densidad:guardada&&guardada.densidad,enEscena}};
  })()`;
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails)
    throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || "Excepción en la interfaz");
  const value = result.result?.value || {};

  stage("verificar");
  const { arranque, sincronia, apagado, encendido, vista, navegacion, exposicion, persistencia } = value;
  if (!arranque || arranque.cantidad < 5 || !arranque.abierto)
    throw Error("REGRESIÓN: el menú Ventana abre sin lista de paneles: " + JSON.stringify(value));
  if (!sincronia || sincronia.timelineReal !== sincronia.timelineMenu || sincronia.paletaReal !== sincronia.paletaMenu)
    throw Error("REGRESIÓN: la tilde del menú Ventana no dice la verdad: " + JSON.stringify(value));
  if (apagado.real !== false || apagado.grilla !== false || apagado.menu !== false)
    throw Error("REGRESIÓN: cerrar la Timeline deja una de sus superficies en pantalla: " + JSON.stringify(value));
  if (encendido.real !== true || encendido.grilla !== true || encendido.menu !== true)
    throw Error("REGRESIÓN: el menú Ventana no recupera la Timeline completa: " + JSON.stringify(value));
  if (!navegacion || navegacion.chips < 6 || navegacion.despues !== 6)
    throw Error("REGRESIÓN: clickear un chip de la barra de cuadros no mueve la cabeza lectora: " + JSON.stringify(navegacion));
  if (navegacion.marcado !== "6")
    throw Error("REGRESIÓN: el chip marcado no es el del cuadro actual: " + JSON.stringify(navegacion));
  if (!exposicion || exposicion.timeline.join("") !== "1F2F3F" || exposicion.xsheet.join("") !== "1F2F3F")
    throw Error("REGRESIÓN: los botones de exposición no dicen fotogramas: " + JSON.stringify(exposicion));
  if (exposicion.enSegundos.length)
    throw Error("REGRESIÓN: quedó un botón de exposición rotulado en segundos: " + JSON.stringify(exposicion));
  if (!(vista.acercado > vista.anchoInicial) || !(vista.alejado < vista.acercado) || vista.trasRueda !== vista.alejado)
    throw Error("REGRESIÓN: Ctrl+rueda no escala el tiempo o la rueda sola lo escala: " + JSON.stringify(vista));
  if (!(vista.altoCambiado > 0) || vista.altoCambiado === vista.altoInicial)
    throw Error("REGRESIÓN: la densidad de pistas no cambia la altura: " + JSON.stringify(vista));
  if (!(vista.filasOcultas < vista.filasAntes) || !vista.seleccionadaSigue || vista.filasRestauradas !== vista.filasAntes)
    throw Error("REGRESIÓN: ocultar pistas vacías pierde la capa seleccionada o no se revierte: " + JSON.stringify(vista));
  const c = vista.compacto || {};
  if (!(c.nombreDespues < c.nombreAntes) || !c.marcado)
    throw Error("REGRESIÓN: compactar no angosta la columna de pistas: " + JSON.stringify(c));
  if (c.escalaDespues !== c.escalaAntes)
    throw Error("REGRESIÓN: compactar a lo ancho cambió la escala del tiempo: " + JSON.stringify(c));
  if (!c.tituloAntes || !c.tituloDespues)
    throw Error("REGRESIÓN: compactada, la pista se queda sin nombre alcanzable: " + JSON.stringify(c));
  if (!c.vuelveAlAncho)
    throw Error("REGRESIÓN: ensanchar no devuelve la columna a su ancho: " + JSON.stringify(c));
  if (!(vista.plegadas > 0))
    throw Error("REGRESIÓN: minimizar una pista no la pliega: " + JSON.stringify(vista));
  if (!vista.documentoIntacto)
    throw Error("REGRESIÓN: cambiar la vista ensucia el documento o entra en el historial: " + JSON.stringify(vista));
  if (!persistencia.guardada || persistencia.enEscena)
    throw Error("REGRESIÓN: la preferencia de vista no persiste o contamina la escena: " + JSON.stringify(persistencia));
  if (errores.length)
    throw Error("REGRESIÓN: la interfaz lanzó excepciones: " + errores.slice(0, 3).join(" | "));
  console.log("E2E workspace OK: menú Ventana y vista de Timeline", JSON.stringify(value));
  try { await fetch(endpoint + "/json/close/" + created.id); } catch (_) {}
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
