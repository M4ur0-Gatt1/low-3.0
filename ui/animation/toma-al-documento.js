/* ══ 🎞 LA ACTUACIÓN, ADENTRO DEL DOCUMENTO ══════════════════════════════════
   El titiritero captura la mesa muchas veces por segundo mientras movés el
   muñeco con la mano, y al cortar guarda la toma. Guardarla era escribir
   archivos `nombre_fNNN.svg` al lado del diseño, por el puente:

       api.record_take(DZ.path, snaps)

   Con un `.low` eso no existe: `DZ.path` está en null y el puente encima exige
   que el archivo se llame `_fNNN.svg`. Resultado: con el flujo por defecto del
   programa —«Nuevo documento»— el titiritero contestaba «abrí un diseño
   primero» y no se podía actuar nada.

   Acá la toma se escribe donde vive el trabajo: cada captura es un DIBUJO del
   nivel de la capa activa, expuesto en cuadros consecutivos después del último.
   Es lo mismo que hace el programa cuando duplicás un cuadro, sólo que muchas
   veces seguidas y en una sola operación. */
(function (global) {
  "use strict";

  /**
   * Escribe una toma completa como cuadros consecutivos del documento.
   * @param {object} doc  LowDoc abierto.
   * @param {string[]} contenidos  el contenido de la mesa, uno por captura.
   * @returns {{desde:number, n:number}|{error:string}}
   */
  function dzTomaAlDocumento(doc, contenidos) {
    if (!doc || !doc.scene) return { error: "no hay documento donde grabar la toma" };
    if (!Array.isArray(contenidos) || !contenidos.length) return { error: "toma vacía" };
    const sc = doc.scene;
    const capa = doc.layer || (sc.layers || [])[0];
    if (!capa) return { error: "el documento no tiene capas donde grabar la toma" };
    if (capa.locked) return { error: "la capa está bloqueada: destrabala y volvé a actuar" };
    const nivel = typeof sc.level === "function" ? sc.level(capa.levelId) : null;
    if (!nivel || typeof nivel.addDrawing !== "function")
      return { error: "la capa no tiene nivel donde escribir los dibujos" };

    // Después del último cuadro EXPUESTO de toda la escena: una toma nueva no
    // pisa lo que ya estaba animado, se agrega atrás como una toma más.
    const ultimo = typeof sc.lastFrame === "function" ? sc.lastFrame() : 0;
    const desde = Math.max(1, ultimo + 1);
    // Y con números de dibujo libres: reusar uno existente cambiaría el dibujo
    // en TODOS los cuadros donde ya estaba expuesto.
    const usados = typeof nivel.numbers === "function" ? nivel.numbers() : [];
    let numero = (usados.length ? Math.max.apply(null, usados) : 0) + 1;

    for (let i = 0; i < contenidos.length; i++) {
      nivel.addDrawing(numero + i, contenidos[i] || "");
      sc.expose(capa.id, desde + i, numero + i);
    }
    if (typeof doc.touch === "function") doc.touch();
    else if (typeof sc.touch === "function") sc.touch();
    return { desde, n: contenidos.length };
  }

  /* ── CUADROS INTERCALADOS ─────────────────────────────────────────────────
     Los generadores de movimiento —recorrido, caminata, rebote— insertaban
     cada cuadro con `api.insert_frame(DZ.path, ...)`, que escribe archivos
     `_fNNN.svg` y renumera. Sin `DZ.path` eso no existe, asi que con un
     documento nuevo esos botones no podian generar nada.
     Aca los cuadros entran DESPUES del actual y lo que seguia se corre, que es
     lo que hace el insertar de OpenToonz: la columna se estira, no se pisa. */
  function dzCuadrosAlDocumento(doc, contenidos, despuesDe) {
    if (!doc || !doc.scene) return { error: "no hay documento donde poner los cuadros" };
    if (!Array.isArray(contenidos) || !contenidos.length) return { error: "no hay cuadros que poner" };
    const sc = doc.scene;
    const capa = doc.layer || (sc.layers || [])[0];
    if (!capa) return { error: "el documento no tiene capas" };
    if (capa.locked) return { error: "la capa está bloqueada" };
    const nivel = typeof sc.level === "function" ? sc.level(capa.levelId) : null;
    if (!nivel || typeof nivel.addDrawing !== "function")
      return { error: "la capa no tiene nivel donde escribir los dibujos" };
    const usados = typeof nivel.numbers === "function" ? nivel.numbers() : [];
    let numero = (usados.length ? Math.max.apply(null, usados) : 0) + 1;
    const desde = Math.max(1, Math.round(+despuesDe || 0)) + 1;
    const nuevos = [];
    for (let i = 0; i < contenidos.length; i++) {
      nivel.addDrawing(numero + i, contenidos[i] || "");
      nuevos.push(numero + i);
    }
    // `cells` es un arreglo plano donde el indice es el cuadro menos uno:
    // meter ahi con splice CORRE lo que seguia, en vez de pisarlo.
    if (!Array.isArray(capa.cells)) capa.cells = [];
    while (capa.cells.length < desde - 1) capa.cells.push(null);
    capa.cells.splice(desde - 1, 0, ...nuevos);
    if (typeof sc.touch === "function") sc.touch();
    if (typeof doc.touch === "function") doc.touch();
    return { desde, n: nuevos.length };
  }

  /* ── HORNEAR UNA ACTUACIÓN: el mismo dibujo hasta el cuadro N ────────────
     «Generar los cuadros del lapso» (panel de actuación del esqueleto) los
     sacaba con `api.dup_frame` sobre `DZ.anim.frames`, que en un .low está
     vacío: duplicaba «undefined» y no agregaba nada. El esqueleto vive en el
     documento, así que lo natural es SOSTENER el dibujo actual hasta cubrir el
     lapso, en un solo paso de historial (un Ctrl+Z lo saca entero). */
  function dzSostenerHastaCuadro(doc, n) {
    if (!doc || !doc.scene) return { error: "no hay documento" };
    const N = Math.max(1, Math.round(+n || 0));
    if (N > 200) return { error: "demasiados cuadros (" + N + ") — bajá duración o fps" };
    const capa = doc.layer || (doc.scene.layers || [])[0];
    if (!capa) return { error: "el documento no tiene capas" };
    if (capa.locked) return { error: "la capa está bloqueada" };
    let dibujo = capa.cellAt(doc.frame);
    for (let f = doc.frame - 1; dibujo == null && f >= 1; f--) dibujo = capa.cellAt(f);
    if (dibujo == null) return { error: "no hay dibujo que sostener: dibujá el personaje primero" };
    const ultimo = (typeof capa.lastFrame === "function" ? capa.lastFrame() : 0) || 0;
    const tx = !!doc.history && !doc.history.transaction;
    if (tx) doc.history.begin("Generar los cuadros de la actuación");
    let puestos = 0;
    for (let f = ultimo + 1; f <= N; f++) if (doc.setCell(f, dibujo, capa.id)) puestos++;
    if (tx) doc.history.commit();
    return { puestos, hasta: Math.max(ultimo, N) };
  }

  global.dzSostenerHastaCuadro = dzSostenerHastaCuadro;
  global.dzTomaAlDocumento = dzTomaAlDocumento;
  global.dzCuadrosAlDocumento = dzCuadrosAlDocumento;
  global.LOW = global.LOW || {};
  global.LOW.animation = global.LOW.animation || {};
  global.LOW.animation.tomaAlDocumento = dzTomaAlDocumento;
  global.LOW.animation.cuadrosAlDocumento = dzCuadrosAlDocumento;
})(typeof window !== "undefined" ? window : globalThis);
