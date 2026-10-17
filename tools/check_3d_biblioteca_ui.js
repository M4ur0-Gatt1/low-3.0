/* LA BIBLIOTECA DE PIEZAS DEL ESTUDIO 3D. CDP :9223 + mock :8791.

   Pedido de Mauro (v3.31): «el módulo 3D como un SimCity para construir una
   ciudad… y paisajes», y «las cosas se deben construir con bibliotecas que se
   puedan personalizar o hacer de cero, porque cada paisaje puede tener estilos
   distintos». Con el mouse de verdad:
   1. Construir → Piezas abre la Biblioteca: kit «Color plano» con sus piezas
      y una miniatura de cada una.
   2. Elegir «Árbol» y hacer clic en el piso: un árbol EN el piso (su base en
      y = 0), donde se hizo clic, agrupado y con su nombre.
   3. Arrastrar siembra varias copias separadas, de tamaños distintos; un solo
      Ctrl+Z saca todas las de ese arrastre (y nada más).
   4. Shift+clic: sin variar (el tamaño exacto de la pieza).
   5. Una pieza PROPIA: lo elegido → «Guardar lo elegido como pieza»; como el
      kit es de fábrica se crea una copia tuya con la pieza nueva, que se guarda
      y se puede colocar.
   6. El kit «Boceto en línea» cambia el estilo de las calles.
   7. Lo colocado viaja con el proyecto (.low3d) con su nombre. */
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
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const aPantalla = (p) => ev(`(()=>{ const e = __low3d, r = e.canvasElement().getBoundingClientRect(), c = e.camera; c.updateMatrixWorld(true);
    const v = new c.position.constructor(...${JSON.stringify(p)}).project(c); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; })()`);
  const mover = (p, buttons = 0) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, buttons, button: buttons ? "left" : "none" });
  const enLienzo = async (p, mundo) => { const bajo = await ev(`(document.elementFromPoint(${p.x}, ${p.y}) || {}).tagName || "nada"`);
    if (bajo !== "CANVAS") throw Error("PRUEBA MAL ARMADA: " + JSON.stringify(mundo) + " cae sobre " + bajo); };
  const clicMundo = async (mundo, modifiers = 0) => {
    const p = await aPantalla(mundo); await enLienzo(p, mundo); await mover(p);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1, modifiers });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1, modifiers });
    await w(200);
  };
  const arrastrarMundo = async (a, b, pasos = 30) => {
    const pa = await aPantalla(a), pb = await aPantalla(b); await enLienzo(pa, a); await enLienzo(pb, b);
    await mover(pa);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pa.x, y: pa.y, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= pasos; i++) { await mover({ x: pa.x + (pb.x - pa.x) * i / pasos, y: pa.y + (pb.y - pa.y) * i / pasos }, 1); await w(10); }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pb.x, y: pb.y, button: "left", buttons: 0, clickCount: 1 });
    await w(250);
  };
  const clicEn = async (sel) => {
    const p = await ev(`(()=>{ const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null; b.scrollIntoView({ block: "nearest" }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!p) mal("falta en pantalla: " + sel, {});
    await mover(p);
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 });
    await w(250);
  };
  const tecla = async (key, code, vk, modifiers = 0) => { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers }); await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers }); await w(200); };
  /** Cada objeto colocado (por grupo): nombre, base, centro y alto en el mundo. */
  const grupos = () => ev(`(()=>{ const e = __low3d, por = new Map();
    for (const s of e.strokes) { if (!s.groupId) continue; if (!por.has(s.groupId)) por.set(s.groupId, []); por.get(s.groupId).push(s); }
    const r = v => Math.round(v * 100) / 100;
    return [...por.entries()].map(([g, recs]) => { const pts = [];
      for (const s of recs) s.object.traverse(m => { const a = m.geometry && m.geometry.attributes.position; if (!a) return; m.updateMatrixWorld(true);
        for (let i = 0; i < a.count; i += 3) pts.push(new m.position.constructor(a.getX(i), a.getY(i), a.getZ(i)).applyMatrix4(m.matrixWorld)); });
      const k = c => [Math.min(...pts.map(p => p[c])), Math.max(...pts.map(p => p[c]))];
      const x = k("x"), y = k("y"), z = k("z");
      return { g, nombre: e.groupNames.get(g), n: recs.length, base: r(y[0]), alto: r(y[1] - y[0]), cx: r((x[0] + x[1]) / 2), cz: r((z[0] + z[1]) / 2) }; }); })()`);
  const camara = (pos, mira) => ev(`(()=>{ const e = __low3d; e.camera.position.set(...${JSON.stringify(pos)}); e.controls.target.set(...${JSON.stringify(mira)});
    e.camera.lookAt(e.controls.target); e.controls.update(); return true; })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
    await ev(`try{localStorage.clear(); localStorage.setItem("low3d:guia-fondos","1")}catch(e){}; location.reload(); true`);
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d && document.readyState === 'complete'").catch(() => false)) break; await w(250); }
    await w(400);
    await ev(`__low3d.newProject(); true`);
    await camara([0, 40, 34], [0, 0, 0]); await w(200);

    // ── 1. Construir → Piezas abre la biblioteca
    await clicEn(".studio-tool-rail .studio-grupo .studio-grupo-caret");
    await clicEn('.studio-grupo-menu [data-tool="pieza"]');
    const panel = await ev(`({ titulo: (document.querySelector(".studio-inspector-title h2") || {}).textContent, kit: (document.querySelector('[aria-label="Escenografía"]') || {}).value,
      piezas: [...document.querySelectorAll(".biblio3d-grilla [data-pieza]")].map(b => b.textContent.trim()), tool: __lowStore.getState().currentTool })`);
    if (panel.titulo !== "Biblioteca de escenografía" || panel.tool !== "pieza") mal("Construir → Piezas no abrió la biblioteca", panel);
    if (panel.kit !== "fabrica-plano" || panel.piezas.length < 8 || !panel.piezas.includes("Árbol")) mal("la biblioteca no trae el kit «Color plano» con sus piezas", panel);
    let minis = 0;
    for (let i = 0; i < 40 && minis < panel.piezas.length; i++) { minis = await ev(`[...document.querySelectorAll(".biblio3d-grilla img")].filter(i => i.src.startsWith("data:image/png") && i.src.length > 500).length`); if (minis < panel.piezas.length) await w(250); }
    if (minis < panel.piezas.length) mal("faltan miniaturas de las piezas", { minis, piezas: panel.piezas.length });

    // ── 2. un árbol con un clic
    await clicEn('.biblio3d-grilla [data-pieza="plano-arbol"]');
    await clicMundo([0, 0, 0]);
    let gs = await grupos();
    if (gs.length !== 1 || gs[0].nombre !== "Árbol" || gs[0].n !== 2) mal("un clic no colocó UN árbol con su nombre", gs);
    if (Math.abs(gs[0].base) > 0.05 || Math.hypot(gs[0].cx, gs[0].cz) > 0.4) mal("el árbol no quedó EN el piso, donde se hizo clic", gs[0]);

    // ── 3. sembrar arrastrando; un Ctrl+Z las saca
    await arrastrarMundo([-16, 0, 8], [16, 0, 8]);
    gs = await grupos();
    const sembrados = gs.filter(g => Math.abs(g.cz - 8) < 2);
    if (sembrados.length < 4) mal("arrastrar no sembró varias copias", gs);
    const xs = sembrados.map(g => g.cx).sort((a, b) => a - b);
    if (xs.some((x, i) => i && x - xs[i - 1] < 4.6 * 0.75 * 1.2 - 0.6)) mal("las copias sembradas quedaron encimadas", xs);
    if (new Set(sembrados.map(g => g.alto)).size < 2) mal("las copias sembradas son todas del mismo tamaño (sin variación)", sembrados.map(g => g.alto));
    if (sembrados.some(g => Math.abs(g.base) > 0.05)) mal("una copia sembrada no quedó en el piso", sembrados);
    await tecla("z", "KeyZ", 90, 2);
    gs = await grupos();
    if (gs.length !== 1) mal("un Ctrl+Z no sacó todas las copias del arrastre (o sacó de más)", gs);

    // ── 4. Shift: sin variar
    await clicEn('.biblio3d-grilla [data-pieza="plano-pino"]');
    await clicMundo([8, 0, -6], 8);
    gs = await grupos();
    const pino = gs.find(g => g.nombre === "Pino");
    if (!pino || Math.abs(pino.alto - 7.7) > 0.15) mal("Shift+clic no colocó el pino de su tamaño exacto", pino);

    // ── 5. una pieza propia a partir de lo elegido
    await ev(`(()=>{ const o = __lowStore.getState().objects.find(o => o.name === "Pino"); __low3d.selectObjectById(o.id); return true; })()`); await w(150);
    await clicEn(".biblio3d-guardar");
    await ev(`(()=>{ const i = document.querySelector('[aria-label="Nombre del elemento"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "Mi pino"); i.dispatchEvent(new Event("input", { bubbles: true }));
      const s = document.querySelector('[aria-label="Categoría del elemento"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, "arbol"); s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
    await w(100);
    await ev(`(()=>{ [...document.querySelectorAll(".biblio3d .persp3d-boton")].find(b => b.textContent === "Guardar").click(); return true; })()`);
    await w(400);
    const propio = await ev(`({ kit: document.querySelector('[aria-label="Escenografía"]').selectedOptions[0].textContent, piezas: [...document.querySelectorAll(".biblio3d-grilla [data-pieza]")].map(b => b.textContent.trim()),
      guardado: JSON.parse(localStorage.getItem("low3d:kits") || "[]").map(k => ({ nombre: k.nombre, n: k.piezas.length })) })`);
    if (propio.kit !== "Color plano (mía)" || !propio.piezas.includes("Mi pino")) mal("guardar lo elegido no creó tu copia del kit con la pieza nueva", propio);
    if (!propio.guardado.length || propio.guardado[0].n !== panel.piezas.length + 1) mal("el kit propio no quedó guardado", propio.guardado);
    await ev(`(()=>{ const b = [...document.querySelectorAll(".biblio3d-grilla [data-pieza]")].find(b => b.textContent.trim() === "Mi pino"); b.click(); return true; })()`); await w(150);
    await clicMundo([-8, 0, -6], 8);
    gs = await grupos();
    const mio = gs.find(g => g.nombre === "Mi pino");
    if (!mio || Math.abs(mio.alto - pino.alto) > 0.1 || Math.abs(mio.base) > 0.05) mal("la pieza propia no se coloca igual que el original", { mio, pino });

    // ── 6. otro estilo: las calles cambian de color
    const antes = await ev(`__low3d.getEstiloCalles().calzada`);
    await ev(`(()=>{ const s = document.querySelector('[aria-label="Escenografía"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, "fabrica-linea"); s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
    await w(300);
    const despues = await ev(`({ calzada: __low3d.getEstiloCalles().calzada, piezas: [...document.querySelectorAll(".biblio3d-grilla [data-pieza]")].length })`);
    if (despues.calzada === antes || despues.calzada !== "#f4f2ee" || despues.piezas < 6) mal("el kit «Boceto en línea» no cambió el estilo (o no tiene piezas)", { antes, despues });

    // ── 7. viaja con el proyecto
    const vuelta = await ev(`(()=>{ const p = JSON.parse(JSON.stringify(__low3d.exportProject())); __low3d.newProject(); __low3d.importProject(p);
      return { nombres: [...new Set(__low3d.strokes.map(s => __low3d.groupNames.get(s.groupId)))].sort(), estilo: __low3d.getEstiloCalles().calzada }; })()`);
    if (vuelta.nombres.join() !== "Mi pino,Pino,Árbol" || vuelta.estilo !== "#f4f2ee") mal("lo colocado (o el estilo) no viaja con el proyecto", vuelta);

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
    console.log("E2E biblioteca de piezas 3D OK " + JSON.stringify({ piezas: panel.piezas.length, sembrados: sembrados.length, altos: sembrados.map(g => g.alto) }));
  } finally {
    ws.close();
    try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  }
}

main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
