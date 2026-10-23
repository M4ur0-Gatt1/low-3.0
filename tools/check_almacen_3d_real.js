/* LO DEL ESTUDIO 3D SOBREVIVE AL CIERRE, EN LA APP REAL (v3.44, fase 1).
     node tools/check_almacen_3d_real.js

   El criterio de salida de la fase 1 del camino a la estabilidad: diez
   personajes esculpidos en «Muy alta» (unos 27 MB: tres veces lo que entra en el
   almacenamiento del navegador) y una escena autoguardada sobreviven a un
   CIERRE FORZADO de LOW. El mock no alcanza para esto: el puente al disco, el
   perfil de WebView2 y el arranque son los de verdad sólo acá.

   Arranca SU PROPIA instancia (python main.py) con APPDATA en una carpeta
   temporal (no toca ni la biblioteca ni las preferencias de nadie) y depuración
   remota en :9224; la cierra matando SU proceso (por PID, no por nombre). La
   ventana se ve en la pantalla mientras corre. */
const { spawn, execSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const RAIZ = path.resolve(__dirname, "..");
const PUERTO = 9224, ENDPOINT = "http://127.0.0.1:" + PUERTO;
const APPDATA = fs.mkdtempSync(path.join(os.tmpdir(), "low-almacen-real-"));
const CARPETA = path.join(APPDATA, "LOW", "estudio3d");
const N = 10, VERTICES = 200000;
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

function arrancar() {
  // los paquetes del usuario (pywebview) viven en %APPDATA%\Python: cambiar APPDATA los esconde
  const env = { ...process.env, PYTHONUSERBASE: process.env.PYTHONUSERBASE || path.join(process.env.APPDATA || "", "Python"), APPDATA, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=" + PUERTO };
  const p = spawn(process.env.LOW_PYTHON || (process.platform === "win32" && fs.existsSync("C:/Python314/python.exe") ? "C:/Python314/python.exe" : "python"), ["main.py"], { cwd: RAIZ, env, stdio: "ignore", windowsHide: false });
  return p;
}
function matar(p) { try { execSync("taskkill /T /F /PID " + p.pid, { stdio: "ignore" }); } catch (_) { } }

async function conectar() {
  let target = null;
  for (let i = 0; i < 120 && !target; i++) {
    try { target = (await (await fetch(ENDPOINT + "/json")).json()).find((t) => t.type === "page" && /index\.html/.test(t.url)); } catch (_) { }
    if (!target) await w(500);
  }
  if (!target) throw Error("la app no abrió su ventana con depuración en " + ENDPOINT);
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map(), errores = [];
  ws.onmessage = (event) => { const m = JSON.parse(event.data);
    if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (!m.id || !pending.has(m.id)) return; const q = pending.get(m.id); pending.delete(m.id);
    m.error ? q.reject(Error(JSON.stringify(m.error))) : q.resolve(m.result); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;
    pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  await send("Runtime.enable");
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof openL3d==="function"&&!!(window.pywebview&&pywebview.api&&pywebview.api.est3d_guardar)').catch(() => false)) break; await w(500); }
  const evI = (expr) => ev(`document.querySelector("#l3dFrame").contentWindow.eval(${JSON.stringify(expr)})`);
  const alEstudio = async () => {
    await ev(`openL3d(); true`);
    for (let i = 0; i < 120; i++) { if (await ev(`!!document.querySelector("#l3dFrame")?.contentWindow?.__low3dBiblioteca`).catch(() => false)) break; await w(250); }
    await w(1500);
  };
  return { send, ev, evI, alEstudio, errores, cerrar: () => { try { ws.close(); } catch (_) { } } };
}
const leerArchivo = (n) => { try { return fs.readFileSync(path.join(CARPETA, n + ".json"), "utf8"); } catch (_) { return null; } };

async function main() {
  // ── 1. primera sesión: diez personajes «Muy alta» y un trazo ──
  let app = arrancar(), s = null;
  try {
    s = await conectar();
    await s.alEstudio();
    const largo = await s.evI(`(() => {
      const B = window.__low3dBiblioteca, l = B.cargarKitsPropios();
      const buf = new ArrayBuffer(${VERTICES} * 10), dv = new DataView(buf);
      for (let k = 0; k < ${VERTICES}; k++) { dv.setUint32(k * 10, k, true); dv.setInt16(k * 10 + 4, (k % 7) - 3, true); dv.setInt16(k * 10 + 6, (k % 5) - 2, true); dv.setInt16(k * 10 + 8, (k % 3) - 1, true); }
      const bytes = new Uint8Array(buf); let t = '';
      for (let k = 0; k < bytes.length; k += 0x8000) t += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
      const esc = 'e1:' + btoa(t);
      const piezas = [];
      for (let n = 1; n <= ${N}; n++) piezas.push({ nombre: 'Esculpido ' + n, categoria: 'personaje', tam: [0.5, 1.8, 0.3], variacion: 0,
        items: [{ id: '', layerId: '', points: [[0, 0, 0], [0, 1, 0]], pressures: [1, 1], baseOpacity: 1, position: [0, 0, 0], quaternion: [0, 0, 0, 1], scale: [1, 1, 1],
          personaje: { base: n % 2 ? 'hombre' : 'mujer', prop: {}, pose: {}, pies: true, color: '#dcd5ca', definicion: 2, escultura: esc } }] });
      l.push({ id: 'kit-pesado', nombre: 'Muy alta', descripcion: '', estilo: (l[0] || {}).estilo, piezas });
      B.guardarKitsPropios(l);
      return esc.length;
    })()`);
    const caja = await s.ev(`(()=>{ const r = document.querySelector("#l3dFrame").getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
    const P = (fx, fy) => [caja[0] + caja[2] * fx, caja[1] + caja[3] * fy];
    const m = (type, [x, y], extra = {}) => s.send("Input.dispatchMouseEvent", { type, x, y, button: "left", ...extra });
    const a = P(0.4, 0.62), b = P(0.52, 0.72);
    await m("mouseMoved", a); await m("mousePressed", a, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 12; i++) { await m("mouseMoved", [a[0] + (b[0] - a[0]) * i / 12, a[1] + (b[1] - a[1]) * i / 12], { buttons: 1 }); await w(20); }
    await m("mouseReleased", b, { buttons: 0, clickCount: 1 });
    let bib = null, esc = null;
    for (let i = 0; i < 120; i++) {
      bib = leerArchivo("biblioteca"); esc = leerArchivo("autoguardado");
      if (bib && bib.length > N * largo && esc && JSON.parse(esc).strokes.length === 1) break; await w(500);
    }
    if (!bib || bib.length <= N * largo) mal("los diez personajes no llegaron al disco", { bytes: bib && bib.length, esperado: N * largo });
    if (!esc || JSON.parse(esc).strokes.length !== 1) mal("el trazo no se autoguardó en el disco", { esc: esc && esc.slice(0, 100) });
    if (s.errores.length) mal("errores de la página", s.errores);
    var megas = Math.round(bib.length / 1e5) / 10;
  } finally { s && s.cerrar(); matar(app); }
  await w(2500);

  // ── 2. después del cierre forzado: todo vuelve, y el navegador no tiene obra ──
  app = arrancar(); s = null;
  try {
    s = await conectar();
    await s.alEstudio();
    const t0 = Date.now();
    for (let i = 0; i < 240; i++) { if (await s.evI(`window.__low3dBiblioteca.cargarKitsPropios().some(k => k.id === 'kit-pesado')`).catch(() => false)) break; await w(250); }
    console.log("la biblioteca apareció a los", Date.now() - t0, "ms de abrir el estudio");
    const vuelta = await s.evI(`(() => {
      const kits = window.__low3dBiblioteca.cargarKitsPropios(), k = kits.find(x => x.id === 'kit-pesado');
      return { piezas: k ? k.piezas.length : 0, escultura: k ? k.piezas.map(p => p.items[0].personaje.escultura.length) : [], trazos: __low3d.strokes.length,
        nav: Object.keys(localStorage).filter(c => c === 'low3d:kits' || c === 'low3d:autosave') };
    })()`);
    if (vuelta.piezas !== N) mal("después del cierre no volvieron los diez personajes", vuelta);
    const largoEsperado = vuelta.escultura[0];
    if (!vuelta.escultura.every((n) => n === largoEsperado && n > 2e6)) mal("alguna escultura volvió cortada", vuelta.escultura);
    if (vuelta.trazos !== 1) mal("después del cierre no volvió la escena autoguardada", vuelta);
    if (vuelta.nav.length) mal("quedó obra en el almacenamiento del navegador", vuelta.nav);
    await s.evI(`document.querySelector('[data-panel="personaje"]').click(); true`); await w(800);
    const mios = await s.evI(`[...document.querySelectorAll(".taller3d-mios [data-personaje]")].filter(b => /Esculpido/.test(b.textContent)).length`);
    if (mios !== N) mal("«Mis personajes» no muestra los diez", { mios });
    if (s.errores.length) mal("errores de la página", s.errores);
    console.log("OK check_almacen_3d_real:", JSON.stringify({ personajes: vuelta.piezas, megas, trazos: vuelta.trazos }));
  } finally { s && s.cerrar(); matar(app); }
  await w(1500);
  try { fs.rmSync(APPDATA, { recursive: true, force: true }); } catch (_) { }
}
main().catch((e) => { console.error(e.message || e); try { fs.rmSync(APPDATA, { recursive: true, force: true }); } catch (_) { } process.exit(1); });
