/* A02 DEL PLAN MAESTRO: EL RECORRIDO DE ARRANQUE, CON ENTRADA FÍSICA.
   CDP :9223 + mock :8791. También se puede apuntar a la app real:
     node tools/check_arranque_recorrido_ui.js http://127.0.0.1:9224 <url-de-la-app>

   «Validar: arranque 2D, Nuevo/Abrir, viaje a IA y vuelta, cambio de documento y
   vuelta desde 3D con entrada física. Ningún documento debe quedar tapado o
   perder identidad.»

   ENTRADA FÍSICA DE VERDAD: todo se clickea con `Input.dispatchMouseEvent`, que
   es el mouse del navegador y no un evento sintético. Dos razones, las dos
   aprendidas a golpes:

   · Un `elemento.click()` se saltea el `pointerdown`, y un `preventDefault()`
     ahí cancela el click que el navegador iba a generar. Un guard que dispara el
     click a mano pasa en verde mientras el botón está muerto en la app: fue
     exactamente el caso de la invitación del 2D.
   · `Input.dispatchMouseEvent` necesita un `mouseMoved` ANTES del `mousePressed`
     o no acierta el blanco. Un mouse de verdad siempre se mueve primero.

   LO QUE ESTE RECORRIDO PERSIGUE, y no es teoría: `#l3dView` está en z-index 62
   y `#designView` en 61, así que el estudio 3D TAPA el 2D. Ni la pluma de la
   barra izquierda ni el botón a la IA lo cerraban, así que con el 3D abierto uno
   pedía volver al dibujo y seguía mirando el 3D. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const esReal = !/mock=1/.test(pageUrl);

async function main() {
  let target, ws;
  if (esReal) {
    // en la app real se usa la pestaña que ya está abierta
    const lista = await (await fetch(endpoint + "/json")).json();
    target = lista.find(t => t.type === "page" && /index\.html/.test(t.url));
    if (!target) throw Error("no encontré la ventana de LOW en " + endpoint);
    ws = new WebSocket(target.webSocketDebuggerUrl);
  } else {
    target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
    ws = new WebSocket(target.webSocketDebuggerUrl);
  }
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
  const ev = async (expr) => { const r = await send("Runtime.evaluate",
    { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  if (!esReal) {
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await ev('(()=>{try{localStorage.clear()}catch(e){}; return true})()');
    await send("Page.navigate", { url: pageUrl });
  } else {
    await send("Page.reload", { ignoreCache: true });
  }
  // esperar por CONDICIÓN, nunca por reloj: con la máquina cargada un sleep
  // fijo se queda corto y la prueba falla por lentitud, no por regresión
  for (let i = 0; i < 120; i++) {
    const listo = await ev('(()=>{const b=document.querySelector(\'#dzBienvenida2D [data-a="nuevo"]\');' +
      ' return !!b && !b.disabled;})()').catch(() => false);
    if (listo === true) break;
    await w(500);
  }

  /** El clic del mouse de verdad: mover, apretar, soltar. */
  const clickEn = async (sel, nota) => {
    const caja = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});
      if(!e) return null; const r=e.getBoundingClientRect();
      if(!r.width||!r.height) return null;
      return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};})()`);
    if (!caja) throw Error("no encontré (o no tiene tamaño) " + sel + (nota ? " — " + nota : ""));
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: caja.x, y: caja.y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: caja.x, y: caja.y, button: "left", buttons: 1, clickCount: 1 });
    await w(90);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: caja.x, y: caja.y, button: "left", buttons: 0, clickCount: 1 });
    return true;
  };

  const foto = () => ev(`(()=>{
    const D = typeof DZ !== "undefined" && DZ ? DZ : null;
    const q = (s) => document.querySelector(s);
    const visible = (s) => { const e=q(s); return !!e && !e.hidden; };
    return {
      dosDe: visible("#designView"),
      tresDe: visible("#l3dView"),
      agente: !visible("#designView") && !visible("#l3dView"),
      invitacion: !!q("#dzBienvenida2D"),
      pestanas: D && D.documentTabs ? D.documentTabs.map(t => String(t.name || t.path || t.id)) : [],
      activa: D ? String(D.activeDocumentTab) : "-",
      hayDoc: !!(D && (D.doc || D.path)),
      // lo que se ve en el medio de la mesa: si el 3D tapa, acá aparece él
      encima: (()=>{ const e=document.elementFromPoint(innerWidth/2, innerHeight/2);
        let n=e, cadena=[]; while(n && cadena.length<7){ cadena.push((n.id?"#"+n.id:n.tagName)); n=n.parentElement; }
        return cadena.join(" < "); })(),
    };
  })()`);

  const pasos = {};
  pasos.arranque = await foto();

  // ── 1. Nuevo documento, clickeado de verdad
  await clickEn('#dzBienvenida2D [data-a="nuevo"]', "la invitación del 2D");
  for (let i = 0; i < 30; i++) { const f = await foto(); if (f.pestanas.length && !f.invitacion) break; await w(400); }
  pasos.nuevo = await foto();

  // ── 2. viaje a la IA
  await clickEn("#dzIrAlAgente", "el botón a IA y redes");
  await w(600);
  pasos.enLaIA = await foto();

  // ── 3. vuelta por la pluma
  await clickEn("#abDesign", "la pluma de la barra izquierda");
  await w(700);
  pasos.deVuelta = await foto();

  // ── 4. al 3D, y POR LA PUERTA DEL ESTUDIO. La barra izquierda —donde vive
  //      el único botón que existía— queda TAPADA por #designView, que es
  //      position:fixed con inset:0. Medido con elementFromPoint: con el 2D
  //      abierto, el punto medio de la pluma y del botón 3D devuelve
  //      #designView. Mientras LOW abría en el lado programador no se notaba;
  //      desde que el 2D es la primera pantalla el 3D quedó sin entrada.
  pasos.barraTapada = await ev(`(()=>{
    const bajo=(sel)=>{ const e=document.querySelector(sel); if(!e) return "no existe";
      const r=e.getBoundingClientRect(); if(!r.width) return "sin tamano";
      const q=document.elementFromPoint(Math.round(r.x+r.width/2), Math.round(r.y+r.height/2));
      return q===e||e.contains(q) ? "alcanzable" : "tapado"; };
    return { plumaDesdeEl2D: bajo("#abDesign"), tresDeDesdeEl2D: bajo("#abL3d"),
      hayPuertaEnElEstudio: !!document.querySelector("#dzIrAl3D") };
  })()`);
  // Se comprueba ANTES de intentar el clic: si no, lo que falla es el clic con
  // un «no encontré el botón» y se pierde el motivo, que es el que importa.
  if (!pasos.barraTapada.hayPuertaEnElEstudio)
    throw Error("A02 INCUMPLIDO: desde el estudio 2D no hay manera de llegar al " +
      "estudio 3D. La única puerta es el botón de la barra izquierda, y esa barra " +
      "queda TAPADA por #designView (position:fixed, inset:0). Con LOW abriendo " +
      "en el lado programador no se notaba; desde que el 2D es la primera " +
      "pantalla hace falta una puerta en la barra del estudio :: " +
      JSON.stringify(pasos.barraTapada));
  await clickEn("#dzIrAl3D", "el botón al 3D en la barra del estudio");
  await w(2000);
  pasos.enEl3D = await foto();

  // ── 5. y la vuelta al dibujo DESDE el 3D. Acá está el hueso: #l3dView está
  //      por encima de #designView, así que si nadie lo cierra uno pide volver
  //      al dibujo y sigue mirando el 3D.
  // Con el 3D abierto la barra izquierda tambien queda tapada —por el iframe—,
  // asi que la vuelta que se prueba es la que el dibujante tiene a mano: el
  // botón «Volver» del propio estudio 3D, que postea low:close-3d. Y despues se
  // exige que la pluma y el botón a la IA TAMBIEN cierren el 3D, porque si no
  // mostrar el 2D con el 3D encima deja al dibujante mirando otra pantalla.
  // El botón «Volver» vive DENTRO del iframe del estudio 3D. No sirve hacer un
  // postMessage desde la página: `app.js` exige que el mensaje venga del
  // contentWindow del frame, así que un mensaje propio se descarta —bien
  // descartado—. Se busca el botón en el documento del iframe y se lo clickea
  // por coordenada de la ventana: el rect del botón más el offset del frame.
  pasos.salidaDelTresDe = await ev(`(()=>{
    const f = document.querySelector("#l3dFrame");
    let d = null;
    try { d = f && f.contentDocument; } catch(e) { return {error:"iframe inaccesible: "+e}; }
    if (!d) return {error:"el iframe no tiene documento"};
    const b = [...d.querySelectorAll("button,[role=button]")]
      .find(x => /volver|salir/i.test(x.textContent || x.title || ""));
    if (!b) return {error:"el estudio 3D no ofrece «Volver»",
      botones:[...d.querySelectorAll("button")].slice(0,8).map(x=>(x.textContent||"").trim().slice(0,18))};
    const rf = f.getBoundingClientRect(), rb = b.getBoundingClientRect();
    return {texto:(b.textContent||"").trim(),
      x: Math.round(rf.x + rb.x + rb.width/2), y: Math.round(rf.y + rb.y + rb.height/2)};
  })()`);
  if (pasos.salidaDelTresDe && pasos.salidaDelTresDe.x) {
    const q = pasos.salidaDelTresDe;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: q.x, y: q.y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: q.x, y: q.y, button: "left", buttons: 1, clickCount: 1 });
    await w(90);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: q.x, y: q.y, button: "left", buttons: 0, clickCount: 1 });
  }
  await w(1200);
  pasos.vueltaDesdeEl3D = await foto();
  // y el caso defensivo: 3D abierto + pedir el 2D por la pluma
  await ev('(()=>{ openL3d(); return true; })()'); await w(1200);
  pasos.tresDeOtraVez = await foto();
  await ev('(()=>{ dzVolverAlEstudio(); return true; })()'); await w(700);
  pasos.plumaConEl3DAbierto = await foto();

  // ── 6. segundo documento y cambio de pestaña, sin perder identidad
  if (!pasos.vueltaDesdeEl3D.tresDe) {
    await ev('(()=>{ dzMenuAction("nuevo"); return true; })()');
    for (let i = 0; i < 30; i++) { const f = await foto(); if (f.pestanas.length > 1) break; await w(400); }
    pasos.dosDocumentos = await foto();
    const primera = await ev('(()=>{const t=document.querySelectorAll("#dzTabs > *"); return t.length ? 0 : -1;})()');
    if (primera === 0) {
      await clickEn("#dzTabs > *:first-child", "la primera pestaña");
      await w(900);
      pasos.trasCambiarDePestana = await foto();
    }
  }

  ws.close();
  if (!esReal) { try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { } }

  /* ── el veredicto ─────────────────────────────────────────────────────── */
  const mal = (m, d) => { throw Error("A02 INCUMPLIDO: " + m + " :: " + JSON.stringify(d)); };
  const p = pasos;

  if (!p.arranque.dosDe) mal("LOW no abre en el estudio 2D", p.arranque);
  if (!p.nuevo.pestanas.length) mal("«Nuevo documento» clickeado de verdad no crea nada", p.nuevo);
  if (p.nuevo.invitacion) mal("la invitación queda tapando el documento nuevo", p.nuevo);
  if (!p.nuevo.pestanas[0] || p.nuevo.pestanas[0] === "undefined")
    mal("el documento nuevo no tiene identidad: su pestaña no tiene nombre", p.nuevo);

  if (p.enLaIA.dosDe) mal("el botón a IA no cambia de pantalla", p.enLaIA);
  if (!p.enLaIA.hayDoc) mal("ir a la IA CERRÓ el documento", p.enLaIA);
  if (p.enLaIA.pestanas.join("|") !== p.nuevo.pestanas.join("|"))
    mal("ir a la IA cambió las pestañas", { antes: p.nuevo.pestanas, despues: p.enLaIA.pestanas });

  if (!p.deVuelta.dosDe) mal("la pluma no devuelve al estudio", p.deVuelta);
  if (p.deVuelta.pestanas.join("|") !== p.nuevo.pestanas.join("|"))
    mal("volver del agente creó o perdió documentos", { antes: p.nuevo.pestanas, despues: p.deVuelta.pestanas });

  if (!p.enEl3D.tresDe) mal("el estudio 3D no se abre con su botón", p.enEl3D);

  if (p.salidaDelTresDe && p.salidaDelTresDe.error)
    mal("el estudio 3D no ofrece una salida clickeable, y la barra izquierda " +
      "queda tapada por su propio iframe: no habria manera de volver con el mouse",
      p.salidaDelTresDe);
  if (p.vueltaDesdeEl3D.tresDe)
    mal("«Volver» del estudio 3D no lo cierra", { salida: p.salidaDelTresDe, foto: p.vueltaDesdeEl3D });
  if (p.plumaConEl3DAbierto && p.plumaConEl3DAbierto.tresDe)
    mal("PEDIR VOLVER AL DIBUJO DEJA EL 3D TAPANDO LA MESA: #l3dView está en " +
      "z-index 62 y #designView en 61, así que el 3D queda encima. Mostrar el 2D " +
      "sin cerrar el 3D deja al dibujante pidiendo volver al dibujo y mirando " +
      "otra pantalla", p.plumaConEl3DAbierto);
  if (p.plumaConEl3DAbierto && !p.plumaConEl3DAbierto.dosDe)
    mal("volver al dibujo con el 3D abierto no muestra el 2D", p.plumaConEl3DAbierto);
  if (!p.vueltaDesdeEl3D.dosDe) mal("no se puede volver al dibujo desde el 3D", p.vueltaDesdeEl3D);
  if (p.vueltaDesdeEl3D.pestanas.join("|") !== p.nuevo.pestanas.join("|"))
    mal("el viaje al 3D y la vuelta perdieron o duplicaron documentos",
      { antes: p.nuevo.pestanas, despues: p.vueltaDesdeEl3D.pestanas });

  if (p.dosDocumentos) {
    if (p.dosDocumentos.pestanas.length < 2)
      mal("no se pudo abrir un segundo documento", p.dosDocumentos);
    const nombres = p.dosDocumentos.pestanas;
    if (new Set(nombres).size !== nombres.length)
      mal("dos documentos abiertos comparten identidad: sus pestañas se llaman igual", nombres);
    if (p.trasCambiarDePestana) {
      if (!p.trasCambiarDePestana.dosDe)
        mal("cambiar de pestaña saca del estudio", p.trasCambiarDePestana);
      if (p.trasCambiarDePestana.invitacion)
        mal("cambiar de pestaña deja la invitación tapando el documento", p.trasCambiarDePestana);
      if (p.trasCambiarDePestana.pestanas.length !== nombres.length)
        mal("cambiar de pestaña cambió la cantidad de documentos", p.trasCambiarDePestana);
    }
  }

  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));

  console.log("A02 OK" + (esReal ? " (app real)" : "") + " " + JSON.stringify({
    pestanas: p.nuevo.pestanas,
    ia: { salioDel2D: !p.enLaIA.dosDe, conservoElDoc: p.enLaIA.hayDoc },
    tresDe: { puertaEnElEstudio: p.barraTapada.hayPuertaEnElEstudio,
      barraIzquierdaDesdeEl2D: p.barraTapada.tresDeDesdeEl2D,
      abre: p.enEl3D.tresDe, cierraAlVolver: !p.vueltaDesdeEl3D.tresDe,
      laPlumaLoCierra: p.plumaConEl3DAbierto ? !p.plumaConEl3DAbierto.tresDe : "n/d" },
    documentos: p.dosDocumentos ? p.dosDocumentos.pestanas.length : "n/d",
  }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
