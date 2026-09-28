/* EL MENU «COPIAR» DEL CHAT NO PUEDE TIRAR UNA EXCEPCION AL CERRARSE.
   CDP :9223 + mock :8791.

   POR QUE EXISTE ESTE RECORRIDO. Salio del propio log de LOW. En
   `%APPDATA%/LOW/low.log` de Mauro, con la v4.33.0 instalada:

     [js] Uncaught TypeError: Cannot read properties of null
          (reading 'querySelector') @app.js?v=4.33.0:276

   y su reporte en `fallos/fallo-20260910-201935.json`, con una escena sin
   guardar abierta. La linea 276 pedia el foco del primer boton DENTRO de un
   `requestAnimationFrame`, leyendo la variable `ctxMenu`. Pero el menu se
   cierra SOLO —`closeCtxMenu` esta enganchado a `click`, a `scroll` en captura
   y a `blur`, y el chat se autodesplaza cada vez que llega una respuesta—, y al
   cerrarse pone `ctxMenu` en null. Si eso pasa antes del cuadro siguiente, el
   callback lee null y revienta.

   Reproducido antes de arreglar, con el MISMO mensaje del log.

   LAS DOS MITADES, y se prueban juntas a proposito:

   1. QUE CERRARLO NO TIRE NADA. Es el fallo que vivio Mauro.
   2. QUE EL FOCO SIGA LLEGANDO al primer boton cuando el menu queda abierto.
      Sacar el `requestAnimationFrame` haria pasar (1) y romperia el teclado sin
      que nadie se entere. */
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
  await send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    const listo = await ev('typeof showCtxMenu==="function" && typeof closeCtxMenu==="function"').catch(() => false);
    if (listo === true) break;
    await w(400);
  }

  // un mensaje del agente en el chat, que es lo que uno quiere copiar
  const montaje = await ev(`(()=>{ const m=document.querySelector("#msgs");
    if(!m) return null;
    const d=document.createElement("div"); d.className="m-txt";
    d.textContent="una respuesta del agente que uno quiere copiar";
    m.appendChild(d);
    const r=d.getBoundingClientRect();
    return { hayChat:true, x:Math.round(r.x+8), y:Math.round(r.y+8) }; })()`);
  if (!montaje) mal("no hay panel de chat donde probar el menú", {});

  const clicDerecho = (x, y) => ev(`(()=>{ const d=document.querySelector("#msgs .m-txt");
    d.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:${x},clientY:${y}}));
    return !!document.querySelector(".ctx-menu"); })()`);

  // ── 1. ABRIR Y CERRAR EN EL MISMO CUADRO NO PUEDE TIRAR NADA. Es la
  //       secuencia que dejó el error en el log de Mauro: el chat se autodesplaza
  //       cuando llega una respuesta y `closeCtxMenu` está enganchado al scroll
  //       en captura, así que el menú se cierra solo antes del cuadro siguiente.
  errores.length = 0;
  await ev(`(()=>{ const d=document.querySelector("#msgs .m-txt");
    d.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:${montaje.x},clientY:${montaje.y}}));
    closeCtxMenu();                     // el autoscroll del chat, el blur o un clic
    return true; })()`);
  await w(700);
  const cerrado = await ev('!document.querySelector(".ctx-menu")');
  const alCerrar = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (alCerrar.length)
    mal("cerrar el menú del chat en el mismo cuadro en que se abre TIRA UNA EXCEPCIÓN: " +
      "es el «Uncaught TypeError ... reading 'querySelector'» que quedó en el low.log " +
      "de Mauro con una escena sin guardar abierta", alCerrar.slice(0, 2));
  if (!cerrado) mal("el menú no se cerró", {});

  // ── 2. y abierto, OFRECE COPIAR y toma el foco: sacar el requestAnimationFrame
  //       pasaría la prueba de arriba y rompería el teclado sin que nadie se entere.
  const abierto = await ev(`(()=>{ const d=document.querySelector("#msgs .m-txt");
    d.dispatchEvent(new MouseEvent("contextmenu",{bubbles:true,cancelable:true,clientX:${montaje.x},clientY:${montaje.y}}));
    return !!document.querySelector(".ctx-menu"); })()`);
  const contenido = await ev(`(()=>{ const m=document.querySelector(".ctx-menu");
    if(!m) return null;
    return { botones:[...m.querySelectorAll("button")].map(b=>b.textContent.trim().slice(0,30)) };})()`);
  if (!abierto || !contenido) mal("el clic derecho sobre un mensaje no abre el menú: sin " +
    "menú nativo (pywebview lo apaga) no hay manera de copiar una respuesta", { montaje });
  if (!contenido.botones.some(b => /copiar/i.test(b)))
    mal("el menú del chat perdió «Copiar», que es para lo único que existe", contenido);

  await w(300);
  const foco = await ev(`(()=>{ const a=document.activeElement;
    return { esBoton: a?.tagName==="BUTTON", dentroDelMenu: !!a?.closest?.(".ctx-menu"),
      texto: (a?.textContent||"").trim().slice(0,20) }; })()`);
  if (!foco.esBoton || !foco.dentroDelMenu)
    mal("el menú abre sin el foco adentro: se abre con el teclado y no se puede " +
      "recorrer con el teclado", foco);

  ws.close();
  try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }

  const graves = errores.filter(e => !/ResizeObserver/.test(String(e)));
  if (graves.length) mal("hubo excepciones durante el recorrido", graves.slice(0, 2));

  console.log("E2E menú contextual OK " + JSON.stringify({
    abre: contenido.botones, foco: foco.texto, cierraSinRomper: true,
  }));
}

main().catch(e => { console.error(e.stack || String(e)); process.exit(1); });
