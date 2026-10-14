/* LA TOMA DEL ESTUDIO 3D → FONDOS EN EL 2D. CDP :9223 + mock :8791.

   Pedido de Mauro (v3.30): «armar en el 3D los escenarios y los fondos y
   traerlos a la composición… si animo una bici doblando en una esquina de un
   edificio, poder capturar toda la curva para los distintos fondos», «en el 2D
   traer sólo JPG o PNG, lo más liviano que mantenga calidad».

   A. En el estudio, con el panel «Toma»:
      1. tres claves de cámara (cuadros 1, 12 y 24) que doblan una esquina;
      2. entre claves la cámara va por una CURVA (no en línea recta) y pasa
         exacto por cada clave; el deslizador lleva la cámara a ese cuadro;
      3. renderiza JPG del tamaño pedido, y cada cuadro es distinto;
      4. Ctrl+Z saca la última clave; la toma viaja con el proyecto.
   B. Dentro de LOW: «Mandar la toma al 2D», un fondo cada 4 cuadros:
      5. una capa «Toma 3D · Toma 1» AL FONDO, de calco, con 6 dibujos JPG,
         cada uno expuesto desde su cuadro hasta el siguiente (1–4, 5–8…);
      6. volver a mandar REEMPLAZA (no apila capas); Ctrl+Z vuelve. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const base = process.argv[3] || "http://127.0.0.1:8791/ui/";

async function abrir(url) {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map(), errores = [];
  ws.onmessage = (event) => { const m = JSON.parse(event.data);
    if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (!m.id || !pending.has(m.id)) return; const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 180000);
    pending.set(n, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  return { send, errores, cerrar: async () => { ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { } } };
}
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

/* en el estudio: tocar el panel como lo toca una persona */
const AYUDA = `
  window.__t = {
    boton(texto) { const b = [...document.querySelectorAll(".toma3d button")].find(b => b.textContent.includes(texto));
      if (!b) throw Error("no está el botón " + texto); b.click(); return true; },
    poner(etiqueta, v) { const i = document.querySelector('.toma3d [aria-label="' + etiqueta + '"]');
      if (!i) throw Error("no está " + etiqueta);
      const proto = i.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(i, String(v));
      i.dispatchEvent(new Event(i.tagName === "SELECT" ? "change" : "input", { bubbles: true })); return true; },
    camara(pos, mira) { const e = __low3d; e.camera.position.set(...pos); e.controls.target.set(...mira); e.camera.lookAt(e.controls.target); e.controls.update(); return true; },
    donde() { const e = __low3d; return { pos: e.camera.position.toArray().map(v => Math.round(v * 1000) / 1000), mira: e.controls.target.toArray().map(v => Math.round(v * 1000) / 1000) }; },
  };`;
/* una esquina: la cámara viene por la calle (z) y dobla hacia x */
const K1 = { pos: [0, 1.6, 12], mira: [0, 1.6, 0] }, K12 = { pos: [0, 1.6, 2], mira: [6, 1.6, 2] }, K24 = { pos: [10, 1.6, 2], mira: [20, 1.6, 2] };

async function main() {
  /* ── A. el estudio solo ── */
  let pag = await abrir(base + "estudio3d/index.html");
  let send = pag.send;
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
  await ev(`try{localStorage.clear()}catch(e){}; __low3d.newProject(); ${AYUDA}; true`);
  // algo que fotografiar: la calle de la perspectiva, con sus fachadas
  await ev(`__low3d.setPerspectiva({ activa: true, esquema: "manzana", puntos: 2 }); true`); await w(300);
  await ev(`document.querySelector('[data-panel="toma"]').click(); true`); await w(300);
  if (!(await ev(`!!document.querySelector(".toma3d")`))) mal("no está el panel «Toma» en el estudio", {});
  await ev(`__t.poner("Cuadros de la toma", 24)`); await w(100);
  for (const [f, k] of [[1, K1], [12, K12], [24, K24]]) {
    await ev(`__t.poner("Cuadro", ${f})`); await w(80);
    await ev(`__t.camara(${JSON.stringify(k.pos)}, ${JSON.stringify(k.mira)})`);
    await ev(`__t.boton("Clave aquí")`); await w(120);
  }
  const t = await ev(`__low3d.getToma()`);
  if (t.cuadros !== 24 || t.claves.map((k) => k.cuadro).join() !== "1,12,24") mal("las tres claves no quedaron en la toma", t);
  const claves = await ev(`[...document.querySelectorAll(".toma3d-claves button")].map(b => b.textContent.trim())`);
  if (claves.length !== 3) mal("el panel no muestra las tres claves", claves);

  // 2. por cada clave exacto; entre claves, curva
  await ev(`__t.poner("Cuadro de la toma", 12)`); await w(100);
  const en12 = await ev(`__t.donde()`);
  if (en12.pos.some((v, i) => Math.abs(v - K12.pos[i]) > 1e-3)) mal("en el cuadro de la clave la cámara no está en la clave", en12);
  await ev(`__t.poner("Cuadro de la toma", 6)`); await w(100);
  const en6 = await ev(`__t.donde()`);
  // en línea recta, el cuadro 6 estaría en x = 0 (los dos extremos tienen x = 0): la curva ya empieza a doblar
  const recto = K1.pos.map((v, i) => v + (K12.pos[i] - v) * 5 / 11);
  const desvio = Math.hypot(en6.pos[0] - recto[0], en6.pos[2] - recto[2]);
  if (!(desvio > 0.05)) mal("entre claves la cámara va en línea recta: no dobla la esquina con una curva", { en6, recto });
  if (en6.pos[2] > K1.pos[2] + 1e-6 || en6.pos[2] < K12.pos[2] - 1e-6) mal("la curva se pasa de largo (va para atrás)", en6);

  // 3. render JPG
  const fotos = await ev(`(async()=>{ const r = await __low3d.tomaRender([1, 12, 24], 640, 360, { formato: "jpg", calidad: 0.85, lineas: true });
    const medir = (d) => new Promise(ok => { const im = new Image(); im.onload = () => ok({ w: im.naturalWidth, h: im.naturalHeight }); im.src = d; });
    return { tipos: r.map(x => x.data.slice(0, 15)), tam: await Promise.all(r.map(x => medir(x.data))), distintos: new Set(r.map(x => x.data)).size, kb: r.map(x => Math.round(x.data.length * 3 / 4 / 1024)) }; })()`);
  if (fotos.tipos.some((x) => x !== "data:image/jpeg")) mal("los fondos no salen en JPG", fotos.tipos);
  if (fotos.tam.some((s) => s.w !== 640 || s.h !== 360)) mal("los fondos no tienen el tamaño del cuadro", fotos.tam);
  if (fotos.distintos !== 3) mal("los tres cuadros de la toma dan la misma imagen (la cámara no se movió en el render)", fotos);
  const png = await ev(`(async()=>{ const r = await __low3d.tomaRender([1], 64, 36, { formato: "png", lineas: true }); return r[0].data.slice(0, 14); })()`);
  if (png !== "data:image/png") mal("el formato PNG no sale en PNG", png);

  // 4. Ctrl+Z y el proyecto
  await ev(`__low3d.undo(); true`); await w(100);
  if ((await ev(`__low3d.getToma().claves.length`)) !== 2) mal("Ctrl+Z no sacó la última clave", {});
  await ev(`__low3d.redo(); true`);
  const vuelta = await ev(`(()=>{ const p = __low3d.exportProject(); __low3d.newProject(); const limpio = __low3d.getToma().claves.length;
    __low3d.importProject(JSON.parse(JSON.stringify(p))); return { limpio, claves: __low3d.getToma().claves.map(k => k.cuadro) }; })()`);
  if (vuelta.limpio !== 0 || vuelta.claves.join() !== "1,12,24") mal("la toma no viaja con el proyecto (o un proyecto nuevo la conserva)", vuelta);
  const errA = pag.errores.filter((e) => !/ResizeObserver/.test(String(e)));
  await pag.cerrar();
  if (errA.length) mal("excepciones en el estudio", errA.slice(0, 3));

  /* ── B. dentro de LOW ── */
  pag = await abrir(base + "index.html?mock=1");
  send = pag.send;
  const evHost = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const evIframe = (expr) => evHost(`document.querySelector("#l3dFrame").contentWindow.eval(${JSON.stringify(expr)})`);
  for (let i = 0; i < 90; i++) { if (await evHost('document.readyState==="complete"&&typeof openL3d==="function"&&!!api').catch(() => false)) break; await w(400); }
  const doc = await evHost(`(async()=>{ try{localStorage.clear()}catch(e){}
    dzMenuAction("nuevo"); await new Promise(r=>setTimeout(r,2800));
    if (typeof closeL3d === "function") closeL3d();
    DZ.doc.scene.range.out = 24;
    return { w: DZ.doc.scene.width, h: DZ.doc.scene.height, capas: DZ.doc.scene.layers.length, fps: DZ.doc.scene.fps }; })()`);
  const mandar = async () => {
    await evHost(`openL3d()`);
    for (let i = 0; i < 120; i++) { if (await evIframe("!!window.__low3d").catch(() => false)) break; await w(250); }
    await evIframe(`${AYUDA}; true`);
    if (!(await evIframe(`!!document.querySelector(".toma3d")`))) await evIframe(`document.querySelector('[data-panel="toma"]').click(); true`);
    await w(400);
  };
  await mandar();
  await evIframe(`try{localStorage.clear()}catch(e){}; __low3d.newProject(); __low3d.setPerspectiva({ activa: true, esquema: "manzana", puntos: 2 }); true`);
  await w(300);
  let nota = "";
  for (let i = 0; i < 20; i++) { nota = await evIframe(`[...document.querySelectorAll(".toma3d .persp3d-nota")].map(n=>n.textContent).join(" | ")`); if (nota.includes(doc.w + "×" + doc.h)) break; await w(150); }
  if (!nota.includes(doc.w + "×" + doc.h) || !nota.includes(doc.fps + " cuadros por segundo")) mal("el panel Toma no recibió el cuadro y los fps del 2D", { nota, doc });
  const largo = await evIframe(`__low3d.getToma().cuadros`);
  if (largo !== 24) mal("la toma no tomó el largo de la escena del 2D", { largo });
  await evIframe(`__t.poner("Cuadro", 1)`); await evIframe(`__t.camara(${JSON.stringify(K1.pos)}, ${JSON.stringify(K1.mira)})`); await evIframe(`__t.boton("Clave aquí")`);
  await evIframe(`__t.poner("Cuadro", 24)`); await evIframe(`__t.camara(${JSON.stringify(K24.pos)}, ${JSON.stringify(K24.mira)})`); await evIframe(`__t.boton("Clave aquí")`);
  await evIframe(`__t.poner("Cada cuántos cuadros", 4)`); await w(150);
  await evIframe(`document.querySelector(".toma3d-check input").click(); true`); await w(100);   // con las líneas: que haya algo que fotografiar
  const rotulo = await evIframe(`document.querySelector(".toma3d-mandar").textContent`);
  if (!rotulo.includes("6 fondos")) mal("el botón no dice cuántos fondos va a mandar", rotulo);
  await evIframe(`__t.boton("Mandar la toma al 2D")`);
  const capa = async () => evHost(`(()=>{ const sc = DZ.doc.scene, ly = sc.layers[0], lv = ly && sc.level(ly.levelId);
    return { capas: sc.layers.length, nombre: ly && ly.name, tipo: lv && lv.type, dibujos: lv ? lv.drawings.length : 0,
      jpg: lv ? lv.drawings.every(d => /data-low="toma-3d"/.test(d.content) && /href="data:image\\/jpeg/.test(d.content)) : false,
      celdas: ly ? Array.from({ length: 24 }, (_, i) => ly.cellAt(i + 1)) : [], oculto: document.querySelector("#l3dView").hidden }; })()`);
  let rec = null;
  for (let i = 0; i < 80; i++) { rec = await capa(); if (/^Toma 3D/.test(rec.nombre || "")) break; await w(250); }
  if (!/^Toma 3D/.test(rec.nombre || "")) rec.avisoEstudio = await evIframe(`(document.querySelector(".toma3d .persp3d-aviso")||{}).textContent || ""`).catch(() => "(estudio cerrado)");
  if (rec.nombre !== "Toma 3D · Toma 1" || rec.tipo !== "reference" || rec.capas !== doc.capas + 1) mal("no apareció la capa de fondos de la toma al fondo", rec);
  if (rec.dibujos !== 6 || !rec.jpg) mal("la capa no tiene los 6 fondos en JPG", rec);
  const esperadas = Array.from({ length: 24 }, (_, i) => Math.floor(i / 4) + 1);
  if (rec.celdas.join() !== esperadas.join()) mal("los fondos no están expuestos cada 4 cuadros desde el suyo", rec.celdas);
  if (!rec.oculto) mal("después de mandar, LOW no volvió al 2D", rec);
  const tam = await evHost(`new Promise(r => { const ly = DZ.doc.scene.layers[0], lv = DZ.doc.scene.level(ly.levelId);
    const m = lv.byNumber(3).content.match(/href="([^"]+)"/); const im = new Image(); im.onload = () => r({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => r(null); im.src = m[1]; })`);
  if (!tam || tam.w !== doc.w || tam.h !== doc.h) mal("los fondos no tienen el tamaño del cuadro del 2D", { tam, doc });
  // se ve en la mesa en el cuadro 7 (el fondo 2)
  const mesa = await evHost(`(async()=>{ DZ.doc.goTo(7); await new Promise(r=>setTimeout(r,300)); const img = document.querySelector('#dzCanvas > svg image[data-low="toma-3d"]');
    const lv = DZ.doc.scene.level(DZ.doc.scene.layers[0].levelId); return { img: !!img, es2: !!img && img.getAttribute("href") === lv.byNumber(2).content.match(/href="([^"]+)"/)[1] }; })()`);
  if (!mesa.img || !mesa.es2) mal("en el cuadro 7 la mesa no muestra el fondo 2 de la toma", mesa);

  // 6. volver a mandar reemplaza; Ctrl+Z vuelve
  await mandar();
  await evIframe(`__t.poner("Cada cuántos cuadros", 2)`); await w(150);
  await evIframe(`__t.boton("Mandar la toma al 2D")`);
  for (let i = 0; i < 80; i++) { rec = await capa(); if (rec.dibujos === 12) break; await w(250); }
  if (rec.capas !== doc.capas + 1 || rec.dibujos !== 12) mal("volver a mandar la toma no reemplazó sus fondos (o apiló otra capa)", rec);
  await evHost(`DZ.history.undo(); true`); await w(200);
  rec = await capa();
  if (rec.dibujos !== 6) mal("Ctrl+Z no volvió a los fondos anteriores", rec);
  await evHost(`DZ.history.undo(); true`); await w(200);
  rec = await capa();
  if (rec.capas !== doc.capas) mal("el segundo Ctrl+Z no sacó la capa de la toma", rec);

  const graves = pag.errores.filter((e) => !/ResizeObserver/.test(String(e)));
  await pag.cerrar();
  if (graves.length) mal("hubo excepciones en LOW", graves.slice(0, 3));
  console.log("E2E toma 3D → fondos del 2D OK " + JSON.stringify({ desvioCurva: Math.round(desvio * 100) / 100, kb: fotos.kb }));
}

main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
