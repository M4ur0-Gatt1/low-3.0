/* Arcos y espaciado. Uso: node tools/run_arcs_tests.js
   Módulo puro: entran posiciones por cuadro, salen las respuestas que uno se
   hace mirando la mesa. */
const fs = require("fs"), path = require("path");
global.window = global; global.self = global;
eval(fs.readFileSync(path.join(__dirname, "..", "ui/animation/arcs.js"), "utf8"));
const A = global.LOW.animation;

let pass = 0, fail = 0;
const ok = (cond, nombre, detalle) => {
  if (cond) { pass++; return; }
  fail++; console.error("FALLA:", nombre, detalle === undefined ? "" : JSON.stringify(detalle));
};
/** Genera muestras con un perfil de avance dado (cuánto avanza en cada cuadro). */
const recta = (pasos) => {
  let x = 0;
  return [{ f: 1, x: 0, y: 0 }].concat(pasos.map((p, i) => ({ f: i + 2, x: (x += p), y: 0 })));
};

// ── 1. Sin material no se inventa nada ─────────────────────────────────────
{
  ok(A.analizarArco([]).seMovio === false, "sin muestras no hay arco");
  ok(A.analizarArco([{ f: 1, x: 0, y: 0 }]).tendencia === "quieto", "un solo punto está quieto");
  const quieto = A.analizarArco([{ f: 1, x: 10, y: 10 }, { f: 2, x: 10, y: 10 }, { f: 3, x: 10.1, y: 10 }]);
  ok(!quieto.seMovio && quieto.resumen === "no se mueve",
    "algo que no se mueve no tiene arco que mostrar", quieto.tendencia);
  ok(A.analizarArco([{ f: 1, x: NaN, y: 0 }, { f: 2, x: 1, y: 0 }]).seMovio === false,
    "una muestra sin posición no rompe el análisis");
}

// ── 2. Acelerar, desacelerar, parejo ───────────────────────────────────────
{
  const acelera = A.analizarArco(recta([1, 2, 4, 7, 11, 16]));
  ok(acelera.tendencia === "acelera", "reconoce que acelera", acelera.tendencia);
  ok(/acelera/.test(acelera.resumen), "y lo dice en palabras", acelera.resumen);

  const frena = A.analizarArco(recta([16, 11, 7, 4, 2, 1]));
  ok(frena.tendencia === "desacelera", "y que desacelera", frena.tendencia);

  const parejo = A.analizarArco(recta([5, 5, 5, 5, 5, 5]));
  ok(parejo.tendencia === "parejo", "un avance constante va parejo", parejo.tendencia);
  ok(parejo.resumen === "va parejo", "y se dice así", parejo.resumen);

  // un ease-in-out de manual: arranca lento, corre, frena
  const suave = A.analizarArco(recta([1, 3, 6, 8, 8, 6, 3, 1]));
  ok(suave.cambios.length >= 1, "un ease-in-out marca dónde deja de acelerar", suave.cambios);
  ok(suave.cambios.some((c) => c.a === "desacelera"), "y que después frena", suave.cambios);
}

// ── 3. El cuadro más rápido y el más lento ─────────────────────────────────
{
  const r = A.analizarArco(recta([2, 2, 20, 2, 2]));
  ok(r.masRapido.f === 3, "señala el cuadro donde va más rápido", r.masRapido);
  ok(r.masLento.paso < r.masRapido.paso, "y el más lento", r.masLento);
  ok(Math.round(r.largo) === 28, "mide el recorrido completo", r.largo);
}

// ── 4. ¿Arco o escalera? ───────────────────────────────────────────────────
{
  // una recta perfecta no tiene quiebre
  const linea = A.analizarArco([{ f: 1, x: 0, y: 0 }, { f: 2, x: 10, y: 0 }, { f: 3, x: 20, y: 0 }]);
  ok(linea.quiebre < 0.001, "una recta no tiene quiebre", linea.quiebre);

  // una curva suave tiene poco quiebre; un zigzag, mucho
  const curva = A.analizarArco([0, 1, 2, 3, 4].map((i) => ({ f: i + 1, x: i * 10, y: -Math.sin(i / 4 * Math.PI) * 8 })));
  const zigzag = A.analizarArco([0, 1, 2, 3, 4].map((i) => ({ f: i + 1, x: i * 10, y: i % 2 ? 12 : 0 })));
  ok(zigzag.quiebre > curva.quiebre * 2,
    "un zigzag se distingue de una curva: es una escalera, no un arco",
    { curva: curva.quiebre, zigzag: zigzag.quiebre });
}

// ── 5. La velocidad relativa sirve para pintar ─────────────────────────────
{
  const r = A.analizarArco(recta([1, 5, 10]));
  ok(r.tramos.every((t) => t.rel > 0 && t.rel <= 1), "cada tramo trae su velocidad 0..1", r.tramos);
  ok(r.tramos[r.tramos.length - 1].rel === 1, "el más rápido es el 1", r.tramos);
}

// ── 6. Overlapping: cuántos cuadros va atrás una cosa de la otra ───────────
{
  const perfil = [1, 3, 7, 12, 12, 7, 3, 1, 1, 1, 1, 1];
  const cadera = recta(perfil);
  // la mano hace lo MISMO pero tres cuadros después
  const mano = recta([1, 1, 1].concat(perfil));
  const d = A.arcoDesfase(cadera, mano);
  ok(d && d.cuadros === 3, "detecta que la mano llega 3 cuadros tarde", d);

  const alRevés = A.arcoDesfase(mano, cadera);
  ok(alRevés && alRevés.cuadros === -3, "y al revés, que se adelanta", alRevés);

  const juntas = A.arcoDesfase(cadera, recta(perfil));
  ok(juntas && juntas.cuadros === 0, "dos cosas en sincro no tienen desfase", juntas);

  // cosas que no se parecen: NO se opina
  const ruido = recta([9, 1, 8, 2, 7, 1, 9, 2, 8, 1, 7, 2]);
  const suave = recta([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  ok(A.arcoDesfase(ruido, suave) === null,
    "si dos movimientos no se parecen, no se inventa un desfase");
  ok(A.arcoDesfase(cadera, [{ f: 1, x: 0, y: 0 }]) === null,
    "sin material del segundo, tampoco");
  ok(A.arcoDesfase([{ f: 1, x: 5, y: 5 }, { f: 2, x: 5, y: 5 }], cadera) === null,
    "algo quieto no tiene desfase con nada");
}

// ── 7. El orden de las muestras no importa ─────────────────────────────────
{
  const desordenado = A.analizarArco([{ f: 3, x: 20, y: 0 }, { f: 1, x: 0, y: 0 }, { f: 2, x: 5, y: 0 }]);
  ok(desordenado.puntos.map((p) => p.f).join() === "1,2,3", "las ordena por cuadro");
  ok(desordenado.tendencia === "acelera", "y entonces el análisis da lo mismo", desordenado.tendencia);
}

console.log(`arcos: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
