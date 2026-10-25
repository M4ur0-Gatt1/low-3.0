/* LA TOMA EN 3D REAL Y LA VISTA DIVIDIDA (3.51). CDP :9223 + mock :8791.

   Pedido de Mauro, con el reel de Yuzu Studio: «render de Composición con
   perspectiva real en 3D y la vista dividida: arriba la escena, abajo el
   resultado final». Se controla MIDIENDO PÍXELES, no que «algo se dibuje»:

     1. Vista dividida: arriba la vista de trabajo con contenido; el botón
        «Dividida» la saca y la vuelve a poner.
     2. Con la cámara AE de frente, la toma en three.js es la MISMA imagen que
        la vista SVG (la que se exportaba hasta 3.50): no cambia nada de lo que
        ya estaba bien.
     3. Al orbitar, la toma 3D se sigue viendo (planos con su color).
     4. Girar la vista de trabajo no mueve la cámara de la escena ni deja claves.
     5. EXPORTAR por la cámara AE sale del render 3D (`data-camara="ae-3d"`) y
        es la misma imagen que la toma que se ve: lo que se ve es lo que sale. */
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
    const r = await send("Runtime.evaluate", { expression: 'document.readyState==="complete"&&typeof dzCompositionViewShow==="function" && !!api && !!(window.LOW&&LOW.composition&&LOW.composition.render3d)', returnByValue: true });
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
    const raiz=document.querySelector("#dzComposition3D"), R3=LOW.composition.render3d;
    const arrastrar=async(nodo,dx,dy,extra={})=>{ const r=nodo.getBoundingClientRect();
      const x0=r.x+r.width/2, y0=r.y+r.height/2;
      nodo.dispatchEvent(new PointerEvent("pointerdown",{bubbles:true,cancelable:true,pointerId:9,
        pointerType:"mouse",isPrimary:true,button:0,buttons:1,clientX:x0,clientY:y0,...extra}));
      for(let k=1;k<=6;k++){ window.dispatchEvent(new PointerEvent("pointermove",{bubbles:true,
        pointerId:9,clientX:x0+dx*k/6,clientY:y0+dy*k/6,buttons:1,...extra})); await wait(50); }
      window.dispatchEvent(new PointerEvent("pointerup",{bubbles:true,pointerId:9,buttons:0,...extra}));
      await wait(450); };
    const esperarGL=async()=>{ for(let i=0;i<60 && !R3.estado().gl;i++) await wait(150); await wait(250); return R3.estado().gl; };
    // dos planos a distinta profundidad
    for(const k of [0,1]){
      const e=dzCompositionElements(svg0())[k];
      dzSelect(e); DZ_COMPOSITION_VIEW.select(dzCompositionPlaneRef(e,k).id); await wait(250);
      const manija=raiz.querySelector('.cmp3-gizmo [data-axis="z"]');
      if(manija) await arrastrar(manija,(k?-1:1)*110,0);
    }
    raiz.querySelector('[data-v="camera"]').click(); await wait(800);
    DZ.compositionAutoKey=false;

    /* píxeles de un canvas (GL) o de un SVG, al mismo tamaño, en RGBA */
    const pix=(src,w,h)=>{ const c=document.createElement("canvas"); c.width=w; c.height=h; const g=c.getContext("2d");
      g.fillStyle="#fff"; g.fillRect(0,0,w,h); g.drawImage(src,0,0,w,h); return g.getImageData(0,0,w,h).data; };
    const imgDe=(txt)=>new Promise(ok=>{ const i=new Image(); const u=URL.createObjectURL(new Blob([txt],{type:"image/svg+xml"}));
      i.onload=()=>{ URL.revokeObjectURL(u); ok(i); }; i.onerror=()=>ok(null); i.src=u; });
    const distintos=(a,b)=>{ let n=0; for(let i=0;i<a.length;i+=4){ if(Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2])>60) n++; } return n/(a.length/4); };
    const noBlancos=(a)=>{ let n=0; for(let i=0;i<a.length;i+=4){ if(a[i]+a[i+1]+a[i+2]<700) n++; } return n/(a.length/4); };
    const variedad=(a)=>{ const s=new Set(); for(let i=0;i<a.length;i+=16) s.add((a[i]>>4)+","+(a[i+1]>>4)+","+(a[i+2]>>4)); return s.size; };
    const W=320, H=180;

    // ── 1. vista dividida
    const work=raiz.querySelector(".cmp3-work"), btn=raiz.querySelector('.cmp3-camtools [data-camaccion="dividida"]');
    // ── 2. cámara AE de frente: GL == SVG
    dzCmpCamPoner(LOW.composition.aeCamera.comoAE(dzCmpCamActual(), dzVB()));
    const glListo=await esperarGL();
    const cvShot=raiz.querySelector(".cmp3-shot canvas.cmp3-gl"), cvWork=raiz.querySelector(".cmp3-work canvas");
    const svgShot=raiz.querySelector(".cmp3-shot-svg svg");
    const pGL=pix(cvShot,W,H), pSVG=pix(await imgDe(svgShot.outerHTML),W,H);
    const frente={glListo, distintos:distintos(pGL,pSVG), tinta:noBlancos(pGL)};
    const trabajo={visible:!!work && getComputedStyle(work).display!=="none", ancho:work?Math.round(work.getBoundingClientRect().width):0,
      variedad:cvWork?variedad(pix(cvWork,W,H)):0, boton:!!btn, activo:!!btn&&btn.classList.contains("active")};
    if(btn){ btn.click(); await wait(250); trabajo.trasApagar=getComputedStyle(work).display; btn.click(); await wait(350); trabajo.trasPrender=getComputedStyle(work).display; }

    // ── 3. orbitar: la toma 3D sigue mostrando los planos
    await arrastrar(raiz.querySelector(".cmp3-shot"),140,-40);
    await esperarGL();
    const pOrb=pix(cvShot,W,H);
    const orbita={tinta:noBlancos(pOrb), cambio:distintos(pOrb,pGL)};

    // ── 4. girar la vista de trabajo no toca la cámara de la escena
    const camAntes=JSON.stringify(dzCmpCamActual()), clavesAntes=Object.keys(dzCamKeys()).length, az0=R3.estado().orbita.az;
    await arrastrar(work,120,30);
    const giroTrabajo={az:R3.estado().orbita.az-az0, camIgual:JSON.stringify(dzCmpCamActual())===camAntes,
      claves:Object.keys(dzCamKeys()).length-clavesAntes};

    // ── 5. exportar por la cámara AE = la toma que se ve
    DZ.compositionAutoKey=true;
    await arrastrar(raiz.querySelector(".cmp3-shot"),-30,10);   // deja clave AE en este cuadro
    await esperarGL();
    const F=DZ.doc.frame, k=dzCamKeys()[F]||{};
    const txt=await dzExportCuadroSvgListo(F, true);
    const pExp=pix(await imgDe(txt),W,H), pToma=pix(cvShot,W,H);
    const exportacion={clave:!!k.ae, porRender3D:/data-camara="ae-3d"/.test(txt), conImagen:/<image href="data:image\\/png/.test(txt),
      distintos:distintos(pExp,pToma), tinta:noBlancos(pExp)};
    const png=await dzSvgToPng(txt, 640);
    exportacion.png=!!png && png.length>1000;
    return {frente,trabajo,orbita,giroTrabajo,exportacion,estado:R3.estado(),errs:errs.slice(0,3)};
  })()`;

  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const v = result.result?.value;
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  if (v.estado.error) mal("el render 3D no arrancó", v.estado);
  if (!v.trabajo.visible || v.trabajo.ancho < 200) mal("no hay vista de trabajo arriba de la toma", v.trabajo);
  if (v.trabajo.variedad < 6) mal("la vista de trabajo está vacía: ni capas ni cámara", v.trabajo);
  if (!v.trabajo.boton || !v.trabajo.activo) mal("falta el botón «Dividida» (o no arranca prendido)", v.trabajo);
  if (v.trabajo.trasApagar !== "none" || v.trabajo.trasPrender === "none") mal("el botón «Dividida» no saca y vuelve a poner la vista de trabajo", v.trabajo);

  if (!v.frente.glListo) mal("con una cámara AE la toma no pasa a three.js", v.frente);
  if (v.frente.tinta < 0.02) mal("la toma 3D está en blanco", v.frente);
  if (v.frente.distintos > 0.03) mal("con la cámara de frente, la toma 3D no es la misma imagen que la vista SVG", v.frente);

  if (v.orbita.tinta < 0.01) mal("al orbitar, la toma 3D se queda sin planos", v.orbita);
  if (v.orbita.cambio < 0.01) mal("orbitar no cambia la toma 3D", v.orbita);

  if (Math.abs(v.giroTrabajo.az) < 10) mal("arrastrar la vista de trabajo no la gira", v.giroTrabajo);
  if (!v.giroTrabajo.camIgual || v.giroTrabajo.claves !== 0) mal("girar la vista de trabajo movió la cámara de la escena o dejó claves", v.giroTrabajo);

  if (!v.exportacion.clave) mal("la órbita con Auto-key no dejó clave AE", v.exportacion);
  if (!v.exportacion.porRender3D || !v.exportacion.conImagen) mal("exportar por la cámara AE no sale del render 3D", v.exportacion);
  if (v.exportacion.tinta < 0.01) mal("el cuadro exportado por la cámara AE está vacío", v.exportacion);
  if (v.exportacion.distintos > 0.03) mal("el cuadro exportado no es la toma que se ve", v.exportacion);
  if (!v.exportacion.png) mal("el cuadro del render 3D no se rasteriza a PNG", v.exportacion);

  const todos = [...(v.errs || []), ...errors];
  if (todos.length) throw Error("REGRESIÓN: excepciones en el render 3D: " + todos.join(" | "));
  console.log("E2E render 3D y vista dividida OK", JSON.stringify({ frente: v.frente, trabajo: v.trabajo, orbita: v.orbita,
    giroTrabajo: v.giroTrabajo, exportacion: { distintos: v.exportacion.distintos, porRender3D: v.exportacion.porRender3D } }));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
