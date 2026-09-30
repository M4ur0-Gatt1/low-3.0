/* LOW Interpretar: isolated timing proposals; commit only through canonical cells. */
(function(global) {
  "use strict";
  const A = global.LOW.animation;
  const MAX = 12000;
  const total = values => values.reduce((a,b) => a+b,0);
  function durations(values, count) {
    if (!Array.isArray(values) || values.length !== count || values.some(v => !Number.isInteger(v) || v < 1 || v > MAX) || total(values) > MAX)
      throw Error("El ritmo debe tener entre 1 y 12000 fotogramas, con al menos uno por pose.");
    return values.slice();
  }
  function fit(weights, target) {
    if (!weights.length || weights.some(v => !Number.isFinite(v) || v <= 0) || !Number.isInteger(target) || target < weights.length || target > MAX)
      throw Error("No hay fotogramas suficientes para conservar todas las poses.");
    const spare = target - weights.length, sum = total(weights);
    const shares = weights.map(w => spare*w/sum), result = shares.map(v => 1+Math.floor(v));
    const order = shares.map((v,i) => ({i, fraction:v-Math.floor(v)})).sort((a,b) => b.fraction-a.fraction || a.i-b.i);
    for(let n=target-total(result), i=0; i<n; i++) result[order[i].i]++;
    return result;
  }
  function signature(doc,layer) {
    const level=doc.scene.level(layer.levelId);
    return JSON.stringify({cells:layer.cells, level:level?.toJSON(), fps:doc.scene.fps});
  }
  function capture(doc) {
    const layer=doc.layer, level=doc.level;
    if(!layer || !level) throw Error("Abrí una capa de dibujos para interpretar su ritmo.");
    if(layer.locked) throw Error("La capa está bloqueada. Desbloqueala antes de interpretar.");
    const length=layer.lastFrame();
    if(!length) throw Error("Dibujá al menos dos poses en la capa para comparar su ritmo.");
    if(length>MAX) throw Error("Esta primera versión admite capas de hasta 12000 fotogramas.");
    const runs=[];
    for(let f=1;f<=length;f++) {
      const number=layer.cellAt(f), last=runs.at(-1);
      if(last && last.number===number) last.frames++;
      else { const d=level.byNumber(number); runs.push({number,frames:1,content:d?.content||"",name:d?.name||""}); }
    }
    if(runs.length>240) throw Error("Esta primera versión admite hasta 240 cambios de pose por capa.");
    if(runs.length<2) throw Error("Dibujá al menos dos poses en la capa para comparar su ritmo.");
    return {layerId:layer.id,layerName:layer.name,signature:signature(doc,layer),fps:doc.scene.fps,
      width:doc.scene.width,height:doc.scene.height,runs,original:runs.map(r=>r.frames),
      palette:A.palette?.css(doc.scene.levelPalette?.(level.id))||""};
  }
  function cellsFor(snapshot, values) {
    return durations(values,snapshot.runs.length).flatMap((n,i)=>Array(n).fill(snapshot.runs[i].number));
  }
  function at(values, frame) {
    let cursor=0;
    for(let i=0;i<values.length;i++){cursor+=values[i];if(frame<cursor)return i;}
    return values.length-1;
  }
  function apply(doc,snapshot,values) {
    const layer=doc.scene.layer(snapshot.layerId);
    if(!layer || layer.locked || signature(doc,layer)!==snapshot.signature)
      throw Error("La capa cambió durante el ensayo. Cerrá y volvé a abrir Interpretar para tomar su estado actual.");
    const cells=cellsFor(snapshot,values);
    // Preserve any trailing empty frames from the original layer.
    cells.push(...layer.cells.slice(total(snapshot.original)));
    if(JSON.stringify(cells)===JSON.stringify(layer.cells))return false;
    const before=doc._snapshot([layer.id],[]);
    layer.cells=cells;
    doc._histRange("Interpretar ritmo",before,doc._snapshot([layer.id],[]));
    doc.touch();doc.emit("cells");doc.emit("frame");
    return true;
  }
  A.rhythm={capture,fit,at,apply,cellsFor,total,durations};
})(window);
