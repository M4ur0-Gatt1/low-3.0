/* EL COLOR QUE ELEGÍS ES EL COLOR CON QUE QUEDA. CDP :9223 + mock :8791.

   Reporte de Mauro (oct-2026, LOW 3.17): «no estoy pudiendo cambiar los
   colores del contorno de lo que dibujo… mientras dibujo muestra el color que
   elijo, pero al terminarlo se pone negro».

   El trazo terminado llevaba el estilo activo de la paleta (data-stk="1",
   negro) y la hoja de la paleta le ganaba al color elegido. Con el ratón de
   verdad (los selectores de color nativos no se pueden abrir: se les da el
   valor y sus eventos, como hace el diálogo):
   1. «Trazo» rojo → el LÁPIZ termina rojo, y el PINCEL también.
   2. Arrastrar el selector por diez colores y soltar crea UN estilo, no diez.
   3. Con un trazo del lápiz elegido, el «Trazo» del panel lo recolorea: en
      vivo mientras se arrastra, y al soltar queda con un estilo de ese color.
   4. Con una cinta del pincel elegida, recolorearla cambia su relleno (su
      línea) y no le agrega un contorno.
   5. Recolorear un estilo DESDE la paleta sigue recoloreando lo que lo usa.
   6. Elegir un estilo de la paleta después de un color suelto: manda el estilo. */
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
  const clicXY = async ([x, y]) => { await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y, { buttons: 1, clickCount: 1 }); await wait(40); await mouse("mouseReleased", x, y, { buttons: 0, clickCount: 1 }); await wait(350); };
  const trazo = async (herr, y) => {
    await ev(`dzSetTool("${herr}"), 1`); await wait(250);
    const a = await P(300, y), b = await P(1500, y + 60);
    await mouse("mouseMoved", a[0], a[1]); await mouse("mousePressed", a[0], a[1], { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 16; i++) { await mouse("mouseMoved", a[0] + (b[0] - a[0]) * i / 16, a[1] + (b[1] - a[1]) * i / 16 + Math.sin(i) * 8, { buttons: 1 }); await wait(18); }
    await mouse("mouseReleased", b[0], b[1], { buttons: 0, clickCount: 1 }); await wait(700);
    return ev(`(()=>{ const ns = [...document.querySelectorAll('#dzCanvas > svg g[data-low-art] > *')].filter(n => !n.closest(".dz-onion")); const n = ns.pop(); n.id = n.id || "t" + Math.random().toString(36).slice(2, 7); return n.id; })()`);
  };
  /** el color que SE VE: línea del lápiz = stroke; cinta del pincel = fill */
  const seVe = (id) => ev(`(()=>{ const n = document.getElementById(${JSON.stringify(id)}); const cs = getComputedStyle(n); const v = n.getAttribute("data-low") === "brush" ? cs.fill : cs.stroke;
    const m = v.match(/\\d+/g); return m ? "#" + m.slice(0, 3).map(x => (+x).toString(16).padStart(2, "0")).join("") : v; })()`);
  /** el selector recibe colores como lo hace el diálogo nativo */
  const selector = (sel, colores, soltar = true) => ev(`(async()=>{ const c = document.getElementById(${JSON.stringify(sel)}); if (!c) throw Error("no está el selector #${sel} (herramienta " + DZ.tool + ")");
    for (const v of ${JSON.stringify(colores)}) { c.value = v; c.dispatchEvent(new Event("input", { bubbles: true })); await new Promise(r => setTimeout(r, 15)); }
    ${soltar ? 'c.dispatchEvent(new Event("change", { bubbles: true }));' : ""} return 1; })()`);
  const estilos = () => ev("DZ.doc.palette.styles.length");
  /** un punto de pantalla SOBRE la línea (la mitad del trazo, o del borde de la cinta) */
  const sobre = (id) => ev(`(()=>{ const n = document.getElementById(${JSON.stringify(id)}); const L = n.getTotalLength(); const q = n.getPointAtLength(L * (n.getAttribute("data-low") === "brush" ? .25 : .5));
    const m = n.getScreenCTM(); return [m.a * q.x + m.c * q.y + m.e, m.b * q.x + m.d * q.y + m.f]; })()`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); sessionStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} window.__paginaVieja = 1; return true; })()');
    await send("Page.reload");
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"').catch(() => false)) break; await wait(300); }
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev(`(()=>{ if (typeof closeL3d === "function") closeL3d(); if (DZ.onionOn) { DZ.onionOn = false; dzOnionRender(); } DZ.zoom = .5; DZ.panX = 0; DZ.panY = 0; dzApplyZoom(); dzSetTool("pencil"); return 1; })()`);
    await wait(400);

    // 1. Trazo rojo → lápiz y pincel terminan rojos
    const antes = await estilos();
    await selector("toColor", ["#e01010"]);
    const lapiz = await trazo("pencil", 250);
    assert.equal(await seVe(lapiz), "#e01010", "el lápiz terminó de otro color");
    const pincel = await trazo("brush", 450);
    assert.equal(await seVe(pincel), "#e01010", "el pincel terminó de otro color");
    assert.equal(await estilos(), antes + 1, "elegir un color no creó exactamente un estilo");

    // 2. arrastrar el selector por diez colores y soltar: UN estilo nuevo
    const n0 = await estilos();
    await ev(`dzSetTool("pencil"), 1`); await wait(200);
    await selector("toColor", ["#101080", "#1010a0", "#1010b0", "#1010c0", "#1010d0", "#1020d0", "#1030d0", "#1040d0", "#1050d0", "#1060e0"]);
    assert.equal(await estilos(), n0 + 1, "arrastrar el selector llenó la paleta de colores intermedios");
    const azul = await trazo("pencil", 650);
    assert.equal(await seVe(azul), "#1060e0", "el trazo no salió con el último color del selector");

    // 3. recolorear el trazo del lápiz elegido, desde el panel
    await ev(`dzSetTool("select"), 1`); await wait(200);
    await clicXY(await sobre(lapiz));
    assert.equal(await ev("DZ.sel && DZ.sel.id"), lapiz, "no se eligió el trazo del lápiz");
    await selector("dzPStroke", ["#00a000", "#00b000"], false);
    assert.equal(await seVe(lapiz), "#00b000", "mientras se arrastra el selector, el trazo no cambia de color en vivo");
    await selector("dzPStroke", ["#00c000"]);
    await wait(200);
    assert.equal(await seVe(lapiz), "#00c000", "al soltar, el trazo no quedó del color elegido");
    const stk = await ev(`(()=>{ const n = document.getElementById(${JSON.stringify(lapiz)}); const s = DZ.doc.palette.byIndex(+n.getAttribute("data-stk")); return s && s.color; })()`);
    assert.equal(stk, "#00c000", "el trazo recoloreado no quedó con un estilo de ese color");

    // 4. la cinta del pincel: cambia su relleno, sin contorno nuevo
    await clicXY(await sobre(pincel));
    assert.equal(await ev("DZ.sel && DZ.sel.id"), pincel, "no se eligió la cinta del pincel");
    await selector("dzPStroke", ["#c000c0"]);
    await wait(200);
    assert.equal(await seVe(pincel), "#c000c0", "la cinta del pincel no cambió de color");
    assert.equal(await ev(`document.getElementById(${JSON.stringify(pincel)}).getAttribute("stroke")`), null, "a la cinta del pincel se le agregó un contorno");

    // 5. recolorear un estilo desde la paleta recolorea lo que lo usa
    const idx = await ev(`+document.getElementById(${JSON.stringify(azul)}).getAttribute("data-stk")`);
    await ev(`(DZ.doc.setStyleColor(${idx}, "#ff8800"), dzPalCssRender && dzPalCssRender(), 1)`); await wait(200);
    assert.equal(await seVe(azul), "#ff8800", "recolorear el estilo desde la paleta ya no recolorea lo dibujado");

    // 6. un color suelto sin soltar, y después un estilo de la paleta: manda el estilo
    await ev(`dzSetTool("pencil"), 1`); await wait(250);   // «Trazo» de la barra está con las herramientas de dibujo
    await selector("toColor", ["#123456"], false);
    await ev(`(()=>{ const s = DZ.doc.palette.byIndex(1); DZ.palStyles.ink = 1; DZ.drawColor = s.color; return 1; })()`);   // lo que hace elegir un estilo en la paleta
    const conEstilo = await trazo("pencil", 850);
    assert.equal(await ev(`document.getElementById(${JSON.stringify(conEstilo)}).getAttribute("data-stk")`), "1", "un color suelto anterior le ganó al estilo elegido en la paleta");

    assert.deepEqual(errores, [], "errores de JS: " + errores.join(" | "));
    console.log("OK color elegido: lápiz y pincel terminan del color elegido, un estilo por elección, recolorear en vivo, la paleta sigue mandando");
  } finally {
    ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
