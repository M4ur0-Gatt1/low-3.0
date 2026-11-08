/* MODIFICADORES DE CAPA — tiempo, temblor y «se dibuja solo».
 *
 * Lo puro: qué cuadro muestra una capa con un desfase, un bucle, una ida y
 * vuelta, al revés o clavada; qué semilla de temblor toca en cada cuadro (y
 * que «en dos» cambie cada dos); cuántos trazos se ven mientras se dibuja
 * sola; y que el normalizador acote todo lo que venga de un archivo.
 *
 * Uso: node tools/run_modificadores_tests.js
 */
const fs = require("fs");
const path = require("path");
global.window = global;
global.document = { querySelector: () => null };
eval(fs.readFileSync(path.join(__dirname, "..", "ui", "animation", "modificadores.js"), "utf8"));
const M = global.LOW.animation.modificadores;

let ok = 0, fallan = 0;
const check = (nombre, cond, detalle = "") => {
  if (cond) { ok++; return; }
  fallan++;
  console.log("FALLA: " + nombre + (detalle ? "  :: " + detalle : ""));
};
const serie = (mods, a, b) => Array.from({ length: b - a + 1 }, (_, i) => M.cuadroFuente(mods, a + i)).join(",");

// ── tiempo ─────────────────────────────────────────────────────────────────
{
  check("sin modificadores, el mismo cuadro", M.cuadroFuente([], 7) === 7);
  const d = M.modsData([{ tipo: "tiempo", modo: "normal", desfase: 3 }]);
  check("desfase de 3", serie(d, 1, 3) === "4,5,6");
  const b = M.modsData([{ tipo: "tiempo", modo: "bucle", desde: 1, hasta: 4 }]);
  check("bucle de 1 a 4", serie(b, 1, 9) === "1,2,3,4,1,2,3,4,1", serie(b, 1, 9));
  const bd = M.modsData([{ tipo: "tiempo", modo: "bucle", desde: 1, hasta: 4, desfase: 2 }]);
  check("bucle desfasado (otro de la multitud)", serie(bd, 1, 5) === "3,4,1,2,3", serie(bd, 1, 5));
  const iv = M.modsData([{ tipo: "tiempo", modo: "ida-vuelta", desde: 1, hasta: 4 }]);
  check("ida y vuelta sin repetir las puntas", serie(iv, 1, 9) === "1,2,3,4,3,2,1,2,3", serie(iv, 1, 9));
  const inv = M.modsData([{ tipo: "tiempo", modo: "invertido", desde: 1, hasta: 4 }]);
  check("al revés", serie(inv, 1, 5) === "4,3,2,1,4", serie(inv, 1, 5));
  const fijo = M.modsData([{ tipo: "tiempo", modo: "fijo", fijo: 5 }]);
  check("clavado en un cuadro", serie(fijo, 1, 3) === "5,5,5");
  const apagado = M.modsData([{ tipo: "tiempo", modo: "fijo", fijo: 5, activo: false }]);
  check("un modificador apagado no hace nada", serie(apagado, 1, 2) === "1,2");
  const neg = M.modsData([{ tipo: "tiempo", modo: "normal", desfase: -10 }]);
  check("un desfase hacia atrás no baja de 1", M.cuadroFuente(neg, 3) === 1);
  const cadena = M.modsData([{ tipo: "tiempo", modo: "normal", desfase: 1 }, { tipo: "tiempo", modo: "bucle", desde: 1, hasta: 3 }]);
  check("se encadenan en orden", serie(cadena, 1, 4) === "2,3,1,2", serie(cadena, 1, 4));
  const un = M.modsData([{ tipo: "tiempo", modo: "ida-vuelta", desde: 5, hasta: 5 }]);
  check("ida y vuelta de un solo cuadro no se rompe", serie(un, 1, 3) === "5,5,5");
}

// ── temblor ────────────────────────────────────────────────────────────────
{
  const t = M.modsData([{ tipo: "temblor", amplitud: 4, cada: 2, semilla: 3 }]);
  const s = [1, 2, 3, 4, 5].map((f) => M.temblorEn(t, f).semilla);
  check("en dos: la semilla cambia cada dos cuadros", s[0] === s[1] && s[1] !== s[2] && s[2] === s[3] && s[3] !== s[4], s.join());
  check("sin temblor no hay filtro", M.temblorEn([], 3) === null && M.temblorEn(M.modsData([{ tipo: "temblor", amplitud: 0 }]), 3) === null);
  const f = M.filtroTemblor("x1", M.temblorEn(t, 1));
  check("el filtro desplaza con ruido", /<feTurbulence[^>]+seed="\d+"/.test(f) && /<feDisplacementMap[^>]+scale="4"/.test(f));
  check("la amplitud se acota", M.modsData([{ tipo: "temblor", amplitud: 9999 }])[0].amplitud === 80);
}

// ── se dibuja solo ─────────────────────────────────────────────────────────
{
  const b = M.modsData([{ tipo: "trazado", desde: 11, hasta: 20 }]);
  check("antes del tramo no se ve ningún trazo", M.trazosVisibles(b, 5, 10) === 0);
  check("a mitad del tramo, la mitad", M.trazosVisibles(b, 15, 10) === 5);
  check("al final, todos", M.trazosVisibles(b, 20, 10) === 10 && M.trazosVisibles(b, 99, 10) === 10);
  check("crece cuadro a cuadro", [11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((f) => M.trazosVisibles(b, f, 10)).join() === "1,2,3,4,5,6,7,8,9,10");
  check("sin el modificador se ven todos", M.trazosVisibles([], 1, 10) === null);
}

// ── efectos: un solo filtro por capa, en el orden de la lista ──────────────
{
  check("sin efectos ni temblor no hay filtro", M.filtroCapa("f", M.modsData([{ tipo: "tiempo" }]), 1) === null);
  const f = M.filtroCapa("fx1", M.modsData([{ tipo: "desenfoque", radio: 3 }, { tipo: "sombra", dx: 5, dy: 6, color: "#112233" }]), 1);
  check("el filtro lleva el id pedido", /^<filter id="fx1"/.test(f));
  check("primero el desenfoque, después la sombra (el orden de la lista)", f.indexOf("stdDeviation=\"3\"") < f.indexOf("dx=\"5\""), f);
  check("la sombra queda DEBAJO del dibujo", /<feMerge[^>]*><feMergeNode in="r\d+"\/><feMergeNode in="r1"\/><\/feMerge>/.test(f), f);
  check("el color de la sombra", f.includes('flood-color="#112233"'));
  const g = M.filtroCapa("fx2", M.modsData([{ tipo: "resplandor", color: "#ff0000" }, { tipo: "colorear", color: "#00ff00", cantidad: 0.5 }]), 1);
  check("resplandor y colorear se encadenan", g.includes('flood-color="#ff0000"') && /k2="0.5" k3="0.5"/.test(g));
  const t = M.filtroCapa("fx3", M.modsData([{ tipo: "temblor", amplitud: 2 }, { tipo: "desenfoque", radio: 1 }]), 1);
  check("el temblor entra en el mismo filtro, antes del desenfoque", t.indexOf("feDisplacementMap") < t.indexOf("feGaussianBlur"));
  check("un efecto apagado no entra", M.filtroCapa("fx4", M.modsData([{ tipo: "desenfoque", activo: false }]), 1) === null);
  check("un color inválido vuelve al de fábrica", M.modsData([{ tipo: "sombra", color: "rojo\"/><script>" }])[0].color === "#000000");
}

// ── el normalizador ────────────────────────────────────────────────────────
{
  const n = M.modsData([{ tipo: "otro" }, { tipo: "tiempo", modo: "raro", desfase: "x" }, null, ...Array(20).fill({ tipo: "temblor" })]);
  check("tipos desconocidos y nulos se descartan, y hay un tope", n.length === 12 && n[0].tipo === "tiempo");
  check("un modo desconocido es normal y un número inválido es 0", n[0].modo === "normal" && n[0].desfase === 0);
  check("tieneMods", M.tieneMods({ mods: n }) && !M.tieneMods({ mods: [] }) && !M.tieneMods({ mods: M.modsData([{ tipo: "temblor", activo: false }]) }));
}

// ── en el documento: guardar, reabrir, Ctrl+Z ──────────────────────────────
{
  for (const rel of ["core/history.js", "animation/scene-model.js", "animation/exposures.js", "animation/onion.js", "rigging/binding.js", "animation/document.js"]) {
    const p = path.join(__dirname, "..", "ui", rel);
    if (fs.existsSync(p)) eval(fs.readFileSync(p, "utf8"));
  }
  const A = global.LOW.animation;
  const doc = new A.LowDoc(); doc.setHistory(new global.LOW.core.HistoryManager());
  const ly = doc.scene.layers[0];
  check("una capa sin modificadores no escribe mods", !("mods" in ly.toJSON()));
  check("aplicar la lista", doc.setLayerMods(ly.id, [{ tipo: "tiempo", modo: "bucle", desde: 1, hasta: 8 }, { tipo: "sombra", dx: 3 }]));
  const sc2 = new A.Scene(JSON.parse(JSON.stringify(doc.scene.toJSON())));
  const m2 = sc2.layer(ly.id).mods;
  check("los modificadores sobreviven a guardar y reabrir", m2 && m2.length === 2 && m2[0].hasta === 8 && m2[1].dx === 3);
  check("aplicar lo mismo no ensucia el historial", doc.setLayerMods(ly.id, ly.mods) === false);
  doc.history.undo();
  check("Ctrl+Z los saca", ly.mods === null);
  doc.history.redo();
  check("Ctrl+Shift+Z los devuelve", ly.mods && ly.mods.length === 2);
  doc.setLayerMods(ly.id, []);
  check("una lista vacía deja la capa sin modificadores", ly.mods === null);
}

console.log(`Modificadores de capa: ${ok} bien, ${fallan} mal`);
process.exit(fallan ? 1 : 0);
