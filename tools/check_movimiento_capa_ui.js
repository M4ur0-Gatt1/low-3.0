/* MOVIMIENTO DE UNA CAPA ENTERA EN LA APP (v3.59). CDP :9223 + mock :8791.

   1. Clic derecho en el nombre de la capa «Fondo» → «Movimiento de la
      capa…»: X = 200, «Clave en el cuadro 1».
   2. En la mesa (dibujando en otra capa) el fondo se ve corrido 200: su grupo
      de contexto lleva la matriz. El dibujo del fondo NO cambió.
   3. El cuadro exportado lleva el fondo movido; la otra capa, quieta.
   4. «Vaso» sigue a «Fondo» (elegido en el diálogo): en el export se mueve igual.
   5. Activando el fondo: la mesa lo marca (se dibuja en su lugar propio) y un
      trazo cae donde se apoya el lápiz, sin corrimiento.
   6. Reproduciendo, la capa activa se ve movida (regla de estilo, sin tocar
      el dibujo).
   7. Un Ctrl+Z por cambio: el padre y la clave se deshacen. */
const endpoint = "http://127.0.0.1:9223";
const pageUrl = "http://127.0.0.1:8791/ui/index.html?mock=1";

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
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const centro = async (sel) => {
    const r = await ev(`(()=>{ const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: "center" }); const b = n.getBoundingClientRect(); return { x: b.left + Math.min(b.width / 2, 60), y: b.top + b.height / 2 }; })()`);
    if (!r) mal("no está en la pantalla: " + sel, {});
    return r;
  };
  const clic = async (sel) => { const r = await centro(sel); for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button: "left", clickCount: 1 }); await w(300); };
  const derecho = async (sel) => { const r = await centro(sel); for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button: "right", clickCount: 1 }); await w(300); };
  const elegirMenu = async (texto) => {
    const ok = await ev(`(()=>{ const b = [...document.querySelectorAll(".ctx-menu .ctx-item")].find(x => x.textContent.includes(${JSON.stringify(texto)})); if (!b) return [...document.querySelectorAll(".ctx-menu .ctx-label")].map(x => x.textContent); b.click(); return true; })()`);
    if (ok !== true) mal("el menú no tiene «" + texto + "»", ok);
    await w(300);
  };

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: pageUrl });
    for (let i = 0; i < 80; i++) {
      if (await ev('document.readyState==="complete" && typeof dzDocInit==="function" && !!api && !!window.LOW?.workspace?.workspaces').catch(() => false)) break;
      await w(250);
    }
    await ev(`(async()=>{ try{localStorage.clear()}catch(e){}
      await openDesign("mock.svg"); await dzDocInit(); await new Promise(r=>setTimeout(r,600));
      LOW.workspace.workspaces.activate("animation", dzWsAplicar); await new Promise(r=>setTimeout(r,400));
      const sc = DZ.doc.scene;
      const crear = (nombre, figura) => { const lv = sc.addLevel(nombre); lv.addDrawing(1, figura); const ly = sc.addLayer(lv.id, nombre); sc.expose(ly.id, 1, 1); return ly.id; };
      window.__c = { fondo: crear("Fondo", "<g data-low-art=\\"colour\\"></g><g data-low-art=\\"line\\"><rect data-prueba=\\"fondo\\" x=\\"10\\" y=\\"10\\" width=\\"100\\" height=\\"60\\"></rect></g>"),
                     vaso: crear("Vaso", "<g data-low-art=\\"colour\\"></g><g data-low-art=\\"line\\"><circle data-prueba=\\"vaso\\" cx=\\"50\\" cy=\\"50\\" r=\\"10\\"></circle></g>") };
      DZ.doc.selectLayer(sc.layers[0].id); DZ.doc.goTo(1); DZ.doc.emit("layers"); await new Promise(r=>setTimeout(r,400)); return true; })()`);
    const ids = await ev(`window.__c`);
    const dibujoFondo = await ev(`DZ.doc.scene.level(DZ.doc.scene.layer(window.__c.fondo).levelId).byNumber(1).content`);

    // 1. el diálogo desde el clic derecho
    await derecho(`.tl2-row[data-layer-row="${ids.fondo}"] .tl2-name`);
    await elegirMenu("Movimiento de la capa");
    if (!(await ev(`!!document.querySelector("#mcClave")`))) mal("no se abrió el diálogo de movimiento", {});
    await ev(`document.querySelector("#mcX").value = "200"; true`);
    await clic("#mcClave");
    const mov = await ev(`DZ.doc.scene.layer(window.__c.fondo).mov`);
    if (!mov || !mov.claves[1] || mov.claves[1].x !== 200) mal("la clave no quedó en la capa", mov);

    // 2. en la mesa, el fondo corrido; su dibujo intacto
    await ev(`dzOnionRender(); true`);
    const tr = await ev(`(document.querySelector('#dzCanvas > svg > g.dz-capa[data-capa="${ids.fondo}"]') || {}).getAttribute?.("transform") || ""`);
    if (!/^matrix\(1 0 0 1 200 0\)$/.test(tr)) mal("en la mesa el fondo no se ve corrido 200", { tr });
    if ((await ev(`DZ.doc.scene.level(DZ.doc.scene.layer(window.__c.fondo).levelId).byNumber(1).content`)) !== dibujoFondo) mal("mover la capa cambió su dibujo", {});

    // 3. el export
    const cuadro = await ev(`dzCuadroSvgTexto(1)`);
    if (!/data-low-capa="[^"]+" transform="matrix\(1 0 0 1 200 0\)"><g data-low-art="colour"><\/g><g data-low-art="line"><rect data-prueba="fondo"/.test(cuadro.replace(/\s+/g, " ")))
      mal("el cuadro exportado no lleva el fondo movido", { cuadro: cuadro.slice(0, 400) });

    // 4. el vaso sigue al fondo (elegido en el diálogo)
    await derecho(`.tl2-row[data-layer-row="${ids.vaso}"] .tl2-name`);
    await elegirMenu("Movimiento de la capa");
    await ev(`(()=>{ const s = document.querySelector("#mcPadre"); s.value = window.__c.fondo; s.dispatchEvent(new Event("change")); return true; })()`);
    // «Mira a» en el mismo diálogo (las opciones listan las otras capas)
    const opcionesMira = await ev(`[...document.querySelectorAll("#mcMira option")].map(o => o.textContent)`);
    if (!opcionesMira.includes("Fondo")) mal("«Mira a» no lista las otras capas", opcionesMira);
    await clic("#mCancel");
    const cuadro2 = (await ev(`dzCuadroSvgTexto(1)`)).replace(/\s+/g, " ");
    if (!/transform="matrix\(1 0 0 1 200 0\)"><g data-low-art="colour"><\/g><g data-low-art="line"><circle data-prueba="vaso"/.test(cuadro2)) mal("el vaso no sigue al fondo en el export", { cuadro2: cuadro2.slice(0, 500) });

    // 5. activando el fondo: marcado, y el trazo cae donde se apoya
    await ev(`(async()=>{ DZ.doc.selectLayer(window.__c.fondo); if (typeof dzCanvasSet==="function") dzCanvasSet(DZ.doc.drawing.content); dzOnionRender(); await new Promise(r=>setTimeout(r,300)); return true; })()`);
    if (!(await ev(`document.querySelector("#dzCanvas").classList.contains("dz-capa-movida")`))) mal("la mesa no marca que la capa activa tiene movimiento", {});
    const trazo = await ev(`(async()=>{ dzSetTool("brush"); await new Promise(r=>setTimeout(r,150));
      const l = document.querySelector("#dzCanvas"), hoja = l.querySelector(":scope > svg"), c = l.getBoundingClientRect();
      const x = c.left + c.width * .5, y = c.top + c.height * .5;
      const p = (t,px,py) => l.dispatchEvent(new PointerEvent(t,{bubbles:true,cancelable:true,pointerId:1,pointerType:"pen",isPrimary:true,button:t==="pointerdown"?0:-1,buttons:t==="pointerup"?0:1,clientX:px,clientY:py,pressure:.7}));
      const antes = new Set(hoja.querySelectorAll("*"));
      p("pointerdown", x, y); for (let i = 1; i <= 10; i++) p("pointermove", x + i * 3, y); p("pointerup", x + 30, y);
      await new Promise(r=>setTimeout(r,200));
      const pt = hoja.createSVGPoint(); pt.x = x; pt.y = y; const loc = pt.matrixTransform(hoja.getScreenCTM().inverse());
      // lo que apareció con el trazo (no la asistencia del editor), medido en coordenadas de la hoja
      const nuevos = [...hoja.querySelectorAll("*")].filter((n) => !antes.has(n) && !n.closest(".dz-onion") && n.getBBox && !n.querySelector("*"));
      const caja = nuevos.map((n) => { const b = n.getBBox(), m = hoja.getScreenCTM().inverse().multiply(n.getScreenCTM());
        const a = new DOMPoint(b.x, b.y).matrixTransform(m), z = new DOMPoint(b.x + b.width, b.y + b.height).matrixTransform(m);
        return [Math.min(a.x, z.x), Math.min(a.y, z.y), Math.abs(z.x - a.x)]; }).sort((u, v) => v[2] - u[2])[0];
      return { creo: nuevos.length > 0, loc: [Math.round(loc.x), Math.round(loc.y)], caja: caja ? caja.map(Math.round) : null }; })()`);
    if (!trazo.creo || !trazo.caja || Math.abs(trazo.caja[0] - trazo.loc[0]) > 25 || Math.abs(trazo.caja[1] - trazo.loc[1]) > 25)
      mal("el trazo no cayó donde se apoyó el lápiz sobre la capa movida", trazo);

    // 6. reproduciendo, la activa se ve movida (y el dibujo no cambia)
    const regla = await ev(`(()=>{ DZ.playback = DZ.playback || {}; const antes = DZ.playback.playing; DZ.playback.playing = true; dzOnionRender();
      const css = document.getElementById("dzCapaActivaCss").textContent; DZ.playback.playing = antes; dzOnionRender();
      return { css, despues: document.getElementById("dzCapaActivaCss").textContent }; })()`);
    if (!/g\[data-low-art\] \{ transform: matrix\(1,0,0,1,200,0\)/.test(regla.css)) mal("reproduciendo, la capa activa no se ve movida", regla);
    if (/transform/.test(regla.despues)) mal("al parar, la capa activa siguió movida mientras se dibuja", regla);

    // 7. Ctrl+Z
    await ev(`(async()=>{ dzUndo(); await new Promise(r=>setTimeout(r,200)); return true; })()`);   // el trazo
    await ev(`(async()=>{ dzUndo(); await new Promise(r=>setTimeout(r,200)); return true; })()`);   // el padre del vaso
    if (await ev(`!!DZ.doc.scene.layer(window.__c.vaso).mov`)) mal("Ctrl+Z no soltó al vaso del fondo", {});
    await ev(`(async()=>{ dzUndo(); await new Promise(r=>setTimeout(r,200)); return true; })()`);   // la clave
    if (await ev(`!!DZ.doc.scene.layer(window.__c.fondo).mov`)) mal("Ctrl+Z no sacó la clave del fondo", {});

    const errB = errores.filter((x) => !/ResizeObserver/.test(String(x)));
    if (errB.length) mal("errores en la página", errB);
    console.log("E2E movimiento de capa OK " + JSON.stringify({ mesa: tr, trazo }));
  } finally {
    try { await send("Page.close"); } catch (_) { /* ya cerrada */ }
    ws.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
