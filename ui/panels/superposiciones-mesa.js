/* ══════════════════════════════════════════════════════════════════════════
   LAS SUPERPOSICIONES DE LA MESA SE VUELVEN A ALINEAR SOLAS

   El encuadre de cámara, el alambre del rig y la malla NO viven adentro del
   SVG: son capas en PIXELES DE PANTALLA, calculadas desde dónde está la hoja
   en ese momento. O sea que cualquier cosa que mueva la hoja las deja viejas.

   Mauro lo vio antes que ninguna prueba: «el recuadro de cámara se ve
   desfasado de la mesa». Medido con el encuadre puesto: achicar la ventana lo
   dejaba 156 px corrido, agrandarla 223 px, y subir la timeline a 320 px lo
   corría 160 px. La hoja se recentra y el recuadro se queda donde estaba, así
   que el encuadre deja de decir la verdad sobre qué entra en cámara — y
   encuadrar es exactamente para eso.

   Eran dos agujeros en el mismo lugar:

     · sólo se escuchaba el `resize` de la VENTANA, y sólo para el rig y la
       malla: la cámara no se recalculaba nunca;
     · cambiar el alto de la timeline, acoplar un panel o mover un divisor
       cambian el tamaño de la mesa SIN que la ventana cambie de tamaño, así
       que no hay `resize` que escuchar.

   Por eso acá se mira LA MESA y no la ventana: un `ResizeObserver` sobre el
   lienzo cubre a las tres capas y a todas las causas de una vez, incluida la
   ventana —que también cambia el tamaño de la mesa—.

   Se junta en un solo cuadro con `requestAnimationFrame` porque arrastrar un
   divisor dispara el observador en cada píxel del arrastre.

   @module panels/superposiciones-mesa
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const panels = LOW.panels = LOW.panels || {};

  /** Las capas que se posicionan en píxeles de pantalla sobre la mesa. Cada
   *  una se pide por nombre en el momento de usarla, no al cargar: este módulo
   *  se carga antes que `app.js`, y guardarse la función acá la dejaría en
   *  `undefined` para siempre. */
  /* OJO CON `DZ`: en app.js es `const`, asi que NO es propiedad de window.
     Leerlo como `global.DZ` da undefined EN SILENCIO —y el rig y la malla
     dejarian de realinearse sin que nadie se entere—. Se nombra suelto, con
     guarda por si este modulo carga antes que app.js. */
  const estado = () => (typeof DZ !== "undefined" ? DZ : null);

  const CAPAS = [
    { fn: "dzCamOverlay", cuando: () => true },
    { fn: "dzRigOverlayRender", cuando: () => !!(estado() && estado().rigMode) },
    { fn: "dzMeshOverlayRender", cuando: () => !!(estado() && estado().meshPaint) },
  ];

  function alinear() {
    for (const capa of CAPAS) {
      const fn = global[capa.fn];
      if (typeof fn !== "function" || !capa.cuando()) continue;
      // una capa rota no puede dejar a las otras sin alinear
      try { fn(); } catch (_) { /* silencio: alinear es cosmético, no puede tirar la app */ }
    }
  }

  let pedido = 0;
  function pronto() {
    if (pedido) return;
    pedido = global.requestAnimationFrame(() => { pedido = 0; alinear(); });
  }

  /** Engancha la vigilancia. Idempotente: llamarla dos veces no duplica nada. */
  function wire(doc) {
    const d = doc || global.document;
    if (!d || wire._puesto) return false;
    wire._puesto = true;
    global.addEventListener("resize", pronto);
    const mesa = d.querySelector(".dz-canvas") || d.querySelector("#dzCanvas");
    if (mesa && typeof global.ResizeObserver === "function") {
      new global.ResizeObserver(pronto).observe(mesa);
      wire.observando = true;
    }
    return true;
  }

  panels.superposicionesMesa = { alinear, pronto, wire, CAPAS };
  // `app.js` las llama por nombre corto, como al resto de sus ayudantes
  global.dzAlinearSuperposiciones = alinear;
  global.dzAlinearPronto = pronto;
  global.dzAlinearSuperposicionesWire = wire;
})(window);
