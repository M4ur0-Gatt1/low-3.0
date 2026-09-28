/* LAS SUPERPOSICIONES DE LA MESA NO PUEDEN QUEDARSE VIEJAS.
   CDP :9223 + mock :8791.

   POR QUE EXISTE ESTE RECORRIDO. Mauro lo dijo mirando la pantalla: «el
   recuadro de camara se ve desfasado de la mesa». No era una impresion.

   El encuadre de camara, el alambre del rig y la malla NO viven adentro del
   SVG: son capas en PIXELES DE PANTALLA calculadas desde donde esta la hoja
   en ese momento. Cualquier cosa que mueva la hoja los deja viejos.

   MEDIDO ANTES DEL ARREGLO, con el encuadre puesto:
     achicar la ventana a 1100x620  ->  156 px corrido
     agrandarla a 1500x900          ->  223 px corrido
     subir la timeline a 320 px     ->  160 px corrido
     bajarla a 90 px                ->  115 px corrido
   La hoja se recentra y el recuadro se queda donde estaba. Un encuadre
   corrido 223 px MIENTE sobre que entra en camara, que es exactamente para lo
   unico que sirve encuadrar.

   La causa eran dos agujeros en el mismo lugar: solo se escuchaba el `resize`
   de la VENTANA, y solo para el rig y la malla —la camara no se recalculaba
   nunca—; y cambiar el alto de la timeline, acoplar un panel o mover un
   divisor cambian el tamaño de la mesa SIN que la ventana cambie, asi que no
   hay `resize` que escuchar. Por eso el arreglo mira LA MESA (`ResizeObserver`
   sobre el lienzo) y no la ventana.

   COMO SE MIDE, que es lo que le da filo a esta prueba: se lee el rectangulo
   que se VE, se fuerza `dzCamOverlay()` —que recalcula con la disposicion de
   AHORA— y se vuelve a leer. Si movio, lo que se estaba viendo estaba viejo.
   No compara contra numeros escritos a mano, asi que no envejece con el CSS.

   Se prueban las dos causas por separado a proposito: un arreglo que escuche
   solo `resize` de ventana pasa la primera y falla la segunda. */
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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 120000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate",
    { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  // Sin Network.enable, setCacheDisabled no hace NADA y el navegador corre el
  // modulo viejo: una sonda anterior dijo «no se reproduce» por esto mismo.
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('typeof dzCamToggle==="function" && typeof dzCamOverlay==="function" && !!api').catch(() => false);
    if (listo === true) break;
    await w(400);
  }

  const montaje = await ev(`(async()=>{
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg");
    if (typeof dzDocInit === "function") await dzDocInit();
    if (typeof closeL3d === "function") closeL3d();
    await new Promise(r=>setTimeout(r,500));
    return { hoja: !!document.querySelector("#dzCanvas > svg"),
             alineador: typeof dzAlinearSuperposiciones === "function" };
  })()`);
  if (!montaje.hoja) mal("el montaje no dejó una hoja de dibujo", montaje);
  if (!montaje.alineador) mal("no existe el alineador de superposiciones", montaje);

  await ev('(()=>{ if(!DZ.camMode) dzCamToggle(); return true; })()');
  await w(500);

  /* Lo que se VE contra lo que CORRESPONDE. */
  const desfase = () => ev(`(()=>{
    const r = n => { const b = n.getBoundingClientRect();
      return {x:Math.round(b.x), y:Math.round(b.y), w:Math.round(b.width), h:Math.round(b.height)}; };
    const cam = document.querySelector("#dzCam");
    if (!cam || cam.hidden) return null;
    const visto = r(cam);
    dzCamOverlay();
    const debido = r(cam);
    return { visto, debido,
             px: Math.max(Math.abs(debido.x-visto.x), Math.abs(debido.y-visto.y),
                          Math.abs(debido.w-visto.w), Math.abs(debido.h-visto.h)) };
  })()`);

  const medido = {};
  const paso = async (nombre, accion, tolerancia = 1) => {
    await accion();
    await w(700);
    const d = await desfase();
    if (!d) mal("el encuadre desapareció en el paso «" + nombre + "»", { nombre });
    medido[nombre] = d.px;
    if (d.px > tolerancia) mal("el encuadre quedó desfasado de la mesa tras «" + nombre + "»", d);
  };

  // referencia: recién montado tiene que estar alineado, o la sonda no sirve
  await paso("montaje", async () => {});

  // ── CAUSA 1: cambia la ventana ──
  await paso("ventana 1100x620", () => send("Emulation.setDeviceMetricsOverride",
    { width: 1100, height: 620, deviceScaleFactor: 1, mobile: false }));
  await paso("ventana 1500x900", () => send("Emulation.setDeviceMetricsOverride",
    { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false }));

  // ── CAUSA 2: cambia la MESA sin que cambie la ventana ──
  // Esta es la que un arreglo atado a `resize` de ventana NO cubre.
  await paso("timeline a 320px", () => ev(`(()=>{ const t=document.querySelector("#dzTimeline");
    if(!t) return false; t.hidden=false; t.style.height="320px"; return true; })()`));
  await paso("timeline a 90px", () => ev(`(()=>{ const t=document.querySelector("#dzTimeline");
    if(!t) return false; t.style.height="90px"; return true; })()`));
  await ev(`(()=>{ const t=document.querySelector("#dzTimeline"); if(t){t.style.height="";} return true; })()`);

  /* EL RIG Y LA MALLA TAMBIEN ENTRAN AL ALINEADOR. Esto no es decoracion:
     la primera version de este modulo leia `window.DZ`, y como `DZ` es `const`
     en app.js eso da undefined EN SILENCIO — el encuadre se alineaba y el
     alambre del rig no, sin que nada avisara. La prueba de la camara sola no
     lo veia. Se mide con un espia: con el modo puesto, el alineador TIENE que
     llamar al dibujante de esa capa. */
  const capas = await ev(`(()=>{
    const llamadas = [];
    const guardar = {};
    for (const nombre of ["dzCamOverlay","dzRigOverlayRender","dzMeshOverlayRender"]) {
      if (typeof window[nombre] !== "function") { llamadas.push(nombre + ":NO EXISTE"); continue; }
      guardar[nombre] = window[nombre];
      window[nombre] = function(){ llamadas.push(nombre); return guardar[nombre].apply(this, arguments); };
    }
    const antesRig = DZ.rigMode, antesMalla = DZ.meshPaint;
    DZ.rigMode = true; DZ.meshPaint = true;
    dzAlinearSuperposiciones();
    DZ.rigMode = antesRig; DZ.meshPaint = antesMalla;
    for (const nombre in guardar) window[nombre] = guardar[nombre];
    return llamadas;
  })()`);
  for (const capa of ["dzCamOverlay", "dzRigOverlayRender", "dzMeshOverlayRender"]) {
    if (!capas.includes(capa)) mal("el alineador no toca «" + capa + "» con su modo puesto", { capas });
  }

  const crasheos = errores.filter(e => /TypeError|ReferenceError/.test(String(e)));
  if (crasheos.length) mal("la alineación tiró errores", crasheos.slice(0, 3));

  console.log("E2E encuadre alineado OK " + JSON.stringify({ desfasePorPaso: medido, capas, errores: errores.length }));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
