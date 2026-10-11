/* LO QUE FALTA TRADUCIR, en la interfaz VIVA. CDP :9223 + mock :8791.

   Uso:  node tools/i18n_faltantes.js en [salida.json]

   Recorre los siete espacios de trabajo con un documento .low abierto, una
   vez en español y otra en el idioma pedido, y anota los textos VISIBLES (y
   las ayudas de lo visible) que se ven igual en las dos: eso es lo que falta.

   No es una prueba de la puerta: sirve para ir completando ui/i18n/<idioma>.js.
   Las claves que hay que agregar son exactamente las que lista. */
const fs = require("fs");
const endpoint = "http://127.0.0.1:9223", url = "http://127.0.0.1:8791/ui/index.html?mock=1";
const idioma = process.argv[2] || "en", salida = process.argv[3];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  /* Se recorre DOS veces —en español y en el idioma pedido— y falta lo que se
     ve IGUAL en las dos pasadas. Es una medida honesta: no adivina qué palabra
     «parece» española (en portugués casi todas lo parecen). Lo que da igual
     por ser igual en los dos idiomas («Color», «3D») aparece en la lista y se
     reconoce a ojo. */
  const recorrida = async (codigo) => {
    const tab = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl); let id = 0; const pend = new Map();
    await new Promise((r) => (ws.onopen = r));
    ws.onmessage = ({ data }) => { const m = JSON.parse(data); const p = pend.get(m.id); if (p) { pend.delete(m.id); p(m.result); } };
    const send = (method, params = {}) => new Promise((r) => { const n = ++id; pend.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });
    const ev = async (e) => { const r = await send("Runtime.evaluate", { expression: e, awaitPromise: true, returnByValue: true }); return r.result?.value ?? r.exceptionDetails?.exception?.description; };
    await send("Network.setCacheDisabled", { cacheDisabled: true }); await send("Network.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 100; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"')) break; await wait(300); }
    await ev(`(()=>{ localStorage.clear(); localStorage.setItem("low.workspace.active", "drawing"); window.__v = 1; return 1 })()`);
    await send("Page.reload");
    for (let i = 0; i < 100; i++) { if (await ev('!window.__v&&document.readyState==="complete"&&typeof dzMenuAction==="function"')) break; await wait(300); }
    await ev(`LOW_I18N.poner(${JSON.stringify(codigo)}), 1`);
    if (await ev("LOW_I18N.actual") !== codigo) { console.error("no se pudo poner el idioma " + codigo); process.exit(1); }
    await ev('dzMenuAction("nuevo")'); await wait(2600);
    const mirar = `(()=>{ const r = window.__vistos = window.__vistos || {};
      const NO = "#dzCanvas > svg, script, style, textarea, input, .cm-editor, [data-no-traducir]";
      const letras = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ]{2}/, n = t => t.replace(/\\s+/g, " ").trim();
      const visible = el => { if (!el || el.closest(NO)) return false; const b = el.getBoundingClientRect(); if (!(b.width > 0 && b.height > 0)) return false;
        for (let e = el; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (s.display === "none" || s.visibility === "hidden" || +s.opacity === 0) return false; } return true; };
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let x = w.nextNode(); x; x = w.nextNode()) { const t = n(x.nodeValue); if (t && letras.test(t) && visible(x.parentElement)) r[t] = 1; }
      for (const el of document.querySelectorAll("[title], [aria-label], [placeholder]")) { if (!visible(el)) continue;
        for (const a of ["title", "aria-label", "placeholder"]) { const v = el.getAttribute(a); if (v && letras.test(v)) r[n(v)] = 1; } }
      return Object.keys(r).length; })()`;
    const tabs = await ev(`document.querySelectorAll("#dzWorkspaces .dz-ws-tab").length`);
    for (let i = 0; i < tabs; i++) { await ev(`document.querySelectorAll("#dzWorkspaces .dz-ws-tab")[${i}].click(), 1`); await wait(900); await ev(mirar); }
    const vistos = Object.keys(await ev("window.__vistos"));
    ws.close(); await fetch(endpoint + "/json/close/" + tab.id);
    return vistos;
  };
  const es = new Set(await recorrida("es"));
  const otro = await recorrida(idioma);
  const faltan = otro.filter((t) => es.has(t)).sort();
  console.log(`${idioma}: ${otro.length - faltan.length} de ${otro.length} textos visibles cambiaron respecto del español (${Math.round(100 * (otro.length - faltan.length) / Math.max(1, otro.length))} %)`);
  console.log("Se ven igual que en español (falta traducir, o son iguales en los dos idiomas):");
  for (const t of faltan.slice(0, 80)) console.log("  ·", t.slice(0, 120));
  if (faltan.length > 80) console.log(`  … y ${faltan.length - 80} más`);
  if (salida) fs.writeFileSync(salida, JSON.stringify(faltan, null, 1));
})();
