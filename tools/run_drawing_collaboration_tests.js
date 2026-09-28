const fs = require("fs");
const path = require("path");
global.window = global;

for (const file of ["ui/drawing/stabilization.js", "ui/drawing/brush-engine-pro.js", "ui/collaboration/session.js"]) {
  eval(fs.readFileSync(path.resolve(__dirname, "..", file), "utf8"));
}

const failures = [];
const check = (name, condition) => { if (!condition) failures.push(name); };
const engine = LOW.drawing.brushEngine;
const points = [
  { x: 0, y: 0, pressure: .2, tiltX: 0, tiltY: 0, time: 0 },
  { x: 10, y: 0, pressure: .8, tiltX: 45, tiltY: 0, time: 10 },
  { x: 20, y: 5, pressure: 1, tiltX: 20, tiltY: 0, time: 20 }
];
const vector = engine.buildVectorOutline(points, { size: 10, pressureSize: 1 });
check("outline vectorial cerrado", vector.path.endsWith("Z") && vector.samples.length >= 3);
const a = engine.buildRasterDabs(points, { size: 12, engine: "raster", scatter: .5, seed: 9 });
const b = engine.buildRasterDabs(points, { size: 12, engine: "raster", scatter: .5, seed: 9 });
check("raster determinista", JSON.stringify(a) === JSON.stringify(b));
check("dinámica de presión", engine.dynamics(points[0], engine.normalizeBrush({ size: 10, pressureSize: 1 })).width < engine.dynamics(points[2], engine.normalizeBrush({ size: 10, pressureSize: 1 })).width);

let now = 1000; const applied = [];
const session = new LOW.collaboration.CollaborationSession({ projectId: "p", actorId: "a", apply: op => applied.push(op), now: () => now });
session.setOnline(false); const op = session.submit("drawing.replace", "d:1", { content: "x" });
check("edición offline se aplica", applied.length === 1 && session.drain().length === 0);
session.setOnline(true); check("reconexión drena cola", session.drain()[0].id === op.id);
session.receive(op); check("operación idempotente", applied.length === 1);
check("lock propio", session.acquireLock("d:1"));
const viewer = new LOW.collaboration.CollaborationSession({ projectId: "p", actorId: "v", role: "viewer" });
let denied = false; try { viewer.submit("drawing.replace", "d:1", {}); } catch (_) { denied = true; }
check("viewer sin edición", denied);
const sorted = [
  { id: "b:1", actorId: "b", lamport: 2 }, { id: "a:2", actorId: "a", lamport: 2 }, { id: "a:1", actorId: "a", lamport: 1 }
].sort(LOW.collaboration.compareOperations).map(item => item.id).join(",");
check("orden Lamport estable", sorted === "a:1,a:2,b:1");

console.log(`TOTAL 8 OK ${8 - failures.length} FALLAN ${failures.length}`);
if (failures.length) { failures.forEach(name => console.error("FALLO: " + name)); process.exit(1); }
