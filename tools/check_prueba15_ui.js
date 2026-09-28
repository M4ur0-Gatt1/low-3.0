/* EL INSTRUMENTO DE LA PRUEBA MAESTRA (§15). CDP :9223 + mock :8791.

   La §15 no pide solo que alguien ajeno complete el proyecto: pide que «el
   proceso quede grabado como prueba repetible y se mida en errores, tiempo,
   interrupciones y necesidad de ayuda». Ese instrumento no existia, y era lo
   que bloqueaba el unico punto que puede mover la nota del producto.

   Este recorrido comprueba que el instrumento MIDA, no que se vea. Y sobre todo
   las tres cosas que lo harian inutil si se rompen:

   · que los ERRORES se cuenten SOLOS y se atribuyan al paso abierto. Un conteo
     auto-reportado no vale: nadie recuerda cuantas veces algo fallo mientras
     trabajaba.
   · que NO se pueda terminar un paso que nunca se empezo. El tiempo es la unica
     medicion limpia que hay; un tiempo inventado la ensucia.
   · que «con ayuda» NO se cuente como logrado. §15 pide los doce pasos SIN
     ayuda: si un paso con ayuda sumara al veredicto, el instrumento mentiria a
     favor del programa.

   Y que la bitacora se ESCRIBA: un instrumento que mide bien y no guarda nada
   no sirve para comparar dos corridas, que es lo que «repetible» quiere decir. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map();
  ws.onmessage = event => { const m = JSON.parse(event.data);
    if (!m.id || !pending.has(m.id)) return; const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 180000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 60; i++) {
    const r = await send("Runtime.evaluate", { expression: 'typeof dzPrueba15Abrir==="function" && !!api', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    try{localStorage.clear()}catch(e){}

    // ── 1. SE ABRE DESDE EL MENU, sin que app.js sepa de esto.
    const item=document.querySelector('[data-act="prueba15"]');
    const enElMenu={hay:!!item, dentroDeAyuda:!!(item&&item.closest('[data-menu="ayuda"]'))};
    if(item) item.click();
    await w(500);
    let panel=document.querySelector("#dzPrueba15");
    if(!panel){ dzPrueba15Abrir(); await w(400); panel=document.querySelector("#dzPrueba15"); }
    const prueba=dzPrueba15();
    const arranque={panel:!!panel, pasos:prueba?prueba.pasos.length:0,
      // los doce pasos, en el orden de la biblia
      primero:prueba?prueba.pasos[0].texto:"", ultimo:prueba?prueba.pasos[11]?.texto:"",
      filasEnPantalla:panel?panel.querySelectorAll(".p15-paso").length:0};

    const li=(i)=>panel.querySelectorAll(".p15-paso")[i];
    const boton=(i,cual)=>li(i).querySelector('[data-p="'+cual+'"]');

    // ── 2. NO SE PUEDE TERMINAR lo que no se empezo. Ni por el boton (tiene que
    //    estar deshabilitado) ni por el modelo (que es lo que de verdad cuenta).
    const sinEmpezar={botonListo:boton(0,"ok").disabled, botonNoPude:boton(0,"no").disabled,
      elModeloLoRechaza:prueba.terminar("p01","ok")===false,
      sigueSinFin:prueba.paso("p01").fin===null};

    // ── 3. EMPEZAR marca el paso en curso y arranca el reloj.
    boton(0,"empezar").click(); await w(1200);
    const enCurso={abierta:prueba.abierta, resaltado:li(0).classList.contains("abierto"),
      textoDelBoton:boton(0,"empezar").textContent};

    // ── 4. LOS ERRORES SE CUENTAN SOLOS y van al paso abierto.
    const erroresAntes=prueba.paso("p01").errores;
    window.dispatchEvent(new ErrorEvent("error",{message:"falla de prueba 1"}));
    window.dispatchEvent(new ErrorEvent("error",{message:"falla de prueba 2"}));
    await w(300);
    const erroresSolos={antes:erroresAntes, despues:prueba.paso("p01").errores};

    // ── 5. TERMINAR guarda tiempo REAL (no cero) y cierra el paso.
    boton(0,"ok").click(); await w(400);
    const p1=prueba.paso("p01");
    const terminado={resultado:p1.resultado, fin:!!p1.fin, segundos:p1.segundos,
      botonEmpezarBloqueado:boton(0,"empezar").disabled};

    // ── 6. «CON AYUDA» no es lo mismo que logrado.
    boton(1,"empezar").click(); await w(300);
    prueba.ayuda("me trabe buscando como se hace");
    boton(1,"ok").click(); await w(400);
    const conAyuda={resultado:prueba.paso("p02").resultado,
      ayudas:prueba.paso("p02").ayudas.length,
      nota:prueba.paso("p02").ayudas[0]?.nota||"",
      cuentaComoHecho:prueba.resumen().hechosSolo};

    // ── 7. «NO PUDE» queda registrado y no aprueba nada.
    boton(2,"empezar").click(); await w(300);
    boton(2,"no").click(); await w(400);
    const noPude={resultado:prueba.paso("p03").resultado, enElResumen:prueba.resumen().noPude};

    // ── 8. EL VEREDICTO es exigente: los doce, sin ayuda.
    const veredicto={conTresTocados:prueba.resumen().aprobada};

    // ── 9. LA BITACORA SE ESCRIBE, con los dos archivos.
    panel.querySelector('[data-a="guardar"]').click(); await w(600);
    const b=window.__ultimaBitacora;
    const bitacora={seEscribio:!!b, tieneJson:!!(b&&b.json), tieneTexto:!!(b&&typeof b.texto==="string"),
      protocolo:b&&b.json&&b.json.protocolo,
      pasosEnElJson:b&&b.json&&Array.isArray(b.json.pasos)?b.json.pasos.length:0,
      // el esqueleto tiene que ser estable para poder comparar dos corridas
      idsEstables:b&&b.json&&Array.isArray(b.json.pasos)?b.json.pasos.map(p=>p.id).join(","):"",
      sinRelojDeSesion:b&&b.json&&Array.isArray(b.json.pasos)
        ? b.json.pasos.every(p=>!("marca" in p)) : false,
      resumenEnElJson:!!(b&&b.json&&b.json.resumen),
      textoTieneTabla:!!(b&&typeof b.texto==="string"&&/\\| # \\| Paso \\|/.test(b.texto)),
      ruta:panel.querySelector(".p15-ruta").textContent};

    // ── 10. INTERRUPCIONES: una sesion anterior SIN CERRAR es una interrupcion,
    //     y no hace falta que nadie se acuerde de anotarla.
    const guardado=JSON.parse(localStorage.getItem("low.prueba15.v1"));
    const seguiaAbierta=guardado&&!guardado.cerrada;
    const antesDeReabrir=prueba.interrupciones;
    const otra=new LOW.core.Prueba15(guardado);
    const interrupciones={laSesionQuedoAbierta:!!seguiaAbierta, antes:antesDeReabrir,
      // el modelo recompone la corrida anterior con sus tiempos y conteos
      recuperaPasos:otra.pasos.length, recuperaTiempo:otra.paso("p01").segundos,
      recuperaErrores:otra.paso("p01").errores};

    return {enElMenu,arranque,sinEmpezar,enCurso,erroresSolos,terminado,conAyuda,
      noPude,veredicto,bitacora,interrupciones};
  })()`;

  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  const v = r.result?.value;
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  if (!v?.enElMenu?.hay) mal("no hay entrada de menú para la prueba maestra: el instrumento " +
    "existiría y nadie podría abrirlo", v?.enElMenu);
  if (!v.enElMenu.dentroDeAyuda) mal("la entrada quedó fuera del menú Ayuda", v.enElMenu);
  if (!v.arranque.panel) mal("el panel no se abre desde el menú", v.arranque);
  if (v.arranque.pasos !== 12) mal("el protocolo no tiene los DOCE pasos de §15", v.arranque);
  if (v.arranque.filasEnPantalla !== 12) mal("la pantalla no muestra los doce pasos", v.arranque);
  if (!/Crear un documento 2D/.test(v.arranque.primero))
    mal("el primer paso no es el de la biblia", v.arranque);
  if (!/Recuperar el proyecto/.test(v.arranque.ultimo))
    mal("el último paso no es el de la biblia", v.arranque);

  if (!v.sinEmpezar.botonListo || !v.sinEmpezar.botonNoPude)
    mal("se puede marcar un paso que nunca se empezó: un tiempo inventado ensucia la " +
      "única medición limpia", v.sinEmpezar);
  if (!v.sinEmpezar.elModeloLoRechaza || !v.sinEmpezar.sigueSinFin)
    mal("el MODELO acepta terminar un paso sin empezar, aunque el botón esté apagado",
      v.sinEmpezar);

  if (v.enCurso.abierta !== "p01") mal("empezar un paso no lo deja en curso", v.enCurso);
  if (!v.enCurso.resaltado) mal("el paso en curso no se distingue en pantalla", v.enCurso);

  if (v.erroresSolos.despues - v.erroresSolos.antes !== 2)
    mal("los errores NO se cuentan solos: un conteo auto-reportado no vale nada",
      v.erroresSolos);

  if (v.terminado.resultado !== "ok") mal("terminar un paso no lo marca hecho", v.terminado);
  if (!v.terminado.fin) mal("el paso terminado no queda con hora de fin", v.terminado);
  if (!(v.terminado.segundos >= 1))
    mal("el tiempo del paso quedó en cero: el cronómetro no midió", v.terminado);

  if (v.conAyuda.resultado !== "con ayuda")
    mal("un paso que necesitó ayuda se marca como logrado a secas", v.conAyuda);
  if (v.conAyuda.ayudas !== 1 || !/me trabe/.test(v.conAyuda.nota))
    mal("el pedido de ayuda no queda con su nota", v.conAyuda);
  if (v.conAyuda.cuentaComoHecho !== 1)
    mal("«con ayuda» suma al conteo de pasos hechos SIN ayuda: el instrumento mentiría " +
      "a favor del programa", v.conAyuda);

  if (v.noPude.resultado !== "no pude" || v.noPude.enElResumen !== 1)
    mal("«no pude» no queda registrado", v.noPude);
  if (v.veredicto.conTresTocados)
    mal("el veredicto da APROBADA sin los doce pasos sin ayuda", v.veredicto);

  const b = v.bitacora;
  if (!b.seEscribio) mal("la bitácora no se escribe: sin archivo no hay nada que comparar", b);
  if (!b.tieneJson || !b.tieneTexto)
    mal("falta uno de los dos archivos: el JSON para comparar y el resumen para leer", b);
  if (b.protocolo !== 1) mal("la bitácora no dice qué versión del protocolo es", b);
  if (b.pasosEnElJson !== 12) mal("el JSON no guarda los doce pasos", b);
  if (b.idsEstables !== "p01,p02,p03,p04,p05,p06,p07,p08,p09,p10,p11,p12")
    mal("los ids de los pasos no son estables: dos corridas no se podrían comparar", b);
  if (!b.sinRelojDeSesion)
    mal("la bitácora guarda el reloj interno de la sesión: es basura para comparar", b);
  if (!b.resumenEnElJson) mal("el JSON no trae el resumen calculado", b);
  if (!b.textoTieneTabla) mal("el resumen legible no trae la tabla por paso", b);
  if (!/prueba15/.test(b.ruta)) mal("no se dice dónde quedó la bitácora", b);

  const i = v.interrupciones;
  if (!i.laSesionQuedoAbierta)
    mal("la corrida en curso no queda marcada como abierta: sin eso no se puede detectar " +
      "un cierre forzado", i);
  if (i.recuperaPasos !== 12 || !(i.recuperaTiempo >= 1) || i.recuperaErrores !== 2)
    mal("una corrida anterior no se recompone con sus tiempos y conteos", i);

  console.log("E2E instrumento §15 OK", JSON.stringify({ pasos: v.arranque.pasos,
    erroresContadosSolos: v.erroresSolos, primerPaso: v.terminado,
    conAyuda: v.conAyuda, veredicto: v.veredicto.conTresTocados,
    bitacora: { protocolo: b.protocolo, pasos: b.pasosEnElJson, ruta: b.ruta } }));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
