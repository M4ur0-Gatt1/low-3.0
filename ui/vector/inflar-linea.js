/* EL INFLADOR INFLA LA LÍNEA, COMO EL PUMP DE OPENTOONZ.

   LO QUE PIDIÓ MAURO: «el inflador debe ser como el inflador de línea de
   OpenToonz: lo que debe inflar es la línea, el contorno, ensancharla o
   desinflarla si lo uso con Alt».

   LO QUE HACÍA ANTES. Inflaba la FORMA: escalaba la geometría hacia afuera
   desde el centro, como un globo. El grosor del contorno no lo tocaba. Para un
   dibujante eso no es inflar una línea: es agrandar el dibujo.

   LO QUE HACE AHORA, y la diferencia importa:

   - Sobre un TRAZO DE PINCEL la hinchazón es LOCAL, que es lo que hace el Pump
     de OpenToonz: el trazo guarda un punto por muestra con su presión
     (`data-low-brush-points`), así que se sube la presión de los puntos que
     caen bajo el cursor, con caída suave hacia los costados, y se vuelve a
     entintar. La línea engorda DONDE pasás, no entera.
   - Sobre una forma entintada o un trazo común no hay ancho por punto: el
     grosor es uno solo para toda la línea (`data-grosor` o `stroke-width`), así
     que se infla toda y el aviso lo dice. Mentir sobre eso sería peor que la
     limitación.

   Con Alt, desinfla. Y como en el Pump, cada pasada suma: pasar dos veces
   engorda más, que es como uno modula una línea de verdad.

   @module vector/inflar-linea */

const DZ_INFLAR_MIN = 0.05, DZ_INFLAR_MAX = 8;      // límites de la presión por punto

/** Aplica una pasada del inflador en (x,y), en coordenadas del dibujo.
 *
 *  Devuelve `{ tipo: "local"|"global", puntos }` con lo que tocó, o null si ese
 *  elemento no tiene una línea que inflar.
 */
function dzInflarLinea(el, x, y, opciones) {
  if (!el || !el.tagName) return null;
  const factor = (opciones && opciones.factor) || 1.06;
  const radio = (opciones && opciones.radio) || 60;

  // ── 1. TRAZO DE PINCEL: hinchazón local, punto por punto
  if (el.hasAttribute && el.hasAttribute("data-low-brush-points")) {
    let puntos;
    try { puntos = JSON.parse(el.getAttribute("data-low-brush-points")); } catch (_) { return null; }
    if (!Array.isArray(puntos) || !puntos.length) return null;
    const r2 = radio * radio;
    let tocados = 0;
    for (const p of puntos) {
      const dx = p[0] - x, dy = p[1] - y, d2 = dx * dx + dy * dy;
      if (d2 > r2) continue;
      // caída suave: el centro del pincel infla todo, el borde casi nada. Sin
      // esto queda un escalón y la línea se ve mordida.
      const caida = 1 - Math.sqrt(d2) / radio;
      const f = 1 + (factor - 1) * caida;
      const presion = (typeof p[2] === "number" ? p[2] : 1) * f;
      p[2] = Math.max(DZ_INFLAR_MIN, Math.min(DZ_INFLAR_MAX, presion));
      tocados++;
    }
    if (!tocados) return { tipo: "local", puntos: 0 };
    el.setAttribute("data-low-brush-points", JSON.stringify(puntos));
    if (typeof dzBrushWidthState === "function" && typeof dzBrushWidthApply === "function") {
      // se vuelve a entintar con el MISMO tamaño: lo que cambió es la presión
      const estado = dzBrushWidthState(el);
      if (estado) dzBrushWidthApply(el, estado, estado.size);
    }
    return { tipo: "local", puntos: tocados };
  }

  // ── 2. FORMA ENTINTADA: un grosor para toda la línea
  if (typeof dzFormaPincelEs === "function" && dzFormaPincelEs(el)) {
    const antes = parseFloat(el.getAttribute("data-grosor")) || 1;
    const grosor = Math.max(0.2, Math.min(400, antes * factor));
    el.setAttribute("data-grosor", Math.round(grosor * 100) / 100);
    if (typeof dzFormaPincelRender === "function") dzFormaPincelRender(el);
    return { tipo: "global", puntos: 1, grosor };
  }

  // ── 3. TRAZO COMÚN: el `stroke-width`, que también es uno solo
  const sw = parseFloat(el.getAttribute("stroke-width") ||
    (el.style && el.style.strokeWidth) || "0");
  if (!sw) return null;
  const grosor = Math.max(0.2, Math.min(400, sw * factor));
  el.setAttribute("stroke-width", Math.round(grosor * 100) / 100);
  return { tipo: "global", puntos: 1, grosor };
}

/** El aviso que corresponde, que no promete lo que no hizo. */
function dzInflarAviso(resultado, desinfla) {
  if (!resultado) return "El inflador trabaja sobre una línea: acercate a un trazo";
  const verbo = desinfla ? "Desinflando" : "Inflando";
  if (resultado.tipo === "local")
    return "\u{1F388} " + verbo + " la línea donde pasás · " + resultado.puntos +
      " puntos · Alt desinfla";
  return "\u{1F388} " + verbo + " toda la línea — este trazo tiene un solo grosor · " +
    (resultado.grosor ? resultado.grosor.toFixed(1) + " px · " : "") + "Alt desinfla";
}

/** Una pasada del inflador donde esté el cursor, con su aviso. Alt desinfla.
 *  Vive acá y no en `app.js` porque el techo de `app.js` está al límite: lo que
 *  se agrega va en un módulo (biblia §12). */
function dzInflarPasada(el, e) {
  const p = dzToUser(e.clientX, e.clientY);
  // POR TRAMO es el comportamiento por defecto: si la linea tiene un solo
  // grosor, se la pasa a ancho variable UNA vez y desde ahi engorda el pedazo
  // donde se pasa. «Toda la linea» quedo como opcion de la herramienta.
  let sujeto = el;
  if (dzInflarModo() === "tramo" && !el.hasAttribute("data-low-brush-points")
      && !(typeof dzFormaPincelEs === "function" && dzFormaPincelEs(el))) {
    const convertido = dzLineaAAnchoVariable(el);
    if (convertido) sujeto = convertido;
  }
  const r = dzInflarLinea(sujeto, p.x, p.y,
    { radio: 60 / (DZ.zoom || 1), factor: e.altKey ? 0.94 : 1.06 });
  dzSetStatus(dzInflarAviso(r, !!e.altKey));
  return { ...(r || {}), elemento: sujeto };
}

/* ── POR TRAMO, QUE ES EL COMPORTAMIENTO POR DEFECTO ─────────────────────
   Mauro, después de probar la v4.39.0: «la idea es que infle por tramo entre un
   punto y el otro, no que infle todo parejo. Quizá sirve lo de que infle
   parejo, pero como una opción de la herramienta, no como comportamiento por
   defecto».

   El problema de fondo: un trazo de lápiz es un `path` con UN `stroke-width`
   para toda la línea. Con un solo número no se puede tener un tramo más gordo
   que otro, y por eso inflar sólo podía ser parejo.

   Así que al inflar por tramo, la línea se convierte UNA VEZ en un trazo de
   ancho variable —los mismos puntos, el mismo color, el mismo grosor de
   partida, pero con presión por punto— y desde ahí el tramo engorda solo.
   Es lo que hace OpenToonz por debajo: sus trazos siempre tienen ancho
   variable, por eso el Pump puede modular. */

/** Convierte un trazo de grosor único en uno de ancho variable, conservando
 *  geometría, color y grosor. Devuelve el elemento nuevo, o null. */
function dzLineaAAnchoVariable(el) {
  if (!el || typeof dzBrushFinalElement !== "function") return null;
  const tag = el.tagName.toLowerCase();
  if (!["path", "polyline", "polygon", "line"].includes(tag)) return null;
  const grosor = parseFloat(el.getAttribute("stroke-width") || "0");
  if (!grosor) return null;
  let largo = 0;
  try { largo = el.getTotalLength(); } catch (_) { return null; }
  if (!(largo > 0)) return null;
  // un punto cada ~4 unidades: suficiente para modular sin inflar el archivo
  const pasos = Math.max(8, Math.min(600, Math.round(largo / 4)));
  const puntos = [];
  for (let i = 0; i <= pasos; i++) {
    const q = el.getPointAtLength(largo * i / pasos);
    puntos.push([q.x, q.y, 1]);
  }
  const color = el.getAttribute("stroke") || (typeof DZ !== "undefined" && DZ.drawColor) || "#111111";
  const pincel = (typeof dzCurrentBrush === "function" && dzCurrentBrush()) || null;
  const nuevo = (typeof dzBrushRenderElement === "function")
    ? dzBrushRenderElement(puntos, color, { size: grosor, fixedWidth: false, brush: pincel || undefined })
    : null;
  if (!nuevo) return null;
  nuevo.setAttribute("data-low-brush-points", JSON.stringify(puntos));
  if (pincel) nuevo.setAttribute("data-low-brush-config", JSON.stringify(pincel));
  nuevo.setAttribute("data-low-brush-size", grosor);
  nuevo.setAttribute("data-low-brush-color", color);
  nuevo.setAttribute("data-low-brush-fixed", "0");
  if (el.id) nuevo.id = el.id;
  const capa = el.parentElement;
  el.replaceWith(nuevo);
  if (typeof DZ !== "undefined" && DZ && DZ.sel === el) DZ.sel = nuevo;
  if (capa && typeof dzMarkDirty === "function") dzMarkDirty();
  return nuevo;
}

/** El modo del inflador: "tramo" (por defecto) o "pareja". */
function dzInflarModo() {
  try { return localStorage.getItem("low.inflador.modo") === "pareja" ? "pareja" : "tramo"; }
  catch (_) { return "tramo"; }
}
function dzInflarModoSet(modo) {
  try { localStorage.setItem("low.inflador.modo", modo === "pareja" ? "pareja" : "tramo"); } catch (_) { }
}

/** La opción en la barra de la herramienta, al lado del resto. */
function dzInflarOpcionesHTML() {
  const modo = dzInflarModo();
  return '<label title="Por tramo engorda sólo el pedazo donde pasás; parejo cambia el grosor de toda la línea">' +
    'Inflar <select id="toInflarModo" class="langsel">' +
    '<option value="tramo"' + (modo === "tramo" ? " selected" : "") + '>Por tramo</option>' +
    '<option value="pareja"' + (modo === "pareja" ? " selected" : "") + '>Toda la línea</option>' +
    '</select></label><span class="dz-hint">Alt desinfla</span>';
}
function dzInflarOpcionesWire() {
  const sel = document.querySelector("#toInflarModo");
  if (sel) sel.onchange = (e) => dzInflarModoSet(e.target.value);
}
