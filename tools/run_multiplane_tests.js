const fs = require("fs");
const path = require("path");
global.window = global;
eval(fs.readFileSync(path.resolve(__dirname, "..", "ui/animation/scene-model.js"), "utf8"));
eval(fs.readFileSync(path.resolve(__dirname, "..", "ui/animation/timeline.js"), "utf8"));
eval(fs.readFileSync(path.resolve(__dirname, "..", "ui/composition/multiplane-model.js"), "utf8"));
eval(fs.readFileSync(path.resolve(__dirname, "..", "ui/composition/controller.js"), "utf8"));
const M = LOW.composition.multiplane, failures = [];
const check = (name, condition) => { if (!condition) failures.push(name); };
const snapped = M.snapTransform({ x: 14, y: 16, z: 47, rotationZ: 22, scale: 1.07 }, { spatial: 10, depth: 25, angle: 15, scale: .05 });
check("snap XYZ", snapped.x === 10 && snapped.y === 20 && snapped.z === 50);
check("snap rotación y escala", snapped.rotationZ === 15 && Math.abs(snapped.scaleX - 1.05) < 1e-9);
const near = M.projectPlane({ z: -200 }, { z: -1000 }), far = M.projectPlane({ z: 400 }, { z: -1000 });
check("plano cercano se proyecta mayor", near.perspectiveScale > far.perspectiveScale);
const nearMove = M.parallaxDelta({ z: -200 }, { x: 0, z: -1000 }, { x: 100, z: -1000 });
const farMove = M.parallaxDelta({ z: 400 }, { x: 0, z: -1000 }, { x: 100, z: -1000 });
check("parallax mayor cerca", Math.abs(nearMove.x) > Math.abs(farMove.x));
check("clasificación", M.classifyDepth(-200) === "foreground" && M.classifyDepth(0) === "action" && M.classifyDepth(400) === "background");
const operation = M.transformOperation("A", { z: 0 }, { z: 120 }, { baseRevision: 8 });
check("operación colaborativa", operation.type === "composition.plane.transform" && operation.payload.after.z === 120 && operation.meta.baseRevision === 8);
check("foco sin blur", M.projectPlane({ z: 0 }, { z: -1000, focusDistance: 1000, aperture: 2 }).blur === 0);
const scene = new LOW.animation.Scene();
scene.ensureCompositionPlane("hero", { elementId: "hero" });
scene.setCompositionTransform("hero", { z: 100 }, 1);
scene.setCompositionTransform("hero", { z: 300 }, 11);
check("interpolación de Z", scene.compositionTransformAt("hero", 6).z === 200);
const reopened = new LOW.animation.Scene(scene.toJSON());
check("persistencia canónica", reopened.compositionPlane("hero").source.elementId === "hero" && reopened.compositionTransformAt("hero", 11).z === 300);
check("timeline alcanza última clave de composición", LOW.animation.timeline.extent(reopened) === 11);
reopened.removeCompositionKey("hero", 11);
check("borrar clave", !reopened.compositionPlane("hero").keys[11]);
const sent = [], changed = [], fakeDoc = {
  frame: 7, scene: reopened,
  setCompositionTransform(id, value, options) { this.last = { id, value, options }; return this.scene.setCompositionTransform(id, value, options.frame); }
};
const controller = new LOW.composition.CompositionController({ doc: fakeDoc,
  collaboration: { submit: (...args) => sent.push(args) }, onChange: (...args) => changed.push(args) });
controller.begin({ planeId: "hero", frame: 7, autoKey: true });
controller.preview({ z: 147 }, { depth: 10 });
controller.commit();
check("controlador confirma una vez", fakeDoc.last.value.z === 150 && changed.length === 1);
check("controlador emite operación", sent.length === 1 && sent[0][0] === "composition.plane.transform");
controller.begin({ planeId: "hero" }); controller.preview({ z: 999 }, { enabled: false }); controller.cancel();
check("cancelar no cambia modelo", reopened.compositionTransformAt("hero").z !== 999);
console.log(`TOTAL 14 OK ${14 - failures.length} FALLAN ${failures.length}`);
if (failures.length) { failures.forEach(name => console.error("FALLO: " + name)); process.exit(1); }
