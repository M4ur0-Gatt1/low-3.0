function dzBrushWidthState(el) {
  if(dzFormaPincelEs(el))return {kind:'shape',size:+el.getAttribute('data-grosor')||6};
  if(el.hasAttribute('data-low-brush-points'))return {kind:'samples',size:+el.getAttribute('data-low-brush-size')||6};
  if(['raster-brush','imported-brush'].includes(el.getAttribute('data-low'))) {
    const marks=[...el.querySelectorAll('ellipse,circle')].filter(n=>!n.closest('defs'));
    if(marks.length)return {kind:'stamps',size:Math.max(...marks.map(n=>+(n.getAttribute('rx')||n.getAttribute('r'))*2)),marks:marks.map(n=>({n,r:+n.getAttribute('r'),rx:+n.getAttribute('rx'),ry:+n.getAttribute('ry')}))};
  }
  return null;
}
function dzBrushWidthApply(el,state,size) {
  if(state.kind==='shape'){el.setAttribute('data-grosor',size.toFixed(1));dzFormaPincelRender(el);return;}
  if(state.kind==='samples') {
    const points=JSON.parse(el.getAttribute('data-low-brush-points')),brush=JSON.parse(el.getAttribute('data-low-brush-config'));
    const rendered=dzBrushRenderElement(points,el.getAttribute('data-low-brush-color')||'#111',{brush,size,fixedWidth:el.getAttribute('data-low-brush-fixed')==='1'});
    if(!rendered)return;
    if(el.tagName.toLowerCase()==='path')el.setAttribute('d',rendered.getAttribute('d'));
    else {el.replaceChildren(...rendered.childNodes);const filter=rendered.getAttribute('filter');if(filter)el.setAttribute('filter',filter);else el.removeAttribute('filter');}
    el.setAttribute('data-low-brush-size',size.toFixed(1));return;
  }
  const factor=size/state.size;
  state.marks.forEach(({n,r,rx,ry})=>{if(n.tagName.toLowerCase()==='circle')n.setAttribute('r',r*factor);else{n.setAttribute('rx',rx*factor);n.setAttribute('ry',ry*factor);}});
}
