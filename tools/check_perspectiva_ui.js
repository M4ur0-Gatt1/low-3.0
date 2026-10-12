/* 📐 PERSPECTIVA: PUNTOS DE FUGA EN EL 2D. CDP :9223 + mock :8791.

   Pedido de Mauro (v3.25): «un sistema de guías de puntos de fuga pensado para
   dibujar layouts de fondos —ciudad, casas—». Se recorre con el mouse de verdad:
   1. Vista → Perspectiva abre la barra; «2 puntos» deja dos puntos de fuga a la
      misma altura, guardados en la escena, y las guías se ven en la mesa SIN
      entrar en el dibujo guardado.
   2. Arrastrar un punto lo mueve y arrastra al otro a la misma altura de los
      ojos; Ctrl+Z lo devuelve en UN paso.
   3. Imán: un trazo tembloroso que arranca hacia un punto de fuga queda recto
      sobre la recta hacia ese punto; uno vertical queda vertical; uno que
      arranca lejos de toda dirección queda libre. Sin imán, todo libre.
   4. La Regla: la línea va HACIA el punto de fuga y no termina en él (el
      defecto de antes), y su clic derecho agrega el punto a la escena.
   5. La perspectiva viaja con el documento (toJSON → Scene).
   6. Los círculos de los puntos de la Regla tampoco entran en el dibujo. */
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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 180000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate",
    { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const raton = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1, ...extra });

  const clickEn = async (sel) => {
    let caja = null;
    for (let i = 0; i < 25 && !caja; i++) {
      caja = await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});
        if(!e) return null; const r=e.getBoundingClientRect(); if(!r.width||!r.height) return null;
        return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)};})()`);
      if (!caja) await w(200);
    }
    if (!caja) throw Error("no pude clickear " + sel);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: caja.x, y: caja.y, buttons: 0 });
    await raton("mousePressed", caja.x, caja.y); await w(60); await raton("mouseReleased", caja.x, caja.y);
    await w(120);
  };
  /** Del lienzo (unidades del documento) a la pantalla, y al revés. */
  const aPantalla = (x, y) => ev(`(()=>{ const m = document.querySelector("#dzCanvas > svg").getScreenCTM();
    return { x: m.a*${x} + m.c*${y} + m.e, y: m.b*${x} + m.d*${y} + m.f }; })()`);
  /** Un trazo de mouse de verdad, de A a B en el lienzo, con temblor de mano. */
  const trazo = async (a, b, temblor = 0, pasos = 26) => {
    const pa = await aPantalla(a.x, a.y), pb = await aPantalla(b.x, b.y);
    const dx = pb.x - pa.x, dy = pb.y - pa.y, n = Math.hypot(dx, dy) || 1;
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: pa.x, y: pa.y, buttons: 0 });
    await raton("mousePressed", pa.x, pa.y);
    for (let i = 1; i <= pasos; i++) {
      const t = i / pasos, off = temblor * Math.sin(i * 1.7);
      await raton("mouseMoved", pa.x + dx * t - dy / n * off, pa.y + dy * t + dx / n * off);
      await w(8);
    }
    await raton("mouseReleased", pb.x, pb.y);
    await w(250);
  };
  /** Los puntos del último trazo dibujado (path del lápiz), en el lienzo. */
  const ultimoTrazo = () => ev(`(()=>{ const svg = document.querySelector("#dzCanvas > svg");
    const ps = [...svg.querySelectorAll("path")].filter(p => !p.closest(".dz-penui") && p.getAttribute("d"));
    const p = ps.at(-1); if (!p) return null;
    const nums = (p.getAttribute("d").match(/-?\\d+(?:\\.\\d+)?/g) || []).map(Number);
    const pts = []; for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: nums[i], y: nums[i+1] });
    return { n: ps.length, pts }; })()`);
  const desvio = (pts, s, u) => Math.max(...pts.map(p => Math.abs((p.x - s.x) * u.uy - (p.y - s.y) * u.ux)));

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!(window.LOW&&LOW.drawing&&LOW.drawing.perspectiva)').catch(() => false);
    if (listo === true) break;
    await w(400);
  }
  const montaje = await ev(`(async()=>{
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg");
    if (typeof dzDocInit === "function") await dzDocInit();
    await new Promise(r=>setTimeout(r,600));
    if (typeof closeL3d === "function") closeL3d();
    dzMenuAction("fit");
    return { doc: !!DZ.doc, w: DZ.doc && DZ.doc.scene.width, h: DZ.doc && DZ.doc.scene.height,
      menu: !!document.querySelector('[data-menu="vista"] [data-act="perspectiva"]') };
  })()`);
  if (!montaje.doc) mal("no hay documento", montaje);
  if (!montaje.menu) mal("el menú Vista no tiene «Perspectiva»", montaje);
  const W = montaje.w, H = montaje.h;

  // ── 1. la barra, «2 puntos», guías visibles pero fuera del dibujo
  await ev(`dzMenuAction("perspectiva")`);
  await w(200);
  await clickEn('#lowPersp [data-p="2"]');
  let st = await ev(`(()=>{ const p = DZ.doc.scene.perspective; const g = document.querySelector("#dzCanvas > svg > g[data-low='perspectiva']");
    return { vps: p.vps, iman: p.iman, visible: p.visible, guia: !!g, penui: !!(g && g.classList.contains("dz-penui")),
      lineas: g ? g.querySelectorAll("line").length : 0, guardado: dzCanvasInner().includes("perspectiva") }; })()`);
  if (st.vps.length !== 2 || Math.abs(st.vps[0].y - st.vps[1].y) > 0.01) mal("«2 puntos» no dejó dos puntos de fuga a la misma altura", st);
  if (!(st.vps[0].x < 0 && st.vps[1].x > W)) mal("los dos puntos no quedaron fuera del cuadro", st);
  if (!st.guia || !st.penui || st.lineas < 20) mal("las guías no se ven en la mesa", st);
  if (st.guardado) mal("las guías de perspectiva entran en el dibujo guardado", st);

  // ── 2. arrastrar el punto 1 hacia abajo: el 2 lo sigue; Ctrl+Z en un paso
  const vp0 = st.vps[0];
  // el punto 1 está fuera del cuadro: se aleja la vista para poder agarrarlo
  await ev(`(()=>{ DZ.zoom = Math.min(DZ.zoom, 0.3); dzApplyZoom(); return true; })()`);
  await w(200);
  const s0 = await aPantalla(vp0.x, vp0.y);
  if (s0.x < 5) mal("el punto 1 no entra en la pantalla para agarrarlo", s0);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: s0.x, y: s0.y, buttons: 0 });
  await raton("mousePressed", s0.x, s0.y);
  for (let i = 1; i <= 8; i++) { await raton("mouseMoved", s0.x + i * 2, s0.y + i * 4); await w(15); }
  await raton("mouseReleased", s0.x + 16, s0.y + 32);
  await w(200);
  const mov = await ev(`DZ.doc.scene.perspective.vps`);
  if (!(mov[0].y > vp0.y + 30)) mal("arrastrar el punto 1 no lo movió", { antes: vp0, despues: mov });
  if (Math.abs(mov[0].y - mov[1].y) > 0.01) mal("el punto 2 no siguió la altura de los ojos", mov);
  const trazos0 = await ev(`(document.querySelector("#dzCanvas > svg").querySelectorAll("path").length)`);
  if ((await ultimoTrazo())?.n !== trazos0 - (await ev(`document.querySelectorAll("#dzCanvas > svg .dz-penui path").length`)))
    { /* sólo informativo */ }
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
  await w(300);
  const deshecho = await ev(`DZ.doc.scene.perspective.vps`);
  if (Math.abs(deshecho[0].y - vp0.y) > 0.01 || Math.abs(deshecho[0].x - vp0.x) > 0.01)
    mal("Ctrl+Z no devolvió el punto de fuga a donde estaba", { vp0, deshecho });
  if (!(await ev(`!!document.querySelector("#dzCanvas > svg > g[data-low='perspectiva']")`))) mal("después de Ctrl+Z las guías desaparecieron", {});

  // ── 3. el imán: «Listo» cierra la barra y el lápiz sigue imantado
  await clickEn('#lowPersp [data-p="listo"]');
  await ev(`(()=>{ dzMenuAction("fit"); dzSetTool("pencil"); return DZ.tool; })()`);
  await w(200);
  const vps = await ev(`DZ.doc.scene.perspective.vps`);
  const S = { x: W * 0.47, y: H * 0.65 };
  const hacia = (v, d) => { const dx = v.x - S.x, dy = v.y - S.y, n = Math.hypot(dx, dy); return { x: S.x + dx / n * d, y: S.y + dy / n * d, u: { ux: dx / n, uy: dy / n } }; };
  const h2 = hacia(vps[1], W * 0.3);
  await trazo(S, h2, 9);
  let t = await ultimoTrazo();
  const dv = desvio(t.pts, S, h2.u);
  if (!(t.pts.length >= 2) || dv > 0.6) mal("un trazo hacia el punto 2 no quedó sobre la recta al punto de fuga", { desvio: dv, pts: t.pts.slice(0, 6),
    diag: await ev(`(()=>{ const svg = document.querySelector("#dzCanvas > svg"); const ps = [...svg.querySelectorAll("path")].filter(p => !p.closest(".dz-penui"));
      const p = ps.at(-1); return { tool: DZ.tool, n: ps.length, d: (p.getAttribute("d")||"").slice(0, 300), padre: p.parentNode.getAttribute("data-low-art") || p.parentNode.tagName, attrs: [...p.attributes].map(a=>a.name).join(",") }; })()`) });
  const largo = Math.max(...t.pts.map(p => Math.hypot(p.x - S.x, p.y - S.y)));
  if (largo < W * 0.25) mal("el trazo imantado quedó corto", { largo });

  const V = { x: W * 0.2, y: H * 0.2 };
  await trazo(V, { x: V.x + 10, y: V.y + H * 0.4 }, 7);
  t = await ultimoTrazo();
  const dvV = desvio(t.pts, V, { ux: 0, uy: 1 });
  if (dvV > 0.6) mal("un trazo casi vertical no quedó vertical", { desvio: dvV });

  const L0 = { x: W * 0.3, y: H * 0.15 };
  await trazo(L0, { x: L0.x + H * 0.3, y: L0.y + H * 0.3 }, 0);
  t = await ultimoTrazo();
  const dvL = desvio(t.pts, L0, { ux: Math.SQRT1_2, uy: Math.SQRT1_2 });
  if (dvL > 3) mal("un trazo a 45° (lejos de toda dirección) no quedó libre", { desvio: dvL });

  // sin imán: el temblor queda
  await ev(`dzMenuAction("perspectiva")`); await w(150);
  await clickEn("#lowPerspIman");
  await clickEn('#lowPersp [data-p="listo"]');
  if (await ev(`DZ.doc.scene.perspective.iman`)) mal("destildar «Imán» no lo apagó", {});
  await trazo(S, h2, 9);
  t = await ultimoTrazo();
  if (desvio(t.pts, S, h2.u) < 2) mal("sin imán el trazo igual quedó recto", { desvio: desvio(t.pts, S, h2.u) });

  // ── 4. la Regla: hacia el punto de fuga, no hasta él; clic derecho agrega a la escena
  await ev(`(()=>{ dzSetTool("ruler"); return true; })()`);
  const A = { x: W * 0.5, y: H * 0.8 };
  const objetivo = hacia(vps[0], W * 0.2);
  const B = { x: objetivo.x + 6 * objetivo.u.uy, y: objetivo.y - 6 * objetivo.u.ux };   // cerca de la recta, no sobre ella
  const sa = await aPantalla(A.x, A.y), sb = await aPantalla(B.x, B.y);
  for (const s of [sa, sb]) { await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: s.x, y: s.y, buttons: 0 });
    await raton("mousePressed", s.x, s.y); await w(40); await raton("mouseReleased", s.x, s.y); await w(120); }
  await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  const regla = await ev(`(()=>{ const ls = [...document.querySelectorAll("#dzCanvas > svg line")].filter(l => !l.closest(".dz-penui") && !l.classList.contains("dz-penui"));
    const l = ls.at(-1); return l ? { x1:+l.getAttribute("x1"), y1:+l.getAttribute("y1"), x2:+l.getAttribute("x2"), y2:+l.getAttribute("y2") } : null; })()`);
  if (!regla) mal("la Regla no dejó ninguna línea", {});
  const ua = { ux: vps[0].x - regla.x1, uy: vps[0].y - regla.y1 }; const na = Math.hypot(ua.ux, ua.uy); ua.ux /= na; ua.uy /= na;
  const dR = Math.abs((regla.x2 - regla.x1) * ua.uy - (regla.y2 - regla.y1) * ua.ux);
  if (dR > 0.6) mal("la línea de la Regla no va hacia el punto de fuga", { regla, dR });
  if (Math.hypot(regla.x2 - vps[0].x, regla.y2 - vps[0].y) < W * 0.3)
    mal("la línea de la Regla termina EN el punto de fuga en vez de ir hacia él", { regla, vp: vps[0] });
  const C = await aPantalla(W * 0.5, H * 0.1);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: C.x, y: C.y, button: "right", buttons: 2, clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: C.x, y: C.y, button: "right", buttons: 0, clickCount: 1 });
  await w(200);
  const tres = await ev(`DZ.doc.scene.perspective.vps.length`);
  if (tres !== 3) mal("el clic derecho de la Regla no agregó el punto de fuga a la escena", { tres });
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: C.x, y: C.y, button: "right", buttons: 2, clickCount: 1 });
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: C.x, y: C.y, button: "right", buttons: 0, clickCount: 1 });
  await w(200);
  if ((await ev(`DZ.doc.scene.perspective.vps.length`)) !== 2) mal("el clic derecho sobre el punto no lo sacó", {});

  // ── 4b. «Líneas desde un punto»: de cada punto de fuga, pasando EXACTO por el clic
  await ev(`dzMenuAction("perspectiva")`); await w(150);
  await clickEn('#lowPersp [data-p="marcar"]');
  const Q = { x: W * 0.62, y: H * 0.72 }, sq = await aPantalla(Q.x, Q.y);
  const trazosAntes = await ev(`document.querySelectorAll("#dzCanvas > svg path").length`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: sq.x, y: sq.y, buttons: 0 });
  await raton("mousePressed", sq.x, sq.y); await w(40); await raton("mouseReleased", sq.x, sq.y); await w(250);
  const cons = await ev(`(()=>{ const p = DZ.doc.scene.perspective; const g = document.querySelector("#dzCanvas > svg g[data-p='lineas']");
    return { lineas: p.lineas, vps: p.vps, rectas: g ? [...g.querySelectorAll("line")].map(l => ["x1","y1","x2","y2"].map(k => +l.getAttribute(k))) : [],
      paths: document.querySelectorAll("#dzCanvas > svg path").length }; })()`);
  if (cons.lineas.length !== 1 || Math.hypot(cons.lineas[0].x - Q.x, cons.lineas[0].y - Q.y) > 2) mal("el clic no marcó el punto de las líneas", cons);
  if (cons.paths !== trazosAntes) mal("marcar el punto dibujó un trazo", cons);
  if (cons.rectas.length !== cons.vps.length + 1) mal("no salieron las rectas de cada punto de fuga más la vertical", cons);
  const q0 = cons.lineas[0];
  const dist = (r, p) => { const dx = r[2] - r[0], dy = r[3] - r[1]; return Math.abs((p.x - r[0]) * dy - (p.y - r[1]) * dx) / Math.hypot(dx, dy); };
  for (const r of cons.rectas) if (dist(r, q0) > 0.01) mal("una recta de construcción no pasa por el punto marcado", { r, q0 });
  for (const v of cons.vps) if (!cons.rectas.some(r => dist(r, v) < 0.01)) mal("falta la recta hacia un punto de fuga", { v });
  await clickEn('#lowPersp [data-p="borrar-lineas"]');
  if ((await ev(`DZ.doc.scene.perspective.lineas.length`)) !== 0) mal("«Borrar líneas» no las borró", {});
  await clickEn('#lowPersp [data-p="listo"]');

  // ── 4c. puntos que vienen del 3D: el horizonte pasa por los HORIZONTALES, no por el vertical
  const hz = await ev(`(()=>{ const antes = JSON.parse(JSON.stringify(DZ.doc.scene.perspective));
    const leer = () => { const l = document.querySelector("#dzCanvas > svg g[data-low='perspectiva'] [data-p='horizonte']");
      return l ? ["y1","y2"].map(k => +l.getAttribute(k)) : null; };
    dzPerspectivaDesde3D([{x:-500,y:400,eje:"x"},{x:2500,y:400,eje:"z"},{x:960,y:4000,eje:"y"}], { paralelas: [] });
    const tres = leer();
    dzPerspectivaDesde3D([{x:960,y:420,eje:"z"},{x:960,y:3000,eje:"y"}], { paralelas: [{ux:1,uy:0}] });
    const inclinada = leer(); const dirs = DZ.doc.scene.perspective.paralelas;
    DZ.doc.setPerspective(antes); return { tres, inclinada, dirs }; })()`);
  if (!hz.tres || Math.abs(hz.tres[0] - 400) > 0.01 || Math.abs(hz.tres[1] - 400) > 0.01) mal("con 3 puntos del 3D el horizonte no pasa por X y Z", hz);
  if (!hz.inclinada || Math.abs(hz.inclinada[0] - 420) > 0.01 || Math.abs(hz.inclinada[1] - 420) > 0.01) mal("con la vista inclinada el horizonte quedó atravesado por el punto vertical", hz);
  if (!hz.dirs || hz.dirs.length !== 1) mal("las direcciones paralelas del 3D no se guardaron", hz);

  // ── 5. viaja con el documento
  const viaje = await ev(`(()=>{ const j = JSON.parse(JSON.stringify(DZ.doc.toJSON()));
    const sc = j.scene || j; const otra = new LOW.animation.Scene(sc);
    return { enJSON: !!(sc.perspective && sc.perspective.vps.length === 2), vuelve: otra.perspective, iman: otra.perspective.iman }; })()`);
  if (!viaje.enJSON || viaje.vuelve.vps.length !== 2 || viaje.iman !== false) mal("la perspectiva no viaja con el documento", viaje);

  // ── 6. los círculos de los puntos de la Regla tampoco se guardan
  const fuga = await ev(`(()=>{ RULER = RULER || { a:null, el:null, vp:[] }; RULER.vp.push({x:10,y:10}); dzRulerRenderVP();
    const g = document.querySelector("#dzCanvas > svg g.dz-vp-guides"); const r = { hay: !!g, guardado: dzCanvasInner().includes("dz-vp-guides") };
    dzRulerClear(); return r; })()`);
  if (!fuga.hay || fuga.guardado) mal("las guías de los puntos de la Regla entran en el dibujo guardado", fuga);

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));
  console.log("E2E perspectiva OK " + JSON.stringify({ imantado: +dv.toFixed(3), vertical: +dvV.toFixed(3), libre: +dvL.toFixed(2), regla: +dR.toFixed(3) }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
