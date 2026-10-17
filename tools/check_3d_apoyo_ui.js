/* NUNCA SE DIBUJA EN LA NADA (v3.34). CDP :9223 + mock :8791.

   Pedido de Mauro: «no debe dibujar en la nada porque no sabe dónde está, se
   enloquece: debe dibujar sobre el piso o sobre alguna guía o sobre algún
   objeto o elemento… los elementos de la biblioteca deben funcionar como las
   superficies guía; siempre tengo que usar alguna referencia». Es la lógica
   de Feather: el trazo vive SOBRE una superficie que se ve (la guía, la imagen
   o el modelo en modo dibujar) y no se puede dibujar fuera de sus bordes.

   Con el mouse de verdad, cada trazo arranca sobre algo y sigue de largo hacia
   afuera; ningún punto puede quedar fuera de lo que se ve:
   1. Un PLANO de Guías: el trazo no sigue por su plano infinito.
   2. Un ELEMENTO de la escenografía (casa): el trazo va por su cuerpo, como
      sobre una guía, y no por el plano tangente del primer punto.
   3. La cara de una CAJA: el trazo no sigue por el plano de la cara.
   4. El PISO: llevado hasta el cielo, todo queda en el piso.
   5. Arrancar en el cielo (nada debajo): no hay trazo, y el cursor ya lo
      avisaba antes de apretar.
   6. El «dibujo libre» en el aire (tecla F) ya no existe. */
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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 60000);
    pending.set(n, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  // SEGUIR=1 junta todas las fallas en vez de cortar en la primera (para ver el antes)
  const juntadas = [];
  const mal = (m, d) => { const t = "REGRESIÓN: " + m + " :: " + JSON.stringify(d); if (process.env.SEGUIR) { juntadas.push(t); return; } throw Error(t); };
  const aPantalla = (p) => ev(`(()=>{ const e = __low3d, r = e.canvasElement().getBoundingClientRect(), c = e.camera; c.updateMatrixWorld(true);
    const v = new c.position.constructor(...${JSON.stringify(p)}).project(c); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; })()`);
  const mover = (p, buttons = 0) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, buttons, button: buttons ? "left" : "none" });
  const enLienzo = async (p, m) => { const bajo = await ev(`(document.elementFromPoint(${p.x}, ${p.y}) || {}).tagName || "nada"`); if (bajo !== "CANVAS") throw Error("PRUEBA MAL ARMADA: " + JSON.stringify(m) + " cae sobre " + bajo); };
  const arrastrarPx = async (a, b, pasos = 24) => {
    await enLienzo(a, a); await enLienzo(b, b);
    await mover(a); await send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= pasos; i++) { await mover({ x: a.x + (b.x - a.x) * i / pasos, y: a.y + (b.y - a.y) * i / pasos }, 1); await w(8); }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", buttons: 0, clickCount: 1 }); await w(200);
  };
  const arrastrar = async (ma, mb, pasos) => arrastrarPx(await aPantalla(ma), await aPantalla(mb), pasos);
  const clicMundo = async (m) => { const p = await aPantalla(m); await enLienzo(p, m); await mover(p);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 }); await w(200); };
  const tecla = async (key, code, vk) => { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk }); await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk }); await w(200); };
  const camara = (pos, mira) => ev(`(()=>{ const e = __low3d; e.camera.position.set(...${JSON.stringify(pos)}); e.controls.target.set(...${JSON.stringify(mira)}); e.camera.lookAt(e.controls.target); e.controls.update(); return true; })()`);
  const nTrazos = () => ev(`__low3d.strokes.filter(s => s.kind === "stroke" && !s.solid && !s.fill).length`);
  // los puntos del ÚLTIMO trazo, en el mundo
  const ultimo = () => ev(`(()=>{ const r = __low3d.strokes.filter(s => s.kind === "stroke" && !s.solid && !s.fill).at(-1); r.object.updateMatrixWorld(true);
    return r.points.map(q => r.object.localToWorld(q.clone()).toArray()); })()`);
  const fuera = (pts, caja, tol) => pts.filter((p) => p.some((v, i) => v < caja.min[i] - tol || v > caja.max[i] + tol));
  const cajaDe = (expr) => ev(`(()=>{ const B = new __low3d.camera.position.constructor(); const objs = ${expr};
    let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (const o of objs) { o.updateMatrixWorld(true); o.traverse(m => { if (!m.isMesh) return; const g = m.geometry; g.computeBoundingBox();
      const b = g.boundingBox; for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) {
        const v = B.clone().set(x, y, z).applyMatrix4(m.matrixWorld); const a = v.toArray(); a.forEach((c, i) => { mn[i] = Math.min(mn[i], c); mx[i] = Math.max(mx[i], c); }); } }); }
    return { min: mn, max: mx }; })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
    await ev(`try{localStorage.clear(); localStorage.setItem("low3d:guia-fondos","1")}catch(e){}; location.reload(); true`);
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d && document.readyState === 'complete'").catch(() => false)) break; await w(250); }
    await w(400);
    const cam = async () => { await camara([0, 4, 12], [0, 1, 0]); await w(150); };

    // ── 1. un PLANO de Guías ──
    await ev(`__low3d.newProject(); true`); await cam();
    await ev(`document.querySelector('[data-panel="guides"]').click(); true`); await w(300);
    await ev(`[...document.querySelectorAll(".studio-inspector button")].find(b => b.textContent.trim() === "Plano").click(); true`); await w(300);
    await ev(`document.querySelector('[aria-label="Cerrar inspector"]').click(); true`); await w(200);
    const plano = await cajaDe(`__low3d.surfaces.map(s => s.mesh)`);
    if (plano.max[0] > 4 || plano.min[0] < -4) mal("el plano de Guías no salió donde se esperaba", plano);
    await tecla("p", "KeyP", 80);
    const c1 = [(plano.min[0] + plano.max[0]) / 2, (plano.min[1] + plano.max[1]) / 2, (plano.min[2] + plano.max[2]) / 2];
    let n0 = await nTrazos();
    await arrastrar(c1, [c1[0] + 9, c1[1], c1[2]]);
    if (await nTrazos() !== n0 + 1) mal("no se dibujó sobre el plano de Guías", {});
    let pts = await ultimo(), afuera = fuera(pts, plano, 0.06);
    if (afuera.length) mal("el trazo siguió de largo por el plano INFINITO de la guía (fuera de lo que se ve)", { plano, afuera: afuera.slice(-3) });
    if (Math.max(...pts.map((p) => p[0])) < plano.max[0] - 0.4) mal("el trazo no llegó hasta el borde del plano", { plano, ult: pts.at(-1) });

    // ── 2. un ELEMENTO de la escenografía ──
    await ev(`__low3d.newProject(); true`); await cam();
    await ev(`(async()=>{ __lowStore.setCurrentTool("pieza"); await new Promise(r => setTimeout(r, 400));
      document.querySelector('.biblio3d-grilla [data-pieza="plano-casa"]').click();
      const e = __low3d; e.colocarPieza(e.getPiezaActiva(), new e.camera.position.constructor(0, 0, 0), { escala: 0.4, giro: 0, sinVariar: true });
      __lowStore.setCurrentTool("pencil"); return true; })()`); await w(400);
    await ev(`document.querySelector('[aria-label="Cerrar inspector"]')?.click(); true`); await w(200);
    const casa = await cajaDe(`__low3d.strokes.filter(s => s.solid).map(s => s.object)`);
    if (!(casa.max[1] > 1)) mal("no se colocó la casa (sin volúmenes)", casa);
    const frente = [(casa.min[0] + casa.max[0]) / 2, casa.min[1] + (casa.max[1] - casa.min[1]) * 0.3, casa.max[2]];
    n0 = await nTrazos();
    await arrastrar(frente, [casa.max[0] + 2, frente[1] + 0.5, frente[2]]);
    if (await nTrazos() !== n0 + 1) mal("no se dibujó sobre el elemento", {});
    pts = await ultimo(); afuera = fuera(pts, casa, 0.08);
    if (afuera.length) mal("sobre el elemento, el trazo siguió de largo en el aire (plano tangente del primer punto)", { casa, afuera: afuera.slice(-3) });

    // ── 3. la cara de una CAJA ──
    await ev(`__low3d.newProject(); true`); await cam();
    await tecla("x", "KeyX", 88);
    await arrastrar([-1, 0, -1], [1, 0, -3]); await mover(await aPantalla([1, 2, -3])); await clicMundo([1, 2, -3]);
    if (await ev(`__low3d.strokes.filter(s => s.kind === "box").length`) !== 1) mal("no se armó la caja", {});
    const caja = await cajaDe(`__low3d.strokes.filter(s => s.kind === "box").map(s => s.object)`);
    await tecla("p", "KeyP", 80);
    n0 = await nTrazos();
    await arrastrar([0, (caja.min[1] + caja.max[1]) / 2, caja.max[2]], [6, (caja.min[1] + caja.max[1]) / 2, caja.max[2]]);
    if (await nTrazos() !== n0 + 1) mal("no se dibujó sobre la cara de la caja", {});
    pts = await ultimo(); afuera = fuera(pts, caja, 0.06);
    if (afuera.length) mal("el trazo siguió de largo por el plano de la cara de la caja", { caja, afuera: afuera.slice(-3) });

    // ── 4. el PISO hasta el cielo ──
    await ev(`__low3d.newProject(); true`); await cam();
    await tecla("p", "KeyP", 80);
    const r = await ev(`(()=>{ const b = __low3d.canvasElement().getBoundingClientRect(); return { x: b.left + b.width / 2, top: b.top, h: b.height }; })()`);
    const pisoA = await aPantalla([-2, 0, 3]);
    n0 = await nTrazos();
    await arrastrarPx(pisoA, { x: pisoA.x + 40, y: r.top + r.h * 0.12 }, 30);
    if (await nTrazos() !== n0 + 1) mal("no se dibujó sobre el piso", {});
    pts = await ultimo();
    const alto = pts.filter((p) => Math.abs(p[1]) > 0.02);
    if (alto.length) mal("un trazo del piso se levantó del piso", alto.slice(0, 3));
    const lejos = Math.max(...pts.map((p) => Math.hypot(p[0], p[2] - 12)));
    if (lejos > 200) mal("el trazo del piso se fue al horizonte", { lejos });

    // ── 5. el cielo: nada debajo ──
    const cielo = { x: r.x - 120, y: r.top + r.h * 0.1 };
    await mover({ x: cielo.x - 30, y: cielo.y }); await w(80); await mover(cielo); await w(120);
    const avisoCursor = await ev(`__low3d.cursorEl.dataset.apoyo || ""`);
    if (avisoCursor !== "no") mal("antes de apretar, el cursor no avisa que en el cielo no hay dónde apoyar", { avisoCursor });
    const pisoB = await aPantalla([1, 0, 2]);
    await mover({ x: pisoB.x - 20, y: pisoB.y }); await w(80); await mover(pisoB); await w(120);
    if (await ev(`__low3d.cursorEl.dataset.apoyo || ""`) !== "si") mal("sobre el piso el cursor dice que no hay apoyo", {});
    n0 = await nTrazos();
    await arrastrarPx(cielo, { x: cielo.x + 200, y: cielo.y + 20 });
    if (await nTrazos() !== n0) mal("se dibujó en el cielo, donde no hay nada", { pts: await ultimo() });

    // ── 6. no hay dibujo en el aire ──
    await tecla("f", "KeyF", 70);
    if (await ev(`__lowStore.getState().currentTool`) === "pencil-free") mal("la tecla F todavía activa el dibujo en el aire", {});
    if (await ev(`!!document.querySelector('[aria-label^="Dibujo libre"]')`)) mal("la paleta todavía ofrece el dibujo en el aire", {});

    if (errores.length) mal("errores de la página", errores);
    if (juntadas.length) throw Error(juntadas.join("\n"));
    console.log("OK check_3d_apoyo_ui: plano de Guías, elemento y cara de caja acotan el trazo; el piso no se levanta; el cielo no dibuja y el cursor lo avisa; sin dibujo en el aire");
  } finally {
    ws.close();
    await fetch(endpoint + "/json/close/" + target.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
