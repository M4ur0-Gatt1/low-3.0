/* EDICION VECTORIAL: nodos y contornos. CDP :9223 + mock :8791.

   El balance decia que Vector estaba frenado porque «la edicion de nodos y
   contornos casi no tiene pruebas propias». Era literal: de dzPathParse,
   dzPathBuild, dzNodesFor, dzNodeMove y dzNodeDelete no habia NINGUNA prueba.
   Lo unico que se comprobaba era que el boton de la herramienta existiera en
   la barra, que es presencia, no conducta.

   Esto prueba conducta, y sobre todo las dos cosas que un dibujante nota
   enseguida cuando se rompen:

   - que mover un punto mueva ESE punto y no deforme el resto del trazado;
   - que borrar puntos no deje un trazado degenerado ni le coma el arranque.

   Y las de formato, que son las que se rompen en silencio: un trazado escrito
   con comandos relativos, o con H y V, o con la L implicita despues de una M,
   tiene que leerse igual que uno escrito largo. Si el analizador se equivoca
   ahi, el primer arrastre reescribe el trazado entero y el dibujo se deforma
   sin que nadie toque nada mas. */
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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 180000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 60; i++) {
    const r = await send("Runtime.evaluate", { expression: 'typeof dzNodesShow==="function" && typeof dzPathParse==="function" && !!api', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const errs=[]; window.addEventListener("error", ev=>errs.push(String(ev.message)));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit(); await wait(600);
    LOW.workspace.workspaces.activate("drawing",dzWsAplicar); await wait(300);
    dzSetTool("nodes"); await wait(150);

    const lienzo=document.querySelector("#dzCanvas"), hoja=()=>lienzo.querySelector(":scope > svg");
    const NS="http://www.w3.org/2000/svg";
    const limpiar=()=>{ dzNodesClear(); hoja().querySelectorAll("[data-prueba]").forEach(n=>n.remove()); };
    const poner=(tag,attrs)=>{ const n=document.createElementNS(NS,tag); n.setAttribute("data-prueba","1");
      for(const k in attrs) n.setAttribute(k,attrs[k]); hoja().appendChild(n); return n; };
    const nodos=()=>[...lienzo.querySelectorAll(".dz-node")];
    const pantalla=(ux,uy)=>{ const p=hoja().createSVGPoint(); p.x=ux; p.y=uy;
      const s=p.matrixTransform(hoja().getScreenCTM()); return {x:Math.round(s.x),y:Math.round(s.y)}; };

    // ── 1. FORMATO. Cuatro maneras de escribir el MISMO trazado tienen que
    //    leerse igual. Si no, el primer arrastre reescribe todo y deforma.
    const formas={
      largo:   dzPathParse("M 100 100 L 200 100 L 200 200 Z"),
      relativo:dzPathParse("m 100 100 l 100 0 l 0 100 z"),
      hv:      dzPathParse("M 100 100 H 200 V 200 Z"),
      implicito:dzPathParse("M 100 100 200 100 200 200 Z"),
    };
    const texto=(c)=>c?dzPathBuild(c):null;
    const formato={largo:texto(formas.largo), relativo:texto(formas.relativo),
      hv:texto(formas.hv), implicito:texto(formas.implicito),
      basura:dzPathParse("M totalmente basura")};

    // ── 2. ANCLAS. Un trazado con curvas expone un ancla por comando.
    limpiar();
    const p1=poner("path",{id:"curva",d:"M 200 400 C 300 200 500 200 600 400 L 800 400",
      fill:"none",stroke:"#111","stroke-width":3});
    dzNodesShow(p1); await wait(200);
    const anclas={cuantas:nodos().length, dice:(document.querySelector("#sbHint")||{}).textContent||""};

    // ── 3. MOVER un punto mueve ESE punto. Se arrastra el ultimo (el de la L),
    //    y se exige que el arranque del trazado NO se haya movido.
    const dAntes=p1.getAttribute("d");
    const ultimo=nodos()[nodos().length-1];
    const desde=pantalla(800,400), hasta=pantalla(800,520);
    ultimo.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerId:3,
      pointerType:"mouse",isPrimary:true,button:0,buttons:1,clientX:desde.x,clientY:desde.y}));
    document.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,pointerId:3,
      clientX:hasta.x,clientY:hasta.y,buttons:1})); await wait(90);
    document.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,pointerId:3,
      clientX:hasta.x,clientY:hasta.y,buttons:0})); await wait(320);
    const cmds=dzPathParse(p1.getAttribute("d"));
    const mover={cambio:p1.getAttribute("d")!==dAntes,
      arranque:cmds?[cmds[0].n[0],cmds[0].n[1]]:null,
      finalY:cmds?Math.round(cmds[cmds.length-1].n[cmds[cmds.length-1].n.length-1]):null,
      comandos:cmds?cmds.map(s=>s.c).join(""):null};

    // ── 4. UNDO devuelve el trazado como estaba.
    // Ojo: dzUndo REEMPLAZA la hoja entera, asi que la referencia vieja queda
    // colgada y leerla devuelve el atributo del elemento que ya no esta puesto.
    // Se vuelve a consultar por id.
    dzUndo(); await wait(350);
    const p1b=hoja().querySelector("#curva");
    const trasUndo={existe:!!p1b, d:!!p1b&&p1b.getAttribute("d")===dAntes};

    // ── 5. BORRAR un punto con doble clic, y que NO deje un trazado degenerado.
    limpiar();
    const p2=poner("path",{id:"linea4",d:"M 100 500 L 300 450 L 500 550 L 700 500",
      fill:"none",stroke:"#111","stroke-width":3});
    dzNodesShow(p2); await wait(200);
    const antesBorrar=nodos().length;
    nodos()[2].dispatchEvent(new MouseEvent("dblclick",{bubbles:true,cancelable:true}));
    await wait(300);
    const unoMenos={antes:antesBorrar, ahora:nodos().length,
      comandos:(dzPathParse(p2.getAttribute("d"))||[]).map(s=>s.c).join("")};
    // hasta quedar en dos: de ahi no baja
    for(let i=0;i<6;i++){ const ns=nodos(); if(!ns.length) break;
      ns[ns.length-1].dispatchEvent(new MouseEvent("dblclick",{bubbles:true,cancelable:true}));
      await wait(160); }
    const piso={anclas:nodos().length,
      comandos:(dzPathParse(p2.getAttribute("d"))||[]).map(s=>s.c).join(""),
      dibuja:(()=>{ try{ const b=p2.getBBox(); return b.width>0||b.height>0; }catch(_){ return false; } })()};

    // ── 6. BORRAR EL ARRANQUE no puede dejar el trazado sin M.
    limpiar();
    const p3=poner("path",{id:"conM",d:"M 100 600 L 300 600 L 500 650 L 700 600",
      fill:"none",stroke:"#111","stroke-width":3});
    dzNodesShow(p3); await wait(200);
    nodos()[0].dispatchEvent(new MouseEvent("dblclick",{bubbles:true,cancelable:true}));
    await wait(300);
    const cmds3=dzPathParse(p3.getAttribute("d"))||[];
    const arranque={primerComando:cmds3[0]?cmds3[0].c:null, d:p3.getAttribute("d"),
      empiezaEn:cmds3[0]?[cmds3[0].n[0],cmds3[0].n[1]]:null};

    // ── 7. POLIGONO: mover y borrar, con piso de tres puntos.
    limpiar();
    const pg=poner("polygon",{id:"tri",points:"200 700 400 700 300 850",fill:"#39f"});
    dzNodesShow(pg); await wait(200);
    const pgAnclas=nodos().length;
    nodos()[0].dispatchEvent(new MouseEvent("dblclick",{bubbles:true,cancelable:true}));
    await wait(250);
    const poligono={anclas:pgAnclas, trasBorrar:(pg.getAttribute("points")||"").trim().split(/[\\s,]+/).length/2};

    // ── 8. LINEA: dos anclas, y sus puntos NO se borran.
    limpiar();
    const ln=poner("line",{id:"seg",x1:200,y1:900,x2:600,y2:900,stroke:"#111","stroke-width":3});
    dzNodesShow(ln); await wait(200);
    const lnAnclas=nodos().length;
    nodos()[0].dispatchEvent(new MouseEvent("dblclick",{bubbles:true,cancelable:true}));
    await wait(250);
    const linea={anclas:lnAnclas, siguenDos:nodos().length,
      sigueEntera:!!(ln.getAttribute("x1")&&ln.getAttribute("x2"))};

    // ── 9. Un elemento SIN nodos editables lo dice, no se queda mudo.
    limpiar();
    const re=poner("rect",{id:"caja",x:200,y:950,width:200,height:100,fill:"#c33"});
    dzNodesShow(re); await wait(200);
    const sinNodos={anclas:nodos().length,
      dice:(document.querySelector("#sbHint")||{}).textContent||""};

    // ── 10. La herramienta encuentra un trazado SIN RELLENO por adentro:
    //     misma punteria que la seleccion (ver drawing/hit-test.js).
    limpiar();
    poner("rect",{id:"fondo",x:150,y:150,width:800,height:500,fill:"#c33"});
    const p4=poner("path",{id:"vacio",d:"M 400 300 L 600 300 L 600 500 L 400 500 Z",
      fill:"none",stroke:"#111","stroke-width":2});
    await wait(200);
    const s10=pantalla(500,400);
    dzNodesClick({clientX:s10.x, clientY:s10.y});
    await wait(250);
    const sinRelleno={elegido:DZ.nodeEl?DZ.nodeEl.id:null, anclas:nodos().length};

    // -- 11. UN GESTO, UN PASO, sobre un trazo que vive en el DOCUMENTO.
    //    Medido antes del arreglo: mover un punto dejaba DOS pasos de historial
    //    y hacian falta DOS Ctrl+Z para volver, el primero de los cuales no se
    //    veia. Se dibuja con el lapiz para que el trazo pase por el documento,
    //    que es donde estaba el paso de mas.
    limpiar();
    dzSetTool("pencil"); await wait(150);
    const cajaL=lienzo.getBoundingClientRect();
    const lx=Math.round(cajaL.left+cajaL.width*.25), ly=Math.round(cajaL.top+cajaL.height*.45);
    const lapiz=(t,x,y)=>lienzo.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,
      pointerId:1,pointerType:"pen",isPrimary:true,button:t==="pointerdown"?0:-1,
      buttons:t==="pointerup"?0:1,clientX:x,clientY:y,pressure:.6}));
    lapiz("pointerdown",lx,ly);
    for(let i=1;i<=10;i++){ lapiz("pointermove",lx+i*22,ly+Math.round(Math.sin(i/2)*20)); await wait(13); }
    lapiz("pointerup",lx+220,ly); await wait(700);
    const dibujado=[...hoja().querySelectorAll("path")].pop();
    dibujado.id="trazoReal";
    const dReal=dibujado.getAttribute("d");
    dzSetTool("nodes"); await wait(130); dzNodesShow(dibujado); await wait(250);
    const pila0=DZ.history.undoStack.length;
    const medio=nodos()[Math.floor(nodos().length/2)];
    const rr=medio.getBoundingClientRect();
    const mx=Math.round(rr.x+rr.width/2), my=Math.round(rr.y+rr.height/2);
    medio.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerId:5,
      pointerType:"mouse",isPrimary:true,button:0,buttons:1,clientX:mx,clientY:my}));
    document.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,pointerId:5,
      clientX:mx,clientY:my+70,buttons:1})); await wait(90);
    document.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,pointerId:5,
      clientX:mx,clientY:my+70,buttons:0})); await wait(750);
    const leer=()=>{ const t=hoja().querySelector("#trazoReal"); return t?t.getAttribute("d"):null; };
    const dMovido=leer();
    const pasos=DZ.history.undoStack.length-pila0;
    const etiqueta=(DZ.history.undoStack[DZ.history.undoStack.length-1]||{}).label||"";
    let vueltas=0, d=dMovido;
    for(let i=0;i<4 && d!==dReal; i++){ dzUndo(); await wait(430); vueltas++; d=leer(); }
    const unPaso={pasos, movio:dMovido!==dReal, ctrlZ:vueltas, volvio:d===dReal, etiqueta};

    limpiar();
    return {formato,anclas,mover,trasUndo,unoMenos,piso,arranque,poligono,linea,
      sinNodos,sinRelleno,unPaso,errs:errs.slice(0,3)};
  })()`;

  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const v = result.result?.value;
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  const f = v?.formato;
  if (!f?.largo) mal("no se puede leer un trazado escrito largo", f);
  if (f.relativo !== f.largo)
    mal("un trazado con comandos RELATIVOS se lee distinto que el mismo escrito largo: " +
      "el primer arrastre lo reescribiría deformado", f);
  if (f.hv !== f.largo)
    mal("H y V no se normalizan a L: el mismo trazado da otra cosa", f);
  if (f.implicito !== f.largo)
    mal("la L implícita después de una M no se encadena", f);
  if (f.basura !== null)
    mal("un trazado ilegible no devuelve null: editarlo escribiría basura encima", f);

  if (v.anclas.cuantas !== 3)
    mal("un trazado M+C+L no expone tres anclas", v.anclas);
  if (!/\d+ puntos/.test(v.anclas.dice))
    mal("no se dice cuántos puntos hay ni qué se puede hacer con ellos", v.anclas);

  if (!v.mover.cambio) mal("arrastrar un nodo no cambia el trazado", v.mover);
  if (v.mover.arranque[0] !== 200 || v.mover.arranque[1] !== 400)
    mal("mover el ÚLTIMO punto movió también el arranque del trazado", v.mover);
  if (Math.abs(v.mover.finalY - 520) > 3)
    mal("el punto no quedó donde se lo soltó", v.mover);
  if (v.mover.comandos !== "MCL")
    mal("mover un punto cambió la forma de los comandos del trazado", v.mover);

  if (!v.trasUndo.existe) mal("Ctrl+Z se llevó puesto el trazado entero", v.trasUndo);
  if (!v.trasUndo.d) mal("Ctrl+Z no devuelve el trazado como estaba", v.trasUndo);

  if (v.unoMenos.ahora !== v.unoMenos.antes - 1)
    mal("el doble clic no borra exactamente un punto", v.unoMenos);
  if (v.piso.anclas < 2) mal("se borraron puntos hasta dejar menos de dos", v.piso);
  if (v.piso.comandos.replace(/Z/g, "").length < 2)
    mal("el trazado quedó degenerado: menos de dos comandos con geometría", v.piso);
  if (!v.piso.dibuja) mal("después de borrar, el trazado ya no dibuja nada", v.piso);

  if (v.arranque.primerComando !== "M")
    mal("borrar el primer punto dejó el trazado SIN comando de arranque", v.arranque);
  if (!v.arranque.empiezaEn || v.arranque.empiezaEn[0] !== 300)
    mal("al borrar el arranque, el siguiente punto no quedó como arranque", v.arranque);

  if (v.poligono.anclas !== 3) mal("un triángulo no expone tres anclas", v.poligono);
  if (v.poligono.trasBorrar !== 3)
    mal("se le puede borrar un vértice a un triángulo: dejaría de ser un polígono", v.poligono);

  if (v.linea.anclas !== 2) mal("una línea no expone sus dos extremos", v.linea);
  if (v.linea.siguenDos !== 2 || !v.linea.sigueEntera)
    mal("se le borró un extremo a una línea", v.linea);

  if (v.sinNodos.anclas !== 0) mal("un rectángulo expone anclas que no puede editar", v.sinNodos);
  if (!/no tiene nodos editables/.test(v.sinNodos.dice))
    mal("con un elemento sin nodos la herramienta se queda muda", v.sinNodos);

  if (v.sinRelleno.elegido !== "vacio")
    mal("la herramienta de nodos no encuentra un trazado SIN RELLENO por adentro: " +
      "agarra el de atrás", v.sinRelleno);
  if (v.sinRelleno.anclas < 4)
    mal("el trazado sin relleno se eligió pero no mostró sus puntos", v.sinRelleno);

  if (!v.unPaso.movio) mal("sobre un trazo del documento, mover un punto no lo mueve", v.unPaso);
  if (v.unPaso.pasos !== 1)
    mal("un solo arrastre deja " + v.unPaso.pasos + " pasos de historial: el primer Ctrl+Z " +
      "no se ve", v.unPaso);
  if (v.unPaso.ctrlZ !== 1)
    mal("hacen falta " + v.unPaso.ctrlZ + " Ctrl+Z para deshacer UN movimiento de punto",
      v.unPaso);
  if (!v.unPaso.volvio) mal("Ctrl+Z no devuelve el punto a su lugar", v.unPaso);
  if (!/punto/i.test(v.unPaso.etiqueta))
    mal("el paso de historial no se llama por lo que hizo", v.unPaso);

  if (v.errs?.length) throw Error("REGRESIÓN: excepciones editando nodos: " + v.errs.join(" | "));

  console.log("E2E nodos vectoriales OK", JSON.stringify({ anclas: v.anclas.cuantas,
    mover: v.mover.comandos + " final " + v.mover.finalY, piso: v.piso,
    arranque: v.arranque.primerComando + " en " + v.arranque.empiezaEn,
    poligono: v.poligono, linea: v.linea, sinRelleno: v.sinRelleno, unPaso: v.unPaso }));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
