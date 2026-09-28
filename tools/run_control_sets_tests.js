/* CONJUNTOS DE CONTROLES (C05) — la cara armada de una vez.
 *
 * Un conjunto es la receta: qué controles hay y qué piezas necesita. Aplicarlo
 * crea los controles y, para cada pieza, el juego de vistas listo para recibir
 * los dibujos — se apoya en C04 en vez de inventar otro mecanismo.
 *
 * Lo que más se prueba acá es la regla que pide el plan, «vinculación
 * explícita a cada personaje»: el conjunto NO adivina cuál es el ojo
 * izquierdo. Puede sugerir, pero aplicar exige el mapa, y si falta algo NO
 * aplica nada. Un control colgado de ninguna pieza es peor que no tenerlo: se
 * mueve, no pasa nada, y hay que descubrir por qué.
 *
 * Uso: node tools/run_control_sets_tests.js
 */
const fs = require("fs");
const path = require("path");

global.window = global;
for (const rel of ["core/history.js", "animation/scene-model.js", "animation/exposures.js",
  "animation/onion.js", "rigging/binding.js", "rigging/control-sets.js", "animation/document.js"]) {
  const p = path.join(__dirname, "..", "ui", rel);
  if (fs.existsSync(p)) eval(fs.readFileSync(p, "utf8"));
}
const { LowDoc } = global.LOW.animation;
const sets = global.LOW.rigging.controlSets;

let ok = 0, fallan = 0;
const check = (nombre, cond, detalle = "") => {
  if (cond) { ok++; return; }
  fallan++;
  console.log("FALLA: " + nombre + (detalle ? "  :: " + detalle : ""));
};

/** Un personaje con las piezas de la cara. */
function personaje() {
  const doc = new LowDoc();
  doc.setHistory(new global.LOW.core.HistoryManager());
  for (const [id, name] of [["ojo_l", "Ojo izquierdo"], ["ojo_r", "Ojo derecho"],
    ["ceja_l", "Ceja izquierda"], ["ceja_r", "Ceja derecha"], ["boca", "Boca"]])
    doc.ensureRigBone(id, { name });
  return doc;
}
const piezasDe = (doc) => Object.values(doc.scene.rig.bones)
  .map((b) => ({ id: b.id, name: b.name }));

// ── 1. El catálogo existe y declara lo que necesita ──
{
  check("hay conjuntos de fábrica para ojos, cejas, boca y manos",
    ["ojos", "cejas", "boca", "manos"].every((id) => !!sets.porId(id)),
    sets.CATALOGO.map((c) => c.id).join(","));
  const ojos = sets.porId("ojos");
  check("el conjunto declara qué PIEZAS necesita", ojos.roles.length === 2);
  check("y el valor por defecto de cada control es la pose neutra, para que " +
    "aplicarlo no deforme al personaje",
    ojos.controles.every((c) => c.default >= c.min && c.default <= c.max &&
      (c.min === 0 ? c.default === 0 : c.default === 0)),
    JSON.stringify(ojos.controles.map((c) => [c.key, c.min, c.max, c.default])));
}

// ── 2. SUGERIR es una ayuda, no una decisión ──
{
  const doc = personaje();
  const sug = sets.sugerir("ojos", piezasDe(doc));
  check("sugiere por nombre las dos piezas del conjunto de ojos",
    sug.ojo_izq === "ojo_l" && sug.ojo_der === "ojo_r", JSON.stringify(sug));
  check("no propone la misma pieza para dos roles",
    new Set(Object.values(sug)).size === Object.keys(sug).length);
  // con nombres que no se parecen a nada, no inventa
  const raro = new LowDoc();
  raro.ensureRigBone("pieza_1", { name: "pieza 1" });
  check("si los nombres no dicen nada, NO adivina",
    Object.keys(sets.sugerir("ojos", piezasDe(raro))).length === 0,
    JSON.stringify(sets.sugerir("ojos", piezasDe(raro))));
}

// ── 3. APLICAR EXIGE EL MAPA, y si falta algo no aplica NADA ──
{
  const doc = personaje();
  const antesControles = Object.keys(doc.scene.rig.controls || {}).length;
  const r = doc.applyControlSet("ojos", { ojo_izq: "ojo_l" });      // falta el derecho
  check("con un rol sin vincular no aplica", r.ok === false, JSON.stringify(r));
  check("y dice exactamente cuál falta",
    r.faltan.length === 1 && r.faltan[0].key === "ojo_der", JSON.stringify(r.faltan));
  check("no dejó NADA a medias: ni un control suelto",
    Object.keys(doc.scene.rig.controls || {}).length === antesControles,
    String(Object.keys(doc.scene.rig.controls || {}).length));

  const roto = doc.applyControlSet("ojos", { ojo_izq: "ojo_l", ojo_der: "no_existe" });
  check("una pieza vinculada que NO existe también frena: mentiría",
    roto.ok === false && roto.faltan[0].pieza === "no_existe", JSON.stringify(roto));
  check("y tampoco dejó controles sueltos",
    Object.keys(doc.scene.rig.controls || {}).length === antesControles);

  check("un conjunto que no existe se rechaza sin romper",
    doc.applyControlSet("no_hay", {}).ok === false);
}

// ── 4. Aplicado de verdad: controles + juegos de vistas listos ──
{
  const doc = personaje();
  const r = doc.applyControlSet("ojos", { ojo_izq: "ojo_l", ojo_der: "ojo_r" });
  check("aplica cuando el mapa está completo", r.ok === true, JSON.stringify(r));
  check("crea los cuatro controles del conjunto", r.controles.length === 4,
    JSON.stringify(r.controles));
  check("y sólo los controles CON pieza traen su juego de vistas",
    r.juegos.length === 2, JSON.stringify(r.juegos));
  const juego = doc.scene.rigViewSet(r.juegos[0]);
  check("el juego queda atado al control que le corresponde",
    juego.driver.path === global.LOW.animation.rigControlPath(r.controles[0]),
    JSON.stringify(juego.driver));
  check("el juego nace VACÍO: los dibujos los pone quien dibuja",
    juego.views.length === 0);
  check("y el panel de C04 dirá que todavía no hay giro",
    doc.scene.rigViewSetCoverage(juego.id).completo === false);
  check("el control arranca en su pose neutra: aplicar no deforma nada",
    doc.scene.rigControlValue(r.controles[0], 1) === 0);
}

// ── 5. El vínculo queda ESCRITO, y sobrevive el archivo ──
{
  const doc = personaje();
  doc.applyControlSet("ojos", { ojo_izq: "ojo_l", ojo_der: "ojo_r" });
  const aplicado = doc.controlSetsAplicados();
  check("queda anotado qué conjunto se aplicó y sobre qué piezas",
    aplicado.length === 1 && aplicado[0].setId === "ojos" &&
    aplicado[0].mapa.ojo_izq === "ojo_l", JSON.stringify(aplicado));

  const reabierto = LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
  const vuelto = reabierto.controlSetsAplicados();
  check("el vínculo sobrevive guardar y reabrir",
    vuelto.length === 1 && vuelto[0].mapa.ojo_der === "ojo_r", JSON.stringify(vuelto));
  check("y los controles también", Object.keys(reabierto.scene.rig.controls).length === 4);
}

// ── 6. Aplicar dos veces no duplica ni pisa ──
{
  const doc = personaje();
  doc.applyControlSet("ojos", { ojo_izq: "ojo_l", ojo_der: "ojo_r" });
  const cuantos = Object.keys(doc.scene.rig.controls).length;
  const otra = doc.applyControlSet("ojos", { ojo_izq: "ojo_l", ojo_der: "ojo_r" });
  check("aplicar de nuevo no crea nada nuevo",
    Object.keys(doc.scene.rig.controls).length === cuantos, String(cuantos));
  check("y lo dice en vez de fingir que creó", otra.yaEstaban.length === 4,
    JSON.stringify(otra));
}

// ── 7. Dos conjuntos distintos conviven sin pisarse ──
{
  const doc = personaje();
  doc.applyControlSet("ojos", { ojo_izq: "ojo_l", ojo_der: "ojo_r" });
  doc.applyControlSet("cejas", { ceja_izq: "ceja_l", ceja_der: "ceja_r" });
  check("los dos conjuntos quedan anotados", doc.controlSetsAplicados().length === 2);
  check("y sus controles no se pisan: los nombres llevan el conjunto adelante",
    Object.keys(doc.scene.rig.controls).length === 6,
    Object.keys(doc.scene.rig.controls).join(","));
}

// ── 8. Si la pieza se borra, el vínculo NO se limpia solo: se señala ──
{
  const doc = personaje();
  doc.applyControlSet("boca", { boca: "boca" });
  check("sin piezas rotas no hay nada que señalar",
    doc.scene.rigControlSetsRotos().length === 0);
  delete doc.scene.rig.bones.boca;                  // como si la hubieran borrado
  const rotos = doc.scene.rigControlSetsRotos();
  check("con la pieza borrada, el conjunto queda SEÑALADO",
    rotos.length === 1 && rotos[0].piezasRotas[0].pieza === "boca", JSON.stringify(rotos));
  const reabierto = LowDoc.fromJSON(JSON.parse(JSON.stringify(doc.toJSON())));
  check("y al reabrir NO se borra solo: esconderlo dejaría los controles " +
    "huérfanos sin ninguna pista",
    reabierto.controlSetsAplicados().length === 1,
    JSON.stringify(reabierto.controlSetsAplicados()));
}

console.log(`conjuntos de controles: ${ok}/${ok + fallan}`);
if (fallan) process.exit(1);
