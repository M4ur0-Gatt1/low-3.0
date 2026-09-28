/* Reglas puras de producto para el flujo de rigging.
   Mantenerlas fuera de app.js evita que la interfaz vuelva a decidir por su
   cuenta qué puede probarse o animarse. */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};

  const STRUCTURAL_RIG_ERRORS = new Set(["missing-parent", "bone-cycle", "constraint-cycle"]);
  animation.rigModeAccess = function (report) {
    const r = report || {}, errors = r.errors || [];
    const structuralErrors = errors.filter(e => STRUCTURAL_RIG_ERRORS.has(e?.code));
    const hasSkeleton = (+r.boneCount || 0) + (+r.controlCount || 0) > 0;
    return { test: hasSkeleton && structuralErrors.length === 0,
      animate: hasSkeleton && structuralErrors.length === 0, structuralErrors };
  };

  animation.rigWorkflowStatus = function (report, artCount = 0) {
    const r = report || {}, loose = r.unboundElementIds?.length || 0;
    const access = animation.rigModeAccess(r);
    if (access.structuralErrors.length) return { state: "error", title: "Jerarquía con errores",
      detail: `${access.structuralErrors.length} problema(s) estructural(es) · corregilos antes de animar.` };
    if (access.animate && r.boundBoneCount > 0) return {
      state: loose ? "warning" : "ready", title: "Rig listo para animar",
      detail: `${r.boundBoneCount} hueso(s) vinculados` +
        (loose ? ` · ${loose} pieza(s) todavía sueltas` : " · todas las piezas detectadas están vinculadas")
    };
    // Con dibujo en la mesa, «podés vincular después» es un consejo que deja al
    // dibujante mirando el panel: lo que falta es UN paso y hay que nombrarlo.
    if (access.animate) return { state: "skeleton", title: "Esqueleto animable",
      detail: artCount
        ? `${r.boneCount || 0} hueso(s) todavía sin dibujo · acomodá el alambre sobre el personaje y tocá Repartir para pegárselo`
        : `${r.boneCount || 0} hueso(s) · podés crear movimiento ahora y vincular el personaje después` };
    if (artCount) return { state: "warning", title: "Arte sin esqueleto",
      detail: `${artCount} pieza(s) detectadas · colocá una plantilla o dibujá el alambre.` };
    return { state: "empty", title: "Rig sin preparar", detail: "Importá piezas o colocá un esqueleto." };
  };
})(window);
