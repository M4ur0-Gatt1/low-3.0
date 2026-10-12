/* Sincronización del lipsync con el audio (ui/animation/lipsync-audio.js).
   Uso: node tools/run_lipsync_audio_tests.js

   Con una voz sintética de verdad conocida (tools/voz_sintetica.js). Además,
   en desarrollo se midió con la voz española de Windows (Helena), cuyos
   tiempos de visema da el propio sintetizador: 88 % sincronizado contra 51 %
   de la estimación por texto, 92 % con ruido a 20 dB, 90 % a 10 dB y 92 % en
   una toma de 68 s (ver docs/RELEASE_v3.22.0.md). Esas grabaciones no se
   incluyen: su licencia de redistribución no está clara. */
const fs = require("fs"), path = require("path");
global.window = global; global.self = global;
eval(fs.readFileSync(path.join(__dirname, "..", "ui/animation/lipsync-texto.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "..", "ui/animation/lipsync-audio.js"), "utf8"));
const L = global.LOW.animation.lipsyncTexto, A = global.LOW.animation.lipsyncAudio;
const { generar, precision } = require("./voz_sintetica.js");

let pass = 0, fail = 0;
const ok = (cond, nombre, detalle) => {
  if (cond) { pass++; return; }
  fail++; console.error("FALLA:", nombre, detalle == null ? "" : JSON.stringify(detalle));
};
const sinc = (texto, voz, o = {}) => A.sincronizar(texto, { fps: 24, inicio: 1, sosten: 1, muestras: voz.muestras, tasa: voz.tasa, ...o });
const estimado = (texto, o = {}) => L.tramos(L.g2pEspanol(texto), { fps: 24, inicio: 1, sosten: 1, ...o }).tramos;

// 1. Sincronizado gana a la estimación, en hablantes distintos
{
  const casos = [
    ["Hola, ¿cómo estás, mamá?", { semilla: 3 }],
    ["Mi papá vive en Buenos Aires.", { semilla: 5, ritmo: 0.6 }],                       // lento
    ["Los chicos llegaron temprano, pero nadie los esperaba.", { semilla: 9, ritmo: 1.6 }], // rápido
    ["Esto es una prueba... sí, una prueba.", { semilla: 13, pausas: { suspensivos: 1.1, coma: 0.5 } }],
  ];
  let sumaS = 0, sumaE = 0;
  for (const [texto, o] of casos) {
    const voz = generar(L, texto, o), r = sinc(texto, voz);
    const ps = precision(r.tramos, voz.verdad, 24), pe = precision(estimado(texto), voz.verdad, 24);
    sumaS += ps; sumaE += pe;
    ok(ps >= 0.75, "sincronizado ≥ 75 % · " + texto, { sincronizado: ps.toFixed(2), estimado: pe.toFixed(2) });
    ok(ps > pe, "sincronizado mejor que la estimación · " + texto, { sincronizado: ps.toFixed(2), estimado: pe.toFixed(2) });
  }
  ok(sumaS / casos.length >= 0.82, "promedio sincronizado ≥ 82 %", (sumaS / casos.length).toFixed(3));
}

// 2. El silencio antes de hablar: la primera boca cae donde empieza la voz
{
  const texto = "Mamá";
  const voz = generar(L, texto, { semilla: 21, silencioInicial: 1.2 });
  const r = sinc(texto, voz);
  const primeraHablada = r.tramos.find((t) => t.visema !== "V0_Rest");
  const empiezaVoz = 1 + Math.round(voz.verdad[0].t0 * 24);
  ok(primeraHablada && Math.abs(primeraHablada.desde - empiezaVoz) <= 2, "la primera boca cae donde empieza la voz (±2 cuadros)", { primera: primeraHablada && primeraHablada.desde, empiezaVoz });
  ok(primeraHablada && primeraHablada.visema === "V7_M_B_P", "y es la M cerrada");
}

// 3. Una pausa donde el texto no tiene puntuación: la boca descansa
{
  const texto = "Mi papá vive en Buenos Aires.";
  const fon = L.g2pEspanol(texto), k = fon.findIndex((t, i) => t.pausa === "espacio" && i > 3);
  const voz = generar(L, texto, { semilla: 31, pausaSinPuntuacion: k });
  const r = sinc(texto, voz);
  const pausa = voz.verdad.find((v) => v.visema === "V0_Rest" && v.t1 - v.t0 > 0.5);
  const medio = 1 + Math.floor(((pausa.t0 + pausa.t1) / 2) * 24);
  const enMedio = r.tramos.filter((t) => t.desde <= medio).pop();
  ok(enMedio && enMedio.visema === "V0_Rest", "en una pausa sin puntuación la boca descansa", { medio, enMedio });
  ok(precision(r.tramos, voz.verdad, 24) >= 0.75, "y el resto sigue alineado", precision(r.tramos, voz.verdad, 24).toFixed(2));
}

// 4. Los cierres de labios (M/B/P) caen sobre los de verdad
{
  const texto = "Mamá, papá, bebé.";
  const voz = generar(L, texto, { semilla: 41, ritmo: 0.8 });
  const r = sinc(texto, voz);
  const verdaderos = voz.verdad.filter((v) => v.visema === "V7_M_B_P").map((v) => 1 + Math.round(v.t0 * 24));
  const puestos = r.tramos.filter((t) => t.visema === "V7_M_B_P").map((t) => t.desde);
  const cerca = verdaderos.filter((f) => puestos.some((p) => Math.abs(p - f) <= 2)).length;
  ok(cerca >= verdaderos.length - 1, "los cierres de labios caen a ±2 cuadros de los verdaderos", { verdaderos, puestos });
}

// 5. Ventana del audio, FPS e inicio
{
  const texto = "Hola, mamá.";
  const voz = generar(L, texto, { semilla: 51 });
  const r24 = sinc(texto, voz, { inicio: 100 });
  ok(r24.tramos[0].desde >= 100, "los cuadros se cuentan desde el inicio pedido", r24.tramos[0]);
  const r12 = sinc(texto, voz, { fps: 12 });
  const fin24 = sinc(texto, voz).fin, fin12 = r12.fin;
  ok(Math.abs((fin24 - 1) / 24 - (fin12 - 1) / 12) < 0.15, "a 12 y a 24 fps termina en el mismo segundo", { fin24, fin12 });
  // sólo una ventana del audio: la segunda mitad no tiene la frase
  const ventana = sinc(texto, voz, { desdeSeg: 0, hastaSeg: voz.segundos + 0.8 });
  ok(ventana && precision(ventana.tramos, voz.verdad, 24) >= 0.75, "con una ventana del audio también alinea");
  ok(r24.tramos.every((t, i, a) => i === 0 || (t.desde > a[i - 1].hasta && t.visema !== a[i - 1].visema)), "sin solapes ni dos tramos iguales seguidos");
}

// 6. Sin voz no inventa
{
  const silencio = new Float32Array(16000 * 2);
  ok(A.sincronizar("Hola", { fps: 24, muestras: silencio, tasa: 16000 }) === null, "un audio en silencio no sincroniza nada");
  ok(A.sincronizar("¿?", { fps: 24, muestras: generar(L, "hola", {}).muestras, tasa: 16000 }) === null, "un texto sin palabras no sincroniza nada");
}

// 7. Rendimiento: una toma de ~40 s se alinea en menos de 3 s
{
  const frases = ["Hola, ¿cómo estás, mamá?", "Mi papá vive en Buenos Aires.", "Los chicos llegaron temprano, pero nadie los esperaba.", "Esto es una prueba... sí, una prueba."];
  const texto = Array.from({ length: 3 }, () => frases.join(" ")).join(" ");
  const voz = generar(L, texto, { semilla: 61 });
  const t0 = Date.now(), r = sinc(texto, voz), ms = Date.now() - t0;
  ok(ms < 3000, "una toma de " + voz.segundos.toFixed(0) + " s se alinea en menos de 3 s", ms + " ms");
  ok(precision(r.tramos, voz.verdad, 24) >= 0.75, "y la toma larga sigue alineada", precision(r.tramos, voz.verdad, 24).toFixed(2));
}

console.log(`LIPSYNC CON EL AUDIO: ${pass + fail} pruebas, ${pass} bien, ${fail} fallan`);
process.exit(fail ? 1 : 0);
