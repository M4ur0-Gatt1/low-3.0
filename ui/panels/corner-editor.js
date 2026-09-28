function dzCornerInfo(el) {
  if (!el) return null;
  if (el.tagName.toLowerCase() === "rect") {
    const x=+el.getAttribute("x")||0,y=+el.getAttribute("y")||0,w=Math.max(1,+el.getAttribute("width")||0),h=Math.max(1,+el.getAttribute("height")||0);
    const r=Math.max(0,Math.min(w/2,h/2,+el.getAttribute("rx")||0)); return {x,y,w,h,r:[r,r,r,r]};
  }
  const geom=(el.getAttribute("data-low-rounded-rect")||"").split(/\s+/).map(Number);
  const radii=(el.getAttribute("data-low-corners")||"").split(/\s+/).map(Number);
  return geom.length===4&&radii.length===4 ? {x:geom[0],y:geom[1],w:geom[2],h:geom[3],r:radii} : null;
}
function dzRoundedRectD(i) {
  const [tl,tr,br,bl]=i.r.map(v=>Math.max(0,Math.min(i.w/2,i.h/2,v||0))), x=i.x,y=i.y,w=i.w,h=i.h;
  return `M ${x+tl} ${y} H ${x+w-tr} Q ${x+w} ${y} ${x+w} ${y+tr} V ${y+h-br} Q ${x+w} ${y+h} ${x+w-br} ${y+h} H ${x+bl} Q ${x} ${y+h} ${x} ${y+h-bl} V ${y+tl} Q ${x} ${y} ${x+tl} ${y} Z`;
}
function dzCornerAsPath(rect) {
  if (rect.tagName.toLowerCase() !== "rect") return rect;
  const info=dzCornerInfo(rect), path=document.createElementNS(SVGNS,"path");
  [...rect.attributes].forEach(a => { if (!/^(x|y|width|height|rx|ry)$/.test(a.name)) path.setAttribute(a.name,a.value); });
  path.setAttribute("data-low-rounded-rect",`${info.x} ${info.y} ${info.w} ${info.h}`);
  path.setAttribute("data-low-corners",info.r.join(" ")); path.setAttribute("d",dzRoundedRectD(info));
  rect.replaceWith(path); if (DZ.sel===rect) DZ.sel=path;
  const mi=(DZ.multi||[]).indexOf(rect); if(mi>=0) DZ.multi[mi]=path;
  path.classList.add("dz-sel"); return path;
}
function dzCornerSet(el, radius, corner, individual) {
  const info=dzCornerInfo(el); if(!info) return el;
  const r=Math.max(0,Math.min(info.w/2,info.h/2,Number(radius)||0));
  if (individual) info.r[{tl:0,tr:1,br:2,bl:3}[corner]||0]=r; else info.r=[r,r,r,r];
  if (el.tagName.toLowerCase()==="rect" && !individual) {
    if(r<.01){el.removeAttribute("rx");el.removeAttribute("ry");}else{el.setAttribute("rx",r.toFixed(1));el.setAttribute("ry",r.toFixed(1));}
  } else {
    el.setAttribute("data-low-corners",info.r.map(v=>v.toFixed(1)).join(" ")); if (window.dzFormaPincelEs?.(el)) dzFormaPincelGeometria(el,dzRoundedRectD(info)); else el.setAttribute("d",dzRoundedRectD(info));
  }
  dzPositionHandle(); dzBuildInspector(el);
  return el;
}
function dzCornerDown(e) {
  let el = DZ.sel;
  if (e.button !== 0 || !dzCornerInfo(el)) return;
  e.preventDefault(); e.stopPropagation();
  DZPointerController?.cancel('corner-start');
  el = DZ.sel;
  if (!el?.isConnected || !dzCornerInfo(el)) return;
  const original = el, saved = el.cloneNode(true), doc = DZ.doc, frame = DZ.doc?.frame;
  const before = dzDrawingEditBegin();
  clearTimeout(DZ_RECOVERY_TIMER);
  const individual=e.altKey, corner=e.currentTarget.dataset.corner;
  const pointerId = e.pointerId, info=dzCornerInfo(el), inv=el.getScreenCTM().inverse();
  const start = {x:e.clientX, y:e.clientY};
  let moved = false, token = null;
  const cleanup = () => {
    document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up);
    document.removeEventListener('pointercancel', cancelEvent);
  };
  const restore = () => {
    cleanup();
    if (!el.isConnected) return;
    if (el !== original) { el.replaceWith(original); if(DZ.sel===el) DZ.sel=original;
      DZ.multi=(DZ.multi||[]).map(item=>item===el?original:item); el=original; }
    [...el.attributes].forEach(a=>el.removeAttribute(a.name));
    [...saved.attributes].forEach(a=>el.setAttribute(a.name,a.value));
    el.innerHTML=saved.innerHTML;
    dzPositionHandle(); if(DZ.sel===el) dzBuildInspector(el);
    if(DZ.dirty) dzMarkDirty();
  };
  const local = ev => {
    const p = el.ownerSVGElement.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
    return p.matrixTransform(inv);
  };
  const move = ev => {
    if (ev.pointerId !== pointerId || !DZPointerController.accepts(token, pointerId)) return;
    if(DZ.doc!==doc || DZ.doc?.frame!==frame || !el.isConnected) { DZPointerController.cancel('document-change'); return; }
    if(!moved && Math.hypot(ev.clientX-start.x,ev.clientY-start.y)<2) return;
    if(!moved && individual) el=dzCornerAsPath(el);
    moved=true;
    const p=local(ev), d={tl:Math.min(p.x-info.x,p.y-info.y),tr:Math.min(info.x+info.w-p.x,p.y-info.y),br:Math.min(info.x+info.w-p.x,info.y+info.h-p.y),bl:Math.min(p.x-info.x,info.y+info.h-p.y)}[corner];
    el=dzCornerSet(el,d,corner,individual);
  };
  const up = ev => {
    if (ev.pointerId !== pointerId) return;
    if(DZ.doc!==doc || DZ.doc?.frame!==frame || !el.isConnected) { DZPointerController.cancel('document-change'); return; }
    if(!DZPointerController.finish(token,pointerId)) return;
    cleanup();
    if(moved) dzDrawingEditRecord(before, individual ? 'Editar esquina' : 'Editar esquinas');
    else if(DZ.dirty) dzMarkDirty();
  };
  const cancelEvent = ev => { if(ev.pointerId===pointerId) DZPointerController.cancel('pointercancel'); };
  token=DZPointerController.begin({owner:'vector:corners', pointerId, cancel:restore});
  document.addEventListener("pointermove", move); document.addEventListener("pointerup", up); document.addEventListener("pointercancel", cancelEvent);
}
async function dzCornerExact(e) {
  e.preventDefault(); e.stopPropagation();
  let el = DZ.sel; const info=dzCornerInfo(el); if (!info) return;
  const doc=DZ.doc, frame=DZ.doc?.frame;
  const corner=e.currentTarget.dataset.corner, individual=e.altKey;
  const value = await dzPromptModal(individual?"Radio de esta esquina":"Radio de las cuatro esquinas", "radio en píxeles", String(info.r[{tl:0,tr:1,br:2,bl:3}[corner]||0]));
  if (value == null || !String(value).trim() || !isFinite(+value)) return;
  if(!el.isConnected || DZ.sel!==el || DZ.doc!==doc || DZ.doc?.frame!==frame) return;
  const radius=Math.max(0,Math.min(info.w/2,info.h/2,+value)), index={tl:0,tr:1,br:2,bl:3}[corner]||0;
  if(individual ? info.r[index]===radius : info.r.every(r=>r===radius)) return;
  const before=dzDrawingEditBegin();
  if(individual) el=dzCornerAsPath(el); dzCornerSet(el,radius,corner,individual);
  dzDrawingEditRecord(before, individual ? 'Editar esquina' : 'Editar esquinas');
}
