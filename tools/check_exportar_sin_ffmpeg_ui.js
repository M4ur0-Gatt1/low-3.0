/* EXPORTAR SIN ffmpeg: EL BOTÓN PRINCIPAL TIENE QUE ANDAR. CDP :9223 + mock :8791.

   POR QUE EXISTE. Medido el 3-oct-2026 en la app real, en una máquina como la
   de cualquier chico (sin ffmpeg instalado): el diálogo de exportar ofrece
   «Video MP4» como botón PRINCIPAL, y apretarlo sólo deja un aviso chico en la
   barra de estado —«exportar MP4 necesita ffmpeg en el PATH»—. El primer
   intento de sacar la animación fracasa con una palabra que no conocen.

   Se exige: si el puente dice que MP4 no está disponible en esta máquina, el
   principal pasa a ser GIF (que anda sin nada), MP4 dice qué le falta, y
   apretarlo EXPLICA en un aviso en vez de intentar y fallar. Si el puente no
   dice nada, el diálogo queda como siempre. */
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
  const clicEn = async (expr, que) => {
    let p = null;
    for (let i = 0; i < 30 && !p; i++) {
      p = await ev(`(()=>{const e=${expr}; if(!e) return null; const r=e.getBoundingClientRect();
        if(!r.width||!r.height) return null; return {x:r.x+r.width/2, y:r.y+r.height/2};})()`);
      if (!p) await wait(100);
    }
    assert.ok(p, que);
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(400); };
  const dialogo = () => ev(`(()=>{ const m = document.querySelector("#overlay:not([hidden]) #modal"); if (!m) return null;
    const b = [...m.querySelectorAll("[data-x]")];
    return { principal: (b.find(x => x.classList.contains("primary")) || {}).dataset?.x || null,
      primero: b[0] ? b[0].dataset.x : null,
      mp4: (b.find(x => x.dataset.x === "mp4") || {}).textContent || null,
      texto: m.textContent.trim().slice(0, 200) }; })()`);
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!window.LOW?.workspace?.workspaces').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2200);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');
    // un trazo para que haya algo que exportar
    await clicEn(`document.querySelector('[data-tool="brush"]')`, "no está el pincel");
    const h = await ev(`(()=>{const r=document.querySelector("#dzCanvas > svg").getBoundingClientRect(); return {x:r.x+r.width*0.3,y:r.y+r.height*0.5};})()`);
    await mouse("mouseMoved", h.x, h.y); await mouse("mousePressed", h.x, h.y, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 8; i++) { await mouse("mouseMoved", h.x + i * 30, h.y + i * 5, { buttons: 1 }); await wait(12); }
    await mouse("mouseReleased", h.x + 240, h.y + 40, { buttons: 0, clickCount: 1 }); await wait(700);
    await ev(`(()=>{ window.__exportados = []; window.__pngs = {}; api.export_anim = async (r, pngs, fps, kind) => { window.__exportados.push(kind); window.__pngs[kind] = pngs[0]; return { path: "export/x", n: pngs.length }; }; return true; })()`);

    // ── 1. EL PUENTE DICE QUE NO HAY MP4 ─────────────────────────────────────
    await ev(`(()=>{ api.export_capacidades = async () => ({ mp4: false }); return true; })()`);
    await ev(`dzMenuAction("exportar")`); await wait(700);
    const sin = await dialogo();
    assert.ok(sin, "no se abrió el diálogo de exportar");
    assert.equal(sin.principal, "gif",
      "sin ffmpeg el botón PRINCIPAL sigue siendo «Video MP4», que en esta máquina no puede andar · " + JSON.stringify(sin));
    assert.equal(sin.primero, "gif", "GIF tiene que ser la primera opción cuando MP4 no anda · " + JSON.stringify(sin));
    assert.ok(/ffmpeg/i.test(sin.mp4 || ""), "MP4 no dice qué le falta · " + JSON.stringify(sin));
    await clicEn(`document.querySelector('#overlay:not([hidden]) #modal [data-x="mp4"]')`, "no está el botón MP4");
    await wait(500);
    const explica = await ev(`((document.querySelector("#overlay:not([hidden]) #modal") || {}).textContent || "").trim()`);
    assert.ok(/ffmpeg/i.test(explica) && /gif/i.test(explica),
      "apretar MP4 sin ffmpeg no explica nada en pantalla (el aviso iba a la barra de estado) · " + JSON.stringify(explica.slice(0, 200)));
    assert.deepEqual(await ev("window.__exportados"), [], "intentó exportar MP4 igual");
    await ev(`(()=>{ const b = document.querySelector("#overlay:not([hidden]) #modal button"); if (b) b.click(); return true; })()`); await wait(300);

    // ── 2. EL PUENTE DICE QUE SÍ: el diálogo de siempre ──────────────────────
    await ev(`(()=>{ api.export_capacidades = async () => ({ mp4: true }); return true; })()`);
    await ev(`dzMenuAction("exportar")`); await wait(700);
    const con = await dialogo();
    assert.equal(con.principal, "mp4", "con ffmpeg disponible, MP4 tiene que seguir siendo el principal · " + JSON.stringify(con));
    await ev(`(()=>{ closeModal(); return true; })()`);

    // ── 3. EL TAMAÑO: lo exportado sale en la resolución del DOCUMENTO ───────
    //    Medido en la app real: MP4, GIF y PNG salían en 1080×608 para un
    //    documento de 1920×1080 (el lado mayor se topeaba en 1080 para todo).
    //    MP4 y PNG van a resolución completa; el GIF conserva el tope de 1080,
    //    que es lo razonable para compartirlo.
    const medir = (kind) => ev(`(async()=>{ await dzDoExport(${JSON.stringify(kind)}); const du = window.__pngs[${JSON.stringify(kind)}];
      if (!du) return null; const img = new Image(); img.src = du; await img.decode(); return [img.naturalWidth, img.naturalHeight]; })()`);
    const docTam = await ev("[DZ.doc.scene.width, DZ.doc.scene.height]");
    const png = await medir("png");
    assert.deepEqual(png, docTam, "la secuencia PNG no sale en la resolución del documento · " + JSON.stringify({ png, docTam }));
    const gif = await medir("gif");
    assert.ok(gif && Math.max(...gif) <= 1080 && gif[0] / gif[1] > 1.7, "el GIF no conserva su tope ni la proporción · " + JSON.stringify(gif));

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    assert.deepEqual(graves.slice(0, 3), [], "hubo excepciones durante el recorrido");
    console.log("E2E exportar sin ffmpeg OK " + JSON.stringify({ sin: sin.principal, con: con.principal }));
  } finally {
    ws.close(); try { await fetch(endpoint + "/json/close/" + tab.id); } catch (_) { }
  }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
