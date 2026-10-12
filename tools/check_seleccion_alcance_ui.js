/* ⬚ LA FLECHA CON TIPO Y ALCANCE. CDP :9223 + mock :8791.

   Pedido de Mauro (v3.28): «una herramienta de selección que sirva para
   seleccionar toda la capa en una línea de tiempo; Toon Boom y OpenToonz tienen
   un desplegable en la herramienta de selección con distintas opciones». Con
   mouse de verdad, sobre una capa de TRES dibujos (cuadros 1, 2 y 3), cada uno
   con un rectángulo (corrido un poco en cada cuadro) y un círculo:
   1. La barra de la Flecha tiene Tipo y Alcance.
   2. Toda la capa + Elegir todo + arrastrar: se mueven los tres dibujos, lo
      mismo; UN Ctrl+Z los devuelve a todos.
   3. Toda la capa + un marco que agarra sólo el rectángulo: en los otros
      cuadros se mueve el rectángulo y el círculo no.
   4. Toda la capa + escalar con un tirador: los otros rectángulos se escalan
      igual; las flechas del teclado y «voltear» del inspector, también.
   5. Cuadros elegidos (1 y 2 en la línea de tiempo): se mueve el 2, el 3 no.
   6. Lazo: un lazo alrededor del círculo elige sólo el círculo.
   7. Polígono: tres clics alrededor del rectángulo y clic en el primero lo eligen.
   8. Mismo color: elige todo lo que usa el mismo color de la paleta. */
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
  const raton = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, ...extra });
  const clicPantalla = async (x, y, mod = 0) => {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y, buttons: 0, modifiers: mod });
    await raton("mousePressed", x, y, { modifiers: mod }); await w(30); await raton("mouseReleased", x, y, { modifiers: mod }); await w(150); };
  const clic = async (x, y, mod = 0) => { const p = await P(x, y); await clicPantalla(p.x, p.y, mod); };
  const recorrer = async (puntos) => {           // en la hoja
    const ps = []; for (const [x, y] of puntos) ps.push(await P(x, y));
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: ps[0].x, y: ps[0].y, buttons: 0 });
    await raton("mousePressed", ps[0].x, ps[0].y);
    for (const p of ps.slice(1)) { await raton("mouseMoved", p.x, p.y); await w(12); }
    const u = ps[ps.length - 1]; await raton("mouseReleased", u.x, u.y); await w(400); };
  const tramo = (a, b, n = 10) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
  const botonBarra = async (sel) => { const r = await ev(`(()=>{ const b = document.querySelector('#dzToolOpts ${sel}'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!r) mal("falta en la barra: " + sel, {}); await clicPantalla(r.x, r.y); };
  const opcion = (k, v) => ev(`(()=>{ const s = document.querySelector('#dzToolOpts [data-s="${k}"]'); s.value = "${v}"; s.dispatchEvent(new Event("change", { bubbles: true })); return s.value; })()`);
  /** La caja de cada objeto (por id) en cada uno de los tres dibujos, en la hoja. */
  const cajas = () => ev(`(()=>{ const sc = DZ.doc.scene, ly = DZ.doc.layer, lv = sc.level(ly.levelId);
    const tmp = document.createElementNS("http://www.w3.org/2000/svg", "svg"); tmp.setAttribute("viewBox", document.querySelector("#dzCanvas > svg").getAttribute("viewBox"));
    tmp.style.cssText = "position:absolute;left:-30000px;top:0;width:1920px;height:1080px;visibility:hidden"; document.body.appendChild(tmp);
    const out = {};
    for (const f of [1, 2, 3]) {
      const n = ly.cellAt(f), d = lv.byNumber(n); tmp.innerHTML = d.content;
      out[f] = {};
      for (const id of ["rect", "circ", "rect2", "rect3"]) { const el = tmp.querySelector('[data-t="' + id + '"]'); if (!el) continue;
        const b = el.getBBox(), m = el.transform.baseVal.consolidate(), M = m ? m.matrix : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
        const x0 = M.a * b.x + M.c * b.y + M.e, y0 = M.b * b.x + M.d * b.y + M.f;
        out[f][id] = { x: Math.round(x0 * 10) / 10, y: Math.round(y0 * 10) / 10, w: Math.round(b.width * M.a * 10) / 10 }; }
    }
    tmp.remove(); return out; })()`);

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!(LOW.drawing&&LOW.drawing.seleccionOpciones)').catch(() => false)) break;
    await w(400);
  }
  /** Arma (o rearma) la capa de tres dibujos. */
  const montar = () => ev(`(async()=>{
    const svg = document.querySelector("#dzCanvas > svg");
    const sc = DZ.doc.scene, ly = DZ.doc.layer, lv = sc.level(ly.levelId);
    DZ.doc.goTo(1); dzCanvasSet(DZ.doc.drawing ? DZ.doc.drawing.content : "");
    const linea = svg.querySelector(':scope > g[data-low-art="line"]') || svg;
    linea.querySelectorAll("[data-t]").forEach(n => n.remove());
    const base = (dx) => '<rect data-t="rect" x="' + (300 + dx) + '" y="300" width="160" height="120" fill="#2266cc" data-fil="3" stroke="#111" stroke-width="4"/>' +
      '<circle data-t="circ" cx="1200" cy="600" r="80" fill="none" stroke="#111" stroke-width="5" data-stk="4"/>' +
      '<rect data-t="rect2" x="' + (700 + dx) + '" y="700" width="100" height="80" fill="#2266cc" data-fil="3"/>';
    linea.insertAdjacentHTML("beforeend", base(0)); dzDocCommit();
    const c1 = DZ.doc.drawing.content;
    for (const f of [2, 3]) {
      const c = c1.replace(/<rect data-t="rect" x="300"/, '<rect data-t="rect" x="' + (300 + (f - 1) * 20) + '"').replace(/<rect data-t="rect2" x="700"/, '<rect data-t="rect2" x="' + (700 + (f - 1) * 20) + '"');
      const n = 100 + f; if (lv.byNumber(n)) lv.byNumber(n).content = c; else lv.addDrawing(n, c);
      sc.expose(ly.id, f, n);
    }
    DZ.doc.goTo(1); dzCanvasSet(DZ.doc.drawing.content); dzSetTool("select"); dzDeselect();
    return [1, 2, 3].map(f => ly.cellAt(f)); })()`);

  await ev(`(async()=>{ try{localStorage.clear()}catch(e){} dzMenuAction("nuevo"); await new Promise(r=>setTimeout(r,2800));
    if (typeof closeL3d === "function") closeL3d(); dzMenuAction("fit"); return true; })()`);
  let celdas = await montar();
  if (celdas[1] === celdas[0] || celdas[2] === celdas[1]) mal("el montaje no dejó tres dibujos distintos", celdas);

  // ── 1. la barra
  await ev(`dzSetTool("select")`); await w(150);
  const barra = await ev(`({ tipo: !!document.querySelector('#dzToolOpts [data-s="tipo"]'), alcance: !!document.querySelector('#dzToolOpts [data-s="alcance"]'),
    opciones: [...(document.querySelector('#dzToolOpts [data-s="alcance"]')||{options:[]}).options].map(o => o.value) })`);
  if (!barra.tipo || !barra.alcance || barra.opciones.join() !== "dibujo,cuadros,capa") mal("la barra de la Flecha no tiene Tipo y Alcance", barra);

  // ── 2. toda la capa + elegir todo + arrastrar
  await opcion("alcance", "capa");
  await botonBarra('[data-s="todo"]');
  const elegidos = await ev(`(DZ.multi || []).length`);
  if (elegidos < 3) mal("Elegir todo no eligió todo el dibujo", elegidos);
  let antes = await cajas();
  const pasos = await ev(`DZ.doc.history.undoStack.length`);
  await recorrer(tramo([380, 360], [480, 410]));
  let despues = await cajas();
  for (const f of [1, 2, 3]) for (const k of ["rect", "circ"]) {
    const dx = despues[f][k].x - antes[f][k].x, dy = despues[f][k].y - antes[f][k].y;
    if (Math.abs(dx - 100) > 1.5 || Math.abs(dy - 50) > 1.5) mal("toda la capa: el cuadro " + f + " (" + k + ") no se movió igual", { f, k, dx, dy, antes: antes[f][k], despues: despues[f][k] });
  }
  if ((await ev(`DZ.doc.history.undoStack.length`)) !== pasos + 1) mal("mover toda la capa no fue UN paso de deshacer", { antes: pasos, ahora: await ev(`DZ.doc.history.undoStack.length`) });
  await ev(`(()=>{ dzUndo(); return true; })()`); await w(400);
  const deshecho = await cajas();
  for (const f of [1, 2, 3]) if (Math.abs(deshecho[f].rect.x - antes[f].rect.x) > 0.5) mal("Ctrl+Z no devolvió el cuadro " + f, { deshecho: deshecho[f], antes: antes[f] });

  // ── 3. un marco que agarra sólo el rectángulo: en los otros cuadros se mueve el rectángulo, el círculo no
  await ev(`(()=>{ dzDeselect(); return true; })()`);
  await recorrer(tramo([250, 250], [560, 470], 6));
  const solo = await ev(`({ sel: DZ.sel && DZ.sel.getAttribute("data-t"), multi: (DZ.multi||[]).length })`);
  if (solo.sel !== "rect" || solo.multi > 1) mal("el marco no eligió sólo el rectángulo", solo);
  antes = await cajas();
  await recorrer(tramo([380, 360], [380, 260]));
  despues = await cajas();
  for (const f of [2, 3]) {
    if (Math.abs(despues[f].rect.y - antes[f].rect.y + 100) > 1.5) mal("con el marco, el rectángulo del cuadro " + f + " no se movió", { f, antes: antes[f], despues: despues[f] });
    if (Math.abs(despues[f].circ.y - antes[f].circ.y) > 0.5) mal("con el marco, el círculo del cuadro " + f + " se movió", { f });
  }
  await ev(`(()=>{ dzUndo(); return true; })()`); await w(400);

  // ── 4. escalar con un tirador: los otros rectángulos se escalan igual
  await clic(380, 360);
  antes = await cajas();
  const tir = await ev(`(()=>{ const hs = [...document.querySelectorAll("#dzSelBox .dz-sh")].filter(h => getComputedStyle(h).display !== "none");
    const r = hs.map(h => h.getBoundingClientRect()).sort((a, b) => (b.x + b.y) - (a.x + a.y))[0]; return r ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
  if (!tir) mal("no hay tiradores de escala", {});
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: tir.x, y: tir.y, buttons: 0 });
  await raton("mousePressed", tir.x, tir.y);
  for (let i = 1; i <= 8; i++) { await raton("mouseMoved", tir.x + i * 6, tir.y + i * 4.5); await w(15); }
  await raton("mouseReleased", tir.x + 48, tir.y + 36); await w(500);
  despues = await cajas();
  const k1 = despues[1].rect.w / antes[1].rect.w;
  if (!(k1 > 1.1)) mal("el tirador no escaló el rectángulo", { antes: antes[1], despues: despues[1] });
  for (const f of [2, 3]) { const k = despues[f].rect.w / antes[f].rect.w;
    if (Math.abs(k - k1) > 0.03) mal("el rectángulo del cuadro " + f + " no se escaló igual", { f, k, k1 }); }
  await ev(`(()=>{ dzUndo(); return true; })()`); await w(400);

  // ── 4b. las flechas del teclado y «voltear» del inspector también se repiten
  await clic(380, 360);
  antes = await cajas();
  for (let i = 0; i < 2; i++) {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, modifiers: 8 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39, modifiers: 8 });
    await w(350);
  }
  despues = await cajas();
  for (const f of [1, 2, 3]) if (Math.abs(despues[f].rect.x - antes[f].rect.x - 20) > 0.6)
    mal("Shift+→ dos veces (20) no movió el rectángulo del cuadro " + f, { f, antes: antes[f].rect, despues: despues[f].rect });
  if (Math.abs(despues[2].circ.x - antes[2].circ.x) > 0.5) mal("las flechas movieron el círculo de otro cuadro", { antes: antes[2], despues: despues[2] });
  // el botón «voltear» vive en el inspector, que en el espacio de Animación está
  // plegado: se llama a la MISMA función que el botón (pasa por los mismos registros)
  {
    await ev(`(()=>{ dzFlip("h"); return true; })()`); await w(400);
    const propio = await ev(`(()=>{ const m = DZ.sel && DZ.sel.transform.baseVal.consolidate(); return m ? m.matrix.a : null; })()`);
    if (!(propio < -0.99)) mal("el clic en «voltear» no volteó ni el cuadro actual", { propio });
    const volteado = await ev(`(()=>{ const sc = DZ.doc.scene, ly = DZ.doc.layer, lv = sc.level(ly.levelId);
      return [2, 3].map(f => { const tmp = document.createElementNS("http://www.w3.org/2000/svg", "svg"); tmp.innerHTML = lv.byNumber(ly.cellAt(f)).content;
        document.body.appendChild(tmp); const r = tmp.querySelector('[data-t="rect"]'); const m = r.transform.baseVal.consolidate(); tmp.remove(); return m ? m.matrix.a : 1; }); })()`);
    if (!volteado.every(a => a < -0.99)) mal("«voltear» del inspector no volteó el rectángulo en los otros cuadros", { volteado,
      diag: await ev(`({ crit: JSON.stringify(LOW.drawing.seleccionOpciones.criterios()).slice(0, 200), sel: DZ.sel && DZ.sel.getAttribute("data-t"),
        tr: DZ.sel && DZ.sel.getAttribute("transform"), estado: document.querySelector("#dzStatus").textContent, alcance: LOW.drawing.seleccionOpciones.prefs.alcance,
        activo: document.activeElement && document.activeElement.tagName })`) });
  }

  // ── 5. cuadros elegidos: 1 y 2 en la línea de tiempo
  await opcion("alcance", "cuadros");
  await ev(`(()=>{ const ly = DZ.doc.layerId; DZ.doc.selectCellRange(ly, 1, ly, 2); return true; })()`);
  await botonBarra('[data-s="todo"]');
  antes = await cajas();
  await recorrer(tramo([380, 360], [380, 420]));
  despues = await cajas();
  if (Math.abs(despues[2].rect.y - antes[2].rect.y - 60) > 1.5) mal("cuadros elegidos: el 2 no se movió", { antes: antes[2], despues: despues[2] });
  if (Math.abs(despues[3].rect.y - antes[3].rect.y) > 0.5) mal("cuadros elegidos: el 3 se movió y no estaba elegido", { antes: antes[3], despues: despues[3] });
  await ev(`(()=>{ dzUndo(); return true; })()`); await w(400);
  await opcion("alcance", "dibujo");

  // ── 6. lazo alrededor del círculo
  await opcion("tipo", "lazo");
  await ev(`(()=>{ dzDeselect(); return true; })()`);
  const lazo = []; for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2; lazo.push([1200 + Math.cos(a) * 130, 600 + Math.sin(a) * 130]); }
  await recorrer(lazo);
  const lz = await ev(`({ sel: DZ.sel && DZ.sel.getAttribute("data-t"), multi: (DZ.multi||[]).length })`);
  if (lz.sel !== "circ" || lz.multi > 1) mal("el lazo no eligió sólo el círculo", lz);

  // ── 7. polígono alrededor del rectángulo
  await opcion("tipo", "poligono");
  await ev(`(()=>{ dzDeselect(); return true; })()`);
  for (const [x, y] of [[250, 250], [560, 250], [560, 470], [250, 470], [250, 250]]) await clic(x, y);
  const pg = await ev(`({ sel: DZ.sel && DZ.sel.getAttribute("data-t"), multi: (DZ.multi||[]).length })`);
  if (pg.sel !== "rect" || pg.multi > 1) mal("el polígono no eligió sólo el rectángulo", pg);
  await opcion("tipo", "rect");

  // ── 8. mismo color: los dos rectángulos azules (data-fil 3), no el círculo
  await clic(380, 360);
  await botonBarra('[data-s="color"]');
  const mc = await ev(`({ multi: (DZ.multi||[]).map(n => n.getAttribute("data-t")).sort() })`);
  if (mc.multi.join() !== "rect,rect2") mal("«Mismo color» no eligió los dos del mismo color", mc);

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
  console.log("E2E selección con alcance OK");
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
