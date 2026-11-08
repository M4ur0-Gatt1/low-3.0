/* RELLENOS Y TINTE EN LA APP (v3.61). CDP :9223 + mock :8791.

   1. Clic derecho en el color 3 de la paleta → «Relleno: degradé…» →
      Aplicar: lo que rellena con el estilo 3 se ve con el degradé (mesa) y el
      cuadro exportado lleva el <linearGradient>; el dibujo no cambió.
   2. Edición → «Teñir lo elegido…» (con el mouse): lo elegido se tiñe de rojo
      en la cantidad pedida, sin tocar la paleta; Ctrl+Z lo deshace.
   3. «Quitar el tinte» lo devuelve a su color.
   4. El pincel de tinte tiñe lo que toca y Esc lo apaga. */
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
      if (await ev('document.readyState==="complete" && typeof dzDocInit==="function" && !!api && !!window.LOW?.animation?.rellenos').catch(() => false)) break;
      await w(250);
    }
    await ev(`(async()=>{ try{localStorage.clear()}catch(e){}
      await openDesign("mock.svg"); await dzDocInit(); await new Promise(r=>setTimeout(r,600));
      LOW.workspace.workspaces.activate("drawing", dzWsAplicar); await new Promise(r=>setTimeout(r,400));
      const contenido = '<g data-low-art="colour"><rect id="conRelleno" data-fil="3" fill="#ffffff" x="100" y="100" width="300" height="200"></rect><rect id="aTenir" data-fil="1" fill="#1a1a1a" x="500" y="100" width="200" height="200"></rect></g><g data-low-art="line"></g>';
      const lv = DZ.doc.level, d = lv.byNumber(DZ.doc.cell) || lv.addDrawing(1, ""); d.content = contenido;
      dzCanvasSet(contenido); if (typeof dzPalCssRender === "function") dzPalCssRender(); await new Promise(r=>setTimeout(r,300)); return true; })()`);

    // 1. degradé desde el clic derecho de la paleta
    if (!(await ev(`!!document.querySelector(".pal2-item")`))) await ev(`(()=>{ if (typeof dzPalMount === "function") dzPalMount(); return true; })()`);
    await w(300);
    const abierto = await ev(`(()=>{ const items = [...document.querySelectorAll(".pal2-item")]; const it = items[2]; if (!it) return "sin items: " + items.length;
      it.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
      const b = [...document.querySelectorAll(".ls2-menu button")].find(x => x.textContent.startsWith("Relleno: degradé")); if (!b) return "sin opción"; b.click(); return true; })()`);
    if (abierto !== true) mal("el clic derecho de la paleta no ofrece «Relleno: degradé…»", { abierto });
    await w(300);
    await ev(`(()=>{ document.querySelector("#rlColor2").value = "#ff0000"; return true; })()`);
    await clic("#rlOk");
    const mesa = await ev(`(()=>{ const r = document.querySelector("#dzCanvas > svg #conRelleno"); const defs = document.querySelector("#dzCanvas > svg > g.dz-paldefs");
      return { fill: r ? getComputedStyle(r).fill : "", defs: defs ? defs.innerHTML : "" }; })()`);
    if (!/^url\("?#lowPal_[\w-]+_3"?\)$/.test(mesa.fill) || !/<linearGradient id="lowPal_/.test(mesa.defs) || !/#ff0000/.test(mesa.defs)) mal("en la mesa el estilo 3 no rellena con el degradé", mesa);
    const exp = await ev(`dzCuadroSvgTexto(1)`);
    if (!/^<svg[^>]*><defs><linearGradient id="lowPal_/.test(exp)) mal("el cuadro exportado no lleva el degradé", { exp: exp.slice(0, 300) });
    await ev(`dzDocCommit && dzDocCommit(); true`);
    if ((await ev(`DZ.doc.drawing.content`)).includes("linearGradient")) mal("el degradé se guardó adentro del dibujo (tiene que vivir en la paleta)", {});

    // 2. teñir lo elegido, con el mouse desde Edición
    await ev(`(()=>{ const el = document.querySelector("#dzCanvas > svg #aTenir"); DZ.sel = el; DZ.multi = [el]; return true; })()`);
    await clic('.dz-menu[data-menu="edicion"]');
    await clic('.dz-menu[data-menu="edicion"] [data-act="tenir"]');
    if (!(await ev(`!!document.querySelector("#tnOk")`))) mal("Edición → Teñir lo elegido no abrió el diálogo", {});
    await ev(`(()=>{ document.querySelector("#tnColor").value = "#ff0000"; document.querySelector("#tnCant").value = "1"; return true; })()`);
    await clic("#tnOk");
    const tenido = await ev(`(()=>{ const el = document.querySelector("#dzCanvas > svg #aTenir"); return { fill: getComputedStyle(el).fill, marca: el.getAttribute("data-tinte") }; })()`);
    if (tenido.fill !== "rgb(255, 0, 0)" || !/^#ff0000:1/.test(tenido.marca || "")) mal("teñir no llevó lo elegido al rojo", tenido);
    const paleta1 = await ev(`DZ.doc.palette.byIndex(1).color`);
    if (paleta1 !== "#1a1a1a") mal("teñir cambió la paleta", { paleta1 });
    await ev(`(async()=>{ dzUndo(); await new Promise(r=>setTimeout(r,300)); return true; })()`);
    const deshecho = await ev(`(()=>{ const el = document.querySelector("#dzCanvas > svg #aTenir"); return el ? { fill: getComputedStyle(el).fill, marca: el.getAttribute("data-tinte") } : null; })()`);
    if (!deshecho || deshecho.marca || deshecho.fill === "rgb(255, 0, 0)") mal("Ctrl+Z no deshizo el tinte", deshecho);

    // 3. y 4. pincel de tinte y quitar
    await ev(`(()=>{ LOW.animation.rellenos.pincel(true); return true; })()`);
    await clic("#dzCanvas > svg #aTenir");
    const conPincel = await ev(`document.querySelector("#dzCanvas > svg #aTenir").getAttribute("data-tinte")`);
    if (!conPincel) mal("el pincel de tinte no tiñó lo que tocó", {});
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
    await w(200);
    if (await ev(`document.querySelector("#dzCanvas").classList.contains("dz-pincel-tinte")`)) mal("Esc no apagó el pincel de tinte", {});
    await ev(`(()=>{ const el = document.querySelector("#dzCanvas > svg #aTenir"); DZ.sel = el; DZ.multi = [el]; LOW.animation.rellenos.quitarTinte(); return true; })()`);
    const sinTinte = await ev(`(()=>{ const el = document.querySelector("#dzCanvas > svg #aTenir"); return { fill: getComputedStyle(el).fill, marca: el.getAttribute("data-tinte") }; })()`);
    if (sinTinte.marca || sinTinte.fill !== "rgb(26, 26, 26)") mal("«Quitar el tinte» no lo devolvió a su color", sinTinte);

    const errB = errores.filter((x) => !/ResizeObserver/.test(String(x)));
    if (errB.length) mal("errores en la página", errB);
    console.log("E2E rellenos y tinte OK " + JSON.stringify({ relleno: mesa.fill, tinte: tenido.fill }));
  } finally {
    try { await send("Page.close"); } catch (_) { /* ya cerrada */ }
    ws.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
