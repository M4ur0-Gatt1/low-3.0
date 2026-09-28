/* Ejecutor oficial de las pruebas del modelo 2D de LOW.
   Uso: node tools/run_2d_model_tests.js */
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const files = [
  "ui/core/history.js",
  "ui/core/pointer-controller.js",
  "ui/application/mode-machine.js",
  "ui/animation/palette.js",
  "ui/animation/coloring.js",
  "ui/animation/scene-model.js",
  "ui/animation/rig-policy.js",
  "ui/rigging/binding.js",
  "ui/rigging/rig-input.js",
  "ui/animation/exposures.js",
  "ui/animation/onion.js",
  "ui/animation/mocap.js",
  "ui/animation/document.js",
  "ui/animation/rig-library.js",
  "ui/animation/character-library.js",
  "ui/animation/playback.js",
  "ui/animation/timeline.js",
  "ui/animation/shortcuts.js",
  "ui/drawing/selection.js",
  "ui/drawing/transforms.js",
  "ui/workspace/panels.js",
  "ui/workspace/recovery.js",
  "ui/workspace/workspaces.js",
  "ui/animation/model-tests.js",
];

global.window = global;
global.self = global;

for (const rel of files) {
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) {
    console.error("FALTA: " + rel);
    process.exit(2);
  }
  eval(fs.readFileSync(abs, "utf8"));
}

const run = global.LOW?.animation?.runTests;
if (typeof run !== "function") {
  console.error("No se expuso LOW.animation.runTests");
  process.exit(4);
}

const result = run();
const fallan = (result.fallan || []).filter(Boolean);
console.log(`TOTAL ${result.total} OK ${result.ok} FALLAN ${fallan.length}`);
if (fallan.length) {
  fallan.forEach((failure) => console.error("FALLO: " + JSON.stringify(failure)));
  process.exit(1);
}
