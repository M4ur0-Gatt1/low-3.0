/* EL RESCATE ANTE CAÍDAS NO FALLA EN SILENCIO (v3.44, fase 1).
   CDP :9223 + mock :8791.

   El rescate vive en el almacenamiento del navegador (~5 MB). Si no entraba
   —un documento de más de 2,5 MB, o el almacén lleno— `saveNow` devolvía false
   y nadie se enteraba hasta el día de la caída. Se exige:
   1. un documento demasiado grande para el rescate AVISA (con el tamaño);
   2. el almacén lleno al rescatar la escena AVISA;
   3. el aviso no se repite en cada intento (una vez por documento);
   4. si vuelve a entrar y después deja de entrar, avisa otra vez. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";
const w = (ms) => new Promise((r) => setTimeout(r, ms));
const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };

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
  await send("Page.enable"); await send("Runtime.enable");
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  await send("Page.navigate", { url });
  for (let i = 0; i < 90; i++) { if (await ev('document.readyState==="complete"&&typeof dzSetStatus==="function"&&!!LOW.workspace.rescateAviso').catch(() => false)) break; await w(300); }
  await w(800);
  // contar avisos: se mira lo que llega a la barra de estado
  await ev(`window.__avisos = []; const _st = window.dzSetStatus; window.dzSetStatus = function (t) { if (/rescate ante caídas/.test(t)) __avisos.push(t); return _st.apply(this, arguments); }; true`);

  // 1. documento demasiado grande
  const ok1 = await ev(`LOW.workspace.recovery.saveNow("C:/mock/enorme.svg", "<svg>" + "x".repeat(3000000) + "</svg>", {})`);
  let av = await ev(`__avisos`);
  if (ok1 !== false) mal("PRUEBA MAL ARMADA: el rescate de 3 MB entró", { ok1 });
  if (av.length !== 1 || !/2,9 MB|2,8 MB/.test(av[0])) mal("un documento demasiado grande para el rescate no avisó (con su tamaño)", av);
  // 3. no se repite
  await ev(`LOW.workspace.recovery.saveNow("C:/mock/enorme.svg", "<svg>" + "x".repeat(3000000) + "</svg>", {}); true`);
  av = await ev(`__avisos`);
  if (av.length !== 1) mal("el aviso se repite en cada intento", { n: av.length });
  // 2. almacén lleno al rescatar la escena
  const ok2 = await ev(`(() => { const st = LOW.workspace.sceneRecovery.storage, real = st.setItem;
    st.setItem = function () { const e = new Error("QuotaExceededError"); e.name = "QuotaExceededError"; throw e; };
    try { return LOW.workspace.sceneRecovery.saveNow("scene:prueba", { format: "lowscene", scene: { id: "prueba", name: "Prueba" } }, {}); }
    finally { st.setItem = real; } })()`);
  av = await ev(`__avisos`);
  if (ok2 !== false) mal("PRUEBA MAL ARMADA: con el almacén lleno el rescate entró", { ok2 });
  if (av.length !== 2) mal("con el almacén lleno el rescate de la escena falló en silencio", av);
  // 4. entra, y después deja de entrar: avisa otra vez
  await ev(`LOW.workspace.recovery.saveNow("C:/mock/enorme.svg", "<svg>chico</svg>", {}); LOW.workspace.recovery.saveNow("C:/mock/enorme.svg", "<svg>" + "x".repeat(3000000) + "</svg>", {}); LOW.workspace.recovery.clear("C:/mock/enorme.svg"); true`);
  av = await ev(`__avisos`);
  if (av.length !== 3) mal("después de volver a entrar, dejar de entrar no avisó otra vez", { n: av.length });
  if (errores.length) mal("errores de la página", errores);
  console.log("OK check_rescate_aviso_ui:", JSON.stringify({ avisos: av.length }));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
