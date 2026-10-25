/* EL ANCHO DE LA CABEZA ENSANCHA EL CRÁNEO, NO EL CUELLO NI LA PERA. CDP :9223 + mock :8791.

   Reporte de Mauro (3.52, con captura): «el modificador del ancho de la cabeza
   deforma el cuello y la pera». Medido: el dial alejaba cada punto de la piel de
   un eje que ARRANCA en la articulación del cuello, en las tres direcciones. La
   pera, que queda debajo y adelante de esa articulación, se estiraba para abajo y
   para adelante; el cuello, que pesa en parte de la cabeza, se ensanchaba.

   Con el dial de verdad («Cabeza (ancho)» al máximo, 1,80), sobre la piel en reposo:
   1. El cráneo se ensancha (≥ 30 % más ancho arriba de las orejas).
   2. Es ANCHO: sólo para los costados. La parte de arriba no crece en alto ni en
      profundidad (< 3 mm).
   3. La pera casi no se mueve: ni para abajo ni para adelante (< 3 mm).
   4. El cuello, debajo de la mandíbula, no se mueve (< 1,5 mm).
   5. Volver el dial a 1,00 deja la piel como estaba. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = (process.argv[3] || "http://127.0.0.1:8791/ui/") + "estudio3d/index.html";

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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 90000);
    pending.set(n, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d) + (errores.length ? " · errores de la página: " + JSON.stringify(errores.slice(0, 3)) : "")); };
  const clicEn = async (sel) => {
    const p = await ev(`(()=>{ const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.getClientRects().length); if (!b) return null; b.scrollIntoView({ block: "nearest" }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!p) mal("falta en pantalla: " + sel, {});
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 }); await w(300);
  };
  const poner = (sel, v) => ev(`(()=>{ const i = document.querySelector(${JSON.stringify(sel)}); i.scrollIntoView({ block: "center" });
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, ${JSON.stringify(String(v))});
    i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  /* zonas de la piel, medidas en la piel DE FÁBRICA (no cambian con el dial) */
  const medir = () => ev(`(()=>{ const x = __low3d.personajeDelTaller(), g = x.cuerpo.geometry, P = x.base(), O = x.original;
    const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bones = x.cuerpo.skeleton.bones;
    const kH = bones.findIndex(b => b.name === "Head"), kN = bones.findIndex(b => b.name === "neck_01");
    const peso = (i, k) => { let s = 0; for (let c = 0; c < 4; c++) if (SI.getComponent(i, c) === k) s += SW.getComponent(i, c); return s; };
    const n = SI.count, cab = [], cue = [];
    for (let i = 0; i < n; i++) { if (peso(i, kH) > 0.9) cab.push(i); else if (peso(i, kN) > 0.5 && peso(i, kH) < 0.5) cue.push(i); }
    let y0 = Infinity, y1 = -Infinity, cx = 0; for (const i of cab) { y0 = Math.min(y0, O[i*3+1]); y1 = Math.max(y1, O[i*3+1]); cx += O[i*3]; } cx /= cab.length;
    const alto = y1 - y0;
    const arriba = cab.filter(i => O[i*3+1] > y0 + 0.62 * alto);                  // el cráneo, arriba de las orejas
    const baja = cab.filter(i => O[i*3+1] < y0 + 0.10 * alto);                    // el fondo de la cara
    let zmax = -Infinity; for (const i of baja) zmax = Math.max(zmax, O[i*3+2]);
    const pera = baja.filter(i => O[i*3+2] > zmax - 0.02 && Math.abs(O[i*3] - cx) < 0.02);
    const cuello = cue.filter(i => O[i*3+1] < y0 - 0.01);                         // debajo de la mandíbula
    const ancho = (A, L) => { let a = Infinity, b = -Infinity; for (const i of L) { a = Math.min(a, A[i*3]); b = Math.max(b, A[i*3]); } return b - a; };
    const mov = (L, c) => { let m = 0; for (const i of L) m = Math.max(m, Math.abs(P[i*3+c] - O[i*3+c])); return m; };
    const total = (L) => { let m = 0; for (const i of L) m = Math.max(m, Math.hypot(P[i*3]-O[i*3], P[i*3+1]-O[i*3+1], P[i*3+2]-O[i*3+2])); return m; };
    return { n: { cabeza: cab.length, arriba: arriba.length, pera: pera.length, cuello: cuello.length }, altoCabeza: alto,
      ancho0: ancho(O, arriba), ancho1: ancho(P, arriba), arribaY: mov(arriba, 1), arribaZ: mov(arriba, 2),
      peraY: mov(pera, 1), peraZ: mov(pera, 2), peraX: mov(pera, 0), cuello: total(cuello) }; })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
    await ev(`try{localStorage.clear(); localStorage.setItem("low3d:guia-fondos","1")}catch(e){}; location.reload(); true`);
    for (let i = 0; i < 80; i++) { await w(250); if (await ev("!!window.__low3d && !!document.querySelector('[data-panel=\"personaje\"]')").catch(() => false)) break; }
    await ev(`__low3d.newProject(); true`);
    await clicEn('[data-panel="personaje"]');
    await clicEn('[data-cuerpo="hombre"]');
    await clicEn('.taller3d-entrar');
    await ev(`__low3d.personajesListos()`); await w(300);
    if (!(await ev(`!!document.querySelector('[data-grosor="cabeza"]')`))) await clicEn('[data-modo="cuerpo"]');

    await poner('[data-grosor="cabeza"]', 1.8); await w(900);
    const v = await medir();
    if (v.n.arriba < 50 || v.n.pera < 3 || v.n.cuello < 20) mal("PRUEBA MAL ARMADA: no encontré las zonas de la piel", v.n);
    const mm = (x) => +(x * 1000).toFixed(1);
    const res = { crece: +(v.ancho1 / v.ancho0).toFixed(3), arribaY: mm(v.arribaY), arribaZ: mm(v.arribaZ), peraY: mm(v.peraY), peraZ: mm(v.peraZ), peraX: mm(v.peraX), cuello: mm(v.cuello) };
    if (!(v.ancho1 > v.ancho0 * 1.3)) mal("el dial de ancho no ensancha el cráneo", res);
    if (v.arribaY > 0.003 || v.arribaZ > 0.003) mal("el «ancho» de la cabeza también la agranda en alto o en profundidad", res);
    if (v.peraY > 0.003 || v.peraZ > 0.003) mal("el ancho de la cabeza estira la pera (para abajo o para adelante)", res);
    if (v.cuello > 0.0015) mal("el ancho de la cabeza deforma el cuello", res);

    await poner('[data-grosor="cabeza"]', 1); await w(900);
    const v0 = await medir();
    if (v0.ancho1 > v0.ancho0 * 1.002 || v0.cuello > 0.0002) mal("volver el dial a 1,00 no deja la piel como estaba", { ancho: v0.ancho1 / v0.ancho0, cuello: v0.cuello });

    if (errores.length) mal("errores de la página", errores);
    console.log("OK check_3d_cabeza_ancho_ui:", JSON.stringify(res));
  } finally {
    ws.close();
    await fetch(endpoint + "/json/close/" + target.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
