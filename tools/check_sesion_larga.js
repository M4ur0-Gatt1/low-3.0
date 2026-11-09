/* UNA JORNADA DE TRABAJO EN MINUTOS (v3.57). CDP :9223 + mock :8791.

   Las pruebas de rendimiento miden UNA operación con la app recién abierta.
   Lo que se rompe en producción es otra cosa: horas de dibujar, cambiar de
   cuadro, deshacer y guardar. Esto simula eso y mide, ronda tras ronda:

   · memoria del motor (después de forzar la recolección): una fuga se ve como
     una recta que sube y no baja;
   · nodos del DOM y oyentes de eventos: paneles que se abren y no sueltan nada;
   · el historial de Ctrl+Z: cuántos pasos y cuánto pesan;
   · el tiempo de un trazo y de un guardado: si la ronda 20 tarda el doble que
     la 1, la app se pone lenta con el uso.

   Uso: node tools/check_sesion_larga.js [rondas=16]
   Sale con error si algo crece sin techo (ver PUERTAS al final). */
const endpoint = "http://127.0.0.1:9223";
const pageUrl = "http://127.0.0.1:8791/ui/index.html?mock=1";
const RONDAS = Math.max(4, Number(process.argv[2]) || 16);

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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 300000);
    pending.set(n, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const w = (ms) => new Promise((r) => setTimeout(r, ms));

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Performance.enable");
    // sin caché: con el mismo ?v= el navegador seguía usando el script de antes del cambio
    await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: pageUrl });
    for (let i = 0; i < 80; i++) {
      if (await ev('document.readyState==="complete" && typeof dzCanvasInner==="function" && typeof dzDocInit==="function" && !!api && !!window.LOW?.workspace?.workspaces').catch(() => false)) break;
      await w(250);
    }
    await ev(`(async()=>{ try{localStorage.clear()}catch(e){}
      await openDesign("mock.svg"); await dzDocInit(); await new Promise(r=>setTimeout(r,600));
      LOW.workspace.workspaces.activate("drawing", dzWsAplicar); await new Promise(r=>setTimeout(r,300));
      dzSetTool("brush"); await new Promise(r=>setTimeout(r,200)); return true; })()`);

    /** Una ronda de trabajo: 12 cuadros, 3 trazos por cuadro con el puntero,
     *  idas y vueltas por la línea de tiempo, Ctrl+Z y Ctrl+Shift+Z, abrir y
     *  cerrar la X-sheet y el storyboard, y guardar. */
    const ronda = (k) => ev(`(async()=>{
      const wait = ms => new Promise(r => setTimeout(r, ms));
      const lienzo = document.querySelector("#dzCanvas");
      const caja = lienzo.getBoundingClientRect();
      const puntero = (t, x, y) => lienzo.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true,
        pointerId: 1, pointerType: "pen", isPrimary: true, button: t === "pointerdown" ? 0 : -1,
        buttons: t === "pointerup" ? 0 : 1, clientX: x, clientY: y, pressure: .7 }));
      const tiemposTrazo = [];
      for (let f = 1; f <= 12; f++) {
        DZ.doc.goTo(f); await wait(15);
        for (let s = 0; s < 3; s++) {
          const x0 = caja.left + caja.width * (.2 + .2 * s), y0 = caja.top + caja.height * (.3 + ((${k} + f) % 5) * .08);
          const t0 = performance.now();
          puntero("pointerdown", x0, y0);
          for (let i = 1; i <= 24; i++) puntero("pointermove", x0 + i * 6, y0 + Math.sin(i / 3) * 18);
          puntero("pointerup", x0 + 150, y0);
          tiemposTrazo.push(performance.now() - t0);
          await wait(5);
        }
        if (typeof dzDocCommit === "function") dzDocCommit();
      }
      for (let i = 0; i < 4; i++) { dzUndo(); await wait(10); }
      for (let i = 0; i < 4; i++) { dzRedo(); await wait(10); }
      for (let f = 12; f >= 1; f--) { DZ.doc.goTo(f); await wait(5); }
      for (const a of ["xsheet", "xsheet", "storyboard", "storyboard"]) { dzMenuAction(a); await wait(120); }
      const t0 = performance.now();
      if (typeof dzDocCommit === "function") dzDocCommit();
      await dzSceneSave(false);
      const guardado = performance.now() - t0;
      const h = DZ.doc.history;
      let pesoHist = 0;
      try { pesoHist = JSON.stringify((h.undoStack || []).concat(h.redoStack || []).map(e => [e.before, e.after])).length; } catch (_) { pesoHist = -1; }
      // se mide parado en un cuadro VACÍO: el panel de capas tiene una fila (con
      // sus oyentes) por objeto del cuadro actual, y eso no es una fuga
      DZ.doc.goTo(40); await wait(120);
      tiemposTrazo.sort((a, b) => a - b);
      return { trazoMediana: tiemposTrazo[tiemposTrazo.length >> 1], trazoPeor: tiemposTrazo[tiemposTrazo.length - 1], guardado,
        pasosHist: (h.undoStack || []).length + (h.redoStack || []).length, pesoHistKB: Math.round(pesoHist / 1024),
        docKB: Math.round(JSON.stringify(DZ.doc.scene.toJSON()).length / 1024),
        nodos: document.getElementsByTagName("*").length };
    })()`);

    const filas = [];
    for (let k = 1; k <= RONDAS; k++) {
      const r = await ronda(k);
      await send("HeapProfiler.collectGarbage"); await w(200);
      const m = Object.fromEntries((await send("Performance.getMetrics")).metrics.map((x) => [x.name, x.value]));
      filas.push({ ronda: k, heapMB: +(m.JSHeapUsedSize / 1048576).toFixed(1), oyentes: m.JSEventListeners, nodosDOM: m.Nodes,
        docKB: r.docKB, pasosHist: r.pasosHist, histKB: r.pesoHistKB,
        trazoMs: +r.trazoMediana.toFixed(1), trazoPeorMs: +r.trazoPeor.toFixed(1), guardarMs: Math.round(r.guardado) });
      process.stdout.write(".");
    }
    console.log("");
    console.table(filas);

    // ── PUERTAS: lo que en una jornada de verdad no puede pasar ─────────────
    const a = filas[1], z = filas[filas.length - 1];   // la 1 es el arranque en frío
    const crece = (k) => (z[k] - a[k]) / Math.max(1, a[k]);
    const docCrece = (z.docKB - a.docKB) / Math.max(1, a.docKB);
    const informe = {
      // la memoria puede crecer con el documento, no más rápido que él
      heapPorDoc: +(crece("heapMB") / Math.max(0.05, docCrece)).toFixed(2),
      oyentes: z.oyentes - a.oyentes, nodosDOM: z.nodosDOM - a.nodosDOM,
      trazoX: +(z.trazoMs / Math.max(0.1, a.trazoMs)).toFixed(2), guardarX: +(z.guardarMs / Math.max(1, a.guardarMs)).toFixed(2),
    };
    const fallas = [];
    if (informe.oyentes > 200) fallas.push("los oyentes de eventos crecen sin techo (+" + informe.oyentes + ")");
    if (informe.nodosDOM > 3000) fallas.push("los nodos del DOM crecen sin techo (+" + informe.nodosDOM + ")");
    if (informe.trazoX > 2.5) fallas.push("el trazo se pone lento con el uso (×" + informe.trazoX + ")");
    if (informe.heapPorDoc > 3) fallas.push("la memoria crece más rápido que el documento (×" + informe.heapPorDoc + ")");
    const errB = errores.filter((x) => !/ResizeObserver/.test(String(x)));
    if (errB.length) fallas.push("errores en la página: " + errB.slice(0, 3).join(" | "));
    console.log("INFORME " + JSON.stringify(informe));
    if (fallas.length) { console.log("FALLA: " + fallas.join(" · ")); process.exitCode = 1; }
    else console.log("Sesión larga OK: " + RONDAS + " rondas, " + RONDAS * 36 + " trazos, " + RONDAS + " guardados");
  } finally {
    try { await send("Page.close"); } catch (_) { /* ya cerrada */ }
    ws.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
