/* DESHACER COMO MÁQUINA DE ESTADOS — banco de pruebas del documento.
   Uso: node tools/run_undo_estado_tests.js

   Fase 1 del plan de implementación (oct-2026). No alcanza con que Ctrl+Z
   «parezca funcionar». Para CADA operación del tiempo y del dibujo se exige:

       estado S0 --operación--> S1
       deshacer  -> EXACTAMENTE S0      (la escena serializada, byte a byte)
       rehacer   -> EXACTAMENTE S1
       y otra vuelta, para que deshacer/rehacer no se gaste

   Además, después de cada paso, la INTEGRIDAD DIBUJO/EXPOSICIÓN:
   · ninguna celda apunta a un dibujo que no existe en el nivel de su capa;
   · no hay dos dibujos con el mismo número en un nivel;
   · las operaciones de TIEMPO (holds, pegar en el mismo nivel, timing) no
     crean dibujos: copiar exposiciones copia referencias, no material.

   Y un recorrido al azar (con semilla fija, reproducible): 300 operaciones
   seguidas, deshacer todas comprobando cada estado intermedio, rehacer todas.
   Por último guardar -> abrir: el documento vuelve idéntico.

   Mirar no es cambiar: leer el documento (la paleta, ir a un cuadro, elegir
   una capa) no puede modificar la escena ni dejar pasos en el historial. */
const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");

const root = path.resolve(__dirname, "..");
const files = [
  "ui/core/history.js", "ui/animation/palette.js", "ui/animation/coloring.js",
  "ui/animation/scene-model.js", "ui/animation/rig-policy.js", "ui/rigging/binding.js",
  "ui/animation/exposures.js", "ui/animation/onion.js", "ui/animation/mocap.js",
  "ui/animation/document.js",
];
global.window = global; global.self = global;
for (const rel of files) eval(fs.readFileSync(path.join(root, rel), "utf8"));
const A = global.LOW.animation;

const fallas = [];
let total = 0;
const prueba = (nombre, fn) => {
  total++;
  try { fn(); } catch (e) {
    const donde = e && !(e instanceof assert.AssertionError) && !/^(deshacer|rehacer|una operación|la operación|al deshacer|al rehacer|azar|abrir)/.test(e.message || "")
      ? " @ " + String(e.stack || "").split(String.fromCharCode(10)).slice(1, 4).map((l) => l.trim()).join(" < ") : "";
    fallas.push(nombre + " :: " + String(e && e.message || e).slice(0, 400) + donde);
  }
};

/* ── el documento de prueba: dos capas, holds, cambios de dibujo ─────────── */
const DIB = (n) => '<g data-low-art="colour"></g><g data-low-art="line"><path d="M' + (10 * n) +
  ' 10 L 200 ' + (20 * n) + '" stroke="#111"/></g>';
function fixture() {
  const doc = new A.LowDoc();
  doc.setHistory(new global.LOW.core.HistoryManager({ limit: 5000 }));
  doc.scene.setSize(1920, 1080);
  const ly = doc.scene.layers[0], lv = doc.scene.level(ly.levelId);
  // Capa 1: A A A B B B C C — holds y cambios de dibujo
  lv.addDrawing(1, DIB(1)); lv.addDrawing(2, DIB(2)); lv.addDrawing(3, DIB(3));
  [1, 1, 1, 2, 2, 2, 3, 3].forEach((n, i) => ly.setCell(i + 1, n));
  // Capa 2 con su propio nivel
  doc.addLayer("Capa 2");
  const ly2 = doc.scene.layers[1], lv2 = doc.scene.level(ly2.levelId);
  lv2.addDrawing(1, DIB(7)); lv2.addDrawing(2, DIB(8));
  [1, 1, 2, 2, null, 1].forEach((n, i) => ly2.setCell(i + 1, n));
  doc.selectLayer(ly.id); doc.goTo(1);
  doc.history.clear();
  return doc;
}
/* El ESTADO es la escena serializada, sin `revision`: es un contador de cambios
   que usa la composición para invalidar su caché (ui/composition/controller.js),
   y que suba también al DESHACER es lo correcto —hubo un cambio—. No es obra. */
const estado = (doc) => { const sc = doc.toJSON().scene; delete sc.revision; return JSON.stringify(sc); };
/* dónde difieren dos estados: la primera ruta distinta, para que el mensaje
   diga QUÉ no volvió y no un volcado de 3 KB */
function diferencia(a, b, ruta = "escena") {
  if (typeof a === "string" && typeof b === "string" && (a[0] === "{" || a[0] === "[")) { a = JSON.parse(a); b = JSON.parse(b); }
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a && b && typeof a === "object" && typeof b === "object") {
    const claves = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of claves) { const d = diferencia(a[k], b[k], ruta + "." + k); if (d) return d; }
  }
  return ruta + ": era " + String(JSON.stringify(b)).slice(0, 120) + " y quedó " + String(JSON.stringify(a)).slice(0, 120);
}
const igual = (actual, esperado, msg) => { if (actual !== esperado) throw Error(msg + " · " + diferencia(actual, esperado)); };
const dibujos = (doc) => doc.scene.levels.reduce((n, l) => n + l.drawings.length, 0);

function integridad(doc, donde) {
  for (const ly of doc.scene.layers) {
    const lv = doc.scene.level(ly.levelId);
    assert.ok(lv, donde + ": la capa «" + ly.name + "» apunta a un nivel que no existe");
    ly.cells.forEach((n, i) => {
      if (n == null) return;
      assert.ok(lv.byNumber(n), donde + ": la celda " + (i + 1) + " de «" + ly.name +
        "» apunta al dibujo " + n + ", que no existe en su nivel (celda colgada)");
    });
  }
  for (const lv of doc.scene.levels) {
    const nums = lv.drawings.map((d) => d.number);
    assert.equal(new Set(nums).size, nums.length, donde + ": dos dibujos con el mismo número en «" + lv.name + "»: " + nums);
  }
}

/* ── el contrato de UNA operación ─────────────────────────────────────── */
function contrato(nombre, op, { creaDibujos = true, sinCambio = false } = {}) {
  prueba(nombre, () => {
    const doc = fixture();
    integridad(doc, nombre + " (antes)");
    const s0 = estado(doc), d0 = dibujos(doc), h0 = doc.history.undoStack.length;
    const r = op(doc);
    const s1 = estado(doc);
    integridad(doc, nombre + " (después)");
    if (sinCambio) {
      igual(s1, s0, "una operación que sólo MIRA cambió la escena");
      assert.equal(doc.history.undoStack.length, h0, "una operación que sólo MIRA dejó un paso en el historial");
      return;
    }
    assert.ok(r !== false && r !== null, "la operación no se aplicó (devolvió " + r + ")");
    assert.notEqual(s1, s0, "la operación no cambió nada");
    const pasos = doc.history.undoStack.length - h0;
    assert.equal(pasos, 1, "la operación dejó " + pasos + " pasos en el historial: hacen falta " + pasos + " Ctrl+Z");
    if (!creaDibujos) assert.ok(dibujos(doc) <= d0, "una operación de TIEMPO creó dibujos (" + d0 + " -> " + dibujos(doc) + "): copió material en vez de referencias");
    for (let vuelta = 1; vuelta <= 2; vuelta++) {
      assert.ok(doc.history.undo(), "no hay nada para deshacer");
      integridad(doc, nombre + " (deshecho)");
      igual(estado(doc), s0, "deshacer no devolvió EXACTAMENTE el estado anterior (vuelta " + vuelta + ")");
      assert.ok(doc.history.redo(), "no hay nada para rehacer");
      integridad(doc, nombre + " (rehecho)");
      igual(estado(doc), s1, "rehacer no devolvió EXACTAMENTE el estado posterior (vuelta " + vuelta + ")");
    }
  });
}

const capa = (doc, i) => doc.scene.layers[i];
const rango = (doc, a, b, f, t) => ({ fromLayerId: capa(doc, a).id, toLayerId: capa(doc, b).id, from: f, to: t });

// ── dibujar ──
contrato("dibujar en una celda con dibujo", (d) => d.writeDrawing(DIB(9)), { creaDibujos: false });
contrato("dibujar en una celda vacía (crea el dibujo)", (d) => { d.goTo(12); return d.writeDrawing(DIB(9)); });
// ── exponer ──
contrato("exponer un dibujo existente en una celda", (d) => d.setCell(10, 2), { creaDibujos: false });
contrato("vaciar una celda", (d) => d.setCell(2, null), { creaDibujos: false });
// BUG hallado por el recorrido al azar (oct-2026): exponer un número que no
// existe CREA el dibujo (scene.expose -> lv.addDrawing), pero el paso del
// historial sólo guardaba las celdas: deshacer dejaba el dibujo huérfano.
contrato("exponer un número de dibujo que no existe (lo crea)", (d) => d.setCell(10, 9));
contrato("cambiar el dibujo de una celda", (d) => d.setCell(1, 3), { creaDibujos: false });
// ── timing (exposures) ──
for (const [op, args] of [["step", [1, 8, 2]], ["each", [1, 8, 2]], ["stepChange", [4, 1]], ["insert", [3, 2]],
  ["clear", [2, 4]], ["remove", [2, 3]], ["move", [4, 6, 10]], ["repeat", [1, 3, 2]], ["reverse", [1, 8]],
  ["swing", [1, 8]], ["resetStep", [1, 8]], ["dedupe", [1, 8]], ["fillHandle", [1, 3, 12]]])
  contrato("timing «" + op + "»", (d) => d.apply(op, ...args), { creaDibujos: false });
// operaciones de VARIOS CUADROS (menú contextual de la línea de tiempo, oct-2026)
contrato("duplicar los dibujos de una selección (A A A B -> copias)", (d) => {
  const lv = d.level, antes = lv.drawings.length, n = d.duplicateDrawingsInRange(rango(d, 0, 0, 1, 4));
  // A A A B: dos dibujos distintos -> dos copias, y los holds comparten su copia
  assert.equal(n, 2, "tenía que duplicar 2 dibujos (A y B), duplicó " + n);
  assert.equal(lv.drawings.length, antes + 2);
  const c = capa(d, 0).cells.slice(0, 4);
  assert.ok(c[0] === c[1] && c[1] === c[2] && c[2] !== c[3] && ![1, 2].includes(c[0]), "las celdas no exponen las copias, o el hold dejó de compartir: " + c);
  return n;
});
contrato("un dibujo nuevo en cada celda vacía de la selección", (d) => {
  const n = d.blankDrawingsInEmptyCells(rango(d, 0, 1, 7, 10));
  // Capa 1: F9,F10 vacías; Capa 2: F7..F10 vacías salvo F6 -> 2 + 4
  assert.equal(n, 6, "tenía que crear 6 dibujos, creó " + n);
  return n;
});
contrato("insertar celdas en blanco antes de la selección (2 capas)", (d) => {
  const c1 = capa(d, 0).cells.slice(), ok = d.insertCellsInRange(rango(d, 0, 1, 2, 4));
  // 3 celdas en blanco antes del F2, en las dos capas; lo de F2 en adelante se corre 3
  const ahora = capa(d, 0).cells;
  assert.ok(ahora[1] == null && ahora[2] == null && ahora[3] == null && ahora[4] === c1[1], "no insertó 3 celdas en blanco en F2: " + ahora);
  return ok;
}, { creaDibujos: false });
// BUG del LOW.exe 3.2.2 (oct-2026): arrastrar una selección movía sólo el hold
// que estaba bajo el puntero y lo soltaba un bloque antes (1-2-3-4 -> 2-3-1-4).
contrato("mover una selección de dos capas (Alt+arrastrar)", (d) => {
  const c1 = capa(d, 0).cells.slice(0, 3), c2 = capa(d, 1).cells.slice(0, 3);
  const ok = d.moveCellsInRange(rango(d, 0, 1, 1, 3), 7);
  // el bloque F1..F3 de las dos capas queda en F8..F10; lo que seguía se corre hacia atrás
  assert.deepEqual(capa(d, 0).cells.slice(7, 10), c1, "la Capa 1 no quedó en F8..F10: " + capa(d, 0).cells);
  assert.deepEqual(capa(d, 1).cells.slice(7, 10), c2, "la Capa 2 no quedó en F8..F10: " + capa(d, 1).cells);
  assert.deepEqual(capa(d, 0).cells.slice(0, 5), [2, 2, 2, 3, 3], "lo que seguía no se corrió: " + capa(d, 0).cells);
  return ok;
}, { creaDibujos: false });
contrato("mover una selección hacia atrás no la pasa del cuadro 1", (d) => {
  const ok = d.moveCellsInRange(rango(d, 0, 0, 4, 6), -10);
  assert.deepEqual(capa(d, 0).cells.slice(0, 8), [2, 2, 2, 1, 1, 1, 3, 3], "el bloque no quedó al principio: " + capa(d, 0).cells);
  return ok;
}, { creaDibujos: false });
contrato("timing en varias capas a la vez", (d) => d.applySelectedTiming("step", rango(d, 0, 1, 1, 6), 3), { creaDibujos: false });
contrato("vaciar un rango de dos capas", (d) => d.clearCells(rango(d, 0, 1, 2, 5)), { creaDibujos: false });
contrato("copiar y pegar exposiciones en la MISMA capa", (d) => d.pasteCells(d.readCells(rango(d, 0, 0, 1, 6)), capa(d, 0).id, 20), { creaDibujos: false });
contrato("pegar insertando", (d) => d.pasteCells(d.readCells(rango(d, 0, 0, 1, 3)), capa(d, 0).id, 2, { insert: true }), { creaDibujos: false });
contrato("exponer dibujos del nivel", (d) => d.exposeDrawings(capa(d, 0).levelId, [3, 1], capa(d, 0).id, 15), { creaDibujos: false });
contrato("rango de reproducción", (d) => d.setPlaybackRange(2, 6), { creaDibujos: false });
// ── dibujos (el material) ──
contrato("crear un dibujo vacío en la celda", (d) => { d.goTo(4); return d.createBlankDrawing(); });
contrato("duplicar el dibujo de la celda", (d) => { d.goTo(4); return d.createBlankDrawing(true); });
contrato("duplicar un dibujo del nivel", (d) => d.duplicateDrawing(2));
contrato("renumerar un dibujo", (d) => d.renumberDrawing(2, 7), { creaDibujos: false });
contrato("borrar un dibujo (y sus exposiciones)", (d) => d.deleteDrawing(2), { creaDibujos: false });
// ── capas ──
contrato("agregar una capa", (d) => d.addLayer("Nueva"));
contrato("borrar una capa", (d) => d.removeLayer(capa(d, 1).id));
contrato("duplicar una capa", (d) => d.duplicateLayer(capa(d, 0).id));
contrato("mover una capa", (d) => d.moveLayer(capa(d, 0).id, 1), { creaDibujos: false });
for (const [k, v] of [["name", "Otra"], ["visible", false], ["locked", true], ["opacity", 0.5], ["blend", "multiply"], ["lightTable", true]])
  contrato("propiedad de capa «" + k + "»", (d) => d.setLayerProperty(capa(d, 0).id, k, v), { creaDibujos: false });
contrato("renombrar el nivel", (d) => d.renameLevel(capa(d, 0).levelId, "Personaje"), { creaDibujos: false });
// ── mirar no es cambiar ──
contrato("ir a otro cuadro", (d) => d.goTo(5), { sinCambio: true });
contrato("elegir otra capa", (d) => d.selectLayer(capa(d, 1).id), { sinCambio: true });
contrato("leer la paleta del nivel", (d) => d.palette, { sinCambio: true });
contrato("leer un rango de celdas", (d) => d.readCells(rango(d, 0, 1, 1, 8)), { sinCambio: true });

/* ── el recorrido al azar: 300 operaciones, todo hacia atrás, todo adelante ── */
prueba("recorrido al azar de 300 operaciones", () => {
  let semilla = 20261004;
  const azar = () => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla / 2147483648; };
  const entero = (a, b) => a + Math.floor(azar() * (b - a + 1));
  const doc = fixture();
  const ops = [
    (d) => { d.goTo(entero(1, 14)); return d.writeDrawing(DIB(entero(1, 99))); },
    (d) => d.setCell(entero(1, 14), entero(0, 3) || null),
    (d) => d.apply("step", entero(1, 4), entero(5, 10), entero(1, 3)),
    (d) => d.apply("insert", entero(1, 8), entero(1, 2)),
    (d) => d.apply("remove", entero(1, 6), entero(6, 8)),
    (d) => d.apply("reverse", 1, entero(3, 10)),
    (d) => d.clearCells(rango(d, 0, Math.min(1, d.scene.layers.length - 1), entero(1, 4), entero(4, 9))),
    (d) => d.pasteCells(d.readCells(rango(d, 0, 0, 1, entero(2, 5))), capa(d, 0).id, entero(1, 15)),
    (d) => { d.goTo(entero(1, 10)); return d.createBlankDrawing(azar() < 0.5); },
    (d) => { const lv = d.level; const nums = lv ? lv.drawings.map((x) => x.number) : []; return nums.length > 1 ? d.deleteDrawing(nums[entero(0, nums.length - 1)]) : false; },
    (d) => d.setLayerProperty(capa(d, 0).id, "opacity", entero(1, 10) / 10),
    (d) => d.selectLayer(capa(d, entero(0, d.scene.layers.length - 1)).id),
    (d) => { const a = entero(1, 6); return d.moveCellsInRange(rango(d, 0, Math.min(1, d.scene.layers.length - 1), a, a + entero(0, 3)), entero(-4, 6)); },
  ];
  const estados = [estado(doc)], quien = [null];
  const NOMBRES = ["dibujar", "exponer", "step", "insertar", "quitar", "invertir", "vaciar rango",
    "pegar", "dibujo vacío/duplicado", "borrar dibujo", "opacidad", "elegir capa", "mover selección"];
  for (let i = 0; i < 300; i++) {
    const h0 = doc.history.undoStack.length;
    const k = entero(0, ops.length - 1);
    ops[k](doc);
    integridad(doc, "azar paso " + i);
    const h1 = doc.history.undoStack.length;
    if (h1 > h0) { estados.push(estado(doc)); quien.push(NOMBRES[k]); }
    else igual(estado(doc), estados.at(-1), "azar paso " + i + ": la escena cambió SIN dejar paso en el historial (no se puede deshacer)");
  }
  for (let i = estados.length - 1; i > 0; i--) {
    assert.ok(doc.history.undo(), "faltan pasos para deshacer");
    igual(estado(doc), estados[i - 1], "al deshacer «" + quien[i] + "» (paso " + i + ") el estado no es el que era");
  }
  for (let i = 1; i < estados.length; i++) {
    assert.ok(doc.history.redo(), "faltan pasos para rehacer");
    igual(estado(doc), estados[i], "al rehacer hacia adelante, el estado " + i + " no es el que era");
  }
});

/* ── guardar -> abrir: idéntico ───────────────────────────────────────── */
prueba("guardar y abrir devuelve el mismo documento", () => {
  const doc = fixture();
  doc.apply("step", 1, 8, 2); doc.goTo(9); doc.writeDrawing(DIB(5)); doc.setPlaybackRange(1, 10);
  doc.setLayerProperty(capa(doc, 1).id, "blend", "multiply");
  // `savedAt` es la hora de guardado: se compara todo lo demás
  const sinHora = (o) => { const c = JSON.parse(JSON.stringify(o)); delete c.savedAt; return JSON.stringify(c); };
  const texto = JSON.stringify(doc.toJSON());
  const otro = A.LowDoc.fromJSON(JSON.parse(texto));
  igual(sinHora(otro.toJSON()), sinHora(JSON.parse(texto)), "abrir lo guardado no reproduce el mismo documento");
  igual(sinHora(A.LowDoc.fromJSON(texto).toJSON()), sinHora(JSON.parse(texto)), "abrir desde el texto del archivo no da lo mismo");
  // y guardar lo abierto da el mismo archivo: abrir y volver a guardar no cambia la obra
  igual(sinHora(A.LowDoc.fromJSON(JSON.stringify(otro.toJSON())).toJSON()), sinHora(JSON.parse(texto)), "abrir, guardar y abrir de nuevo cambia el documento");
});

/* ── ESCENA DE TORTURA B: 100 dibujos, 1000 exposiciones en 4 capas ──────
   Lo mismo a escala de producción, y MIDIENDO: el tamaño de la escena no puede
   convertir una operación normal en una peligrosa (ni en una lenta). */
const tiempos = {};
prueba("escena de tortura: 100 dibujos / 1000 exposiciones", () => {
  const doc = new A.LowDoc();
  doc.setHistory(new global.LOW.core.HistoryManager({ limit: 5000 }));
  for (let c = 1; c < 4; c++) doc.addLayer("Capa " + (c + 1));
  doc.scene.layers.forEach((ly, c) => {
    const lv = doc.scene.level(ly.levelId);
    for (let n = 1; n <= 25; n++) lv.addDrawing(n, DIB(n + c * 25) + "<!--" + "x".repeat(400) + "-->");
    for (let f = 1; f <= 250; f++) ly.setCell(f, ((Math.floor((f - 1) / 2) + c) % 25) + 1);   // en 2s
  });
  doc.history.clear();
  assert.equal(dibujos(doc), 100);
  assert.equal(doc.scene.layers.reduce((n, l) => n + l.cells.filter((x) => x != null).length, 0), 1000);
  integridad(doc, "tortura (montaje)");
  const medir = (nombre, fn) => { const t0 = process.hrtime.bigint(); const r = fn(); tiempos[nombre] = Number(process.hrtime.bigint() - t0) / 1e6; return r; };
  const s0 = estado(doc);
  medir("timing en 4 capas × 250 cuadros", () => doc.applySelectedTiming("step", rango(doc, 0, 3, 1, 250), 3));
  const s1 = estado(doc);
  assert.notEqual(s1, s0);
  medir("deshacer", () => doc.history.undo()); igual(estado(doc), s0, "tortura: deshacer el timing");
  medir("rehacer", () => doc.history.redo()); igual(estado(doc), s1, "tortura: rehacer el timing");
  // en la MISMA capa (mismo nivel): copiar exposiciones copia referencias. Pegar
  // en una capa de OTRO nivel sí copia material, y es lo correcto —el dibujo
  // pertenece a su nivel—; eso lo cubre «exponer dibujos del nivel» arriba.
  medir("pegar 250 exposiciones", () => doc.pasteCells(doc.readCells(rango(doc, 0, 0, 1, 250)), capa(doc, 0).id, 251));
  assert.equal(dibujos(doc), 100, "pegar exposiciones en la escena grande creó dibujos");
  integridad(doc, "tortura (pegado)");
  const texto = medir("guardar (serializar)", () => JSON.stringify(doc.toJSON()));
  const otro = medir("abrir (leer)", () => A.LowDoc.fromJSON(texto));
  igual(JSON.stringify(otro.toJSON().scene), JSON.stringify(JSON.parse(texto).scene), "tortura: abrir lo guardado no es idéntico");
  tiempos["tamaño del archivo (KB)"] = Math.round(texto.length / 1024);
  for (const [k, ms] of Object.entries(tiempos))
    if (!/KB/.test(k)) assert.ok(ms < 1500, "«" + k + "» tardó " + Math.round(ms) + " ms con 1000 exposiciones");
});

console.log("UNDO COMO MÁQUINA DE ESTADOS: " + total + " pruebas, " + (total - fallas.length) + " bien, " + fallas.length + " fallan");
if (Object.keys(tiempos).length) console.log("tortura B: " + Object.entries(tiempos).map(([k, v]) => k + " " + (/KB/.test(k) ? v : v.toFixed(1) + " ms")).join(" · "));
if (fallas.length) { fallas.forEach((f) => console.error("FALLA: " + f)); process.exit(1); }
