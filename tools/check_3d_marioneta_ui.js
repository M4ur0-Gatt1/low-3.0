/* LA MARIONETA, LA ACTUACIÓN Y LA ESCULTURA PRECISA (v3.39). CDP :9223 + mock :8791.

   Pedido de Mauro: «falta que sean monigotes marionetas ya rigueados para
   posar en las diferentes actuaciones del personaje, y quiero mejores
   herramientas 3D y más malla para tener más definición… tiene que poder
   modelarse con mucha más precisión».

   Con el mouse y el teclado de verdad:
   1. Posar: arrastrar el ANILLO de la mano lleva la mano adonde se suelta (IK:
      el codo se acomoda solo); arrastrar el CUADRADO de la cadera hacia abajo
      agacha el cuerpo con los PIES QUIETOS.
   2. Actuación: «Clave aquí» en el cuadro 1; en el cuadro 12 se mueve la mano y
      queda clave sola; el cuadro 6 está ENTRE las dos; «Reproducir» avanza.
   3. Una animación de la biblioteca («Caminar») desde el cuadro 13: una clave
      por cuadro, y la pierna cambia de un cuadro al otro.
   4. Definición «Alta»: 4 veces la malla; un surco con el mouse modela la piel;
      Ctrl+Z lo deshace; [ achica el pincel.
   5. Guardar: el personaje vuelve con su actuación y su definición.
   6. En la escena, la toma lleva al personaje por su actuación (cuadro a cuadro). */
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

    // ── 1. la marioneta: la mano y la cadera ──
    const mano0 = await hueso("hand_l"), codo0 = await ev(`__low3d.personajeDelTaller().doblez("lowerarm_l")`);
    const anillo = await aPantalla(mano0), soltar = { x: anillo.x + 40, y: anillo.y - 150 };
    await arrastrarPx(anillo, soltar, 20);
    const meta = await enPlano(soltar, mano0), mano1 = await hueso("hand_l");
    const t1 = await ev(`({ control: __low3d.enTaller().control, codo: __low3d.personajeDelTaller().doblez("lowerarm_l") })`);
    if (t1.control !== "hand_l") mal("agarrar el anillo de la mano no eligió la mano", t1);
    if (dist(mano1, meta) > 0.01) mal("la mano no fue adonde se soltó el anillo (IK)", { mano1, meta, d: dist(mano1, meta) });
    if (!(t1.codo > codo0 + 20)) mal("al subir la mano el codo no se dobló solo", { codo0, t1 });
    const pieL0 = await hueso("foot_l"), pieR0 = await hueso("foot_r"), cad0 = await hueso("pelvis");
    const cuadrado = await aPantalla(cad0);
    await arrastrarPx(cuadrado, { x: cuadrado.x, y: cuadrado.y + 70 }, 16);
    const cad1 = await hueso("pelvis"), pieL1 = await hueso("foot_l"), pieR1 = await hueso("foot_r");
    if (!(cad0[1] - cad1[1] > 0.12)) mal("arrastrar la cadera hacia abajo no agachó el cuerpo", { cad0, cad1 });
    if (dist(pieL0, pieL1) > 0.005 || dist(pieR0, pieR1) > 0.005) mal("al agacharse los pies se movieron (tienen que quedar quietos)", { pieL0, pieL1, pieR0, pieR1 });
    const rodillas = await ev(`[__low3d.personajeDelTaller().doblez("calf_l"), __low3d.personajeDelTaller().doblez("calf_r")]`);
    if (!(rodillas[0] > 30 && rodillas[1] > 30)) mal("agachado, las rodillas no se doblaron", rodillas);
    await tecla("z", "KeyZ", 90, 2);
    const cadZ = await hueso("pelvis");
    if (dist(cadZ, cad0) > 0.002) mal("Ctrl+Z no deshizo la cadera de un paso", { cadZ, cad0 });

    // ── 2. la actuación: claves y entre-cuadros ──
    await clicEn('.taller3d-clave');
    const c1 = await ev(`__low3d.enTaller().claves`);
    if (c1.join() !== "1") mal("«Clave aquí» no dejó clave en el cuadro 1", c1);
    await poner('input[aria-label="Cuadro de la actuación"]', 12); await w(200);
    const manoA = await hueso("hand_l");
    const anillo2 = await aPantalla(manoA);
    await arrastrarPx(anillo2, { x: anillo2.x + 60, y: anillo2.y + 90 }, 16);
    const c2 = await ev(`({ claves: __low3d.enTaller().claves, cuadro: __low3d.enTaller().cuadro })`);
    if (c2.claves.join() !== "1,12" || c2.cuadro !== 12) mal("posar en el cuadro 12 no dejó clave sola", c2);
    const manoB = await hueso("hand_l");
    await poner('input[aria-label="Cuadro de la actuación"]', 6); await w(200);
    const manoM = await hueso("hand_l");
    const dA = dist(manoM, manoA), dB = dist(manoM, manoB), dAB = dist(manoA, manoB);
    if (!(dA > dAB * 0.2 && dB > dAB * 0.2)) mal("en el cuadro 6 la mano no está entre las dos claves", { dA, dB, dAB });
    await poner('input[aria-label="Cuadro de la actuación"]', 1); await w(150);
    if (dist(await hueso("hand_l"), manoA) > 0.002) mal("volver al cuadro 1 no volvió a la pose de la clave", {});
    await clicEn('.taller3d-play'); await w(700);
    const play = await ev(`({ r: __low3d.enTaller().reproduciendo, f: __low3d.enTaller().cuadro })`);
    await clicEn('.taller3d-play');
    if (!play.r || play.f === 1) mal("«Reproducir» no avanzó los cuadros", play);

    // ── 3. una animación de la biblioteca ──
    await poner('input[aria-label="Cuadro de la actuación"]', 13); await w(150);
    await poner('select[aria-label="Animación de la biblioteca"]', "Walk_Loop"); await w(100);
    await clicEn('.taller3d-animacion'); await w(500);
    const anim = await ev(`(()=>{ const t = __low3d.enTaller(); return { n: t.claves.filter(f => f >= 13).length, cuadros: t.cuadros }; })()`);
    if (anim.n < 20) mal("«Caminar» no dejó una clave por cuadro desde el 13", anim);
    await poner('input[aria-label="Cuadro de la actuación"]', 14); await w(150);
    const pie14 = await hueso("foot_l");
    await poner('input[aria-label="Cuadro de la actuación"]', 22); await w(150);
    const pie22 = await hueso("foot_l");
    if (dist(pie14, pie22) < 0.05) mal("caminando, el pie no cambió de lugar entre cuadros", { pie14, pie22 });

    // ── 4. la definición y la escultura precisa ──
    await clicEn('[data-modo="esculpir"]');
    await poner('select[aria-label="Definición de la piel"]', 1); await w(1200);
    const tris = await ev(`__low3d.enTaller().triangulos`);
    if (!(tris > 45000)) mal("la definición «Alta» no cuadruplicó la malla", { tris });
    await ev(`__low3d.ponerPose(null); __low3d.setCuadroTaller(1); true`);
    await clicEn('[data-vista="0"]');
    await clicEn('[data-pincel="surco"]');
    await poner('input[aria-label="Tamaño del pincel"]', 1.5); await w(100);
    const radio0 = await ev(`__low3d.enTaller().pincel.radio`);
    await tecla("[", "BracketLeft", 219);
    const radio1 = await ev(`__low3d.enTaller().pincel.radio`);
    if (!(radio1 < radio0)) mal("[ no achicó el pincel", { radio0, radio1 });
    const panza = await hueso("spine_01");
    const zf = await ev(`(()=>{ const p = __low3d.personajeDelTaller().posicionesMundo(); let z = -Infinity; for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i]) < 0.02 && Math.abs(p[i + 1] - ${panza[1] + 0.05}) < 0.02) z = Math.max(z, p[i + 2]); return z; })()`);
    const a0 = await aPantalla([-0.05, panza[1] + 0.05, zf]), a1 = await aPantalla([0.05, panza[1] + 0.05, zf]);
    await arrastrarPx(a0, a1, 24);
    const esc = await ev(`!!__low3d.personajeDelTaller().aDatos().escultura`);
    if (!esc) mal("el surco con el mouse no modeló la piel", {});
    await tecla("z", "KeyZ", 90, 2);
    if (await ev(`!!__low3d.personajeDelTaller().aDatos().escultura`)) mal("Ctrl+Z no deshizo el surco", {});
    await arrastrarPx(a0, a1, 24);

    // ── 5. guardar y volver ──
    const actGuardada = await ev(`__low3d.enTaller().claves.length`);
    await ev(`(()=>{ const i = document.querySelector('.taller3d-activo input[aria-label="Nombre del personaje"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "Tito"); i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
    await w(150);
    await clicEn('.taller3d-guardar'); await w(600);
    const t5 = await ev(`(()=>{ const kits = JSON.parse(localStorage.getItem("low3d:kits") || "[]"); const k = kits.find(x => x.nombre === "Mis personajes"); const p = k && k.piezas.find(x => x.nombre === "Tito");
      const per = p && p.items.find(i => i.personaje); return per ? { claves: per.personaje.actuacion ? per.personaje.actuacion.claves.length : 0, definicion: per.personaje.definicion, esc: typeof per.personaje.escultura } : null; })()`);
    if (!t5 || t5.claves !== actGuardada || t5.definicion !== 1 || t5.esc !== "string") mal("el personaje no se guardó con su actuación, su definición y la escultura compacta", { t5, actGuardada });
    if (!(await ev(`!!document.querySelector(".taller3d")`))) await clicEn('[data-panel="personaje"]');
    await clicEn('.taller3d-mios [data-personaje]');
    await ev(`__low3d.personajesListos()`); await w(300);
    const t5b = await ev(`({ claves: __low3d.enTaller().claves.length, tris: __low3d.enTaller().triangulos, esc: !!__low3d.personajeDelTaller().aDatos().escultura })`);
    if (t5b.claves !== actGuardada || !(t5b.tris > 45000) || !t5b.esc) mal("al reabrir no volvieron la actuación, la definición o la escultura", t5b);
    await clicEn('.taller3d-activo .taller3d-cierre button:not(.taller3d-guardar)');

    // ── 6. en la escena, la toma lleva al personaje por su actuación ──
    const t6 = await ev(`(async()=>{ const e = __low3d, kits = JSON.parse(localStorage.getItem("low3d:kits") || "[]");
      const p = kits.find(x => x.nombre === "Mis personajes").piezas.find(x => x.nombre === "Tito");
      e.colocarPieza(p, new e.camera.position.constructor(0, 0, 0), { escala: 1, giro: 0, sinVariar: true });
      await e.personajesListos();
      const r = e.strokes.find(x => x.personaje), pie = () => r.personaje.articulacion("foot_l").toArray();
      e.tomaIr(14); const a = pie(); e.tomaIr(22); const b = pie();
      return { a, b }; })()`);
    if (dist(t6.a, t6.b) < 0.05) mal("en la escena, la toma no lleva al personaje por su actuación", t6);

    if (errores.length) mal("errores de la página", errores);
    console.log("OK check_3d_marioneta_ui:", JSON.stringify({ ik: +dist(mano1, meta).toFixed(4), codo: [+codo0.toFixed(0), +t1.codo.toFixed(0)], agachado: +(cad0[1] - cad1[1]).toFixed(3),
      rodillas: rodillas.map((v) => +v.toFixed(0)), claves: actGuardada, tris, radio: [radio0, +radio1.toFixed(4)] }));
  } finally {
    ws.close();
    await fetch(endpoint + "/json/close/" + target.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
