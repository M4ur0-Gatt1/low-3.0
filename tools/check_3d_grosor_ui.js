/* EL GROSOR DEL 3D EN PÍXELES, COMO EN EL 2D (v3.43). CDP :9223 + mock :8791.

   Pedido de Mauro: «hay un problema con el espesor de las líneas en el módulo
   3D: la línea en 1 es demasiado gruesa, no tiene los espesores como en el
   módulo 2D». Medido antes: el grosor 1 era un caño de 2,2 cm de diámetro (y
   el 100, de 26 cm); en pantalla, una línea de 1 se veía como una soga.

   Con el mouse de verdad:
   1. El deslizador del grosor va de 0,5 a 100 px en escala logarítmica: al
      medio, unos 7 px (los grosores finos de entintar se pueden elegir).
   2. Trazos de grosor 1, 6 y 20 miden en pantalla eso mismo (±15 %), donde
      arrancan.
   3. Mientras se dibuja se ve el trazo con su grosor (no una línea de 1 px).
   4. El grosor queda fijo en el mundo: al acercar la cámara, el trazo engorda
      en pantalla (como al hacer zoom en el 2D).
   5. Un trazo de antes (sin la medida nueva) se sigue viendo como siempre. */
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
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
  // el ancho en pantalla de un trazo donde arranca: el diámetro del caño proyectado
  const anchoEnPantalla = (i) => ev(`(()=>{ const e = __low3d, recs = e.strokes.filter(r => r.kind === "stroke"), r = recs[${i}]; if (!r) return null;
    const c = e.camera, V = c.position.constructor, der = new V().setFromMatrixColumn(c.matrixWorld, 0).normalize();
    const b = r.brush, rad = b.mundoPorPx ? b.size * 0.5 * b.mundoPorPx : 0.01 + (b.size / 100) * 0.12;
    const p = r.points[0].clone().applyMatrix4(r.object.matrixWorld), q = p.clone().addScaledVector(der, rad * 2);
    const a = p.project(c), z = q.project(c), W = e.canvasElement().clientWidth, H = e.canvasElement().clientHeight;
    return { px: Math.hypot((z.x - a.x) * W / 2, (z.y - a.y) * H / 2), size: b.size, mpp: b.mundoPorPx || null }; })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
    await ev(`try{localStorage.clear(); localStorage.setItem("low3d:guia-fondos","1")}catch(e){}; location.reload(); true`);
    for (let i = 0; i < 80; i++) { await w(250); if (await ev("!!window.__low3d && !!window.__lowStore").catch(() => false)) break; }
    await ev(`__low3d.newProject(); true`); await w(300);

    // ── 1. el deslizador logarítmico ──
    const desl = await ev(`(()=>{ const i = document.querySelector('input[aria-label="Tamaño del pincel"]'); if (!i) return null; return { min: i.min, max: i.max }; })()`);
    if (!desl || desl.max !== "1000") mal("el deslizador del grosor no es el nuevo (0,5 a 100 px)", desl);
    await ev(`(()=>{ const i = document.querySelector('input[aria-label="Tamaño del pincel"]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; s.call(i, "500"); i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`); await w(150);
    const medio = await ev(`__lowStore.getState().brushSettings.size`);
    if (!(medio >= 6.5 && medio <= 7.5)) mal("al medio del deslizador el grosor no es unos 7 px (escala logarítmica)", { medio });
    await ev(`(()=>{ const i = document.querySelector('input[aria-label="Tamaño del pincel"]'); const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; s.call(i, "0"); i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`); await w(150);
    if ((await ev(`__lowStore.getState().brushSettings.size`)) !== 0.5) mal("abajo del todo el grosor no es 0,5 px", {});

    // ── 2 y 3. trazos de 1, 6 y 20 px, en vivo y al soltar ──
    const xs = { 1: 520, 6: 680, 20: 840 }, medidos = {};
    for (const g of [1, 6, 20]) {
      await ev(`(()=>{ const st = window.__lowStore; st.setBrushSettings({ ...st.getState().brushSettings, size: ${g}, pressureSensitivity: 0, color: "#000000" }); return true; })()`);
      const x = xs[g];
      await mouse("mouseMoved", x, 470); await mouse("mousePressed", x, 470, { buttons: 1, clickCount: 1 });
      for (let i = 1; i <= 16; i++) { await mouse("mouseMoved", x, 470 + i * 10, { buttons: 1 }); await w(15); }
      await w(120);
      if (g === 6) {
        const vivo = await ev(`(()=>{ let n = 0; __low3d.strokesGroup.traverse(o => { if (o.isLine && o.children.some(h => h.isMesh)) n++; }); return n; })()`).catch(() => null);
        if (!vivo) mal("mientras se dibuja no se ve el trazo con su grosor (sigue la línea de 1 px)", { vivo });
      }
      await mouse("mouseReleased", x, 630, { buttons: 0, clickCount: 1 }); await w(400);
      medidos[g] = await anchoEnPantalla(Object.keys(medidos).length);
      if (!medidos[g] || !medidos[g].mpp) mal("el trazo no guardó su medida en píxeles", medidos[g]);
      if (Math.abs(medidos[g].px - g) > Math.max(0.3, g * 0.15)) mal(`el trazo de grosor ${g} no mide ${g} px en pantalla`, medidos[g]);
    }

    // ── 4. fijo en el mundo: al acercar, engorda ──
    const lejos = medidos[6].px;
    await ev(`(()=>{ const c = __low3d.camera, o = __low3d.controls.target; c.position.lerp(o, 0.5); c.lookAt(o); __low3d.controls.update(); return true; })()`); await w(200);
    const cerca = (await anchoEnPantalla(1)).px;
    if (!(cerca > lejos * 1.4)) mal("al acercar la cámara el trazo no engordó en pantalla (el grosor tiene que quedar fijo en el mundo)", { lejos, cerca });

    // ── 5. un trazo de antes se ve como siempre ──
    const viejo = await ev(`(()=>{ const e = __low3d, r = e.strokes.filter(r => r.kind === "stroke")[0]; delete r.brush.mundoPorPx; e.rebuildStrokeMesh(r);
      let rad = 0; r.object.traverse(o => { if (o.isMesh && o.geometry) { o.geometry.computeBoundingBox(); } });
      return r.brush.mundoPorPx === undefined; })()`);
    if (!viejo) mal("no se pudo armar un trazo de los de antes", {});
    const ant = await anchoEnPantalla(0);
    if (!(ant.mpp === null && ant.px > 5)) mal("un trazo de antes (sin la medida en px) no se ve como siempre", ant);

    if (errores.length) mal("errores de la página", errores);
    console.log("OK check_3d_grosor_ui:", JSON.stringify({ medio, px: Object.fromEntries(Object.entries(medidos).map(([k, v]) => [k, +v.px.toFixed(2)])), acercar: [+lejos.toFixed(1), +cerca.toFixed(1)] }));
  } finally {
    ws.close();
    await fetch(endpoint + "/json/close/" + target.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
