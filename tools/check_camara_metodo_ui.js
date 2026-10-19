/* LA CÁMARA 2D: EL MÉTODO INICIO → FIN Y EL TUTORIAL (v3.36). CDP :9223 + mock :8791.

   Pedido de Mauro: «no entiendo bien cómo se maneja el movimiento de cámara;
   mejorá esa interfaz y metodología y hacé un tutorial también».

   MEDIDO antes del arreglo (v3.35):
   - Arrastrar el encuadre en el cuadro 12 sin claves dejaba UNA sola clave: la
     cámara quedaba quieta en toda la toma, sin avisar.
   - El rótulo del encuadre decía «interpolada» sin ninguna clave.
   - El play mostraba la hoja entera; la exportación salía por la cámara.
   - No había forma de mover una clave a otro cuadro, ni de saltar entre claves.
   - No había tutorial.

   Con el mouse de verdad:
   1. Sin claves el rótulo dice «sin claves».
   2. Arrastrar el encuadre en el cuadro 12 deja claves en 1 (hoja entera) y 12:
      el movimiento existe. En el 6 el rótulo dice «entre F1 y F12».
   3. Mientras se arrastra la esquina, el rótulo dice el zoom en %.
   4. Paso a paso: «Encuadre final» en el cuadro 24 va al 24 y deja su clave;
      arrastrar la cambia.
   5. La lista: el número de una clave se edita y la clave se muda de cuadro.
   6. «◀ Clave» / «Clave ▶» saltan entre claves.
   7. El play sale POR LA CÁMARA (como la exportación) y se ve dentro del marco.
   8. El tutorial (Ayuda → «Tutorial: mover la cámara») se recorre haciendo
      cada paso de verdad, y termina en «Listo». */
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
  const centro = (sel) => ev(`(()=>{ const e = ${sel}; if (!e) return null; e.scrollIntoView?.({ block: "nearest" }); const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } : null; })()`);
  const clic = async (sel, que) => {
    const p = await centro(sel); assert.ok(p, "no se ve " + que);
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1 }); await wait(250);
  };
  const arrastrar = async (p, dx, dy, enMedio) => {
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 10; i++) { await mouse("mouseMoved", p.x + dx * i / 10, p.y + dy * i / 10, { buttons: 1 }); await wait(16); if (i === 6 && enMedio) await enMedio(); }
    await mouse("mouseReleased", p.x + dx, p.y + dy, { buttons: 0, clickCount: 1 }); await wait(250);
  };
  const escribir = async (sel, texto) => {
    await ev(`(()=>{ const e = ${sel}; e.focus(); e.select(); return true; })()`);
    await send("Input.insertText", { text: texto });
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await ev(`(()=>{ document.activeElement?.blur?.(); return true; })()`); await wait(250);
  };
  const claves = () => ev(`Object.keys(dzCamKeys()).map(Number).sort((a,b)=>a-b)`);
  const rotulo = () => ev(`document.querySelector("#dzCamTag").textContent`);
  const ir = (f) => ev(`(()=>{ dzDocGoTo(${f}); return DZ.doc.frame; })()`);
  const P = (s) => `document.querySelector('#dzCamPanel ${s}')`;
  const encuadre = () => centro(`document.querySelector("#dzCam")`);

  const nuevo = async () => {
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} window.__paginaVieja = 1; return true; })()');
    await send("Page.reload", { ignoreCache: true });
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&!!document.querySelector("#dzBienvenida2D [data-a=nuevo]:not([disabled])")').catch(() => false)) break; await wait(300); }
    await clic(`document.querySelector('#dzBienvenida2D [data-a="nuevo"]')`, "Nuevo documento"); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return true; })()');
  };

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 820, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!window.LOW?.camara2d').catch(() => false)) break; await wait(300); }
    await nuevo();
    await ev(`(()=>{ if (!DZ.camMode) dzCamToggle(); return true; })()`); await wait(400);

    // ── 1. sin claves ──
    assert.match(await rotulo(), /sin claves/i, "sin claves el rótulo del encuadre no lo dice (decía «interpolada»)");

    // ── 2. arrastrar en el 12 deja también la clave de partida ──
    await ir(12); await wait(200);
    let enc = await encuadre();
    await arrastrar({ x: enc.x - enc.w * 0.2, y: enc.y }, 90, 30);
    assert.deepEqual(await claves(), [1, 12], "arrastrar el encuadre en el cuadro 12 sin claves no dejó la clave de partida en el 1 (la cámara quedaba quieta)");
    assert.equal(await ev(`(()=>{ const a = dzCamKeys()[1], b = dzCamDefault(); return Math.abs(a.cx - b.cx) < .5 && Math.abs(a.w - b.w) < .5; })()`), true, "la clave de partida no es la hoja entera");
    await ir(6); await wait(200);
    assert.match(await rotulo(), /entre F0*1 y F0*12/i, "en el cuadro 6 el rótulo no dice entre qué claves está");

    // ── 3. el zoom en % mientras se arrastra la esquina ──
    await ir(12); await wait(200);
    const esq = await centro(`document.querySelector("#dzCamSize")`);
    let rotuloEnMedio = "";
    await arrastrar(esq, -60, -34, async () => { rotuloEnMedio = await rotulo(); });
    assert.match(rotuloEnMedio, /zoom \d+ ?%/i, "arrastrando la esquina el rótulo no dice el zoom: " + rotuloEnMedio);

    // ── 4. paso a paso: encuadre final en el 24 ──
    for (const s of ['[data-a="desde"]', '[data-a="hasta"]', '[data-a="ir-desde"]', '[data-a="ir-hasta"]', '[data-a="ver"]'])
      assert.ok(await ev(`!!${P(s)}`), "el panel Cámara no tiene el paso a paso: falta " + s);
    await escribir(P('[data-a="hasta"]'), "24");
    await clic(P('[data-a="ir-hasta"]'), "«Encuadre final»");
    assert.equal(await ev(`DZ.doc.frame`), 24, "«Encuadre final» no llevó al cuadro 24");
    assert.ok((await claves()).includes(24), "«Encuadre final» no dejó la clave del 24");
    const antes24 = await ev(`dzCamKeys()[24].cx`);
    enc = await encuadre();
    await arrastrar({ x: enc.x, y: enc.y + enc.h * 0.2 }, 80, 0);
    assert.ok(await ev(`dzCamKeys()[24].cx`) > antes24 + 10, "arrastrar en el 24 no cambió su clave");

    // ── 5. mudar una clave de cuadro desde la lista ──
    await escribir(P('.cam2d-lista li[data-f="24"] input.cam2d-f'), "30");
    assert.deepEqual(await claves(), [1, 12, 30], "editar el número de la clave no la mudó del 24 al 30");

    // ── 6. saltar entre claves ──
    await ir(5); await wait(150);
    await clic(P('[data-a="clave-sig"]'), "«Clave ▶»");
    assert.equal(await ev(`DZ.doc.frame`), 12, "«Clave ▶» no saltó a la clave siguiente (12)");
    await clic(P('[data-a="clave-ant"]'), "«◀ Clave»");
    assert.equal(await ev(`DZ.doc.frame`), 1, "«◀ Clave» no saltó a la clave anterior (1)");

    // ── 7. el play sale por la cámara ──
    await ev(`(()=>{ const o = window.dzExportCuadroSvg; window.__porCam = []; window.dzExportCuadroSvg = function (f, pc) { __porCam.push(!!pc); return o.apply(this, arguments); }; return true; })()`);
    await ev(`(()=>{ dzPlayToggle(); return true; })()`); await wait(1800);
    const play = await ev(`(()=>{ const c = document.querySelector("#dzReproFluida"), m = document.querySelector("#dzCam");
      const r = c && !c.hidden ? c.getBoundingClientRect() : null, q = m.getBoundingClientRect();
      return { porCam: __porCam.filter(Boolean).length, sin: __porCam.filter(x => !x).length, imagen: !!r,
        enMarco: !!r && Math.abs(r.width - q.width) < 4 && Math.abs((r.x + r.width / 2) - (q.x + q.width / 2)) < 4 }; })()`);
    await ev(`(()=>{ if (DZ.playback && DZ.playback.playing) dzPlayToggle(); return true; })()`); await wait(300);
    assert.ok(play.porCam > 0 && play.sin === 0, "el play no sale por la cámara (la exportación sí): " + JSON.stringify(play));
    assert.ok(!play.imagen || play.enMarco, "la imagen del play no está dentro del marco de la cámara: " + JSON.stringify(play));

    // ── 8. el tutorial, haciendo cada paso ──
    await nuevo();
    await ev(`dzMenuAction("tutorialcamara")`); await wait(300);
    const paso = () => ev(`(()=>{ const t = document.querySelector("#dzCamTutorial"); return t && !t.hidden ? t.dataset.paso : null; })()`);
    assert.equal(await paso(), "modo", "Ayuda → «Tutorial: mover la cámara» no abrió el tutorial en su primer paso");
    await ev(`(()=>{ dzCamToggle(); return true; })()`); await wait(700);
    assert.equal(await paso(), "inicio", "entrar al modo cámara no pasó al paso del encuadre de inicio");
    await clic(P('[data-a="ir-desde"]'), "«Encuadre de inicio»");
    enc = await encuadre(); await arrastrar({ x: enc.x - enc.w * 0.2, y: enc.y }, -50, 0); await wait(700);
    assert.equal(await paso(), "final", "fijar el encuadre de inicio no pasó al paso del encuadre final");
    await escribir(P('[data-a="hasta"]'), "24");
    await clic(P('[data-a="ir-hasta"]'), "«Encuadre final»");
    enc = await encuadre(); await arrastrar({ x: enc.x, y: enc.y + enc.h * 0.2 }, 120, 20); await wait(700);
    assert.equal(await paso(), "recorrido", "mover el encuadre final no pasó al paso del recorrido");
    await clic(`document.querySelector('#dzCamTutorial [data-t="sig"]')`, "«Siguiente» del tutorial"); await wait(300);
    assert.equal(await paso(), "play", "«Siguiente» no pasó al paso del play");
    await clic(P('[data-a="ver"]'), "«▶ Ver el movimiento»"); await wait(900);
    assert.equal(await paso(), "listo", "reproducir no terminó el tutorial");
    await ev(`(()=>{ if (DZ.playback && DZ.playback.playing) dzPlayToggle(); return true; })()`);

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E cámara: método inicio→fin y tutorial OK", JSON.stringify({ play }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
