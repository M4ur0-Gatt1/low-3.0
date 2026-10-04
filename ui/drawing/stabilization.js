(function (global) {
  "use strict";
  const drawing = (global.LOW = global.LOW || {}).drawing = global.LOW.drawing || {};
  class Stabilizer {
    constructor({ strength = .35, pressureStrength = .28, minDistance = .2 } = {}) {
      this.strength = Math.max(0, Math.min(.95, strength)); this.pressureStrength = pressureStrength;
      this.minDistance = minDistance; this.last = null;
    }
    reset() { this.last = null; }
    push(point) {
      if (!this.last) return this.last = { ...point };
      const dx = point.x - this.last.x, dy = point.y - this.last.y;
      if (Math.hypot(dx, dy) < this.minDistance) return null;
      const follow = 1 - this.strength;
      const out = { ...point, x: this.last.x + dx * follow, y: this.last.y + dy * follow,
        pressure: this.last.pressure + (point.pressure - this.last.pressure) * (1 - this.pressureStrength) };
      this.last = out; return out;
    }
  }
  drawing.Stabilizer = Stabilizer;

  /* SUAVIZADO POR DISTANCIA RECORRIDA, no por cantidad de puntos.
     El postproceso del trazo promediaba cada punto con sus 2 vecinos de cada
     lado. Medido con un zigzag de 8 px (oct-2026): el detalle quedaba al 58 %
     de su altura —un ojo, una pestaña, un rayado se aplastaban—, porque en un
     trazo chico 5 puntos son TODO el detalle. Acá el peso depende de la
     DISTANCIA a lo largo del trazo (gaussiana, sigma en unidades del dibujo):
     el temblor del pulso, denso y de 1-2 px de pantalla, se promedia; un
     detalle con puntos separados más que sigma casi no se toca. Los extremos
     quedan fijos: el trazo empieza y termina donde se apoyó y se levantó. */
  function suavizarPorDistancia(pts, sigma) {
    const n = pts ? pts.length : 0;
    if (!(sigma > 0) || n < 3) return pts;
    const s = [0];
    for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const R = 3 * sigma, k = 1 / (2 * sigma * sigma);
    const out = [pts[0]];
    let lo = 0;
    for (let i = 1; i < n - 1; i++) {
      while (s[i] - s[lo] > R) lo++;
      const canales = pts[i].length, acc = new Array(canales).fill(0);
      let wsum = 0;
      for (let j = lo; j < n && s[j] - s[i] <= R; j++) {
        const d = s[j] - s[i], w = Math.exp(-d * d * k);
        wsum += w;
        for (let c = 0; c < canales; c++) acc[c] += w * (pts[j][c] == null ? (c === 2 ? .5 : 0) : pts[j][c]);
      }
      out.push(acc.map((v) => v / wsum));
    }
    out.push(pts[n - 1]);
    return out;
  }
  /* Cuánto suavizar, en unidades del DIBUJO, para el deslizador «Suavizado»
     (0-100, 40 por omisión) y el zoom de la mesa. Se piensa en PÍXELES DE
     PANTALLA porque el temblor del pulso es de pantalla: 2 px a 40. Medido: con
     1,2 px el temblor no se iba —el propio zigzag alarga el recorrido y los
     vecinos quedan «lejos»—; con 2 px se va y un detalle de 8 px sobrevive. */
  function sigmaDeSuavizado(amt, zoom) { return (Math.max(0, amt) / 40) * 2 / (zoom || 1); }
  /* EL TRAZO TERMINA DONDE SE LEVANTÓ EL LÁPIZ. El estabilizador en vivo va
     un poco atrás del puntero; sin este último punto REAL, una línea rápida
     quedaba 1,1 % corta (medido con lápiz sintético, oct-2026). Se agrega el
     punto del pointerup con la presión del último (el pointerup trae 0). */
  function cerrarEnElPuntero(pts, punto, tiempo) {
    if (!pts || !pts.length || !punto) return false;
    const l = pts[pts.length - 1];
    if (Math.hypot(punto.x - l[0], punto.y - l[1]) <= 0.5) return false;
    pts.push([punto.x, punto.y, l[2], l[3], l[4], l[5], tiempo || (global.performance ? global.performance.now() : 0)]);
    return true;
  }
  drawing.suavizarPorDistancia = suavizarPorDistancia; drawing.sigmaDeSuavizado = sigmaDeSuavizado;
  drawing.cerrarEnElPuntero = cerrarEnElPuntero;
})(window);
