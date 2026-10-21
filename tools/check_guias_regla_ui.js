/* GUÍAS DESDE LA REGLA, COMO EN ILLUSTRATOR (v3.38). CDP :9223 + mock :8791.

   Pedido de Mauro: «quiero que agregues la posibilidad de poner guías como en
   Illustrator a partir de la regla».

   Medido en la 3.37: las guías se creaban en los datos pero NO SE VEÍAN (su
   capa nacía oculta) y la regla estaba corrida 18 px de la hoja.

   Con el mouse y el teclado de verdad:
   1. Ctrl+R: el «0» de las reglas coincide con el borde de la hoja (arriba y a
      la izquierda).
   2. Arrastrar desde la regla de arriba hasta y = 300: aparece una guía
      horizontal JUSTO ahí (en pantalla y en los datos); desde la izquierda,
      una vertical; con Alt, la otra orientación.
   3. Con zoom la guía sigue en el mismo lugar de la hoja.
   4. Mover un rectángulo cerca de la guía: su borde se PEGA a ella. Dibujar un
      rectángulo empezando cerca: la esquina se pega.
   5. Arrastrar la guía a la regla la borra; Ctrl+Z la vuelve; Ctrl+Y la borra.
   6. Doble clic en la guía: escribir 540 + Enter la pone en 540.
   7. Clic en la guía + Supr borra la guía (no el dibujo elegido).
   8. Vista: Reglas, Mostrar guías (Ctrl+Ñ), Bloquear, Imantar, Borrar. Bloqueada
      no se mueve; oculta no se ve.
   9. Las guías viajan con la escena (se guardan con el documento). */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const base = process.argv[3] || "http://127.0.0.1:8791/ui/";

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
  const mouse = (type, x, y, buttons = 0, modifiers = 0, clickCount = 1) => send("Input.dispatchMouseEvent", { type, x, y, modifiers, button: type === "mouseMoved" ? (buttons ? "left" : "none") : "left", buttons, clickCount });
  const arrastrar = async (a, b, modifiers = 0, pasos = 12) => {
    await mouse("mouseMoved", a.x, a.y, 0, modifiers); await mouse("mousePressed", a.x, a.y, 1, modifiers);
    for (let i = 1; i <= pasos; i++) { await mouse("mouseMoved", a.x + (b.x - a.x) * i / pasos, a.y + (b.y - a.y) * i / pasos, 1, modifiers); await w(15); }
    await mouse("mouseReleased", b.x, b.y, 0, modifiers); await w(250);
  };
  const tecla = async (key, code, vk, modifiers = 0) => { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers }); await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers }); await w(250); };
  const CTRL = 2, ALT = 1, SHIFT = 8;
  // las guías en pantalla (la línea visible) y en los datos
  const estado = () => ev(`(()=>{ const cv = document.querySelector("#dzCanvas").getBoundingClientRect(), box = document.querySelector("#dzGuides");
    const lineas = [...document.querySelectorAll("#dzGuides line.dz-guia")].map(l => { const r = l.getBoundingClientRect(); return { axis: l.dataset.axis,
      // la posición de la línea en la pantalla (la parte que cae sobre el lienzo)
      x: l.dataset.axis === "v" ? Math.round(cv.left + (+l.getAttribute("x1") + +l.getAttribute("x2")) / 2) : null,
      y: l.dataset.axis === "h" ? Math.round(cv.top + (+l.getAttribute("y1") + +l.getAttribute("y2")) / 2) : null }; });
    return { visible: !!box && !box.hidden && getComputedStyle(box).display !== "none", lineas, datos: (DZ.doc.scene.guias || []).map(g => ({ axis: g.axis, u: Math.round(g.u * 10) / 10 })) }; })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: base + "index.html?mock=1" });
    for (let i = 0; i < 90; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api').catch(() => false)) break; await w(400); }
    await ev(`(async()=>{ try{localStorage.clear()}catch(e){}; dzMenuAction("nuevo"); await new Promise(r=>setTimeout(r,2800)); return true; })()`);
    if (!(await ev(`!!(LOW.drawing && LOW.drawing.guias)`))) mal("no está el módulo de guías (drawing/guias.js)", {});

    // ── 1. las reglas, alineadas con la hoja ──
    await tecla("r", "KeyR", 82, CTRL);
    const r1 = await ev(`(()=>{ const hoja = DZ.doc.scene, o = dzToScreen(0, 0), cv = document.querySelector("#dzCanvas").getBoundingClientRect();
      const cero = (sel, eje) => { const s = [...document.querySelectorAll(sel + " .dz-tk:not(.mn)")].find(s => s.textContent.trim() === "0"); if (!s) return null; const r = s.getBoundingClientRect(); return Math.round(eje === "x" ? r.left : r.top); };
      return { reglas: !document.querySelector("#dzRulers").hidden, hojaX: Math.round(cv.left + o.x), hojaY: Math.round(cv.top + o.y), ceroArriba: cero("#dzRlTop", "x"), ceroIzq: cero("#dzRlLeft", "y"),
        top: (()=>{ const r = document.querySelector("#dzRlTop").getBoundingClientRect(); return [r.left, r.top, r.height]; })(), izq: (()=>{ const r = document.querySelector("#dzRlLeft").getBoundingClientRect(); return [r.left, r.top, r.width]; })() }; })()`);
    if (!r1.reglas) mal("Ctrl+R no mostró las reglas", r1);
    if (r1.ceroArriba == null || Math.abs(r1.ceroArriba - r1.hojaX) > 1 || r1.ceroIzq == null || Math.abs(r1.ceroIzq - r1.hojaY) > 1) mal("el 0 de las reglas no coincide con el borde de la hoja", r1);

    // ── 2. tirar guías desde las reglas ──
    await arrastrar({ x: r1.top[0] + 300, y: r1.top[1] + r1.top[2] / 2 }, { x: r1.top[0] + 300, y: 300 });
    await arrastrar({ x: r1.izq[0] + r1.izq[2] / 2, y: r1.izq[1] + 200 }, { x: 500, y: r1.izq[1] + 200 });
    let s = await estado();
    if (!s.visible || s.lineas.length !== 2) mal("las guías tiradas desde la regla no se ven", s);
    const gh = s.lineas.find((l) => l.axis === "h"), gv = s.lineas.find((l) => l.axis === "v");
    if (!gh || Math.abs(gh.y - 300) > 1 || !gv || Math.abs(gv.x - 500) > 1) mal("las guías no quedaron donde se soltaron (y 300, x 500)", s);
    const esperado = await ev(`({ y: Math.round(dzToUser(500, 300).y * 10) / 10, x: Math.round(dzToUser(500, 300).x * 10) / 10 })`);
    const dh = s.datos.find((g) => g.axis === "h"), dv = s.datos.find((g) => g.axis === "v");
    if (Math.abs(dh.u - esperado.y) > 1 || Math.abs(dv.u - esperado.x) > 1) mal("la posición guardada de las guías no es la de la hoja bajo el cursor", { s, esperado });
    // con Alt desde la regla de arriba sale VERTICAL
    await arrastrar({ x: r1.top[0] + 600, y: r1.top[1] + r1.top[2] / 2 }, { x: 760, y: 360 }, ALT);
    s = await estado();
    const alt = s.lineas.filter((l) => l.axis === "v");
    if (alt.length !== 2 || !alt.some((l) => Math.abs(l.x - 760) <= 1)) mal("con Alt la guía de la regla de arriba no salió vertical", s);
    await tecla("z", "KeyZ", 90, CTRL);   // sacar la de Alt
    if ((await estado()).lineas.length !== 2) mal("Ctrl+Z no sacó la última guía", await estado());

    // ── 3. con zoom, la guía sigue en el mismo lugar de la hoja ──
    await ev(`(()=>{ const c = document.querySelector("#dzCanvas").getBoundingClientRect(); dzZoomAt(1.6, c.left + 100, c.top + 120); return true; })()`); await w(250);
    const z = await ev(`(()=>{ const cv = document.querySelector("#dzCanvas").getBoundingClientRect(), g = DZ.doc.scene.guias.find(g => g.axis === "h"); return Math.round(cv.top + dzToScreen(0, g.u).y); })()`);
    s = await estado();
    if (Math.abs(s.lineas.find((l) => l.axis === "h").y - z) > 1) mal("con zoom la guía no siguió a la hoja", { s, z });
    await ev(`dzFitView(); true`); await w(300);

    // ── 4. el imán: mover un rectángulo y dibujar uno ──
    const u = (await estado()).datos.find((g) => g.axis === "h").u;
    const rect = await ev(`(()=>{ const svg = document.querySelector("#dzCanvas > svg"), r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("x", 300); r.setAttribute("y", ${u} + 60); r.setAttribute("width", 200); r.setAttribute("height", 120); r.setAttribute("fill", "#d33"); r.id = "rojo";
      dzArtAppend(svg, r); dzMarkDirty(); const cv = document.querySelector("#dzCanvas").getBoundingClientRect(), a = dzToScreen(400, ${u} + 120);
      return { x: cv.left + a.x, y: cv.top + a.y, zoom: DZ.zoom }; })()`);
    await tecla("v", "KeyV", 86);
    await mouse("mousePressed", rect.x, rect.y, 1); await mouse("mouseReleased", rect.x, rect.y); await w(200);
    // subir el rectángulo 60 unidades de la hoja menos un poquito (2 px de pantalla): su borde de arriba tiene que pegarse a la guía
    const subir = 60 * rect.zoom - 2;
    await arrastrar({ x: rect.x, y: rect.y }, { x: rect.x + 3, y: rect.y - subir }, 0, 16);
    const arriba = await ev(`(()=>{ const r = document.getElementById("rojo"), b = r.getBBox(), m = r.transform.baseVal.consolidate(); return Math.round((b.y + (m ? m.matrix.f : 0)) * 10) / 10; })()`);
    if (Math.abs(arriba - u) > 0.05) mal("mover el rectángulo cerca de la guía no lo pegó a ella", { arriba, u });
    // dibujar un rectángulo arrancando a 2 px de pantalla de la guía
    await ev(`dzFormaElegir("rect"); true`);
    const d0 = await ev(`(()=>{ const cv = document.querySelector("#dzCanvas").getBoundingClientRect(), a = dzToScreen(900, ${u}); return { x: cv.left + a.x, y: cv.top + a.y + 2 }; })()`);
    const antesN = await ev(`document.querySelectorAll("#dzCanvas > svg rect").length`);
    await arrastrar(d0, { x: d0.x + 80, y: d0.y + 60 }, 0, 8);
    const dib = await ev(`(()=>{ const rs = [...document.querySelectorAll("#dzCanvas > svg rect")]; const r = rs.find(x => x.id !== "rojo" && !x.closest(".dz-onion") && +x.getAttribute("x") > 800); return { n: rs.length, todos: rs.map(x => [x.id, x.getAttribute("x"), x.getAttribute("y")]), y: r ? Math.round(+r.getAttribute("y") * 10) / 10 : null }; })()`);
    if (dib.n !== antesN + 1 || Math.abs(dib.y - u) > 0.05) mal("dibujar un rectángulo cerca de la guía no pegó su esquina", { dib, u });
    await tecla("v", "KeyV", 86);

    // ── 5. a la regla la borra; Ctrl+Z; Ctrl+Y ──
    s = await estado();
    const lv = s.lineas.find((l) => l.axis === "v");
    await arrastrar({ x: lv.x, y: 420 }, { x: r1.izq[0] + r1.izq[2] / 2, y: 420 });
    if ((await estado()).datos.some((g) => g.axis === "v")) mal("soltar la guía sobre la regla no la borró", await estado());
    await tecla("z", "KeyZ", 90, CTRL);
    if (!(await estado()).datos.some((g) => g.axis === "v")) mal("Ctrl+Z no volvió la guía borrada", await estado());
    await tecla("y", "KeyY", 89, CTRL);
    if ((await estado()).datos.some((g) => g.axis === "v")) mal("Ctrl+Y no la volvió a borrar", await estado());
    await tecla("z", "KeyZ", 90, CTRL);

    // ── 6. doble clic: la posición exacta ──
    s = await estado();
    const lh = s.lineas.find((l) => l.axis === "h");
    await mouse("mouseMoved", 700, lh.y); await mouse("mousePressed", 700, lh.y, 1, 0, 1); await mouse("mouseReleased", 700, lh.y, 0, 0, 1);
    await mouse("mousePressed", 700, lh.y, 1, 0, 2); await mouse("mouseReleased", 700, lh.y, 0, 0, 2); await w(250);
    if (!(await ev(`!!document.querySelector(".dz-guia-campo")`))) mal("el doble clic en la guía no abrió el campo de posición", {});
    await send("Input.insertText", { text: "540" }).catch(() => {});
    await ev(`(()=>{ const c = document.querySelector(".dz-guia-campo"); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(c, "540"); return true; })()`);
    await tecla("Enter", "Enter", 13);
    if (!(await estado()).datos.some((g) => g.axis === "h" && g.u === 540)) mal("escribir 540 no puso la guía en 540", await estado());

    // ── 7. clic en la guía + Supr: borra la guía, no el dibujo elegido ──
    await ev(`dzSelect(document.getElementById("rojo")); true`);
    const y540 = (await estado()).lineas.find((l) => l.axis === "h").y;
    await mouse("mouseMoved", 1000, y540); await mouse("mousePressed", 1000, y540, 1); await mouse("mouseReleased", 1000, y540); await w(200);
    await tecla("Delete", "Delete", 46);
    const t7 = await ev(`({ rojo: !!document.getElementById("rojo"), h: DZ.doc.scene.guias.filter(g => g.axis === "h").length, v: DZ.doc.scene.guias.filter(g => g.axis === "v").length })`);
    if (!t7.rojo || t7.h !== 0 || t7.v !== 1) mal("Supr con la guía elegida no borró esa guía (o borró el dibujo, u otra guía)", t7);
    await tecla("z", "KeyZ", 90, CTRL);
    if ((await ev(`DZ.doc.scene.guias.length`)) !== 2) mal("Ctrl+Z no volvió la guía borrada con Supr", {});

    // ── 8. el menú Vista; ocultar; bloquear ──
    const menu = await ev(`[...document.querySelectorAll('[data-menu="vista"] [data-act^="guias-"]')].map(s => s.dataset.act + (s.classList.contains("on") ? "+" : ""))`);
    for (const a of ["guias-reglas", "guias-ver", "guias-bloquear", "guias-iman", "guias-borrar"]) if (!menu.some((m) => m.startsWith(a))) mal("falta en el menú Vista: " + a, menu);
    await tecla("ñ", "Semicolon", 186, CTRL);
    if ((await estado()).visible) mal("Ctrl+Ñ no ocultó las guías", {});
    await tecla("ñ", "Semicolon", 186, CTRL);
    if (!(await estado()).visible) mal("Ctrl+Ñ no volvió a mostrar las guías", {});
    await ev(`dzMenuAction("guias-bloquear"); true`);
    const yb = (await estado()).lineas.find((l) => l.axis === "h").y, ub = (await estado()).datos.find((g) => g.axis === "h").u;
    await arrastrar({ x: 1000, y: yb }, { x: 1000, y: yb + 80 });
    if ((await estado()).datos.find((g) => g.axis === "h").u !== ub) mal("bloqueada, la guía se movió", await estado());
    await ev(`dzMenuAction("guias-bloquear"); true`);

    // ── 9. viaja con la escena ──
    const t9 = await ev(`(()=>{ const sc = DZ.doc.scene, j = JSON.parse(JSON.stringify(sc.toJSON())); const otra = new sc.constructor(j); return { json: j.guias, vuelta: otra.guias }; })()`);
    if (!Array.isArray(t9.json) || t9.json.length !== 2 || t9.vuelta.length !== 2 || !t9.vuelta.some((g) => g.axis === "h" && g.u === 540)) mal("las guías no se guardan con la escena", t9);

    if (errores.length) mal("errores de la página", errores.slice(0, 3));
    console.log("OK check_guias_regla_ui: " + JSON.stringify({ reglas: [r1.ceroArriba - r1.hojaX, r1.ceroIzq - r1.hojaY], guia: u, iman: arriba, dibujo: dib.y, json: t9.json }));
  } finally {
    ws.close();
    await fetch(endpoint + "/json/close/" + target.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
