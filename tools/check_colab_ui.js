/* Trabajo remoto, de punta a punta y CONTRA EL SERVIDOR DE VERDAD.
   CDP :9223 + mock :8791 + el relé de server/low_relay.py en un puerto libre.

   No hay socket de mentira acá: el navegador se conecta al relé real, y la
   propia página abre una SEGUNDA conexión que hace de «la otra persona». Es la
   unica forma de comprobar lo que importa — que dos LOW frente al mismo
   proyecto se ven, se respetan los bloqueos y se pasan el dibujo. */
const { spawn } = require("child_process");
const net = require("net");

const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

function puertoLibre() {
  return new Promise((ok) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => ok(p)); });
  });
}

function esperarRele(puerto, intentos = 40) {
  return new Promise((ok, fail) => {
    let n = 0;
    const probar = () => {
      const s = net.connect(puerto, "127.0.0.1");
      s.on("connect", () => { s.destroy(); ok(true); });
      s.on("error", () => {
        s.destroy();
        if (++n >= intentos) return fail(Error("el relé no levantó en el puerto " + puerto));
        setTimeout(probar, 250);
      });
    };
    probar();
  });
}

async function main() {
  const puerto = await puertoLibre();
  const python = process.env.LOW_PYTHON || (process.platform === "win32" ? "python" : "python3");
  const rele = spawn(python, ["server/low_relay.py", "--puerto", String(puerto)],
    { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
  const salida = [];
  rele.stdout.on("data", (d) => salida.push(String(d)));
  rele.stderr.on("data", (d) => salida.push(String(d)));
  const matarRele = () => { try { rele.kill(); } catch (_) { /* ya murió */ } };

  try {
    await esperarRele(puerto);
    await recorrido(puerto);
  } catch (e) {
    if (salida.length) console.error("--- salida del relé ---\n" + salida.join(""));
    throw e;
  } finally { matarRele(); }
}

async function recorrido(puertoRele) {
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
    const r = await send("Runtime.evaluate", { expression: 'typeof dzColabToggle==="function" && !!api', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const URL_RELE="ws://127.0.0.1:${puertoRele}";
    try{localStorage.clear()}catch(e){}
    await openDesign("C:\\\\mock\\\\colab.svg"); await dzDocInit(); await wait(500);

    // el diseno de prueba trae un solo cuadro: sin exponer la capa, dzGoFrame(7)
    // no se mueve y el filtro por cuadro no se estaria probando en absoluto
    DZ.doc.scene.expose(DZ.doc.scene.layers[0].id,8,1); await wait(250);

    // ── 1. el panel arranca sin conectar
    dzColabToggle(); await wait(250);
    const panel=document.querySelector("#dzColab");
    const inicial={visible:!panel.hidden,
      estado:document.querySelector("#colabEstado").textContent,
      vivoOculto:document.querySelector("#colabVivo").hidden,
      desconectarBloqueado:document.querySelector("#colabDesconectar").disabled};

    // ── 2. faltan datos: no se conecta y lo dice
    document.querySelector("#colabConectar").click(); await wait(200);
    const sinDatos={colab:!!DZ.colab, estado:document.querySelector("#colabEstado").textContent};

    // ── 3. conectar de verdad
    document.querySelector("#colabUrl").value=URL_RELE;
    document.querySelector("#colabRoom").value="corto";
    document.querySelector("#colabNombre").value="Ana";
    document.querySelector("#colabConectar").click();
    for(let i=0;i<40 && (!DZ.colab||DZ.colab.estado!=="listo");i++) await wait(150);
    await wait(400);
    const conectado={estado:document.querySelector("#colabEstado").textContent,
      dato:document.querySelector("#colabEstado").dataset.estado,
      vivoVisible:!document.querySelector("#colabVivo").hidden,
      gente:document.querySelectorAll("#colabGente li").length,
      yo:(document.querySelector("#colabGente li b")||{}).textContent||"",
      conectarBloqueado:document.querySelector("#colabConectar").disabled};

    // ── 4. entra «la otra persona» por una conexion aparte
    const beto=new WebSocket(URL_RELE);
    const deBeto=[];
    beto.onmessage=(ev)=>{ try{ deBeto.push(JSON.parse(ev.data)) }catch(e){} };
    await new Promise(r=>{ beto.onopen=r; setTimeout(r,3000) });
    beto.send(JSON.stringify({t:"hello",room:"corto",
      actor:{id:"beto",nombre:"Beto"},rol:"editor",desde:0}));
    for(let i=0;i<30 && document.querySelectorAll("#colabGente li").length<2;i++) await wait(150);
    beto.send(JSON.stringify({t:"presence",actor:{cuadro:7,herramienta:"lapiz"}}));
    await wait(500);
    const filas=[...document.querySelectorAll("#colabGente li")].map(li=>li.textContent);
    const conBeto={gente:filas.length, textos:filas,
      veCuadro:filas.some(t=>/cuadro 7/.test(t))};

    // ── 5. Beto toma el nivel actual: se ve y avisa
    const nivelId=DZ.doc.level.id, nivelNombre=DZ.doc.level.name;
    beto.send(JSON.stringify({t:"lock",recurso:"nivel:"+nivelId,accion:"take",ttl:600}));
    await wait(600);
    const bloqueado={
      filas:[...document.querySelectorAll("#colabLocks li")].map(li=>li.textContent),
      aviso:document.querySelector("#colabAvisoNivel").textContent,
      claseCuerpo:document.body.classList.contains("colab-nivel-ajeno")};

    // ── 6. y yo NO puedo tomarlo: me dice quien lo tiene
    document.querySelector("#colabTomar").click(); await wait(700);
    const noPude={estado:document.querySelector("#sbHint")?document.querySelector("#sbHint").textContent:"",
      sigueDeBeto:(DZ.colab.bloqueos["nivel:"+nivelId]||{}).actorId==="beto"};

    // ── 7. Beto comenta el cuadro 7
    beto.send(JSON.stringify({t:"comment",comentario:{id:"c-beto",cuadro:7,texto:"la mano cruza tarde"}}));
    await wait(600);
    const comentado={
      cantidad:document.querySelectorAll("#colabComents li").length,
      texto:(document.querySelector("#colabComents li p")||{}).textContent||"",
      autor:(document.querySelector("#colabComents li b")||{}).textContent||""};

    // ── 8. clickear «cuadro 7» lleva al cuadro 7, y el filtro sigue la cabeza
    document.querySelector("#colabComents li header i").click();
    await wait(600);
    const llegoAlCuadro=DZ.doc.frame;
    document.querySelector("#colabSoloCuadro").checked=true;
    document.querySelector("#colabSoloCuadro").dispatchEvent(new Event("change"));
    await wait(300);
    const enSuCuadro=document.querySelectorAll("#colabComents li p").length;
    await dzGoFrame(0); await wait(500);
    const enOtroCuadro=(document.querySelector("#colabComents .colab-vacio")||{}).textContent||"";
    document.querySelector("#colabSoloCuadro").checked=false;
    document.querySelector("#colabSoloCuadro").dispatchEvent(new Event("change"));
    await wait(200);

    // ── 9. yo comento y le llega a Beto
    deBeto.length=0;
    document.querySelector("#colabTexto").value="  falta el contacto  ";
    document.querySelector("#colabComentar").click();
    for(let i=0;i<30 && !deBeto.some(m=>m.t==="comment");i++) await wait(150);
    const mio=deBeto.find(m=>m.t==="comment");
    const comenteYo={llego:!!mio, texto:mio?mio.comentario.texto:"",
      autor:mio?mio.comentario.nombre:"", campoVacio:document.querySelector("#colabTexto").value===""};

    // ── 10. dibujo algo y a Beto le llega la instantanea
    deBeto.length=0;
    DZ.doc.writeDrawing('<circle cx="80" cy="80" r="20" fill="#111"/>');
    for(let i=0;i<40 && !deBeto.some(m=>m.t==="op");i++) await wait(150);
    const salio=deBeto.find(m=>m.t==="op");
    const mandeDibujo={llego:!!salio, tipo:salio?salio.op.type:"",
      tieneNiveles:salio?((salio.op.payload.levels||[]).length>0):false,
      deQuien:salio?salio.op.actorId:"", yoSoy:DZ.colab.actorId};

    // ── 11. Beto manda un dibujo y entra SIN tocar mi historial
    const pasosAntes=DZ.history.undoStack.length;
    const snap={layers:[],levels:[{id:nivelId,drawings:DZ.doc.scene.level(nivelId).drawings.map(d=>{
      const j=d.toJSON(); if(j.number===DZ.doc.drawing.number) j.content='<rect x="10" y="10" width="30" height="30" fill="#0a0"/>'; return j;})}]};
    beto.send(JSON.stringify({t:"op",op:{id:"beto:1",type:"snapshot.level",target:nivelId,payload:snap}}));
    for(let i=0;i<40 && !/rect/.test(DZ.doc.drawing.content||"");i++) await wait(150);
    const recibiDibujo={entro:/rect/.test(DZ.doc.drawing.content||""),
      pasosHistorial:DZ.history.undoStack.length-pasosAntes};

    // ── 12. y no rebota: no le devuelvo su propia instantanea
    deBeto.length=0; await wait(1200);
    const rebotes=deBeto.filter(m=>m.t==="op");
    const sinRebote=rebotes.length===0;
    const detalleRebote=rebotes.map(m=>JSON.stringify(m.op.payload).slice(0,240));
    const loQueMandoBeto=JSON.stringify(snap).slice(0,240);
    // lo que de verdad importa: el dibujo de Beto tiene que seguir estando
    const rectSobrevive=rebotes.every(m=>(m.op.payload.levels||[]).every(lv=>
      lv.drawings.every(d=>d.number!==1 || /rect/.test(d.content||""))));
    const enElDoc=/rect/.test(DZ.doc.drawing.content||"");
    // y despues del rebote tiene que quedarse quieto: nada de ping-pong eterno
    deBeto.length=0; await wait(1500);
    const seQuedoQuieto=!deBeto.some(m=>m.t==="op");

    // ── 12bis. Pasar cuadros NO puede inundar el rele ni repintar la lista.
    // Corria una vez por cuadro: en reproduccion, 24 mensajes por segundo y por
    // persona, mas el repintado completo de los comentarios. Medido, 60 cuadros
    // pasaban de 206 ms a 553 ms con solo conectarse.
    document.querySelector("#colabSoloCuadro").checked=false;
    document.querySelector("#colabSoloCuadro").dispatchEvent(new Event("change"));
    let repintados=0;
    const renderOriginal=window.dzColabComentsRender;
    window.dzColabComentsRender=function(){ repintados++; return renderOriginal.apply(this,arguments); };
    deBeto.length=0;
    const t0=performance.now();
    for(let f=1;f<=60;f++) DZ.doc.goTo((f%20)+1);
    const msPasarCuadros=Math.round(performance.now()-t0);
    await wait(700);
    window.dzColabComentsRender=renderOriginal;
    const barrido={presencias:deBeto.filter(m=>m.t==="presence").length,
      repintados, msPasarCuadros};

    // ── 13. desconectar a mano
    document.querySelector("#colabDesconectar").click(); await wait(400);
    const desconectado={colab:!!DZ.colab,
      estado:document.querySelector("#colabEstado").textContent,
      vivoOculto:document.querySelector("#colabVivo").hidden};
    beto.close();

    return {inicial,sinDatos,conectado,conBeto,bloqueado,noPude,comentado,
      enOtroCuadro,enSuCuadro,llegoAlCuadro,comenteYo,detalleRebote,loQueMandoBeto,
      rectSobrevive,enElDoc,seQuedoQuieto,barrido,mandeDibujo,recibiDibujo,sinRebote,desconectado,
      nivelNombre, errores:(window.__errs||[]).slice(0,3)};
  })()`;

  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const v = result.result?.value;
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  if (!v?.inicial?.visible || v.inicial.estado !== "sin conectar" || !v.inicial.vivoOculto)
    mal("el panel de equipo no arranca desconectado y vacío", v?.inicial);
  if (v.sinDatos.colab) mal("se conecta sin servidor ni nombre", v.sinDatos);

  if (v.conectado.dato !== "listo" || !v.conectado.vivoVisible)
    mal("no llegó a conectarse con el relé real", v.conectado);
  if (!/vos/.test(v.conectado.yo)) mal("no se ve uno mismo en la lista", v.conectado);
  if (!v.conectado.conectarBloqueado) mal("Conectar sigue habilitado ya conectado", v.conectado);

  if (v.conBeto.gente !== 2) mal("no aparece el que se sumó al proyecto", v.conBeto);
  if (!v.conBeto.veCuadro) mal("no se ve en qué cuadro está el otro", v.conBeto);

  if (!v.bloqueado.filas.some((t) => /Beto/.test(t)))
    mal("la pieza tomada por otro no figura en el panel", v.bloqueado);
  if (!/Beto/.test(v.bloqueado.aviso) || !v.bloqueado.claseCuerpo)
    mal("no se avisa que el nivel donde estoy lo edita otro", v.bloqueado);
  if (!v.noPude.sigueDeBeto) mal("el bloqueo ajeno se pudo pisar", v.noPude);

  if (v.comentado.cantidad !== 1 || !/cruza tarde/.test(v.comentado.texto))
    mal("el comentario del otro no llega", v.comentado);
  if (!/Beto/.test(v.comentado.autor)) mal("el comentario llega sin autor", v.comentado);
  if (!/nada sobre este cuadro/.test(v.enOtroCuadro))
    mal("el filtro no sigue a la cabeza lectora al cambiar de cuadro", v.enOtroCuadro);
  if (v.llegoAlCuadro !== 7)
    mal("clickear «cuadro 7» no lleva al cuadro 7", v.llegoAlCuadro);
  if (v.enSuCuadro !== 1) mal("en su cuadro el comentario no aparece", v.enSuCuadro);

  if (!v.comenteYo.llego || v.comenteYo.texto !== "falta el contacto")
    mal("mi comentario no sale, o sale sin recortar", v.comenteYo);
  if (v.comenteYo.autor !== "Ana") mal("mi comentario sale sin mi nombre", v.comenteYo);
  if (!v.comenteYo.campoVacio) mal("el campo no se limpia al enviar", v.comenteYo);

  if (!v.mandeDibujo.llego || v.mandeDibujo.tipo !== "snapshot.level")
    mal("lo que dibujo no sale al equipo", v.mandeDibujo);
  if (!v.mandeDibujo.tieneNiveles) mal("la instantánea sale sin el nivel", v.mandeDibujo);
  if (!v.mandeDibujo.deQuien || v.mandeDibujo.deQuien !== v.mandeDibujo.yoSoy)
    mal("la operación sale con otro remitente", v.mandeDibujo);

  if (!v.recibiDibujo.entro) mal("el dibujo del otro no entra", v.recibiDibujo);
  if (v.recibiDibujo.pasosHistorial !== 0)
    mal("lo del otro entró en MI historial: mi Ctrl+Z desharía su trabajo", v.recibiDibujo);
  // LOW normaliza el dibujo que recibe en sus capas de arte (Línea / Color) y
  // esa versión normalizada se reemite una vez. Lo que NO puede pasar es que en
  // esa vuelta se pierda el dibujo del otro, ni que quede rebotando sin fin.
  if (!v.rectSobrevive)
    mal("el dibujo del otro se pierde al normalizarlo y se le devuelve vacío", v.detalleRebote);
  if (!v.enElDoc) mal("el dibujo del otro no quedó en el documento", v.enElDoc);
  if (!v.seQuedoQuieto)
    mal("las instantáneas quedan rebotando sin fin entre los dos", v.detalleRebote);

  // El limite es 5 y no 1 porque el latido de fondo y la presencia inicial
  // pueden caer dentro de la ventana; lo que NO puede pasar es que sean 60.
  if (v.barrido.presencias > 5)
    throw Error("REGRESIÓN: pasar cuadros vuelve a inundar el relé de presencia: " + JSON.stringify(v.barrido));
  if (v.barrido.repintados !== 0)
    throw Error("REGRESIÓN: la lista de comentarios se repinta en cada cuadro con el filtro apagado: " + JSON.stringify(v.barrido));

  if (v.desconectado.colab || v.desconectado.estado !== "sin conectar" || !v.desconectado.vivoOculto)
    mal("desconectar no deja el panel como al principio", v.desconectado);
  if (v.errores?.length) throw Error("REGRESIÓN: excepciones en el panel de equipo: " + v.errores.join(" | "));

  console.log("E2E equipo OK (relé real)", JSON.stringify({
    conectado: v.conectado.estado, gente: v.conBeto.gente, bloqueo: v.bloqueado.aviso,
    comentarios: v.comentado.cantidad, salio: v.mandeDibujo.tipo,
    entro: v.recibiDibujo.entro, historial: v.recibiDibujo.pasosHistorial,
    barrido: v.barrido,
  }));
  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
