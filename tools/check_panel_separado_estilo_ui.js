/* LA VENTANA SEPARADA SE VE COMO EL ESTUDIO. CDP :9223 + mock :8791.

   POR QUE EXISTE. Reportado por Mauro (oct-2026): «cuando despego las
   herramientas en otras pantallas, la otra ventana pierde el estilo; eso no
   debe pasar». La ventana separada es OTRA página (animation_panel.html) con
   su propio CSS: otros grises, otro naranja y otro celeste, otra tipografía,
   botones píldora. Al despegar, el panel cambiaba de aspecto.

   Se exige, comparando estilos COMPUTADOS de las dos ventanas:
   · el mismo fondo y la misma tipografía (Figtree);
   · la herramienta activa con el mismo color que en el riel del estudio;
   · la regla de la línea de tiempo con la misma banda que en el estudio.

   El estado de cada panel es el REAL: se captura lo que el estudio publica al
   despegar (dzDetachPanel) y se le da a la ventana separada, que lo lee por
   pywebview.api como en la app. */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const panelUrl = url.replace(/index\.html.*$/, "animation_panel.html");

async function pestana() {
  const tab = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl), pending = new Map(), errores = []; let id = 0;
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ({ data }) => { const m = JSON.parse(data);
    if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.j(Error(m.error.message)) : p.r(m.result); } };
  const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; pending.set(n, { r, j }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  const cerrar = async () => { ws.close(); try { await fetch(endpoint + "/json/close/" + tab.id); } catch (_) { } };
  return { send, ev, errores, cerrar };
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // ── 1. el estudio: documento, despegar, y lo que publica ────────────────
  const est = await pestana();
  await est.send("Page.navigate", { url });
  for (let i = 0; i < 120; i++) { if (await est.ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api').catch(() => false)) break; await wait(300); }
  await est.ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} return true; })()');
  await est.ev(`dzMenuAction("nuevo")`); await wait(2600);
  await est.ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');
  const publicado = await est.ev(`(async()=>{
    window.__pub = {};
    const orig = api.panel_state;
    api.panel_state = async (k, s) => { if (s) window.__pub[k] = s; return orig ? orig(k, s) : s; };
    api.animation_panel_state = async (s) => { window.__pub.timeline = s; return s; };
    api.open_panel = async () => ({ ok: true }); api.open_animation_panel = async () => ({ ok: true });
    await dzDetachPanel("tools"); await dzDetachPanel("timeline");
    await new Promise(r => setTimeout(r, 900));
    return window.__pub; })()`);
  assert.ok(publicado.tools && (publicado.tools.tools || []).length > 3, "el estudio no publicó las herramientas al despegar");
  assert.ok(publicado.timeline && publicado.timeline.frames, "el estudio no publicó la línea de tiempo al despegar");
  const estudio = await est.ev(`(()=>{ const cs = (s) => { const n = document.querySelector(s); return n ? getComputedStyle(n) : null; };
    const activa = cs('.dz-tools .ibtn.active'), regla = cs('.tl2-ruler'), vista = cs('#designView');
    return { fondo: vista.backgroundColor, fuente: getComputedStyle(document.body).fontFamily.split(",")[0].replace(/["']/g, "").trim(),
      activa: activa && activa.backgroundColor, regla: regla && regla.backgroundImage }; })()`);
  await est.cerrar();

  // ── 2. la ventana separada, con el estado real ──────────────────────────
  const medir = async (kind) => {
    const p = await pestana();
    await p.send("Page.addScriptToEvaluateOnNewDocument", { source:
      "window.__estado = " + JSON.stringify(publicado[kind]) + ";" +
      "window.pywebview = { api: { panel_state: async () => window.__estado, animation_panel_state: async () => window.__estado," +
      " panel_command: async () => ({}), animation_panel_command: async () => ({}) } };" +
      "addEventListener('load', () => setTimeout(() => dispatchEvent(new Event('pywebviewready')), 50));" });
    await p.send("Page.navigate", { url: panelUrl + "?kind=" + kind });
    for (let i = 0; i < 60; i++) { if (await p.ev('document.readyState==="complete"').catch(() => false)) break; await wait(200); }
    await wait(1200);
    const r = await p.ev(`(()=>{ const cs = (s) => { const n = document.querySelector(s); return n ? getComputedStyle(n) : null; };
      const on = cs('.tool.on'), head = cs('.head');
      return { fondo: getComputedStyle(document.body).backgroundColor,
        fuente: getComputedStyle(document.body).fontFamily.split(",")[0].replace(/["']/g, "").trim(),
        activa: on && on.backgroundColor, regla: head && head.backgroundImage,
        herramientas: document.querySelectorAll('.tool').length, celdas: document.querySelectorAll('.cell').length }; })()`);
    const graves = p.errores.filter((e) => !/ResizeObserver/.test(String(e)));
    await p.cerrar();
    assert.deepEqual(graves.slice(0, 2), [], "la ventana separada «" + kind + "» tiró excepciones");
    return r;
  };
  const herr = await medir("tools");
  const tl = await medir("timeline");
  assert.ok(herr.herramientas > 3, "la ventana separada de herramientas no pintó las herramientas · " + JSON.stringify(herr));
  assert.ok(tl.celdas > 10, "la ventana separada de la línea de tiempo no pintó celdas · " + JSON.stringify(tl));

  const comparar = (que, separado, delEstudio) =>
    assert.equal(separado, delEstudio, "la ventana separada pierde el estilo del estudio: " + que +
      " — separada " + JSON.stringify(separado) + " · estudio " + JSON.stringify(delEstudio));
  comparar("el fondo", herr.fondo, estudio.fondo);
  comparar("la tipografía", herr.fuente, estudio.fuente);
  comparar("la herramienta activa", herr.activa, estudio.activa);
  comparar("la banda de la regla", tl.regla, estudio.regla);
  comparar("el fondo de la línea de tiempo", tl.fondo, estudio.fondo);

  console.log("E2E ventana separada con el estilo del estudio OK " + JSON.stringify({ fuente: herr.fuente, activa: herr.activa, herramientas: herr.herramientas, celdas: tl.celdas }));
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
