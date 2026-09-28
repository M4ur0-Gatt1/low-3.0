/* Política pura de entrada del rig. El overlay pregunta qué intención corresponde
   y app.js sólo ejecuta la acción; ninguna vista decide reglas de jerarquía. */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const rigging = LOW.rigging = LOW.rigging || {};

  function pointerAction({ phase = "build", tool = "select", target = "joint",
    isBone = true, parentId = null, pinned = false, role = "bone",
    altKey = false, boneTool = false } = {}) {
    const build = phase === "build", pose = phase === "fk" && tool === "pose";
    if (target === "body") {
      if (build && tool === "create") return "create";
      if (build && tool === "edit" && isBone) return "edit-body";
      if (pose && isBone) return "rotate";
      return "select";
    }
    if (target === "tip") {
      if (build && (boneTool || tool === "create")) return "create-from-tip";
      if (pose) return "rotate";
      if (build && tool === "edit") return "edit-tail";
      return "select";
    }
    if (build && tool === "create") return "create";
    if (build && tool === "pivot") return "pivot";
    if (build && tool === "edit" && isBone && altKey) return "pivot";
    if (build && tool === "edit" && isBone) return "edit-head";
    if (build && tool === "edit") return "pivot";
    if (pose) return (!parentId || pinned || role === "control") ? "translate" : "locked-child";
    return "select";
  }

  // La silueta Moho del hueso pertenece al dibujo y debe escalar con él. El
  // área de agarre se calcula aparte en píxeles para conservar accesibilidad.
  function visualMetrics(viewScale = 1, control = false) {
    const s = Math.max(.08, Math.min(8, Number(viewScale) || 1));
    return {
      headWidth: (control ? 4 : 8) * s,
      tipWidth: (control ? 2 : 1.8) * s,
      jointRadius: Math.max(1.25, 5 * s),
      tipRadius: Math.max(1.1, 5 * s),
      rootRadius: Math.max(1.8, 7 * s),
      controlRadius: Math.max(2.5, 11 * s)
    };
  }

  /** Dónde ofrecer el pole a una cadena que todavía no tiene uno: del mismo
      lado por el que YA dobla —así aparecer no mueve la pierna— y lo bastante
      separado para agarrarlo sin tapar la articulación. Con la cadena estirada
      no hay lado que leer: se cae a la perpendicular del tramo. */
  function suggestedPole({ root, joint, effector } = {}) {
    if (!root || !joint || !effector) return null;
    const middle = { x: (root.x + effector.x) / 2, y: (root.y + effector.y) / 2 };
    let dx = joint.x - middle.x, dy = joint.y - middle.y;
    if (Math.hypot(dx, dy) < 1e-3) { dx = -(effector.y - root.y); dy = effector.x - root.x; }
    const norm = Math.hypot(dx, dy);
    if (!norm) return { x: joint.x, y: joint.y };
    const reach = Math.max(40, Math.hypot(effector.x - root.x, effector.y - root.y) * .6);
    return { x: joint.x + dx / norm * reach, y: joint.y + dy / norm * reach };
  }

  class GestureController extends (LOW.input?.PointerController || class {}) {
    begin(cancel) { return super.begin({ owner: "rig", cancel }); }
    isCurrent(token) { return super.current(token); }
  }

  rigging.input = { pointerAction, visualMetrics, suggestedPole, GestureController,
    createGestureController: () => new GestureController(),
    sharedController: LOW.input?.pointerController || null };
})(typeof window !== "undefined" ? window : globalThis);
