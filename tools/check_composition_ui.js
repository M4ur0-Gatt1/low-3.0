/* COMPOSICIÓN: que deje de ser un diorama. CDP :9223 + mock :8791.

   El reporte fue «este modulo es totalmente fake» y despues, mas preciso: «las
   herramientas no hacen nada dentro de composicion, no puedo cambiar las
   posiciones de los planos». Medido, el motor SI era real —poner Z escribe
   data-z, se guarda en el dibujo, llega al cuadro y dzCamView aplica paralaje—
   pero faltaban las dos cosas que lo hacen usable:

     1. Agarrar un plano no lo movia. Solo hacia algo si antes apretabas G, R o
        S (interfaz modal estilo Blender) y nadie lo adivina.
     2. No habia CAMARA en la pantalla. El paralaje solo existe cuando la camara
        se mueve, y la camara vivia en otro panel: uno ordenaba profundidad y no
        veia ningun resultado.

   Este recorrido comprueba las dos, y comprueba el paralaje MIDIENDO que dos
   planos a distinta profundidad se muevan distinto — no que «algo cambie». */
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
    const r = await send("Runtime.evaluate", { expression: 'typeof dzCompositionViewShow==="function" && !!api', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const wait=ms=>new Promise(r=>setTimeout(r,ms));
    const errs=[]; window.addEventListener("error", ev=>errs.push(String(ev.message)));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit(); await wait(600);
    const svg0=()=>document.querySelector("#dzCanvas > svg");

    dzCompositionViewShow(true); await wait(700);
    dzCompositionViewRender(); await wait(400);
    if (typeof dzCmpCamMontar==="function") dzCmpCamMontar(); await wait(300);
    const raiz=document.querySelector("#dzComposition3D");

    const leer=(id)=>{ const t=DZ.doc.scene.compositionTransformAt(id,DZ.doc.frame)||{};
      return {x:Math.round(t.x||0), y:Math.round(t.y||0), z:Math.round(t.z||0)}; };
    const arrastrar=async(nodo,dx,dy)=>{ const r=nodo.getBoundingClientRect();
      const x0=r.x+r.width/2, y0=r.y+r.height/2;
      nodo.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerId:9,
        pointerType:"mouse",isPrimary:true,button:0,buttons:1,clientX:x0,clientY:y0}));
      for(let k=1;k<=6;k++){ window.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,
        pointerId:9,clientX:x0+dx*k/6,clientY:y0+dy*k/6,buttons:1})); await wait(45); }
      window.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,pointerId:9,buttons:0}));
      await wait(450); };

    // ── 1. el rotulo tiene que EXPLICAR el gesto, no decir «Seleccionar»
    const rotulo=(raiz.querySelector(".cmp3-mode")||{}).textContent||"";

    // ── 2. agarrar un plano LO MUEVE (el reporte)
    const els=dzCompositionElements(svg0());
    dzSelect(els[0]); DZ_COMPOSITION_VIEW.select(dzCompositionPlaneRef(els[0],0).id); await wait(300);
    const id0=DZ_COMPOSITION_VIEW.selected;
    const antes0=leer(id0);
    // se cuenta cuantas veces se reconstruye el escenario durante el arrastre:
    // render() vacia las tarjetas y CLONA el dibujo de cada plano, y antes
    // corria en cada pointermove
    let renders=0; const renderOriginal=DZ_COMPOSITION_VIEW.render.bind(DZ_COMPOSITION_VIEW);
    DZ_COMPOSITION_VIEW.render=function(){ renders++; return renderOriginal.apply(this,arguments); };
    await arrastrar(raiz.querySelector(".cmp3-card"), 140, 60);
    DZ_COMPOSITION_VIEW.render=renderOriginal;
    const mover={antes:antes0, despues:leer(id0), renders};

    // ── 3. agarrar un plano NO elegido lo elige Y lo mueve en el mismo gesto
    const tarjetas=[...raiz.querySelectorAll(".cmp3-card")];
    const otra=tarjetas[2]||tarjetas[1];
    const idOtra=otra?otra.dataset.id:null;
    const antesOtra=idOtra?leer(idOtra):null;
    if(otra) await arrastrar(otra,-120,40);
    const noElegido={id:idOtra, antes:antesOtra, despues:idOtra?leer(idOtra):null,
      seEligio:DZ_COMPOSITION_VIEW.selected===idOtra};

    // ── 4. profundidad distinta en dos planos, con la manija Z
    for(const k of [0,1]){
      const e=dzCompositionElements(svg0())[k];
      dzSelect(e); DZ_COMPOSITION_VIEW.select(dzCompositionPlaneRef(e,k).id); await wait(250);
      const manija=raiz.querySelector('.cmp3-gizmo [data-axis="z"]');
      if(manija) await arrastrar(manija,(k?-1:1)*110,0);
    }
    const profundidades=dzCompositionViewPlanes().map(p=>Math.round((p.transform&&p.transform.z)||0));

    // ── 5. la vista CÁMARA existe y pinta el cuadro de verdad
    const boton=raiz.querySelector('[data-v="camera"]');
    if(boton) boton.click(); await wait(800);
    const vista=raiz.querySelector(".cmp3-camview");
    const camara={hayBoton:!!boton, enModo:raiz.classList.contains("cmp3-en-camara"),
      pinto:!!(vista&&vista.querySelector("svg")),
      dioramaOculto:vista?getComputedStyle(raiz.querySelector(".cmp3-world")).visibility==="hidden":false,
      info:(raiz.querySelector(".cmp3-caminfo")||{}).textContent||""};

    // ── 6. PARALAJE: dos planos a distinta profundidad se mueven DISTINTO
    const posDe=()=>{ const svg=vista&&vista.querySelector("svg"); if(!svg) return null;
      // dzCamView envuelve cada plano en un <g transform=...>: el paralaje esta
      // en el PADRE, no en el nodo con data-z
      return [...svg.querySelectorAll("[data-z]")].map(n=>{
        const p=n.parentElement, t=(p&&p.getAttribute("transform"))||"";
        const m=t.match(/translate\\(([-0-9.]+)/); return m?Math.round(+m[1]):null; }); };
    const panear=async(dx)=>{ const r=vista.getBoundingClientRect();
      vista.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerId:12,
        pointerType:"mouse",isPrimary:true,button:0,buttons:1,clientX:r.x+r.width/2,clientY:r.y+r.height/2}));
      for(let m=1;m<=6;m++){ window.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,
        pointerId:12,clientX:r.x+r.width/2+dx*m/6,clientY:r.y+r.height/2,buttons:1})); await wait(50); }
      window.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,pointerId:12,buttons:0}));
      await wait(500); };

    DZ.compositionAutoKey=false;
    const antesPan=posDe();
    const clavesAntes=Object.keys(dzCamKeys()).length;
    await panear(150);
    const despuesPan=posDe();
    const paralaje={antes:antesPan, despues:despuesPan,
      seMovieron:JSON.stringify(antesPan)!==JSON.stringify(despuesPan),
      // lo que define paralaje: los desplazamientos NO son todos iguales
      distintosEntreSi:(()=>{ const d=(despuesPan||[]).map((v,i)=>(v||0)-((antesPan||[])[i]||0));
        return new Set(d.map(x=>Math.round(x))).size>1; })()};
    const sinAutokey={claves:Object.keys(dzCamKeys()).length, eranAntes:clavesAntes};

    // ── 7. con Auto-key deja clave, en UN paso, y Ctrl+Z la saca
    DZ.compositionAutoKey=true;
    const pasos0=DZ.history?DZ.history.undoStack.length:0;
    await panear(-90);
    const conAutokey={claves:Object.keys(dzCamKeys()).length,
      pasos:(DZ.history?DZ.history.undoStack.length:0)-pasos0};
    dzUndo(); await wait(500);
    const trasUndo={claves:Object.keys(dzCamKeys()).length};

    // -- 9. EL INSPECTOR: escribir un valor tiene que MOVER el plano.
    //    Reporte: «ahi no se pueden cambiar los valores, no hace nada ahi».
    //    Medido, la causa: los campos solo escuchaban change, que en un
    //    <input type=number> llega al salir del campo o al apretar Enter. Uno
    //    tipea, mira, no pasa nada, y concluye que el panel es de adorno. Las
    //    flechas del teclado no disparan change nunca.
    const mesa=window.DZ_COMPOSITION_VIEW;
    const campo=(k)=>raiz.querySelector('.cmp3-inspector input[data-p="'+k+'"]');
    const tarjeta=()=>mesa.cards.querySelector('[data-id="'+CSS.escape(mesa.selected)+'"]');
    const cards=[...mesa.cards.querySelectorAll("[data-id]")];
    if(cards.length) mesa.select(cards[0].dataset.id);
    await wait(250);
    const cx=campo("x");
    const inspector={hayCampo:!!cx, hayTarjeta:!!tarjeta()};
    if(cx){
      const idPlano=mesa.selected;
      // TIPEAR y nada mas: el plano ya se tiene que mover, y a la vista
      cx.value="-90"; cx.dispatchEvent(new Event("input",{bubbles:true}));
      await wait(220);
      inspector.tipeando=Math.round((mesa.planes.find(q=>q.id===idPlano).transform||{}).x||0);
      inspector.tarjetaTipeando=(tarjeta()||{style:{}}).style.transform||"";
      // A MEDIO TIPEAR («-» solo) no debe mandar cero ni romper nada
      cx.value="-"; cx.dispatchEvent(new Event("input",{bubbles:true})); await wait(160);
      inspector.aMedias=Math.round((mesa.planes.find(q=>q.id===idPlano).transform||{}).x||0);
      // CONFIRMAR: un solo paso de historial y queda en el documento
      cx.value="-90";
      const pasosI=DZ.history?DZ.history.undoStack.length:0;
      cx.dispatchEvent(new Event("change",{bubbles:true})); await wait(420);
      inspector.enElDocumento=leer(idPlano).x;
      inspector.pasos=(DZ.history?DZ.history.undoStack.length:0)-pasosI;
      // las FLECHAS del teclado sobre Z: solo disparan input
      const cz=campo("z");
      if(cz){ inspector.zAntes=Math.round((mesa.planes.find(q=>q.id===idPlano).transform||{}).z||0);
        cz.value=String((+cz.value||0)+10);
        cz.dispatchEvent(new Event("input",{bubbles:true})); await wait(220);
        inspector.flechaEnZ=Math.round((mesa.planes.find(q=>q.id===idPlano).transform||{}).z||0);
        inspector.tarjetaEnZ=(tarjeta()||{style:{}}).style.transform||"";
        cz.dispatchEvent(new Event("change",{bubbles:true})); await wait(320); }
      dzUndo(); await wait(400);
    }

    return {rotulo,mover,noElegido,profundidades,camara,paralaje,sinAutokey,
      conAutokey,trasUndo,inspector,errs:errs.slice(0,3)};
  })()`;

  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const v = result.result?.value;
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  if (!/[Aa]rrastr/.test(v?.rotulo || ""))
    mal("la pantalla no explica el gesto: volvió a decir sólo «Seleccionar»", v?.rotulo);

  if (JSON.stringify(v.mover.antes) === JSON.stringify(v.mover.despues))
    mal("agarrar un plano y arrastrarlo NO lo mueve — es el reporte original", v.mover);
  if (v.mover.renders > 3)
    mal("el escenario se reconstruye durante el arrastre: clona el dibujo de cada plano por cada movimiento del puntero",
      v.mover);

  if (!v.noElegido.seEligio)
    mal("agarrar un plano no elegido no lo elige: el click llega después del arrastre", v.noElegido);
  if (JSON.stringify(v.noElegido.antes) === JSON.stringify(v.noElegido.despues))
    mal("agarrar un plano no elegido no lo mueve", v.noElegido);

  const distintas = new Set(v.profundidades).size;
  if (distintas < 2) mal("no se pudo dar profundidad distinta a dos planos", v.profundidades);

  if (!v.camara.hayBoton) mal("no hay vista de Cámara en Composición", v.camara);
  if (!v.camara.enModo || !v.camara.pinto)
    mal("la vista de Cámara no pinta el cuadro compuesto", v.camara);
  if (!v.camara.dioramaOculto)
    mal("con la cámara puesta el diorama sigue encima: no se sabe qué se está mirando", v.camara);
  if (!/paralaje|profundidad/.test(v.camara.info))
    mal("la vista de Cámara no dice si hay profundidad que ver", v.camara);

  if (!v.paralaje.seMovieron) mal("panear la cámara no mueve nada", v.paralaje);
  if (!v.paralaje.distintosEntreSi)
    mal("los planos se mueven TODOS IGUAL: no hay paralaje, es una foto que se desliza", v.paralaje);

  if (v.sinAutokey.claves !== v.sinAutokey.eranAntes)
    mal("sin Auto-key, mirar por la cámara dejó claves sin permiso", v.sinAutokey);
  if (v.conAutokey.claves < 1) mal("con Auto-key no queda clave de cámara", v.conAutokey);
  if (v.conAutokey.pasos !== 1)
    mal("la clave de cámara no es UN paso de historial", v.conAutokey);
  if (v.trasUndo.claves !== v.sinAutokey.claves)
    mal("Ctrl+Z no saca la clave de cámara", { trasUndo: v.trasUndo, antes: v.sinAutokey });

  if (!v.inspector.hayCampo) mal("el inspector de Composición no tiene campos", v.inspector);
  if (!v.inspector.hayTarjeta) mal("no hay tarjeta del plano elegido", v.inspector);
  if (v.inspector.tipeando !== -90)
    mal("escribir un valor en el inspector no mueve el plano: el panel es de adorno", v.inspector);
  if (!/-90px/.test(v.inspector.tarjetaTipeando || ""))
    mal("el plano se mueve en el modelo pero la tarjeta no: no se ve nada al escribir", v.inspector);
  if (v.inspector.aMedias !== -90)
    mal("un valor a medio escribir manda al plano al cero", v.inspector);
  if (v.inspector.enElDocumento !== -90)
    mal("confirmar el valor no lo guarda en el documento", v.inspector);
  if (v.inspector.pasos !== 1)
    mal("cambiar un valor del inspector no es UN paso de historial", v.inspector);
  if (v.inspector.flechaEnZ !== v.inspector.zAntes + 10)
    mal("las flechas del teclado no cambian nada: no disparan change", v.inspector);
  if (!new RegExp("-" + v.inspector.flechaEnZ + "px").test(v.inspector.tarjetaEnZ || ""))
    mal("la flecha cambia Z pero la tarjeta no se acerca ni se aleja", v.inspector);

  if (v.errs?.length) throw Error("REGRESIÓN: excepciones en Composición: " + v.errs.join(" | "));

  console.log("E2E composición OK", JSON.stringify({ rotulo: v.rotulo.slice(0, 46),
    mover: v.mover.despues, rendersEnElArrastre: v.mover.renders,
    profundidades: v.profundidades, paralaje: v.paralaje.antes + " -> " + v.paralaje.despues,
    claves: v.conAutokey, inspector: v.inspector, info: v.camara.info.slice(0, 60) }));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
