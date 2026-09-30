/* First playable experiment: perform timing, compare A/B, commit atomically. */
(function(global) {
  "use strict";
  const A=global.LOW.animation, R=A.rhythm;
  function demo() {
    const heights=[150,136,100,54,100,136,150];
    const runs=heights.map((y,i)=>({number:i+1,frames:4,name:["Apoyo","Impulso","Subida","Suspensión","Caída","Contacto","Peso"][i],
      content:`<path d="M35 176H285" stroke="#c6beb1" stroke-width="2"/><ellipse cx="160" cy="178" rx="${27-(150-y)/7}" ry="4" fill="#d4cabc"/><ellipse cx="160" cy="${y}" rx="${i===6?30:22}" ry="${i===6?16:22}" fill="#eb623b" stroke="#462c28" stroke-width="3"/><path d="M151 ${y-3}l3 -1m12 1l3 -1" stroke="#462c28" stroke-width="3" stroke-linecap="round"/>`}));
    return {layerName:"Estudio de peso",fps:24,width:320,height:210,runs,original:runs.map(()=>4),palette:"",demo:true};
  }
  function imageFor(s,run) {
    // SVG in an image context cannot run scripts or affect the surrounding UI.
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${s.width} ${s.height}"><style>${s.palette||""}</style>${run.content}</svg>`;
    return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
  }
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
    dialog.innerHTML=`<header class="rhythm-head"><div><span class="rhythm-eyebrow">LOW / LABORATORIO DE MOVIMIENTO</span><h1 id="rhythmTitle">El dibujo es tuyo.<br>El tiempo también.</h1></div><button data-action="close" aria-label="Cerrar Interpretar">Cerrar ×</button></header>
      <div class="rhythm-intro"><div><b>Interpretar</b><p>Ensayá el peso, la espera y el golpe de tus poses. Escuchá el ritmo con la mano.</p></div><span class="rhythm-scope"></span></div>
      <div class="rhythm-comparison"><section><div class="rhythm-caption"><b>A · Original</b><span data-counter="a"></span></div><div class="rhythm-screen"><img data-screen="a" alt="Pose del ritmo original"></div><div class="rhythm-track" data-track="a"></div></section><section><div class="rhythm-caption"><b>B · Tu interpretación</b><span data-counter="b"></span></div><div class="rhythm-screen"><img data-screen="b" alt="Pose de la interpretación propuesta"></div><div class="rhythm-track" data-track="b"></div></section></div>
      <div class="rhythm-controls"><button data-action="play" class="rhythm-primary">▶ Comparar en movimiento</button><button data-action="tap">● Interpretar con Espacio</button><button data-action="reset">Restablecer</button><label><input type="checkbox" data-fixed checked> Mantener duración del plano</label></div>
      <p class="rhythm-hint" aria-live="polite"></p><div class="rhythm-poses" aria-label="Duración de cada pose"></div>
      <footer><p class="rhythm-summary"></p><button data-action="apply" class="rhythm-primary">Aplicar a mi capa</button></footer>`;
    document.body.append(dialog);
    let values=s.original.slice(),playing=false,raf=0,start=0,recording=false,taps=[],disposed=false;
    const urls=s.runs.map(r=>imageFor(s,r)), q=sel=>dialog.querySelector(sel), fixed=q('[data-fixed]');
    q('.rhythm-scope').textContent=s.demo?'DEMOSTRACIÓN · 7 POSES':s.layerName+' · CAPA ACTIVA';
    const hint=text=>q('.rhythm-hint').textContent=text;
    const buttons={play:q('[data-action="play"]'),tap:q('[data-action="tap"]'),apply:q('[data-action="apply"]')};
    const sceneFrame=(key,list,frame)=>{
      const index=R.at(list,Math.min(frame,R.total(list)-1)), img=q(`[data-screen="${key}"]`);
      if(img.dataset.pose!==String(index)){img.src=urls[index];img.dataset.pose=index;}
      q(`[data-counter="${key}"]`).textContent=`${Math.min(frame+1,R.total(list))} / ${R.total(list)} F`;
      q(`[data-track="${key}"]`).style.setProperty('--progress',Math.min(100,(frame+1)/R.total(list)*100)+'%');
    };
    function still(){sceneFrame('a',s.original,0);sceneFrame('b',values,0);}
    function stop(){playing=false;cancelAnimationFrame(raf);buttons.play.textContent='▶ Comparar en movimiento';}
    function play(){
      if(playing){stop();return;} recording=false;buttons.tap.textContent='● Interpretar con Espacio';
      playing=true;start=performance.now();buttons.play.textContent='Ⅱ Pausar comparación';
      const tick=now=>{if(!playing||disposed)return;const frame=Math.floor((now-start)*s.fps/1000)%Math.max(R.total(values),R.total(s.original));sceneFrame('a',s.original,frame);sceneFrame('b',values,frame);raf=requestAnimationFrame(tick);};
      raf=requestAnimationFrame(tick);
    }
    function refresh(){
      const changed=JSON.stringify(values)!==JSON.stringify(s.original);
      buttons.apply.disabled=!!s.demo||!changed;
      q('.rhythm-summary').textContent=`${s.runs.length} poses · ${R.total(values)} fotogramas · ${(R.total(values)/s.fps).toFixed(2)} s a ${s.fps} FPS. `+(s.demo?'Ejemplo aislado: no modifica tu documento.':'Solo cambia el timing de esta capa. Dibujos, audio y cámara se conservan.');
      for(const key of ['a','b']){const track=q(`[data-track="${key}"]`);track.replaceChildren();(key==='a'?s.original:values).forEach((n,i)=>{const span=document.createElement('span');span.style.flex=n;span.title=`Pose ${i+1}: ${n} F`;track.append(span);});}
      const poses=q('.rhythm-poses');poses.replaceChildren();
      s.runs.forEach((run,i)=>{
        const card=document.createElement('label');card.className='rhythm-pose';
        const img=document.createElement('img');img.src=urls[i];img.alt=run.number==null?'Celda vacía':`Dibujo ${run.number}`;
        const name=document.createElement('span');name.textContent=`${String(i+1).padStart(2,'0')} · ${run.name || (run.number==null?'Vacío':'Dibujo '+run.number)}`;
        const input=document.createElement('input');input.type='number';input.min=1;input.max=12000;input.value=values[i];input.setAttribute('aria-label',`Fotogramas de pose ${i+1}`);
        input.onchange=()=>{try {
          const n=Number(input.value);if(!Number.isInteger(n)||n<1||n>12000)throw Error('Usá un número entero de fotogramas entre 1 y 12000.');
          const next=values.slice();next[i]=n;
          if(fixed.checked){const remaining=R.total(s.original)-n;if(remaining<values.length-1)throw Error('Esa duración no deja un fotograma para cada una de las otras poses.');const rest=R.fit(values.filter((_,j)=>j!==i),remaining);let k=0;for(let j=0;j<next.length;j++)if(j!==i)next[j]=rest[k++];}
          R.durations(next,s.runs.length);stop();recording=false;buttons.tap.textContent='● Interpretar con Espacio';values=next;refresh();hint('Ensayo actualizado. Compará antes de aplicar.');
        }catch(error){input.value=values[i];hint(error.message);}};
        const duration=document.createElement('div');duration.append(input,document.createTextNode(' F'));card.append(img,name,duration);poses.append(card);
      });still();
    }
    function tap(now=performance.now()){
      if(!recording)return;taps.push(now);
      if(taps.length===s.runs.length+1){
        const raw=taps.slice(1).map((t,i)=>Math.max(1,Math.round((t-taps[i])*s.fps/1000)));
        recording=false;buttons.tap.textContent='● Interpretar con Espacio';
        try{values=fixed.checked?R.fit(raw,R.total(s.original)):R.durations(raw,s.runs.length);refresh();hint('Tu interpretación está lista. Reproducí A y B para elegir.');}catch(error){hint(error.message);}
      }else{const i=taps.length-1;sceneFrame('b',values,values.slice(0,i).reduce((a,b)=>a+b,0));hint(`Pose ${i+1} de ${s.runs.length}. Espacio para pasar ${i===s.runs.length-1?'y terminar':'a la siguiente'}.`);}
    }
    function arm(){stop();if(recording){tap();return;}recording=true;taps=[];buttons.tap.textContent='● Marcar siguiente pose';hint('Espacio para empezar. Después, un golpe por cambio de pose y otro para terminar.');buttons.tap.focus();}
    function suspend(){stop();if(recording){recording=false;buttons.tap.textContent='● Interpretar con Espacio';hint('Interpretación interrumpida al salir de la ventana. Tu ensayo anterior se conserva.');}}
    global.addEventListener('blur',suspend);
    function close(){disposed=true;stop();global.removeEventListener('blur',suspend);dialog.close();dialog.remove();previous?.focus();}
    buttons.play.onclick=play;buttons.tap.onclick=arm;
    q('[data-action="close"]').onclick=close;
    q('[data-action="reset"]').onclick=()=>{stop();recording=false;buttons.tap.textContent='● Interpretar con Espacio';values=s.original.slice();refresh();hint('Volviste al ritmo original.');};
    fixed.onchange=()=>{stop();recording=false;buttons.tap.textContent='● Interpretar con Espacio';if(fixed.checked)values=R.fit(values,R.total(s.original));refresh();};
    buttons.apply.onclick=()=>{try{if(typeof DZ==='undefined'||DZ.doc!==doc)throw Error('El documento activo cambió. Volvé a abrir Interpretar.');if(R.apply(doc,s,values)){global.dzSetStatus?.('Interpretación aplicada. Un Deshacer recupera el ritmo original.');close();}}catch(error){hint(error.message);buttons.apply.disabled=true;}};
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('keydown',event=>{
      if(event.code==='Space' && recording && event.target.tagName!=='INPUT'){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)tap();}
      if(event.key==='Tab'){const nodes=[...dialog.querySelectorAll('button:not(:disabled),input')];const first=nodes[0],last=nodes.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
      // Prevent editor shortcuts from modifying the document underneath the lab.
      event.stopPropagation();
    });
    dialog.addEventListener('keyup',event=>event.stopPropagation());
    dialog.addEventListener('close',()=>{disposed=true;stop();});
    refresh();hint(s.demo?'Probá 8 F en «Suspensión» y compará cómo cambia el peso con los mismos dibujos.':'Vista de los dibujos de la capa completa, sin cámara, rig ni audio. Los huecos también son parte del ritmo.');
    dialog.showModal();buttons.play.focus();
  }
  global.lowInterpretar=open;
  function install(){
    const close=document.querySelector('#dzClose');if(!close||document.querySelector('#lowInterpretarOpen'))return;
    const button=document.createElement('button');button.id='lowInterpretarOpen';button.className='ibtn rhythm-launch';button.innerHTML='<svg class="ico"><use href="#i-rhythm"/></svg>';button.title='Interpretar: ensayar el ritmo de la capa y comparar antes de aplicar';button.setAttribute('aria-label',button.title);button.onclick=()=>open();close.before(button);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})(window);
