/* EL IDIOMA DE LA INTERFAZ. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026, LOW 3.16): «poder poner el programa en cualquier
   idioma desde las preferencias, pero que el idioma por defecto sea español».

   Con un perfil vacío y el ratón de verdad:
   1. Por defecto, español: el menú dice «Archivo».
   2. Preferencias (menú Edición) tiene «Idioma» con cada idioma en su propio
      nombre (Español, English, Português).
   3. Elegir English traduce al momento, sin recargar: el menú, las ayudas de
      las herramientas, y un mensaje de la barra de estado con números (patrón).
   4. El DIBUJO no se toca: un texto «Capa» dibujado en la hoja sigue diciendo «Capa».
   5. Recargar: sigue en inglés (queda guardado).
   6. Volver a Español restituye todo tal cual era. */
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
  const clicEl = async (sel) => {
    const c = await ev(`(()=>{ const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    assert.ok(c, "no está: " + sel);
    for (const t of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type: t, x: c[0], y: c[1], button: "left", buttons: t === "mousePressed" ? 1 : 0, clickCount: 1 });
    await wait(450);
  };
  const cargar = async (marca) => {
    for (let i = 0; i < 120; i++) { if (await ev(`${marca ? "!window.__paginaVieja&&" : ""}document.readyState==="complete"&&typeof dzMenuAction==="function"`).catch(() => false)) break; await wait(300); }
    await wait(600);
  };
  const abrirPreferencias = async () => {
    await clicEl('[data-menu="edicion"]');
    await clicEl('[data-act="preferencias"]');
    await wait(300);
  };
  const menu = () => ev(`[...document.querySelectorAll('[data-act="preferencias"]')].map(n => n.textContent.trim())[0]`);
  const archivo = () => ev(`(()=>{ for (const e of document.querySelectorAll("body *")) for (const n of e.childNodes) if (n.nodeType === 3 && /^(Archivo|File|Arquivo)$/.test(n.nodeValue.trim())) return n.nodeValue.trim(); return null; })()`);
  const ayudaFlecha = () => ev(`(()=>{ const b = document.querySelector('[data-tool="select"]'); return b.getAttribute("title") || b.dataset.tituloAyuda; })()`);
  const textoDibujo = () => ev(`(document.querySelector('#dzCanvas > svg text#rotulo') || {}).textContent`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    await cargar(false);
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} window.__paginaVieja = 1; return true; })()');
    await send("Page.reload");
    await cargar(true);

    // 1. por defecto, español
    assert.equal(await ev("LOW_I18N.actual"), "es", "el idioma de fábrica no es español");
    assert.equal(await archivo(), "Archivo", "el menú no está en español por defecto");
    const ayudaEs = await ayudaFlecha();
    assert.match(ayudaEs, /^Seleccionar/, "la ayuda de la flecha no está en español: " + ayudaEs);

    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev(`(()=>{ if (typeof closeL3d === "function") closeL3d();
      dzCanvasSet('<g data-low-art="colour"></g><g data-low-art="line"><text id="rotulo" x="300" y="300" font-size="80">Capa</text></g>'); dzDocCommit(); return 1; })()`);
    await wait(300);

    // 2. Preferencias desde el menú Edición
    await abrirPreferencias();
    const opciones = await ev(`(()=>{ const s = document.getElementById("prefIdioma"); return s && [...s.options].map(o => o.value + ":" + o.textContent); })()`);
    assert.ok(opciones, "Preferencias no tiene el selector de idioma");
    assert.ok(opciones.includes("es:Español") && opciones.includes("en:English") && opciones.includes("pt:Português"), "faltan idiomas en el selector: " + JSON.stringify(opciones));
    assert.equal(await ev(`document.getElementById("prefIdioma").value`), "es", "el selector no marca español");

    // 3. English, al momento
    await ev(`(()=>{ const s = document.getElementById("prefIdioma"); s.value = "en"; s.dispatchEvent(new Event("change", { bubbles: true })); return 1; })()`);
    await wait(300);
    assert.equal(await ev(`document.querySelector(".dz-idioma-fila .dz-hint").textContent`), "Language", "el rótulo del selector no cambió");
    assert.equal(await ev(`document.getElementById("prefIdioma").value`), "en", "el selector no quedó en English");
    await ev("closeModal(), 1"); await wait(200);
    assert.equal(await archivo(), "File", "el menú no se tradujo");
    assert.match(await ayudaFlecha(), /^Select/, "la ayuda de la flecha no se tradujo");
    await ev(`dzSetStatus(" Drawing 7 expuesto en el frame 3"), 1`); await wait(150);
    assert.match(await ev(`[...document.querySelectorAll("#dzStatusbar span")].map(s => s.textContent).pop()`), /Drawing 7 exposed on frame 3/, "el mensaje con números no se tradujo");

    // 4. el dibujo no se toca
    assert.equal(await textoDibujo(), "Capa", "se tradujo un texto del DIBUJO");

    // 5. queda guardado
    await ev("window.__paginaVieja = 1"); await send("Page.reload"); await cargar(true);
    assert.equal(await ev("LOW_I18N.actual"), "en", "al recargar volvió al español");
    assert.equal(await archivo(), "File", "al recargar el menú está en español");

    // 6. de vuelta a Español, todo como era
    await abrirPreferencias();
    await ev(`(()=>{ const s = document.getElementById("prefIdioma"); s.value = "es"; s.dispatchEvent(new Event("change", { bubbles: true })); return 1; })()`);
    await wait(300);
    await ev("closeModal(), 1"); await wait(200);
    assert.equal(await archivo(), "Archivo", "volver a Español no restituyó el menú");
    assert.equal(await ayudaFlecha(), ayudaEs, "volver a Español no restituyó la ayuda tal cual");
    assert.match(await menu(), /^Preferencias/, "el menú de preferencias no volvió al español");

    assert.deepEqual(errores, [], "errores de JS: " + errores.join(" | "));
    console.log("OK idioma: español de fábrica, English al momento, queda guardado, el dibujo intacto, vuelta a español exacta");
  } finally {
    ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
