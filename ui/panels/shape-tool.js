/* ══════════════════════════════════════════════════════════════════════════
   FORMAS: SE DIBUJAN ARRASTRANDO, COMO EN ILLUSTRATOR

   Antes elegir una forma la PLANTABA sola, en el centro del lienzo y con un
   tamaño fijo. Eso hacía dos cosas mal:

     · No la ponía donde uno está mirando. Con la mesa paneada y al 32 % de
       zoom, el centro del lienzo queda fuera de la pantalla: uno clickea, no
       aparece nada donde tiene los ojos, y la herramienta parece rota. Fue
       exactamente el reporte que originó este módulo.
     · No dejaba elegir el tamaño. Había que crear y después reescalar.

   Ahora la forma se arma con el gesto, como en cualquier programa de dibujo:

     apretar → arrastrar → soltar

   MODIFICADORES, los de Illustrator:
     Shift    proporcionado — cuadrado, círculo, línea a 45°
     Alt      desde el CENTRO en vez de desde la esquina

   Un clic sin arrastre deja una forma de tamaño cómodo EN ESE PUNTO. No abre
   un diálogo de medidas: en una mesa de animación se dibuja, no se tipea.

   Escape, cambiar de herramienta o perder el puntero CANCELAN y no dejan nada
   a medias — es la barrera transaccional que pide §3 de la biblia. La forma
   entra al historial como UN paso, al soltar, no mientras crece.

   Extraído de app.js el mismo día que se puso la regla de §12 AHORA·7: lo
   nuevo no entra ahí. `dzAddShape` se mudó con él, que es donde pertenece.
   ══════════════════════════════════════════════════════════════════════════ */

/** Mínimo arrastre, en píxeles de pantalla, para considerarlo un arrastre y no
 *  un clic. Por debajo se deja la forma con tamaño por omisión. */
const DZ_FORMA_MINIMO = 4;
/** Tamaño de la forma que deja un clic simple, como fracción del lienzo. */
const DZ_FORMA_CLIC = 0.12;

let DZ_FORMA = null;      // gesto en curso

function dzFormaKind() { return DZ.shapeKind || "rect"; }

/** Arma la herramienta con la forma elegida. No dibuja: espera el gesto. */
function dzFormaElegir(kind) {
  DZ.shapeKind = kind;
  const icono = document.getElementById("dzShapeMainIcon");
  if (icono) icono.setAttribute("href", "#i-" + (kind === "circle" ? "circle" : kind));
  const menu = document.getElementById("dzShapeMenu");
  if (menu) menu.hidden = true;
  dzSetTool("shape");
  const nombres = { rect: "Rectángulo", circle: "Círculo", ellipse: "Elipse",
    poly: "Polígono", star: "Estrella", line: "Línea" };
  dzSetStatus((nombres[kind] || "Forma") +
    " · arrastrá en la mesa para dibujarlo · Shift proporcionado · Alt desde el centro");
}

/* ── el gesto ───────────────────────────────────────────────────────────── */

function dzFormaDown(e) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return;
  const p = dzToUser(e.clientX, e.clientY);
  const kind = dzFormaKind();
  const el = dzFormaCrear(kind);
  if (!el) return;
  // El elemento se agrega YA, pero el historial no se toca hasta soltar: lo que
  // crece bajo el dedo es una previsualización, no una edición confirmada.
  //
  // Y POR ESO SE CANCELA EL VOLCADO PENDIENTE AL MODELO: si la previsualización
  // no es una edición, tampoco tiene que llegar al documento a medio hacer.
  // `dzMarkDirty` agenda un `dzDocCommit` a 260 ms y el modelo tiene su PROPIO
  // historial, así que un commit agendado por una acción anterior puede caer en
  // medio del arrastre y grabar la forma a medio crecer como un paso.
  //
  // HONESTIDAD SOBRE ESTA LÍNEA: la puse creyendo que explicaba un Ctrl+Z que
  // dejaba la forma pelada al entintar, y NO era eso —era el montaje de mi
  // propia prueba, que vaciaba el lienzo sin sincronizar el modelo—. Se queda
  // porque la carrera es real y la línea es correcta, pero no la vi fallar.
  clearTimeout(DZ_DOC_TIMER);
  dzArtAppend(svg, el);
  DZ_FORMA = { kind, el, ancla: p, pid: e.pointerId, arrastro: false,
    desdePantalla: { x: e.clientX, y: e.clientY } };
  if (typeof DZPointerController !== "undefined" && DZPointerController) {
    DZ_FORMA.gestureToken = DZPointerController.begin({
      owner: "shape", pointerId: e.pointerId, cancel: () => dzFormaCancelar("puntero"),
    });
  }
  dzFormaAplicar(p, e.shiftKey, e.altKey);
}

function dzFormaMove(e) {
  if (!DZ_FORMA || e.pointerId !== DZ_FORMA.pid) return;
  const d = Math.hypot(e.clientX - DZ_FORMA.desdePantalla.x, e.clientY - DZ_FORMA.desdePantalla.y);
  if (d >= DZ_FORMA_MINIMO) DZ_FORMA.arrastro = true;
  dzFormaAplicar(dzToUser(e.clientX, e.clientY), e.shiftKey, e.altKey);
}

function dzFormaUp(e) {
  if (!DZ_FORMA || (e && e.pointerId !== DZ_FORMA.pid)) return;
  const g = DZ_FORMA;
  DZ_FORMA = null;
  // La API del controlador es finish(token, pointerId) y cancel(motivo): commit
  // no existe. Lo escribí de memoria y el gesto moría a mitad de camino — el
  // rectángulo quedaba dibujado pero sin seleccionar, y el gesto siguiente ya
  // no arrancaba. Lo encontró la prueba capturando la excepción, no el ojo.
  if (g.gestureToken && typeof DZPointerController !== "undefined" && DZPointerController)
    DZPointerController.finish(g.gestureToken, g.pid);

  // Un clic sin arrastre: forma de tamaño cómodo EN EL PUNTO donde se clickeó.
  // Antes esto plantaba la forma en el centro del lienzo, que con la mesa
  // paneada queda fuera de la pantalla y parece que la herramienta no anda.
  if (!g.arrastro) {
    const vb = dzVB(), lado = Math.min(vb[2], vb[3]) * DZ_FORMA_CLIC;
    dzFormaGeometria(g, { x: g.ancla.x + lado, y: g.ancla.y + lado * 0.7 }, false, false);
  }

  // Una forma sin superficie no es una forma: se descarta en vez de dejar un
  // elemento invisible que después nadie encuentra ni puede seleccionar.
  if (dzFormaVacia(g)) {
    g.el.remove();
    dzSetStatus("Forma descartada: no tenía tamaño");
    return;
  }

  // La medida se lee ANTES de entintar: después el elemento original queda
  // reemplazado por el grupo del pincel.
  const medida = dzFormaMedida(g);

  // ENTINTAR VA ANTES DEL SNAPSHOT, y esto importa. `dzSnapshot()` guarda como
  // estado anterior el lienzo TAL COMO ESTÁ en ese momento, y el historial
  // trata el paso como no-op cuando el antes y el después son iguales —es por
  // eso que un Ctrl+Z «saca la forma de una» en vez de dejar el paso vacío—.
  // Entintando después del snapshot, el estado anterior era «la forma pelada»
  // y un Ctrl+Z dejaba el rectángulo sin pincel en la mesa. Medido:
  // {quedaGrupo:false, quedaRect:true}.
  let el = g.el;
  if (dzFormaConPincel() && typeof dzFormaPincelAplicar === "function") {
    const entintada = dzFormaPincelAplicar(el);
    if (entintada) el = entintada;
  }

  // Recién ahora entra al historial, y como UN paso.
  dzSnapshot();
  dzSelect(el);
  dzMarkDirty();
  dzSetStatus(medida + (el !== g.el ? " · contorno con pincel" : "") +
    " · Ctrl+Z la saca de una");
}

function dzFormaCancelar(motivo) {
  if (!DZ_FORMA) return false;
  const g = DZ_FORMA;
  DZ_FORMA = null;
  if (g.el && g.el.parentNode) g.el.remove();
  if (g.gestureToken && typeof DZPointerController !== "undefined" && DZPointerController)
    DZPointerController.cancel(motivo || "cancel");
  dzSetStatus("Forma cancelada");
  return true;
}

function dzFormaEnCurso() { return !!DZ_FORMA; }

/* ── geometría ──────────────────────────────────────────────────────────── */

function dzFormaAplicar(p, shift, alt) {
  if (!DZ_FORMA) return;
  dzFormaGeometria(DZ_FORMA, p, shift, alt);
}

/** Traduce «desde dónde hasta dónde» a los atributos de cada tipo de forma.
 *  Con Alt el ancla es el CENTRO; con Shift el resultado es proporcionado. */
function dzFormaGeometria(g, p, shift, alt) {
  const a = g.ancla;
  let dx = p.x - a.x, dy = p.y - a.y;
  if (shift) {
    const m = Math.max(Math.abs(dx), Math.abs(dy));
    if (g.kind === "line") {
      // a 45°: se proyecta sobre el múltiplo más cercano
      const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
      const largo = Math.hypot(dx, dy);
      dx = Math.cos(ang) * largo; dy = Math.sin(ang) * largo;
    } else {
      dx = Math.sign(dx || 1) * m; dy = Math.sign(dy || 1) * m;
    }
  }
  const el = g.el;
  if (g.kind === "line") {
    el.setAttribute("x1", a.x); el.setAttribute("y1", a.y);
    el.setAttribute("x2", a.x + dx); el.setAttribute("y2", a.y + dy);
    return;
  }
  // caja: con Alt el ancla es el centro y el arrastre es el semieje
  const x0 = alt ? a.x - Math.abs(dx) : Math.min(a.x, a.x + dx);
  const y0 = alt ? a.y - Math.abs(dy) : Math.min(a.y, a.y + dy);
  const w = alt ? Math.abs(dx) * 2 : Math.abs(dx);
  const h = alt ? Math.abs(dy) * 2 : Math.abs(dy);
  const cx = x0 + w / 2, cy = y0 + h / 2;

  if (g.kind === "rect") {
    el.setAttribute("x", x0); el.setAttribute("y", y0);
    el.setAttribute("width", w); el.setAttribute("height", h);
  } else if (g.kind === "circle") {
    el.setAttribute("cx", cx); el.setAttribute("cy", cy);
    el.setAttribute("r", Math.min(w, h) / 2);
  } else if (g.kind === "ellipse") {
    el.setAttribute("cx", cx); el.setAttribute("cy", cy);
    el.setAttribute("rx", w / 2); el.setAttribute("ry", h / 2);
  } else if (g.kind === "poly" || g.kind === "star") {
    const lados = g.kind === "star" ? 10 : 6;
    const r1 = Math.min(w, h) / 2, r2 = g.kind === "star" ? r1 * 0.45 : 0;
    const pts = [];
    for (let i = 0; i < lados; i++) {
      const r = (r2 && i % 2) ? r2 : r1;
      const ang = -Math.PI / 2 + i * Math.PI * 2 / lados;
      pts.push(Math.round(cx + r * Math.cos(ang)), Math.round(cy + r * Math.sin(ang)));
    }
    el.setAttribute("points", pts.join(" "));
  }
}

function dzFormaVacia(g) {
  const el = g.el;
  if (g.kind === "line")
    return Math.hypot(+el.getAttribute("x2") - +el.getAttribute("x1"),
      +el.getAttribute("y2") - +el.getAttribute("y1")) < 0.5;
  if (g.kind === "rect")
    return +el.getAttribute("width") < 0.5 || +el.getAttribute("height") < 0.5;
  if (g.kind === "circle") return +el.getAttribute("r") < 0.5;
  if (g.kind === "ellipse")
    return +el.getAttribute("rx") < 0.5 || +el.getAttribute("ry") < 0.5;
  return !(el.getAttribute("points") || "").trim();
}

function dzFormaMedida(g) {
  const el = g.el, r = (n) => Math.round(n);
  if (g.kind === "line")
    return "Línea de " + r(Math.hypot(+el.getAttribute("x2") - +el.getAttribute("x1"),
      +el.getAttribute("y2") - +el.getAttribute("y1"))) + " px";
  if (g.kind === "rect")
    return "Rectángulo " + r(+el.getAttribute("width")) + " × " + r(+el.getAttribute("height"));
  if (g.kind === "circle") return "Círculo de radio " + r(+el.getAttribute("r"));
  if (g.kind === "ellipse")
    return "Elipse " + r(+el.getAttribute("rx") * 2) + " × " + r(+el.getAttribute("ry") * 2);
  return g.kind === "star" ? "Estrella" : "Polígono";
}

/** ¿La forma nace rellena? NO por omisión.
 *
 *  Pedido de Mauro: «cuando dibujo una forma en LOW 2D, lo que dibuje primero
 *  por defecto sea una forma sin relleno, sólo contorno». Antes salía un bloque
 *  rojo macizo y sin contorno —`fill` con el color de relleno y NINGÚN
 *  `stroke`—, que en una mesa de animación es lo contrario de lo que se
 *  necesita: uno dibuja la línea y el relleno viene después, si viene.
 *
 *  El interruptor está en el menú de formas, no en el inspector, porque es una
 *  propiedad de LA HERRAMIENTA —cómo va a nacer la próxima— y no del elemento
 *  que ya está en la mesa: ése se rellena con el chip de Relleno de siempre. */
function dzFormaRellena() { return DZ.formaRelleno === true; }

/** El elemento vacío del tipo pedido, con el color y el trazo actuales. */
function dzFormaCrear(kind) {
  const NS = "http://www.w3.org/2000/svg";
  const TRAZO = DZ.drawColor || "#F0450E";
  const GROSOR = Math.max(1, DZ.drawW || 4);
  if (kind === "line") {
    const el = document.createElementNS(NS, "line");
    el.setAttribute("stroke", TRAZO);
    el.setAttribute("stroke-width", Math.max(2, DZ.drawW || 4));
    el.setAttribute("stroke-linecap", "round");
    return el;
  }
  const tag = kind === "rect" ? "rect"
    : kind === "circle" ? "circle"
      : kind === "ellipse" ? "ellipse"
        : (kind === "poly" || kind === "star") ? "polygon" : null;
  if (!tag) return null;
  const el = document.createElementNS(NS, tag);
  // CONTORNO SIEMPRE, relleno sólo si se pidió. Sin `stroke` una forma sin
  // relleno seria invisible: no habria nada que dibujar.
  el.setAttribute("fill", dzFormaRellena() ? (DZ.fillColor || "#F0450E") : "none");
  el.setAttribute("stroke", TRAZO);
  el.setAttribute("stroke-width", GROSOR);
  el.setAttribute("stroke-linejoin", "round");
  el.setAttribute("stroke-linecap", "round");
  return el;
}

/* ── el texto sigue siendo un clic ──────────────────────────────────────── */

/** Texto y nada más: se coloca con un clic, como en Illustrator, y en el punto
 *  clickeado. Las formas ya no pasan por acá — las dibuja el gesto. */
function dzAddShape(kind, punto) {
  const svg = $("#dzCanvas").querySelector(":scope > svg");
  if (!svg) return;
  const vb = dzVB();
  const W = vb[2] || 1080, H = vb[3] || 1080;
  const p = punto || { x: vb[0] + W / 2, y: vb[1] + H / 2 };
  if (kind !== "text") {
    // compatibilidad: si algo viejo pide una forma sin gesto, se arma en el
    // punto dado con el tamaño de un clic simple, no en el centro del lienzo
    const el = dzFormaCrear(kind);
    if (!el) return;
    dzArtAppend(svg, el);
    const g = { kind, el, ancla: p };
    const lado = Math.min(W, H) * DZ_FORMA_CLIC;
    dzFormaGeometria(g, { x: p.x + lado, y: p.y + lado * 0.7 }, false, false);
    dzSnapshot(); dzSelect(el); dzMarkDirty();
    return;
  }
  dzTextToolStart();
}

/* ── el interruptor de relleno, dentro del menú de formas ───────────────── */

const DZ_FORMA_RELLENO_LS = "low.forma.relleno";

/** Pone la fila de «Rellenar» al pie del menú de formas.
 *
 *  Se arma desde acá y no desde `index.html` a propósito: la casilla es de la
 *  herramienta y vive con ella. El relleno se activa explícitamente en la sesión. */
function dzFormaRellenoUI() {
  const menu = document.getElementById("dzShapeMenu");
  if (!menu || menu.querySelector(".dz-forma-relleno")) return;
  DZ.formaRelleno = false; // Each session starts with outline only, even with an old saved preference.
  const fila = document.createElement("label");
  fila.className = "dz-forma-relleno";
  fila.title = "Con esto apagado la forma nace sólo con contorno, que es lo " +
    "que uno quiere al dibujar. El relleno se le puede poner después con el " +
    "chip de Relleno.";
  const caja = document.createElement("input");
  caja.type = "checkbox";
  caja.id = "dzFormaRelleno";
  caja.checked = dzFormaRellena();
  caja.onchange = () => {
    DZ.formaRelleno = caja.checked;

    if (typeof dzSetStatus === "function")
      dzSetStatus(caja.checked
        ? "Las formas nuevas nacen rellenas"
        : "Las formas nuevas nacen sólo con contorno");
  };
  const texto = document.createElement("span");
  texto.textContent = "Rellenar";
  fila.append(caja, texto);
  menu.appendChild(fila);
  dzFormaPincelUI(menu);
}

const DZ_FORMA_PINCEL_LS = "low.forma.pincel";

function dzFormaConPincel() { return DZ.formaPincel === true; }

/** «Contorno con pincel», y un botón para entintar lo que ya está dibujado.
 *
 *  Van en el menú de la herramienta por lo mismo que la casilla de relleno: es
 *  cómo va a nacer la próxima forma. El botón es para las que ya están. */
function dzFormaPincelUI(menu) {
  if (!menu || menu.querySelector(".dz-forma-pincel")) return;
  try {
    if (localStorage.getItem(DZ_FORMA_PINCEL_LS) === "1") DZ.formaPincel = true;
  } catch (_) { /* sin almacenamiento: contorno de trazo simple */ }
  const fila = document.createElement("label");
  fila.className = "dz-forma-relleno dz-forma-pincel";
  fila.title = "El contorno se dibuja con el pincel elegido —punta, presión y " +
    "dureza— en vez de una línea de grosor constante. El pincel y el grosor " +
    "quedan guardados en la forma, así deformarla no le cambia el trazo.";
  const caja = document.createElement("input");
  caja.type = "checkbox";
  caja.id = "dzFormaPincel";
  caja.checked = dzFormaConPincel();
  caja.onchange = () => {
    DZ.formaPincel = caja.checked;
    try { localStorage.setItem(DZ_FORMA_PINCEL_LS, caja.checked ? "1" : "0"); } catch (_) { }
    if (typeof dzSetStatus === "function")
      dzSetStatus(caja.checked
        ? "El contorno de las formas nuevas se dibuja con el pincel"
        : "El contorno de las formas nuevas es una línea simple");
  };
  const texto = document.createElement("span");
  texto.textContent = "Contorno con pincel";
  fila.append(caja, texto);
  menu.appendChild(fila);
  const brushLabel = document.createElement('label'); brushLabel.className='dz-forma-relleno'; brushLabel.textContent='Pincel de las formas nuevas';
  const brushSelect=document.createElement('select');brushSelect.id='dzFormaBrushPreset';
  brushSelect.add(new Option('Usar el pincel activo',''));
  for(const brush of LOW.drawing.brushes.all()) brushSelect.add(new Option(brush.name,brush.id));
  brushSelect.value=DZ.formaBrushPreset||'';
  brushSelect.onchange=()=>{DZ.formaBrushPreset=brushSelect.value;};
  brushLabel.appendChild(brushSelect);menu.appendChild(brushLabel);

  const entintar = document.createElement("button");
  entintar.type = "button";
  entintar.className = "dz-forma-entintar";
  entintar.id = "dzFormaEntintar";
  entintar.textContent = "Entintar la selección";
  entintar.title = "Le pone el pincel al contorno de la forma que está " +
    "seleccionada. Ctrl+Z la devuelve a forma.";
  entintar.onclick = () => window.dzFormaPincelSeleccion?.();
  menu.appendChild(entintar);
}

if (document.readyState === "loading")
  document.addEventListener("DOMContentLoaded", dzFormaRellenoUI, { once: true });
else dzFormaRellenoUI();

/* Nombres que la interfaz y los recorridos usan por nombre global. */
window.dzFormaElegir = dzFormaElegir;
window.dzFormaRellena = dzFormaRellena;
window.dzFormaConPincel = dzFormaConPincel;
window.dzFormaRellenoUI = dzFormaRellenoUI;
window.dzFormaDown = dzFormaDown;
window.dzFormaMove = dzFormaMove;
window.dzFormaUp = dzFormaUp;
window.dzFormaCancelar = dzFormaCancelar;
window.dzFormaEnCurso = dzFormaEnCurso;
window.dzFormaKind = dzFormaKind;
window.dzAddShape = dzAddShape;
