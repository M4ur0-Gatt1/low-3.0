/* AUDITORIA DEL FLUJO DEL RIG, DE PUNTA A PUNTA.  CDP :9223 + mock :8791.
 *
 * No es una puerta: es un INFORME. Recorre lo que hace un animador la primera
 * vez —dibujar el personaje, colocar el esqueleto, Repartir, posar, dejar que
 * interpole— y mide, en cada paso, lo que esa persona notaria.
 *
 * QUE SE MIDE, y por que cada cosa:
 *
 *  1. REPARTO COMPLETO. Cuantos huesos quedaron con dibujo y cuantas piezas
 *     quedaron sin hueso. Una pieza sin hueso se queda quieta mientras el
 *     resto se mueve: es el defecto que mas se siente («hay una pieza suelta»).
 *  2. REPARTO SENSATO. Cada pieza tiene que quedar pegada al hueso que le pasa
 *     por encima. Si una pieza de la izquierda queda con un hueso de la
 *     derecha, al mover un brazo se mueve el otro — «como en espejo».
 *  3. AISLAMIENTO. Posar UN hueso tiene que mover SU pieza y ninguna otra.
 *  4. INTERPOLACION. Con una clave en el primer cuadro y otra mas adelante,
 *     los cuadros del medio tienen que estar en el medio. Si no se mueven, la
 *     interpolacion no esta ocurriendo aunque haya dos claves.
 *  5. QUE TE DIGA QUE FALTA. En cada paso se anota el mensaje de estado. Un
 *     flujo que no dice en que paso estas ni que falta se aprende a los
 *     golpes, y un animador no tiene por que adivinarlo.
 *
 * Uso: node tools/auditoria_rig_flujo.js [endpoint] [url]
 */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const t0 = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(t0.webSocketDebuggerUrl);
  await new Promise((ok, f) => { ws.onopen = ok; ws.onerror = f; });
  let id = 0; const pend = new Map(); const errores = [];
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.method === "Runtime.exceptionThrown") errores.push(String(m.params.exceptionDetails.exception?.description || "").split("\n")[0]);
    if (!m.id || !pend.has(m.id)) return;
    const p = pend.get(m.id); pend.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id;
    const to = setTimeout(() => { pend.delete(n); rej(Error("CDP sin respuesta: " + method)); }, 90000);
    pend.set(n, { resolve: v => { clearTimeout(to); res(v); }, reject: e => { clearTimeout(to); rej(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async x => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __error: String(r.exceptionDetails.exception?.description || "").split("\n")[0] }; return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));
  const estado = () => ev(`(document.querySelector("#dzStatus")||{}).textContent`);
  const trazo = async (x1, y1, x2, y2, pasos = 10) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", clickCount: 1 });
    for (let i = 1; i <= pasos; i++)
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", button: "left", buttons: 1,
        x: Math.round(x1 + (x2 - x1) * i / pasos), y: Math.round(y1 + (y2 - y1) * i / pasos) });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", clickCount: 1 });
    await w(240);
  };

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 120; i++) { if (await ev('typeof openDesign==="function" && !!api').catch(() => 0)) break; await w(400); }

  const informe = { pasos: [], problemas: [] };
  const anota = (paso, dato) => informe.pasos.push({ paso, ...dato });
  const problema = (que, dato) => informe.problemas.push({ que, ...dato });

  /* ── 1. hoja limpia y un personaje dibujado a mano, pieza por pieza ─── */
  await ev(`(async()=>{
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit();
    if (typeof closeL3d==="function") closeL3d();
    await wait(800);
    if (!DZ.anim && typeof dzAnimToggle==="function") { await dzAnimToggle(); await wait(700); }
    const hoja = document.querySelector("#dzCanvas > svg");
    [...hoja.querySelectorAll("path,rect,circle,ellipse,polygon")].forEach(n => {
      if (!n.closest(".dz-onion,.dz-penui,#dzRigOverlay") && n.getAttribute("data-paper") === null) n.remove(); });
    await wait(300);
    if (typeof dzSetTool === "function") dzSetTool("pencil");
    await wait(300); return true; })()`);

  // un muñeco de seis piezas, cada trazo por separado, como lo dibuja cualquiera
  const PIEZAS = [
    ["cabeza",       660, 170, 700, 170],
    ["tronco",       680, 210, 680, 340],
    ["brazo_izq",    680, 240, 570, 290],
    ["brazo_der",    680, 240, 790, 290],
    ["pierna_izq",   680, 340, 620, 470],
    ["pierna_der",   680, 340, 740, 470],
  ];
  for (const [, x1, y1, x2, y2] of PIEZAS) await trazo(x1, y1, x2, y2, 10);
  await w(600);
  const dibujado = await ev(`(() => {
    const hoja = document.querySelector("#dzCanvas > svg");
    const p = [...hoja.querySelectorAll("path,rect,circle,ellipse,polygon")]
      .filter(n => !n.closest(".dz-onion,.dz-penui,#dzRigOverlay") && n.getAttribute("data-paper") === null);
    return { piezas: p.length, conId: p.filter(n => n.id).length }; })()`);
  anota("dibujar 6 piezas", { ...dibujado, estado: (await estado() || "").slice(0, 90) });
  if (dibujado.piezas < 6) problema("dibujar seis trazos no dejó seis piezas", dibujado);

  /* ── 2. entrar al rig y colocar el esqueleto de la biblioteca ───────── */
  await ev(`(async()=>{ const wait = ms => new Promise(x=>setTimeout(x,ms));
    if (!DZ.rigMode && typeof dzRigToggle==="function") { dzRigToggle(); await wait(800); } return true; })()`);
  anota("entrar al modo esqueleto", { estado: (await estado() || "").slice(0, 90) });

  await ev(`(() => { const s = document.querySelector("#rigLibrary"); if (s) s.value = "human_simple";
    document.querySelector("#rigLibraryAdd").click(); })()`);
  await w(1300);
  const colocado = await ev(`(() => {
    const n = Object.values(DZ.doc.scene.rig.nodes || {});
    return { huesos: n.length, conArte: n.filter(x => x.elementId).length }; })()`);
  anota("colocar el esqueleto", { ...colocado, estado: (await estado() || "").slice(0, 110) });

  /* ── 3. REPARTIR: el paso que pega el dibujo a los huesos ───────────── */
  await ev(`document.querySelector("#rigRepartir").click()`);
  await w(1500);
  const reparto = await ev(`(() => {
    const sc = DZ.doc.scene, hoja = document.querySelector("#dzCanvas > svg");
    const nodos = Object.values(sc.rig.nodes || {});
    const huesos = nodos.filter(n => n.head && n.tail);
    const conArte = nodos.filter(n => n.elementId);
    const piezas = [...hoja.querySelectorAll("path,rect,circle,ellipse,polygon")]
      .filter(n => !n.closest(".dz-onion,.dz-penui,#dzRigOverlay") && n.getAttribute("data-paper") === null);
    const pegadas = new Set(conArte.map(n => n.elementId));
    const sueltas = piezas.filter(p => !p.id || !pegadas.has(p.id));
    // ¿cada pieza quedó con el hueso que le pasa por encima?
    const dist = (m, n) => { const dx = n.tail.x - n.head.x, dy = n.tail.y - n.head.y;
      const L = dx*dx + dy*dy || 1;
      let t = ((m.x - n.head.x)*dx + (m.y - n.head.y)*dy) / L; t = Math.max(0, Math.min(1, t));
      return Math.hypot(m.x - (n.head.x + t*dx), m.y - (n.head.y + t*dy)); };
    const malPegadas = [];
    for (const n of conArte) {
      const el = hoja.querySelector("#" + CSS.escape(n.elementId));
      if (!el) { malPegadas.push({ hueso: n.id, pieza: n.elementId, motivo: "el elemento no está en la mesa" }); continue; }
      const b = el.getBBox(); const c = { x: b.x + b.width/2, y: b.y + b.height/2 };
      const suyo = dist(c, n);
      let mejor = suyo, cual = n.id;
      for (const otro of huesos) { const d = dist(c, otro); if (d < mejor - 1e-6) { mejor = d; cual = otro.id; } }
      if (cual !== n.id) malPegadas.push({ hueso: n.id, pieza: n.elementId,
        motivo: "le pasa más cerca " + cual, suDistancia: +suyo.toFixed(1), mejorDistancia: +mejor.toFixed(1) });
    }
    return { huesos: huesos.length, conArte: conArte.length,
      piezasEnLaMesa: piezas.length, piezasSueltas: sueltas.length,
      sinId: piezas.filter(p => !p.id).length, malPegadas };
  })()`);
  anota("Repartir", { ...reparto, estado: (await estado() || "").slice(0, 130) });
  if (reparto.piezasSueltas)
    problema("quedan piezas sin hueso: se van a quedar quietas mientras el resto se mueve",
      { sueltas: reparto.piezasSueltas, de: reparto.piezasEnLaMesa });
  if (reparto.malPegadas.length)
    problema("hay piezas pegadas a un hueso que no es el que les pasa por encima", { casos: reparto.malPegadas });
  if (reparto.conArte < Math.min(reparto.huesos, reparto.piezasEnLaMesa))
    problema("quedan huesos sin dibujo", { conArte: reparto.conArte, huesos: reparto.huesos });

  /* ── 4. posar un hueso: ¿se mueve SU pieza y sólo esa? ──────────────── */
  const aislamiento = await ev(`(async () => {
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    const sc = DZ.doc.scene, hoja = document.querySelector("#dzCanvas > svg");
    const conArte = Object.values(sc.rig.nodes || {}).filter(n => n.elementId);
    if (!conArte.length) return { sinVinculos: true };
    const foto = () => { const o = {};
      for (const n of conArte) { const el = hoja.querySelector("#" + CSS.escape(n.elementId));
        if (!el) continue; const b = el.getBoundingClientRect();
        o[n.elementId] = [Math.round(b.x), Math.round(b.y)]; }
      return o; };
    const antes = foto();
    // se elige un hueso de una punta (un brazo o una pierna), no la raíz
    const hoja1 = conArte.find(n => n.parentId) || conArte[0];
    DZ.doc.setRigKey(hoja1.id, 0, { x: 0, y: 0, r: 25, sx: 1, sy: 1 });
    if (typeof dzRigApplyLive === "function") dzRigApplyLive(0);
    await wait(600);
    const despues = foto();
    const movidas = Object.keys(antes).filter(k => despues[k] &&
      (Math.abs(antes[k][0] - despues[k][0]) > 1 || Math.abs(antes[k][1] - despues[k][1]) > 1));
    return { huesoPosado: hoja1.id, suPieza: hoja1.elementId,
      movidas, seMovioLaSuya: movidas.includes(hoja1.elementId),
      ajenasQueSeMovieron: movidas.filter(k => k !== hoja1.elementId) };
  })()`);
  anota("posar un hueso", { ...aislamiento, estado: (await estado() || "").slice(0, 90) });
  if (aislamiento.sinVinculos) problema("no hay ningún hueso con dibujo: posar no mueve nada", {});
  else {
    if (!aislamiento.seMovioLaSuya)
      problema("posar el hueso NO movió su propia pieza", { hueso: aislamiento.huesoPosado });
    // los hijos de un hueso deben acompañarlo; se informa sin acusar
    if (aislamiento.ajenasQueSeMovieron.length)
      anota("piezas que acompañaron", { cuales: aislamiento.ajenasQueSeMovieron });
  }

  /* ── 5. interpolación: dos claves y un cuadro en el medio ───────────── */
  const interp = await ev(`(async () => {
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    const sc = DZ.doc.scene;
    const conArte = Object.values(sc.rig.nodes || {}).filter(n => n.elementId);
    if (!conArte.length) return { sinVinculos: true };
    const n = conArte.find(x => x.parentId) || conArte[0];
    DZ.doc.setRigKey(n.id, 0, { x: 0, y: 0, r: 0, sx: 1, sy: 1 });
    DZ.doc.setRigKey(n.id, 8, { x: 0, y: 0, r: 60, sx: 1, sy: 1 });
    await wait(300);
    const donde = (f) => { const m = sc.rigWorldMatrix ? sc.rigWorldMatrix(n.id, f) : null;
      const p = sc.rigPose ? sc.rigPose(n.id, f) : null;
      return p ? +(+p.r).toFixed(2) : (m ? "sin pose" : null); };
    return { hueso: n.id, f0: donde(0), f4: donde(4), f8: donde(8) };
  })()`);
  anota("interpolación entre dos claves", interp);
  if (!interp.sinVinculos) {
    const medio = typeof interp.f4 === "number" ? interp.f4 : null;
    if (medio == null) problema("no se puede leer la pose del cuadro del medio", interp);
    else if (!(medio > Math.min(interp.f0, interp.f8) + 0.5 && medio < Math.max(interp.f0, interp.f8) - 0.5))
      problema("el cuadro del medio NO queda entre las dos claves: no está interpolando", interp);
  }

  informe.errores = [...new Set(errores)].slice(0, 6);
  console.log(JSON.stringify(informe, null, 1));
  ws.close();
}
main().catch(e => { console.error("AUDITORÍA: " + e.message); process.exit(1); });
