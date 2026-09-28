/* ══════════════════════════════════════════════════════════════════════════
   LA PRIMERA POSE NO SE PIERDE

   MEDIDO en LOW v4.50.0, con un personaje vinculado y sostenido: se clava UNA
   sola pose en el cuadro 8 y…

     cuadro 8 → la pieza se movió 55 px   (lo que uno quería)
     cuadro 1 → la pieza se movió 55 px   (la primera pose, destruida)

   No es un error de cuenta: con una sola clave, esa pose vale para TODOS los
   cuadros —el modelo devuelve la primera clave para todo lo anterior, que es
   lo correcto—. El problema es que nadie lo dice y que la forma de evitarlo
   no está a mano.

   Toon Boom Harmony advierte exactamente esto en su guía de cut-out:

     «First, make sure there is a keyframe on the first frame of every layer
      of the model. This ensures that when you make the second pose later,
      your first pose will not be affected.»

   Harmony te lo hace poner a mano. Acá se pone solo, al clavar la PRIMERA
   pose de un hueso en un cuadro que no es el 1, y se avisa. Es la diferencia
   entre un programa que te enseña el oficio a los golpes y uno que te lo
   resuelve.

   TRES DECISIONES:

   1. Sólo con la PRIMERA clave del hueso. Si ya tiene claves, el animador
      está trabajando con su propio timing y meterle claves sería peor que no
      hacer nada.
   2. Sólo ese hueso, no todos. Un hueso sin claves no se mueve, así que no
      hay nada que proteger; llenar el rig de claves en el cuadro 1 ensucia la
      hoja de tiempos sin motivo.
   3. Va en la capa de AUTORÍA, no en el modelo. `doc.setRigKey` es el modelo
      y tiene que seguir siendo literal —una clave es una clave—; además las
      pruebas del modelo lo usan directo y cuentan las claves que crean. Esto
      envuelve `dzRigSetKey`, que es por donde pasan las siete formas de
      clavar una pose desde la interfaz.

   @module animation/clave-en-el-uno
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};
  const estado = () => (typeof DZ !== "undefined") ? DZ : null;

  const REPOSO = { x: 0, y: 0, r: 0, sx: 1, sy: 1 };

  /** ¿Clavar acá le pisaría al hueso su primera pose? */
  function pisaLaPrimera(id, num) {
    const DZ = estado();
    if (!DZ || !DZ.doc || !id) return false;
    const f = Math.max(1, Math.round(+num || 0));
    if (f <= 1) return false;                       // clavar en el 1 no pisa nada
    const nodos = (DZ.doc.scene.rig && DZ.doc.scene.rig.nodes) || {};
    const node = nodos[id];
    if (!node) return false;
    return !Object.keys(node.keys || {}).length;    // sólo si es su PRIMERA clave
  }

  /** Pone la clave de reposo en el cuadro 1. Devuelve si hizo falta. */
  function proteger(id, num) {
    const DZ = estado();
    if (!pisaLaPrimera(id, num)) return false;
    // se usa el modelo DIRECTO, no dzRigSetKey: si no, se llama a sí mismo
    if (typeof DZ.doc.setRigKey !== "function") return false;
    DZ.doc.setRigKey(id, 1, { ...REPOSO });
    if (typeof global.dzSetStatus === "function")
      global.dzSetStatus("Clave de reposo puesta en el cuadro 1 para «" + id +
        "»: así esta pose no te cambia la primera. Si la querías desde el " +
        "principio, posá también en el cuadro 1.");
    return true;
  }

  function envolver() {
    const original = global.dzRigSetKey;
    if (typeof original !== "function" || original.__claveEnElUno) return false;
    const envuelto = function (id, num, k) {
      try { proteger(id, num); } catch (_) { /* proteger no puede impedir posar */ }
      return original.apply(this, arguments);
    };
    envuelto.__claveEnElUno = true;
    global.dzRigSetKey = envuelto;
    return true;
  }

  animation.claveEnElUno = { proteger, pisaLaPrimera, envolver, REPOSO };
  global.dzProtegerPrimeraPose = proteger;

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", envolver, { once: true });
  else envolver();
})(window);
