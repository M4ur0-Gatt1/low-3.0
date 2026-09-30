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
    /* NO ALCANZABA CON EL CLIC. Reportado en v3.0.1: «el dial del papel cebolla
       no anda, cuando quiero hacer clic se scrollea el sidebar». MEDIDO con un
       arrastre real: a mitad del gesto #dzAnimationDock saltaba 0 → 387 px, el
       fader agarrado quedaba en y=-220 (fuera de la pantalla) y el puntero caía
       sobre OTRO canal, que terminaba en 0. Así que el scroll de los ancestros
       se SOSTIENE hasta soltar. */
    const sostener = () => devolver();
    const soltar = () => {
      document.removeEventListener("scroll", sostener, true);
      document.removeEventListener("pointerup", soltar, true);
      document.removeEventListener("pointercancel", soltar, true);
      window.removeEventListener("blur", soltar);
      setTimeout(devolver, 0);
    };
    document.addEventListener("scroll", sostener, true);
    document.addEventListener("pointerup", soltar, true);
    document.addEventListener("pointercancel", soltar, true);
    window.addEventListener("blur", soltar);
  }, true);

  window.dzOnionScrollFoto = dzOnionScrollFoto;
  window.dzOnionScrollRestaurar = dzOnionScrollRestaurar;

  /* AL ABRIR EL PAPEL CEBOLLA, QUE SE VEA. MEDIDO a 1000x560: el panel
     lateral quedaba bajado 179 px y el mezclador arriba, fuera de la vista: se
     abría un panel que no se veía. Se lo trae a la vista dentro del panel
     lateral (y sólo ahí). */
  function enganchar() {
    const original = window.dzOnionPanelSet;
    if (typeof original !== "function" || original.__alaVista) return;
    const envuelto = function (show) {
      const r = original.apply(this, arguments);
      if (show) {
        const panel = document.getElementById("dzOnionPanel");
        const dock = panel && panel.closest(".dz-animation-dock");
        const traer = () => { if (panel && !panel.hidden && window.LOW?.core?.scrollDentro)
          window.LOW.core.scrollDentro(panel, { inline: null, limite: dock || null }); };
        traer(); requestAnimationFrame(traer);
      }
      return r;
    };
    envuelto.__alaVista = true;
    window.dzOnionPanelSet = envuelto;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();
})();
