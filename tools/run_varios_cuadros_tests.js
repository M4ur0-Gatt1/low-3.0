/* MOVER VARIOS CUADROS — la atenuación y el plan, sin la app.
 *
 * El cuadro actual se mueve entero; con atenuación lineal o suave, los de las
 * puntas cada vez menos; fuera del tramo, nada. Cada dibujo del tramo se
 * mueve una sola vez (con el peso más alto de sus cuadros). La matriz con
 * peso 0 no mueve nada y con peso 1 hace exactamente lo pedido.
 *
 * Uso: node tools/run_varios_cuadros_tests.js
 */
const fs = require("fs");
const path = require("path");
global.window = global;
eval(fs.readFileSync(path.join(__dirname, "..", "ui", "animation", "varios-cuadros.js"), "utf8"));
const V = global.LOW.animation.variosCuadros;

let ok = 0, fallan = 0;
const check = (nombre, cond, detalle = "") => {
  if (cond) { ok++; return; }
  fallan++;
  console.log("FALLA: " + nombre + (detalle ? "  :: " + detalle : ""));
};
const cerca = (a, b) => Math.abs(a - b) < 1e-6;
const aplica = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

check("sin atenuación todos pesan 1", [1, 5, 10].every((f) => V.peso(f, 5, 1, 10, "ninguna") === 1));
check("fuera del tramo no pesa", V.peso(11, 5, 1, 10, "ninguna") === 0 && V.peso(0, 5, 1, 10, "lineal") === 0);
check("el cuadro actual pesa 1 con atenuación", V.peso(5, 5, 1, 10, "lineal") === 1 && V.peso(5, 5, 1, 10, "suave") === 1);
const lin = [1, 3, 5, 7, 10].map((f) => V.peso(f, 5, 1, 10, "lineal"));
check("lineal baja hacia las puntas", lin[0] < lin[1] && lin[1] < lin[2] && lin[4] < lin[3] && lin[3] < lin[2], lin.join());
check("suave también, y más suave cerca del centro", V.peso(6, 5, 1, 10, "suave") > V.peso(6, 5, 1, 10, "lineal"));

const m0 = V.matriz({ dx: 50, dy: 0, rot: 90, esc: 2, cx: 100, cy: 100 }, 0);
check("con peso 0 no se mueve nada", cerca(m0[0], 1) && cerca(m0[3], 1) && cerca(m0[4], 0) && cerca(m0[5], 0), JSON.stringify(m0));
const m1 = V.matriz({ dx: 50, dy: 10, cx: 0, cy: 0 }, 1);
check("con peso 1 corre lo pedido", cerca(aplica(m1, 0, 0)[0], 50) && cerca(aplica(m1, 0, 0)[1], 10));
const mr = V.matriz({ rot: 90, cx: 100, cy: 100 }, 1);
check("gira alrededor del centro", cerca(aplica(mr, 100, 100)[0], 100) && cerca(aplica(mr, 200, 100)[1], 200), JSON.stringify(aplica(mr, 200, 100)));
const mh = V.matriz({ dx: 100, cx: 0, cy: 0 }, 0.5);
check("con peso 0,5 corre la mitad", cerca(aplica(mh, 0, 0)[0], 50));

// celdas: dibujo 1 en 1–3, 2 en 4–6, 3 en 7–9, vacío en 10
const cells = [1, 1, 1, 2, 2, 2, 3, 3, 3, null];
const p = V.plan(cells, 5, 1, 10, "ninguna");
check("cada dibujo una sola vez", p.map((x) => x.numero).join() === "1,2,3", JSON.stringify(p));
const pl = V.plan(cells, 5, 1, 10, "lineal");
check("con atenuación, el dibujo del cuadro actual pesa 1 y el de la punta menos",
  pl.find((x) => x.numero === 2).peso === 1 && pl.find((x) => x.numero === 1).peso < 1, JSON.stringify(pl));
check("el tramo limita los dibujos", V.plan(cells, 5, 4, 6, "ninguna").map((x) => x.numero).join() === "2");

console.log(`Mover varios cuadros: ${ok} bien, ${fallan} mal`);
process.exit(fallan ? 1 : 0);
