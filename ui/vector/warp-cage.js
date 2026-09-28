/* ══════════════════════════════════════════════════════════════════════════
   DEFORMACIÓN LIBRE: LA JAULA

   Pedido de Mauro: «que la forma se pueda deformar libremente, imitando y
   mejorando las herramientas que tiene Moho para hacer ese tipo de dibujo».

   Se agarra una rejilla de puntos sobre el dibujo y se la arrastra: el dibujo
   sigue. Es lo que en Moho hacen las transformaciones de perspectiva, sesgado y
   doblez, pero con una diferencia que importa —ver más abajo—.

   NO SE INVENTA LA MATEMÁTICA. La deformación es `rigMalla`, la misma que ya
   dobla los dibujos del esqueleto en el rig: interpolación bilineal entre la
   rejilla en reposo y la posada. Ya estaba exportada en `LOW.animation` para el
   rig —la busqué creyendo que había que exportarla y no hacía falta—, así que
   acá se usa, no se copia. Y la aplicación es `dzDeformarElemento`, que
   ya sabía recorrer los subpaths con `data-defbase` para que deformar no se
   acumule sobre lo ya deformado.

   TRES COSAS EN LAS QUE ESTO MEJORA A MOHO

   1. LA JAULA QUEDA. Se guarda en el elemento (`data-warp`), así que se puede
      volver a agarrar el mismo punto mañana y seguir corrigiendo. No es una
      transformación que se aplica y se va.

   2. SE PUEDE REPONER, entera o de a un punto (doble clic en el punto). Nunca
      hay que deshacer diez veces para volver al dibujo original.

   3. LA DENSIDAD SE CAMBIA SIN PERDER LO HECHO. Pasar de 3×3 a 5×5 fija lo
      deformado como el nuevo reposo y arma la rejilla encima. Se puede empezar
      con el gesto grueso y después afinar, que es como se dibuja.

   Y SI EL CONTORNO ES UN PINCEL, EL PINCEL SIGUE. Una forma entintada guarda su
   geometría; acá se deforma la geometría y se vuelve a entintar con el pincel
   que la forma tiene guardado, así que la línea se rehace sobre la curva nueva
   en vez de estirar tinta vieja.

   @module vector/warp-cage
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const ID = "dzWarpOverlay";
  const DENSIDADES = [3, 4, 5];

  /** El estado del modo, o null si no está puesto.
   *  { el, cols, rows, rest:[{x,y}], pose:[{x,y}], dBase } */
  let A = null;

  function lienzo() { return document.querySelector("#dzCanvas"); }
  function hoja() { return document.querySelector("#dzCanvas > svg"); }

  function malla(rest, pose, cols, rows) {
    const f = global.LOW && global.LOW.animation && global.LOW.animation.rigMalla;
    return f ? f(rest, pose, cols, rows) : null;
  }

  /* ── la rejilla ─────────────────────────────────────────────────────────── */

  /** La rejilla en reposo sobre la caja del elemento.
   *
   *  Con un margen a propósito: si la jaula calza justa al dibujo, los puntos
   *  del borde caen ENCIMA de la línea y agarrarlos es una pelea. */
  function rejilla(el, cols, rows) {
    let caja = null;
    try { caja = el.getBBox(); } catch (_) { return null; }
    if (!caja || (!caja.width && !caja.height)) return null;
    const m = Math.max(3, Math.min(caja.width, caja.height) * 0.06);
    const x0 = caja.x - m, y0 = caja.y - m;
    const w = caja.width + m * 2, h = caja.height + m * 2;
    const pts = [];
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        pts.push({ x: x0 + w * (cols > 1 ? c / (cols - 1) : 0),
          y: y0 + h * (rows > 1 ? r / (rows - 1) : 0) });
    return pts;
  }

  function leerGuardado(el) {
    try {
      const j = JSON.parse(el.getAttribute("data-warp") || "null");
      if (!j || !Array.isArray(j.rest) || !Array.isArray(j.pose)) return null;
      if (j.rest.length !== j.cols * j.rows || j.pose.length !== j.rest.length) return null;
      return { cols: j.cols, rows: j.rows,
        rest: j.rest.map(p => ({ x: +p[0], y: +p[1] })),
        pose: j.pose.map(p => ({ x: +p[0], y: +p[1] })),
        dBase: j.d || "" };
    } catch (_) { return null; }
  }

  function guardar(est) {
    const r = (v) => Math.round(v * 100) / 100;
    est.el.setAttribute("data-warp", JSON.stringify({
      cols: est.cols, rows: est.rows,
      rest: est.rest.map(p => [r(p.x), r(p.y)]),
      pose: est.pose.map(p => [r(p.x), r(p.y)]),
      d: est.dBase || undefined,
    }));
  }

  /* ── aplicar la deformación al dibujo ───────────────────────────────────── */

  function esPincel(el) {
    return typeof global.dzFormaPincelEs === "function" && global.dzFormaPincelEs(el);
  }

  /** ¿La jaula está en reposo? Con todos los puntos en su lugar no hay que
   *  deformar nada, y sobre todo no hay que RE-MUESTREAR: pasar un rectángulo
   *  por la malla identidad lo deja convertido en una polilínea de trescientos
   *  puntos idéntica a la vista pero distinta como dato. Reponer tiene que
   *  devolver el dibujo original, no una copia equivalente. */
  function enReposo(est) {
    return est.pose.every((p, i) =>
      Math.abs(p.x - est.rest[i].x) < 1e-6 && Math.abs(p.y - est.rest[i].y) < 1e-6);
  }

  function aplicar(est) {
    const svg = hoja();
    if (!svg) return false;
    if (enReposo(est)) return restaurarBase(est);
    const map = malla(est.rest, est.pose, est.cols, est.rows);
    if (!map) return false;
    if (esPincel(est.el)) {
      // La geometría de reposo se mapea y el pincel se vuelve a pasar por la
      // curva nueva: la línea se REHACE, no se estira.
      if (!est.dBase || typeof dzPathAPuntos !== "function") return false;
      const tramos = dzPathAPuntos(est.dBase, svg);
      for (const t of tramos) t.pts = t.pts.map(q => map.punto(q));
      return global.dzFormaPincelGeometria(est.el, dzPuntosAPath(tramos));
    }
    return typeof dzDeformarElemento === "function"
      ? dzDeformarElemento(est.el, map, svg) > 0 : false;
  }

  /** Vuelve el dibujo a su geometría de reposo, tal cual estaba. */
  function restaurarBase(est) {
    if (esPincel(est.el))
      return est.dBase ? global.dzFormaPincelGeometria(est.el, est.dBase) : false;
    const hijos = est.el.tagName.toLowerCase() === "g"
      ? [...est.el.querySelectorAll("path")] : [est.el];
    let tocados = 0;
    for (const h of hijos) {
      const base = h.getAttribute("data-defbase");
      if (!base) continue;
      h.setAttribute("d", base);
      tocados++;
    }
    // Sin `data-defbase` todavía nadie deformó: ya está en reposo.
    return tocados > 0 || true;
  }

  /* ── la superposición ───────────────────────────────────────────────────── */

  function overlay(crear) {
    let caja = document.getElementById(ID);
    if (caja || !crear) return caja;
    const host = lienzo();
    if (!host) return null;
    caja = document.createElement("div");
    caja.id = ID;
    caja.className = "dz-warp";
    caja.innerHTML = '<svg class="dz-warp-svg"></svg><div class="dz-warp-barra"></div>';
    host.appendChild(caja);
    return caja;
  }

  function aPantalla(p) {
    const s = typeof dzFromUser === "function" ? dzFromUser(p.x, p.y) : null;
    const cv = lienzo() && lienzo().getBoundingClientRect();
    if (!s || !cv) return null;
    return { x: s.x - cv.left, y: s.y - cv.top };
  }

  function pintar() {
    const caja = overlay(true);
    if (!caja || !A) return false;
    const svg = caja.querySelector(".dz-warp-svg");
    svg.innerHTML = "";
    const pantalla = A.pose.map(aPantalla);
    if (pantalla.some(p => !p)) return false;
    const en = (c, r) => pantalla[r * A.cols + c];
    // la red primero, para que los puntos queden encima y se puedan agarrar
    for (let r = 0; r < A.rows; r++)
      for (let c = 0; c < A.cols; c++) {
        if (c + 1 < A.cols) linea(svg, en(c, r), en(c + 1, r));
        if (r + 1 < A.rows) linea(svg, en(c, r), en(c, r + 1));
      }
    for (let i = 0; i < pantalla.length; i++) {
      const p = pantalla[i];
      const o = document.createElementNS(NS, "circle");
      o.setAttribute("class", "dz-warp-punto" + (movido(i) ? " movido" : ""));
      o.setAttribute("cx", p.x); o.setAttribute("cy", p.y); o.setAttribute("r", 5.5);
      o.setAttribute("data-i", i);
      o.onpointerdown = (e) => arrastrar(e, i);
      // doble clic devuelve ESE punto a su reposo: no hay que deshacer diez
      // veces para arreglar un tirón de más
      o.ondblclick = (e) => { e.preventDefault(); reponerPunto(i); };
      svg.appendChild(o);
    }
    barra(caja);
    return true;
  }

  function linea(svg, a, b) {
    if (!a || !b) return;
    const l = document.createElementNS(NS, "line");
    l.setAttribute("class", "dz-warp-red");
    l.setAttribute("x1", a.x); l.setAttribute("y1", a.y);
    l.setAttribute("x2", b.x); l.setAttribute("y2", b.y);
    svg.appendChild(l);
  }

  function movido(i) {
    return Math.abs(A.pose[i].x - A.rest[i].x) > 1e-6 ||
      Math.abs(A.pose[i].y - A.rest[i].y) > 1e-6;
  }

  function barra(caja) {
    const host = caja.querySelector(".dz-warp-barra");
    host.innerHTML = "";
    const boton = (texto, titulo, accion, activo) => {
      const b = document.createElement("button");
      b.type = "button"; b.textContent = texto; b.title = titulo;
      if (activo) b.className = "activo";
      b.onclick = accion;
      host.appendChild(b);
      return b;
    };
    for (const n of DENSIDADES)
      boton(n + "×" + n,
        "Rejilla de " + n + "×" + n + " puntos. Cambiar la densidad FIJA lo que " +
        "ya deformaste como nuevo reposo, así se puede empezar grueso y después afinar.",
        () => densidad(n), A.cols === n);
    boton("Reponer", "Devuelve el dibujo a su forma original, sin deshacer paso por paso.",
      reponer);
    boton("Listo", "Sale de la deformación. Escape hace lo mismo.", dzWarpSalir);
  }

  /* ── un gesto es UN paso de historial ───────────────────────────────────── */

  /* HAY DOS HISTORIALES y esto los junta. El del lienzo (`dzSnapshot`) y el del
     documento, que vuelca con 260 ms de retardo para no serializar el SVG en
     cada punto de un trazo. Sin transacción, un tirón de la jaula medía DOS
     pasos y hacían falta dos Ctrl+Z para deshacerlo. Es el mismo arreglo que
     necesitó el editor de nodos; acá se repite con su etiqueta. */
  function abrirPaso(etiqueta) {
    if (typeof DZ === "undefined" || !DZ) return;
    if (!DZ.history && global.LOW && global.LOW.core)
      DZ.history = new global.LOW.core.HistoryManager({ limit: 180 });
    if (DZ.history && !DZ.history.transaction) DZ.history.begin(etiqueta || "Deformar");
    if (typeof dzSnapshot === "function") dzSnapshot();
  }

  function cerrarPaso() {
    if (typeof DZ === "undefined" || !DZ) return;
    global.dzMarkDirty?.();
    // el volcado se fuerza DENTRO de la transacción: si cayera después sería un
    // paso aparte, que es justo el Ctrl+Z de más
    if (typeof DZ_DOC_TIMER !== "undefined") clearTimeout(DZ_DOC_TIMER);
    if (DZ.doc && typeof dzDocCommit === "function") dzDocCommit();
    DZ.history?.commit?.();
    if (DZ.history) { DZ.undo = DZ.history.undoStack; DZ.redo = DZ.history.redoStack; }
  }

  /* ── los gestos ─────────────────────────────────────────────────────────── */

  function arrastrar(e, i) {
    if (!A) return;
    e.preventDefault(); e.stopPropagation();
    const pid = e.pointerId;
    const objetivo = e.currentTarget;
    objetivo.classList.add("tomado");
    // UN paso de historial por gesto, con los DOS historiales adentro.
    abrirPaso("Deformar");
    let movio = false;
    const mover = (ev) => {
      if (ev.pointerId !== pid) return;
      const q = typeof dzToUser === "function" ? dzToUser(ev.clientX, ev.clientY) : null;
      if (!q) return;
      A.pose[i] = { x: q.x, y: q.y };
      movio = true;
      aplicar(A);
      pintar();
    };
    const limpiar = () => {
      document.removeEventListener("pointermove", mover);
      document.removeEventListener("pointerup", soltar);
      document.removeEventListener("pointercancel", soltar);
      objetivo.classList.remove("tomado");
    };
    const soltar = (ev) => {
      if (ev && ev.pointerId !== pid) return;
      limpiar();
      if (!movio) return;
      guardar(A);
      cerrarPaso();
      pintar();
      global.dzSetStatus?.("Punto " + (i + 1) + " de " + A.pose.length +
        " movido · doble clic en un punto lo repone · Ctrl+Z deshace el tirón");
    };
    document.addEventListener("pointermove", mover);
    document.addEventListener("pointerup", soltar);
    document.addEventListener("pointercancel", soltar);
  }

  function reponerPunto(i) {
    if (!A) return false;
    abrirPaso("Reponer un punto");
    A.pose[i] = { x: A.rest[i].x, y: A.rest[i].y };
    aplicar(A); guardar(A); cerrarPaso(); pintar();
    global.dzSetStatus?.("Punto " + (i + 1) + " devuelto a su lugar");
    return true;
  }

  function reponer() {
    if (!A) return false;
    abrirPaso("Reponer el dibujo");
    A.pose = A.rest.map(p => ({ x: p.x, y: p.y }));
    aplicar(A); guardar(A); cerrarPaso(); pintar();
    global.dzSetStatus?.("Dibujo repuesto a su forma original");
    return true;
  }

  /** Cambiar la densidad FIJA lo deformado como nuevo reposo.
   *
   *  Rearmar la rejilla sobre el dibujo ya deformado y seguir usando el reposo
   *  viejo compondría dos deformaciones y el dibujo saltaría. Fijando, lo hecho
   *  queda y la rejilla nueva empieza de cero encima: se puede trabajar de
   *  grueso a fino, que es como se dibuja. */
  function densidad(n) {
    if (!A || n === A.cols) return false;
    abrirPaso("Cambiar la rejilla");
    A.dBase = geometriaActual(A.el);
    if (!esPincel(A.el)) limpiarBase(A.el);
    A.cols = n; A.rows = n;
    A.rest = rejilla(A.el, n, n) || A.rest;
    A.pose = A.rest.map(p => ({ x: p.x, y: p.y }));
    guardar(A); cerrarPaso(); pintar();
    global.dzSetStatus?.("Rejilla de " + n + "×" + n + " · lo deformado quedó fijado");
    return true;
  }

  /** `dzDeformarElemento` guarda la geometría original en `data-defbase` para
   *  no acumular. Al fijar hay que soltarla, o el reposo nuevo seguiría siendo
   *  el dibujo de antes. */
  function limpiarBase(el) {
    const hijos = el.tagName.toLowerCase() === "g"
      ? [...el.querySelectorAll("path")] : [el];
    for (const h of hijos) h.removeAttribute("data-defbase");
  }

  function geometriaActual(el) {
    if (esPincel(el)) return el.getAttribute("data-d") || "";
    return el.tagName.toLowerCase() === "path" ? (el.getAttribute("d") || "") : "";
  }

  /* ── entrar y salir ─────────────────────────────────────────────────────── */

  function dzWarpEntrar(objetivo) {
    // `DZ` se declara con const en app.js: NO existe como `global.DZ`. Leyéndolo
    // así, esto salía por «Elegí un dibujo para deformarlo» con el dibujo
    // seleccionado. Es la tercera vez que esta trampa me muerde —ya estaba
    // escrita en pantalla-inicial.js—, así que ahora hay un contrato que la
    // busca en todo el árbol.
    const el0 = objetivo || (typeof DZ !== "undefined" && DZ ? DZ.sel : null);
    if (!el0) { global.dzSetStatus?.("Elegí un dibujo para deformarlo"); return false; }
    const svg = hoja();
    if (!svg) return false;
    // Una forma de SVG no se puede deformar punto por punto: primero se
    // convierte a trazado, que es lo que ya hacía el deformador del rig.
    let el = el0;
    if (!esPincel(el) && el.tagName.toLowerCase() !== "g" &&
        el.tagName.toLowerCase() !== "path") {
      const p = typeof dzFormaConvertir === "function" ? dzFormaConvertir(el) : null;
      if (!p) { global.dzSetStatus?.("Esto no se puede deformar todavía"); return false; }
      el = p;
      global.dzSelect?.(el);
    }
    const guardado = leerGuardado(el);
    const cols = guardado ? guardado.cols : 4, rows = guardado ? guardado.rows : 4;
    const rest = guardado ? guardado.rest : rejilla(el, cols, rows);
    if (!rest) { global.dzSetStatus?.("Este dibujo no tiene tamaño para deformar"); return false; }
    A = { el, cols, rows, rest,
      pose: guardado ? guardado.pose : rest.map(p => ({ x: p.x, y: p.y })),
      dBase: (guardado && guardado.dBase) || geometriaActual(el) };
    if (!pintar()) { A = null; return false; }
    document.addEventListener("keydown", enTecla, true);
    global.dzSetStatus?.("Deformación libre · arrastrá los puntos · doble clic repone " +
      "un punto · Escape sale");
    return true;
  }

  function dzWarpSalir() {
    if (!A) return false;
    A = null;
    document.removeEventListener("keydown", enTecla, true);
    const caja = document.getElementById(ID);
    if (caja) caja.remove();
    global.dzSetStatus?.("Deformación cerrada · la jaula queda guardada en el dibujo");
    return true;
  }

  function enTecla(e) {
    if (e.key !== "Escape" || !A) return;
    // Se detiene acá: en 2D Escape no cierra el módulo, cancela lo que está en
    // curso. Es la regla que ya tiene el resto del estudio.
    e.stopPropagation(); e.preventDefault();
    dzWarpSalir();
  }

  function dzWarpActivo() { return !!A; }

  function dzWarpAlternar() { return A ? dzWarpSalir() : dzWarpEntrar(); }

  global.dzWarpEntrar = dzWarpEntrar;
  global.dzWarpSalir = dzWarpSalir;
  global.dzWarpAlternar = dzWarpAlternar;
  global.dzWarpActivo = dzWarpActivo;
})(typeof window !== "undefined" ? window : globalThis);
