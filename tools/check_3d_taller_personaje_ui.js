/* EL TALLER DE PERSONAJE (v3.38: cuerpos de Quaternius, posar y esculpir). CDP :9223 + mock :8791.

   Pedidos de Mauro: «no me gustan nada los personajes que tenés, quiero algo
   mucho más estilizado y realista… seguro hay bibliotecas libres», «seguí con
   posar al personaje» y «si sólo voy a poder dibujar sobre la forma del
   personaje… tengo que poder modelarlo también».

   Con el mouse de verdad:
   1. Panel «Personaje»: elegir «Mujer» y «Abrir el taller». Llega el cuerpo
      (glb de Quaternius) en pose «Parado», sin líneas de modelo encendidas.
   2. DIBUJAR con espejo sobre el antebrazo izquierdo: dos trazos, cada uno
      pegado a SU antebrazo (el espejado cae sobre el derecho).
   3. POSAR: de frente, agarrar el antebrazo y subirlo dobla el codo; el trazo
      del antebrazo lo sigue y el del otro brazo no se mueve. De perfil, la
      rodilla no se dobla para adelante (bisagra) y sí para atrás.
   4. La pose «Sentado» de fábrica, con los pies en el piso; UN Ctrl+Z vuelve.
   5. Proporciones: piernas más largas con el deslizador; el personaje crece y
      el trazo sigue pegado.
   6. ESCULPIR: inflar con simetría cambia los dos lados; Ctrl+Z lo deshace;
      tirar también modela.
   7. La hoja de modelo del personaje posado.
   8. Guardar: queda en «Mis personajes» con su pose y sus trazos; reabrirlo
      los trae; «Cancelar» no cambia nada.
   9. La colección «Personajes» de fábrica se coloca en un fondo con su alto,
      y el proyecto guarda y abre el personaje. */
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
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const aPantalla = (p) => ev(`(()=>{ const e = __low3d, r = e.canvasElement().getBoundingClientRect(), c = e.camera; c.updateMatrixWorld(true);
    const v = new c.position.constructor(...${JSON.stringify(p)}).project(c); return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height }; })()`);
  const mover = (p, buttons = 0) => send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, buttons, button: buttons ? "left" : "none" });
  const enLienzo = async (p, m) => { const bajo = await ev(`(document.elementFromPoint(${p.x}, ${p.y}) || {}).tagName || "nada"`); if (bajo !== "CANVAS") throw Error("PRUEBA MAL ARMADA: " + JSON.stringify(m) + " cae sobre " + bajo); };
  const arrastrarPx = async (a, b, pasos = 16) => {
    await enLienzo(a, a); await enLienzo(b, b);
    await mover(a); await send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= pasos; i++) { await mover({ x: a.x + (b.x - a.x) * i / pasos, y: a.y + (b.y - a.y) * i / pasos }, 1); await w(15); }
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: b.x, y: b.y, button: "left", buttons: 0, clickCount: 1 }); await w(300);
  };
  const clicEn = async (sel, texto) => {
    const p = await ev(`(()=>{ const b = [...document.querySelectorAll(${JSON.stringify(sel)})].find(b => b.getClientRects().length && (${JSON.stringify(texto || "")} === "" || b.textContent.includes(${JSON.stringify(texto || "")}))); if (!b) return null; b.scrollIntoView({ block: "nearest" }); const r = b.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    if (!p) mal("falta en pantalla: " + sel + " " + (texto || ""), {});
    await mover(p); await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", buttons: 1, clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", buttons: 0, clickCount: 1 }); await w(300);
  };
  const tecla = async (key, code, vk, modifiers = 0) => { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers }); await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers }); await w(300); };
  const hueso = (n) => ev(`__low3d.personajeDelTaller().articulacion(${JSON.stringify(n)}).toArray()`);
  // qué tan lejos queda el centro de cada trazo pegado de su segmento de hueso (hueso → punta)
  const pegados = () => ev(`(()=>{ const e = __low3d, inst = e.personajeDelTaller(), V = e.camera.position.constructor;
    const punta = { lowerarm_l: "hand_l", lowerarm_r: "hand_r", hand_l: "middle_02_l", hand_r: "middle_02_r" };
    return e.strokes.filter(s => !s.personajeDatos && s.parte).map(s => { s.object.updateMatrixWorld(true);
      const c = new V(); s.points.forEach(p => c.add(s.object.localToWorld(p.clone()))); c.multiplyScalar(1 / s.points.length);
      const a = inst.articulacion(s.parte), b = inst.articulacion(punta[s.parte] || s.parte);
      const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, ab.lengthSq() ? c.clone().sub(a).dot(ab) / ab.lengthSq() : 0));
      return { parte: s.parte, lejos: +c.distanceTo(a.clone().addScaledVector(ab, t)).toFixed(3), c: c.toArray().map(v => +v.toFixed(3)) }; }); })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 80; i++) { if (await ev("!!window.__low3d").catch(() => false)) break; await w(250); }
    await ev(`try{localStorage.clear(); localStorage.setItem("low3d:guia-fondos","1")}catch(e){}; location.reload(); true`);
    for (let i = 0; i < 80; i++) { await w(250); if (await ev("!!window.__low3d && !!document.querySelector('[data-panel=\"personaje\"]')").catch(() => false)) break; }
    await ev(`__low3d.newProject(); true`);

    // ── 1. abrir el taller con la mujer ──
    await clicEn('[data-panel="personaje"]');
    await clicEn('[data-cuerpo="mujer"]');
    await clicEn('.taller3d-entrar');
    await ev(`__low3d.personajesListos()`); await w(300);
    const t1 = await ev(`(()=>{ const t = __low3d.enTaller(); const inst = __low3d.personajeDelTaller(); return { t, pose: inst ? Object.keys(inst.datos.pose).length : 0, mallas: inst ? inst.mallas.length : 0 }; })()`);
    if (!t1.t || !t1.t.listo || t1.t.base !== "mujer" || t1.mallas < 2) mal("no llegó el cuerpo de la mujer al taller", t1);
    if (Math.abs(t1.t.alto - 1.76) > 0.12) mal("el alto del cuerpo no es el de una persona", t1.t);
    if (t1.pose < 20) mal("el personaje no arrancó en la pose «Parado» de fábrica", t1);
    if (t1.t.lineas) mal("las líneas de modelo arrancan prendidas (Mauro: «no entiendo para qué tiene tantas líneas»)", t1.t);

    // ── 2. dibujar con espejo sobre el antebrazo izquierdo ──
    await clicEn('[data-vista="0"]');
    await clicEn('.taller3d-ver label', 'Espejo');
    const codo = await hueso("lowerarm_l"), mano = await hueso("hand_l");
    const pA = codo.map((v, i) => v + (mano[i] - v) * 0.3), pB = codo.map((v, i) => v + (mano[i] - v) * 0.7);
    await arrastrarPx(await aPantalla(pA), await aPantalla(pB), 12);
    const t2 = await pegados();
    const izq = t2.find((s) => s.parte === "lowerarm_l"), der = t2.find((s) => s.parte === "lowerarm_r");
    if (t2.length !== 2 || !izq || !der) mal("con espejo no quedaron dos trazos, uno en cada antebrazo", t2);
    if (izq.lejos > 0.07 || der.lejos > 0.07) mal("los trazos no quedaron sobre los antebrazos", t2);

    // ── 3. posar: el codo de frente; la rodilla de perfil ──
    await clicEn('[data-modo="posar"]');
    const antesCodo = await ev(`__low3d.personajeDelTaller().doblez("lowerarm_l")`);
    const derAntes = der.c;
    const desde = await aPantalla(pB), hacia = { x: desde.x, y: desde.y - 110 };
    await arrastrarPx(desde, hacia, 20);
    const t3 = await ev(`(()=>{ const inst = __low3d.personajeDelTaller(); return { control: __low3d.enTaller().control, codo: inst.doblez("lowerarm_l") }; })()`);
    if (t3.control !== "lowerarm_l") mal("agarrar el antebrazo no eligió el codo", t3);
    // (v3.40: el giro es PROPORCIONAL al arrastre, como un armazón de stop motion:
    // ~0,45° por píxel; 110 px suben el codo unos 20-25°, no «apuntan» al cursor)
    if (!(t3.codo > antesCodo + 15)) mal("subir el antebrazo de frente no dobló el codo", { antesCodo, t3 });
    const t3b = await pegados();
    const izq3 = t3b.find((s) => s.parte === "lowerarm_l"), der3 = t3b.find((s) => s.parte === "lowerarm_r");
    if (izq3.lejos > 0.07) mal("el trazo del antebrazo no siguió al codo doblado", t3b);
    if (Math.hypot(...der3.c.map((v, i) => v - derAntes[i])) > 0.01) mal("posar un brazo movió el trazo del otro", { derAntes, der3 });
    // la rodilla, de perfil (la pierna izquierda es la de adelante)
    await clicEn('[data-vista="90"]');
    const rod = await hueso("calf_l"), pie = await hueso("foot_l");
    const enPierna = rod.map((v, i) => v + (pie[i] - v) * 0.6);
    const sp = await aPantalla(enPierna), adelante = await aPantalla([pie[0], pie[1] + 0.15, pie[2] + 0.45]), atras = await aPantalla([pie[0], pie[1] + 0.25, pie[2] - 0.45]);
    await arrastrarPx(sp, adelante, 16);
    const rodAdelante = await ev(`__low3d.personajeDelTaller().doblez("calf_l")`);
    if (rodAdelante > 3) mal("la rodilla se dobló para adelante (es una bisagra)", { rodAdelante });
    const rod2 = await hueso("calf_l"), pie2 = await hueso("foot_l");
    await arrastrarPx(await aPantalla(rod2.map((v, i) => v + (pie2[i] - v) * 0.6)), atras, 16);
    const rodAtras = await ev(`__low3d.personajeDelTaller().doblez("calf_l")`);
    if (!(rodAtras > 25)) mal("tirar el pie para atrás no dobló la rodilla", { rodAtras });

    // ── 4. la pose «Sentado» con los pies en el piso; un Ctrl+Z ──
    const piel = `(()=>{ const inst = __low3d.personajeDelTaller(), p = inst.posicionesMundo(); let mn = Infinity; for (let i = 1; i < p.length; i += 3) mn = Math.min(mn, p[i]); return { min: +mn.toFixed(3), pose: JSON.stringify(inst.datos.pose) }; })()`;
    const antes4 = await ev(piel);
    await ev(`(()=>{ const s = document.querySelector('select[aria-label="Pose de fábrica"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, "sentado"); s.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`);
    await w(300);
    const sentado = await ev(piel);
    if (Math.abs(sentado.min) > 0.01) mal("sentado, lo más bajo del cuerpo no quedó en el piso", sentado.min);
    if (sentado.pose === antes4.pose) mal("la pose «Sentado» no cambió nada", {});
    await tecla("z", "KeyZ", 90, 2);
    const vuelta = await ev(piel);
    if (vuelta.pose !== antes4.pose) mal("UN Ctrl+Z no volvió a la pose anterior", {});
    await tecla("y", "KeyY", 89, 2);

    // ── 5. proporciones: piernas más largas ──
    const alto0 = await ev(`__low3d.enTaller().alto`);
    await ev(`(()=>{ const i = document.querySelector('input[data-prop="piernas"]'); i.scrollIntoView({ block: "center" }); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "1.3");
      i.dispatchEvent(new Event("input", { bubbles: true })); i.dispatchEvent(new Event("change", { bubbles: true })); i.dispatchEvent(new PointerEvent("pointerup", { bubbles: true })); return true; })()`);
    await w(300);
    const t5 = await ev(`({ alto: __low3d.enTaller().alto, piernas: __low3d.enTaller().prop.piernas })`);
    if (!(t5.alto > alto0 + 0.12) || Math.abs(t5.piernas - 1.3) > 0.015) mal("alargar las piernas no hizo más alto al personaje", { alto0, t5 });
    const t5b = await pegados();
    if (t5b.some((s) => s.lejos > 0.07)) mal("con otras proporciones los trazos se despegaron", t5b);

    // ── 6. esculpir: inflar con simetría; Ctrl+Z; tirar ──
    await ev(`__low3d.ponerPose(null); true`); await w(200);
    await clicEn('[data-vista="0"]');
    await clicEn('[data-modo="esculpir"]');
    await clicEn('[data-pincel="inflar"]');
    const panza = await hueso("spine_01");
    const z = await ev(`(()=>{ const inst = __low3d.personajeDelTaller(), p = inst.posicionesMundo(); let z = -Infinity; for (let i = 0; i < p.length; i += 3) if (Math.abs(p[i] - 0.06) < 0.02 && Math.abs(p[i + 1] - ${panza[1]}) < 0.02) z = Math.max(z, p[i + 2]); return z; })()`);
    const ip = await aPantalla([0.06, panza[1], z]);
    await arrastrarPx(ip, { x: ip.x + 4, y: ip.y + 10 }, 8);
    // la escultura se guarda compacta («e1:…»): se cuentan los puntos movidos contra la piel original
    const esc = await ev(`(()=>{ const inst = __low3d.personajeDelTaller(), pos = inst.cuerpo.geometry.attributes.position.array, o = inst.original;
      let n = 0, izq = 0, der = 0; for (let i = 0; i < pos.length; i += 3) { if (Math.hypot(pos[i] - o[i], pos[i + 1] - o[i + 1], pos[i + 2] - o[i + 2]) < 1e-5) continue; n++; if (o[i] > 0.01) izq++; else if (o[i] < -0.01) der++; }
      return { n, izq, der }; })()`);
    if (esc.n < 10) mal("inflar no modeló la piel", esc);
    if (esc.izq < 5 || esc.der < 5 || Math.abs(esc.izq - esc.der) > Math.max(esc.izq, esc.der) * 0.35) mal("con simetría la escultura no quedó de los dos lados", esc);
    await tecla("z", "KeyZ", 90, 2);
    if (await ev(`!!__low3d.personajeDelTaller().aDatos().escultura`)) mal("Ctrl+Z no deshizo la escultura", {});
    await clicEn('[data-pincel="tirar"]');
    await arrastrarPx(ip, { x: ip.x + 25, y: ip.y }, 10);
    if (!(await ev(`!!__low3d.personajeDelTaller().aDatos().escultura`))) mal("«Tirar» no modeló la piel", {});

    // ── 7. la hoja de modelo, posado ──
    await clicEn('[data-modo="posar"]');
    await ev(`__low3d.ponerPose("caminando"); true`);
    const hoja = await ev(`(()=>{ const h = __low3d.hojaDeModelo(240, 360, [0, 90]); if (!h) return null;
      return { nombres: h.vistas.map(v => v.nombre), largo: h.vistas.map(v => v.png.length), lineas: h.lineas.length, distintas: new Set(h.vistas.map(v => v.png)).size }; })()`);
    if (!hoja || hoja.distintas !== 2 || hoja.largo.some((n) => n < 3000) || hoja.lineas < 8) mal("la hoja de modelo del personaje posado no salió", hoja);

    // ── 8. guardar, reabrir, cancelar ──
    const poseGuardada = await ev(`Object.keys(__low3d.personajeDelTaller().datos.pose).length`);
    await ev(`(()=>{ const i = document.querySelector('.taller3d-activo input[aria-label="Nombre del personaje"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(i, "Ana"); i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
    await w(150);
    await clicEn('.taller3d-guardar');
    await w(500);
    const t8 = await ev(`(()=>{ const kits = JSON.parse(localStorage.getItem("low3d:kits") || "[]"); const k = kits.find(x => x.nombre === "Mis personajes"); const p = k && k.piezas.find(x => x.nombre === "Ana");
      const per = p && p.items.find(i => i.personaje);
      return { taller: !!__low3d.enTaller(), pieza: p ? { cat: p.categoria, pose: per ? Object.keys(per.personaje.pose).length : 0, base: per && per.personaje.base, piernas: per && per.personaje.prop.piernas, esc: !!(per && per.personaje.escultura), trazos: p.items.filter(i => !i.personaje && i.parte).length } : null }; })()`);
    if (t8.taller || !t8.pieza || t8.pieza.cat !== "personaje" || t8.pieza.base !== "mujer" || t8.pieza.pose !== poseGuardada || Math.abs(t8.pieza.piernas - 1.3) > 0.015 || !t8.pieza.esc || t8.pieza.trazos !== 2)
      mal("el personaje no quedó en «Mis personajes» con su cuerpo, pose, proporciones, escultura y trazos", { t8, poseGuardada });
    // el panel «Personaje» sigue abierto después de guardar (tocar la pestaña lo cerraría)
    if (!(await ev(`!!document.querySelector(".taller3d")`))) await clicEn('[data-panel="personaje"]');
    const mios = await ev(`[...document.querySelectorAll(".taller3d-mios [data-personaje]")].map(b => b.textContent)`);
    if (mios.join() !== "Ana") mal("«Mis personajes» no lista sólo tus personajes", { mios });
    await clicEn('.taller3d-mios [data-personaje]');
    await ev(`__low3d.personajesListos()`); await w(300);
    const t8b = await ev(`(()=>{ const inst = __low3d.personajeDelTaller(); return { taller: !!__low3d.enTaller(), base: inst && inst.datos.base, pose: inst ? Object.keys(inst.datos.pose).length : 0, esc: !!(inst && inst.aDatos().escultura) }; })()`);
    const t8c = await pegados();
    if (!t8b.taller || t8b.base !== "mujer" || t8b.pose !== poseGuardada || !t8b.esc) mal("al reabrir no volvieron el cuerpo, la pose y la escultura", t8b);
    if (t8c.length !== 2 || t8c.some((s) => s.lejos > 0.08)) mal("al reabrir los trazos no están pegados a los antebrazos", t8c);
    await clicEn('.taller3d-activo .taller3d-cierre button:not(.taller3d-guardar)');
    if (await ev(`!!__low3d.enTaller()`)) mal("«Cancelar» no salió del taller", {});

    // ── 9. la colección «Personajes» en un fondo; el proyecto ──
    const t9 = await ev(`(async()=>{ const e = __low3d;
      document.querySelector('[data-panel="biblioteca"]').click(); await new Promise(r => setTimeout(r, 300));
      const s = document.querySelector('select[aria-label="Escenografía"]'); Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set.call(s, "fabrica-maniquies"); s.dispatchEvent(new Event("change", { bubbles: true }));
      await new Promise(r => setTimeout(r, 400));
      const cartas = [...document.querySelectorAll(".biblio3d-grilla [data-pieza]")].map(b => b.getAttribute("data-pieza"));
      document.querySelector('.biblio3d-grilla [data-pieza="personaje-maniqui-sentado"]').click(); await new Promise(r => setTimeout(r, 200));
      const antes = e.strokes.length; e.colocarPieza(e.getPiezaActiva(), new e.camera.position.constructor(3, 0, 3), { escala: 1, giro: 0, sinVariar: true });
      await e.personajesListos();
      const r = e.strokes.slice(antes).find(x => x.personajeDatos); r.object.updateMatrixWorld(true);
      const box = { min: Infinity, max: -Infinity }; const p = r.personaje.posicionesMundo(); for (let i = 1; i < p.length; i += 3) { box.min = Math.min(box.min, p[i]); box.max = Math.max(box.max, p[i]); }
      const proyecto = JSON.parse(JSON.stringify(e.exportProject())); e.newProject(); const vacio = e.strokes.length;
      e.importProject(proyecto); await e.personajesListos();
      const vuelto = e.strokes.find(x => x.personajeDatos);
      return { cartas, cargado: !!r.personaje, alto: +(box.max - box.min).toFixed(2), piso: +box.min.toFixed(3), vacio,
        vuelto: vuelto ? { cargado: !!vuelto.personaje, base: vuelto.personajeDatos.base, pose: Object.keys(vuelto.personajeDatos.pose).length } : null }; })()`);
    if (t9.cartas.filter((c) => c.startsWith("personaje-")).length < 7) mal("la colección «Personajes» no trae los de fábrica", t9);
    if (!t9.cargado || Math.abs(t9.alto - 1.3) > 0.25 || Math.abs(t9.piso) > 0.02) mal("el maniquí sentado no se colocó en el fondo con su alto, apoyado en el piso", t9);
    if (t9.vacio !== 0 || !t9.vuelto || !t9.vuelto.cargado || t9.vuelto.base !== "maniqui" || t9.vuelto.pose < 20) mal("el proyecto no guardó/abrió el personaje con su pose", t9);

    if (errores.length) mal("errores de la página", errores);
    console.log("OK check_3d_taller_personaje_ui:", JSON.stringify({ t1: { alto: +t1.t.alto.toFixed(2), pose: t1.pose }, codo: +t3.codo.toFixed(0), rodilla: [+rodAdelante.toFixed(0), +rodAtras.toFixed(0)], esc, hoja: hoja.nombres, t8: t8.pieza, t9: { alto: t9.alto, cartas: t9.cartas.length } }));
  } finally {
    ws.close();
    await fetch(endpoint + "/json/close/" + target.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
