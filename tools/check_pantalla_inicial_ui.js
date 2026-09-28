/* LA PRIMERA PANTALLA ES EL MODULO 2D. CDP :9223 + mock :8791.

   Decision de Mauro: «un solo programa, avanzando mas sobre el modulo 2D y
   haciendolo mas presente, que sea la primera pantalla, y que la IA y redes
   sean un boton — al reves de lo que es ahora».

   Este recorrido comprueba las cuatro cosas que harian de esto un desastre si
   se rompen, y las cuatro salieron de mirar que pasaba de verdad:

   1. NO SE CREA NINGUN ARCHIVO AL ARRANCAR. El camino que ya existia para
      entrar al diseno llama a new_design(), que ESCRIBE un
      disenos/diseno_<fecha>.svg. Usarlo en el arranque dejaria un SVG nuevo por
      cada vez que se abre LOW.

   2. EL MODULO VACIO NO PUEDE PARECER ROTO. Medido antes de tocar nada: abrir
      el estudio sin documento deja las herramientas y los paneles, y en el
      medio un damero enorme sin lienzo, sin pestanas y sin nada que hacer.

   3. EL BOTON A LA IA NO ES EL DE CERRAR. El boton X corre closeDesign(), que
      CIERRA EL DOCUMENTO. Si el interruptor de pantalla fuera ese, cambiar de
      pantalla te haria perder el dibujo.

   Lo que este recorrido NO prueba, y a proposito: que el boton X siga cerrando
   el documento. Cerrar un documento sin guardar abre un modal PROPIO —LOW no
   usa confirm() nativo— y el arnes se cuelga esperandolo. Eso ya lo cubre
   check_document_tabs_ui, que sabe clickear el modal.

   4. EL ARRANQUE NO SE PUEDE CAER POR ESTO. La llamada va por window: un
      identificador suelto con `?.` lanza ReferenceError si el modulo no cargo
      —el `?.` no protege identificadores no declarados— y init() moriria ahi,
      dejando el programa en nada. */
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
  await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
  // EL ESTUDIO NO PUEDE ESPERAR AL CHAT. Medido en la app real: el estudio
  // aparecia a los 6.542 ms porque la llamada esta al final de init(), detras de
  // api.get_state(), loadChatTabs() y resume() —el 2D esperando a que cargara la
  // IA, justo la jerarquia que Mauro pidio dar vuelta—. Asi que hay una fase
  // TEMPRANA, que corre con el DOM. Se instrumenta desde antes de que corra
  // nada de la app: cuando el arranque termina ya no queda rastro de quien
  // pinto primero.
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    // UN PUNTO DE RESCATE SEMBRADO, para probar que la invitación lo ofrece.
    // El ofrecimiento vive dentro de dzDocInit, que sólo corre al crear o abrir
    // un documento; desde que LOW abre SIN documento, quien volvía después de un
    // cierre forzado veía un estudio vacío y ninguna señal de que su trabajo
    // estaba guardado. Se siembra el rescate del DOCUMENTO, que es el que se
    // escribe cada 450 ms y el que tiene los últimos trazos.
    try {
      localStorage.setItem("low.document.recovery.prueba", JSON.stringify({
        path: "C:/prueba/dibujo-sin-guardar.svg",
        content: "<svg xmlns='http://www.w3.org/2000/svg'><path d='M10 10 L90 90'/></svg>",
        metadata: {}, savedAt: Date.now() - 120000 }));
    } catch (e) { /* sin almacenamiento: la asercion del rescate lo dira */ }
    window.__inicio = Date.now(); window.__foto = null; window.__tTardio = null;
    const mirar = setInterval(() => {
      const caja = document.querySelector("#dzBienvenida2D");
      if (caja && !window.__foto) {
        window.__foto = { t: Date.now() - window.__inicio,
          estudioVisible: !document.querySelector("#designView").hidden,
          acciones: [...caja.querySelectorAll("button[data-a]")]
            .map(b => b.dataset.a + ":" + (b.disabled ? "apagado" : "prendido")),
          dice: (caja.querySelector(".bien2d-espera") || {}).textContent || null };
      }
      if (Date.now() - window.__inicio > 25000) clearInterval(mirar);
    }, 5);
    const esperar = setInterval(() => {
      if (typeof window.dzPantallaInicial === "function" && !window.dzPantallaInicial.__espiada) {
        const orig = window.dzPantallaInicial;
        const espia = function () { window.__tTardio = Date.now() - window.__inicio;
          return orig.apply(this, arguments); };
        espia.__espiada = true; window.dzPantallaInicial = espia; clearInterval(esperar);
      }
      if (Date.now() - window.__inicio > 20000) clearInterval(esperar);
    }, 5);
  ` });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 60; i++) {
    const r = await send("Runtime.evaluate", { expression: 'typeof dzPantallaInicial==="function" && !!api', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const errs=[]; window.addEventListener("error", e=>errs.push(String(e.message)));
    // El arranque no se toca: se lo deja terminar SOLO, que es justamente lo
    // que hay que comprobar.
    await w(2600);

    const dv=document.querySelector("#designView");
    const inv=document.querySelector("#dzBienvenida2D");
    const bot=document.querySelector("#dzIrAlAgente");
    const arranque={
      elDosDeEstaAbierto:!!(dv && !dv.hidden),
      // el arranque completo: si init() se hubiera caido en la llamada, el
      // mensaje de bienvenida —que va DESPUES— no estaria
      elArranqueTermino:/— listo/.test((document.querySelector("#msgs")||{}).textContent||""),
      hayInvitacion:!!inv,
      titulo:inv?(inv.querySelector("h2")||{}).textContent:null,
      acciones:inv?[...inv.querySelectorAll("button")].map(b=>b.textContent.trim()):[],
      hayBotonIA:!!bot, textoBoton:bot?bot.textContent.trim():null,
      // 1. NADA CREADO
      sinArchivoCreado:!DZ.path, sinDocumento:!DZ.doc,
      // el boton nuevo NO es el de cerrar
      esOtroBoton:!!(bot && document.querySelector("#dzClose") && bot!==document.querySelector("#dzClose")),
      // y va ANTES del de cerrar, para que el de cerrar siga siendo el ultimo
      antesDelCerrar:!!(bot && (bot.compareDocumentPosition(document.querySelector("#dzClose"))&4)===4)};

    // EL RESCATE ANTE CAIDA, ofrecido en la invitacion. Se mide ACA, con la
    // invitacion todavia en pantalla: mas abajo el recorrido crea un documento y
    // la invitacion se va, que es justo lo que tiene que pasar.
    const rescate=(()=>{ if(!inv) return {sinInvitacion:true};
      const fila=inv.querySelector(".bien2d-rescate");
      const b=fila&&fila.querySelector('[data-a="rescate"]');
      return { hayFila:!!fila, visible:!!(fila&&!fila.hidden),
        dice:fila?((fila.querySelector("p")||{}).textContent||""):"",
        habilitado:!!(b&&!b.disabled), hayHandler:!!(b&&typeof b.onclick==="function") };
    })();

    // ── LA INVITACION SE USA CON EL PUNTERO, no llamando a su onclick. Esta
    //    distincion no es un detalle: la invitacion vive DENTRO de #dzCanvas,
    //    que es la superficie de dibujo, y el lienzo atiende el pointerdown
    //    antes que nadie. La primera version de esta prueba hacia boton.click()
    //    y pasaba; en la app real el clic SELECCIONABA el boton como si fuera
    //    arte —el inspector mostraba «<button>»— y el documento no se creaba
    //    nunca. Los paneles que ya viven ahi funcionan porque estan en
    //    DZ_UI_SEL; el mio faltaba. Asi que se clickea por coordenada, sobre lo
    //    que el navegador ponga bajo el punto.
    const nuevo=document.querySelector('#dzBienvenida2D [data-a="nuevo"]');
    const rb=nuevo.getBoundingClientRect();
    const bx=Math.round(rb.x+rb.width/2), by=Math.round(rb.y+rb.height/2);
    const bajo=document.elementFromPoint(bx,by);
    const clicLlegaAlBoton = bajo===nuevo || nuevo.contains(bajo);
    // NO se dispara el click a mano: eso es justo lo que enmascaraba el defecto.
    // dzPointerDown hace e.preventDefault(), y un preventDefault en pointerdown
    // CANCELA el click que el navegador iba a generar. Mandando el click aparte,
    // el boton respondia en la prueba y no respondia en la app. Asi que se
    // dispara pointerdown y se pregunta si alguien lo cancelo.
    const abajo=new PointerEvent("pointerdown",{bubbles:true,cancelable:true,
      pointerId:1,pointerType:"mouse",isPrimary:true,button:0,buttons:1,
      clientX:bx,clientY:by});
    bajo.dispatchEvent(abajo);
    // La seleccion se lee EN EL ACTO: si despues se crea el documento,
    // dzDeselect() la limpia y el sintoma desaparece de la medicion.
    const seleccionoElBoton = !!(DZ.sel && DZ.sel.tagName==="BUTTON");
    const loCancelaron = abajo.defaultPrevented;
    bajo.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,cancelable:true,
      pointerId:1,pointerType:"mouse",isPrimary:true,button:0,buttons:0,
      clientX:bx,clientY:by}));
    // Y el click, sólo si nadie canceló el pointerdown: es lo que haría el
    // navegador. Si lo cancelaron, el boton NO se entera y eso es el defecto.
    if (!loCancelaron) bajo.dispatchEvent(new MouseEvent("click",{bubbles:true,
      cancelable:true,button:0,clientX:bx,clientY:by}));
    await w(1600);
    const porElPuntero={clicLlegaAlBoton, seleccionoElBoton, loCancelaron,
      creoElDocumento: !!DZ.doc};
    if (!DZ.doc) { dzMenuAction("nuevo"); await w(1400); }
    const conDocumento={hayDoc:!!DZ.doc, invitacionSeFue:!document.querySelector("#dzBienvenida2D")};

    // ── LA INVITACIÓN CLAVADA, que es como lo vio Mauro: la invitación puesta
    //    ENCIMA de un documento abierto, tapándolo, con sus botones sin
    //    responder. Medido en la app real: con un diseño .svg abierto —dos
    //    pestañas, siete cuadros— DZ.path y DZ.doc estaban los DOS en null,
    //    así que mirar sólo esos dos no alcanza. Se reproduce ese estado exacto:
    //    pestañas sí, doc y path no. Y se repinta, que además ejercita que el
    //    reloj se arme al pintar y no sólo en el arranque.
    const docReal=DZ.doc, pathReal=DZ.path, tabsReales=(DZ.documentTabs||[]).slice(),
      activaReal=DZ.activeDocumentTab;
    // activeDocumentTab TAMBIÉN, o el montaje de la prueba miente: la primera
    // versión de esto dejaba la pestaña activa puesta, hayTrabajoAbierto()
    // decía «hay algo» —con razón— y la invitación no se repintaba nunca.
    DZ.doc=null; DZ.path=null; DZ.documentTabs.length=0; DZ.activeDocumentTab=null;
    dzBienvenida2DPintar(); await w(120);
    const repintada=!!document.querySelector("#dzBienvenida2D");
    // LA TARJETA REPINTADA TIENE QUE SERVIR. habilitar() corria UNA vez, en el
    // arranque; toda invitacion pintada despues —al cerrar el documento, al
    // volver de la IA— nacia con Nuevo, Abrir y Recuperar APAGADOS y
    // «Preparando LOW...» abajo, para siempre. LOW quedaba inservible sin
    // haberse roto nada: «lo cerre y lo volvi a abrir y quedo clavado».
    const repintadaSirve={
      acciones:[...document.querySelectorAll("#dzBienvenida2D button[data-a]")]
        .map(b=>b.dataset.a+":"+(b.disabled?"apagado":"prendido")),
      dice:(document.querySelector("#dzBienvenida2D .bien2d-espera")||{}).textContent||null};
    DZ.documentTabs.push({id:"__prueba_clavada__", path:"diseno_prueba.svg",
      name:"diseno_prueba.svg"});
    await w(1500);   // el reloj mira cada 500 ms
    const clavada={repintada, repintadaSirve,
      sigueTapandoElDocumento:!!document.querySelector("#dzBienvenida2D")};
    DZ.documentTabs.length=0; for(const t of tabsReales) DZ.documentTabs.push(t);
    DZ.doc=docReal; DZ.path=pathReal; DZ.activeDocumentTab=activaReal;
    dzBienvenida2DQuitar();
    const antes={doc:!!DZ.doc, pestanas:DZ.documentTabs?DZ.documentTabs.length:0};
    document.querySelector("#dzIrAlAgente").click(); await w(500);
    const trasIrALaIA={oculto:document.querySelector("#designView").hidden,
      // LO QUE IMPORTA: el documento sigue abierto
      sigueElDoc:!!DZ.doc, mismasPestanas:(DZ.documentTabs?DZ.documentTabs.length:0)===antes.pestanas,
      plumaMarcada:!!(document.querySelector("#abDesign")||{}).classList?.contains("vuelve-al-2d")};
    // ── LA VUELTA, por el camino real: la pluma de la barra izquierda. Y no
    //    puede crear un archivo: con la IA detras de un boton este viaje es
    //    constante, y el camino viejo escribia un SVG cada vez que no habia
    //    DZ.path —que es justo el caso con un documento .low abierto—.
    const pestanasAntes=DZ.documentTabs?DZ.documentTabs.length:0;
    document.querySelector("#abDesign").click(); await w(700);
    const trasVolver={visible:!document.querySelector("#designView").hidden,
      sigueElDoc:!!DZ.doc,
      noCreoNada:(DZ.documentTabs?DZ.documentTabs.length:0)===pestanasAntes,
      plumaSinMarca:!(document.querySelector("#abDesign")||{}).classList?.contains("vuelve-al-2d")};

    const temprano={foto:window.__foto, tTardio:window.__tTardio};

    return {arranque,temprano,rescate,porElPuntero,conDocumento,clavada,trasIrALaIA,trasVolver,errs:errs.slice(0,4)};
  })()`;

  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  const v = r.result?.value;
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const a = v?.arranque;

  if (!a) mal("el recorrido no devolvió nada", v);
  if (!a.elArranqueTermino)
    mal("el arranque NO llegó al final: la llamada a la primera pantalla se llevó puesto " +
      "init(), y el programa queda en nada", a);
  if (!a.elDosDeEstaAbierto)
    mal("el módulo 2D no es la primera pantalla: arrancó escondido", a);
  if (!a.sinArchivoCreado || !a.sinDocumento)
    mal("el arranque CREÓ algo: dejaría un archivo nuevo por cada vez que se abre LOW", a);
  if (!a.hayInvitacion) mal("el estudio abre vacío y sin nada que hacer: parece roto", a);
  if (!/2D|Animaci/i.test(a.titulo || "")) mal("la invitación no dice qué es esto", a);
  if (a.acciones.length < 3 || !a.acciones.some(t => /Nuevo/i.test(t)) ||
      !a.acciones.some(t => /Abrir/i.test(t)))
    mal("la invitación no ofrece crear ni abrir", a);
  if (!a.hayBotonIA) mal("no hay botón a IA y redes: eso era el pedido", a);
  if (!/IA/.test(a.textoBoton || "")) mal("el botón a IA no se lee", a);
  if (!a.esOtroBoton) mal("el botón a IA es el mismo que cierra el documento", a);
  if (!a.antesDelCerrar) mal("el botón a IA quedó después del de cerrar", a);

  const t = v.temprano || {};
  if (!t.foto) mal("no se pudo ver quién pintó la invitación primero", t);
  if (!t.foto.estudioVisible)
    mal("la invitación apareció con el estudio todavía escondido", t);
  if (t.tTardio !== null && t.foto.t >= t.tTardio)
    mal("la primera pantalla la pinta la fase TARDÍA, que corre al final de init() " +
      "detrás de api.get_state(), loadChatTabs() y resume(): el estudio de dibujo " +
      "espera a que cargue el chat de la IA y hasta entonces se ve la pantalla vieja. " +
      "Medido en la app real: 6.542 ms", t);
  if (!t.foto.acciones.includes("nuevo:apagado") || !t.foto.acciones.includes("abrir:apagado"))
    mal("las acciones de la invitación nacen PRENDIDAS: la fase temprana pinta antes " +
      "de que exista el puente de Python, así que «Nuevo documento» sería un botón " +
      "visible que no hace nada — el defecto que se acaba de arreglar", t);
  if (!/Prepar/i.test(t.foto.dice || ""))
    mal("nada dice que LOW todavía está arrancando: los botones apagados sin " +
      "explicación se leen como una pantalla fallada", t);
  if (!v.conDocumento) mal("no se llegó a medir con documento", v);

  const res = v.rescate || {};
  if (res.sinInvitacion) mal("no hay invitación donde ofrecer el rescate", res);
  if (!res.visible)
    mal("con trabajo sin guardar en el almacén, la invitación NO ofrece recuperarlo: " +
      "el ofrecimiento vive dentro de dzDocInit, que sólo corre al crear o abrir un " +
      "documento, así que desde que LOW abre sin documento quien vuelve de un cierre " +
      "forzado ve un estudio vacío y ninguna señal de que su trabajo está guardado", res);
  if (!/sin guardar/i.test(res.dice || ""))
    mal("la invitación no dice que hay trabajo sin guardar", res);
  // Se pide que NOMBRE un archivo, no cual: el mock escribe sus propios puntos de
  // rescate durante el arranque y el mas nuevo gana —que es lo correcto—.
  if (!/«[^»]+\.(svg|low)»/i.test(res.dice || ""))
    mal("la invitación no dice DE QUÉ archivo es el trabajo sin guardar: sin el " +
      "nombre no se puede decidir si vale recuperarlo", res);
  if (!res.habilitado || !res.hayHandler)
    mal("la acción de recuperar está muerta: sin handler o deshabilitada", res);

  const pp = v.porElPuntero;
  if (!pp.clicLlegaAlBoton)
    mal("el puntero no llega al botón de la invitación: algo se le pone encima", pp);
  if (pp.loCancelaron)
    mal("el lienzo CANCELA el pointerdown de la invitación: un preventDefault en " +
      "pointerdown se come el click que el navegador iba a generar, así que el botón " +
      "no se entera nunca. Le falta estar en DZ_UI_SEL", pp);
  if (pp.seleccionoElBoton)
    mal("un clic en la invitación SELECCIONA el botón como si fuera un dibujo: la " +
      "invitación vive dentro del lienzo y le falta estar en DZ_UI_SEL. Es lo que " +
      "hacía que el panel de la derecha mostrara «<button>» y no se creara nada", pp);
  if (!pp.creoElDocumento)
    mal("«Nuevo documento» no crea nada al CLICKEARLO de verdad —llamando a su onclick " +
      "sí funcionaba, y por eso esto se escapó", pp);
  if (!v.conDocumento.hayDoc) mal("«Nuevo documento» de la invitación no crea nada", v.conDocumento);
  if (!v.conDocumento.invitacionSeFue)
    mal("la invitación sigue puesta con un documento abierto: taparía el dibujo",
      v.conDocumento);

  if (!v.clavada.repintada)
    mal("la invitación no se puede repintar: al volver de la IA sin nada abierto el " +
      "estudio queda vacío y parece roto otra vez", v.clavada);
  if (v.clavada.sigueTapandoElDocumento)
    mal("la invitación se queda CLAVADA encima de un documento abierto: es como lo " +
      "vio Mauro —dos pestañas, siete cuadros y la invitación tapando todo—. Con un " +
      "diseño .svg abierto DZ.path y DZ.doc están los DOS en null, así que hay que " +
      "mirar las pestañas (documentTabs); y el reloj tiene que armarse al PINTAR, " +
      "no una sola vez en el arranque", v.clavada);

  if (!v.trasIrALaIA.oculto) mal("el botón a IA no cambia de pantalla", v.trasIrALaIA);
  if (!v.trasIrALaIA.sigueElDoc || !v.trasIrALaIA.mismasPestanas)
    mal("ir a IA CERRÓ el documento: era el peligro de usar el botón de cerrar como " +
      "interruptor de pantalla", v.trasIrALaIA);
  if (!v.trasIrALaIA.plumaMarcada)
    mal("nada indica cómo volver al dibujo", v.trasIrALaIA);
  if (!v.trasVolver.visible || !v.trasVolver.sigueElDoc)
    mal("no se puede volver al estudio con el documento intacto", v.trasVolver);
  if (!v.trasVolver.noCreoNada)
    mal("volver al estudio CREÓ un documento: con la IA detrás de un botón el viaje es " +
      "constante y dejaría un archivo por cada vuelta", v.trasVolver);
  if (!v.trasVolver.plumaSinMarca)
    mal("la pluma sigue marcada después de volver", v.trasVolver);


  const muertas = (v.clavada?.repintadaSirve?.acciones || []).filter(a => /apagado/.test(a));
  if (muertas.length || v.clavada?.repintadaSirve?.dice)
    mal("la pantalla de inicio REPINTADA nace muerta: sus acciones no responden y " +
      "sigue diciendo «Preparando LOW». Pasa al cerrar el documento o al volver de la " +
      "IA, y deja el programa inservible —ni siquiera se puede recuperar el trabajo " +
      "sin guardar— sin que se haya roto nada", v.clavada.repintadaSirve);

  if (v.errs?.length) throw Error("REGRESIÓN: excepciones en el arranque: " + v.errs.join(" | "));
  if (errores.length) throw Error("REGRESIÓN: excepciones: " + errores.slice(0, 3).join(" | "));

  console.log("E2E primera pantalla OK", JSON.stringify({ abre2D: a.elDosDeEstaAbierto,
    sinCrearNada: a.sinArchivoCreado, invitacion: a.acciones, boton: a.textoBoton,
    irALaIA: v.trasIrALaIA, volver: v.trasVolver, cerrarSigueCerrando: v.cerrar }));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
