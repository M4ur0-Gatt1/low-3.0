/* EL TALLER DE PERSONAJE (v3.37). CDP :9223 + mock :8791.

   Pedido de Mauro: «un módulo de diseño de personaje con todas las
   herramientas al mejor estilo Grease Pencil… quiero también tener una
   biblioteca de maniquíes distintos que también sirva para el módulo 3D de
   composición de fondos». Sin IA: se dibuja sobre un maniquí y se gira.

   Con el mouse de verdad:
   1. Panel «Personaje»: elegir el maniquí «Cartoon» y «Abrir el taller». La
      escena que había espera afuera; en la mesa está el maniquí (volúmenes con
      su parte: cabeza, pecho, brazos…).
   2. Dibujar sobre la cabeza: el trazo queda PEGADO a la cabeza.
   3. Cambiar «Alto en cabezas» con el deslizador: el maniquí cambia y el trazo
      SIGUE a la cabeza; UN Ctrl+Z vuelve todo.
   4. Las vistas: «Perfil» gira la cámara al costado; las líneas de modelo se ven.
   5. La hoja de modelo: tres vistas sin perspectiva, con dibujo.
   6. «Guardar en la biblioteca»: vuelve la escena de antes, y el personaje
      queda en «Mis personajes» con sus proporciones.
   7. La biblioteca «Maniquíes» trae los de fábrica y se colocan en la
      composición como cualquier elemento.
   8. Reabrir el personaje: el trazo y el maniquí están; «Cancelar» no cambia nada. */
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
  const enLienzo = async (p, m) => { const bajo = await ev(`(document.elementFromPoint(${p.x}, ${p.y}) || {}).tagName || "nada"`); if (bajo !== "CANVAS") throw Error("PRUEBA MAL ARMADA: " + JSON.stringify(m) + " cae sobre " + bajo); };
  const arrastrarPx = async (a, b, pasos = 16) => {
    await enLienzo(a, a); await enLienzo(b, b);
    await mover(a); await send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= pasos; i++) { await mover({ x: a.x + (b.x - a.x) * i / pasos, y: a.y + (b.y - a.y) * i / pasos }, 1); await w(10); }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", buttons: 0, clickCount: 1 }); await w(250);
  };
  const clicEn = async (sel) => {
    const p = await ev(`(()=>{ const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.getClientRects().length); if (!b) return null; b.scrollIntoView({ block: "nearest" }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!p) mal("falta en pantalla: " + sel, {});
    await mover(p); await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 }); await w(300);
  };
  const tecla = async (key, code, vk, modifiers = 0) => { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers }); await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers }); await w(250); };
  const cabeza = () => ev(`(()=>{ const r = __low3d.strokes.find(s => s.maniqui && s.parte === "cabeza"); if (!r) return null; r.object.updateMatrixWorld(true);
    const b = new (__low3d.camera.position.constructor)(); const B = new (Object.getPrototypeOf(__low3d.camera.position).constructor)();
    let mn = [1e9,1e9,1e9], mx = [-1e9,-1e9,-1e9]; for (const p of r.points) { const q = r.object.localToWorld(p.clone()).toArray(); q.forEach((v, i) => { mn[i] = Math.min(mn[i], v); mx[i] = Math.max(mx[i], v); }); }
    return { min: mn, max: mx, centro: mn.map((v, i) => (v + mx[i]) / 2) }; })()`);
  const trazoDeCabeza = () => ev(`(()=>{ const r = __low3d.strokes.find(s => !s.maniqui && s.parte === "cabeza" && s.kind === "stroke"); if (!r) return null; r.object.updateMatrixWorld(true);
    const ps = r.points.map(p => r.object.localToWorld(p.clone()).toArray()); const c = ps.reduce((a, p) => a.map((v, i) => v + p[i] / ps.length), [0, 0, 0]); return { n: ps.length, centro: c }; })()`);

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
    // una escena con una caja (lo que tiene que esperar afuera)
    await ev(`(()=>{ const e = __low3d; e.camera.position.set(0, 9, 14); e.controls.target.set(0, 1, 0); e.camera.lookAt(e.controls.target); e.controls.update(); return 1; })()`); await w(200);
    await tecla("x", "KeyX", 88);
    await arrastrarPx(await aPantalla([-6, 0, 2]), await aPantalla([-4, 0, 0])); await mover(await aPantalla([-5, 2, 1]));
    await send("Input.dispatchMouseEvent", { type: "mousePressed", ...(await aPantalla([-5, 2, 1])), button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", ...(await aPantalla([-5, 2, 1])), button: "left", buttons: 0, clickCount: 1 }); await w(250);
    const enEscena = await ev(`__low3d.strokes.length`);
    if (enEscena < 1) mal("no se armó la escena de partida", { enEscena });

    // ── 1. abrir el taller desde el panel Personaje ──
    await clicEn('[data-panel="personaje"]');
    await clicEn('[data-maniqui="cartoon"]');
    await clicEn('.taller3d-entrar');
    const t1 = await ev(`(()=>{ const t = __low3d.enTaller(); return { t: !!t, cabezas: t && t.m.cabezas, partes: __low3d.strokes.filter(s => s.maniqui).map(s => s.parte).sort(), otros: __low3d.strokes.filter(s => !s.maniqui).length, panel: !!document.querySelector(".taller3d-activo") }; })()`);
    if (!t1.t || t1.cabezas !== 5 || !t1.panel) mal("«Abrir el taller» no abrió el taller con el maniquí Cartoon", t1);
    for (const p of ["cabeza", "pecho", "pelvis", "brazo-izq", "antebrazo-der", "mano-izq", "muslo-der", "pierna-izq", "pie-der"]) if (!t1.partes.includes(p)) mal("al maniquí le falta la parte " + p, t1);
    if (t1.otros) mal("la escena no quedó afuera: hay objetos que no son el maniquí", t1);

    // ── 2. dibujar sobre la cabeza ──
    await clicEn('[data-vista="0"]'); await w(300);
    const cab = await cabeza();
    await tecla("p", "KeyP", 80);
    const a = await aPantalla([cab.centro[0] - (cab.max[0] - cab.min[0]) * 0.25, cab.centro[1], cab.max[2] * 0.9]);
    const b = await aPantalla([cab.centro[0] + (cab.max[0] - cab.min[0]) * 0.25, cab.centro[1] + 0.02, cab.max[2] * 0.9]);
    await arrastrarPx(a, b);
    const tr = await trazoDeCabeza();
    if (!tr) mal("el trazo sobre la cabeza no quedó pegado a la cabeza (parte)", await ev(`__low3d.strokes.filter(s => !s.maniqui).map(s => ({ parte: s.parte, kind: s.kind }))`));
    const dist0 = Math.hypot(...tr.centro.map((v, i) => v - cab.centro[i]));

    // ── 3. otras proporciones: el trazo sigue a la cabeza; UN Ctrl+Z ──
    const desl = await ev(`(()=>{ const i = document.querySelector('.taller3d input[data-prop="cabezas"]'); const r = i.getBoundingClientRect(); return { x: r.x + r.width * 0.15, y: r.y + r.height / 2 }; })()`);
    await mover(desl); await send("Input.dispatchMouseEvent", { type: "mousePressed", x: desl.x, y: desl.y, button: "left", buttons: 1, clickCount: 1 }); await w(100);
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: desl.x, y: desl.y, button: "left", buttons: 0, clickCount: 1 }); await w(400);
    const t3 = await ev(`__low3d.enTaller().m.cabezas`);
    if (!(t3 < 5)) mal("el deslizador «Alto en cabezas» no cambió la proporción", { t3 });
    const cab2 = await cabeza(), tr2 = await trazoDeCabeza();
    const dist1 = Math.hypot(...tr2.centro.map((v, i) => v - cab2.centro[i]));
    if (Math.abs(cab2.centro[1] - cab.centro[1]) < 0.05) mal("la cabeza no se movió al cambiar las proporciones", { cab, cab2 });
    // la cabeza cambia de TAMAÑO: el trazo tiene que quedar en el mismo lugar RELATIVO (sobre su superficie)
    const radio = (c) => (c.max[2] - c.min[2]) / 2;
    const rel0 = dist0 / radio(cab), rel1 = dist1 / radio(cab2);
    if (Math.abs(rel1 - rel0) > 0.2) mal("el trazo NO siguió a la cabeza al cambiar las proporciones", { rel0, rel1, dist0, dist1, cab2, tr2 });
    await ev(`(()=>{ document.activeElement?.blur?.(); return 1; })()`);
    await tecla("z", "KeyZ", 90, 2);
    const t3b = await ev(`__low3d.enTaller().m.cabezas`);
    if (t3b !== 5) mal("UN Ctrl+Z no volvió las proporciones", { t3b });
    const tr3 = await trazoDeCabeza();
    if (Math.hypot(...tr3.centro.map((v, i) => v - tr.centro[i])) > 0.01) mal("Ctrl+Z no devolvió el trazo a su lugar", { tr, tr3 });

    // ── 4. las vistas y las líneas de modelo ──
    await clicEn('[data-vista="90"]'); await w(300);
    const cam = await ev(`(()=>{ const p = __low3d.camera.position; return [p.x, p.z]; })()`);
    if (!(cam[0] > 0.5 && Math.abs(cam[1]) < 0.2)) mal("«Perfil» no puso la cámara al costado del personaje", cam);
    const lineas = await ev(`(()=>{ const c = document.querySelector(".low3d-lineas-modelo"); if (!c || c.style.display === "none") return 0; const g = c.getContext("2d"); const d = g.getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++; return n; })()`);
    if (lineas < 200) mal("las líneas de modelo no se ven", { lineas });

    // ── 5. la hoja de modelo ──
    const hoja = await ev(`(async()=>{ const r = __low3d.hojaDeModelo(240, 360, [0, 90, 180]); if (!r) return null; const tinta = async (png) => { const im = new Image(); im.src = png; await im.decode();
      const c = document.createElement("canvas"); c.width = 240; c.height = 360; const g = c.getContext("2d"); g.drawImage(im, 0, 0); const d = g.getImageData(0, 0, 240, 360).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 20) n++; return n; };
      const ns = []; for (const v of r.vistas) ns.push(await tinta(v.png)); return { nombres: r.vistas.map(v => v.nombre), tinta: ns, lineas: r.lineas.length, abajo: r.abajo, arriba: r.arriba }; })()`);
    if (!hoja || hoja.nombres.join() !== "Frente,Perfil,Espalda" || hoja.tinta.some((n) => n < 500) || hoja.lineas < 5) mal("la hoja de modelo no salió (vistas, dibujo o líneas)", hoja);

    // ── 6. guardar ──
    await ev(`(()=>{ const i = document.querySelector('.taller3d-activo input[aria-label="Nombre del personaje"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "Pibe"); i.dispatchEvent(new Event("input", { bubbles: true })); return 1; })()`);
    await clicEn('.taller3d-guardar');
    const t6 = await ev(`(()=>{ const kits = JSON.parse(localStorage.getItem("low3d:kits") || "[]"); const k = kits.find(x => x.nombre === "Mis personajes"); const p = k && k.piezas.find(x => x.nombre === "Pibe");
      return { taller: !!__low3d.enTaller(), enEscena: __low3d.strokes.length, kit: !!k, pieza: p ? { cat: p.categoria, cabezas: p.maniqui && p.maniqui.cabezas, items: p.items.length, trazos: p.items.filter(i => !i.maniqui && i.parte === "cabeza").length } : null }; })()`);
    if (t6.taller || t6.enEscena !== enEscena) mal("al guardar no volvió la escena de antes", { t6, enEscena });
    if (!t6.pieza || t6.pieza.cat !== "personaje" || t6.pieza.cabezas !== 5 || t6.pieza.trazos < 1) mal("el personaje no quedó en «Mis personajes» con sus proporciones y su trazo", t6);

    // ── 7. los maniquíes de fábrica, en la composición ──
    const t7 = await ev(`(async()=>{ const { kitsDeFabrica } = window.__biblioteca3d || {}; const e = __low3d;
      const sel = document.querySelector('[data-panel="biblioteca"]'); sel.click(); await new Promise(r => setTimeout(r, 300));
      const s = document.querySelector('select[aria-label="Escenografía"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, "fabrica-maniquies"); s.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const cartas = [...document.querySelectorAll(".biblio3d-grilla [data-pieza]")].map(b => b.getAttribute("data-pieza"));
      document.querySelector('.biblio3d-grilla [data-pieza="maniqui-realista"]').click(); await new Promise(r => setTimeout(r, 200));
      const antes = e.strokes.length; e.colocarPieza(e.getPiezaActiva(), new e.camera.position.constructor(3, 0, 3), { escala: 1, giro: 0, sinVariar: true });
      return { cartas, nuevos: e.strokes.length - antes, alto: (() => { const B = new (e.camera.position.constructor)(); let y = 0; for (const r of e.strokes.slice(antes)) { r.object.updateMatrixWorld(true); for (const p of r.points) y = Math.max(y, r.object.localToWorld(p.clone()).y); } return Math.round(y * 100) / 100; })() }; })()`);
    if (t7.cartas.length < 7 || !t7.cartas.includes("maniqui-chibi")) mal("la biblioteca «Maniquíes» no trae los de fábrica", t7);
    if (t7.nuevos < 10 || Math.abs(t7.alto - 1.74) > 0.06) mal("el maniquí realista no se colocó en la composición con su alto (1,74 m)", t7);

    // ── 8. reabrir el personaje y cancelar ──
    const antes8 = await ev(`__low3d.strokes.length`);
    await clicEn('[data-panel="personaje"]');
    const mios = await ev(`[...document.querySelectorAll(".taller3d-mios [data-personaje]")].map(b => b.textContent)`);
    if (mios.join() !== "Pibe") mal("«Mis personajes» no lista sólo tus personajes", { mios });
    await clicEn('.taller3d-mios [data-personaje]');
    const t8 = await ev(`({ taller: !!__low3d.enTaller(), trazos: __low3d.strokes.filter(s => !s.maniqui && s.parte === "cabeza").length, maniqui: __low3d.strokes.filter(s => s.maniqui).length })`);
    if (!t8.taller || t8.trazos < 1 || t8.maniqui < 10) mal("al reabrir el personaje no están el maniquí y su trazo", t8);
    await clicEn('.taller3d-activo .taller3d-cierre button:not(.taller3d-guardar)');
    if (await ev(`!!__low3d.enTaller() || __low3d.strokes.length !== ${antes8}`)) mal("«Cancelar» no dejó la escena como estaba", {});

    if (errores.length) mal("errores de la página", errores);
    console.log("OK check_3d_taller_personaje_ui:", JSON.stringify({ hoja, t6: t6.pieza, t7 }));
  } finally {
    ws.close();
    await fetch(endpoint + "/json/close/" + target.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
