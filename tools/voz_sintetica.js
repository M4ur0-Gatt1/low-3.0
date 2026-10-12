/* Una «voz» sintética para probar la sincronización del lipsync con el audio
   (ui/animation/lipsync-audio.js) con la VERDAD conocida: se arma sonido por
   sonido a partir de los fonemas del texto, con las duraciones de un hablante
   irregular, y se devuelve cuándo suena cada visema.

   No pretende sonar a voz: reproduce lo que el alineador mira —energía y
   agudos— con el aspecto de cada clase: la vocal, armónicos fuertes; la S,
   ruido agudo; la M, un zumbido suave; la P, silencio y un golpe; la pausa,
   silencio. Determinista (semilla fija).

   Uso: const { generar } = require("./voz_sintetica.js");
        generar(L, texto, { tasa, ritmo, pausas, semilla, silencioInicial })
        → { muestras: Float32Array, tasa, verdad: [{visema, t0, t1}] } */
function azar(semilla) { let s = semilla >>> 0 || 1; return () => { s = (Math.imul(s, 1103515245) + 12345) >>> 0; return (s & 0x7fffffff) / 0x7fffffff; }; }

function generar(L, texto, op = {}) {
  const tasa = op.tasa || 16000, rnd = azar(op.semilla || 11), ruido = () => rnd() * 2 - 1;
  const fon = L.g2pEspanol(texto), vis = L.conVisemas(fon);
  const partes = [], verdad = [];
  let t = 0;
  const agregar = (seg, fn) => { const n = Math.round(seg * tasa), a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = fn(i, n); partes.push(a); const t0 = t; t += seg; return t0; };
  const f0 = 130;
  const vocal = (amp) => (i, n) => { const x = i / tasa, env = Math.min(1, i / 160, (n - i) / 160); let v = 0; for (let h = 1; h <= 12; h++) v += Math.sin(2 * Math.PI * f0 * h * x) / h; return amp * env * v * 0.6; };
  const zumbido = (amp) => (i) => { const x = i / tasa; return amp * (Math.sin(2 * Math.PI * f0 * x) + 0.3 * Math.sin(4 * Math.PI * f0 * x)); };
  let previo = 0; const agudo = (amp) => () => { const n = ruido(), v = n - previo; previo = n; return amp * v; };
  agregar(op.silencioInicial ?? 0.4, () => 0.0005 * ruido());
  const ritmo = op.ritmo || 1;
  fon.forEach((f, k) => {
    const v = vis[k];
    // el hablante: cada sonido ±35 % de lo esperado, y la velocidad general
    const var_ = 0.65 + rnd() * 0.7;
    if (f.pausa) {
      let seg = (op.pausas && op.pausas[f.pausa] != null) ? op.pausas[f.pausa] : v.seg;
      if (f.pausa === "espacio" && op.pausaSinPuntuacion && k === op.pausaSinPuntuacion) seg = 0.7;   // el actor frena donde no hay coma
      if (seg <= 0) return;
      const t0 = agregar(seg, () => 0.0005 * ruido());
      verdad.push({ visema: f.pausa === "espacio" && seg < 0.12 ? null : "V0_Rest", t0, t1: t });
      return;
    }
    const seg = Math.max(0.03, v.seg * var_ / ritmo);
    let fn;
    switch (f.tipo) {
      case "vocal": case "semivocal": fn = vocal(0.5); break;
      case "nasal": case "lateral": case "vibrante": case "vibrante_simple": fn = zumbido(0.12); break;
      case "fricativa": fn = "sθʝ".includes(f.f) ? agudo(0.18) : f.f === "f" ? agudo(0.08) : agudo(0.1); break;
      case "africada": fn = agudo(0.2); break;
      case "oclusiva": fn = "ptk".includes(f.f) ? ((i, n) => (i > n * 0.75 ? 0.25 * ruido() : 0.0005 * ruido())) : zumbido(0.08); break;
      default: fn = zumbido(0.1);
    }
    const t0 = agregar(seg, fn);
    verdad.push({ visema: f.f && "kgx".includes(f.f) ? null : v.visema, t0, t1: t });
  });
  agregar(0.4, () => 0.0005 * ruido());
  const total = partes.reduce((a, p) => a + p.length, 0), muestras = new Float32Array(total);
  let o = 0; for (const p of partes) { muestras.set(p, o); o += p.length; }
  return { muestras, tasa, verdad, segundos: t };
}

/** Qué parte del tiempo los tramos (cuadros) muestran el visema verdadero. */
function precision(tramos, verdad, fps, inicio = 1, margen = 0.05) {
  const en = (t) => { const f = inicio + Math.floor(t * fps); let v = null; for (const x of tramos) if (x.desde <= f) v = x.visema; return v; };
  const cambios = verdad.map((v) => v.t0);
  let ok = 0, n = 0;
  for (const v of verdad) {
    if (!v.visema) continue;
    for (let t = v.t0; t < v.t1; t += 0.01) {
      if (cambios.some((c) => Math.abs(c - t) < margen)) continue;
      n++; if (en(t) === v.visema) ok++;
    }
  }
  return n ? ok / n : 0;
}

module.exports = { generar, precision };
