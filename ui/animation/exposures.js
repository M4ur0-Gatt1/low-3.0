/* ══════════════════════════════════════════════════════════════════════════
   OPERACIONES DE CELDA — el oficio de la xsheet

   Todo lo que un animador hace con el timing sin tocar un solo dibujo:
   trabajar en 2s, extender un hold, mover una exposición, intercalar. Son las
   operaciones que OpenToonz tiene en su menú Cells, implementadas sobre el
   modelo de `scene-model.js`.

   REGLA QUE NO SE NEGOCIA: ninguna de estas funciones borra ni modifica un
   Drawing. Solo reordenan REFERENCIAS. Borrar una exposición nunca puede
   costarte el dibujo — es el error más caro que puede cometer un programa de
   animación.

   Todo opera sobre rangos [from, to] en frames 1-based de una capa.

   @module animation/exposures
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};

  /** Lee un rango de celdas como array plano (null = celda vacía). */
  function read(layer, from, to) {
    const out = [];
    for (let f = from; f <= to; f++) out.push(layer.cellAt(f));
    return out;
  }
  /** Escribe un array de celdas a partir de `from`. */
  function write(layer, from, cells) {
    cells.forEach((c, i) => layer.setCell(from + i, c));
    return true;
  }
  /** Recorta los null del final para que `lastFrame` no mienta. */
  function trim(layer) {
    while (layer.cells.length && layer.cells[layer.cells.length - 1] == null) layer.cells.pop();
  }
  /** Escribe `cells` desde `from` y BORRA lo que quedaba más allá.
   *  Sin esto, una operación que ACORTA la secuencia (1s sobre un 2s, each,
   *  dedupe) dejaba las celdas viejas del final colgando: aparecían dibujos
   *  fantasma al final de la escena. */
  function replace(layer, from, cells) {
    write(layer, from, cells);
    const finViejo = layer.cells.length;
    for (let f = from + cells.length; f <= finViejo; f++) layer.setCell(f, null);
    trim(layer);
    return true;
  }

  const ops = {
    read, write, replace,

    /** STEP N: cada dibujo del rango pasa a durar N frames (trabajar en 2s, 3s).
     *  Es la operación más usada de todas. */
    step(layer, from, to, n) {
      if (layer.locked || n < 1) return false;
      const src = read(layer, from, to);
      const out = [];
      // se toman los dibujos DISTINTOS del rango: aplicar step sobre un hold
      // ya existente no debe multiplicarlo, sino redefinir su duración
      let prev;
      for (const c of src) {
        if (c !== prev) { for (let k = 0; k < n; k++) out.push(c); prev = c; }
      }
      const resto = read(layer, to + 1, layer.lastFrame());
      replace(layer, from, out.concat(resto));
      return true;
    },

    /** EACH N: conserva una celda de cada N y descarta el resto (lo inverso de
     *  step: pasar de 2s a 1s comprime el tiempo). */
    each(layer, from, to, n) {
      if (layer.locked || n < 1) return false;
      const src = read(layer, from, to);
      const out = src.filter((_, i) => i % n === 0);
      const resto = read(layer, to + 1, layer.lastFrame());
      replace(layer, from, out.concat(resto));
      return true;
    },

    /** Alarga (+1) o acorta (-1) la exposición que contiene a `frame`. */
    stepChange(layer, frame, delta) {
      if (layer.locked) return false;
      const v = layer.cellAt(frame);
      if (v == null) return false;
      const inicio = layer.holdStart(frame);
      const largo = layer.holdLength(frame);
      const nuevo = Math.max(1, largo + delta);
      const resto = read(layer, inicio + largo, layer.lastFrame());
      const bloque = new Array(nuevo).fill(v);
      replace(layer, inicio, bloque.concat(resto));
      return true;
    },

    /** INSERTAR frames vacíos: todo lo que sigue se corre hacia adelante. */
    insert(layer, frame, count = 1) {
      if (layer.locked) return false;
      const resto = read(layer, frame, layer.lastFrame());
      write(layer, frame, new Array(count).fill(null).concat(resto));
      return true;
    },

    /** BORRAR celdas dejándolas vacías (los dibujos siguen en el nivel). */
    clear(layer, from, to) {
      if (layer.locked) return false;
      for (let f = from; f <= to; f++) layer.setCell(f, null);
      trim(layer);
      return true;
    },

    /** BORRAR celdas y correr lo que sigue hacia atrás (quitar tiempo). */
    remove(layer, from, to) {
      if (layer.locked) return false;
      const resto = read(layer, to + 1, layer.lastFrame());
      write(layer, from, resto);
      for (let f = from + resto.length; f <= layer.cells.length; f++) layer.setCell(f, null);
      trim(layer);
      return true;
    },

    /** MOVER un rango a otro frame sin destruir nada (arrastrar exposiciones). */
    move(layer, from, to, destino) {
      if (layer.locked) return false;
      const bloque = read(layer, from, to);
      ops.remove(layer, from, to);
      const d = destino > from ? destino - (to - from + 1) : destino;
      ops.insert(layer, Math.max(1, d), bloque.length);
      write(layer, Math.max(1, d), bloque);
      trim(layer);
      return true;
    },

    /** REPETIR el rango `veces` más (ciclos). */
    repeat(layer, from, to, veces = 1) {
      if (layer.locked || veces < 1) return false;
      const bloque = read(layer, from, to);
      let dest = to + 1;
      for (let i = 0; i < veces; i++) { ops.insert(layer, dest, bloque.length); write(layer, dest, bloque); dest += bloque.length; }
      return true;
    },

    /** INVERTIR el orden de las celdas del rango. */
    reverse(layer, from, to) {
      if (layer.locked) return false;
      write(layer, from, read(layer, from, to).reverse());
      return true;
    },

    /** SWING: agrega el rango invertido a continuación, sin repetir la última
     *  (ida y vuelta — un clásico para ciclos). */
    swing(layer, from, to) {
      if (layer.locked) return false;
      const b = read(layer, from, to).slice(0, -1).reverse();
      if (!b.length) return false;
      ops.insert(layer, to + 1, b.length);
      write(layer, to + 1, b);
      return true;
    },

    /** RESET STEP: deja un frame por dibujo (saca todos los holds del rango). */
    resetStep(layer, from, to) { return ops.each(layer, from, to, 1) && ops.dedupe(layer, from, to); },

    /** Colapsa holds consecutivos a una sola celda. */
    dedupe(layer, from, to) {
      if (layer.locked) return false;
      const src = read(layer, from, to);
      const out = src.filter((c, i) => i === 0 || c !== src[i - 1]);
      const resto = read(layer, to + 1, layer.lastFrame());
      replace(layer, from, out.concat(resto));
      return true;
    },

    /** AUTOEXPOSE: rellena los huecos con el último dibujo expuesto, que es lo
     *  que uno espera al dejar celdas sueltas (2 … 5 → 2,2,2,5). */
    autoexpose(layer, from, to) {
      if (layer.locked) return false;
      let ultimo = layer.cellAt(from);
      for (let f = from; f <= to; f++) {
        const c = layer.cellAt(f);
        if (c == null) layer.setCell(f, ultimo); else ultimo = c;
      }
      return true;
    },

    /** FILL HANDLE: extiende la secuencia arrastrando. Si el rango es un solo
     *  dibujo lo repite; si es una progresión (1,3,5) la continúa (7,9,11).
     *  Es el gesto que más se usa para estirar timing. */
    fillHandle(layer, from, to, hasta) {
      if (layer.locked || hasta <= to) return false;
      const src = read(layer, from, to).filter((c) => c != null);
      if (!src.length) return false;
      let paso = null;
      if (src.length > 1) {
        const d = src[1] - src[0];
        if (d !== 0 && src.every((c, i) => i === 0 || c - src[i - 1] === d)) paso = d;
      }
      let ultimo = src[src.length - 1];
      for (let f = to + 1; f <= hasta; f++) {
        if (paso != null) { ultimo += paso; layer.setCell(f, ultimo); }
        else layer.setCell(f, src[(f - to - 1) % src.length]);
      }
      return true;
    },

    /** NAVEGACIÓN: siguiente/anterior frame donde CAMBIA el dibujo. Es el
     *  Shift+↑/↓ de OpenToonz: saltear los holds es lo que hace usable una
     *  xsheet larga. Devuelve null si no hay más. */
    nextDrawingFrame(layer, frame, dir = 1) {
      const total = Math.max(layer.lastFrame(), frame);
      const actual = layer.cellAt(frame);
      let f = frame + dir;
      while (f >= 1 && f <= total) {
        const c = layer.cellAt(f);
        if (c != null && c !== actual) {
          // Siempre se cae al PRIMER frame de esa exposición. Yendo hacia atrás,
          // devolver el último frame del hold anterior dejaba el cursor en el
          // medio del bloque y el salto siguiente se volvía errático: uno espera
          // aterrizar donde el dibujo empieza.
          return layer.holdStart(f);
        }
        f += dir;
      }
      return null;
    },

    /** Frames donde empieza cada exposición distinta (para el onion skin y
     *  para dibujar las marcas de la xsheet). */
    keyFrames(layer) {
      const out = [];
      const total = layer.lastFrame();
      for (let f = 1; f <= total; f++) {
        const c = layer.cellAt(f);
        if (c != null && c !== layer.cellAt(f - 1)) out.push(f);
      }
      return out;
    },
  };

  animation.exposures = ops;
})(window);
