/* UNA IMAGEN IMPORTADA RESPETA SU POSICIÓN Y SU ESCALA, Y LOS RECUADROS DE
   SELECCIÓN LA SIGUEN (v3.36.2). CDP :9223 + mock :8791.

   Reporte de Mauro (captura con «WD45.webp importada al 50% de opacidad para
   calcar»): «hace cosas rarísimas con los cuadros de selección de los objetos
   o imágenes… no respeta la posición ni la escala».

   MEDIDO en la 3.36.1, importando una imagen vertical (300 × 700):
   - la imagen nacía SIN alto (sólo width="1536"): Chrome la dibujaba con su
     proporción y medía 3584 de alto en una hoja de 1080 — enorme, fuera de la
     hoja, con la esquina para escalar fuera de la pantalla;
   - el recuadro de transformación nacía de 2 px de alto (se medía antes de
     que la imagen cargara);
   - el MARCO de selección («1 pieza») sólo se redibujaba al elegir: al mover
     (y al escalar, hacer zoom o deshacer) quedaba en el lugar viejo.

   Con el mouse de verdad:
   1. Importar: la imagen entra ENTERA en la hoja, con su proporción y su alto
      escrito, y el recuadro la abraza.
   2. Moverla: el marco de selección la acompaña.
   3. Escalarla desde la esquina: se achica, y marco y recuadro la siguen.
   4. Zoom: el marco la sigue.
   5. Un documento viejo con una imagen sin alto: al abrirlo recibe el alto
      con que ya se veía (no cambia lo que se ve) y el recuadro la abraza. */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const tab = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pending = new Map(), errores = [];
  ws.onmessage = (m) => { const d = JSON.parse(m.data);
    if (d.method === "Runtime.exceptionThrown") errores.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    const p = pending.get(d.id); if (p) { pending.delete(d.id); d.error ? p.j(Error(d.error.message)) : p.r(d.result); } };
  const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; pending.set(n, { r, j }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const mouse = (type, x, y, b = 0) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: b, clickCount: 1 });
  const arrastrar = async (a, dx, dy) => {
    await mouse("mouseMoved", a[0], a[1]); await mouse("mousePressed", a[0], a[1], 1);
    for (let i = 1; i <= 10; i++) { await mouse("mouseMoved", a[0] + dx * i / 10, a[1] + dy * i / 10, 1); await wait(16); }
    await mouse("mouseReleased", a[0] + dx, a[1] + dy, 0); await wait(350);
  };
  const medir = () => ev(`(()=>{ const im = document.querySelector("#dzCanvas > svg image"); const R = (r) => r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null;
    const box = document.querySelector("#dzSelBox"), marco = document.querySelector("#dzSelMarco");
    return { alto: im.getAttribute("height"), img: R(im.getBoundingClientRect()), box: box && !box.hidden ? R(box.getBoundingClientRect()) : null,
      marco: marco && !marco.hidden ? R(marco.getBoundingClientRect()) : null, hoja: R(document.querySelector("#dzCanvas > svg").getBoundingClientRect()),
      vb: document.querySelector("#dzCanvas > svg").getAttribute("viewBox") }; })()`);
  const abraza = (a, b, tol) => a && b && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.w - b.w) <= tol * 2 && Math.abs(a.h - b.h) <= tol * 2;
  const imagen = (w, h) => `(()=>{ const c = document.createElement("canvas"); c.width = ${w}; c.height = ${h}; const g = c.getContext("2d"); g.fillStyle = "#c33"; g.fillRect(0, 0, ${w}, ${h}); g.fillStyle = "#fff"; g.fillRect(10, 10, ${w - 20}, ${h - 20}); return c.toDataURL("image/png"); })()`;

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');

    // ── 1. importar una imagen vertical ──
    await ev(`(async()=>{ const data = ${imagen(300, 700)}; api.import_ref_image = async () => ({ data, name: "alto.png" }); await dzImportImage(); return 1; })()`);
    await wait(400);
    let m = await medir();
    assert.ok(m.alto && Number(m.alto) > 0, "la imagen importada no tiene alto escrito: " + JSON.stringify(m));
    assert.ok(m.img.y >= m.hoja.y - 1 && m.img.y + m.img.h <= m.hoja.y + m.hoja.h + 1 && m.img.x >= m.hoja.x - 1 && m.img.x + m.img.w <= m.hoja.x + m.hoja.w + 1,
      "la imagen importada no entra entera en la hoja: " + JSON.stringify(m));
    assert.ok(Math.abs(m.img.w / m.img.h - 300 / 700) < 0.02, "la imagen importada perdió su proporción: " + JSON.stringify(m));
    assert.ok(abraza(m.box, m.img, 4), "al importar, el recuadro de transformación no abraza la imagen: " + JSON.stringify(m));

    // ── 2. moverla: el marco la acompaña ──
    await ev(`dzSetTool("select")`); await wait(200);
    await arrastrar([m.img.x + m.img.w / 2, m.img.y + m.img.h / 2], 70, 25);
    m = await medir();
    assert.ok(abraza(m.marco, m.img, 5), "al moverla, el marco de selección se quedó en el lugar viejo: " + JSON.stringify(m));
    assert.ok(abraza(m.box, m.img, 4), "al moverla, el recuadro no la sigue: " + JSON.stringify(m));

    // ── 3. escalarla desde la esquina ──
    const esq = await ev(`(()=>{ const hs = [...document.querySelectorAll("#dzSelBox .dz-sh")].filter(h => getComputedStyle(h).display !== "none"); const r = hs.map(h => h.getBoundingClientRect()).sort((a, b) => (b.x + b.y) - (a.x + a.y))[0]; return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; })()`);
    assert.ok(esq && esq[1] < 768 && esq[0] < 1366, "la esquina para escalar quedó fuera de la pantalla: " + JSON.stringify(esq));
    const antes = m.img;
    await arrastrar(esq, -40, -40);
    m = await medir();
    assert.ok(m.img.w < antes.w - 10, "escalar desde la esquina no la achicó: " + JSON.stringify({ antes, ahora: m.img }));
    assert.ok(abraza(m.marco, m.img, 5) && abraza(m.box, m.img, 4), "al escalarla, el marco o el recuadro no la siguen: " + JSON.stringify(m));

    // ── 4. zoom: el marco la sigue ──
    await ev(`(()=>{ const r = document.querySelector("#dzCanvas").getBoundingClientRect(); dzZoomAt(1.4, r.left + r.width / 2, r.top + r.height / 2); return 1; })()`); await wait(300);
    m = await medir();
    assert.ok(abraza(m.marco, m.img, 5), "al hacer zoom, el marco de selección no siguió a la imagen: " + JSON.stringify(m));
    assert.ok(abraza(m.box, m.img, 4), "al hacer zoom, el recuadro de transformación no siguió a la imagen: " + JSON.stringify(m));
    // con zoom, la esquina que se arrastra queda BAJO el cursor
    const esq2 = await ev(`(()=>{ const hs = [...document.querySelectorAll("#dzSelBox .dz-sh")].filter(h => getComputedStyle(h).display !== "none"); const r = hs.map(h => h.getBoundingClientRect()).sort((a, b) => (b.x + b.y) - (a.x + a.y))[0]; return r ? [r.x + r.width / 2, r.y + r.height / 2] : null; })()`);
    if (esq2 && esq2[0] < 1300 && esq2[1] < 700) {
      await arrastrar(esq2, 30, 30);
      m = await medir();
      // la esquina escala PROPORCIONAL: sigue al cursor en un eje y el otro acompaña la proporción
      const fin = [m.img.x + m.img.w, m.img.y + m.img.h];
      const enX = Math.abs(fin[0] - (esq2[0] + 30)) < 10, enY = Math.abs(fin[1] - (esq2[1] + 30)) < 10;
      assert.ok(enX || enY, "con zoom, la esquina escalada no siguió al cursor: " + JSON.stringify({ esq2, fin }));
      assert.ok(Math.abs(m.img.w / m.img.h - 300 / 700) < 0.02, "con zoom, escalar desde la esquina deformó la imagen: " + JSON.stringify(m.img));
      assert.ok(abraza(m.marco, m.img, 5) && abraza(m.box, m.img, 4), "con zoom, al escalar el marco o el recuadro no la siguen: " + JSON.stringify(m));
    }

    // ── 5. un documento viejo con una imagen SIN alto ──
    await ev(`(async()=>{ const data = ${imagen(400, 300)}; dzDeselect(); const svg = document.querySelector("#dzCanvas > svg"); svg.querySelectorAll("image").forEach(n => n.remove());
      const vb = svg.getAttribute("viewBox").split(/\\s+/).map(Number);
      const el = document.createElementNS("http://www.w3.org/2000/svg", "image"); el.setAttribute("href", data); el.setAttribute("x", vb[0] + 100); el.setAttribute("y", vb[1] + 50); el.setAttribute("width", 800);
      el.setAttribute("preserveAspectRatio", "xMidYMid meet"); (svg.querySelector("g[data-low-art]") || svg).appendChild(el);
      dzCanvasSet(svg.innerHTML ? svg.outerHTML : ""); return 1; })()`).catch(() => 0);
    await wait(600);
    const viejo = await ev(`(()=>{ const im = document.querySelector("#dzCanvas > svg image"); if (!im) return null; dzSelect(im); return { alto: im.getAttribute("height"), ancho: im.getAttribute("width") }; })()`);
    await wait(300);
    m = await medir();
    assert.ok(viejo && Number(viejo.alto) === 600, "la imagen vieja sin alto no recibió el alto con que se veía (800 × 300/400 = 600): " + JSON.stringify(viejo));
    assert.ok(abraza(m.box, m.img, 4), "en la imagen vieja, el recuadro no la abraza: " + JSON.stringify(m));

    // ── 6. cerrar la escena: la mesa queda VACÍA (Mauro: «lo cerré y sigue apareciendo abajo») ──
    const visibles = () => ev(`(()=>{ const cv = document.querySelector("#dzCanvas"); return [...cv.querySelectorAll(":scope > svg, #dzSelBox, #dzCam, #dzSelMarco, #dzRotate, #dzReproFluida")]
      .filter(n => { const r = n.getBoundingClientRect(), cs = getComputedStyle(n); return r.width > 4 && r.height > 4 && cs.display !== "none" && cs.visibility !== "hidden" && !n.hidden; })
      .map(n => n.id || n.tagName); })()`);
    await ev(`(()=>{ dzDocumentTabClose(DZ.activeDocumentTab); return 1; })()`); await wait(800);
    await ev(`(()=>{ const b = [...document.querySelectorAll("button")].find(x => /cerrar igualmente/i.test(x.textContent)); if (b) b.click(); return 1; })()`); await wait(1200);
    assert.deepEqual(await visibles(), [], "al cerrar la escena, la hoja o los recuadros siguen en la mesa");
    // ── 7. abrir otra: la hoja vuelve ──
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    assert.ok((await visibles()).includes("svg"), "al abrir otra escena la hoja no volvió");

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E imagen importada y recuadros de selección OK", JSON.stringify({ img: m.img }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
