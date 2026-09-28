/* ══════════════════════════════════════════════════════════════════════════
   ARCOS Y ESPACIADO

   Un movimiento vivo no viaja en línea recta ni a velocidad constante. Las dos
   cosas se juzgan mirando lo mismo: **el espaciado**. Los puntos juntos son
   cuadros lentos, los separados son cuadros rápidos. Es la carta de espaciado
   que se dibuja al costado del papel desde antes de que hubiera computadoras.

   Este módulo recibe la posición de algo cuadro por cuadro y contesta las
   preguntas que uno se hace mirando la mesa:

     · ¿la trayectoria es un ARCO o una escalera de tramos rectos?
     · ¿ACELERA, DESACELERA o va parejo? ¿y dónde cambia?
     · ¿cuál es el cuadro más rápido y el más lento?

   Lo que NO hace, y conviene decirlo: no calcula «overlapping». El overlapping
   —que la cadera arranque y la mano llegue tarde— no es una propiedad de UNA
   trayectoria, es la relación entre dos. Para eso el módulo compara dos series
   y dice cuántos cuadros va atrás una de la otra; el ojo hace el resto viendo
   los dos arcos juntos en la mesa.

   El módulo es PURO: entran puntos, salen números. Se prueba sin navegador.

   @module animation/arcs
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};

  const QUIETO = 0.35;        // menos que esto entre cuadros: no se movió
  const PAREJO = 0.14;        // variación relativa que todavía se lee «parejo»

  /**
   * @param {Array<{f:number,x:number,y:number,clave?:boolean}>} muestras
   * @returns {{
   *   puntos: Array, tramos: Array, largo: number, seMovio: boolean,
   *   tendencia: "acelera"|"desacelera"|"parejo"|"quieto"|"irregular",
   *   masRapido: object|null, masLento: object|null, quiebre: number,
   *   cambios: Array<{f:number, de:string, a:string}>, resumen: string
   * }}
   */
  function analizarArco(muestras) {
    const puntos = (muestras || [])
      .filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))
      .slice()
      .sort((a, b) => (a.f || 0) - (b.f || 0));
    const vacio = { puntos, tramos: [], largo: 0, seMovio: false, tendencia: "quieto",
      masRapido: null, masLento: null, quiebre: 0, cambios: [], resumen: "no se mueve" };
    if (puntos.length < 2) return vacio;

    // ── tramos: la distancia recorrida entre un cuadro y el siguiente ES la
    //    velocidad, porque el paso de tiempo es siempre un cuadro.
    const tramos = [];
    let largo = 0;
    for (let i = 1; i < puntos.length; i++) {
      const a = puntos[i - 1], b = puntos[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      largo += d;
      tramos.push({ desde: a.f, hasta: b.f, paso: d });
    }
    const pasos = tramos.map((t) => t.paso);
    const maxPaso = Math.max(...pasos);
    if (maxPaso < QUIETO) return Object.assign(vacio, { tramos, largo });

    // ── velocidad relativa por tramo, 0..1, para pintar y para comparar
    tramos.forEach((t) => { t.rel = t.paso / maxPaso; });

    // ── qué hace cada tramo respecto del anterior
    for (let i = 0; i < tramos.length; i++) {
      const previo = i ? tramos[i - 1].paso : null;
      if (previo == null) { tramos[i].hace = "arranca"; continue; }
      const base = Math.max(previo, tramos[i].paso, QUIETO);
      const delta = (tramos[i].paso - previo) / base;
      tramos[i].hace = delta > PAREJO ? "acelera" : delta < -PAREJO ? "desacelera" : "parejo";
    }

    // ── dónde cambia de comportamiento: son los cuadros que hay que mirar
    const cambios = [];
    for (let i = 1; i < tramos.length; i++) {
      if (tramos[i].hace !== tramos[i - 1].hace && tramos[i].hace !== "parejo")
        cambios.push({ f: tramos[i].desde, de: tramos[i - 1].hace, a: tramos[i].hace });
    }

    // ── tendencia general: se compara el primer tercio con el último, que es
    //    como se lee un movimiento — no tramo a tramo, que da ruido.
    const tercio = Math.max(1, Math.floor(tramos.length / 3));
    const media = (lista) => lista.reduce((s, x) => s + x, 0) / (lista.length || 1);
    const inicio = media(pasos.slice(0, tercio));
    const fin = media(pasos.slice(-tercio));
    const base = Math.max(inicio, fin, QUIETO);
    const cambio = (fin - inicio) / base;
    let tendencia;
    if (cambio > PAREJO) tendencia = "acelera";
    else if (cambio < -PAREJO) tendencia = "desacelera";
    else tendencia = cambios.length > tramos.length / 2 ? "irregular" : "parejo";

    const iMax = pasos.indexOf(maxPaso);
    const minPaso = Math.min(...pasos);
    const iMin = pasos.indexOf(minPaso);

    return {
      puntos, tramos, largo, seMovio: true, tendencia, cambios,
      masRapido: { f: tramos[iMax].desde, paso: maxPaso },
      masLento: { f: tramos[iMin].desde, paso: minPaso },
      quiebre: quiebreDe(puntos),
      resumen: resumenDe(tendencia, tramos, cambios),
    };
  }

  /** Cuánto se aparta la trayectoria de una curva suave. Sirve para contestar
   *  «¿esto es un arco o una escalera?»: cero es una recta o una curva limpia,
   *  y valores altos son quiebres — el vicio clásico de interpolar a mano
   *  tramo por tramo. Es la distancia media de cada punto a la recta que une a
   *  sus dos vecinos, en unidades del propio recorrido. */
  function quiebreDe(puntos) {
    if (puntos.length < 3) return 0;
    let suma = 0, n = 0;
    for (let i = 1; i < puntos.length - 1; i++) {
      const a = puntos[i - 1], b = puntos[i], c = puntos[i + 1];
      const vx = c.x - a.x, vy = c.y - a.y, largo = Math.hypot(vx, vy);
      if (largo < 1e-6) continue;
      suma += Math.abs((b.x - a.x) * vy - (b.y - a.y) * vx) / largo;
      n++;
    }
    return n ? suma / n : 0;
  }

  function resumenDe(tendencia, tramos, cambios) {
    if (tendencia === "parejo") return "va parejo";
    if (tendencia === "irregular")
      return "espaciado irregular · " + cambios.length + " cambios de velocidad";
    const donde = cambios.length ? " · cambia en F" + cambios.map((c) => c.f).slice(0, 3).join(", F") : "";
    return (tendencia === "acelera" ? "acelera" : "desacelera") + donde;
  }

  /** OVERLAPPING: cuántos cuadros va ATRÁS una trayectoria respecto de otra.
   *  Se prueban desplazamientos y se queda con el que hace que las dos curvas
   *  de velocidad se parezcan más. Positivo = la segunda llega tarde, que es
   *  el overlapping bien hecho; negativo = se adelanta, que casi siempre es un
   *  error de timing.
   *
   *  No se inventa nada: si ninguna de las dos se mueve, o si el parecido es
   *  malo en todos los desplazamientos, devuelve `null` y quien pregunta tiene
   *  que decir «no se puede saber» en vez de mostrar un número cualquiera. */
  function desfase(muestrasA, muestrasB, maximo = 8) {
    const a = analizarArco(muestrasA), b = analizarArco(muestrasB);
    if (!a.seMovio || !b.seMovio) return null;
    const va = a.tramos.map((t) => t.rel), vb = b.tramos.map((t) => t.rel);
    if (va.length < 3 || vb.length < 3) return null;
    let mejor = null;
    const tope = Math.min(maximo, Math.floor(Math.min(va.length, vb.length) / 2));
    for (let d = -tope; d <= tope; d++) {
      let suma = 0, n = 0;
      for (let i = 0; i < va.length; i++) {
        const j = i + d;
        if (j < 0 || j >= vb.length) continue;
        suma += Math.abs(va[i] - vb[j]); n++;
      }
      if (n < 3) continue;
      const error = suma / n;
      if (!mejor || error < mejor.error) mejor = { cuadros: d, error, n };
    }
    if (!mejor || mejor.error > 0.34) return null;   // no se parecen: no opinar
    return mejor;
  }

  animation.analizarArco = analizarArco;
  animation.arcoQuiebre = quiebreDe;
  animation.arcoDesfase = desfase;
})(typeof window !== "undefined" ? window : globalThis);
