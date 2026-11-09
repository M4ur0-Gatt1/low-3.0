/* IMPORTAR CAPAS DE PSD / ORA EN LA APP (v3.63). CDP :9223 + mock :8791.

   El backend (capas_archivo.py) se prueba aparte; acá el mock devuelve lo que
   devolvería para «personaje.psd» de 960×540 con tres capas (Fondo, Cuerpo
   oculta al 50 %, Ojos), sobre una escena de 1920×1080:
   1. Archivo → «Importar capas (PSD, ORA)…» con el mouse: entran tres capas,
      en ese orden (Fondo atrás), con sus nombres;
   2. en su lugar, escaladas ×2 (el lienzo del archivo es la mitad);
   3. «Cuerpo» oculta y al 50 %; las tres en el grupo «personaje»;
   4. el cuadro exportado lleva Fondo y Ojos (Cuerpo está oculta);
   5. un Ctrl+Z saca las tres capas y el grupo;
   6. un error del backend se avisa y no agrega nada. */
const endpoint = "http://127.0.0.1:9223";
const pageUrl = "http://127.0.0.1:8791/ui/index.html?mock=1";

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
    const timer = setTimeout(() => { pending.delete(n); reject(Error("CDP sin respuesta: " + method)); }, 60000);
    pending.set(n, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const w = (ms) => new Promise((r) => setTimeout(r, ms));
  const mal = (m, d) => { throw Error("REGRESIÓN: " + m + " :: " + JSON.stringify(d)); };
  const centro = async (sel) => {
    const r = await ev(`(()=>{ const n = document.querySelector(${JSON.stringify(sel)}); if (!n) return null; n.scrollIntoView({ block: "center" }); const b = n.getBoundingClientRect(); return { x: b.left + Math.min(b.width / 2, 60), y: b.top + b.height / 2 }; })()`);
    if (!r) mal("no está en la pantalla: " + sel, {});
    return r;
  };
  const clic = async (sel) => { const r = await centro(sel); for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, x: r.x, y: r.y, button: "left", clickCount: 1 }); await w(300); };

  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: pageUrl });
    for (let i = 0; i < 80; i++) {
      if (await ev('document.readyState==="complete" && typeof dzDocInit==="function" && !!api && !!window.LOW?.animation?.importarCapas').catch(() => false)) break;
      await w(250);
    }
    await ev(`(async()=>{ try{localStorage.clear()}catch(e){}
      await openDesign("mock.svg"); await dzDocInit(); await new Promise(r=>setTimeout(r,600));
      const png = (color) => { const c = document.createElement("canvas"); c.width = 10; c.height = 10; const g = c.getContext("2d"); g.fillStyle = color; g.fillRect(0, 0, 10, 10); return c.toDataURL("image/png"); };
      window.__importCapas = () => ({ name: "personaje.psd", ancho: 960, alto: 540, capas: [
        { nombre: "Fondo", x: 0, y: 0, ancho: 960, alto: 540, data: png("#88aa88"), visible: true, opacidad: 1 },
        { nombre: "Cuerpo", x: 100, y: 50, ancho: 200, alto: 300, data: png("#aa4444"), visible: false, opacidad: 0.5 },
        { nombre: "Ojos", x: 150, y: 80, ancho: 40, alto: 20, data: png("#000000"), visible: true, opacidad: 1 } ] });
      return true; })()`);
    const antes = await ev(`({ capas: DZ.doc.scene.layers.length, niveles: DZ.doc.scene.levels.length })`);

    // 1. desde el menú Archivo, con el mouse
    await clic('.dz-menu[data-menu="archivo"]');
    await clic('.dz-menu[data-menu="archivo"] [data-act="importar-capas"]');
    await w(500);
    const r = await ev(`(()=>{ const sc = DZ.doc.scene, nuevas = sc.layers.slice(${antes.capas});
      const img = (ly) => { const d = sc.level(ly.levelId).byNumber(1); const m = /<image[^>]+x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"/.exec(d.content); return m ? m.slice(1).map(Number) : null; };
      return { nombres: nuevas.map(l => l.name), pos: nuevas.map(img), visible: nuevas.map(l => l.visible), opacidad: nuevas.map(l => l.opacity),
        grupo: nuevas.map(l => l.grupo && DZ.doc.grupo(l.grupo) ? DZ.doc.grupo(l.grupo).nombre : null) }; })()`);
    if (r.nombres.join() !== "Fondo,Cuerpo,Ojos") mal("no entraron las tres capas en orden (Fondo atrás)", r.nombres);
    // 2. escaladas ×2: el lienzo del archivo (960×540) es la mitad de la escena
    if (JSON.stringify(r.pos[1]) !== JSON.stringify([200, 100, 400, 600])) mal("la capa no quedó en su lugar escalada ×2", r.pos);
    // 3. visibilidad, opacidad y grupo
    if (r.visible.join() !== "true,false,true" || r.opacidad[1] !== 0.5) mal("visibilidad u opacidad de las capas", r);
    if (!r.grupo.every((g) => g === "personaje")) mal("las capas no quedaron en el grupo «personaje»", r.grupo);
    // 4. el export
    const exp = await ev(`dzCuadroSvgTexto(1)`);
    if (!/data-low-importada="Fondo"/.test(exp) || !/data-low-importada="Ojos"/.test(exp) || /data-low-importada="Cuerpo"/.test(exp)) mal("el export no lleva Fondo y Ojos (sin Cuerpo, que está oculta)", { exp: exp.slice(0, 300) });
    // 5. un Ctrl+Z
    await ev(`(async()=>{ dzUndo(); await new Promise(r=>setTimeout(r,300)); return true; })()`);
    const despues = await ev(`({ capas: DZ.doc.scene.layers.length, niveles: DZ.doc.scene.levels.length, grupos: (DZ.doc.scene.grupos || []).length })`);
    if (despues.capas !== antes.capas || despues.niveles !== antes.niveles || despues.grupos) mal("un Ctrl+Z no sacó todo lo importado", { antes, despues });
    // 6. un error
    await ev(`(async()=>{ window.__importCapas = () => ({ error: "el PSD no es RGB" }); await LOW.animation.importarCapas.importar(); return true; })()`);
    const tras = await ev(`DZ.doc.scene.layers.length`);
    if (tras !== antes.capas) mal("un error del backend agregó capas", { tras });

    const errB = errores.filter((x) => !/ResizeObserver/.test(String(x)));
    if (errB.length) mal("errores en la página", errB);
    console.log("E2E importar capas OK " + JSON.stringify({ capas: r.nombres, cuerpo: r.pos[1] }));
  } finally {
    try { await send("Page.close"); } catch (_) { /* ya cerrada */ }
    ws.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
