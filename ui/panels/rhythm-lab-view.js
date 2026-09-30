/* LOW · Interpretar — el tiempo como instrumento.
   Mirás A (original) y B (tu interpretación) en movimiento y marcás el ritmo con
   Espacio cuando quieras: no hay que apretar grabar. Cada pasada completa (un
   golpe por cambio de pose y otro al final) queda como TOMA en un carril, y B se
   arma eligiendo, pose por pose, de qué toma sale su duración (comping). Nada
   toca la escena hasta «Aplicar», que es UN Deshacer. */
(function(global) {
  "use strict";
  const A=global.LOW.animation, R=A.rhythm;
  const MAX_TOMAS=8;
  /* Las tomas se RECUERDAN mientras la app está abierta: cerrar el laboratorio
     y volver no pierde lo que ya se tocó (así funciona la captura retroactiva).
     La clave incluye la firma de la capa: si los dibujos o las celdas cambiaron,
     las tomas viejas ya no corresponden a esas poses. */
  const memoria=new Map();

  function demo() {
    const heights=[150,136,100,54,100,136,150];
    const runs=heights.map((y,i)=>({number:i+1,frames:4,name:["Apoyo","Impulso","Subida","Suspensión","Caída","Contacto","Peso"][i],
      content:`<path d="M35 176H285" stroke="#c6beb1" stroke-width="2"/><ellipse cx="160" cy="178" rx="${27-(150-y)/7}" ry="4" fill="#d4cabc"/><ellipse cx="160" cy="${y}" rx="${i===6?30:22}" ry="${i===6?16:22}" fill="#eb623b" stroke="#462c28" stroke-width="3"/><path d="M151 ${y-3}l3 -1m12 1l3 -1" stroke="#462c28" stroke-width="3" stroke-linecap="round"/>`}));
    return {layerName:"Estudio de peso",fps:24,width:320,height:210,runs,original:runs.map(()=>4),palette:"",demo:true,signature:"demo"};
  }
  function imageFor(s,run) {
    // SVG in an image context cannot run scripts or affect the surrounding UI.
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${s.width} ${s.height}"><style>${s.palette||""}</style>${run.content}</svg>`;
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  }
  const clave=(s)=>(s.demo?"demo":s.layerId)+"|"+s.signature;

  function open({sample=false}={}) {
    if(document.querySelector('#lowInterpretar'))return;
    let doc=null,s;
    try {
      if(!sample && typeof DZ!=="undefined" && DZ.doc) {
        DZ.playback?.stop();global.dzDocCommit?.();doc=DZ.doc;s=R.capture(doc);
      } else s=demo();
    } catch(error) { global.dzSetStatus?.(error.message);return; }
    const previous=document.activeElement, dialog=document.createElement('dialog');
    dialog.id='lowInterpretar';dialog.className='rhythm';dialog.setAttribute('aria-labelledby','rhythmTitle');
    dialog.innerHTML=`<header class="rhythm-head"><div><span class="rhythm-eyebrow">LOW / LABORATORIO DE MOVIMIENTO</span><h1 id="rhythmTitle">El dibujo es tuyo. <br>El tiempo también.</h1></div><button data-action="close" aria-label="Cerrar Interpretar">Cerrar ×</button></header>
      <div class="rhythm-intro"><div><b>Interpretar</b><p>Tocá el ritmo con Espacio mientras mirás. Cada pasada queda como toma; armá la mejor con lo mejor de cada una.</p></div><span class="rhythm-scope"></span></div>
      <div class="rhythm-comparison"><section><div class="rhythm-caption"><b>A · Original</b><span data-counter="a"></span></div><div class="rhythm-screen"><img data-screen="a" alt="Pose del ritmo original"></div><div class="rhythm-track" data-track="a"></div></section><section><div class="rhythm-caption"><b>B · Tu interpretación</b><span data-counter="b"></span></div><div class="rhythm-screen"><img data-screen="b" alt="Pose de la interpretación propuesta"></div><div class="rhythm-track" data-track="b"></div></section></div>
      <div class="rhythm-controls"><button data-action="play" class="rhythm-primary">▶ Comparar en movimiento</button><button data-action="tap">● Marcar con Espacio</button><button data-action="reset">Restablecer</button><label><input type="checkbox" data-fixed checked> Mantener duración del plano</label></div>
      <p class="rhythm-hint" aria-live="polite"></p>
      <section class="rhythm-takes" aria-label="Tomas"><div class="rhythm-takes-head"><b>Tomas</b><span data-takes-state></span></div><div class="rhythm-lanes"></div></section>
      <div class="rhythm-poses" aria-label="Duración de cada pose"></div>
      <footer><p class="rhythm-summary"></p><button data-action="apply" class="rhythm-primary">Aplicar a mi capa</button></footer>`;
    document.body.append(dialog);
    const n=s.runs.length, total0=R.total(s.original);
    const guardadas=memoria.get(clave(s));
    let takes=guardadas?guardadas.map(t=>t.slice()):[];   // cada toma: duraciones CRUDAS de la pasada
    let raw=s.original.slice();                           // B antes de ajustar a la duración fija
    let values=s.original.slice();                        // B tal como se ve y se aplica
    let choice=Array(n).fill(null);                       // de qué toma sale cada pose
    let playing=false,raf=0,start=0,disposed=false,pasada=[],cortadas=0;
    const urls=s.runs.map(r=>imageFor(s,r)), q=sel=>dialog.querySelector(sel), fixed=q('[data-fixed]');
    q('.rhythm-scope').textContent=s.demo?'DEMOSTRACIÓN · 7 POSES':s.layerName+' · CAPA ACTIVA';
    const hint=text=>q('.rhythm-hint').textContent=text;
    const buttons={play:q('[data-action="play"]'),tap:q('[data-action="tap"]'),apply:q('[data-action="apply"]')};
    const recordar=()=>memoria.set(clave(s),takes.map(t=>t.slice()));
    const sceneFrame=(key,list,frame)=>{
      const index=R.at(list,Math.min(frame,R.total(list)-1)), img=q(`[data-screen="${key}"]`);
      if(img.dataset.pose!==String(index)){img.src=urls[index];img.dataset.pose=index;}
      q(`[data-counter="${key}"]`).textContent=`${Math.min(frame+1,R.total(list))} / ${R.total(list)} F`;
      q(`[data-track="${key}"]`).style.setProperty('--progress',Math.min(100,(frame+1)/R.total(list)*100)+'%');
    };
    function still(){sceneFrame('a',s.original,0);sceneFrame('b',values,0);}
    function stop(){playing=false;cancelAnimationFrame(raf);buttons.play.textContent='▶ Comparar en movimiento';}
    function play(){
      if(playing){stop();return;}
      playing=true;start=performance.now();buttons.play.textContent='Ⅱ Pausar comparación';
      const tick=now=>{if(!playing||disposed)return;const frame=Math.floor((now-start)*s.fps/1000)%Math.max(R.total(values),total0);sceneFrame('a',s.original,frame);sceneFrame('b',values,frame);raf=requestAnimationFrame(tick);};
      raf=requestAnimationFrame(tick);
    }
    /** B = lo crudo (tomas + comping + ediciones), ajustado a la duración fija si corresponde. */
    function recalcular(){
      values=fixed.checked?R.fit(raw,total0):R.durations(raw,n);
    }
    function estadoTomas(){
      const partes=[];
      if(pasada.length)partes.push(`pasada: ${pasada.length} de ${n+1} golpes`);
      if(cortadas)partes.push(`${cortadas} cortada${cortadas>1?'s':''} por una pausa larga`);
      q('[data-takes-state]').textContent=partes.join(' · ')||(takes.length?'clic en una pose de un carril para usar esa duración':'marcá con Espacio cuando quieras: no hace falta grabar');
    }
    function pintarCarriles(){
      const lanes=q('.rhythm-lanes');lanes.replaceChildren();
      takes.forEach((take,k)=>{
        const lane=document.createElement('div');lane.className='rhythm-lane';lane.dataset.take=k;
        const nombre=document.createElement('span');nombre.className='rhythm-lane-name';
        nombre.textContent=`Toma ${k+1} · ${R.total(take)} F`;
        const pista=document.createElement('div');pista.className='rhythm-lane-track';
        take.forEach((f,i)=>{
          const seg=document.createElement('button');seg.type='button';seg.style.flex=f;seg.dataset.pose=i;
          seg.className=choice[i]===k?'elegida':'';
          seg.title=`Pose ${i+1}: ${f} F en esta toma${choice[i]===k?' (en uso)':''}`;
          seg.setAttribute('aria-label',seg.title);
          seg.onclick=()=>{stop();choice[i]=k;raw=R.comp(takes,choice,raw);try{recalcular();}catch(error){hint(error.message);}refresh();hint(`Pose ${i+1}: ahora dura lo de la toma ${k+1}. Compará antes de aplicar.`);};
          pista.append(seg);
        });
        const usar=document.createElement('button');usar.type='button';usar.className='rhythm-lane-use';usar.textContent='Usar';
        usar.title=`Usar la toma ${k+1} entera`;
        usar.onclick=()=>{stop();choice=Array(n).fill(k);raw=take.slice();try{recalcular();}catch(error){hint(error.message);}refresh();hint(`B es la toma ${k+1} entera.`);};
        const quitar=document.createElement('button');quitar.type='button';quitar.className='rhythm-lane-del';quitar.textContent='×';
        quitar.title=`Descartar la toma ${k+1}`;quitar.setAttribute('aria-label',quitar.title);
        quitar.onclick=()=>{takes.splice(k,1);choice=choice.map(c=>c===k?null:(c!=null&&c>k?c-1:c));recordar();refresh();};
        lane.append(nombre,pista,usar,quitar);lanes.append(lane);
      });
      estadoTomas();
    }
    function refresh(){
      const changed=JSON.stringify(values)!==JSON.stringify(s.original);
      buttons.apply.disabled=!!s.demo||!changed;
      q('.rhythm-summary').textContent=`${n} poses · ${R.total(values)} fotogramas · ${(R.total(values)/s.fps).toFixed(2)} s a ${s.fps} FPS. `+(s.demo?'Ejemplo aislado: no modifica tu documento.':'Solo cambia el timing de esta capa. Dibujos, audio y cámara se conservan.');
      for(const key of ['a','b']){const track=q(`[data-track="${key}"]`);track.replaceChildren();(key==='a'?s.original:values).forEach((f,i)=>{const span=document.createElement('span');span.style.flex=f;span.title=`Pose ${i+1}: ${f} F`;track.append(span);});}
      const poses=q('.rhythm-poses');poses.replaceChildren();
      s.runs.forEach((run,i)=>{
        const card=document.createElement('label');card.className='rhythm-pose';
        const img=document.createElement('img');img.src=urls[i];img.alt=run.number==null?'Celda vacía':`Dibujo ${run.number}`;
        const name=document.createElement('span');name.textContent=`${String(i+1).padStart(2,'0')} · ${run.name || (run.number==null?'Vacío':'Dibujo '+run.number)}`;
        const input=document.createElement('input');input.type='number';input.min=1;input.max=12000;input.value=values[i];input.setAttribute('aria-label',`Fotogramas de pose ${i+1}`);
        input.onchange=()=>{try {
          const v=Number(input.value);if(!Number.isInteger(v)||v<1||v>12000)throw Error('Usá un número entero de fotogramas entre 1 y 12000.');
          const next=values.slice();next[i]=v;
          if(fixed.checked){const remaining=total0-v;if(remaining<n-1)throw Error('Esa duración no deja un fotograma para cada una de las otras poses.');const rest=R.fit(values.filter((_,j)=>j!==i),remaining);let k=0;for(let j=0;j<next.length;j++)if(j!==i)next[j]=rest[k++];}
          R.durations(next,n);stop();values=next;raw=next.slice();choice[i]=null;refresh();hint('Ensayo actualizado. Compará antes de aplicar.');
        }catch(error){input.value=values[i];hint(error.message);}};
        const duration=document.createElement('div');duration.append(input,document.createTextNode(' F'));card.append(img,name,duration);poses.append(card);
      });
      pintarCarriles();still();
    }
    /** Un golpe de Espacio. No hay que armar nada: se anota siempre. */
    function tap(now=performance.now()){
      const last=pasada.at(-1);
      if(last!=null && now-last>R.GAP_MS){ if(pasada.length>1)cortadas++; pasada=[]; }
      pasada.push(now);
      if(pasada.length===n+1){
        const toma=R.passes(pasada,n,s.fps).takes[0];pasada=[];
        takes.unshift(toma);if(takes.length>MAX_TOMAS)takes.length=MAX_TOMAS;
        // la nueva entra ADELANTE: B pasa a ser esa toma entera
        choice=Array(n).fill(0);raw=toma.slice();
        try{recalcular();}catch(error){hint(error.message);}
        recordar();refresh();
        hint(`Toma lista: ${R.total(toma)} F tocados${fixed.checked?`, ajustados a ${total0} F`:''}. Reproducí A y B para elegir, o seguí tocando.`);
      }else{
        const i=pasada.length-1;
        if(i>0)sceneFrame('b',values,values.slice(0,i).reduce((a,b)=>a+b,0));
        estadoTomas();
        hint(i===0?`Primer golpe. Uno por cada cambio de pose y otro al final (${n+1} en total).`:`Pose ${i+1} de ${n}.`);
      }
    }
    function suspend(){stop();if(pasada.length){pasada=[];hint('Pasada interrumpida al salir de la ventana. Las tomas anteriores se conservan.');estadoTomas();}}
    global.addEventListener('blur',suspend);
    function close(){disposed=true;stop();global.removeEventListener('blur',suspend);dialog.close();dialog.remove();previous?.focus();}
    buttons.play.onclick=play;
    buttons.tap.onclick=()=>{buttons.tap.focus();hint(`Marcá con Espacio: un golpe por cada cambio de pose y otro al final (${n+1}). Podés hacerlo mientras se reproduce.`);};
    q('[data-action="close"]').onclick=close;
    q('[data-action="reset"]').onclick=()=>{stop();pasada=[];raw=s.original.slice();choice=Array(n).fill(null);recalcular();refresh();hint('Volviste al ritmo original. Las tomas siguen en sus carriles.');};
    fixed.onchange=()=>{stop();try{recalcular();}catch(error){hint(error.message);}refresh();};
    buttons.apply.onclick=()=>{try{if(typeof DZ==='undefined'||DZ.doc!==doc)throw Error('El documento activo cambió. Volvé a abrir Interpretar.');if(R.apply(doc,s,values)){global.dzSetStatus?.('Interpretación aplicada. Un Deshacer recupera el ritmo original.');close();}}catch(error){hint(error.message);buttons.apply.disabled=true;}};
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('keydown',event=>{
      if(event.code==='Space' && event.target.tagName!=='INPUT'){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)tap();}
      if(event.key==='Tab'){const nodes=[...dialog.querySelectorAll('button:not(:disabled),input')];const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
      // Prevent editor shortcuts from modifying the document underneath the lab.
      event.stopPropagation();
    });
    dialog.addEventListener('keyup',event=>event.stopPropagation());
    dialog.addEventListener('close',()=>{disposed=true;stop();});
    refresh();
    hint(takes.length?`Hay ${takes.length} toma${takes.length>1?'s':''} de antes en los carriles. Tocá otra con Espacio o armá B con lo mejor de cada una.`
      :s.demo?'Reproducí y tocá el ritmo con Espacio, como si fuera música. Cada pasada queda como toma.':'Vista de los dibujos de la capa completa, sin cámara, rig ni audio. Los huecos también son parte del ritmo.');
    dialog.showModal();buttons.play.focus();
  }
  global.lowInterpretar=open;
  function install(){
    const close=document.querySelector('#dzClose');if(!close||document.querySelector('#lowInterpretarOpen'))return;
    const button=document.createElement('button');button.id='lowInterpretarOpen';button.className='ibtn rhythm-launch';button.innerHTML='<svg class="ico"><use href="#i-rhythm"/></svg>';button.title='Interpretar: ensayar el ritmo de la capa y comparar antes de aplicar';button.setAttribute('aria-label',button.title);button.onclick=()=>open();close.before(button);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})(window);
