/* EL BALDE DE PINTURA, en las zonas chicas y sin huecos blancos. CDP :9223 + mock :8791.

   Reporte de Mauro (oct-2026, LOW 3.11): «revisá el bote de pintura, me
   parece que no anda». MEDIDO en la app real, a 200 %:
   1. un clic adentro de un CÍRCULO CHICO (un ojo, un botón) que está dentro
      de una zona ya pintada RECOLOREABA LA ZONA GRANDE: el balde analizaba la
      hoja a 720 píxeles (casi 3 unidades por píxel) y el adentro del círculo
      chico desaparecía en el análisis;
   2. el borde del relleno era una ESCALERA de ~3 unidades;
   3. quedaban HUECOS BLANCOS entre el relleno y la línea: el relleno se
      frenaba antes de la línea en vez de meterse por DEBAJO (como en Toonz y
      Harmony).

   Con el mouse de verdad, en una capa vectorial:
   1. Balde adentro de un círculo grande → un relleno.
   2. Balde adentro de un círculo CHICO (radio 14: un ojo) adentro del grande → un
      relleno NUEVO, chico, de su color; el grande no cambia de color.
   3. Entre el relleno y la línea no queda papel blanco.
   4. El borde del relleno no es una escalera (sin giros de 90° entre píxeles).
   5. Una zona YA PINTADA partida por un círculo NUEVO: el balde en el círculo
      nuevo le da su propio relleno (antes recoloreaba la zona entera), y
      recolorear la zona sin líneas nuevas sigue andando. */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const tab = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl), pending = new Map(), errores = []; let id = 0;
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ({ data }) => { const m = JSON.parse(data);
    if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.j(Error(m.error.message)) : p.r(m.result); } };
  const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; pending.set(n, { r, j }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
  const clicEn = async (x, y) => { await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y, { buttons: 1, clickCount: 1 }); await mouse("mouseReleased", x, y, { buttons: 0, clickCount: 1 }); await wait(1500); };
  const pantalla = (x, y) => ev(`(()=>{ const q = dzToScreen(${x}, ${y}), r = document.querySelector("#dzCanvas").getBoundingClientRect(); return [q.x + r.left, q.y + r.top]; })()`);
  const circulo = async (cx, cy, rad) => {
    const pts = []; for (let i = 0; i <= 64; i++) { const t = i / 64 * Math.PI * 2 + .02; pts.push(await pantalla(cx + Math.cos(t) * rad, cy + Math.sin(t) * rad)); }
    await mouse("mouseMoved", pts[0][0], pts[0][1]); await mouse("mousePressed", pts[0][0], pts[0][1], { buttons: 1, clickCount: 1 });
    for (const [x, y] of pts.slice(1)) { await mouse("mouseMoved", x, y, { buttons: 1 }); await wait(8); }
    await mouse("mouseReleased", pts.at(-1)[0], pts.at(-1)[1], { buttons: 0, clickCount: 1 }); await wait(700);
  };
  const rellenos = () => ev(`[...document.querySelectorAll('#dzCanvas > svg [data-low="fill"]')].map(f => { const b = f.getBBox(); return { color: getComputedStyle(f).fill, w: Math.round(b.width), h: Math.round(b.height) }; })`);
  /* lo que se VE: la hoja rasterizada (sin el zoom de la vista), y el color en
     una lista de puntos del documento */
  const colores = (puntos) => ev(`(async()=>{ const svg = document.querySelector("#dzCanvas > svg"), vb = dzVB(), c = svg.cloneNode(true);
    c.removeAttribute("style"); c.setAttribute("viewBox", vb.join(" ")); c.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    c.querySelectorAll(".dz-onion, .dz-penui").forEach(n => n.remove());
    const url = await dzRasterize(c.outerHTML, vb[2]); const im = new Image(); im.src = url; await im.decode();
    const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height; const g = cv.getContext("2d"); g.drawImage(im, 0, 0);
    const k = im.width / vb[2]; return ${JSON.stringify(puntos)}.map(([x, y]) => { const d = g.getImageData(Math.round((x - vb[0]) * k), Math.round((y - vb[1]) * k), 1, 1).data; return [d[0], d[1], d[2]]; }); })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1500, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&typeof dzBucketApply==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); DZ.zoom = .5; DZ.panX = 0; DZ.panY = 0; dzApplyZoom(); dzSetTool("brush"); return true; })()'); await wait(300);

    // un círculo grande y uno CHICO adentro (radio 14 unidades: un ojo; en la app real fallaba con 15)
    await circulo(960, 540, 300);
    await circulo(860, 480, 14);
    await ev('(()=>{ dzSetTool("bucket"); return true; })()'); await wait(300);
    await ev(`(()=>{ if (typeof dzColoringPrefsSet === "function") { dzColoringPrefsSet("scope", "current"); dzColoringPrefsSet("mode", "paint"); } return true; })()`);

    // ── 1. el círculo grande ────────────────────────────────────────────────
    await ev(`(()=>{ DZ.fillColor = "#e5322d"; return true; })()`);
    const g = await pantalla(1100, 650); await clicEn(g[0], g[1]);
    const uno = await rellenos();
    assert.equal(uno.length, 1, "el balde no rellenó el círculo grande: " + JSON.stringify(uno));

    // ── 2. el círculo chico, adentro del grande ─────────────────────────────
    await ev(`(()=>{ DZ.fillColor = "#33b5e8"; return true; })()`);
    const ch = await pantalla(860, 480); await clicEn(ch[0], ch[1]);
    const dos = await rellenos();
    const azul = dos.find((f) => f.color === "rgb(51, 181, 232)"), rojo = dos.find((f) => f.color === "rgb(229, 50, 45)");
    assert.ok(rojo, "rellenar el círculo chico RECOLOREÓ la zona grande (el chico desaparecía en el análisis): " + JSON.stringify(dos));
    assert.ok(azul && azul.w < 45 && azul.h < 45, "el círculo chico no tiene su propio relleno: " + JSON.stringify(dos));

    // ── 3. sin papel blanco entre el relleno y la línea ────────────────────
    // un anillo de puntos justo por dentro de la línea del círculo grande
    const anillo = Array.from({ length: 180 }, (_, i) => { const t = i / 180 * Math.PI * 2; return [960 + Math.cos(t) * 294, 540 + Math.sin(t) * 294]; });
    const enAnillo = await colores(anillo);
    const blancos = enAnillo.filter(([r, gg, b]) => r > 235 && gg > 235 && b > 235).length;
    assert.ok(blancos <= 2, "queda papel blanco entre el relleno y la línea en " + blancos + " de 180 puntos");

    // ── 4. el borde no es una escalera ──────────────────────────────────────
    const giro = await ev(`(()=>{ const f = [...document.querySelectorAll('#dzCanvas > svg [data-low="fill"]')].find(x => getComputedStyle(x).fill === "rgb(229, 50, 45)");
      const L = f.getTotalLength(), q = []; for (let s = 0; s < L; s += 1) { const a = f.getPointAtLength(s); q.push([a.x, a.y]); }
      let sobre60 = 0; for (let i = 2; i < q.length - 2; i++) { const a = Math.atan2(q[i][1] - q[i-2][1], q[i][0] - q[i-2][0]), b = Math.atan2(q[i+2][1] - q[i][1], q[i+2][0] - q[i][0]);
        let d = Math.abs(b - a); if (d > Math.PI) d = 2 * Math.PI - d; if (d * 180 / Math.PI > 60) sobre60++; } return { sobre60, muestras: q.length }; })()`);
    assert.ok(giro.sobre60 <= giro.muestras * .02, "el borde del relleno es una escalera: " + JSON.stringify(giro));

    // ── 5. una zona YA PINTADA, partida por un círculo NUEVO ───────────────
    //    (el orden de la app real: primero el balde en el grande, después el
    //    ojo, después el balde en el ojo → recoloreaba el grande entero)
    await ev('(()=>{ dzSetTool("brush"); return true; })()'); await wait(200);
    await circulo(1080, 620, 15);
    await ev('(()=>{ dzSetTool("bucket"); DZ.fillColor = "#3fbf6f"; return true; })()'); await wait(300);
    const nuevo = await pantalla(1080, 620); await clicEn(nuevo[0], nuevo[1]);
    const tres = await rellenos();
    const verde = tres.find((f) => f.color === "rgb(63, 191, 111)"), sigueRojo = tres.find((f) => f.color === "rgb(229, 50, 45)");
    assert.ok(sigueRojo, "el balde en un círculo nuevo adentro de una zona ya pintada RECOLOREÓ la zona entera: " + JSON.stringify(tres));
    assert.ok(verde && verde.w < 45 && verde.h < 45, "el círculo nuevo no tiene su propio relleno: " + JSON.stringify(tres));
    // y recolorear una zona pintada SIN líneas nuevas sigue recoloreándola
    await ev('(()=>{ DZ.fillColor = "#f0a020"; return true; })()');
    const otraVez = await pantalla(1150, 450); await clicEn(otraVez[0], otraVez[1]);
    const cuatro = await rellenos();
    assert.ok(cuatro.some((f) => f.color === "rgb(240, 160, 32)" && f.w > 500) && cuatro.length === tres.length, "recolorear la zona grande dejó de andar: " + JSON.stringify(cuatro));

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E balde OK", JSON.stringify({ rellenos: dos, blancos, giro }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e); process.exit(1); });
