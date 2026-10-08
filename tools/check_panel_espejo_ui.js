/* LA VENTANA SEPARADA MUESTRA EL PANEL DE VERDAD. CDP :9223 + mock :8791.

   Reporte de Mauro (oct-2026, LOW 3.12): «la división de ventanas de
   herramientas desacopladas todavía no funciona bien, pierde el estilo, y no
   estoy pudiendo desacoplar la línea de tiempo».

   Medido en la app real, la ventana separada era otro dibujo del panel:
   Capas con los ids internos (`dz-l-1`) y sin Fusión ni Z, Color con «Elegí
   un elemento en el lienzo», Herramientas en grilla con un texto en vez de un
   icono. Y la línea de tiempo no tenía «Otra pantalla»: sólo salía por el
   menú Ventana.

   Dos pestañas del MISMO origen, como en la app (main.py abre la separada en
   http://127.0.0.1:<puerto>/animation_panel.html), con el ratón de verdad:
   1. Capas: la ventana separada tiene el inspector real (mismas filas, mismo
      estilo computado que acoplado); un clic en una fila selecciona esa capa
      en el estudio y la ventana lo muestra; separarlo no le escribe ids al
      dibujo (eso renombraba la capa a «dz-l-3» y se guardaba en el archivo).
   2. Herramientas: el riel real, con el icono de la flecha; un clic en el
      pincel lo elige en el estudio.
   3. Línea de tiempo: la pestaña tiene «Otra pantalla» y separa; la ventana
      tiene la grilla real; un clic en la regla cambia el cuadro, y arrastrar
      sobre ella lo hojea.
   4. Color: el bloque de estilo real (no el «Elegí un elemento»); escribir el
      grosor allá lo cambia acá.
   5. Acoplar: los paneles vuelven a su lugar, visibles y sin restos. */
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const panelUrl = url.replace(/index\.html.*$/, "animation_panel.html");
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function pestana(w, h) {
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
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile: false });
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
  const centro = async (expr) => { const c = await ev(`(()=>{ const e = (${expr}); if (!e) return null; const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; })()`);
    assert.ok(c, "no está en pantalla: " + expr); return c; };
  const clic = async (expr) => { const [x, y] = await centro(expr);
    await mouse("mouseMoved", x, y); await mouse("mousePressed", x, y, { buttons: 1, clickCount: 1 }); await mouse("mouseReleased", x, y, { buttons: 0, clickCount: 1 }); };
  const arrastrar = async (de, a) => { const [x1, y1] = await centro(de), [x2, y2] = await centro(a);
    await mouse("mouseMoved", x1, y1); await mouse("mousePressed", x1, y1, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i++) { await mouse("mouseMoved", x1 + (x2 - x1) * i / 12, y1 + (y2 - y1) * i / 12, { buttons: 1 }); await wait(30); }
    await mouse("mouseReleased", x2, y2, { buttons: 0, clickCount: 1 }); };
  const escribir = async (texto) => { for (const ch of texto) await send("Input.dispatchKeyEvent", { type: "char", text: ch }); };
  const tecla = async (key, code, kc) => { await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: kc });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: kc }); };
  const cerrar = async () => { ws.close(); try { await fetch(endpoint + "/json/close/" + tab.id); } catch (_) { } };
  return { send, ev, errores, clic, arrastrar, escribir, tecla, cerrar };
}
const hasta = async (p, expr, ms = 4000) => { const t0 = Date.now(); let v;
  while (Date.now() - t0 < ms) { v = await p.ev(expr).catch(() => null); if (v) return v; await wait(120); } return v; };

async function main() {
  const est = await pestana(1366, 768);
  const ventanas = [];
  try {
    await est.send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await est.ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api').catch(() => false)) break; await wait(300); }
    await est.ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} window.__paginaVieja = 1; return true; })()');
    await est.send("Page.reload");
    for (let i = 0; i < 120; i++) { if (await est.ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api').catch(() => false)) break; await wait(300); }
    await est.ev(`dzMenuAction("nuevo")`); await wait(2600);
    // las ventanas nativas las abre Python: acá se anota el pedido y la abre la prueba
    await est.ev(`(()=>{ if (typeof closeL3d === "function") closeL3d(); window.__abiertas = [];
      api.open_panel = async (k) => { __abiertas.push(k); return { ok: true }; };
      api.open_animation_panel = async (k) => { __abiertas.push(k); return { ok: true }; };
      api.close_panel = async () => ({ ok: true }); return true; })()`);

    const abrir = async (kind, w, h) => {
      const p = await pestana(w, h);
      await p.send("Page.addScriptToEvaluateOnNewDocument", { source:
        "window.__cmd = []; window.pywebview = { api: { panel_state: async () => ({}), animation_panel_state: async () => ({})," +
        " panel_command: async (k, a, pl) => { __cmd.push([k, a]); return {}; }, animation_panel_command: async (a) => { __cmd.push(['timeline', a]); return {}; }," +
        " close_panel: async () => ({}), panel_closed: async () => ({}) } };" +
        "addEventListener('load', () => setTimeout(() => dispatchEvent(new Event('pywebviewready')), 50));" });
      await p.send("Page.navigate", { url: panelUrl + "#kind=" + kind });
      ventanas.push(p);
      const ok = await hasta(p, `!!window.__lowEspejo && document.querySelectorAll("#espejo *").length > 20`, 6000);
      assert.ok(ok, "la ventana separada «" + kind + "» no muestra el panel de verdad (sigue el dibujo a mano)");
      await wait(400);
      return p;
    };

    // ── 1. Capas ──────────────────────────────────────────────────────────
    // con las preferencias de fábrica el inspector arranca escondido: se lo
    // muestra para medir cómo se ve acoplado
    await est.ev(`(()=>{ try { LOW.workspace.panels.show("layers"); } catch (_) {} const e = document.querySelector(".dz-inspector");
      if (e.hidden) e.hidden = false; if (typeof dzBuildLayers === "function") dzBuildLayers(); return true; })()`);
    await wait(500);
    const acoplada = await est.ev(`(()=>{ const t = [...document.querySelectorAll(".dz-inspector .dz-layer-t")];
      const cs = getComputedStyle(t[0]), fila = getComputedStyle(t[0].closest(".dz-lay-row"));
      return { nombres: t.map(x => x.textContent), fuente: cs.fontFamily, color: cs.color, peso: cs.fontWeight, alto: fila.height,
        ids: document.querySelectorAll('#dzCanvas > svg [id^="dz-l-"]').length }; })()`);
    assert.ok(acoplada.nombres.length >= 2, "el inspector acoplado no tiene capas: " + JSON.stringify(acoplada));
    await est.ev(`dzDetachPanel("layers")`); await wait(300);
    const capas = await abrir("layers", 340, 720);
    const separada = await capas.ev(`(()=>{ const t = [...document.querySelectorAll("#espejo .dz-inspector .dz-layer-t")];
      if (!t.length) return null; const cs = getComputedStyle(t[0]), fila = getComputedStyle(t[0].closest(".dz-lay-row"));
      return { nombres: t.map(x => x.textContent), fuente: cs.fontFamily, color: cs.color, peso: cs.fontWeight, alto: fila.height,
        fusion: !!document.querySelector("#espejo select") }; })()`);
    assert.ok(separada, "la ventana de Capas no tiene las filas del inspector");
    assert.deepEqual(separada.nombres, acoplada.nombres, "las capas separadas no son las del estudio");
    assert.ok(!separada.nombres.some((n) => /^dz-l-/.test(n)), "las capas separadas muestran ids internos: " + separada.nombres);
    for (const k of ["fuente", "color", "peso", "alto"])
      assert.equal(separada[k], acoplada[k], "Capas separada pierde el estilo (" + k + "): " + separada[k] + " · acoplada " + acoplada[k]);
    assert.ok(separada.fusion, "la ventana de Capas no tiene la Fusión");
    const ids = await est.ev(`document.querySelectorAll('#dzCanvas > svg [id^="dz-l-"]').length`);
    assert.equal(ids, acoplada.ids, "separar Capas le escribió ids al dibujo (la capa pasa a llamarse «dz-l-N» y se guarda)");
    const otra = acoplada.nombres[1];
    await capas.clic(`[...document.querySelectorAll("#espejo .dz-layer-t")].find(e => e.textContent === ${JSON.stringify(otra)})`);
    const elegida = await hasta(est, `document.querySelector(".dz-inspector .dz-lay-row.sel .dz-layer-t")?.textContent === ${JSON.stringify(otra)}`);
    assert.ok(elegida, "un clic en una fila de la ventana separada no eligió esa capa en el estudio");
    const marcada = await hasta(capas, `document.querySelector("#espejo .dz-lay-row.sel .dz-layer-t")?.textContent === ${JSON.stringify(otra)}`);
    assert.ok(marcada, "la ventana separada no muestra la capa elegida");

    // ── 2. Herramientas ───────────────────────────────────────────────────
    await est.ev(`dzDetachPanel("tools")`); await wait(300);
    const herr = await abrir("tools", 140, 640);
    const flecha = await herr.ev(`(()=>{ const u = document.querySelector('#espejo [data-tool="select"] use'); if (!u) return null;
      const s = document.getElementById(u.getAttribute("href").slice(1)); return s ? s.innerHTML : null; })()`);
    const flechaEst = await est.ev(`(()=>{ const u = document.querySelector('[data-tool="select"] use'); return document.getElementById(u.getAttribute("href").slice(1)).innerHTML; })()`);
    assert.equal(flecha, flechaEst, "el icono de la flecha en la ventana separada no es el del estudio");
    // el riel llena el alto de SU ventana (medido en la app real: quedaba clavado en 60 px)
    const alto = await hasta(herr, `(()=>{ const r = document.querySelector("#espejo .dz-tools").getBoundingClientRect(); return r.height >= innerHeight - 80 ? r.height : 0; })()`);
    assert.ok(alto, "el riel separado no llena su ventana: " + await herr.ev(`document.querySelector("#espejo .dz-tools").getBoundingClientRect().height + " de " + innerHeight`));
    await herr.clic(`document.querySelector('#espejo [data-tool="brush"]')`);
    assert.ok(await hasta(est, `DZ.tool === "brush"`), "un clic en el pincel de la ventana separada no lo eligió en el estudio");
    assert.ok(await hasta(herr, `document.querySelector('#espejo [data-tool="brush"]').classList.contains("active")`),
      "la ventana separada no marca el pincel como elegido");

    // ── 3. Línea de tiempo ────────────────────────────────────────────────
    const boton = await est.ev(`(()=>{ const b = document.getElementById("dzTlOtraPantalla"); return b && b.getBoundingClientRect().width > 0 ? b.textContent : null; })()`);
    assert.ok(boton, "la pestaña de la línea de tiempo no tiene «Otra pantalla»");
    await est.clic(`document.getElementById("dzTlOtraPantalla")`); await wait(600);
    assert.ok((await est.ev("window.__abiertas")).includes("timeline"), "«Otra pantalla» no separó la línea de tiempo");
    const tl = await abrir("timeline", 1180, 520);
    assert.ok(await tl.ev(`!!document.querySelector("#espejo .tl2-ruler")`), "la ventana de la línea de tiempo no tiene la grilla real");
    const reglas = [await est.ev(`(()=>{ const r = document.querySelector(".tl2-ruler"); return getComputedStyle(r).backgroundImage; })()`),
      await tl.ev(`getComputedStyle(document.querySelector("#espejo .tl2-ruler")).backgroundImage`)];
    assert.equal(reglas[1], reglas[0], "la regla de la ventana separada pierde la banda del estudio");
    await tl.clic(`document.querySelectorAll("#espejo .tl2-ruler .tl2-tick")[5]`);
    assert.ok(await hasta(est, `DZ.doc.frame === 6`), "un clic en la regla de la ventana separada no cambió el cuadro");
    await tl.arrastrar(`document.querySelectorAll("#espejo .tl2-ruler .tl2-tick")[1]`, `document.querySelectorAll("#espejo .tl2-ruler .tl2-tick")[12]`);
    assert.ok(await hasta(est, `DZ.doc.frame === 13`), "arrastrar sobre la regla separada no hojeó: cuadro " + await est.ev("DZ.doc.frame"));
    assert.equal(await est.ev(`document.getElementById("dzTlOtraPantalla").textContent`), "Traer de vuelta",
      "con la línea de tiempo afuera, la pestaña no ofrece traerla");

    // ── 4. Color ──────────────────────────────────────────────────────────
    await est.ev(`dzDetachPanel("color")`); await wait(300);
    const color = await abrir("color", 340, 420);
    assert.ok(!(await color.ev(`/Elegí un elemento/.test(document.body.innerText)`)), "la ventana de Color sigue siendo el dibujo a mano");
    const campo = `[...document.querySelectorAll("#espejo input[type=number]")].find(i => i.offsetParent)`;
    assert.ok(await color.ev(`!!${campo}`), "la ventana de Color no tiene sus campos");
    const idx = await color.ev(`[...document.querySelectorAll("#espejo input[type=number]")].indexOf(${campo})`);
    await color.clic(campo);
    await color.ev(`(()=>{ const i = ${campo}; i.select(); return true; })()`);
    await color.escribir("7"); await color.tecla("Enter", "Enter", 13); await wait(500);
    const vivo = await est.ev(`(()=>{ const s = document.querySelector("#dzStyle, #dzPalette"); const i = s.querySelectorAll("input[type=number]")[${idx}]; return i ? i.value : null; })()`);
    assert.equal(vivo, "7", "escribir en un campo de la ventana de Color no cambió el del estudio: " + vivo);

    // ── 5. Acoplar ────────────────────────────────────────────────────────
    await capas.clic(`document.getElementById("espejoAcoplar")`); await wait(200);
    assert.deepEqual((await capas.ev("window.__cmd")).slice(-1)[0], ["layers", "dock"], "«Acoplar» de la ventana separada no pidió acoplar");
    // lo que hace Python al recibirlo, y la X de las otras ventanas
    for (const k of ["layers", "tools", "timeline", "color"])
      await est.ev(`lowPanelCommand({ kind: ${JSON.stringify(k)}, action: "dock", payload: { kind: ${JSON.stringify(k)} } })`);
    await wait(700);
    const vuelta = await est.ev(`(()=>{ const f = (s) => { const e = document.querySelector(s), r = e.getBoundingClientRect();
        return { x: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height), oculto: e.hidden, espejado: e.classList.contains("dz-espejado"), padre: e.parentElement.id || e.parentElement.className }; };
      return { capas: f(".dz-inspector"), herr: f(".dz-tools"), tl: f("#dzTimeline"), grilla: f("#dzTlGrid"), estilo: f("#dzStyle, #dzPalette"),
        restos: (LOW.panelEspejo.host && LOW.panelEspejo.host.childElementCount) || 0, activos: LOW.panelEspejo.activos.size,
        boton: document.getElementById("dzTlOtraPantalla").textContent }; })()`);
    for (const k of ["capas", "herr", "tl", "grilla", "estilo"]) {
      const v = vuelta[k];
      assert.ok(!v.oculto && !v.espejado && v.w > 20 && v.h > 10 && v.x >= 0 && v.x < 1366, "«" + k + "» no volvió a su lugar al acoplar: " + JSON.stringify(v));
    }
    assert.equal(vuelta.restos, 0, "quedaron restos del espejo en el estudio");
    assert.equal(vuelta.activos, 0, "el estudio sigue espejando paneles ya acoplados");
    const ofrece = await hasta(est, `document.getElementById("dzTlOtraPantalla").textContent === "Otra pantalla"`, 2500);
    assert.ok(ofrece, "acoplada la línea de tiempo, la pestaña no vuelve a ofrecer «Otra pantalla»: " + JSON.stringify(await est.ev(
      `({ texto: document.getElementById("dzTlOtraPantalla").textContent, det: [...(DZ.detached || [])], anim: [...(DZ.detachedAnimationPanels || [])] })`)));

    const errores = [est, ...ventanas].flatMap((p) => p.errores).filter((e) => !/ResizeObserver/.test(String(e)));
    assert.deepEqual(errores.slice(0, 3), [], "errores de JavaScript");
    console.log("E2E panel separado = panel de verdad OK " + JSON.stringify({ capas: separada.nombres, fuente: separada.fuente.split(",")[0] }));
  } finally {
    for (const p of ventanas) await p.cerrar();
    await est.cerrar();
  }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
