/* LA MESA NO SE DESFASA AL DESPLAZARLA CON LA RUEDA (v3.36.2). CDP :9223 + mock :8791.

   Reporte de Mauro (capturas): «se desfasa de la cámara y la mesa de trabajo…
   la cámara y la mesa están súper lejos» — el marco de la cámara, el recuadro
   de selección y la imagen del play quedaban unos 170 px corridos de la hoja.

   MEDIDO: cuando la hoja no entra (zoom grande, o una imagen enorme), el
   lienzo (#dzCanvas, overflow auto) se DESPLAZA con la rueda. La hoja se
   desplaza con él, pero las capas de encima (marco de cámara, recuadro de
   transformación, imagen de la reproducción) se ubican midiendo desde el
   borde VISIBLE del lienzo: con 160 px de desplazamiento la hoja se movía
   160 y el marco de la cámara 320.

   Con la rueda de verdad (sin Alt) sobre la hoja con zoom ×3:
   1. el lienzo no queda desplazado: la rueda mueve la mesa (paneo);
   2. el marco de la cámara (sin claves = la hoja) coincide con la hoja;
   3. el recuadro de un objeto elegido coincide con el objeto;
   4. reproduciendo, la imagen del play coincide con la hoja. */
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
  const R = `(n) => { if (!n || n.hidden || getComputedStyle(n).display === "none") return null; const r = n.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }`;
  const cerca = (a, b, tol = 3) => a && b && Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol && Math.abs(a.w - b.w) <= tol * 2 && Math.abs(a.h - b.h) <= tol * 2;

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 560, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    // un rectángulo dibujado, elegido; el modo cámara (sin claves: el marco es la hoja); zoom ×3
    await ev(`(async()=>{ if (typeof closeL3d === "function") closeL3d(); const svg = document.querySelector("#dzCanvas > svg");
      const vb = svg.getAttribute("viewBox").split(/[ ,]+/).map(Number);
      const el = document.createElementNS("http://www.w3.org/2000/svg", "rect"); el.setAttribute("x", vb[0] + vb[2] * 0.45); el.setAttribute("y", vb[1] + vb[3] * 0.45); el.setAttribute("width", 120); el.setAttribute("height", 90); el.setAttribute("fill", "#c33");
      dzArtAppend(svg, el); dzSetTool("select"); dzSelect(el); if (!DZ.camMode) dzCamToggle(); dzSetTool("select");
      const r = document.querySelector("#dzCanvas").getBoundingClientRect(); dzZoomAt(3, r.left + r.width / 2, r.top + r.height / 2); dzSelect(el); return 1; })()`);
    await wait(400);
    const c = await ev(`(()=>{ const r = document.querySelector("#dzCanvas").getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`);
    const antes = await ev(`(${R})(document.querySelector("#dzCanvas > svg"))`);
    // ── la rueda de verdad, sin Alt ──
    for (let i = 0; i < 3; i++) { await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: c[0], y: c[1], deltaX: 0, deltaY: 120 }); await wait(150); }
    await wait(300);
    const m = await ev(`(()=>{ const R = ${R}; const cv = document.querySelector("#dzCanvas");
      return { scroll: [cv.scrollLeft, cv.scrollTop], hoja: R(cv.querySelector(":scope > svg")), camara: R(document.querySelector("#dzCam")),
        obj: R(DZ.sel), box: R(document.querySelector("#dzSelBox")) }; })()`);
    assert.ok(m.hoja.y < antes.y - 30, "la rueda no movió la mesa: " + JSON.stringify({ antes, m }));
    assert.deepEqual(m.scroll, [0, 0], "la rueda dejó el lienzo DESPLAZADO (las capas de encima se corren): " + JSON.stringify(m));
    assert.ok(cerca(m.camara, m.hoja), "el marco de la cámara se desfasó de la hoja: " + JSON.stringify(m));
    assert.ok(cerca(m.box, m.obj), "el recuadro de selección se desfasó del objeto: " + JSON.stringify(m));

    // ── un desplazamiento que no viene de la rueda (scrollIntoView, el navegador) ──
    await ev(`(()=>{ const cv = document.querySelector("#dzCanvas"); cv.scrollTop = 120; cv.scrollLeft = 30; return 1; })()`); await wait(300);
    const m2 = await ev(`(()=>{ const R = ${R}; const cv = document.querySelector("#dzCanvas"); dzCamOverlay();
      return { scroll: [cv.scrollLeft, cv.scrollTop], hoja: R(cv.querySelector(":scope > svg")), camara: R(document.querySelector("#dzCam")), obj: R(DZ.sel), box: R(document.querySelector("#dzSelBox")) }; })()`);
    assert.deepEqual(m2.scroll, [0, 0], "un desplazamiento del navegador dejó el lienzo corrido: " + JSON.stringify(m2));
    assert.ok(cerca(m2.camara, m2.hoja) && cerca(m2.box, m2.obj), "tras un desplazamiento del navegador, cámara o recuadro se desfasaron: " + JSON.stringify(m2));

    // ── reproduciendo: la imagen del play sobre la hoja ──
    await ev(`(()=>{ if (DZ.camMode) dzCamToggle(); dzDeselect(); return 1; })()`);
    await ev(`(()=>{ dzPlayToggle(); return 1; })()`); await wait(1800);
    const m3 = await ev(`(()=>{ const R = ${R}; return { hoja: R(document.querySelector("#dzCanvas > svg")), repro: R(document.querySelector("#dzReproFluida")) }; })()`);
    await ev(`(()=>{ if (DZ.playback && DZ.playback.playing) dzPlayToggle(); return 1; })()`);
    if (m3.repro) assert.ok(cerca(m3.repro, m3.hoja, 4), "reproduciendo, la imagen del play quedó lejos de la hoja: " + JSON.stringify(m3));

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E mesa desplazada OK", JSON.stringify({ m, m3 }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
