/* LOS CONJUNTOS DE CONTROLES NO ADIVINAN A QUE PIEZA VAN.  (C05)
   CDP :9223 + mock :8791.

   POR QUE EXISTE ESTE RECORRIDO. El plan pide conjuntos reutilizables «con
   vinculacion explicita a cada personaje». La parte facil de incumplir es la
   segunda: es comodo aplicar adivinando por el nombre y avisar despues. No
   alcanza — un control colgado de ninguna pieza SE MUEVE Y NO PASA NADA, y el
   que anima no tiene como saber por que. Por eso lo que se prueba es:

   1. El mapa rol→pieza esta A LA VISTA, con un desplegable por rol.
   2. Con algo sin vincular, APLICAR ESTA APAGADO y el panel dice que falta.
   3. «Sugerir» completa lo que reconoce, pero se puede corregir a mano.
   4. Aplicado deja los controles Y el juego de vistas de cada pieza, vacio,
      esperando los dibujos.
   5. Aplicar de nuevo no duplica.

   Un panel que aplique igual pasa (1), (3) y (4) y rompe la regla en (2), que
   es la que el plan pide cuidar. */
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
  const ev = async (expr) => { const r = await send("Runtime.evaluate",
    { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('typeof dzDocInit==="function" && !!LOW?.rigging?.controlSetsUI && !!api').catch(() => false);
    if (listo === true) break;
    await w(400);
  }

  const r = await ev(`(async()=>{
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit();
    if (typeof closeL3d==="function") closeL3d();
    await wait(400);
    if (!DZ.rigMode && typeof dzRigToggle==="function") dzRigToggle();
    await wait(300);
    const d = DZ.doc;
    for (const [id, name] of [["ojo_l","Ojo izquierdo"],["ojo_r","Ojo derecho"]])
      d.ensureRigBone(id, { name });
    LOW.rigging.controlSetsUI.wire(); LOW.rigging.controlSetsUI.sync();
    await wait(150);

    const salida = { panel: !!document.querySelector(".rig2-conjuntos") };
    const aviso = () => document.querySelector("#rigConjAviso").textContent;
    const selects = () => [...document.querySelectorAll("#rigConjMapa select")];
    document.querySelector("#rigConjLista").value = "ojos";
    document.querySelector("#rigConjLista").dispatchEvent(new Event("change",{bubbles:true}));
    await wait(150);

    salida.roles = selects().map(s => s.dataset.rol);
    salida.opcionesPrimerRol = [...selects()[0].options].map(o => o.textContent);
    salida.sinVincular = aviso();
    salida.aplicarApagado = document.querySelector("#rigConjAplicar").disabled;

    // vincular UNO solo: sigue apagado
    selects()[0].value = "ojo_l";
    selects()[0].dispatchEvent(new Event("change",{bubbles:true}));
    await wait(150);
    salida.conUnoApagado = document.querySelector("#rigConjAplicar").disabled;
    salida.diceCualFalta = aviso();

    // sugerir completa lo que reconoce
    document.querySelector("#rigConjSugerir").click(); await wait(200);
    salida.trasSugerir = selects().map(s => s.value);
    salida.aplicarHabilitado = !document.querySelector("#rigConjAplicar").disabled;

    // aplicar
    document.querySelector("#rigConjAplicar").click(); await wait(300);
    salida.controles = Object.keys(d.scene.rig.controls || {}).length;
    salida.juegos = Object.keys(d.scene.rig.viewSets || {}).length;
    const juego = Object.values(d.scene.rig.viewSets || {})[0];
    salida.juegoVacio = !!juego && juego.views.length === 0;
    salida.anotado = d.controlSetsAplicados().length;

    // aplicar de nuevo no duplica
    document.querySelector("#rigConjAplicar").click(); await wait(300);
    salida.trasAplicarDosVeces = Object.keys(d.scene.rig.controls || {}).length;
    return salida;
  })()`);

  if (!r.panel) mal("no existe el panel de conjuntos", r);
  if (!r.roles || r.roles.length !== 2) mal("el mapa rol→pieza no está a la vista", r);
  if (!r.opcionesPrimerRol.some((t) => /sin vincular/i.test(t)))
    mal("no se puede dejar un rol sin vincular a propósito", r);
  // LA QUE EL PLAN PIDE CUIDAR
  if (!r.aplicarApagado) mal("se puede aplicar SIN vincular ninguna pieza: el conjunto estaría adivinando", r);
  if (!r.conUnoApagado) mal("se puede aplicar con un rol a medias: quedarían controles colgados", r);
  if (!/[Ff]alta/.test(r.diceCualFalta)) mal("el panel no dice qué falta vincular", r);
  if (!r.trasSugerir.every(Boolean)) mal("«sugerir» no completó los roles que sí reconoce por nombre", r);
  if (!r.aplicarHabilitado) mal("con el mapa completo, aplicar sigue apagado", r);
  if (r.controles !== 4) mal("aplicar no creó los controles del conjunto", r);
  if (r.juegos !== 2) mal("aplicar no dejó el juego de vistas de cada pieza", r);
  if (!r.juegoVacio) mal("el juego de vistas no nació vacío: estaría inventando dibujos", r);
  if (r.anotado !== 1) mal("no queda anotado qué conjunto se aplicó", r);
  if (r.trasAplicarDosVeces !== r.controles) mal("aplicar dos veces duplicó los controles", r);

  const crasheos = errores.filter(e => /TypeError|ReferenceError/.test(String(e)));
  if (crasheos.length) mal("el panel tiró errores", crasheos.slice(0, 3));

  console.log("E2E conjuntos de controles OK " + JSON.stringify(r));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
