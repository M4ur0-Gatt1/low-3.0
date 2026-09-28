/* Direct mesh correction. Preview lives only in the detached editing state;
 * Save creates one canonical action, Cancel restores the evaluated pose. */
(function(){
  "use strict";
  let session=null;
  const byId=id=>document.getElementById(id);
  function hint(text){byId("rigCorrectiveHint").textContent=text;dzSetStatus(text);}
  function valid(s){return DZ.doc===s.doc&&DZ.doc.frame===s.frame&&s.el.isConnected&&DZ.rigMode&&DZ.rigSubmode!=='build'&&byId('l3dView').hidden&&DZ.doc.drawing?.content===s.content&&JSON.stringify(DZ.doc.scene.rig)===s.rig;}
  function cancel(){
    const s=session;if(!s)return;session=null;
    clearInterval(s.watch);s.abort.abort();s.overlay.remove();
    if(DZ.doc===s.doc)dzRigApplyLive(DZ.doc.frame);
  }
  function start(){
    cancel();
    const doc=DZ.doc,selected=DZ.rigSelectedId;
    if(!doc||!selected)return hint("Seleccioná el hueso del codo o la rodilla que querés corregir");
    if(DZ.rigSubmode==='build')return hint("Pasá a Posar y doblá primero la articulación");
    const matches=Object.entries(doc.scene.rig.meshes||{}).filter(([,m])=>m.enabled!==false&&m.weights?.some(w=>w[selected]>0));
    if(matches.length!==1)return hint(matches.length?"El hueso afecta varias mallas; corregí una pieza con un conductor propio":"El hueso seleccionado no conduce una malla flexible");
    const [meshId,mesh]=matches[0],frame=doc.frame;
    const angle=doc.scene.rigChannelValue(LOW.animation.rigChannelPath(selected,"r"),frame,0);
    if(Math.abs(angle)<1)return hint("Doblá primero la articulación al menos un grado");
    const svg=byId("dzCanvas").querySelector(":scope > svg");
    const node=doc.scene.rigNode(meshId),el=svg?.querySelector('#'+CSS.escape(node?.elementId||meshId));
    if(!el)return hint("La pieza no está expuesta en este cuadro");
    const matrix=doc.scene.rigWorldMatrix(meshId,frame);
    if(matrix.some((v,i)=>Math.abs(v-[1,0,0,1,0,0][i])>1e-6))return hint("Esta edición necesita la superficie flexible sin transformación propia; posá sus huesos");
    const overlay=document.createElement("div");overlay.className="rig-corrective-overlay";
    overlay.style.cssText="position:fixed;inset:0;pointer-events:none;z-index:10001";
    const grid=document.createElementNS(svg.namespaceURI,"svg");
    grid.style.cssText="width:100%;height:100%;position:absolute;pointer-events:none";
    grid.setAttribute("aria-label","Puntos para corregir la articulación");overlay.append(grid);
    const bar=document.createElement("div");
    bar.style.cssText="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:12px 16px;border:1px solid #777;border-radius:10px;background:#383d40;color:#fff;pointer-events:auto;box-shadow:0 4px 20px #0004;font:13px system-ui;max-width:calc(100% - 32px)";
    const label=document.createElement("span");label.textContent=`Corregir a ${Math.round(angle)}° · Arrastrá los puntos`;
    const save=document.createElement("button");save.id="rigCorrectiveSave";save.textContent="Guardar correctivo";
    const discard=document.createElement("button");discard.id="rigCorrectiveCancel";discard.textContent="Cancelar";
    const interior=document.createElement("button");interior.textContent="Puntos interiores";interior.setAttribute("aria-pressed","false");
    interior.onclick=()=>{const show=interior.getAttribute("aria-pressed")!=="true";interior.setAttribute("aria-pressed",String(show));grid.querySelectorAll('[data-interior]').forEach(dot=>{dot.style.display=show?'':'none';});};
    const reachLabel=document.createElement('label');reachLabel.textContent='Zona ';
    const reach=document.createElement('input');reach.type='range';reach.min='0';reach.max='3';reach.step='.5';reach.value='1.5';reach.style.width='70px';reach.setAttribute('aria-label','Influencia sobre puntos vecinos');reachLabel.append(reach);
    bar.append(label,reachLabel,interior,save,discard);overlay.append(bar);document.body.append(overlay);
    for(const button of [interior,save,discard])button.style.cssText="padding:7px 10px;border:1px solid #ffffff30;border-radius:6px;background:#ffffff0c;color:inherit;font:inherit;cursor:pointer;white-space:nowrap";
    save.style.background='#d84b25';save.style.borderColor='#ed764d';reach.style.accentColor='#f08052';
    const s=session={doc,frame,meshId,driverId:selected,mesh,el,svg,overlay,grid,points:doc.scene.rigMeshSkinnedAt(meshId,frame).map(p=>({...p})),rig:JSON.stringify(doc.scene.rig),content:doc.drawing.content,abort:new AbortController()};
    const signal=s.abort.signal;
    function draw(){
      if(!valid(s)){cancel();return hint("Cambió la escena; se canceló la corrección sin guardarla");}
      dzRigApplyLive(frame);
      dzDeformarElemento(el,LOW.animation.rigMalla(mesh.rest,s.points,mesh.cols,mesh.rows),svg);
      const transform=svg.getScreenCTM();
      for(let i=0;i<s.points.length;i++){
        const p=new DOMPoint(s.points[i].x,s.points[i].y).matrixTransform(transform);
        const dot=grid.children[i];dot.setAttribute("cx",p.x);dot.setAttribute("cy",p.y);
      }
    }
    s.points.forEach((p,index)=>{
      const dot=document.createElementNS(svg.namespaceURI,"circle");dot.dataset.vertex=index;
      dot.setAttribute("r","4");dot.setAttribute("fill","#ff9a65");dot.setAttribute("stroke","#303639");dot.setAttribute("stroke-width","1.5");
      dot.style.cssText="pointer-events:all;cursor:move";grid.append(dot);
      const row=Math.floor(index/mesh.cols),col=index%mesh.cols;
      if(row>0&&row<mesh.rows-1&&col>0&&col<mesh.cols-1){dot.dataset.interior="true";dot.style.display="none";}
      dot.addEventListener("pointerdown",e=>{
        if(e.button!==0)return;e.preventDefault();e.stopPropagation();
        dot.setPointerCapture(e.pointerId);s.drag={index,pointer:e.pointerId,base:s.points.map(p=>({...p})),origin:new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse())};
      },{signal});
      dot.addEventListener("pointermove",e=>{
        if(s.drag?.pointer!==e.pointerId||s.drag.index!==index)return;
        e.preventDefault();const p=new DOMPoint(e.clientX,e.clientY).matrixTransform(svg.getScreenCTM().inverse());
        const radius=Number(reach.value),dx=p.x-s.drag.origin.x,dy=p.y-s.drag.origin.y;
        s.points=s.drag.base.map((base,i)=>{
          const distance=Math.hypot(i%mesh.cols-index%mesh.cols,Math.floor(i/mesh.cols)-Math.floor(index/mesh.cols));
          const weight=i===index?1:radius>0?Math.max(0,1-distance/(radius+1)):0;
          const smooth=weight*weight*(3-2*weight);
          return{x:base.x+dx*smooth,y:base.y+dy*smooth};
        });draw();
      },{signal});
      dot.addEventListener("pointerup",()=>{s.drag=null;},{signal});
      dot.addEventListener("pointercancel",()=>{s.drag=null;},{signal});
    });
    save.onclick=()=>{
      if(!valid(s)){cancel();return hint("Cambió la escena; volvé a preparar la corrección");}
      try{
        const options={meshId,driverId:selected,frame,points:s.points.map(p=>({...p}))};
        cancel();const id=LOW.rigging.flexibleLimb.corrective(doc,options);
        dzRigApplyLive(frame);dzSmartPanelSync(id);dzMarkDirty();
        hint("Correctivo guardado · se aplica según el ángulo · Ctrl+Z lo deshace");
      }catch(error){hint(error.message);}
    };
    discard.onclick=()=>{cancel();hint("Corrección cancelada; la pieza conserva su pose");};
    document.addEventListener("keydown",e=>{if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();discard.click();}},{capture:true,signal});
    s.watch=setInterval(()=>{if(!valid(s)){cancel();hint("Cambió la escena; se canceló la corrección sin guardarla");return;}
      const m=svg.getScreenCTM(),key=[m.a,m.b,m.c,m.d,m.e,m.f].join(',');if(s.view!==key){s.view=key;draw();}
    },150);
    draw();
  }
  function init(){
    const panel=byId("dzRigPanel");if(!panel)return;
    const section=document.createElement("section");section.className="rig2-section";section.dataset.rigSection="pose";
    section.innerHTML='<div class="rig2-title"><b>Corregir articulación</b></div><p id="rigCorrectiveHint" class="rig2-hint">Posá el codo o la rodilla. Ajustá su contorno una vez y reutilizá la corrección con el ángulo.</p><button id="rigCorrectiveStart" style="width:100%">Corregir forma…</button>';
    const anchor=byId("rigSmartList")?.closest("section");
    if(anchor)anchor.before(section);else panel.append(section);
    byId("rigCorrectiveStart").onclick=start;
    LOW.rigging.limbCorrectiveUI={start,cancel};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
