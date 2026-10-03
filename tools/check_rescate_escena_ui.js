/* EL RESCATE DE UNA ESCENA TIENE QUE RESCATAR. CDP :9223 + mock :8791.

   POR QUE EXISTE. Medido el 3-oct-2026 en la app real: dos capas y tres
   dibujos sin guardar, LOW se cierra mal, se vuelve a abrir. La pantalla
   inicial dice «Quedó una escena sin guardar» y ofrece «Recuperar lo que
   quedó sin guardar». Apretarlo creaba un documento NUEVO Y VACÍO: el botón
   delegaba en «Nuevo documento» esperando que `dzDocInit` encontrara el
   rescate, pero el documento nuevo ya no pasa por `dzDocInit`. Y peor: ese
   documento vacío pasaba a ser el rescate MÁS NUEVO, así que la próxima vez
   la pantalla ofrecía el vacío y el trabajo quedaba inalcanzable.

   Y un segundo camino, más probable para quien no lee carteles: abrir el
   mismo .low con «Abrir documento…». Ahí el rescate no se ofrecía nunca, y al
   seguir trabajando el autoguardado lo PISABA (misma identidad por ruta).

   Se exige:
   A. El botón de la pantalla inicial abre LO RESCATADO, en su archivo, y
      marcado como sin guardar (para que Ctrl+S lo escriba).
   B. Abrir el .low que tiene cambios sin guardar PREGUNTA, y «Recuperar»
      abre lo rescatado.
   C. Si el rescate es igual a lo que está en el disco, NO pregunta nada: un
      cartel de más en cada apertura enseña a apretar sin leer.
   D. Un documento recién creado y vacío no es «trabajo»: no se ofrece. */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

const RUTA = "C:\\mock\\perdida.low";
const escena = (capas) => ({
  format: "lowscene", version: 1, frame: 1, layerId: "ly_1",
  scene: { id: "sc_perdida", name: "perdida", fps: 24, width: 1920, height: 1080,
    levels: capas.map((n) => ({ id: "lv_" + n, name: "Nivel " + n, drawings: [
      { id: "dw_" + n, number: 1, content: '<g data-low-art="colour"></g><g data-low-art="line"><path d="M ' +
        (100 * n) + ' 100 L 900 ' + (200 * n) + '" stroke="#111" fill="none"/></g>' }] })),
    layers: capas.map((n) => ({ id: "ly_" + n, name: "Capa " + n, levelId: "lv_" + n, cells: [1] })) },
});
const GUARDADO = JSON.stringify(escena([1]), null, 1);       // lo que quedó en el disco
const RECUPERADO = escena([1, 2]);                            // lo que se perdió al cerrarse mal

async function main() {
  const tab = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  // AISLAMIENTO: todas las pruebas usan el mismo origen y por lo tanto el MISMO
  // localStorage. Una pestaña que quedó viva de otra prueba, con un documento
  // sin guardar, autoguarda su rescate cada 8 s y se cuela en éste (medido:
  // aparecían «scene:sc_a_…» y «path:mock.svg»). Se cierran antes de empezar.
  for (const t of await (await fetch(endpoint + "/json/list")).json())
    if (t.type === "page" && t.id !== tab.id) { try { await fetch(endpoint + "/json/close/" + t.id); } catch (_) { } }
  const ws = new WebSocket(tab.webSocketDebuggerUrl), pending = new Map(), errores = []; let id = 0;
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ({ data }) => { const m = JSON.parse(data);
    if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.j(Error(m.error.message)) : p.r(m.result); } };
  const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; pending.set(n, { r, j }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
  const clicEn = async (expr, que) => {
    const p = await ev(`(()=>{const e=${expr}; if(!e) return null; const r=e.getBoundingClientRect();
      if(!r.width||!r.height) return null; return {x:r.x+r.width/2, y:r.y+r.height/2};})()`);
    assert.ok(p, que);
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(400); };
  const listo = async () => { for (let i = 0; i < 120; i++) {
    if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!window.LOW?.workspace?.sceneRecovery').catch(() => false)) return; await wait(300); } };
  const sembrar = (contenido) => ev(`(()=>{ const st = LOW.workspace.sceneRecovery;
    return st.saveNow(st.identity({ path: ${JSON.stringify(RUTA)} }), ${JSON.stringify(contenido)},
      { path: ${JSON.stringify(RUTA)}, name: "perdida" }); })()`);
  const abierto = () => ev(`(()=>{ const sc = DZ.doc && DZ.doc.scene; const tab = dzDocumentTabCurrent && dzDocumentTabCurrent();
    return { hayDoc: !!DZ.doc, ruta: DZ.doc && DZ.doc.path, capas: sc ? sc.layers.length : 0,
      dibujoCapa2: !!(sc && sc.levels[1] && sc.levels[1].drawings[0] && /<path/.test(sc.levels[1].drawings[0].content)),
      sinGuardar: !!(DZ.dirty || (DZ.doc && DZ.doc.dirty)), pestanaSinGuardar: !!(tab && tab.dirty) }; })()`);
  // Abrir un .low tiene que verse como crearlo: con la línea de tiempo y SUS
  // capas. Medido en la app real: por «Abrir» o por el rescate, DZ.anim quedaba
  // en false —sólo la barra de transporte, sin capas ni X-sheet—, porque sólo
  // «Nuevo documento» encendía el espacio de animación.
  const lineaDeTiempo = () => ev(`(()=>{ const g = document.querySelector("#dzTlGrid"); const r = g && g.getBoundingClientRect();
    return { encendida: !!DZ.anim, grilla: !!(g && !g.hidden && r.height > 0),
      filas: document.querySelectorAll(".tl2-row[data-layer-row]").length }; })()`);
  const modal = () => ev(`(()=>{ const m = document.querySelector("#modal"); if (!m) return null;
    const t = (m.textContent || "").trim(); return t ? t.slice(0, 200) : null; })()`);
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    // el archivo en el «disco» del puente de prueba
    await send("Page.addScriptToEvaluateOnNewDocument", { source:
      "window.__lowFiles = { " + JSON.stringify(RUTA) + ": { path: " + JSON.stringify(RUTA) +
      ", name: 'perdida.low', content: " + JSON.stringify(GUARDADO) + " } };" });
    await send("Page.navigate", { url }); await listo();
    await ev('(()=>{ try{localStorage.clear()}catch(e){} return true; })()');
    assert.ok(await sembrar(RECUPERADO), "no se pudo sembrar el rescate");
    // quien se quedó con trabajo sin guardar estaba en ANIMACIÓN: «Nuevo
    // documento» lleva ahí, y LOW recuerda el último espacio
    await ev('(()=>{ try{ localStorage.setItem("low.workspace.active","animation"); }catch(e){} return true; })()');

    // ── A. EL BOTÓN DE LA PANTALLA INICIAL ───────────────────────────────────
    await send("Page.navigate", { url }); await listo(); await wait(2600);
    const ofrece = await ev(`(()=>{ const f = document.querySelector("#dzBienvenida2D .bien2d-rescate");
      return f && !f.hidden ? f.textContent.trim().slice(0, 160) : null; })()`);
    assert.ok(ofrece, "la pantalla inicial no ofrece el rescate de la escena");
    await clicEn(`document.querySelector('#dzBienvenida2D [data-a="rescate"]')`, "no se ve el botón «Recuperar»");
    await wait(1200);
    const a = await abierto();
    assert.ok(a.hayDoc, "«Recuperar» no abrió nada · " + JSON.stringify(a));
    assert.equal(a.capas, 2,
      "«Recuperar» no abrió lo rescatado: abrió " + a.capas + " capa(s), el rescate tenía 2. Es el " +
      "documento nuevo y vacío que creaba el botón · " + JSON.stringify(a));
    assert.ok(a.dibujoCapa2, "el dibujo de la Capa 2 no volvió · " + JSON.stringify(a));
    assert.equal(String(a.ruta).toLowerCase(), RUTA.toLowerCase(), "lo rescatado no quedó en SU archivo: Ctrl+S escribiría otro · " + JSON.stringify(a));
    assert.ok(a.sinGuardar && a.pestanaSinGuardar, "lo rescatado tiene que figurar SIN GUARDAR, o nadie sabe que hay que guardarlo · " + JSON.stringify(a));
    const ta = await lineaDeTiempo();
    assert.ok(ta.encendida && ta.grilla && ta.filas === 2,
      "lo rescatado se abrió con la línea de tiempo APAGADA o sin sus capas: sólo la barra de transporte · " + JSON.stringify(ta));

    // ── B. «ABRIR DOCUMENTO…» SOBRE EL MISMO ARCHIVO ─────────────────────────
    await send("Page.navigate", { url }); await listo(); await wait(1500);
    await ev(`(()=>{ void dzSceneOpen(${JSON.stringify(RUTA)}); return true; })()`);
    await wait(900);
    const pregunta = await modal();
    assert.ok(pregunta && /recuper/i.test(pregunta),
      "abrir un .low con cambios sin guardar no ofrece recuperarlos: al seguir trabajando el autoguardado los pisa · modal: " + pregunta);
    await clicEn(`[...document.querySelectorAll("#modal button")].find(b=>/recuper/i.test(b.textContent))`, "no hay botón para recuperar en el aviso");
    await wait(1000);
    const b = await abierto();
    assert.equal(b.capas, 2, "eligiendo «Recuperar» no se abrió lo rescatado · " + JSON.stringify(b));
    assert.ok(b.sinGuardar, "lo recuperado al abrir tiene que figurar sin guardar · " + JSON.stringify(b));
    const tb = await lineaDeTiempo();
    assert.ok(tb.encendida && tb.grilla && tb.filas === 2,
      "abrir un .low deja la línea de tiempo APAGADA o sin sus capas · " + JSON.stringify(tb));

    // ── B2. DESDE «DIBUJO», ABRIR NO TE CAMBIA DE ESPACIO ────────────────────
    await ev('(()=>{ try{ localStorage.setItem("low.workspace.active","drawing"); }catch(e){} return true; })()');
    await send("Page.navigate", { url }); await listo(); await wait(1500);
    await ev(`(()=>{ void dzSceneOpen(${JSON.stringify(RUTA)}); return true; })()`);
    await wait(900);
    await clicEn(`[...document.querySelectorAll("#modal button")].find(b=>/guardado/i.test(b.textContent))`, "no hay botón para abrir lo guardado");
    await wait(900);
    const enDibujo = await ev("LOW.workspace.workspaces.activeId");
    assert.equal(enDibujo, "drawing", "abrir un documento sacó al usuario de su espacio de trabajo");
    const b2 = await abierto();
    assert.equal(b2.capas, 1, "eligiendo «Abrir lo guardado» no se abrió lo del disco · " + JSON.stringify(b2));

    // ── C. SI EL RESCATE ES IGUAL AL DISCO, NO SE PREGUNTA ──────────────────
    await ev('(()=>{ try{localStorage.clear()}catch(e){} return true; })()');
    await send("Page.navigate", { url }); await listo();
    assert.ok(await sembrar(JSON.parse(GUARDADO)), "no se pudo sembrar el rescate igual al disco");
    await send("Page.navigate", { url }); await listo(); await wait(1500);
    await ev(`(()=>{ void dzSceneOpen(${JSON.stringify(RUTA)}); return true; })()`);
    await wait(900);
    const sinPregunta = await modal();
    assert.equal(sinPregunta, null, "preguntó por un rescate idéntico a lo guardado · " + sinPregunta);
    const c = await abierto();
    assert.equal(c.capas, 1, "no abrió lo guardado · " + JSON.stringify(c));
    // abierto recién arrancado y sin tocar: NO tiene cambios. Medido en la app
    // real: el lienzo vacío de la pantalla inicial se «organizaba» al abrir, eso
    // marcaba DZ.dirty, y cerrar preguntaba por cambios que no existían
    await wait(600);
    const cLimpio = await abierto();
    assert.equal(cLimpio.sinGuardar, false, "el archivo recién abierto figura con cambios sin guardar · " + JSON.stringify(cLimpio));

    // ── D. UN DOCUMENTO NUEVO VACÍO NO ES «TRABAJO» ─────────────────────────
    //    Se limpia el almacén desde una página SIN documento abierto: limpiarlo
    //    con uno abierto deja que el guardado de salida escriba su rescate (que
    //    es lo correcto) y la prueba mediría eso en vez del vacío.
    await send("Page.navigate", { url }); await listo();
    await ev('(()=>{ try{localStorage.clear()}catch(e){} return true; })()');
    // EL VACÍO QUE CREA EL PROGRAMA, no uno inventado: «Nuevo documento» mete la
    // hoja blanca (<rect data-low-page>) en el dibujo 1, y una regla que sólo
    // descuenta los planos vacíos lo cuenta como trabajo. Medido en la app real:
    // el documento vacío tapaba al rescate de dos capas.
    await ev(`(()=>{ const st = LOW.workspace.sceneRecovery; const vacio = dzEscenaEnBlanco().toJSON();
      return st.saveNow(st.identity({ path: "C:\\\\mock\\\\vacia.low" }), vacio, { path: "C:\\\\mock\\\\vacia.low", name: "vacia" }); })()`);
    await send("Page.navigate", { url }); await listo(); await wait(2600);
    const ofreceVacio = await ev(`(()=>{ const f = document.querySelector("#dzBienvenida2D .bien2d-rescate");
      const vacio = LOW.workspace.sceneRecovery.list().find(r => /vacia/.test(r.identity));
      return { esTrabajo: vacio ? dzEscenaTieneTrabajo(vacio.content) : "sin registro",
        ofrece: f && !f.hidden ? f.textContent.trim().slice(0, 140) : "",
        registros: LOW.workspace.sceneRecovery.list().map(r => r.identity + " trabajo=" + dzEscenaTieneTrabajo(r.content)) }; })()`);
    assert.equal(ofreceVacio.esTrabajo, false, "un documento recién creado y vacío cuenta como trabajo para rescatar · " + JSON.stringify(ofreceVacio));
    assert.ok(!/vacia/i.test(ofreceVacio.ofrece), "la pantalla inicial ofrece «recuperar» un documento VACÍO · " + JSON.stringify(ofreceVacio));

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    assert.deepEqual(graves.slice(0, 3), [], "hubo excepciones durante el recorrido");
    console.log("E2E rescate de escena OK " + JSON.stringify({ boton: a.capas + " capas", alAbrir: b.capas + " capas", igual: "sin pregunta", vacio: "no se ofrece" }));
  } finally {
    ws.close(); try { await fetch(endpoint + "/json/close/" + tab.id); } catch (_) { }
  }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
