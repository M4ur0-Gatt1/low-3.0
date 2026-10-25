/* Flujo del chat (v3.49) en la UI real con backend falso.
   node tools/check_chat_flow_ui.js [cdp] [url]
   Exige: formato seguro de respuestas, copiar, streaming que se formatea al
   cerrar, un turno por vez, reintentar tras fallo/corte, historial ↑ y cuadro
   que crece. */
const assert = require('node:assert/strict');
const endpoint = process.argv[2] || 'http://127.0.0.1:9223';
const pageUrl = process.argv[3] || 'http://127.0.0.1:8791/ui/index.html?mock=1';
const wait = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const target = await (await fetch(endpoint + '/json/new?about:blank', {method:'PUT'})).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl), pending = new Map(); let id = 0;
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = ({data}) => {
    const m = JSON.parse(data), t = pending.get(m.id);
    if (t) { pending.delete(m.id); m.error ? t.reject(Error(m.error.message)) : t.resolve(m.result); }
  };
  const send = (method, params={}) => new Promise((resolve,reject) => {
    const r = ++id; pending.set(r,{resolve,reject}); socket.send(JSON.stringify({id:r,method,params}));
  });
  const ev = async expression => {
    const r = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const until = async (expr, what) => {
    for (let i = 0; i < 60; i++) { if (await ev(expr)) return; await wait(50); }
    throw Error('no ocurrió: ' + what);
  };
  try {
    await send('Page.enable'); await send('Runtime.enable');
    await send('Network.enable'); await send('Network.setCacheDisabled',{cacheDisabled:true});
    await send('Emulation.setDeviceMetricsOverride',{width:1400,height:900,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:pageUrl});
    for (let i = 0; i < 100; i++) { if (await ev('typeof api !== "undefined" && !!api && !!window.LOW?.chatFlow && typeof send === "function"')) break; await wait(100); }
    for (let i = 0; i < 100; i++) { if (await ev('!document.getElementById("lowSplash") || Number(getComputedStyle(document.getElementById("lowSplash")).opacity) === 0')) break; await wait(100); }
    await ev(`{ dzIrAlAgente(); resetMsgs(); localStorage.removeItem('low.chat.history.v1');
      const sel = document.getElementById('selProv');
      if (!sel.value) sel.innerHTML = '<option value="openai">openai</option>';
      S.providers = [{name: sel.value, has_key: true}];
      window.__calls = []; }`);

    // 1) formato seguro: nada de HTML del modelo se ejecuta
    const html = await ev(`LOW.chatFlow.toHtml('<img src=x onerror=alert(1)> **ojo** \`a<b\`\\n\\n- uno\\n- dos\\n\\n\`\`\`js\\nif (a<b) x();\\n\`\`\`')`);
    assert.ok(!/<img/.test(html), 'se coló HTML crudo: ' + html);
    assert.match(html, /&lt;img/); assert.match(html, /<strong>ojo<\/strong>/);
    assert.match(html, /<code>a&lt;b<\/code>/); assert.match(html, /<ul><li>uno<\/li><li>dos<\/li><\/ul>/);
    assert.match(html, /md-code[\s\S]*js[\s\S]*if \(a&lt;b\) x\(\);/);

    // 2) respuesta normal con formato + acciones
    await ev(`agentMsg('Listo:\\n\`\`\`py\\nprint(1)\\n\`\`\`')`);
    await until('!!document.querySelector("#msgs .m-agent:last-child .m-tools")', 'acciones en la burbuja');
    assert.equal(await ev('document.querySelector("#msgs .m-agent:last-child .md-code code").textContent'), 'print(1)');
    assert.equal(await ev('document.querySelector("#msgs .m-agent:last-child .m-txt").dataset.raw.includes("print(1)")'), true);

    // 3) streaming: texto plano mientras llega, formateado al cerrar
    await ev(`LOW.onPy({event:'agent_start',data:{}}); LOW.onPy({event:'agent_delta',data:'Paso **uno**\\n'});`);
    assert.equal(await ev('!!document.querySelector("#msgs .m-agent:last-child strong")'), false);
    await ev(`LOW.onPy({event:'agent_delta',data:'- a\\n- b'}); LOW.onPy({event:'agent_end',data:{}});`);
    assert.equal(await ev('document.querySelector("#msgs .m-agent:last-child strong").textContent'), 'uno');
    assert.equal(await ev('document.querySelectorAll("#msgs .m-agent:last-child li").length'), 2);

    // 4) un turno por vez: Enter con LOW trabajando no envía ni borra
    await ev(`{ api.send_chat = async (...a) => { window.__calls.push(a[0]); return {text:'ok', status:'ok'}; };
      S.busy = true; const i = document.getElementById('inp'); i.value = 'segundo pedido';
      i.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true, cancelable:true})); }`);
    await wait(50);
    assert.deepEqual(await ev('window.__calls'), []);
    assert.equal(await ev('document.getElementById("inp").value'), 'segundo pedido');
    assert.match(await ev('document.getElementById("status").textContent'), /trabajando/);
    await ev('S.busy = false');

    // 5) falla → Reintentar reenvía el mismo mensaje
    await ev(`api.send_chat = async (m) => { window.__calls.push(m); throw Error('sin red'); };
      document.getElementById('inp').value = 'hacé el logo'; send();`);
    await until('!!document.querySelector("#msgs .m-retry")', 'fila de reintento tras fallo');
    assert.match(await ev('document.querySelector("#msgs .m-retry").textContent'), /sin red/);
    await until('!S.busy', 'fin del turno fallido');
    await ev(`api.send_chat = async (m) => { window.__calls.push(m); return {text:'hecho', status:'ok'}; };
      [...document.querySelectorAll('#msgs .m-retry .m-act')].find(b => /Reintentar/.test(b.textContent)).click();`);
    await until('window.__calls.length === 2', 'reintento');
    assert.deepEqual(await ev('window.__calls'), ['hacé el logo', 'hacé el logo']);
    await until('!S.busy', 'fin del reintento');
    assert.equal(await ev('document.querySelectorAll("#msgs .m-retry").length'), 0);

    // 6) corte con texto parcial: etiqueta + reintento
    await ev(`api.send_chat = async (m) => {
        LOW.onPy({event:'agent_start',data:{}}); LOW.onPy({event:'agent_delta',data:'Arranco y'}); LOW.onPy({event:'agent_end',data:{}});
        return {streamed:true, full:'Arranco y', text:'', cut:true, status:'Cortado'}; };
      document.getElementById('inp').value = 'explicame'; send();`);
    await until('!!document.querySelector("#msgs .m-retry")', 'reintento tras corte');
    await until('!S.busy', 'fin del turno cortado');
    assert.match(await ev('[...document.querySelectorAll("#msgs .m-agent")].pop().querySelector(".m-who").textContent'), /cortada/);

    // 7) historial ↑/↓ y cuadro que crece
    await ev(`{ const i = document.getElementById('inp'); i.value = ''; i.focus();
      i.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowUp', bubbles:true, cancelable:true})); }`);
    assert.equal(await ev('document.getElementById("inp").value'), 'explicame');
    await ev(`document.getElementById('inp').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowUp', bubbles:true, cancelable:true}))`);
    assert.equal(await ev('document.getElementById("inp").value'), 'hacé el logo');
    await ev(`document.getElementById('inp').setSelectionRange(99,99); document.getElementById('inp').dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowDown', bubbles:true, cancelable:true}))`);
    assert.equal(await ev('document.getElementById("inp").value'), 'explicame');
    const h0 = await ev(`(() => { const i = document.getElementById('inp'); i.value = 'a'; i.dispatchEvent(new Event('input')); return i.offsetHeight; })()`);
    const h1 = await ev(`(() => { const i = document.getElementById('inp'); i.value = 'línea\\n'.repeat(8); i.dispatchEvent(new Event('input')); return i.offsetHeight; })()`);
    assert.ok(h1 > h0, `el cuadro no creció: ${h0} → ${h1}`);
    assert.ok(h1 <= 240, `el cuadro creció sin tope: ${h1}`);
    assert.equal(await ev('JSON.parse(localStorage.getItem("low.chat.draft.v1")).startsWith("línea")'), true);
    await ev(`document.getElementById('inp').value=''; document.getElementById('inp').dispatchEvent(new Event('input'));`);

    assert.deepEqual(await ev('window.__errs || []'), []);
    console.log('CHAT FLOW UI OK: formato seguro, copiar, streaming, un turno por vez, reintentar, corte, historial, autoalto');
  } finally { socket.close(); }
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)});
setTimeout(()=>{console.error('UI test timeout');process.exit(1)},30000).unref();
