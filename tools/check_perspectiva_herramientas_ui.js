/* LA PERSPECTIVA LA SIGUEN TODAS LAS HERRAMIENTAS, con eventos reales.
   CDP :9223 + mock :8791.

   POR QUE EXISTE. Reportado en v3.29.1: «el sistema de punto de fuga no
   funciona: el trazo no sigue la fuga, y es confuso de usar». MEDIDO con 2
   puntos de fuga:
   - el lápiz y el pincel SÍ fugaban (0,00° de desvío);
   - la LÍNEA y el RECTÁNGULO no: salían con los mismos 8° con que se los
     dibujó, como si no hubiera perspectiva;
   - los dos puntos del preset de 2 quedaban FUERA de la pantalla: no se veían
     ni se podían agarrar;
   - cerca del horizonte las rectas de los dos puntos casi coinciden y no había
     manera de decir «la otra fuga».

   Lo que se cuida:
   1. La Línea fuga al punto hacia donde se la tira.
   2. El Rectángulo sale como un cuadrilátero sobre el piso: cada lado apunta a
      uno de los dos puntos. La Elipse queda inscripta en ese cuadrilátero.
   3. Un punto fuera de la pantalla tiene su flecha en el borde, y arrastrar la
      flecha mueve el punto.
   4. Apagar el imán de un punto: el trazo ya no fuga a él.
   5. Tab en medio del trazo pasa a la otra fuga.
   6. «Fuga con 2 líneas»: dos rectas dibujadas crean el punto donde se cruzan.
*/
const assert = require("node:assert/strict");
const endpoint = process.argv[2] || "http://127.0.0.1:9223";
const url = process.argv[3] || "http://127.0.0.1:8791/ui/index.html?mock=1";

async function main() {
  const tab = await (await fetch(endpoint + "/json/new?about:blank", { method: "PUT" })).json();
  const ws = new WebSocket(tab.webSocketDebuggerUrl), pending = new Map(), errors = []; let id = 0;
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  ws.onmessage = ({ data }) => { const m = JSON.parse(data);
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    const p = pending.get(m.id); if (p) { pending.delete(m.id); m.error ? p.j(Error(m.error.message)) : p.r(m.result); } };
  const send = (method, params = {}) => new Promise((r, j) => { const n = ++id; pending.set(n, { r, j }); ws.send(JSON.stringify({ id: n, method, params })); });
  const ev = async (expression) => { const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const mouse = (type, x, y, extra = {}) => send("Input.dispatchMouseEvent", { type, x, y, button: "left", pointerType: "pen", force: 0.6, ...extra });
  /** Un gesto: apretar en a, ir hasta b en pasos (con un temblor chico), soltar. */
  async function gesto(a, b, { pasos = 24, temblor = 2, alMedio = null } = {}) {
    await mouse("mouseMoved", a.x, a.y, { force: 0 });
    await mouse("mousePressed", a.x, a.y, { buttons: 1, clickCount: 1 });
    for (let i = 1; i <= pasos; i++) {
      const t = i / pasos, nx = -(b.y - a.y), ny = b.x - a.x, n = Math.hypot(nx, ny) || 1, j = Math.sin(i * 1.7) * temblor;
      await mouse("mouseMoved", a.x + (b.x - a.x) * t + nx / n * j, a.y + (b.y - a.y) * t + ny / n * j, { buttons: 1 });
      if (alMedio && i === Math.round(pasos / 2)) await alMedio();
      await wait(8);
    }
    await mouse("mouseReleased", b.x, b.y, { buttons: 0, clickCount: 1, force: 0 });
    await wait(500);
  }
  const tecla = async (key, code, keyCode) => {
    await send("Input.dispatchKeyEvent", { type: "rawKeyDown", key, code, windowsVirtualKeyCode: keyCode });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key, code, windowsVirtualKeyCode: keyCode });
  };
  /** Pantalla → lienzo y lienzo → pantalla, con el zoom y el paneo reales. */
  const aPantalla = (p) => ev(`(()=>{const m=document.querySelector('#dzCanvas > svg').getScreenCTM();const p=${JSON.stringify(p)};return {x:m.a*p.x+m.c*p.y+m.e,y:m.b*p.x+m.d*p.y+m.f};})()`);
  /** El elemento nuevo desde la marca, con sus puntos en coordenadas del lienzo. */
  const marcar = () => ev(`(()=>{window.__antes=new Set([...document.querySelectorAll('#dzCanvas > svg g[data-low-art] *')]);return 1;})()`);
  const nuevo = () => ev(`(()=>{const svg=document.querySelector('#dzCanvas > svg');
    const n=[...svg.querySelectorAll('g[data-low-art] *')].filter(x=>!window.__antes.has(x)&&/^(path|line|polyline|polygon|rect|ellipse)$/.test(x.tagName));
    if(!n.length)return null;const el=n[n.length-1],tag=el.tagName;let pts=[];
    const bp=el.getAttribute('data-low-brush-points');
    if(bp){pts=JSON.parse(bp).map(q=>Array.isArray(q)?{x:q[0],y:q[1]}:{x:q.x,y:q.y});}
    else if(tag==='line')pts=[{x:+el.getAttribute('x1'),y:+el.getAttribute('y1')},{x:+el.getAttribute('x2'),y:+el.getAttribute('y2')}];
    else if(tag==='polygon'||tag==='polyline'){const v=(el.getAttribute('points')||'').trim().split(/[\\s,]+/).map(Number);for(let i=0;i+1<v.length;i+=2)pts.push({x:v[i],y:v[i+1]});}
    else if(tag==='path'){const L=el.getTotalLength();for(let i=0;i<=40;i++){const p=el.getPointAtLength(L*i/40);pts.push({x:p.x,y:p.y});}}
    return {tag,pts};})()`);
  const vps = () => ev(`LOW.drawing.perspectiva.datos().vps.map(v=>({x:v.x,y:v.y,iman:v.iman!==false}))`);
  /** ¿La recta por a y b pasa por el punto v? Se mide el ángulo entre a→b y a→v. */
  const desvio = (a, b, v) => { let d = (Math.atan2(b.y - a.y, b.x - a.x) - Math.atan2(v.y - a.y, v.x - a.x)) * 180 / Math.PI;
    d = ((d % 180) + 180) % 180; return Math.min(d, 180 - d); };
  try {
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Emulation.setDeviceMetricsOverride", { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url });
    for (let i = 0; i < 120; i++) { if (await ev('document.readyState==="complete"&&typeof dzDocumentNew==="function"&&typeof api!=="undefined"&&!!api').catch(() => false)) break; await wait(250); }
    await ev(`(async()=>{await dzDocumentNew();if(typeof closeL3d==='function')closeL3d();const s=document.getElementById('lowSplash');if(s)s.remove();
      await new Promise(r=>setTimeout(r,700));LOW.drawing.perspectiva.abrir();LOW.drawing.perspectiva.preset(2);await new Promise(r=>setTimeout(r,300));})()`);
    const [v1, v2] = await vps();
    const hz = v1.y;                                         // altura del horizonte, en el lienzo
    const W = await ev("DZ.doc.scene.width"), H = await ev("DZ.doc.scene.height");

    // 3. los dos puntos están fuera de la pantalla: tienen su flecha en el borde
    const flechas = await ev(`(()=>{const r=document.querySelector('#dzCanvas').getBoundingClientRect();
      return [...document.querySelectorAll('.lowpersp-fuera')].filter(f=>!f.hidden).map(f=>{const b=f.getBoundingClientRect();
        return {i:+f.dataset.vp,x:b.x+b.width/2,y:b.y+b.height/2,adentro:b.left>=r.left-1&&b.right<=r.right+1&&b.top>=r.top-1&&b.bottom<=r.bottom+1};});})()`);
    assert.equal(flechas.length, 2, "los puntos de fuga fuera de la pantalla no tienen flecha en el borde: " + JSON.stringify(flechas));
    assert.ok(flechas.every((f) => f.adentro), "la flecha de un punto fuera de la pantalla quedó fuera de la mesa: " + JSON.stringify(flechas));
    // arrastrar la flecha del punto 2 hacia abajo mueve el punto (y el horizonte con él)
    const f2 = flechas.find((f) => f.i === 1);
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: f2.x, y: f2.y });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: f2.x, y: f2.y, button: "left", buttons: 1, clickCount: 1 });
    for (let i = 1; i <= 8; i++) await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: f2.x, y: f2.y + i * 5, button: "left", buttons: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: f2.x, y: f2.y + 40, button: "left", buttons: 0, clickCount: 1 });
    await wait(300);
    const movidos = await vps();
    assert.ok(movidos[1].y - v2.y > 20, "arrastrar la flecha no movió el punto de fuga: " + JSON.stringify({ antes: v2, despues: movidos[1] }));
    assert.equal(await ev("DZ.history.undoStack.length>0"), true);
    await ev("dzUndo()"); await wait(300);
    assert.equal((await vps())[1].y, v2.y, "Ctrl+Z no devolvió el punto arrastrado");

    // 1. la Línea fuga: se tira desde abajo a la derecha hacia el punto 2 con 6° de error
    const A = { x: W * 0.72, y: H * 0.85 };
    const dir = Math.atan2(v2.y - A.y, v2.x - A.x) + 6 * Math.PI / 180;
    const B = { x: A.x + Math.cos(dir) * W * 0.18, y: A.y + Math.sin(dir) * W * 0.18 };
    await ev("dzFormaElegir('line')"); await marcar();
    await gesto(await aPantalla(A), await aPantalla(B), { temblor: 0 });
    const linea = await nuevo();
    assert.ok(linea && linea.pts.length >= 2, "la Línea no dibujó nada: " + JSON.stringify(linea));
    const dl = desvio(linea.pts[0], linea.pts[linea.pts.length - 1], v2);
    assert.ok(dl < 0.3, "la Línea NO sigue la fuga: sale " + dl.toFixed(2) + "° desviada del punto 2");

    // 2. el Rectángulo, en el piso: un cuadrilátero con cada lado hacia un punto de fuga
    const R0 = { x: W * 0.40, y: H * 0.80 }, R1 = { x: W * 0.62, y: H * 0.95 };
    await ev("dzFormaElegir('rect')"); await marcar();
    await gesto(await aPantalla(R0), await aPantalla(R1), { temblor: 0 });
    const rect = await nuevo();
    assert.ok(rect && rect.pts.length === 4, "el Rectángulo no salió como un cuadrilátero en perspectiva: " + JSON.stringify(rect && { tag: rect.tag, n: rect.pts.length }));
    for (let i = 0; i < 4; i++) {
      const a = rect.pts[i], b = rect.pts[(i + 1) % 4];
      const d = Math.min(desvio(a, b, v1), desvio(a, b, v2));
      assert.ok(d < 0.3, "el lado " + (i + 1) + " del rectángulo no apunta a ningún punto de fuga (" + d.toFixed(2) + "°)");
    }
    assert.ok(rect.pts.every((p) => p.y > hz), "el rectángulo en el piso cruzó el horizonte");
    // la Elipse, inscripta en el mismo plano: todos sus puntos dentro del cuadrilátero que define el gesto
    await ev("dzFormaElegir('ellipse')"); await marcar();
    await gesto(await aPantalla(R0), await aPantalla(R1), { temblor: 0 });
    const elipse = await nuevo();
    assert.ok(elipse && elipse.pts.length >= 24, "la Elipse no salió en perspectiva: " + JSON.stringify(elipse && { tag: elipse.tag, n: elipse.pts.length }));
    // adentro o sobre un lado (los puntos de tangencia caen justo en el borde): medio píxel de tolerancia
    const dentro = (p, q) => { const d = []; for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4];
      d.push(((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y)); }
      return d.every((x) => x >= -0.5) || d.every((x) => x <= 0.5); };
    assert.ok(elipse.pts.every((p) => dentro(p, rect.pts)), "la elipse se sale del cuadrilátero en perspectiva: " + JSON.stringify({ tag: elipse.tag, n: elipse.pts.length, rect: rect.pts, fuera: elipse.pts.filter((p) => !dentro(p, rect.pts)).slice(0, 4) }));

    // 4. apagar el imán del punto 1: un trazo que iría a él queda libre
    await ev(`(()=>{const c=document.querySelector('#lowPersp [data-vp-iman="0"]');if(c)c.click();return !!c;})()`);
    assert.equal((await vps())[0].iman, false, "no hay cómo apagar el imán de un punto de fuga desde la barra");
    await ev("dzSetTool('pencil')"); await marcar();
    const P = { x: W * 0.5, y: H * 0.75 };
    const haciaV1 = Math.atan2(v1.y - P.y, v1.x - P.x) + 3 * Math.PI / 180;
    await gesto(await aPantalla(P), await aPantalla({ x: P.x + Math.cos(haciaV1) * 300, y: P.y + Math.sin(haciaV1) * 300 }), { temblor: 0 });
    const libre = await nuevo();
    const dLibre = desvio(libre.pts[0], libre.pts[libre.pts.length - 1], v1);
    assert.ok(dLibre > 1.5, "con el imán del punto 1 apagado, el trazo igual se fue a ese punto (" + dLibre.toFixed(2) + "°)");
    await ev(`(()=>{const c=document.querySelector('#lowPersp [data-vp-iman="0"]');if(c)c.click();})()`);
    assert.equal((await vps())[0].iman, true);

    // 5. Tab en medio del trazo: de la fuga elegida pasa a otra
    await marcar();
    const T = { x: W * 0.45, y: H * 0.9 };
    const haciaV2 = Math.atan2(v2.y - T.y, v2.x - T.x);
    await gesto(await aPantalla(T), await aPantalla({ x: T.x + Math.cos(haciaV2) * 360, y: T.y + Math.sin(haciaV2) * 360 }),
      { temblor: 0, pasos: 30, alMedio: () => tecla("Tab", "Tab", 9) });
    const cambiado = await nuevo();
    const a0 = cambiado.pts[0], a1 = cambiado.pts[cambiado.pts.length - 1];
    assert.ok(desvio(a0, a1, v2) > 3, "Tab no cambió de fuga: el trazo siguió al punto 2");
    const vertical = desvio(a0, a1, { x: a0.x, y: a0.y - 1000 });
    assert.ok(desvio(a0, a1, v1) < 0.3 || vertical < 0.3,
      "con Tab el trazo quedó torcido en vez de seguir otra dirección de la perspectiva: " + JSON.stringify({ v1: desvio(a0, a1, v1), vertical }));
    assert.equal(await ev("document.querySelector('#designView').classList.contains('dz-zen')"), false,
      "Tab en medio del trazo además prendió el modo dibujo");

    // 6. «Fuga con 2 líneas»: dos rectas que se cruzan en (Q) crean ahí el punto 3
    const Q = { x: W * 0.5, y: -H * 1.5 };                    // un punto de fuga vertical, muy arriba
    const l1a = { x: W * 0.30, y: H * 0.70 }, l2a = { x: W * 0.70, y: H * 0.70 };
    const hacia = (a, t) => ({ x: a.x + (Q.x - a.x) * t, y: a.y + (Q.y - a.y) * t });
    await ev("dzSetTool('pencil')"); await marcar();
    await ev(`(()=>{const b=document.querySelector('#lowPersp [data-p="dos-lineas"]');if(b)b.click();return !!b;})()`);
    await gesto(await aPantalla(l1a), await aPantalla(hacia(l1a, 0.12)), { temblor: 0 });
    await gesto(await aPantalla(l2a), await aPantalla(hacia(l2a, 0.12)), { temblor: 0 });
    const tres = await vps();
    assert.equal(tres.length, 3, "dibujar dos rectas no creó el punto de fuga: " + JSON.stringify(tres));
    assert.ok(Math.hypot(tres[2].x - Q.x, tres[2].y - Q.y) < 2, "el punto nuevo no quedó donde se cruzan las rectas: " + JSON.stringify({ esperado: Q, salio: tres[2] }));
    assert.equal(await ev("[...document.querySelectorAll('#dzCanvas > svg g[data-low-art] *')].filter(x=>!window.__antes.has(x)&&/^(path|line)$/.test(x.tagName)).length"), 0,
      "las rectas para marcar la fuga quedaron dibujadas en la hoja");

    // 7. ventana chica (1000×560, espacio Animación): los puntos caen dentro de la
    //    mesa pero FUERA de la hoja, que recorta. Antes no se veían y la barra los
    //    tapaba. Tiene que haber una agarradera EN cada punto, y arriba de todo.
    await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 560, deviceScaleFactor: 1, mobile: false });
    await ev(`(async()=>{const sc=DZ.doc.scene,q=JSON.parse(JSON.stringify(sc.perspective));q.vps=q.vps.slice(0,2);DZ.doc.setPerspective(q);
      if(typeof dzFitView==='function')dzFitView();await new Promise(r=>setTimeout(r,500));LOW.drawing.perspectiva.abrir();await new Promise(r=>setTimeout(r,300));})()`);
    const chica = await ev(`(()=>{const svg=document.querySelector('#dzCanvas > svg'),m=svg.getScreenCTM(),me=document.querySelector('#dzCanvas').getBoundingClientRect();
      return LOW.drawing.perspectiva.datos().vps.map(v=>{const x=m.a*v.x+m.c*v.y+m.e,y=m.b*v.x+m.d*v.y+m.f;const e=document.elementFromPoint(x,y);
        return {enMesa:x>me.left&&x<me.right&&y>me.top&&y<me.bottom,arriba:!!(e&&e.closest('.lowpersp-fuera')),es:e&&(e.id||e.className)};});})()`);
    for (const c of chica) if (c.enMesa)
      assert.ok(c.arriba, "a 1000×560 un punto de fuga dentro de la mesa no se puede agarrar: encima está " + JSON.stringify(c.es));

    assert.deepEqual(errors, []);
    console.log("E2E perspectiva en todas las herramientas OK", JSON.stringify({ linea: +dl.toFixed(3), flechas: flechas.length, libre: +dLibre.toFixed(2), puntos: tres.length }));
  } finally { ws.close(); await fetch(endpoint + "/json/close/" + tab.id); }
}
main().catch((e) => { console.error(e); process.exitCode = 1; });
setTimeout(() => process.exit(1), 120000).unref();
