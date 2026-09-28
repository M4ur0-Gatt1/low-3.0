/* ══════════════════════════════════════════════════════════════════════════
   EL AVISO Y EL BOTÓN DE SOSTENER, EN EL BLOQUE DE «LISTO PARA ANIMAR»

   Reportado: «no entiendo cómo se anima, porque el personaje no está en todos
   los frames, está sólo en el primer frame, pero el esqueleto sí está en
   todos».

   El bloque de estado del rig decía «Rig listo para animar · todas las piezas
   detectadas están vinculadas», EN VERDE, mientras posar en el cuadro 12 no
   movía nada. No miraba la exposición: un rig puede estar perfectamente
   vinculado y ser inusable porque el arte vive en un solo cuadro.

   La barra de estado sí lo decía —«F12: este cuadro no tiene al personaje ·
   sostené su dibujo (↔ en la hoja de tiempos)»—, pero pedía una maniobra con
   una manija chica de la hoja de tiempos y no ofrecía la acción. Nombrar un
   problema sin dar el botón deja a la persona buscando; y acá lo nombraba en
   la barra de abajo mientras el panel de la derecha decía que estaba todo
   bien. Dos partes de la pantalla contando cosas distintas.

   ESTE MÓDULO, cuando el personaje no llega hasta donde llega la animación:

   · pinta el bloque como AVISO y dice hasta dónde llega y hasta dónde
     debería («el personaje llega al cuadro 1 y la animación al 18»);
   · pone UN botón que lo sostiene, con su atajo a la vista: F5, el mismo
     que usa Toon Boom Harmony para «Extend Exposure». Quien viene de ahí lo
     va a apretar sin pensar.

   Cuando el personaje ya cubre el rango no agrega nada: un aviso permanente
   deja de leerse a la semana.

   Se envuelve `dzRigPanelSync` desde afuera porque `app.js` está en el techo
   de su presupuesto (§12).

   @module rigging/sostener-ui
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const rigging = LOW.rigging = LOW.rigging || {};
  const ID = "rigSostener";

  const cuenta = () => {
    const s = LOW.animation && LOW.animation.sostenerPersonaje;
    try { return s ? s.hasta() : null; } catch (_) { return null; }
  };

  function pintar() {
    const box = document.getElementById("rigReadiness");
    if (!box) return;
    const c = cuenta();
    let fila = document.getElementById(ID);
    const hace_falta = !!(c && c.falta > 0 && c.expuesto > 0);

    if (!hace_falta) { if (fila) fila.remove(); return; }

    if (!fila) {
      fila = document.createElement("div");
      fila.id = ID;
      fila.className = "rig-sostener";
      fila.innerHTML = '<i class="rig-sostener-txt"></i>' +
        '<button type="button" class="rig-sostener-btn">Sostener en todo el rango (F5)</button>';
      fila.querySelector("button").addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        if (typeof global.dzSostenerPersonaje === "function") global.dzSostenerPersonaje();
        pintar();
      });
      box.appendChild(fila);
    }
    const txt = fila.querySelector(".rig-sostener-txt");
    if (txt) txt.textContent = "El personaje llega al cuadro " + c.expuesto +
      " y la animación al " + c.necesario + ": del " + (c.expuesto + 1) +
      " en adelante no hay a quién mover.";
    // el bloque no puede seguir en verde diciendo que está todo listo
    if (box.dataset.state === "ready") box.dataset.state = "warning";
  }

  function envolver() {
    const original = global.dzRigPanelSync;
    if (typeof original !== "function" || original.__conSostener) return false;
    const envuelta = function (...args) {
      const r = original.apply(this, args);
      try { pintar(); } catch (_) { /* el aviso no puede tumbar el panel */ }
      return r;
    };
    envuelta.__conSostener = true;
    global.dzRigPanelSync = envuelta;
    return true;
  }

  rigging.sostenerUI = { pintar, envolver, cuenta, ID };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", envolver, { once: true });
  else envolver();
})(window);
