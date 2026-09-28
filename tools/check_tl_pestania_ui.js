/* LA LÍNEA DE TIEMPO SE PLIEGA Y ESTÁ EN TODAS LAS VISTAS.
   CDP :9223 + mock :8791.

   POR QUE EXISTE. Pedido: «quiero poder minimizar la linea de tiempo, como
   pegarla en todas las vistas como un dropdown».

   QUE HABIA. Plegar existia, pero el unico modo era DOBLE CLIC sobre
   `#dzTlgResize`, un separador de 4 px cuya ayuda lo menciona al final de la
   frase. Y la linea de tiempo aparecia o no segun el espacio de trabajo: en
   Dibujo, Limpieza o Color no estaba. O sea que el tiempo —lo unico que se
   necesita en TODOS los espacios— era lo que menos a mano estaba.

   LO QUE SE CUIDA, y las cinco importan:

   1. La pestaña esta en LOS SIETE espacios, y se ve.
   2. Un clic PLIEGA y otro DESPLIEGA de verdad: el cuerpo de la linea de
      tiempo deja de ocupar lugar y vuelve.
   3. Con la animacion apagada NO es un boton muerto: la prende y se
      despliega. Es el defecto que mas se repitio en este programa —un
      control que se ve, se aprieta y no hace nada— y no se puede repetir
      justo en el control nuevo.
   4. Plegada DICE en que cuadro estas: si no, minimizar es perder el dato
      por el que uno mira la linea de tiempo.
   5. El estado sobrevive al CAMBIO DE ESPACIO. Cambiar de espacio redibuja
      los paneles; sin volver a aplicar, la pestaña diria «plegada» con la
      linea de tiempo desplegada, o al reves.
*/
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const t0 = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(t0.webSocketDebuggerUrl);
  await new Promise((ok, f) => { ws.onopen = ok; ws.onerror = f; });
  let id = 0; const pend = new Map(); const errores = [];
  ws.onmessage = e => { const m = JSON.parse(e.data);
    if (m.method === "Runtime.exceptionThrown") errores.push(String(m.params.exceptionDetails.exception?.description || "").split("\n")[0]);
    if (!m.id || !pend.has(m.id)) return;
    const p = pend.get(m.id); pend.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); };
  const send = (method, params = {}) => new Promise((res, rej) => { const n = ++id;
    const to = setTimeout(() => { pend.delete(n); rej(Error("CDP sin respuesta: " + method)); }, 120000);
    pend.set(n, { resolve: v => { clearTimeout(to); res(v); }, reject: e => { clearTimeout(to); rej(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async x => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(String(r.exceptionDetails.exception?.description || "").split("\n")[0]);
    return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 120; i++) {
    if (await ev('typeof openDesign==="function" && !!api').catch(() => false)) break; await w(400);
  }
  await ev(`(async()=>{
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit();
    if (typeof closeL3d==="function") closeL3d();
    await wait(800); return true; })()`);

  const FOTO = `(() => {
    const p = document.getElementById("dzTlPestania");
    const r = p ? p.getBoundingClientRect() : null;
    const cuerpo = ["#dzTimeline", "#dzTlGrid"].map(s => {
      const el = document.querySelector(s);
      if (!el) return { sel: s, falta: true };
      const c = el.getBoundingClientRect();
      return { sel: s, alto: Math.round(c.height), oculto: !!el.hidden };
    });
    return { hayPestania: !!p, seVe: !!(r && r.width > 40 && r.height > 6),
      alto: r ? Math.round(r.height) : 0,
      texto: p ? (p.textContent || "").trim() : "",
      expandida: p ? p.getAttribute("aria-expanded") : null,
      anim: !!(typeof DZ !== "undefined" && DZ.anim),
      /* La referencia NO es el mismo dato que usa la pestaña —eso no
         probaria nada—, sino la BARRA DE ESTADO de la app, que lo calcula
         por otro camino (dzSbFrame). Si las dos partes de la pantalla no
         coinciden, una miente. Es exactamente el defecto reportado: la
         pestaña decia «sin cuadros» y la barra «cuadro 7/18». */
      barraDeEstado: ((document.querySelector("#sbFrame")||{}).textContent || "").trim(),
      cuerpo, altoCuerpo: cuerpo.reduce((s, c) => s + (c.alto || 0), 0) };
  })()`;

  // 1. está en los siete espacios
  const espacios = await ev(`(() => [...document.querySelectorAll("#dzWorkspaces .dz-ws-tab")]
    .map(b => (b.textContent||"").trim()).filter(Boolean))()`);
  if (!espacios.length) mal("no hay espacios de trabajo para recorrer", {});
  const porEspacio = {};
  for (const e of espacios) {
    await ev(`(async()=>{ const wait = ms => new Promise(x=>setTimeout(x,ms));
      const t = [...document.querySelectorAll("#dzWorkspaces .dz-ws-tab")]
        .find(b => (b.textContent||"").trim() === ${JSON.stringify("")} + ${JSON.stringify(e)});
      if (t) { t.click(); await wait(600); } return true; })()`);
    porEspacio[e] = await ev(FOTO);
    if (!porEspacio[e].hayPestania) mal("falta la pestaña en el espacio «" + e + "»", porEspacio[e]);
    if (!porEspacio[e].seVe) mal("la pestaña no se ve en el espacio «" + e + "»", porEspacio[e]);
  }

  // 3. con la animación apagada, un clic la enciende: no es un botón muerto
  await ev(`(async()=>{ const wait = ms => new Promise(x=>setTimeout(x,ms));
    const t = [...document.querySelectorAll("#dzWorkspaces .dz-ws-tab")]
      .find(b => (b.textContent||"").trim() === "Dibujo");
    if (t) { t.click(); await wait(700); }
    if (DZ.anim && typeof dzAnimToggle === "function") { await dzAnimToggle(); await wait(700); }
    return true; })()`);
  const apagada = await ev(FOTO);
  if (apagada.anim) mal("no se pudo dejar la animación apagada para medir el botón muerto", apagada);
  await ev(`document.getElementById("dzTlPestania").click()`);
  await w(1600);
  const encendida = await ev(FOTO);
  if (!encendida.anim)
    mal("con la animación apagada, la pestaña no hizo nada: es un botón muerto", { apagada, encendida });
  if (!(encendida.altoCuerpo > apagada.altoCuerpo))
    mal("la encendió pero no la desplegó: no se ve la línea de tiempo", { apagada, encendida });

  // 2. plegar y desplegar
  const desplegada = encendida;
  await ev(`document.getElementById("dzTlPestania").click()`);
  await w(700);
  const trasPlegar = await ev(FOTO);
  if (!(trasPlegar.altoCuerpo < desplegada.altoCuerpo))
    mal("plegar no achicó nada: la línea de tiempo sigue ocupando el mismo lugar",
        { desplegada: desplegada.altoCuerpo, trasPlegar: trasPlegar.altoCuerpo });
  if (!trasPlegar.seVe) mal("al plegar desapareció también la pestaña: no habría cómo volver", trasPlegar);

  /* 4. Plegada tiene que decir lo MISMO que la barra de estado. La primera
     version comparaba contra `DZ.anim.frames`, que es el modelo viejo de los
     `.svg` sueltos: con un `.low` da 0 y acusaba a la pestaña por decir la
     verdad. Peor todavia, no habria detectado el defecto real —«sin cuadros»
     con 18 cuadros en la hoja— porque su propia referencia era 0. */
  const barra = trasPlegar.barraDeEstado;                 // p. ej. "cuadro 7/18"
  const enLaBarra = /cuadro\s+(\d+)\s*\/\s*(\d+)/.exec(barra);
  if (enLaBarra) {
    const actual = enLaBarra[1], total = enLaBarra[2];
    const enLaPestania = /(\d+)\s*\/\s*(\d+)/.exec(trasPlegar.texto);
    if (!enLaPestania)
      mal("la barra de estado dice «" + barra + "» y la pestaña no muestra ningún cuadro: " +
          "dos partes de la pantalla contándote cosas distintas", trasPlegar);
    else if (enLaPestania[1] !== actual || enLaPestania[2] !== total)
      mal("la pestaña dice " + enLaPestania[1] + "/" + enLaPestania[2] +
          " y la barra de estado dice " + actual + "/" + total, trasPlegar);
  } else if (!/sin cuadros|apagada/i.test(trasPlegar.texto)) {
    mal("la barra de estado no muestra cuadros y la pestaña tampoco lo dice", trasPlegar);
  }

  await ev(`document.getElementById("dzTlPestania").click()`);
  await w(700);
  const trasDesplegar = await ev(FOTO);
  if (!(trasDesplegar.altoCuerpo > trasPlegar.altoCuerpo))
    mal("desplegar no la trajo de vuelta", { trasPlegar, trasDesplegar });

  // 5. el estado sobrevive al cambio de espacio
  await ev(`document.getElementById("dzTlPestania").click()`);   // plegada otra vez
  await w(700);
  const antesDeCambiar = await ev(FOTO);
  await ev(`(async()=>{ const wait = ms => new Promise(x=>setTimeout(x,ms));
    for (const n of ["Color", "Animación"]) {
      const t = [...document.querySelectorAll("#dzWorkspaces .dz-ws-tab")]
        .find(b => (b.textContent||"").trim() === n);
      if (t) { t.click(); await wait(800); }
    } return true; })()`);
  const trasCambiar = await ev(FOTO);
  /* Lo que importa no es que la pestaña diga lo MISMO que antes, sino que lo
     que dice COINCIDA con lo que se ve. (La primera versión comparaba el antes
     con el después y pasaba igual sin el enganche al cambio de espacio: el
     atributo no se tocaba porque nadie lo actualizaba. El criterio flojo daba
     por buena justo la falla que tenía que encontrar.) */
  const coherente = (f) => (f.expandida === "true") === (f.altoCuerpo > 0);
  if (!coherente(trasCambiar))
    mal("después de cambiar de espacio la pestaña dice una cosa y se ve otra: " +
        "dice expandida=" + trasCambiar.expandida + " y el cuerpo mide " + trasCambiar.altoCuerpo + " px",
        { antesDeCambiar, trasCambiar });
  if (trasCambiar.expandida !== antesDeCambiar.expandida)
    mal("cambiar de espacio cambió solo el estado plegado sin que nadie lo pidiera",
        { antesDeCambiar, trasCambiar });

  const crasheos = errores.filter((e) => /TypeError|ReferenceError/.test(e));
  if (crasheos.length) mal("la pestaña tiró errores", crasheos.slice(0, 3));

  console.log("E2E la pestaña de la línea de tiempo OK " + JSON.stringify({
    espacios: espacios.length, alto: desplegada.alto,
    desplegada: desplegada.altoCuerpo, plegada: trasPlegar.altoCuerpo, texto: trasPlegar.texto }));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
