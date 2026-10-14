/* 🏙 LA CÁMARA DEL LAYOUT EN EL ESTUDIO 3D, Y «MANDAR AL 2D».
   CDP :9223 + mock :8791.

   Historia: en v3.26 el panel «Perspectiva» armaba esquemas (Calle, Manzana,
   Habitación) con cientos de líneas de colores. En v3.29.3 Mauro: «esa vista de
   calle es de lo más inútil y tiene mucho ruido». Ahora el panel es «Cámara»:
   sin esquemas; el espacio se arma con el piso, guías y cajas, y la cámara en
   perspectiva hace fugar todo sola.
   A. En el estudio suelto:
      1. El panel «Cámara» no arma NINGUNA línea (cero ruido) y, con el cuadro
         del 2D prendido, se ven el marco y el horizonte.
      2. EXACTITUD: rectas paralelas a cada eje, proyectadas, pasan por el punto
         de fuga marcado (a menos de medio píxel). De frente fuga sólo Z, en el
         centro; la cámara NO salta a otro lugar al elegir un encuadre.
      3. En esquina: fugan X y Z sobre el mismo horizonte, la vertical no fuga.
         Desde arriba y desde abajo: fugan los tres.
      4. La altura de los ojos y el giro mueven la cámara; el giro corre los
         puntos de fuga.
      5. Se guarda con el proyecto (.low3d) y vuelve igual.
   B. Dentro de LOW («Mandar este encuadre al 2D», en el panel Toma):
      6. El estudio recibe el tamaño del cuadro del 2D.
      7. Crea la capa de calco «Layout 3D» AL FONDO, con la imagen del tamaño
         del cuadro, y la perspectiva de la escena pasa a ser la de la cámara.
      8. Volver a mandar REEMPLAZA el layout (no apila capas); Ctrl+Z vuelve. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const base = process.argv[3] || "http://127.0.0.1:8791/ui/";

async function abrir(url) {
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
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  return { ws, send, errores, cerrar: async () => { ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { } } };
}
const w = ms => new Promise(r => setTimeout(r, ms));
const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

/* Lo que se evalúa DENTRO del estudio (suelto o en el iframe de LOW). */
const AYUDA = `
  window.__t = {
    boton(texto) { const b = [...document.querySelectorAll(".persp3d button")].find(b => b.textContent.includes(texto));
      if (!b) throw Error("no está el botón " + texto); b.click(); return true; },
    rango(etiqueta, v) { const i = document.querySelector('.persp3d input[aria-label="' + etiqueta + '"]');
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      set.call(i, String(v)); i.dispatchEvent(new Event("input", { bubbles: true })); return true; },
    /* cuánto se aparta del punto de fuga, en píxeles, la peor de las rectas de un eje */
    exactitud(eje) {
      const e = __low3d, cam = e.perspCamera, V = cam.position.constructor;
      const w = e.canvas.clientWidth, h = e.canvas.clientHeight;
      const pr = (v) => { const n = v.clone().project(cam); return { x: (n.x + 1) / 2 * w, y: (1 - n.y) / 2 * h }; };
      const c = e.vpEl.querySelector('g[data-p="vp-' + eje + '"] circle');
      if (!c) return { sinPunto: true };
      const vp = { x: +c.getAttribute("cx"), y: +c.getAttribute("cy") };
      const fwd = new V(); cam.getWorldDirection(fwd);
      const k = { x: 0, y: 1, z: 2 }[eje], signo = fwd.getComponent(k) >= 0 ? 1 : -1;
      // rectas paralelas al eje, en una grilla alrededor de la cámara
      let peor = 0, medidas = 0;
      const otros = [0, 1, 2].filter((x) => x !== k);
      for (const u of [-12, -6, -2, 2, 6, 12]) for (const v of [-12, -6, -2, 2, 6, 12]) {
        const p = cam.position.clone(); p.setComponent(otros[0], p.getComponent(otros[0]) + u); p.setComponent(otros[1], p.getComponent(otros[1]) + v);
        const a = p.clone(), b = p.clone();
        a.setComponent(k, cam.position.getComponent(k) + signo * 60);
        b.setComponent(k, cam.position.getComponent(k) + signo * 400);
        const lado = (q) => q.clone().sub(cam.position).dot(fwd) > 1;
        if (!lado(a) || !lado(b)) continue;
        const A = pr(a), B = pr(b), dx = B.x - A.x, dy = B.y - A.y, n = Math.hypot(dx, dy);
        if (n < 2) continue;
        peor = Math.max(peor, Math.abs((vp.x - A.x) * dy - (vp.y - A.y) * dx) / n); medidas++;
      }
      return { peor, medidas, vp };
    },
  };
  true`;

async function main() {
  /* ── A. el estudio suelto ── */
  let pag = await abrir(base + "estudio3d/index.html");
  let { send } = pag;
  let ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
  await ev(`try{localStorage.clear()}catch(e){}; __low3d.newProject(); ${AYUDA}`);
  const boton = await ev(`document.querySelector('[data-panel="persp"]').textContent.trim()`);
  if (boton !== "Cámara") mal("el botón del panel no se llama «Cámara»", { boton });
  await ev(`document.querySelector('[data-panel="persp"]').click()`); await w(250);
  if (!(await ev(`!!document.querySelector(".persp3d")`))) mal("el botón Cámara no abre el panel", {});
  for (const viejo of ["Calle", "Manzana", "Habitación", "Sólo líneas", "Muchas líneas"])
    if (await ev(`[...document.querySelectorAll(".persp3d button")].some(b => b.textContent.includes(${JSON.stringify(viejo)}))`)) mal("quedó un esquema viejo en el panel: " + viejo, {});
  const antesXZ = await ev(`[__low3d.camera.position.x, __low3d.camera.position.z]`);
  await ev(`__t.boton("De frente")`); await w(500);
  let st = await ev(`({ a: __low3d.getPerspectiva(), lineas: __low3d.lineasDePerspectiva(), hijos: __low3d.persp3d.group.children.length,
    hz: !!__low3d.vpEl.querySelector('[data-p="horizonte"]'), marco: !!__low3d.vpEl.querySelector('[data-p="marco"]'),
    rayos: __low3d.vpEl.querySelectorAll('g[data-p^="vp-"] line').length, xz: [__low3d.camera.position.x, __low3d.camera.position.z] })`);
  if (!st.a.activa) mal("«De frente» no prendió el cuadro del 2D", st);
  if (st.lineas !== 0 || st.hijos !== 0 || st.rayos !== 0) mal("quedó ruido de líneas en la vista", st);
  if (!st.hz || !st.marco) mal("no se ven el horizonte ni el marco del cuadro", st);
  if (Math.abs(st.xz[0] - antesXZ[0]) > 1e-6 || Math.abs(st.xz[1] - antesXZ[1]) > 1e-6) mal("elegir un encuadre hizo saltar la cámara a otro lugar", { antesXZ, despues: st.xz });

  // 2. exactitud con 1 punto: fuga sólo Z, en el centro del cuadro
  let ex = await ev(`__t.exactitud("z")`);
  if (ex.sinPunto || ex.medidas < 20 || ex.peor > 0.5) mal("las rectas de Z no pasan por su punto de fuga", ex);
  let r1 = await ev(`(()=>{ const r = __low3d.mandarAl2D(1920, 1080); return { vps: r.vps, paralelas: r.paralelas.length, png: r.png.slice(0, 22) }; })()`);
  if (r1.vps.length !== 1 || r1.vps[0].eje !== "z" || Math.abs(r1.vps[0].x - 960) > 1 || Math.abs(r1.vps[0].y - 540) > 1)
    mal("con 1 punto tiene que fugar sólo Z, en el centro del cuadro", r1);
  if (r1.paralelas !== 2 || !r1.png.startsWith("data:image/png")) mal("faltan las paralelas o la imagen", r1);

  // 3. dos y tres puntos
  await ev(`__t.boton("En esquina")`); await w(400);
  const ex2 = { x: await ev(`__t.exactitud("x")`), z: await ev(`__t.exactitud("z")`) };
  if (ex2.x.sinPunto || ex2.z.sinPunto || ex2.x.peor > 0.5 || ex2.z.peor > 0.5 || ex2.x.medidas < 10) mal("en esquina las rectas no fugan exacto", ex2);
  const r2 = await ev(`__low3d.mandarAl2D(1920, 1080)`);
  const ejes2 = r2.vps.map(v => v.eje).sort().join("");
  if (ejes2 !== "xz" || Math.abs(r2.vps[0].y - r2.vps[1].y) > 0.5) mal("2 puntos: X y Z tienen que fugar sobre el mismo horizonte", r2.vps);
  if (r2.paralelas.length !== 1 || Math.abs(r2.paralelas[0].ux) > 0.01) mal("2 puntos: la vertical tiene que quedar vertical", r2.paralelas);
  let r3 = "";
  for (const desde of ["Desde arriba", "Desde abajo"]) {
    await ev(`__t.boton(${JSON.stringify(desde)})`); await w(400);
    r3 = await ev(`__low3d.mandarAl2D(1920, 1080).vps.map(v => v.eje).sort().join("")`);
    if (r3 !== "xyz") mal(desde + ": tienen que fugar los tres ejes", r3);
    const ex3 = await ev(`__t.exactitud("y")`);
    if (ex3.sinPunto || ex3.peor > 0.5) mal(desde + ": las verticales no fugan exacto", ex3);
  }

  // 4. horizonte y giro
  await ev(`__t.boton("En esquina")`); await w(200);
  await ev(`__t.rango("Altura de los ojos (horizonte)", 7.5)`); await w(250);
  st = await ev(`({ y: __low3d.camera.position.y, a: __low3d.getPerspectiva() })`);
  if (Math.abs(st.y - 7.5) > 1e-6 || st.a.altura !== 7.5) mal("el horizonte no subió la cámara", st);
  const antesGiro = await ev(`__low3d.mandarAl2D(1920, 1080).vps.find(v => v.eje === "z").x`);
  await ev(`__t.rango("Girar la vista", 20)`); await w(250);
  const despuesGiro = await ev(`__low3d.mandarAl2D(1920, 1080).vps.find(v => v.eje === "z").x`);
  if (Math.abs(despuesGiro - antesGiro) < 50) mal("girar la vista no corrió los puntos de fuga", { antesGiro, despuesGiro });
  if ((await ev(`__t.exactitud("z")`)).peor > 0.5) mal("después de girar, las rectas dejaron de fugar exacto", {});

  // 5. viaja con el proyecto
  const vuelta = await ev(`(()=>{ const p = __low3d.exportProject(); const guardado = p.settings.perspectiva;
    __low3d.newProject(); const limpio = __low3d.getPerspectiva().activa;
    __low3d.importProject(JSON.parse(JSON.stringify(p))); return { guardado, limpio, vuelve: __low3d.getPerspectiva(), y: __low3d.camera.position.y }; })()`);
  if (!vuelta.guardado || !vuelta.guardado.activa || vuelta.limpio) mal("la cámara del layout no se guarda o un proyecto nuevo la conserva", vuelta);
  if (!vuelta.vuelve.activa || vuelta.vuelve.giro !== 20 || Math.abs(vuelta.y - 7.5) > 1e-6) mal("al abrir el proyecto la perspectiva no vuelve igual", vuelta);
  const errA = pag.errores.filter(e => !/ResizeObserver/.test(String(e)));
  await pag.cerrar();
  if (errA.length) mal("excepciones en el estudio", errA.slice(0, 3));

  /* ── B. dentro de LOW ── */
  pag = await abrir(base + "index.html?mock=1");
  send = pag.send;
  const evHost = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const evIframe = (expr) => evHost(`document.querySelector("#l3dFrame").contentWindow.eval(${JSON.stringify(expr)})`);
  for (let i = 0; i < 90; i++) { if (await evHost('document.readyState==="complete"&&typeof openL3d==="function"&&!!api').catch(() => false)) break; await w(400); }
  // «Nuevo documento», como en la app: su papel (rect[data-low-page]) es el de verdad,
  // y la mesa tiene que pintar el layout de atrás ENCIMA del papel
  const doc = await evHost(`(async()=>{ try{localStorage.clear()}catch(e){}
    dzMenuAction("nuevo"); await new Promise(r=>setTimeout(r,2800));
    if (typeof closeL3d === "function") closeL3d();
    return { w: DZ.doc.scene.width, h: DZ.doc.scene.height, capas: DZ.doc.scene.layers.length }; })()`);
  await evHost(`openL3d()`);
  for (let i = 0; i < 120; i++) { if (await evIframe("!!window.__low3d").catch(() => false)) break; await w(250); }
  await evIframe(`try{localStorage.clear()}catch(e){}; __low3d.newProject(); ${AYUDA}`);
  await evIframe(`document.querySelector('[data-panel="persp"]').click()`);
  let nota = "";
  for (let i = 0; i < 20; i++) { nota = await evIframe(`[...document.querySelectorAll(".persp3d-nota")].map(n=>n.textContent).join(" | ")`); if (nota.includes(doc.w + "×" + doc.h)) break; await w(150); }
  if (!nota.includes(doc.w + "×" + doc.h)) mal("el estudio no recibió el tamaño del cuadro del 2D", { nota, doc });
  await evIframe(`__t.boton("En esquina")`); await w(300);
  const esperado = await evIframe(`__low3d.mandarAl2D(${doc.w}, ${doc.h}).vps`);
  // «Mandar este encuadre al 2D» vive en el panel Toma
  await evIframe(`document.querySelector('[data-panel="toma"]').click()`); await w(400);
  await evIframe(`__t.boton("Mandar este encuadre al 2D")`);
  let rec = null;
  for (let i = 0; i < 40; i++) {
    rec = await evHost(`(()=>{ const sc = DZ.doc.scene, ly = sc.layers[0], lv = ly && sc.level(ly.levelId), d = lv && lv.byNumber(1);
      return { oculto: document.querySelector("#l3dView").hidden, capas: sc.layers.length, nombre: ly && ly.name, tipo: lv && lv.type,
        marca: !!(d && /data-low="layout-3d"/.test(d.content)), png: !!(d && /href="data:image\\/png/.test(d.content)),
        celdas: ly ? [1, sc.lastFrame()].map(f => ly.cellAt(f)) : [], persp: sc.perspective }; })()`);
    if (rec.marca) break; await w(250);
  }
  if (!rec.marca || !rec.png || rec.tipo !== "reference" || rec.capas !== doc.capas + 1) mal("«Mandar al 2D» no creó la capa de calco con la imagen", rec);
  if (!rec.oculto) mal("después de mandar, LOW no volvió al 2D", rec);
  if (rec.celdas.some(c => c !== 1)) mal("el layout no está expuesto en toda la escena", rec);
  if (rec.persp.origen !== "3d" || rec.persp.vps.length !== esperado.length) mal("la perspectiva del 2D no es la de la cámara 3D", { persp: rec.persp, esperado });
  for (let i = 0; i < esperado.length; i++) {
    const a = rec.persp.vps[i], b = esperado[i];
    if (Math.abs(a.x - b.x) > 0.01 || Math.abs(a.y - b.y) > 0.01 || a.eje !== b.eje) mal("un punto de fuga llegó corrido al 2D", { a, b });
  }
  const tam = await evHost(`new Promise(r => { const d = DZ.doc.scene.layers[0]; const lv = DZ.doc.scene.level(d.levelId);
    const m = lv.byNumber(1).content.match(/href="([^"]+)"/); const im = new Image(); im.onload = () => r({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => r(null); im.src = m[1]; })`);
  if (!tam || tam.w !== doc.w || tam.h !== doc.h) mal("la imagen del layout no tiene el tamaño del cuadro", { tam, doc });
  const enMesa = await evHost(`(()=>{ const svg = document.querySelector("#dzCanvas > svg"); const hijos = [...svg.children];
    const img = svg.querySelector('image[data-low="layout-3d"]'); const papel = svg.querySelector("rect[data-low-page]");
    const capa = img && img.closest(".dz-capa"); const i = capa ? hijos.indexOf(capa) : -1, j = papel ? hijos.indexOf(papel.closest("svg > *") || papel) : -1;
    return { img: !!img, enCapaDeContexto: !!capa, despuesDelPapel: !papel || i > j, guardado: dzCanvasInner().includes("layout-3d") }; })()`);
  if (!enMesa.img || !enMesa.enCapaDeContexto || !enMesa.despuesDelPapel) mal("el layout no se ve en la mesa (falta o queda debajo del papel)", { enMesa,
    diag: await evHost(`(()=>{ const d = DZ.doc, sc = d.scene; const n = "-";
      const svg = document.querySelector("#dzCanvas > svg");
      return { pintadas: n, capas: sc.layers.map(l => ({ id: l.id, nombre: l.name, vis: l.visible, celda: l.cellAt(d.frame) })), activa: d.layerId, frame: d.frame,
        dibujo: (sc.drawingAt(sc.layers[0].id, d.frame) || {}).content?.slice(0, 80), gcapa: svg.querySelectorAll("g.dz-capa").length,
        img: !!svg.querySelector('image[data-low="layout-3d"]'), hijos: [...svg.children].map(c => c.tagName + "." + (c.getAttribute("class") || c.getAttribute("data-low-art") || "")).slice(0, 12) }; })()`) });
  if (enMesa.guardado) mal("el layout se coló en el dibujo de la capa activa", enMesa);

  // 8. volver a mandar reemplaza; Ctrl+Z vuelve
  await evHost(`openL3d()`); await w(300);
  await evIframe(`document.querySelector('[data-panel="persp"]').click()`); await w(300);
  await evIframe(`__t.rango("Girar la vista", -25)`); await w(200);
  await evIframe(`document.querySelector('[data-panel="toma"]').click()`); await w(300);
  await evIframe(`__t.boton("Mandar este encuadre al 2D")`); await w(800);
  const dos = await evHost(`({ capas: DZ.doc.scene.layers.length, layouts: DZ.doc.scene.levels.filter(l => l.drawings.some(d => /data-low="layout-3d"/.test(d.content))).length, vp: DZ.doc.scene.perspective.vps.map(v => Math.round(v.x)) })`);
  if (dos.capas !== doc.capas + 1 || dos.layouts !== 1) mal("volver a mandar apiló otra capa en vez de reemplazar", dos);
  await evHost(`(()=>{ DZ.doc.history.undo(); DZ.doc.history.undo(); return true; })()`);
  const atras = await evHost(`({ capas: DZ.doc.scene.layers.length, vp: DZ.doc.scene.perspective.vps.map(v => Math.round(v.x)) })`);
  if (atras.capas !== doc.capas + 1 || JSON.stringify(atras.vp) === JSON.stringify(dos.vp)) mal("Ctrl+Z no volvió al envío anterior", { dos, atras });
  await evHost(`(()=>{ DZ.doc.history.undo(); DZ.doc.history.undo(); return true; })()`);
  const nada = await evHost(`({ capas: DZ.doc.scene.layers.length, vps: DZ.doc.scene.perspective.vps.length })`);
  if (nada.capas !== doc.capas || nada.vps !== 0) mal("deshaciendo todo no se fue el layout", nada);

  const errB = pag.errores.filter(e => !/ResizeObserver/.test(String(e)));
  await pag.cerrar();
  if (errB.length) mal("excepciones en LOW", errB.slice(0, 3));
  console.log("E2E cámara del layout 3D OK " + JSON.stringify({ lineas: st.lineas, exactitud1: +ex.peor.toFixed(3),
    exactitud2: [+ex2.x.peor.toFixed(3), +ex2.z.peor.toFixed(3)], ejes3: r3, layout: tam }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
