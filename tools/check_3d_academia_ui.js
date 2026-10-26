/* EL ESTUDIO DE ANATOMÍA DEL TALLER (3.54). CDP :9223 + mock :8791.

   Pedido de Mauro: «mejorar los modelos humanoides para que sean más anatómicos,
   estilo arte clásico, anatomía humana para artistas» y «que trabajes también con
   las herramientas para mejorar los cuerpos». Con los controles del panel:

   1. Yeso: el cuerpo pierde su textura y queda blanco mate; al apagarlo vuelve
      exactamente como estaba.
   2. Luz Rembrandt: las luces del estudio se apagan y entran las de la sala; al
      volver a «Estudio», las del estudio vuelven con su intensidad.
   3. Canon: el cuerpo de fábrica mide 10,7 cabezas (cabeza chica de cómic).
      «Heroico · 8» lo lleva a 8 cabezas (±0,1) en UN paso de Ctrl+Z.
   4. Esqueleto: los huesos a la vista.
   5. Planos de la cabeza: siguen a la cabeza. Su centro queda en el mismo lugar
      respecto de la piel de la cabeza de frente, girado y con otra pose (< 1 cm).
   6. Mapa de músculos: la piel se colorea con al menos 12 grupos y la leyenda los nombra.
   7. Poses clásicas: «Apoyo, mano en la cadera» deja la mano izquierda al costado
      de la cadera, a la altura de la cintura; «Brazos arriba», las dos manos sobre la cabeza.
   8. Al apagar todo, el material vuelve a ser el de fábrica. */
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
    const p = await ev(`(()=>{ const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.getClientRects().length); if (!b) return null; b.scrollIntoView({ block: "center" }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!p) mal("falta en pantalla: " + sel, {});
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 }); await w(350);
  };
  const elegir = (sel, v) => ev(`(()=>{ const i = document.querySelector(${JSON.stringify(sel)}); i.scrollIntoView({ block: "center" });
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(i, ${JSON.stringify(v)}); i.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  const ctrlZ = async () => { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 }); await send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 }); await w(400); };
  const material = () => ev(`(()=>{ const m = __low3d.personajeDelTaller().cuerpo.material; return { color: m.color.getHexString(), mapa: !!m.map, rugoso: +m.roughness.toFixed(2), vc: m.vertexColors }; })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
    await ev(`try{localStorage.clear(); localStorage.setItem("low3d:guia-fondos","1")}catch(e){}; location.reload(); true`);
    for (let i = 0; i < 80; i++) { await w(250); if (await ev("!!window.__low3d && !!document.querySelector('[data-panel=\"personaje\"]')").catch(() => false)) break; }
    await ev(`__low3d.newProject(); true`);
    await clicEn('[data-panel="personaje"]'); await clicEn('[data-cuerpo="hombre"]'); await clicEn('.taller3d-entrar');
    await ev(`__low3d.personajesListos()`); await w(400);

    // ── 1. yeso
    const mat0 = await material();
    await clicEn('[data-academia="yeso"]');
    const mat1 = await material();
    if (mat1.mapa || mat1.rugoso < 0.85 || mat1.color === mat0.color) mal("el yeso no deja el cuerpo blanco mate", { mat0, mat1 });

    // ── 2. luz Rembrandt
    const luces = () => ev(`(()=>{ const e = __low3d, s = e.scene; const estudio = s.children.filter(o => o.isLight).map(l => +l.intensity.toFixed(2));
      const sala = s.getObjectByName("academia:luces").children.filter(o => o.isLight).length; return { estudio, sala }; })()`);
    const l0 = await luces();
    await elegir('[data-academia="luz"]', "rembrandt"); await w(300);
    const l1 = await luces();
    if (l1.sala < 2 || l1.estudio.some((x) => x > 0)) mal("la luz Rembrandt no reemplaza a las del estudio", { l0, l1 });
    await elegir('[data-academia="luz"]', "estudio"); await w(300);
    const l2 = await luces();
    if (l2.sala !== 0 || JSON.stringify(l2.estudio) !== JSON.stringify(l0.estudio)) mal("volver a «Estudio» no devuelve las luces de siempre", { l0, l2 });

    // ── 3. canon y cuerpo clásico
    await clicEn('[data-academia="canon"]'); await w(500);
    const c0 = await ev(`__low3d.academia().cabezas`);
    const regla = await ev(`__low3d.scene.getObjectByName("academia:canon").children.length`);
    if (!(c0 > 10 && c0 < 11.5) || regla < 5) mal("el canon no mide el cuerpo de fábrica (10,7 cabezas) o no dibuja la regla", { c0, regla });
    const cab0 = await ev(`__low3d.personajeDelTaller().datos.prop.cabeza`);
    await clicEn('[data-clasico="heroico"]'); await w(600);
    const c1 = await ev(`__low3d.academia().medir()`).then((m) => m.alto / m.cabeza);
    if (Math.abs(c1 - 8) > 0.1) mal("«Heroico · 8» no lleva el cuerpo a 8 cabezas", { c1 });
    await ctrlZ();
    const cab1 = await ev(`__low3d.personajeDelTaller().datos.prop.cabeza`), m1 = await ev(`__low3d.personajeDelTaller().datos.forma`);
    if (Math.abs(cab1 - cab0) > 1e-3 || (m1 && (m1.musculo || m1.peso))) mal("un Ctrl+Z no deshace el cuerpo clásico entero", { cab0, cab1, m1 });

    // ── 4. esqueleto
    await clicEn('[data-academia="esqueleto"]');
    const esq = await ev(`__low3d.scene.children.some(o => o.isSkeletonHelper || o.type === "SkeletonHelper")`);
    if (!esq) mal("el esqueleto no aparece", {});
    await clicEn('[data-academia="esqueleto"]');

    // ── 5. planos de la cabeza: pegados a la cabeza
    await clicEn('[data-academia="planos"]'); await w(300);
    const relativo = () => ev(`(()=>{ const e = __low3d, x = e.personajeDelTaller(), m = x.cuerpo, g = m.geometry, V = x.raiz.position.constructor;
      m.updateMatrixWorld(true); m.skeleton.update(); e.scene.updateMatrixWorld(true);
      const pl = e.scene.getObjectByName("academia:planos"); if (!pl) return null;
      const B = new (pl.position.constructor === V ? Object : Object)(); const box = { min: new V(Infinity, Infinity, Infinity), max: new V(-Infinity, -Infinity, -Infinity) };
      pl.traverse(o => { if (!o.isLineSegments) return; const P = o.geometry.attributes.position; for (let i = 0; i < P.count; i++) { const v = new V().fromBufferAttribute(P, i).applyMatrix4(o.matrixWorld); box.min.min(v); box.max.max(v); } });
      const centro = box.min.clone().add(box.max).multiplyScalar(0.5);
      const SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, kH = m.skeleton.bones.findIndex(b => b.name === "Head");
      const c = new V(), v = new V(); let n = 0;
      for (let i = 0; i < SI.count; i += 3) { let wh = 0; for (let k = 0; k < 4; k++) if (SI.getComponent(i, k) === kH) wh += SW.getComponent(i, k); if (wh > 0.95) { m.getVertexPosition(i, v); c.add(v.applyMatrix4(m.matrixWorld)); n++; } }
      c.divideScalar(n);
      const q = m.skeleton.bones[kH].getWorldQuaternion(x.raiz.quaternion.clone()).invert();
      return centro.sub(c).applyQuaternion(q).toArray(); })()`);
    const r0 = await relativo();
    await ev(`__low3d.vistaPersonaje(45)`); await w(1500);
    await elegir('[data-academia="pose"]', "torsion"); await w(500);
    const r1 = await relativo();
    if (!r0 || !r1) mal("no hay planos de la cabeza", { r0, r1 });
    const corr = Math.hypot(r1[0] - r0[0], r1[1] - r0[1], r1[2] - r0[2]);
    if (corr > 0.01) mal("los planos de la cabeza se despegan de la cabeza al girar o posar", { r0, r1, corr });
    await ev(`__low3d.vistaPersonaje(0)`); await w(1200);
    await clicEn('[data-academia="planos"]');

    // ── 6. mapa de músculos
    await clicEn('[data-academia="musculos"]'); await w(300);
    const mus = await ev(`(()=>{ const g = __low3d.personajeDelTaller().cuerpo.geometry, C = g.getAttribute("color"); if (!C) return null; const s = new Set(); for (let i = 0; i < C.count; i++) s.add(C.getX(i).toFixed(3) + C.getY(i).toFixed(3)); return { colores: s.size, leyenda: document.querySelectorAll(".taller3d-leyenda li").length }; })()`);
    if (!mus || mus.colores < 12 || mus.leyenda < 12) mal("el mapa de músculos no colorea los grupos o no tiene leyenda", mus);
    await clicEn('[data-academia="musculos"]');

    // ── 7. poses clásicas
    await elegir('[data-academia="pose"]', "mano-cadera"); await w(500);
    // la mano apoyada en la cadera: al costado, cerca de la articulación en planta,
    // y entre la cadera y las costillas en altura (la cresta ilíaca, la cintura)
    const cadera = await ev(`(()=>{ const x = __low3d.personajeDelTaller(), h = x.articulacion("hand_l"), t = x.articulacion("thigh_l");
      return { planta: Math.hypot(h.x - t.x, h.z - t.z), alto: h.y - t.y }; })()`);
    if (!(cadera.planta < 0.16 && cadera.alto > 0.03 && cadera.alto < 0.3)) mal("«mano en la cadera» no deja la mano en la cadera", cadera);
    await elegir('[data-academia="pose"]', "brazos-arriba"); await w(500);
    const arriba = await ev(`(()=>{ const x = __low3d.personajeDelTaller(), c = x.articulacion("Head").y; return { l: x.articulacion("hand_l").y - c, r: x.articulacion("hand_r").y - c }; })()`);
    if (!(arriba.l > 0.1 && arriba.r > 0.1)) mal("«brazos arriba» no deja las manos sobre la cabeza", arriba);

    // ── 8. todo apagado: el material de fábrica
    await ev(`(()=>{ __low3d.academia().poner({ yeso: false, canon: false, planos: false, musculos: false, esqueleto: false, luz: "estudio" }); return 1; })()`); await w(300);
    const mat2 = await material();
    if (JSON.stringify(mat2) !== JSON.stringify(mat0)) mal("al apagar el yeso el material no vuelve a ser el de fábrica", { mat0, mat2 });

    if (errores.length) mal("errores de la página", errores);
    console.log("OK check_3d_academia_ui:", JSON.stringify({ fabrica: c0, heroico: +c1.toFixed(2), planos: +(corr * 1000).toFixed(1) + " mm", musculos: mus, mano: cadera, arriba }));
  } finally {
    ws.close();
    await fetch(endpoint + "/json/close/" + target.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
