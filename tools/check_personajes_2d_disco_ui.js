/* LA BIBLIOTECA DE PERSONAJES DEL 2D, EN DISCO (v3.44, fase 1).
   CDP :9223 + mock :8791 (el «disco» del mock vive en sessionStorage).

   «Mis personajes» del rig vivía en el almacenamiento del navegador y perdía
   obra de tres maneras sin avisar: lleno no guardaba, el número 41 borraba al
   más viejo, y uno dañado vaciaba la lista (y el próximo guardado pisaba todo).
   1. EL PASE: 41 personajes del navegador (uno dañado) pasan al disco; el
      navegador queda sin obra; el menú muestra los 40 sanos.
   2. Guardar uno más: el disco tiene 42 (sin tope de 40) y el dañado SIGUE.
   3. DISCO LLENO: se AVISA en la barra de estado y queda copia de emergencia.
   4. Disco sano otra vez: la copia de emergencia se suma al archivo.
   5. DISCO LENTO: guardar mientras se lee no pisa lo que hay. */
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
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setCacheDisabled", { cacheDisabled: true });
  const ev = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result?.value; };
  const cargar = async (u) => {
    await send("Page.navigate", { url: u }); await w(500);
    for (let i = 0; i < 90; i++) { if (await ev('document.readyState==="complete"&&!!window.LOW&&!!LOW.personajes2d&&typeof dzCharacterLibraryRead==="function"').catch(() => false)) break; await w(300); }
  };
  const listo = async () => { for (let i = 0; i < 60; i++) { if (await ev(`LOW.personajes2d.estado()==="listo" && !LOW.personajes2d.escribiendo()`)) return; await w(150); } };
  const disco = () => ev(`JSON.parse(sessionStorage.getItem("mock.obra2d.personajes2d") || "[]")`);
  const nuevo = (n, nombre) => `LOW.animation.characterLibrary.create({ id: "char_${n}", name: ${JSON.stringify(nombre)}, drawing: "<g><path d='M0 0L10 10'/></g>", rig: { nodes: { cadera: { id: "cadera" } } } })`;

  // ── 0. lo de ANTES: 41 personajes en el navegador, el 7 dañado ──
  await cargar(url);
  await ev(`(() => { sessionStorage.removeItem("mock.obra2d.personajes2d"); sessionStorage.removeItem("mock.obra2d.demora");
    const l = []; for (let n = 1; n <= 41; n++) l.push(LOW.animation.characterLibrary.create({ id: "char_" + n, name: "Viejo " + n, drawing: "<g><path d='M0 0L10 10'/></g>", rig: { nodes: { cadera: { id: "cadera" } } } }));
    l[6] = { id: "char_7", format: "otra-cosa", name: "Dañado" };
    localStorage.setItem("low.2d.characters.v1", JSON.stringify(l)); return true; })()`);
  await cargar(url); await listo();

  // ── 1. el pase ──
  let d = await disco();
  if (d.length !== 41) mal("los 41 del navegador no pasaron al disco", { enDisco: d.length });
  if (await ev(`localStorage.getItem("low.2d.characters.v1")`)) mal("pasada al disco, la biblioteca siguió en el navegador", {});
  const menu = await ev(`(dzCharacterLibraryRender(), [...document.querySelectorAll("#rigCharacterLibrary option")].filter(o => o.value).length)`);
  if (menu !== 40) mal("el menú no muestra los 40 sanos (uno dañado no puede vaciar la lista)", { menu });

  // ── 2. uno más: sin tope de 40, y el dañado se conserva ──
  await ev(`dzCharacterLibraryWrite([${nuevo(42, "Nuevo")}, ...dzCharacterLibraryRead()]); true`); await listo();
  d = await disco();
  if (d.length !== 42) mal("guardar el 42 no dejó 42 en el disco (¿tope de 40?)", { enDisco: d.length });
  if (!d.some((x) => x.id === "char_42") || !d.some((x) => x.id === "char_1")) mal("guardar uno nuevo perdió otro", d.map((x) => x.id));
  if (!d.some((x) => x.id === "char_7")) mal("guardar tiró el personaje dañado (podía recuperarse a mano)", {});

  // ── 3. disco lleno ──
  await ev(`window.__est3dFalla = "No queda espacio en el disco"; true`);
  await ev(`dzCharacterLibraryWrite([${nuevo(43, "En la emergencia")}, ...dzCharacterLibraryRead()]); true`); await listo(); await w(200);
  const estado = null;
  const textoVisible = await ev(`document.body.innerText`);
  if (!/No se pudo guardar la biblioteca de personajes en el disco/.test(textoVisible)) mal("con el disco lleno, la biblioteca falló en silencio", { estado });
  if (!/char_43/.test(await ev(`localStorage.getItem("low.2d.characters.v1") || ""`))) mal("con el disco lleno no quedó copia de emergencia", {});

  // ── 4. disco sano: la emergencia se suma ──
  await ev(`window.__est3dFalla = ""; true`);
  await cargar(url); await listo();
  d = await disco();
  if (!d.some((x) => x.id === "char_43") || d.length !== 43) mal("la copia de emergencia no se sumó al archivo", { n: d.length });
  if (await ev(`localStorage.getItem("low.2d.characters.v1")`)) mal("sumada la emergencia, quedó obra en el navegador", {});

  // ── 5. disco lento: guardar mientras se lee ──
  await ev(`sessionStorage.setItem("mock.obra2d.demora", "2500"); true`);
  await send("Page.navigate", { url }); await w(300);
  for (let i = 0; i < 90; i++) { if (await ev(`!!window.LOW && !!LOW.personajes2d && LOW.personajes2d.estado() === "leyendo"`).catch(() => false)) break; await w(50); }
  const antes = await ev(`(dzCharacterLibraryWrite([${nuevo(44, "Apurado")}, ...dzCharacterLibraryRead()]), dzCharacterLibraryRead().length)`);
  await w(2800); await listo();
  await ev(`sessionStorage.removeItem("mock.obra2d.demora"); true`);
  d = await disco();
  if (!d.some((x) => x.id === "char_44")) mal("lo guardado mientras se leía no llegó al disco", { antes });
  if (d.length !== 44) mal("guardar mientras se leía PISÓ lo que había en el disco", { antes, enDisco: d.length });
  if (errores.length) mal("errores de la página", errores);
  console.log("OK check_personajes_2d_disco_ui:", JSON.stringify({ pase: 41, menu, final: d.length }));
  ws.close(); try { await fetch(endpoint + "/json/close/" + target.id); } catch (_) { }
}
main().catch((e) => { console.error(e.message || e); process.exit(1); });
