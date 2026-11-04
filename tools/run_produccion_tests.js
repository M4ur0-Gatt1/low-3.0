/* LA PLANILLA DE PRODUCCIÓN — la guía de trabajo de la obra, en el .low.
 *
 * Lo que se prueba es lo que hace que una planilla sirva: que lo tildado NO SE
 * PIERDA al guardar (ida y vuelta por JSON, la lección del rig), que cada cambio
 * se deshaga con Ctrl+Z, y que un archivo no pueda decidir qué ejecuta «Ir».
 *
 * Uso: node tools/run_produccion_tests.js
 */
const fs = require("fs");
const path = require("path");

global.window = global;
global.document = { addEventListener() {}, querySelector: () => null };
for (const rel of ["core/history.js", "animation/scene-model.js", "animation/exposures.js",
  "animation/onion.js", "rigging/binding.js", "animation/document.js", "panels/produccion.js"]) {
  const p = path.join(__dirname, "..", "ui", rel);
  if (fs.existsSync(p)) eval(fs.readFileSync(p, "utf8"));
}
const A = global.LOW.animation, P = global.LOW.produccion;

let ok = 0, fallan = 0;
const check = (nombre, cond, detalle = "") => {
  if (cond) { ok++; return; }
  fallan++;
  console.log("FALLA: " + nombre + (detalle ? "  :: " + detalle : ""));
};
const reabrir = (sc) => new A.Scene(JSON.parse(JSON.stringify(sc.toJSON())));
function docNuevo() {
  const doc = new A.LowDoc();
  doc.setHistory(new global.LOW.core.HistoryManager());
  global.DZ = { doc };
  return doc;
}
const paso = (sc, id) => sc.produccion && sc.produccion.etapas.flatMap((e) => e.pasos).find((x) => x.id === id);

// ── 1. la guía de un corto ──────────────────────────────────────────────────
{
  const g = P.guiaCorto();
  const ids = g.etapas.flatMap((e) => [e.id, ...e.pasos.map((x) => x.id)]);
  check("la guía tiene preproducción, producción y postproducción", g.etapas.map((e) => e.nombre).join() === "Preproducción,Producción,Postproducción");
  check("la guía trae diseño de personajes, storyboard y fondos",
    ["personajes", "storyboard", "fondos-diseno"].every((id) => ids.includes(id)));
  check("los ids de la guía no se repiten", new Set(ids).size === ids.length);
  check("todo destino de la guía existe", g.etapas.flatMap((e) => e.pasos).every((x) => !x.ir || P.DESTINOS[x.ir]));
  check("la guía pasa el normalizador sin cambios", JSON.stringify(A.produccionData(g)) === JSON.stringify(g));
}

// ── 2. el normalizador ──────────────────────────────────────────────────────
{
  check("sin etapas no hay planilla", A.produccionData({}) === null && A.produccionData(null) === null);
  const n = A.produccionData({ etapas: [{ id: "A B", nombre: "x".repeat(99), pasos: [
    { id: "p", texto: "uno", estado: "rarisimo", ir: "menu:borrar documento" },
    { id: "p", texto: "", estado: "hecho", fecha: "2026-11-04T10:00:00Z", ir: "javascript:alert(1)" },
    { id: "q", texto: "tres", estado: "pendiente", fecha: "2026-11-04", nota: "ok", quien: "Mauro" }] }] });
  const ps = n.etapas[0].pasos;
  check("un id inválido se reemplaza", n.etapas[0].id === "etapa-1");
  check("el nombre de la etapa se recorta", n.etapas[0].nombre.length === 60);
  check("un estado desconocido pasa a pendiente", ps[0].estado === "pendiente");
  check("los ids repetidos se desambiguan", new Set(ps.map((x) => x.id)).size === 3, ps.map((x) => x.id).join());
  check("un texto vacío queda como «Paso»", ps[1].texto === "Paso");
  check("un destino con espacios o con javascript: se descarta", !ps[0].ir && !ps[1].ir);
  check("la fecha sólo queda en lo hecho", ps[1].fecha && !ps[2].fecha);
  check("nota y quién se conservan", ps[2].nota === "ok" && ps[2].quien === "Mauro");
}

// ── 3. tildar, guardar, reabrir, deshacer ──────────────────────────────────
{
  const doc = docNuevo();
  check("un documento nuevo no tiene planilla ni la escribe", doc.scene.produccion === null && !("produccion" in doc.scene.toJSON()));
  P.empezar();
  check("empezar arma la guía del corto", doc.scene.produccion && doc.scene.produccion.etapas.length === 3);
  P.empezar();
  check("empezar otra vez no pisa la planilla", doc.history.undoStack.length === 1);
  P.tildar("pre", "guion", true);
  check("tildar deja el paso hecho con fecha", paso(doc.scene, "guion").estado === "hecho" && !!paso(doc.scene, "guion").fecha);
  P.enCurso("pre", "storyboard");
  P.anotar("pre", "storyboard", "Faltan las escenas 3 y 4");
  P.asignar("pre", "storyboard", "Mauro");
  P.agregar("prod", "Revisar con el equipo");
  const sc2 = reabrir(doc.scene);
  check("lo tildado SOBREVIVE a guardar y reabrir", paso(sc2, "guion").estado === "hecho");
  check("en curso, nota y quién sobreviven", paso(sc2, "storyboard").estado === "en-curso" && paso(sc2, "storyboard").nota === "Faltan las escenas 3 y 4" && paso(sc2, "storyboard").quien === "Mauro");
  const propio = sc2.produccion.etapas.find((e) => e.id === "prod").pasos.at(-1);
  check("un paso propio sobrevive", propio && propio.texto === "Revisar con el equipo" && /^propio-\d+$/.test(propio.id));
  const a = P.avance(doc.scene.produccion.etapas);
  check("el avance cuenta hechos y en curso", a.hechos === 1 && a.enCurso === 1 && a.total === 24 && a.porciento === 4, JSON.stringify(a));
  doc.history.undo(); doc.history.undo(); doc.history.undo(); doc.history.undo();
  check("Ctrl+Z deshace paso por paso (el storyboard vuelve a pendiente)", paso(doc.scene, "storyboard").estado === "pendiente" && !paso(doc.scene, "storyboard").nota);
  check("y lo de antes sigue (el guion hecho)", paso(doc.scene, "guion").estado === "hecho");
  doc.history.undo();
  check("otro Ctrl+Z destilda el guion", paso(doc.scene, "guion").estado === "pendiente");
  doc.history.redo();
  check("Ctrl+Shift+Z lo vuelve a tildar", paso(doc.scene, "guion").estado === "hecho");
  P.tildar("pre", "guion", false);
  check("destildar borra la fecha", paso(doc.scene, "guion").estado === "pendiente" && !paso(doc.scene, "guion").fecha);
  P.quitar("post", "copia");
  check("quitar saca el paso", !paso(doc.scene, "copia"));
  doc.history.undo();
  check("Ctrl+Z devuelve el paso quitado", !!paso(doc.scene, "copia"));
  P.renombrar("pre", "idea", "   ");
  check("renombrar con un texto vacío no hace nada", paso(doc.scene, "idea").texto === "Idea y sinopsis");
  const pasos = doc.history.undoStack.length;
  P.tildar("pre", "no-existe", true);
  check("un paso que no existe no ensucia el historial", doc.history.undoStack.length === pasos);
}

// ── 4. «Ir»: sólo los destinos conocidos ────────────────────────────────────
{
  let clic = "", abrio3d = 0;
  global.openL3d = () => { abrio3d++; };
  global.dzMenuAction = (act) => { clic = act; };
  check("Ir al storyboard pasa por el mismo camino que el menú", P.ir("menu:storyboard") === true && clic === "storyboard");
  check("Ir al 3D abre el estudio", P.ir("3d") === true && abrio3d === 1);
  clic = "";
  check("un destino fuera de la lista no ejecuta nada", P.ir("menu:borrar-documento") === false && clic === "");
}

// ── 5. sin documento ────────────────────────────────────────────────────────
{
  global.DZ = { doc: null };
  let aviso = "";
  global.dzSetStatus = (t) => { aviso = t; };
  P.empezar();
  check("sin documento se avisa en vez de fallar", /documento/.test(aviso));
}

console.log(`Planilla de producción: ${ok} bien, ${fallan} mal`);
process.exit(fallan ? 1 : 0);
