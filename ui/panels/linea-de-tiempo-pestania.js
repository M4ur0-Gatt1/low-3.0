/* ══════════════════════════════════════════════════════════════════════════
   LA PESTAÑA DE LA LÍNEA DE TIEMPO — colgada de todas las vistas

   Pedido: «quiero poder minimizar la línea de tiempo, como pegarla en todas
   las vistas como un dropdown».

   QUÉ HABÍA. Plegar existía, pero escondido: el único modo era hacer DOBLE
   CLIC sobre `#dzTlgResize`, un separador de 4 px cuya ayuda lo menciona al
   final de la frase. Y la línea de tiempo aparecía o no según el espacio de
   trabajo: en Dibujo, Limpieza o Color no estaba, y para verla había que
   cambiar de espacio entero. O sea que el tiempo —lo único que se necesita
   en TODOS los espacios— era lo que menos a mano estaba.

   QUÉ HACE ESTO. Una tira fina, siempre presente en cualquier espacio, con
   el número de cuadro a la vista. Un clic la despliega, otro la pliega.

   TRES DECISIONES, y las tres vienen de defectos que ya costaron caro:

   1. NO PUEDE SER UN BOTÓN MUERTO. Si la animación está apagada —que es lo
      normal en el espacio de Dibujo—, la pestaña no se queda quieta: la
      PRENDE y se despliega. Un control que se ve, se aprieta y no hace nada
      es el defecto que más se repitió en este programa.
   2. NO PUEDE MENTIR. Plegada dice en qué cuadro estás y cuántos hay; si no
      hay animación todavía, lo dice también, en vez de mostrar «0 / 0» como
      si fuera un dato.
   3. TIENE QUE SOBREVIVIR AL CAMBIO DE ESPACIO. Cambiar de espacio redibuja
      los paneles y aplica la configuración del espacio; sin volver a poner
      el estado plegado después, la pestaña quedaría desincronizada de lo que
      se ve. Por eso se envuelve `dzWsAplicar`.

   El estado plegado/desplegado se recuerda entre sesiones.

   Va en un módulo, envuelto desde afuera, porque `app.js` está justo en el
   techo de su presupuesto (§12).

   @module panels/linea-de-tiempo-pestania
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const panels = LOW.panels = LOW.panels || {};
  const estado = () => (typeof DZ !== "undefined") ? DZ : null;

  const ID = "dzTlPestania";
  const CLAVE = "low.timeline.plegada";
  /* Lo que se pliega junto con la tira de transporte: la grilla de capas vive
     con ella, y dejarla sola en pantalla es peor que no plegar nada. */
  const CUERPO = ["#dzTimeline", "#dzTlGrid"];

  const guardado = () => {
    try { return localStorage.getItem(CLAVE) === "1"; } catch (_) { return false; }
  };
  const guardar = (v) => {
    try { localStorage.setItem(CLAVE, v ? "1" : "0"); } catch (_) { /* sin memoria, igual funciona */ }
  };

  let plegada = guardado();

  function pestania() {
    let n = document.getElementById(ID);
    if (n) return n;
    const ancla = document.getElementById("dzTimeline");
    if (!ancla || !ancla.parentNode) return null;
    n = document.createElement("button");
    n.id = ID;
    n.className = "dz-tl-pestania";
    n.type = "button";
    n.innerHTML = '<span class="dz-tlp-flecha" aria-hidden="true">▾</span>' +
      '<span class="dz-tlp-tit">Línea de tiempo</span>' +
      '<span class="dz-tlp-dato"></span>';
    n.addEventListener("click", alternar);
    ancla.parentNode.insertBefore(n, ancla);
    return n;
  }

  /** Cuántos cuadros hay y en cuál estás, o null si no hay animación.
   *
   *  CORREGIDO. La primera versión leía sólo `DZ.anim.frames`, que es el
   *  modelo VIEJO —los cuadros como archivos `_f001.svg` sueltos—. Un `.low`
   *  guarda los cuadros en el DOCUMENTO y deja `DZ.anim.frames` vacío, así
   *  que la pestaña anunciaba «sin cuadros» con 18 cuadros en la hoja de
   *  tiempos, mientras la barra de estado decía «cuadro 7/18» a diez
   *  centímetros de distancia. Es la familia de [asume DZ.path]: código que
   *  da por hecho el modelo de los `.svg` sueltos.
   *
   *  Se sigue el mismo orden que usa `dzSbFrame` en app.js: manda el
   *  documento, y `DZ.anim` es el respaldo. Copiar el orden y no inventar
   *  otro es lo que evita que las dos partes de la pantalla se contradigan. */
  function cuadros() {
    const DZ = estado();
    if (!DZ) return null;
    if (DZ.doc && DZ.doc.scene && typeof DZ.doc.scene.lastFrame === "function") {
      const total = DZ.doc.scene.lastFrame() || 0;
      if (total) return { actual: DZ.doc.frame || 1, total };
    }
    if (!DZ.anim) return null;
    const total = (DZ.anim.frames && DZ.anim.frames.length) || 0;
    return { actual: (DZ.anim.idx || 0) + 1, total };
  }

  /** ¿Hay línea de tiempo en pantalla? La verdad es el CUERPO, no `DZ.anim`.
   *  Un `.low` puede tener la hoja de tiempos a la vista con `DZ.anim` en
   *  null —es el modelo viejo de los `.svg` sueltos—, y atarse a esa bandera
   *  hacía que la pestaña dijera «apagada» con la línea de tiempo delante.
   *  Los que plegamos nosotros cuentan como presentes: los escondimos aposta. */
  function hayCuerpo() {
    for (const sel of CUERPO) {
      const el = document.querySelector(sel);
      if (!el) continue;
      if (el.dataset.plegadoPor === ID) return true;
      if (!el.hidden) return true;
    }
    return false;
  }

  /* PONER LA AYUDA SIN ROMPER EL GLOBO.  El módulo de ayuda (panels/tool-help)
     le SACA el `title` al botón mientras muestra su globo —lo guarda en
     `dataset.tituloAyuda`— justamente para que el navegador no dibuje encima
     su tooltip nativo y vuelva el cartel doble que se arregló en la v4.45.2.
     Estas pestañas se repintan seguido (cambio de espacio, observador), y al
     reescribir `title` a ciegas le devolvían el atributo en pleno globo. El
     guardia `check_ayuda_no_tapa_ui` lo cazó. Si la ayuda lo tiene guardado,
     se escribe AHÍ. */
  function ponerAyuda(el, texto) {
    if (!el) return;
    if (el.dataset.tituloAyuda != null) el.dataset.tituloAyuda = texto;
    else el.title = texto;
  }

  /** Pone la pantalla de acuerdo con el estado, sin decidir nada. */
  function pintar() {
    const n = pestania();
    if (!n) return;
    const DZ = estado();
    const c = cuadros();
    const hayAnim = hayCuerpo() || !!(DZ && DZ.anim);

    for (const sel of CUERPO) {
      const el = document.querySelector(sel);
      if (!el) continue;
      if (plegada && hayAnim) { el.dataset.plegadoPor = ID; el.hidden = true; }
      else if (el.dataset.plegadoPor === ID) { delete el.dataset.plegadoPor; el.hidden = false; }
    }

    n.classList.toggle("plegada", plegada || !hayAnim);
    const flecha = n.querySelector(".dz-tlp-flecha");
    if (flecha) flecha.textContent = (plegada || !hayAnim) ? "▴" : "▾";
    /* El contador manda. «Apagada» sólo cuando de verdad no hay nada que
       contar: decir «sin cuadros» con 18 cuadros en la hoja de tiempos, y la
       barra de estado diciendo «cuadro 7/18» diez centímetros más abajo, es
       la peor forma de perder la confianza de quien mira. */
    const dato = n.querySelector(".dz-tlp-dato");
    if (dato) dato.textContent = (c && c.total)
      ? (c.actual + " / " + c.total)
      : (hayAnim ? "sin cuadros" : "apagada");
    ponerAyuda(n, !hayAnim
      ? "Encender la línea de tiempo y desplegarla"
      : (plegada ? "Desplegar la línea de tiempo" : "Plegar la línea de tiempo"));
    n.setAttribute("aria-expanded", String(hayAnim && !plegada));
  }

  async function alternar() {
    const DZ = estado();
    /* 1. Apagada: la pestaña la PRENDE. No es un botón que no hace nada.
       El interruptor de la animación es `DZ.anim` y punto: `hayCuerpo()` sirve
       para decidir QUÉ DECIR, no para decidir si hay que encenderla. Al usarlo
       también acá, el clic se saltaba el encendido y sólo mostraba el cuerpo:
       quedaba una tira de línea de tiempo sin animación detrás, que es la
       misma clase de mentira que se estaba arreglando. */
    if (!DZ || !DZ.anim) {
      plegada = false; guardar(false);
      if (typeof global.dzAnimToggle === "function") {
        try { await global.dzAnimToggle(); } catch (_) { /* lo dice el propio toggle */ }
      }
      pintar();
      return;
    }
    plegada = !plegada; guardar(plegada);
    pintar();
  }

  /** Cambiar de espacio redibuja los paneles: hay que volver a aplicar. */
  function envolverEspacios() {
    const original = global.dzWsAplicar;
    if (typeof original !== "function" || original.__conPestania) return false;
    const envuelta = function (...args) {
      const r = original.apply(this, args);
      try { pintar(); } catch (_) { /* la pestaña no puede tumbar un espacio */ }
      return r;
    };
    envuelta.__conPestania = true;
    global.dzWsAplicar = envuelta;
    return true;
  }

  /** La línea de tiempo se prende y apaga por su cuenta; la pestaña la sigue. */
  function envolverAnim() {
    const original = global.dzAnimToggle;
    if (typeof original !== "function" || original.__conPestania) return false;
    const envuelta = async function (...args) {
      const r = await original.apply(this, args);
      try { pintar(); } catch (_) { /* idem */ }
      return r;
    };
    envuelta.__conPestania = true;
    global.dzAnimToggle = envuelta;
    return true;
  }

  /** Y el número de cuadro cambia todo el tiempo: se sigue a dzGoFrame. */
  function envolverCuadro() {
    const original = global.dzGoFrame;
    if (typeof original !== "function" || original.__conPestania) return false;
    const envuelta = function (...args) {
      const r = original.apply(this, args);
      try { pintar(); } catch (_) { /* idem */ }
      return r;
    };
    envuelta.__conPestania = true;
    global.dzGoFrame = envuelta;
    return true;
  }

  function arrancar() {
    pestania();
    envolverEspacios(); envolverAnim(); envolverCuadro();
    pintar();
  }

  panels.lineaDeTiempoPestania = { arrancar, pintar, alternar, cuadros, ID,
    get plegada() { return plegada; } };
  global.dzTlPestania = alternar;

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", arrancar, { once: true });
  else arrancar();
})(window);
