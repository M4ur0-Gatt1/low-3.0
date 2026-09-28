/* JUEGOS DE VISTAS (C04) — el giro de cabeza hecho con dibujos.
 *
 * Una cabeza no gira interpolando: gira porque alguien DIBUJÓ el frente, el
 * tres cuartos y el perfil, y en cada punto del giro se ve el dibujo que
 * corresponde. Las sustituciones por slot ya existían, pero había que clavar
 * una por cuadro; un juego de vistas ata el slot a un CONTROL y el dibujo
 * aparece solo.
 *
 * Lo que más se prueba acá es lo que el plan PROHÍBE: «no presentar un giro
 * 360 automático si faltan vistas». Con dos dibujos hay dos dibujos, y el
 * modelo tiene que decirlo en vez de fingir una vuelta completa.
 *
 * Uso: node tools/run_view_sets_tests.js
 */
const fs = require("fs");
const path = require("path");

global.window = global;
for (const rel of ["core/history.js", "animation/scene-model.js", "animation/exposures.js",
  "animation/onion.js", "rigging/binding.js", "animation/document.js"]) {
  const p = path.join(__dirname, "..", "ui", rel);
  if (fs.existsSync(p)) eval(fs.readFileSync(p, "utf8"));
}
const { LowDoc } = global.LOW.animation;

let ok = 0, fallan = 0;
const check = (nombre, cond, detalle = "") => {
  if (cond) { ok++; return; }
  fallan++;
  console.log("FALLA: " + nombre + (detalle ? "  :: " + detalle : ""));
};

/** Una cabeza con slot, control de giro y tres dibujos: frente, ¾ y perfil. */
function cabeza() {
  const doc = new LowDoc();
  doc.setHistory(new global.LOW.core.HistoryManager());
  // un slot cuelga de un HUESO: sin hueso no hay dónde colgar los dibujos
  doc.ensureRigBone("cabeza", { name: "cabeza" });
  const slot = doc.ensureRigSlot("cabeza", { name: "cabeza" });
  const slotId = typeof slot === "string" ? slot : (slot && slot.id) || "cabeza";
  const vistas = {};
  for (const [clave, nombre] of [["frente", "Frente"], ["tresCuartos", "Tres cuartos"], ["perfil", "Perfil"]]) {
    const a = doc.addRigAttachment(slotId, { name: nombre, type: "drawing", elementId: "dib_" + clave });
    vistas[clave] = typeof a === "string" ? a : (a && a.id) || null;
  }
  doc.createRigControl("giro_cabeza", { name: "giro de cabeza", min: -90, max: 90, default: 0 });
  return { doc, slotId, vistas };
}

// ── 1. El juego se crea atado a un slot y a un control ──
{
  const { doc, slotId, vistas } = cabeza();
  check("hay slot y tres dibujos para las vistas",
    !!slotId && Object.values(vistas).every(Boolean), JSON.stringify(vistas));
  const creado = doc.createRigViewSet("giro", { slotId,
    driverPath: global.LOW.animation.rigControlPath("giro_cabeza"), min: -90, max: 90 });
  check("el juego se crea", creado !== false);
  check("un juego sin slot no se crea",
    doc.createRigViewSet("fantasma", { slotId: "no_existe", driverPath: "x" }) === false);
  check("el juego nace VACÍO: no inventa vistas",
    doc.scene.rigViewSet("giro").views.length === 0);
}

// ── 2. NO PROMETER UN GIRO QUE NADIE DIBUJÓ ──
{
  const { doc, slotId, vistas } = cabeza();
  const ruta = global.LOW.animation.rigControlPath("giro_cabeza");
  doc.createRigViewSet("giro", { slotId, driverPath: ruta, min: -90, max: 90 });

  let cob = doc.scene.rigViewSetCoverage("giro");
  check("sin vistas no hay nada cubierto y no se declara completo",
    cob.vistas === 0 && cob.completo === false, JSON.stringify(cob));

  doc.addRigView("giro", vistas.frente, 0, { name: "Frente" });
  cob = doc.scene.rigViewSetCoverage("giro");
  check("con UNA vista sigue sin ser un giro",
    cob.vistas === 1 && cob.completo === false, JSON.stringify(cob));

  doc.addRigView("giro", vistas.perfil, 90, { name: "Perfil" });
  cob = doc.scene.rigViewSetCoverage("giro");
  check("con frente y perfil cubre de 0 a 90, NO los -90 que el control declara",
    cob.desde === 0 && cob.hasta === 90 && cob.llegaAlMinimo === false && cob.completo === false,
    JSON.stringify(cob));
  check("y el hueco entre las dos vistas queda dicho, con su tamaño",
    cob.huecos.length === 1 && cob.huecos[0].salto === 90, JSON.stringify(cob.huecos));

  doc.addRigView("giro", vistas.tresCuartos, 45, { name: "Tres cuartos" });
  cob = doc.scene.rigViewSetCoverage("giro");
  check("el tres cuartos parte el hueco en dos de 45",
    cob.huecos.length === 2 && cob.huecos.every((h) => h.salto === 45), JSON.stringify(cob.huecos));

  // recién cuando las vistas llegan a los dos extremos el giro está completo
  const izq = doc.addRigAttachment(doc.scene.rigViewSet("giro").slotId,
    { name: "Perfil izq", type: "drawing", elementId: "dib_perfil_izq" });
  doc.addRigView("giro", typeof izq === "string" ? izq : izq.id, -90, { name: "Perfil izquierdo" });
  cob = doc.scene.rigViewSetCoverage("giro");
  check("con las vistas en los dos extremos, ahí sí el recorrido está completo",
    cob.completo === true && cob.desde === -90 && cob.hasta === 90, JSON.stringify(cob));
}

// ── 3. El control elige el dibujo, y es DISCRETO ──
{
  const { doc, slotId, vistas } = cabeza();
  const ruta = global.LOW.animation.rigControlPath("giro_cabeza");
  doc.createRigViewSet("giro", { slotId, driverPath: ruta, min: -90, max: 90 });
  doc.addRigView("giro", vistas.frente, 0);
  doc.addRigView("giro", vistas.tresCuartos, 45);
  doc.addRigView("giro", vistas.perfil, 90);

  const enCuadro = (f) => { const v = doc.scene.rigViewAt("giro", f); return v && v.attachmentId; };
  doc.setRigControlValue("giro_cabeza", 1, 0);
  check("en 0 se ve el frente", enCuadro(1) === vistas.frente, String(enCuadro(1)));
  doc.setRigControlValue("giro_cabeza", 1, 45);
  check("en 45 se ve el tres cuartos", enCuadro(1) === vistas.tresCuartos);
  doc.setRigControlValue("giro_cabeza", 1, 90);
  check("en 90 se ve el perfil", enCuadro(1) === vistas.perfil);

  doc.setRigControlValue("giro_cabeza", 1, 30);
  check("en 30 manda la vista MÁS CERCANA (el tres cuartos), no una mezcla",
    enCuadro(1) === vistas.tresCuartos, String(enCuadro(1)));
  doc.setRigControlValue("giro_cabeza", 1, 22.5);
  check("el empate exacto cae siempre en la vista de valor menor, para que el " +
    "mismo valor dé siempre el mismo dibujo",
    enCuadro(1) === vistas.frente, String(enCuadro(1)));

  doc.setRigControlValue("giro_cabeza", 1, -90);
  const v = doc.scene.rigViewAt("giro", 1);
  check("pasado lo dibujado se sostiene el extremo Y se avisa que está fuera",
    v.attachmentId === vistas.frente && v.fuera === true, JSON.stringify(v));
}

// ── 4. El orden de slots viaja con la vista ──
{
  const { doc, slotId, vistas } = cabeza();
  const ruta = global.LOW.animation.rigControlPath("giro_cabeza");
  doc.createRigViewSet("giro", { slotId, driverPath: ruta, min: -90, max: 90 });
  doc.addRigView("giro", vistas.frente, 0, { order: ["cara", "nariz"] });
  doc.addRigView("giro", vistas.perfil, 90, { order: ["nariz", "cara"] });
  doc.setRigControlValue("giro_cabeza", 1, 0);
  check("de frente la nariz va detrás de la cara",
    JSON.stringify(doc.scene.rigViewAt("giro", 1).order) === '["cara","nariz"]');
  doc.setRigControlValue("giro_cabeza", 1, 90);
  check("de perfil la nariz pasa adelante: el orden viaja con la vista",
    JSON.stringify(doc.scene.rigViewAt("giro", 1).order) === '["nariz","cara"]');

  /* Y SOBREVIVE AL ARCHIVO. Sin esta comprobación la anterior pasa aunque el
     orden se pierda al guardar: la de arriba lee el objeto vivo, que nunca
     pasó por el normalizador. Se midió: rompiendo el normalizador a propósito,
     la de arriba seguía en verde. */
  const reabierto = LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
  reabierto.setRigControlValue("giro_cabeza", 1, 90);
  check("el orden de la vista sobrevive guardar y reabrir",
    JSON.stringify(reabierto.scene.rigViewAt("giro", 1).order) === '["nariz","cara"]',
    JSON.stringify(reabierto.scene.rigViewAt("giro", 1)));
}

// ── 5. Integridad: una vista no puede apuntar a un dibujo que ya no existe ──
{
  const { doc, slotId, vistas } = cabeza();
  const ruta = global.LOW.animation.rigControlPath("giro_cabeza");
  doc.createRigViewSet("giro", { slotId, driverPath: ruta });
  doc.addRigView("giro", vistas.frente, 0);
  doc.addRigView("giro", vistas.perfil, 90);
  check("no se puede agregar dos veces el mismo dibujo",
    doc.addRigView("giro", vistas.frente, 30) === false);
  check("no se puede agregar un dibujo inexistente",
    doc.addRigView("giro", "no_existe", 30) === false);

  doc.removeRigView("giro", vistas.perfil);
  check("quitar una vista la saca del juego", doc.scene.rigViewSet("giro").views.length === 1);
  check("pero NO borra el dibujo: sigue en el rig",
    !!doc.scene.rigAttachment(vistas.perfil));

  // una vista huérfana se descarta al normalizar, no queda como agujero mudo
  const crudo = JSON.parse(JSON.stringify(doc.scene.toJSON()));
  crudo.rig.viewSets.giro.views.push({ attachmentId: "borrado_hace_rato", at: 45 });
  const reabierto = new global.LOW.animation.Scene(crudo);
  check("al reabrir, una vista que apunta a un dibujo borrado se descarta",
    reabierto.rigViewSet("giro").views.length === 1,
    JSON.stringify(reabierto.rigViewSet("giro").views));
}

// ── 6. Guardar, reabrir y deshacer ──
{
  const { doc, slotId, vistas } = cabeza();
  const ruta = global.LOW.animation.rigControlPath("giro_cabeza");
  doc.createRigViewSet("giro", { slotId, driverPath: ruta, min: -90, max: 90 });
  doc.addRigView("giro", vistas.frente, 0);
  doc.addRigView("giro", vistas.tresCuartos, 45);

  const copia = LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
  const j = copia.scene.rigViewSet("giro");
  check("el juego sobrevive guardar y reabrir",
    !!j && j.views.length === 2 && j.driver.path === ruta, JSON.stringify(j));
  check("y su recorrido dibujado también",
    copia.scene.rigViewSetCoverage("giro").hasta === 45);

  const antes = doc.scene.rigViewSet("giro").views.length;
  doc.addRigView("giro", vistas.perfil, 90);
  check("agregar una vista entra en el historial y se deshace",
    doc.scene.rigViewSet("giro").views.length === antes + 1 &&
    (doc.history.undo(), doc.scene.rigViewSet("giro").views.length === antes),
    String(doc.scene.rigViewSet("giro").views.length));
}

// ── 7. Puente con las sustituciones que ya existían ──
{
  const { doc, slotId, vistas } = cabeza();
  const ruta = global.LOW.animation.rigControlPath("giro_cabeza");
  doc.createRigViewSet("giro", { slotId, driverPath: ruta, min: -90, max: 90 });
  doc.addRigView("giro", vistas.frente, 0);
  doc.addRigView("giro", vistas.perfil, 90);
  doc.setRigControlValue("giro_cabeza", 5, 90);
  check("hornear clava en el cuadro la vista que el control elige",
    doc.bakeRigViewAt("giro", 5) !== false &&
    doc.scene.rigSwitchAt(slotId, 5) === vistas.perfil,
    String(doc.scene.rigSwitchAt(slotId, 5)));
}

// ── 8. EL CORRECTIVO DE LA VISTA ──
{
  const { doc, slotId, vistas } = cabeza();
  const ruta = global.LOW.animation.rigControlPath("giro_cabeza");
  doc.createRigViewSet("giro", { slotId, driverPath: ruta, min: -90, max: 90 });
  doc.addRigView("giro", vistas.frente, 0);
  doc.addRigView("giro", vistas.perfil, 90);
  // una pieza que va ENCIMA de la cabeza: el ojo
  doc.ensureRigBone("ojo", { name: "ojo" });
  const baseOjo = doc.scene.rigPoseBase("ojo", 1);

  doc.setRigViewFix("giro", vistas.perfil, "ojo", { x: 12, sx: -0.2 });
  doc.setRigControlValue("giro_cabeza", 1, 0);
  const deFrente = doc.scene.rigPose("ojo", 1);
  check("de frente el ojo no se mueve: la corrección es de la otra vista",
    Math.abs(deFrente.x - baseOjo.x) < 1e-9, JSON.stringify(deFrente));

  doc.setRigControlValue("giro_cabeza", 1, 90);
  const dePerfil = doc.scene.rigPose("ojo", 1);
  check("de perfil el ojo se corre lo que dice el correctivo",
    Math.abs(dePerfil.x - (baseOjo.x + 12)) < 1e-9, JSON.stringify(dePerfil));
  check("y se achica lo que dice el correctivo",
    Math.abs(dePerfil.sx - ((baseOjo.sx == null ? 1 : baseOjo.sx) - 0.2)) < 1e-9,
    JSON.stringify(dePerfil));

  // volver a la otra vista tiene que SACAR la corrección, no arrastrarla
  doc.setRigControlValue("giro_cabeza", 1, 0);
  check("al volver al frente la corrección desaparece, no queda arrastrada",
    Math.abs(doc.scene.rigPose("ojo", 1).x - baseOjo.x) < 1e-9);

  // una pieza sin correctivo no se entera de nada
  check("una pieza sin correctivo queda igual que su base",
    doc.scene.rigViewDelta("cabeza", 1) === null);

  // poner el correctivo en cero lo BORRA
  doc.setRigControlValue("giro_cabeza", 1, 90);
  doc.setRigViewFix("giro", vistas.perfil, "ojo", {});
  check("un correctivo en cero se borra, no queda un cero guardado",
    doc.scene.rigViewAt("giro", 1).fix === null,
    JSON.stringify(doc.scene.rigViewAt("giro", 1).fix));

  /* Y EL NORMALIZADOR TAMBIÉN LIMPIA. La comprobación de arriba pasa por el
     comando, que filtra los ceros por su cuenta; si un archivo llega con un
     cero escrito a mano —o lo escribe otra versión— el normalizador tiene que
     descartarlo igual. Se midió: sin esto, romper el filtro del normalizador
     no hacía caer ninguna prueba. */
  {
    const crudo = JSON.parse(JSON.stringify(doc.scene.toJSON()));
    const vistaCruda = crudo.rig.viewSets.giro.views.find((v) => v.attachmentId === vistas.perfil);
    vistaCruda.fix = { ojo: { x: 0, y: 0, r: 0 } };
    const limpio = new global.LOW.animation.Scene(crudo);
    const vistaLimpia = limpio.rigViewSet("giro").views.find((v) => v.attachmentId === vistas.perfil);
    check("un correctivo escrito todo en cero no sobrevive al normalizador",
      vistaLimpia.fix === null, JSON.stringify(vistaLimpia.fix));
  }

  // y sobrevive el archivo
  doc.setRigViewFix("giro", vistas.perfil, "ojo", { y: -7 });
  const reabierto = LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
  reabierto.setRigControlValue("giro_cabeza", 1, 90);
  check("el correctivo sobrevive guardar y reabrir",
    Math.abs(reabierto.scene.rigPose("ojo", 1).y - (baseOjo.y - 7)) < 1e-9,
    JSON.stringify(reabierto.scene.rigPose("ojo", 1)));
}

console.log(`juegos de vistas: ${ok}/${ok + fallan}`);
if (fallan) process.exit(1);
