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

  /** GRUPOS: agrupar la capa, meterla en un grupo que ya existe o sacarla. */
  function itemsDeGrupo(doc, ly) {
    if (typeof doc.crearGrupo !== "function") return [];
    const grupos = (doc.scene.grupos || []).filter((g) => g.id !== ly.grupo);
    const items = [{ icon: "▤", label: "Agrupar esta capa…", action: async () => {
      const n = typeof global.dzPromptModal === "function" ? await global.dzPromptModal("Nombre del grupo nuevo", "por ejemplo «Personaje» o «Fondo»", "") : "Grupo";
      if (n == null) return;
      const g = doc.crearGrupo(n, [ly.id]);
      if (g) avisar("Grupo «" + doc.grupo(g).nombre + "» con «" + ly.name + "» · arrastrá otras capas a su encabezado para sumarlas");
    } }];
    for (const g of grupos.slice(0, 8))
      items.push({ icon: "→", label: "Mover al grupo «" + g.nombre + "»", action: () => { if (doc.moverAGrupo(ly.id, g.id)) avisar("«" + ly.name + "» está en «" + g.nombre + "»"); } });
    const actual = ly.grupo && doc.grupo(ly.grupo);
    if (actual) items.push({ icon: "←", label: "Sacar del grupo «" + actual.nombre + "»", action: () => { if (doc.moverAGrupo(ly.id, null)) avisar("«" + ly.name + "» salió de «" + actual.nombre + "»"); } });
    return items;
  }

  /** El menú del ENCABEZADO de un grupo, en la línea de tiempo. */
  function abrirGrupo(e, id) {
    const D = dz(), doc = D && D.doc, g = doc && typeof doc.grupo === "function" && doc.grupo(id);
    if (!g || typeof global.showCtxMenu !== "function") return false;
    const activa = doc.layer;
    const colores = (global.LOW.animation && global.LOW.animation.GRUPO_COLORES) || [];
    const siguiente = colores[(colores.indexOf(g.color) + 1) % Math.max(1, colores.length)] || g.color;
    global.showCtxMenu(e, [
      { icon: "✎", label: "Renombrar el grupo…", shortcut: "doble clic", action: async () => {
        const n = typeof global.dzPromptModal === "function" ? await global.dzPromptModal("Nombre del grupo", "nombre", g.nombre) : null;
        if (n) doc.setGrupo(g.id, "nombre", n);
      } },
      { icon: "●", label: "Cambiar el color", action: () => doc.setGrupo(g.id, "color", siguiente) },
      { icon: g.plegado ? "▸" : "▾", label: g.plegado ? "Desplegar" : "Plegar", action: () => doc.setGrupo(g.id, "plegado", !g.plegado) },
      { icon: "◉", label: g.oculto ? "Mostrar el grupo" : "Ocultar el grupo", action: () => doc.setGrupo(g.id, "oculto", !g.oculto) },
      { icon: "🔒", label: g.bloqueado ? "Desbloquear el grupo" : "Bloquear el grupo", action: () => doc.setGrupo(g.id, "bloqueado", !g.bloqueado) },
      "separator",
      { icon: "+", label: activa && activa.grupo !== g.id ? "Sumar la capa activa («" + activa.name + "»)" : "Sumar la capa activa (ya está)",
        disabled: !activa || activa.grupo === g.id, action: () => doc.moverAGrupo(activa.id, g.id) },
      { icon: "▢", label: "Desagrupar (las capas quedan)", action: () => { if (doc.desagrupar(g.id)) avisar("Grupo «" + g.nombre + "» deshecho · Ctrl+Z lo vuelve a armar"); } },
    ]);
    return true;
  }

  function abrir(e, id) {
    const D = dz(), doc = D && D.doc;
    if (!doc || typeof global.showCtxMenu !== "function") return false;
    const capas = doc.scene.layers, i = capas.findIndex((l) => l.id === id);
    if (i < 0) return false;
    const ly = capas[i], n = capas.length, arriba = i >= n - 1, abajo = i <= 0;
    // las capas que mandó el estudio 3D se pueden reabrir allá y actualizar
    const l3d = global.LOW && global.LOW.animation && global.LOW.animation.layout3d;
    const de3d = !!(l3d && l3d.fuenteDeCapa && l3d.fuenteDeCapa(ly.id));
    // NO se elige la capa al abrir: elegirla redibuja la línea de tiempo, eso
    // mueve su desplazamiento, y el menú se cierra solo con cualquier scroll
    // (medido: se abría y se cerraba en el mismo instante). Cada acción trabaja
    // sobre su capa.
    global.showCtxMenu(e, [
      { icon: "✎", label: "Renombrar…", shortcut: "doble clic", action: () => renombrar(doc, ly) },
      { icon: "⧉", label: "Duplicar capa", action: () => { const c = doc.duplicateLayer(ly.id); if (c) avisar("Capa duplicada: «" + c.name + "»"); } },
      { icon: "⬚", label: "Elegir toda la capa (todos los cuadros)", shortcut: "Ctrl+Shift+A",
        disabled: !(global.LOW && global.LOW.drawing && global.LOW.drawing.seleccionOpciones),
        action: () => global.LOW.drawing.seleccionOpciones.elegirCapaEntera(ly.id) },
      ...(de3d ? [{ icon: "⬡", label: "Editar en el estudio 3D…", action: () => l3d.editar(ly.id) }] : []),
      "separator",
      ...itemsDeGrupo(doc, ly),
      ...(global.LOW.animation && global.LOW.animation.movimientoCapa
        ? [{ icon: "✥", label: ly.mov ? "Movimiento de la capa… (tiene)" : "Movimiento de la capa…", action: () => global.LOW.animation.movimientoCapa.abrir(ly.id) }] : []),
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
    const cabGrupo = e.target && e.target.closest && e.target.closest(".tl2-row[data-grupo-row] .tl2-name");
    if (cabGrupo && abrirGrupo(e, cabGrupo.closest(".tl2-row").dataset.grupoRow)) { e.preventDefault(); e.stopPropagation(); return; }
    const id = capaDe(e.target);
    if (id && abrir(e, id)) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  global.LOW = global.LOW || {};
  LOW.capaMenu = { abrir, abrirGrupo, capaDe };
})(window);
