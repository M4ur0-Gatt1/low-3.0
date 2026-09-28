/* Smart Bones y acciones (biblia §4.3, «Acciones conducidas por ángulo»).
   Uso: node tools/run_smart_bones_tests.js */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = [
  "ui/core/history.js",
  "ui/animation/palette.js",
  "ui/animation/scene-model.js",
  "ui/animation/rig-policy.js",
  "ui/rigging/binding.js",
  "ui/rigging/rig-input.js",
  "ui/animation/exposures.js",
  "ui/animation/onion.js",
  "ui/animation/mocap.js",
  "ui/animation/document.js",
];
global.window = global; global.self = global;
for (const rel of files) eval(fs.readFileSync(path.join(root, rel), "utf8"));
const A = global.LOW.animation;

let pass = 0, fail = 0;
const ok = (cond, nombre, detalle) => {
  if (cond) { pass++; return; }
  fail++; console.error("FALLA:", nombre, detalle == null ? "" : JSON.stringify(detalle));
};

function armar() {
  const doc = new A.LowDoc();
  doc.ensureRigBones([
    { id: "brazo", name: "brazo", parentId: null, head: { x: 0, y: 0 }, tail: { x: 50, y: 0 }, pivot: { x: 0, y: 0 } },
    { id: "codo", name: "codo", parentId: "brazo", head: { x: 50, y: 0 }, tail: { x: 100, y: 0 }, pivot: { x: 50, y: 0 } },
  ], "bones");
  doc.setHistory(new global.LOW.core.HistoryManager());
  return doc;
}

// 1. Crear la acción y su conductor
{
  const doc = armar();
  ok(!doc.createRigAction("", { driverBone: "codo" }), "una acción sin nombre no se crea");
  ok(!doc.createRigAction("codo_flex", {}), "una acción sin conductor no se crea");
  ok(doc.createRigAction("codo_flex", { name: "Codo flexionado", driverBone: "codo", min: 0, max: 90 }),
    "createRigAction con conductor");
  const a = doc.scene.rig.actions.codo_flex;
  ok(a && a.driver.path === "bones/codo/pose/r", "el conductor es el ángulo del codo", a && a.driver);
  ok(a.driver.min === 0 && a.driver.max === 90, "y guarda su rango");
  ok(!doc.createRigAction("codo_flex", { driverBone: "codo" }), "no se duplica una acción existente");
  ok(!doc.setRigActionDriver("codo_flex", { min: 30, max: 30 }), "un rango de cero grados no se acepta");
  ok(doc.setRigActionDriver("codo_flex", { min: -10, max: 100 }), "el rango se puede corregir");
  ok(doc.scene.rig.actions.codo_flex.driver.max === 100, "y queda guardado");
}

// 2. La acción aporta DIFERENCIAS, dosificadas por el ángulo del conductor
{
  const doc = armar();
  doc.createRigAction("codo_flex", { driverBone: "codo", min: 0, max: 90, length: 2 });
  // en reposo el brazo no se mueve; a 90° se corre 20 en Y
  doc.setRigActionKey("codo_flex", "bones/brazo/pose/y", 1, 0);
  doc.setRigActionKey("codo_flex", "bones/brazo/pose/y", 2, 20);

  doc.setRigChannelKey("bones/codo/pose/r", 1, 0);
  doc.setRigChannelKey("bones/codo/pose/r", 10, 90);

  const y = (f) => doc.scene.rigPose("brazo", f).y;
  ok(Math.abs(y(1) - 0) < 1e-6, "con el codo en 0° la acción no aporta nada", y(1));
  ok(Math.abs(y(10) - 20) < 1e-6, "con el codo en 90° aporta el total", y(10));
  const medio = y(5.5);
  ok(medio > 4 && medio < 16, "y a mitad de camino aporta la mitad", medio);
  ok(Math.abs(doc.scene.rigPoseBase("brazo", 10).y) < 1e-6,
    "la pose BASE no cambia: la acción se suma aparte", doc.scene.rigPoseBase("brazo", 10).y);
}

// 3. El ángulo fuera del rango no dispara de más
{
  const doc = armar();
  doc.createRigAction("a", { driverBone: "codo", min: 0, max: 45, length: 2 });
  doc.setRigActionKey("a", "bones/brazo/pose/r", 1, 0);
  doc.setRigActionKey("a", "bones/brazo/pose/r", 2, 30);
  doc.setRigChannelKey("bones/codo/pose/r", 1, -50);   // muy por debajo del mínimo
  doc.setRigChannelKey("bones/codo/pose/r", 8, 200);   // muy por encima del máximo
  ok(Math.abs(doc.scene.rigPose("brazo", 1).r - 0) < 1e-6, "por debajo del rango no aporta");
  ok(Math.abs(doc.scene.rigPose("brazo", 8).r - 30) < 1e-6, "por encima del rango aporta el tope, no más");
}

// 4. Varias acciones se suman sin pelearse
{
  const doc = armar();
  doc.createRigAction("uno", { driverBone: "codo", min: 0, max: 90, length: 2 });
  doc.createRigAction("dos", { driverBone: "brazo", min: 0, max: 90, length: 2 });
  doc.setRigActionKey("uno", "bones/brazo/pose/x", 1, 0);
  doc.setRigActionKey("uno", "bones/brazo/pose/x", 2, 10);
  doc.setRigActionKey("dos", "bones/brazo/pose/x", 1, 0);
  doc.setRigActionKey("dos", "bones/brazo/pose/x", 2, 5);
  doc.setRigChannelKey("bones/codo/pose/r", 1, 90);
  doc.setRigChannelKey("bones/brazo/pose/r", 1, 90);
  ok(Math.abs(doc.scene.rigPose("brazo", 1).x - 15) < 1e-6,
    "dos acciones activas suman sus aportes", doc.scene.rigPose("brazo", 1).x);
  doc.scene.rig.actions.dos.enabled = false;
  ok(Math.abs(doc.scene.rigPose("brazo", 1).x - 10) < 1e-6, "apagar una acción la saca de la cuenta");
}

// 5. Grabar la acción desde la pose actual
{
  const doc = armar();
  doc.createRigAction("flex", { driverBone: "codo", min: 0, max: 90, length: 2 });
  doc.setRigKey("brazo", 1, { x: 0, y: 0, r: 0, sx: 1, sy: 1 });
  doc.setRigKey("brazo", 3, { x: 12, y: 0, r: 0, sx: 1, sy: 1 });
  doc.goTo(3);
  ok(doc.recordRigAction("flex", ["brazo"], "max"), "recordRigAction graba la pose actual");
  const canal = doc.scene.rig.actions.flex.channels["bones/brazo/pose/x"];
  ok(canal && canal.keys[1] === 0 && Math.abs(canal.keys[2] - 12) < 1e-6,
    "guarda el extremo grabado y el reposo del otro extremo", canal && canal.keys);
  doc.setRigChannelKey("bones/codo/pose/r", 1, 90);
  ok(Math.abs(doc.scene.rigPose("brazo", 1).x - 12) < 1e-6,
    "y con el codo a 90° el aporte grabado se aplica", doc.scene.rigPose("brazo", 1).x);
}

// 6. Historial, guardado y reapertura
{
  const doc = armar();
  const pasos = doc.history.undoStack.length;
  doc.createRigAction("x", { driverBone: "codo", min: 0, max: 90 });
  ok(doc.history.undoStack.length - pasos === 1, "crear una acción es un paso de historial");
  doc.history.undo();
  ok(!doc.scene.rig.actions.x, "Ctrl+Z la quita");
  doc.history.redo();
  ok(!!doc.scene.rig.actions.x, "y rehacer la devuelve");

  doc.setRigActionKey("x", "bones/brazo/pose/r", 2, 40);
  const copia = A.LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
  const a = copia.scene.rig.actions.x;
  ok(a && a.driver.path === "bones/codo/pose/r" && a.channels["bones/brazo/pose/r"].keys[2] === 40,
    "al reabrir vuelven la acción, su conductor y sus claves", a && a.channels);

  ok(doc.removeRigAction("x"), "quitar la acción");
  ok(!doc.scene.rig.actions.x, "y deja de estar");
  ok(!doc.removeRigAction("x"), "quitar dos veces no inventa cambios");
}

// 7. Un rig sin acciones se comporta exactamente igual que antes
{
  const doc = armar();
  doc.setRigKey("brazo", 4, { x: 7, y: 3, r: 15, sx: 1, sy: 1 });
  const base = JSON.stringify(doc.scene.rigPoseBase("brazo", 4));
  ok(JSON.stringify(doc.scene.rigPose("brazo", 4)) === base,
    "sin acciones, rigPose devuelve exactamente la pose base");
}

// 8. CONTROLES: los diales de cara y manos (§4.3, último nivel)
{
  const doc = armar();
  ok(!doc.createRigControl("", {}), "un control sin nombre no se crea");
  ok(!doc.createRigControl("nulo", { min: 1, max: 1 }), "un dial sin recorrido no se crea");
  ok(doc.createRigControl("boca_abierta", { name: "boca abierta", min: 0, max: 1 }),
    "createRigControl con recorrido");
  ok(!doc.createRigControl("boca_abierta", {}), "no se duplica un control existente");
  const c = doc.scene.rigControl("boca_abierta");
  ok(c && c.name === "boca abierta" && c.min === 0 && c.max === 1, "guarda nombre y recorrido", c);

  // sin claves vale su reposo: un dial recien creado no mueve nada
  ok(doc.scene.rigControlValue("boca_abierta", 1) === 0, "sin claves vale su reposo");

  // se anima por cuadro, como cualquier canal
  ok(doc.setRigControlValue("boca_abierta", 1, 0), "clave en el cuadro 1");
  ok(doc.setRigControlValue("boca_abierta", 10, 1), "clave en el cuadro 10");
  const medio = doc.scene.rigControlValue("boca_abierta", 5.5);
  ok(medio > 0.4 && medio < 0.6, "y se interpola entre claves", medio);
  ok(doc.scene.rigControlValue("boca_abierta", 99) === 1, "fuera de rango sostiene el ultimo valor");
  ok(doc.setRigControlValue("boca_abierta", 12, 5) && doc.scene.rigControlValue("boca_abierta", 12) === 1,
    "un valor fuera del recorrido se acota, no rompe el dial");

  // aparece como canal: el Function Editor lo ve sin codigo nuevo
  ok(!!doc.scene.rigChannel("controls/boca_abierta"),
    "el dial es un canal, asi que entra al editor de curvas");

  // conduce una accion, igual que el angulo de un hueso
  ok(doc.createRigAction("abrir", { driverControl: "boca_abierta", min: 0, max: 1, length: 2 }),
    "una accion puede tomar el dial de conductor");
  ok(doc.scene.rig.actions.abrir.driver.path === "controls/boca_abierta",
    "y el conductor apunta al canal del dial", doc.scene.rig.actions.abrir.driver);
  doc.setRigActionKey("abrir", "bones/brazo/pose/y", 1, 0);
  doc.setRigActionKey("abrir", "bones/brazo/pose/y", 2, 30);
  ok(Math.abs(doc.scene.rigPose("brazo", 1).y - 0) < 1e-6, "con el dial en 0 no aporta");
  ok(Math.abs(doc.scene.rigPose("brazo", 10).y - 30) < 1e-6, "con el dial en 1 aporta el total",
    doc.scene.rigPose("brazo", 10).y);

  // recorrido corregible y persistencia
  ok(doc.setRigControlRange("boca_abierta", 0, 2), "el recorrido se puede corregir");
  ok(doc.scene.rigControl("boca_abierta").max === 2, "y queda guardado");
  const copia = A.LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
  ok(!!copia.scene.rigControl("boca_abierta") && copia.scene.rigControlValue("boca_abierta", 10) === 1,
    "al reabrir vuelven el dial y sus claves");

  // quitarlo se lleva su canal y deja sin conductor a lo que conducia
  ok(doc.removeRigControl("boca_abierta"), "quitar el control");
  ok(!doc.scene.rigChannel("controls/boca_abierta"), "y se lleva su canal");
  ok(doc.scene.rig.actions.abrir.driver === null,
    "la accion que conducia queda sin conductor, no aportando a ciegas");
  ok(Math.abs(doc.scene.rigPose("brazo", 10).y) < 1e-6, "y deja de aportar");
}

// Broken references and dependency loops must be visible to the setup flow.
{
  const doc = armar();
  doc.createRigAction('a', {driverBone:'brazo'});
  doc.setRigActionKey('a', 'bones/codo/pose/r', 2, 30);
  ok(doc.scene.validateRig().valid, 'valid action references accepted');
  doc.createRigAction('b', {driverBone:'codo'});
  doc.setRigActionKey('b', 'bones/brazo/pose/r', 2, 20);
  ok(doc.scene.validateRig().warnings.some(x=>x.code==='action-cycle'), 'cross-action loop diagnosed');
  doc.scene.rig.actions.b.enabled=false;
  ok(!doc.scene.validateRig().warnings.some(x=>x.code==='action-cycle'), 'disabled action breaks loop');
  doc.scene.rig.actions.a.driver.path='controls/missing';
  ok(doc.scene.validateRig().errors.some(x=>x.code==='missing-action-driver'), 'missing driver diagnosed');
  doc.scene.rig.actions.a.channels['bones/missing/pose/x']={keys:{1:0,2:3}};
  ok(doc.scene.validateRig().errors.some(x=>x.code==='missing-action-target'), 'missing target diagnosed');
  doc.scene.rig.actions.a.driver.path='bones/%invalid/pose/r';
  ok(!doc.scene.validateRig().valid, 'malformed reference diagnosed without throwing');
}

console.log(`smart-bones: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
