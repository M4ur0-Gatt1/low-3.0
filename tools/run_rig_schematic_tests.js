/* Pruebas del layout del esquemático del rig (schematic básico).
 * Runner propio para no tocar model-tests.js (punto de colisión con Codex).
 * Uso: node tools/run_rig_schematic_tests.js
 */
"use strict";
const path = require("path");
const g = globalThis;
require(path.join(__dirname, "..", "ui", "rigging", "rig-schematic.js"));
const { schematicLayout, canReparent } = g.LOW.rigging;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.error("  ✗ " + msg); } };

// Esqueleto de prueba: raíz → 2 ramas, con nietos y un control.
const bones = [
  { id: "root", parentId: null, name: "Raíz", role: "bone" },
  { id: "spine", parentId: "root", name: "Columna", role: "bone" },
  { id: "head", parentId: "spine", name: "Cabeza", role: "bone" },
  { id: "arm_L", parentId: "spine", name: "Brazo izq.", role: "bone" },
  { id: "arm_R", parentId: "spine", name: "Brazo der.", role: "bone" },
  { id: "leg_L", parentId: "root", name: "Pierna izq.", role: "bone" },
  { id: "ctrl", parentId: "head", name: "Head Ctrl", role: "control" },
];
const L = schematicLayout(bones);
const at = id => L.nodes.find(n => n.id === id);

// 1. La raíz está en profundidad 0 y todo hijo cuelga una fila más abajo.
ok(at("root").depth === 0, "raíz en depth 0");
ok(at("spine").depth === 1 && at("head").depth === 2 && at("ctrl").depth === 3,
  "cada hijo baja una profundidad");

// 2. Las aristas corresponden exactamente a los parentId (sin la raíz).
ok(L.edges.length === bones.length - 1, "una arista por hueso no-raíz");
ok(L.edges.some(e => e.from === "spine" && e.to === "head"), "arista spine→head presente");

// 3. Un padre queda CENTRADO sobre sus hijos (col intermedia).
const sp = at("spine"), aL = at("arm_L"), aR = at("arm_R"), hd = at("head");
ok(sp.col >= Math.min(hd.col, aL.col, aR.col) && sp.col <= Math.max(hd.col, aL.col, aR.col),
  "spine centrado sobre sus hijos");

// 4. Las hojas ocupan columnas enteras únicas.
const leaves = ["ctrl", "arm_L", "arm_R", "leg_L"].map(at).map(n => n.col);
ok(leaves.every(c => Number.isInteger(c)) && new Set(leaves).size === leaves.length,
  "hojas en columnas enteras y distintas");

// 5. El rol se preserva y se normaliza.
ok(at("ctrl").role === "control" && at("root").role === "bone", "rol preservado");

// 6. Padre inexistente → el nodo se trata como raíz (no se pierde ni cuelga de nada).
const orphan = schematicLayout([{ id: "x", parentId: "ghost", name: "Huérfano" }]);
ok(orphan.nodes.length === 1 && orphan.nodes[0].depth === 0 && orphan.edges.length === 0,
  "hueso con padre inexistente cae como raíz");

// 7. Determinista: dos corridas dan el mismo layout.
ok(JSON.stringify(schematicLayout(bones)) === JSON.stringify(L), "layout determinista");

// 8. Ancho/alto derivados del contenido (positivos y coherentes).
ok(L.width > 0 && L.height > 0 && L.depthMax === 3, "dimensiones coherentes con la profundidad");

// ── canReparent (validez del arrastre-reparentado) ──
// 9. Colgar una hoja de otra rama es válido.
ok(canReparent(bones, "leg_L", "head") === true, "reparentar hoja a otra rama: válido");
// 10. No se puede colgar un nodo de sí mismo.
ok(canReparent(bones, "spine", "spine") === false, "auto-padre: rechazado");
// 11. No se puede colgar de un descendiente (crearía ciclo): spine bajo head (su nieto).
ok(canReparent(bones, "spine", "head") === false, "colgar de un descendiente: rechazado (ciclo)");
// 12. Colgar de quien ya es su padre no cambia nada.
ok(canReparent(bones, "head", "spine") === false, "reparentar al mismo padre: no-op");
// 13. Volver a raíz es válido si hoy tiene padre; una raíz ya no.
ok(canReparent(bones, "head", null) === true && canReparent(bones, "root", null) === false,
  "a raíz: válido con padre, inválido si ya es raíz");
// 14. Destino inexistente → inválido.
ok(canReparent(bones, "head", "ghost") === false, "destino inexistente: rechazado");

console.log(`rig-schematic: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
