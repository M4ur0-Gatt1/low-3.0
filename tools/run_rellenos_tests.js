/* RELLENOS CON DEGRADÉ O TEXTURA — la paleta, sin la app.
 *
 * Un estilo con relleno pasa a rellenar con url(#…) y la paleta arma las
 * definiciones; la línea sigue lisa. Lo que viene de un archivo se valida:
 * un color con comillas o etiquetas no llega al CSS ni al SVG. El relleno del
 * estilo se deshace con Ctrl+Z y sobrevive a guardar y reabrir.
 *
 * Uso: node tools/run_rellenos_tests.js
 */
const fs = require("fs");
const path = require("path");
global.window = global;
for (const rel of ["core/history.js", "animation/scene-model.js", "animation/palette.js", "animation/exposures.js",
  "animation/onion.js", "rigging/binding.js", "animation/document.js"]) {
  const p = path.join(__dirname, "..", "ui", rel);
  if (fs.existsSync(p)) eval(fs.readFileSync(p, "utf8"));
}
const A = global.LOW.animation, P = A.palette;

let ok = 0, fallan = 0;
const check = (nombre, cond, detalle = "") => {
  if (cond) { ok++; return; }
  fallan++;
  console.log("FALLA: " + nombre + (detalle ? "  :: " + detalle : ""));
};

const doc = new A.LowDoc();
doc.setHistory(new global.LOW.core.HistoryManager());
const pal = doc.palette;
if (pal && !pal.styles.length && P.seed) P.seed(pal);
const st = pal.byIndex(3);
check("hay una paleta con el estilo 3", !!st);

// ── 1. sin relleno, todo como antes ─────────────────────────────────────────
const antes = P.css(pal);
check("sin rellenos no hay definiciones", P.defs(pal) === "");
check("el CSS de siempre usa el color liso", new RegExp(`\\[data-fil="3"\\]\\{fill:${st.color} !important\\}`).test(antes));

// ── 2. degradé ──────────────────────────────────────────────────────────────
check("poner un degradé", doc.setStyleRelleno(3, { tipo: "degrade", color2: "#ff0000", angulo: 0 }));
const css = P.css(pal), defs = P.defs(pal);
check("el relleno pasa a url(#…)", /\[data-fil="3"\]\{fill:url\(#lowPal_[\w-]+_3\) !important\}/.test(css), css.slice(0, 300));
check("la línea sigue lisa", new RegExp(`\\[data-stk="3"\\]\\{stroke:${st.color} !important\\}`).test(css));
check("las definiciones traen el degradé lineal horizontal", /<linearGradient id="lowPal_[\w-]+_3" x1="0" y1="0.5" x2="1" y2="0.5">/.test(defs), defs);
check("de su color al segundo", defs.includes(`stop-color="${st.color}"`) && defs.includes('stop-color="#ff0000"'));
doc.setStyleRelleno(3, { tipo: "degrade", color2: "#00ff00", radial: true });
check("radial", /<radialGradient id="lowPal_/.test(P.defs(pal)));

// ── 3. textura ──────────────────────────────────────────────────────────────
for (const patron of ["rayas", "puntos", "cuadricula", "trama"]) {
  doc.setStyleRelleno(3, { tipo: "textura", patron, color2: "#eeeeee", escala: 10 });
  const d = P.defs(pal);
  check("textura " + patron, /<pattern id="lowPal_[\w-]+_3" width="10" height="10" patternUnits="userSpaceOnUse"/.test(d) && d.includes('fill="#eeeeee"'), d.slice(0, 200));
}

// ── 4. lo que viene de un archivo se valida ─────────────────────────────────
st.meta.relleno = { tipo: "textura", patron: "<script>", color2: '#fff"/><script>alert(1)</script>', escala: 1e9 };
const r = P.relleno(st);
check("un color con código vuelve al de fábrica", r.color2 === "#ffffff");
check("un patrón desconocido vuelve a rayas y la escala se acota", r.patron === "rayas" && r.escala === 200);
check("nada de eso llega al SVG", !/script/i.test(P.defs(pal)));
st.meta.relleno = { tipo: "otro" };
check("un tipo desconocido es relleno liso", P.relleno(st) === null && P.defs(pal) === "");

// ── 5. Ctrl+Z y el archivo ──────────────────────────────────────────────────
delete st.meta.relleno;
doc.setStyleRelleno(3, { tipo: "degrade", color2: "#123456" });
const sc2 = new A.Scene(JSON.parse(JSON.stringify(doc.scene.toJSON())));
const st2 = sc2.palettes.find((p) => p.id === pal.id).byIndex(3);
check("el relleno sobrevive a guardar y reabrir", st2.meta.relleno && st2.meta.relleno.color2 === "#123456");
doc.history.undo();
check("Ctrl+Z vuelve al relleno anterior", !st.meta.relleno || st.meta.relleno.color2 !== "#123456");
doc.setStyleRelleno(3, { tipo: "textura", patron: "puntos" });
check("relleno liso", doc.setStyleRelleno(3, null) === true && !st.meta.relleno && P.defs(pal) === "");
check("poner lo mismo no ensucia el historial", doc.setStyleRelleno(3, null) === false);

console.log(`Rellenos: ${ok} bien, ${fallan} mal`);
process.exit(fallan ? 1 : 0);
