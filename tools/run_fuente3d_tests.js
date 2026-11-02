/* EL ORIGEN 3D DE LAS CAPAS — el vínculo vivo entre el estudio 3D y el 2D.
 *
 * Hasta v3.55 el 3D le mandaba al 2D imágenes y nada más: el .low no sabía de
 * qué proyecto 3D salió un fondo, así que cambiar la calle en el 3D obligaba a
 * rearmar y volver a mandar todo a mano. Ahora cada envío trae su ORIGEN (el
 * proyecto 3D y los ajustes del envío), el nivel lo guarda, y desde el 2D se
 * vuelve a abrir en el 3D para «Actualizar».
 *
 * Lo que más se prueba es lo que ya mordió tres veces en el rig: un campo nuevo
 * que funciona en memoria y SE PIERDE AL GUARDAR. Todo pasa por la ida y vuelta
 * por JSON, y por Deshacer/Rehacer.
 *
 * Uso: node tools/run_fuente3d_tests.js
 */
const fs = require("fs");
const path = require("path");

global.window = global;
const oyentes = [];
global.addEventListener = (tipo, fn) => { if (tipo === "message") oyentes.push(fn); };
for (const rel of ["core/history.js", "animation/scene-model.js", "animation/exposures.js",
  "animation/onion.js", "rigging/binding.js", "animation/document.js"]) {
  const p = path.join(__dirname, "..", "ui", rel);
  if (fs.existsSync(p)) eval(fs.readFileSync(p, "utf8"));
}
const A = global.LOW.animation, { LowDoc } = A;

let ok = 0, fallan = 0;
const check = (nombre, cond, detalle = "") => {
  if (cond) { ok++; return; }
  fallan++;
  console.log("FALLA: " + nombre + (detalle ? "  :: " + detalle : ""));
};

function docNuevo() {
  const doc = new LowDoc();
  doc.setHistory(new global.LOW.core.HistoryManager());
  return doc;
}
/** Guardar y reabrir: lo único que dice si un campo sobrevive al archivo. */
const reabrir = (sc) => new A.Scene(JSON.parse(JSON.stringify(sc.toJSON())));
const proyecto = (n) => JSON.stringify({ format: "low3d", version: 1, strokes: Array.from({ length: n }, (_, i) => ({ id: "stroke-" + i })) });
const img = (marca) => `<image data-low="${marca}" href="data:image/png;base64,AAAA" x="0" y="0" width="1920" height="1080"/>`;
const nivelDe = (sc, nombre) => sc.levels.find((l) => l.name.includes(nombre));

// ── 1. el normalizador ──────────────────────────────────────────────────────
{
  const k = A.claveProyecto3D(proyecto(2));
  check("la clave tiene la forma esperada", /^p[0-9a-f]{8}-[0-9a-z]+$/.test(k), k);
  check("el mismo proyecto da la misma clave", A.claveProyecto3D(proyecto(2)) === k);
  check("otro proyecto da otra clave", A.claveProyecto3D(proyecto(3)) !== k);
  check("sin tipo conocido no hay origen", A.fuente3dData({ tipo: "hoja", proyecto: k }) === null);
  check("sin clave válida no hay origen", A.fuente3dData({ tipo: "toma", proyecto: "../x" }) === null);
  const f = A.fuente3dData({ tipo: "toma", proyecto: k, nombre: "x".repeat(200), params: { cada: 9, formato: "gif", calidad: 3, cajas: "si" } });
  check("los ajustes de la toma se acotan", f && f.params.cada === 4 && f.params.formato === "jpg" && f.params.calidad === 50 && f.params.cajas === false,
    JSON.stringify(f && f.params));
  check("el nombre se recorta", f && f.nombre.length === 60);
  const p = A.fuente3dData({ tipo: "planos", proyecto: k, params: { planos: 40 } });
  check("los planos se acotan a 8", p && p.params.planos === 8);
  check("un ajuste que no es del tipo no se guarda", p && !("cada" in p.params));
}

// ── 2. encuadre: el origen viaja con el nivel ──────────────────────────────
{
  const doc = docNuevo(), sc = doc.scene;
  const k = sc.guardarProyecto3D(proyecto(4));
  doc.setLayout3D(img("layout-3d"), { fuente: { tipo: "encuadre", proyecto: k, nombre: "Layout 3D", params: { cajas: true } } });
  const lv = nivelDe(sc, "Layout 3D");
  check("el nivel del encuadre lleva su origen", lv && lv.fuente3d && lv.fuente3d.tipo === "encuadre" && lv.fuente3d.params.cajas === true);
  const sc2 = reabrir(sc), lv2 = nivelDe(sc2, "Layout 3D");
  check("el origen SOBREVIVE a guardar y reabrir", lv2 && lv2.fuente3d && lv2.fuente3d.proyecto === k);
  check("el proyecto 3D SOBREVIVE a guardar y reabrir", sc2.proyectos3d[k] === proyecto(4));
  doc.history.undo();
  check("Ctrl+Z saca el nivel del encuadre", !nivelDe(sc, "Layout 3D"));
  doc.history.redo();
  const lv3 = nivelDe(doc.scene, "Layout 3D");
  check("Ctrl+Shift+Z lo devuelve CON su origen", lv3 && lv3.fuente3d && lv3.fuente3d.proyecto === k);
  check("y el proyecto sigue ahí después del Ctrl+Z", !!doc.scene.proyectos3d[k]);
  // volver a mandar sin origen (un estudio anterior) no borra el que había
  doc.setLayout3D(img("layout-3d"));
  check("un envío sin origen conserva el origen anterior", nivelDe(doc.scene, "Layout 3D").fuente3d.proyecto === k);
}

// ── 3. toma: volver a mandar la misma toma reemplaza y actualiza el origen ─
{
  const doc = docNuevo(), sc = doc.scene;
  const k1 = sc.guardarProyecto3D(proyecto(1));
  const items = [{ cuadro: 1, content: img("toma-3d") }, { cuadro: 3, content: img("toma-3d") }];
  doc.setToma3D("Calle", items, { hasta: 6, fuente: { tipo: "toma", proyecto: k1, nombre: "Calle", params: { cada: 2 } } });
  const k2 = sc.guardarProyecto3D(proyecto(5));
  doc.setToma3D("Calle", items, { hasta: 6, fuente: { tipo: "toma", proyecto: k2, nombre: "Calle", params: { cada: 2 } } });
  const tomas = sc.levels.filter((l) => l.fuente3d && l.fuente3d.tipo === "toma");
  check("actualizar la toma no apila capas", tomas.length === 1, String(tomas.length));
  check("el origen pasa al proyecto nuevo", tomas[0] && tomas[0].fuente3d.proyecto === k2);
  const guardado = sc.toJSON();
  check("al guardar queda sólo el proyecto que se usa", guardado.proyectos3d && Object.keys(guardado.proyectos3d).join() === k2,
    Object.keys(guardado.proyectos3d || {}).join());
  doc.history.undo();
  check("Ctrl+Z vuelve al origen anterior", sc.levels.find((l) => l.fuente3d && l.fuente3d.tipo === "toma").fuente3d.proyecto === k1);
  check("y su proyecto todavía está", !!sc.proyectos3d[k1]);
}

// ── 4. planos: cada plano apunta al mismo proyecto, guardado una vez ───────
{
  const doc = docNuevo(), sc = doc.scene;
  const k = sc.guardarProyecto3D(proyecto(7));
  sc.guardarProyecto3D(proyecto(7));
  doc.setPlanos3D("Multiplano", [{ z: 200, content: img("plano-3d") }, { z: 0, content: img("plano-3d") }],
    { fuente: { tipo: "planos", proyecto: k, nombre: "Multiplano", params: { planos: 2 } } });
  const planos = sc.levels.filter((l) => l.fuente3d && l.fuente3d.tipo === "planos");
  check("todos los planos llevan el origen", planos.length === 2);
  const g = reabrir(sc).toJSON();
  check("el mismo proyecto se guarda una sola vez", Object.keys(g.proyectos3d || {}).length === 1);
  check("los planos reabiertos conservan sus ajustes", reabrir(sc).levels.filter((l) => l.fuente3d).every((l) => l.fuente3d.params.planos === 2));
}

// ── 5. una escena sin nada del 3D no cambia su archivo ─────────────────────
{
  const doc = docNuevo();
  doc.scene.guardarProyecto3D(proyecto(2));   // guardado pero sin ningún nivel que lo use
  check("sin niveles del 3D no se escribe proyectos3d", !("proyectos3d" in doc.scene.toJSON()));
  check("un nivel común no escribe fuente3d", doc.scene.levels.every((l) => !("fuente3d" in l.toJSON())));
}

// ── 6. el puente (layout-3d.js): encuadre en UN Ctrl+Z, y Editar en el 3D ──
{
  const doc = docNuevo();
  const enviados = [];
  const ventana = { postMessage: (m) => enviados.push(m) };
  const marco = { contentWindow: ventana };
  let abierto = 0, cerrado = 0;
  global.DZ = { doc };
  global.document = { getElementById: (id) => (id === "l3dFrame" ? marco : null) };
  global.openL3d = () => { abierto++; };
  global.closeL3d = () => { cerrado++; };
  global.dzPerspectivaDesde3D = (vps, extra) => doc.setPerspective({ ...doc.scene.perspective, vps, origen: "3d", camara: extra.ajustes || null },
    { label: "Perspectiva desde el estudio 3D" });
  eval(fs.readFileSync(path.join(__dirname, "..", "ui", "animation", "layout-3d.js"), "utf8"));
  const L = global.LOW.animation.layout3d;
  const mensaje = (data) => oyentes.forEach((fn) => fn({ source: ventana, data }));
  check("recibirHoja se exporta como los otros", typeof L.recibirHoja === "function");

  const pasos = doc.history.undoStack.length;
  mensaje({ type: "low:send-to-2d", png: "data:image/png;base64,AAAA", width: 1920, height: 1080,
    vps: [{ x: 10, y: 500, eje: "x" }, { x: 1900, y: 500, eje: "z" }], ajustes: { lente: 35 },
    origen: { proyecto: proyecto(3), params: { cajas: false } } });
  check("el estudio recibe el ok del encuadre", enviados.some((m) => m.type === "low:sent-to-2d" && m.ok));
  check("el encuadre es UN paso de Ctrl+Z (antes eran dos)", doc.history.undoStack.length === pasos + 1, String(doc.history.undoStack.length - pasos));
  check("los puntos de fuga llegaron", doc.scene.perspective.vps.length === 2);
  const capa = doc.scene.layers.find((l) => nivelDe(doc.scene, "Layout 3D") && l.levelId === nivelDe(doc.scene, "Layout 3D").id);
  check("la capa del encuadre se puede editar en el 3D", !!(capa && L.fuenteDeCapa(capa.id)));
  doc.history.undo();
  check("un solo Ctrl+Z saca el calco Y los puntos de fuga", !nivelDe(doc.scene, "Layout 3D") && doc.scene.perspective.vps.length === 0);
  doc.history.redo();

  // Editar en el 3D: el estudio todavía no avisó que está listo → espera
  enviados.length = 0;
  const capa2 = doc.scene.layers.find((l) => l.levelId === nivelDe(doc.scene, "Layout 3D").id);
  check("editar abre el estudio", L.editar(capa2.id) === true && abierto === 1);
  check("no se manda nada antes de que el estudio esté listo", !enviados.some((m) => m.type === "low:editar-fuente"));
  mensaje({ type: "low:estudio-listo" });
  const ed = enviados.find((m) => m.type === "low:editar-fuente");
  check("con el estudio listo llega el proyecto a editar", ed && ed.proyecto === proyecto(3) && ed.tipo === "encuadre" && ed.capa === capa2.name,
    JSON.stringify(ed && { tipo: ed.tipo, capa: ed.capa }));
  enviados.length = 0;
  L.editar(capa2.id);
  check("ya listo, la segunda vez se manda enseguida", enviados.some((m) => m.type === "low:editar-fuente"));
  const comun = doc.scene.layers.find((l) => !nivelDe(doc.scene, "Layout 3D") || l.levelId !== nivelDe(doc.scene, "Layout 3D").id);
  check("una capa que no vino del 3D no se puede editar allá", !comun || L.editar(comun.id) === false);

  // Actualizar los planos: reemplazan a los de antes y traen el proyecto nuevo
  mensaje({ type: "low:send-planos", nombre: "Multiplano", origen: { proyecto: proyecto(8), params: { planos: 2 } },
    planos: [{ png: "data:image/png;base64,AAAA", z: 120 }, { png: "data:image/png;base64,AAAA", z: 0 }] });
  mensaje({ type: "low:send-planos", nombre: "Multiplano", origen: { proyecto: proyecto(9), params: { planos: 2 } },
    planos: [{ png: "data:image/png;base64,AAAA", z: 120 }, { png: "data:image/png;base64,AAAA", z: 0 }] });
  const planos = doc.scene.levels.filter((l) => l.fuente3d && l.fuente3d.tipo === "planos");
  check("actualizar los planos no los apila", planos.length === 2, String(planos.length));
  check("los planos apuntan al proyecto actualizado", planos.every((l) => doc.scene.proyectos3d[l.fuente3d.proyecto] === proyecto(9)));
  check("el estudio recibe la confirmación de los planos", enviados.some((m) => m.type === "low:planos-recibidos" && m.ok));
  check("el estudio se cierra después de cada envío", cerrado >= 3, String(cerrado));
}

console.log(`Origen 3D de las capas: ${ok} bien, ${fallan} mal`);
process.exit(fallan ? 1 : 0);
