/* ══════════════════════════════════════════════════════════════════════════
   EL CONTORNO DE UNA FORMA, ENTINTADO CON EL PINCEL

   Pedido de Mauro: «quiero que se le pueda poner un pincel como forma de la
   línea de contorno». Un `stroke` de SVG es una línea de grosor constante y
   sin carácter; un pincel de LOW tiene punta, presión, dureza y textura. Acá
   el contorno de la forma pasa a ser un trazo de pincel de verdad, el mismo
   que sale del lápiz.

   CÓMO QUEDA EN LA HOJA

     <g data-low="forma-pincel" data-d="M…Z" data-relleno="none|#rrggbb"
        data-trazo="#rrggbb" data-pincel="<id>" data-grosor="6">
       <path data-rol="relleno" …/>        ← sólo si hay relleno
       <path data-rol="contorno" …/>       ← lo que devolvió el pincel
     </g>

   DOS DECISIONES, y las dos son para que la deformación libre funcione:

   1. LA GEOMETRÍA SE GUARDA (`data-d`). Los hijos son un RENDER, no el dato.
      Sin guardar la geometría, deformar la forma sería deformar tinta sin
      saber qué figura era, y no se podría volver a entintar ni editar por
      nodos.

   2. EL PINCEL SE GUARDA POR ID Y CON SU GROSOR. Si al re-dibujar se leyera
      el pincel actual, deformar una forma le cambiaría el trazo por el que
      uno tenga elegido en ese momento — el trazo es de la forma, no de la
      barra de herramientas. Por eso `dzBrushFinalElement` aprendió a recibir
      un pincel explícito.

   @module drawing/forma-pincel
   ══════════════════════════════════════════════════════════════════════════ */

(function (global) {
  "use strict";

  const NS = "http://www.w3.org/2000/svg";
  const MARCA = "forma-pincel";

  function dzFormaPincelEs(el) {
    return !!(el && el.tagName && el.tagName.toLowerCase() === "g" &&
      el.getAttribute("data-low") === MARCA);
  }

  function hoja(el) {
    return (el && el.ownerSVGElement) ||
      document.querySelector("#dzCanvas > svg") || null;
  }

  /** Los puntos que se le pasan al pincel, a partir de un `d`.
   *
   *  Un tramo cerrado tiene que volver a su primer punto: `dzPathAPuntos` le
   *  saca el punto repetido porque la `Z` lo cierra sola, pero un trazo de
   *  pincel no tiene `Z` — si no se lo devuelve a mano, al contorno le queda
   *  una muesca abierta justo donde empezó. */
  function muestras(d, svg) {
    if (typeof dzPathAPuntos !== "function") return [];
    const salida = [];
    for (const tramo of dzPathAPuntos(d, svg)) {
      const pts = (tramo.pts || []).slice();
      if (tramo.cerrado && pts.length > 1) pts.push({ x: pts[0].x, y: pts[0].y });
      if (pts.length < 2) continue;
      // presión llena y constante: es un contorno, no un trazo a mano. El
      // tiempo crece para los pinceles que miran la velocidad.
      salida.push(pts.map((q, i) => [q.x, q.y, 1, 0, 0, 0, i * 8]));
    }
    return salida;
  }

  /** Re-dibuja los hijos desde los datos del grupo. Devuelve cuántos tramos
   *  de contorno quedaron puestos. */
  function dzFormaPincelRender(g) {
    if (!dzFormaPincelEs(g)) return 0;
    const svg = hoja(g);
    const d = g.getAttribute("data-d") || "";
    if (!svg || !d) return 0;
    while (g.firstChild) g.removeChild(g.firstChild);
    const relleno = g.getAttribute("data-relleno") || "none";
    if (relleno !== "none") {
      const p = document.createElementNS(NS, "path");
      p.setAttribute("d", d);
      p.setAttribute("fill", relleno);
      p.setAttribute("data-rol", "relleno");
      g.appendChild(p);
    }
    const color = g.getAttribute("data-trazo") || DZ.drawColor || "#F0450E";
    let brush = null;
    try { brush = JSON.parse(g.getAttribute('data-pincel-config') || 'null'); } catch (_) {}
    const opciones = { brush, brushId: g.getAttribute("data-pincel") || "",
      size: +(g.getAttribute("data-grosor") || 0) || undefined };
    let puestos = 0;
    for (const pts of muestras(d, svg)) {
      const hijo = typeof dzBrushFinalElement === "function"
        ? dzBrushFinalElement(pts, color, opciones) : null;
      if (!hijo) continue;
      hijo.setAttribute("data-rol", "contorno");
      g.appendChild(hijo);
      puestos++;
    }
    return puestos;
  }

  /** Cambia la geometría y vuelve a entintar. Es la puerta que usa la
   *  deformación libre. */
  function dzFormaPincelGeometria(g, d) {
    if (!dzFormaPincelEs(g) || !d) return false;
    g.setAttribute("data-d", d);
    return dzFormaPincelRender(g) > 0;
  }

  /** Entinta una forma —o un path— con el pincel actual, en el lugar.
   *  Devuelve el grupo nuevo, o null si no se pudo. */
  function dzFormaPincelAplicar(el) {
    if (!el || dzFormaPincelEs(el)) return null;
    const svg = hoja(el);
    if (!svg || typeof dzFormaAPath !== "function") return null;
    const d = dzFormaAPath(el);
    if (!d) return null;
    const g = document.createElementNS(NS, "g");
    g.setAttribute("data-low", MARCA);
    g.setAttribute("data-d", d);
    // Lo que la forma tenía puesto es lo que se respeta: si el dibujante le
    // había puesto relleno, entintar el contorno no se lo saca.
    const relleno = el.getAttribute("fill");
    g.setAttribute("data-relleno", !relleno || relleno === "none" ? "none" : relleno);
    g.setAttribute("data-trazo", el.getAttribute("stroke") || DZ.drawColor || "#F0450E");
    const grosor = +(el.getAttribute("stroke-width") || 0) || DZ.drawW || 6;
    g.setAttribute("data-grosor", grosor);
    const preset = LOW.drawing.brushes.get(DZ.formaBrushPreset || "") || (typeof dzCurrentBrush === "function" ? dzCurrentBrush() : null);
    if (preset && preset.id) {
      g.setAttribute("data-pincel", preset.id);
      g.setAttribute("data-pincel-config", JSON.stringify(preset));
    }
    for (const attr of el.attributes) {
      if (['id','transform','class'].includes(attr.name) || attr.name.startsWith('data-') && !g.hasAttribute(attr.name))
        g.setAttribute(attr.name, attr.value);
    }
    const corners = dzCornerInfo(el);
    if (corners) {
      g.setAttribute('data-low-rounded-rect', [corners.x,corners.y,corners.w,corners.h].join(' '));
      g.setAttribute('data-low-corners', corners.r.join(' '));
    }
    // El tipo de forma se conserva para que se pueda decir qué era, y para que
    // más adelante se la pueda volver a editar como forma y no como tinta.
    const tipo = el.getAttribute("data-forma") || el.tagName.toLowerCase();
    g.setAttribute("data-forma", tipo);
    if (el.hasAttribute("opacity")) g.setAttribute("opacity", el.getAttribute("opacity"));
    el.replaceWith(g);
    if (!dzFormaPincelRender(g)) {
      // Sin pincel no se deja al dibujante sin nada: vuelve la forma original.
      g.replaceWith(el);
      return null;
    }
    return g;
  }

  /** Entinta lo que esté seleccionado. Un paso de historial. */
  function dzFormaPincelSeleccion() {
    const el = DZ && DZ.sel;
    if (!el) { global.dzSetStatus?.("Elegí una forma para entintarle el contorno"); return false; }
    if (dzFormaPincelEs(el)) {
      global.dzSetStatus?.("Esta forma ya tiene el contorno entintado");
      return false;
    }
    if (typeof dzSnapshot === "function") dzSnapshot();
    const g = dzFormaPincelAplicar(el);
    if (!g) {
      global.dzSetStatus?.("No pude entintar esto: elegí una forma o un trazado");
      return false;
    }
    global.dzSelect?.(g);
    global.dzMarkDirty?.();
    global.dzSetStatus?.("Contorno entintado con el pincel · Ctrl+Z lo devuelve a forma");
    return true;
  }

  global.dzFormaPincelEs = dzFormaPincelEs;
  global.dzFormaPincelRender = dzFormaPincelRender;
  global.dzFormaPincelGeometria = dzFormaPincelGeometria;
  global.dzFormaPincelAplicar = dzFormaPincelAplicar;
  global.dzFormaPincelSeleccion = dzFormaPincelSeleccion;
})(typeof window !== "undefined" ? window : globalThis);
/* Editable outline properties belong to the selected shape. */
function dzFormaPincelEditar(el, changes) {
  if (!dzFormaPincelEs(el) || !el.isConnected || DZ.sel !== el) return false;
  const candidate = el.cloneNode(true);
  if (changes.brushId !== undefined) {
    const brush = LOW.drawing.brushes.get(changes.brushId);
    if (!brush) return false;
    candidate.setAttribute('data-pincel', brush.id);
    candidate.setAttribute('data-pincel-config', JSON.stringify(brush));
  }
  if (changes.size !== undefined) {
    const size = Number(changes.size);
    if (!Number.isFinite(size) || size <= 0 || size > 500) return false;
    candidate.setAttribute('data-grosor', size);
  }
  if (changes.color !== undefined) candidate.setAttribute('data-trazo', changes.color);
  if (changes.fill !== undefined) {
    if (changes.fill !== 'none' && !CSS.supports('color', changes.fill)) return false;
    candidate.setAttribute('data-relleno', changes.fill);
  }
  const attributes = ['data-pincel','data-pincel-config','data-grosor','data-trazo','data-relleno'];
  if (attributes.every(a => candidate.getAttribute(a) === el.getAttribute(a))) return false;
  if (!dzFormaPincelRender(candidate)) return false;
  clearTimeout(DZ_DOC_TIMER);
  dzDocCommit();
  if (!DZ.doc) dzSnapshot();
  for (const a of attributes) {
    const value = candidate.getAttribute(a);
    if (value == null) el.removeAttribute(a); else el.setAttribute(a, value);
  }
  el.replaceChildren(...candidate.childNodes);
  dzDocCommit(); dzMarkDirty(); dzPositionHandle();
  dzSetStatus('Contorno actualizado · la forma conserva su geometría · Ctrl+Z para deshacer');
  return true;
}
function dzFormaPincelInspector(el, panel) {
  if (!dzFormaPincelEs(el)) return;
  // The generic SVG stroke/fill fields do not control the generated outline.
  for (const id of ['dzFill','dzStroke','dzSW']) panel.querySelector('#'+id)?.closest('.dz-field')?.remove();
  const box = document.createElement('section'); box.className = 'dz-shape-appearance';
  box.addEventListener('focusin', e => e.stopPropagation());
  const title = document.createElement('b'); title.textContent = 'Contorno de la forma';
  const help = document.createElement('p'); help.textContent = 'Cambiá el pincel sin volver a dibujar.';
  box.append(title, help);
  const field = (text, input) => {
    const label = document.createElement('label'); label.textContent = text;
    label.appendChild(input); box.appendChild(label); return input;
  };
  const select = document.createElement('select'); select.id = 'dzShapeBrush';
  for (const brush of LOW.drawing.brushes.all()) select.add(new Option(brush.name, brush.id));
  const selected = el.getAttribute('data-pincel');
  if (![...select.options].some(o => o.value === selected)) select.add(new Option('Pincel guardado en la forma', selected));
  select.value = selected;
  select.onchange = () => {if (!dzFormaPincelEditar(el,{brushId:select.value})) select.value=el.getAttribute('data-pincel');};
  field('Pincel',select);
  const size = document.createElement('input'); size.type='number'; size.id='dzShapeBrushSize'; size.min='.1'; size.max='500'; size.step='.5'; size.value=el.getAttribute('data-grosor');
  size.onchange=()=>{dzFormaPincelEditar(el,{size:size.value});size.value=el.getAttribute('data-grosor');};field('Grosor',size);
  const color = document.createElement('input');color.type='color';color.id='dzShapeBrushColor';color.value=dzHex(el.getAttribute('data-trazo'));
  color.onchange=()=>dzFormaPincelEditar(el,{color:color.value});field('Color del contorno',color);
  const fill = document.createElement('input');fill.type='text';fill.id='dzShapeBrushFill';fill.value=el.getAttribute('data-relleno')||'none';
  fill.onchange=()=>{dzFormaPincelEditar(el,{fill:fill.value.trim()});fill.value=el.getAttribute('data-relleno');};field('Relleno (none = sin relleno)',fill);
  panel.prepend(box);
}
