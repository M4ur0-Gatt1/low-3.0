/* LA LÍNEA DE TIEMPO TIENE UNA SOLA VISTA. CDP :9223 + mock :8791.

   POR QUE EXISTE. Medido el 3-oct-2026 con el trabajo de la v3.1.1 en el
   árbol: abrir un documento y tocar la pestaña de la línea de tiempo dejaba
   `#dzTlgRows` con las filas VIEJAS (`.dz-tlg-row`) y sin `.tl2`. O sea: sin
   «+ Capa», sin la fila de la capa, sin nada de lo que la versión 3.1 llama
   línea de tiempo. Cuatro recorridos cayeron juntos (nueva capa, cambiar de
   capa, capas Harmony y el globo de ayuda) y ninguno decía por qué.

   LA CAUSA es una CARRERA, no un dibujo mal hecho. Hay DOS renderizadores
   para el MISMO hueco:

     · `DZ.tlView.render()`, la vista canónica del documento, que monta `.tl2`;
     · `dzTlGridRender()`, el adaptador del `.svg` suelto, que escribe
       `#dzTlgCols` y vacía `#dzTlgRows`.

   El segundo miraba `DZ.tlView` ARRIBA DE TODO y recién después pedía los SVG
   al puente con `await`. En el arranque `DZ.tlView` todavía es null —lo crea
   `dzTlMount()`, que corre en paralelo—, así que pasaba el control, se iba a
   esperar al puente y, al volver, PISABA la timeline que el otro ya había
   dibujado. Que ganara uno u otro dependía de cuánto tardara cada camino: por
   eso aparecía y desaparecía con cambios que no tenían nada que ver.

   Se exige: con un documento abierto, el hueco de la línea de tiempo muestra
   la vista canónica y NUNCA la grilla vieja, incluso si los dos renderizadores
   arrancan juntos desde el estado del arranque (`DZ.tlView` en null). */
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
  const foto = () => ev(`(()=>{ const host = document.querySelector("#dzTlgRows");
    return { canonica: !!document.querySelector(".tl2"),
      masCapa: !!document.querySelector(".tl2-addlayer"),
      filasDeCapa: document.querySelectorAll(".tl2-row[data-layer-row]").length,
      grillaVieja: document.querySelectorAll("#dzTlgRows .dz-tlg-row").length,
      hostVacio: !host || host.innerHTML.trim().length === 0 }; })()`);
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof openDesign==="function"&&!!api').catch(() => false)) break; await wait(300); }
    await ev(`(async()=>{try{localStorage.clear()}catch(e){};await openDesign('mock.svg');await dzDocInit();
      if(typeof closeL3d==='function')closeL3d();const s=document.getElementById('lowSplash');if(s)s.remove();
      await new Promise(r=>setTimeout(r,800));})()`);

    // ── 1. COMO LO ABRE CUALQUIERA: la pestaña de la línea de tiempo ─────────
    await ev(`(()=>{ const b=document.querySelector("#dzTlPestania"); if(!b) throw Error("no hay pestaña"); b.click(); return true; })()`);
    await wait(1400);
    const abierta = await foto();
    assert.ok(abierta.canonica, "tras abrir la línea de tiempo no está la vista del documento (.tl2): " + JSON.stringify(abierta));
    assert.ok(abierta.masCapa, "no está «+ Capa»: la línea de tiempo no muestra las capas · " + JSON.stringify(abierta));
    assert.ok(abierta.filasDeCapa >= 1, "no hay ni una fila de capa · " + JSON.stringify(abierta));
    assert.equal(abierta.grillaVieja, 0, "la grilla vieja del .svg suelto está DENTRO del hueco de la línea de tiempo: dos vistas peleando por el mismo lugar · " + JSON.stringify(abierta));

    // ── 2. EL ADAPTADOR VIEJO, A SOLAS, CON UN DOCUMENTO ABIERTO ────────────
    //    `DZ.tlView` en null es el estado del ARRANQUE: la crea dzTlMount, que
    //    corre en paralelo. Llamar al adaptador en ese estado es exactamente lo
    //    que pasa al encender la línea de tiempo, y acá se hace a solas para que
    //    el resultado no dependa de quién gane la carrera. Con un documento
    //    abierto NO puede escribir la grilla vieja: ese camino es del .svg suelto.
    await ev(`(async()=>{ DZ.tlView = null; await dzTlGridRender();
      await new Promise(r=>setTimeout(r,400)); return true; })()`);
    await wait(400);
    const despues = await foto();
    assert.equal(despues.grillaVieja, 0,
      "el adaptador del .svg suelto escribió su grilla en el hueco de la línea de tiempo " +
      "teniendo un documento abierto: eso es lo que deja el panel sin «+ Capa» y sin capas " +
      "cuando vuelve del `await` después de dzTlMount · " + JSON.stringify(despues));
    assert.ok(despues.canonica && despues.masCapa && despues.filasDeCapa >= 1,
      "después de pasar por el adaptador no quedó la vista del documento · " + JSON.stringify(despues));

    // ── 3. LA X-SHEET TIENE LA MISMA CARRERA ─────────────────────────────────
    //    Medido el 3-oct-2026 en la app real, abriendo un .low desde la portada:
    //    la X-sheet decía «(vacío)» con columnas F / CAM / Notas —el adaptador
    //    viejo— aunque el documento tenía dos capas. `dzXsRender` miraba
    //    DZ.xsView arriba, se iba a esperar al puente y al volver pisaba la vista.
    const xs = await ev(`(async()=>{ if (typeof dzXsSetVisible === "function") dzXsSetVisible(true);
      await new Promise(r=>setTimeout(r,500)); DZ.xsView = null; await dzXsRender();
      await new Promise(r=>setTimeout(r,800)); const box = document.querySelector("#dzXsRows");
      return { vieja: !!box.querySelector(".dz-xs-head"), vacio: /\(vacío\)/.test(box.textContent),
        capas: DZ.doc.scene.layers.map(l => l.name).filter(n => box.textContent.includes(n)).length,
        total: DZ.doc.scene.layers.length }; })()`);
    assert.ok(!xs.vieja && !xs.vacio,
      "el adaptador viejo de la X-sheet pisó la vista del documento: dice «(vacío)» con un documento abierto · " + JSON.stringify(xs));
    assert.equal(xs.capas, xs.total, "la X-sheet no muestra las capas del documento · " + JSON.stringify(xs));

    const graves = errores.filter((e) => !/ResizeObserver/.test(String(e)));
    assert.deepEqual(graves.slice(0, 3), [], "hubo excepciones durante el recorrido");
    console.log("E2E una sola vista de línea de tiempo OK " + JSON.stringify({ abierta, despues }));
  } finally {
    ws.close(); try { await fetch(endpoint + "/json/close/" + tab.id); } catch (_) { }
  }
}
main().catch((e) => { console.error(e.stack || String(e)); process.exit(1); });
