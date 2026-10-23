/* LO DEL ESTUDIO 3D, EN DISCO (v3.44, fase 1 del camino a la estabilidad).
   CDP :9223 + mock :8791 (el «disco» del mock vive en sessionStorage).

   Antes la biblioteca 3D (personajes, escenografías propias) y el autoguardado
   vivían en el almacenamiento del navegador (5 a 10 MB) y, llenos, fallaban EN
   SILENCIO. Adentro de LOW, con el estudio en su iframe:
   1. EL PASE: lo que había en el navegador (una biblioteca con «Tito» y una
      escena autoguardada) pasa al disco al abrir el estudio; recién ahí se
      borra del navegador. La escena vuelve y «Tito» está en «Mis personajes».
   2. Lo nuevo va al disco: un trazo más se autoguarda en el archivo, no en el
      navegador.
   3. DISCO LLENO: el autoguardado y la biblioteca AVISAN (no en silencio); la
      biblioteca deja una copia de emergencia en el navegador.
   4. Al volver a abrir con el disco sano, la copia de emergencia se suma al
      archivo y el navegador queda sin obra. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const base = process.argv[3] || "http://127.0.0.1:8791/ui/";

async function abrir(url, ancho = 1366, alto = 768) {
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
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  return { send, ev, errores, cerrar: async () => { ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { } } };
}
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
const KIT_VIEJO = { id: "kit-viejo", nombre: "Mis personajes", descripcion: "", piezas: [{ nombre: "Tito", categoria: "personaje", tam: [0.5, 1.8, 0.3], variacion: 0,
  items: [{ id: "", layerId: "", points: [[0, 0, 0], [0, 1, 0]], pressures: [1, 1], baseOpacity: 1, position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1],
    personaje: { base: "hombre", prop: {}, pose: {}, pies: true, color: "#dcd5ca" } }] }] };

async function main() {
  // ── 0. lo de ANTES: en un estudio suelto (navegador), una escena autoguardada y una biblioteca vieja ──
  const suelto = await abrir(base + "estudio3d/index.html");
  for (let i = 0; i < 80; i++) { if (await suelto.ev("!!window.__low3d").catch(() => false)) break; await w(250); }
  await suelto.ev(`try{localStorage.clear(); localStorage.setItem("low3d:guia-fondos","1")}catch(e){}; location.reload(); true`);
  for (let i = 0; i < 80; i++) { await w(250); if (await suelto.ev("!!window.__low3d && !!window.__lowStore").catch(() => false)) break; }
  await suelto.ev(`__low3d.newProject(); true`); await w(300);
  const mouse = (s, type, x, y, extra = {}) => s.send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
  await mouse(suelto, "mouseMoved", 600, 470); await mouse(suelto, "mousePressed", 600, 470, { buttons: 1, clickCount: 1 });
  for (let i = 1; i <= 12; i++) { await mouse(suelto, "mouseMoved", 600 + i * 10, 470 + i * 8, { buttons: 1 }); await w(15); }
  await mouse(suelto, "mouseReleased", 720, 566, { buttons: 0, clickCount: 1 }); await w(1400);
  await suelto.ev(`localStorage.setItem("low3d:kits", ${JSON.stringify(JSON.stringify([KIT_VIEJO]))}); true`);
  const antes = await suelto.ev(`({ esc: (JSON.parse(localStorage.getItem("low3d:autosave") || "null") || { strokes: [] }).strokes.length, kits: !!localStorage.getItem("low3d:kits") })`);
  if (antes.esc !== 1 || !antes.kits) mal("PRUEBA MAL ARMADA: no quedó lo de antes en el navegador", antes);
  await suelto.cerrar();

  // ── 1. EL PASE: adentro de LOW, al abrir el estudio ──
  let pag = await abrir(base + "index.html?mock=1");
  const listo = async (p) => { for (let i = 0; i < 90; i++) { if (await p.ev('document.readyState==="complete"&&typeof openL3d==="function"&&!!api').catch(() => false)) break; await w(400); } };
  await listo(pag);
  const alEstudio = async (p) => {
    await p.ev(`openL3d()`);
    for (let i = 0; i < 120; i++) { if (await p.ev(`!!document.querySelector("#l3dFrame").contentWindow.__low3d`).catch(() => false)) break; await w(250); }
    await w(800);
  };
  const evI = (p, expr) => p.ev(`document.querySelector("#l3dFrame").contentWindow.eval(${JSON.stringify(expr)})`);
  await alEstudio(pag);
  let disco = null;
  for (let i = 0; i < 40; i++) {
    disco = await pag.ev(`({ bib: sessionStorage.getItem("mock.est3d.biblioteca"), esc: sessionStorage.getItem("mock.est3d.autoguardado"), kitsNav: localStorage.getItem("low3d:kits"), escNav: localStorage.getItem("low3d:autosave") })`);
    if (disco.bib && disco.esc && !disco.kitsNav && !disco.escNav) break; await w(250);
  }
  if (!disco.bib || !/Tito/.test(disco.bib)) mal("la biblioteca del navegador no pasó al disco", { bib: (disco.bib || "").slice(0, 120) });
  if (disco.kitsNav) mal("pasada al disco, la biblioteca siguió en el navegador", {});
  if (!disco.esc || JSON.parse(disco.esc).strokes.length !== 1) mal("la escena autoguardada no pasó al disco", { esc: (disco.esc || "").slice(0, 120) });
  if (disco.escNav) mal("pasado al disco, el autoguardado siguió en el navegador", {});
  const escena = await evI(pag, `__low3d.strokes.length`);
  if (escena !== 1) mal("al abrir el estudio no volvió la escena autoguardada", { escena });
  await evI(pag, `document.querySelector('[data-panel="personaje"]').click(); true`); await w(500);
  const mios = await evI(pag, `[...document.querySelectorAll(".taller3d-mios [data-personaje]")].map(b => b.textContent.trim())`);
  if (!mios.some((t) => /Tito/.test(t))) mal("«Tito» no está en «Mis personajes» después del pase", { mios });

  // ── 2. lo nuevo va al disco ──
  await evI(pag, `document.querySelector('[data-panel="personaje"]').click(); true`); await w(200);
  const caja = await pag.ev(`(()=>{ const r = document.querySelector("#l3dFrame").getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
  const P = (fx, fy) => [caja[0] + caja[2] * fx, caja[1] + caja[3] * fy];
  const trazo = async (a, b) => {
    await mouse(pag, "mouseMoved", a[0], a[1]); await mouse(pag, "mousePressed", a[0], a[1], { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i++) { await mouse(pag, "mouseMoved", a[0] + (b[0] - a[0]) * i / 12, a[1] + (b[1] - a[1]) * i / 12, { buttons: 1 }); await w(15); }
    await mouse(pag, "mouseReleased", b[0], b[1], { buttons: 0, clickCount: 1 }); await w(1500);
  };
  await trazo(P(0.35, 0.62), P(0.45, 0.72));
  const tras = await pag.ev(`({ esc: JSON.parse(sessionStorage.getItem("mock.est3d.autoguardado") || '{"strokes":[]}').strokes.length, nav: !!localStorage.getItem("low3d:autosave") })`);
  if (tras.esc !== 2 || tras.nav) mal("el trazo nuevo no se autoguardó en el disco (o fue al navegador)", tras);

  // ── 3. DISCO LLENO: se avisa ──
  await pag.ev(`window.__est3dFalla = "No queda espacio en el disco"; true`);
  await trazo(P(0.5, 0.62), P(0.6, 0.72));
  const aviso = await evI(pag, `document.body.innerText`);
  if (!/autoguardado del 3D falló/.test(aviso) || !/No queda espacio/.test(aviso)) mal("con el disco lleno, el autoguardado falló en silencio", { aviso: aviso.slice(0, 300) });
  await evI(pag, `(()=>{ const B = window.__low3dBiblioteca, l = B.cargarKitsPropios(); l.push({ id: "kit-emergencia", nombre: "Lo de hoy", descripcion: "", estilo: l[0].estilo, piezas: [] }); return B.guardarKitsPropios(l); })()`);
  await w(800);
  const aviso2 = await evI(pag, `document.body.innerText`);
  if (!/No se pudo guardar la biblioteca en el disco/.test(aviso2)) mal("con el disco lleno, la biblioteca falló en silencio", { aviso: aviso2.slice(0, 300) });
  const emergencia = await pag.ev(`localStorage.getItem("low3d:kits") || ""`);
  if (!/kit-emergencia/.test(emergencia)) mal("con el disco lleno no quedó la copia de emergencia de la biblioteca", {});
  if (pag.errores.length) mal("errores de la página", pag.errores);

  // ── 4. otra vez con el disco sano: la copia de emergencia se suma y el navegador queda sin obra ──
  await pag.ev(`window.__est3dFalla = ""; true`);
  await pag.ev(`location.reload(); true`); await w(800);
  await listo(pag);
  await alEstudio(pag);
  let fin = null;
  for (let i = 0; i < 40; i++) {
    fin = await pag.ev(`({ bib: sessionStorage.getItem("mock.est3d.biblioteca") || "", kitsNav: localStorage.getItem("low3d:kits"), escNav: localStorage.getItem("low3d:autosave") })`);
    if (/kit-emergencia/.test(fin.bib) && !fin.kitsNav) break; await w(250);
  }
  if (!/kit-emergencia/.test(fin.bib) || !/Tito/.test(fin.bib)) mal("al volver, la copia de emergencia no se sumó al archivo", { bib: fin.bib.slice(0, 200) });
  if (fin.kitsNav || fin.escNav) mal("al final quedó obra en el almacenamiento del navegador", fin);
  if (pag.errores.length) mal("errores de la página", pag.errores);

  // ── 5. DISCO LENTO: guardar MIENTRAS la biblioteca todavía se está leyendo ──
  // en la app real una biblioteca de 27 MB tarda ~2 s en aparecer; si en ese
  // rato se guarda un personaje, la lista vacía del arranque no puede pisar el disco
  await pag.ev(`sessionStorage.setItem("mock.est3d.demora", "3000"); location.reload(); true`); await w(800);
  await listo(pag);
  await pag.ev(`openL3d(); true`);
  for (let i = 0; i < 120; i++) { if (await pag.ev(`!!document.querySelector("#l3dFrame").contentWindow.__low3dBiblioteca`).catch(() => false)) break; await w(100); }
  const apurado = await evI(pag, `(()=>{ const B = window.__low3dBiblioteca, l = B.cargarKitsPropios(); l.push({ id: "kit-apurado", nombre: "Recién hecho", descripcion: "", piezas: [] }); B.guardarKitsPropios(l); return l.length; })()`);
  let lento = null;
  for (let i = 0; i < 60; i++) {
    lento = await pag.ev(`sessionStorage.getItem("mock.est3d.biblioteca") || ""`);
    if (/kit-apurado/.test(lento)) break; await w(250);
  }
  await w(1000);
  lento = await pag.ev(`sessionStorage.getItem("mock.est3d.biblioteca") || ""`);
  const enPantalla = await evI(pag, `window.__low3dBiblioteca.cargarKitsPropios().map(k => k.id)`);
  await pag.ev(`sessionStorage.removeItem("mock.est3d.demora"); true`);
  if (!/kit-apurado/.test(lento)) mal("lo guardado mientras se leía la biblioteca no llegó al disco", { antes: apurado });
  if (!/Tito/.test(lento) || !/kit-emergencia/.test(lento)) mal("guardar mientras se leía la biblioteca PISÓ lo que había en el disco", { antes: apurado, bib: lento.slice(0, 200) });
  if (!["kit-viejo", "kit-emergencia", "kit-apurado"].every((id) => enPantalla.includes(id))) mal("después de leer, el estudio no muestra lo del disco y lo recién guardado juntos", enPantalla);
  if (pag.errores.length) mal("errores de la página", pag.errores);
  console.log("OK check_almacen_3d_ui:", JSON.stringify({ pase: true, trazos: tras.esc, avisos: 2, lento: enPantalla.length }));
  await pag.cerrar();
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
