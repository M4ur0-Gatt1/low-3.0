/* ══════════════════════════════════════════════════════════════════════════
   LIPSYNC CON EL AUDIO REAL: ALINEAR EL TEXTO A LA VOZ

   Pedido de Mauro (oct-2026, LOW 3.21): «sumá la sincronización con el audio
   real» al lipsync desde el texto.

   El texto dice QUÉ sonidos hay y en qué orden (lipsync-texto.js). Falta saber
   CUÁNDO suena cada uno en la grabación. Es una ALINEACIÓN FORZADA: no hace
   falta reconocer el habla —ya sabemos lo que se dice—, sólo ubicarlo.

   Se evaluó Rhubarb Lip Sync (MIT, hecho para esto): pide un binario de ~30 MB
   por sistema, llamarlo por el puente de Python, y su reconocedor es inglés.
   Acá, en JS y sin dependencias:

   1. RASGOS cada 10 ms: la energía (RMS, en escala logarítmica, entre el piso
      de ruido y el pico de la toma) y los AGUDOS (la energía de la derivada
      sobre la de la señal: alto en una S o una F, bajo en una vocal o una M).
   2. Cada clase de sonido tiene un «aspecto» esperado: la vocal es fuerte y
      grave; la S, media y aguda; la M, suave y grave; la P, un silencio con
      un golpe; la pausa, silencio.
   3. VITERBI SEGMENTAL sobre la secuencia de fonemas, de izquierda a derecha:
      cada fonema ocupa un tramo; las pausas de la puntuación y
      entre palabras son OPCIONALES (el que habla puede no frenar); hay
      silencio opcional antes y después. La duración esperada de cada fonema
      (la del texto, escalada al largo real del habla) es el prior de cuánto
      dura cada tramo, con un costo log-normal por apartarse.
   El resultado son los tiempos de cada fonema; de ahí en más es lo mismo que
   la estimación por texto (lipsync-texto.js → aCuadros).

   Es una alineación por ASPECTO, no un reconocedor: confunde sonidos del
   mismo tipo (una A por una E da igual: es la misma boca). Lo que asegura es
   que los silencios caigan en los silencios, las vocales en la voz y los
   cierres de labios donde la voz se corta.

   @module animation/lipsync-audio
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};
  const HOP = 0.01, VENTANA = 0.025;

  /** Rasgos por cada 10 ms: { e: energía 0..1, h: agudos 0..1 }. */
  function rasgos(muestras, tasa, desdeSeg = 0, hastaSeg = Infinity) {
    const n = muestras.length, hop = Math.max(1, Math.round(tasa * HOP)), win = Math.max(hop, Math.round(tasa * VENTANA));
    const i0 = Math.max(0, Math.floor(desdeSeg * tasa)), i1 = Math.min(n, Math.ceil(Math.min(hastaSeg, n / tasa) * tasa));
    const crudos = [];
    for (let a = i0; a + 1 < i1; a += hop) {
      const b = Math.min(i1, a + win);
      let s = 0, d = 0, prev = muestras[a];
      for (let k = a; k < b; k++) { const x = muestras[k]; s += x * x; const dx = x - prev; d += dx * dx; prev = x; }
      const m = Math.max(1, b - a), rms = Math.sqrt(s / m), drms = Math.sqrt(d / m);
      crudos.push({ db: 20 * Math.log10(rms + 1e-6), h: drms / (rms + 1e-6) });
    }
    if (!crudos.length) return [];
    // la energía entre el piso de ruido (percentil 10) y el pico (percentil 98) de la toma
    const dbs = crudos.map((c) => c.db).sort((x, y) => x - y);
    const piso = dbs[Math.floor(dbs.length * 0.1)], techo = Math.max(piso + 12, dbs[Math.floor(dbs.length * 0.98)]);
    return crudos.map((c) => ({ e: Math.max(0, Math.min(1, (c.db - piso) / (techo - piso))), h: Math.max(0, Math.min(1, c.h / 1.2)) }));
  }

  /* El aspecto de cada clase de sonido: [energía, agudos, peso de los agudos]. */
  const SIBILANTES = new Set(["s", "θ", "tʃ", "ʝ"]);
  function aspecto(t) {
    if (!t || t.pausa) return [0, 0.3, 0];                       // silencio (los agudos no importan)
    switch (t.tipo) {
      case "vocal": return [0.9, 0.18, 1];
      case "semivocal": return [0.78, 0.2, 1];
      case "nasal": case "lateral": case "vibrante_simple": case "vibrante": return [0.6, 0.12, 0.6];
      case "africada": return [0.45, 0.85, 1.4];
      case "fricativa":
        if (SIBILANTES.has(t.f)) return [0.42, 0.9, 1.4];
        if (t.f === "f") return [0.3, 0.7, 1];
        return [0.45, 0.5, 0.6];                                 // j: fricativa velar
      case "oclusiva":
        return "ptk".includes(t.f) ? [0.12, 0.5, 0.3] : [0.5, 0.15, 0.4];   // sorda: cierre y golpe; sonora: casi aproximante
      default: return [0.5, 0.3, 0.3];
    }
  }

  /** Voz: del primer al último tramo con energía (para escalar las duraciones). */
  function tramoConVoz(r) {
    const umbral = 0.35;
    let a = r.findIndex((x) => x.e > umbral), b = -1;
    for (let i = r.length - 1; i >= 0; i--) if (r[i].e > umbral) { b = i; break; }
    return a < 0 ? null : [a, b];
  }

  /**
   * Alinea los fonemas (de lipsync-texto.g2p) a los rasgos de la voz.
   * @returns {{ segmentos: {indice, t0, t1}[], voz: [s0, s1], costo: number } | null}
   *   tiempos en segundos desde el comienzo de los rasgos.
   */
  function alinear(fonemas, r, opciones = {}) {
    const L = LOW.animation.lipsyncTexto;
    if (!r.length || !fonemas.length) return null;
    const voz = tramoConVoz(r);
    if (!voz) return null;
    // estados: silencio inicial, los fonemas (las pausas son opcionales), silencio final
    const base = L.conVisemas(fonemas);
    const estados = [{ silencio: true, opcional: true, idx: -1, dur: 1, asp: aspecto(null) }];
    fonemas.forEach((t, i) => {
      // entre palabras casi no se frena: ese silencio es corto. Los silencios largos van a la
      // puntuación (medido: la pausa de «sí,» se la quedaba el espacio de «una prueba»)
      if (t.pausa) estados.push({ silencio: true, opcional: true, entrePalabras: t.pausa === "espacio", idx: i,
        dur: t.pausa === "espacio" ? 3 : Math.max(1, (base[i].seg || 0.06) / HOP), asp: aspecto(null) });
      else estados.push({ silencio: false, opcional: false, idx: i, dur: Math.max(1, base[i].seg / HOP), asp: aspecto(t) });
    });
    estados.push({ silencio: true, opcional: true, idx: fonemas.length, dur: 1, asp: aspecto(null) });
    // la duración esperada, escalada al largo de la voz encontrada
    const esperado = estados.reduce((a, s) => a + (s.silencio && s.idx >= 0 && s.idx < fonemas.length ? s.dur * 0.5 : s.silencio ? 0 : s.dur), 0);
    const escala = Math.max(0.3, Math.min(4, (voz[1] - voz[0] + 1) / Math.max(1, esperado)));
    for (const s of estados) if (s.idx >= 0 && s.idx < fonemas.length && !s.entrePalabras) s.dur = Math.max(1, s.dur * escala);
    estados[0].dur = Math.max(1, voz[0]); estados[estados.length - 1].dur = Math.max(1, r.length - voz[1]);

    /* VITERBI SEGMENTAL (semi-Markov): cada estado dura un tramo entero, con
       un costo por cuánto se aparta de lo esperado (log-normal). Con un estado
       por fonema y bucles simples, una vocal podía quedarse medio segundo
       barato y tragarse una palabra entera (medido con la voz de Windows:
       «llegaron temprano» se volvía una sola A). Las emisiones de un tramo
       salen de sumas acumuladas: es rápido. */
    const T = r.length, N = estados.length, INF = 1e18;
    const emision = (s, x) => {
      const [e, h, ph] = s.asp, de = (x.e - e) / 0.22, dh = (x.h - h) / 0.25;
      return 0.5 * (de * de + ph * dh * dh);
    };

    const SIGMA = 0.55;
    const limites = estados.map((s, k) => {
      if (k === 0 || k === N - 1) return [1, T];                      // silencio de antes y de después: lo que haga falta
      if (s.entrePalabras) return [1, Math.round(1.5 / HOP)];         // entre palabras: puede haber pausa, pero cuesta (abajo)
      if (s.silencio) return [1, Math.max(4, Math.round(s.dur * 6))]; // una pausa de puntuación puede estirarse bastante
      return [1, Math.max(3, Math.round(s.dur * 3.5))];
    });
    const limites_dmax = (k) => limites[k][1];
    const costoDur = (k, d) => {
      const s = estados[k];
      if (k === 0 || k === N - 1) return 0;
      // la pausa de la puntuación se estira barato; la que cae ENTRE palabras sin puntuación es posible
      // (el actor frena donde quiere) pero cara: si hay una coma cerca, el silencio largo va a la coma
      const z = (Math.log(d) - Math.log(s.dur)) / (s.entrePalabras ? SIGMA * 1.3 : s.silencio ? SIGMA * 1.6 : SIGMA);
      return 0.5 * z * z * 3;
    };
    /* BANDA: cada estado se busca cerca de donde lo pone la estimación (escalada al
       largo de la voz), ± 2 s o el 20 % de la toma. Sin banda, 68 s de audio
       tardaban 12 s (medido); con banda, una fracción, y el error real del
       texto queda muy adentro del margen. */
    const banda = Math.max(Math.round(2 / HOP), Math.round(T * 0.08));
    const ini = new Float64Array(N), fin0 = new Float64Array(N);
    { let c = voz[0]; for (let k = 0; k < N; k++) {
        const s = estados[k], esp = k === 0 || k === N - 1 ? 0 : s.silencio ? (s.entrePalabras ? 1 : s.dur * 0.5) : s.dur;
        ini[k] = k === 0 ? 0 : c; c += esp; fin0[k] = k === N - 1 ? T : c; } }
    const lo = (k) => Math.max(0, Math.floor(ini[k] - banda)), hi = (k) => Math.min(T, Math.ceil(fin0[k] + banda));
    // las emisiones acumuladas, sólo dentro de la banda de cada estado (no N×T entero: 38 MB en una toma larga)
    const acum = estados.map((s, k) => {
      const a0 = k === 0 ? 0 : Math.max(0, lo(k) - limites_dmax(k)), a1 = k === N - 1 ? T : hi(k);
      const a = new Float64Array(a1 - a0 + 1);
      for (let t = a0; t < a1; t++) a[t - a0 + 1] = a[t - a0] + emision(s, r[t]);
      return { a0, a, en: (t) => a[Math.max(0, Math.min(a.length - 1, t - a0))] };
    });
    // F[k][t]: el mejor costo de cubrir los primeros t pasos terminando el estado k en t
    const F = estados.map(() => new Float64Array(T + 1).fill(INF));
    const D = estados.map(() => new Int32Array(T + 1));        // cuánto duró (0 = salteado)
    for (let k = 0; k < N; k++) {
      const [dmin, dmax] = limites[k];
      for (let t = k === 0 ? 0 : lo(k); t <= (k === N - 1 ? T : hi(k)); t++) {
        // saltearlo (sólo los opcionales): cuesta lo mismo que el anterior, más un poco
        if (estados[k].opcional) {
          const c = k === 0 ? (t === 0 ? 0 : INF) : F[k - 1][t] + 0.5;
          if (c < F[k][t]) { F[k][t] = c; D[k][t] = 0; }
        }
        for (let d = dmin; d <= dmax && d <= t; d++) {
          const previo = k === 0 ? (t - d === 0 ? 0 : INF) : F[k - 1][t - d];
          if (previo >= INF) continue;
          const c = previo + (acum[k].en(t) - acum[k].en(t - d)) + costoDur(k, d);
          if (c < F[k][t]) { F[k][t] = c; D[k][t] = d; }
        }
      }
    }
    if (F[N - 1][T] >= INF) return null;
    // hacia atrás: de qué paso a qué paso fue cada estado
    const tramosEst = new Array(N);
    for (let k = N - 1, t = T; k >= 0; k--) { const d = D[k][t]; tramosEst[k] = [t - d, t]; t -= d; }
    const camino = new Int32Array(T);
    for (let k = 0; k < N; k++) for (let t = tramosEst[k][0]; t < tramosEst[k][1]; t++) camino[t] = k;
    const prev = F[N - 1], fin = T;
    // de estados a tiempos por fonema
    const t0 = new Float64Array(fonemas.length).fill(-1), t1 = new Float64Array(fonemas.length).fill(-1);
    for (let t = 0; t < T; t++) {
      const s = estados[camino[t]];
      if (s.idx < 0 || s.idx >= fonemas.length) continue;
      if (t0[s.idx] < 0) t0[s.idx] = t * HOP;
      t1[s.idx] = (t + 1) * HOP;
    }
    const segmentos = [];
    for (let i = 0; i < fonemas.length; i++) if (t0[i] >= 0) segmentos.push({ indice: i, t0: t0[i], t1: t1[i] });
    return { segmentos, voz: [voz[0] * HOP, (voz[1] + 1) * HOP], costo: prev[fin] / Math.max(1, T) };
  }

  /**
   * Texto + audio → tramos en cuadros, listos para las claves.
   * opciones: { idioma, fps, inicio (cuadro donde arranca la ventana), muestras,
   *             tasa, desdeSeg, hastaSeg (ventana del audio), sosten }
   */
  function sincronizar(texto, opciones) {
    const L = LOW.animation.lipsyncTexto;
    const fon = (L.g2p[opciones.idioma || "es"] || L.g2p.es)(texto);
    if (!fon.some((t) => !t.pausa)) return null;
    const r = rasgos(opciones.muestras, opciones.tasa, opciones.desdeSeg || 0, opciones.hastaSeg);
    const al = alinear(fon, r, opciones);
    if (!al) return null;
    const vis = L.conVisemas(fon);
    // con la voz real, un silencio de verdad entre palabras (más de 120 ms) cierra la boca;
    // en la estimación por texto el espacio no cambia de boca porque no dura nada
    const segs = al.segmentos.map((s) => {
      const v = { ...vis[s.indice], t0: s.t0, t1: s.t1 };
      if (v.pausa === "espacio" && s.t1 - s.t0 >= 0.12) v.visema = "V0_Rest";
      return v;
    });
    const fr = L.aCuadros(segs, opciones);
    return { ...fr, fonemas: fon, voz: al.voz, costo: al.costo, segundos: r.length * HOP };
  }

  animation.lipsyncAudio = { rasgos, aspecto, alinear, sincronizar, HOP };
})(typeof window !== "undefined" ? window : globalThis);
