/* Rig rendering for export uses the same canonical deformation evaluators
 * as the live viewport. Only the detached SVG is changed. */
function dzRigView(svgText, num) {
  const ids=Object.keys(dzRigTracks());if(!ids.length)return svgText;
  const tmp=document.createElement("div");tmp.innerHTML=svgText;
  const svg=tmp.querySelector("svg");if(!svg)return svgText;
  dzRigStrip(svg);
  for(const id of ids){
    const scene=DZ.doc?.scene,node=scene?.rigNode(id);
    const target=node?dzRigDibujoDe(node,num,svg):id;
    const el=svg.querySelector("#"+CSS.escape(target));if(!el)continue;
    if(node){
      const curve=scene.rigDeformadorAt?.(id,num);
      if(curve)dzDeformarElemento(el,curve,svg);
      const mesh=scene.rigMallaAt?.(id,num);
      if(mesh)dzDeformarElemento(el,mesh,svg);
      dzRigApplyMatrix(el,scene.rigWorldMatrix(id,num));
    }else dzRigApplyTo(el,dzRigAt(id,num));
  }
  return svg.outerHTML;
}
