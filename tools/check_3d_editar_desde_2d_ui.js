/* EDITAR EN EL 3D UNA CAPA QUE VINO DEL 3D (v3.56). CDP :9223 + mock :8791.

   Antes, el 2D recibía imágenes sueltas: si había que mover un edificio, se
   rearmaba la escena en el 3D y se volvía a mandar todo a mano. Ahora:
   1. Se manda una escena en planos desde el panel Toma: cada nivel del 2D
      guarda su ORIGEN (el proyecto 3D y los ajustes del envío).
   2. Después se trabaja en OTRA escena del 3D (la tuya), y se cierra el estudio.
   3. En el 2D, clic derecho en el nombre de la capa → «Editar en el estudio
      3D…»: se abre el estudio con el proyecto de esa capa y la barra «Editando…».
   4. Se gira la vista y «Actualizar en el 2D»: los planos se REEMPLAZAN (no se
      apilan), con el mismo nombre, en UN Ctrl+Z, y el origen pasa al proyecto
      nuevo. El estudio se cierra solo.
   5. Al volver al estudio, la barra ya no está y está TU escena, como estaba.
   6. «Cancelar» devuelve tu escena sin mandar nada. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const base = process.argv[3] || "http://127.0.0.1:8791/ui/";

async function main() {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map(), errores = [];
  ws.onmessage = (event) => { const m = JSON.parse(event.data);
    if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (!m.id || !pending.has(m.id)) return; const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 120000);
    pending.set(n, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const evHost = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const evIframe = (expr) => evHost(`document.querySelector("#l3dFrame").contentWindow.eval(${JSON.stringify(expr)})`);
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const esperar = async (expr, enIframe = false, veces = 80) => {
    for (let i = 0; i < veces; i++) { if (await (enIframe ? evIframe(expr) : evHost(expr)).catch(() => false)) return true; await w(250); }
    return false;
  };

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: base + "index.html?mock=1" });
    for (let i = 0; i < 90; i++) { if (await evHost('document.readyState==="complete"&&typeof openL3d==="function"&&!!api').catch(() => false)) break; await w(400); }
    await evHost(`(async()=>{ try{localStorage.clear()}catch(e){}
      dzMenuAction("nuevo"); await new Promise(r=>setTimeout(r,2800)); if (typeof closeL3d === "function") closeL3d(); return true; })()`);
    await evHost(`openL3d()`);
    if (!(await esperar("!!window.__low3d", true, 120))) mal("el estudio 3D no cargó", {});
    await w(500);

    // ── 1. una escena en planos, mandada desde el panel Toma ─────────────────
    await evIframe(`(async()=>{ try{localStorage.setItem("low3d:guia-fondos","1")}catch(e){}; const e = __low3d; e.newProject(); e.setView("persp");
      __lowStore.setCurrentTool("pieza"); await new Promise(r => setTimeout(r, 400));
      const pz = (id) => { document.querySelector('.biblio3d-grilla [data-pieza="' + id + '"]').click(); return e.getPiezaActiva(); };
      const V = e.camera.position.constructor;
      e.colocarPieza(pz("plano-pino"), new V(-2.5, 0, 9), { escala: 1, giro: 0 });
      e.colocarPieza(pz("plano-casa"), new V(0, 0, 0), { escala: 1, giro: 0 });
      e.colocarPieza(pz("plano-edificio"), new V(6, 0, -40), { escala: 1, giro: 0 });
      e.camera.position.set(0, 2, 16); e.controls.target.set(0, 2, 0); e.camera.lookAt(e.controls.target); e.controls.update();
      document.querySelector('[data-panel="toma"]').click(); return true; })()`);
    await w(500);
    const trazosCalle = await evIframe(`__low3d.strokes.length`);
    await evIframe(`(()=>{ const s = document.querySelector('[aria-label="Cuántos planos"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, "2"); s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
    await w(150);
    await evIframe(`document.querySelector(".toma3d-mandar-planos").click(); true`);
    const planos = `(()=>{ const sc = DZ.doc.scene; return sc.levels.filter(l => l.fuente3d && l.fuente3d.tipo === "planos")
      .map(l => ({ id: l.id, proyecto: l.fuente3d.proyecto, planos: l.fuente3d.params.planos, hay: !!sc.proyectos3d[l.fuente3d.proyecto] })); })()`;
    if (!(await esperar(planos + ".length > 0"))) mal("los planos no llegaron al 2D", {});
    const p1 = await evHost(planos);
    if (!p1.every((p) => p.hay && p.planos === 2)) mal("los planos llegaron sin su origen (proyecto y ajustes)", p1);
    const origen1 = p1[0].proyecto;
    const json1 = await evHost(`JSON.parse(DZ.doc.scene.proyectos3d["${origen1}"]).strokes.length`);
    if (json1 !== trazosCalle) mal("el proyecto guardado no es la escena que se mandó", { json1, trazosCalle });
    const aviso3d = await evIframe(`(document.querySelector(".toma3d .persp3d-aviso")||{}).textContent||""`);

    // ── 2. otra escena en el 3D (la tuya), y se cierra el estudio ───────────
    await evHost(`openL3d()`); await w(300);
    // la herramienta seguía en «pieza» con el panel Toma adelante: se cambia y se
    // vuelve para que se abra la biblioteca
    await evIframe(`(async()=>{ const e = __low3d; e.newProject(); e.setView("persp"); __lowStore.setCurrentTool("pencil"); await new Promise(r => setTimeout(r, 150));
      __lowStore.setCurrentTool("pieza"); await new Promise(r => setTimeout(r, 400));
      document.querySelector('.biblio3d-grilla [data-pieza="plano-casa"]').click();
      e.colocarPieza(e.getPiezaActiva(), new e.camera.position.constructor(1, 0, 1), { escala: 1, giro: 0 }); return true; })()`);
    const trazosMios = await evIframe(`__low3d.strokes.length`);
    if (!(trazosMios > 0 && trazosMios !== trazosCalle)) mal("la escena propia no quedó distinta de la mandada", { trazosMios, trazosCalle });
    await evHost(`closeL3d(); true`);

    // ── 3. clic derecho en la capa → «Editar en el estudio 3D…» ─────────────
    const capaId = await evHost(`(()=>{ const sc = DZ.doc.scene, lv = sc.levels.find(l => l.fuente3d && l.fuente3d.tipo === "planos"); return sc.layers.find(l => l.levelId === lv.id).id; })()`);
    const abrioMenu = await evHost(`(()=>{ const n = document.querySelector('.tl2-row[data-layer-row="${capaId}"] .tl2-name');
      const r = n ? n.getBoundingClientRect() : { left: 300, top: 300, width: 0, height: 0 };
      const ev = new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
      if (n) n.dispatchEvent(ev); else LOW.capaMenu.abrir(ev, "${capaId}");
      return { real: !!n, items: [...document.querySelectorAll(".ctx-menu .ctx-label")].map(x => x.textContent) }; })()`);
    if (!abrioMenu.items.includes("Editar en el estudio 3D…")) mal("el menú de la capa no ofrece editarla en el 3D", abrioMenu);
    await evHost(`[...document.querySelectorAll(".ctx-menu .ctx-item")].find(b => b.textContent.includes("Editar en el estudio 3D")).click(); true`);
    if (!(await esperar(`!document.querySelector("#l3dView").hidden`))) mal("el estudio no se abrió", {});
    if (!(await esperar(`!!document.querySelector(".fuente2d-barra")`, true))) mal("no apareció la barra «Editando… del 2D»", {});
    const enEdicion = await evIframe(`({ trazos: __low3d.strokes.length, fuente: __low3d.enFuente2D(), texto: document.querySelector(".fuente2d-barra").textContent })`);
    if (!enEdicion.fuente || enEdicion.trazos !== trazosCalle) mal("el estudio no abrió el proyecto de esa capa", { enEdicion, trazosCalle });
    // el autoguardado sigue resguardando TU escena, no la que vino del 2D
    const resguardo = await evIframe(`(()=>{ let j = null; const orig = JSON.stringify; JSON.stringify = function (v) { if (v && v.format === "low3d") j = v; return orig.apply(this, arguments); };
      try { __low3d.scheduleAutosave(); } finally { } return new Promise(r => setTimeout(() => { JSON.stringify = orig; r(j ? j.strokes.length : -1); }, 1200)); })()`);
    if (resguardo !== trazosMios) mal("editando la capa, el autoguardado guarda la escena del 2D en vez de la tuya", { resguardo, trazosMios });

    // ── 4. girar la vista y «Actualizar en el 2D» ────────────────────────────
    const pasos = await evHost(`DZ.doc.history.undoStack.length`);
    await evIframe(`(()=>{ const e = __low3d; e.camera.position.set(-6, 3, 14); e.controls.target.set(0, 2, 0); e.camera.lookAt(e.controls.target); e.controls.update(); return true; })()`);
    await evIframe(`document.querySelector(".fuente2d-actualizar").click(); true`);
    if (!(await esperar(`document.querySelector("#l3dView").hidden`))) mal("el estudio no volvió al 2D después de actualizar", {});
    const p2 = await evHost(planos);
    if (p2.length !== 2) mal("actualizar apiló o perdió planos", p2);
    if (p2.some((p) => p.proyecto === origen1 || !p.hay)) mal("el origen no pasó al proyecto actualizado", { origen1, p2 });
    const pasos2 = await evHost(`DZ.doc.history.undoStack.length`);
    if (pasos2 !== pasos + 1) mal("actualizar no es UN paso de Ctrl+Z", { pasos, pasos2 });
    await evHost(`DZ.doc.history.undo(); true`);
    const p3 = await evHost(planos);
    if (p3.length !== 2 || p3.some((p) => p.proyecto !== origen1)) mal("Ctrl+Z no devolvió los planos de antes", p3);
    await evHost(`DZ.doc.history.redo(); true`);
    // guardar y reabrir: el origen sobrevive al archivo
    const reabierto = await evHost(`(()=>{ const sc = new LOW.animation.Scene(JSON.parse(JSON.stringify(DZ.doc.scene.toJSON())));
      return sc.levels.filter(l => l.fuente3d).map(l => !!sc.proyectos3d[l.fuente3d.proyecto]); })()`);
    if (reabierto.length !== 2 || !reabierto.every(Boolean)) mal("el origen no sobrevive a guardar y reabrir", reabierto);

    // ── 5. tu escena vuelve, sin la barra ───────────────────────────────────
    await evHost(`openL3d()`); await w(600);
    const despues = await evIframe(`({ trazos: __low3d.strokes.length, fuente: __low3d.enFuente2D(), barra: !!document.querySelector(".fuente2d-barra") })`);
    if (despues.fuente || despues.barra || despues.trazos !== trazosMios) mal("después de actualizar no volvió tu escena", { despues, trazosMios });

    // ── 6. «Cancelar» vuelve sin mandar nada ────────────────────────────────
    // actualizar los planos los rehace como capas nuevas: se busca la capa otra vez
    await evHost(`(()=>{ closeL3d(); const sc = DZ.doc.scene, lv = sc.levels.find(l => l.fuente3d && l.fuente3d.tipo === "planos");
      return LOW.animation.layout3d.editar(sc.layers.find(l => l.levelId === lv.id).id); })()`);
    if (!(await esperar(`!!document.querySelector(".fuente2d-barra")`, true))) mal("la segunda vez no apareció la barra", {});
    const pasos3 = await evHost(`DZ.doc.history.undoStack.length`);
    await evIframe(`document.querySelector(".fuente2d-cancelar").click(); true`);
    await w(500);
    const cancelado = await evIframe(`({ trazos: __low3d.strokes.length, fuente: __low3d.enFuente2D(), barra: !!document.querySelector(".fuente2d-barra") })`);
    if (cancelado.fuente || cancelado.barra || cancelado.trazos !== trazosMios) mal("Cancelar no devolvió tu escena", { cancelado, trazosMios });
    if ((await evHost(`DZ.doc.history.undoStack.length`)) !== pasos3) mal("Cancelar mandó algo al 2D", {});

    const errB = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    if (errB.length) mal("errores en la página", errB);
    console.log("E2E editar en el 3D una capa del 2D OK " + JSON.stringify({ menuReal: abrioMenu.real, trazosCalle, trazosMios, aviso3d: aviso3d.slice(0, 50) }));
  } finally {
    try { await send("Page.close"); } catch (_) { /* ya cerrada */ }
    ws.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
