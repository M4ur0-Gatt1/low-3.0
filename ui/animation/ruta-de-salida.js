/* ══ 📤 DÓNDE VA LO EXPORTADO ════════════════════════════════════════════════
   Todas las salidas —MP4, WebM, GIF, secuencia PNG, hoja de sprites, Premiere—
   le mandan al puente una RUTA, y de esa ruta Python saca dos cosas: la carpeta
   («al lado del documento, en export/») y el nombre base de los archivos.

   La ruta que se mandaba era `DZ.path`, que es la del **.svg suelto**: el
   camino viejo. Desde que LOW abre con «Nuevo documento», el trabajo vive en un
   `.low` y `DZ.path` queda en **null**. Medido en la app real (v4.41.3,
   documento recién creado, exportar secuencia PNG):

       TypeError: argument should be a str or an os.PathLike object
       where __fspath__ returns a str, not 'NoneType'

   …y el estado clavado en «Guardando la secuencia…». Es decir: con el flujo por
   defecto del programa, lo que se anima NO SALÍA de LOW. El final de todo el
   trabajo.

   El documento nuevo sí tiene ruta propia —`DZ.doc.path`, el `.low` que se creó
   al empezar—, así que acá hay una sola verdad y todas las salidas la usan. */
(function (global) {
  "use strict";

  /**
   * La ruta contra la que se resuelve una exportación.
   * @returns {string|null} ruta del documento, o null si todavía no tiene una.
   */
  function dzRutaDeSalida(estado) {
    // EL ESTADO VIENE POR PARAMETRO Y NO SE BUSCA SOLO. `DZ` se declara con
    // `const` en app.js: NO es propiedad de `window`, asi que `global.DZ` es
    // undefined. El rodeo por `new Function` funcionaba en el mock y lo bloquea
    // la CSP de la app real —medido: la exportacion seguia sin ruta—. Quien
    // llama tiene `DZ` a mano; que lo pase.
    const DZ = estado || {};
    // El .svg suelto manda cuando existe: es el documento que el dibujante
    // tiene abierto, y su carpeta es donde espera encontrar `export/`.
    if (DZ.path) return DZ.path;
    const delDoc = DZ.doc && DZ.doc.path;
    if (delDoc) return delDoc;
    // Una pestaña de documento también conoce su archivo: es el último recurso
    // antes de admitir que no hay dónde escribir.
    const activa = DZ.activeDocumentTab;
    const pestañas = Array.isArray(DZ.documentTabs) ? DZ.documentTabs : [];
    const suya = pestañas.find(t => t && t.id === activa && t.path);
    return (suya && suya.path) || null;
  }

  /** Lo que hay que decir cuando no hay dónde exportar (nunca se guardó nada). */
  const DZ_SIN_RUTA = "Guardá el documento antes de exportar: la exportación va " +
    "a una carpeta «export/» al lado del archivo";

  global.dzRutaDeSalida = dzRutaDeSalida;
  global.DZ_SIN_RUTA = DZ_SIN_RUTA;
  global.LOW = global.LOW || {};
  global.LOW.animation = global.LOW.animation || {};
  global.LOW.animation.rutaDeSalida = dzRutaDeSalida;
})(typeof window !== "undefined" ? window : globalThis);
