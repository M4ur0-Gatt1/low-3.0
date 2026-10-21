/* LA CARA, LA CONTEXTURA, LAS MANOS Y LOS LÍMITES DE LA CABEZA (v3.40). CDP :9223 + mock :8791.

   Pedidos de Mauro: «quiero modelos más variados, no sólo este físico culturista,
   quiero flacos gordos», «quiero poder cambiar ojos boca abrir cerrar», «el
   movimiento de la cabeza está pésimo… más parecido a un rigging de stop motion,
   más control de movimientos sutiles», «la cabeza nunca puede estar ahí!!»,
   «quiero elegir el diámetro de las formas con un dial», «manejadores para manos,
   tamaños de manos y pies».

   Con el mouse y el teclado de verdad:
   1. Cara: «Risa» abre la boca SIN colmillos (ningún borde de la piel se estira
      más de 2,5 cm) y Ctrl+Z la cierra; «Dormido» cierra los ojos y las cejas no
      se arrastran; el dial de la boca con las flechas la abre.
   2. Manos: «Puño» cierra los dedos de esa mano sola; «Abierta» los abre.
   3. Cabeza: arrastrarla 700 px para cada lado (y en diagonal) nunca la saca de
      los topes de un cuello de verdad; con Shift el mismo arrastre gira menos
      (ajuste fino); la flecha la gira de a 2°. El brazo arrastrado para arriba
      llega a vertical con el hombro subiendo, y no cruza sobre la cabeza.
   4. Contextura: «Gordo» ensancha la panza, «Flaco» la afina, Ctrl+Z vuelve.
   5. Diales: el grosor del brazo lo engorda; el tamaño de la mano la agranda. */
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
    await clicEn('[data-modo="posar"]');
    await clicEn('[data-vista="0"]');
    const ctrlZ = () => tecla("z", "KeyZ", 90, 2);
    // flechas sobre un deslizador enfocado (como con el teclado): cambia y confirma
    const flechas = async (sel, n, key = "ArrowRight", vk = 39) => {
      await ev(`(()=>{ const i = document.querySelector(${JSON.stringify(sel)}); i.scrollIntoView({ block: "center" }); i.focus(); return true; })()`);
      for (let k = 0; k < n; k++) { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code: key, windowsVirtualKeyCode: vk }); await send("Input.dispatchKeyEvent", { type: "keyUp", key, code: key, windowsVirtualKeyCode: vk }); await w(40); }
      await w(250);
    };
    // la piel: el borde que más se estiró respecto de la piel de fábrica, en la cabeza
    const estiron = () => ev(`(()=>{ const x = __low3d.personajeDelTaller(), g = x.cuerpo.geometry, P = g.attributes.position.array, I = g.index.array, B = x.original;
      let alto = 0; for (let i = 1; i < P.length; i += 3) alto = Math.max(alto, P[i]);
      let max = 0; const d = (A, a, b) => Math.hypot(A[a*3]-A[b*3], A[a*3+1]-A[b*3+1], A[a*3+2]-A[b*3+2]);
      for (let t = 0; t < I.length; t += 3) for (let c = 0; c < 3; c++) { const a = I[t+c], b = I[t+(c+1)%3]; if (P[a*3+1] < alto * 0.85) continue; max = Math.max(max, d(P, a, b) - d(B, a, b)); }
      return max; })()`);
    // el labio de abajo, adelante en el medio: un punto fijo de la piel (cuánto baja al abrir)
    const iLabio = await ev(`(()=>{ const g = __low3d.personajeDelTaller().cuerpo.geometry, P = g.attributes.position.array, L = g.attributes.labio.array, b = g.userData.boca;
      let mejor = -1, z = -1; for (let i = 0; i < L.length; i++) if (L[i] > 0.99 && Math.abs(P[i*3]) < 0.003 && Math.abs(P[i*3+1] - b.labioY) < 0.006 && P[i*3+2] > z) { z = P[i*3+2]; mejor = i; } return mejor; })()`);
    const labioAbajo = () => ev(`__low3d.personajeDelTaller().cuerpo.geometry.attributes.position.array[${iLabio} * 3 + 1]`);

    // ── 1. la cara ──
    const sinGesto = await estiron(), boca0 = await labioAbajo();
    await clicEn('[data-expresion="risa"]');
    const t1 = await ev(`__low3d.enTaller().cara`), boca1 = await labioAbajo(), est1 = await estiron();
    if (!(t1.boca > 0.4)) mal("«Risa» no abrió la boca", t1);
    if (!(boca0 - boca1 > 0.004)) mal("la boca no se abrió de verdad (el labio de abajo no bajó)", { boca0, boca1 });
    if (est1 > 0.025) mal("al abrir la boca la piel se estira en colmillos", { est1 });
    await ctrlZ();
    const t1b = await ev(`__low3d.enTaller().cara`);
    if (t1b && t1b.boca > 0.01) mal("Ctrl+Z no cerró la boca", t1b);
    // (la malla de pelo trae cejas y pestañas: las pestañas, a la altura del ojo, bajan con el
    // párpado; las cejas, arriba, se tienen que quedar)
    const cejaAlta = await ev(`(()=>{ const x = __low3d.personajeDelTaller(), o = x.ojos.centros[0]; return o.c.y + o.r * 0.6; })()`);
    const cejas0 = await ev(`Array.from(__low3d.personajeDelTaller().cejasMalla.malla.geometry.attributes.position.array)`);
    await clicEn('[data-expresion="dormido"]');
    const t1c = await ev(`__low3d.enTaller().cara`);
    const cejas1 = await ev(`Array.from(__low3d.personajeDelTaller().cejasMalla.malla.geometry.attributes.position.array)`);
    let cejaMov = 0; for (let i = 1; i < cejas0.length; i += 3) if (cejas0[i] > cejaAlta) cejaMov = Math.max(cejaMov, Math.abs(cejas1[i] - cejas0[i]));
    if (!(t1c.ojoI > 0.9 && t1c.ojoD > 0.9)) mal("«Dormido» no cerró los ojos", t1c);
    if (cejaMov > 0.004) mal("al cerrar los ojos el párpado arrastró las cejas", { cejaMov });
    await clicEn('[data-expresion="neutral"]');
    await flechas('[data-cara="boca"]', 20);
    const t1d = await ev(`__low3d.enTaller().cara`);
    if (!(t1d.boca > 0.3)) mal("el dial de la boca con las flechas no la abrió", t1d);
    await clicEn('[data-expresion="neutral"]');

    // ── 2. las manos ── (la pose «Parado» de fábrica ya las trae cerradas: primero se abren)
    await clicEn('[data-mano="r:abierta"]');
    await clicEn('[data-mano="l:abierta"]');
    const t2a = await ev(`__low3d.enTaller().manos`);
    if (t2a.l.cerrar > 0.05 || t2a.r.cerrar > 0.05) mal("«Abierta» no abrió las manos", t2a);
    await clicEn('[data-mano="l:puno"]');
    const t2 = await ev(`__low3d.enTaller().manos`);
    if (!(t2.l.cerrar > 0.9 && t2.l.pulgar > 0.9)) mal("«Puño» no cerró la mano izquierda", t2);
    if (t2.r.cerrar > 0.6) mal("«Puño» de la izquierda cerró también la derecha", t2);
    await clicEn('[data-mano="l:senalar"]');
    const t2b = await ev(`__low3d.enTaller().manos`);
    if (!(t2b.l.cerrar > 0.9 && t2b.l.indice < 0.1)) mal("«Señalar» no dejó el índice estirado con los demás dedos cerrados", t2b);

    // ── 3. la cabeza: topes de un cuello de verdad, ajuste fino ──
    const sinPose = () => ev(`(()=>{ const x = __low3d.personajeDelTaller(); x.ponerDatos({ ...x.aDatos(), pose: {} }); return true; })()`);
    const cabeza = async () => { const h = await hueso("Head"); return aPantalla([h[0], h[1] + 0.09, h[2] + 0.05]); };
    const dial = () => ev(`__low3d.personajeDelTaller().dialesValores("Head")`);
    const dentro = (v) => v.x >= -55.5 && v.x <= 50.5 && v.y >= -76.5 && v.y <= 76.5 && v.z >= -34.5 && v.z <= 34.5;
    const extremos = [];
    for (const [dx, dy] of [[0, 700], [0, -700], [700, 0], [-700, 0], [500, 500], [-500, -500]]) {
      await sinPose();
      const a = await cabeza();
      const b = { x: Math.max(80, Math.min(950, a.x + dx)), y: Math.max(80, Math.min(690, a.y + dy)) };
      await arrastrarPx(a, b, 30);
      const v = await dial(); extremos.push(v);
      if ((await ev(`__low3d.enTaller().control`)) !== "Head") mal("agarrar la cabeza no eligió la cabeza", { a });
      if (!dentro(v)) mal("la cabeza quedó fuera de los topes de un cuello", { dx, dy, v });
      // arrastrar derecho para abajo o para arriba es asentir: no puede terminar girada al costado
      if (dx === 0 && (Math.abs(v.y) > 8 || Math.abs(v.z) > 8)) mal("arrastrar la cabeza para " + (dy > 0 ? "abajo" : "arriba") + " la giró al costado", { dy, v });
    }
    const movio = extremos.some((v) => Math.abs(v.x) > 20) && extremos.some((v) => Math.abs(v.y) > 20 || Math.abs(v.z) > 20);
    if (!movio) mal("arrastrar la cabeza no la movió", extremos);
    // ajuste fino: con Shift el mismo arrastre gira menos
    await sinPose();
    let a = await cabeza(); await arrastrarPx(a, { x: a.x, y: a.y + 60 }, 12);
    const normal = await dial();
    await sinPose();
    a = await cabeza(); await arrastrarPx(a, { x: a.x, y: a.y + 60 }, 12, 8);
    const fino = await dial();
    const mag = (v) => Math.hypot(v.x, v.y, v.z);
    if (!(mag(normal) > 8 && mag(fino) < mag(normal) * 0.5 && mag(fino) > 0.5)) mal("con Shift el giro de la cabeza no es más fino", { normal, fino });
    const antesFlecha = await dial();
    await tecla("ArrowUp", "ArrowUp", 38);
    const conFlecha = await dial();
    const paso = mag({ x: conFlecha.x - antesFlecha.x, y: conFlecha.y - antesFlecha.y, z: conFlecha.z - antesFlecha.z });
    if (!(paso > 1 && paso < 3.5)) mal("la flecha no giró la cabeza de a 2°", { antesFlecha, conFlecha });

    // el brazo: arrastrado para arriba sin parar, llega a vertical (la clavícula sube
    // con él) y nunca pasa por encima de la cabeza al otro lado
    await sinPose();
    const ua = await hueso("upperarm_l"), la = await hueso("lowerarm_l");
    const pBrazo = await aPantalla(ua.map((v, i) => v + (la[i] - v) * 0.5));
    await arrastrarPx(pBrazo, { x: pBrazo.x, y: 80 }, 30);
    const brazo = await ev(`(()=>{ const x = __low3d.personajeDelTaller(); return { control: __low3d.enTaller().control, mano: x.articulacion("hand_l").toArray(), cabeza: x.articulacion("Head").toArray(), hombro: x.articulacion("upperarm_l").toArray(), clav: x.dialesValores("clavicle_l") }; })()`);
    if (brazo.control !== "upperarm_l") mal("agarrar el brazo no eligió el hombro", brazo);
    if (Math.sign(brazo.mano[0] - brazo.cabeza[0]) !== Math.sign(brazo.hombro[0] - brazo.cabeza[0])) mal("el brazo pasó por encima de la cabeza al otro lado", brazo);
    if (!(brazo.mano[1] > brazo.hombro[1] + 0.3)) mal("arrastrar el brazo para arriba no lo levantó", brazo);
    if (!(Math.hypot(brazo.clav.x, brazo.clav.y, brazo.clav.z) > 8)) mal("con el brazo arriba el hombro (clavícula) no subió", brazo);

    // ── 4. la contextura ──
    // la panza: profundidad (z) y ancho (x) de la piel en reposo a la altura de spine_01
    const panza = () => ev(`(()=>{ const x = __low3d.personajeDelTaller(), P = x.base(), g = x.cuerpo.geometry, SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bones = x.cuerpo.skeleton.bones;
      const k = bones.findIndex(b => b.name === "spine_01"); let zmax = -1, zmin = 1, xmax = 0;
      for (let i = 0; i < SI.count; i++) for (let c = 0; c < 4; c++) if (SI.getComponent(i, c) === k && SW.getComponent(i, c) > 0.6) { zmax = Math.max(zmax, P[i*3+2]); zmin = Math.min(zmin, P[i*3+2]); xmax = Math.max(xmax, Math.abs(P[i*3])); }
      return { prof: zmax - zmin, ancho: xmax }; })()`);
    const p0 = await panza();
    await clicEn('[data-contextura="gordo"]');
    const pG = await panza();
    await ctrlZ();
    const pZ = await panza();
    await clicEn('[data-contextura="flaco"]');
    const pF = await panza();
    if (!(pG.prof > p0.prof * 1.12)) mal("«Gordo» no ensanchó la panza", { p0, pG });
    if (!(pF.ancho < p0.ancho * 0.97)) mal("«Flaco» no afinó la cintura", { p0, pF });
    if (Math.abs(pZ.prof - p0.prof) > 0.003) mal("Ctrl+Z no deshizo la contextura", { p0, pZ });
    await clicEn('[data-contextura="normal"]');

    // ── 5. los diales: grosor del brazo, tamaño de la mano ──
    // el radio del brazo en reposo: la distancia media de su piel al centro de su sección
    const radio = () => ev(`(()=>{ const x = __low3d.personajeDelTaller(), g = x.cuerpo.geometry, P = x.base(), SI = g.attributes.skinIndex, SW = g.attributes.skinWeight, bones = x.cuerpo.skeleton.bones;
      const k = bones.findIndex(b => b.name === "upperarm_l"); const L = [];
      for (let i = 0; i < SI.count; i++) for (let c = 0; c < 4; c++) if (SI.getComponent(i, c) === k && SW.getComponent(i, c) > 0.9) L.push(i);
      let cy = 0, cz = 0; for (const i of L) { cy += P[i*3+1]; cz += P[i*3+2]; } cy /= L.length; cz /= L.length;
      let r = 0; for (const i of L) r += Math.hypot(P[i*3+1] - cy, P[i*3+2] - cz); return r / L.length; })()`);
    const r0 = await radio();
    await flechas('[data-grosor="brazo"]', 15);
    const r1 = await radio();
    if (!(r1 > r0 * 1.12)) mal("el dial de grosor no engordó el brazo", { r0, r1 });
    const escMano = () => ev(`(()=>{ const x = __low3d.personajeDelTaller(), V = x.raiz.position.constructor; return x.huesos.get("hand_l").getWorldScale(new V()).x / x.huesos.get("lowerarm_l").getWorldScale(new V()).x; })()`);
    const m0 = await escMano();
    await flechas('[data-prop="manos"]', 15);
    const m1 = await escMano();
    if (!(m1 > m0 * 1.15)) mal("el dial del tamaño de la mano no la agrandó", { m0, m1 });

    if (errores.length) mal("errores de la página", errores);
    console.log("OK check_3d_cara_cuerpo_ui:", JSON.stringify({ boca: +(boca0 - boca1).toFixed(4), estiron: [+sinGesto.toFixed(4), +est1.toFixed(4)], cejas: +cejaMov.toFixed(4),
      cabeza: extremos.map((v) => [Math.round(v.x), Math.round(v.y), Math.round(v.z)]), fino: [+mag(normal).toFixed(1), +mag(fino).toFixed(1)], flecha: +paso.toFixed(2),
      panza: [+p0.prof.toFixed(3), +pG.prof.toFixed(3), +pF.ancho.toFixed(3)], brazo: [+r0.toFixed(4), +r1.toFixed(4)], mano: [+m0.toFixed(2), +m1.toFixed(2)] }));
  } finally {
    ws.close();
    await fetch(endpoint + "/json/close/" + target.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
