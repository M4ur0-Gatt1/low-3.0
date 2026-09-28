/* ══════════════════════════════════════════════════════════════════════════
   EL SALTO DE PANTALLA AL TOCAR UN FADER

   El reporte: «al hacer clic en el controlador tipo consola de sonido del papel
   cebolla hace un salto de pantalla, no me deja usarlo».

   Medido. Al enfocar un fader —que es lo que hace cualquier clic— el navegador
   lo desplaza para «dejarlo a la vista», y arrastra con él a todos los
   contenedores que puedan scrollear:

     #onMixer          scrollLeft  0 → 159
     #dzAnimationDock  scrollTop   0 → 114

   El mixer tiene veinte canales, 505 px de contenido en 240 visibles, así que
   casi cualquier fader está parcialmente fuera de la vista y el desplazamiento
   ocurre siempre. El panel se corre BAJO EL PUNTERO: el fader que agarraste se
   va de lugar, el arrastre sale torcido o directamente agarrás otro canal.

   No es un defecto del control ni del panel: es el `scroll-into-view` implícito
   del foco. Y no se puede evitar con `focus({preventScroll:true})`, porque el
   desplazamiento lo dispara el clic del navegador, no una llamada nuestra.

   Lo que sí funciona: anotar el scroll de los ancestros en el `pointerdown` y
   devolverlo en cuanto el foco terminó de moverlos. El foco se conserva —hace
   falta para manejar el fader con el teclado— y la mesa no se mueve.

   Va como escucha delegada en `document`, en fase de captura, porque
   `dzOnion2Render` reconstruye los faders en cada cambio: cablear cada control
   se perdería en el primer repintado.

   @module panels/onion-scroll-guard
   ══════════════════════════════════════════════════════════════════════════ */

(function () {
  "use strict";

  /** Los ancestros que pueden scrollear, con su posición actual. */
  function dzOnionScrollFoto(nodo) {
    const foto = [];
    for (let n = nodo.parentElement; n && n !== document.documentElement; n = n.parentElement) {
      if (n.scrollWidth > n.clientWidth + 1 || n.scrollHeight > n.clientHeight + 1)
        foto.push([n, n.scrollLeft, n.scrollTop]);
    }
    // La página misma también cuenta.
    foto.push([document.scrollingElement || document.documentElement,
      window.scrollX, window.scrollY]);
    return foto;
  }

  function dzOnionScrollRestaurar(foto) {
    for (const [n, izq, arriba] of foto) {
      if (n === document.scrollingElement || n === document.documentElement) {
        if (window.scrollX !== izq || window.scrollY !== arriba) window.scrollTo(izq, arriba);
        continue;
      }
      if (n.scrollLeft !== izq) n.scrollLeft = izq;
      if (n.scrollTop !== arriba) n.scrollTop = arriba;
    }
  }

  document.addEventListener("pointerdown", (event) => {
    const control = event.target;
    if (!control || !control.matches?.('input[type="range"]')) return;
    if (!control.closest?.("#onMixer")) return;
    const foto = dzOnionScrollFoto(control);
    if (!foto.length) return;
    // Dos pasadas: el foco puede mover el scroll en el mismo tick o en el
    // siguiente frame, segun cuando el navegador resuelve el desplazamiento.
    const devolver = () => dzOnionScrollRestaurar(foto);
    devolver();
    requestAnimationFrame(devolver);
    setTimeout(devolver, 0);
  }, true);

  window.dzOnionScrollFoto = dzOnionScrollFoto;
  window.dzOnionScrollRestaurar = dzOnionScrollRestaurar;
})();
