/* DEL ESTUDIO 3D A LA CÁMARA MULTIPLANO DEL 2D (v3.33). CDP :9223 + mock :8791.

   Pedido de Mauro: «lo otro que faltaría es tener el flujo para usarlo en la
   mesa multiplano en el módulo 2D». Dentro de LOW:
   1. Una escena 3D con cosas cerca (un pino), en el medio (una casa) y lejos
      (un edificio). Toma → «En planos: 3» → «Mandar en planos».
   2. En el 2D aparecen 3 capas AL FONDO, del más lejano (abajo) al más cercano,
      cada una con su imagen (no vacía) y su profundidad data-z: el lejano > 0,
      el cercano < 0 (el plano de acción es adonde mira la cámara).
   3. Paralaje: con la cámara del 2D paneada, el plano cercano se corre MÁS
      que el lejano (es una mesa multiplano de verdad).
   4. Volver a mandar REEMPLAZA las capas; Ctrl+Z vuelve; otro Ctrl+Z las saca. */
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

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: base + "index.html?mock=1" });
    for (let i = 0; i < 90; i++) { if (await evHost('document.readyState==="complete"&&typeof openL3d==="function"&&!!api').catch(() => false)) break; await w(400); }
    const doc = await evHost(`(async()=>{ try{localStorage.clear()}catch(e){}
      dzMenuAction("nuevo"); await new Promise(r=>setTimeout(r,2800)); if (typeof closeL3d === "function") closeL3d();
      return { w: DZ.doc.scene.width, h: DZ.doc.scene.height, capas: DZ.doc.scene.layers.length }; })()`);
    const abrir = async () => {
      await evHost(`openL3d()`);
      for (let i = 0; i < 120; i++) { if (await evIframe("!!window.__low3d").catch(() => false)) break; await w(250); }
      await w(300);
      if (!(await evIframe(`!!document.querySelector(".toma3d")`))) await evIframe(`document.querySelector('[data-panel="toma"]').click(); true`);
      await w(400);
    };
    await abrir();
    // la escena: cerca, medio y lejos (colocadas por la API: lo que se prueba es el envío)
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
    if (!(await evIframe(`!!document.querySelector(".toma3d-mandar-planos")`))) mal("el panel Toma no tiene «Mandar en planos»", {});
    const mandar = async (n) => {
      await evIframe(`(()=>{ const s = document.querySelector('[aria-label="Cuántos planos"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, "${n}"); s.dispatchEvent(new Event("change", { bubbles: true }));
        return true; })()`); await w(150);
      await evIframe(`document.querySelector(".toma3d-mandar-planos").click(); true`);
    };
    await mandar(3);
    const capas = async () => evHost(`(async()=>{ const sc = DZ.doc.scene; const out = [];
      for (const ly of sc.layers) { const lv = sc.level(ly.levelId), d = lv && lv.byNumber(1); if (!d || !/data-low="plano-3d"/.test(d.content)) continue;
        const z = Number(d.content.match(/data-z="(-?\\d+)"/)[1]); const href = d.content.match(/href="([^"]+)"/)[1];
        const im = new Image(); im.src = href; await im.decode(); const c = document.createElement("canvas"); c.width = 160; c.height = 90; const g = c.getContext("2d"); g.drawImage(im, 0, 0, 160, 90);
        const px = g.getImageData(0, 0, 160, 90).data; let opacos = 0; for (let i = 3; i < px.length; i += 4) if (px[i] > 20) opacos++;
        out.push({ nombre: ly.name, indice: sc.layers.indexOf(ly), z, opacos, celdas: [1, sc.lastFrame()].map(f => ly.cellAt(f)) }); }
      return { total: sc.layers.length, planos: out, oculto: document.querySelector("#l3dView").hidden }; })()`);
    let rec = null;
    for (let i = 0; i < 60; i++) { rec = await capas(); if (rec.planos.length) break; await w(250); }

    // ── 2. las capas
    if (rec.planos.length < 2) mal("«Mandar en planos» no dejó capas de planos en el 2D", rec);
    if (rec.planos.some((p, i) => p.indice !== i)) mal("los planos no quedaron AL FONDO, en orden", rec.planos);
    if (rec.planos.some((p) => p.opacos < 20)) mal("un plano llegó vacío", rec.planos);
    for (let i = 1; i < rec.planos.length; i++) if (!(rec.planos[i].z < rec.planos[i - 1].z)) mal("los planos no van del más lejano (abajo) al más cercano (arriba)", rec.planos);
    if (!(rec.planos[0].z > 0) || !(rec.planos.at(-1).z < 0)) mal("el lejano no está detrás del plano de acción o el cercano no está delante", rec.planos);
    if (rec.planos.some((p) => p.celdas.some((c) => c !== 1))) mal("los planos no están expuestos en toda la escena", rec.planos);
    if (!rec.oculto) mal("después de mandar, LOW no volvió al 2D", {});
    const primeros = rec.planos.length;

    // ── 3. paralaje con la cámara del 2D
    const par = await evHost(`(()=>{ const txt = dzCuadroSvgTexto(1); const W = DZ.doc.scene.width, H = DZ.doc.scene.height;
      const salida = dzCamView(txt, { cx: W / 2 + 300, cy: H / 2, w: W, rot: 0 });
      const tmp = document.createElement("div"); tmp.innerHTML = salida;
      return [...tmp.querySelectorAll('g > g[transform]')].map(g => { const im = g.querySelector('image[data-low="plano-3d"]'); const m = g.getAttribute("transform").match(/translate\\((-?[\\d.]+)/);
        return im ? { z: Number(im.getAttribute("data-z")), dx: Number(m[1]) } : null; }).filter(Boolean); })()`);
    if (par.length !== primeros) mal("la cámara del 2D no aplica profundidad a los planos", par);
    const lejos = par.reduce((a, b) => (b.z > a.z ? b : a)), cerca = par.reduce((a, b) => (b.z < a.z ? b : a));
    // la cámara se corre 300: cada plano la ACOMPAÑA dx, así que en pantalla se
    // mueve 300 − dx. Lo cercano tiene que moverse más que lo lejano.
    const enPantalla = (p) => Math.abs(300 - p.dx);
    if (!(enPantalla(cerca) > enPantalla(lejos) * 2)) mal("no hay paralaje: en pantalla el plano cercano no se mueve más que el lejano", { lejos, cerca });

    // ── 4. volver a mandar reemplaza; Ctrl+Z vuelve; otro Ctrl+Z los saca
    await abrir();
    await mandar(4);
    for (let i = 0; i < 60; i++) { rec = await capas(); if (rec.planos.length !== primeros) break; await w(250); }
    const conOtroEnvio = rec.planos.length;
    if (rec.total - conOtroEnvio !== doc.capas) mal("volver a mandar apiló capas en vez de reemplazarlas", { rec, doc });
    await evHost(`DZ.history.undo(); true`); await w(200);
    rec = await capas();
    if (rec.planos.length !== primeros) mal("Ctrl+Z no volvió a los planos anteriores", rec);
    await evHost(`DZ.history.undo(); true`); await w(200);
    rec = await capas();
    if (rec.planos.length !== 0 || rec.total !== doc.capas) mal("el segundo Ctrl+Z no sacó los planos", rec);

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
    console.log("E2E del 3D a la multiplano OK " + JSON.stringify({ planos: primeros, conOtroEnvio, z: par.map((p) => p.z), dx: par.map((p) => p.dx) }));
  } finally {
    ws.close();
    try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  }
}

main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
