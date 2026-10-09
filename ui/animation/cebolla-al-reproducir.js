/* ══════════════════════════════════════════════════════════════════════════
   EL PAPEL CEBOLLA NO SE VE MIENTRAS SE REPRODUCE

   Reporte de Mauro (oct-2026, LOW 3.12): «la cámara, al hacer zoom, hace un
   centelleo». En el video se reproduce un movimiento de cámara con el papel
   cebolla prendido: en cada cuadro los fantasmas —rojo el pasado, verde el
   futuro, y los trazos gruesos se notan más— cambian de lugar y de color, y
   la imagen titila. El play existe para juzgar el movimiento, y con la
   cebolla encima no se puede.

   Es lo que hacen Krita, TVPaint y OpenToonz (que lo deja como preferencia,
   apagada de fábrica): durante la reproducción no hay papel cebolla. Al
   parar, vuelve solo.

   Se esconde con una clase sobre el lienzo, sin dejar de pintar: las CAPAS
   EN LA MESA (`dz-onion dz-capa`) usan el mismo camino y tienen que seguir
   avanzando con el play. Esas no se tocan.

   @module animation/cebolla-al-reproducir
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const CLASE = "dz-reproduciendo";

  function marcar(si) {
    const cv = document.getElementById("dzCanvas");
    if (cv) cv.classList.toggle(CLASE, !!si);
  }

  function envolver() {
    const P = global.LOW && global.LOW.animation && global.LOW.animation.Playback;
    if (!P || P.prototype.__conCebolla) return false;
    const play = P.prototype.play, stop = P.prototype.stop;
    P.prototype.play = function (...args) {
      const r = play.apply(this, args);
      marcar(this.playing);
      return r;
    };
    P.prototype.stop = function (...args) {
      const r = stop.apply(this, args);
      marcar(false);
      return r;
    };
    P.prototype.__conCebolla = true;
    return true;
  }

  global.LOW = global.LOW || {};
  global.LOW.animation = global.LOW.animation || {};
  global.LOW.animation.cebollaAlReproducir = { CLASE, envolver, marcar };
  envolver();
})(window);
