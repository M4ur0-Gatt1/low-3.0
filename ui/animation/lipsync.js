/* ══════════════════════════════════════════════════════════════════════════
   LIPSYNC POR AMPLITUD

   Qué hace y qué NO hace, dicho de entrada: esto lee el VOLUMEN del audio, no
   los fonemas. Reparte las bocas de cerrada a abierta según cuánta voz hay en
   cada cuadro. No distingue una «M» de una «A», porque para eso hace falta
   reconocimiento de fonemas y LOW no lo tiene.

   Aun así resuelve el trabajo real: en producción 2D la primera pasada de
   lipsync casi siempre es por amplitud, y después se corrigen a mano las
   sílabas que importan. Las claves que deja son claves de sustitución
   comunes y corrientes, así que se arreglan desde la X-sheet como cualquier
   otra y entran en Undo.

   Tres decisiones que separan un lipsync usable de uno que tiembla:

   1) SILENCIO EXPLÍCITO. Por debajo del umbral va la boca cerrada, siempre. Un
      lipsync que sigue moviendo la boca en los silencios se nota desde lejos.
   2) SOSTÉN MÍNIMO. Una boca no puede durar un solo cuadro: a 24 fps eso es un
      parpadeo, no una sílaba. Por omisión cada forma se sostiene dos cuadros.
   3) SÓLO SE ESCRIBE EL CAMBIO. Si la boca no cambia, no se pone clave. Así la
      X-sheet queda legible y corregir a mano no pelea con cincuenta claves
      repetidas.

   El módulo es PURO: recibe picos y devuelve un mapa de cuadro → forma.

   @module animation/lipsync
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};

  /**
   * @param {number[]} picos      un valor 0..1 por cuadro (índice 0 = cuadro 1)
   * @param {string[]} formas     ids de boca, ORDENADOS de cerrada a abierta
   * @param {object}   opciones   { umbral, sosten, desde, hasta, ganancia }
   * @returns {{keys: Object, cambios: number, cuadros: number}}
   */
  function lipsyncPorAmplitud(picos, formas, opciones = {}) {
    const bocas = (formas || []).filter(Boolean);
    const vacio = { keys: {}, cambios: 0, cuadros: 0 };
    if (!Array.isArray(picos) || !picos.length || bocas.length < 2) return vacio;

    const umbral = Math.max(0, Math.min(1, +opciones.umbral || 0.08));
    const sosten = Math.max(1, Math.round(+opciones.sosten || 2));
    const desde = Math.max(1, Math.round(+opciones.desde || 1));
    const hasta = Math.max(desde, Math.round(+opciones.hasta || picos.length));
    const ganancia = +opciones.ganancia > 0 ? +opciones.ganancia : 1;

    // El pico más alto del TRAMO manda la escala: una toma susurrada tiene que
    // abrir la boca igual que una gritada, o el personaje murmura toda la
    // escena porque en otra parte del archivo alguien pegó un grito.
    let maximo = 0;
    for (let f = desde; f <= hasta; f++) {
      const v = (picos[f - 1] || 0) * ganancia;
      if (v > maximo) maximo = v;
    }
    if (maximo <= 0) return vacio;

    const nivel = (f) => {
      const v = (picos[f - 1] || 0) * ganancia;
      if (v < umbral) return 0;                       // silencio: boca cerrada
      const t = Math.min(1, v / maximo);
      // el 0 queda reservado al silencio; la voz reparte entre 1 y la última
      return Math.max(1, Math.min(bocas.length - 1, Math.round(t * (bocas.length - 1))));
    };

    const keys = {};
    let anterior = null, desdeCuadro = desde, elegido = null;
    for (let f = desde; f <= hasta; f++) {
      const quiere = nivel(f);
      if (elegido === null) { elegido = quiere; desdeCuadro = f; }
      else if (quiere !== elegido) {
        // sostén mínimo: no se cambia de boca antes de tiempo
        if (f - desdeCuadro >= sosten) { elegido = quiere; desdeCuadro = f; }
      }
      if (elegido !== anterior) { keys[f] = bocas[elegido]; anterior = elegido; }
    }
    return { keys, cambios: Object.keys(keys).length, cuadros: hasta - desde + 1 };
  }

  /** Picos por cuadro a partir de un AudioBuffer, para cuando no vienen dados.
   *  Es el mismo cálculo que hace la pista de audio: RMS por ventana de cuadro,
   *  que es lo que se corresponde con «cuánta voz hay», no el pico absoluto —
   *  un chasquido no debería abrir la boca de par en par. */
  function picosDeBuffer(buffer, fps) {
    if (!buffer || !buffer.length) return [];
    const rate = buffer.sampleRate || 48000;
    const porCuadro = Math.max(1, Math.round(rate / (+fps || 24)));
    const datos = buffer.getChannelData(0);
    const salida = [];
    for (let i = 0; i < datos.length; i += porCuadro) {
      let suma = 0;
      const fin = Math.min(datos.length, i + porCuadro);
      for (let j = i; j < fin; j++) suma += datos[j] * datos[j];
      salida.push(Math.min(1, Math.sqrt(suma / Math.max(1, fin - i)) * 2.5));
    }
    return salida;
  }

  animation.lipsyncPorAmplitud = lipsyncPorAmplitud;
  animation.lipsyncPicosDeBuffer = picosDeBuffer;
})(window);
