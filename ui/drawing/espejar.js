/* ══ ⇋ ESPEJAR LO ELEGIDO: HORIZONTAL (Shift+H) Y VERTICAL (Shift+V) ════════
   Pedido de Mauro (oct-2026, LOW 3.37): «una función que me di cuenta que
   falta en LOW 2D es la de espejar una imagen y/o objetos».

   La función existía —«Voltear» en el inspector—, pero escondida y con
   defectos. MEDIDO en la 3.37.0 (tools/check_espejar_2d_ui.js):
   · Sólo estaba en el inspector: sin atajo, sin entrada en el menú Edición ni
     en el clic derecho de la mesa. Shift+H no hacía nada.
   · Con UN objeto, el recuadro de transformación quedaba CORRIDO: después de
     voltear en horizontal se dibujaba un alto entero más arriba (y 234 en vez
     de 261), y en vertical un alto más abajo. dzPositionHandle arma el
     recuadro con la esquina local (x, y) y los ejes locales: con una
     transformación espejada ese marco es «zurdo» y un recuadro de CSS (que
     sólo gira) no lo puede representar.
   · Con VARIOS objetos, cada uno se volteaba en su lugar: el conjunto no se
     espejaba (lo de la izquierda seguía a la izquierda).
   · Un objeto girado se volteaba en sus ejes PROPIOS, no en los de la hoja:
     una pieza girada 30° seguía girada 30° en vez de quedar a −30°.
   · Cada vez se agregaba otro «translate() scale()» al final del transform.

   Lo que hace este módulo (app.js está en el techo de su presupuesto: todo va
   envolviendo funciones globales por nombre):
   1. dzEspejar(eje) espeja lo elegido ALREDEDOR DEL CENTRO DE LA SELECCIÓN,
      en los ejes de la hoja, con una sola matriz por objeto y en UN paso de
      Ctrl+Z. Sirve igual para trazos, formas, imágenes, textos y grupos; con
      «Toda la capa» (seleccion-opciones.js) se repite en todos los dibujos.
      dzFlip (los botones del inspector) pasa a ser esto mismo.
   2. Un objeto espejado tiene su recuadro sobre él: el marco se arma desde la
      esquina que lo deja «diestro», y los tiradores se traducen al lado local
      que les corresponde (el de la derecha estira la derecha que se VE).
   3. Se encuentra: Shift+H / Shift+V (del mapa único, panels/atajos.js), menú
      Edición y clic derecho sobre la mesa.

   @module drawing/espejar
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const doc = global.document;
  // DZ es una variable léxica de app.js (no es propiedad de la ventana)
  const D = () => (typeof DZ !== "undefined" ? DZ : null);
  const hoja = () => doc.querySelector("#dzCanvas > svg");
  const aviso = (t) => { try { global.dzSetStatus?.(t); } catch (_) { /* */ } };
  const NOMBRE = { h: "Espejar horizontal", v: "Espejar vertical" };

  /** Lo elegido, sin repetir lo que ya va adentro de otro elegido (un grupo y
   *  su hijo elegidos a la vez se espejarían dos veces). */
  function elegidos() {
    const d = D();
    if (!d) return [];
    const varios = (d.multi || []).filter((n) => n && n.isConnected);
    const lista = varios.length > 1 ? varios : (d.sel && d.sel.isConnected ? [d.sel] : []);
    return lista.filter((n) => n.ownerSVGElement && !lista.some((o) => o !== n && o.contains(n)));
  }

  const ident = () => new DOMMatrix();
  const aDOM = (m) => (m ? new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]) : ident());
  /** De la pantalla a la hoja: la matriz de `nodo` en el sistema de la hoja. */
  function enHoja(nodo, raiz) {
    const r = raiz.getScreenCTM(), n = nodo.getScreenCTM && nodo.getScreenCTM();
    if (!r || !n) return null;
    return aDOM(r).inverse().multiply(aDOM(n));
  }
  /** La caja de lo elegido, en la hoja (cada objeto con sus transformaciones). */
  function cajaEnHoja(els, raiz) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    for (const el of els) {
      let b; try { b = el.getBBox(); } catch (_) { continue; }
      const M = enHoja(el, raiz);
      if (!M || (!b.width && !b.height)) continue;
      for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
        const p = new DOMPoint(x, y).matrixTransform(M);
        x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y); x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y);
      }
    }
    return isFinite(x1) ? { x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 } : null;
  }
  const num = (v) => (Math.abs(v) < 1e-9 ? 0 : Math.round(v * 1e5) / 1e5);
  const matriz = (M) => `matrix(${[M.a, M.b, M.c, M.d, M.e, M.f].map(num).join(" ")})`;
  const esIdentidad = (M) => Math.abs(M.a - 1) + Math.abs(M.b) + Math.abs(M.c) + Math.abs(M.d - 1) + Math.abs(M.e) + Math.abs(M.f) < 1e-7;

  /** Espeja lo elegido alrededor del centro de la selección, en los ejes de la
   *  hoja. eje: "h" (izquierda ↔ derecha) o "v" (arriba ↔ abajo). */
  function espejar(eje) {
    const d = D(), raiz = hoja();
    eje = eje === "v" ? "v" : "h";
    if (!d || !raiz) return false;
    const els = elegidos();
    if (!els.length) { aviso("Elegí con la flecha lo que querés espejar (Ctrl+A elige todo)"); return false; }
    const c = cajaEnHoja(els, raiz);
    if (!c) return false;
    const sx = eje === "h" ? -1 : 1, sy = eje === "v" ? -1 : 1;
    const F = new DOMMatrix([sx, 0, 0, sy, c.cx * (1 - sx), c.cy * (1 - sy)]);
    const antes = global.dzDrawingEditBegin();
    for (const el of els) {
      const padre = el.parentNode && el.parentNode.getScreenCTM ? el.parentNode : raiz;
      const P = padre === raiz ? ident() : enHoja(padre, raiz);
      if (!P) continue;
      let T = ident();
      try { const k = el.transform && el.transform.baseVal.consolidate(); if (k) T = aDOM(k.matrix); } catch (_) { /* sin transform */ }
      // la propia nueva = P⁻¹ · F · P · T  (F vive en la hoja; el objeto, en su padre)
      const nueva = P.inverse().multiply(F).multiply(P).multiply(T);
      if (esIdentidad(nueva)) el.removeAttribute("transform");
      else el.setAttribute("transform", matriz(nueva));
    }
    // Con «Toda la capa» o «Cuadros elegidos» (seleccion-opciones.js) el cambio
    // se repite en los otros dibujos: se avisa como las flechas del teclado
    // (dzMarkDirty), que vuelcan este dibujo y los demás en UNA transacción.
    // Registrarlo acá aparte dejaba DOS pasos de Ctrl+Z (medido: el primero
    // deshacía los otros dibujos y éste quedaba espejado).
    const alcance = global.LOW?.drawing?.seleccionOpciones?.prefs?.alcance;
    if (d.doc && alcance && alcance !== "dibujo") global.dzMarkDirty();
    else global.dzDrawingEditRecord(antes, NOMBRE[eje]);
    try { global.dzPositionHandle?.(); } catch (_) { /* */ }
    try { const s = D().sel; if (s && s.isConnected) global.dzBuildInspector?.(s); } catch (_) { /* */ }
    aviso("⇋ Espejado en " + (eje === "h" ? "horizontal" : "vertical") + ": " + els.length + " objeto(s) · Ctrl+Z lo deshace");
    return true;
  }

  /* ── el recuadro de un objeto espejado ─────────────────────────────────── */
  /** ¿Lo elegido (uno solo) se ve espejado? Su marco local es «zurdo». */
  function espejadoSolo() {
    const d = D();
    if (!d || !d.sel || !d.sel.isConnected || (d.multi || []).filter((n) => n && n.isConnected).length > 1) return null;
    const m = d.sel.getScreenCTM && d.sel.getScreenCTM();
    return m && m.a * m.d - m.b * m.c < 0 ? d.sel : null;
  }
  function envolverRecuadro() {
    const orig = global.dzPositionHandle;
    if (typeof orig !== "function" || orig.__espejar) return;
    const f = function () {
      const r = orig.apply(this, arguments);
      try {
        const el = espejadoSolo(), box = doc.querySelector("#dzSelBox");
        if (!el || !box || box.hidden) return r;
        const lb = el.getBBox(), m = el.getScreenCTM(), cv = doc.querySelector("#dzCanvas").getBoundingClientRect();
        const pt = (x, y) => new DOMPoint(x, y).matrixTransform(aDOM(m));
        // desde la esquina (x+ancho, y) y hacia la x local NEGATIVA: el marco vuelve a ser diestro
        const p0 = pt(lb.x + lb.width, lb.y), px = pt(lb.x, lb.y), py = pt(lb.x + lb.width, lb.y + lb.height);
        const vx = { x: px.x - p0.x, y: px.y - p0.y }, vy = { x: py.x - p0.x, y: py.y - p0.y };
        const ancho = Math.max(1, Math.hypot(vx.x, vx.y)), alto = Math.max(1, Math.hypot(vy.x, vy.y));
        const ang = Math.atan2(vx.y, vx.x) * 180 / Math.PI;
        box.style.left = (p0.x - cv.left) + "px"; box.style.top = (p0.y - cv.top) + "px";
        box.style.width = ancho + "px"; box.style.height = alto + "px";
        box.style.transformOrigin = "0 0";
        box.style.transform = Math.abs(ang) > 1e-6 ? `rotate(${ang}deg)` : "none";
        if (typeof global.dzCursoresDeCaja === "function") global.dzCursoresDeCaja(box, ang);
        // las esquinas redondeadas (rect): la izquierda local se ve a la derecha
        box.querySelectorAll(".dz-corner-widget").forEach((w) => {
          if (w.hidden) return;
          const izq = parseFloat(w.style.left) || 0;
          w.style.left = Math.max(12, Math.min(ancho - 12, ancho - izq)) + "px";
        });
        const rot = doc.querySelector("#dzRotate");
        if (rot && !rot.hidden) {
          const arriba = { x: p0.x + vx.x / 2, y: p0.y + vx.y / 2 }, l = Math.max(1, Math.hypot(vy.x, vy.y));
          rot.style.left = (arriba.x - vy.x / l * 22 - cv.left) + "px";
          rot.style.top = (arriba.y - vy.y / l * 22 - cv.top) + "px";
        }
      } catch (_) { /* sin caja: queda lo de siempre */ }
      return r;
    };
    Object.assign(f, orig);
    f.__espejar = true;
    global.dzPositionHandle = f;
  }
  /** Los tiradores del recuadro dicen el lado que se VE: en un objeto espejado
   *  en su x local, el lado derecho que se ve es el izquierdo local. */
  function envolverTiradores() {
    const orig = global.dzBoxHandleDown;
    if (typeof orig !== "function" || orig.__espejar) return;
    const f = function (e, hx, hy) {
      if (espejadoSolo()) return orig.call(this, e, -hx, hy);
      return orig.apply(this, arguments);
    };
    Object.assign(f, orig);
    f.__espejar = true;
    global.dzBoxHandleDown = f;
  }

  /* ── dónde se encuentra ────────────────────────────────────────────────── */
  /** dzFlip: los botones «Voltear» del inspector hacen lo mismo que el menú. */
  function envolverVoltear() {
    const orig = global.dzFlip;
    if (orig && orig.__espejar) return;
    const f = function (eje) { return espejar(eje); };
    if (typeof orig === "function") Object.assign(f, orig);
    f.__espejar = true;
    global.dzFlip = f;
  }
  function envolverMenu() {
    const orig = global.dzMenuAction;
    if (typeof orig !== "function" || orig.__espejar) return;
    const f = function (act) {
      if (act === "espejar-h") return espejar("h");
      if (act === "espejar-v") return espejar("v");
      return orig.apply(this, arguments);
    };
    Object.assign(f, orig);
    f.__espejar = true;
    global.dzMenuAction = f;
  }
  const tecla = (act, fabrica) => {
    const d = D(), k = d && d.keymap ? d.keymap[act] : fabrica;
    return k ? (typeof global.dzAtajoEtiqueta === "function" ? global.dzAtajoEtiqueta(k) : k) : "";
  };
  /** El clic derecho sobre la mesa (el menú que tiene «Duplicar» y «Mover a
   *  Línea») suma Espejar horizontal / vertical, después de Agrupar. */
  function envolverMenuContextual() {
    const orig = global.showCtxMenu;
    if (typeof orig !== "function" || orig.__espejar) return;
    const f = function (e, items) {
      try {
        const esMesa = Array.isArray(items) && items.some((i) => i && i.label === "Duplicar") && items.some((i) => i && i.label === "Mover a Línea");
        if (esMesa && !items.some((i) => i && i.espejar)) {
          const hay = elegidos().length > 0;
          const donde = Math.max(0, items.findIndex((i) => i && /Agrupar|Desagrupar/.test(i.label || ""))) + 1;
          items = items.slice();
          items.splice(donde, 0,
            { icon: "⇋", label: "Espejar horizontal", shortcut: tecla("espejarh", "shift+h"), disabled: !hay, espejar: "h", action: () => espejar("h") },
            { icon: "⇵", label: "Espejar vertical", shortcut: tecla("espejarv", "shift+v"), disabled: !hay, espejar: "v", action: () => espejar("v") });
        }
      } catch (_) { /* el menú de siempre */ }
      return orig.call(this, e, items);
    };
    Object.assign(f, orig);
    f.__espejar = true;
    global.showCtxMenu = f;
  }
  /** El <kbd> del menú Edición anuncia la tecla del mapa (si se reasignó, la nueva). */
  function refrescarMenu() {
    for (const [act, accion, fabrica] of [["espejar-h", "espejarh", "shift+h"], ["espejar-v", "espejarv", "shift+v"]]) {
      const k = doc.querySelector('[data-menu="edicion"] [data-act="' + act + '"] kbd');
      if (k) k.textContent = tecla(accion, fabrica) || "—";
    }
  }

  function arrancar() {
    envolverVoltear(); envolverMenu(); envolverMenuContextual();
    envolverRecuadro(); envolverTiradores();
    const menu = doc.querySelector('[data-menu="edicion"]');
    if (menu) for (const t of ["pointerenter", "pointerdown"]) menu.addEventListener(t, refrescarMenu);
  }

  global.dzEspejar = espejar;
  global.LOW = global.LOW || {};
  global.LOW.drawing = global.LOW.drawing || {};
  global.LOW.drawing.espejar = { espejar, elegidos, cajaEnHoja, espejadoSolo };
  // después de app.js y de los módulos que envuelven lo mismo (marco de selección, cortar-pegar)
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", () => setTimeout(arrancar, 0), { once: true });
  else setTimeout(arrancar, 0);
})(typeof window !== "undefined" ? window : globalThis);
