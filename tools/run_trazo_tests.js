/* EL TRAZO: pruebas del motor (sin navegador). node tools/run_trazo_tests.js

   Fase 2 del plan (oct-2026). Medido con lápiz sintético en el estudio:
   · los DETALLES CHICOS se aplastaban: un zigzag de 8 px quedaba al 58 % de su
     altura. La media del postproceso promediaba ±2 PUNTOS, y en un trazo chico
     cinco puntos son todo el detalle. Ahora se suaviza por DISTANCIA.
   · la CURVA (Catmull-Rom) se pasaba hacia atrás cuando dos tramos seguidos
     tenían largos muy distintos: la línea arrancaba 96 unidades ANTES de donde
     se apoyó el lápiz. Ahora ninguna manija pasa la mitad de su tramo.

   Se exige sobre las funciones del motor (ui/drawing/stabilization.js y
   ui/drawing/stroke-engine.js), con datos que reproducen esos casos. */
const fs = require("fs");
const path = require("path");
const assert = require("node:assert/strict");
global.window = global;
for (const f of ["ui/drawing/stabilization.js", "ui/drawing/stroke-engine.js"])
  eval(fs.readFileSync(path.join(__dirname, "..", f), "utf8"));
const D = global.LOW.drawing;
let total = 0; const fallas = [];
const prueba = (n, fn) => { total++; try { fn(); } catch (e) { fallas.push(n + " :: " + e.message); } };

// muestrear una curva SVG «M x y C ...» en coordenadas
function muestrear(d, pasos = 24) {
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  const out = [[nums[0], nums[1]]];
  for (let i = 2; i + 5 < nums.length; i += 6) {
    const [x0, y0] = out.at(-1), [a, b, c, e, x1, y1] = nums.slice(i, i + 6);
    for (let k = 1; k <= pasos; k++) { const t = k / pasos, u = 1 - t;
      out.push([u * u * u * x0 + 3 * u * u * t * a + 3 * u * t * t * c + t * t * t * x1,
                u * u * u * y0 + 3 * u * u * t * b + 3 * u * t * t * e + t * t * t * y1]); }
  }
  return out;
}

prueba("la curva no se pasa hacia atrás con tramos desparejos", () => {
  assert.equal(typeof D.caminoSuave, "function", "falta LOW.drawing.caminoSuave");
  // el caso medido: inicio, un punto cerca, y el final lejos
  const d = D.caminoSuave([[192, 969], [214, 973.6], [1727, 969.5]]);
  const xs = muestrear(d).map((p) => p[0]);
  assert.ok(Math.min(...xs) >= 191, "la curva arranca en x=" + Math.min(...xs).toFixed(1) + ", ANTES de donde se apoyó el lápiz (192)");
  assert.ok(Math.max(...xs) <= 1728, "la curva se pasa del final: x=" + Math.max(...xs).toFixed(1));
});
prueba("con puntos parejos, la curva es la misma Catmull-Rom de siempre", () => {
  const pts = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI; pts.push([100 + 100 * Math.cos(a), 100 + 100 * Math.sin(a)]); }
  const d = D.caminoSuave(pts);
  const m = muestrear(d);
  const desvio = Math.max(...m.map(([x, y]) => Math.abs(Math.hypot(x - 100, y - 100) - 100)));
  assert.ok(desvio < 0.6, "un semicírculo de puntos parejos se deforma " + desvio.toFixed(2));
  assert.ok(/^M [\d.-]+ [\d.-]+( C( [\d.-]+){6})+$/.test(d), "el formato del trazado cambió: " + d.slice(0, 80));
});
prueba("dos puntos: una recta", () => {
  assert.equal(D.caminoSuave([[0, 0], [10, 5]]), "M 0.0 0.0 L 10.0 5.0");
});
prueba("suavizar por distancia: un detalle de 8 px sobrevive", () => {
  const pts = [[0, 0, .5], [4, -8, .5], [8, 0, .5], [12, -8, .5], [16, 0, .5]];
  const out = D.suavizarPorDistancia(pts, D.sigmaDeSuavizado(40, 1));   // el valor por omisión, a zoom 1
  const alto = Math.max(...out.map((p) => p[1])) - Math.min(...out.map((p) => p[1]));
  assert.ok(alto >= 8 * 0.85, "el zigzag de 8 px quedó de " + alto.toFixed(1) + " (" + Math.round(alto / 8 * 100) + " %)");
});
prueba("suavizar por distancia: el temblor denso del pulso se va", () => {
  const pts = []; for (let i = 0; i <= 200; i++) pts.push([i * 0.8, i % 2 ? 1 : -1, .5]);   // ±1 cada 0,8
  const out = D.suavizarPorDistancia(pts, D.sigmaDeSuavizado(40, 1));
  // cerca de las puntas la ventana es asimétrica (los extremos quedan fijos a propósito): se mide el cuerpo
  const resto = Math.max(...out.slice(6, -6).map((p) => Math.abs(p[1])));
  assert.ok(resto < 0.35, "el temblor de ±1 quedó en ±" + resto.toFixed(2));
});
prueba("suavizar por distancia: los extremos no se mueven", () => {
  const pts = []; for (let i = 0; i <= 20; i++) pts.push([i * 2, Math.sin(i), .5]);
  const out = D.suavizarPorDistancia(pts, 3);
  assert.deepEqual(out[0], pts[0]); assert.deepEqual(out.at(-1), pts.at(-1));
  assert.equal(out.length, pts.length);
});

prueba("el trazo termina donde se levantó el lápiz", () => {
  const pts = [[0, 0, .6, 0, 0, 0, 1], [90, 0, .6, 0, 0, 0, 2]];   // el estabilizador quedó en 90; el lápiz se levantó en 100
  assert.equal(D.cerrarEnElPuntero(pts, { x: 100, y: 0 }, 3), true);
  assert.deepEqual(pts.at(-1).slice(0, 3), [100, 0, .6], "el último punto no es donde se levantó, con la presión del anterior");
  assert.equal(D.cerrarEnElPuntero(pts, { x: 100.2, y: 0 }, 4), false, "agregó un punto que ya estaba");
});

console.log("TRAZO: " + total + " pruebas, " + (total - fallas.length) + " bien, " + fallas.length + " fallan");
if (fallas.length) { fallas.forEach((f) => console.error("FALLA: " + f)); process.exit(1); }
