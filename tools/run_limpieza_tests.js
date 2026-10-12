/* El núcleo de la limpieza de línea (ui/vector/limpieza-nucleo.js), en node.
   Cada caso es una situación de dibujo real: un «#» de dos verticales sobre una
   horizontal, una T que no llegó a cruzar, un lazo, un cuadrado cerrado. */
const L = require("../ui/vector/limpieza-nucleo.js");
let fallas = 0, n = 0;
const ok = (c, msg, d) => { n++; if (!c) { fallas++; console.log("FALLA " + msg + (d !== undefined ? " :: " + JSON.stringify(d) : "")); } };
const cerca = (a, b, e = 1e-6) => Math.abs(a - b) <= e;
/** Polilínea densa de a a b (como la que se muestrea de un trazo). */
const recta = (a, b, paso = 1) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]), k = Math.max(1, Math.ceil(d / paso)), out = [];
  for (let i = 0; i <= k; i++) out.push([a[0] + (b[0] - a[0]) * i / k, a[1] + (b[1] - a[1]) * i / k]); return out; };
const linea = (poly, cerrada = false) => ({ poly, acum: L.acumulado(poly), cerrada, caja: L.caja(poly) });
const largoDe = (p) => { const a = L.acumulado(p); return a[a.length - 1]; };

// ── 1. el «#»: una horizontal cruzada por dos verticales
const H = linea(recta([0, 0], [100, 0]));
const V1 = linea(recta([20, -50], [20, 50])), V2 = linea(recta([70, -50], [70, 50]));
let cs = L.cortes(H, [H, V1, V2]);
ok(cs.length === 2 && cerca(cs[0], 20) && cerca(cs[1], 70), "los cortes de la horizontal están en los cruces", cs);
let tr = L.tramo(cs, 10, 100, false);
ok(cerca(tr[0], 0) && cerca(tr[1], 20), "el tramo de la colita izquierda", tr);
let piezas = L.quitar(H, [tr]);
ok(piezas.length === 1 && cerca(piezas[0][0][0], 20) && cerca(piezas[0].at(-1)[0], 100), "sacar la colita deja la línea desde el cruce", piezas.map(p => [p[0], p.at(-1)]));
tr = L.tramo(cs, 40, 100, false);
piezas = L.quitar(H, [tr]);
ok(piezas.length === 2 && cerca(piezas[0].at(-1)[0], 20) && cerca(piezas[1][0][0], 70), "sacar el tramo del medio parte la línea en dos, justo en los cruces", piezas.map(p => [p[0], p.at(-1)]));
piezas = L.quitar(H, [L.tramo(cs, 10, 100, false), L.tramo(cs, 90, 100, false)]);
ok(piezas.length === 1 && cerca(largoDe(piezas[0]), 50), "sacar las dos colitas deja el tramo entre cruces", largoDe(piezas[0]));

// ── 2. una T que no llegó a tocar por 3 décimas: igual corta
const T = linea(recta([50, -40], [50, -0.3]));
cs = L.cortes(H, [H, T]);
ok(cs.length === 1 && cerca(cs[0], 50), "la punta de una T a 0,3 de la línea la corta", cs);
cs = L.cortes(H, [H, linea(recta([50, -40], [50, -5]))]);
ok(cs.length === 0, "una punta a 5 unidades NO corta", cs);

// ── 3. un lazo que se cruza consigo mismo
const lazo = linea([[0, 0], [40, 0], [40, 30], [20, 30], [20, -20]]);
cs = L.cortes(lazo, [lazo]);
ok(cs.length === 2, "un lazo se corta en su propio cruce (dos veces: al pasar y al volver)", cs);
const enCruce = cs.map(s => L.puntoEn(lazo.poly, lazo.acum, s));
ok(enCruce.every(p => cerca(p[0], 20, 1e-6) && cerca(p[1], 0, 1e-6)), "los dos cortes caen en el mismo punto del cruce", enCruce);

// ── 4. un cuadrado cerrado atravesado por una diagonal
const cuad = linea([[0, 0], [100, 0], [100, 100], [0, 100], [0, 0]], true);
const diag = linea(recta([-20, 50], [120, 50]));
cs = L.cortes(cuad, [cuad, diag]);
ok(cs.length === 2 && cerca(cs[0], 150) && cerca(cs[1], 350), "el cuadrado se corta donde lo cruza la línea", cs);
tr = L.tramo(cs, 200, 400, true);
ok(cerca(tr[0], 150) && cerca(tr[1], 350), "el tramo de arriba del cuadrado", tr);
piezas = L.quitar(cuad, [tr]);
ok(piezas.length === 1 && cerca(largoDe(piezas[0]), 200), "sacar un lado deja UNA pieza abierta con el resto", piezas.map(largoDe));
tr = L.tramo(cs, 10, 400, true);
ok(cerca(tr[0], 350) && cerca(tr[1], 150), "el tramo que da la vuelta por el arranque", tr);
piezas = L.quitar(cuad, [tr]);
ok(piezas.length === 1 && cerca(largoDe(piezas[0]), 200) && cerca(piezas[0][0][0], 100) && cerca(piezas[0][0][1], 50) && cerca(piezas[0].at(-1)[0], 0) && cerca(piezas[0].at(-1)[1], 50), "sacar el tramo que pasa por el arranque deja el resto, de cruce a cruce", piezas.map(p => [p[0], p.at(-1), largoDe(p)]));
const sin = L.quitar(cuad, [L.tramo([], 10, 400, true)]);
ok(sin.length === 0, "un cerrado sin cruces se saca entero", sin.length);

// ── 5. partir (la cuchilla de OpenToonz)
piezas = L.partir(H, 33);
ok(piezas.length === 2 && cerca(piezas[0].at(-1)[0], 33) && cerca(piezas[1][0][0], 33), "partir en 33", piezas.map(p => [p[0], p.at(-1)]));
piezas = L.partir(cuad, 50);
ok(piezas.length === 1 && cerca(piezas[0][0][0], 50) && cerca(piezas[0].at(-1)[0], 50) && cerca(largoDe(piezas[0]), 400), "partir un cerrado lo abre ahí", [piezas[0][0], piezas[0].at(-1)]);

// ── 6. sobrantes
const largaH = linea(recta([0, 0], [100, 0]));
cs = L.cortes(largaH, [largaH, V1, V2]);
const sob = L.sobrantes(largaH, cs, 25);
ok(sob.length === 1 && cerca(sob[0][0], 0) && cerca(sob[0][1], 20), "sólo la colita de 20 es sobrante con tolerancia 25 (la de 30 no)", sob);

// ── 7. huecos: pares de puntas más cercanos, cada una una vez
const pares = L.huecos([
  { id: "a", extremo: 1, x: 100, y: 0 }, { id: "b", extremo: 0, x: 104, y: 0 },
  { id: "c", extremo: 0, x: 103, y: 8 }, { id: "d", extremo: 0, x: 300, y: 0 },
], 6);
ok(pares.length === 1 && pares[0].a.id === "a" && pares[0].b.id === "b", "el hueco se cierra con la punta más cercana", pares.map(p => [p.a.id, p.b.id, p.d]));

// ── 8. unir por las puntas que se tocan, en el orden correcto
const u = L.unir([[0, 0], [10, 0]], 1, [[20, 0], [10.5, 0]], 1);
ok(u.length === 4 && cerca(u[0][0], 0) && cerca(u[1][0], 10) && cerca(u[2][0], 10.5) && cerca(u[3][0], 20), "unir da vuelta la segunda para que siga", u);

// ── 9. la presión se interpola en los cortes
const conPresion = linea([[0, 0, 0.2], [10, 0, 1]]);
const p5 = L.puntoEn(conPresion.poly, conPresion.acum, 5);
ok(cerca(p5[2], 0.6), "la presión en el corte es la del medio", p5);

// ── 10. simplificar conserva las puntas y la forma
const s = L.simplificar(recta([0, 0], [100, 0], 0.5), 0.1);
ok(s.length === 2, "una recta densa queda en dos puntos", s.length);

// ── 11. Bézier: cortar EXACTO (la pieza es el mismo tramo de la curva, no una aproximación)
const cmds = [{ c: "M", n: [100, 900] }, { c: "C", n: [300, 700, 500, 1100, 700, 900] }, { c: "L", n: [900, 900] }];
const seg = L.segmentar(cmds);
ok(seg && seg.segs.length === 2 && !seg.cerrada, "segmentar M C L", seg);
const ap = L.aplanar(seg.segs), acA = L.acumulado(ap.pts);
const pa = L.posEn(ap.tags, acA, acA.at(-1) * 0.2), pb = L.posEn(ap.tags, acA, acA.at(-1) * 0.8);
const tz = L.trozo(seg.segs, pa, pb);
ok(tz.length === 2 && tz[0].c === "C" && tz[1].c === "L", "el trozo de 20 % a 80 % tiene un pedazo de curva y uno de recta", tz.map(g => g.c));
let peor = 0;
for (let k = 0; k <= 50; k++) {
  const u = k / 50, q = L.evalSeg(tz[0], u), tOrig = pa[1] + (1 - pa[1]) * u, o = L.evalSeg(seg.segs[0], tOrig);
  peor = Math.max(peor, Math.hypot(q[0] - o[0], q[1] - o[1]));
}
ok(peor < 1e-9, "el pedazo de curva coincide EXACTO con la original", peor);
const ini = L.evalSeg(tz[0], 0), orig = L.evalSeg(seg.segs[0], pa[1]);
ok(Math.hypot(ini[0] - orig[0], ini[1] - orig[1]) < 1e-9, "empieza justo en el corte", [ini, orig]);
const inv = L.invertir(tz);
ok(Math.hypot(inv[0].p0[0] - tz[1].p1[0], inv[0].p0[1] - tz[1].p1[1]) < 1e-12 && inv[1].c === "C", "invertir da vuelta el recorrido", inv.map(g => g.c));
const mov = L.transformar(seg.segs, { a: 1, b: 0, c: 0, d: 1, e: 10, f: -5 });
ok(mov[0].c1[0] === 310 && mov[0].c1[1] === 695, "transformar mueve también las manijas", mov[0].c1);
ok(/^M 100 900 C 300 700 500 1100 700 900 L 900 900 Z$/.test(L.dDe(seg.segs, true)), "dDe escribe el camino", L.dDe(seg.segs, true));
ok(L.segmentar([{ c: "M", n: [0, 0] }, { c: "A", n: [5, 5, 0, 0, 1, 10, 0] }]) === null, "con arcos no segmenta (se usa el camino aproximado)", null);
const cerr = L.segmentar([{ c: "M", n: [0, 0] }, { c: "L", n: [10, 0] }, { c: "L", n: [10, 10] }, { c: "Z", n: [] }]);
ok(cerr.cerrada && cerr.segs.length === 3, "Z agrega el lado que cierra", cerr);

console.log(fallas ? `FALLAS: ${fallas} de ${n}` : `LIMPIEZA OK: ${n} casos`);
process.exit(fallas ? 1 : 0);
