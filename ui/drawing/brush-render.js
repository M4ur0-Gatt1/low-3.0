/* ══════════════════════════════════════════════════════════════════════════
   EL TRAZO FINAL DEL PINCEL

   Convierte los puntos de un gesto en el elemento SVG que queda en el dibujo,
   usando el motor del preset activo. Las puntas raster se guardan como stamps
   SVG embebidos: siguen siendo portables dentro del archivo.

   Vivía dentro de app.js. Se mudó acá al cerrar BRUSH-02 —«cada parámetro
   visible produce una diferencia medible en el trazo»— porque los tres
   arreglos que ese punto pedía caen todos en esta función.

   LO QUE SE ENCONTRÓ AL MEDIRLO. De los nueve deslizadores del Estudio, en un
   pincel vectorial sólo dos movían la aguja: Tamaño y Suavizado. Y ninguno de
   los dos por el motor: los dos viajan por `DZ.drawW` y `DZ.smooth`, que
   `dzBrushSelect` copia al elegir el pincel.

   La causa: **ocho de los veintidós pinceles incorporados no declaran
   `engine`** —blue-pencil, red-pencil, clean-ink, technical-ink, rough-ink,
   comic-ink, sumi y calligraphy—. Esta función comparaba `brush.engine` contra
   los dos nombres y, al no coincidir ninguno, caía al camino viejo
   (`dzBrushRibbon`), que sólo entiende grosor. El motor entero quedaba sin
   usar, y con él espaciado, presión, inclinación y todo lo demás.

   `normalizeBrush` ya resolvía eso hace tiempo: «lo que no es raster, es
   vector». El defecto era comparar antes de normalizar. Medido con el motor
   declarado, se despiertan tres parámetros más: Espaciado, Presión → tamaño e
   Inclinación.

   @module drawing/brush-render
   ══════════════════════════════════════════════════════════════════════════ */

/** La regla del motor, una sola vez y en un solo lugar: lo que no es raster es
 *  vector. Es la misma que aplica `normalizeBrush` puertas adentro. */
function dzBrushMotor(brush) {
  return brush && brush.engine === "raster" ? "raster" : "vector";
}

/** `opciones` es OPCIONAL y sólo la usa quien necesita un pincel FIJO en vez
 *  del que está elegido ahora: `{ brushId, size }`.
 *
 *  Lo pide el contorno de las formas (`ui/drawing/forma-pincel.js`): una forma
 *  entintada se re-dibuja cuando se la deforma, y si en ese momento se leyera
 *  el pincel actual, deformar cambiaría el trazo por el que uno tenga elegido
 *  en ese momento. El trazo pertenece a la forma, no al estado de la barra. */
function dzBrushRenderElement(points, color, opciones) {
  const fijo = opciones && opciones.brushId
    ? (window.LOW?.drawing?.brushes?.get?.(opciones.brushId) || null) : null;
  const preset = opciones?.brush || fijo || dzCurrentBrush(), engine = window.LOW?.drawing?.brushEngine;
  const grosor = (opciones && opciones.size) || DZ.drawW || 6;
  if (!preset || !engine) return dzBrushRibbon(points, grosor, color);
  const samples = points.map(p => ({ x: p[0], y: p[1], pressure: p[2],
    tiltX: p[3] || 0, tiltY: p[4] || 0, twist: p[5] || 0, time: p[6] || 0 }));
  const fixed = opciones?.fixedWidth ?? (!opciones && !!DZ.anchoFijo);
  const brush = { ...preset, size: grosor, ...(fixed ? {pressureSize:0, tiltSize:0, velocitySize:0} : {}) };
  if (dzBrushMotor(brush) === "raster") {
    const dabs = engine.buildRasterDabs(samples, brush);
    if (!dabs.length) return null;
    // Un trazo largo no puede convertirse en decenas de miles de nodos SVG.
    // Conservamos una muestra uniforme (incluidos ambos extremos) y dejamos el
    // conteo original como diagnóstico. 1600 dabs mantiene detalle a zoom de
    // trabajo sin convertir guardar/undo/colaboración en operaciones pesadas.
    const maxDabs = 1600;
    const renderedDabs = dabs.length <= maxDabs ? dabs : Array.from({ length: maxDabs }, (_, index) =>
      dabs[Math.round(index * (dabs.length - 1) / (maxDabs - 1))]);
    const group = document.createElementNS(SVGNS, "g");
    group.setAttribute("data-low", brush.tipData ? "imported-brush" : "raster-brush"); group.setAttribute("data-brush-id", brush.id);
    group.setAttribute("data-dab-count", renderedDabs.length); group.setAttribute("data-source-dab-count", dabs.length);
    if (brush.tipData) {
      const defs = document.createElementNS(SVGNS, "defs"), filter = document.createElementNS(SVGNS, "filter"), flood = document.createElementNS(SVGNS, "feFlood"), composite = document.createElementNS(SVGNS, "feComposite");
      const filterId = dzUniqueId("brush_color_"), tipId = dzUniqueId("brush_tip_");
      filter.id = filterId; filter.setAttribute("x", "-50%"); filter.setAttribute("y", "-50%"); filter.setAttribute("width", "200%"); filter.setAttribute("height", "200%");
      flood.setAttribute("flood-color", color); flood.setAttribute("result", "brushColor");
      composite.setAttribute("in", "brushColor"); composite.setAttribute("in2", "SourceGraphic"); composite.setAttribute("operator", "in");
      const symbol = document.createElementNS(SVGNS, "symbol"), texture = document.createElementNS(SVGNS, "image");
      symbol.id = tipId; symbol.setAttribute("viewBox", "0 0 1 1"); symbol.setAttribute("preserveAspectRatio", "none");
      texture.setAttribute("href", brush.tipData); texture.setAttribute("width", "1"); texture.setAttribute("height", "1");
      texture.setAttribute("preserveAspectRatio", "none"); symbol.appendChild(texture);
      filter.append(flood, composite); defs.append(filter, symbol); group.appendChild(defs); group.setAttribute("filter", `url(#${filterId})`);
      group.dataset.tipId = tipId;
    }
    // DUREZA. El motor la calculaba y nadie la pintaba: medido, mover Dureza de
    // 0 a 1 daba el trazo idéntico. Un gradiente por dab sería carísimo —hasta
    // 1600 por trazo—, así que va UNO solo, compartido: el borde del sello se
    // desvanece desde donde lo dice la dureza. Con dureza 1 el corte es duro y
    // el gradiente ni se crea, así que un pincel duro no paga nada.
    // Una punta importada se colorea con un filtro sobre su propio mapa de
    // bits: ahí la dureza la trae la imagen y el gradiente no pinta nada.
    const suave = brush.tipData ? null : dzBrushBordeSuave(group, brush, color);
    renderedDabs.forEach((dab, index) => {
      let stamp;
      if (brush.tipData) {
        stamp = document.createElementNS(SVGNS, "use"); stamp.setAttribute("href", `#${group.dataset.tipId}`);
        stamp.setAttribute("x", dab.x - dab.width / 2); stamp.setAttribute("y", dab.y - dab.height / 2);
        stamp.setAttribute("width", dab.width); stamp.setAttribute("height", dab.height);
      } else {
        stamp = document.createElementNS(SVGNS, "ellipse"); stamp.setAttribute("cx", dab.x); stamp.setAttribute("cy", dab.y);
        const grain = /charcoal|chalk|dry|pastel|spray/.test(brush.texture || "") ? .58 + ((index * 37) % 43) / 100 : 1;
        stamp.setAttribute("rx", dab.width * .5 * grain); stamp.setAttribute("ry", dab.height * .5 * grain);
        stamp.setAttribute("fill", suave || color);
      }
      const grainOpacity = /charcoal|chalk|dry|pastel|spray/.test(brush.texture || "") ? .55 + ((index * 29) % 45) / 100 : 1;
      stamp.setAttribute("opacity", Math.max(0, Math.min(1, dab.opacity * grainOpacity)));
      stamp.setAttribute("transform", `rotate(${dab.angle || 0} ${dab.x} ${dab.y})`); group.appendChild(stamp);
    });
    return group;
  }
  const outline = engine.buildVectorOutline(samples, brush);
  if (outline?.path) {
    const path = document.createElementNS(SVGNS, "path"); path.setAttribute("d", outline.path); path.setAttribute("fill", color);
    // OPACIDAD. La cinta salía siempre opaca: el deslizador existía y no hacía
    // nada. Va como `fill-opacity` y no como `opacity` para no pisar la
    // opacidad del elemento, que la usa el papel cebolla y la capa.
    const opacidad = Number(brush.opacity);
    if (Number.isFinite(opacidad) && opacidad < 1) path.setAttribute("fill-opacity", Math.max(0, opacidad).toFixed(3));
    path.setAttribute("data-low", "brush"); path.setAttribute("data-brush-id", brush.id); return path;
  }
  return dzBrushRibbon(points, grosor, color);
}

/** Un único gradiente radial por trazo para la dureza. Devuelve la referencia
 *  `url(#…)` que va como relleno del sello, o null si el pincel es duro y no
 *  hace falta gradiente ninguno. */
function dzBrushBordeSuave(group, brush, color) {
  const dureza = Number(brush.hardness);
  if (!Number.isFinite(dureza) || dureza >= .995) return null;
  const defs = group.querySelector("defs") || group.insertBefore(document.createElementNS(SVGNS, "defs"), group.firstChild);
  const grad = document.createElementNS(SVGNS, "radialGradient");
  grad.id = dzUniqueId("brush_soft_");
  const dentro = document.createElementNS(SVGNS, "stop");
  dentro.setAttribute("offset", Math.max(0, Math.min(.98, dureza)).toFixed(3));
  dentro.setAttribute("stop-color", color); dentro.setAttribute("stop-opacity", "1");
  const borde = document.createElementNS(SVGNS, "stop");
  borde.setAttribute("offset", "1");
  borde.setAttribute("stop-color", color); borde.setAttribute("stop-opacity", "0");
  grad.append(dentro, borde); defs.appendChild(grad);
  return `url(#${grad.id})`;
}

window.dzBrushFinalElement = dzBrushFinalElement;
window.dzBrushMotor = dzBrushMotor;

function dzBrushFinalElement(points, color, options) {
  const result=dzBrushRenderElement(points,color,options);
  if(result && !options) {
    result.setAttribute('data-low-brush-points',JSON.stringify(points));
    result.setAttribute('data-low-brush-config',JSON.stringify(dzCurrentBrush()));
    result.setAttribute('data-low-brush-size',DZ.drawW||6);
    result.setAttribute('data-low-brush-color',color);
    result.setAttribute('data-low-brush-fixed',DZ.anchoFijo?'1':'0');
  }
  return result;
}
