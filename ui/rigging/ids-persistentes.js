/* ══════════════════════════════════════════════════════════════════════════
   UN VÍNCULO ES UN `id`, ASÍ QUE EL `id` TIENE QUE SOBREVIVIR

   Reportado tres veces, con tres caras distintas: «una pieza no quedó asociada
   al hueso como debería», «hay una pieza que se mueve suelta cuando muevo
   otras, como en espejo», y el cartel «F1: animando sólo el esqueleto» que
   aparecía aunque el personaje estuviera ahí. Las tres son el mismo defecto.

   MEDIDO, dibujando seis trazos con el lápiz y colocando el esqueleto
   «Humano · stickman» de la biblioteca:

     piezas en la mesa ................ 6
     piezas CON id .................... 0
     id guardados en el documento ..... 0
     vínculos que dejó Repartir ....... 6   (pieza_3 … pieza_8)
     vínculos que apuntan a algo real . 0
     posar un hueso movió .............. nada

   Y sin embargo Repartir informaba «6 piezas repartidas entre 7 huesos».

   LA CAUSA. `dzRigRepartirDibujo` le pone un `id` a cada pieza que no tenga,
   y vincula el hueso a ese `id`. Pero el `id` se escribía sólo en el elemento
   VIVO de la mesa, nunca en el documento. La mesa se rearma desde el documento
   en cuanto algo la repinta —cambiar de cuadro, volver de otro modo, el propio
   repintado del rig—, los `id` se van con el DOM viejo, y los siete vínculos
   quedan apuntando a elementos que ya no existen. El rig sigue «bien» según
   sus datos: lo que se rompió es a qué apuntan.

   LO QUE HACE ESTE MÓDULO. Antes de que Repartir vincule, les pone el `id` a
   las piezas y **guarda el dibujo con esos `id` puestos**. Después el reparto
   original encuentra todo con `id` y no inventa ninguno, así que los vínculos
   nacen apuntando a algo que está guardado y sobrevive a cualquier repintado.

   Va envuelto y no dentro de `app.js` porque app.js está en el techo de su
   presupuesto (§12): así el arreglo suma cero líneas ahí.

   @module rigging/ids-persistentes
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const rigging = LOW.rigging = LOW.rigging || {};
  const estado = () => (typeof DZ !== "undefined") ? DZ : null;

  const hoja = () => {
    const cv = document.querySelector("#dzCanvas");
    return cv ? cv.querySelector(":scope > svg") : null;
  };

  /** Le pone `id` a cada pieza que no tenga y guarda el dibujo con esos `id`.
   *  Devuelve cuántos hizo falta crear. */
  function asegurar() {
    const DZ = estado();
    if (!DZ || !DZ.doc) return 0;
    if (typeof dzRigDrawableElements !== "function" || typeof dzUniqueId !== "function") return 0;

    // La mesa puede estar a medio repintar —crear huesos dispara un repintado—
    // y entonces no habría piezas que numerar. Es la misma puesta al día que
    // hace el reparto; acá tiene que pasar ANTES, o los id se numerarían sobre
    // una mesa vacía y el problema volvería por otra puerta.
    const svg = hoja();
    const guardado = (DZ.doc.drawing && DZ.doc.drawing.content) || "";
    if (svg && guardado && typeof dzCompositionElements === "function" &&
        !dzCompositionElements(svg).length && typeof dzCanvasSet === "function")
      dzCanvasSet(guardado);

    let nuevos = 0;
    for (const el of dzRigDrawableElements())
      if (el && !el.id) { el.id = dzUniqueId("pieza_"); nuevos++; }

    if (nuevos && typeof DZ.doc.writeDrawing === "function" && typeof dzCanvasInner === "function")
      DZ.doc.writeDrawing(dzCanvasInner());
    return nuevos;
  }

  /** Cuántos vínculos del rig apuntan a algo que no está en la mesa. Sirve
   *  para el guardia y para decírselo a quien está animando. */
  function colgados() {
    const DZ = estado();
    const svg = hoja();
    if (!DZ || !DZ.doc || !svg) return [];
    const nodos = Object.values((DZ.doc.scene.rig && DZ.doc.scene.rig.nodes) || {});
    return nodos.filter((n) => n.elementId && !svg.querySelector("#" + CSS.escape(n.elementId)))
      .map((n) => ({ hueso: n.id, pieza: n.elementId }));
  }

  /** ¿El `id` de esta pieza está en el dibujo GUARDADO? */
  function estaGuardado(doc, elementId) {
    const guardado = (doc && doc.drawing && doc.drawing.content) || "";
    return guardado.indexOf('id="' + elementId + '"') >= 0;
  }

  /* CERRAR LA FAMILIA POR EL CUELLO DE BOTELLA.  Repartir no es el único
     camino que vincula: dibujar un hueso a mano sobre una pieza también le
     pone un `id` y vincula (app.js, al soltar el hueso), y cualquier camino
     futuro hará lo mismo. En vez de acordarse en cada uno, se pide la regla
     donde TODOS pasan: un vínculo tiene que apuntar a un `id` que esté
     guardado, si no el primer repintado lo deja colgado.

     No se midió que el camino del hueso a mano estuviera roto —no llegué a
     dispararlo desde el arnés—, así que esto no se presenta como el arreglo
     de un defecto observado, sino como la regla que lo vuelve imposible.
     Cuando el `id` ya está guardado —que es lo normal después de Repartir—
     no hace nada. */
  function envolverVinculo() {
    const DZ = estado();
    if (!DZ || !DZ.doc) return false;
    const proto = Object.getPrototypeOf(DZ.doc);
    if (!proto || typeof proto.bindRigElement !== "function" || proto.bindRigElement.__idGuardado) return false;
    const original = proto.bindRigElement;
    const envuelta = function (boneId, elementId) {
      const ok = original.apply(this, arguments);
      if (ok && elementId && !estaGuardado(this, elementId) &&
          typeof this.writeDrawing === "function" && typeof dzCanvasInner === "function") {
        try { this.writeDrawing(dzCanvasInner()); } catch (_) { /* vincular vale más que guardar ya */ }
      }
      return ok;
    };
    envuelta.__idGuardado = true;
    proto.bindRigElement = envuelta;
    return true;
  }

  function envolver() {
    const original = global.dzRigRepartirDibujo;
    if (typeof original !== "function" || original.__idsPersistentes) return false;
    const envuelta = function (...args) {
      try { envolverVinculo(); asegurar(); } catch (_) { /* numerar no puede impedir repartir */ }
      return original.apply(this, args);
    };
    envuelta.__idsPersistentes = true;
    global.dzRigRepartirDibujo = envuelta;
    // el documento puede no existir todavía al cargar: se reintenta al repartir
    try { envolverVinculo(); } catch (_) {}
    return true;
  }

  rigging.idsPersistentes = { asegurar, colgados, envolver, envolverVinculo, estaGuardado };
  global.dzRigAsegurarIds = asegurar;
  global.dzRigVinculosColgados = colgados;

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", envolver, { once: true });
  else envolver();
})(window);
