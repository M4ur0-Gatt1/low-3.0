/* ══════════════════════════════════════════════════════════════════════════
   IR DE CUADRO EN CUADRO: UNA SOLA FUNCIÓN PARA TODOS LOS CAMINOS

   «,» y «.» (v3.12.2) mostraban la leyenda y no movían el cuadro: decidían
   con el modelo VIEJO (`DZ.anim.frames`, vacío en un .low). El arreglo de la
   3.12.2 preguntaba por `DZ.playback`, que sólo existe con una línea de
   tiempo montada; al cambiar de pestaña de documento queda en null un rato y
   las teclas volvían a no hacer nada. Y la misma cuenta estaba copiada en los
   botones ◀ ▶ ⏮ ⏭ y en los comandos de la línea de tiempo separada.

   La regla: si hay DOCUMENTO, manda el documento —con la reproducción si
   está montada, sin ella si no—. El modelo viejo queda sólo para el .svg
   suelto. Todos los caminos llaman a esta función.

   @module animation/navegar-cuadros
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);

  /** que: "prev" | "next" | "first" | "last" */
  function dzNavegar(que) {
    const d = dz();
    if (!d) return false;
    if (d.doc) {
      const pb = d.playback, doc = d.doc;
      if (que === "prev" || que === "next") {
        const paso = que === "prev" ? -1 : 1;
        if (pb) return pb.step(paso);
        return doc.step(paso);
      }
      // de DIBUJO en dibujo, saltando los sostenidos (antes ↑ ↓; ahora Alt+, Alt+.)
      if (que === "prevdrawing" || que === "nextdrawing") {
        const dir = que === "prevdrawing" ? -1 : 1;
        if (pb && typeof pb.stepDrawing === "function") return pb.stepDrawing(dir);
        return typeof doc.stepDrawing === "function" ? doc.stepDrawing(dir) : doc.step(dir);
      }
      if (que === "first") {
        if (pb) return pb.first();
        const r = doc.scene.playRange ? doc.scene.playRange() : null;
        return doc.goTo((r && r.in) || 1);
      }
      if (que === "last") {
        if (pb) return pb.last();
        return doc.goTo((doc.scene.lastFrame && doc.scene.lastFrame()) || 1);
      }
      return false;
    }
    // .svg suelto: el modelo viejo
    if (!d.anim || !d.anim.frames || !d.anim.frames.length) return false;
    if (typeof global.dzAnimStopIf === "function") global.dzAnimStopIf();
    const n = d.anim.frames.length;
    const i = que === "first" ? 0 : que === "last" ? n - 1
      : Math.max(0, Math.min(n - 1, (d.anim.idx || 0) + (que === "prev" ? -1 : 1)));
    return global.dzGoFrame(i);
  }

  global.dzNavegar = dzNavegar;
})(window);
