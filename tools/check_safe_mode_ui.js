/* Recorrido real del modo seguro. Requiere Chromium CDP en :9223 y LOW en :8791. */
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1&safe=1";

async function main() {
  const created = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  if (!created?.webSocketDebuggerUrl) throw Error("Chromium no expuso una página CDP");
  const ws = new WebSocket(created.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0; const pending = new Map(), errors = [];
  ws.onmessage = event => {
    const msg = JSON.parse(event.data);
    if (msg.method === "Runtime.exceptionThrown")
      errors.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text || "error");
    if (!msg.id || !pending.has(msg.id)) return;
    const task = pending.get(msg.id); pending.delete(msg.id);
    msg.error ? task.reject(Error(JSON.stringify(msg.error))) : task.resolve(msg.result);
  };
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id, timer = setTimeout(() => { pending.delete(callId); reject(Error("CDP sin respuesta: " + method)); }, 30000);
    pending.set(callId, { resolve: value => { clearTimeout(timer); resolve(value); }, reject });
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  await send("Page.addScriptToEvaluateOnNewDocument", { source: `
    if (location.hostname === "127.0.0.1") {
      localStorage.setItem("low.workspace.active", "animation");
      localStorage.setItem("low.dzkeys", JSON.stringify({pencil:"z"}));
      localStorage.setItem("low.brushes.v1", JSON.stringify([{id:"custom-e2e",name:"E2E",size:80}]));
      localStorage.setItem("low.document.recovery.keep", "ARTE");
    }` });
  await send("Page.navigate", { url: pageUrl });
  for (let attempt = 0; attempt < 80; attempt++) {
    const ready = await send("Runtime.evaluate", { returnByValue: true, expression:
      // Esperar por CONDICION, no por existir: bajo carga el arranque seguro ya
      // esta activo pero la etiqueta de version y S.safeMode se escriben despues,
      // y la prueba acusaba «no entro en modo seguro» leyendo un estado a medias.
      `typeof dzConfigResetModal==="function" && !!window.LOW?.safeMode && S?.safeMode === true
        && !!document.querySelector("#ver")?.textContent.includes("MODO SEGURO")` });
    if (ready.result?.value) break;
    if (attempt === 79) throw Error("LOW no terminó de iniciar");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const evaluated = await send("Runtime.evaluate", { awaitPromise: true, returnByValue: true, expression: `(async()=>{
    const before={workspace:localStorage.getItem("low.workspace.active"),keys:localStorage.getItem("low.dzkeys"),
      brushes:localStorage.getItem("low.brushes.v1"),recovery:localStorage.getItem("low.document.recovery.keep")};
    dzKeysLoad();
    const startup={active:LOW.safeMode.active,state:S.safeMode,ws:S.ws,label:document.querySelector("#ver").textContent,
      room:LOW.workspace.workspaces.lastUsed(),pencil:DZ.keymap.pencil,
      customBrush:!!LOW.drawing.brushes.get("custom-e2e")};
    dzConfigResetModal(); document.querySelector("#mCancel").click();
    const afterCancel={keys:localStorage.getItem("low.dzkeys"),overlay:document.querySelector("#overlay").hidden};
    dzConfigResetModal();
    document.querySelector('[data-reset-domain="shortcuts"]').click();
    document.querySelector("#configResetApply").click();
    const afterReset={keys:localStorage.getItem("low.dzkeys"),brushes:localStorage.getItem("low.brushes.v1"),
      workspace:localStorage.getItem("low.workspace.active"),recovery:localStorage.getItem("low.document.recovery.keep"),
      overlay:document.querySelector("#overlay").hidden};
    return {before,startup,afterCancel,afterReset};
  })()` });
  if (evaluated.exceptionDetails) throw Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text);
  const value = evaluated.result?.value;
  if (!value?.startup?.active || !value.startup.state || value.startup.ws !== null || value.startup.room !== "drawing" ||
      value.startup.pencil !== "n" || value.startup.customBrush || !value.startup.label.includes("MODO SEGURO"))
    throw Error("REGRESIÓN en arranque seguro: " + JSON.stringify(value));
  if (value.afterCancel.keys !== value.before.keys || !value.afterCancel.overlay)
    throw Error("REGRESIÓN: Cancelar modificó preferencias: " + JSON.stringify(value));
  if (value.afterReset.keys !== null || value.afterReset.brushes !== value.before.brushes ||
      value.afterReset.workspace !== value.before.workspace || value.afterReset.recovery !== "ARTE" || !value.afterReset.overlay)
    throw Error("REGRESIÓN: el reset cruzó dominios o tocó recuperación: " + JSON.stringify(value));
  if (errors.length) throw Error("La UI lanzó excepciones: " + errors.slice(0, 3).join(" | "));
  console.log("E2E SAFE MODE OK", JSON.stringify(value));
  try { await fetch(endpoint + "/json/close/" + created.id); } catch (_) {}
}

main().catch(error => { console.error(error.stack || error); process.exit(1); });
