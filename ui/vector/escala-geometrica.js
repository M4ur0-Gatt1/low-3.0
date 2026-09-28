/* ACHICAR UNA FORMA NO PUEDE CAMBIAR EL ESPESOR DE SU CONTORNO.

   LO QUE REPORTÓ MAURO: «cuando achico una forma o la deformo no tiene que
   cambiar el espesor de ninguno de los lados».

   POR QUÉ PASABA. Redimensionar escribía una `transform` con la escala sobre el
   elemento, y en SVG una transformación escala TODO: la geometría y también el
   trazo. Peor todavía con la deformación libre (Shift en una esquina), que
   escala distinto en cada eje: los lados verticales se pintan con el factor X y
   los horizontales con el factor Y, así que la misma forma queda con un lado
   grueso y el otro finito.

   Medido, achicando un rectángulo de contorno 12 con Shift:

       matrix(0.050445 0 0 0.715134 …)
       lado vertical   → 0,32 px pintados
       lado horizontal → 4,52 px pintados      ← catorce veces más grueso

   CÓMO SE ARREGLA. No se escala el elemento: se escala su GEOMETRÍA. Un
   rectángulo cambia su `x/y/width/height`, un trazado sus coordenadas, una forma
   entintada su `data-d` —y se vuelve a entintar con el mismo `data-grosor`—. El
   `stroke-width` no se toca nunca, así que el contorno sale igual de grueso en
   los cuatro lados, antes y después.

   Y se trabaja SIEMPRE desde la geometría original capturada al empezar el
   gesto, no desde la del movimiento anterior: multiplicar escalas acumuladas
   redondeo tras redondeo deforma el dibujo de a poquito.

   LO QUE NO HACE. Si el tipo no se puede escalar sin mentir —un `circle` que se
   estira sólo en un eje deja de ser un círculo— devuelve `false` y quien llama
   se queda con la transformación de siempre. Es preferible la lupa vieja a
   convertir el elemento en otro a mitad de un arrastre.

   @module vector/escala-geometrica */

/** Los números de un `d` escalados sobre un ancla, conservando las curvas. */
function dzEscalaPathD(d, kx, ky, ax, ay) {
  const cmds = typeof dzPathParse === "function" ? dzPathParse(d || "") : null;
  if (!cmds || !cmds.length) return null;
  for (const paso of cmds) {
    if (paso.c === "Z" || !paso.n.length) continue;
    if (paso.c === "A") {
      // arco: radios y punto final. El giro del eje mayor no se recalcula
      // —las formas de LOW no usan arcos— pero el radio sí, para no deformar.
      paso.n[0] = Math.abs(paso.n[0] * kx);
      paso.n[1] = Math.abs(paso.n[1] * ky);
      paso.n[5] = ax + (paso.n[5] - ax) * kx;
      paso.n[6] = ay + (paso.n[6] - ay) * ky;
      continue;
    }
    for (let i = 0; i + 1 < paso.n.length; i += 2) {
      paso.n[i] = ax + (paso.n[i] - ax) * kx;
      paso.n[i + 1] = ay + (paso.n[i + 1] - ay) * ky;
    }
  }
  return typeof dzPathBuild === "function" ? dzPathBuild(cmds) : null;
}

/** La geometría de un elemento tal como está, para escalar siempre desde acá. */
function dzEscalaCapturar(el) {
  if (!el || !el.tagName) return null;
  const tag = el.tagName.toLowerCase();
  const num = (nombre) => parseFloat(el.getAttribute(nombre) || "0") || 0;
  if (typeof dzFormaPincelEs === "function" && dzFormaPincelEs(el))
    return { tipo: "pincel", d: el.getAttribute("data-d") || "" };
  if (tag === "path") return { tipo: "path", d: el.getAttribute("d") || "" };
  if (tag === "rect") return { tipo: "rect", x: num("x"), y: num("y"),
    w: num("width"), h: num("height"), rx: num("rx"), ry: num("ry") };
  if (tag === "ellipse") return { tipo: "ellipse", cx: num("cx"), cy: num("cy"), rx: num("rx"), ry: num("ry") };
  if (tag === "circle") return { tipo: "circle", cx: num("cx"), cy: num("cy"), r: num("r") };
  if (tag === "line") return { tipo: "line", x1: num("x1"), y1: num("y1"), x2: num("x2"), y2: num("y2") };
  if (tag === "polygon" || tag === "polyline")
    return { tipo: "puntos", pts: (el.getAttribute("points") || "").trim().split(/[\s,]+/).map(Number) };
  return null;
}

/** Escribe la geometría escalada. Devuelve false si este tipo no se puede. */
function dzEscalaGeometrica(el, snap, kx, ky, ax, ay) {
  if (!el || !snap || !isFinite(kx) || !isFinite(ky)) return false;
  const set = (nombre, valor) => el.setAttribute(nombre, Math.round(valor * 100) / 100);
  if (snap.tipo === "rect") {
    set("x", ax + (snap.x - ax) * kx); set("y", ay + (snap.y - ay) * ky);
    set("width", Math.abs(snap.w * kx)); set("height", Math.abs(snap.h * ky));
    if (snap.rx) set("rx", Math.abs(snap.rx * kx));
    if (snap.ry) set("ry", Math.abs(snap.ry * ky));
    return true;
  }
  if (snap.tipo === "ellipse") {
    set("cx", ax + (snap.cx - ax) * kx); set("cy", ay + (snap.cy - ay) * ky);
    set("rx", Math.abs(snap.rx * kx)); set("ry", Math.abs(snap.ry * ky));
    return true;
  }
  if (snap.tipo === "circle") {
    // un círculo estirado sólo en un eje ya no es un círculo: mejor la
    // transformación de siempre que convertirlo en otra cosa sin avisar
    if (Math.abs(kx - ky) > 1e-6) return false;
    set("cx", ax + (snap.cx - ax) * kx); set("cy", ay + (snap.cy - ay) * ky);
    set("r", Math.abs(snap.r * kx));
    return true;
  }
  if (snap.tipo === "line") {
    set("x1", ax + (snap.x1 - ax) * kx); set("y1", ay + (snap.y1 - ay) * ky);
    set("x2", ax + (snap.x2 - ax) * kx); set("y2", ay + (snap.y2 - ay) * ky);
    return true;
  }
  if (snap.tipo === "puntos") {
    if (snap.pts.length < 4 || snap.pts.some(v => !isFinite(v))) return false;
    const salida = snap.pts.slice();
    for (let i = 0; i + 1 < salida.length; i += 2) {
      salida[i] = ax + (salida[i] - ax) * kx;
      salida[i + 1] = ay + (salida[i + 1] - ay) * ky;
    }
    el.setAttribute("points", salida.map(v => Math.round(v * 100) / 100).join(" "));
    return true;
  }
  if (snap.tipo === "path") {
    const d = dzEscalaPathD(snap.d, kx, ky, ax, ay);
    if (!d) return false;
    el.setAttribute("d", d);
    return true;
  }
  if (snap.tipo === "pincel") {
    const d = dzEscalaPathD(snap.d, kx, ky, ax, ay);
    if (!d || typeof dzFormaPincelRender !== "function") return false;
    el.setAttribute("data-d", d);
    // se vuelve a entintar con el MISMO `data-grosor`: por eso el contorno sale
    // igual de grueso en todos los lados, por construcción y no por compensación
    dzFormaPincelRender(el);
    return true;
  }
  return false;
}

/* ── LA FLECHA DEL TIRADOR GIRA CON LA FORMA ─────────────────────────────
   Reportado por Mauro: «hay un error ahí en la flecha de dirección de la
   edición: se muestra en vertical en un movimiento horizontal, y la otra lo
   opuesto; supongo que se dio al girar la forma».

   Tenía razón y es exactamente eso. La caja de selección gira con un
   `transform: rotate(...)`, así que los tiradores se ven girados — pero el
   cursor de cada uno está escrito en el CSS (`.dz-sh.n { cursor: ns-resize }`)
   y ésos NO giran. Con la forma a 90°, el tirador que estira a lo ancho mostraba
   la flecha vertical: la flecha decía una cosa y el arrastre hacía otra.

   Ahora el cursor sale de la dirección REAL del tirador en pantalla: su ángulo
   propio más el de la forma, redondeado a los cuatro cursores que existen. */

/** El cursor que corresponde a una dirección en pantalla, en grados. */
function dzCursorPorAngulo(grados) {
  const g = ((grados % 180) + 180) % 180;        // 0..179: la flecha es simétrica
  if (g < 22.5 || g >= 157.5) return "ew-resize";
  if (g < 67.5) return "nwse-resize";
  if (g < 112.5) return "ns-resize";
  return "nesw-resize";
}

/** Pone en cada tirador de la caja la flecha que de verdad le toca. */
function dzCursoresDeCaja(caja, anguloCaja) {
  if (!caja) return 0;
  let puestos = 0;
  for (const t of caja.querySelectorAll(".dz-sh")) {
    const hx = +t.dataset.hx || 0, hy = +t.dataset.hy || 0;
    if (!hx && !hy) continue;
    const propio = Math.atan2(hy, hx) * 180 / Math.PI;
    t.style.cursor = dzCursorPorAngulo(propio + (anguloCaja || 0));
    puestos++;
  }
  return puestos;
}
