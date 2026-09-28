/* ══════════════════════════════════════════════════════════════════════════
   EDICIÓN VECTORIAL: NODOS

   Los puntos editables de un trazado, un polígono o una línea: mostrarlos,
   arrastrarlos y borrarlos. Incluye el lector y el escritor de trazados, que
   son la parte delicada.

   Vivía dentro de app.js sin una sola prueba propia —lo único que se
   comprobaba era que el botón de la herramienta existiera en la barra—, y el
   balance lo tenía anotado como lo que frenaba a Vector. Se mudó acá al
   escribir esas pruebas, porque el arreglo del historial cae en este archivo.

   EL LECTOR NORMALIZA. `dzPathParse` deja todo en absoluto y convierte H y V
   en L, así que un trazado escrito con comandos relativos, con H/V, o con la L
   implícita que sigue a una M, se lee igual que el mismo escrito largo. Eso
   importa más de lo que parece: si el lector se equivoca ahí, el primer
   arrastre reescribe el trazado entero y el dibujo se deforma sin que nadie
   haya tocado nada más. Y ante un trazado ilegible devuelve null en vez de
   adivinar, porque escribir encima de lo que no se entendió es peor que no
   editar.

   UN GESTO, UN PASO DE HISTORIAL. Medido: mover un punto dejaba DOS pasos —el
   snapshot del lienzo y el volcado al documento— y hacían falta dos Ctrl+Z
   para volver, el primero de los cuales no se veía. Sacar el snapshot lo
   empeoraba: un solo paso, pero el trazado no volvía nunca. Así que los dos
   pasos se necesitan, y lo que faltaba era agruparlos: el gesto abre una
   transacción, fuerza el volcado antes de cerrarla y queda como UN paso.

   @module vector/node-editor
   ══════════════════════════════════════════════════════════════════════════ */

function dzPathParse(d) {
  const toks = d.match(/[a-zA-Z]|-?[\d.]+(?:e-?\d+)?/g);
  if (!toks) return null;
  const ARG = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  const out = [];
  let cx = 0, cy = 0, sx = 0, sy = 0, i = 0, cmd = null;
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    if (!cmd) return null;
    const C = cmd.toUpperCase(), rel = cmd !== C;
    if (!(C in ARG)) return null;
    const na = ARG[C];
    if (C === "Z") { out.push({ c: "Z", n: [] }); cx = sx; cy = sy; if (i >= toks.length) break; continue; }
    const n = toks.slice(i, i + na).map(Number);
    if (n.length < na || n.some(isNaN)) return null;
    i += na;
    if (C === "H") { const x = rel ? cx + n[0] : n[0]; out.push({ c: "L", n: [x, cy] }); cx = x; }
    else if (C === "V") { const y = rel ? cy + n[0] : n[0]; out.push({ c: "L", n: [cx, y] }); cy = y; }
    else if (C === "A") {
      const x = rel ? cx + n[5] : n[5], y = rel ? cy + n[6] : n[6];
      out.push({ c: "A", n: [n[0], n[1], n[2], n[3], n[4], x, y] }); cx = x; cy = y;
    } else {
      const abs = n.slice();
      if (rel) for (let k = 0; k < abs.length; k += 2) { abs[k] += cx; abs[k + 1] += cy; }
      out.push({ c: C, n: abs });
      cx = abs[abs.length - 2]; cy = abs[abs.length - 1];
      if (C === "M") { sx = cx; sy = cy; cmd = rel ? "l" : "L"; }   // M implícito encadena L
    }
  }
  return out;
}
function dzPathBuild(cmds) {
  return cmds.map(s => s.c + " " + s.n.map(v => (Math.round(v * 100) / 100)).join(" ")).join(" ");
}
/* anclas editables del elemento seleccionado (según su tipo) */
function dzNodesFor(el) {
  const t = el.tagName.toLowerCase();
  if (t === "path") {
    const cmds = dzPathParse(el.getAttribute("d") || "");
    if (!cmds) return null;
    el.__dzCmds = cmds;
    const anchors = [];
    cmds.forEach((s, k) => {
      if (s.c !== "Z" && s.n.length >= 2)
        anchors.push({ x: s.n[s.n.length - 2], y: s.n[s.n.length - 1], k });
    });
    return { kind: "path", anchors };
  }
  if (t === "polygon" || t === "polyline") {
    const pts = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
    const anchors = [];
    for (let k = 0; k + 1 < pts.length; k += 2) anchors.push({ x: pts[k], y: pts[k + 1], k: k / 2 });
    el.__dzPts = pts;
    return { kind: "poly", anchors };
  }
  if (t === "line")
    return { kind: "line", anchors: [
      { x: +el.getAttribute("x1") || 0, y: +el.getAttribute("y1") || 0, k: 1 },
      { x: +el.getAttribute("x2") || 0, y: +el.getAttribute("y2") || 0, k: 2 }] };
  return null;
}
function dzNodeMove(el, info, a, dx, dy) {
  if (info.kind === "path") {
    const cmds = el.__dzCmds, s = cmds[a.k];
    s.n[s.n.length - 2] = a.x + dx; s.n[s.n.length - 1] = a.y + dy;
    if (s.c === "C") { s.n[2] = (a.c2x !== undefined ? a.c2x : s.n[2]) + dx; s.n[3] = (a.c2y !== undefined ? a.c2y : s.n[3]) + dy; }
    const nx = cmds[a.k + 1];                     // la manija de salida acompaña
    if (nx && nx.c === "C") { nx.n[0] = (a.n1x !== undefined ? a.n1x : nx.n[0]) + dx; nx.n[1] = (a.n1y !== undefined ? a.n1y : nx.n[1]) + dy; }
    el.setAttribute("d", dzPathBuild(cmds));
  } else if (info.kind === "poly") {
    const pts = el.__dzPts;
    pts[a.k * 2] = a.x + dx; pts[a.k * 2 + 1] = a.y + dy;
    el.setAttribute("points", pts.map(v => Math.round(v * 100) / 100).join(" "));
  } else if (info.kind === "line") {
    el.setAttribute("x" + a.k, Math.round(a.x + dx));
    el.setAttribute("y" + a.k, Math.round(a.y + dy));
  }
}
function dzNodeDelete(el, info, a) {
  if (info.kind === "path") {
    const cmds = el.__dzCmds;
    if (cmds.filter(s => s.c !== "Z").length <= 2) return;   // no dejar un path degenerado
    if (cmds[a.k].c === "M" && cmds[a.k + 1] && cmds[a.k + 1].n.length >= 2) {
      const nx = cmds[a.k + 1];
      cmds[a.k + 1] = { c: "M", n: [nx.n[nx.n.length - 2], nx.n[nx.n.length - 1]] };
    }
    cmds.splice(a.k, 1);
    el.setAttribute("d", dzPathBuild(cmds));
  } else if (info.kind === "poly") {
    const pts = el.__dzPts;
    if (pts.length <= 6) return;
    pts.splice(a.k * 2, 2);
    el.setAttribute("points", pts.map(v => Math.round(v * 100) / 100).join(" "));
  } else return;                                 // línea: sus 2 puntos no se borran
  dzMarkDirty(); dzNodesShow(el);
}
function dzNodesClear() {
  document.querySelectorAll("#dzCanvas .dz-node").forEach(n => n.remove());
  DZ.nodeEl = null;
}
function dzNodesShow(el) {
  dzNodesClear();
  const info = dzNodesFor(el);
  if (!info) { dzSetStatus("⬦ Ese elemento no tiene nodos editables (probá con un trazado, polígono o línea)"); return; }
  // LO QUE SE EDITA ES LO QUE ESTÁ SELECCIONADO. Sin esto, editar los puntos de
  // una forma dejaba la selección en la ANTERIOR: la caja de selección marcaba
  // una forma y los nodos estaban sobre otra, y todo lo que trabaja sobre la
  // selección —borrar, color, el inflador cuando no hay nada bajo el cursor—
  // actuaba sobre la que no era. Mauro lo reportó como «a veces selecciona la
  // última forma editada aunque esté trabajando sobre otra».
  if (typeof dzSelect === "function" && DZ.sel !== el) dzSelect(el);
  DZ.nodeEl = el;   // DESPUES de seleccionar: dzSelect limpia los nodos
  const cv = $("#dzCanvas");
  info.anchors.forEach(a => {
    const n = document.createElement("div");
    n.className = "dz-node";
    const sp = dzToScreen(a.x, a.y);
    n.style.left = sp.x + "px"; n.style.top = sp.y + "px";
    n.title = "Arrastrá para mover el punto · doble clic: borrarlo";
    n.onpointerdown = (e) => {
      e.preventDefault(); e.stopPropagation();
      const pointerId = e.pointerId;
      // UN GESTO, UN PASO. dzSnapshot() entra en la transaccion (HistoryManager
      // desvia el push cuando hay una abierta) y el volcado al documento
      // tambien, porque se lo fuerza antes de cerrarla. Sin esto el arrastre
      // dejaba dos pasos y el primer Ctrl+Z no se veia.
      dzNodesHistoria();
      dzSnapshot();
      // congelar las manijas vecinas de ESTE arrastre (para sumar el delta una sola vez)
      if (info.kind === "path") {
        const s = el.__dzCmds[a.k], nx = el.__dzCmds[a.k + 1];
        if (s.c === "C") { a.c2x = s.n[2]; a.c2y = s.n[3]; }
        if (nx && nx.c === "C") { a.n1x = nx.n[0]; a.n1y = nx.n[1]; }
      }
      const start = dzToUser(e.clientX, e.clientY);
      const move = (ev) => {
        if (ev.pointerId !== pointerId) return;
        const p = dzToUser(ev.clientX, ev.clientY);
        dzNodeMove(el, info, a, p.x - start.x, p.y - start.y);
        const s2 = dzToScreen(a.x + (p.x - start.x), a.y + (p.y - start.y));
        n.style.left = s2.x + "px"; n.style.top = s2.y + "px";
      };
      const up = (ev) => {
        if (ev.pointerId !== pointerId) return;
        document.removeEventListener("pointermove", move);
        document.removeEventListener("pointerup", up);
        document.removeEventListener("pointercancel", up);
        if (ev.type === "pointercancel") { DZ.history?.cancel?.(); return; }
        const p = dzToUser(ev.clientX, ev.clientY);
        a.x += p.x - start.x; a.y += p.y - start.y;
        delete a.c2x; delete a.c2y; delete a.n1x; delete a.n1y;
        dzNodesCerrarPaso();
      };
      document.addEventListener("pointermove", move);
      document.addEventListener("pointerup", up);
      document.addEventListener("pointercancel", up);
    };
    n.ondblclick = (e) => { e.preventDefault(); e.stopPropagation();
      dzNodesHistoria(); dzSnapshot(); dzNodeDelete(el, info, a); dzNodesCerrarPaso(); };
    cv.appendChild(n);
  });
  dzSetStatus("⬦ " + info.anchors.length + " puntos — arrastralos · doble clic borra un punto");
}
function dzNodesClick(e) {   // misma puntería que la selección: ver drawing/hit-test.js
  const el = (typeof dzHitTest === "function" && dzHitTest(e.clientX, e.clientY)) || document.elementFromPoint(e.clientX, e.clientY);
  if (!el || !el.closest || !el.closest("#dzCanvas svg") || el.closest("g.dz-onion")) { dzNodesClear(); dzSetStatus(""); return; }
  const t = el.tagName.toLowerCase();
  if (["svg", "defs"].includes(t)) { dzNodesClear(); dzSetStatus(""); return; }
  // UNA FORMA BÁSICA NO TIENE NODOS: un rectángulo son x/y/ancho/alto, no
  // puntos, así que el editor decía «ese elemento no tiene nodos editables».
  // Para poder DIBUJAR A PARTIR DE FORMAS y después editarlas —lo pidió Mauro—
  // se convierte a trazado al tocarla con esta herramienta. Es una edición de
  // verdad: entra en el historial, se avisa, y Ctrl+Z la deja como estaba.
  if (["rect", "circle", "ellipse"].includes(t) && typeof dzFormaConvertir === "function") {
    dzNodesHistoria(); dzSnapshot();
    const nombre = t === "rect" ? "El rectángulo" : t === "circle" ? "El círculo" : "La elipse";
    const path = dzFormaConvertir(el);
    if (path) {
      if (typeof DZ !== "undefined" && DZ.sel === el) DZ.sel = path;
      dzNodesCerrarPaso();
      dzNodesShow(path);
      dzSetStatus(nombre + " pasó a trazado para editarlo por puntos · clic sobre la " +
        "línea agrega un punto · Ctrl+Z lo deja como estaba");
      return;
    }
    DZ.history?.commit?.();
  }
  // SEGUNDO CLIC SOBRE LA MISMA LINEA: agrega un punto ahi. El primero elige
  // que linea se edita —si agregara de una, elegir una linea la modificaria—.
  // Esto es lo que faltaba para que las demas herramientas de vector sirvan:
  // una curva recien dibujada tiene DOS anclas, las dos en las puntas, y todo
  // lo que trabaja sobre anclas no tenia de donde agarrar en el medio.
  if (DZ.nodeEl === el && typeof dzPuntoAgregar === "function") {
    const p = dzToUser(e.clientX, e.clientY);
    const tolerancia = 24 / (DZ.zoom || 1);
    dzNodesHistoria(); dzSnapshot();
    const puesto = dzPuntoAgregar(el, p.x, p.y, tolerancia);
    if (puesto) {
      dzNodesCerrarPaso();
      dzNodesShow(puesto.elemento || el);
      dzSetStatus("⬦ Punto agregado · arrastralo para curvar · Ctrl+Z lo saca");
      return;
    }
    DZ.history?.commit?.();      // no se agrego nada: no dejar la transaccion abierta
  }
  dzNodesShow(el);
}

/** Abre la transaccion del gesto. El historial tiene que existir antes, porque
 *  dzSnapshot lo crea y ahi ya seria tarde para abrirla. */
function dzNodesHistoria() {
  if (!DZ.history) DZ.history = new LOW.core.HistoryManager({ limit: 180 });
  if (!DZ.history.transaction) DZ.history.begin("Editar puntos");
}

/** Cierra el gesto como UN paso. El volcado al documento va con retardo de
 *  260 ms —para no serializar el SVG en cada punto de un trazo—, asi que se lo
 *  fuerza aca: si cayera despues de cerrar la transaccion seria un paso aparte,
 *  que es justo el Ctrl+Z que no se veia. */
function dzNodesCerrarPaso() {
  dzMarkDirty();
  clearTimeout(DZ_DOC_TIMER);
  if (DZ.doc) dzDocCommit();
  DZ.history?.commit?.();
  DZ.undo = DZ.history.undoStack; DZ.redo = DZ.history.redoStack;
}

window.dzPathParse = dzPathParse; window.dzPathBuild = dzPathBuild;
window.dzNodesFor = dzNodesFor; window.dzNodeMove = dzNodeMove;
window.dzNodeDelete = dzNodeDelete; window.dzNodesClear = dzNodesClear;
window.dzNodesShow = dzNodesShow; window.dzNodesClick = dzNodesClick;
window.dzNodesHistoria = dzNodesHistoria; window.dzNodesCerrarPaso = dzNodesCerrarPaso;
