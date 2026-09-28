/* Extraido de app.js (biblia §12 AHORA·7). El archivo tenia 18.650 lineas, un
   tercio del frontend en un solo lugar, y cada funcion nueva lo hacia crecer.
   La regla desde v4.16.0: nada nuevo entra en app.js, y cada trabajo se lleva un
   pedazo afuera al salir. `tools/check_app_js_budget.py` lo hace cumplir.

   Estos modulos NO son IIFE con namespace como los de ui/animation: las
   funciones tienen que seguir siendo GLOBALES, porque los llaman los manejadores
   de la interfaz, la tabla de acciones de menu de app.js y los recorridos E2E
   por nombre. Cambiar eso a la vez que se mueve el codigo seria dos cambios
   mezclados; el namespace viene despues, con su propia prueba.

   Se carga DESPUES de app.js: usa DZ, $, dzSetStatus y compania en tiempo de
   ejecucion, nunca al definirse.


   ARCOS: la trayectoria sobre la mesa. La cuenta vive en
   ui/animation/arcs.js, que es puro; aca esta lo que la dibuja y la lee. */

/* ══════════════════════════════════════════════════════════════════════════
   ARCOS SOBRE LA MESA

   El arco existía sólo para piezas de rig y sólo desde el panel de rigging. Un
   objeto cualquiera que uno mueve —con la interpolación de movimiento o
   grabándolo en vivo— no mostraba nada, y sin ver la trayectoria no hay forma
   de saber si lo que hiciste es un arco o una escalera de tramos rectos.

   Lo que se dibuja:
     · la TRAYECTORIA del elemento a lo largo del rango.
     · un punto por cuadro. Juntos = cuadros lentos, separados = rápidos. Esa
       es la carta de espaciado, y es como se lee la aceleración desde antes de
       que hubiera computadoras.
     · el tamaño del punto sigue la velocidad del tramo, para que acelerar y
       frenar se vean sin contar pixeles.

   La cuenta la hace `animation/arcs.js`, que es puro y se prueba sin navegador.
   Acá sólo se junta la posición cuadro por cuadro y se pinta.

   OVERLAPPING: no es una propiedad de UN arco, es la relación entre dos. Se
   pueden FIJAR varios arcos a la vez (la cadera y la mano) y LOW dice cuántos
   cuadros va atrás uno del otro — o dice que no se puede saber, si los dos
   movimientos no se parecen.
   ══════════════════════════════════════════════════════════════════════════ */

/** Un SVG escondido para medir dónde cae un elemento en cada cuadro. Hace
 *  falta estar en el documento: getBBox no mide nada fuera de él. */
function dzArcoMedidor() {
  let m = document.getElementById("dzArcoMedidor");
  if (!m) {
    m = document.createElementNS(SVGNS, "svg");
    m.id = "dzArcoMedidor";
    m.setAttribute("aria-hidden", "true");
    m.style.cssText = "position:absolute;width:1px;height:1px;left:-9999px;top:0;opacity:0;pointer-events:none";
    document.body.appendChild(m);
  }
  return m;
}

/** Centro del elemento `id` dentro de un contenido de dibujo. Devuelve null si
 *  ese cuadro no tiene el elemento — que es información, no un error: significa
 *  que la trayectoria se corta ahí. */
function dzArcoCentroEn(contenido, id) {
  if (!contenido || !id) return null;
  const m = dzArcoMedidor();
  const vb = dzVB();
  m.setAttribute("viewBox", vb.join(" "));
  m.innerHTML = contenido;
  let punto = null;
  try {
    const el = m.querySelector("#" + CSS.escape(id));
    if (el && typeof el.getBBox === "function") {
      const b = el.getBBox();
      // getBBox ignora el transform propio: se lo aplica a mano, que es
      // justamente lo que mueve al elemento de un cuadro al otro
      const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
      const mtx = el.transform && el.transform.baseVal.consolidate();
      if (mtx) {
        const p = m.createSVGPoint(); p.x = c.x; p.y = c.y;
        const q = p.matrixTransform(mtx.matrix);
        punto = { x: q.x, y: q.y };
      } else punto = c;
    }
  } catch (_) { /* contenido raro: ese cuadro no aporta punto */ }
  m.innerHTML = "";
  return punto;
}

/** Posición cuadro por cuadro de lo que se está siguiendo. Sirve igual para
 *  una pieza de rig (que tiene canales) y para un elemento dibujado (que hay
 *  que ir a buscar en el contenido de cada cuadro). */
function dzArcoMuestras(objetivo) {
  if (!DZ.doc || !objetivo) return [];
  if (objetivo.tipo === "rig") return dzRigArcoPuntos(objetivo.id);

  const doc = DZ.doc, sc = doc.scene, r = sc.playRange();
  const ly = sc.layer(objetivo.layerId) || doc.layer;
  if (!ly) return [];
  const lv = sc.level(ly.levelId);
  if (!lv) return [];
  const claves = new Set();
  const salida = [];
  let previo = null;
  for (let f = r.in; f <= r.out; f++) {
    const dw = sc.drawingAt(ly.id, f);
    if (!dw) { previo = null; continue; }
    // Dentro de un hold el dibujo es el MISMO, así que el objeto no se movió:
    // se toma un solo punto por dibujo y se marca cuál es clave. Repetirlo por
    // cuadro dibujaba varios puntos encima y hacía leer «lento» donde en
    // realidad hay un sostenido.
    if (previo === dw.number) continue;
    previo = dw.number;
    const c = dzArcoCentroEn(dw.content, objetivo.id);
    if (c) { salida.push({ f, x: c.x, y: c.y, clave: true }); claves.add(f); }
  }
  return salida;
}

/** Qué se está siguiendo ahora: lo seleccionado en la mesa, o la pieza de rig
 *  elegida si estamos rigueando. */
function dzArcoObjetivoActual() {
  if (DZ.rigMode) {
    const node = dzRigSelectedNode();
    if (node) {
      DZ.arcoSiguiendo = { tipo: "rig", id: node.id, nombre: node.name || node.id };
      return DZ.arcoSiguiendo;
    }
  }
  const sel = DZ.sel;
  if (sel && sel.id) {
    DZ.arcoSiguiendo = { tipo: "el", id: sel.id, layerId: DZ.doc && DZ.doc.layerId, nombre: sel.id };
    return DZ.arcoSiguiendo;
  }
  // Se sigue el ID, no el nodo del DOM. Al cambiar de cuadro el lienzo se
  // repinta desde el contenido del dibujo, así que `DZ.sel` queda apuntando a
  // un elemento que ya no está en la página y la selección se pierde. Si
  // dependiéramos de eso, el arco desaparecería justo cuando uno lo está
  // mirando: mover la cabeza lectora es LO QUE UNO HACE para leer un arco.
  // Se mantiene lo último elegido mientras el elemento siga existiendo.
  const ultimo = DZ.arcoSiguiendo;
  if (ultimo && dzArcoMuestras(ultimo).length) return ultimo;
  return null;
}

function dzArcoClave(o) { return o ? o.tipo + ":" + o.id : ""; }

/** Prende y apaga la trayectoria. */
function dzArcoToggle() {
  if (!DZ.doc) return dzSetStatus("Abrí una animación para ver los arcos");
  DZ.arcoOn = !DZ.arcoOn;
  $("#tlArco")?.classList.toggle("on", DZ.arcoOn);
  if (!DZ.arcoOn) { DZ.arcoFijados = []; DZ.arcoSiguiendo = null;
    dzArcoRender(); return dzSetStatus("Arcos ocultos"); }
  dzArcoRender();
  const o = dzArcoObjetivoActual();
  if (!o) return dzSetStatus("Arcos encendidos · elegí algo en la mesa para ver su trayectoria");
  dzSetStatus(dzArcoLectura(o));
}

/** Fija el arco de lo seleccionado para poder compararlo con otro: es lo que
 *  hace visible el overlapping entre dos partes del cuerpo. */
function dzArcoFijar() {
  if (!DZ.doc) return false;
  const o = dzArcoObjetivoActual();
  if (!o) return dzSetStatus("Elegí algo en la mesa para fijar su arco");
  DZ.arcoOn = true; $("#tlArco")?.classList.add("on");
  DZ.arcoFijados = DZ.arcoFijados || [];
  const clave = dzArcoClave(o);
  const i = DZ.arcoFijados.findIndex((x) => dzArcoClave(x) === clave);
  if (i >= 0) { DZ.arcoFijados.splice(i, 1); dzArcoRender(); return dzSetStatus("Arco de «" + o.nombre + "» soltado"); }
  if (DZ.arcoFijados.length >= 4) DZ.arcoFijados.shift();   // cuatro arcos ya es un plato de fideos
  DZ.arcoFijados.push(o);
  dzArcoRender();
  return dzSetStatus(dzArcoLecturaDesfase(o) || ("Arco de «" + o.nombre + "» fijado · fijá otro para comparar el overlapping"));
}

/** La frase que contesta lo que uno quiere saber mirando el arco. */
function dzArcoLectura(objetivo) {
  const an = LOW.animation.analizarArco(dzArcoMuestras(objetivo));
  if (!an.seMovio) return "«" + objetivo.nombre + "» no se mueve en este rango";
  const quiebre = an.quiebre > 6 ? " · la trayectoria está quebrada, no es un arco" : "";
  return "«" + objetivo.nombre + "»: " + an.resumen +
    " · más rápido en F" + an.masRapido.f + ", más lento en F" + an.masLento.f + quiebre;
}

/** Si hay dos arcos a la vista, cuántos cuadros va atrás uno del otro. */
function dzArcoLecturaDesfase(ultimo) {
  const fijos = (DZ.arcoFijados || []);
  if (fijos.length < 2) return null;
  const a = fijos[fijos.length - 2], b = ultimo || fijos[fijos.length - 1];
  const d = LOW.animation.arcoDesfase(dzArcoMuestras(a), dzArcoMuestras(b));
  if (!d) return "«" + a.nombre + "» y «" + b.nombre + "» no se parecen lo suficiente " +
    "para medir el desfase — el ojo manda";
  if (d.cuadros === 0) return "«" + a.nombre + "» y «" + b.nombre + "» van en sincro: no hay overlapping";
  const atras = d.cuadros > 0;
  return "«" + b.nombre + "» va " + Math.abs(d.cuadros) + " cuadro(s) " +
    (atras ? "ATRÁS de " : "ADELANTE de ") + "«" + a.nombre + "»" +
    (atras ? " · eso es overlapping" : " · adelantarse casi siempre es un error de timing");
}

const DZ_ARCO_COLORES = ["#e0553f", "#4a86c8", "#48a06c", "#d99a3a"];

/** Pinta los arcos. Va en la capa `dz-penui`, que es sólo-pantalla: no se
 *  guarda en el SVG ni sale en la exportación. */
function dzArcoRender() {
  const svg = $("#dzCanvas")?.querySelector(":scope > svg");
  if (!svg) return;
  svg.querySelector(":scope > g.dz-arco")?.remove();
  if (!DZ.arcoOn || !DZ.doc) return;

  const objetivos = [];
  (DZ.arcoFijados || []).forEach((o) => objetivos.push({ o, fijo: true }));
  const actual = dzArcoObjetivoActual();
  if (actual && !objetivos.some((x) => dzArcoClave(x.o) === dzArcoClave(actual)))
    objetivos.push({ o: actual, fijo: false });
  if (!objetivos.length) return;

  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("class", "dz-penui dz-arco");
  g.setAttribute("pointer-events", "none");
  const ahora = DZ.doc.frame;
  let partes = "";

  objetivos.forEach(({ o, fijo }, indice) => {
    const an = LOW.animation.analizarArco(dzArcoMuestras(o));
    if (!an.seMovio) return;
    const color = DZ_ARCO_COLORES[indice % DZ_ARCO_COLORES.length];
    const pts = an.puntos.map((p) => p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
    // dos trazos: uno blanco abajo para que el arco se vea sobre cualquier
    // dibujo, y el de color arriba
    partes += `<polyline points="${pts}" fill="none" stroke="#fff" stroke-opacity=".5"` +
      ` stroke-width="3.5" vector-effect="non-scaling-stroke"/>`;
    partes += `<polyline points="${pts}" fill="none" stroke="${color}" stroke-opacity=".95"` +
      ` stroke-width="1.4" vector-effect="non-scaling-stroke"` +
      (fijo ? "" : ' stroke-dasharray="6 4"') + `/>`;
    an.puntos.forEach((p, i) => {
      // el radio sigue la velocidad del tramo que ARRANCA en este punto: así
      // el engrosado se lee como «acá va rápido»
      const tramo = an.tramos[i] || an.tramos[an.tramos.length - 1] || { rel: 0.5 };
      const r = (1.6 + tramo.rel * 2.2) * (p.f === ahora ? 1.7 : 1);
      partes += `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r.toFixed(2)}"` +
        ` fill="${p.f === ahora ? "#fff" : color}" stroke="${color}" stroke-width=".8"` +
        ` vector-effect="non-scaling-stroke"/>`;
    });
  });

  if (!partes) return;
  g.innerHTML = partes;
  svg.appendChild(g);
}

/* Nombres que la interfaz y los recorridos usan por nombre global. */
window.dzArcoMedidor = dzArcoMedidor;
window.dzArcoCentroEn = dzArcoCentroEn;
window.dzArcoMuestras = dzArcoMuestras;
window.dzArcoObjetivoActual = dzArcoObjetivoActual;
window.dzArcoClave = dzArcoClave;
window.dzArcoToggle = dzArcoToggle;
window.dzArcoFijar = dzArcoFijar;
window.dzArcoLectura = dzArcoLectura;
window.dzArcoLecturaDesfase = dzArcoLecturaDesfase;
window.dzArcoRender = dzArcoRender;
