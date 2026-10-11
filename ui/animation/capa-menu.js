/* ══════════════════════════════════════════════════════════════════════════
   CLIC DERECHO EN UNA CAPA: RENOMBRAR, MOVER, DUPLICAR, ELIMINAR

   Pedido de Mauro (oct-2026, LOW 3.18): «me falta el flujo para eliminar
   capas enteras de la línea de tiempo; quizá clic derecho y opciones de
   renombrar, mover, enviar al fondo, traer adelante o eliminar la capa».

   Eliminar ya existía, pero escondido adentro del botón de propiedades de la
   capa (el de los deslizadores): no había forma de encontrarlo. Ahora, como en
   Toon Boom, Photoshop o After Effects, el clic derecho sobre el NOMBRE de la
   capa —en la línea de tiempo o en la cabecera de su columna de la X-sheet—
   abre el menú de la capa:

     Renombrar… · Duplicar capa · Traer al frente · Subir una posición ·
     Bajar una posición · Enviar al fondo · Eliminar capa…

   Todo pasa por el modelo (doc.moveLayer, removeLayer, duplicateLayer,
   setLayerProperty), así que cada acción es UN paso de Ctrl+Z. Eliminar pide
   confirmación y nunca deja la escena sin capas. «Al frente» es lo que tapa a
   lo demás (en la línea de tiempo, la fila de arriba).

   @module animation/capa-menu
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const avisar = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };

  /** La capa sobre la que se hizo clic derecho, o null. */
  function capaDe(target) {
    if (!target || !target.closest) return null;
    const nombre = target.closest(".tl2-row[data-layer-row] .tl2-name");
    if (nombre) return nombre.closest(".tl2-row").dataset.layerRow;
    const col = target.closest(".xs2-col-head[data-layer-id]");
    return col ? col.dataset.layerId : null;
  }

  async function renombrar(doc, ly) {
    if (typeof global.dzPromptModal !== "function") return;
    const n = await global.dzPromptModal("Nombre de la capa", "nombre", ly.name);
    if (n && n.trim() && n.trim() !== ly.name) { doc.setLayerProperty(ly.id, "name", n.trim(), "Renombrar capa"); avisar("Capa renombrada: " + n.trim()); }
  }

  async function eliminar(doc, ly) {
    if (doc.scene.layers.length <= 1) return avisar("Es la única capa: una escena necesita al menos una");
    const ok = typeof global.dzConfirmModal === "function"
      ? await global.dzConfirmModal("¿Eliminar la capa «" + ly.name + "» con sus dibujos? Se puede deshacer con Ctrl+Z.", { ok: "Eliminar" })
      : true;
    if (!ok) return;
    if (doc.removeLayer(ly.id)) avisar("Eliminé la capa «" + ly.name + "» · Ctrl+Z la devuelve");
  }

  function mover(doc, ly, a, que) {
    if (doc.moveLayer(ly.id, a)) avisar("«" + ly.name + "» " + que);
  }

  function abrir(e, id) {
    const D = dz(), doc = D && D.doc;
    if (!doc || typeof global.showCtxMenu !== "function") return false;
    const capas = doc.scene.layers, i = capas.findIndex((l) => l.id === id);
    if (i < 0) return false;
    const ly = capas[i], n = capas.length, arriba = i >= n - 1, abajo = i <= 0;
    // NO se elige la capa al abrir: elegirla redibuja la línea de tiempo, eso
    // mueve su desplazamiento, y el menú se cierra solo con cualquier scroll
    // (medido: se abría y se cerraba en el mismo instante). Cada acción trabaja
    // sobre su capa.
    global.showCtxMenu(e, [
      { icon: "✎", label: "Renombrar…", shortcut: "doble clic", action: () => renombrar(doc, ly) },
      { icon: "⧉", label: "Duplicar capa", action: () => { const c = doc.duplicateLayer(ly.id); if (c) avisar("Capa duplicada: «" + c.name + "»"); } },
      "separator",
      { icon: "⤒", label: "Traer al frente", disabled: arriba, action: () => mover(doc, ly, n - 1, "quedó al frente de todo") },
      { icon: "↑", label: "Subir una posición", disabled: arriba, action: () => mover(doc, ly, i + 1, "subió una posición") },
      { icon: "↓", label: "Bajar una posición", disabled: abajo, action: () => mover(doc, ly, i - 1, "bajó una posición") },
      { icon: "⤓", label: "Enviar al fondo", disabled: abajo, action: () => mover(doc, ly, 0, "quedó al fondo") },
      "separator",
      { icon: "⌫", label: n <= 1 ? "Eliminar capa (es la única)" : "Eliminar capa…", disabled: n <= 1, action: () => eliminar(doc, ly) },
    ]);
    return true;
  }

  // en captura: las celdas de la línea de tiempo tienen su propio clic derecho, el nombre no
  document.addEventListener("contextmenu", (e) => {
    const id = capaDe(e.target);
    if (id && abrir(e, id)) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  global.LOW = global.LOW || {};
  LOW.capaMenu = { abrir, capaDe };
})(window);
