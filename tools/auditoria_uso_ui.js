/* AUDITORIA DE DEFECTOS DE USO.  CDP :9223 + mock :8791.
 *
 * No es una puerta: es un INFORME. Busca la familia de defectos que fueron
 * apareciendo USANDO LOW, que casi nunca son «se rompio» sino:
 *
 *   A. Apretás algo y NO PASA NADA, y tampoco te dice por que.
 *   B. La pantalla no dice EN QUE ESTADO estás.
 *   C. Un control esta apagado y no se sabe que falta para encenderlo.
 *
 * Salieron de cosas reales: la seleccion multiple que no se veia, el pincel
 * que quedaba activo sobre el esqueleto, el ejemplo que borraba el dibujo.
 *
 * COMO MIDE. Para cada boton visible con ayuda: saca una foto del estado,
 * lo aprieta, espera, y vuelve a mirar. Si NADA cambio —ni el DOM entero, ni
 * el zoom, ni el foco, ni la barra de estado— queda anotado. No afirma que
 * sea un defecto: afirma que apretarlo no tuvo NINGUN efecto observable, que
 * es exactamente lo que siente quien lo aprieta.
 *
 * TRES TRAMPAS QUE YA ME MORDIERON Y ESTAN RESUELTAS ACA:
 *
 *  1. La foto tiene que ser FINA. La primera version no miraba el zoom ni el
 *     foco ni los cajones que se abren fuera de #designView, y acusaba de
 *     mudos a botones que andaban.
 *  2. La foto tiene que ser ESTABLE. Si algo se mueve solo, «cambio» no
 *     prueba nada. Se mide el reposo antes de empezar y se avisa.
 *  3. Los botones se buscan DE NUEVO antes de cada clic, por su ayuda. Los
 *     paneles se redibujan enteros y un marcador puesto al principio se va
 *     con el DOM viejo: el clic cae en la nada y el informe acusa a un boton
 *     sano. Y como cambiar de espacio se lleva la barra entera, se recorre
 *     UN ESPACIO POR VEZ, volviendo a el antes de cada boton.
 *
 * Uso: node tools/auditoria_uso_ui.js [endpoint] [url]
 */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

const SELECTOR = "#designView button[title], #designView [data-tool][title], #dzToolsDrawer button[title]";

async function main() {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map(), errores = [];
  ws.onmessage = event => { const m = JSON.parse(event.data);
    if (m.method === "Runtime.exceptionThrown")
      errores.push(String(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split("\n")[0]);
    if (!m.id || !pending.has(m.id)) return; const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 60000);
    pending.set(n, { resolve: v => { clearTimeout(timer); resolve(v); }, reject: e => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate",
    { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __error: String(r.exceptionDetails.exception?.description || "").split("\n")[0] };
    return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url: pageUrl });
  for (let i = 0; i < 90; i++) {
    if (await ev('typeof openDesign==="function" && !!api').catch(() => false)) break;
    await w(400);
  }
  await ev(`(async()=>{
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit();
    if (typeof closeL3d==="function") closeL3d();
    await wait(600); return true; })()`);

  /* LA FOTO. El atrapatodo es el largo del innerHTML del body: si eso no se
     mueve, el DOM no se movio. Lo demas nombra QUE se movio. */
  const FOTO = `(() => {
    const cv = document.querySelector("#dzCanvas");
    const hoja = cv && cv.querySelector(":scope > svg");
    const visibles = [...document.querySelectorAll("#designView [id]")]
      .filter(n => { const r = n.getBoundingClientRect(); return r.width > 20 && r.height > 20; }).length;
    const flotantes = [...document.querySelectorAll('[class*="drawer"],[class*="menu"],[class*="pop"],[class*="sheet"],[class*="dialog"],[role="menu"],[role="dialog"]')]
      .filter(n => { const r = n.getBoundingClientRect(); return r.width > 10 && r.height > 10; }).length;
    const act = document.activeElement;
    return {
      dom: document.body.innerHTML.length,
      dibujo: hoja ? hoja.innerHTML.length : 0,
      piezas: hoja ? hoja.querySelectorAll("path,rect,circle,ellipse,polygon,g").length : 0,
      caja: hoja ? (hoja.getAttribute("viewBox") || "") : "",
      zoom: (typeof DZ !== "undefined" && (DZ.zoom || DZ.scale)) || 0,
      pan: (typeof DZ !== "undefined" && DZ.pan) ? JSON.stringify(DZ.pan) : "",
      herramienta: (typeof DZ !== "undefined" && DZ.tool) || "",
      color: (typeof DZ !== "undefined" && (DZ.color || DZ.fill || DZ.stroke)) || "",
      clasesBody: document.body.className,
      seleccion: (typeof DZ !== "undefined" && DZ.sel ? 1 : 0) + ((typeof DZ !== "undefined" && DZ.multi || []).length),
      rig: !!(typeof DZ !== "undefined" && DZ.rigMode),
      anim: !!(typeof DZ !== "undefined" && DZ.anim),
      revision: (typeof DZ !== "undefined" && DZ.doc && DZ.doc.scene && DZ.doc.scene.revision) || 0,
      historial: (typeof DZ !== "undefined" && DZ.history && DZ.history.undoStack.length) || 0,
      paneles: visibles,
      flotantes,
      foco: act ? (act.id || act.tagName + "." + (act.className || "").slice(0, 20)) : "",
      estado: (document.querySelector("#dzStatus") || {}).textContent || "",
      chat: document.querySelectorAll("#chat .msg, #chat > *").length,
      modal: !!(document.querySelector("#modal") && !document.querySelector("#modal").hidden),
      cursor: document.body.style.cursor || ""
    };
  })()`;

  /* CONTROL DE REPOSO: la foto no puede moverse sola. */
  const q1 = await ev(FOTO); await w(900); const q2 = await ev(FOTO);
  const seMuevenSolos = Object.keys(q1).filter((k) => JSON.stringify(q1[k]) !== JSON.stringify(q2[k]));
  if (seMuevenSolos.length) console.error("AVISO · la foto se mueve sola en: " + seMuevenSolos.join(", "));

  const listar = `(() => [...document.querySelectorAll(${JSON.stringify(SELECTOR)})]
    .filter(b => { const r = b.getBoundingClientRect(); return r.width > 4 && r.height > 4; })
    .map(b => ({ titulo: (b.getAttribute("title") || "").slice(0, 70),
                 texto: (b.textContent || "").trim().slice(0, 24),
                 apagado: !!b.disabled, id: b.id || "" })))()`;

  /** Aprieta el botón identificado por su ayuda + su texto, buscándolo recién
   *  ahora. Devuelve por qué no se pudo, si no se pudo. */
  const apretar = (b) => `(() => {
    const bs = [...document.querySelectorAll(${JSON.stringify(SELECTOR)})]
      .filter(x => { const r = x.getBoundingClientRect(); return r.width > 4 && r.height > 4; });
    const t = ${JSON.stringify(b.titulo)}, txt = ${JSON.stringify(b.texto)};
    const c = bs.filter(x => (x.getAttribute("title") || "").slice(0, 70) === t &&
                             (x.textContent || "").trim().slice(0, 24) === txt);
    if (!c.length) return { estado: "desapareció" };
    if (c.length > 1) return { estado: "ambiguo", cuantos: c.length };
    if (c[0].disabled) return { estado: "apagado" };
    c[0].click();
    return { estado: "apretado" };
  })()`;

  /** Vuelve al espacio de trabajo pedido y cierra lo que haya quedado abierto. */
  /** Vuelve al espacio de trabajo pedido y cierra lo que haya quedado abierto. */
  const volverA = (espacio) => `(async () => {
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    const m = document.querySelector("#modal");
    if (m && !m.hidden) { const x = m.querySelector('[id$="X"],.ghost,[data-cerrar]');
      if (x) x.click(); else if (typeof closeModal === "function") closeModal(); }
    if (typeof closeL3d === "function") { try { closeL3d(); } catch (e) {} }
    const tab = [...document.querySelectorAll("#dzWorkspaces .dz-ws-tab")]
      .find(b => (b.textContent || "").trim() === ${JSON.stringify(espacio)});
    if (tab) { tab.click(); await wait(450); }
    return !!tab;
  })()`;

  /** REMONTAR. Hay botones que se llevan la vista entera —el estudio 3D, salir
   *  del modulo 2D— y despues de eso ya no hay a donde volver: todo lo que
   *  falta del inventario aparece como «desaparecio» y queda sin medir. Cuando
   *  el boton no esta donde deberia, se rearma el documento y se reintenta una
   *  vez; recien si sigue sin estar, se anota. */
  const montar = `(async()=>{
    const wait = ms => new Promise(x=>setTimeout(x,ms));
    if (typeof closeL3d==="function") { try{ closeL3d(); }catch(e){} }
    try{localStorage.clear()}catch(e){}
    await openDesign("mock.svg"); await dzDocInit();
    await wait(700); return true; })()`;

  const espacios = await ev(`(() => [...document.querySelectorAll("#dzWorkspaces .dz-ws-tab")]
      .map(b => (b.textContent || "").trim()).filter(Boolean))()`);

  const mudos = [], apagadosSinPorque = [], rotos = [], hablaron = [], noSePudo = [];
  const yaVistos = new Set();
  let mirados = 0, remontajes = 0;

  for (const espacio of (Array.isArray(espacios) && espacios.length ? espacios : ["Dibujo"])) {
    await ev(volverA(espacio)); await w(300);
    const inventario = await ev(listar);
    if (!Array.isArray(inventario)) continue;

    for (const b of inventario) {
      const clave = b.titulo + "·" + b.texto;
      if (yaVistos.has(clave)) continue;      // las solapas se repiten en todos los espacios
      yaVistos.add(clave);
      mirados++;

      if (b.apagado) {
        // C. apagado: ¿la ayuda dice QUÉ FALTA para encenderlo?
        const explica = /nec|falt|primero|eleg|selecc|abr|cre|requier|sin /i.test(b.titulo);
        if (!explica) apagadosSinPorque.push({ espacio, ...b });
        continue;
      }

      await ev(volverA(espacio)); await w(250);
      const antes = await ev(FOTO);
      let clic = await ev(apretar(b));
      if (clic && clic.__error) { rotos.push({ espacio, ...b, error: clic.__error }); continue; }
      if (clic && clic.estado === "desapareció") {      // el botón anterior se llevó la vista
        await ev(montar); await ev(volverA(espacio)); await w(350);
        clic = await ev(apretar(b));
        remontajes++;
      }
      if (!clic || clic.estado !== "apretado") { noSePudo.push({ espacio, ...b, motivo: clic && clic.estado }); continue; }
      await w(420);
      const despues = await ev(FOTO);
      if (!antes || !despues || antes.__error || despues.__error) continue;

      const cambios = Object.keys(antes).filter((k) => JSON.stringify(antes[k]) !== JSON.stringify(despues[k]));
      if (!cambios.length) mudos.push({ espacio, ...b });
      else hablaron.push({ espacio, boton: b.texto || b.id, cambios: cambios.filter((c) => c !== "dom") });
    }
  }

  const corto = (x) => ({ espacio: x.espacio, boton: x.texto || x.id || "(ícono)", ayuda: x.titulo });
  const informe = {
    espacios, botonesMirados: mirados, remontajes, seMuevenSolos,
    "A · apretar y que no pase NADA": mudos.map(corto),
    "C · apagados sin decir qué falta": apagadosSinPorque.map(corto),
    "tiraron error al apretar": rotos.map((r) => ({ boton: r.texto || r.id, error: r.error })),
    noSePudoApretar: noSePudo.map((n) => ({ espacio: n.espacio, boton: n.texto || n.id, ayuda: n.titulo, motivo: n.motivo })),
    hicieronAlgo: hablaron,
    erroresSueltos: [...new Set(errores)].slice(0, 8),
  };
  console.log(JSON.stringify(informe, null, 1));
  ws.close();
}
main().catch(e => { console.error("AUDITORÍA: " + e.message); process.exit(1); });
