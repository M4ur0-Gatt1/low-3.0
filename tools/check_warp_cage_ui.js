/* DEFORMACIÓN LIBRE: LA JAULA DE PUNTOS. CDP :9223 + mock :8791.

   Pedido de Mauro: «que la forma se pueda deformar libremente, imitando y
   mejorando las herramientas que tiene Moho para hacer ese tipo de dibujo», y
   en el mismo pedido: que la forma nazca sin relleno y que al contorno se le
   pueda poner un pincel. Este recorrido prueba la tercera parte y, sobre todo,
   que las tres COMPONEN: una forma entintada que se deforma tiene que seguir
   siendo tinta sobre la curva nueva.

   Lo que se comprueba, y por qué cada cosa:

   1. La jaula aparece con sus puntos y su barra. Sin eso no hay herramienta.
   2. Arrastrar un punto CAMBIA LA GEOMETRÍA de verdad, no sólo la vista.
   3. La jaula QUEDA GUARDADA en el dibujo: se puede volver a corregir.
   4. Reponer devuelve el dibujo ORIGINAL, no una copia equivalente. Pasar la
      geometría por la malla identidad convierte un rectángulo en una polilínea
      de trescientos puntos: idéntica al ojo, distinta como dato.
   5. Cambiar la densidad no pierde lo hecho, y da la rejilla nueva.
   6. Con el contorno entintado, el pincel SIGUE siendo pincel después de
      deformar.
   7. Escape sale, que es la regla del estudio.

   TRAMPAS DE ESTE RECORRIDO, las dos me morfaron:

   · `dzWarpEntrar` convierte la forma a trazado y la REEMPLAZA. Una referencia
     tomada antes queda desconectada y su getBBox da 0×0. Hay que releer la
     selección. (Lo mismo que ya pasaba con el editor de nodos y dzUndo.)
   · Vaciar el lienzo con innerHTML NO vacía el modelo, que tiene su propio
     historial. Sin sincronizarlo, lo que vuelve con Ctrl+Z es el contenido del
     paso anterior y la aserción culpa al código nuevo. */
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
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 80; i++) {
    const r = await send("Runtime.evaluate", { expression: 'typeof dzWarpEntrar==="function" && !!api', returnByValue: true });
    if (r.result?.value) break; await new Promise(r => setTimeout(r, 250));
  }

  const expression = `(async()=>{
    const w=ms=>new Promise(r=>setTimeout(r,ms));
    const errs=[]; window.addEventListener("error", e=>errs.push(String(e.message)));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit(); await w(500);
    LOW.workspace.workspaces.activate("drawing",dzWsAplicar); await w(300);
    const host=document.querySelector("#dzCanvas");
    const hoja=()=>host.querySelector(":scope > svg");
    const c=host.getBoundingClientRect();
    const X=f=>Math.round(c.left+c.width*f), Y=f=>Math.round(c.top+c.height*f);
    const pt=(t,x,y)=>host.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,
      pointerId:1,pointerType:"mouse",isPrimary:true,button:t==="pointerdown"?0:-1,
      buttons:t==="pointerup"?0:1,clientX:x,clientY:y,pressure:.5}));
    const caja=(el)=>{ try{const b=el.getBBox();
      return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};
    }catch(e){ return null; } };

    const recorrido = async (conPincel) => {
      // el modelo tiene su propio historial: se lo sincroniza antes de medir
      hoja().innerHTML=""; dzMarkDirty(); await w(600);
      const cp=document.querySelector("#dzFormaPincel");
      if (cp) { cp.checked=conPincel; cp.onchange(); }
      DZ.formaRelleno=false;
      dzFormaElegir("rect"); await w(200);
      pt("pointerdown",X(.28),Y(.28)); await w(60);
      pt("pointermove",X(.6),Y(.6)); await w(60);
      pt("pointerup",X(.6),Y(.6)); await w(500);

      const entro = dzWarpEntrar(); await w(300);
      // RELEER: entrar convierte la forma a trazado y la reemplaza
      const el = DZ.sel;
      const geoAntes = conPincel ? el.getAttribute("data-d") : el.getAttribute("d");
      const cajaAntes = caja(el);
      const jaula = document.querySelector("#dzWarpOverlay");
      const puntos = jaula ? [...jaula.querySelectorAll(".dz-warp-punto")] : [];
      const botones = jaula ? [...jaula.querySelectorAll(".dz-warp-barra button")].map(b=>b.textContent) : [];
      const salida = {entro, puntos:puntos.length, botones, errs:[]};
      if (!puntos.length) return salida;

      // arrastrar la esquina bien lejos, con el gesto de puntero de verdad
      const p0=puntos[0], r0=p0.getBoundingClientRect();
      const x0=Math.round(r0.x+r0.width/2), y0=Math.round(r0.y+r0.height/2);
      const dx=Math.round(c.width*0.18), dy=Math.round(c.height*0.10);
      const ev=(t,x,y,b)=>new PointerEvent(t,{bubbles:true,cancelable:true,pointerId:9,
        pointerType:"mouse",isPrimary:true,button:t==="pointerdown"?0:-1,buttons:b,clientX:x,clientY:y});
      const pasosAntes = DZ.history ? DZ.history.undoStack.length : -1;
      p0.dispatchEvent(ev("pointerdown",x0,y0,1)); await w(60);
      document.dispatchEvent(ev("pointermove",x0-dx,y0-dy,1)); await w(80);
      document.dispatchEvent(ev("pointerup",x0-dx,y0-dy,0)); await w(400);

      salida.arrastre = {
        cambioLaGeometria: geoAntes !== (conPincel ? el.getAttribute("data-d") : el.getAttribute("d")),
        crecio: (()=>{ const d=caja(el);
          return !!(cajaAntes&&d&&(d.w>cajaAntes.w+5||d.h>cajaAntes.h+5||d.x<cajaAntes.x-5||d.y<cajaAntes.y-5)); })(),
        guardoLaJaula: !!el.getAttribute("data-warp"),
        puntoMarcado: !!jaula.querySelector(".dz-warp-punto.movido"),
        unSoloPaso: DZ.history ? (DZ.history.undoStack.length - pasosAntes) : -1,
        // si el contorno era pincel, tiene que seguir siendo pincel
        contornos: conPincel ? [...el.children].filter(h=>h.getAttribute("data-rol")==="contorno").length : null,
      };

      const boton=(txt)=>[...jaula.querySelectorAll(".dz-warp-barra button")].find(b=>b.textContent===txt);
      const rep=boton("Reponer");
      if (rep) { rep.click(); await w(400);
        salida.repone = (conPincel ? el.getAttribute("data-d") : el.getAttribute("d")) === geoAntes; }

      const cinco=boton("5×5");
      if (cinco) { cinco.click(); await w(400);
        salida.densidad = { puntos: jaula.querySelectorAll(".dz-warp-punto").length,
          cincoActivo: !!(boton("5×5")||{}).classList?.contains("activo") }; }

      document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}));
      await w(300);
      salida.salio = !document.querySelector("#dzWarpOverlay") && !dzWarpActivo();
      // Escape en 2D no puede cerrar el módulo: es la regla del estudio
      salida.sigueEl2D = !document.querySelector("#designView").hidden;
      // la jaula guardada tiene que poder volver a abrirse con lo hecho puesto
      salida.reabre = null;
      if (dzWarpEntrar()) { await w(250);
        const j2=document.querySelector("#dzWarpOverlay");
        salida.reabre = { puntos: j2 ? j2.querySelectorAll(".dz-warp-punto").length : 0 };
        document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})); await w(200);
      }
      return salida;
    };

    const simple = await recorrido(false);
    const pincel = await recorrido(true);
    const cp=document.querySelector("#dzFormaPincel"); if(cp){cp.checked=false;cp.onchange();}
    return {simple, pincel, errs:errs.slice(0,4)};
  })()`;

  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  const v = result.result?.value;
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  for (const [nombre, r] of [["forma simple", v?.simple], ["forma entintada", v?.pincel]]) {
    if (!r) mal("el recorrido de " + nombre + " no devolvió nada", v);
    if (!r.entro)
      mal("la deformación libre no se puede abrir sobre una " + nombre, r);
    if (r.puntos < 9)
      mal("la jaula de " + nombre + " no tiene puntos para agarrar", r);
    if (!r.botones.includes("Reponer") || !r.botones.includes("5×5"))
      mal("la barra de la jaula perdió Reponer o el cambio de densidad (" + nombre + ")", r);
    if (!r.arrastre) mal("no se pudo arrastrar ningún punto de la jaula (" + nombre + ")", r);
    if (!r.arrastre.cambioLaGeometria)
      mal("arrastrar un punto NO cambia la geometría de la " + nombre + ": la jaula se " +
        "mueve y el dibujo se queda quieto", r.arrastre);
    if (!r.arrastre.crecio)
      mal("el dibujo no siguió al punto: la deformación no llegó al trazo (" + nombre + ")",
        r.arrastre);
    if (!r.arrastre.guardoLaJaula)
      mal("la jaula no queda guardada en el dibujo (" + nombre + "): mañana no se puede " +
        "volver a agarrar el mismo punto, que es lo que la hace mejor que una " +
        "transformación de una sola vez", r.arrastre);
    if (!r.arrastre.puntoMarcado)
      mal("el punto movido no se distingue de los que están en su lugar (" + nombre + ")",
        r.arrastre);
    if (r.arrastre.unSoloPaso !== 1)
      mal("un tirón de la jaula no es UN paso de historial (" + nombre + "): " +
        r.arrastre.unSoloPaso + " pasos", r.arrastre);
    if (r.repone !== true)
      mal("Reponer no devuelve el dibujo ORIGINAL de la " + nombre + ": pasar la geometría " +
        "por la malla en reposo la re-muestrea y deja una copia equivalente pero distinta " +
        "—un rectángulo convertido en polilínea de trescientos puntos—", r);
    if (!r.densidad || r.densidad.puntos !== 25)
      mal("cambiar la densidad a 5×5 no da la rejilla nueva (" + nombre + ")", r.densidad);
    if (!r.densidad.cincoActivo)
      mal("la densidad elegida no se marca en la barra (" + nombre + ")", r.densidad);
    if (!r.salio) mal("Escape no cierra la deformación (" + nombre + ")", r);
    if (!r.sigueEl2D)
      mal("Escape se llevó puesto el módulo 2D: en el estudio Escape cancela lo que está " +
        "en curso, NO cierra el módulo (" + nombre + ")", r);
    if (!r.reabre || r.reabre.puntos !== 25)
      mal("la jaula guardada no se reabre con lo que se había hecho (" + nombre + ")", r.reabre);
  }

  if (v.pincel.arrastre.contornos !== 1)
    mal("después de deformar, el contorno entintado dejó de ser tinta: el pincel tiene que " +
      "rehacerse sobre la curva nueva, que es lo que hace que las tres cosas del pedido " +
      "compongan", v.pincel.arrastre);

  const graves = (errores || []).filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));
  if (v.errs && v.errs.length) mal("hubo errores en la página", v.errs);

  console.log("E2E deformación libre OK", JSON.stringify({
    simple: { puntos: v.simple.puntos, pasos: v.simple.arrastre.unSoloPaso },
    entintada: { puntos: v.pincel.puntos, contornos: v.pincel.arrastre.contornos },
    barra: v.simple.botones,
  }));
  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* la pestaña ya se fue */ }
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
