/* LIPSYNC SINCRONIZADO CON EL AUDIO, EN EL EDITOR. CDP :9223 + mock :8791.

   Pedido de Mauro (oct-2026, LOW 3.21): «sumá la sincronización con el audio
   real» al lipsync desde el texto.

   Una voz sintética de verdad conocida (tools/voz_sintetica.js) se carga como
   el audio de la escena —un AudioBuffer real—, corrido 10 cuadros. Con el
   teclado y el ratón de verdad:
   1. «Sincronizar con el audio de la toma» está habilitado y nombra la pista.
   2. Tildarlo y escribir el diálogo: la vista previa dice dónde está la voz,
      y la voz empieza donde empieza de verdad (±2 cuadros, con el corrimiento).
   3. «Crear las claves»: las bocas caen sobre la voz (≥ 75 % del tiempo con el
      visema verdadero) y mejor que la estimación sólo por texto.
   4. El diálogo queda guardado como sincronizado.
   5. Una ventana del audio sin voz: lo dice y no crea claves.
   6. Al «reabrir» sin el sonido (el .low guarda la onda, no el audio): el
      tilde se apaga y pide volver a cargarlo. */
const assert = require("node:assert/strict");
const fs = require("fs"), path = require("path");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// la voz y su verdad, armadas en node con el mismo módulo de fonética de LOW
global.window = global; global.self = global;
eval(fs.readFileSync(path.join(__dirname, "..", "ui/animation/lipsync-texto.js"), "utf8"));
const L = global.LOW.animation.lipsyncTexto;
const { generar, precision } = require("./voz_sintetica.js");
const TEXTO = "Hola, ¿cómo estás, mamá?";
const VOZ = generar(L, TEXTO, { semilla: 77, silencioInicial: 0.8, pausas: { coma: 0.45 } });
const OFFSET = 10;   // el audio empieza en el cuadro 11

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
  const clicEl = async (sel, nombre) => {
    const c = await ev(`(()=>{ const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; e.scrollIntoView({ block: "center" }); const r = e.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; })()`);
    assert.ok(c, "no se ve: " + nombre);
    for (const t of ["mouseMoved", "mousePressed", "mouseReleased"]) await mouse(t, c[0], c[1], { buttons: t === "mousePressed" ? 1 : 0, clickCount: 1 });
    await wait(450);
  };
  const escribir = async (sel, texto) => {
    await clicEl(sel, sel);
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "a", code: "KeyA", windowsVirtualKeyCode: 65, modifiers: 2 });
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Delete", code: "Delete", windowsVirtualKeyCode: 46 });
    await send("Input.insertText", { text: String(texto) }); await wait(500);
  };
  const previa = () => ev(`document.querySelector("#rigLipPrevia").textContent`);

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Emulation.setFocusEmulationEnabled", { enabled: true });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!(LOW.lipsyncTextoPanel)&&!!(LOW.animation.lipsyncAudio)').catch(() => false)) break; await wait(300); }
    await ev('(()=>{ try{localStorage.clear(); sessionStorage.clear(); localStorage.setItem("low.workspace.active","animation");}catch(e){} window.__paginaVieja = 1; return true; })()');
    await send("Page.reload");
    for (let i = 0; i < 120; i++) { if (await ev('!window.__paginaVieja&&document.readyState==="complete"&&typeof dzMenuAction==="function"&&!!(LOW.lipsyncTextoPanel)').catch(() => false)) break; await wait(300); }
    await ev(`dzMenuAction("nuevo")`); await wait(2600);
    // la boca (ocho dibujos con nombre de visema), como en check_lipsync_texto_ui
    const B = [["boca_rest", "Reposo"], ["boca_ae", "A_E"], ["boca_o", "O"], ["boca_u", "U"], ["boca_fv", "F_V"], ["boca_ln", "L_N"], ["boca_sz", "S_Z"], ["boca_mbp", "M_B_P"]];
    const slot = await ev(`(async()=>{ const wait = ms => new Promise(r => setTimeout(r, ms));
      if (typeof closeL3d === "function") closeL3d();
      const B = ${JSON.stringify(B)};
      dzCanvasSet('<g data-low-art="colour"></g><g data-low-art="line">' + B.map(([id], i) => '<g id="' + id + '"><rect x="40" y="60" width="60" height="' + (4 + i * 6) + '" fill="#c55"/></g>').join("") + '</g>');
      dzDocCommit(); DZ.doc.scene.expose(DZ.doc.scene.layers[0].id, 120, 1);
      if (!DZ.rigMode) dzRigToggle(); await wait(300); dzRigSetMode("build"); await wait(200);
      DZ.doc.ensureRigNodes([{ id: "boca_rest", name: "boca", parentId: null, head: { x: 40, y: 70 }, tail: { x: 100, y: 70 }, pivot: { x: 40, y: 70 } }], "rig");
      await wait(300); dzRigSelectNode("boca_rest");
      for (const [id, n] of B.slice(1)) DZ.doc.addRigVariant("boca_rest", id, n);
      const s = dzRigSlotDe(DZ.doc.scene.rigNode("boca_rest")); DZ.doc.scene.rigVariants(s)[0].name = "Reposo"; return s; })()`);
    // el audio de la escena: un AudioBuffer de verdad con la voz sintética, corrido 10 cuadros
    const b64 = Buffer.from(VOZ.muestras.buffer).toString("base64");
    await ev(`(()=>{ const bin = atob(${JSON.stringify(b64)}), bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const datos = new Float32Array(bytes.buffer), ctx = new (window.AudioContext || window.webkitAudioContext)(), buf = ctx.createBuffer(1, datos.length, ${VOZ.tasa});
      buf.copyToChannel(datos, 0);
      const pista = new LOW.animation.AudioTrack(DZ.doc); pista.buffer = buf; pista.name = "voz.wav"; pista.offset = ${OFFSET}; pista.peaks = pista._calcularPicos ? pista._calcularPicos() : [];
      DZ.doc.audio = pista; dzRigPanelSync(); return buf.duration; })()`);
    await wait(400);

    // 1. el tilde, habilitado y con el nombre de la pista
    const t1 = await ev(`({ deshabilitado: document.querySelector("#rigLipSinc").disabled, info: document.querySelector("#rigLipSincInfo").textContent })`);
    assert.equal(t1.deshabilitado, false, "con audio cargado, «Sincronizar» está deshabilitado");
    assert.match(t1.info, /voz\.wav/, "el tilde no nombra la pista: " + t1.info);

    // 2. tildarlo, escribir: la vista previa dice dónde está la voz
    await clicEl("#rigLipSinc", "Sincronizar con el audio");
    await escribir("#rigLipTexto", TEXTO);
    await escribir("#rigLipInicio", "1");
    const p2 = await previa();
    const m = p2.match(/la voz va de F(\d+) a F(\d+)/);
    assert.ok(m, "la vista previa no dice dónde está la voz: " + p2);
    const empieza = OFFSET + 1 + Math.round(VOZ.verdad[0].t0 * 24);
    assert.ok(Math.abs(+m[1] - empieza) <= 2, "la voz no empieza donde empieza de verdad (con el corrimiento de 10): " + JSON.stringify({ previa: +m[1], verdad: empieza }));

    // 3. crear las claves: sobre la voz, mejor que la estimación
    await clicEl("#rigLipTextoGen", "Crear las claves");
    const claves = await ev(`(()=>{ const sw = DZ.doc.scene.rigSwitch(${JSON.stringify(slot)}); const vs = DZ.doc.scene.rigVariants(${JSON.stringify(slot)});
      const nombre = Object.fromEntries(vs.map(v => [v.id, v.name])); return Object.keys(sw.keys).map(Number).sort((a, b) => a - b).map(f => [f, nombre[sw.keys[f]]]); })()`);
    const VIS = { Reposo: "V0_Rest", A_E: "V1_A_E", O: "V2_O", U: "V3_U", F_V: "V4_F_V", L_N: "V5_L_N", S_Z: "V6_S_Z", M_B_P: "V7_M_B_P" };
    const tramos = claves.map(([f, n]) => ({ desde: f, visema: VIS[n] }));
    const p = precision(tramos, VOZ.verdad, 24, OFFSET + 1);
    const est = L.tramos(L.g2pEspanol(TEXTO), { fps: 24, inicio: OFFSET + 1 }).tramos;
    const pe = precision(est, VOZ.verdad, 24, OFFSET + 1);
    assert.ok(p >= 0.75, "las bocas no caen sobre la voz: " + p.toFixed(2) + " " + JSON.stringify(claves));
    assert.ok(p > pe, "sincronizado no mejora la estimación: " + JSON.stringify({ sincronizado: p.toFixed(2), estimado: pe.toFixed(2) }));
    assert.ok(claves.every(([, n], i) => i === 0 || n !== claves[i - 1][1]), "dos claves seguidas con la misma boca");

    // 4. el diálogo queda guardado como sincronizado
    const dlg = await ev(`Object.values(DZ.doc.lipsyncTexto(${JSON.stringify(slot)}).dialogos)`);
    assert.ok(dlg.length === 1 && dlg[0].sincronizado === true && dlg[0].audio === "voz.wav", "el diálogo no quedó guardado como sincronizado: " + JSON.stringify(dlg));

    // 5. una ventana sin voz
    await escribir("#rigLipHasta", String(OFFSET + 1 + Math.floor(VOZ.verdad[0].t0 * 24) - 4));
    assert.match(await previa(), /No encontré voz/, "una ventana sin voz no lo dice: " + await previa());
    assert.ok(await ev(`document.querySelector("#rigLipTextoGen").disabled`), "con una ventana sin voz se puede crear igual");

    // 6. sin el sonido (como al reabrir): el tilde se apaga y lo pide
    await ev(`(DZ.doc.audio.buffer = null, dzRigPanelSync(), 1)`); await wait(400);
    const t6 = await ev(`({ deshabilitado: document.querySelector("#rigLipSinc").disabled, tildado: document.querySelector("#rigLipSinc").checked, info: document.querySelector("#rigLipSincInfo").textContent })`);
    assert.ok(t6.deshabilitado && !t6.tildado && /volvé a cargar/.test(t6.info), "sin el sonido, el tilde no pide volver a cargarlo: " + JSON.stringify(t6));

    assert.deepEqual(errores, [], "errores de JS: " + errores.join(" | "));
    console.log("OK lipsync con el audio:", JSON.stringify({ sincronizado: p.toFixed(2), estimado: pe.toFixed(2), vozDesde: +m[1], verdad: empieza }));
  } finally {
    ws.close(); await fetch(endpoint + "/json/close/" + tab.id).catch(() => {});
  }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
