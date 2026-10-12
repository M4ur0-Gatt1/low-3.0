/* ✂ LIMPIEZA DE LÍNEA: CUCHILLA, CINTA, PINZA. CDP :9223 + mock :8791.

   Pedido de Mauro (v3.27): «una herramienta cuchilla para cortar líneas de
   vector que se cruzan, como en Toon Boom u OpenToonz… también una que sirve
   para unir líneas, eliminar huecos; copiemos esas herramientas en su flujo
   completo». Con el mouse y el teclado de verdad, sobre un «#» de líneas:
   1. Shift+T elige la Cuchilla; al pasar el mouse marca el tramo.
   2. Clic en una colita: se va hasta el cruce, y nada más.
   3. Clic en el medio de una línea: se va el tramo entre los dos cruces y
      quedan las dos puntas.
   4. Arrastrar cruzando dos colitas: se van las dos; Ctrl+Z las devuelve en un paso.
   5. Un PINCEL también se corta en el cruce (y sigue siendo pincel).
   6. «Recortar sobrantes»: las colitas cortas se van, las largas quedan.
   7. La Pinza (X) parte una CURVA en dos sin deformarla (antes la volvía recta).
   8. Alt+C elige la Cinta: de punta a punta suelda dos líneas en una; de
      punta a línea la prolonga hasta tocarla; un rectángulo cierra todos los
      huecos de adentro.
   9. «Sólo para pintar»: el cierre es invisible, pero el balde lo respeta. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 120000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const P = (x, y) => ev(`(()=>{ const m = document.querySelector("#dzCanvas > svg").getScreenCTM(); return { x: m.a*${x} + m.c*${y} + m.e, y: m.b*${x} + m.d*${y} + m.f }; })()`);
  const clic = async (x, y) => { const p = await P(x, y);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
    await w(30);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 });
    await w(200); };
  const arrastrar = async (a, b, pasos = 14) => { const pa = await P(a[0], a[1]), pb = await P(b[0], b[1]);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pa.x, y: pa.y, buttons: 0 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pa.x, y: pa.y, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= pasos; i++) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pa.x + (pb.x - pa.x) * i / pasos, y: pa.y + (pb.y - pa.y) * i / pasos, button: "left", buttons: 1 }); await w(10); }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pb.x, y: pb.y, button: "left", buttons: 0, clickCount: 1 });
    await w(250); };
  const tecla = async (key, code, kc, mod = 0) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: kc, modifiers: mod });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: kc, modifiers: mod }); await w(150); };
  /** Las líneas del dibujo como las ve la limpieza (puntas en el lienzo). */
  const lineas = () => ev(`LOW.vector.limpiezaHerramientas.todas(document.querySelector("#dzCanvas > svg")).map(l => ({
    tipo: l.tipo, cerrada: l.cerrada, a: l.poly[0].slice(0, 2).map(v => Math.round(v * 10) / 10), b: l.poly.at(-1).slice(0, 2).map(v => Math.round(v * 10) / 10),
    largo: Math.round(l.acum.at(-1) * 10) / 10, pincel: l.el.hasAttribute("data-low-brush-points") }))`);
  const cerca = (a, b, e = 1.6) => Math.abs(a - b) <= e;
  const sobreY = (ls, y) => ls.filter(l => cerca(l.a[1], y) && cerca(l.b[1], y));
  const sobreX = (ls, x) => ls.filter(l => cerca(l.a[0], x) && cerca(l.b[0], x));
  const extremosX = (l) => [Math.min(l.a[0], l.b[0]), Math.max(l.a[0], l.b[0])];
  const extremosY = (l) => [Math.min(l.a[1], l.b[1]), Math.max(l.a[1], l.b[1])];

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!(LOW.vector&&LOW.vector.limpiezaHerramientas)').catch(() => false)) break;
    await w(400);
  }
  await ev(`(async()=>{ try{localStorage.clear()}catch(e){} dzMenuAction("nuevo"); await new Promise(r=>setTimeout(r,2800));
    if (typeof closeL3d === "function") closeL3d(); dzMenuAction("fit"); dzSetTool("select");
    const svg = document.querySelector("#dzCanvas > svg");
    window.__linea = (d) => { const p = document.createElementNS(svg.namespaceURI, "path"); p.setAttribute("d", d); p.setAttribute("fill", "none");
      p.setAttribute("stroke", "#111111"); p.setAttribute("stroke-width", "6"); p.setAttribute("stroke-linecap", "round");
      dzArtAppend(svg, p); if (typeof dzStyleTag === "function") dzStyleTag(p, "ink"); return p; };
    // el «#»: dos horizontales y dos verticales
    __linea("M 100 300 L 900 300"); __linea("M 100 500 L 900 500");
    __linea("M 300 100 L 300 700"); __linea("M 700 100 L 700 700");
    dzDocCommit(); dzBuildLayers(); return true; })()`);

  // ── 1. Shift+T: la cuchilla, y al pasar el mouse marca el tramo
  await tecla("T", "KeyT", 84, 8);
  if ((await ev(`DZ.tool`)) !== "cuchilla") mal("Shift+T no elige la Cuchilla", await ev(`DZ.tool`));
  if (!(await ev(`/Recortar sobrantes/.test(document.querySelector("#dzToolOpts").textContent)`))) mal("la barra de la Cuchilla no ofrece «Recortar sobrantes»", {});
  const ph = await P(200, 300);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: ph.x, y: ph.y, buttons: 0 }); await w(120);
  const marca = await ev(`(()=>{ const p = document.querySelector("#dzCanvas > svg g.dz-limpieza path"); if (!p) return null; const b = p.getBBox(); return { x0: b.x, x1: b.x + b.width, y: b.y }; })()`);
  if (!marca || !cerca(marca.x0, 100) || !cerca(marca.x1, 300) || !cerca(marca.y, 300)) mal("al pasar el mouse no marca el tramo hasta el cruce", marca);

  // ── 2. clic en la colita izquierda de la horizontal de arriba
  await clic(200, 300);
  let ls = await lineas();
  let arriba = sobreY(ls, 300);
  if (arriba.length !== 1 || !cerca(extremosX(arriba[0])[0], 300) || !cerca(extremosX(arriba[0])[1], 900)) mal("la colita no se fue hasta el cruce", arriba);
  if (sobreX(ls, 300).length !== 1 || sobreX(ls, 700).length !== 1 || sobreY(ls, 500).length !== 1) mal("la cuchilla tocó otras líneas", ls);

  // ── 3. clic en el medio de la horizontal de abajo: quedan las dos puntas
  await clic(500, 500);
  ls = await lineas();
  const abajo = sobreY(ls, 500).map(extremosX).sort((p, q) => p[0] - q[0]);
  if (abajo.length !== 2 || !cerca(abajo[0][0], 100) || !cerca(abajo[0][1], 300) || !cerca(abajo[1][0], 700) || !cerca(abajo[1][1], 900))
    mal("el tramo del medio no se fue de cruce a cruce", abajo);

  // ── 4. arrastrar cruzando las colitas de arriba de las dos verticales
  const pasosAntes = await ev(`DZ.doc.history.undoStack.length`);
  await arrastrar([220, 180], [780, 180]);
  ls = await lineas();
  const v1 = sobreX(ls, 300).map(extremosY), v2 = sobreX(ls, 700).map(extremosY);
  if (v1.length !== 1 || !cerca(v1[0][0], 300) || v2.length !== 1 || !cerca(v2[0][0], 300)) mal("el gesto no sacó las dos colitas de arriba", { v1, v2 });
  if ((await ev(`DZ.doc.history.undoStack.length`)) !== pasosAntes + 1) mal("el gesto no fue UN paso de deshacer", {});
  await ev(`(()=>{ dzUndo(); return true; })()`); await w(300);
  ls = await lineas();
  if (!cerca(extremosY(sobreX(ls, 300)[0])[0], 100) || !cerca(extremosY(sobreX(ls, 700)[0])[0], 100)) mal("Ctrl+Z no devolvió las dos colitas", ls);

  // ── 5. un pincel también se corta en el cruce
  await ev(`(()=>{ const svg = document.querySelector("#dzCanvas > svg");
    const pts = []; for (let x = 150; x <= 450; x += 15) pts.push([x, 650, 0.6, 0, 0, 0, 0]);
    const el = dzBrushFinalElement(pts, "#111111"); dzArtAppend(svg, el); dzDocCommit(); return !!el.getAttribute("data-low-brush-points"); })()`);
  await clic(200, 650);
  ls = await lineas();
  const pin = ls.filter(l => l.pincel);
  if (pin.length !== 1 || !cerca(extremosX(pin[0])[0], 300, 2) || !cerca(extremosX(pin[0])[1], 450, 2)) mal("el pincel no se cortó en el cruce o dejó de ser pincel", pin);

  // ── 6. recortar sobrantes: las cortas se van, las largas quedan
  await ev(`(()=>{ __linea("M 1100 300 L 1100 520"); __linea("M 1080 320 L 1500 320"); __linea("M 1480 300 L 1480 620"); dzDocCommit(); return true; })()`);
  await ev(`(()=>{ const i = document.querySelector('#dzToolOpts [data-l="sobrante"]'); i.value = "25"; i.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  const bt = await ev(`(()=>{ const b = document.querySelector('#dzToolOpts [data-l="recortar"]'); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: bt.x, y: bt.y, button: "left", buttons: 1, clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: bt.x, y: bt.y, button: "left", buttons: 0, clickCount: 1 });
  await w(300);
  ls = await lineas();
  const h3 = sobreY(ls, 320).map(extremosX)[0], va = sobreX(ls, 1100).map(extremosY)[0], vb = sobreX(ls, 1480).map(extremosY)[0];
  if (!h3 || !cerca(h3[0], 1100) || !cerca(h3[1], 1480)) mal("recortar sobrantes no sacó las colitas de la horizontal", h3);
  if (!va || !cerca(va[0], 320) || !cerca(va[1], 520)) mal("recortar sobrantes: la colita corta de arriba no se fue o se fue la larga de abajo", va);
  if (!vb || !cerca(vb[0], 320) || !cerca(vb[1], 620)) mal("recortar sobrantes cortó una colita larga", vb);

  // ── 7. la pinza parte una CURVA sin deformarla
  const curva = await ev(`(()=>{ const p = __linea("M 100 900 C 300 700 500 1100 700 900"); dzDocCommit(); p.id = "curvaPinza";
    const L = p.getTotalLength(), pts = []; for (let i = 0; i <= 4000; i++) { const q = p.getPointAtLength(L * i / 4000); pts.push([q.x, q.y]); }
    window.__curva = pts; const q = p.getPointAtLength(L * 0.35); return { x: q.x, y: q.y }; })()`);
  await tecla("x", "KeyX", 88);
  if ((await ev(`DZ.tool`)) !== "pliers") mal("X no elige la Pinza", {});
  await clic(curva.x, curva.y);
  const pz = await ev(`(()=>{ const svg = document.querySelector("#dzCanvas > svg");
    const ps = [...svg.querySelectorAll("path")].filter(p => !p.closest(".dz-penui") && p.getAttribute("d") && /^M ?1\\d\\d(\\.\\d+)? 9|C/.test(p.getAttribute("d")));
    const piezas = LOW.vector.limpiezaHerramientas.todas(svg).filter(l => l.poly.every(q => q[1] > 690 && q[1] < 1110 && q[0] < 720));
    // distancia de cada punto de las piezas a la curva ORIGINAL (a sus tramitos, no a sus muestras)
    const aSeg = (q, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)); return Math.hypot(q[0] - a[0] - dx * t, q[1] - a[1] - dy * t); };
    let peor = 0; for (const l of piezas) for (const q of l.poly) { let d = Infinity; for (let i = 0; i < __curva.length - 1; i++) d = Math.min(d, aSeg(q, __curva[i], __curva[i + 1])); peor = Math.max(peor, d); }
    return { piezas: piezas.length, peor, puntas: piezas.map(l => [l.poly[0].slice(0,2), l.poly.at(-1).slice(0,2)]) }; })()`);
  if (pz.piezas !== 2) mal("la pinza no partió la curva en dos", pz);
  if (pz.peor > 0.05) mal("la pinza deformó la curva al partirla", pz);

  // ── 8. la cinta: soldar, prolongar, rectángulo
  await tecla("c", "KeyC", 67, 1);
  if ((await ev(`DZ.tool`)) !== "cinta") mal("Alt+C no elige la Cinta", await ev(`DZ.tool`));
  await ev(`(()=>{ __linea("M 1100 800 L 1300 800"); __linea("M 1310 800 L 1500 800");
    __linea("M 1400 640 L 1400 690"); __linea("M 1300 700 L 1600 700"); dzDocCommit(); return true; })()`);
  await arrastrar([1300, 800], [1310, 800], 6);
  ls = await lineas();
  const soldada = sobreY(ls, 800).map(extremosX);
  if (soldada.length !== 1 || !cerca(soldada[0][0], 1100) || !cerca(soldada[0][1], 1500)) mal("la cinta no soldó las dos líneas en una", soldada);
  await arrastrar([1400, 690], [1400, 700], 6);
  ls = await lineas();
  const prol = sobreX(ls, 1400).map(extremosY);
  if (prol.length !== 1 || !cerca(prol[0][1], 700, 0.6)) mal("la cinta no prolongó la punta hasta tocar la línea", prol);
  // un cuadrado con las cuatro esquinas abiertas (huecos de 8), cerrado con un rectángulo
  await ev(`(()=>{ __linea("M 1104 950 L 1196 950"); __linea("M 1200 954 L 1200 1046"); __linea("M 1196 1050 L 1104 1050"); __linea("M 1100 1046 L 1100 954"); dzDocCommit(); return true; })()`);
  await arrastrar([1060, 920], [1240, 1075], 8);
  ls = await lineas();
  const cuadro = ls.filter(l => l.a[0] >= 1090 && l.a[0] <= 1210 && l.a[1] >= 940 && l.a[1] <= 1060);
  const abiertas = cuadro.filter(l => !l.cerrada && Math.hypot(l.a[0] - l.b[0], l.a[1] - l.b[1]) > 2);
  if (!cuadro.length || abiertas.length) mal("el rectángulo de la cinta no cerró los cuatro huecos", cuadro);

  // ── 9. sólo para pintar: invisible, pero el balde lo respeta
  await ev(`(()=>{ const s = document.querySelector('#dzToolOpts [data-l="union"]'); s.value = "invisible"; s.dispatchEvent(new Event("change", { bubbles: true }));
    __linea("M 500 950 L 700 950"); __linea("M 700 950 L 700 1050"); __linea("M 700 1050 L 500 1050"); __linea("M 500 1050 L 500 965"); dzDocCommit(); return true; })()`);
  const fillsAntes = await ev(`document.querySelectorAll('#dzCanvas > svg [data-low="fill"]').length`);
  await arrastrar([500, 965], [500, 950], 6);
  const inv = await ev(`(()=>{ const c = document.querySelector('#dzCanvas > svg [data-low="gap-close"]');
    return c ? { opacity: c.getAttribute("opacity"), pe: c.getAttribute("pointer-events"), guardado: dzCanvasInner().includes('data-low="gap-close"'),
      export: (dzCuadroSvgTexto(1) || "").includes('data-low="gap-close"') && /opacity="0"/.test((dzCuadroSvgTexto(1).match(/<path[^>]*gap-close[^>]*>/) || [""])[0]) } : null; })()`);
  if (!inv || inv.opacity !== "0" || inv.pe !== "none" || !inv.guardado) mal("el cierre «sólo para pintar» no es invisible o no se guarda", inv);
  await ev(`(()=>{ const p = dzColoringPrefs ? dzColoringPrefs() : null; dzSetTool("bucket"); return true; })()`);
  await ev(`(()=>{ try { const k = "low.coloring.v1"; const v = JSON.parse(localStorage.getItem(k) || "{}"); v.gap = 0; localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} return true; })()`);
  await clic(600, 1000);
  let pintado = 0;
  for (let i = 0; i < 30; i++) { pintado = await ev(`document.querySelectorAll('#dzCanvas > svg [data-low="fill"]').length`); if (pintado > fillsAntes) break; await w(200); }
  if (pintado <= fillsAntes) mal("el balde no pintó adentro del cierre invisible", { fillsAntes, pintado, estado: await ev(`document.querySelector("#dzStatus")?.textContent`) });

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
  console.log("E2E limpieza de línea OK " + JSON.stringify({ pinzaDesvio: +pz.peor.toFixed(3) }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
