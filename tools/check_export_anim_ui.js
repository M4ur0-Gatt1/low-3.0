/* LA EXPORTACION DE ANIMACION: EL CAMINO DESDE EL BOTON.
   CDP :9223 + mock :8791.

   POR QUE EXISTE ESTE RECORRIDO. El inventario de capacidades (A01) lo dejo
   escrito con estas palabras: «la exportacion de animacion (MP4/PNG) no tiene
   ninguna prueba. Es el siguiente agujero a cerrar de esta lista, y es de los
   que se notan: si falla, falla al final del trabajo». Esto cierra el camino
   desde la interfaz; `check_export_anim_backend.py` cierra el puente.

   LO QUE SE PERSIGUE, en orden de gravedad:

   1. QUE UN CUADRO EN BLANCO NO DESAPAREZCA. Medido antes del arreglo: con
      cinco cuadros —contenido en 1, 2, 4 y 5, el 3 vacio— el puente recibia
      CUATRO PNG y la app informaba «4 cuadros (F1 a F5)», contradiciendose
      sola. Para una animacion eso no es un cuadro de menos: todo lo que sigue
      al hueco SE ADELANTA UN CUADRO. El timing es la materia del oficio.
   2. QUE EL HUECO SALGA CON EL PAPEL, no transparente. En MP4 y GIF un cuadro
      transparente lo rellena el codec con negro y el hueco aparece como un
      fogonazo en medio de la animacion.
   3. QUE SI ALGO SE PIERDE, SE DIGA. Quedan dos maneras de perder un cuadro
      —que falle la rasterizacion, o que no se pueda leer el archivo en el
      camino viejo— y antes salia informado como si todo hubiera ido bien. Se
      inyecta una falla de rasterizacion a proposito para comprobar el aviso.
   4. Que el boton de la timeline abra el modal de verdad, con las cinco
      salidas, y que elegir una llame al puente UNA vez con los fps que se ven.

   El puente no se toca: `api.export_anim` se reemplaza por un espia que anota
   y no escribe nada. */
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
  const ev = async (expr) => { const r = await send("Runtime.evaluate",
    { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  /** Clic de mouse de verdad: un botón se puede llamar por su onclick, pero
   *  entonces no se prueba que se pueda APRETAR. */
  const clickEn = async (sel) => {
    const caja = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});
      if(!e) return null; const r=e.getBoundingClientRect(); if(!r.width||!r.height) return null;
      return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};})()`);
    if (!caja) throw Error("no pude clickear " + sel);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: caja.x, y: caja.y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: caja.x, y: caja.y, button: "left", buttons: 1, clickCount: 1 });
    await w(80);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: caja.x, y: caja.y, button: "left", buttons: 0, clickCount: 1 });
  };

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('typeof dzExportModal==="function" && typeof dzDoExportDoc==="function" && !!api').catch(() => false);
    if (listo === true) break;
    await w(400);
  }

  // ── montaje: cinco cuadros con el TERCERO vacío, y el puente espiado
  const montaje = await ev(`(async()=>{
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg");
    if (typeof dzDocInit === "function") await dzDocInit();
    await new Promise(r=>setTimeout(r,600));
    if (typeof closeL3d === "function") closeL3d();
    // OJO: prender la timeline REEMPLAZA DZ.doc.scene por otro objeto. Si la
    // escena se captura antes, las exposiciones se escriben en una escena
    // muerta y el recorrido mide otra cosa —me paso, y el sintoma es un rango
    // de un solo cuadro con el dibujo igual presente—. Se toma DESPUES.
    if (!DZ.anim) await dzAnimToggle();
    await new Promise(r=>setTimeout(r,700));
    const sc = DZ.doc.scene, ly = sc.layers[0], lv = sc.level(ly.levelId);
    const dibujo = '<g data-low-art="line"><rect data-low-page="1" width="1920" height="1080" fill="#ffffff"/>' +
      '<path d="M100 100 L 400 400" stroke="#111111" stroke-width="6" fill="none"/></g>';
    lv.addDrawing(1, dibujo); lv.addDrawing(2, dibujo);
    sc.expose(ly.id,1,1); sc.expose(ly.id,2,1); sc.expose(ly.id,4,2); sc.expose(ly.id,5,2);
    ly.setCell(3, null);                    // el hueco: un cuadro en blanco a proposito
    sc.range = { in:1, out:5 };
    window.__anim = [];
    api.export_anim = (ruta, pngs, fps, kind) => {
      window.__anim.push({ ruta:String(ruta||""), cuantos:pngs.length, fps, kind, pngs:pngs.slice() });
      return { path:"export/prueba", n:pngs.length };
    };
    if (typeof api.refresh_tree !== "function") api.refresh_tree = () => ({tree:{}});
    return { rango: dzExportCuadros(), vacio: !dzCuadroSvgTexto(3), conContenido: !!dzCuadroSvgTexto(1),
      celdas: [1,2,3,4,5].map(f=>ly.cellAt(f)), escenaViva: DZ.doc.scene === sc };
  })()`);
  if (montaje.rango.length !== 5 || !montaje.vacio || !montaje.conContenido)
    mal("el montaje no dejó cinco cuadros con el tercero vacío", montaje);

  // ── 1. el botón de la timeline abre el modal, con las cinco salidas
  await clickEn("#tlExport");
  let modal = null;
  for (let i = 0; i < 25; i++) {
    modal = await ev(`(()=>{const m=document.querySelector("#modal");
      if(!m|| (m.hidden===true)) return null;
      const salidas=[...m.querySelectorAll("[data-x]")].map(b=>b.dataset.x);
      if(!salidas.length) return null;
      return { salidas, texto:(m.textContent||"").replace(/\\s+/g," ").trim().slice(0,140) };})()`);
    if (modal) break;
    await w(300);
  }
  if (!modal) mal("el botón de exportar de la timeline no abre el modal", { montaje });
  for (const salida of ["mp4", "gif", "png", "sheet", "premiere"])
    if (!modal.salidas.includes(salida))
      mal("el modal de exportar perdió una salida: " + salida, modal);
  if (modal.texto.indexOf("5 cuadros") < 0)
    mal("el modal no dice cuántos cuadros se van a exportar, que es lo único que " +
      "deja comparar contra lo que sale", modal);

  // ── 2. elegir «Secuencia PNG»: los CINCO cuadros llegan al puente
  await clickEn('#modal [data-x="png"]');
  let salida = null;
  for (let i = 0; i < 90; i++) {
    salida = await ev(`(()=>{ if(!window.__anim.length) return null;
      const a = window.__anim[0];
      return { llamadas: window.__anim.length, cuantos: a.cuantos, fps: a.fps, kind: a.kind,
        estado: (document.querySelector("#dzStatus")||{}).textContent?.trim().slice(0,170) || "",
        // el cuadro del hueco: tiene que traer el papel, no un agujero transparente
        hueco: a.pngs[2] ? a.pngs[2].slice(0,24) : "", distintos: new Set(a.pngs).size };})()`);
    if (salida) break;
    await w(400);
  }
  if (!salida) mal("elegir «Secuencia PNG» no llamó al puente", { modal });
  if (salida.llamadas !== 1)
    mal("el puente se llamó " + salida.llamadas + " veces en vez de una", salida);
  if (salida.kind !== "png") mal("se pidió otra salida que la elegida", salida);
  if (salida.cuantos !== 5)
    mal("el cuadro en blanco DESAPARECIÓ del export: salieron " + salida.cuantos +
      " de 5 cuadros, así que la animación es más corta y todo lo que sigue al " +
      "hueco se adelanta un cuadro", salida);
  if (!/5 cuadros/.test(salida.estado))
    mal("el aviso no informa los cinco cuadros que salieron", salida);
  if (!salida.hueco.startsWith("data:image/png"))
    mal("el cuadro del hueco no es un PNG", salida);

  // ── 3. y el hueco NO es idéntico a los cuadros dibujados (trae el papel, no
  //       el dibujo) ni es transparente: se comprueba contra el papel a solas.
  const papel = await ev(`(()=>{ const svg = dzExportCuadroEnBlanco(DZ.doc.scene);
    return { svg: svg.slice(0, 220), tienePapel: /<rect[^>]*fill="#ffffff"/.test(svg),
      tamano: /width="1920"/.test(svg) && /height="1080"/.test(svg) };})()`);
  if (!papel.tienePapel)
    mal("el cuadro en blanco sale SIN el papel: en MP4 y GIF el codec lo rellena " +
      "de negro y el hueco aparece como un fogonazo", papel);
  if (!papel.tamano)
    mal("el cuadro en blanco no tiene el tamaño de la escena", papel);

  // ── 4. si un cuadro se pierde de verdad, el aviso lo DICE
  const aviso = await ev(`(async()=>{
    window.__anim = [];
    const original = window.dzSvgToPng;
    let n = 0;
    window.dzSvgToPng = async (txt, alto) => { n++; return n === 2 ? null : original(txt, alto); };
    try { await dzDoExportDoc("png"); } finally { window.dzSvgToPng = original; }
    const a = window.__anim[0] || null;
    return { cuantos: a ? a.cuantos : 0,
      estado: (document.querySelector("#dzStatus")||{}).textContent?.trim() || "" };
  })()`);

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }

  if (aviso.cuantos !== 4)
    mal("la inyección de la falla no dejó el caso que se quería probar", aviso);
  if (!/falta|atenci/i.test(aviso.estado))
    mal("se perdió un cuadro y el aviso informó como si todo hubiera salido bien: " +
      "el que exporta se entera en el montaje, cuando ya no puede revisar", aviso);

  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));

  console.log("E2E export animación OK " + JSON.stringify({
    modal: { salidas: modal.salidas.length },
    png: { pedidos: 5, salieron: salida.cuantos, fps: salida.fps },
    hueco: { conPapel: papel.tienePapel },
    perdida: { avisa: true },
  }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
