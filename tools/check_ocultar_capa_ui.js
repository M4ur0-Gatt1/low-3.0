/* OCULTAR UNA CAPA LA OCULTA. CDP :9223 + mock :8791.

   Reporte de Mauro (oct-2026, LOW 3.15): «el botón ocultar capa no anda».
   Medido con clics de verdad, había dos ojos rotos:
   · el ojo de la línea de tiempo sobre la capa ACTIVA la marcaba oculta en
     el documento, pero su dibujo seguía en la mesa;
   · el ojo del panel de Capas era un span VACÍO de 18×0 px mientras el
     elemento estaba visible: el clic caía en la fila.

   Con el ratón de verdad, dos capas con un círculo cada una:
   1. Ojo de la línea de tiempo en la capa activa → su círculo deja de verse
      en la mesa (el de la otra capa sigue); otra vez → vuelve.
   2. Ojo de la otra capa → su fantasma se va de la mesa (lo que ya andaba).
   3. Panel de Capas: el ojo se ve y se puede tocar; un clic oculta el plano
      «Línea» (y su círculo deja de verse); otro clic lo muestra. */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

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
  /* clic de verdad en el CENTRO del elemento; devuelve qué recibió el clic */
  const clic = async (expr) => {
    const c = await ev(`(()=>{ const e = (${expr}); if (!e) return null; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect();
      window.__blanco = e; window.__recibio = null; document.addEventListener("click", (ev) => { window.__recibio = ev.target === e || e.contains(ev.target); }, { capture: true, once: true });
      return r.width && r.height ? [r.left + r.width / 2, r.top + r.height / 2] : [r.left + 1, r.top]; })()`);
    assert.ok(c, "no está: " + expr);
    for (const t of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type: t, x: c[0], y: c[1], button: "left", buttons: t === "mousePressed" ? 1 : 0, clickCount: 1 });
    await wait(500);
    return ev("window.__recibio");
  };
  /* ¿se ve el círculo de la mesa con este centro? (sin contar los fantasmas) */
  const seVe = (cx) => ev(`(()=>{ const svg = document.querySelector("#dzCanvas > svg");
    const c = [...svg.querySelectorAll("circle")].find(n => !n.closest(".dz-onion") && +n.getAttribute("cx") === ${cx});
    if (!c) return "no está"; for (let n = c; n && n !== svg; n = n.parentElement) { const s = getComputedStyle(n);
      if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0 || n.getAttribute("display") === "none") return false; } return true; })()`);
  const fantasma = () => ev(`[...document.querySelectorAll("#dzCanvas > svg g.dz-capa")].filter(g => getComputedStyle(g).display !== "none" && g.querySelector("circle")).length`);
  const ojoTl = (nombre) => `[...document.querySelectorAll(".tl2-name")].find(n => n.textContent.includes(${JSON.stringify(nombre)}))?.querySelector('.tl2-eye')`;   // el primero de la fila es el ojo (por título no: el globo de ayuda se lo saca mientras está el puntero encima)

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} window.__paginaVieja = 1; return true; })()');
    await send("Page.reload");
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); if (DZ.onionOn) { DZ.onionOn = false; dzOnionRender(); } return 1; })()');
    const DIB = (x) => '<g data-low-art="colour"></g><g data-low-art="line"><circle cx="' + x + '" cy="540" r="120" fill="none" stroke="#111" stroke-width="10"/></g>';
    await ev(`(()=>{ dzCanvasSet(${JSON.stringify(DIB(600))}); dzDocCommit(); return 1; })()`); await wait(400);
    await ev(`(()=>{ DZ.doc.addLayer("Capa 2"); DZ.doc.goTo(1); dzCanvasSet(${JSON.stringify(DIB(1200))}); dzDocCommit(); DZ.doc.emit("layers"); DZ.doc.emit("frame"); return 1; })()`); await wait(900);
    assert.equal(await seVe(1200), true, "el círculo de la capa activa no se ve al empezar");
    assert.equal(await fantasma(), 1, "la otra capa no se ve en la mesa al empezar");

    // ── 1. el ojo de la capa ACTIVA ─────────────────────────────────────────
    assert.ok(await clic(ojoTl("Capa 2")), "el clic en el ojo de la línea de tiempo no le llegó al ojo");
    assert.equal(await ev(`DZ.doc.layer.visible`), false, "el ojo no marcó oculta la capa activa");
    assert.equal(await seVe(1200), false, "con la capa activa oculta, su dibujo SIGUE en la mesa");
    assert.equal(await fantasma(), 1, "ocultar la capa activa escondió también la otra");
    const llego2 = await clic(ojoTl("Capa 2"));
    assert.equal(await seVe(1200), true, "al volver a mostrar la capa activa, su dibujo no volvió: " + JSON.stringify({ llego2,
      visible: await ev("DZ.doc.layer.visible"), clase: await ev("document.getElementById('dzCanvas').className"), ojo: await ev(`(${ojoTl("Capa 2")})?.title`) }));

    // ── 2. el ojo de la otra capa (ya andaba: que no se rompa) ─────────────
    await clic(ojoTl("Capa 1"));
    assert.equal(await fantasma(), 0, "ocultar la otra capa no la sacó de la mesa");
    assert.equal(await seVe(1200), true, "ocultar la otra capa escondió la activa");
    await clic(ojoTl("Capa 1"));
    assert.equal(await fantasma(), 1, "volver a mostrar la otra capa no la trajo");

    // ── 3. el ojo del panel de Capas ────────────────────────────────────────
    await ev(`(()=>{ try { LOW.workspace.panels.show("layers"); } catch (_) {} const e = document.querySelector(".dz-inspector"); if (e.hidden) e.hidden = false; dzBuildLayers(); return 1; })()`); await wait(500);
    const ojoPanel = `[...document.querySelectorAll(".dz-inspector .dz-lay-row")].find(r => r.querySelector(".dz-layer-t")?.textContent === "Línea")?.querySelector(".dz-eye")`;
    const caja = await ev(`(()=>{ const o = ${ojoPanel}; const r = o.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; })()`);
    assert.ok(caja[0] >= 12 && caja[1] >= 12, "el ojo del panel de Capas no se ve (mide " + caja.join("×") + ")");
    assert.ok(await clic(ojoPanel), "el clic en el ojo del panel de Capas cayó en la fila");
    assert.equal(await seVe(1200), false, "el ojo del panel de Capas no ocultó el plano Línea");
    assert.equal(await ev(`${ojoPanel}?.title`), "Mostrar", "el ojo del panel no cambió a «Mostrar»");
    await clic(ojoPanel);
    assert.equal(await seVe(1200), true, "el ojo del panel de Capas no volvió a mostrar el plano");

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E ocultar capa OK (línea de tiempo: activa y otra · panel de Capas)");
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
