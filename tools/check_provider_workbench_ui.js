/* Headless Chromium integration; uses the real LOW UI with a mock backend. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const endpoint = process.argv[2] || 'http://127.0.0.1:9223';
const pageUrl = process.argv[3] || 'http://127.0.0.1:8791/ui/index.html?mock=1';
async function main() {
  const target = await (await fetch(endpoint + '/json/new?about:blank', {method:'PUT'})).json();
  const socket = new WebSocket(target.webSocketDebuggerUrl), pending = new Map(); let id = 0;
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  socket.onmessage = ({data}) => {
    const message = JSON.parse(data), task = pending.get(message.id);
    if (task) { pending.delete(message.id); message.error ? task.reject(Error(message.error.message)) : task.resolve(message.result); }
  };
  const send = (method, params={}) => new Promise((resolve,reject) => {
    const request = ++id; pending.set(request,{resolve,reject}); socket.send(JSON.stringify({id:request,method,params}));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
    if(result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  };
  try {
    await send('Page.enable'); await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride',{width:1400,height:900,deviceScaleFactor:1,mobile:false});
    await send('Page.navigate',{url:pageUrl});
    for(let i=0;i<100;i++) {
      if(await evaluate('typeof api !== "undefined" && !!api && !!window.LOW?.ProviderSettings')) break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    // Wait until the launch animation is actually invisible before inspecting UI.
    for(let i=0;i<100;i++) {
      if(await evaluate('!document.getElementById("lowSplash") || Number(getComputedStyle(document.getElementById("lowSplash")).opacity) === 0')) break;
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    await evaluate(`dzIrAlAgente(); S.providers = [
      {name:'higgsfield',media_only:true,key:'',model:'bytedance/seedance-2.0/text-to-video',image_model:'higgsfield-ai/soul/v2/standard'},
      {name:'cloudflare',key:'',model:'model',account_id:'account'},
      {name:'openai',key:'',model:'gpt-4o'}]; modalKeys();`);
    assert.equal(await evaluate('document.querySelectorAll(".provider-card").length'),3);
    await evaluate(`window.__draft=null; api.check_provider=async(name,settings)=>{window.__draft={name,settings};return {message:'Revisado sin generar'};};
      document.querySelector('[data-provider="higgsfield"][data-field="api_key"]').value='test-id:test-secret';
      document.querySelector('[data-check="higgsfield"]').click();`);
    await new Promise(resolve=>setTimeout(resolve,80));
    assert.equal((await evaluate('window.__draft')).settings.api_key,'test-id:test-secret');
    assert.match(await evaluate('document.querySelector("[data-result=higgsfield]").textContent'),/Revisado/);
    await evaluate(`window.__realTimer=window.setTimeout;window.setTimeout=(fn,ms,...args)=>window.__realTimer(fn,ms===20000?30:ms,...args);
      api.check_provider=()=>new Promise(()=>{});document.querySelector('[data-check="higgsfield"]').click();`);
    await new Promise(resolve=>setTimeout(resolve,100));
    assert.match(await evaluate('document.querySelector("[data-result=higgsfield]").textContent'),/20 segundos/);
    assert.equal(await evaluate('document.querySelector("[data-check=higgsfield]").disabled'),false);
    await evaluate('window.setTimeout=window.__realTimer');
    await evaluate('document.getElementById("addProvider").click()');
    await evaluate(`document.querySelector('#providerCards > :last-child [data-field="base_url"]').value='http://localhost:1234/v1';
      document.querySelector('#providerCards > :last-child [data-field="model"]').value='local';`);
    const collected = await evaluate('window.LOW.ProviderSettings.collect()');
    assert.equal(collected.cloudflare.account_id,'account');
    assert.equal(Object.keys(collected).filter(key=>key.startsWith('custom_')).length,1);
    assert.equal(await evaluate(`document.querySelector('[data-field="image_params"]').value='[]';
      (()=>{try{window.LOW.ProviderSettings.collect();return false}catch{return true}})()`),true);
    await evaluate(`closeModal(); LOW.Workbench.start();
      window.__lowFiles = {'C:/mock/example.py':{path:'C:/mock/example.py',name:'example.py',content:'print("hello")',lang:'python'}};
      LOW.onPy({event:'agent_plan',data:{steps:[{title:'Verificar los cambios',status:'in_progress'}]}});
      LOW.onPy({event:'tool_start',data:{name:'read_file'}});
      LOW.onPy({event:'tool',data:{name:'read_file',res:'OK',error:false}});
      LOW.onPy({event:'tool',data:{name:'exec_cmd',res:'exit 1',error:true}});
      LOW.onPy({event:'wrote',data:{path:'C:/mock/example.py'}});
      LOW.onPy({event:'wrote',data:{path:'C:/mock/example.py'}});
      LOW.Workbench.finish();`);
    assert.equal(await evaluate('document.querySelectorAll("#workbenchFiles button").length'),1);
    assert.match(await evaluate('document.getElementById("workbenchPlan").textContent'),/En curso · Verificar/);
    assert.match(await evaluate('document.getElementById("workbenchStatus").textContent'),/2 acciones · 1 archivo\(s\) · 1 error\(es\)/);
    assert.deepEqual(await evaluate('window.__errs'),[]);
    const screenshot = await send('Page.captureScreenshot',{format:'png'});
    if(process.env.LOW_E2E_SCREENSHOT)fs.writeFileSync(process.env.LOW_E2E_SCREENSHOT,Buffer.from(screenshot.data,'base64'));
    console.log('PROVIDER + WORKBENCH UI OK: settings, custom endpoint, JSON validation, events, files, errors');
  } finally { socket.close(); }
}
main().then(()=>process.exit(0)).catch(error=>{console.error(error);process.exit(1)});
setTimeout(()=>{console.error('UI test timeout');process.exit(1)},30000).unref();
