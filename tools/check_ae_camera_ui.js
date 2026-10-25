/* LA CÁMARA ESTILO AFTER EFFECTS, EN LA PANTALLA. CDP :9223 + mock :8791.

   Pedido de Mauro (3.50): «quiero que la cámara del modo composición se parezca
   más a la cámara virtual que tiene After Effects». El modelo tiene su propia
   prueba (check_ae_camera_model.js); ésta recorre el camino de punta a punta
   con eventos de puntero, que es lo que ninguna otra prueba tocaba:

     1. La vista Cámara muestra las herramientas de AE y los ajustes (lente).
     2. ÓRBITA con el izquierdo (herramienta unificada): la imagen cambia, los
        planos a distinta profundidad se mueven distinto y, con Auto-key, queda
        UNA clave AE en UN paso de historial.
     3. Cambiar el preset de lente cambia el zoom (y lo dice: «24 mm»).
     4. Profundidad de campo: con planos a distinta profundidad, alguno se
        desenfoca.
     5. La EXPORTACIÓN pasa por la cámara AE (dzCamAt → dzCamView), no por la 2D.
     6. Editar la clave desde el recuadro 2D (cx) la mueve en 3D sin perderla.
     7. Ctrl+Z saca la clave. */
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
    const r = await send("Runtime.evaluate", { expression: 'document.readyState==="complete"&&typeof dzCompositionViewShow==="function" && !!api && !!(window.LOW&&LOW.composition&&LOW.composition.aeCamera)', returnByValue: true });
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
    const arrastrar=async(nodo,dx,dy,extra={})=>{ const r=nodo.getBoundingClientRect();
      const x0=r.x+r.width/2, y0=r.y+r.height/2;
      nodo.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerId:9,
        pointerType:"mouse",isPrimary:true,button:0,buttons:1,clientX:x0,clientY:y0,...extra}));
      for(let k=1;k<=6;k++){ window.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,
        pointerId:9,clientX:x0+dx*k/6,clientY:y0+dy*k/6,buttons:1,...extra})); await wait(50); }
      window.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,pointerId:9,buttons:0,...extra}));
      await wait(500); };

    // dos planos a distinta profundidad (la manija Z, como el dibujante)
    for(const k of [0,1]){
      const e=dzCompositionElements(svg0())[k];
      dzSelect(e); DZ_COMPOSITION_VIEW.select(dzCompositionPlaneRef(e,k).id); await wait(250);
      const manija=raiz.querySelector('.cmp3-gizmo [data-axis="z"]');
      if(manija) await arrastrar(manija,(k?-1:1)*110,0);
    }
    const profundidades=dzCompositionViewPlanes().map(p=>Math.round((p.transform&&p.transform.z)||0));

    // ── 1. vista Cámara con herramientas y ajustes de AE
    const boton=raiz.querySelector('[data-v="camera"]'); if(boton) boton.click(); await wait(800);
    const vista=raiz.querySelector(".cmp3-camview");
    const herramientas=[...raiz.querySelectorAll(".cmp3-camtools [data-herr]")].map(b=>b.dataset.herr);
    const ajustes=!!raiz.querySelector('.cmp3-camset [data-camset="preset"]');
    const info=()=>(raiz.querySelector(".cmp3-caminfo")||{}).textContent||"";
    const pinta=()=>{ const s=vista&&vista.querySelector("svg"); return s?s.outerHTML:""; };
    const matrices=()=>{ const s=vista&&vista.querySelector("svg"); if(!s) return [];
      // la cámara AE envuelve cada PLANO (hijo del svg) en <g transform="matrix(…)">;
      // el nodo con data-z puede estar anidado dentro del plano
      return [...s.querySelectorAll("[data-z]")].map(n=>{ const g=n.closest('g[transform^="matrix"]')||n.parentElement;
        return (g&&g.getAttribute("transform"))||""; }); };

    // ── 2. órbita con el izquierdo (unificada) y Auto-key
    DZ.compositionAutoKey=true;
    const F=DZ.doc.frame, claves0=Object.keys(dzCamKeys()).length;
    const pasos0=DZ.history?DZ.history.undoStack.length:0;
    const antes=matrices();
    await arrastrar(vista,140,-40);
    const despues=matrices();
    const clave=dzCamKeys()[F]||null;
    const orbita={antes,despues, cambio:JSON.stringify(antes)!==JSON.stringify(despues),
      claves:Object.keys(dzCamKeys()).length-claves0,
      pasos:(DZ.history?DZ.history.undoStack.length:0)-pasos0,
      ae:!!(clave&&clave.ae), x:clave&&clave.x, z:clave&&clave.z, info:info()};

    // ── 3. lente: preset 24 mm
    const preset=raiz.querySelector('.cmp3-camset [data-camset="preset"]');
    let lente={hay:!!preset};
    if(preset){ const op=[...preset.options].find(o=>/^24/.test(o.textContent)||o.value==="24");
      lente.opcion=!!op;
      if(op){ preset.value=op.value; preset.dispatchEvent(new Event("change",{bubbles:true})); await wait(500); }
      lente.info=info(); }

    // ── 4. profundidad de campo
    const dof=raiz.querySelector('.cmp3-camset [data-camset="dof"]');
    let campo={hay:!!dof};
    if(dof){ dof.checked=true; dof.dispatchEvent(new Event("change",{bubbles:true})); await wait(500);
      campo.desenfoque=/filter:\\s*blur\\(/.test(pinta()); campo.info=info(); }

    // ── 5. la exportación pasa por la cámara AE
    const camF=dzCamAt(F);
    const exportado=dzCamView(dzCuadroSvgTexto(F), camF);
    const exportacion={ae:!!(camF&&camF.ae), porAE:/data-camara="ae"/.test(exportado)};

    // ── 6. el recuadro 2D edita la clave AE sin perderla
    const k0={...dzCamKeys()[F]};
    if(typeof dzCamSetKey==="function"){ dzCamSetKey({...dzCamAt(F), cx:(k0.cx||0)+50}); await wait(300); }
    const k1=dzCamKeys()[F]||{};
    const edicion2D={siguioAE:!!k1.ae, dx:Math.round((k1.x||0)-(k0.x||0)), dcx:Math.round((k1.cx||0)-(k0.cx||0))};

    // ── 7. deshacer todo hasta sacar la clave
    for(let i=0;i<6 && Object.keys(dzCamKeys()).length>claves0;i++){ dzUndo(); await wait(300); }
    const trasUndo=Object.keys(dzCamKeys()).length-claves0;

    return {profundidades,herramientas,ajustes,orbita,lente,campo,exportacion,edicion2D,trasUndo,errs:errs.slice(0,3)};
  })()`;

  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const v = result.result?.value;
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  if (new Set(v.profundidades).size < 2) mal("no se pudo dar profundidad distinta a dos planos", v.profundidades);
  for (const h of ["unificada", "orbita", "trackxy", "trackz"])
    if (!v.herramientas.includes(h)) mal("falta la herramienta de cámara «" + h + "»", v.herramientas);
  if (!v.ajustes) mal("la vista Cámara no tiene los ajustes de lente", v);

  if (!v.orbita.cambio) mal("orbitar con el izquierdo no cambia la imagen", v.orbita);
  const mats = v.orbita.despues.map((t) => (t.match(/matrix\(([^)]*)\)/) || [, ""])[1]);
  if (!mats.every(Boolean)) mal("tras orbitar, los planos no se pintan con la cámara AE (matrix)", v.orbita.despues);
  if (new Set(mats).size < 2) mal("los planos a distinta profundidad quedan iguales: no hay perspectiva", mats);
  if (v.orbita.claves !== 1 || v.orbita.pasos !== 1)
    mal("con Auto-key, una órbita tiene que dejar UNA clave en UN paso", v.orbita);
  if (!v.orbita.ae) mal("la clave que deja la órbita no es una cámara AE", v.orbita);
  if (!/mm/.test(v.orbita.info)) mal("la vista Cámara no dice la lente en mm", v.orbita.info);

  if (!v.lente.hay || !v.lente.opcion) mal("no hay preset de 24 mm", v.lente);
  if (!/\b24 mm/.test(v.lente.info)) mal("elegir el preset de 24 mm no cambia la lente", v.lente);

  if (!v.campo.hay) mal("no hay casilla de profundidad de campo", v.campo);
  if (!v.campo.desenfoque) mal("con profundidad de campo y planos a distinta profundidad, nada se desenfoca", v.campo);

  if (!v.exportacion.ae || !v.exportacion.porAE)
    mal("la exportación no pasa por la cámara AE: el video saldría con la cámara 2D", v.exportacion);

  if (!v.edicion2D.siguioAE) mal("editar la clave desde el recuadro 2D la convierte en 2D y pierde la cámara AE", v.edicion2D);
  if (Math.abs(v.edicion2D.dcx - 50) > 1 || Math.abs(v.edicion2D.dx - 50) > 1)
    mal("mover el recuadro 2D 50 unidades no mueve la cámara AE lo mismo", v.edicion2D);

  if (v.trasUndo !== 0) mal("Ctrl+Z no saca la clave de cámara AE", v.trasUndo);
  const todos = [...(v.errs || []), ...errors];
  if (todos.length) throw Error("REGRESIÓN: excepciones con la cámara AE: " + todos.join(" | "));

  console.log("E2E cámara AE OK", JSON.stringify({ herramientas: v.herramientas, orbita: { claves: v.orbita.claves, pasos: v.orbita.pasos },
    lente: v.lente.info.slice(0, 70), dof: v.campo.desenfoque, exportacion: v.exportacion, edicion2D: v.edicion2D }));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
