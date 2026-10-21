/* EL TALLER DE PERSONAJE → LA HOJA DE MODELO Y EL GIRO EN EL 2D. CDP :9223 + mock :8791.

   Pedido de Mauro (v3.37): «hacer el modelo y girarlo en el módulo 3D… un
   módulo pensado para armar las vistas del personaje… sin IA».

   Dentro de LOW, con el estudio 3D abierto y el taller (panel «Personaje»),
   tocando los botones como una persona:
   1. «Mandar hoja de modelo»: una capa de REFERENCIA AL FONDO, «Hoja de modelo
      · Personaje», con UN dibujo: las cinco vistas (Frente, Tres cuartos,
      Perfil, Tres cuartos de espalda, Espalda) lado a lado en PNG, sus nombres y las líneas de modelo; LOW vuelve al 2D,
      el estudio recibe el aviso y la hoja se ve en la mesa;
   2. «Mandar el giro en cuadros»: otra capa, «Giro · Personaje», con una
      vista por cuadro (1 a 5), cada una de una imagen distinta;
   3. volver a mandar la hoja la REEMPLAZA (no apila capas);
   4. Ctrl+Z deshace de a un paso: el reemplazo, el giro, la hoja. */
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

async function main() {
  const pag = await abrir(base + "index.html?mock=1");
  const send = pag.send;
  const evHost = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const evIframe = (expr) => evHost(`document.querySelector("#l3dFrame").contentWindow.eval(${JSON.stringify(expr)})`);
  for (let i = 0; i < 90; i++) { if (await evHost('document.readyState==="complete"&&typeof openL3d==="function"&&!!api').catch(() => false)) break; await w(400); }
  const doc = await evHost(`(async()=>{ try{localStorage.clear()}catch(e){}
    dzMenuAction("nuevo"); await new Promise(r=>setTimeout(r,2800));
    if (typeof closeL3d === "function") closeL3d();
    DZ.doc.scene.range.out = 12;
    return { w: DZ.doc.scene.width, h: DZ.doc.scene.height, capas: DZ.doc.scene.layers.length }; })()`);

  // abrir el estudio y, la primera vez, el taller con el maniquí «Cartoon»
  const alEstudio = async () => {
    await evHost(`openL3d()`);
    for (let i = 0; i < 120; i++) { if (await evIframe("!!window.__low3d").catch(() => false)) break; await w(250); }
    await w(300);
    if (!(await evIframe(`!!document.querySelector(".taller3d")`))) await evIframe(`document.querySelector('[data-panel="personaje"]').click(); true`);
    await w(300);
  };
  await alEstudio();
  await evIframe(`try{localStorage.clear()}catch(e){}; __low3d.newProject(); true`); await w(200);
  if (!(await evIframe(`__low3d.enTaller()`))) {
    await evIframe(`document.querySelector('[data-cuerpo="mujer"]').click(); true`); await w(150);
    await evIframe(`document.querySelector(".taller3d-entrar").click(); true`);
    await w(500);
  }
  await evIframe(`__low3d.personajesListos()`);
  if (!(await evIframe(`__low3d.enTaller() && !!__low3d.personajeDelTaller() && !!document.querySelector(".taller3d-hoja")`))) mal("no se abrió el taller de personaje dentro de LOW", {});

  const capas = async () => evHost(`(()=>{ const sc = DZ.doc.scene;
    return sc.layers.map((ly, i) => { const lv = sc.level(ly.levelId);
      return { i, nombre: ly.name, tipo: lv && lv.type, dibujos: lv ? lv.drawings.length : 0,
        imgs: lv ? lv.drawings.map(d => (d.content.match(/<image[^>]+href="data:image\\/png;base64,/g) || []).length) : [],
        textos: lv ? lv.drawings.map(d => (d.content.match(/<text[^>]*>([^<]*)</g) || []).map(t => t.replace(/<[^>]*>|</g, ""))) : [],
        lineas: lv ? lv.drawings.map(d => (d.content.match(/<line /g) || []).length) : [],
        hrefs: lv ? lv.drawings.map(d => (d.content.match(/href="([^"]{0,64})/) || [])[1] + ":" + d.content.length) : [],
        celdas: Array.from({ length: 6 }, (_, k) => ly.cellAt(k + 1)) }; }); })()`);
  const esperar = async (cond) => { let r = null; for (let i = 0; i < 80; i++) { r = await capas(); if (cond(r)) return r; await w(250); } return r; };

  // 1. la hoja de modelo
  await evIframe(`document.querySelector(".taller3d-hoja").click(); true`);
  let r = await esperar((cs) => cs.some((c) => /^Hoja de modelo/.test(c.nombre || "")));
  let hoja = r[0];
  if (r.length !== doc.capas + 1 || !hoja || hoja.nombre !== "Hoja de modelo · Personaje" || hoja.tipo !== "reference")
    mal("no apareció la capa «Hoja de modelo · Personaje» de referencia al fondo", { r, doc });
  if (hoja.dibujos !== 1 || hoja.imgs[0] !== 5) mal("la hoja no tiene un dibujo con las cinco vistas en PNG", hoja);
  const nombres = hoja.textos[0].slice(0, 5);
  if (nombres.join() !== "Frente,Tres cuartos,Perfil,Tres cuartos de espalda,Espalda") mal("las vistas de la hoja no llevan su nombre", hoja.textos[0]);
  if (!(hoja.lineas[0] >= 6) || !hoja.textos[0].includes("Hombros") || !hoja.textos[0].includes("Rodillas"))
    mal("la hoja no trae las líneas de modelo rotuladas", { lineas: hoja.lineas, textos: hoja.textos[0] });
  if (!(await evHost(`document.querySelector("#l3dView").hidden`))) mal("después de mandar la hoja, LOW no volvió al 2D", {});
  const mesa = await evHost(`(async()=>{ DZ.doc.goTo(1); await new Promise(r=>setTimeout(r,300));
    const ims = [...document.querySelectorAll('#dzCanvas > svg image[data-low="toma-3d"]')];
    const sheet = document.querySelector('#dzCanvas > svg').getBoundingClientRect();
    return { n: ims.length, dentro: ims.every(im => { const b = im.getBoundingClientRect(); return b.width > 20 && b.left >= sheet.left - 1 && b.right <= sheet.right + 1; }) }; })()`);
  if (mesa.n < 5 || !mesa.dentro) mal("la hoja de modelo no se ve en la mesa, dentro de la hoja", mesa);

  // el estudio recibió la respuesta
  await alEstudio();
  let aviso = "";
  for (let i = 0; i < 20; i++) { aviso = await evIframe(`(document.querySelector(".taller3d .persp3d-aviso")||{}).textContent||""`); if (/hoja de modelo/i.test(aviso) && !/Mandando/.test(aviso)) break; await w(150); }
  if (!/está en la capa/.test(aviso)) mal("el taller no recibió la confirmación del 2D", aviso);

  // 2. el giro en cuadros
  await evIframe(`document.querySelector(".taller3d-giro").click(); true`);
  r = await esperar((cs) => cs.some((c) => /^Giro/.test(c.nombre || "")));
  const giro = r.find((c) => /^Giro/.test(c.nombre || ""));
  if (r.length !== doc.capas + 2 || !giro || giro.nombre !== "Giro · Personaje" || giro.tipo !== "reference")
    mal("no apareció la capa «Giro · Personaje»", r);
  if (giro.dibujos !== 5 || giro.imgs.some((n) => n !== 1)) mal("el giro no tiene una vista por dibujo", giro);
  if (giro.celdas.slice(0, 5).join() !== "1,2,3,4,5") mal("el giro no pone una vista por cuadro (1 a 5)", giro.celdas);
  const tam = await evHost(`(async()=>{ const sc = DZ.doc.scene, ly = sc.layers.find(l => /^Giro/.test(l.name)), lv = sc.level(ly.levelId);
    const hrefs = lv.drawings.map(d => d.content.match(/href="([^"]+)"/)[1]);
    const medir = (s) => new Promise(ok => { const im = new Image(); im.onload = () => ok({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => ok(null); im.src = s; });
    return { distintas: new Set(hrefs).size, tam: await medir(hrefs[0]) }; })()`);
  if (tam.distintas !== 5) mal("las cinco vistas del giro son la misma imagen (el personaje no giró)", tam);
  if (!tam.tam || tam.tam.w !== doc.w || tam.tam.h !== doc.h) mal("las vistas del giro no tienen el tamaño del cuadro del 2D", { tam, doc });

  // 3. volver a mandar la hoja la reemplaza
  await alEstudio();
  await evIframe(`document.querySelector('.taller3d input[data-hoja="90"]').click(); true`); await w(200);   // sin el perfil: cuatro vistas
  await evIframe(`document.querySelector(".taller3d-hoja").click(); true`);
  r = await esperar((cs) => { const h = cs.find((c) => /^Hoja de modelo/.test(c.nombre || "")); return h && h.imgs[0] === 4; });
  hoja = r.find((c) => /^Hoja de modelo/.test(c.nombre || ""));
  if (r.length !== doc.capas + 2 || !hoja || hoja.imgs[0] !== 4) mal("volver a mandar la hoja no la reemplazó (o apiló otra capa)", r);

  // 4. Ctrl+Z de a un paso
  await evHost(`DZ.history.undo(); true`); await w(200);
  r = await capas(); hoja = r.find((c) => /^Hoja de modelo/.test(c.nombre || ""));
  if (!hoja || hoja.imgs[0] !== 5) mal("Ctrl+Z no volvió a la hoja de cinco vistas", r);
  await evHost(`DZ.history.undo(); true`); await w(200);
  r = await capas();
  if (r.some((c) => /^Giro/.test(c.nombre || "")) || r.length !== doc.capas + 1) mal("Ctrl+Z no sacó la capa del giro", r);
  await evHost(`DZ.history.undo(); true`); await w(200);
  r = await capas();
  if (r.length !== doc.capas) mal("Ctrl+Z no sacó la capa de la hoja", r);

  // 5. la ACTUACIÓN para rotoscopiar (v3.39): «Caminar» en el taller y «Mandar la
  //    actuación al 2D» → una capa «Actuación · Personaje» con un cuadro por cuadro
  await alEstudio();
  await evIframe(`document.querySelector('[data-modo="posar"]').click(); true`); await w(300);
  const nAct = await evIframe(`__low3d.setCuadroTaller(1), __low3d.ponerAnimacionTaller("Walk_Loop", 24, 1)`);
  await w(300);
  await evIframe(`document.querySelector(".taller3d-actuacion").click(); true`);
  r = await esperar((cs) => cs.some((c) => /^Actuación/.test(c.nombre || "")));
  const act = r.find((c) => /^Actuación/.test(c.nombre || ""));
  if (!act || act.nombre !== "Actuación · Personaje" || act.tipo !== "reference") mal("no llegó la capa «Actuación · Personaje» al 2D", r);
  const actCeldas = await evHost(`(()=>{ const sc = DZ.doc.scene, ly = sc.layers.find(l => /^Actuación/.test(l.name)), lv = sc.level(ly.levelId);
    return { dibujos: lv.drawings.length, celdas: Array.from({ length: ${nAct} }, (_, k) => ly.cellAt(k + 1)), distintos: new Set(lv.drawings.map(d => d.content)).size }; })()`);
  if (actCeldas.dibujos !== nAct || actCeldas.celdas.some((c, k) => c !== k + 1) || actCeldas.distintos < nAct - 2) mal("la actuación no trae un dibujo distinto por cuadro", { nAct, actCeldas });

  const graves = pag.errores.filter((e) => !/ResizeObserver/.test(String(e)));
  await pag.cerrar();
  if (graves.length) mal("hubo excepciones en LOW", graves.slice(0, 3));
  console.log("OK check_taller_hoja_2d_ui: " + JSON.stringify({ nombres, mesa, giro: giro.celdas, tam, actuacion: nAct }));
}

main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
