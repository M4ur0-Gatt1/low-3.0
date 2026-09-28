/* QUE VERSION CORRE + LOS FADERS DE PAPEL CEBOLLA. CDP :9223 + mock :8791.

   Este recorrido existe por un episodio, no por una funcion. Se reporto tres
   veces que un panel «no anda nada»; se midio tres veces funcionando; y las
   dos cosas eran ciertas, porque el programa que se probaba no era el que se
   habia arreglado: el proceso abierto habia arrancado con el build anterior y
   el instalador nuevo se corrio encima sin reiniciar la ventana.

   Nada en la pantalla decia que version corria, y el log escribia «arranque»
   sin numero. Asi que no habia forma de darse cuenta.

   Y de paso el defecto real que aparecio mirando el panel: los faders median
   129 px dentro de una fila de grilla de 96 —studio-polish les pone height:14px
   a TODOS los deslizadores con un selector de id, y el escape era height:auto,
   que da el alto por omision del control vertical—. El fader se desbordaba
   sobre su etiqueta y su porcentaje, y el nudo que se veia no caia donde
   estaba la barra.

   El arrastre se prueba con Input.dispatchMouseEvent: un input[type=range] se
   arrastra DENTRO del navegador y no responde a eventos sinteticos, asi que
   una prueba con dispatchEvent no habria detectado nada. */
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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 180000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value; };
  const raton = (type, x, y) => send("Input.dispatchMouseEvent", { type, x, y, button: "left",
    buttons: type === "mouseReleased" ? 0 : 1, clickCount: type === "mouseMoved" ? 0 : 1 });
  const dormir = ms => new Promise(r => setTimeout(r, ms));

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 60; i++) { if (await ev('typeof dzVersionSync==="function" && typeof dzOnionPanelToggle==="function" && !!api')) break; await dormir(250); }

  const base = await ev(`(async()=>{ const w=ms=>new Promise(r=>setTimeout(r,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit(); await w(600);
    LOW.workspace.workspaces.activate("drawing",dzWsAplicar); await w(400);
    await dzOnionPanelToggle(); await w(600);
    dzOnionMixerPreset("clear"); await w(300);

    // 1. LA VERSION, A LA VISTA en la barra de estado de dibujo.
    dzVersionBadge("9.9.9");
    const chip=document.querySelector("#sbVersion");
    const barra=document.querySelector("#dzStatusbar");
    const version={hay:!!chip, texto:chip?chip.textContent:null,
      dentroDeLaBarra:!!(chip&&barra&&barra.contains(chip)),
      dice:!!(chip&&/versi/i.test(chip.title||"")),
      antesDelHint:!!(chip&&document.querySelector("#sbHint")&&
        (chip.compareDocumentPosition(document.querySelector("#sbHint"))&4)===4)};
    dzVersionBadge("9.9.9"); // idempotente: no puede duplicar el chip
    version.sinDuplicar=document.querySelectorAll("#dzStatusbar #sbVersion").length===1;

    // 2. EL AVISO DE REINICIO. La senal es la VERSION que el instalador anoto,
    //    no la fecha del ejecutable: esa heuristica saltaba en todos los
    //    arranques porque el instalador conserva la marca de tiempo del build,
    //    que corre en UTC. Lo reporto Mauro con el cartel apareciendo sin
    //    motivo, y persistiendo tras cerrar y volver a abrir.
    dzAvisoBinarioViejo(null, "4.26.0");
    const sinNada=!document.querySelector("#dzAvisoReinicio");
    dzAvisoBinarioViejo("", "4.26.0");
    const conVacio=!document.querySelector("#dzAvisoReinicio");
    // y lo que hacia el defecto: un NUMERO ya no dispara nada
    dzAvisoBinarioViejo(151*60, "4.26.0");
    const conNumero=!document.querySelector("#dzAvisoReinicio");
    dzAvisoBinarioViejo("4.27.0", "4.26.0");
    const av=document.querySelector("#dzAvisoReinicio");
    const aviso={noAvisaSinMotivo:sinNada && conVacio, noAvisaPorUnNumero:conNumero,
      aparece:!!av,
      dice:!!(av&&/reinici|cerr/i.test(av.textContent)),
      diceLasDos:!!(av&&/4\.27\.0/.test(av.textContent)&&/4\.26\.0/.test(av.textContent)),
      diceElMotivo:!!(av&&/con el programa abierto/i.test(av.textContent)),
      seCierra:false};
    if(av){ av.querySelector('[data-a="cerrar"]').click(); await w(120);
      aviso.seCierra=!document.querySelector("#dzAvisoReinicio"); }

    // 3. LOS FADERS entran en su fila y no pisan etiqueta ni porcentaje.
    const mixer=document.querySelector("#onMixer"); mixer.scrollLeft=0; await w(150);
    const ins=[...mixer.querySelectorAll(".onion2-channel input[type=range]")];
    const medidas=ins.slice(0,6).map(u=>{ const r=u.getBoundingClientRect();
      const lbl=u.parentElement.querySelector("label").getBoundingClientRect();
      const out=u.parentElement.querySelector("output").getBoundingClientRect();
      return {alto:Math.round(r.height), ancho:Math.round(r.width),
        pisaEtiqueta:r.top<lbl.bottom-1, pisaPorcentaje:r.bottom>out.top+1}; });
    const cs=getComputedStyle(ins[0]);
    const faders={cuantos:ins.length, medidas, writingMode:cs.writingMode,
      // la declaracion que Chrome saco en la 121 no puede volver
      appearanceMuerta:cs.appearance==="slider-vertical",
      scroll:{contenido:mixer.scrollWidth, visible:mixer.clientWidth}};

    // el fader a arrastrar: uno dentro del scroll visible
    const rm=mixer.getBoundingClientRect(); let g=null;
    for(let i=0;i<ins.length;i++){ const r=ins[i].getBoundingClientRect();
      const cx=Math.round(r.x+r.width/2);
      if(cx>rm.x+16&&cx<rm.x+rm.width-16&&document.elementFromPoint(cx,Math.round(r.y+r.height/2))===ins[i]){
        window.__i=i; g={x:cx, top:Math.round(r.y+8), bot:Math.round(r.y+r.height-8),
          valor:+ins[i].value}; break; } }
    return {version, aviso, faders, arrastrable:g};
  })()`);

  const g = base.arrastrable;
  let arrastre = { imposible: true };
  if (g) {
    await raton("mousePressed", g.x, g.bot); await dormir(80);
    const camino = [];
    for (let k = 1; k <= 6; k++) {
      await raton("mouseMoved", g.x, Math.round(g.bot + (g.top - g.bot) * k / 6)); await dormir(60);
      camino.push(await ev(`+[...document.querySelectorAll("#onMixer input[type=range]")][window.__i].value`));
    }
    await raton("mouseReleased", g.x, g.top); await dormir(300);
    const final = await ev(`(()=>{const u=[...document.querySelectorAll("#onMixer input[type=range]")][window.__i];
      return {valor:+u.value, perfil:(dzOnionCfgActual().beforeOpacity||[]).map(v=>Math.round(v*100))};})()`);
    arrastre = { desde: g.valor, camino, final, movio: final.valor !== g.valor,
      creciendo: camino.some((v, i) => i > 0 && v > camino[i - 1]) };
  }

  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const v = base.version, a = base.aviso, f = base.faders;

  if (!v.hay) mal("la barra de estado no dice qué versión está corriendo: sin eso, un " +
    "reporte de «no anda» no se puede diagnosticar", v);
  if (v.texto !== "v9.9.9") mal("el chip de versión no muestra la versión que se le pasó", v);
  if (!v.dentroDeLaBarra) mal("el chip de versión quedó fuera de la barra de estado", v);
  if (!v.dice) mal("el chip de versión no explica qué es al pasar el mouse", v);
  if (!v.antesDelHint) mal("el chip quedó después del hint, que es el que se estira: lo taparía", v);
  if (!v.sinDuplicar) mal("llamar dos veces duplica el chip de versión", v);

  if (!a.noAvisaSinMotivo) mal("el aviso de reinicio aparece sin motivo", a);
  if (!a.noAvisaPorUnNumero)
    mal("un número vuelve a disparar el aviso: era la señal vieja —la fecha del " +
      "ejecutable— y saltaba en todos los arranques porque el instalador conserva la " +
      "marca de tiempo del build, que corre en UTC", a);
  if (!a.diceLasDos)
    mal("el aviso no dice QUÉ versión se instaló y cuál está corriendo", a);
  if (!a.aparece) mal("no se avisa que se instaló una versión con LOW abierto: es la " +
    "diferencia entre «no lo arreglaron» y «no lo reiniciaste»", a);
  if (!a.dice) mal("el aviso no dice qué hacer", a);
  if (!a.diceElMotivo) mal("el aviso no explica POR QUÉ lo que está en pantalla es viejo", a);
  if (!a.seCierra) mal("el aviso de reinicio no se puede cerrar", a);

  if (f.cuantos !== 20) mal("el mixer no tiene los veinte canales", f);
  if (f.appearanceMuerta) mal("volvió `appearance: slider-vertical`, que Chrome eliminó en la 121", f);
  if (f.writingMode !== "vertical-lr") mal("los faders perdieron la orientación vertical", f);
  for (const m of f.medidas) {
    if (m.alto > 96) mal("un fader mide " + m.alto + " px dentro de una fila de grilla de 96: " +
      "se desborda y el nudo no cae donde está la barra", f.medidas);
    if (m.alto < 60) mal("un fader quedó en " + m.alto + " px: sin recorrido no se puede arrastrar",
      f.medidas);
    if (m.pisaEtiqueta || m.pisaPorcentaje) mal("un fader se superpone con su etiqueta o su " +
      "porcentaje", f.medidas);
  }
  if (f.scroll.contenido <= f.scroll.visible) mal("el mixer dejó de necesitar scroll: o se " +
    "perdieron canales o cambió el ancho", f.scroll);

  if (arrastre.imposible) mal("no hay ningún fader alcanzable para arrastrar", base.faders);
  if (!arrastre.movio) mal("ARRASTRAR un fader no cambia su valor: sólo andaría con clics", arrastre);
  if (!arrastre.creciendo) mal("el valor no acompaña el gesto mientras se arrastra", arrastre);
  if (!arrastre.final.perfil.some(x => x > 0)) mal("el arrastre no llegó al perfil del papel " +
    "cebolla: se movió el control y no el papel", arrastre);

  if (errores.length) throw Error("REGRESIÓN: excepciones: " + errores.slice(0, 3).join(" | "));

  console.log("E2E versión y papel cebolla OK", JSON.stringify({ chip: v.texto,
    aviso: a.aparece && a.seCierra, fader: f.medidas[0], canales: f.cuantos,
    scroll: f.scroll, arrastre: arrastre.desde + " → " + arrastre.final.valor }));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { /* best effort */ }
}
main().catch(error => { console.error(error.stack || error); process.exit(1); });
