/* LA MESA DE ANIMACIÓN Y LA PORTADA CON LA FILOSOFÍA. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026): «la filosofía no está tan clara: al abrir el
   módulo de animación —se llama LOW por Bowie y su capacidad generalista,
   multifacética— se ve algo impersonal, una descripción muy básica» y «que la
   rotación de la mesa de trabajo y su estética remitan a la clásica mesa de
   animación 2D, como tienen OpenToonz o Toon Boom».

   Con el mouse de verdad (Input.dispatchMouseEvent), no llamando funciones:
   1. La portada dice de dónde viene el nombre y qué es LOW (Bowie, *Low*,
      generalista), con lado A y lado B, y el disco de la mesa detrás.
      El dial de la mesa NO asoma encima de la portada.
   2. Con un documento: el disco está DEBAJO de la hoja, y con «Ajustar a
      pantalla» su aro se ve dentro del área de trabajo.
   3. Arrastrar el dial un cuarto de vuelta gira la hoja 90°, y el disco con
      ella; la hoja sólo cambia de vista (el dibujo no se toca).
   3b. Con la mesa girada aparece «↺ 0°»: un clic la endereza y el botón se va.
   4. Shift lo lleva de a 15°; la rueda, de a 5°.
   5. Doble clic endereza por el camino corto.
   6. Las teclas ] y [ (±15°) giran el disco (animado) y suman.
   7. El aro se agarra: arrastrarlo gira y NO dibuja. El vidrio fuera de la
      hoja NO es UI: un trazo que empieza ahí dibuja, como siempre.
   8. Vista → Mesa de animación la apaga (fondo liso, sin dial) y la prende. */
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
  const SHIFT = 8;
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
  const arrastrar = async (desde, hasta, { pasos = 12, modifiers = 0 } = {}) => {
    if (typeof desde === "function") desde = desde(0);
    await mouse("mouseMoved", desde.x, desde.y, { modifiers });
    await mouse("mousePressed", desde.x, desde.y, { buttons: 1, clickCount: 1, modifiers });
    for (let i = 1; i <= pasos; i++) {
      const k = i / pasos, p = typeof hasta === "function" ? hasta(k) : { x: desde.x + (hasta.x - desde.x) * k, y: desde.y + (hasta.y - desde.y) * k };
      await mouse("mouseMoved", p.x, p.y, { buttons: 1, modifiers }); await wait(16);
    }
    const fin = typeof hasta === "function" ? hasta(1) : hasta;
    await mouse("mouseReleased", fin.x, fin.y, { buttons: 0, clickCount: 1, modifiers }); await wait(120);
  };
  const clic = async (p, extra = {}) => {
    await mouse("mouseMoved", p.x, p.y); await mouse("mousePressed", p.x, p.y, { buttons: 1, clickCount: 1, ...extra });
    await mouse("mouseReleased", p.x, p.y, { buttons: 0, clickCount: 1, ...extra });
  };
  const centro = (sel) => ev(`(()=>{ const e = ${sel}; if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height } : null; })()`);
  const rot = () => ev("Math.round((DZ.viewRot || 0) * 10) / 10");
  const fijarRot = (g) => ev(`(()=>{ DZ.viewRot = ${g}; dzApplyZoom(); return true; })()`);
  // un cuarto de vuelta alrededor de un centro, empezando arriba, con radio r
  const arco = (c, r, desdeGrados, hastaGrados) => (k) => {
    const g = (desdeGrados + (hastaGrados - desdeGrados) * k - 90) * Math.PI / 180;
    return { x: c.x + Math.cos(g) * r, y: c.y + Math.sin(g) * r };
  };

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!api&&!!window.LOW_MESA').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); localStorage.setItem("low.workspace.active","drawing");}catch(e){} return true; })()');
    await ev('(()=>{ window.__paginaVieja = 1; return 1; })()').catch(() => 0);   // la página vieja sigue «lista» un instante tras el reload
    await send("Page.reload", { ignoreCache: true });
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&!!document.querySelector("#dzBienvenida2D [data-a=nuevo]:not([disabled])")').catch(() => false)) break; await wait(300); }

    // ── 1. LA PORTADA ──────────────────────────────────────────────────────
    const portada = await ev(`(()=>{ const c = document.querySelector("#dzBienvenida2D"); if (!c) return null;
      const dial = document.querySelector("#dzDisc"); let dialEncima = false;
      if (dial && !dial.hidden) { const r = dial.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); dialEncima = !!(e && e.closest("#dzDisc")); }
      return { texto: c.textContent.replace(/\\s+/g, " "), h2: c.querySelector("h2")?.textContent || "",
        lados: [...c.querySelectorAll("h3")].map(h => h.textContent.replace(/\\s+/g, " ").trim()),
        disco: /svg/.test(getComputedStyle(c.querySelector(".bien2d-mesa-gira") || c).backgroundImage), svgDeMesa: c.querySelectorAll(".bien2d-mesa svg").length, dialEncima }; })()`);
    assert.ok(portada, "no hay portada del módulo 2D");
    assert.match(portada.h2, /2D|Animaci/, "la portada no dice qué es esto");
    assert.match(portada.texto, /Bowie/, "la portada no dice de dónde viene el nombre: " + portada.texto);
    assert.match(portada.texto, /1977/, "la portada no nombra el disco");
    assert.match(portada.texto, /oficio/, "la portada no dice la idea generalista de LOW");
    assert.deepEqual(portada.lados.map(t => t.replace(/ .*/, "") + " " + t.split(" ")[1]), ["Lado A", "Lado B"], "la portada no tiene lado A y lado B: " + JSON.stringify(portada.lados));
    assert.ok(portada.disco, "la portada no muestra el disco de la mesa");
    assert.equal(portada.svgDeMesa, 0, "el disco de la portada deja elementos <svg> dentro de #dzCanvas");
    assert.ok(!portada.dialEncima, "el dial de la mesa asoma encima de la portada");
    // MEDIDO EN LA APP REAL (1366×705, con un rescate y recientes): la tarjeta
    // era más alta que el área y, centrada con place-items, lo que sobraba
    // ARRIBA no se podía alcanzar: no se veía ni la marca ni el lema. Se achica
    // la ventana para forzar el desborde y se exige ver el encabezado.
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 705, deviceScaleFactor: 1, mobile: false }); await wait(300);
    await ev(`(async()=>{ const hoy = Date.now() / 1000;
      api.recent_documents = async () => Array.from({ length: 8 }, (_, i) => ({ path: "C:/mock/disenos/escena_" + i + ".low", name: "escena_2026100" + i + ".low", folder: "disenos", mtime: hoy - i * 3600 }));
      localStorage.setItem("low.document.recovery.prueba", JSON.stringify({ path: "C:/mock/disenos/escena_sin_guardar.svg",
        content: "<svg xmlns='http://www.w3.org/2000/svg'><path d='M10 10 L90 90'/></svg>", metadata: {}, savedAt: Date.now() - 120000 }));
      dzBienvenida2DQuitar(); dzBienvenida2DPintar(); await new Promise(r => setTimeout(r, 600)); return true; })()`);
    const corta = await ev(`(()=>{ const c = document.querySelector("#dzBienvenida2D"); c.scrollTop = 0;
      const caja = c.getBoundingClientRect(), marca = c.querySelector(".bien2d-marca").getBoundingClientRect(), nuevo = c.querySelector('[data-a="nuevo"]').getBoundingClientRect();
      return { desborda: c.scrollHeight > c.clientHeight + 1, marcaArriba: Math.round(marca.top - caja.top), nuevoAlcanzable: nuevo.top >= caja.top - 1 }; })()`);
    assert.ok(corta.marcaArriba >= 0, "con poca altura, la marca y el lema de la portada quedan cortados arriba: " + JSON.stringify(corta));
    assert.ok(corta.nuevoAlcanzable, "con poca altura, «Nuevo documento» no se alcanza: " + JSON.stringify(corta));
    await ev(`(()=>{ localStorage.removeItem("low.document.recovery.prueba"); return true; })()`);
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false }); await wait(300);

    // ── 2. el disco DEBAJO de la hoja, y su aro a la vista ─────────────────
    const nuevo = await centro(`document.querySelector('#dzBienvenida2D [data-a="nuevo"]')`);
    await clic(nuevo); await wait(2600);
    await ev('(()=>{ if (typeof closeL3d === "function") closeL3d(); dzSetTool("select"); return true; })()');
    await clic(await centro(`document.querySelector("#dzZoomFit")`)); await wait(300);
    const mesa = await ev(`(()=>{ const cv = document.querySelector("#dzCanvas"), m = document.querySelector("#dzMesa"), svg = cv.querySelector(":scope > svg");
      const aro = m && m.querySelector(".mesa-aro"), d = m && m.querySelector(".mesa-disco").getBoundingClientRect();
      // cuántos grados del aro se ven y se pueden agarrar (uno cada 5°)
      let aLaVista = 0;
      if (aro) { const cx = d.x + d.width / 2, cy = d.y + d.height / 2, r = +aro.dataset.r;
        for (let g = 0; g < 360; g += 5) { const t = g * Math.PI / 180, e = document.elementFromPoint(cx + Math.cos(t) * r, cy + Math.sin(t) * r);
          if (e && e.classList.contains("mesa-aro")) aLaVista++; } }
      return { hay: !!m && !m.hidden, debajo: !!(m && svg && (m.compareDocumentPosition(svg) & 4)),
        dial: !!document.querySelector("#dzDisc:not([hidden])"), boton: document.querySelector("#dzDiscBtn")?.classList.contains("active"),
        aroALaVista: aLaVista * 5,
        // LA MESA NO ES DIBUJO: varias partes de LOW reconocen el dibujo por
        // «#dzCanvas svg»; un <svg> de la mesa (sus <text> de grados) pasaba
        // por texto del lienzo después de deshacer uno de verdad
        svgDeMesa: document.querySelectorAll("#dzMesa svg, #dzDisc svg").length,
        textoEnLienzo: document.querySelectorAll("#dzCanvas text").length }; })()`);
    assert.ok(mesa.hay && mesa.debajo, "el disco no está debajo de la hoja: " + JSON.stringify(mesa));
    assert.ok(mesa.dial && mesa.boton, "falta el dial o el botón de la mesa no está prendido: " + JSON.stringify(mesa));
    assert.deepEqual([mesa.svgDeMesa, mesa.textoEnLienzo], [0, 0], "la mesa deja elementos SVG dentro de #dzCanvas (pasan por dibujo): " + JSON.stringify(mesa));
    assert.ok(mesa.aroALaVista >= 40, "con «Ajustar a pantalla» el aro del disco casi no se ve: " + JSON.stringify(mesa));

    // ── 3. arrastrar el dial un cuarto de vuelta ───────────────────────────
    const dial = await centro(`document.querySelector("#dzDisc")`);
    const antesDibujo = await ev(`document.querySelector("#dzCanvas > svg").innerHTML.length`);
    await arrastrar(arco(dial, dial.w * 0.42, 0, 0), arco(dial, dial.w * 0.42, 0, 90), { pasos: 18 });
    const giro = await ev(`(()=>{ const svg = document.querySelector("#dzCanvas > svg"), d = document.querySelector("#dzMesa .mesa-disco");
      return { rot: Math.round(DZ.viewRot), hoja: svg.style.transform, disco: d.style.transform, dibujo: svg.innerHTML.length,
        grados: document.querySelector("#dzDisc .mesa-dial-grados").textContent }; })()`);
    assert.ok(Math.abs(giro.rot - 90) <= 3, "arrastrar el dial un cuarto de vuelta no giró la hoja 90°: " + JSON.stringify(giro));
    assert.match(giro.hoja, /rotate\(/, "la hoja no giró");
    assert.ok(giro.disco.includes("rotate(" + (giro.hoja.match(/rotate\(([^)]+)\)/) || [])[1] + ")"), "el disco no gira con la hoja: " + JSON.stringify(giro));
    assert.equal(giro.dibujo, antesDibujo, "girar el disco tocó el dibujo");
    assert.equal(giro.grados, giro.rot + "°", "el dial no muestra los grados");
    // el cuadro de la cámara está en el dibujo: tiene que girar con la hoja.
    // Antes quedaba derecho mientras la hoja giraba (sólo sumaba cam.rot).
    const cuadro = await ev(`(()=>{ const b = document.querySelector("#dzCam"); if (!b || b.hidden) return null;
      const m = new DOMMatrix(getComputedStyle(b).transform); return { ang: Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI), cam: dzCamCur().rot || 0 }; })()`);
    assert.ok(cuadro, "no se ve el cuadro de la cámara para medirlo");
    assert.ok(Math.abs(((cuadro.ang - cuadro.cam - giro.rot) % 360 + 540) % 360 - 180) <= 2, "el cuadro de la cámara no gira con la hoja: " + JSON.stringify({ cuadro, hoja: giro.rot }));

    // ── 3b. el botón «↺ 0°» (Mauro: «no encuentro el botón para restablecer el
    //    giro»): aparece con la mesa girada, endereza con un clic y se va ─────
    const boton = await ev(`(()=>{ const b = document.querySelector("#dzDisc .mesa-enderezar"); if (!b) return null; const r = b.getBoundingClientRect();
      return { visible: r.width > 0 && getComputedStyle(b).display !== "none", x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    assert.ok(boton && boton.visible, "con la mesa girada no se ve el botón para enderezarla: " + JSON.stringify(boton));
    await mouse("mouseMoved", boton.x, boton.y); await mouse("mousePressed", boton.x, boton.y, { buttons: 1, clickCount: 1 });
    await mouse("mouseReleased", boton.x, boton.y, { buttons: 0, clickCount: 1 }); await wait(600);
    assert.equal(await rot(), 0, "el botón «↺ 0°» no endereza la mesa");
    assert.ok(await ev(`getComputedStyle(document.querySelector("#dzDisc .mesa-enderezar")).display === "none"`), "con la mesa derecha el botón sigue a la vista");

    // ── 4. Shift de a 15°, rueda de a 5° ───────────────────────────────────
    await fijarRot(0);
    await arrastrar(arco(dial, dial.w * 0.42, 0, 0), arco(dial, dial.w * 0.42, 0, 37), { pasos: 10, modifiers: SHIFT });
    const conShift = await rot();
    assert.ok(conShift % 15 === 0 && conShift !== 0, "con Shift el disco no va de a 15°: " + conShift);
    await fijarRot(0);
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: dial.x, y: dial.y, deltaX: 0, deltaY: 100 }); await wait(400);
    assert.equal(await rot(), 5, "la rueda sobre el dial no gira de a 5°");

    // ── 5. doble clic endereza por el camino corto ─────────────────────────
    await fijarRot(350);
    await ev(`window.__pasoPor = []; (function mirar(){ window.__pasoPor.push(DZ.viewRot); if (window.__pasoPor.length < 40) setTimeout(mirar, 10); })(); true`);
    await mouse("mouseMoved", dial.x, dial.y);
    await mouse("mousePressed", dial.x, dial.y, { buttons: 1, clickCount: 1 }); await mouse("mouseReleased", dial.x, dial.y, { clickCount: 1 });
    await mouse("mousePressed", dial.x, dial.y, { buttons: 1, clickCount: 2 }); await mouse("mouseReleased", dial.x, dial.y, { clickCount: 2 });
    await wait(600);
    const derecho = await ev(`({ rot: DZ.viewRot, pasoPor: window.__pasoPor })`);
    assert.equal(derecho.rot % 360, 0, "el doble clic no enderezó: " + JSON.stringify(derecho.rot));
    assert.ok(derecho.pasoPor.every(g => g >= 340 || g === 0), "enderezar dio la vuelta larga: " + JSON.stringify(derecho.pasoPor));

    // ── 6. las teclas ] y [ (±15°) giran el disco (animado) y llegan ──────
    //    los botones de la barra se pliegan en el desborde a este ancho; la
    //    tecla es el camino que siempre está, y pasa por la misma dzRotView
    const tecla = async (key, code) => {
      await send("Input.dispatchKeyEvent", { type: "keyDown", key, code, text: key, windowsVirtualKeyCode: key === "]" ? 221 : 219 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: key === "]" ? 221 : 219 });
    };
    await fijarRot(0);
    await ev('(()=>{ document.activeElement?.blur?.(); return true; })()');
    await tecla("]", "BracketRight");
    const enMedio = await ev(`DZ.viewRot`);
    await wait(500);
    assert.equal(await rot(), 15, "la tecla ] no llevó el disco a 15°");
    assert.ok(enMedio < 15, "la tecla ] saltó en vez de girar el disco: " + enMedio);
    await tecla("[", "BracketLeft"); await tecla("[", "BracketLeft");
    await wait(600);
    assert.equal(await rot(), -15, "dos [ seguidos no suman: " + await rot());

    // ── 7. el aro se agarra y no dibuja; el vidrio dibuja ──────────────────
    await fijarRot(0);
    await ev('(()=>{ dzSetTool("brush"); return true; })()'); await wait(200);
    const cuenta = `document.querySelector("#dzCanvas > svg").querySelectorAll("*").length`;
    // un punto del aro que se vea (con la hoja apaisada, a los costados)
    const pAro = await ev(`(()=>{ const d = document.querySelector("#dzMesa .mesa-disco").getBoundingClientRect(), a = document.querySelector("#dzMesa .mesa-aro");
      const cx = d.x + d.width / 2, cy = d.y + d.height / 2, r = +a.dataset.r;
      for (let g = 0; g < 360; g += 5) { const t = (g - 90) * Math.PI / 180, x = cx + Math.cos(t) * r, y = cy + Math.sin(t) * r;
        const e = document.elementFromPoint(x, y); if (e && e.classList.contains("mesa-aro")) return { x, y, cx, cy, r, g }; }
      return null; })()`);
    assert.ok(pAro, "el aro del disco no se puede agarrar en ningún lado visible");
    const antesAro = await ev(cuenta);
    const desde = pAro.g, ang = (g) => { const t = (g - 90) * Math.PI / 180; return { x: pAro.cx + Math.cos(t) * pAro.r, y: pAro.cy + Math.sin(t) * pAro.r }; };
    await arrastrar(ang(desde), (k) => ang(desde + 30 * k), { pasos: 10 });
    const trasAro = { rot: await rot(), elementos: await ev(cuenta) };
    assert.ok(Math.abs(trasAro.rot - 30) <= 3, "arrastrar el aro no gira el disco: " + JSON.stringify(trasAro));
    assert.equal(trasAro.elementos, antesAro, "arrastrar el aro con el pincel dibujó un trazo");
    await fijarRot(0); await wait(100);
    // el vidrio iluminado, justo arriba de la hoja: un trazo que empieza ahí dibuja
    const pVidrio = await ev(`(()=>{ const s = document.querySelector("#dzCanvas > svg").getBoundingClientRect(), c = document.querySelector("#dzCanvas").getBoundingClientRect();
      const x = s.x + s.width * 0.3, y = Math.max(c.y + 4, s.y - 10); const e = document.elementFromPoint(x, y);
      return { x, y, sobre: e ? (e.id || e.className?.baseVal || e.className || e.tagName) : null, ui: !!(e && e.closest(".dz-disc")) }; })()`);
    assert.ok(!pVidrio.ui, "el vidrio fuera de la hoja se comporta como UI: " + JSON.stringify(pVidrio));
    const antesVidrio = await ev(cuenta);
    await arrastrar(pVidrio, { x: pVidrio.x + 160, y: pVidrio.y + 60 }, { pasos: 14 }); await wait(400);
    assert.ok(await ev(cuenta) > antesVidrio, "un trazo que empieza en el vidrio, fuera de la hoja, ya no dibuja");

    // ── 8. apagar y prender la mesa desde Vista → Mesa de animación ──────
    //    (el botón de la barra vive en el cajón «…» a este ancho)
    const porMenu = async () => {
      await clic(await centro(`document.querySelector('.dz-menu[data-menu="vista"]')`)); await wait(250);
      await clic(await centro(`document.querySelector('.dz-menu[data-menu="vista"] [data-act="mesa"]')`)); await wait(250);
    };
    await porMenu();
    const apagada = await ev(`({ mesa: !!document.querySelector("#dzMesa:not([hidden])"), dial: !!document.querySelector("#dzDisc:not([hidden])"),
      boton: document.querySelector("#dzDiscBtn").classList.contains("active"), guardado: localStorage.getItem("low.mesa.v1") })`);
    assert.deepEqual(apagada, { mesa: false, dial: false, boton: false, guardado: "0" }, "Vista → Mesa de animación no la apaga: " + JSON.stringify(apagada));
    await porMenu();
    assert.ok(await ev(`!!document.querySelector("#dzMesa:not([hidden])") && !!document.querySelector("#dzDisc:not([hidden])")`), "Vista → Mesa de animación no la vuelve a prender");

    assert.deepEqual(errores, [], "errores de JavaScript: " + errores.join(" | "));
    console.log("E2E mesa de animación OK", JSON.stringify({ aro: mesa.aroALaVista, dial: giro.rot, shift: conShift, aroGira: trasAro.rot }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {}); }
}
main().catch((e) => { console.error(e); process.exit(1); });
