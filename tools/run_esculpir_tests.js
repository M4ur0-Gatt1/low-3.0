/* ESCULPIR TRAZOS — el núcleo (ui/vector/esculpir-nucleo.js), sin pantalla.
   Cada operación hace lo que dice, sin picos ni rectas inesperadas, y el
   trazo conserva su continuidad, su presión y sus puntas.
   node tools/run_esculpir_tests.js */
const assert = require("node:assert/strict");
const path = require("node:path");
const N = require(path.join(__dirname, "..", "ui", "vector", "esculpir-nucleo.js"));

let bien = 0, mal = 0;
const prueba = (nombre, fn) => { try { fn(); bien++; } catch (e) { mal++; console.log("FALLA", nombre, "\n  ", e.message); } };

// una recta horizontal de 0 a 200 con presión que sube y baja; pocos puntos
// (como queda un trazo simplificado al dibujar)
const recta = () => [[0, 100, .3, 5, 0, 0, 0], [50, 100, .7, 5, 0, 0, 50], [100, 100, 1, 5, 0, 0, 100], [150, 100, .7, 5, 0, 0, 150], [200, 100, .3, 5, 0, 0, 200]];
const zigzag = () => Array.from({ length: 41 }, (_, i) => [i * 5, 100 + (i % 2 ? 4 : -4), .8]);
const maxDesvio = (pts, y = 100) => Math.max(...pts.map((p) => Math.abs(p[1] - y)));
const continuo = (pts, maxSalto) => pts.every((p, i) => !i || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) <= maxSalto);

prueba("subdividir: agrega detalle sin mover la forma y conserva todos los canales", () => {
  const s = N.subdividir(recta(), 5);
  assert.ok(s.length >= 40, "pocos puntos: " + s.length);
  assert.ok(s.every((p) => Math.abs(p[1] - 100) < 1e-9 && p.length === 7), "movió la forma o perdió canales");
  const medio = s.find((p) => Math.abs(p[0] - 75) < 1e-6);
  assert.ok(medio && Math.abs(medio[2] - .85) < 1e-6, "la presión no se interpola");
});

prueba("caída suave: 1 en el centro, 0 en el borde, sin escalón", () => {
  assert.equal(N.caida(0), 1); assert.equal(N.caida(1), 0); assert.equal(N.caida(1.5), 0);
  for (let t = 0; t < 1; t += .01) assert.ok(Math.abs(N.caida(t) - N.caida(t + .01)) < .03, "escalón en " + t.toFixed(2));
});

prueba("agarrar: el centro sigue al lápiz, las puntas quedan, sin picos", () => {
  const pts = N.subdividir(recta(), 2);
  const g = N.agarrarInicio(pts, [100, 100], 60, "suave");
  const out = N.agarrarMover(g, [0, 40]);
  const medio = out[N.masCercano(out, [100, 140]).i];
  assert.ok(Math.abs(medio[1] - 140) < 1, "el centro no siguió al lápiz: " + medio[1]);
  assert.equal(out[0][1], 100); assert.equal(out[out.length - 1][1], 100);
  assert.ok(N.peorGiro(out) < 8, "quedó un pico: " + N.peorGiro(out).toFixed(1) + "°");
  assert.equal(out.length, pts.length, "agarrar no debe crear ni borrar puntos");
  assert.ok(out.every((p, i) => p[2] === pts[i][2]), "la presión cambió");
});

prueba("curvar: arquea a lo largo del trazo, sólo en la normal", () => {
  const pts = N.subdividir(recta(), 2);
  const g = N.curvarInicio(pts, [100, 100], 70, "suave");
  const out = N.curvarMover(g, [25, 30]);            // el componente en x no cuenta
  assert.ok(out.every((p, i) => Math.abs(p[0] - pts[i][0]) < 1e-9), "curvar movió puntos a lo largo del trazo");
  assert.ok(maxDesvio(out) > 25, "no arqueó");
  assert.ok(N.peorGiro(out) < 8, "quedó un pico");
});

prueba("empujar: va en la dirección del lápiz; en perpendicular, sólo de costado", () => {
  const pts = N.subdividir(recta(), 2);
  const libre = N.OPERACIONES.empujar(pts, { c: [100, 100], R: 40, k: 1, delta: [10, 10], caida: "suave" });
  const perp = N.OPERACIONES.empujar(pts, { c: [100, 100], R: 40, k: 1, delta: [10, 10], caida: "suave", perpendicular: true });
  const i = N.masCercano(pts, [100, 100]).i;
  assert.ok(libre[i][0] > pts[i][0] + 5 && libre[i][1] > pts[i][1] + 5, "no empujó en la dirección del lápiz");
  assert.ok(Math.abs(perp[i][0] - pts[i][0]) < 1e-6 && perp[i][1] > 105, "en perpendicular se corrió a lo largo");
});

prueba("atraer: lleva el trazo hacia el cursor", () => {
  let pts = N.subdividir(recta(), 2);
  for (let k = 0; k < 20; k++) pts = N.OPERACIONES.atraer(pts, { c: [100, 120], R: 50, k: 1, caida: "suave" });
  assert.ok(pts[N.masCercano(pts, [100, 100]).i][1] > 110, "no se acercó al cursor");
});

prueba("pellizcar junta y expandir separa", () => {
  const pts = N.subdividir(recta(), 2), x = { c: [100, 100], R: 40, k: 1, caida: "suave" };
  const i = N.masCercano(pts, [80, 100]).i;
  const p = N.OPERACIONES.pellizcar(pts, x), e = N.OPERACIONES.expandir(pts, x);
  assert.ok(p[i][0] > pts[i][0], "pellizcar no juntó hacia el centro");
  assert.ok(e[i][0] < pts[i][0], "expandir no separó del centro");
});

prueba("suavizar baja el zigzag; las puntas quedan", () => {
  let pts = zigzag();
  for (let k = 0; k < 12; k++) pts = N.OPERACIONES.suavizar(pts, { c: [100, 100], R: 300, k: 1, caida: "suave" });
  assert.ok(maxDesvio(pts.slice(5, -5)) < 1.5, "el zigzag sigue: " + maxDesvio(pts.slice(5, -5)).toFixed(2));
  assert.deepEqual(pts[0], zigzag()[0]);
});

prueba("relajar reparte los puntos sin cambiar la forma", () => {
  const pts = [[0, 100, 1], [2, 100, 1], [4, 100, 1], [50, 100, 1], [100, 100, 1]];
  let r = pts; for (let k = 0; k < 30; k++) r = N.OPERACIONES.relajar(r, { c: [50, 100], R: 200, k: 1, caida: "lineal" });
  assert.ok(r.every((p) => Math.abs(p[1] - 100) < 1e-6), "relajar cambió la forma");
  const pasos = r.slice(1).map((p, i) => p[0] - r[i][0]);
  assert.ok(Math.max(...pasos) / Math.min(...pasos) < 3, "no repartió: " + pasos.map((x) => x.toFixed(1)).join(","));
});

prueba("enderezar lleva el tramo hacia la recta de sus puntas", () => {
  let pts = Array.from({ length: 41 }, (_, i) => [i * 5, 100 + Math.sin(i / 3) * 12, 1]);
  const antes = maxDesvio(pts.slice(10, 30));
  for (let k = 0; k < 25; k++) pts = N.OPERACIONES.enderezar(pts, { c: [100, 100], R: 70, k: 1, caida: "suave" });
  assert.ok(N.peorGiro(pts) < 30, "enderezar dejó un quiebre");
  const linea = pts.slice(14, 26); const a = linea[0], b = linea[linea.length - 1];
  const fuera = Math.max(...linea.map((p) => Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / Math.hypot(b[0] - a[0], b[1] - a[1])));
  assert.ok(fuera < 1.5, "el tramo del centro no quedó recto: " + fuera.toFixed(2) + " (antes " + antes.toFixed(1) + ")");
});

prueba("redibujar: toma el nuevo recorrido en el tramo, sin crear otro trazo y sin escalones", () => {
  const pts = N.subdividir(recta(), 2);
  // dibujo un arco del 60 al 140, encima, empezando y terminando sobre el trazo
  const guia = Array.from({ length: 41 }, (_, i) => { const t = i / 40; return [60 + 80 * t, 100 - Math.sin(t * Math.PI) * 30]; });
  const r = N.redibujar(pts, guia, 8, 2);
  assert.ok(r, "no encontró el tramo a redibujar");
  const cima = r.pts[N.masCercano(r.pts, [100, 70]).i];
  assert.ok(Math.abs(cima[1] - 70) < 2, "el tramo no tomó el recorrido nuevo: " + cima[1].toFixed(1));
  assert.equal(r.pts[0][0], 0); assert.equal(r.pts[r.pts.length - 1][0], 200);
  assert.ok(continuo(r.pts, 3), "quedó un salto en las uniones");
  assert.ok(N.peorGiro(r.pts) < 35, "quedó un quiebre en las uniones: " + N.peorGiro(r.pts).toFixed(1) + "°");
  const enLaCima = r.pts[N.masCercano(r.pts, [100, 70]).i];
  assert.ok(Math.abs(enLaCima[2] - 1) < .1, "el tramo nuevo no tomó la presión del original");
});

prueba("redibujar al revés (de derecha a izquierda) da lo mismo", () => {
  const pts = N.subdividir(recta(), 2);
  const guia = Array.from({ length: 41 }, (_, i) => { const t = 1 - i / 40; return [60 + 80 * t, 100 - Math.sin(t * Math.PI) * 30]; });
  const r = N.redibujar(pts, guia, 8, 2);
  assert.ok(r && r.pts[0][0] === 0 && r.pts[r.pts.length - 1][0] === 200, "el trazo quedó dado vuelta");
  assert.ok(continuo(r.pts, 3));
});

prueba("redibujar lejos del trazo no hace nada", () => {
  const guia = [[60, 30], [100, 10], [140, 30]];
  assert.equal(N.redibujar(N.subdividir(recta(), 2), guia, 8, 2), null);
});

prueba("simplificar saca lo que sobra sin perder la forma ni la presión", () => {
  const pts = N.subdividir(recta(), 1);
  const s = N.simplificar(pts, .1);
  assert.ok(s.length < pts.length / 10, "no simplificó: " + s.length);
  assert.ok(s.some((p) => Math.abs(p[2] - 1) < .02), "perdió el pico de presión");
});

prueba("mantener el detalle: un tramo estirado se vuelve a subdividir", () => {
  const pts = [[0, 0, 1], [2, 0, 1], [40, 0, 1]];
  assert.ok(N.mantenerDetalle(pts, 2).length > 15);
});

console.log(`ESCULPIR: ${bien + mal} pruebas, ${bien} bien, ${mal} fallan`);
process.exit(mal ? 1 : 0);
