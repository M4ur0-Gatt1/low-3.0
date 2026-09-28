/* EL RIEL NO PUEDE ESCONDER LAS HERRAMIENTAS. CDP :9223 + mock :8791.

   POR QUE EXISTE ESTE RECORRIDO. Mauro, con LOW a media pantalla:
   «ahora cuando elijo el panel de animacion no se ven las herramientas».

   Medido: en una ventana de 1000x560 el riel tenia 11 herramientas a la vista;
   al pasar al espacio de Animacion la timeline le come la mitad del alto y
   quedaban SEIS, con veintiseis escondidas en el cajon «...». El riel repartia
   por ALTO y, cuando no entraban, escondia. Photoshop, Moho y OpenToonz parten
   el riel en columnas antes de esconder nada: eso es lo que se exige aca.

   Se mide a 1000x560 A PROPOSITO: a 1366x768 entran todas y la prueba no
   probaria nada —es el tamaño con el que Mauro trabaja, media pantalla—. */
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
  // La ventana de Mauro: media pantalla. Con la timeline abierta el riel se
  // queda con ~250 px de alto, que es donde aparecia el defecto.
  await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 560, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('typeof dzMenuAction==="function" && !!api').catch(() => false);
    if (listo === true) break;
    await w(400);
  }
  await ev('(()=>{ try{localStorage.clear()}catch(e){} return true; })()');
  await ev(`(async()=>{ await openDesign('mock.svg'); await dzDocInit();
    if (typeof closeL3d === "function") closeL3d(); })()`);
  await w(900);

  const foto = (donde) => ev(`(()=>{ const riel = document.querySelector('.dz-tools');
    const caja = riel.getBoundingClientRect();
    const enRiel = [...riel.children]
      .filter(n => n.matches('[data-tool],#dzShapePicker,#dzAddText,#dzAddLine'))
      .map(n => n.dataset.tool || n.id);
    const cajon = document.querySelector('#dzToolsDrawer');
    return { donde: "${donde}", visible: caja.width > 0 && caja.height > 0,
      alto: Math.round(caja.height), ancho: Math.round(caja.width), enRiel,
      escondidas: cajon ? cajon.children.length : 0,
      espacio: LOW.workspace?.workspaces?.activeId }; })()`);

  const dibujo = await foto("Dibujo");
  if (!dibujo.visible) mal("el riel de herramientas no se ve", dibujo);
  const pestanas = await ev(`[...document.querySelectorAll('#dzWorkspaces > *')].map(b=>b.textContent.trim())`);
  if (!pestanas.some(p => /Anima/i.test(p)))
    mal("no hay pestaña de espacio de Animación donde entrar", { pestanas });
  await ev(`(()=>{ const b = [...document.querySelectorAll('#dzWorkspaces > *')]
    .find(x => /Anima/i.test(x.textContent)); b.click(); return true; })()`);
  await w(1200);
  const animacion = await foto("Animación");

  // LO QUE SE PERSIGUE: entrar a Animación no puede COSTAR herramientas.
  const perdidas = dibujo.enRiel.filter(t => !animacion.enRiel.includes(t));
  if (perdidas.length)
    mal("entrar al espacio de Animación esconde herramientas que estaban a la vista: " +
      "el riel reparte por alto y la timeline le come la mitad", { perdidas, dibujo, animacion });

  // Y las primarias tienen que estar TODAS: es el riel de un programa de dibujo.
  const imprescindibles = ["select", "direct", "nodes", "pencil", "brush", "pen", "eraser", "bucket", "dropper"];
  const faltan = imprescindibles.filter(t => !animacion.enRiel.includes(t));
  if (faltan.length)
    mal("en Animación faltan herramientas básicas del riel: se fueron al cajón «⋯» y " +
      "para el dibujante «no se ven las herramientas»", { faltan, animacion });

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 3));

  console.log("E2E riel OK " + JSON.stringify({
    dibujo: dibujo.enRiel.length + " a la vista en " + dibujo.ancho + "px",
    animacion: animacion.enRiel.length + " a la vista en " + animacion.ancho + "px · alto " + animacion.alto
  }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
