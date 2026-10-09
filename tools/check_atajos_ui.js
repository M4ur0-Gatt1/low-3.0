/* CADA ATAJO HACE LO QUE ANUNCIA. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026, LOW 3.12.2): «buscá si no hay más errores como
   el de la coma y el punto, y mejorá el menú de atajos para que haya más y
   uno para cada herramienta».

   Errores de esa familia que esta prueba caza —todos medidos antes del
   arreglo—:
   · L y O figuraban como Línea y Elipse; con un documento abierto los
     atrapaban los atajos de animación (loop y papel cebolla).
   · En el esqueleto, P elegía la pose del rig Y ADEMÁS la Pluma.
   · La Regla anunciaba «(R)», que era el Rectángulo; no tenía tecla.
   · Herramientas del cajón sin tecla (Inflar, Bomba, Plancha, Pinza,
     Esculpir, Imán).
   · El 🔑 marcaba SIEMPRE el cuadro 1 en un .low y guardaba el documento.
   · «,» «.» dependían de que hubiera reproducción montada.
   · «Generar los cuadros» de la actuación no agregaba nada en un .low.

   Con el teclado y el ratón de verdad:
   1. El mapa: sin teclas repetidas, y TODA herramienta del riel y del cajón
      tiene la suya; la ayuda de cada botón anuncia la tecla del mapa.
   2. En Dibujo y en Animación (con documento): cada tecla del mapa llega al
      despacho con SU acción —nadie se la roba en el camino—.
   3. Cada tecla de herramienta elige esa herramienta.
   4. En el esqueleto, P no elige además la Pluma.
   5. Preferencias: reasignar la Regla a Shift+R con el teclado; el Polígono
      (que la tenía) queda libre y avisa; la ayuda de la Regla dice Shift+R;
      apretar Shift+R en la mesa elige la Regla. «Restaurar» vuelve a U.
   6. «.» avanza aunque no haya reproducción montada.
   7. 🔑 marca el DIBUJO del cuadro actual (no el 1), se ve en el botón y en la
      celda, y Ctrl+Z lo deshace.
   8. «Generar los cuadros» de la actuación sostiene el dibujo en un .low. */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* tecla del mapa → evento de teclado de verdad */
const CODIGOS = { ",": ["Comma", 188], ".": ["Period", 190], "[": ["BracketLeft", 219], "]": ["BracketRight", 221],
  "+": ["Equal", 187], "-": ["Minus", 189] };
function eventoDe(k) {
  const partes = k === "+" ? ["+"] : k.split("+"), base = partes.pop();
  const alt = partes.includes("alt"), shift = partes.includes("shift");
  const modifiers = (alt ? 1 : 0) + (shift ? 8 : 0);
  if (base === "enter") return { key: "Enter", code: "Enter", vk: 13, text: "\r", modifiers };
  if (base === "tab") return { key: "Tab", code: "Tab", vk: 9, modifiers };
  if (/^f\d{1,2}$/.test(base)) return { key: base.toUpperCase(), code: base.toUpperCase(), vk: 111 + +base.slice(1), modifiers };
  if (/^[a-z]$/.test(base)) { const K = base.toUpperCase(); return { key: shift ? K : base, code: "Key" + K, vk: K.charCodeAt(0), text: alt ? undefined : (shift ? K : base), modifiers }; }
  if (/^\d$/.test(base)) return { key: base, code: "Digit" + base, vk: 48 + +base, text: alt ? undefined : base, modifiers };
  const [code, vk] = CODIGOS[base] || ["", 0];
  return { key: base, code, vk, text: base, modifiers };
}

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
  const tecla = async (k, espera = 120) => {
    const e = eventoDe(k);
    await send("Input.dispatchKeyEvent", { type: e.text ? "keyDown" : "rawKeyDown", key: e.key, code: e.code, windowsVirtualKeyCode: e.vk, modifiers: e.modifiers, ...(e.text ? { text: e.text } : {}) });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: e.key, code: e.code, windowsVirtualKeyCode: e.vk, modifiers: e.modifiers });
    await wait(espera);
  };
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
  const clicEn = async (expr) => { const c = await ev(`(()=>{ const e = (${expr}); if (!e) return null; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    assert.ok(c, "no está en pantalla: " + expr);
    await mouse("mouseMoved", c[0], c[1]); await mouse("mousePressed", c[0], c[1], { buttons: 1, clickCount: 1 }); await mouse("mouseReleased", c[0], c[1], { buttons: 0, clickCount: 1 }); await wait(300); };
  const soltarFoco = () => ev('(()=>{ const a = document.activeElement; if (a && a.blur) a.blur(); return 1; })()');
  const abrir = async (espacio) => {
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!(window.LOW&&LOW.atajos)').catch(() => false)) break; await wait(300); }
    await ev(`(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active",${JSON.stringify(espacio)});}catch(e){} window.__paginaVieja = 1; return true; })()`);
    await send("Page.reload");
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!(window.LOW&&LOW.atajos)').catch(() => false)) break; await wait(300); }
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); return 1; })()');
    await soltarFoco();
  };

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await abrir("drawing");

    // ── 1. el mapa ─────────────────────────────────────────────────────────
    const mapa = await ev(`(()=>{ dzKeysLoad(); return { keymap: DZ.keymap, catalogo: LOW.atajos.CATALOGO.map(c => ({ act: c[0], sel: c[4] })),
      herramientas: [...new Set([...document.querySelectorAll("[data-tool]")].map(b => b.dataset.tool))] }; })()`);
    const teclas = Object.entries(mapa.keymap).filter(([, k]) => k);
    const repetidas = teclas.filter(([a, k]) => teclas.some(([a2, k2]) => a2 !== a && k2 === k)).map(([a, k]) => a + "=" + k);
    assert.deepEqual(repetidas, [], "hay teclas repetidas en el mapa de fábrica");
    const sinTecla = mapa.herramientas.filter((t) => !mapa.keymap[t]);
    assert.deepEqual(sinTecla, [], "herramientas del riel/cajón sin atajo");
    const ayudas = await ev(`LOW.atajos.CATALOGO.filter(c => c[4] && DZ.keymap[c[0]]).map(c => { const b = document.querySelector(c[4]); const t = b ? (b.dataset.tituloAyuda || b.title || "") : null;
      return { act: c[0], t, ok: t == null || t.includes("(" + dzAtajoEtiqueta(DZ.keymap[c[0]]) + ")") }; }).filter(x => !x.ok)`);
    assert.deepEqual(ayudas, [], "la ayuda de estos botones no anuncia la tecla del mapa");
    assert.ok(!(await ev(`document.querySelector('[data-tool="ruler"]').title.includes("(R)")`)), "la Regla sigue anunciando «(R)», que es el Rectángulo");

    // ── 2. cada tecla llega con SU acción, en Dibujo y en Animación ────────
    const espia = `(()=>{ window.__acts = []; if (!window.__dzRunReal) window.__dzRunReal = window.dzRunAction; window.dzRunAction = function (a) { __acts.push(a); }; return 1; })()`;
    const recorrer = async (espacio) => {
      await ev(espia); await soltarFoco();
      const robadas = [];
      for (const [act, k] of teclas) {
        await ev("window.__acts = []");
        await tecla(k, 40);
        const llego = await ev("window.__acts.slice()");
        if (llego.length !== 1 || llego[0] !== act) robadas.push(act + "(" + k + ") → " + JSON.stringify(llego));
      }
      await ev("(()=>{ window.dzRunAction = window.__dzRunReal; return 1; })()");
      assert.deepEqual(robadas, [], "en " + espacio + " estas teclas no llegan a su acción (otra cosa se las queda)");
    };
    await recorrer("Dibujo");

    // ── 3. cada tecla de herramienta elige la herramienta ───────────────────
    const fallan = [];
    for (const t of mapa.herramientas) {
      await ev('(()=>{ dzSetTool("select"); return 1; })()'); await soltarFoco();
      await tecla(mapa.keymap[t], 150);
      const ahora = await ev("DZ.tool");
      if (ahora !== t) fallan.push(t + " (" + mapa.keymap[t] + ") → " + ahora);
    }
    for (const [forma, kind] of [["rect", "rect"], ["ellipse", "ellipse"], ["circle", "circle"], ["poly", "poly"], ["star", "star"], ["line", "line"]]) {
      await ev('(()=>{ dzSetTool("select"); return 1; })()'); await soltarFoco();
      await tecla(mapa.keymap[forma], 150);
      const r = await ev("({ t: DZ.tool, k: DZ.shapeKind })");
      if (r.t !== "shape" || r.k !== kind) fallan.push(forma + " (" + mapa.keymap[forma] + ") → " + JSON.stringify(r));
    }
    assert.deepEqual(fallan, [], "estas teclas no eligen su herramienta");

    // ── 5. Preferencias: reasignar con el teclado ───────────────────────────
    await ev(`(()=>{ dzSetTool("select"); dzMenuAction("atajos"); return 1; })()`); await wait(600);
    await clicEn(`document.querySelector('.atajos .dz-keycap[data-act="ruler"]')`);
    await tecla("shift+r", 300);
    const tras = await ev(`({ ruler: DZ.keymap.ruler, poly: DZ.keymap.poly, aviso: document.querySelector(".atajos-aviso").textContent,
      campo: document.querySelector('.atajos .dz-keycap[data-act="ruler"]').value, ayuda: document.querySelector('[data-tool="ruler"]').title })`);
    assert.equal(tras.ruler, "shift+r", "Preferencias no tomó Shift+R para la Regla: " + JSON.stringify(tras));
    assert.equal(tras.poly, "", "el Polígono, que tenía Shift+R, no quedó libre: " + JSON.stringify(tras));
    assert.ok(/Polígono/.test(tras.aviso), "no avisó de quién era la tecla: " + JSON.stringify(tras));
    assert.ok(tras.ayuda.includes("(Shift+R)"), "la ayuda de la Regla no se actualizó: " + tras.ayuda);
    await ev(`(()=>{ closeModal(); return 1; })()`); await wait(300); await soltarFoco();
    await tecla("shift+r", 200);
    assert.equal(await ev("DZ.tool"), "ruler", "Shift+R en la mesa no eligió la Regla después de reasignarla");
    await ev(`(()=>{ dzMenuAction("atajos"); return 1; })()`); await wait(500);
    await clicEn(`document.getElementById("prefReset")`);
    assert.equal(await ev("DZ.keymap.ruler + '|' + DZ.keymap.poly"), "u|shift+r", "«Restaurar» no volvió a los atajos de fábrica");
    await ev(`(()=>{ closeModal(); return 1; })()`); await wait(300);

    // ── 6. «.» sin reproducción montada ─────────────────────────────────────
    await soltarFoco();
    const sinPb = await ev(`(async()=>{ const pb = DZ.playback; DZ.playback = null; DZ.doc.goTo(1);
      document.dispatchEvent(new KeyboardEvent("keydown", { key: ".", code: "Period", bubbles: true, cancelable: true }));
      await new Promise(r => setTimeout(r, 100)); const f = DZ.doc.frame; DZ.playback = pb; return f; })()`);
    assert.equal(sinPb, 2, "«.» no avanzó cuando no había reproducción montada (se quedó en " + sinPb + ")");

    // ── 7. 🔑 marca el DIBUJO del cuadro actual ─────────────────────────────
    const DIB = '<g data-low-art="colour"></g><g data-low-art="line"><circle cx="900" cy="500" r="90" fill="none" stroke="#111" stroke-width="12"/></g>';
    await ev(`(()=>{ for (const f of [1, 2, 3]) { DZ.doc.goTo(f); DZ.doc.writeDrawing(${JSON.stringify(DIB)}); } DZ.doc.goTo(3); DZ.doc.emit("frame"); return 1; })()`);
    await ev(`(()=>{ LOW.workspace.workspaces.activate("animation", window.dzWsAplicar); return 1; })()`); await wait(1500);
    await ev(`(()=>{ DZ.doc.goTo(3); return 1; })()`); await wait(300);
    await clicEn(`document.getElementById("tlKey")`);
    const clave = await ev(`({ clave: !!(DZ.doc.drawing.meta && DZ.doc.drawing.meta.clave), uno: !!(DZ.doc.scene.drawingAt(DZ.doc.layerId, 1).meta || {}).clave,
      boton: document.getElementById("tlKey").classList.contains("active"),
      celda: !!document.querySelector('.tl2-cell[data-frame="3"].dibujo-clave'), estado: (document.querySelector("#dzStatusbar")||{}).innerText || "" })`);
    assert.ok(clave.clave, "🔑 no marcó el dibujo del cuadro 3: " + JSON.stringify(clave));
    assert.ok(!clave.uno, "🔑 marcó el cuadro 1 estando en el 3: " + JSON.stringify(clave));
    assert.ok(clave.boton, "el botón 🔑 no se ve prendido sobre un dibujo clave");
    assert.ok(clave.celda, "la celda del dibujo clave no tiene su marca en la línea de tiempo");
    await soltarFoco();
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "z", code: "KeyZ", windowsVirtualKeyCode: 90, modifiers: 2 }); await wait(400);
    assert.equal(await ev(`!!(DZ.doc.drawing.meta && DZ.doc.drawing.meta.clave)`), false, "Ctrl+Z no deshizo la marca de dibujo clave");

    // ── 2b. en Animación (con documento): nadie se roba las teclas ──────────
    await recorrer("Animación");

    // ── 4. el esqueleto no usa dos veces la tecla ───────────────────────────
    await ev(`(()=>{ if (!DZ.rigMode && typeof dzRigToggle === "function") dzRigToggle(); return DZ.rigMode; })()`); await wait(500);
    if (await ev("!!DZ.rigMode")) {
      // la tecla que el esqueleto usa en su modo: B en Armado (crear hueso), P al posar
      const armado = await ev(`(DZ.rigSubmode || "build") === "build"`);
      const [k, ajena] = armado ? ["b", "brush"] : ["p", "pen"];
      await ev(espia); await soltarFoco();
      await tecla(k, 150);
      const enRig = await ev("window.__acts.slice()");
      await ev("(()=>{ window.dzRunAction = window.__dzRunReal; return 1; })()");
      assert.ok(!enRig.includes(ajena), "en el esqueleto, " + k.toUpperCase() + " usó la herramienta del rig Y ADEMÁS " + ajena + ": " + JSON.stringify(enRig));
      await ev(`(()=>{ if (DZ.rigMode && typeof dzRigToggle === "function") dzRigToggle(); return 1; })()`); await wait(300);
    }

    // ── 8. «Generar los cuadros» de la actuación en un .low ─────────────────
    const bake = await ev(`(async()=>{ const antes = DZ.doc.scene.lastFrame(); DZ.doc.goTo(1);
      const d = document.getElementById("perfDur"); if (d) d.value = "1"; const fps = document.getElementById("tlFps"); if (fps) fps.value = "12";
      await dzPerfBake(); return { antes, despues: DZ.doc.scene.lastFrame() }; })()`);
    assert.ok(bake.despues >= 12 && bake.despues > bake.antes, "«Generar los cuadros» no agregó cuadros al .low: " + JSON.stringify(bake));

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    assert.deepEqual(graves.slice(0, 3), [], "errores de JavaScript");
    console.log("E2E atajos OK " + JSON.stringify({ teclas: teclas.length, herramientas: mapa.herramientas.length, bake }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
