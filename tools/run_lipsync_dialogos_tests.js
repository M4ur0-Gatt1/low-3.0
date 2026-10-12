/* Diálogos del lipsync desde el texto que se PISAN (ui/animation/document.js).

   Pendiente que quedó de la v3.21: un diálogo nuevo encima de otro dejaba al
   viejo con su tramo entero. Después, quitar (o rehacer) el viejo borraba las
   bocas del NUEVO que caían en ese tramo. Ahora el viejo se recorta: cubierto
   entero se va, si sobresale se achica, y si el nuevo cae en el medio queda en
   dos partes, cada una con sus claves.
   Uso: node tools/run_lipsync_dialogos_tests.js */
const fs = require("fs");
const path = require("path");
const root = path.resolve(__dirname, "..");
global.window = global; global.self = global;
for (const rel of ["ui/core/history.js", "ui/animation/palette.js", "ui/animation/scene-model.js", "ui/animation/rig-policy.js",
  "ui/rigging/binding.js", "ui/animation/exposures.js", "ui/animation/onion.js", "ui/animation/document.js"]) {
  // eslint-disable-next-line no-eval
  (0, eval)(fs.readFileSync(path.join(root, rel), "utf8"));
}
const A = global.LOW.animation;
let fallas = 0, n = 0;
const ok = (c, m, d) => { n++; if (!c) { fallas++; console.log("FALLA " + m + (d !== undefined ? " :: " + JSON.stringify(d) : "")); } };

function nuevoDoc() {
  const doc = new A.LowDoc();
  if (A.HistoryManager && !doc.history) doc.history = new A.HistoryManager();
  if (!doc.history && global.LOW.core && global.LOW.core.HistoryManager) doc.history = new global.LOW.core.HistoryManager();
  const rig = doc.scene.rig;
  rig.slots.boca = { id: "boca", name: "Boca", boneId: null, drawOrder: 0, activeAttachmentId: "a:cerrada", visible: true };
  for (const k of ["cerrada", "abierta", "o", "m"]) rig.attachments["a:" + k] = { id: "a:" + k, slotId: "boca", type: "drawing", elementId: k };
  return doc;
}
/** Claves de un diálogo: una boca por cuadro, distinta de la del otro diálogo. */
const claves = (desde, hasta, boca) => { const k = {}; for (let f = desde; f <= hasta; f++) k[f] = boca; return k; };
const bocasEn = (doc, desde, hasta) => { const sw = (doc.scene.rig.switches || {}).boca, out = []; for (let f = desde; f <= hasta; f++) out.push(sw && sw.keys[f] || null); return out; };

// ── 1. el nuevo cae en el MEDIO del viejo: el viejo queda en dos partes
let doc = nuevoDoc();
doc.applyLipsyncTexto("boca", { id: "d1", texto: "hola qué tal cómo andás", inicio: 1, fin: 40 }, claves(1, 40, "a:abierta"));
doc.applyLipsyncTexto("boca", { id: "d2", texto: "bien", inicio: 15, fin: 22 }, claves(15, 22, "a:o"));
let ds = doc.lipsyncTexto("boca").dialogos;
ok(ds.d1 && ds.d1.inicio === 1 && ds.d1.fin === 14, "el viejo queda hasta antes del nuevo", ds.d1);
const cola = Object.values(ds).find((d) => d.id !== "d1" && d.id !== "d2");
ok(cola && cola.inicio === 23 && cola.fin === 40 && cola.texto === ds.d1.texto, "la cola del viejo queda como otra parte, con su texto", cola);
ok(ds.d2 && ds.d2.inicio === 15 && ds.d2.fin === 22, "el nuevo queda entero", ds.d2);
// quitar el viejo ya no toca las bocas del nuevo
doc.removeLipsyncTexto("boca", "d1");
ok(bocasEn(doc, 15, 22).every((b) => b === "a:o"), "quitar el viejo NO borra las bocas del nuevo", bocasEn(doc, 15, 22));
ok(bocasEn(doc, 1, 14).every((b) => b === null), "quitar el viejo saca sus bocas de antes del nuevo", bocasEn(doc, 1, 14));
ok(bocasEn(doc, 23, 40).every((b) => b === "a:abierta"), "la cola del viejo sigue (es otra parte)", bocasEn(doc, 23, 40));
doc.removeLipsyncTexto("boca", cola.id);
ok(bocasEn(doc, 23, 40).every((b) => b === null) && bocasEn(doc, 15, 22).every((b) => b === "a:o"), "quitar la cola saca sólo lo suyo", { cola: bocasEn(doc, 23, 25), nuevo: bocasEn(doc, 15, 17) });

// ── 2. el nuevo tapa el FINAL del viejo: el viejo se achica
doc = nuevoDoc();
doc.applyLipsyncTexto("boca", { id: "d1", texto: "uno", inicio: 1, fin: 20 }, claves(1, 20, "a:abierta"));
doc.applyLipsyncTexto("boca", { id: "d2", texto: "dos", inicio: 15, fin: 30 }, claves(15, 30, "a:o"));
ds = doc.lipsyncTexto("boca").dialogos;
ok(ds.d1.inicio === 1 && ds.d1.fin === 14 && Object.keys(ds).length === 2, "el viejo se achica hasta el nuevo", ds);
doc.applyLipsyncTexto("boca", { ...ds.d1 }, claves(1, 14, "a:m"));          // rehacer el viejo
ok(bocasEn(doc, 15, 30).every((b) => b === "a:o"), "rehacer el viejo NO pisa las bocas del nuevo", bocasEn(doc, 15, 20));

// ── 3. el nuevo tapa el COMIENZO del viejo
doc = nuevoDoc();
doc.applyLipsyncTexto("boca", { id: "d1", texto: "uno", inicio: 10, fin: 30 }, claves(10, 30, "a:abierta"));
doc.applyLipsyncTexto("boca", { id: "d2", texto: "dos", inicio: 5, fin: 18 }, claves(5, 18, "a:o"));
ds = doc.lipsyncTexto("boca").dialogos;
ok(ds.d1.inicio === 19 && ds.d1.fin === 30, "el viejo empieza después del nuevo", ds.d1);

// ── 4. el nuevo cubre ENTERO al viejo: el viejo se va
doc = nuevoDoc();
doc.applyLipsyncTexto("boca", { id: "d1", texto: "uno", inicio: 10, fin: 20 }, claves(10, 20, "a:abierta"));
doc.applyLipsyncTexto("boca", { id: "d2", texto: "dos", inicio: 5, fin: 25 }, claves(5, 25, "a:o"));
ds = doc.lipsyncTexto("boca").dialogos;
ok(!ds.d1 && ds.d2, "un diálogo cubierto entero se va", Object.keys(ds));

// ── 5. sin superposición, nada cambia; y rehacer EL MISMO diálogo no se recorta a sí mismo
doc = nuevoDoc();
doc.applyLipsyncTexto("boca", { id: "d1", texto: "uno", inicio: 1, fin: 10 }, claves(1, 10, "a:abierta"));
doc.applyLipsyncTexto("boca", { id: "d2", texto: "dos", inicio: 11, fin: 20 }, claves(11, 20, "a:o"));
doc.applyLipsyncTexto("boca", { id: "d1", texto: "uno bis", inicio: 1, fin: 10 }, claves(1, 10, "a:m"));
ds = doc.lipsyncTexto("boca").dialogos;
ok(ds.d1.inicio === 1 && ds.d1.fin === 10 && ds.d2.inicio === 11 && ds.d2.fin === 20 && Object.keys(ds).length === 2, "sin superposición no se recorta nada", ds);

// ── 6. un paso de Ctrl+Z devuelve el viejo entero
doc = nuevoDoc();
doc.applyLipsyncTexto("boca", { id: "d1", texto: "uno", inicio: 1, fin: 40 }, claves(1, 40, "a:abierta"));
doc.applyLipsyncTexto("boca", { id: "d2", texto: "dos", inicio: 15, fin: 22 }, claves(15, 22, "a:o"));
if (doc.history && doc.history.undo) {
  doc.history.undo();
  ds = doc.lipsyncTexto("boca").dialogos;
  ok(ds.d1 && ds.d1.fin === 40 && !ds.d2 && Object.keys(ds).length === 1, "Ctrl+Z devuelve el viejo entero y saca el nuevo", ds);
}

console.log(fallas ? `FALLAS: ${fallas} de ${n}` : `DIÁLOGOS DEL LIPSYNC OK: ${n} casos`);
process.exit(fallas ? 1 : 0);
