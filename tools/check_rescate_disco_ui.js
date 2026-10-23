/* EL RESCATE ANTE CAÍDAS, EN DISCO (v3.45, cierre de la fase 1).
   CDP :9223 + mock :8791 (el «disco» del mock vive en sessionStorage:
   `mock.rescate.d.<clave>`; `mock.rescate.demora` lo hace lento).

   1. EL PASE: un rescate que había en el navegador pasa al disco y se borra
      del navegador recién cuando el disco confirma.
   2. LO QUE ESTÁ SÓLO EN EL DISCO SE OFRECE: la pantalla inicial se pinta antes
      de que llegue la lectura; cuando llega, se repinta y ofrece recuperar.
   3. ABRIR ESPERA A LA LECTURA: un documento abierto en el primer instante (con
      el disco lento) tiene que ver su rescate. Si abría antes, no lo ofrecía y
      el autoguardado de lo abierto lo pisaba. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
const RUTA = "C:/mock/disenos/rescatado.svg";

async function main() {
  const target = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
  let id = 0; const pending = new Map(), errores = [];
  ws.onmessage = (event) => { const m = JSON.parse(event.data);
    if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (!m.id || !pending.has(m.id)) return; const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); };
  const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id;
    pending.set(n, { resolve, reject }); ws.send(JSON.stringify({ id: n, method, params })); });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const cargar = async (cond = "true") => {
    await send("Page.navigate", { url }); await w(400);
    for (let i = 0; i < 120; i++) { if (await ev(`document.readyState==="complete" && !!window.LOW?.workspace?.rescateDisco && (${cond})`).catch(() => false)) return; await w(100); }
    throw Error("LOW no terminó de arrancar");
  };
  const enDisco = () => LOW_ESCRIBIENDO();
  const LOW_ESCRIBIENDO = async () => { for (let i = 0; i < 60 && await ev(`LOW.workspace.rescateDisco.escribiendo()`); i++) await w(100); };
  const clave = `LOW.workspace.recovery.key(${JSON.stringify(RUTA)})`;
  const registro = (contenido, hace) => JSON.stringify({ path: RUTA, content: contenido, metadata: {}, savedAt: Date.now() - hace });
  const TRAZO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path id="del-rescate" d="M10 10 L90 90" stroke="#000"/></svg>`;

  // limpiar: sin rescates en ningún lado
  await cargar();
  await ev(`(() => { for (const k of Object.keys(sessionStorage)) if (k.indexOf("mock.rescate.") === 0) sessionStorage.removeItem(k);
    for (const k of Object.keys(localStorage)) if (/^low\.(document\.recovery\.|scene\.recovery\.v2\.)/.test(k)) localStorage.removeItem(k); return true; })()`);

  // ── 1. EL PASE ──
  await ev(`localStorage.setItem(${clave}, ${JSON.stringify(registro(TRAZO, 60000))}); true`);
  await cargar(`LOW.workspace.rescateDisco.estado()==="disco"`); await enDisco();
  const pase = await ev(`({ disco: sessionStorage.getItem("mock.rescate.d." + ${clave}), nav: localStorage.getItem(${clave}) })`);
  if (!pase.disco || !/del-rescate/.test(pase.disco)) mal("el rescate del navegador no pasó al disco", { disco: (pase.disco || "").slice(0, 80) });
  if (pase.nav) mal("pasado al disco, el rescate siguió en el navegador", {});

  // ── 2. SÓLO EN EL DISCO, CON EL DISCO LENTO: la invitación lo ofrece cuando llega ──
  await ev(`sessionStorage.setItem("mock.rescate.demora", "2000"); true`);
  await cargar(`LOW.workspace.rescateDisco.estado()==="leyendo"`);
  const antes = await ev(`!!document.querySelector("#dzBienvenida2D .bien2d-rescate:not([hidden])")`);
  for (let i = 0; i < 60; i++) { if (await ev(`LOW.workspace.rescateDisco.estado()==="disco"`)) break; await w(100); }
  await w(300);
  const despues = await ev(`(() => { const f = document.querySelector("#dzBienvenida2D .bien2d-rescate"); return f && !f.hidden ? f.textContent : ""; })()`);
  if (antes) mal("PRUEBA MAL ARMADA: el rescate se ofrecía antes de leer el disco (¿quedó en el navegador?)", {});
  if (!/rescatado\.svg/.test(despues)) mal("un rescate que está sólo en el disco no se ofrece en la pantalla inicial", { despues });

  // ── 3. ABRIR EN EL PRIMER INSTANTE ESPERA A LA LECTURA ──
  await cargar(`LOW.workspace.rescateDisco.estado()==="leyendo"`);
  const visto = await ev(`(async () => {
    const st = LOW.workspace.recovery, getReal = st.get.bind(st); let vio = "no consultó";
    st.get = function (p) { const r = getReal(p); if (p === ${JSON.stringify(RUTA)}) vio = r ? (/del-rescate/.test(r.content) ? "el rescate" : "otro") : "nada"; return r; };
    const estadoAlAbrir = LOW.workspace.rescateDisco.estado();
    await openDesign(${JSON.stringify(RUTA)});
    st.get = getReal;
    return { estadoAlAbrir, vio, estadoAlTerminar: LOW.workspace.rescateDisco.estado() };
  })()`);
  await ev(`sessionStorage.removeItem("mock.rescate.demora"); true`);
  if (visto.estadoAlAbrir !== "leyendo") mal("PRUEBA MAL ARMADA: se abrió con el disco ya leído", visto);
  if (visto.vio !== "el rescate") mal("abrir un documento antes de terminar de leer el disco no vio su rescate", visto);
  if (!(await ev(`/del-rescate/.test(sessionStorage.getItem("mock.rescate.d." + ${clave}) || "")`))) mal("abrir el documento pisó su rescate en el disco", {});

  // limpiar
  await ev(`LOW.workspace.recovery.clear(${JSON.stringify(RUTA)}); true`); await enDisco();
  if (errores.length) mal("errores de la página", errores);
  console.log("OK check_rescate_disco_ui:", JSON.stringify({ pase: true, ofrecido: true, abrir: visto.vio }));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
