/* TODAS LAS VENTANAS DE HERRAMIENTAS SE PLIEGAN, Y SE PUEDEN TRAER DE VUELTA.
   CDP :9223 + mock :8791.

   POR QUE EXISTE. Pedido: «todas las ventanas de herramientas se deben poder
   esconder como escondemos la linea de tiempo».

   DOS FORMAS DE PANEL, Y NO SE PLIEGAN IGUAL. Medido en la app: Herramientas
   74x418, Propiedades 246x418, Rigging 251x346 son COLUMNAS; la linea de
   tiempo 1366x38 es una BARRA. A una columna plegarla «hacia arriba» no le
   devuelve nada a la mesa: sigue ocupando sus 246 px de ancho.

   LO QUE SE CUIDA, en este orden y por esta razon:

   1. Plegar DEVUELVE MESA. Es el punto de todo: si el lienzo no crece,
      esconder paneles no sirve para nada.
   2. La PESTAÑA SIGUE VISIBLE Y APRETABLE despues de plegar. Sin esto no hay
      forma de traer el panel de vuelta, que es peor que no poder plegarlo.
      ESTE PUNTO ENCONTRO DOS DEFECTOS REALES en la primera version:
        · Herramientas: el panel quedaba en 22 px pero su pestaña en 2 px,
          porque el relleno del panel se comia el ancho. Visible para el CSS
          e inutil para el dedo.
        · Paleta: colapsaba en las dos direcciones y quedaba un cuadrado de
          22x21. (Se resolvio sacandole pestaña: es un SUB-panel, vive dentro
          de «Propiedades y capas» y plegar al dueño ya la esconde.)
   3. Desplegar DEVUELVE EL TAMAÑO EXACTO. Un panel que vuelve mas chico cada
      vez es una fuga que se nota recien despues de diez plegadas.
   4. El estado SOBREVIVE al cambio de espacio de trabajo, y lo que la pestaña
      dice coincide con lo que se ve.
   5. Los paneles FIJOS no tienen pestaña: sin lienzo no hay programa.
   6. La pestaña NO EXPULSA controles del panel. Un control para esconder
      paneles no puede costar herramientas.
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
    await wait(900); return true; })()`);

  const FOTO = `(() => {
    const mesa = document.querySelector(".dz-canvas");
    const mr = mesa ? mesa.getBoundingClientRect() : null;
    const p = {};
    for (const [id, meta] of Object.entries(LOW.workspace.PANEL_CATALOG)) {
      const el = document.querySelector(meta.element);
      if (!el || el.hidden) continue;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) continue;
      const t = el.querySelector(":scope > .dz-panel-pestania");
      const tr = t ? t.getBoundingClientRect() : null;
      // apretable de verdad: el punto del medio de la pestaña tiene que
      // devolverla a ella (o a un hijo suyo), no a otra cosa encima
      let alcanzable = false;
      if (tr && tr.width > 0 && tr.height > 0) {
        const enc = document.elementFromPoint(Math.round(tr.left + tr.width/2), Math.round(tr.top + tr.height/2));
        alcanzable = !!(enc && (enc === t || t.contains(enc)));
      }
      /* ¿La pestaña expulsó controles del panel? Se cuentan los botones
         PROPIOS que quedan fuera de la caja del panel. Sin barra de
         desplazamiento, un botón fuera es un botón inalcanzable. */
      const propios = [...el.querySelectorAll("button,[data-tool]")]
        .filter(x => !x.classList.contains("dz-panel-pestania"))
        .filter(x => { const q = x.getBoundingClientRect(); return q.width > 2 && q.height > 2; });
      const expulsados = propios.filter(x => { const q = x.getBoundingClientRect();
        return q.bottom > b.bottom + 1 || q.top < b.top - 1 || q.right > b.right + 1; });
      const cs = getComputedStyle(el);
      p[id] = { w: Math.round(b.width), h: Math.round(b.height), fijo: !!meta.fijo, dueno: meta.owner || null,
        controles: propios.length, expulsados: expulsados.length,
        cualesFuera: expulsados.slice(0,3).map(x => x.id || (x.getAttribute("title")||"").slice(0,24)),
        puedeDesplazarse: el.scrollHeight > el.clientHeight && /auto|scroll/.test(cs.overflowY),
        pestania: !!t, tw: tr ? Math.round(tr.width) : 0, th: tr ? Math.round(tr.height) : 0,
        alcanzable, plegado: el.getAttribute("data-plegado") || null,
        dice: t ? t.getAttribute("aria-expanded") : null };
    }
    return { mesa: mr ? { w: Math.round(mr.width), h: Math.round(mr.height) } : null, paneles: p };
  })()`;

  const inicio = await ev(FOTO);
  if (!inicio.mesa) mal("no hay lienzo que medir", inicio);

  // 5. los fijos no llevan pestaña
  for (const [id, v] of Object.entries(inicio.paneles))
    if (v.fijo && v.pestania) mal("el panel fijo «" + id + "» tiene pestaña: no se puede esconder el lienzo", v);

  /* LA PESTAÑA NO PUEDE COSTAR HERRAMIENTAS. Encontró un defecto real: al
     dejarla en el flujo con `flex: 0 0 100%`, el riel de herramientas —que a
     768 px de alto entra JUSTO, 594 de contenido en 594 de panel— pasó a
     1047 px y dejó 15 de sus 16 botones fuera, sin barra de desplazamiento
     con qué alcanzarlos. El guardia anterior sólo exigía que la pestaña se
     viera, así que dio verde mientras quince herramientas eran inalcanzables. */
  for (const [id, v] of Object.entries(inicio.paneles)) {
    if (!v.pestania || !v.expulsados) continue;
    if (!v.puedeDesplazarse)
      mal("la pestaña de «" + id + "» dejó " + v.expulsados + " de sus " + v.controles +
          " controles fuera del panel, y el panel no se puede desplazar: son inalcanzables",
          { panel: v });
  }

  const plegables = Object.entries(inicio.paneles).filter(([, v]) => v.pestania).map(([k]) => k);
  if (plegables.length < 2) mal("hay menos de dos paneles plegables: no se está midiendo nada", inicio.paneles);

  // 1 a 3: uno por uno, para saber CUÁL falla y no sólo que algo falla
  const resultados = {};
  for (const id of plegables) {
    const antes = (await ev(FOTO));
    if (!antes.paneles[id]) continue;
    await ev(`dzPlegarPanel(${JSON.stringify(id)})`); await w(500);
    const plegado = await ev(FOTO);
    const pa = antes.paneles[id], pp = plegado.paneles[id];
    if (!pp) mal("plegar «" + id + "» hizo desaparecer el panel entero: no hay cómo traerlo de vuelta",
      { antes: pa });

    const achico = (pa.w * pa.h) - (pp.w * pp.h);
    if (achico <= 0) mal("plegar «" + id + "» no achicó nada", { antes: pa, plegado: pp });

    // 2. LA QUE ENCONTRÓ LOS DOS DEFECTOS REALES
    if (!(pp.tw > 8 && pp.th > 8))
      mal("plegado, la pestaña de «" + id + "» quedó de " + pp.tw + "×" + pp.th + " px: " +
          "no hay forma de traer el panel de vuelta", { antes: pa, plegado: pp });
    if (!pp.alcanzable)
      mal("plegado, la pestaña de «" + id + "» no recibe el clic: hay algo encima", { plegado: pp });
    if (pp.dice !== "false")
      mal("plegado, la pestaña de «" + id + "» sigue diciendo que está desplegada", { plegado: pp });

    await ev(`dzPlegarPanel(${JSON.stringify(id)})`); await w(500);
    const vuelta = (await ev(FOTO)).paneles[id];
    // 3. vuelve al tamaño exacto
    if (!vuelta || Math.abs(vuelta.w - pa.w) > 1 || Math.abs(vuelta.h - pa.h) > 1)
      mal("desplegar «" + id + "» no devolvió el tamaño: era " + pa.w + "×" + pa.h +
          " y volvió " + (vuelta ? vuelta.w + "×" + vuelta.h : "nada"), { antes: pa, vuelta });
    resultados[id] = { de: pa.w + "×" + pa.h, a: pp.w + "×" + pp.h, pestania: pp.tw + "×" + pp.th };
  }

  // 1. y juntas devuelven mesa
  const columnas = plegables.filter((id) => {
    const v = inicio.paneles[id]; return v.h > v.w * 1.3;
  });
  if (columnas.length) {
    const antes = await ev(FOTO);
    for (const id of columnas) await ev(`dzPlegarPanel(${JSON.stringify(id)})`);
    await w(700);
    const con = await ev(FOTO);
    if (!(con.mesa.w > antes.mesa.w))
      mal("plegar las columnas no le devolvió ancho al lienzo: esconder paneles no sirvió de nada",
          { antes: antes.mesa, despues: con.mesa });
    resultados.mesaGanada = con.mesa.w - antes.mesa.w;

    // 4. sobrevive al cambio de espacio, y lo que dice coincide con lo que se ve
    await ev(`(async()=>{ const wait = ms => new Promise(x=>setTimeout(x,ms));
      for (const n of ["Color", "Dibujo"]) {
        const t = [...document.querySelectorAll("#dzWorkspaces .dz-ws-tab")]
          .find(b => (b.textContent||"").trim() === n);
        if (t) { t.click(); await wait(800); }
      } return true; })()`);
    const tras = await ev(FOTO);
    for (const id of columnas) {
      const v = tras.paneles[id];
      if (!v) continue;   // ese espacio no muestra ese panel: no hay nada que comprobar
      const dicePlegado = v.dice === "false";
      if (dicePlegado !== !!v.plegado)
        mal("tras cambiar de espacio, la pestaña de «" + id + "» dice una cosa y se ve otra", v);
    }
    for (const id of columnas) await ev(`dzPlegarPanel(${JSON.stringify(id)})`);
    await w(500);
  }

  const crasheos = errores.filter((e) => /TypeError|ReferenceError/.test(e));
  if (crasheos.length) mal("las pestañas tiraron errores", crasheos.slice(0, 3));

  console.log("E2E paneles plegables OK " + JSON.stringify({ plegables: plegables.length, ...resultados }));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
