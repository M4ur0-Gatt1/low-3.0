(function (global) {
  "use strict";
  const rigging = (global.LOW = global.LOW || {}).rigging ||= {};
  function plan({ id, points, box, kind = "arm", softness = .18 }) {
    if (!id || !Array.isArray(points) || points.length !== 3 ||
        !points.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
      throw Error("Marcá inicio, articulación y extremo");
    const [a, b, c] = points;
    const length = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);
    if (length(a, b) < 4 || length(b, c) < 4) throw Error("Separá los puntos al menos 4 unidades");
    if (!box || !(box.width > 0 && box.height > 0)) throw Error("El dibujo no tiene superficie");
    const upper = id + ":upper", lower = id + ":lower";
    const names = kind === "leg" ? ["Muslo", "Rodilla / pierna"] : ["Brazo", "Codo / antebrazo"];
    const bones = [
      { id, name: "Superficie flexible", pivot: { x: 0, y: 0 } },
      { id: upper, name: names[0], head: a, tail: b, pivot: a },
      { id: lower, name: names[1], parentId: upper, head: b, tail: c, pivot: b }
    ];
    const cols = 12, rows = 12, rest = [], weights = [];
    const distance = (p, x, y) => {
      const dx = y.x-x.x, dy = y.y-x.y;
      const t = Math.max(0, Math.min(1, ((p.x-x.x)*dx+(p.y-x.y)*dy)/(dx*dx+dy*dy)));
      return Math.hypot(p.x-x.x-t*dx, p.y-x.y-t*dy);
    };
    const radius = Math.max(1, Math.min(length(a,b), length(b,c))*Math.max(.02, Math.min(.5, softness)));
    for (let y=0; y<rows; y++) for (let x=0; x<cols; x++) {
      const p = { x:box.x+box.width*x/(cols-1), y:box.y+box.height*y/(rows-1) };
      const da=distance(p,a,b), db=distance(p,b,c);
      let t=Math.max(0,Math.min(1,.5+(da-db)/(2*radius)));
      t=t*t*(3-2*t);
      rest.push(p); weights.push({ [upper]:1-t, [lower]:t });
    }
    return { bones, upper, lower, mesh:{ id:"mesh:"+id, boneId:id, type:"mesh", enabled:true,
      cols, rows, rest, weights, keys:{} } };
  }
  function create(doc, options) {
    const data=plan(options), id=options.id;
    if (data.bones.some(b=>doc.scene.rigNode(b.id))) throw Error("Ese dibujo ya tiene un rig; elegí otra pieza");
    doc._rigChange("Crear articulación flexible", rig=>{
      for(const bone of data.bones) doc._ensureRigBoneRecord(rig,bone);
      doc._ensureRigArtLink(rig,{id,elementId:options.elementId||id,binding:{mode:"weightedMesh"}});
      rig.meshes ||= {}; rig.meshes[id]=data.mesh;
      return true;
    });
    return data;
  }
  /** Clip sampled contours against each half-plane of a user-drawn cut.
   * Open strokes remain open; filled contours are closed along the cut. */
  function split(segments,a,b) {
    if(Math.hypot(b.x-a.x,b.y-a.y)<4)throw Error("El corte necesita dos puntos separados");
    const side=p=>(b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x);
    const cross=(p,q)=>{const x=side(p),y=side(q),t=x/(x-y);return{x:p.x+(q.x-p.x)*t,y:p.y+(q.y-p.y)*t};};
    return [1,-1].map(sign=>{
      const out=[];
      for(const segment of segments){
        const pts=segment.pts;if(pts.length<2)continue;
        if(segment.cerrado){
          const clipped=[];
          for(let i=0;i<pts.length;i++){
            const p=pts[(i+pts.length-1)%pts.length],q=pts[i],pin=sign*side(p)>=0,qin=sign*side(q)>=0;
            if(pin!==qin)clipped.push(cross(p,q));if(qin)clipped.push(q);
          }
          if(clipped.length>=3)out.push({pts:clipped,cerrado:true});
        }else{
          let run=[];
          for(let i=1;i<pts.length;i++){
            const p=pts[i-1],q=pts[i],pin=sign*side(p)>=0,qin=sign*side(q)>=0;
            if(pin && !run.length)run.push(p);
            if(pin!==qin)run.push(cross(p,q));
            if(qin)run.push(q);else if(run.length){if(run.length>=2)out.push({pts:run,cerrado:false});run=[];}
          }
          if(run.length>=2)out.push({pts:run,cerrado:false});
        }
      }return out;
    });
  }
  function corrective(doc,{meshId,driverId,points,frame=doc.frame}) {
    if(doc.history?.transaction)throw Error("Terminá el gesto actual antes de guardar el correctivo");
    const scene=doc.scene,mesh=scene.rigMesh(meshId),driver=scene.rigNode(driverId);
    if(!mesh||!driver)throw Error("La pieza o el hueso ya no existen");
    if(!Array.isArray(points)||points.length!==mesh.rest.length||!points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)))throw Error("La corrección contiene puntos inválidos");
    const driverPath=LOW.animation.rigChannelPath(driverId,"r");
    const angle=scene.rigChannelValue(driverPath,frame,0);
    if(Math.abs(angle)<1)throw Error("Doblá primero la articulación al menos un grado");
    const base=scene.rigMeshSkinnedAt(meshId,frame),matrix=scene.rigWorldMatrix(driverId,frame);
    const det=matrix[0]*matrix[3]-matrix[1]*matrix[2];
    if(Math.abs(det)<1e-8)throw Error("La escala del hueso no permite guardar esta corrección");
    const channels={};
    points.forEach((p,i)=>{
      const dx=p.x-base[i].x,dy=p.y-base[i].y;
      const local={x:(matrix[3]*dx-matrix[2]*dy)/det,y:(matrix[0]*dy-matrix[1]*dx)/det};
      for(const axis of ["x","y"])if(Math.abs(local[axis])>1e-6){
        const path=`meshes/${encodeURIComponent(meshId)}/${i}/${axis}`;
        channels[path]={path,interpolation:"linear",valueType:"number",keys:{1:0,2:local[axis]},ease:{}};
      }
    });
    if(!Object.keys(channels).length)throw Error("Mové al menos un punto antes de guardar");
    const id="corrective:"+meshId+":"+crypto.randomUUID();
    doc._rigChange("Guardar corrección de articulación",rig=>{
      rig.actions ||= {};rig.actions[id]={id,name:"Corrección · "+driver.name,enabled:true,length:2,
        driver:{path:driverPath,min:0,max:angle},channels};return true;
    });
    return id;
  }
  rigging.flexibleLimb={plan,create,split,corrective};
})(typeof window!=="undefined"?window:globalThis);
