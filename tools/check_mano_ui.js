/* LA MANO SE VE. CDP :9223 + mock :8791.

   Reporte de Mauro (oct-2026): «muchas veces cuando aprieto la barra
   espaciadora para navegar con la manito, el ícono de la mano no aparece».

   MEDIDO: con el Pincel (y toda herramienta con cursor propio) una regla
   `cursor: none !important` le ganaba a la mano y seguía el anillo del pincel;
   con la Flecha, los trazos tenían su cursor propio.

   Con el teclado y el mouse de verdad, con el Pincel y con la Flecha:
   1. Espacio apretado: sobre la hoja y sobre un trazo el cursor es la mano, y
      el anillo del pincel se esconde.
   2. Apretando el botón (paneando): la mano agarra.
   3. Soltar el espacio vuelve el cursor de la herramienta.
   4. Si la ventana pierde el foco con el espacio apretado, la mano no queda pegada. */
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
  const espacio = (tipo) => send("Input.dispatchKeyEvent", { type: tipo, key: " ", code: "Space", windowsVirtualKeyCode: 32, ...(tipo === "keyDown" ? { text: " " } : {}) });
  const cursorEn = (x, y) => ev(`(()=>{ const e = document.elementFromPoint(${x}, ${y}); const t = document.querySelector("#dzToolCursor");
    return { cursor: e ? getComputedStyle(e).cursor : null, sobre: e ? (e.tagName + (e.getAttribute("data-low") ? "[" + e.getAttribute("data-low") + "]" : "")) : null,
      anillo: !!(t && !t.hidden && getComputedStyle(t).display !== "none") }; })()`);
  const clic = async (sel) => { const p = await ev(`(()=>{ const e = ${sel}; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 }); await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(250); };

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 820, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!LOW.mano').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} return true; })()');
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');

    // un trazo para pasar por encima
    const hoja = await ev(`(()=>{ const r = document.querySelector("#dzCanvas > svg").getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width }; })()`);
    await clic(`document.querySelector('.dz-toolbtn[data-tool="brush"]')`);
    await mouse("mouseMoved", hoja.x - 80, hoja.y); await mouse("mousePressed", hoja.x - 80, hoja.y, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 20; i++) { await mouse("mouseMoved", hoja.x - 80 + i * 8, hoja.y + Math.sin(i / 3) * 6, { buttons: 1 }); await wait(10); }
    await mouse("mouseReleased", hoja.x + 80, hoja.y, { buttons: 0, clickCount: 1 }); await wait(500);
    const sobreTrazo = await ev(`(()=>{ const el = [...document.querySelectorAll('#dzCanvas > svg [data-low="brush"]')].pop(); if (!el) return null;
      const p = el.getBoundingClientRect(); for (let x = p.x; x < p.right; x += 2) { const y = p.y + p.height / 2; const e = document.elementFromPoint(x, y); if (e && e.closest('[data-low="brush"]')) return { x, y }; } return null; })()`);
    const puntos = [["la hoja", { x: hoja.x, y: hoja.y - 120 }], ...(sobreTrazo ? [["un trazo", sobreTrazo]] : [])];

    for (const herramienta of ["brush", "select"]) {
      await clic(`document.querySelector('.dz-toolbtn[data-tool="${herramienta}"]')`);
      for (const [donde, p] of puntos) {
        await mouse("mouseMoved", p.x, p.y); await wait(60);
        await espacio("keyDown"); await wait(80);
        await mouse("mouseMoved", p.x + 1, p.y); await wait(60);
        const con = await cursorEn(p.x + 1, p.y);
        assert.equal(con.cursor, "grab", `con ${herramienta}, espacio apretado sobre ${donde}: no se ve la mano (${JSON.stringify(con)})`);
        assert.ok(!con.anillo, `con ${herramienta}, espacio apretado: sigue el anillo de la herramienta`);
        // 2. paneando
        await mouse("mousePressed", p.x + 1, p.y, { buttons: 1, clickCount: 1 });
        await mouse("mouseMoved", p.x + 20, p.y + 5, { buttons: 1 }); await wait(60);
        const agarra = await cursorEn(p.x + 20, p.y + 5);
        await mouse("mouseReleased", p.x + 20, p.y + 5, { buttons: 0, clickCount: 1 }); await wait(60);
        assert.equal(agarra.cursor, "grabbing", `con ${herramienta}, paneando sobre ${donde}: la mano no agarra (${JSON.stringify(agarra)})`);
        // 3. soltar el espacio
        await espacio("keyUp"); await wait(80);
        await mouse("mouseMoved", p.x + 2, p.y); await wait(60);
        const sin = await cursorEn(p.x + 2, p.y);
        assert.notEqual(sin.cursor, "grab", `con ${herramienta}, al soltar el espacio queda la mano sobre ${donde}`);
      }
    }

    // ── 4. perder el foco con el espacio apretado ─────────────────────────────
    await espacio("keyDown"); await wait(80);
    await ev(`(()=>{ window.dispatchEvent(new Event("blur")); return true; })()`); await wait(80);
    const trasBlur = await ev(`({ espacio: !!DZ.spaceDown, mano: document.querySelector("#dzCanvas").classList.contains("mano") })`);
    assert.deepEqual(trasBlur, { espacio: false, mano: false }, "al perder el foco con el espacio apretado, la mano queda pegada: " + JSON.stringify(trasBlur));
    await espacio("keyUp");

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E la mano se ve OK", JSON.stringify({ puntos: puntos.map((p) => p[0]) }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e); process.exit(1); });
