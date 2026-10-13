/* LAS HERRAMIENTAS DE SELECCIÓN EN UN SOLO BOTÓN (como Toon Boom). CDP :9223 + mock :8791.

   Pedido de Mauro (v3.29): «te había pedido que haya varias herramientas de
   selección en la herramienta de selección, tal cual en Toon Boom» y «quiero
   redimensionar todo junto (todos los cuadros de la capa) y no puedo».
   Con el mouse y el teclado de verdad, sobre una capa de 5 cuadros:
   1. El botón de la Flecha tiene la flechita: abre la lista de herramientas
      (rectángulo, lazo, polígono, mismo color, directa), el alcance y las acciones.
   2. Lazo: el ícono del botón cambia y un lazo dibujado en la mesa elige.
   3. Clic derecho en el botón abre la lista; «Elegir toda la capa y
      transformarla» + un tirador de esquina escala los 5 dibujos juntos; el
      botón lleva el punto naranja; un Ctrl+Z los deja como estaban.
   4. Ctrl+Shift+A elige toda la capa; al soltar la selección, el alcance
      vuelve a «este dibujo» (no queda una trampa puesta).
   5. Mismo color: un clic en un trazo negro elige los negros, no el rojo.
   6. Mantener pulsado el botón también abre la lista; Esc la cierra.
   7. El alcance no se guarda entre sesiones (sólo el tipo). */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

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
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, ...extra });
  const clic = async (x, y, button = "left") => {
    await mouse("mouseMoved", x, y, { buttons: 0 });
    await mouse("mousePressed", x, y, { button, buttons: button === "left" ? 1 : 2, clickCount: 1 });
    await mouse("mouseReleased", x, y, { button, buttons: 0, clickCount: 1 });
    await w(200);
  };
  const arrastre = async (pts) => {
    await mouse("mouseMoved", pts[0][0], pts[0][1], { buttons: 0 });
    await mouse("mousePressed", pts[0][0], pts[0][1], { button: "left", buttons: 1, clickCount: 1 });
    for (const [x, y] of pts.slice(1)) { await mouse("mouseMoved", x, y, { button: "left", buttons: 1 }); await w(12); }
    const [x, y] = pts[pts.length - 1];
    await mouse("mouseReleased", x, y, { button: "left", buttons: 0, clickCount: 1 });
    await w(500);
  };
  const tecla = async (key, code, vk, modifiers = 0) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers });
    await w(250);
  };
  const centro = (sel) => ev(`(()=>{ const b = document.querySelector(${JSON.stringify(sel)}); if (!b || !b.getClientRects().length) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  /** Un ítem de la lista por su texto. */
  const item = (texto) => ev(`(()=>{ const m = document.querySelector("#dzSelMenu"); if (!m || m.hidden) return null; const b = [...m.querySelectorAll("button")].find(b => b.textContent.includes(${JSON.stringify(texto)})); if (!b) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const menuAbierto = () => ev(`!!document.querySelector("#dzSelMenu") && !document.querySelector("#dzSelMenu").hidden`);
  const elegidos = () => ev(`(DZ.multi && DZ.multi.length > 1) ? DZ.multi.length : (DZ.sel ? 1 : 0)`);
  /** De la hoja a la pantalla. */
  const pantalla = (x, y) => ev(`(()=>{ const m = document.querySelector("#dzCanvas > svg").getScreenCTM(); return [m.a*${x}+m.c*${y}+m.e, m.b*${x}+m.d*${y}+m.f]; })()`);
  /** El ancho de cada dibujo de la capa (cuadros 1..5). */
  const anchos = () => ev(`(()=>{ const sc = DZ.doc.scene, ly = DZ.doc.layer, lv = sc.level(ly.levelId); const tmp = document.createElementNS("http://www.w3.org/2000/svg","svg");
    tmp.setAttribute("viewBox", document.querySelector("#dzCanvas > svg").getAttribute("viewBox")); tmp.style.cssText = "position:absolute;left:-30000px;width:1920px;height:1080px"; document.body.appendChild(tmp);
    const out = [1,2,3,4,5].map(f => { tmp.innerHTML = lv.byNumber(ly.cellAt(f)).content; const p = tmp.querySelector("path"); return Math.round(p.getBoundingClientRect().width); }); tmp.remove(); return out; })()`);

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  for (let i = 0; i < 90; i++) { if (await ev('document.readyState==="complete"&&!!(window.LOW&&LOW.drawing&&LOW.drawing.seleccionOpciones)').catch(() => false)) break; await w(400); }
  // la capa: 5 cuadros con un trazo de pincel cada uno, corrido hacia abajo (como una animación)
  await ev(`(async()=>{ try{localStorage.clear()}catch(e){} dzMenuAction("nuevo"); await new Promise(r=>setTimeout(r,2800)); if(typeof closeL3d==="function")closeL3d(); dzMenuAction("fit");
    const sc = DZ.doc.scene, ly = DZ.doc.layer, lv = sc.level(ly.levelId), svg = document.querySelector("#dzCanvas > svg");
    const pts = []; for (let a = 0; a <= 40; a++) { const t = a / 40 * Math.PI * 2; pts.push([900 + Math.cos(t) * 60, 300 + Math.sin(t) * 120, .6, 0, 0, 0, 0]); }
    dzArtAppend(svg, dzBrushFinalElement(pts, "#111111")); dzDocCommit();
    const c1 = DZ.doc.drawing.content;
    for (let f = 2; f <= 5; f++) { const n = 100 + f; lv.addDrawing(n, c1.replace(/<path /, '<path transform="translate(0 ' + (f * 40) + ')" ')); sc.expose(ly.id, f, n); }
    DZ.doc.goTo(1); dzCanvasSet(DZ.doc.drawing.content); dzSetTool("pencil"); return true; })()`);
  await w(400);

  // ── 1. la flechita abre la lista
  const caret = await centro('.dz-tools [data-tool="select"] .dz-sel-caret');
  if (!caret) mal("el botón de la Flecha no tiene la flechita del desplegable", {});
  await clic(caret.x, caret.y);
  if (!(await menuAbierto())) mal("la flechita no abrió la lista de herramientas de selección", {});
  const textos = await ev(`[...document.querySelectorAll("#dzSelMenu button")].map(b => b.textContent.trim())`);
  for (const t of ["rectángulo", "lazo", "polígono", "mismo color", "directa", "Toda la capa", "Elegir toda la capa"]) {
    if (!textos.some((x) => x.toLowerCase().includes(t.toLowerCase()))) mal("a la lista le falta «" + t + "»", textos);
  }
  // la lista entra en la ventana
  const caja = await ev(`(()=>{ const r = document.querySelector("#dzSelMenu").getBoundingClientRect(); return { top: r.top, bottom: r.bottom, right: r.right }; })()`);
  if (caja.top < 0 || caja.bottom > 768 || caja.right > 1366) mal("la lista se sale de la ventana", caja);

  // ── 2. lazo
  let p = await item("lazo"); await clic(p.x, p.y);
  if (await menuAbierto()) mal("elegir una herramienta no cerró la lista", {});
  const est = await ev(`({ tool: DZ.tool, tipo: LOW.drawing.seleccionOpciones.prefs.tipo, icono: document.querySelector('.dz-tools [data-tool="select"] use').getAttribute("href"),
    barra: (document.querySelector('#dzToolOpts [data-s="tipo"]') || {}).value })`);
  if (est.tool !== "select" || est.tipo !== "lazo" || est.icono !== "#i-sel-lazo" || est.barra !== "lazo") mal("el Lazo no quedó armado (herramienta, ícono y barra)", est);
  const lazo = [];
  for (let a = 0; a <= 28; a++) { const t = a / 28 * Math.PI * 2; lazo.push(await pantalla(900 + Math.cos(t) * 170, 300 + Math.sin(t) * 230)); }
  await arrastre(lazo);
  if ((await elegidos()) !== 1) mal("el lazo no eligió el trazo", { elegidos: await elegidos() });

  // ── 3. clic derecho → elegir toda la capa → escalar con el tirador
  const principal = await centro('.dz-tools [data-tool="select"]');
  await clic(principal.x - 6, principal.y - 4, "right");
  if (!(await menuAbierto())) mal("el clic derecho en el botón no abrió la lista", {});
  p = await item("Elegir toda la capa"); await clic(p.x, p.y);
  const capa = await ev(`({ alcance: LOW.drawing.seleccionOpciones.prefs.alcance, punto: !document.querySelector('.dz-tools [data-tool="select"] .dz-sel-badge').hidden, n: (DZ.multi && DZ.multi.length > 1) ? DZ.multi.length : (DZ.sel ? 1 : 0) })`);
  if (capa.alcance !== "capa" || !capa.punto || capa.n !== 1) mal("«Elegir toda la capa» no dejó la capa elegida con el alcance a la vista", capa);
  const a0 = await anchos();
  const h = await ev(`(()=>{ const hs=[...document.querySelectorAll("#dzSelBox .dz-sh")].filter(h=>getComputedStyle(h).display!=="none"); const r=hs.map(h=>h.getBoundingClientRect()).sort((a,b)=>(b.x+b.y)-(a.x+a.y))[0]; return r?{x:r.x+r.width/2,y:r.y+r.height/2}:null; })()`);
  if (!h) mal("no hay tiradores para escalar", {});
  const tir = []; for (let i = 0; i <= 8; i++) tir.push([h.x + i * 5, h.y + i * 5]);
  await arrastre(tir);
  const a1 = await anchos();
  if (a1.some((x, i) => !(x > a0[i] * 1.2))) mal("escalar con toda la capa elegida no agrandó los 5 dibujos", { antes: a0, despues: a1 });
  await tecla("z", "KeyZ", 90, 2); await w(400);
  const a2 = await anchos();
  if (a2.some((x, i) => Math.abs(x - a0[i]) > 1)) mal("un Ctrl+Z no dejó los 5 dibujos como estaban", { antes: a0, despues: a2 });

  // ── 4. Ctrl+Shift+A y el alcance que vuelve solo
  await ev(`dzDeselect(); true`); await w(200);
  const vacio = await pantalla(300, 900);
  await clic(vacio[0], vacio[1]);                             // foco en la mesa
  await ev(`LOW.drawing.seleccionOpciones.prefs.alcance`).then((a) => { if (a !== "dibujo") mal("soltar la selección no devolvió el alcance a «este dibujo»", { alcance: a }); });
  await tecla("A", "KeyA", 65, 2 | 8);
  const cs = await ev(`({ alcance: LOW.drawing.seleccionOpciones.prefs.alcance, n: DZ.sel ? 1 : 0, tool: DZ.tool })`);
  if (cs.alcance !== "capa" || cs.n !== 1 || cs.tool !== "select") mal("Ctrl+Shift+A no eligió toda la capa", cs);
  await clic(vacio[0], vacio[1]);                             // soltar: clic en un lugar vacío
  const tras = await ev(`({ alcance: LOW.drawing.seleccionOpciones.prefs.alcance, punto: !document.querySelector('.dz-tools [data-tool="select"] .dz-sel-badge').hidden })`);
  if (tras.alcance !== "dibujo" || tras.punto) mal("después de Ctrl+Shift+A el alcance «toda la capa» quedó puesto", tras);

  // ── 5. mismo color: dos trazos negros y uno rojo
  await ev(`(()=>{ const svg = document.querySelector("#dzCanvas > svg"); const mk = (cx, col) => { const pts = []; for (let a = 0; a <= 30; a++) { const t = a / 30 * Math.PI * 2; pts.push([cx + Math.cos(t) * 40, 700 + Math.sin(t) * 40, .6, 0, 0, 0, 0]); } dzArtAppend(svg, dzBrushFinalElement(pts, col)); };
    mk(500, "#111111"); mk(1300, "#d42020"); dzDocCommit(); dzCanvasSet(DZ.doc.drawing.content); return true; })()`);
  await w(300);
  await clic(caret.x, caret.y);
  p = await item("mismo color"); await clic(p.x, p.y);
  const negro = await pantalla(540, 700);
  await clic(negro[0], negro[1]); await w(300);
  const col = await ev(`(()=>{ const ps = (DZ.multi && DZ.multi.length > 1) ? DZ.multi : (DZ.sel ? [DZ.sel] : []); return ps.map(n => (n.getAttribute("fill") || n.getAttribute("stroke") || "").toLowerCase()); })()`);
  if (col.length !== 2 || col.some((c) => c !== "#111111")) mal("Mismo color no eligió los dos trazos negros (y sólo esos)", col);

  // ── 6. mantener pulsado abre; Esc cierra
  await mouse("mouseMoved", principal.x - 6, principal.y - 4, { buttons: 0 });
  await mouse("mousePressed", principal.x - 6, principal.y - 4, { button: "left", buttons: 1, clickCount: 1 });
  await w(500);
  const porMantener = await menuAbierto();
  await mouse("mouseReleased", principal.x - 6, principal.y - 4, { button: "left", buttons: 0, clickCount: 1 }); await w(200);
  if (!porMantener) mal("mantener pulsado el botón no abrió la lista", {});
  await tecla("Escape", "Escape", 27);
  if (await menuAbierto()) mal("Esc no cerró la lista", {});

  // ── 7. lo que se guarda: el tipo sí, el alcance no
  await ev(`LOW.drawing.seleccionOpciones.ponerAlcance("capa"); true`);
  const guardado = await ev(`JSON.parse(localStorage.getItem("low.seleccion.v1") || "{}")`);
  if (guardado.alcance || guardado.tipo !== "color") mal("se guarda el alcance entre sesiones (o no se guarda el tipo)", guardado);
  // ── 8. clic derecho en la capa de la línea de tiempo → «Elegir toda la capa»
  await ev(`LOW.drawing.seleccionOpciones.ponerAlcance("dibujo"); dzDeselect(); true`);
  const nombre = await centro(".tl2-row[data-layer-row] .tl2-name");
  if (!nombre) mal("no encuentro el nombre de la capa en la línea de tiempo", {});
  await clic(nombre.x, nombre.y, "right");
  const ctx = await ev(`(()=>{ const b = [...document.querySelectorAll(".ctx-menu .ctx-item")].find(b => b.textContent.includes("Elegir toda la capa")); if (!b || b.disabled) return null; const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  if (!ctx) mal("el menú de la capa no tiene «Elegir toda la capa (todos los cuadros)»", await ev(`[...document.querySelectorAll(".ctx-menu .ctx-label")].map(n => n.textContent)`));
  await clic(ctx.x, ctx.y); await w(300);
  const porCapa = await ev(`({ alcance: LOW.drawing.seleccionOpciones.prefs.alcance, n: (DZ.multi && DZ.multi.length > 1) ? DZ.multi.length : (DZ.sel ? 1 : 0), tool: DZ.tool })`);
  if (porCapa.alcance !== "capa" || porCapa.n < 1 || porCapa.tool !== "select") mal("el menú de la capa no eligió toda la capa", porCapa);
  // el menú Edición tiene las dos órdenes
  const edicion = await ev(`[...document.querySelectorAll('[data-act="elegir-todo"],[data-act="elegir-capa"]')].length`);
  if (edicion !== 2) mal("al menú Edición le faltan «Elegir todo» / «Elegir toda la capa»", { edicion });

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones", graves.slice(0, 3));
  console.log("E2E herramientas de selección (desplegable) OK " + JSON.stringify({ antes: a0, escalado: a1 }));
}

main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
