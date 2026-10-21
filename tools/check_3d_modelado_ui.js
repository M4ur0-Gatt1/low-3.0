/* EL MODELADO DEL TALLER Y LOS HUESOS DE VERDAD (v3.41). CDP :9223 + mock :8791.

   Pedidos de Mauro: «copiá los mejores programas de modelado 3D para esta
   sección», «que el sistema sea lo mejor de lo mejor» y «los cuerpos no se
   comportan como si tuvieran huesos, quisiera un comportamiento más anatómico».

   Con el mouse y el teclado de verdad:
   1. Los atajos de Blender eligen el pincel (C arcilla, L capa, Shift+C surco,
      Shift+T aplanar, K gancho, M máscara, X dibujar).
   2. El ESPACIADO: un arrastre rápido (3 eventos en 220 px) deja un trazo parejo.
   3. CAPA no acumula al pasar dos veces; DIBUJAR sí.
   4. La MÁSCARA protege; Ctrl+I la invierte, Alt+M la borra, Ctrl+Z la devuelve;
      el pincel Máscara pinta y con Ctrl borra.
   5. SÓLO CARAS DE FRENTE: inflar la mano no atraviesa al otro lado.
   6. F + mover el mouse cambia el tamaño; Esc lo deja como estaba.
   7. El ESTABILIZADOR: un temblor más corto que la cuerda no esculpe.
   8. El GANCHO lleva la piel con el cursor.
   9. Una PIEZA (remera) levantada de la máscara: queda a su grosor, se dibuja
      encima (el trazo se pega al pecho), sigue la pose, pasa a más definición y
      Ctrl+Z la saca devolviendo la máscara.
  10. CAPAS de escultura: lo esculpido va a la capa; su dial en 0 lo saca y en
      0,5 lo deja a la mitad.
  11. Los FILTROS cambian toda la piel menos lo enmascarado.
  12. HUESOS DE VERDAD: el codo doblado 140°, el antebrazo girado 85°, la rodilla
      doblada 130° y la pierna levantada 110° conservan el VOLUMEN del miembro
      (con el skinning lineal, girar el antebrazo y levantar la pierna perdían el
      9 %); «abrir» abre las dos piernas hacia su lado. */
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
  const aPantalla = (p) => ev(`(()=>{ const e = __low3d, r = e.canvasElement().getBoundingClientRect(), c = e.camera; c.updateMatrixWorld(true);
    const v = new c.position.constructor(...${JSON.stringify(p)}).project(c); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; })()`);
  const mover = (p, buttons = 0, modifiers = 0) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, buttons, modifiers, button: buttons ? "left" : "none" });
  const enLienzo = async (p, m) => { const bajo = await ev(`(document.elementFromPoint(${p.x}, ${p.y}) || {}).tagName || "nada"`); if (bajo !== "CANVAS") throw Error("PRUEBA MAL ARMADA: " + JSON.stringify(m) + " cae sobre " + bajo); };
  const arrastrarPx = async (a, b, pasos = 16, modifiers = 0) => {
    await enLienzo(a, a); await enLienzo(b, b);
    await mover(a, 0, modifiers); await send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", buttons: 1, clickCount: 1, modifiers });
    for (let i = 1; i <= pasos; i++) { await mover({ x: a.x + (b.x - a.x) * i / pasos, y: a.y + (b.y - a.y) * i / pasos }, 1, modifiers); await w(15); }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", buttons: 0, clickCount: 1, modifiers }); await w(300);
  };
  const clicEn = async (sel, texto) => {
    const p = await ev(`(()=>{ const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.getClientRects().length && (${JSON.stringify(texto || "")} === "" || b.textContent.includes(${JSON.stringify(texto || "")}))); if (!b) return null; b.scrollIntoView({ block: "nearest" }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!p) mal("falta en pantalla: " + sel + " " + (texto || ""), {});
    await mover(p); await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 }); await w(300);
  };
  const tecla = async (key, code, vk, modifiers = 0) => { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers }); await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers }); await w(250); };
  const poner = (sel, v) => ev(`(()=>{ const i = document.querySelector(${JSON.stringify(sel)}); i.scrollIntoView({ block: "center" }); const P = i.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(P, "value").set.call(i, ${JSON.stringify(String(v))});
    // una lista recibe UN change (dos: React la volvía al valor viejo entre medio y el segundo deshacía el primero)
    if (i.tagName !== "SELECT") i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
  const hueso = (n) => ev(`__low3d.personajeDelTaller().articulacion(${JSON.stringify(n)}).toArray()`);
  // el punto donde se suelta el arrastre, sobre el plano de la cámara que pasa por `p` (lo que hace el motor)
  const enPlano = (px, p) => ev(`(()=>{ const e = __low3d, c = e.camera, r = e.canvasElement().getBoundingClientRect(), V = c.position.constructor;
    const n = c.getWorldDirection(new V()).negate(), q = new V(...${JSON.stringify(p)});
    const nd = new V((${px.x} - r.left) / r.width * 2 - 1, -((${px.y} - r.top) / r.height) * 2 + 1, 0.5).unproject(c).sub(c.position).normalize();
    const t = q.clone().sub(c.position).dot(n) / nd.dot(n); return c.position.clone().addScaledVector(nd, t).toArray(); })()`);
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
    await ev(`try{localStorage.clear(); localStorage.setItem("low3d:guia-fondos","1")}catch(e){}; location.reload(); true`);
    for (let i = 0; i < 80; i++) { await w(250); if (await ev("!!window.__low3d && !!document.querySelector('[data-panel=\"personaje\"]')").catch(() => false)) break; }
    await ev(`__low3d.newProject(); true`);
    await clicEn('[data-panel="personaje"]');
    await clicEn('[data-cuerpo="hombre"]');
    await clicEn('.taller3d-entrar');
    await ev(`__low3d.personajesListos()`); await w(300);
    await clicEn('[data-modo="esculpir"]');
    await clicEn('[data-vista="0"]');
    // de cerca (como se esculpe): el torso ocupa media pantalla
    await ev(`(()=>{ const c = __low3d.camera, o = __low3d.controls.target; o.set(0, 1.25, 0); c.position.set(0, 1.3, 1.6); c.lookAt(o); __low3d.controls.update(); return true; })()`); await w(200);
    const ctrlZ = () => tecla("z", "KeyZ", 90, 2);
    const letra = (k, mods = 0) => tecla(mods & 8 ? k.toUpperCase() : k, "Key" + k.toUpperCase(), k.toUpperCase().charCodeAt(0), mods);
    const pincel = () => ev(`__low3d.enTaller().pincel`);
    // la piel en reposo (lo que el pincel cambia) y su posada en el mundo
    const reposo = () => ev(`Array.from(__low3d.personajeDelTaller().cuerpo.geometry.attributes.position.array)`);
    const cambio = (a, b, idx) => { let m = 0; for (const i of idx) m = Math.max(m, Math.hypot(a[i * 3] - b[i * 3], a[i * 3 + 1] - b[i * 3 + 1], a[i * 3 + 2] - b[i * 3 + 2])); return m; };
    const cambioTotal = (a, b) => { let m = 0, n = 0; for (let i = 0; i < a.length; i += 3) { const d = Math.hypot(a[i] - b[i], a[i + 1] - b[i + 1], a[i + 2] - b[i + 2]); if (d > 1e-6) n++; m = Math.max(m, d); } return { m, n }; };
    // el punto de la piel bajo un punto de la pantalla (el rayo del motor) y su vértice más cercano
    const bajo = (p) => ev(`(()=>{ const e = __low3d, x = e.personajeDelTaller(), r = e.canvasElement().getBoundingClientRect(), rc = e.raycaster;
      rc.setFromCamera(new e.pointer.constructor(((${p.x} - r.left) / r.width) * 2 - 1, -((${p.y} - r.top) / r.height) * 2 + 1), e.camera);
      const h = rc.intersectObjects(x.mallas, false)[0]; if (!h) return null;
      const pos = x.posicionesMundo(); let mejor = -1, md = Infinity;
      for (let i = 0; i < pos.length; i += 3) { const d = (pos[i] - h.point.x) ** 2 + (pos[i + 1] - h.point.y) ** 2 + (pos[i + 2] - h.point.z) ** 2; if (d < md) { md = d; mejor = i / 3; } }
      return { i: mejor, p: h.point.toArray(), pieza: !!h.object.userData.pieza }; })()`);
    const pecho = async () => { const a = await hueso("spine_03"), b = await hueso("spine_02"); return aPantalla([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.3]); };

    // ── 1. los atajos de Blender ──
    for (const [k, mods, tipo] of [["c", 0, "arcilla"], ["l", 0, "capa"], ["c", 8, "surco"], ["t", 8, "aplanar"], ["k", 0, "gancho"], ["m", 0, "mascara"], ["x", 0, "dibujar"]]) {
      await letra(k, mods);
      const p = await pincel();
      if (p.tipo !== tipo) mal("la tecla " + (mods & 8 ? "Shift+" : "") + k.toUpperCase() + " no eligió " + tipo, p);
    }

    // ── 2. el espaciado: un arrastre rápido (3 eventos) deja un trazo parejo, sin huecos ──
    const c0 = await pecho(), desde = { x: c0.x - 70, y: c0.y }, hasta = { x: c0.x + 70, y: c0.y };
    const muestras = [];
    for (let k = 1; k <= 9; k++) muestras.push(await bajo({ x: desde.x + (hasta.x - desde.x) * k / 10, y: desde.y }));
    if (muestras.some((m) => !m)) mal("PRUEBA MAL ARMADA: el camino no cae sobre el pecho", muestras);
    let r0 = await reposo();
    await arrastrarPx(desde, hasta, 3);
    let r1 = await reposo();
    const alturas = muestras.map((m) => cambio(r0, r1, [m.i]));
    if (Math.min(...alturas) < Math.max(...alturas) * 0.25) mal("un arrastre rápido dejó huecos en el trazo (falta el espaciado)", { alturas });
    await ctrlZ();
    const rZ = await reposo();
    if (cambioTotal(r0, rZ).m > 5e-5) mal("Ctrl+Z no deshizo el trazo", cambioTotal(r0, rZ));

    // ── 3. capa: ir y volver en el MISMO trazo no acumula (la altura es por trazo, como el Layer de Blender); dibujar sí ──
    const ruta = async (pts, pasos) => {
      await mover(pts[0]); await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pts[0].x, y: pts[0].y, button: "left", buttons: 1, clickCount: 1 });
      for (let s = 1; s < pts.length; s++) for (let i = 1; i <= pasos; i++) { await mover({ x: pts[s - 1].x + (pts[s].x - pts[s - 1].x) * i / pasos, y: pts[s - 1].y + (pts[s].y - pts[s - 1].y) * i / pasos }, 1); await w(12); }
      const f = pts[pts.length - 1]; await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: f.x, y: f.y, button: "left", buttons: 0, clickCount: 1 }); await w(300);
    };
    const dosPasadas = async (tipoTecla) => {
      await letra(tipoTecla);
      const idx = muestras.map((m) => m.i), a = await reposo();
      await ruta([desde, hasta], 24); const b = await reposo(); await ctrlZ();
      await ruta([desde, hasta, desde], 24); const c = await reposo(); await ctrlZ();
      return { una: cambio(a, b, idx), dos: cambio(a, c, idx) };
    };
    const capa = await dosPasadas("l"), dib = await dosPasadas("x");
    if (!(capa.una > 0.0005)) mal("el pincel Capa no levantó la piel", capa);
    if (!(capa.dos < capa.una * 1.3)) mal("el pincel Capa acumuló al pasar dos veces (tiene que quedar parejo)", capa);
    if (!(dib.dos > dib.una * 1.5)) mal("Dibujar no acumuló al pasar dos veces", dib);

    // ── 4. la máscara protege; Ctrl+I la invierte; Alt+M la borra; Ctrl+Z la devuelve ──
    await poner('select[aria-label="Parte para enmascarar"]', "torso");
    await clicEn('[data-mascara-parte="poner"]');
    const m1 = await ev(`__low3d.enTaller().mascara`);
    if (!(m1 > 0.05 && m1 < 0.6)) mal("enmascarar el torso no puso la máscara", { m1 });
    await letra("x");
    r0 = await reposo();
    await arrastrarPx(desde, hasta, 24);
    r1 = await reposo();
    const protegido = await ev(`(()=>{ const M = __low3d.personajeDelTaller().cuerpo.geometry.attributes.mascara.array; const o = []; for (let i = 0; i < M.length; i++) if (M[i] > 0.999) o.push(i); return o; })()`);
    if (cambio(r0, r1, protegido) > 1e-6) mal("un pincel movió la piel enmascarada", { mov: cambio(r0, r1, protegido) });
    await tecla("i", "KeyI", 73, 2);
    const m2 = await ev(`__low3d.enTaller().mascara`);
    if (!(Math.abs(m2 - (1 - m1)) < 0.02)) mal("Ctrl+I no invirtió la máscara", { m1, m2 });
    await tecla("m", "KeyM", 77, 1);
    const m3 = await ev(`__low3d.enTaller().mascara`);
    if (m3 !== 0) mal("Alt+M no borró la máscara", { m3 });
    await ctrlZ();
    const m4 = await ev(`__low3d.enTaller().mascara`);
    if (!(Math.abs(m4 - m2) < 0.02)) mal("Ctrl+Z no devolvió la máscara", { m2, m4 });
    // deshacer todo el paso: Ctrl+I, la máscara del torso y el trazo
    await ctrlZ(); await ctrlZ(); await ctrlZ();
    const m4b = await ev(`__low3d.enTaller().mascara`), r4b = await reposo();
    if (m4b !== 0 || cambioTotal(r0, r4b).m > 5e-5) mal("deshacer la máscara y el trazo no volvió a como estaba", { m4b, piel: cambioTotal(r0, r4b) });
    // pintar la máscara con el pincel: Ctrl la borra
    await letra("m");
    await arrastrarPx(desde, hasta, 24);
    const m5 = await ev(`__low3d.enTaller().mascara`);
    await arrastrarPx(desde, hasta, 24, 2);
    const m6 = await ev(`__low3d.enTaller().mascara`);
    if (!(m5 > 0.002)) mal("el pincel Máscara no pintó", { m5 });
    if (!(m6 < m5 * 0.5)) mal("el pincel Máscara con Ctrl no borró", { m5, m6 });
    await tecla("m", "KeyM", 77, 1);

    // ── 5. sólo caras de frente: en lo fino (la mano) no atraviesa al otro lado ──
    let centroMano = null;
    // de perfil, la palma mira a la cámara (de frente se ve el canto de la mano)
    const mano = await hueso("hand_l");
    await ev(`(()=>{ const c = __low3d.camera, o = __low3d.controls.target; o.set(${mano[0]}, ${mano[1]}, ${mano[2]}); c.position.set(${mano[0]} + 0.7, ${mano[1]}, ${mano[2]}); c.lookAt(o); __low3d.controls.update(); return true; })()`); await w(200);
    const manoAtras = await ev(`(()=>{ const x = __low3d.personajeDelTaller(), g = x.cuerpo.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, b = x.cuerpo.skeleton.bones;
      const k = b.findIndex(z => z.name === "hand_l"), cam = __low3d.camera.position, pos = x.posicionesMundo(), V = cam.constructor;
      const c = new V(); let n = 0; const idx = [];
      for (let i = 0; i < si.count; i++) { let w = 0; for (let s = 0; s < 4; s++) if (si.getComponent(i, s) === k) w += sw.getComponent(i, s); if (w < 0.8) continue; c.x += pos[i*3]; c.y += pos[i*3+1]; c.z += pos[i*3+2]; n++; idx.push(i); }
      c.multiplyScalar(1 / n); const dir = cam.clone().sub(c).normalize();
      // los de atrás: los que quedan detrás del centro de la mano, mirando desde la cámara
      return { c: c.toArray(), atras: idx.filter((i) => new V(pos[i*3], pos[i*3+1], pos[i*3+2]).sub(c).dot(dir) < -0.012) }; })()`).then((r) => { centroMano = r.c; return r.atras; });
    const pm = await aPantalla(centroMano);
    if (manoAtras.length < 20) mal("PRUEBA MAL ARMADA: no hay piel detrás de la mano", manoAtras.length);
    await letra("i");
    // (en «Parado» la mano es un puño de 6 cm: el pincel de 8 cm llega al otro lado)
    await poner('input[aria-label="Tamaño del pincel"]', 8);
    const toque = async () => { await mover(pm); await send("Input.dispatchMouseEvent", { type: "mousePressed", x: pm.x, y: pm.y, button: "left", buttons: 1, clickCount: 1 });
      for (let k = 0; k < 6; k++) { await mover({ x: pm.x + (k % 2 ? 6 : -6), y: pm.y }, 1); await w(20); }
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: pm.x, y: pm.y, button: "left", buttons: 0, clickCount: 1 }); await w(250); };
    r0 = await reposo(); await toque(); r1 = await reposo();
    const conFrente = { frente: cambio(r0, r1, [(await bajo(pm)).i]), atras: cambio(r0, r1, manoAtras) };
    await ctrlZ();
    await clicEn('input[aria-label="Sólo caras de frente"]');
    r0 = await reposo(); await toque(); r1 = await reposo();
    const sinFrente = { atras: cambio(r0, r1, manoAtras) };
    await ctrlZ();
    await clicEn('input[aria-label="Sólo caras de frente"]');
    if (!(conFrente.frente > 0.0003)) mal("inflar la mano no la infló", conFrente);
    if (!(sinFrente.atras > 0.0005)) mal("PRUEBA MAL ARMADA: sin «Sólo caras de frente» el pincel tampoco llegó al otro lado de la mano", { conFrente, sinFrente });
    if (!(conFrente.atras < sinFrente.atras * 0.35)) mal("con «Sólo caras de frente» el pincel igual atravesó la mano", { conFrente, sinFrente });
    await poner('input[aria-label="Tamaño del pincel"]', 5);
    await ev(`(()=>{ const c = __low3d.camera, o = __low3d.controls.target; o.set(0, 1.25, 0); c.position.set(0, 1.3, 1.6); c.lookAt(o); __low3d.controls.update(); return true; })()`); await w(200);

    // ── 6. F: el tamaño con el mouse (clic: listo; Esc: como estaba) ──
    const rad0 = (await pincel()).radio;
    await mover({ x: 600, y: 400 });
    await letra("f"); await mover({ x: 760, y: 400 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: 760, y: 400, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: 760, y: 400, button: "left", buttons: 0, clickCount: 1 }); await w(200);
    const rad1 = (await pincel()).radio;
    if (!(rad1 > rad0 * 2)) mal("F + mover el mouse no agrandó el pincel", { rad0, rad1 });
    await letra("f"); await mover({ x: 500, y: 400 }); await tecla("Escape", "Escape", 27);
    const rad2 = (await pincel()).radio;
    if (Math.abs(rad2 - rad1) > 1e-6) mal("Esc no dejó el tamaño como estaba", { rad1, rad2 });
    await poner('input[aria-label="Tamaño del pincel"]', 5);

    // ── 7. el estabilizador: un temblor corto (más corto que la cuerda) no esculpe ──
    await poner('input[aria-label="Estabilizador del pincel"]', 80);
    r0 = await reposo();
    await arrastrarPx({ x: c0.x - 20, y: c0.y }, { x: c0.x + 30, y: c0.y + 10 }, 10);
    r1 = await reposo();
    const tembl = cambioTotal(r0, r1);
    await ctrlZ();
    await poner('input[aria-label="Estabilizador del pincel"]', 0);
    // (el primer toque al apretar sí marca: lo que no tiene que haber es un trazo de 50 px)
    const unToque = await (async () => { const a = await reposo(); await mover(c0); await send("Input.dispatchMouseEvent", { type: "mousePressed", x: c0.x, y: c0.y, button: "left", buttons: 1, clickCount: 1 });
      await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: c0.x, y: c0.y, button: "left", buttons: 0, clickCount: 1 }); await w(250); const b = await reposo(); await ctrlZ(); return cambioTotal(a, b); })();
    if (tembl.n > unToque.n * 1.6) mal("con el estabilizador, un temblor corto esculpió como un trazo", { tembl, unToque });

    // ── 8. gancho: lo de bajo el pincel va con el cursor ──
    await letra("k");
    const hombro = await hueso("upperarm_l"), ph = await aPantalla(hombro);
    const bh = await bajo(ph);
    r0 = await reposo();
    const p0 = await ev(`__low3d.personajeDelTaller().posicionesMundo().slice(${bh.i * 3}, ${bh.i * 3 + 3})`);
    await arrastrarPx(ph, { x: ph.x + 90, y: ph.y - 40 }, 20);
    const p1 = await ev(`__low3d.personajeDelTaller().posicionesMundo().slice(${bh.i * 3}, ${bh.i * 3 + 3})`);
    const dG = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    if (!(dG[0] > 0.02 && dG[1] > 0.005)) mal("el Gancho no llevó la piel con el cursor", { dG });
    await ctrlZ();

    // ── 9. levantar una PIEZA (una remera) de la máscara ──
    await poner('select[aria-label="Parte para enmascarar"]', "torso");
    await clicEn('[data-mascara-parte="poner"]');
    await poner('select[aria-label="Parte para enmascarar"]', "brazos");
    await clicEn('[data-mascara-parte="sumar"]');
    await poner('input[aria-label="Grosor de la pieza nueva"]', 6);
    await clicEn('.taller3d-extraer');
    const pz = await ev(`(()=>{ const t = __low3d.enTaller(), x = __low3d.personajeDelTaller(); const p = t.piezas[0]; if (!p) return null;
      const m = x.mallaDePieza(p.id), f = m.geometry.userData.fuente, pos = x.posicionesMundo(), V = __low3d.camera.position.constructor, q = new V();
      let s = 0, n = 0; for (let k = 0; k < Math.min(400, f.length); k += 7) { m.getVertexPosition(k, q); q.applyMatrix4(m.matrixWorld); s += q.distanceTo(new V(pos[f[k]*3], pos[f[k]*3+1], pos[f[k]*3+2])); n++; }
      return { id: p.id, n: m.geometry.attributes.position.count, sep: s / n, mascara: t.mascara }; })()`);
    if (!pz || !(pz.n > 500)) mal("no se levantó la pieza de la máscara", pz);
    if (!(pz.sep > 0.003 && pz.sep < 0.012)) mal("la pieza no quedó despegada de la piel su grosor (6 mm)", pz);
    if (pz.mascara !== 0) mal("al levantar la pieza la máscara no se limpió", pz);
    // dibujar sobre la pieza: el trazo se pega y va sobre la tela
    await clicEn('[data-modo="dibujar"]');
    const sobre = await bajo(c0);
    if (!sobre.pieza) mal("PRUEBA MAL ARMADA: el pecho no cae sobre la remera", sobre);
    await arrastrarPx({ x: c0.x - 40, y: c0.y }, { x: c0.x + 40, y: c0.y }, 16);
    const trazo = await ev(`(()=>{ const s = __low3d.strokes.filter(r => !r.personajeDatos && r.parte); return s.length ? { parte: s[s.length - 1].parte } : null; })()`);
    if (!trazo || !/^spine_/.test(trazo.parte)) mal("el trazo sobre la remera no se pegó al pecho", trazo);
    await ctrlZ();
    // la pieza sigue a la pose: la remera del brazo va con el brazo
    await clicEn('[data-modo="posar"]');
    const sep0 = pz.sep;
    const mano0 = await aPantalla(await hueso("hand_l"));
    await arrastrarPx(mano0, { x: mano0.x + 60, y: mano0.y - 160 }, 20);
    const sep1 = await ev(`(()=>{ const x = __low3d.personajeDelTaller(), m = x.mallaDePieza(${JSON.stringify(pz.id)}), f = m.geometry.userData.fuente, pos = x.posicionesMundo(), V = __low3d.camera.position.constructor, q = new V();
      let s = 0, n = 0; for (let k = 0; k < Math.min(400, f.length); k += 7) { m.getVertexPosition(k, q); q.applyMatrix4(m.matrixWorld); s += q.distanceTo(new V(pos[f[k]*3], pos[f[k]*3+1], pos[f[k]*3+2])); n++; } return s / n; })()`);
    if (Math.abs(sep1 - sep0) > 0.003) mal("al posar, la remera se despegó del cuerpo", { sep0, sep1 });
    await ctrlZ();
    // con más definición la pieza pasa (×4 triángulos)
    await clicEn('[data-modo="esculpir"]');
    const tris0 = await ev(`__low3d.personajeDelTaller().mallaDePieza(${JSON.stringify(pz.id)}).geometry.index.count`);
    await ev(`__low3d.setDefinicionTaller(2), true`); await ev(`__low3d.personajesListos()`); await w(400);
    const tris1 = await ev(`(()=>{ const x = __low3d.personajeDelTaller(), p = __low3d.enTaller().piezas[0]; const m = p && x.mallaDePieza(p.id); return m ? m.geometry.index.count : 0; })()`);
    if (!(tris1 > tris0 * 3)) mal("con más definición la pieza no pasó (o no se subdividió)", { tris0, tris1 });
    await ctrlZ(); await ev(`__low3d.personajesListos()`); await w(300);
    await ctrlZ();
    const sinPieza = await ev(`({ n: __low3d.enTaller().piezas.length, m: __low3d.enTaller().mascara })`);
    if (sinPieza.n !== 0 || !(sinPieza.m > 0.05)) mal("Ctrl+Z no sacó la pieza ni devolvió la máscara", sinPieza);
    await tecla("m", "KeyM", 77, 1);
    // (cambiar la definición rehace el cuerpo y vuelve a encuadrarlo: de cerca otra vez)
    await ev(`(()=>{ const c = __low3d.camera, o = __low3d.controls.target; o.set(0, 1.25, 0); c.position.set(0, 1.3, 1.6); c.lookAt(o); __low3d.controls.update(); return true; })()`); await w(200);

    // ── 10. capas de escultura: lo esculpido en la capa se sube y se baja con su dial ──
    await clicEn('.taller3d-nueva-capa');
    const capaId = await ev(`__low3d.enTaller().capaActiva`);
    if (!capaId) mal("«Nueva capa» no quedó elegida", {});
    await letra("x");
    r0 = await reposo();
    await arrastrarPx(desde, hasta, 24);
    r1 = await reposo();
    const en1 = cambioTotal(r0, r1);
    await poner('input[aria-label^="Intensidad de "]', 0); await ev(`__low3d.confirmarVivo(false), true`);
    const r2 = await reposo();
    await poner('input[aria-label^="Intensidad de "]', 0.5); await ev(`__low3d.confirmarVivo(false), true`);
    const r3 = await reposo();
    const datosCapa = await ev(`(()=>{ const d = __low3d.personajeDelTaller().aDatos(); return { principal: !!d.escultura, capas: (d.capas || []).map(c => ({ f: c.fuerza, e: !!c.e })) }; })()`);
    if (!(en1.m > 0.0005)) mal("esculpir en la capa no esculpió", en1);
    if (cambioTotal(r0, r2).m > 5e-5) mal("con el dial de la capa en 0 la piel no volvió", cambioTotal(r0, r2));
    const mitad = cambioTotal(r0, r3).m / en1.m;
    if (!(mitad > 0.4 && mitad < 0.6)) mal("con el dial en 0,5 la capa no quedó a la mitad", { mitad });
    if (datosCapa.principal || !datosCapa.capas[0]?.e) mal("lo esculpido no quedó en la capa (quedó en la principal)", datosCapa);

    // ── 11. filtros: suavizar toda la piel, menos lo enmascarado ──
    await poner('select[aria-label="Parte para enmascarar"]', "cabeza");
    await clicEn('[data-mascara-parte="poner"]');
    const cabeza = await ev(`(()=>{ const M = __low3d.personajeDelTaller().cuerpo.geometry.attributes.mascara.array; const o = []; for (let i = 0; i < M.length; i++) if (M[i] > 0.999) o.push(i); return o; })()`);
    r0 = await reposo();
    await clicEn('[data-filtro="suavizar"]');
    r1 = await reposo();
    if (!(cambioTotal(r0, r1).n > 1000)) mal("el filtro Suavizar no cambió la piel", cambioTotal(r0, r1));
    if (cambio(r0, r1, cabeza) > 1e-6) mal("el filtro movió la cabeza enmascarada", {});
    await ctrlZ();

    // ── 12. huesos de verdad: el codo, la rodilla y el antebrazo girado conservan su grosor ──
    await clicEn('[data-modo="posar"]');
    // el VOLUMEN del miembro alrededor de la articulación (conos desde la articulación a
    // cada triángulo): con el skinning lineal, girar el antebrazo y levantar la pierna
    // perdían el 9 %; con huesos de verdad se conserva (medido)
    const volumen = (art, hs) => ev(`(()=>{ const x = __low3d.personajeDelTaller(), m = x.cuerpo, g = m.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, b = m.skeleton.bones, I = g.index.array;
      const V = __low3d.camera.position.constructor, ks = ${JSON.stringify(hs)}.map(h => b.findIndex(z => z.name === h)), c = x.articulacion(${JSON.stringify(art)}), n = si.count, P = new Float32Array(n * 3), en = new Uint8Array(n), v = new V();
      for (let i = 0; i < n; i++) { let w = 0; for (let q = 0; q < 4; q++) if (ks.includes(si.getComponent(i, q))) w += sw.getComponent(i, q); if (w < 0.5) continue; en[i] = 1;
        m.getVertexPosition(i, v); v.applyMatrix4(m.matrixWorld); P[i*3] = v.x - c.x; P[i*3+1] = v.y - c.y; P[i*3+2] = v.z - c.z; }
      let s = 0; for (let t = 0; t < I.length; t += 3) { const a = I[t], bb = I[t+1], d = I[t+2]; if (!en[a] || !en[bb] || !en[d]) continue;
        s += (P[a*3]*(P[bb*3+1]*P[d*3+2]-P[bb*3+2]*P[d*3+1]) - P[a*3+1]*(P[bb*3]*P[d*3+2]-P[bb*3+2]*P[d*3]) + P[a*3+2]*(P[bb*3]*P[d*3+1]-P[bb*3+1]*P[d*3])) / 6; }
      return s; })()`);
    const prueba = async (c, eje, v, hs) => {
      await ev(`(()=>{ const x = __low3d.personajeDelTaller(); x.ponerDatos({ ...x.aDatos(), pose: {} }); return true; })()`);
      const a = await volumen(c, hs);
      await ev(`__low3d.personajeDelTaller().ponerDial(${JSON.stringify(c)}, ${JSON.stringify(eje)}, ${v}), true`);
      return (await volumen(c, hs)) / a;
    };
    const brazo = ["upperarm_l", "lowerarm_l", "giro_lowerarm_l"];
    const codo = await prueba("lowerarm_l", "doblar", 140, brazo);
    const giro = await prueba("lowerarm_l", "rotar", 85, brazo);
    const rodilla = await prueba("calf_l", "doblar", 130, ["thigh_l", "calf_l"]);
    const cadera = await prueba("thigh_l", "x", -110, ["thigh_l", "pelvis"]);
    const bien = (r) => r > 0.94 && r < 1.2;
    if (!(bien(codo) && bien(giro) && bien(rodilla) && bien(cadera))) mal("la piel no conserva su volumen en las articulaciones (se porta como goma)", { codo, giro, rodilla, cadera });
    // los topes de la cadera: la pierna derecha se abre para su lado
    const d = await ev(`(()=>{ const m = __low3d.personajeDelTaller(); const r = []; for (const c of ["thigh_l", "thigh_r"]) { m.ponerDatos({ ...m.aDatos(), pose: {} }); const a = m.articulacion(c.replace("thigh", "calf")).x; m.ponerDial(c, "z", 40); r.push(m.articulacion(c.replace("thigh", "calf")).x - a); } return r; })()`);
    if (!(d[0] > 0.05 && d[1] < -0.05)) mal("«abrir» la pierna no la abre hacia su lado en las dos piernas", { d });
    await ev(`(()=>{ const x = __low3d.personajeDelTaller(); x.ponerDatos({ ...x.aDatos(), pose: {} }); return true; })()`);

    if (errores.length) mal("errores de la página", errores);
    console.log("OK check_3d_modelado_ui:", JSON.stringify({ espaciado: [+Math.min(...alturas).toFixed(4), +Math.max(...alturas).toFixed(4)], capa: [+capa.una.toFixed(4), +capa.dos.toFixed(4)],
      dibujar: [+dib.una.toFixed(4), +dib.dos.toFixed(4)], mascara: [+m1.toFixed(2), +m2.toFixed(2)], frente: [+conFrente.atras.toFixed(5), +sinFrente.atras.toFixed(5)],
      radio: [+rad0.toFixed(3), +rad1.toFixed(3)], estabilizador: [tembl.n, unToque.n], gancho: dG.map((v) => +v.toFixed(3)), pieza: { n: pz.n, sep: +pz.sep.toFixed(4), sep1: +sep1.toFixed(4), tris: [tris0, tris1] },
      capaMitad: +mitad.toFixed(2), volumen: { codo: +codo.toFixed(3), giro: +giro.toFixed(3), rodilla: +rodilla.toFixed(3), cadera: +cadera.toFixed(3) } }));
  } finally {
    ws.close();
    await fetch(endpoint + "/json/close/" + target.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
