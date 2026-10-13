/* REPETIR HACIA LA FUGA EN EL ESTUDIO 3D. CDP :9223 + mock :8791.

   Pedido de Mauro (v3.29): «en la perspectiva estaría bueno tener una función
   de repetición en la fuga, que si yo la activo repita el mismo edificio hacia
   atrás». Con el mouse de verdad, en la Calle de 1 punto:
   1. Se dibuja un «edificio» (dos trazos agrupados) sobre la fachada.
   2. Panel Perspectiva → Medir → Repetir (4 copias): aparecen 4 copias del
      grupo, cada una corrida la misma distancia hacia el fondo (−Z), sobre la
      misma fachada, y cada copia es su propio grupo.
   3. En pantalla se achican hacia el punto de fuga (es perspectiva de verdad).
   4. Un Ctrl+Z las saca todas. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/estudio3d/index.html";

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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 60000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const trazo = async (x, y, dx, dy) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 16; i++) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: x + dx * i / 16, y: y + dy * i / 16, button: "left", buttons: 1 }); await w(12); }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x + dx, y: y + dy, button: "left", buttons: 0, clickCount: 1 });
    await w(300);
  };
  const clicEn = async (sel) => {
    const r = await ev(`(()=>{ const b = [...document.querySelectorAll(${JSON.stringify(sel)})][0]; if (!b) return null; b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!r) mal("falta " + sel, {});
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: r.x, y: r.y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: r.x, y: r.y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: r.x, y: r.y, button: "left", buttons: 0, clickCount: 1 });
    await w(250);
  };
  /** Cada trazo: su caja en el mundo, su grupo y su alto en pantalla. */
  const trazos = () => ev(`(()=>{ const e = __low3d, cam = e.camera, V = cam.position.constructor, B = new (e.scene.position.constructor === V ? Object : Object)();
    const r2 = v => Math.round(v * 100) / 100;
    return e.strokes.filter(s => s.kind === "stroke").map(s => { s.object.updateMatrixWorld(true);
      const pts = s.points.map(p => s.object.localToWorld(p.clone()));
      const ys = pts.map(p => p.clone().project(cam)).map(n => (1 - n.y) / 2 * e.canvas.clientHeight);
      return { id: s.id, grupo: s.groupId || null, x: r2(pts.reduce((a, p) => a + p.x, 0) / pts.length), z: r2(pts.reduce((a, p) => a + p.z, 0) / pts.length),
        alto: r2(Math.max(...ys) - Math.min(...ys)) }; }); })()`);

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
  await ev(`try{localStorage.clear()}catch(e){}; __low3d.newProject(); document.querySelector('[data-tool="pencil"]').click();
    __low3d.setPerspectiva({ activa: true, esquema: "calle", puntos: 1, giro: 0, inclinacion: 0, altura: 1.6 }); true`);
  await w(500);

  // ── 1. un «edificio» de dos trazos sobre la fachada derecha, agrupado
  await trazo(1150, 200, 0, 200);
  await trazo(1175, 230, 50, 20);            // al lado: arrancar ENCIMA del primero lo usaría de apoyo
  let t = await trazos();
  if (t.length !== 2 || t.some(s => Math.abs(s.x - 8) > 0.3)) mal("no quedó el edificio sobre la fachada", t);
  // elegir los dos y agrupar
  await ev(`(()=>{ document.querySelector('[data-tool="move"]').click(); const e = __low3d; e.setSelection(e.strokes.filter(s => s.kind === "stroke")); e.groupSelection(); return e.selectedCount(); })()`);
  t = await trazos();
  if (!t[0].grupo || t[0].grupo !== t[1].grupo) mal("no se agrupó el edificio", t);
  const grupoOriginal = t[0].grupo;

  // ── 2. panel → Medir → 4 copias → Repetir
  await clicEn('[data-panel="persp"]');
  await clicEn('.persp3d-repetir .persp3d-boton:not(.persp3d-repetir-ya)');   // Medir
  const medido = await ev(`({ eje: document.querySelector('[aria-label="Eje de la repetición"]').value, sep: +document.querySelector('[aria-label="Separación en metros"]').value })`);
  if (medido.eje !== "z" || !(medido.sep > 0)) mal("Medir no eligió el eje del fondo o no sugirió una separación", medido);
  await ev(`(()=>{ const i = document.querySelector('[aria-label="Copias"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(i, "4"); i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
  await w(100);
  await clicEn('.persp3d-repetir-ya');
  await w(400);
  t = await trazos();
  if (t.length !== 10) mal("no aparecieron 4 copias del edificio (2 trazos cada una)", { n: t.length, aviso: await ev(`(document.querySelector(".persp3d-aviso")||{}).textContent`) });
  const porGrupo = new Map(); for (const s of t) { if (!porGrupo.has(s.grupo)) porGrupo.set(s.grupo, []); porGrupo.get(s.grupo).push(s); }
  if (porGrupo.size !== 5 || [...porGrupo.values()].some(g => g.length !== 2)) mal("cada copia tiene que ser su propio grupo de dos trazos", [...porGrupo.entries()].map(([k, v]) => [k, v.length]));
  const zs = [...porGrupo.entries()].map(([g, v]) => ({ g, z: v[0].z, alto: Math.max(...v.map(s => s.alto)), x: v[0].x })).sort((a, b) => b.z - a.z);
  if (zs[0].g !== grupoOriginal) mal("el original no es el de adelante", zs);
  for (let k = 1; k < zs.length; k++) {
    const paso = zs[k - 1].z - zs[k].z;
    if (Math.abs(paso - medido.sep) > 0.05) mal("las copias no van cada " + medido.sep + " m hacia el fondo", zs);
    if (Math.abs(zs[k].x - 8) > 0.3) mal("una copia se salió de la fachada", zs[k]);
    // ── 3. perspectiva de verdad: cada copia se ve más chica que la anterior
    if (!(zs[k].alto < zs[k - 1].alto)) mal("las copias no se achican hacia el punto de fuga", zs);
  }

  // ── 4. un Ctrl+Z las saca todas
  await ev(`(()=>{ __low3d.undo(); return true; })()`); await w(300);
  if ((await trazos()).length !== 2) mal("Ctrl+Z no sacó las copias en un paso", await trazos());

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
  console.log("E2E repetir hacia la fuga (3D) OK " + JSON.stringify({ separacion: medido.sep, altos: zs.map(z => z.alto) }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
