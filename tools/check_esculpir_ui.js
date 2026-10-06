/* ESCULPIR TRAZOS. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026): un pincel que deforma un trazo existente como
   el Sculpt Mode de Blender, y REDIBUJAR un tramo dibujando encima; «no
   quiero que simplemente se genere otra línea encima». Una herramienta NUEVA.

   Con el mouse y el teclado de verdad:
   1. La herramienta está en la barra y muestra sus opciones (modo, radio,
      fuerza, caída, presión).
   2. AGARRAR el medio de una recta de pincel y llevarlo abajo: es el MISMO
      elemento (no hay otra línea), las puntas no se mueven, el medio baja, el
      contorno queda sin quiebres; UN Ctrl+Z vuelve los puntos exactos.
   3. REDIBUJAR un tramo dibujando un arco encima: el trazo toma el arco, sigue
      siendo uno solo y sin saltos en las uniones.
   4. Redibujar lejos de todo trazo no cambia nada y dice cómo se usa.
   5. SUAVIZAR un zigzag de LÁPIZ: baja el zigzag, conserva el grosor y deja
      guardados los puntos para la próxima pasada.
   6. Con el espacio apretado se panea: no se esculpe. */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const tab = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl), pending = new Map(), errores = []; let id = 0;
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ({ data }) => { const m = JSON.parse(data);
    if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.j(Error(m.error.message)) : p.r(m.result); } };
  const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; pending.set(n, { r, j }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
  const clic = async (sel) => { const p = await ev(`(()=>{ const e = ${sel}; if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
    assert.ok(p, "no se ve " + sel);
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 }); await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(250); };
  const recorrer = async (puntos, mods = 0) => {
    const [x0, y0] = puntos[0];
    await mouse("mouseMoved", x0, y0, { modifiers: mods }); await mouse("mousePressed", x0, y0, { buttons: 1, clickCount: 1, modifiers: mods });
    for (const [x, y] of puntos.slice(1)) { await mouse("mouseMoved", x, y, { buttons: 1, modifiers: mods }); await wait(12); }
    const [xf, yf] = puntos.at(-1);
    await mouse("mouseReleased", xf, yf, { buttons: 0, clickCount: 1, modifiers: mods }); await wait(500);
  };
  const tecla = async (key, code, vk, mods = 0) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers: mods });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers: mods }); await wait(400); };
  const elegirModo = (m) => ev(`(()=>{ const s = document.querySelector('.esc-opciones [data-e="modo"]'); s.value = "${m}"; s.dispatchEvent(new Event("change", { bubbles: true })); return LOW.vector.esculpirHerramienta.prefs.modo; })()`);
  const pantalla = (x, y) => ev(`(()=>{ const q = dzToScreen(${x}, ${y}), r = document.querySelector("#dzCanvas").getBoundingClientRect(); return [q.x + r.left, q.y + r.top]; })()`);
  const puntosDe = (sel) => ev(`JSON.parse(document.querySelector(${JSON.stringify(sel)}).getAttribute("data-low-brush-points"))`);
  const giroContorno = (sel) => ev(`(()=>{ const el = document.querySelector(${JSON.stringify(sel)}); const p = el.tagName === "path" ? el : el.querySelector("path");
    const L = p.getTotalLength(), q = []; for (let s = 0; s < L; s += .5) { const a = p.getPointAtLength(s); q.push([a.x, a.y]); }
    let max = 0; for (let i = 1; i < q.length - 1; i++) { const a = Math.atan2(q[i][1] - q[i-1][1], q[i][0] - q[i-1][0]), b = Math.atan2(q[i+1][1] - q[i][1], q[i+1][0] - q[i][0]);
      let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d; max = Math.max(max, d * 180 / Math.PI); } return Math.round(max); })()`);
  const cuantosPinceles = () => ev(`document.querySelectorAll('#dzCanvas > svg [data-low="brush"]').length`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!LOW.vector?.esculpirHerramienta').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); DZ.zoom = .6; dzApplyZoom(); return true; })()'); await wait(200);

    // una recta de pincel, de (500,400) a (1300,400) en la hoja
    await clic(`document.querySelector('.dz-toolbtn[data-tool="brush"]')`);
    const desde = await pantalla(500, 400), hasta = await pantalla(1300, 400);
    await recorrer(Array.from({ length: 41 }, (_, i) => [desde[0] + (hasta[0] - desde[0]) * i / 40, desde[1]]));
    await ev(`(()=>{ const el = [...document.querySelectorAll('#dzCanvas > svg [data-low="brush"]')].pop(); el.id = "recta"; dzDocCommit(); return true; })()`);   // el id entra al documento: Ctrl+Z restaura desde ahí

    // ── 1. la herramienta y sus opciones ─────────────────────────────────────
    // la herramienta vive con las de vectores, en «Más herramientas» (…)
    const elegirEsculpir = async () => {
      if (!(await ev(`document.querySelector('.dz-toolbtn[data-tool="sculpt"]').getBoundingClientRect().width > 0`))) await clic(`document.querySelector("#dzToolsMore")`);
      await clic(`document.querySelector('.dz-toolbtn[data-tool="sculpt"]')`);
    };
    await elegirEsculpir();
    const ops = await ev(`({ tool: DZ.tool, modos: [...document.querySelectorAll('.esc-opciones [data-e="modo"] option')].map(o => o.value),
      campos: ["radio", "fuerza", "caida", "presionFuerza", "presionRadio"].every(k => !!document.querySelector('.esc-opciones [data-e="' + k + '"]')) })`);
    assert.equal(ops.tool, "sculpt", "la herramienta Esculpir no se elige desde la barra");
    assert.deepEqual(ops.modos, ["agarrar", "empujar", "atraer", "curvar", "suavizar", "relajar", "enderezar", "pellizcar", "expandir", "redibujar"], "faltan modos: " + JSON.stringify(ops.modos));
    assert.ok(ops.campos, "faltan opciones del pincel");
    assert.ok(!(await ev(`/marco vacío selecciona/.test(document.querySelector("#dzToolOpts").textContent)`)), "la barra de Esculpir muestra la ayuda de la Flecha");
    // las opciones ENTRAN en la barra (a 1366 se cortaban): lo secundario va en «Opciones…»
    for (const [w, h] of [[1366, 768], [1000, 560]]) {
      await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false }); await wait(400);
      await ev(`(()=>{ dzToolOptsRender(); return true; })()`);
      const entra = await ev(`(()=>{ const box = document.querySelector("#dzToolOpts"), o = document.querySelector(".esc-opciones").getBoundingClientRect(), b = box.getBoundingClientRect();
        return { o: Math.round(o.right), b: Math.round(b.right), scroll: getComputedStyle(box).overflowX }; })()`);
      // a 1366 entra entera; a media pantalla la barra hace scroll, como con todas las herramientas
      if (w >= 1366) assert.ok(entra.o <= entra.b + 1, "a " + w + "×" + h + " las opciones de Esculpir no entran en la barra: " + JSON.stringify(entra));
      else assert.ok(entra.o <= entra.b + 1 || /auto|scroll/.test(entra.scroll), "a " + w + "×" + h + " las opciones se cortan sin scroll: " + JSON.stringify(entra));
    }
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false }); await wait(400);
    await ev(`(()=>{ dzToolOptsRender(); return true; })()`);
    await clic(`document.querySelector(".esc-mas > summary")`);
    // visibles DE VERDAD: lo que está bajo el puntero en el centro de cada control es el control (la barra recortaba el panel)
    const visibles = await ev(`["caida", "presionFuerza", "presionRadio", "perpendicular"].map(k => { const c = document.querySelector('.esc-mas-panel [data-e="' + k + '"]');
      if (!c) return k + ":falta"; const r = c.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return e === c || c.contains(e) ? "ok" : k + ":tapado"; })`);
    assert.deepEqual(visibles, ["ok", "ok", "ok", "ok"], "«Opciones…» no deja ver o tocar sus controles: " + JSON.stringify(visibles));
    await clic(`document.querySelector(".esc-mas > summary")`);
    await ev(`(()=>{ const s = document.querySelector('.esc-opciones [data-e="radio"]'); s.value = "70"; s.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);

    // ── 2. agarrar el medio y llevarlo abajo ─────────────────────────────────
    assert.equal(await elegirModo("agarrar"), "agarrar");
    const antes = await puntosDe("#recta"), pasos0 = await ev(`DZ.doc.history.undoStack.length`);
    const medio = await pantalla(900, 400);
    await recorrer(Array.from({ length: 13 }, (_, i) => [medio[0], medio[1] + i * 5]));
    const tras = await puntosDe("#recta");
    const g = { pinceles: await cuantosPinceles(), mismo: await ev(`!!document.querySelector("#recta")`),
      punta0: [tras[0][0] - antes[0][0], tras[0][1] - antes[0][1]].map(Math.round), puntaF: [tras.at(-1)[0] - antes.at(-1)[0], tras.at(-1)[1] - antes.at(-1)[1]].map(Math.round),
      maxY: Math.round(Math.max(...tras.map((p) => p[1]))), giro: await giroContorno("#recta"), pasos: await ev(`DZ.doc.history.undoStack.length`) - pasos0 };
    assert.equal(g.pinceles, 1, "agarrar creó otra línea en vez de deformar la misma: " + JSON.stringify(g));
    assert.ok(g.mismo, "el trazo esculpido no es el mismo elemento");
    assert.deepEqual([g.punta0, g.puntaF], [[0, 0], [0, 0]], "las puntas se movieron: " + JSON.stringify(g));
    assert.ok(g.maxY > 470, "el medio no bajó con el lápiz: " + JSON.stringify(g));
    assert.ok(g.giro <= 30, "el contorno quedó con un quiebre: " + JSON.stringify(g));
    assert.equal(g.pasos, 1, "esculpir no es UN paso de historial: " + JSON.stringify(g));
    assert.match(await ev(`DZ.doc.history.undoStack.at(-1)?.label || ""`), /Esculpir · Agarrar/, "el paso de historial no dice qué se hizo");
    await ev(`(()=>{ document.activeElement?.blur?.(); return true; })()`);
    await tecla("z", "KeyZ", 90, 2);
    assert.deepEqual(await puntosDe("#recta"), antes, "Ctrl+Z no vuelve el trazo exacto");

    // ── 2b. CON LÁPIZ: la presión que cae al levantar no devuelve el trazo ──
    //    Reporte de Mauro con la tableta (3.10.0): «algunas modificaciones se
    //    vuelven a la posición anterior». El agarre se escalaba por la presión
    //    de cada muestra y al levantar el lápiz (presión → 0) volvía (y=402).
    const pen = (type, x, y, force, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", pointerType: "pen", force, ...extra });
    const base2 = await puntosDe("#recta"), mp = await pantalla(900, 400);
    await pen("mouseMoved", mp[0], mp[1], 0); await pen("mousePressed", mp[0], mp[1], .7, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i++) { await pen("mouseMoved", mp[0], mp[1] + i * 5, .7, { buttons: 1 }); await wait(16); }
    for (const f of [.4, .2, .08, .02]) { await pen("mouseMoved", mp[0], mp[1] + 60, f, { buttons: 1 }); await wait(16); }
    await pen("mouseReleased", mp[0], mp[1] + 60, 0, { buttons: 0, clickCount: 1 }); await wait(500);
    const conLapiz = Math.round(Math.max(...(await puntosDe("#recta")).map((p) => p[1])));
    assert.ok(conLapiz > 470, "con lápiz, al levantar (presión → 0) el trazo agarrado vuelve a su lugar: y máx " + conLapiz);
    await ev(`(()=>{ document.activeElement?.blur?.(); return true; })()`);
    await tecla("z", "KeyZ", 90, 2);
    assert.deepEqual(await puntosDe("#recta"), base2, "Ctrl+Z no deshace el agarre con lápiz");

    // ── 2c. el círculo del pincel, centrado en la punta (estaba desfasado) ──
    for (const [x, y] of [[mp[0] - 120, mp[1] - 40], [mp[0] + 200, mp[1] + 90]]) {
      await mouse("mouseMoved", x - 4, y - 4); await mouse("mouseMoved", x, y); await wait(80);
      const c = await ev(`(()=>{ const c = document.querySelector(".esc-circulo"); if (!c || c.hidden) return null; const r = c.getBoundingClientRect();
        return { x: r.x + r.width / 2, y: r.y + r.height / 2, enElLienzo: !!c.closest("#dzCanvas"), pos: getComputedStyle(c).position }; })()`);
      assert.ok(c && Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1, "el círculo del pincel no está centrado en el puntero: " + JSON.stringify({ c, puntero: [x, y] }));
      assert.ok(!c.enElLienzo && c.pos === "fixed", "el círculo vive dentro del lienzo: cualquier scroll o corrimiento lo desfasa");
    }

    // ── 3. redibujar un tramo con un arco encima ─────────────────────────────
    assert.equal(await elegirModo("redibujar"), "redibujar");
    const r0 = await pantalla(650, 400), r1 = await pantalla(950, 400);
    await recorrer(Array.from({ length: 31 }, (_, i) => { const t = i / 30; return [r0[0] + (r1[0] - r0[0]) * t, r0[1] - Math.sin(t * Math.PI) * 60]; }));
    const re = await puntosDe("#recta");
    // continuidad en lo DIBUJADO: un solo contorno (los puntos guardados están
    // simplificados: en lo recto quedan lejos uno de otro, y eso no es un salto)
    const contornos = await ev(`(()=>{ const el = document.querySelector("#recta"); const p = el.tagName === "path" ? el : el.querySelector("path"); return ((p.getAttribute("d") || "").match(/M/g) || []).length; })()`);
    const red = { pinceles: await cuantosPinceles(), minY: Math.round(Math.min(...re.map((p) => p[1]))), puntas: [re[0][0], re.at(-1)[0]].map(Math.round), contornos, giro: await giroContorno("#recta") };
    assert.equal(red.pinceles, 1, "redibujar creó otra línea: " + JSON.stringify(red));
    assert.ok(red.minY < 330, "el tramo no tomó el arco dibujado encima: " + JSON.stringify(red));
    assert.deepEqual(red.puntas, [500, 1300], "redibujar cambió las puntas del trazo: " + JSON.stringify(red));
    assert.ok(red.contornos === 1 && red.giro <= 40, "quedó un salto o un quiebre en las uniones: " + JSON.stringify(red));

    // ── 4. redibujar lejos no cambia nada ────────────────────────────────────
    const lejos0 = await puntosDe("#recta"), l0 = await pantalla(700, 800), l1 = await pantalla(900, 820);
    await recorrer(Array.from({ length: 11 }, (_, i) => [l0[0] + (l1[0] - l0[0]) * i / 10, l0[1] + (l1[1] - l0[1]) * i / 10]));
    assert.deepEqual(await puntosDe("#recta"), lejos0, "redibujar lejos de todo trazo cambió uno");
    assert.match(await ev(`document.querySelector("#sbHint")?.textContent || ""`), /empezá y terminá sobre el trazo/, "redibujar lejos no explica cómo se usa");

    // ── 5. suavizar un zigzag de LÁPIZ ───────────────────────────────────────
    await clic(`document.querySelector('.dz-toolbtn[data-tool="pencil"]')`);
    const z0 = await pantalla(500, 700), z1 = await pantalla(1300, 700);
    await recorrer(Array.from({ length: 41 }, (_, i) => [z0[0] + (z1[0] - z0[0]) * i / 40, z0[1] + (i % 2 ? 9 : -9)]));
    await ev(`(()=>{ const el = [...document.querySelectorAll('#dzCanvas > svg path[fill="none"]')].pop(); el.id = "zigzag"; dzDocCommit(); return true; })()`);
    const zz = () => ev(`(()=>{ const p = document.querySelector("#zigzag"), L = p.getTotalLength(); let max = 0;
      for (let s = L * .3; s < L * .7; s += 1) max = Math.max(max, Math.abs(p.getPointAtLength(s).y - 700)); return { max: +max.toFixed(1), sw: p.getAttribute("stroke-width"), guardados: p.hasAttribute("data-low-trazo-points") }; })()`);
    const zAntes = await zz();
    await elegirEsculpir();
    assert.equal(await elegirModo("suavizar"), "suavizar");
    const s0 = await pantalla(700, 700), s1 = await pantalla(1100, 700);
    for (let pasada = 0; pasada < 3; pasada++)
      await recorrer(Array.from({ length: 21 }, (_, i) => [s0[0] + (s1[0] - s0[0]) * (pasada % 2 ? 1 - i / 20 : i / 20), s0[1]]));
    const zDespues = await zz();
    assert.ok(zDespues.max < zAntes.max * .6, "suavizar no bajó el zigzag del lápiz: " + JSON.stringify({ zAntes, zDespues }));
    assert.equal(zDespues.sw, zAntes.sw, "suavizar cambió el grosor del lápiz");
    assert.ok(zDespues.guardados, "el lápiz esculpido no guarda sus puntos para la próxima pasada");

    // ── 6. con el espacio se panea, no se esculpe ────────────────────────────
    const quieto = JSON.stringify(await puntosDe("#recta"));
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, text: " " }); await wait(80);
    const m2 = await pantalla(900, 400);
    await recorrer([[m2[0], m2[1]], [m2[0] + 30, m2[1] + 40], [m2[0] + 60, m2[1] + 80]]);
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32 }); await wait(80);
    assert.equal(JSON.stringify(await puntosDe("#recta")), quieto, "con el espacio apretado, esculpió en vez de panear");

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E esculpir trazos OK", JSON.stringify({ agarrar: g, redibujar: red, suavizar: [zAntes.max, zDespues.max] }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e); process.exit(1); });
