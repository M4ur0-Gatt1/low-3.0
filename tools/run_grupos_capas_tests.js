/* GRUPOS DE CAPAS — las carpetas de Grease Pencil 3, en LOW.
 *
 * Lo que tiene que ser cierto:
 *   · agrupar junta las capas en un BLOQUE, conservando su orden;
 *   · ocultar o bloquear el grupo oculta o bloquea sus capas DE VERDAD (así lo
 *     respeta el render, la exportación y cada herramienta), y al volver deja
 *     como estaban las que ya estaban ocultas o bloqueadas por su cuenta;
 *   · mover una capa a un grupo o sacarla le aplica o le devuelve eso;
 *   · cada cambio es UN Ctrl+Z que vuelve orden, grupo, visibilidad y bloqueo;
 *   · todo sobrevive a guardar y reabrir (la lección del rig: ida y vuelta).
 *
 * Uso: node tools/run_grupos_capas_tests.js
 */
const fs = require("fs");
const path = require("path");
global.window = global;
for (const rel of ["core/history.js", "animation/scene-model.js", "animation/exposures.js",
  "animation/onion.js", "rigging/binding.js", "animation/document.js"]) {
  const p = path.join(__dirname, "..", "ui", rel);
  if (fs.existsSync(p)) eval(fs.readFileSync(p, "utf8"));
}
const A = global.LOW.animation;

let ok = 0, fallan = 0;
const check = (nombre, cond, detalle = "") => {
  if (cond) { ok++; return; }
  fallan++;
  console.log("FALLA: " + nombre + (detalle ? "  :: " + detalle : ""));
};
const reabrir = (sc) => new A.Scene(JSON.parse(JSON.stringify(sc.toJSON())));
/** Documento con cinco capas: a (atrás) … e (adelante). */
function docConCapas() {
  const doc = new A.LowDoc();
  doc.setHistory(new global.LOW.core.HistoryManager());
  const sc = doc.scene;
  sc.layers = []; sc.levels = [];
  for (const n of ["a", "b", "c", "d", "e"]) { const lv = sc.addLevel(n); const ly = sc.addLayer(lv.id, n); ly.id = n; }
  doc.layerId = "a";
  return doc;
}
const orden = (doc) => doc.scene.layers.map((l) => l.id).join("");
const de = (doc, id) => doc.scene.layer(id);

// ── 1. agrupar junta el bloque ─────────────────────────────────────────────
{
  const doc = docConCapas();
  const g = doc.crearGrupo("Personaje", ["a", "c", "e"]);
  check("crear devuelve el id del grupo", typeof g === "string" && !!doc.grupo(g));
  check("el bloque queda junto, donde está la de más adelante, en su orden", orden(doc) === "bdace", orden(doc));
  check("las tres capas son del grupo", ["a", "c", "e"].every((id) => de(doc, id).grupo === g) && !de(doc, "b").grupo);
  check("el grupo tiene nombre y color", doc.grupo(g).nombre === "Personaje" && /^#[0-9a-f]{6}$/i.test(doc.grupo(g).color));
  doc.history.undo();
  check("Ctrl+Z vuelve el orden y saca el grupo", orden(doc) === "abcde" && !doc.scene.grupos.length && !de(doc, "a").grupo, orden(doc));
  doc.history.redo();
  check("Ctrl+Shift+Z lo rehace igual", orden(doc) === "bdace" && de(doc, "c").grupo);
  check("agrupar capas que no existen no hace nada", doc.crearGrupo("x", ["zz"]) === null);
}

// ── 2. ocultar y bloquear el grupo ─────────────────────────────────────────
{
  const doc = docConCapas();
  de(doc, "b").visible = false;                    // b ya estaba oculta por su cuenta
  de(doc, "c").locked = true;                      // c ya estaba bloqueada
  const g = doc.crearGrupo("Fondo", ["a", "b", "c"]);
  doc.setGrupo(g, "oculto", true);
  check("ocultar el grupo oculta sus capas de verdad", ["a", "b", "c"].every((id) => de(doc, id).visible === false) && de(doc, "d").visible);
  doc.setGrupo(g, "oculto", false);
  check("mostrarlo deja oculta la que ya estaba oculta", de(doc, "a").visible && de(doc, "b").visible === false && de(doc, "c").visible);
  doc.setGrupo(g, "bloqueado", true);
  check("bloquear el grupo bloquea sus capas", ["a", "b", "c"].every((id) => de(doc, id).locked));
  doc.setGrupo(g, "bloqueado", false);
  check("desbloquearlo deja bloqueada la que ya lo estaba", !de(doc, "a").locked && de(doc, "c").locked);
  doc.setGrupo(g, "oculto", true);
  const pasos = doc.history.undoStack.length;
  doc.history.undo();
  check("un Ctrl+Z vuelve a mostrar el grupo", de(doc, "a").visible && !doc.grupo(g).oculto && doc.history.undoStack.length === pasos - 1);
  doc.history.redo();
  check("Ctrl+Shift+Z lo vuelve a ocultar", de(doc, "a").visible === false && doc.grupo(g).oculto);
  // guardar y reabrir con el grupo oculto: al mostrarlo, la de antes sigue oculta
  const sc2 = reabrir(doc.scene);
  const doc2 = new A.LowDoc(sc2); doc2.setHistory(new global.LOW.core.HistoryManager());
  check("el grupo sobrevive a guardar y reabrir", sc2.grupos.length === 1 && sc2.grupos[0].oculto && sc2.layer("a").grupo === g);
  doc2.setGrupo(g, "oculto", false);
  check("reabierto, mostrar respeta lo que ya estaba oculto", sc2.layer("a").visible && sc2.layer("b").visible === false);
}

// ── 3. mover a un grupo, sacar, plegar, renombrar, desagrupar ──────────────
{
  const doc = docConCapas();
  const g = doc.crearGrupo("Cara", ["a", "b"]);
  doc.setGrupo(g, "oculto", true);
  doc.moverAGrupo("d", g);
  check("una capa que entra queda arriba del grupo", orden(doc) === "abdce", orden(doc));
  check("y se oculta si el grupo está oculto", de(doc, "d").visible === false && de(doc, "d").grupo === g);
  doc.moverAGrupo("d", null);
  check("al salir vuelve a verse y queda encima del bloque", de(doc, "d").visible && !de(doc, "d").grupo && orden(doc) === "abdce", orden(doc));
  doc.history.undo();
  check("Ctrl+Z la vuelve a meter (oculta)", de(doc, "d").grupo === g && de(doc, "d").visible === false);
  const pasos = doc.history.undoStack.length;
  doc.setGrupo(g, "plegado", true);
  check("plegar no entra al Ctrl+Z (es de la vista)", doc.history.undoStack.length === pasos && doc.grupo(g).plegado);
  check("plegado se guarda en el archivo", reabrir(doc.scene).grupos[0].plegado === true);
  check("renombrar con texto vacío no hace nada", doc.setGrupo(g, "nombre", "  ") === false && doc.grupo(g).nombre === "Cara");
  doc.setGrupo(g, "nombre", "Cabeza");
  check("renombrar", doc.grupo(g).nombre === "Cabeza");
  check("un color inválido no entra", doc.setGrupo(g, "color", "rojo") === false);
  doc.desagrupar(g);
  check("desagrupar devuelve las capas como estaban (visibles) y quita el grupo",
    !doc.scene.grupos.length && ["a", "b", "d"].every((id) => !de(doc, id).grupo && de(doc, id).visible));
  doc.history.undo();
  check("Ctrl+Z vuelve a armar el grupo oculto", doc.grupo(g) && doc.grupo(g).oculto && de(doc, "a").visible === false);
}

// ── 4. el archivo ──────────────────────────────────────────────────────────
{
  const doc = docConCapas();
  check("una escena sin grupos no escribe grupos", !("grupos" in doc.scene.toJSON()) && !("grupo" in de(doc, "a").toJSON()));
  const g = doc.crearGrupo("X", ["a"]);
  const json = JSON.parse(JSON.stringify(doc.scene.toJSON()));
  json.layers.find((l) => l.id === "b").grupo = "no-existe";
  json.grupos.push({ id: "vacio", nombre: "Sin capas" });
  json.grupos.push({ id: g, nombre: "Repetido" });
  json.grupos.push({ id: "../mal", nombre: "Id inválido" });
  const sc = new A.Scene(json);
  check("una capa con un grupo que no existe queda suelta", sc.layer("b").grupo === null);
  check("los grupos vacíos, repetidos o con id inválido se descartan", sc.grupos.length === 1 && sc.grupos[0].id === g && sc.grupos[0].nombre === "X",
    JSON.stringify(sc.grupos.map((x) => x.id)));
  check("duplicar una capa del grupo deja la copia en el grupo", (() => { const c = doc.duplicateLayer("a"); return c && c.grupo === g; })());
}

console.log(`Grupos de capas: ${ok} bien, ${fallan} mal`);
process.exit(fallan ? 1 : 0);
