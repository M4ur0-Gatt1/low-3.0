/* EL TRAZO SIGUE AL CURSOR SOBRE CUALQUIER SUPERFICIE DE BASE.
   CDP :9223 + estudio compilado en :8791/ui/estudio3d/.

   POR QUE EXISTE. Reportado: «todavia hay lineas que no respetan las guias o
   las superficies de base».

   MEDIDO, dibujando una recta horizontal por el centro de cada superficie
   (evento de puntero real, 20 pasos) y mirando la distancia entre cada par de
   puntos seguidos del trazo resultante:

     plano      salto maximo 0.03
     esfera     salto maximo 0.03
     cilindro   salto maximo 0.03
     loft       salto maximo 0.03
     TORO       salto maximo 1.82   <-- un tercio del largo total del trazo

   Y el trazo del toro ademas TERMINABA ANTES: el cursor llego a x=+2.7 y la
   linea se corto en x=+0.765.

   LA CAUSA. Cuando el rayo no le pega a la malla, `projectOnSurface` toma el
   punto del rayo mas cercano al CENTRO local de la superficie y lo pega a la
   piel. En el toro, con el cursor sobre el agujero ese punto queda casi en el
   centro; normalizar un vector casi nulo hace girar la direccion 180 grados
   de un cuadro al otro, y el punto pegado salta al OTRO LADO del agujero. El
   salto es de costado: la linea se va lejos de donde esta el cursor, que es
   lo peor que puede hacer una herramienta de dibujo.

   LO QUE SE CUIDA, para toda superficie curva:

   El trazo es CONTINUO: ningun salto entre dos puntos seguidos mayor al 15%
   del largo total (los sanos estan en el 1%).

   NO se exige que el trazo cubra todo lo que recorrio el cursor: al salir del
   volumen la linea se DESLIZA por la silueta a proposito, y entonces cubre
   menos. Medido en la esfera: el cursor recorre 5.4 y la linea 2.8, que es su
   diametro exacto. Tampoco se exige que adentro del agujero del toro el trazo
   se pegue a la piel: ahi no hay superficie. Lo unico que no puede pasar es
   que la linea SALTE lejos del cursor.

   Uso: node tools/check_3d_superficie_curva_ui.js [endpoint] [url]
*/
const endpoint = process.argv[2] || process.env.LOW_3D_CDP || "http://127.0.0.1:9223";
const url = process.argv[3] || process.env.LOW_3D_URL || "http://127.0.0.1:8791/ui/estudio3d/index.html";

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
    const to = setTimeout(() => { pend.delete(n); rej(Error("CDP sin respuesta: " + method)); }, 90000);
    pend.set(n, { resolve: v => { clearTimeout(to); res(v); }, reject: e => { clearTimeout(to); rej(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async x => { const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(String(r.exceptionDetails.exception?.description || "").split("\n")[0]);
    return r.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const trazo = async (x1, y1, x2, y2, pasos = 20) => {
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: x1, y: y1, button: "left", clickCount: 1 });
    for (let i = 1; i <= pasos; i++)
      await send("Input.dispatchMouseEvent", { type: "mouseMoved", button: "left", buttons: 1,
        x: Math.round(x1 + (x2 - x1) * i / pasos), y: Math.round(y1 + (y2 - y1) * i / pasos) });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: x2, y: y2, button: "left", clickCount: 1 });
    await w(380);
  };

  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  let listo = false;
  for (let i = 0; i < 160; i++) { if (await ev("!!window.__low3d && !!window.__lowStore").catch(() => false)) { listo = true; break; } await w(250); }
  if (!listo) mal("el motor 3D no arrancó", { url });
  await w(900);

  /* El panel «Guías» es un INTERRUPTOR: abrirlo dos veces lo cierra. */
  const elegir = async (nombre) => {
    await ev(`(() => { if (document.querySelector(".studio-option-grid")) return "ya";
      const b = [...document.querySelectorAll("button")]
        .find(x => (x.getAttribute("aria-label")||x.textContent||"").trim() === "Guías");
      if (b) b.click(); return "abierto"; })()`);
    await w(450);
    const r = await ev(`(() => { const b = [...document.querySelectorAll(".studio-option-grid button")]
      .find(x => (x.textContent||"").trim() === ${JSON.stringify(nombre)});
      if (!b) return { falta: true };
      if (b.getAttribute("aria-pressed") !== "true") b.click();
      return { tipo: (__lowStore.getState().activeSurface||{}).type }; })()`);
    await w(800);
    return r;
  };
  const donde = () => ev(`(() => {
    const a = __low3d.activeSurfaceObj && __low3d.activeSurfaceObj();
    if (!a) return null;
    const m = a.mesh || a; m.updateMatrixWorld(true); m.geometry.computeBoundingBox();
    const b = m.geometry.boundingBox; const cam = __low3d.camera;
    const r = __low3d.canvas.getBoundingClientRect();
    const centro = m.getWorldPosition(new cam.position.constructor());
    const p = centro.clone().project(cam);
    return { ancho: +(b.max.x - b.min.x).toFixed(2),
      cx: Math.round(r.left + (p.x*0.5+0.5)*r.width),
      cy: Math.round(r.top + (-p.y*0.5+0.5)*r.height) }; })()`);
  const medir = () => ev(`(() => {
    const st = __low3d.exportProject().strokes.filter(s => !s.guide);
    const ult = st[st.length - 1];
    if (!ult) return { sinTrazo: true };
    const pts = (ult.points || []).map(p => Array.isArray(p) ? p : [p.x,p.y,p.z]);
    let salto = 0, donde = -1, largo = 0;
    for (let i = 1; i < pts.length; i++) {
      const d = Math.hypot(pts[i][0]-pts[i-1][0], pts[i][1]-pts[i-1][1], pts[i][2]-pts[i-1][2]);
      largo += d; if (d > salto) { salto = d; donde = i; }
    }
    const xs = pts.map(p => p[0]);
    return { puntos: pts.length, saltoMax: +salto.toFixed(3), enPunto: donde,
      largo: +largo.toFixed(3), xMin: +Math.min(...xs).toFixed(3), xMax: +Math.max(...xs).toFixed(3) };
  })()`);

  const resultados = {};
  for (const tipo of ["Plano", "Esfera", "Cilindro", "Toro", "Loft"]) {
    await ev('__low3d.newProject(); __low3d.setView("front")'); await w(650);
    const el = await elegir(tipo);
    if (el && el.falta) mal("no está el botón de superficie en el panel Guías", { tipo });
    const d = await donde();
    if (!d) mal("elegir la superficie no dejó ninguna malla activa", { tipo, el });
    await ev(`document.querySelector('[data-tool="pencil"]').click()`); await w(250);
    await trazo(d.cx - 260, d.cy, d.cx + 260, d.cy, 20);
    const m = await medir();
    if (m.sinTrazo) mal("dibujar sobre la superficie no dejó ningún trazo", { tipo, d });
    resultados[tipo] = m;

    // 1. continuidad: ningún brinco grande respecto del largo del trazo
    const proporcion = m.largo > 0 ? m.saltoMax / m.largo : 0;
    if (proporcion > 0.15)
      mal("el trazo SALTA sobre la superficie: entre dos puntos seguidos se va " +
          Math.round(proporcion * 100) + "% del largo total, o sea que la línea se " +
          "aleja del cursor en vez de seguirlo", { tipo, ...m });

    /* NO se mide la cobertura. Al salir del volumen el trazo se DESLIZA por
       la silueta a propósito —es lo que hace Feather y lo que uno espera al
       dibujar sobre un cuerpo—, así que la línea cubre menos que el cursor y
       eso está bien. Medido en la esfera: el cursor recorre 5.4 y la línea
       2.8, que es justo su diámetro. Lo que NO puede pasar es que salte. */
  }

  const crasheos = errores.filter((e) => /TypeError|ReferenceError/.test(e));
  if (crasheos.length) mal("el estudio tiró errores mientras se dibujaba", crasheos.slice(0, 3));

  console.log("E2E el trazo sigue al cursor sobre superficies curvas OK " + JSON.stringify(resultados));
  ws.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
