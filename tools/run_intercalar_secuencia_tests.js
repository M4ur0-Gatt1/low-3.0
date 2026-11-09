/* INTERCALAR TODA LA SECUENCIA — qué se rellena y con qué curva.
 *
 * Lo que tiene que ser cierto para que sirva en pose a pose: el timing no se
 * mueve (cada clave sigue en su cuadro), sólo se rellenan sostenidos, nunca se
 * pisa un cuadro con otro dibujo ni se cruza un hueco vacío, y en dos o en tres
 * nace un intermedio cada dos o tres cuadros. Las curvas empiezan en 0,
 * terminan en 1 y hacen lo que su nombre dice.
 *
 * Uso: node tools/run_intercalar_secuencia_tests.js
 */
const fs = require("fs");
const path = require("path");
global.window = global;
eval(fs.readFileSync(path.join(__dirname, "..", "ui", "animation", "intercalar-secuencia.js"), "utf8"));
const S = global.LOW.animation.intercalarSecuencia;

let ok = 0, fallan = 0;
const check = (nombre, cond, detalle = "") => {
  if (cond) { ok++; return; }
  fallan++;
  console.log("FALLA: " + nombre + (detalle ? "  :: " + detalle : ""));
};
const frames = (pares) => pares.flatMap((p) => p.cuadros.map((q) => q.f));
const nuevos = (pares) => pares.flatMap((p) => p.cuadros.filter((q) => q.nuevo).map((q) => q.f));

// ── 1. el plan ──────────────────────────────────────────────────────────────
{
  // clave 1 en el cuadro 1 (sostenida hasta el 6), clave 2 en el 7, clave 3 en el 11
  const cells = [1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 3];
  const p1 = S.planSecuencia(cells, { paso: 1 });
  check("dos pares de claves", p1.length === 2, JSON.stringify(p1.map((p) => [p.fa, p.fb])));
  check("en unos se rellenan los sostenidos, sin tocar las claves", frames(p1).join() === "2,3,4,5,6,8,9,10", frames(p1).join());
  check("el timing no cambia: las claves siguen en 1, 7 y 11", p1[0].fa === 1 && p1[0].fb === 7 && p1[1].fb === 11);
  check("t va de 0 a 1 entre las claves", Math.abs(p1[0].cuadros[0].t - 1 / 6) < 1e-9 && Math.abs(p1[0].cuadros.at(-1).t - 5 / 6) < 1e-9);
  const p2 = S.planSecuencia(cells, { paso: 2 });
  check("en dos nace un intermedio cada dos cuadros", nuevos(p2).join() === "3,5,9", nuevos(p2).join());
  check("en dos se recorren igual todos los cuadros del sostenido", frames(p2).join() === "2,3,4,5,6,8,9,10");
  check("en tres", nuevos(S.planSecuencia(cells, { paso: 3 })).join() === "4,10");
  check("cuántos cuenta los que nacen", S.cuantos(p2) === 3);
}
{
  check("una clave pegada a la otra no tiene nada que rellenar", S.planSecuencia([1, 2, 3], {}).length === 0);
  check("un hueco vacío corta el par", S.planSecuencia([1, 1, null, null, 2], {}).length === 0);
  check("si en el medio hay OTRO dibujo, no es un sostenido: no se toca", frames(S.planSecuencia([1, 1, 5, 1, 1, 2], {})).length === 0
    || !frames(S.planSecuencia([1, 1, 5, 1, 1, 2], {})).includes(3));
  check("la misma clave repetida después de un salto no se intercala consigo", S.planSecuencia([1, 1, 1, 1], {}).length === 0);
  const r = S.planSecuencia([1, 1, 1, 1, 2, 2, 2, 2, 3], { desde: 5, hasta: 9 });
  check("el rango limita los pares", r.length === 1 && r[0].fa === 5 && r[0].fb === 9, JSON.stringify(r.map((p) => [p.fa, p.fb])));
  check("el rango que corta en un sostenido no inventa la clave B", S.planSecuencia([1, 1, 1, 1, 2], { hasta: 3 }).length === 0);
  check("un paso absurdo se acota", nuevos(S.planSecuencia([1, 1, 1, 2], { paso: 99 })).length === 0 && nuevos(S.planSecuencia([1, 1, 1, 1, 1, 2], { paso: 0 })).join() === "2,3,4,5");
}

// ── 2. las curvas ───────────────────────────────────────────────────────────
for (const nombre of Object.keys(S.CURVAS)) for (const modo of ["entrada", "salida", "ambas"]) {
  const f = S.curva(nombre, modo);
  check(nombre + " " + modo + " empieza en 0 y termina en 1", Math.abs(f(0)) < 1e-6 && Math.abs(f(1) - 1) < 1e-6, f(0) + " " + f(1));
}
check("de entrada arranca lento (seno)", S.curva("seno", "entrada")(0.25) < 0.25);
check("de salida arranca rápido (seno)", S.curva("seno", "salida")(0.25) > 0.25);
check("de las dos es simétrica (cúbica)", Math.abs(S.curva("cubica", "ambas")(0.5) - 0.5) < 1e-9);
check("back se pasa: de entrada va por debajo de 0", Math.min(...[0.1, 0.2, 0.3].map(S.curva("back", "entrada"))) < 0);
check("elástica de salida se pasa de 1", Math.max(...[0.2, 0.3, 0.4].map(S.curva("elastica", "salida"))) > 1);
check("rebote de salida llega antes de terminar", S.curva("rebote", "salida")(0.4) > 0.6);
check("una curva desconocida es lineal", S.curva("cualquiera", "ambas")(0.3) === 0.3);

console.log(`Intercalar la secuencia: ${ok} bien, ${fallan} mal`);
process.exit(fallan ? 1 : 0);
