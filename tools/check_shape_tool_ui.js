/* Formas dibujadas ARRASTRANDO, como en Illustrator. CDP :9223 + mock :8791.

   Este recorrido existe por un reporte concreto: «la herramienta de formas no
   esta funcionando». No estaba roto el codigo — elegir una forma la plantaba en
   el CENTRO DEL LIENZO con tamaño fijo, y con la mesa paneada al 32 % de zoom
   eso cae fuera de la pantalla: uno clickea, no aparece nada donde tiene los
   ojos, y la herramienta parece muerta.

   Se comprueba lo que un dibujante espera: que elegir la forma no plante nada,
   que el arrastre la dibuje y la haga crecer, que Shift la deje proporcionada y
   Alt la abra desde el centro, que un clic simple la deje DONDE SE CLICKEO y no
   en el centro, que Escape no deje nada a medias y que entre al historial como
   un solo paso. */
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
    const r = await send("Runtime.evaluate", { expression: 'typeof dzFormaElegir==="function" && !!api', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const errs=[];
    window.addEventListener("error", ev=>errs.push(String(ev.message)));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit(); await wait(500);
    LOW.workspace.workspaces.activate("drawing",dzWsAplicar); await wait(300);

    const lienzo=document.querySelector("#dzCanvas");
    const hoja=()=>lienzo.querySelector(":scope > svg");
    const limpiar=()=>{ hoja().innerHTML=""; };
    const caja=lienzo.getBoundingClientRect();
    const X=(f)=>Math.round(caja.left+caja.width*f), Y=(f)=>Math.round(caja.top+caja.height*f);
    const pt=(t,x,y,shift,alt)=>lienzo.dispatchEvent(new PointerEvent(t,{bubbles:true,
      cancelable:true,pointerId:1,pointerType:"mouse",isPrimary:true,
      button:t==="pointerdown"?0:-1,buttons:t==="pointerup"?0:1,
      clientX:x,clientY:y,pressure:.5,shiftKey:!!shift,altKey:!!alt}));
    const uno=(sel)=>hoja().querySelector(sel);

    // 1. elegir una forma ARMA la herramienta y no dibuja nada
    limpiar(); dzFormaElegir("rect"); await wait(250);
    const armado={herramienta:DZ.tool, dibujoAlgo:!!uno("rect"),
      dice:(document.querySelector("#sbHint")||{}).textContent||""};

    // 2. el arrastre la dibuja y la hace crecer
    pt("pointerdown",X(.2),Y(.2)); await wait(70);
    const alEmpezar=uno("rect")?+uno("rect").getAttribute("width"):-1;
    pt("pointermove",X(.32),Y(.34)); await wait(70);
    const aMitad=uno("rect")?+uno("rect").getAttribute("width"):-1;
    pt("pointermove",X(.5),Y(.6)); await wait(70);
    const antesDeSoltar=uno("rect")?+uno("rect").getAttribute("width"):-1;
    pt("pointerup",X(.5),Y(.6)); await wait(500);
    const r1=uno("rect");
    const arrastre={aparecio:alEmpezar>=0, crecio:antesDeSoltar>aMitad && aMitad>0,
      w:r1?Math.round(+r1.getAttribute("width")):0,
      h:r1?Math.round(+r1.getAttribute("height")):0,
      seleccion:DZ.sel?DZ.sel.tagName:null,
      dice:(document.querySelector("#sbHint")||{}).textContent||""};

    // 3. Shift deja la forma PROPORCIONADA
    limpiar(); dzFormaElegir("rect"); await wait(200);
    pt("pointerdown",X(.2),Y(.2));
    pt("pointermove",X(.45),Y(.28),true); await wait(70);
    pt("pointerup",X(.45),Y(.28),true); await wait(400);
    const r2=uno("rect");
    const conShift=r2?{w:Math.round(+r2.getAttribute("width")),
      h:Math.round(+r2.getAttribute("height"))}:null;

    // 4. Alt la abre DESDE EL CENTRO: el ancla queda en el medio
    limpiar(); dzFormaElegir("circle"); await wait(200);
    const ax=X(.4), ay=Y(.45), ancla=dzToUser(ax,ay);
    pt("pointerdown",ax,ay);
    pt("pointermove",X(.5),Y(.6),false,true); await wait(70);
    pt("pointerup",X(.5),Y(.6),false,true); await wait(400);
    const c1=uno("circle");
    const conAlt=c1?{centroEnElAncla:Math.abs(+c1.getAttribute("cx")-ancla.x)<3,
      r:Math.round(+c1.getAttribute("r"))}:null;

    // 5. un clic simple la deja DONDE SE CLICKEO, no en el centro del lienzo.
    //    Esto es el reporte original: con la mesa paneada, el centro no se ve.
    limpiar(); dzFormaElegir("rect"); await wait(200);
    const cx=X(.78), cy=Y(.78), donde=dzToUser(cx,cy);
    pt("pointerdown",cx,cy); pt("pointerup",cx,cy); await wait(500);
    const r3=uno("rect"); const vb=dzVB();
    const clicSimple=r3?{
      cercaDelClic:Math.abs(+r3.getAttribute("x")-donde.x)<6,
      lejosDelCentro:Math.abs(+r3.getAttribute("x")-(vb[0]+vb[2]/2))>40,
      tieneTamano:+r3.getAttribute("width")>10}:null;

    // 6. un solo paso de historial, y Ctrl+Z la saca
    limpiar(); dzFormaElegir("ellipse"); await wait(200);
    const pasosAntes=DZ.history?DZ.history.undoStack.length:0;
    pt("pointerdown",X(.25),Y(.25));
    pt("pointermove",X(.45),Y(.45)); pt("pointerup",X(.45),Y(.45)); await wait(500);
    const hayElipse=!!uno("ellipse");
    dzUndo(); await wait(500);
    const historial={hayElipse, trasUndo:!!uno("ellipse")};

    // 7. Escape a mitad del gesto no deja nada a medias
    limpiar(); dzFormaElegir("star"); await wait(200);
    pt("pointerdown",X(.3),Y(.3)); pt("pointermove",X(.5),Y(.5)); await wait(80);
    const durante=!!uno("polygon");
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
    await wait(500);
    const escape={habiaDurante:durante, quedaAlgo:!!uno("polygon"),
      dice:(document.querySelector("#sbHint")||{}).textContent||""};

    // 8. cambiar de herramienta a mitad del gesto tambien cancela
    limpiar(); dzFormaElegir("rect"); await wait(200);
    pt("pointerdown",X(.3),Y(.3)); pt("pointermove",X(.5),Y(.5)); await wait(80);
    dzSetTool("pencil"); await wait(400);
    const cambioHerramienta={quedaAlgo:!!uno("rect"), herramienta:DZ.tool};

    // 9. LA FORMA NACE SOLO CON CONTORNO. Pedido de Mauro: «actualmente dibuja
    //    rellenos rojos». Antes salia un bloque macizo con fill y NINGUN
    //    stroke, que en una mesa de animacion es al revés de lo que se
    //    necesita: primero la linea, el relleno despues si viene.
    limpiar(); DZ.formaRelleno=false; dzFormaElegir("rect"); await wait(200);
    pt("pointerdown",X(.2),Y(.2)); await wait(60);
    pt("pointermove",X(.45),Y(.5)); await wait(60);
    pt("pointerup",X(.45),Y(.5)); await wait(400);
    const rc=uno("rect");
    const contorno = rc ? {fill:rc.getAttribute("fill"), stroke:rc.getAttribute("stroke"),
      grosor:+(rc.getAttribute("stroke-width")||0),
      w:Math.round(+rc.getAttribute("width")||0)} : null;

    // 10. y la casilla del menu la hace nacer rellena, sin perder el contorno
    const casilla=document.querySelector("#dzFormaRelleno");
    let rellena=null;
    if (casilla) {
      limpiar(); casilla.checked=true; casilla.onchange();
      dzFormaElegir("ellipse"); await wait(200);
      pt("pointerdown",X(.25),Y(.25)); await wait(60);
      pt("pointermove",X(.5),Y(.5)); await wait(60);
      pt("pointerup",X(.5),Y(.5)); await wait(400);
      const el=uno("ellipse");
      rellena = el ? {fill:el.getAttribute("fill"), stroke:el.getAttribute("stroke")} : null;
      casilla.checked=false; casilla.onchange();
    }
    const interruptor={hayCasilla:!!casilla, rellena,
      recuerda:(()=>{try{return localStorage.getItem("low.forma.relleno")}catch(e){return "sin ls"}})()};

    // 11. EL CONTORNO CON PINCEL. Pedido de Mauro: «que se le pueda poner un
    //     pincel como forma de la linea de contorno». Un stroke de SVG es una
    //     linea de grosor constante y sin caracter; el pincel tiene punta,
    //     presion y dureza. Se comprueba en el mismo montaje que el paso 6, que
    //     es el que sabe medir «un solo paso de historial».
    // OJO CON EL MONTAJE: limpiar() vacía el DOM pero NO el modelo, y el
    // modelo tiene su propio historial. Sin sincronizarlo, el Ctrl+Z de acá
    // restaura el contenido del paso ANTERIOR —que trae su propia elipse— y la
    // aserción culpa al código nuevo por una elipse que no es la suya. Me pasó:
    // «tag no es identidad», la misma trampa de siempre.
    limpiar(); dzMarkDirty(); await wait(600);
    DZ.formaRelleno=false;
    const cp=document.querySelector("#dzFormaPincel");
    let entintado=null;
    if (cp) {
      cp.checked=true; cp.onchange();
      dzFormaElegir("ellipse"); await wait(200);
      pt("pointerdown",X(.25),Y(.25));
      pt("pointermove",X(.5),Y(.55)); await wait(70);
      pt("pointerup",X(.5),Y(.55)); await wait(600);
      const g=uno('[data-low="forma-pincel"]');
      let sup=null;
      try { const bb=g&&g.getBBox(); if(bb) sup={w:Math.round(bb.width),h:Math.round(bb.height)}; } catch(e){}
      entintado={
        hayGrupo:!!g,
        guardaGeometria: !!(g && (g.getAttribute("data-d")||"").length>10),
        guardaPincelYGrosor: !!(g && g.getAttribute("data-grosor")),
        // la tinta es un hijo con rol de contorno, no un stroke del elemento
        contornos: g ? [...g.children].filter(h=>h.getAttribute("data-rol")==="contorno").length : 0,
        sinStrokePelado: !!(g && !g.getAttribute("stroke")),
        superficie: sup,
        seleccionado: !!(g && DZ.sel===g),
        dice:(document.querySelector("#sbHint")||{}).textContent||""
      };
      // un Ctrl+Z tiene que sacar la forma entintada COMPLETA, no dejar la
      // forma pelada atrás: entintar es parte de cómo nace, no una edición aparte
      dzUndo(); await wait(600);
      entintado.trasUndoGrupo = !!uno('[data-low="forma-pincel"]');
      entintado.trasUndoPelada = !!uno("ellipse");
      cp.checked=false; cp.onchange();
    }

    // 12. y entintar algo que YA está dibujado, por el botón
    limpiar(); dzMarkDirty(); await wait(600);
    DZ.formaRelleno=false; dzFormaElegir("rect"); await wait(200);
    pt("pointerdown",X(.3),Y(.3));
    pt("pointermove",X(.55),Y(.55)); await wait(70);
    pt("pointerup",X(.55),Y(.55)); await wait(450);
    const boton=document.querySelector("#dzFormaEntintar");
    let aMano=null;
    if (boton) {
      const antes=!!uno("rect");
      boton.click(); await wait(600);
      const g=uno('[data-low="forma-pincel"]');
      aMano={habiaForma:antes, hayGrupo:!!g, sigueLaForma:!!uno("rect"),
        conserva: g ? g.getAttribute("data-forma") : null};
      dzUndo(); await wait(600);
      aMano.undoDevuelveLaForma = !!uno("rect") && !uno('[data-low="forma-pincel"]');
    }

    // An already-created brush shape can change appearance without changing geometry.
    const raw=uno('rect');raw.id='editable-shape';raw.setAttribute('transform','translate(12 8)');
    dzSelect(raw);dzFormaPincelSeleccion();await wait(400);
    let editable=uno('#editable-shape');
    if(!editable||!document.querySelector('#dzShapeBrush'))throw Error('No inspector editable de forma');
    const geometry=editable.getAttribute('data-d'),transform=editable.getAttribute('transform'),beforeInk=editable.innerHTML;
    const previousBrush=editable.getAttribute('data-pincel');
    const other=LOW.drawing.brushes.all().find(b=>b.id!==previousBrush);
    const undoBefore=DZ.history.undoStack.length;
    const choice=document.querySelector('#dzShapeBrush');choice.value=other.id;choice.dispatchEvent(new Event('change',{bubbles:true}));await wait(400);
    if(editable.getAttribute('data-pincel')!==other.id||editable.innerHTML===beforeInk)throw Error('Cambiar pincel no cambia tinta');
    if(editable.getAttribute('data-d')!==geometry||editable.getAttribute('transform')!==transform||editable.getAttribute('data-relleno')!=='none')throw Error('Cambiar pincel altera forma, posición o relleno');
    if(DZ.history.undoStack.length!==undoBefore+1)throw Error('Cambiar pincel no deja un solo Undo');
    dzUndo();await wait(300);editable=uno('#editable-shape');
    if(editable.getAttribute('data-pincel')!==previousBrush)throw Error('Undo no restaura pincel');
    dzRedo();await wait(300);editable=uno('#editable-shape');dzSelect(editable);
    const size=document.querySelector('#dzShapeBrushSize');size.value='18';size.dispatchEvent(new Event('change',{bubbles:true}));await wait(400);
    if(editable.getAttribute('data-grosor')!=='18'||editable.getAttribute('data-d')!==geometry)throw Error('No edita grosor');
    const saved=LOW.animation.LowDoc.fromJSON(JSON.parse(JSON.stringify(DZ.doc.toJSON())));
    if(!JSON.stringify(saved.toJSON()).includes('data-pincel-config'))throw Error('No persiste definición del pincel');
    dzSetTool('direct');dzSelect(editable);dzPositionHandle();
    if(!dzCornerInfo(editable)||![...document.querySelectorAll('.dz-corner-widget')].some(w=>!w.hidden))throw Error('Flecha blanca sin redondeadores');
    dzCornerSet(editable,20,'tl',false);
    if(editable.getAttribute('data-d')===geometry||editable.getAttribute('data-pincel')!==other.id)throw Error('Redondear no cambia geometría o cambia pincel');
    // A legacy persisted fill preference must not turn fill on at startup.
    document.querySelector('#dzShapeMenu').querySelectorAll('.dz-forma-relleno,.dz-forma-entintar').forEach(n=>n.remove());
    localStorage.setItem('low.forma.relleno','1');dzFormaRellenoUI();
    if(dzFormaRellena()||dzFormaCrear('rect').getAttribute('fill')!=='none')throw Error('Default de forma vuelve a tener relleno');

    return {armado,arrastre,conShift,conAlt,clicSimple,historial,escape,
      cambioHerramienta,contorno,interruptor,entintado,aMano,errs:errs.slice(0,3)};
  })()`;

  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const v = result.result?.value;
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  if (v?.armado?.herramienta !== "shape")
    mal("elegir una forma no arma la herramienta", v?.armado);
  if (v.armado.dibujoAlgo)
    mal("elegir una forma la planta sola: tiene que esperar el arrastre", v.armado);
  if (!/arrastr/.test(v.armado.dice))
    mal("no se le dice al dibujante que hay que arrastrar", v.armado);

  if (!v.arrastre.aparecio) mal("el arrastre no dibuja la forma", v.arrastre);
  if (!v.arrastre.crecio) mal("la forma no crece con el arrastre", v.arrastre);
  if (v.arrastre.w < 50 || v.arrastre.h < 50)
    mal("la forma no quedó del tamaño del gesto", v.arrastre);
  if (v.arrastre.seleccion !== "rect")
    mal("la forma recién dibujada no queda seleccionada", v.arrastre);
  if (!/\d+ × \d+/.test(v.arrastre.dice))
    mal("no informa la medida de lo que se dibujó", v.arrastre);

  if (!v.conShift || Math.abs(v.conShift.w - v.conShift.h) > 2)
    mal("Shift no deja la forma proporcionada", v.conShift);

  if (!v.conAlt || !v.conAlt.centroEnElAncla)
    mal("Alt no abre la forma desde el centro", v.conAlt);

  if (!v.clicSimple) mal("un clic simple no deja ninguna forma", v.clicSimple);
  if (!v.clicSimple.cercaDelClic)
    mal("un clic simple no deja la forma donde se clickeó", v.clicSimple);
  if (!v.clicSimple.lejosDelCentro)
    mal("la forma volvió a plantarse en el centro del lienzo: con la mesa paneada no se ve",
      v.clicSimple);
  if (!v.clicSimple.tieneTamano) mal("el clic simple deja una forma sin tamaño", v.clicSimple);

  const c = v.contorno;
  if (!c) mal("la forma del gesto de contorno no se dibujó", v.contorno);
  if (c.fill !== "none")
    mal("la forma nace RELLENA: el pedido es que nazca sólo con contorno, que es " +
      "como se dibuja en una mesa de animación — la línea primero y el relleno " +
      "después, si viene", c);
  if (!c.stroke || c.stroke === "none")
    mal("la forma nace sin contorno: sin relleno Y sin trazo no se ve nada, que es " +
      "peor que el bloque rojo", c);
  if (!(c.grosor > 0)) mal("el contorno de la forma no tiene grosor", c);
  if (!(c.w > 50)) mal("el gesto de esta comprobación no dibujó una forma medible", c);

  if (!v.interruptor.hayCasilla)
    mal("no hay manera de pedir una forma rellena: el interruptor «Rellenar» del " +
      "menú de formas desapareció", v.interruptor);
  if (!v.interruptor.rellena || v.interruptor.rellena.fill === "none")
    mal("con «Rellenar» tildado la forma sigue naciendo sin relleno", v.interruptor);
  if (!v.interruptor.rellena.stroke || v.interruptor.rellena.stroke === "none")
    mal("una forma rellena perdió el contorno: relleno Y contorno, no uno u otro",
      v.interruptor);

  const e = v.entintado;
  if (!e) mal("no existe el interruptor «Contorno con pincel»", v.entintado);
  if (!e.hayGrupo)
    mal("con «Contorno con pincel» tildado la forma sale igual que antes: el " +
      "contorno tiene que dibujarse con el pincel, no con un trazo de grosor " +
      "constante", e);
  if (!e.guardaGeometria)
    mal("la forma entintada no guarda su geometría: los hijos son un render, y sin " +
      "el dato no se puede deformar ni volver a entintar", e);
  if (!e.guardaPincelYGrosor)
    mal("la forma entintada no guarda su pincel y su grosor: al re-dibujarla " +
      "tomaría el pincel que esté elegido en ese momento, así que deformarla le " +
      "cambiaría el trazo", e);
  if (!e.contornos)
    mal("la forma entintada no tiene ni un tramo de contorno dibujado", e);
  if (!e.superficie || e.superficie.w < 40 || e.superficie.h < 40)
    mal("el contorno entintado no tiene superficie: quedó un grupo vacío", e);
  if (!e.seleccionado)
    mal("la forma entintada no queda seleccionada, así que no se la puede seguir " +
      "trabajando", e);
  if (e.trasUndoGrupo || e.trasUndoPelada)
    mal("Ctrl+Z no saca la forma entintada de una: entintar es parte de cómo nace " +
      "la forma, no una edición aparte, así que no puede quedar la forma pelada " +
      "en la mesa", e);

  if (!v.aMano) mal("no hay botón para entintar lo que ya está dibujado", v.aMano);
  if (!v.aMano.hayGrupo || v.aMano.sigueLaForma)
    mal("«Entintar la selección» no convierte la forma seleccionada", v.aMano);
  if (v.aMano.conserva !== "rect")
    mal("al entintar se pierde qué forma era: sin eso no se la puede volver a " +
      "editar como forma", v.aMano);
  if (!v.aMano.undoDevuelveLaForma)
    mal("Ctrl+Z no devuelve la forma sin entintar: entintar a mano SÍ es una " +
      "edición aparte y tiene que poder desandarse sola", v.aMano);

  if (!v.historial.hayElipse) mal("el gesto no dejó la elipse", v.historial);
  if (v.historial.trasUndo) mal("Ctrl+Z no saca la forma de una", v.historial);

  if (!v.escape.habiaDurante) mal("la forma no se previsualiza durante el gesto", v.escape);
  if (v.escape.quedaAlgo) mal("Escape deja la forma a medias", v.escape);
  if (!/cancel/i.test(v.escape.dice)) mal("Escape no avisa que canceló", v.escape);

  if (v.cambioHerramienta.quedaAlgo)
    mal("cambiar de herramienta a mitad del gesto deja la forma a medias", v.cambioHerramienta);

  if (v.errs?.length) throw Error("REGRESIÓN: excepciones con la herramienta de formas: " + v.errs.join(" | "));

  console.log("E2E formas OK", JSON.stringify({ arrastre: v.arrastre.w + "x" + v.arrastre.h,
    dice: v.arrastre.dice, shift: v.conShift, alt: v.conAlt, clic: v.clicSimple,
    historial: v.historial, escape: v.escape.dice }));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
