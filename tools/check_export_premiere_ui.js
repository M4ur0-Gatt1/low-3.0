/* SINCRONIZAR CON EL AUDIO Y EXPORTAR XML: EL CAMINO DESDE EL MENU.
   CDP :9223 + mock :8791.

   POR QUE EXISTE ESTE RECORRIDO. El inventario de capacidades dejaba esta
   exportacion en **parcial**, con estas palabras: «`run_premiere_xml_tests`
   cubre el XML; ningun recorrido de navegador toca `dzExportPremiereDirecto`.
   El archivo que sale esta probado, el camino desde el menu no». Esto cierra el
   camino; `check_export_premiere_backend.py` cierra el lado del disco.

   LO QUE SE PERSIGUE:

   1. QUE AVISE ANTES, NO DESPUES. Exportar sin audio es legitimo —queda una
      secuencia lista para montar—, pero el que viene a «sincronizar» y no
      cargo el audio se lleva un XML mudo sin enterarse. El aviso tiene que
      aparecer ANTES de escribir nada.
   2. QUE CANCELAR NO ESCRIBA NADA. Si el puente se llama igual, el aviso es
      decorado.
   3. QUE SALGAN TODOS LOS CUADROS DEL RANGO, incluidos los que estan en blanco:
      un hueco que desaparece adelanta un cuadro todo lo que sigue, y en un
      montaje con audio eso es el labial corrido.
   4. QUE EL XML NOMBRE TANTOS ARCHIVOS COMO CUADROS SE MANDAN, y con el nombre
      que despues escribe el puente. Si divergen, Premiere abre la secuencia con
      los cuadros PERDIDOS.

   El puente no se toca: `api.export_premiere` se reemplaza por un espia. */
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
  const esperarAviso = async () => {
    for (let i = 0; i < 30; i++) {
      const a = await ev(`(()=>{const ov=document.querySelector("#overlay");
        if(!ov||ov.hidden) return null;
        const ok=ov.querySelector("#dzCfOk"), no=ov.querySelector("#dzCfX");
        if(!ok||!no) return null;
        return { texto:(ov.textContent||"").replace(/\\s+/g," ").trim().slice(0,200) };})()`);
      if (a) return a;
      await w(300);
    }
    return null;
  };

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('typeof dzExportPremiereDirecto==="function" && typeof dzMenuAction==="function" && !!api').catch(() => false);
    if (listo === true) break;
    await w(400);
  }

  // ── montaje: cinco cuadros, el tercero EN BLANCO, y un nombre de escena de
  //    los que se ponen de verdad —termina en un caracter que no es de palabra,
  //    que es donde las reglas de nombre se separaban—.
  const montaje = await ev(`(async()=>{
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg");
    if (typeof dzDocInit === "function") await dzDocInit();
    await new Promise(r=>setTimeout(r,600));
    if (typeof closeL3d === "function") closeL3d();
    if (!DZ.anim) await dzAnimToggle();
    await new Promise(r=>setTimeout(r,700));
    const sc = DZ.doc.scene, ly = sc.layers[0], lv = sc.level(ly.levelId);
    const dibujo = '<g data-low-art="line"><rect data-low-page="1" width="1920" height="1080" fill="#ffffff"/>' +
      '<path d="M100 100 L 400 400" stroke="#111111" stroke-width="6" fill="none"/></g>';
    lv.addDrawing(1, dibujo); lv.addDrawing(2, dibujo);
    sc.expose(ly.id,1,1); sc.expose(ly.id,2,1); sc.expose(ly.id,4,2); sc.expose(ly.id,5,2);
    ly.setCell(3, null);
    sc.range = { in:1, out:5 };
    sc.name = "El Gato (final)";
    DZ.doc.audio = null;
    window.__premiere = [];
    api.export_premiere = (ruta, pngs, xml, wav, nombre) => {
      window.__premiere.push({ cuantos: pngs.length, xml: String(xml||""), wav: wav ? String(wav).length : 0, nombre: String(nombre||"") });
      return { path: "export/premiere", name: nombre + ".xml", frames: pngs.length, audio: !!wav };
    };
    if (typeof api.refresh_tree !== "function") api.refresh_tree = () => ({tree:{}});
    return { rango: dzExportCuadros().length, escena: sc.name };
  })()`);
  if (montaje.rango !== 5) mal("el montaje no dejó cinco cuadros", montaje);

  // ── 1. el menú avisa ANTES de escribir, porque no hay audio cargado
  await ev('dzMenuAction("premiere")');
  const aviso = await esperarAviso();
  if (!aviso)
    mal("«Sincronizar con el audio y exportar XML» no avisa que la escena NO TIENE " +
      "AUDIO: el que viene a sincronizar se lleva un XML mudo y se entera en el montaje",
      { montaje });
  if (!/audio/i.test(aviso.texto))
    mal("el aviso no dice que el problema es el audio", aviso);

  // ── 2. CANCELAR no escribe nada
  await clickEn("#dzCfX");
  await w(700);
  const trasCancelar = await ev('({ llamadas: window.__premiere.length })');
  if (trasCancelar.llamadas !== 0)
    mal("CANCELAR igual exportó: el aviso sería decorado y se escribiría una carpeta " +
      "que nadie pidió", trasCancelar);

  // ── 3. CONFIRMAR: sale una vez, con todos los cuadros del rango
  await ev('dzMenuAction("premiere")');
  if (!await esperarAviso()) mal("el aviso no volvió a aparecer", {});
  await clickEn("#dzCfOk");
  let salida = null;
  for (let i = 0; i < 90; i++) {
    salida = await ev(`(()=>{ const p=(window.__premiere||[])[0]; if(!p) return null;
      return { ...p, llamadas: window.__premiere.length,
        estado:(document.querySelector("#dzStatus")||{}).textContent?.trim().slice(0,140)||"" }; })()`);
    if (salida) break;
    await w(400);
  }
  if (!salida) mal("confirmar no exportó nada", { aviso });
  if (salida.llamadas !== 1)
    mal("el puente se llamó " + salida.llamadas + " veces en vez de una", salida);
  if (salida.cuantos !== 5)
    mal("faltan cuadros en la carpeta de Premiere: salieron " + salida.cuantos + " de 5. " +
      "Un hueco que desaparece adelanta un cuadro todo lo que sigue, y con audio eso " +
      "es el labial corrido", salida);
  if (salida.wav !== 0)
    mal("se mandó audio cuando la escena no tiene ninguno", salida);

  // ── 4. el XML nombra TANTOS archivos como cuadros, y con el nombre que el
  //       puente va a escribir (misma regla de limpieza en los dos lados)
  // El `pathurl` de FCP7 viene como `file://localhost/<archivo>`: lo que hay que
  // comparar con lo que escribe el puente es el NOMBRE DEL ARCHIVO.
  const nombres = (salida.xml.match(/<pathurl>([^<]+)<\/pathurl>/g) || [])
    .map(t => t.replace(/<\/?pathurl>/g, "").split("/").pop());
  const limpio = "El_Gato_final";
  if (!/<!DOCTYPE xmeml>/.test(salida.xml) || !/<xmeml version="4">/.test(salida.xml))
    mal("lo que sale no es un XML de FCP7: Premiere no lo importa", { muestra: salida.xml.slice(0, 120) });
  if (nombres.length !== 5)
    mal("el XML nombra " + nombres.length + " archivos y se mandan 5 cuadros: los que " +
      "sobran abren PERDIDOS en Premiere", { nombres });
  const esperados = nombres.map((_, i) => limpio + "_" + String(i + 1).padStart(4, "0") + ".png");
  if (nombres.join("|") !== esperados.join("|"))
    mal("los nombres del XML no son los que escribe el puente —que limpia el nombre de " +
      "la escena con otra regla—: Premiere abriría la secuencia con todos los cuadros " +
      "perdidos, pidiendo relinkear uno por uno",
      { nombres: nombres.slice(0, 3), esperaba: esperados.slice(0, 3) });

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }

  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));

  console.log("E2E Premiere OK " + JSON.stringify({
    avisaSinAudio: true, cancelarNoEscribe: true,
    cuadros: salida.cuantos, archivosEnElXml: nombres.length, primero: nombres[0],
  }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
