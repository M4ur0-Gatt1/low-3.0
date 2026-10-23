/* EL RESCATE ANTE CAÍDAS SOBREVIVE A UN CIERRE FORZADO, EN LA APP REAL (v3.45).
     node tools/check_rescate_real.js

   El criterio de cierre de la fase 1: el rescate de un documento de 3 MB (en el
   navegador no entraba: el tope era 2,5 MB) y el de una escena llegan al disco,
   sobreviven a MATAR LOW, y al volver la pantalla inicial ofrece recuperarlo.
   El navegador no queda con obra.

   Como check_almacen_3d_real.js: su propia instancia con APPDATA temporal y
   depuración en :9224; la ventana se ve mientras corre. No crea documentos (eso
   escribiría en la carpeta de proyectos de verdad): escribe los rescates por
   los almacenes de LOW, que es lo que hace el lienzo al dibujar. */
const { spawn, execSync } = require("child_process");
const fs = require("fs"), os = require("os"), path = require("path");
const RAIZ = path.resolve(__dirname, "..");
const PUERTO = 9224, ENDPOINT = "http://127.0.0.1:" + PUERTO;
const APPDATA = fs.mkdtempSync(path.join(os.tmpdir(), "low-rescate-real-"));
const CARPETA = path.join(APPDATA, "LOW", "rescate");
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
const RUTA = "C:/LOW-prueba/rescate-grande.svg";

async function main() {
  let app = arrancar(), s = null, tam = 0;
  try {
    s = await conectar();
    for (let i = 0; i < 80; i++) { if (await s.ev(`LOW.workspace.rescateDisco.estado()==="disco"`).catch(() => false)) break; await w(250); }
    tam = await s.ev(`(() => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg"><path id="trazo-rescatado" d="M0 0L9 9"/>' + "<g>" + "x".repeat(3000000) + "</g></svg>";
      if (!LOW.workspace.recovery.saveNow(${JSON.stringify(RUTA)}, svg, { op: "prueba" })) return -1;
      const escena = { format: "lowscene", scene: { id: "sc_real", name: "Escena real", fps: 24, width: 1920, height: 1080, layers: [], levels: [] } };
      if (!LOW.workspace.sceneRecovery.saveNow("scene:sc_real", escena, { name: "Escena real" })) return -2;
      return svg.length; })()`);
    if (tam < 0) mal("LOW no aceptó guardar el rescate", { tam });
    for (let i = 0; i < 100 && await s.ev(`LOW.workspace.rescateDisco.escribiendo()`); i++) await w(100);
    const archivos = fs.existsSync(CARPETA) ? fs.readdirSync(CARPETA).filter((f) => /\.json$/.test(f)) : [];
    const grande = archivos.map((f) => fs.statSync(path.join(CARPETA, f)).size).some((n) => n > 3e6);
    if (!grande) mal("el rescate de 3 MB no llegó al disco", { archivos });
    if (s.errores.length) mal("errores de la página", s.errores);
  } finally { s && s.cerrar(); matar(app); }
  await w(2500);

  app = arrancar(); s = null;
  try {
    s = await conectar();
    for (let i = 0; i < 80; i++) { if (await s.ev(`LOW.workspace.rescateDisco.estado()==="disco"`).catch(() => false)) break; await w(250); }
    await w(800);
    const vuelta = await s.ev(`(() => {
      const r = LOW.workspace.recovery.get(${JSON.stringify(RUTA)}), e = LOW.workspace.sceneRecovery.get("scene:sc_real");
      const f = document.querySelector("#dzBienvenida2D .bien2d-rescate");
      return { doc: r ? r.content.length : 0, trazo: !!r && /trazo-rescatado/.test(r.content), escena: !!e,
        ofrece: f && !f.hidden ? f.textContent : "",
        nav: Object.keys(localStorage).filter((k) => /^low\.(document\.recovery\.|scene\.recovery\.v2\.)/.test(k)) };
    })()`);
    if (vuelta.doc !== tam || !vuelta.trazo) mal("después del cierre forzado el rescate del documento no volvió entero", vuelta);
    if (!vuelta.escena) mal("después del cierre forzado no volvió el rescate de la escena", vuelta);
    if (!/rescate-grande\.svg/.test(vuelta.ofrece)) mal("la pantalla inicial no ofrece recuperar", vuelta);
    if (vuelta.nav.length) mal("quedó obra en el almacenamiento del navegador", vuelta.nav);
    if (s.errores.length) mal("errores de la página", s.errores);
    console.log("OK check_rescate_real:", JSON.stringify({ megas: Math.round(tam / 1e5) / 10, escena: true, ofrece: true }));
  } finally { s && s.cerrar(); matar(app); }
  await w(1500);
  try { fs.rmSync(APPDATA, { recursive: true, force: true }); } catch (_) { }
}
main().catch((e) => { console.error(e.message || e); try { fs.rmSync(APPDATA, { recursive: true, force: true }); } catch (_) { } process.exit(1); });
