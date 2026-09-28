/* Three points on the selected drawing create a deformable two-bone limb. */
(function () {
  "use strict";
  let gesture=null;
  let created=null;
  const $id=id=>document.getElementById(id);
  function message(text) { $id("rigLimbHint").textContent=text; dzSetStatus(text); }
  function cancel() {
    if(!gesture)return;
    gesture.canvas.removeEventListener("pointerdown",pick,true);
    gesture.canvas.removeEventListener("pointermove",preview,true);
    document.removeEventListener("keydown",escape,true);
    gesture.overlay.remove(); gesture=null;
    $id("rigLimbCancel").hidden=true;
  }
  function escape(e) { if(e.key==="Escape") { e.preventDefault(); e.stopImmediatePropagation(); cancel(); message("Articulación cancelada; el dibujo se conserva"); } }
  function preview(e) {
    const g=gesture;if(!g)return;
    if(DZ.doc!==g.doc || DZ.doc.frame!==g.frame || !g.el.isConnected) {
      cancel();message("Cambió el dibujo; volvé a elegir la pieza");return;
    }
    const matrix=g.el.ownerSVGElement.getScreenCTM();
    const points=g.points.map(p=>new DOMPoint(p.x,p.y).matrixTransform(matrix));
    points.push({x:e.clientX,y:e.clientY});
    g.line.setAttribute("points",points.map(p=>`${p.x},${p.y}`).join(" "));
    // The cutting plane extends across the drawing; show its actual direction.
    if(g.kind==="cut" && points.length===2) {
      const [a,b]=points,dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
      if(length>1){const reach=Math.hypot(innerWidth,innerHeight);g.line.setAttribute("points",`${a.x-dx/length*reach},${a.y-dy/length*reach} ${a.x+dx/length*reach},${a.y+dy/length*reach}`);}
    }
    g.cursor.setAttribute("cx",e.clientX);g.cursor.setAttribute("cy",e.clientY);
  }
  /* RECHAZAR NO ALCANZA. Si «Cortar pieza» no puede arrancar y avisa, uno
     igual arrastra sobre el personaje esperando cortarlo — y como la
     herramienta de dibujo sigue activa, lo que pasa es que DIBUJA una línea
     encima. Reportado: «la herramienta para cortar piezas dibuja líneas».
     Dejar la flecha activa hace que ese mismo gesto ELIJA la pieza, que es
     justo lo que el mensaje está pidiendo. */
  function rechazar(texto) {
    if(typeof dzSetTool==="function" && typeof DZ!=="undefined" && DZ.tool!=="select"){
      try{ dzSetTool("select"); }catch(_){ /* avisar importa más que el modo */ }
    }
    return message(texto);
  }

  function start(kind) {
    cancel();
    const el=DZ.sel;
    if(!DZ.doc || !el || !el.closest("#dzCanvas"))return rechazar("Elegí primero el dibujo del brazo o la pierna — tocalo en la mesa");
    if(el.matches("image") || el.querySelector("image,use,text"))return rechazar("Esta herramienta necesita trazos vectoriales; la imagen todavía no admite esta malla");
    if(!el.matches("path,rect,circle,ellipse,line,polyline,polygon,g"))return rechazar("Elegí una forma o un grupo vectorial");
    if([el,...el.querySelectorAll("*")].some(n=>n.hasAttribute("clip-path")||n.hasAttribute("mask")))
      return rechazar("La pieza usa una máscara o recorte; elegí sus trazos sin máscara para articularlos");
    if(el.id && Object.values(DZ.doc.scene.rig.nodes).some(n=>n.id===el.id || n.elementId===el.id))
      return rechazar("La pieza ya está vinculada; elegí un dibujo sin rig");
    const canvas=$id("dzCanvas"), overlay=document.createElement("div");
    overlay.className="rig-limb-guide"; overlay.style.cssText="position:fixed;inset:0;pointer-events:none;z-index:10000";
    const previewSvg=document.createElementNS("http://www.w3.org/2000/svg","svg");
    previewSvg.style.cssText="position:absolute;width:100%;height:100%;overflow:hidden";
    previewSvg.setAttribute("aria-hidden","true");
    const line=document.createElementNS(previewSvg.namespaceURI,"polyline");
    line.setAttribute("fill","none");line.setAttribute("stroke","#F0450E");line.setAttribute("stroke-width","3");line.setAttribute("stroke-dasharray","7 5");
    line.style.filter="drop-shadow(0 1px 1px white)";
    const cursor=document.createElementNS(previewSvg.namespaceURI,"circle");
    cursor.setAttribute("r","6");cursor.setAttribute("fill","#F0450E");cursor.setAttribute("stroke","white");cursor.setAttribute("stroke-width","2");
    cursor.setAttribute("cx","-20");cursor.setAttribute("cy","-20");
    previewSvg.append(line,cursor);overlay.append(previewSvg);
    document.body.appendChild(overlay);
    gesture={el,kind,canvas,overlay,line,cursor,points:[],doc:DZ.doc,frame:DZ.doc.frame};
    canvas.addEventListener("pointerdown",pick,true); document.addEventListener("keydown",escape,true);
    canvas.addEventListener("pointermove",preview,true);
    $id("rigLimbCancel").hidden=false;
    message(kind==="cut"?"1/2 · Marcá un lado de la línea de corte · Esc cancela":kind==="leg"?"1/3 · Marcá la cadera · Esc cancela":"1/3 · Marcá el hombro · Esc cancela");
  }
  function poseCreated() {
    if(!created || DZ.doc!==created.doc || !DZ.doc.scene.rigNode(created.lower)) {
      $id("rigLimbPose").hidden=true;
      return message("La articulación ya no está en este documento; creá o seleccioná otra desde Rigging");
    }
    cancel();
    if(!DZ.rigMode)dzRigToggle();
    dzRigSetMode("fk");dzRigSetTool("pose");dzRigSelectNode(created.lower);
    dzRigPanelSync();dzRigOverlayRender();
    dzSetStatus("Arrastrá la manija del codo o la rodilla para doblar la pieza · el gesto anima el cuadro actual");
  }
  function pick(e) {
    if(e.button!==0)return;
    e.preventDefault(); e.stopImmediatePropagation();
    const g=gesture;
    if(DZ.doc!==g.doc || DZ.doc.frame!==g.frame || !g.el.isConnected) { cancel(); return message("Cambió el dibujo; volvé a elegir la pieza"); }
    const svg=g.el.ownerSVGElement, p=dzPointInElement(svg,e.clientX,e.clientY);
    if(g.points.length && Math.hypot(p.x-g.points.at(-1).x,p.y-g.points.at(-1).y)<4)return message("Separá un poco más los puntos");
    g.points.push({x:p.x,y:p.y});
    const marker=document.createElement("b"); marker.textContent=String(g.points.length);
    marker.style.cssText=`position:absolute;left:${e.clientX-11}px;top:${e.clientY-11}px;background:#F0450E;color:white;border:2px solid white;border-radius:50%;width:22px;height:22px;text-align:center;line-height:18px`;
    g.overlay.appendChild(marker);
    preview(e);
    if(g.kind==="cut") {
      if(g.points.length<2)return message("2/2 · Marcá el otro lado; el corte atraviesa la pieza");
      cancel();try{cut(g.el,g.points);}catch(error){message(error.message);}return;
    }
    if(g.points.length<3)return message(g.points.length===1 ? (g.kind==="leg"?"2/3 · Marcá la rodilla":"2/3 · Marcá el codo") : (g.kind==="leg"?"3/3 · Marcá el tobillo":"3/3 · Marcá la muñeca"));
    cancel();
    try { build(g.el,g.points,g.kind); } catch(error) { message(error.message); }
  }
  function cut(el,points) {
    const svg=el.ownerSVGElement, source=[el,...el.querySelectorAll("*")];
    const copies=[el.cloneNode(true),el.cloneNode(true)], nodes=copies.map(c=>[c,...c.querySelectorAll("*")]);
    const counts=[0,0];
    source.forEach((node,i)=>{
      if(!node.matches("path,rect,circle,ellipse,line,polyline,polygon"))return;
      const d=node.matches("path")?node.getAttribute("d"):dzFormaAPath(node);if(!d)return;
      const matrix=node.getScreenCTM().inverse().multiply(svg.getScreenCTM());
      const [a,b]=points.map(p=>({x:matrix.a*p.x+matrix.c*p.y+matrix.e,y:matrix.b*p.x+matrix.d*p.y+matrix.f}));
      const halves=LOW.rigging.flexibleLimb.split(dzPathAPuntos(d,svg),a,b);
      halves.forEach((segments,half)=>{
        const old=nodes[half][i];
        const path=document.createElementNS(svg.namespaceURI,"path");
        for(const attr of old.attributes)path.setAttribute(attr.name,attr.value);
        path.setAttribute("d",dzPuntosAPath(segments));old.replaceWith(path);
        if(old===copies[half])copies[half]=path;
        if(segments.length)counts[half]++;
      });
    });
    if(counts.some(n=>!n))throw Error("La línea debe atravesar el dibujo para separarlo en dos piezas");
    const suffix="-cut-"+crypto.randomUUID();
    const renamed=new Map();
    [copies[1],...copies[1].querySelectorAll("[id]")].forEach(n=>{if(n.id){renamed.set(n.id,n.id+suffix);n.id+=suffix;}});
    [copies[1],...copies[1].querySelectorAll("*")].forEach(n=>{for(const attr of [...n.attributes]){
      let value=attr.value;for(const [a,b]of renamed){value=value.split("url(#"+a+")").join("url(#"+b+")");if((attr.name==="href"||attr.name==="xlink:href")&&value==="#"+a)value="#"+b;}
      if(value!==attr.value)n.setAttribute(attr.name,value);
    }});
    copies[0].id ||= "piece-"+crypto.randomUUID();copies[1].id ||= "piece-"+crypto.randomUUID();
    const doc=DZ.doc;if(doc.history.transaction)throw Error("Terminá el gesto actual primero");
    doc.history.begin("Cortar pieza para rig");
    try{
      dzDocCommit();el.replaceWith(...copies);dzDocCommit();dzSelect(copies[0]);dzBuildLayers();dzMarkDirty();dzDocCommit();doc.history.commit();
    }catch(error){const entries=doc.history.transaction?.entries||[];doc.history.cancel();[...entries].reverse().forEach(e=>e.apply("undo",e.before));throw error;}
    message("Dibujo separado en dos piezas · elegí una y usá Crear codo o Crear rodilla · Ctrl+Z une el corte");
  }
  function build(el,points,kind) {
    const doc=DZ.doc, svg=el.ownerSVGElement;
    // Prepare a detached copy; preserve transforms and inherited SVG styling by
    // keeping its hierarchy. Map sampled geometry into scene coordinates.
    let copy=el.cloneNode(true);
    const source=[el,...el.querySelectorAll("*")], target=[copy,...copy.querySelectorAll("*")];
    const inv=svg.getScreenCTM().inverse(); let count=0;
    source.forEach((node,i)=>{
      if(!node.matches("path,rect,circle,ellipse,line,polyline,polygon"))return;
      const d=node.matches("path")?node.getAttribute("d"):dzFormaAPath(node);
      if(!d)return;
      const matrix=inv.multiply(node.getScreenCTM());
      const segments=dzPathAPuntos(d,svg);
      for(const segment of segments) segment.pts=segment.pts.map(p=>({x:matrix.a*p.x+matrix.c*p.y+matrix.e,y:matrix.b*p.x+matrix.d*p.y+matrix.f}));
      let path=target[i];
      if(!path.matches("path")) { path=document.createElementNS(svg.namespaceURI,"path"); for(const a of target[i].attributes)path.setAttribute(a.name,a.value); target[i].replaceWith(path); if(target[i]===copy)copy=path; }
      path.setAttribute("d",dzPuntosAPath(segments)); count++;
    });
    if(!count)throw Error("El dibujo no contiene trazos deformables");
    [copy,...copy.querySelectorAll("*")].forEach(n=>{n.removeAttribute("transform");n.style.removeProperty("transform");});
    const id=el.id || "limb-"+crypto.randomUUID(); copy.id=id;
    // Measure in scene coordinates, without inserting preview geometry in the drawing.
    const b=el.getBBox(), m=inv.multiply(el.getScreenCTM());
    const corners=[[b.x,b.y],[b.x+b.width,b.y],[b.x,b.y+b.height],[b.x+b.width,b.y+b.height]].map(([x,y])=>({x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}));
    const xs=corners.map(p=>p.x), ys=corners.map(p=>p.y);
    const box={x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};
    const options={id,points,box,kind,softness:Number($id("rigLimbSoft").value)/100};
    LOW.rigging.flexibleLimb.plan(options);
    if(doc.history?.transaction)throw Error("Terminá el gesto actual antes de crear la articulación");
    // A top-level selection avoids retaining a transformed parent after baking.
    const parentMatrix=inv.multiply(el.parentNode.getScreenCTM());
    if(Math.abs(parentMatrix.a-1)+Math.abs(parentMatrix.d-1)+Math.abs(parentMatrix.b)+Math.abs(parentMatrix.c)+Math.abs(parentMatrix.e)+Math.abs(parentMatrix.f)>1e-5)
      throw Error("Seleccioná el grupo completo desde Capas para articularlo");
    doc.history.begin("Crear articulación flexible");
    try {
      dzDocCommit();
      el.replaceWith(copy); dzDocCommit();
      const result=LOW.rigging.flexibleLimb.create(doc,options);
      if(!DZ.rigMode)dzRigToggle();
      dzRigSelectNode(result.lower); dzRigPanelSync(); dzRigOverlayRender(); dzMarkDirty();
      dzDocCommit(); doc.history.commit();
      created={doc,lower:result.lower};
      $id("rigLimbPose").hidden=false;
      message("Articulación creada · Pulsá Posar articulación para doblarla · Ctrl+Z deshace la creación");
      return result;
    } catch(error) {
      const entries=doc.history.transaction?.entries||[];
      doc.history.cancel(); [...entries].reverse().forEach(entry=>entry.apply("undo",entry.before));
      throw error;
    }
  }
  function init() {
    const anchor=document.querySelector(".rig2-library-card"); if(!anchor)return;
    const panel=document.createElement("section"); panel.className="rig2-section"; panel.dataset.rigSection="build";
    panel.innerHTML='<div class="rig2-title"><b>Cortar y articular</b></div><p class="rig2-hint" id="rigLimbHint">Separá una pieza vectorial con dos puntos de corte. Para doblarla, marcá inicio, codo o rodilla y extremo.</p><label class="rig2-mesh-ctl">Zona flexible<input id="rigLimbSoft" type="range" min="2" max="50" value="18" aria-label="Ancho de la zona flexible"></label><div class="rig2-lip-acciones"><button id="rigLimbCut">Cortar pieza</button><button id="rigLimbArm">Crear codo</button><button id="rigLimbLeg">Crear rodilla</button><button id="rigLimbCancel" hidden>Cancelar</button></div>';
    anchor.before(panel); $id("rigLimbArm").onclick=()=>start("arm"); $id("rigLimbLeg").onclick=()=>start("leg");
    const pose=document.createElement("button");pose.id="rigLimbPose";pose.textContent="Posar articulación";pose.hidden=true;
    pose.style.cssText="width:100%;margin-top:8px";pose.onclick=poseCreated;
    panel.append(pose);
    panel.querySelector(".rig2-lip-acciones").style.cssText="display:grid;grid-template-columns:1fr 1fr;gap:4px";
    $id("rigLimbCut").onclick=()=>start("cut");
    $id("rigLimbCancel").onclick=()=>{cancel();message("Articulación cancelada");};
    LOW.rigging.flexibleLimbUI={start,cancel,build,cut};
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init,{once:true}); else init();
})();
