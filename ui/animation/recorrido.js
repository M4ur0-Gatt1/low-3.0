/* ══════════════════════════════════════════════════════════════════════════
   SEGUIR UN RECORRIDO: EL OBJETO VA POR EL ARCO DIBUJADO, MARCA POR MARCA

   Pedido de Mauro (oct-2026, LOW 3.14): «¿se podría hacer que al dibujar un
   arco —en la referencia es un infinito, tipo Moebius— con las marcas para
   los intermedios, el programa haga recorrer el objeto por el recorrido
   marcado? Lo ideal es dibujarlo en una capa de referencia y que el objeto a
   animar esté en la siguiente y respete ese flujo. Así ahorraría bastante
   tiempo de intercalado».

   Es la «carta de espaciado» del dibujo animado clásico, hecha herramienta
   (como el recorrido de Toon Boom o el «seguir trazado» de Moho):

     · se dibuja el recorrido —un trazo largo, abierto o cerrado— y se lo
       cruza con rayitas cortas: cada rayita es un cuadro; juntas = lento,
       separadas = rápido. Va en una capa de referencia (o en la misma capa
       del objeto: se usa lo que NO está elegido);
     · parado en el cuadro donde empieza, se eligen el objeto —o VARIOS, que
       viajan juntos— y se aprieta «Seguir un recorrido» (botón de la línea
       de tiempo, menú Animación o Alt+R);
     · LOW pone lo elegido sobre cada marca, en orden, un cuadro por marca,
       empezando por la marca más cercana. Sin marcas, pide cuántos cuadros y
       con qué curva.

   En la ventana: la capa y el recorrido (si hay varios, por omisión el más
   cercano a lo elegido), el sentido, si gira siguiendo el recorrido, y cómo
   entran los cuadros: SUMAR (lo que ya hay en esos cuadros queda; sólo se
   mueve lo elegido), reemplazarlos por copias de este, o insertarlos.
   Todo entra en un solo paso de Ctrl+Z. La referencia no se toca.

   v3.16 — pedido de Mauro: «la animación de base es un flujo: le tengo que
   poder ir agregando objetos que sigan el recorrido, y sumar recorridos de
   cada objeto por separado; por ejemplo los brazos de un personaje». Por eso
   SUMAR es lo de fábrica, una capa puede tener VARIOS recorridos (cada marca
   va al que cruza), y lo que sigue un recorrido lleva una identidad
   (data-sigue): al volver a pasarlo, se reemplaza su versión anterior en
   cada cuadro en vez de duplicarse.

   v3.15.1 — reporte de Mauro: «con otro recorrido ni se me abre la opción al
   apretar el botón, o demora mucho en aparecer; si el proceso es largo debe
   avisar, porque si no parece que no hace nada; y falló al intentar animar
   un grupo de objetos juntos». Tres arreglos:
   · LEER YA NO TARDA: antes se medía CADA trazo de CADA capa cada 2
     unidades (miles de getPointAtLength, que en una cinta de pincel larga son
     caros) antes de abrir la ventana. Ahora las capas candidatas se eligen
     por el LARGO de su trazo mayor (una medida por trazo), sólo la capa
     elegida se lee entera, el recorrido se muestrea con ~900 puntos como
     mucho y cada marca con unos pocos.
   · AVISA: «Buscando el recorrido…», «Generando cuadro k de N…», y si algo
     falla o no hay recorrido lo dice en una VENTANA, no sólo en la barra de
     estado (donde no se ve).
   · VARIOS OBJETOS: viajan juntos, alrededor de su centro común.

   CÓMO SE LEE LA REFERENCIA. El dibujo se arma en una hoja oculta del mismo
   tamaño y se mide con la geometría de SVG, con sus transformaciones. El
   trazo más largo es el recorrido; los cortos que lo cruzan, las marcas.
   Un trazo de pincel es una cinta rellena: se mide por uno de sus bordes.

   @module animation/recorrido
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  const PUNTOS_CAMINO = 900, PUNTOS_MARCA = 12, MAX_TRAZOS = 4000;
  const dz = () => (typeof DZ !== "undefined" ? DZ : null);
  const $q = (s) => document.querySelector(s);
  const avisar = (t) => { if (typeof global.dzSetStatus === "function") global.dzSetStatus(t); };
  /* dos cuadros de pantalla: que el aviso se PINTE antes del trabajo pesado */
  const respirar = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 0))));

  /* ── leer la referencia ─────────────────────────────────────────────────── */
  let hojaOculta = null;
  function hoja(vb) {
    if (!hojaOculta || !hojaOculta.isConnected) {
      hojaOculta = document.createElementNS(NS, "svg");
      hojaOculta.setAttribute("aria-hidden", "true");
      hojaOculta.style.cssText = "position:absolute;left:-30000px;top:0;visibility:hidden;pointer-events:none";
      document.body.appendChild(hojaOculta);
    }
    hojaOculta.setAttribute("viewBox", vb.join(" "));
    hojaOculta.setAttribute("width", vb[2]); hojaOculta.setAttribute("height", vb[3]);
    hojaOculta.innerHTML = "";
    return hojaOculta;
  }
  const TRAZOS = "path, line, polyline, polygon, circle, ellipse, rect";
  /** El largo útil de un trazo (una cinta de pincel vale por la mitad: va
   *  por un borde y vuelve por el otro). Una sola medida: es barato. */
  function largoUtil(el) {
    let L = 0;
    try { L = el.getTotalLength(); } catch (_) { return 0; }
    if (!(L > 0)) return 0;
    const fill = (el.getAttribute("fill") || "").toLowerCase(), stroke = (el.getAttribute("stroke") || "").toLowerCase();
    const esCinta = el.getAttribute("data-low") === "brush" || (fill && fill !== "none" && (!stroke || stroke === "none"));
    return esCinta ? L / 2 : L;
  }
  /** Los puntos de un trazo, en unidades del documento: `n` como mucho. */
  function muestrear(el, raiz, L, n) {
    let m = null;
    try { m = raiz.getScreenCTM().inverse().multiply(el.getScreenCTM()); } catch (_) { m = null; }
    const cuantos = Math.max(2, Math.min(n, Math.ceil(L / 2) + 1)), pts = [];
    for (let k = 0; k < cuantos; k++) {
      const p = el.getPointAtLength(L * k / (cuantos - 1));
      pts.push(m ? [m.a * p.x + m.c * p.y + m.e, m.b * p.x + m.d * p.y + m.f] : [p.x, p.y]);
    }
    return pts;
  }
  function caja(pts) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y, cx: (x + Math.max(...xs)) / 2, cy: (y + Math.max(...ys)) / 2 };
  }
  function armar(contenido, vb) {
    const raiz = hoja(vb);
    raiz.innerHTML = contenido || "";
    raiz.querySelectorAll("[data-low-page], [data-recorrido]").forEach((n) => n.remove());
    return raiz;
  }

  /** Medida RÁPIDA de una capa: el largo de su trazo mayor (para elegir). */
  function medirCapa(contenido, vb) {
    if (!contenido) return 0;
    const raiz = armar(contenido, vb);
    let mayor = 0;
    for (const el of raiz.querySelectorAll(TRAZOS)) mayor = Math.max(mayor, largoUtil(el));
    return mayor;
  }

  /** Los datos de un recorrido a partir de sus puntos. */
  function camino(P) {
    const s = [0]; for (let i = 1; i < P.length; i++) s.push(s[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const total = s[s.length - 1];
    const cerrado = Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < Math.max(12, total * .03);
    return { P, s, total, cerrado, marcas: [] };
  }
  /** Qué tan bien una marca (sus puntos) cruza un recorrido: null si no lo
   *  toca. EN UN CRUCE (el centro del infinito) el recorrido pasa dos veces
   *  por el mismo punto: gana el tramo que la marca atraviesa más de frente. */
  function cruce(c, tp, alcance) {
    const P = c.P, cj = caja(tp), centro = [cj.cx, cj.cy];
    const tx = tp[tp.length - 1][0] - tp[0][0], ty = tp[tp.length - 1][1] - tp[0][1], tl = Math.hypot(tx, ty) || 1;
    let mejor = null;
    for (let i = 0; i < P.length; i++) {
      const d = Math.hypot(P[i][0] - centro[0], P[i][1] - centro[1]);
      if (d > alcance) continue;
      const dPrev = i > 0 ? Math.hypot(P[i - 1][0] - centro[0], P[i - 1][1] - centro[1]) : Infinity;
      const dNext = i < P.length - 1 ? Math.hypot(P[i + 1][0] - centro[0], P[i + 1][1] - centro[1]) : Infinity;
      if (d > dPrev || d > dNext) continue;
      const j = Math.min(P.length - 1, i + 1), k = Math.max(0, i - 1);
      const gx = P[j][0] - P[k][0], gy = P[j][1] - P[k][1], gl = Math.hypot(gx, gy) || 1;
      const nota = Math.abs((gx * tx + gy * ty) / (gl * tl)) + d / (alcance * 4);
      if (!mejor || nota < mejor.nota) mejor = { nota, d: c.s[i] };
    }
    return mejor;
  }

  /** Lee el dibujo de una capa entero: los RECORRIDOS (puede haber varios:
   *  uno por brazo, por ejemplo) y las marcas de cada uno. Un recorrido es un
   *  trazo largo; una marca, uno corto que lo cruza, y va al recorrido que
   *  cruza mejor. */
  function leerContenido(contenido, vb) {
    if (!contenido) return { error: "esa capa no tiene dibujo en este cuadro" };
    const raiz = armar(contenido, vb);
    const els = [...raiz.querySelectorAll(TRAZOS)];
    if (els.length > MAX_TRAZOS) return { error: "esa capa tiene " + els.length + " trazos: dibujá el recorrido en una capa aparte" };
    const trazos = els.map((el) => ({ el, L: largoUtil(el) })).filter((t) => t.L > 0);
    if (!trazos.length) return { error: "no encontré trazos en esa capa" };
    trazos.sort((a, b) => b.L - a.L);
    if (trazos[0].L < 40) return { error: "el trazo más largo de esa capa es muy corto para ser un recorrido" };
    // recorridos: los trazos largos (hasta 8); el resto, candidatos a marca
    const largos = trazos.filter((t, i) => i === 0 || (t.L >= Math.max(120, trazos[0].L * .15))).slice(0, 8);
    const caminos = largos.map((t) => Object.assign(camino(muestrear(t.el, raiz, t.L, PUNTOS_CAMINO)), { largoTrazo: t.L }));
    const menor = Math.min(...caminos.map((c) => c.total));
    for (const t of trazos) {
      if (largos.includes(t)) continue;
      if (t.L > menor * .4) continue;                         // ni recorrido ni marca
      const tp = muestrear(t.el, raiz, t.L, PUNTOS_MARCA), cj = caja(tp), tam = Math.max(cj.w, cj.h);
      let mejor = null, dueño = null;
      for (const c of caminos) {
        if (tam > c.total * .2) continue;
        const m = cruce(c, tp, tam / 2 + Math.max(8, c.total * .004));
        if (m && (!mejor || m.nota < mejor.nota)) { mejor = m; dueño = c; }
      }
      if (dueño) dueño.marcas.push(mejor.d);
    }
    for (const c of caminos) {
      c.marcas.sort((a, b) => a - b);
      c.marcas = c.marcas.filter((m, i, a) => !i || m - a[i - 1] > 3);
    }
    // el primero sigue siendo el más largo (y es el que se devuelve «suelto»)
    return Object.assign({}, caminos[0], { caminos });
  }
  /** Compatibilidad (pruebas): leer la capa de un documento en un cuadro. */
  function leerReferencia(doc, layerId, frame) {
    const sc = doc.scene, dw = sc.drawingAt(layerId, frame);
    return leerContenido(dw && dw.content, [0, 0, sc.width || 1920, sc.height || 1080]);
  }

  /** El punto y la tangente a una distancia `d` del inicio del recorrido. */
  function enElCamino(ref, d) {
    const { P, s, total, cerrado } = ref;
    d = cerrado ? ((d % total) + total) % total : Math.max(0, Math.min(total, d));
    let i = 1; while (i < s.length - 1 && s[i] < d) i++;
    const f = s[i] > s[i - 1] ? (d - s[i - 1]) / (s[i] - s[i - 1]) : 0;
    const x = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * f, y = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * f;
    const a = Math.atan2(P[i][1] - P[i - 1][1], P[i][0] - P[i - 1][0]);
    return { x, y, a };
  }
  /** La distancia sobre el recorrido del punto más cercano a (x, y). */
  function proyectar(ref, x, y) {
    let mejor = Infinity, i0 = 0;
    ref.P.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < mejor) { mejor = d; i0 = i; } });
    return { d: ref.s[i0], lejos: mejor };
  }

  /** Las distancias, en orden, donde va lo elegido en cada cuadro. */
  function paradas(ref, inicio, opciones) {
    const { total, cerrado } = ref;
    const sentido = opciones.invertir ? -1 : 1;
    const rel = (d) => { const r = (d - inicio) * sentido; return cerrado ? ((r % total) + total) % total : r; };
    if (ref.marcas.length >= 2) {
      // se arranca en la marca MÁS CERCANA (adelante o atrás: un objeto al
      // costado del trazo se proyecta un poco corrido, y con «lo que queda
      // adelante» se salteaba la primera marca y todo el movimiento quedaba
      // un cuadro adelantado); de ahí, las que siguen en el sentido elegido
      const ms = ref.marcas, n = ms.length;
      let iCerca = 0, mejor = Infinity;
      ms.forEach((m, i) => { let dd = Math.abs(m - inicio); if (cerrado) dd = Math.min(dd, total - dd); if (dd < mejor) { mejor = dd; iCerca = i; } });
      const out = [];
      for (let k = 0; k < n; k++) {
        const i = iCerca + sentido * k;
        if (!cerrado && (i < 0 || i >= n)) break;
        out.push(ms[((i % n) + n) % n]);
      }
      return out;
    }
    const n = Math.max(2, Math.round(opciones.cuadros || 12));
    const ease = (global.DZ_EASES && global.DZ_EASES[opciones.curva]) || ((t) => t);
    const fin = cerrado ? total : (sentido > 0 ? total - inicio : inicio);
    const out = [];
    for (let k = 0; k < n; k++) out.push(inicio + sentido * fin * ease(cerrado ? k / n : k / (n - 1)));
    return out;
  }

  /* ── lo elegido ────────────────────────────────────────────────────────── */
  function eleccion() {
    const d = dz();
    const varios = d.multi && d.multi.length > 1 ? d.multi.slice() : (d.sel ? [d.sel] : []);
    return varios.filter((n) => n && n.isConnected && n.ownerSVGElement);
  }
  /** El centro de lo elegido (todos juntos), en unidades del documento. */
  function centroDe(els) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const el of els) { const r = el.getBoundingClientRect(); x0 = Math.min(x0, r.left); y0 = Math.min(y0, r.top); x1 = Math.max(x1, r.right); y1 = Math.max(y1, r.bottom); }
    const p = global.dzToUser((x0 + x1) / 2, (y0 + y1) / 2);
    return [p.x, p.y];
  }
  /** Un punto del documento en las coordenadas propias de un elemento. */
  function aLocal(el, x, y) {
    try {
      const svg = el.ownerSVGElement, m = svg.getScreenCTM().inverse().multiply(el.getScreenCTM()).inverse();
      return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
    } catch (_) { return [x, y]; }
  }

  /* ── escribir los cuadros ──────────────────────────────────────────────── */
  /** Identidad estable de lo que sigue un recorrido: viaja con las copias y
   *  permite reconocerlo en los otros cuadros al SUMAR (para reemplazar su
   *  versión anterior en vez de duplicarlo). */
  function marcarIdentidad(el) {
    if (!el.getAttribute("data-sigue")) el.setAttribute("data-sigue", "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    return el.getAttribute("data-sigue");
  }
  /** El elemento SIN su posición: para reconocer una copia quieta de él. */
  function huella(el) {
    const c = el.cloneNode(true);
    ["transform", "data-sigue", "data-recorrido", "class"].forEach((a) => c.removeAttribute(a));
    return c.outerHTML;
  }

  async function generar(ref, els, opciones) {
    const d = dz(), doc = d.doc, F = doc.frame, capa = doc.layer;
    if (!capa) return { error: "no hay capa activa" };
    if (capa.locked) return { error: "la capa de lo elegido está bloqueada" };
    if (typeof global.dzDocCommit === "function") global.dzDocCommit();
    const [ox, oy] = centroDe(els);
    const inicio = proyectar(ref, ox, oy).d;
    const lista = paradas(ref, inicio, opciones);
    if (lista.length < 2) return { error: "con esas marcas no hay más de un cuadro" };
    /* EL RECORRIDO LLEVA AL OBJETO, como un peg de Toon Boom: en cada cuadro
       se corre lo mismo que se corre el recorrido desde la primera parada, y
       conserva su distancia al trazo. Antes se ponía el CENTRO del objeto
       sobre cada marca: uno dibujado al costado del recorrido (pedido de Mauro:
       ir sumando objetos al flujo) saltaba encima del trazo. Uno dibujado
       sobre el recorrido queda igual que antes: sobre las marcas. */
    const q0 = enElCamino(ref, lista[0]), a0 = q0.a;
    // con «que gire», todo gira alrededor del punto del recorrido (la distancia al trazo gira con la curva)
    const locales = els.map((el) => aLocal(el, q0.x, q0.y));
    const ids = els.map(marcarIdentidad);
    const huellas = els.map(huella);
    // dónde vive cada uno: su plano de arte (Línea / Color), para ponerlo en el mismo lugar en otro cuadro
    const planos = els.map((el) => { const g = el.closest && el.closest("[data-low-art]"); return g ? g.getAttribute("data-low-art") : null; });
    els.forEach((el, k) => el.setAttribute("data-recorrido", String(k)));
    let base;
    try { base = global.dzCanvasInner(); } finally { els.forEach((el) => el.removeAttribute("data-recorrido")); }
    const vb = global.dzVB ? global.dzVB() : [0, 0, doc.scene.width || 1920, doc.scene.height || 1080];
    const originales = (() => { const t = document.createElementNS(NS, "svg"); t.innerHTML = base;
      return [...t.querySelectorAll("[data-recorrido]")].sort((a, b) => +a.getAttribute("data-recorrido") - +b.getAttribute("data-recorrido")); })();
    if (originales.length !== els.length) return { error: "no encontré lo elegido en la copia del dibujo" };

    const sumar = opciones.modo === "sumar";
    const contenidos = [];
    for (let k = 0; k < lista.length; k++) {
      const q = enElCamino(ref, lista[k]), f = F + k;
      const tmp = document.createElementNS(NS, "svg");
      tmp.setAttribute("viewBox", vb.join(" "));
      const existente = sumar && k > 0 ? doc.scene.drawingAt(capa.id, f) : null;
      tmp.innerHTML = existente && existente.content ? existente.content : base;
      // SUMAR: lo de este cuadro queda; sólo se saca la versión anterior de lo
      // elegido (por su identidad, o una copia quieta idéntica) y se pone la nueva
      if (existente && existente.content) {
        tmp.querySelectorAll("[data-sigue]").forEach((n) => { if (ids.includes(n.getAttribute("data-sigue"))) n.remove(); });
        // una copia QUIETA idéntica (sin identidad propia: si la tiene, es OTRO
        // objeto igual que sigue su propio recorrido, y no se toca)
        for (const n of [...tmp.querySelectorAll("*")]) if (!n.hasAttribute("data-sigue") && huellas.includes(huella(n))) n.remove();
        originales.forEach((o, i) => {
          const copia = o.cloneNode(true);
          const destino = (planos[i] && tmp.querySelector('[data-low-art="' + planos[i] + '"]')) || tmp;
          destino.appendChild(copia);
        });
      }
      const copias = [...tmp.querySelectorAll("[data-recorrido]")];
      if (copias.length !== els.length) return { error: "no encontré lo elegido en el cuadro " + f };
      const giro = (q.a - a0) * 180 / Math.PI;
      for (const e2 of copias) {
        const i = +e2.getAttribute("data-recorrido");
        e2.removeAttribute("data-recorrido");
        global.dzWritePos(e2, global.dzReadPos(e2), q.x - q0.x, q.y - q0.y);
        if (opciones.girar) {
          const tr = e2.getAttribute("transform") || "";
          e2.setAttribute("transform", (tr ? tr + " " : "") + "rotate(" + giro.toFixed(2) + " " + locales[i][0].toFixed(2) + " " + locales[i][1].toFixed(2) + ")");
        }
      }
      contenidos.push(tmp.innerHTML);
    }

    const h = doc.history, tx = !!h && !h.transaction;
    if (tx) h.begin("Seguir un recorrido");
    try {
      if (opciones.modo === "insertar" && contenidos.length > 1) doc.apply("insert", F + 1, contenidos.length - 1);
      const nivel = doc.level;
      const usados = nivel && typeof nivel.numbers === "function" ? nivel.numbers() : [];
      let numero = (usados.length ? Math.max.apply(null, usados) : 0) + 1;
      for (let k = 0; k < contenidos.length; k++) {
        if (k % 8 === 0) { avisar("🛤 Generando cuadro " + (k + 1) + " de " + contenidos.length + "…"); await respirar(); }
        // un dibujo NUEVO por cuadro: si el de ese cuadro estaba sostenido o se
        // usaba en otros, escribirle encima cambiaba también esos cuadros
        doc.setCell(F + k, numero++, capa.id);
        doc.goTo(F + k);
        doc.writeDrawing(contenidos[k], { label: "Seguir un recorrido" });
      }
    } finally { if (tx) h.commit(); }
    doc.goTo(F);
    const dw = doc.drawing;
    if (typeof global.dzCanvasSet === "function") global.dzCanvasSet(dw ? dw.content : "");
    doc.emit("cells"); doc.emit("frame");
    return { cuadros: contenidos.length, desde: F, hasta: F + contenidos.length - 1, juntos: els.length, sumado: sumar };
  }

  /* ── la ventana ────────────────────────────────────────────────────────── */
  function explicar(titulo, texto) {
    global.openModal(`<h2>🛤 ${titulo}</h2><div class="sub" id="recAviso"></div>
      <div class="m-actions"><button class="primary" id="mCancel">Entendido</button></div>`);
    $q("#recAviso").textContent = texto;
    $q("#mCancel").onclick = global.closeModal;
  }
  const COMO = "Dibujá el recorrido como UN trazo largo (abierto o cerrado) y cruzalo con rayitas cortas: cada rayita es un cuadro. Puede ir en otra capa (la de referencia, visible en este cuadro) o en la misma capa del objeto. Después elegí el objeto —o varios— y apretá «Seguir un recorrido».";

  /** Las capas que pueden tener el recorrido, ordenadas por lo prometedoras.
   *  Sólo se MIDEN (rápido); la elegida se lee entera después. */
  function candidatas(doc, frame, els) {
    const sc = doc.scene, vb = [0, 0, sc.width || 1920, sc.height || 1080];
    const out = [];
    for (const ly of sc.layers || []) {
      let contenido;
      if (ly.id === doc.layerId) {
        // la capa de lo elegido: lo que está en la mesa, SIN lo elegido
        els.forEach((el) => el.setAttribute("data-recorrido", "x"));
        try { contenido = global.dzCanvasInner(); } finally { els.forEach((el) => el.removeAttribute("data-recorrido")); }
      } else {
        if (ly.visible === false) continue;
        const dw = sc.drawingAt(ly.id, frame);
        contenido = dw && dw.content;
      }
      const largo = medirCapa(contenido, vb);
      if (largo >= 40) out.push({ ly, contenido, largo, propia: ly.id === doc.layerId });
    }
    const nombre = (c) => /ref|recorr|gu[ií]a|arco|camino/i.test(c.ly.name);
    out.sort((a, b) => (nombre(b) - nombre(a)) || (a.propia - b.propia) || (b.largo - a.largo));
    return { lista: out, vb };
  }

  let ocupado = false;
  async function abrir() {
    if (ocupado) return avisar("🛤 Ya estoy buscando el recorrido…");
    const d = dz();
    if (!d || !d.doc) return explicar("Seguir un recorrido", "Trabaja sobre una escena (.low): creá o abrí una. " + COMO);
    const els = eleccion();
    if (!els.length) return explicar("Elegí qué animar", "Elegí con la flecha el objeto a animar (o varios, con Shift) en el cuadro donde empieza. " + COMO);
    ocupado = true;
    try {
      avisar("🛤 Buscando el recorrido…"); await respirar();
      const doc = d.doc, F = doc.frame;
      const { lista, vb } = candidatas(doc, F, els);
      if (!lista.length) return explicar("No encontré un recorrido", COMO);
      const lecturas = new Map();
      const leer = (i) => { if (!lecturas.has(i)) lecturas.set(i, leerContenido(lista[i].contenido, vb)); return lecturas.get(i); };
      const opciones = lista.map((c, i) => `<option value="${i}">${c.ly.name.replace(/[<&>"]/g, "")}${c.propia ? " (la misma capa)" : ""}</option>`).join("");
      global.openModal(`<h2>🛤 Seguir un recorrido</h2>
        <div class="sub" id="recDesc"></div>
        <div class="dz-style-row"><span class="dz-hint">Capa</span><select id="recCapa" class="langsel">${opciones}</select>
          <span class="dz-hint">Recorrido</span><select id="recCamino" class="langsel"></select></div>
        <div class="dz-style-row" id="recSinMarcas"><span class="dz-hint">Cuadros</span><input type="number" id="recN" class="dz-win" value="12" min="2" max="240">
          <span class="dz-hint">Curva</span><select id="recEase" class="langsel"><option value="linear">Lineal</option><option value="in">Acelera</option><option value="out">Frena</option><option value="inout" selected>Acelera y frena</option></select></div>
        <div class="dz-style-row"><label class="dz-hint"><input type="checkbox" id="recInv"> invertir el sentido</label>
          <label class="dz-hint"><input type="checkbox" id="recGirar"> que gire siguiendo el recorrido</label></div>
        <div class="dz-style-row" style="flex-wrap:wrap"><label class="dz-hint" title="Los cuadros que ya hay se conservan: sólo se mueve lo elegido. Así se suman objetos y recorridos de a uno (un brazo, después el otro)"><input type="radio" name="recModo" id="recSumar" checked> sumar a los cuadros que ya hay</label>
          <label class="dz-hint" title="Los cuadros que siguen pasan a ser copias de este, con lo elegido sobre el recorrido"><input type="radio" name="recModo" id="recReemplazar"> reemplazarlos por copias de este</label>
          <label class="dz-hint"><input type="radio" name="recModo" id="recInsertar"> insertar cuadros nuevos</label></div>
        <div class="m-actions"><button class="ghost" id="mCancel">Cancelar</button><button class="primary" id="recGo">🛤 Generar</button></div>`);
      const [cx0, cy0] = centroDe(els);
      /* el recorrido de la capa elegida: por omisión, el MÁS CERCANO a lo
         elegido (con un recorrido por brazo, cada brazo agarra el suyo) */
      const llenarCaminos = () => {
        const r = leer(+$q("#recCapa").value || 0), sel = $q("#recCamino");
        sel.innerHTML = "";
        if (r.error) { sel.hidden = true; return; }
        const cs = r.caminos || [r];
        const cerca = cs.map((c, i) => ({ i, lejos: proyectar(c, cx0, cy0).lejos })).sort((a, b) => a.lejos - b.lejos)[0].i;
        cs.forEach((c, i) => { const o = document.createElement("option"); o.value = i;
          o.textContent = (i + 1) + " · " + (c.cerrado ? "cerrado" : "abierto") + ", " + c.marcas.length + " marcas" + (i === cerca ? " (el más cercano)" : "");
          sel.appendChild(o); });
        sel.value = String(cerca); sel.hidden = cs.length < 2;
      };
      const elegido = () => { const r = leer(+$q("#recCapa").value || 0); return r.error ? r : (r.caminos || [r])[+$q("#recCamino").value || 0]; };
      const pintar = () => {
        const r = elegido(), go = $q("#recGo");
        if (r.error) { $q("#recDesc").textContent = "En esa capa: " + r.error; go.disabled = true; $q("#recSinMarcas").hidden = true; return; }
        go.disabled = false;
        const n = r.marcas.length;
        $q("#recDesc").textContent = (els.length > 1 ? els.length + " elementos, juntos · " : "") + (r.cerrado ? "Recorrido cerrado" : "Recorrido abierto") +
          " de " + Math.round(r.total) + " unidades · " + (n >= 2 ? n + " marcas → un cuadro por marca, desde el cuadro " + F + " (juntas = lento, separadas = rápido)"
            : "sin marcas: elegí cuántos cuadros y la curva");
        $q("#recSinMarcas").hidden = n >= 2;
      };
      $q("#recCapa").onchange = () => { llenarCaminos(); pintar(); };
      $q("#recCamino").onchange = pintar;
      llenarCaminos(); pintar();
      $q("#mCancel").onclick = global.closeModal;
      $q("#recGo").onclick = async () => {
        const ref = elegido();
        const op = { invertir: $q("#recInv").checked, girar: $q("#recGirar").checked,
          modo: $q("#recInsertar").checked ? "insertar" : $q("#recReemplazar").checked ? "reemplazar" : "sumar",
          cuadros: +$q("#recN").value || 12, curva: $q("#recEase").value };
        global.closeModal();
        if (ref.error) return explicar("No se pudo", ref.error);
        avisar("🛤 Preparando los cuadros…"); await respirar();
        let r;
        try { r = await generar(ref, els, op); } catch (e) { r = { error: String(e && e.message || e) }; }
        if (r.error) return explicar("No se pudo seguir el recorrido", r.error);
        avisar("🛤 " + r.cuadros + " cuadros por el recorrido (" + r.desde + "–" + r.hasta + ")" + (r.juntos > 1 ? " · " + r.juntos + " elementos juntos" : "") +
          (r.sumado ? " · sumado a lo que ya había" : "") + " · Ctrl+Z lo saca");
      };
      avisar("🛤 Recorrido encontrado: elegí las opciones y «Generar»");
    } catch (e) {
      explicar("No pude leer el recorrido", String(e && e.message || e));
    } finally { ocupado = false; }
  }

  function enganchar() {
    const b = document.getElementById("tlRecorrido");
    if (b) b.onclick = () => abrir();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", enganchar, { once: true });
  else enganchar();

  global.dzRecorrido = abrir;
  global.LOW = global.LOW || {};
  global.LOW.animation = global.LOW.animation || {};
  global.LOW.animation.recorrido = { leerReferencia, leerContenido, medirCapa, paradas, enElCamino, proyectar, generar, abrir };
})(window);
