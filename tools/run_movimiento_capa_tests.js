/* MOVIMIENTO DE UNA CAPA ENTERA — claves, pivote y capa padre.
 *
 * Lo que tiene que ser cierto: entre claves el movimiento es parejo y antes de
 * la primera / después de la última se sostiene; la matriz gira y escala
 * alrededor del pivote; una capa que sigue a otra hereda su movimiento; un
 * círculo de padres se rechaza (y si viniera en un archivo, no cuelga); todo
 * vuelve con Ctrl+Z y sobrevive a guardar y reabrir; y una capa sin
 * movimiento no escribe nada nuevo en el archivo.
 *
 * Uso: node tools/run_movimiento_capa_tests.js
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
const cerca = (a, b, e = 1e-6) => Math.abs(a - b) < e;
const aplica = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
function docConCapas() {
  const doc = new A.LowDoc();
  doc.setHistory(new global.LOW.core.HistoryManager());
  const sc = doc.scene;
  sc.layers = []; sc.levels = [];
  for (const n of ["mano", "vaso", "fondo"]) { const lv = sc.addLevel(n); const ly = sc.addLayer(lv.id, n); ly.id = n; }
  return doc;
}
const reabrir = (sc) => new A.Scene(JSON.parse(JSON.stringify(sc.toJSON())));

// ── 1. interpolación ───────────────────────────────────────────────────────
{
  const mov = A.movData({ claves: { 1: { x: 0 }, 11: { x: 100, rot: 90, esc: 2 } } });
  check("entre claves es parejo", cerca(A.movEn(mov, 6).x, 50) && cerca(A.movEn(mov, 6).rot, 45) && cerca(A.movEn(mov, 6).esc, 1.5));
  check("antes de la primera se sostiene", A.movEn(mov, -3).x === 0);
  check("después de la última se sostiene", A.movEn(mov, 40).x === 100);
  check("sin claves no se mueve", A.movEn(null, 5).x === 0 && A.movEn(null, 5).esc === 1);
  check("sin claves ni padre no hay movimiento", A.movData({ claves: {} }) === null && A.movData(null) === null);
  check("una escala absurda se acota", A.movData({ claves: { 1: { esc: 0 } } }).claves[1].esc === 0.01);
  check("una clave en un cuadro inválido se descarta", Object.keys(A.movData({ claves: { 0: { x: 1 }, "-4": { x: 1 }, 2: { x: 3 } } }).claves).join() === "2");
}

// ── 2. matrices ─────────────────────────────────────────────────────────────
{
  const doc = docConCapas(), sc = doc.scene;
  check("una capa quieta no tiene matriz", sc.matrizCapa("mano", 1) === null);
  doc.ponerClaveMov("fondo", 1, { x: 0 });
  doc.ponerClaveMov("fondo", 25, { x: -480 });
  const m = sc.matrizCapa("fondo", 13);
  check("el fondo se panea: a mitad de camino va por la mitad", cerca(aplica(m, 0, 0)[0], -240), JSON.stringify(m));
  doc.ponerClaveMov("mano", 1, { rot: 90 });
  doc.setPivoteMov("mano", 100, 100);
  const g = sc.matrizCapa("mano", 1);
  const p = aplica(g, 200, 100);
  check("gira alrededor del pivote (el pivote no se mueve)", cerca(aplica(g, 100, 100)[0], 100) && cerca(aplica(g, 100, 100)[1], 100));
  check("un punto a la derecha del pivote, girado 90°, queda abajo", cerca(p[0], 100) && cerca(p[1], 200), JSON.stringify(p));
  check("la matriz se escribe como atributo SVG", /^matrix\(/.test(A.matrizASvg(g)) && A.matrizASvg(null) === "");
}

// ── 3. la capa padre ────────────────────────────────────────────────────────
{
  const doc = docConCapas(), sc = doc.scene;
  doc.ponerClaveMov("mano", 1, { x: 0 });
  doc.ponerClaveMov("mano", 11, { x: 200 });
  check("el vaso sigue a la mano", doc.setPadreMov("vaso", "mano"));
  check("sin claves propias, el vaso se mueve como la mano", cerca(aplica(sc.matrizCapa("vaso", 11), 0, 0)[0], 200));
  doc.ponerClaveMov("vaso", 1, { y: 30 });
  const v = aplica(sc.matrizCapa("vaso", 6), 0, 0);
  check("con claves propias, se suman las de la mano", cerca(v[0], 100) && cerca(v[1], 30), JSON.stringify(v));
  check("un círculo de padres se rechaza", doc.setPadreMov("mano", "vaso") === false && !(sc.layer("mano").mov.padre));
  check("emparentar consigo misma se rechaza", doc.setPadreMov("mano", "mano") === false);
  // un archivo con un círculo no cuelga
  const json = JSON.parse(JSON.stringify(sc.toJSON()));
  json.layers.find((l) => l.id === "mano").mov.padre = "vaso";
  const sc2 = new A.Scene(json);
  let colgo = false;
  try { sc2.matrizCapa("vaso", 3); } catch (_) { colgo = true; }
  check("un círculo que viene en el archivo no cuelga", !colgo);
  doc.setPadreMov("vaso", null);
  check("soltar del padre deja sólo lo propio", cerca(aplica(sc.matrizCapa("vaso", 11), 0, 0)[0], 0));
}

// ── 4. Ctrl+Z y el archivo ──────────────────────────────────────────────────
{
  const doc = docConCapas(), sc = doc.scene;
  check("una escena sin movimiento no escribe mov", sc.layers.every((l) => !("mov" in l.toJSON())));
  doc.ponerClaveMov("fondo", 1, { x: 10 });
  doc.ponerClaveMov("fondo", 9, { x: 90 });
  doc.setPadreMov("vaso", "fondo");
  const sc2 = reabrir(sc);
  check("las claves sobreviven a guardar y reabrir", Object.keys(sc2.layer("fondo").mov.claves).join() === "1,9" && sc2.layer("fondo").mov.claves[9].x === 90);
  check("el padre sobrevive a guardar y reabrir", sc2.layer("vaso").mov.padre === "fondo");
  doc.history.undo();
  check("Ctrl+Z suelta el padre", !sc.layer("vaso").mov);
  doc.history.undo();
  check("otro Ctrl+Z saca la clave del 9", Object.keys(sc.layer("fondo").mov.claves).join() === "1");
  doc.history.redo();
  check("Ctrl+Shift+Z la devuelve", sc.layer("fondo").mov.claves[9].x === 90);
  check("quitar una clave que no existe no hace nada", doc.quitarClaveMov("fondo", 5) === false);
  doc.quitarClaveMov("fondo", 9);
  check("quitar la clave del 9", !sc.layer("fondo").mov.claves[9]);
  doc.quitarMov("fondo");
  check("quitar todo el movimiento deja la capa sin mov", sc.layer("fondo").mov === null && sc.matrizCapa("fondo", 1) === null);
  doc.history.undo();
  check("y Ctrl+Z lo devuelve", !!sc.layer("fondo").mov);
  check("duplicar una capa con movimiento copia el movimiento", (() => { const c = doc.duplicateLayer("fondo"); return c && c.mov && c.mov.claves[1].x === 10; })());
}

// ── 5. mira a ───────────────────────────────────────────────────────────────
{
  const doc = docConCapas(), sc = doc.scene;
  doc.setPivoteMov("vaso", 0, 0);               // crea mov sin claves: no hay, todavía
  check("mirar a otra capa", doc.setMirarAMov("mano", "vaso"));
  doc.setPivoteMov("mano", 100, 100);
  doc.ponerClaveMov("vaso", 1, { x: 100, y: 300 });   // el vaso (pivote 0,0) queda en (100, 300): abajo de la mano
  const m = sc.matrizCapa("mano", 1);
  const punta = aplica(m, 200, 100);             // un punto a la derecha del pivote de la mano…
  check("…gira hasta apuntar al vaso (abajo)", cerca(punta[0], 100) && cerca(punta[1], 200), JSON.stringify(punta));
  check("el pivote de la que mira no se mueve", cerca(aplica(m, 100, 100)[0], 100) && cerca(aplica(m, 100, 100)[1], 100));
  check("mirarse a sí misma se rechaza", doc.setMirarAMov("mano", "mano") === false);
  doc.setPadreMov("vaso", "mano");
  check("mirar a una capa que la sigue se rechaza", doc.setMirarAMov("fondo", "fondo") === false);
  const sc2 = reabrir(sc);
  check("mirar a sobrevive a guardar y reabrir", sc2.layer("mano").mov.mirarA === "vaso");
  let colgo = false;
  try { sc2.matrizCapa("mano", 1); sc2.matrizCapa("vaso", 1); } catch (_) { colgo = true; }
  check("mano mira al vaso que sigue a la mano: no cuelga", !colgo);
  doc.setMirarAMov("mano", null);
  check("dejar de mirar (sin nada más, la capa queda sin movimiento)", !sc.layer("mano").mov || !sc.layer("mano").mov.mirarA);
}

// ── 6. pegar a un hueso ─────────────────────────────────────────────────────
{
  const doc = docConCapas(), sc = doc.scene;
  // un rig de mentira: el hueso «brazo» se corre 10 por cuadro
  sc.rig = sc.rig || {}; sc.rig.nodes = { brazo: { id: "brazo", name: "Brazo" } };
  sc.rigWorldMatrix = (id, f) => (id === "brazo" ? [1, 0, 0, 1, 10 * (f - 1) + 50, 0] : null);
  doc.frame = 1; doc.goTo && doc.goTo(1);
  check("un hueso que no existe se rechaza", doc.setPadreMov("vaso", "hueso:pierna") === false);
  check("pegar el vaso al brazo", doc.setPadreMov("vaso", "hueso:brazo"));
  check("al pegarla no salta de lugar", sc.matrizCapa("vaso", 1) === null);
  check("después sigue al hueso", cerca(aplica(sc.matrizCapa("vaso", 4), 0, 0)[0], 30));
  const sc2 = reabrir(sc);
  check("el hueso y su bind sobreviven a guardar y reabrir", sc2.layer("vaso").mov.padre === "hueso:brazo" && sc2.layer("vaso").mov.bind.length === 6);
  doc.history.undo();
  check("Ctrl+Z la despega", !sc.layer("vaso").mov);
}

console.log(`Movimiento de capa: ${ok} bien, ${fallan} mal`);
process.exit(fallan ? 1 : 0);
