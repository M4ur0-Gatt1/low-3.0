/* ══════════════════════════════════════════════════════════════════════════
   TODAS LAS VENTANAS DE HERRAMIENTAS SE PLIEGAN

   Pedido: «todas las ventanas de herramientas se deben poder esconder como
   escondemos la línea de tiempo».

   DOS FORMAS DE PANEL, Y NO SE PLIEGAN IGUAL. Medido en la app:

     Herramientas ....  74 × 418   columna
     Propiedades ..... 246 × 418   columna
     Rigging ......... 251 × 346   columna
     Paleta .......... 220 × 794   columna
     Línea de tiempo  1366 ×  38   barra

   A una columna lateral plegarla «hacia arriba» no le devuelve nada a la
   mesa: sigue ocupando sus 246 px de ancho. Hay que achicarla DE ANCHO, a una
   tira vertical. A una barra, al revés. Así que la orientación se decide por
   la forma MEDIDA de cada panel, no por una lista escrita a mano que se
   desactualiza en cuanto alguien mueve un panel de sitio.

   LO QUE SE RESPETA, y sale de defectos que ya costaron caro acá:

   · La pestaña NO desaparece al plegar. Si se fuera con el panel no habría
     cómo traerlo de vuelta.
   · En una columna angosta —Herramientas mide 74 px— el nombre no entra, así
     que queda sólo la flecha y el nombre pasa a la ayuda. Un panel con el
     nombre cortado a la mitad es peor que uno con un ícono claro.
   · El estado se recuerda por panel, y se vuelve a aplicar al cambiar de
     espacio de trabajo: cambiar de espacio redibuja todo y sin esto la
     pestaña diría una cosa y se vería otra.
   · Los paneles FIJOS (el viewer y las opciones de herramienta) no se
     pliegan: sin lienzo no hay programa. Y los SUB-PANELES tampoco —la
     Paleta vive dentro de «Propiedades y capas»—: plegar al dueño ya los
     esconde, y darles pestaña propia los dejaba en un cuadrado de 22×21.
   · La línea de tiempo tiene su propia pestaña, que además la ENCIENDE
     cuando está apagada (panels/linea-de-tiempo-pestania.js). No se le pone
     otra encima.

   @module panels/paneles-plegables
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const panels = LOW.panels = LOW.panels || {};

  const CLASE = "dz-plegable";
  const PESTANIA = "dz-panel-pestania";
  const CLAVE = (id) => "low.panel.plegado." + id;
  /* La línea de tiempo ya tiene la suya, y las de la mesa son overlays con su
     propio cierre: plegarlas a una tira adentro del lienzo no significa nada. */
  const SIN_PESTANIA = new Set(["timeline", "camera", "multiplane", "canvas", "toolOptions"]);
  const ANGOSTA = 130;   // por debajo de esto no entra el nombre

  const catalogo = () =>
    (LOW.workspace && LOW.workspace.PANEL_CATALOG) || {};

  const leer = (id) => {
    try { return localStorage.getItem(CLAVE(id)) === "1"; } catch (_) { return false; }
  };
  const escribir = (id, v) => {
    try { localStorage.setItem(CLAVE(id), v ? "1" : "0"); } catch (_) { /* sin memoria igual anda */ }
  };

  /** Alto y ancho: decide si esta ventana se pliega de ancho o de alto. */
  function orientacion(el) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;          // no se puede medir: no se decide
    return r.height > r.width * 1.3 ? "ancho" : "alto";
  }

  function pestaniaDe(el, id, meta) {
    let t = el.querySelector(":scope > ." + PESTANIA);
    if (t) return t;
    t = document.createElement("button");
    t.className = PESTANIA;
    t.type = "button";
    t.dataset.panel = id;
    t.innerHTML = '<span class="dz-pp-flecha" aria-hidden="true">▾</span>' +
      '<span class="dz-pp-tit"></span>';
    const tit = t.querySelector(".dz-pp-tit");
    if (tit) tit.textContent = (meta && meta.label) || id;
    t.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); alternar(id); });
    el.insertBefore(t, el.firstChild);
    el.classList.add(CLASE);
    /* La pestaña desplegada se apoya en la esquina del panel, así que el
       panel tiene que ser su ancla. Pero se le pone SÓLO si no tiene posición
       propia: imponérselo a todos con la clase le pisó la suya a
       `#dzStoryboard` y el panel se estiró encima del escenario. Un control
       para plegar no puede mover un panel de sitio. */
    try {
      if (getComputedStyle(el).position === "static") el.classList.add(CLASE + "-anclado");
    } catch (_) { /* si no se puede medir, mejor no tocar la posición */ }
    return t;
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

  function pintarUno(id, meta) {
    const el = document.querySelector(meta.element);
    if (!el || meta.fijo || SIN_PESTANIA.has(id)) return;
    // Un sub-panel no lleva pestaña propia: la Paleta vive DENTRO de
    // «Propiedades y capas» (el catálogo lo dice con `owner`), así que plegar
    // el panel dueño ya la esconde. MEDIDO al intentarlo igual: la paleta
    // colapsaba en las dos direcciones y quedaba un cuadrado de 22×21 con la
    // pestaña adentro, sin forma de traerla de vuelta.
    if (meta.owner) return;
    const t = pestaniaDe(el, id, meta);
    const plegado = leer(id);

    // La orientación se mide DESPLEGADO: una vez plegada, la forma ya cambió.
    if (!plegado) {
      const o = orientacion(el);
      if (o) el.dataset.formaPlegado = o;
    }
    const forma = el.dataset.formaPlegado || "alto";

    if (plegado) el.setAttribute("data-plegado", forma);
    else el.removeAttribute("data-plegado");

    // el nombre no entra en una columna angosta: queda la flecha y la ayuda
    const r = el.getBoundingClientRect();
    const angosta = plegado ? forma === "ancho" : (r.width && r.width < ANGOSTA);
    t.classList.toggle("angosta", !!angosta);

    const flecha = t.querySelector(".dz-pp-flecha");
    if (flecha) flecha.textContent = plegado ? (forma === "ancho" ? "▸" : "▴") : "▾";
    const ayuda = (plegado ? "Mostrar " : "Esconder ") + ((meta.label || id).toLowerCase());
    ponerAyuda(t, ayuda);
    t.setAttribute("aria-expanded", String(!plegado));
    t.setAttribute("aria-label", ayuda);
  }

  function pintar() {
    const cat = catalogo();
    for (const [id, meta] of Object.entries(cat)) {
      try { pintarUno(id, meta); } catch (_) { /* un panel raro no puede tumbar al resto */ }
    }
  }

  function alternar(id) {
    const meta = catalogo()[id];
    if (!meta) return;
    escribir(id, !leer(id));
    pintar();
  }

  /** Cambiar de espacio redibuja los paneles: hay que volver a aplicar. */
  function envolverEspacios() {
    const original = global.dzWsAplicar;
    if (typeof original !== "function" || original.__conPlegables) return false;
    const envuelta = function (...args) {
      const r = original.apply(this, args);
      try { pintar(); } catch (_) { /* las pestañas no pueden tumbar un espacio */ }
      return r;
    };
    envuelta.__conPlegables = true;
    global.dzWsAplicar = envuelta;
    return true;
  }

  function arrancar() {
    envolverEspacios();
    pintar();
    // los paneles aparecen y desaparecen solos (rig, cebolla, x-sheet): se los
    // sigue mirando, así el que nace después también tiene su pestaña
    try {
      const obs = new MutationObserver(() => { try { pintar(); } catch (_) {} });
      const raiz = document.getElementById("designView") || document.body;
      obs.observe(raiz, { attributes: true, attributeFilter: ["hidden"], subtree: true });
      panels.panelesPlegablesObs = obs;
    } catch (_) { /* sin observador, igual anda al cambiar de espacio */ }
  }

  panels.panelesPlegables = { arrancar, pintar, alternar, leer, orientacion, SIN_PESTANIA, CLASE, PESTANIA };
  global.dzPlegarPanel = alternar;

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", arrancar, { once: true });
  else arrancar();
})(window);
