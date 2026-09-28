/* PUNTERIA DE LA SELECCION. CDP :9223 + mock :8791.

   Este recorrido existe por un reporte concreto: «cuando hay un elemento
   dentro de otro no selecciona precisamente donde estoy, debe seleccionar con
   mas precision y detectar el objeto que esta adelante en esa seleccion».

   La causa medida: el navegador acierta el impacto SOLO donde hay pintura. Una
   forma sin relleno no existe para el puntero en su interior, asi que el clic
   pasaba de largo hasta la forma de atras. Reproducido con un rectangulo chico
   SIN relleno encima de uno grande: clickeando el centro del chico se
   seleccionaba el grande, y elementsFromPoint no nombraba al chico en absoluto.

   Se comprueba lo que un dibujante espera: que gane lo que esta adelante en
   ese punto tenga relleno o no, que un elemento chico encima de uno grande se
   pueda agarrar, que el orden de pintado decida cuando dos se superponen, que
   una linea fina se pueda agarrar con algo de holgura, que el hueco de una
   forma NO la seleccione, que el papel siga dejando arrancar el marco de
   seleccion, y que el papel cebolla nunca se seleccione. */
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
    const r = await send("Runtime.evaluate", { expression: 'typeof dzHitTest==="function" && typeof dzPointerDown==="function" && !!api', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const errs=[];
    window.addEventListener("error", ev=>errs.push(String(ev.message)));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit(); await wait(500);
    LOW.workspace.workspaces.activate("drawing",dzWsAplicar); await wait(300);
    dzSetTool("select"); await wait(150);

    const lienzo=document.querySelector("#dzCanvas");
    const hoja=()=>lienzo.querySelector(":scope > svg");
    const NS="http://www.w3.org/2000/svg";
    const limpiar=()=>{ dzDeselect(); hoja().querySelectorAll("[data-prueba]").forEach(n=>n.remove()); };
    const poner=(tag,attrs)=>{ const n=document.createElementNS(NS,tag);
      n.setAttribute("data-prueba","1");
      for(const k in attrs) n.setAttribute(k,attrs[k]);
      hoja().appendChild(n); return n; };
    // el punto de pantalla que corresponde a un punto del dibujo
    const pantalla=(ux,uy)=>{ const p=hoja().createSVGPoint(); p.x=ux; p.y=uy;
      const m=hoja().getScreenCTM(); const s=p.matrixTransform(m);
      return {x:Math.round(s.x), y:Math.round(s.y)}; };
    // El evento se dispara sobre el elemento que el NAVEGADOR pone bajo el
    // punto, no sobre #dzCanvas: es lo que hace un clic de verdad, y es lo
    // unico que expone el defecto. Disparando sobre el lienzo, e.target es
    // siempre el lienzo y el codigo viejo arranca el marco de seleccion en vez
    // de elegir la forma equivocada — la prueba pasaria por el motivo errado.
    const bajoElPunto=(s)=>document.elementFromPoint(s.x,s.y)||lienzo;
    const clic=(ux,uy)=>{ const s=pantalla(ux,uy);
      bajoElPunto(s).dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,
        pointerId:1,pointerType:"mouse",isPrimary:true,button:0,buttons:1,
        clientX:s.x,clientY:s.y,pressure:.5}));
      document.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,cancelable:true,
        pointerId:1,pointerType:"mouse",isPrimary:true,button:0,buttons:0,
        clientX:s.x,clientY:s.y}));
      return s; };
    const sel=()=>DZ.sel?(DZ.sel.id||DZ.sel.tagName):null;

    // ── 1. EL REPORTE: un chico SIN RELLENO encima de uno grande relleno.
    //    El centro del chico tiene que dar el chico.
    limpiar();
    poner("rect",{id:"grande",x:100,y:100,width:900,height:600,fill:"#c33"});
    poner("rect",{id:"chico",x:400,y:300,width:140,height:140,fill:"none",
      stroke:"#111","stroke-width":2});
    await wait(200);
    const s1=pantalla(470,370);
    const pila=document.elementsFromPoint(s1.x,s1.y).map(n=>n.id||n.tagName).slice(0,4);
    const conGeometria=dzHitTest(s1.x,s1.y);
    clic(470,370); await wait(250);
    const sinRelleno={elegido:sel(), pilaDelNavegador:pila,
      hitTest:conGeometria?(conGeometria.id||conGeometria.tagName):null};

    // ── 2. el mismo chico, pero CON relleno: tambien tiene que ganar el de
    //    adelante (esto ya andaba; queda para que no se rompa al arreglar 1)
    limpiar();
    poner("rect",{id:"fondo",x:100,y:100,width:900,height:600,fill:"#c33"});
    poner("rect",{id:"encima",x:400,y:300,width:140,height:140,fill:"#39f"});
    await wait(200);
    clic(470,370); await wait(250);
    const conRelleno={elegido:sel()};

    // ── 3. ORDEN DE PINTADO: dos sin relleno que se cruzan. En la zona comun
    //    gana el ultimo, que es el que se ve adelante.
    limpiar();
    poner("rect",{id:"atras",x:200,y:200,width:300,height:300,fill:"none",stroke:"#111","stroke-width":2});
    poner("rect",{id:"adelante",x:350,y:350,width:300,height:300,fill:"none",stroke:"#111","stroke-width":2});
    await wait(200);
    clic(420,420); await wait(250);           // zona comun
    const enLaZonaComun=sel();
    clic(260,260); await wait(250);           // solo del de atras
    const soloDelDeAtras=sel();
    const ordenDePintado={enLaZonaComun, soloDelDeAtras};

    // ── 4. una LINEA FINA se agarra con algo de holgura, no al pixel
    limpiar();
    poner("line",{id:"raya",x1:200,y1:400,x2:800,y2:400,stroke:"#111","stroke-width":1});
    await wait(200);
    clic(500,400); await wait(250);
    const encima=sel();
    limpiar();
    poner("line",{id:"raya",x1:200,y1:400,x2:800,y2:400,stroke:"#111","stroke-width":1});
    await wait(200);
    const s4=pantalla(500,400);
    bajoElPunto({x:s4.x,y:s4.y+3}).dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,
      pointerId:1,pointerType:"mouse",isPrimary:true,button:0,buttons:1,
      clientX:s4.x,clientY:s4.y+3,pressure:.5}));
    document.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,cancelable:true,
      pointerId:1,pointerType:"mouse",isPrimary:true,button:0,buttons:0,
      clientX:s4.x,clientY:s4.y+3}));
    await wait(250);
    const conHolgura=sel();
    const linea={encima, conHolgura};

    // ── 5. el HUECO de una forma abierta NO la selecciona: el interior de una
    //    curva sin cerrar no es algo que uno sienta como "adentro"
    limpiar();
    poner("path",{id:"arco",d:"M 300 500 C 400 300 600 300 700 500",fill:"none",
      stroke:"#111","stroke-width":3});
    await wait(200);
    clic(500,430); await wait(250);           // dentro del arco, lejos del trazo
    const dentroDelArco=sel();
    clic(500,350); await wait(250);           // sobre el trazo (el punto medio de la curva)
    const sobreElArco=sel();
    const arcoAbierto={dentroDelArco, sobreElArco};

    // ── 6. el PAPEL sigue arrancando el marco de seleccion (no romper el
    //    arrastre de seleccion multiple al ganar precision)
    limpiar(); await wait(150);
    const caja=lienzo.getBoundingClientRect();
    const sPapel={x:Math.round(caja.left+12),y:Math.round(caja.top+caja.height-12)};
    bajoElPunto(sPapel).dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,
      pointerId:1,pointerType:"mouse",isPrimary:true,button:0,buttons:1,
      clientX:sPapel.x,clientY:sPapel.y,pressure:.5}));
    await wait(120);
    const hayMarco=!!document.querySelector(".dz-selbox");
    document.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,cancelable:true,
      pointerId:1,pointerType:"mouse",isPrimary:true,button:0,buttons:0,
      clientX:Math.round(caja.left+40),clientY:Math.round(caja.top+caja.height-40)}));
    await wait(250);
    const marco={hayMarco};

    // ── 7. el PAPEL CEBOLLA no se selecciona nunca, aunque quede adelante
    limpiar();
    poner("rect",{id:"dibujo",x:300,y:300,width:400,height:300,fill:"#39f"});
    const g=document.createElementNS(NS,"g");
    g.setAttribute("class","dz-onion"); g.setAttribute("data-prueba","1");
    const fantasma=document.createElementNS(NS,"rect");
    fantasma.setAttribute("x",250); fantasma.setAttribute("y",250);
    fantasma.setAttribute("width",600); fantasma.setAttribute("height",500);
    fantasma.setAttribute("fill","#0f08");
    g.appendChild(fantasma); hoja().appendChild(g);
    await wait(200);
    clic(500,450); await wait(250);
    const cebolla={elegido:sel()};

    limpiar();
    // Generated brush stamps remain one object, including inside art layers.
    limpiar();
    const layer=poner('g',{'data-low-art':'line'});
    const outer=document.createElementNS(NS,'g');outer.setAttribute('data-low','forma-pincel');layer.appendChild(outer);
    const brush=document.createElementNS(NS,'g');brush.setAttribute('data-low','raster-brush');outer.appendChild(brush);
    const dab=document.createElementNS(NS,'circle');dab.setAttribute('cx','150');dab.setAttribute('cy','150');dab.setAttribute('r','12');brush.appendChild(dab);
    const touch=pantalla(150,150);
    if(dzHitTest(touch.x,touch.y)!==outer)throw Error('Hit selecciona una marca interna');
    dzSetTool('direct');dzSelect(dab);
    if(DZ.sel!==outer)throw Error('Flecha blanca desprende una marca de pincel');
    outer.replaceWith(brush);dzSelect(dab);
    if(DZ.sel!==brush)throw Error('Trazo suelto se desarma en círculos');

    return {sinRelleno,conRelleno,ordenDePintado,linea,arcoAbierto,marco,cebolla,
      errs:errs.slice(0,3)};
  })()`;

  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const v = result.result?.value;
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  // El reporte. Esta es la asercion que falla con el codigo viejo.
  if (v?.sinRelleno?.hitTest !== "chico")
    mal("dzHitTest no encuentra la forma SIN RELLENO que esta adelante", v?.sinRelleno);
  if (v.sinRelleno.elegido !== "chico")
    mal("el clic dentro de una forma sin relleno selecciona la de atras", v.sinRelleno);

  if (v.conRelleno.elegido !== "encima")
    mal("el clic sobre una forma rellena de adelante selecciona la de atras", v.conRelleno);

  if (v.ordenDePintado.enLaZonaComun !== "adelante")
    mal("en la zona comun no gana el que esta adelante", v.ordenDePintado);
  if (v.ordenDePintado.soloDelDeAtras !== "atras")
    mal("la zona propia del de atras no lo selecciona", v.ordenDePintado);

  if (v.linea.encima !== "raya")
    mal("no se puede agarrar una linea clickeando encima", v.linea);
  if (v.linea.conHolgura !== "raya")
    mal("una linea fina exige acertarle al pixel exacto", v.linea);

  if (v.arcoAbierto.sobreElArco !== "arco")
    mal("no se puede agarrar una curva por su trazo", v.arcoAbierto);
  if (v.arcoAbierto.dentroDelArco === "arco")
    mal("el hueco de una curva abierta la selecciona: tiene que contar solo el trazo",
      v.arcoAbierto);

  if (!v.marco.hayMarco)
    mal("el clic en el papel ya no arranca el marco de seleccion", v.marco);

  if (v.cebolla.elegido === null || v.cebolla.elegido === "rect")
    mal("el papel cebolla se puede seleccionar", v.cebolla);
  if (v.cebolla.elegido !== "dibujo")
    mal("con papel cebolla encima no se selecciona el dibujo de abajo", v.cebolla);

  if (v.errs?.length) throw Error("REGRESIÓN: excepciones al seleccionar: " + v.errs.join(" | "));

  console.log("E2E punteria OK", JSON.stringify(v));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
