/* EL CUERPO DE ESTUDIO DEL TALLER (3.55). CDP :9223 + mock :8791.

   Pedido de Mauro: «mejorá los modelos y la malla», por la base nueva: los Human
   Base Meshes de Blender Studio (CC0), con el esqueleto del Taller
   (herramientas/scripts/rig.py). Con los controles del panel:

   Para los dos cuerpos de estudio, «Hombre (estudio)» y «Mujer (estudio)»:
   1. Está entre los cuerpos y entra al Taller: la malla es la
      realista (más de 40 mil puntos), con sus dos ojos en una malla «MI_Eyes»,
      y sin gestos de cara todavía (su boca no es la de los otros cuerpos).
   2. El canon: el hombre mide unas 8 cabezas y la mujer unas 7,5 (el de fábrica, 10,7).
   3. Las poses clásicas del Estudio de anatomía valen igual: «mano en la cadera»
      deja la mano en la cadera, «brazos arriba» las manos sobre la cabeza.
   4. La piel no se rompe al posar: con la mano en la cadera, los brazos arriba y
      en torsión, y con la cabeza girada 45°, ninguna arista se estira más de 3,5 veces (antes del arreglo de
      pesos el pecho se cuarteaba al bajar los brazos).
   5. La mano se cierra: los dedos tienen piel (las puntas se acercan a la palma). */
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
  // la piel rota: aristas de más de 5 mm estiradas más de 2,5 veces (y la peor). Estirarse al
  // doble en la axila con los brazos arriba es lo normal; una grieta se abre mucho más
  const rotas = () => ev(`(()=>{ const x = __low3d.personajeDelTaller(), m = x.cuerpo, g = m.geometry, I = g.index.array, O = x.pielDeFabrica();
    m.updateMatrixWorld(true); m.skeleton.update();
    const V = x.raiz.position.constructor, n = O.length / 3, P = new Float32Array(n * 3), v = new V();
    for (let i = 0; i < n; i++) { m.getVertexPosition(i, v); P[i * 3] = v.x; P[i * 3 + 1] = v.y; P[i * 3 + 2] = v.z; }
    const d = (A, a, b) => Math.hypot(A[a * 3] - A[b * 3], A[a * 3 + 1] - A[b * 3 + 1], A[a * 3 + 2] - A[b * 3 + 2]);
    let malas = 0, peor = 0;
    for (let t = 0; t < I.length; t += 3) for (let k = 0; k < 3; k++) { const a = I[t + k], b = I[t + (k + 1) % 3];
      if (a > b) continue; const l0 = d(O, a, b); if (l0 < 0.005) continue; const r = d(P, a, b) / l0; peor = Math.max(peor, r); if (r > 2.5) malas++; }
    return { malas, peor: +peor.toFixed(2) }; })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    const CANON = { "hombre-realista": [7.4, 8.6], "mujer-realista": [7, 8.4] }, res = {};
    for (const base of Object.keys(CANON)) {
      await send("Page.navigate", { url });
      for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
      await ev(`try{localStorage.clear(); localStorage.setItem("low3d:guia-fondos","1")}catch(e){}; location.reload(); true`);
      for (let i = 0; i < 80; i++) { await w(250); if (await ev("!!window.__low3d && !!document.querySelector('[data-panel=\"personaje\"]')").catch(() => false)) break; }
      await ev(`__low3d.newProject(); true`);

      // ── 1. el cuerpo de estudio entra al Taller
      await clicEn('[data-panel="personaje"]'); await clicEn(`[data-cuerpo="${base}"]`); await clicEn('.taller3d-entrar');
      await ev(`__low3d.personajesListos()`); await w(600);
      const cuerpo = await ev(`(()=>{ const x = __low3d.personajeDelTaller(); return { base: x.datos.base, puntos: x.cuerpo.geometry.attributes.position.count,
        ojos: x.mallas.filter(m => m.material.name === "MI_Eyes").length, cara: x.tieneCara() }; })()`);
      if (cuerpo.base !== base || cuerpo.puntos < 40000 || cuerpo.ojos !== 1 || cuerpo.cara) mal("el cuerpo de estudio no entra al Taller como debe", cuerpo);

      // ── 2. el canon
      const canon = await ev(`(()=>{ const m = __low3d.academia().medir(); return m.alto / m.cabeza; })()`);
      const [c0, c1] = CANON[base];
      if (!(canon > c0 && canon < c1)) mal("el cuerpo de estudio no mide sus cabezas", { base, canon });

      // ── 3 y 4. poses clásicas, y la piel entera
      await elegir('[data-academia="pose"]', "mano-cadera"); await w(500);
      const cadera = await ev(`(()=>{ const x = __low3d.personajeDelTaller(), h = x.articulacion("hand_l"), t = x.articulacion("thigh_l");
        return { planta: Math.hypot(h.x - t.x, h.z - t.z), alto: h.y - t.y }; })()`);
      if (!(cadera.planta < 0.16 && cadera.alto > 0.03 && cadera.alto < 0.3)) mal("«mano en la cadera» no deja la mano en la cadera", cadera);
      const piel1 = await rotas();
      await elegir('[data-academia="pose"]', "brazos-arriba"); await w(500);
      const arriba = await ev(`(()=>{ const x = __low3d.personajeDelTaller(), c = x.articulacion("Head").y; return { l: x.articulacion("hand_l").y - c, r: x.articulacion("hand_r").y - c }; })()`);
      if (!(arriba.l > 0.1 && arriba.r > 0.1)) mal("«brazos arriba» no deja las manos sobre la cabeza", arriba);
      const piel2 = await rotas();
      await elegir('[data-academia="pose"]', "torsion"); await w(500);
      const piel3 = await rotas();
      // la cabeza girada: la cara entera va con ella (en la mujer la boca se quedaba atrás)
      await ev(`(()=>{ __low3d.personajeDelTaller().girarSobreSi("Head", 45); return 1; })()`); await w(300);
      const piel4 = await rotas();
      // medido: el cuerpo de fábrica llega a 5 (17 aristas sobre 4) con la mano en la cadera; este, a 3,1
      if ([piel1, piel2, piel3, piel4].some((p) => p.peor > 3.5 || p.malas > 100)) mal("la piel se rompe al posar", { base, piel1, piel2, piel3, piel4 });

      // ── 5. la mano se cierra
      const mano = await ev(`(()=>{ const x = __low3d.personajeDelTaller(), m = x.cuerpo, g = m.geometry, sk = m.skeleton, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight;
        const k = sk.bones.findIndex(b => b.name === "middle_03_l"), V = x.raiz.position.constructor, v = new V();
        const punta = () => { x.raiz.updateMatrixWorld(true); sk.update(); const c = new V(); let n = 0;
          for (let i = 0; i < SI.count; i++) for (let s = 0; s < 4; s++) if (SI.getComponent(i, s) === k && SW.getComponent(i, s) > 0.5) { m.getVertexPosition(i, v); c.add(v.applyMatrix4(m.matrixWorld)); n++; }
          return n ? c.divideScalar(n) : null; };
        const h = () => x.articulacion("hand_l");
        const p0 = punta(); if (!p0) return null; const d0 = p0.distanceTo(h());
        // cada falange, 60° sobre su eje z (el de doblar), con el mismo girar del Taller
        for (const dd of ["index", "middle", "ring", "pinky"]) for (const f of ["01", "02", "03"]) {
          const b = x.huesos.get(dd + "_" + f + "_l"), eje = new V(0, 0, 1).applyQuaternion(b.getWorldQuaternion(b.quaternion.clone()));
          x.girarPor(dd + "_" + f + "_l", eje, 60); }
        const d1 = punta().distanceTo(h());
        return { d0, d1 }; })()`);
      if (!mano || !(mano.d1 < mano.d0 * 0.8)) mal("los dedos del cuerpo de estudio no tienen piel (la mano no se cierra)", mano);
      res[base] = { cuerpo, canon: +canon.toFixed(2), cadera, arriba, piel: [piel1, piel2, piel3, piel4].map((p) => p.peor), mano };
    }

    if (errores.length) mal("errores de la página", errores);
    console.log("OK check_3d_cuerpo_estudio_ui:", JSON.stringify(res));
  } finally {
    ws.close();
    await fetch(endpoint + "/json/close/" + target.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
