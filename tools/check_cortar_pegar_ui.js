/* CORTAR, COPIAR Y PEGAR OBJETOS. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026, LOW 3.19): «el comando Ctrl+X no funciona para
   cortar… quiero que funcione con los objetos». Hasta la 3.19 Ctrl+C copiaba
   siempre el cuadro entero y Ctrl+X no hacía nada.

   Con el teclado y el ratón de verdad, en un .low, un círculo (movido con un
   transform) y un rectángulo:
   1. Marco sobre los dos + Ctrl+X → salen del cuadro; Ctrl+Z los devuelve
      (un solo paso).
   2. Ctrl+X otra vez, Alt+N (cuadro vacío nuevo), Ctrl+V → aparecen en el
      cuadro 2 EN EL MISMO LUGAR donde se veían, elegidos, y quedan guardados
      en el dibujo del cuadro 2.
   3. Ctrl+C con un objeto elegido copia el OBJETO (no el cuadro): Ctrl+V
      pega una copia en el mismo lugar.
   4. Sin nada elegido, Ctrl+C sigue copiando el cuadro entero. */
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
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
  const P = (x, y) => ev(`(()=>{ const q = dzToScreen(${x}, ${y}), r = document.querySelector("#dzCanvas").getBoundingClientRect(); return [q.x + r.left, q.y + r.top]; })()`);
  const tecla = async (key, code, vk, mods = 0) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: vk, modifiers: mods });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: vk, modifiers: mods }); await wait(450);
  };
  const ctrl = (k) => tecla(k, "Key" + k.toUpperCase(), k.toUpperCase().charCodeAt(0), 2);
  const marco = async ([x1, y1], [x2, y2]) => {
    await mouse("mouseMoved", x1, y1); await mouse("mousePressed", x1, y1, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i++) { await mouse("mouseMoved", x1 + (x2 - x1) * i / 12, y1 + (y2 - y1) * i / 12, { buttons: 1 }); await wait(18); }
    await mouse("mouseReleased", x2, y2, { buttons: 0, clickCount: 1 }); await wait(400);
  };
  /** dónde se VEN el círculo y el rectángulo (caja en pantalla) */
  const cajas = () => ev(`(()=>{ const out = {}; for (const t of ["circle", "rect"]) { const n = [...document.querySelectorAll("#dzCanvas > svg g[data-low-art] " + t)].filter(x => !x.closest(".dz-onion")).pop(); if (!n) { out[t] = null; continue; } const r = n.getBoundingClientRect(); out[t] = [Math.round(r.left), Math.round(r.top), Math.round(r.width)]; } return out; })()`);
  const cuantos = () => ev(`document.querySelectorAll("#dzCanvas > svg g[data-low-art] > *:not(.dz-onion)").length`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); sessionStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} window.__paginaVieja = 1; return true; })()');
    await send("Page.reload");
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev(`(()=>{ if (typeof closeL3d === "function") closeL3d(); if (DZ.onionOn) { DZ.onionOn = false; dzOnionRender(); }
      dzCanvasSet('<g data-low-art="colour"><rect x="900" y="450" width="160" height="160" fill="#c33"/></g><g data-low-art="line"><circle cx="300" cy="540" r="80" fill="none" stroke="#111" stroke-width="10" transform="matrix(1 0 0 1 300 0)"/></g>');
      dzDocCommit(); DZ.zoom = .5; DZ.panX = 0; DZ.panY = 0; dzApplyZoom(); dzSetTool("select"); dzDeselect(); return 1; })()`);
    await wait(500);
    const vistas = await cajas();
    assert.equal(await cuantos(), 2, "el punto de partida no tiene los dos objetos");

    // 1. marco + Ctrl+X, y Ctrl+Z los devuelve
    await marco(await P(450, 380), await P(1150, 700));
    assert.equal(await ev("[DZ.sel, ...(DZ.multi || [])].filter(Boolean).length > 1"), true, "el marco no eligió los dos");
    await ctrl("x");
    assert.equal(await cuantos(), 0, "Ctrl+X no sacó los objetos del cuadro");
    await ctrl("z");
    assert.equal(await cuantos(), 2, "Ctrl+Z no devolvió lo cortado de una vez");
    assert.deepEqual(await cajas(), vistas, "lo devuelto por Ctrl+Z no quedó donde estaba");

    // 2. cortar, cuadro vacío nuevo, pegar: mismo lugar, elegidos, guardados en el cuadro 2
    await marco(await P(450, 380), await P(1150, 700));
    await ctrl("x");
    await tecla("n", "KeyN", 78, 1);   // Alt+N: cuadro vacío después del actual
    assert.equal(await ev("DZ.doc.frame"), 2, "Alt+N no llevó a un cuadro nuevo");
    await ctrl("v");
    assert.equal(await cuantos(), 2, "Ctrl+V no pegó los dos objetos en el cuadro 2");
    assert.deepEqual(await cajas(), vistas, "lo pegado no quedó en el mismo lugar donde se veía");
    assert.equal(await ev("[DZ.sel, ...(DZ.multi || [])].filter(Boolean).length > 1"), true, "lo pegado no quedó elegido");
    assert.equal(await ev(`(()=>{ const r = document.querySelector("#dzCanvas > svg g[data-low-art='colour'] rect"); return !!r; })()`), true, "el rectángulo no volvió al plano Color");
    await ev("dzDocGoTo(1), 1"); await wait(300);
    assert.equal(await cuantos(), 0, "el cuadro 1 no quedó vacío después de cortar");
    await ev("dzDocGoTo(2), 1"); await wait(400);
    assert.equal(await cuantos(), 2, "lo pegado no quedó guardado en el dibujo del cuadro 2");

    // 3. Ctrl+C con un objeto elegido copia el objeto (no el cuadro)
    await ev("dzDeselect(), 1");
    const clipAntes = await ev("JSON.stringify(DZ.clipCuadro || null)");
    const c = await P(900 + 80, 450 + 80);
    await mouse("mouseMoved", c[0], c[1]); await mouse("mousePressed", c[0], c[1], { buttons: 1, clickCount: 1 }); await mouse("mouseReleased", c[0], c[1], { buttons: 0, clickCount: 1 }); await wait(350);
    assert.equal(await ev("DZ.sel && DZ.sel.tagName"), "rect", "no se eligió el rectángulo");
    await ctrl("c");
    assert.equal(await ev("JSON.stringify(DZ.clipCuadro || null)"), clipAntes, "Ctrl+C con un objeto elegido copió el cuadro entero");
    await ctrl("v");
    assert.equal(await cuantos(), 3, "Ctrl+V no pegó la copia del objeto");

    // 4. sin nada elegido, Ctrl+C copia el cuadro (lo de siempre)
    await ev("dzDeselect(), 1");
    await mouse("mousePressed", 30, 300, { buttons: 1, clickCount: 1 }); await mouse("mouseReleased", 30, 300, { clickCount: 1 }); await wait(200);
    await ev("dzDeselect(), 1");
    await ctrl("c");
    assert.ok(await ev("!!DZ.clipCuadro"), "sin nada elegido, Ctrl+C ya no copia el cuadro");

    assert.deepEqual(errores, [], "errores de JS: " + errores.join(" | "));
    console.log("OK cortar/copiar/pegar objetos: Ctrl+X y Ctrl+Z, pegar en el mismo lugar en otro cuadro, Ctrl+C de objeto, Ctrl+C de cuadro sin selección");
  } finally {
    ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
