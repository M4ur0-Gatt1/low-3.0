/* SE TIENE QUE VER QUE HAY SELECCIONADO, Y CUANTO.
   CDP :9223 + mock :8791.

   POR QUE EXISTE. Reportado: «la seleccion en grupo es muy poco satisfactoria,
   no se sabe si uno selecciono todo o solo una pieza; debe ser clara la
   grafica al respecto, como en Illustrator».

   MEDIDO ANTES DEL ARREGLO, con cinco piezas en la hoja:

     una pieza    ->  1 clase, sin recuadro, sin texto
     TRES piezas  ->  NINGUNA clase, sin recuadro, sin texto
     un grupo     ->  1 clase, sin recuadro, sin texto

   O sea que con tres piezas seleccionadas la pantalla se veia IGUAL que sin
   nada seleccionado, y una pieza se veia IGUAL que un grupo entero. No era que
   la grafica fuera poco clara: en el caso de varias no habia grafica.

   Lo que se cuida, y son tres estados que no pueden verse iguales porque no
   son lo mismo —en uno movés una pieza, en otro tres sueltas, en otro el
   conjunto—:

   1. UNA pieza: hay marco y dice que es una.
   2. VARIAS: hay marco, dice cuantas, y CADA pieza queda marcada aparte —el
      numero solo no dice cual entro y cual no—.
   3. UN GRUPO: hay marco, se distingue del caso de varias, y dice cuantas
      piezas tiene adentro.
   4. Sin nada seleccionado no queda un marco colgado.

   Ademas el marco NO puede vivir adentro del SVG: lo que se dibuja ahi termina
   en el archivo guardado. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map(), errores = [];
  ws.onmessage = event => { const m = JSON.parse(event.data);
    if (m.method === "Runtime.exceptionThrown")
      errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
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
    if (await ev('typeof openDesign==="function" && typeof dzSelect==="function" && !!api').catch(() => false)) break;
    await w(400);
  }

  const r = await ev(`(async()=>{
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit();
    if (typeof closeL3d==="function") closeL3d();
    await wait(500);
    dzSetTool("select"); await wait(200);
    const svg = document.querySelector("#dzCanvas > svg");
    const piezas = [...svg.querySelectorAll("path,rect,circle,ellipse,polygon")]
      .filter(n => { const r = n.getBoundingClientRect(); return r.width > 5 && r.height > 5; });
    const foto = () => { const m = document.querySelector("#dzSelMarco");
      const visible = !!(m && !m.hidden);
      const r = visible ? m.getBoundingClientRect() : null;
      return { visible, clases: m ? m.className : "", ancho: r ? Math.round(r.width) : 0,
               etiqueta: visible ? (m.querySelector(".dz-selmarco-et") || {}).textContent || "" : "",
               marcadas: svg.querySelectorAll(".dz-msel").length,
               dentroDelSvg: !!svg.querySelector("#dzSelMarco") }; };
    const salida = { piezas: piezas.length };

    dzSelect(piezas[0]); await wait(300);
    salida.una = foto();

    DZ.multi = piezas.slice(0, 3);
    dzSelect(piezas[2], true); await wait(300);
    salida.varias = foto();

    // un grupo de verdad: con tamaño y mas de una pieza adentro
    let g = [...svg.querySelectorAll("g")].find(n => { const r = n.getBoundingClientRect();
      return r.width > 5 && r.height > 5 &&
        n.querySelectorAll("path,rect,circle,ellipse,polygon").length > 1; });
    if (!g) { g = document.createElementNS("http://www.w3.org/2000/svg", "g");
      g.setAttribute("data-low", "plano");
      for (const pieza of piezas.slice(0, 2)) g.appendChild(pieza);
      svg.appendChild(g); await wait(200); }
    if (typeof dzDeselect === "function") dzDeselect();
    DZ.multi = []; dzSelect(g); await wait(300);
    salida.grupo = foto();

    // sin nada seleccionado no puede quedar un marco colgado
    if (typeof dzDeselect === "function") dzDeselect();
    DZ.multi = []; DZ.sel = null;
    if (typeof dzMarcoSeleccion === "function") dzMarcoSeleccion();
    await wait(300);
    salida.sinNada = foto();
    // y el marco no puede terminar en el archivo
    salida.contenidoGuardado = !/dzSelMarco|dz-selmarco/.test(dzCanvasInner());
    return salida;
  })()`);

  if (r.piezas < 3) mal("el montaje no dejó piezas suficientes para medir", r);
  if (!r.una.visible) mal("con UNA pieza seleccionada no se ve ningún marco", r);
  if (!/1 pieza/.test(r.una.etiqueta)) mal("el marco no dice que hay una sola pieza", r);
  // LA QUE MOTIVA TODO ESTO
  if (!r.varias.visible) mal("con VARIAS piezas no se ve nada: la pantalla queda igual que sin selección", r);
  if (!/3 piezas/.test(r.varias.etiqueta)) mal("el marco no dice cuántas piezas hay", r);
  if (r.varias.marcadas !== 3) mal("las piezas no quedan marcadas una por una: el número solo no dice cuál entró", r);
  if (!/varias/.test(r.varias.clases)) mal("varias piezas se ve igual que una sola", r);
  if (!r.grupo.visible) mal("con un GRUPO seleccionado no se ve ningún marco", r);
  if (!/grupo/.test(r.grupo.clases)) mal("un grupo se ve igual que tres piezas sueltas, y no es lo mismo", r);
  if (!/grupo/.test(r.grupo.etiqueta)) mal("el marco no dice que es un grupo", r);
  if (r.sinNada.visible) mal("sin nada seleccionado quedó un marco colgado", r);
  if (!r.contenidoGuardado) mal("el marco se está guardando DENTRO del dibujo", r);

  const crasheos = errores.filter(e => /TypeError|ReferenceError/.test(String(e)));
  if (crasheos.length) mal("el marco tiró errores", crasheos.slice(0, 3));

  console.log("E2E marco de selección OK " + JSON.stringify(r));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
