/* LA CALIDAD DEL TRAZO, medida con lápiz sintético (CDP pen). CDP :9223 + mock :8791.

   Fase 2 del plan (oct-2026). Valores medidos ANTES de los arreglos, con el
   suavizado por omisión (40):
     · detalle chico (zigzag de 8 px): quedaba al 58 % de su altura
     · círculo rápido: 97,7 % del radio dibujado
     · línea lenta: arrancaba 96 unidades ANTES del punto de apoyo (sobrepaso
       de la curva) una vez corregido el suavizado
     · línea rápida: terminaba 1,1 % corta
   Se exige, en lápiz y en pincel: detalle >= 80 %, círculo entre 97 y 102 %,
   el temblor de una línea lenta borrado (desvío < 1,5 unidades), sin
   sobrepaso al inicio, y la línea rápida terminando donde se levantó. */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223", url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
async function medir(herramienta) {
  const suavizado = undefined;
  const tab = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl); let id = 0; const pend = new Map();
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ({ data }) => { const m = JSON.parse(data); const p = pend.get(m.id); if (p) { pend.delete(m.id); p(m); } };
  const send = (method, params = {}) => new Promise(r => { const n = ++id; pend.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async e => { const r = await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300)); return r.result?.result?.value; };
  const w = ms => new Promise(r => setTimeout(r, ms));
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await send("Page.navigate", { url });
  for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api') === true) break; await w(300); }
  await ev('(()=>{try{localStorage.clear()}catch(e){}; return 1;})()');
  await ev('dzMenuAction("nuevo")'); await w(2500);
  await ev('(()=>{ if (typeof closeL3d==="function") closeL3d(); return 1; })()');
  await ev(`dzSetTool(${JSON.stringify(herramienta)})`);
  if (suavizado != null) await ev(`(()=>{ DZ.smooth = ${Number(suavizado)}; return 1; })()`);
  const info = await ev('({ smooth: DZ.smooth, tool: DZ.tool, zoom: DZ.zoom })');
  const pen = (type, x, y, force = 0.6, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", pointerType: "pen", force, ...extra });
  // un trazo: lista de [x,y,presion] en PANTALLA, con un intervalo entre eventos
  const cuantos = () => ev(`document.querySelectorAll('#dzCanvas > svg g[data-low-art] > *').length`);
  async function trazo(puntos, ms) {
    const antes = await cuantos();
    const [x0, y0, p0] = puntos[0];
    await pen("mouseMoved", x0, y0, 0);
    await pen("mousePressed", x0, y0, p0, { buttons: 1, clickCount: 1 });
    for (const [x, y, p] of puntos.slice(1)) { await pen("mouseMoved", x, y, p, { buttons: 1 }); if (ms) await w(ms); }
    const [xf, yf, pf] = puntos.at(-1);
    await pen("mouseReleased", xf, yf, 0, { buttons: 0, clickCount: 1 });
    await w(700);
    const despues = await cuantos();
    if (despues <= antes) return { noSeCreo: true, antes, despues };
    // el último elemento dibujado, muestreado en coordenadas del DOCUMENTO
    return ev(`(()=>{ const svg = document.querySelector("#dzCanvas > svg");
      const arte = [...svg.querySelectorAll('g[data-low-art] > *')];
      const el = arte.at(-1); if (!el) return null;
      const muestras = [];
      const geoms = el.tagName === "path" ? [el] : [...el.querySelectorAll("path,line,polyline")];
      for (const g of geoms) { if (!g.getTotalLength) continue; const L = g.getTotalLength(); const n = Math.max(2, Math.ceil(L / 2));
        for (let i = 0; i <= n; i++) { const p = g.getPointAtLength(L * i / n); muestras.push([p.x, p.y]); } }
      const aDoc = (x, y) => { const q = dzToUser(x, y); return [q.x, q.y]; };
      return { tag: el.tagName, d: (el.getAttribute("d") || "").length, muestras, aDoc: ${JSON.stringify(puntos)}.map(([x, y]) => aDoc(x, y)) }; })()`);
  }
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const distSeg = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy; const t = L ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)) : 0; return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)); };
  const informe = {};
  // todo se dibuja DENTRO de la hoja: el rectángulo real del svg en pantalla
  const H = await ev('(()=>{ const r = document.querySelector("#dzCanvas > svg").getBoundingClientRect(); return {x:r.x, y:r.y, w:r.width, h:r.height}; })()');
  const X = (f) => H.x + H.w * f, Y = (f) => H.y + H.h * f;
  informe.hoja = [Math.round(H.x), Math.round(H.y), Math.round(H.w), Math.round(H.h)];
  // 1. línea RÁPIDA: 400 px en 8 eventos (mouse a 60 Hz, mano rápida)
  {
    const pts = []; for (let i = 0; i <= 8; i++) pts.push([X(0.15) + i * (H.w * 0.7 / 8), Y(0.2), 0.4 + 0.4 * Math.sin(Math.PI * i / 8)]);
    const r = await trazo(pts, 16);
    const fin = r.aDoc.at(-1), ini = r.aDoc[0], largo = dist(ini, fin);
    const finPath = r.muestras.reduce((m, p) => dist(p, ini) > dist(m, ini) ? p : m, r.muestras[0]);
    informe.lineaRapida = { cortaFinal: +(dist(finPath, fin) / largo * 100).toFixed(1) + "%",
      desvioMax: +(Math.max(...r.muestras.map(p => distSeg(p, ini, fin))) / largo * 100).toFixed(2) + "%" };
  }
  // 2. CÍRCULO rápido de radio 120 px en 24 eventos
  {
    const pts = []; for (let i = 0; i <= 24; i++) { const a = 2 * Math.PI * i / 24; pts.push([X(0.5) + H.h * 0.3 * Math.cos(a), Y(0.55) + H.h * 0.3 * Math.sin(a), 0.6]); }
    const r = await trazo(pts, 16);
    const c = r.aDoc.slice(0, -1).reduce((s, p) => [s[0] + p[0] / 24, s[1] + p[1] / 24], [0, 0]);
    const rIdeal = dist(r.aDoc[0], c);
    const rMedio = r.muestras.reduce((s, p) => s + dist(p, c), 0) / r.muestras.length;
    informe.circulo = { radio: +(rMedio / rIdeal * 100).toFixed(1) + "% del dibujado" };
  }
  // 3. línea LENTA con temblor de 1 px (pulso), 200 eventos
  {
    const pts = []; for (let i = 0; i <= 200; i++) pts.push([X(0.1) + i * (H.w * 0.8 / 200), Y(0.9) + (i % 2 ? 1 : -1), 0.5]);
    const r = await trazo(pts, 0);
    if (r.noSeCreo) { informe.lineaLenta = { NO_SE_CREO_EL_TRAZO: r }; } else {
    const ini = r.aDoc[0], fin = r.aDoc.at(-1);
    const bbL = (arr) => { const xs = arr.map(p => p[0]), ys = arr.map(p => p[1]); return [Math.round(Math.min(...xs)), Math.round(Math.max(...xs)), Math.round(Math.min(...ys)), Math.round(Math.max(...ys))]; };
    informe.lineaLentaDebug = { tag: r.tag, muestras: r.muestras.length, bboxSalida: bbL(r.muestras), bboxEntrada: bbL(r.aDoc) };
    informe.lineaLenta = { desvioMax: +(Math.max(...r.muestras.map(p => distSeg(p, ini, fin)))).toFixed(2) + " u.doc", temblorDeEntrada: +(Math.abs(r.aDoc[1][1] - r.aDoc[0][1])).toFixed(2) + " u.doc" }; }
  }
  // 4. DETALLE chico: un zigzag de 12 px
  {
    const pts = [[X(0.8), Y(0.4), .5], [X(0.8) + 4, Y(0.4) - 8, .5], [X(0.8) + 8, Y(0.4), .5], [X(0.8) + 12, Y(0.4) - 8, .5], [X(0.8) + 16, Y(0.4), .5]];
    const r = await trazo(pts, 16);
    if (r.noSeCreo) { informe.detalle = { NO_SE_CREO_EL_TRAZO: r }; } else {
    const bb = (arr) => { const xs = arr.map(p => p[0]), ys = arr.map(p => p[1]); return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)]; };
    const bi = bb(r.aDoc), bo = r ? bb(r.muestras) : [0, 0];
    informe.detalle = { existe: !!r, alto: +(bo[1] / bi[1] * 100).toFixed(0) + "% del dibujado", ancho: +(bo[0] / bi[0] * 100).toFixed(0) + "%" }; }
  }
  ws.close(); await fetch(endpoint + "/json/close/" + tab.id);
  return { herramienta, ...info, ...informe };
}

(async () => {
  for (const h of ["pencil", "brush"]) {
    const m = await medir(h);
    const n = (t) => parseFloat(String(t));
    assert.ok(!m.lineaLenta.NO_SE_CREO_EL_TRAZO && !m.detalle.NO_SE_CREO_EL_TRAZO, h + ": un trazo no se creó · " + JSON.stringify(m));
    assert.ok(n(m.detalle.alto) >= 80, h + ": el detalle chico se aplastó al " + m.detalle.alto + " (era 58 % con la media por puntos)");
    assert.ok(n(m.circulo.radio) >= 97 && n(m.circulo.radio) <= 102, h + ": el círculo quedó al " + m.circulo.radio);
    assert.ok(n(m.lineaLenta.desvioMax) < 1.5, h + ": el temblor de la línea lenta no se fue: desvío " + m.lineaLenta.desvioMax);
    assert.ok(m.lineaLentaDebug.bboxSalida[0] >= m.lineaLentaDebug.bboxEntrada[0] - 1,
      h + ": la curva arranca ANTES del punto de apoyo (sobrepaso de Catmull-Rom) · " + JSON.stringify(m.lineaLentaDebug));
    assert.ok(n(m.lineaRapida.cortaFinal) <= 0.5, h + ": la línea rápida no termina donde se levantó el lápiz: queda " + m.lineaRapida.cortaFinal + " corta");
    console.log("E2E trazo " + h + " OK " + JSON.stringify({ detalle: m.detalle.alto, circulo: m.circulo.radio, lenta: m.lineaLenta.desvioMax, rapida: m.lineaRapida.cortaFinal }));
  }
})().catch(e => { console.error(e.stack || e); process.exit(1); });
