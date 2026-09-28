/* Text is placed where the artist clicks and edited before committing. */
let DZ_TEXT_EDIT = null;
function dzTextToolStart() {
  dzTextEditFinish(false); dzSetTool('text');
  dzSetStatus('Texto · clic en la hoja para escribir · doble clic en un texto para editarlo');
}
function dzTextEditFinish(save) {
  const session=DZ_TEXT_EDIT;if(!session)return;DZ_TEXT_EDIT=null;
  clearInterval(session.timer);session.box.remove();
  // EL LIENZO SE REPINTA SOLO y en cada repintado el nodo <svg> se REEMPLAZA.
  // Atar la sesion a ese nodo hacia que un repintado —un cambio de contenido, la
  // cebolla, un companero de equipo— tirara EN SILENCIO todo lo tecleado:
  // reproducido reemplazando el nodo del lienzo, la caja desaparecia a mitad de
  // la frase y «Aplicar» no aplicaba nada. Lo que invalida una edicion de texto
  // es que cambie el DOCUMENTO o el CUADRO, no que se haya repintado, asi que la
  // hoja se resuelve VIVA al aplicar.
  const svg=document.querySelector('#dzCanvas > svg');
  if(!save||DZ.doc!==session.doc||DZ.doc?.frame!==session.frame||!svg)return;
  const value=session.input.value;
  if(!value.trim()||value===session.original)return;
  // Si se editaba un texto que YA existia y el repintado se llevo ese nodo, no
  // se puede re-apuntar sin inventar: se avisa, que es lo contrario de perderlo
  // en silencio.
  if(session.el&&!session.el.isConnected)
    return dzSetStatus('El lienzo se repintó mientras editabas ese texto: no se aplicó el cambio. Volvé a hacerle doble clic.');
  clearTimeout(DZ_DOC_TIMER);dzDocCommit();if(!DZ.doc)dzSnapshot();
  const el=session.el||document.createElementNS('http://www.w3.org/2000/svg','text');
  if(!session.el){el.setAttribute('x',session.p.x);el.setAttribute('y',session.p.y);el.setAttribute('font-size','36');el.setAttribute('font-family','sans-serif');el.setAttribute('fill',DZ.drawColor||'#1a1a1a');dzArtAppend(svg,el);}
  el.replaceChildren();
  value.split('\n').forEach((line,i)=>{const span=document.createElementNS(el.namespaceURI,'tspan');span.setAttribute('x',el.getAttribute('x')||'0');span.setAttribute('dy',i?'1.2em':'0');span.textContent=line||' ';el.appendChild(span);});
  dzDocCommit();dzMarkDirty();dzSetTool('select');dzSelect(el);dzSetStatus('Texto aplicado · doble clic para editar · Ctrl+Z para deshacer');
}
function dzTextEditAt(e, el) {
  const svg=document.querySelector('#dzCanvas > svg');if(!svg)return;
  dzTextEditFinish(true);
  const p=dzToUser(e.clientX,e.clientY),box=document.createElement('div');box.className='dz-text-editor';box.setAttribute('role','dialog');box.setAttribute('aria-label','Editar texto');
  const input=document.createElement('textarea');input.setAttribute('aria-label','Contenido del texto');input.placeholder='Escribí tu texto…';
  const lines=el?[...el.querySelectorAll('tspan')]:[];
  input.value=el?(lines.length?lines.map(n=>n.textContent).join('\n'):el.textContent):'';
  const save=document.createElement('button');save.textContent='Aplicar';save.onclick=()=>dzTextEditFinish(true);
  const cancel=document.createElement('button');cancel.textContent='Cancelar';cancel.onclick=()=>dzTextEditFinish(false);
  box.append(input,save,cancel);box.style.left=Math.max(8,Math.min(innerWidth-340,e.clientX))+'px';box.style.top=Math.max(8,Math.min(innerHeight-190,e.clientY))+'px';document.body.appendChild(box);
  input.addEventListener('keydown',event=>{event.stopPropagation();if(event.key==='Escape'){event.preventDefault();dzTextEditFinish(false);}else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();dzTextEditFinish(true);}});
  const session={doc:DZ.doc,svg,p,el,box,input,original:input.value,frame:DZ.doc?.frame};
  // Vigila lo que de verdad invalida la edicion: cambiar de documento o de
  // cuadro. NO se cancela por un repintado ni porque el nodo <svg> sea otro,
  // que es lo que tiraba lo tecleado sin decir nada.
  session.timer=setInterval(()=>{if(DZ.doc!==session.doc||DZ.doc?.frame!==session.frame)dzTextEditFinish(false);},100);
  DZ_TEXT_EDIT=session;input.focus();input.select();
}
document.addEventListener('pointerdown',e=>{
  if(typeof DZ==='undefined'||DZ.tool!=='text'||e.button!==0||DZ.spaceDown)return;
  if(!e.target.closest?.('#dzCanvas'))return;
  e.preventDefault();e.stopImmediatePropagation();dzTextEditAt(e,e.target.closest?.('text'));
},true);
document.addEventListener('dblclick',e=>{
  if(typeof DZ==='undefined'||!['select','direct','text'].includes(DZ.tool))return;
  const el=e.target.closest?.('#dzCanvas text');if(!el)return;e.preventDefault();e.stopImmediatePropagation();dzTextEditAt(e,el);
},true);
