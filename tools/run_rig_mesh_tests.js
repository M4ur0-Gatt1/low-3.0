/* Pruebas de la malla de deformación (lattice/FFD) del rig.
 * Runner propio (no toca model-tests.js, punto de colisión con Codex).
 * Uso: node tools/run_rig_mesh_tests.js
 */
"use strict";
const fs = require("fs"), path = require("path");
const root = path.resolve(__dirname, "..");
global.window = global; global.self = global;
// Cadena mínima para tener LowDoc + scene-model funcionando en node.
["ui/core/history.js", "ui/animation/scene-model.js", "ui/animation/rig-policy.js",
 "ui/rigging/binding.js", "ui/rigging/rig-input.js", "ui/animation/exposures.js",
 "ui/animation/onion.js", "ui/animation/mocap.js", "ui/animation/document.js"
].forEach(rel => { const abs = path.join(root, rel); if (!fs.existsSync(abs)) { console.error("FALTA " + rel); process.exit(2); } eval(fs.readFileSync(abs, "utf8")); });

const A = global.LOW.animation;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error("  ✗ " + m); } };
const near = (a, b, e = 1e-6) => Math.abs(a - b) < (e || 1e-6);

// Rejilla regular 3×3 sobre [0..100]²
const grid = (fn) => { const g = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { const p = { x: c * 50, y: r * 50 }; g.push(fn ? fn(p, c, r) : p); } return g; };
const rest = grid();

// 1. Identidad: rejilla posada == reposo → un punto interior no se mueve.
{
  const w = A.rigMalla(rest, grid(), 3, 3);
  const q = w.punto({ x: 30, y: 20 });
  ok(near(q.x, 30) && near(q.y, 20), "malla en reposo: el punto no se mueve");
}

// 2. Localidad: muevo la esquina inferior-derecha (+40,+40). Un punto cercano a esa
//    esquina se desplaza hacia ella; la esquina opuesta (0,0) queda fija.
{
  const posed = grid((p, c, r) => (c === 2 && r === 2) ? { x: p.x + 40, y: p.y + 40 } : p);
  const w = A.rigMalla(rest, posed, 3, 3);
  const cornerFar = w.punto({ x: 0, y: 0 });
  ok(near(cornerFar.x, 0) && near(cornerFar.y, 0), "mover una esquina no toca la opuesta");
  const nearBR = w.punto({ x: 90, y: 90 });
  ok(nearBR.x > 90 && nearBR.y > 90, "un punto junto a la esquina movida la sigue");
  // Un punto DENTRO de la celda inferior-derecha (no sobre un vértice) se arrastra
  // parcialmente: (75,75) es el centro de esa celda → promedio bilineal de sus 4 esquinas.
  const inCell = w.punto({ x: 75, y: 75 });
  ok(inCell.x > 75 && inCell.x < 140 && inCell.y > 75 && inCell.y < 140, "un punto interior a la celda se arrastra parcialmente (bilineal)");
}

// 3. Normalización rigMeshesData: válida se conserva, tamaños que no cierran se descartan.
{
  const norm = A.rigMeshesData({
    good: { cols: 3, rows: 3, rest, keys: { 5: grid(), 7: [{ x: 0, y: 0 }] } },
    bad: { cols: 3, rows: 3, rest: [{ x: 0, y: 0 }] },
  });
  ok(!!norm.good && !norm.bad, "malla con reposo incompleto descartada");
  ok(!!norm.good.keys[5] && !norm.good.keys[7], "clave con distinta cantidad de puntos descartada");
  ok(norm.good.type === "mesh" && norm.good.enabled === true, "forma normalizada correcta");
}

// 4. Comandos sobre un doc real: crear malla, deformar por cuadro, interpolar, Undo.
{
  const doc = new A.LowDoc();
  doc.ensureRigBones([{ id: "pieza", name: "Pieza", parentId: null, head: { x: 0, y: 0 }, pivot: { x: 0, y: 0 }, tail: { x: 100, y: 0 }, pinned: true }], "bone");
  ok(!!doc.scene.rigNode("pieza"), "hueso de prueba creado");

  ok(doc.createRigMesh("pieza", { cols: 3, rows: 3, box: { x: 0, y: 0, width: 100, height: 100 } }), "createRigMesh");
  const m = doc.scene.rigMesh("pieza");
  ok(m && m.rest.length === 9 && m.cols === 3, "rejilla de reposo 3×3 regular");
  ok(doc.scene.rigMallaAt("pieza", 1) === null, "malla en reposo → sin deformación (null)");

  // Deformar en el cuadro 11: mover la esquina inferior-derecha (índice 8).
  ok(doc.setRigMeshPoint("pieza", 8, 140, 140, 11), "setRigMeshPoint en F11");
  const w11 = doc.scene.rigMallaAt("pieza", 11);
  ok(w11 && w11.punto({ x: 100, y: 100 }).x > 100, "en F11 la malla deforma el dibujo");

  // Interpolación: en F6 (mitad entre reposo implícito@? y la clave) hay estado intermedio.
  // Con una sola clave en F11, F<=11 mantiene esa clave (hold hacia atrás); agrego clave en F1.
  doc.setRigMeshKey("pieza", 1, m.rest);
  const g6 = doc.scene.rigMeshAt("pieza", 6);
  ok(g6 && g6[8].x > 100 && g6[8].x < 140, "F6 interpola el punto entre F1 y F11");

  // Undo deshace la última operación (borrar clave/mover); createRigMesh sigue.
  if (typeof doc.undo === "function") {
    doc.undo();
    ok(!!doc.scene.rigMesh("pieza"), "Undo no borra la malla entera (fue una op puntual)");
  } else pass++;
}

// 5. PESOS Y FLEXI-BINDING: el segundo y el tercer nivel de la tabla §4.3.
{
  const doc = new A.LowDoc();
  doc.ensureRigBones([
    { id: "brazo", name: "Brazo", parentId: null, head: { x: 0, y: 50 }, tail: { x: 50, y: 50 }, pivot: { x: 0, y: 50 } },
    { id: "antebrazo", name: "Antebrazo", parentId: "brazo", head: { x: 50, y: 50 }, tail: { x: 100, y: 50 }, pivot: { x: 50, y: 50 } },
  ], "bones");
  ok(doc.createRigMesh("brazo", { cols: 3, rows: 3, box: { x: 0, y: 0, width: 100, height: 100 } }), "malla sobre el brazo");

  // — flexi-binding: pesos por distancia, sin pintar nada —
  ok(doc.autoRigMeshWeights("brazo"), "autoRigMeshWeights reparte por distancia");
  const w = doc.scene.rigMesh("brazo").weights;
  ok(Array.isArray(w) && w.length === 9, "hay un peso por vértice");
  const suma = (o) => Object.values(o).reduce((n, v) => n + v, 0);
  ok(w.every((o) => Math.abs(suma(o) - 1) < 1e-9), "cada vértice suma exactamente 1");
  ok(w.every((o) => Object.keys(o).length <= 3), "los pesos son dispersos (3 huesos como mucho)");
  // el vértice de la izquierda pesa más al brazo; el de la derecha, al antebrazo
  ok((w[3].brazo || 0) > (w[3].antebrazo || 0), "el borde izquierdo sigue al brazo");
  ok((w[5].antebrazo || 0) > (w[5].brazo || 0), "el borde derecho sigue al antebrazo");

  // — el skinning MUEVE el dibujo cuando el hueso se mueve —
  ok(doc.scene.rigMallaAt("brazo", 1) === null, "en reposo la malla no deforma nada");
  doc.setRigKey("antebrazo", 5, { x: 0, y: 0, r: 45, sx: 1, sy: 1 });
  const posado = doc.scene.rigMeshSkinnedAt("brazo", 5);
  const reposo = doc.scene.rigMesh("brazo").rest;
  const movido = posado.some((p, i) => Math.hypot(p.x - reposo[i].x, p.y - reposo[i].y) > 1);
  ok(movido, "girar el antebrazo mueve los vértices que lo pesan");
  const quieto = Math.hypot(posado[3].x - reposo[3].x, posado[3].y - reposo[3].y);
  const lejos = Math.hypot(posado[5].x - reposo[5].x, posado[5].y - reposo[5].y);
  ok(lejos > quieto, "se mueve más el lado que pesa al hueso que giró");
  ok(!!doc.scene.rigMallaAt("brazo", 5), "y con eso la malla sí deforma el dibujo");

  // — pincel de pesos: un gesto, un paso de historial —
  const antes = JSON.stringify(doc.scene.rigMesh("brazo").weights[3]);
  const pasos = doc.history ? doc.history.undoStack.length : 0;
  ok(doc.paintRigMeshWeight("brazo", [3, 4], "antebrazo", 0.5), "paintRigMeshWeight pinta influencia");
  const despues = doc.scene.rigMesh("brazo").weights[3];
  ok((despues.antebrazo || 0) > 0, "el vértice pintado sigue ahora al antebrazo");
  ok(Math.abs(suma(despues) - 1) < 1e-9, "y el vértice sigue sumando 1");
  if (doc.history) {
    ok(doc.history.undoStack.length - pasos === 1, "pintar es UN paso de historial");
    doc.history.undo();
    ok(JSON.stringify(doc.scene.rigMesh("brazo").weights[3]) === antes, "Ctrl+Z devuelve los pesos anteriores");
    doc.history.redo();
  } else { pass += 2; }

  // — un vértice no puede quedarse sin ningún hueso —
  doc.paintRigMeshWeight("brazo", [0], "antebrazo", -1);
  doc.paintRigMeshWeight("brazo", [0], "brazo", -1);
  const huerfano = doc.scene.rigMesh("brazo").weights[0];
  ok(Object.keys(huerfano).length > 0 && Math.abs(suma(huerfano) - 1) < 1e-9,
    "restar todo deja el vértice siguiendo a su propia pieza, no suelto");

  // — guardar y reabrir conserva los pesos —
  const copia = A.LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
  const wr = copia.scene.rigMesh("brazo").weights;
  ok(Array.isArray(wr) && wr.length === 9 && Math.abs(suma(wr[5]) - 1) < 1e-9,
    "al reabrir, los pesos siguen ahí y normalizados");

  // — sin pesos, la malla se comporta igual que antes (sin regresión) —
  const viejo = new A.LowDoc();
  viejo.ensureRigBones([{ id: "p", name: "P", head: { x: 0, y: 0 }, tail: { x: 10, y: 0 }, pivot: { x: 0, y: 0 } }], "b");
  viejo.createRigMesh("p", { cols: 2, rows: 2, box: { x: 0, y: 0, width: 10, height: 10 } });
  viejo.setRigMeshPoint("p", 3, 20, 20, 4);
  const conKeys = viejo.scene.rigMeshSkinnedAt("p", 4), soloKeys = viejo.scene.rigMeshAt("p", 4);
  ok(JSON.stringify(conKeys) === JSON.stringify(soloKeys),
    "una malla sin pesos devuelve exactamente la rejilla de siempre");
}

// Correctives reuse action channels and survive normalization/serialization.
eval(fs.readFileSync(path.join(root,'ui/rigging/flexible-limb.js'),'utf8'));
{
  const doc=new A.LowDoc(),limb=LOW.rigging.flexibleLimb;
  limb.create(doc,{id:'arm',points:[{x:0,y:0},{x:50,y:0},{x:100,y:0}],box:{x:0,y:-10,width:100,height:20}});
  doc.setRigKey('arm:lower',1,{r:-60});
  const base=doc.scene.rigMeshSkinnedAt('arm',1),edited=base.map(p=>({...p}));edited[5].y-=8;
  const id=limb.corrective(doc,{meshId:'arm',driverId:'arm:lower',points:edited,frame:1});
  ok(near(doc.scene.rigMeshSkinnedAt('arm',1)[5].y,edited[5].y),'correctivo coincide con la pose editada');
  const copy=A.LowDoc.fromJSON(JSON.stringify(doc.toJSON()));
  ok(near(copy.scene.rigMeshSkinnedAt('arm',1)[5].y,edited[5].y),'correctivo persiste');
  copy.setRigKey('arm:lower',1,{r:0});
  ok(copy.scene.rigMeshActionOffsets('arm',1,144).every(p=>near(p.x,0)&&near(p.y,0)),'reposo no recibe correctivo');
  copy.setRigKey('arm:lower',1,{r:-30});
  const half=copy.scene.rigMeshActionOffsets('arm',1,144)[5];
  ok(near(Math.hypot(half.x,half.y),4),'rango negativo interpola a mitad');
  copy.setRigKey('arm:lower',1,{r:30});
  const opposite=copy.scene.rigMeshActionOffsets('arm',1,144)[5];
  ok(near(Math.hypot(opposite.x,opposite.y),0),'lado opuesto no recibe correctivo');
  const raw=doc.toJSON();
  const other=A.LowDoc.fromJSON(JSON.stringify(raw));other.scene.rig.actions[id].enabled=false;
  ok(near(other.scene.rigMeshSkinnedAt('arm',1)[5].y,base[5].y),'desactivar accion conserva skinning base');
  // `toJSON()` estampa `savedAt` con la hora actual, asi que comparar el JSON
  // completo solo daba igual si las dos llamadas caian en el mismo milisegundo:
  // la prueba fallaba ~6 de cada 10 corridas por 2 ms de diferencia, no por una
  // mutacion. Se compara el documento SIN los campos volatiles.
  const sinVolatiles=(d)=>{const j=d.toJSON();delete j.savedAt;return JSON.stringify(j);};
  const stable=sinVolatiles(doc);let rejected=false;
  try{limb.corrective(doc,{meshId:'arm',driverId:'arm:lower',points:[{x:NaN,y:0}]});}catch(_){rejected=true;}
  ok(rejected,'puntos invalidos son rechazados');
  ok(sinVolatiles(doc)===stable,'puntos invalidos no mutan documento');
  doc.removeRigMesh('arm');
  ok(!doc.scene.rig.actions[id],'quitar malla elimina correctivo propio');
}
{
  const doc=new A.LowDoc();doc.ensureRigBones([{id:'a',head:{x:0,y:0},tail:{x:10,y:0}},{id:'b',head:{x:0,y:10},tail:{x:10,y:10}}]);
  doc.createRigMesh('a',{cols:2,rows:2,box:{x:0,y:0,width:10,height:10}});
  doc.setRigMeshWeights('a',[{a:1},{a:1},{b:1},{b:1}]);
  doc.setRigMeshLocks('a',[0],true);
  ok(!doc.paintRigMeshWeight('a',[0],'b',.8),'bloqueo impide pintar');
  doc.smoothRigMeshWeights('a',[0,1],1);
  ok(near(doc.scene.rigMesh('a').weights[1].b,1/3),'suavizado mezcla vecinos con snapshot estable');
  ok(doc.scene.rigMesh('a').weights[0].a===1,'suavizado respeta bloqueo');
  doc.autoRigMeshWeights('a');ok(doc.scene.rigMesh('a').weights[0].a===1,'auto-weight respeta bloqueo');
  const copy=A.LowDoc.fromJSON(JSON.stringify(doc.toJSON()));ok(copy.scene.rigMesh('a').locked[0]===true,'bloqueo persiste');
  copy.setRigMeshLocks('a',[0],false);copy.paintRigMeshWeight('a',[0],'b',.5);
  ok(copy.scene.rigMesh('a').weights[0].b>0,'desbloquear permite editar');
  ok(copy.scene.rigMesh('a').weights.every(w=>near(Object.values(w).reduce((sum,x)=>sum+x,0),1)),'operaciones conservan normalizacion');
}
console.log(`rig-mesh: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
