/* AGREGAR PUNTOS A UNA LÍNEA YA DIBUJADA.

   LO QUE PIDIÓ MAURO: «falta alguna herramienta para añadir puntos de vector en
   las líneas ya creadas».

   POR QUÉ ES LA PIEZA QUE FALTABA. Medido con una curva recién dibujada,
   `M 400 500 C 600 300 900 700 1200 400`: tiene DOS anclas, las dos en las
   puntas. Y todas las herramientas de vector de LOW trabajan sobre anclas —el
   imán tira de las anclas que encuentra cerca, el editor de nodos arrastra
   anclas—. Con dos anclas en los extremos, en el medio de la línea no hay nada
   que agarrar: el imán decía «Deformación aplicada» y no movía nada, y los
   nodos no daban dónde tocar. De ahí que las herramientas parecieran rotas: no
   estaban rotas, estaban trabajando sobre puntos que no existían.

   CÓMO SE AGREGA SIN DEFORMAR. El punto nuevo se inserta partiendo el tramo por
   donde cae, con De Casteljau: una curva cúbica se parte en DOS cúbicas que
   juntas dibujan EXACTAMENTE la misma curva. Agregar un punto no puede cambiar
   el dibujo ni un pelo; si lo cambiara, sería una deformación disfrazada de
   ayuda.

   @module vector/puntos-linea */

/** Punto de una cúbica en `t`, y sus dos mitades (De Casteljau). */
function dzCubicaPartir(p0, c1, c2, p1, t) {
  const mezcla = (a, b) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const a = mezcla(p0, c1), b = mezcla(c1, c2), c = mezcla(c2, p1);
  const d = mezcla(a, b), e = mezcla(b, c), medio = mezcla(d, e);
  return { medio, izquierda: [a, d, medio], derecha: [e, c, p1] };
}

function dzCubicaEn(p0, c1, c2, p1, t) {
  const u = 1 - t;
  return [u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * p1[0],
          u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * p1[1]];
}

/** El `t` del tramo más cercano a (x,y): se muestrea y después se afina. */
function dzTramoCerca(evaluar, x, y, pasos = 24) {
  let mejor = 0, mejorD = Infinity;
  for (let i = 0; i <= pasos; i++) {
    const t = i / pasos, q = evaluar(t);
    const d = (q[0] - x) * (q[0] - x) + (q[1] - y) * (q[1] - y);
    if (d < mejorD) { mejorD = d; mejor = t; }
  }
  let paso = 1 / pasos;
  for (let vuelta = 0; vuelta < 12; vuelta++) {
    paso /= 2;
    for (const t of [mejor - paso, mejor + paso]) {
      if (t < 0 || t > 1) continue;
      const q = evaluar(t);
      const d = (q[0] - x) * (q[0] - x) + (q[1] - y) * (q[1] - y);
      if (d < mejorD) { mejorD = d; mejor = t; }
    }
  }
  return { t: mejor, distancia: Math.sqrt(mejorD) };
}

/** Inserta un ancla en el trazado, donde caiga el punto pedido.
 *
 *  Devuelve `{x, y, distancia}` del punto insertado, o null si ese elemento no
 *  admite puntos o si el clic cayó demasiado lejos de la línea.
 */
function dzPuntoInsertarEnPath(el, x, y, tolerancia = 24) {
  const cmds = typeof dzPathParse === "function" ? dzPathParse(el.getAttribute("d") || "") : null;
  if (!cmds || cmds.length < 2) return null;
  let inicio = [0, 0], actual = [0, 0], mejor = null;
  cmds.forEach((paso, i) => {
    const fin = paso.n.length >= 2 ? [paso.n[paso.n.length - 2], paso.n[paso.n.length - 1]] : null;
    if (paso.c === "M") { inicio = actual = fin; return; }
    let evaluar = null;
    if (paso.c === "L") { const a = actual, b = fin; evaluar = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    else if (paso.c === "C") { const a = actual, c1 = [paso.n[0], paso.n[1]], c2 = [paso.n[2], paso.n[3]], b = fin;
      evaluar = t => dzCubicaEn(a, c1, c2, b, t); }
    else if (paso.c === "Q") { const a = actual, c = [paso.n[0], paso.n[1]], b = fin;
      evaluar = t => { const u = 1 - t;
        return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]; }; }
    else if (paso.c === "Z") { const a = actual, b = inicio;
      evaluar = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }
    if (evaluar) {
      const cerca = dzTramoCerca(evaluar, x, y);
      // se descartan los extremos: ahi YA hay un ancla, y duplicarla no agrega
      // nada y deja dos puntos pegados que despues no se pueden separar
      if (cerca.t > 0.02 && cerca.t < 0.98 && (!mejor || cerca.distancia < mejor.distancia))
        mejor = { i, t: cerca.t, distancia: cerca.distancia, desde: actual, evaluar, paso };
    }
    if (fin) actual = fin;
  });
  if (!mejor || mejor.distancia > tolerancia) return null;

  const { i, t, paso, desde } = mejor;
  const fin = [paso.n[paso.n.length - 2], paso.n[paso.n.length - 1]];
  let nuevos;
  if (paso.c === "C") {
    const partes = dzCubicaPartir(desde, [paso.n[0], paso.n[1]], [paso.n[2], paso.n[3]], fin, t);
    nuevos = [{ c: "C", n: [...partes.izquierda[0], ...partes.izquierda[1], ...partes.izquierda[2]] },
              { c: "C", n: [...partes.derecha[0], ...partes.derecha[1], ...partes.derecha[2]] }];
  } else if (paso.c === "Q") {
    const c = [paso.n[0], paso.n[1]];
    const a1 = [desde[0] + (c[0] - desde[0]) * t, desde[1] + (c[1] - desde[1]) * t];
    const b1 = [c[0] + (fin[0] - c[0]) * t, c[1] + (fin[1] - c[1]) * t];
    const medio = [a1[0] + (b1[0] - a1[0]) * t, a1[1] + (b1[1] - a1[1]) * t];
    nuevos = [{ c: "Q", n: [...a1, ...medio] }, { c: "Q", n: [...b1, ...fin] }];
  } else if (paso.c === "Z") {
    // cerrar sigue cerrando: el punto entra ANTES del cierre
    const medio = mejor.evaluar(t);
    nuevos = [{ c: "L", n: [medio[0], medio[1]] }, { c: "Z", n: [] }];
  } else {
    const medio = mejor.evaluar(t);
    nuevos = [{ c: "L", n: [medio[0], medio[1]] }, { c: "L", n: [...fin] }];
  }
  cmds.splice(i, 1, ...nuevos);
  el.setAttribute("d", dzPathBuild(cmds));
  const puesto = mejor.evaluar(t);
  return { x: puesto[0], y: puesto[1], distancia: mejor.distancia };
}

/** Lo mismo para polígonos, polilíneas y líneas, que guardan puntos sueltos. */
function dzPuntoInsertarEnPuntos(el, x, y, tolerancia = 24) {
  const tag = el.tagName.toLowerCase();
  let pts;
  if (tag === "line") pts = ["x1", "y1", "x2", "y2"].map(a => +el.getAttribute(a) || 0);
  else pts = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
  if (pts.length < 4 || pts.some(v => !isFinite(v))) return null;
  const cerrado = tag === "polygon";
  let mejor = null;
  const tramos = (pts.length / 2) - (cerrado ? 0 : 1);
  for (let s = 0; s < tramos; s++) {
    const i = s * 2, j = (i + 2) % pts.length;
    const a = [pts[i], pts[i + 1]], b = [pts[j], pts[j + 1]];
    const cerca = dzTramoCerca(t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], x, y);
    if (cerca.t > 0.02 && cerca.t < 0.98 && (!mejor || cerca.distancia < mejor.distancia))
      mejor = { i, t: cerca.t, distancia: cerca.distancia, a, b };
  }
  if (!mejor || mejor.distancia > tolerancia) return null;
  const px = mejor.a[0] + (mejor.b[0] - mejor.a[0]) * mejor.t;
  const py = mejor.a[1] + (mejor.b[1] - mejor.a[1]) * mejor.t;
  pts.splice(mejor.i + 2, 0, Math.round(px * 100) / 100, Math.round(py * 100) / 100);
  if (tag === "line") {
    // una linea de dos puntos con un punto mas ya no es un <line>: pasa a
    // polilinea, que es lo que representa lo que la persona acaba de pedir
    const nueva = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
    for (const at of el.attributes) if (!/^(x1|y1|x2|y2)$/.test(at.name)) nueva.setAttribute(at.name, at.value);
    nueva.setAttribute("points", pts.map(v => Math.round(v * 100) / 100).join(" "));
    if (!nueva.getAttribute("fill")) nueva.setAttribute("fill", "none");
    el.replaceWith(nueva);
    if (typeof DZ !== "undefined" && DZ && DZ.sel === el) DZ.sel = nueva;
    return { x: px, y: py, distancia: mejor.distancia, elemento: nueva };
  }
  el.setAttribute("points", pts.map(v => Math.round(v * 100) / 100).join(" "));
  return { x: px, y: py, distancia: mejor.distancia };
}

/** Agrega un punto donde se pidió. Devuelve el punto puesto, o null. */
function dzPuntoAgregar(el, x, y, tolerancia = 24) {
  if (!el || !el.tagName) return null;
  const tag = el.tagName.toLowerCase();
  if (tag === "path") return dzPuntoInsertarEnPath(el, x, y, tolerancia);
  if (["polygon", "polyline", "line"].includes(tag)) return dzPuntoInsertarEnPuntos(el, x, y, tolerancia);
  return null;
}

/** ¿El imán tiene un ancla al alcance? Si no, le agrega la que falta.
 *
 *  Ésta es la razón por la que el imán parecía roto. Tira de las anclas que
 *  encuentra dentro de su radio, y una curva recién dibujada tiene dos, las dos
 *  en las puntas: apoyabas el imán en el medio de la línea, no había nada que
 *  agarrar, no se movía nada — y el aviso decía «Deformación aplicada».
 *
 *  Devuelve true si tuvo que agregar el punto, para que quien llame lo pueda
 *  contar. El punto se inserta partiendo el tramo, así que agregarlo no cambia
 *  el dibujo: lo que cambia es que ahora hay de dónde tirar.
 */
function dzMagnetAsegurarAncla(el, e, estado) {
  if (!el || !estado || typeof dzPointInElement !== "function") return false;
  const tag = el.tagName.toLowerCase();
  if (!["path", "polygon", "polyline", "line"].includes(tag)) return false;
  const p = dzPointInElement(el, e.clientX, e.clientY);
  const radio = estado.radius || 40, r2 = radio * radio;
  let anclas = [];
  if (tag === "path") {
    const cmds = (typeof dzPathParse === "function" && dzPathParse(el.getAttribute("d") || "")) || [];
    anclas = cmds.filter(s => s.n.length >= 2).map(s => [s.n[s.n.length - 2], s.n[s.n.length - 1]]);
  } else if (tag === "line") {
    anclas = [[+el.getAttribute("x1") || 0, +el.getAttribute("y1") || 0],
              [+el.getAttribute("x2") || 0, +el.getAttribute("y2") || 0]];
  } else {
    const v = (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number);
    for (let i = 0; i + 1 < v.length; i += 2) anclas.push([v[i], v[i + 1]]);
  }
  if (anclas.some(q => (q[0] - p.x) * (q[0] - p.x) + (q[1] - p.y) * (q[1] - p.y) < r2)) return false;
  if (typeof dzVectorRemember === "function")
    dzVectorRemember(el, estado.journal, tag === "path" ? ["d"] : tag === "line" ? ["x1", "y1", "x2", "y2"] : ["points"]);
  return !!dzPuntoAgregar(el, p.x, p.y, radio);
}
