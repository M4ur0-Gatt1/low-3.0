/* EL GIRO DE CABEZA SE ARMA CON DIBUJOS, Y EL PANEL NO PROMETE LO QUE FALTA.
   CDP :9223 + mock :8791.  (C04)

   POR QUE EXISTE ESTE RECORRIDO. El plan de trabajo pide el giro de cabeza con
   vistas dibujadas y agrega una prohibicion explicita: «no presentar un giro
   360 automatico si faltan vistas». Esa prohibicion es la parte facil de
   incumplir sin darse cuenta —una rueda dibujada en la interfaz se ve muy bien
   con dos dibujos— y la que mas caro sale: quien anima descubre el agujero
   cuando el personaje pega el salto, con la escena ya armada.

   Por eso este recorrido mira sobre todo LO QUE EL PANEL DICE:

   1. Con el juego vacio, invita a agregar la primera vista.
   2. Con UNA vista, dice que con un solo dibujo no hay giro.
   3. Con frente y perfil, dice de donde a donde esta dibujado Y que falta
      hasta el extremo que el control declara. Esto es lo que impide prometer
      la vuelta completa.
   4. El control elige el dibujo de verdad, y la eleccion es discreta.
   5. Quitar una vista la saca del giro pero NO borra el dibujo.

   Las cinco importan juntas: una interfaz que solo liste vistas pasa (1), (2)
   y (5) y sigue mintiendo en (3), que es la que el plan pide cuidar. */
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
  // sin Network.enable, setCacheDisabled no hace nada y corre el modulo viejo
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('typeof dzDocInit==="function" && !!LOW?.rigging?.viewSetUI && !!api').catch(() => false);
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
    d.ensureRigBone("cabeza", { name:"cabeza" });
    const slot = d.ensureRigSlot("cabeza", { name:"cabeza" });
    const slotId = typeof slot === "string" ? slot : slot.id;
    const att = {};
    for (const n of ["Frente","Perfil"]) {
      const a = d.addRigAttachment(slotId, { name:n, type:"drawing", elementId:"dib_"+n });
      att[n] = typeof a === "string" ? a : a.id;
    }
    d.createRigControl("giro_cabeza", { name:"giro de cabeza", min:-90, max:90, default:0 });
    DZ.rigSelectedId = "cabeza";
    LOW.rigging.viewSetUI.wire(); LOW.rigging.viewSetUI.sync();
    await wait(150);

    const cobertura = () => document.querySelector("#rigVistasCobertura").textContent;
    const lista = () => [...document.querySelectorAll("#rigVistasList option")].map(o=>o.textContent);
    const salida = { panel: !!document.querySelector(".rig2-vistas") };

    document.querySelector("#rigVistasNew").click(); await wait(200);
    salida.vacio = cobertura();

    const poner = async (nombre, at) => {
      d.setRigActiveAttachment(slotId, att[nombre]);
      document.querySelector("#rigVistasAt").value = String(at);
      document.querySelector("#rigVistasAdd").click();
      await wait(200);
    };
    await poner("Frente", 0);
    salida.unaVista = cobertura();
    await poner("Perfil", 90);
    salida.dosVistas = cobertura();
    salida.lista = lista();

    // el control elige el dibujo, y es discreto
    const juego = d.scene.rigViewSetsOf(slotId)[0];
    const elige = (valor) => { d.setRigControlValue("giro_cabeza", d.frame, valor);
      const v = d.scene.rigViewAt(juego.id, d.frame); return v && v.attachmentId; };
    salida.en0 = elige(0) === att["Frente"];
    salida.en90 = elige(90) === att["Perfil"];
    salida.en80EsPerfil = elige(80) === att["Perfil"];
    const fuera = (d.setRigControlValue("giro_cabeza", d.frame, -90),
      d.scene.rigViewAt(juego.id, d.frame));
    salida.avisaFuera = fuera && fuera.fuera === true;

    /* EL CORRECTIVO POR VISTA. Al girar la cabeza las piezas de encima no
       caen solas en su lugar, y eso no se interpola: el dibujo cambio de
       golpe. Se comprueba que valga SOLO mientras esa vista manda — un
       correctivo que se arrastra a las otras vistas es peor que ninguno,
       porque desacomoda el frente para arreglar el perfil. */
    d.ensureRigBone("ojo", { name:"ojo" });
    DZ.rigSelectedId = "ojo";
    LOW.rigging.viewSetUI.sync(); await wait(120);
    const baseOjo = d.scene.rigPoseBase("ojo", d.frame);
    // se corrige la vista de perfil desde el panel
    d.setRigControlValue("giro_cabeza", d.frame, 90);
    document.querySelector("#rigVistasList").value = att["Perfil"];
    document.querySelector("#rigVistasList").dispatchEvent(new Event("change",{bubbles:true}));
    await wait(120);
    document.querySelector("#rigVistasFixX").value = "12";
    document.querySelector("#rigVistasFixSet").click(); await wait(200);
    salida.tituloFix = document.querySelector("#rigVistasFixTitulo").textContent;
    salida.corrigeEnPerfil = Math.abs(d.scene.rigPose("ojo", d.frame).x - (baseOjo.x + 12)) < 1e-9;
    d.setRigControlValue("giro_cabeza", d.frame, 0);
    salida.noCorrigeEnFrente = Math.abs(d.scene.rigPose("ojo", d.frame).x - baseOjo.x) < 1e-9;
    DZ.rigSelectedId = "cabeza";

    // quitar una vista no borra el dibujo
    document.querySelector("#rigVistasList").value = att["Perfil"];
    document.querySelector("#rigVistasList").dispatchEvent(new Event("change",{bubbles:true}));
    await wait(120);
    document.querySelector("#rigVistasRemove").click(); await wait(200);
    salida.trasQuitar = lista().length;
    salida.dibujoSigue = !!d.scene.rigAttachment(att["Perfil"]);
    return salida;
  })()`);

  if (!r.panel) mal("no existe el panel de giro por vistas", r);
  if (!/vac[íi]o|primer/i.test(r.vacio)) mal("con el juego vacío el panel no invita a empezar", r);
  if (!/UNA vista|no hay giro/i.test(r.unaVista))
    mal("con una sola vista el panel no dice que todavía no hay giro", r);
  // LA QUE EL PLAN PIDE CUIDAR
  if (!/Dibujado de 0 a 90/.test(r.dosVistas))
    mal("el panel no dice qué tramo está dibujado", r);
  if (!/FALTA/.test(r.dosVistas) || !/-90/.test(r.dosVistas))
    mal("el panel NO avisa que falta dibujar hasta el extremo: está prometiendo un giro que nadie dibujó", r);
  if (r.lista.length !== 2) mal("las vistas no se listan con su punto del recorrido", r);
  if (!r.en0 || !r.en90) mal("el control no elige el dibujo de cada extremo", r);
  if (!r.en80EsPerfil) mal("la elección no es discreta: en 80 tiene que mandar el perfil entero", r);
  if (!r.avisaFuera) mal("pasado lo dibujado el modelo no avisa que está fuera", r);
  if (!/ojo/.test(r.tituloFix || "")) mal("el panel no dice a qué pieza le está corrigiendo la vista", r);
  if (!r.corrigeEnPerfil) mal("la corrección de la vista no llega a la pose de la pieza", r);
  if (!r.noCorrigeEnFrente)
    mal("la corrección se arrastra a las otras vistas: desacomoda el frente para arreglar el perfil", r);
  if (r.trasQuitar !== 1) mal("quitar una vista no la saca del giro", r);
  if (!r.dibujoSigue) mal("quitar una vista BORRÓ el dibujo: sólo tenía que sacarlo del giro", r);

  const crasheos = errores.filter(e => /TypeError|ReferenceError/.test(String(e)));
  if (crasheos.length) mal("el panel tiró errores", crasheos.slice(0, 3));

  console.log("E2E giro por vistas OK " + JSON.stringify(r));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
