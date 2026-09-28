/* ══════════════════════════════════════════════════════════════════════════
   COMPOSICIÓN: el puente entre la mesa multiplano y el documento

   Extraído de app.js (§12 AHORA·7) el día que se trabajó en Composición: la
   regla es que nada nuevo entra en app.js, y este trabajo le agregaba líneas.
   Es el mismo código, en el archivo donde pertenece — al lado del modelo
   (ui/composition/), de la vista y de la cámara (ui/panels/composition-camera.js).

   Las funciones siguen siendo GLOBALES a propósito: las llaman los manejadores
   de la interfaz, la tabla de acciones de menú y los recorridos E2E por nombre.
   El namespace es otro cambio y va con su propia prueba.

   Se carga DESPUÉS de app.js: usa DZ, $, dzSelect y compañía en tiempo de
   ejecución, nunca al definirse.
   ══════════════════════════════════════════════════════════════════════════ */

let DZ_COMPOSITION_VIEW = null;
function dzCompositionViewPlanes() {
  const svg = $("#dzCanvas")?.querySelector(":scope > svg");
  return dzCompositionElements(svg).map((el, index) => {
    const ref = dzCompositionPlaneRef(el, index);
    const source = document.createElementNS(SVGNS, "svg");
    source.setAttribute("viewBox", svg.getAttribute("viewBox") || "0 0 1080 1080");
    source.setAttribute("preserveAspectRatio", "xMidYMid meet"); source.appendChild(el.cloneNode(true));
    // "rect · #ffffff" no es el nombre de un plano: si el elemento no tiene
    // identidad propia se numera, que es lo que el artista ve en la mesa.
    const name = el.getAttribute("data-name") || el.id
      || (el.getAttribute("data-low-art") ? dzLayerLabel(el) : "Plano " + (index + 1));
    return { id: ref.id, name, node: source, effects: dzCompValues(el),
      transform: DZ.doc?.scene?.compositionTransformAt?.(ref.id, DZ.doc.frame) || {
        x: 0, y: 0, z: parseFloat(el.getAttribute("data-z")) || 0,
        rotationX: 0, rotationY: 0, rotationZ: 0, scaleX: 1, scaleY: 1 } };
  });
}
function dzCompositionViewRender() {
  const root = $("#dzComposition3D"); if (!root || root.hidden || !LOW.composition?.MultiplaneView) return;
  if (!DZ_COMPOSITION_VIEW) DZ_COMPOSITION_VIEW = new LOW.composition.MultiplaneView(root, {
    autoKey: DZ.compositionAutoKey,
    onExit: () => { dzCompositionViewShow(false); dzSetStatus("Lienzo 2D"); },
    onAutoKey: value => {
      DZ.compositionAutoKey = value; localStorage.setItem("low.composition.autokey", value ? "1" : "0");
      const legacy = $("#dzZAutoKey"); if (legacy) legacy.checked = value;
      dzSetStatus(value ? "Auto-key de composición activo" : "Auto-key de composición desactivado");
    },
    onSelect: id => {
      const planes = dzCompositionViewPlanes(), index = planes.findIndex(p => p.id === id);
      const el = dzCompositionElements($("#dzCanvas")?.querySelector(":scope > svg"))[index]; if (el) dzSelect(el);
    },
    onTransform: (id, patch) => {
      const current = DZ.doc?.scene?.compositionTransformAt?.(id, DZ.doc.frame) || {};
      const plane = DZ.doc?.scene?.compositionPlane?.(id);
      if (DZ.doc?.setCompositionTransform) DZ.doc.setCompositionTransform(id, { ...current, ...patch }, {
        frame: DZ.compositionAutoKey ? DZ.doc.frame : null, source: plane?.source || {}, label: "Transformar plano en escenario 3D" });
      dzCompositionViewRender();
    },
    onEffect: (id, patch) => {
      const el = dzCompositionPlaneElement(id); if (!el) return;
      if (DZ.sel !== el) dzSelect(el);
      dzSnapshot(); dzCompositorApply(patch); dzCompositionViewRender();
    },
    onEffectReset: id => {
      const el = dzCompositionPlaneElement(id); if (!el) return;
      if (DZ.sel !== el) dzSelect(el);
      dzSnapshot();
      ["blur", "bright", "contrast", "saturate", "shadow", "sx", "sy", "sb", "sc"]
        .forEach(k => el.removeAttribute("data-comp-" + k));
      dzCompositorApply(false); dzCompositionViewRender();
      dzSetStatus("Efectos quitados del plano");
    },
    onStagger: () => dzCompositionStagger()
  });
  DZ_COMPOSITION_VIEW.setPlanes(dzCompositionViewPlanes());
}
function dzCompositionViewShow(show) {
  const root = $("#dzComposition3D"); if (!root) return;
  root.hidden = !show; $("#dzZPanel").hidden = true;
  $("#designView")?.classList.toggle("composition-3d", !!show);
  if (show) requestAnimationFrame(() => {
    dzCompositionViewRender();
    if (typeof dzCmpCamMontar === "function") dzCmpCamMontar();
  });
}

/** Lo que hay que hacer cuando el modelo de composición cambia: aplicar las
 *  transformaciones al lienzo y refrescar lo que las muestra. NO reemplaza el
 *  contenido del lienzo ni deselecciona.
 *
 *  Antes esto viajaba por el evento "frame", y el manejador de cuadro sí
 *  reemplaza el lienzo entero desde el documento y llama a dzDeselect(). Medido
 *  en la app real: mover un plano vaciaba la lista de planos y perdía la
 *  selección, así que el cambio SIGUIENTE —tipear la Z, por ejemplo— caía en el
 *  `if (!active) return` de la vista y no hacía absolutamente nada. Se movía X
 *  y después Z ya no respondía. */
function dzCompositionAplicar() {
  dzCompositionApplyToCanvas();
  // La proyección se guarda SIN paso de historial. `data-z` y `data-comp-*`
  // son estado DERIVADO del modelo, que ya registró el cambio con su propia
  // etiqueta; si además dejaran el lienzo distinto de lo guardado, el próximo
  // volcado los registraría como un «Dibujar», y mover un plano terminaba
  // dejando DOS pasos de deshacer para una sola intención.
  if (DZ.doc && typeof dzDocCommit === "function") {
    const historia = DZ.doc.history;
    DZ.doc.setHistory(null); dzDocCommit(); DZ.doc.setHistory(historia);
  }
  if (DZ_COMPOSITION_VIEW) DZ_COMPOSITION_VIEW.setPlanes(dzCompositionViewPlanes());
  if (typeof dzCmpCamRender === "function" && DZ_COMPOSITION_VIEW?.view === "camera") dzCmpCamRender();
  if (typeof dzZPanelRender === "function") dzZPanelRender();
}

function dzCompositionSetExactZ(value) {
  const svg = $("#dzCanvas")?.querySelector(":scope > svg"), kids = dzCompositionElements(svg);
  const index = kids.indexOf(DZ.sel); if (index < 0) return dzSetStatus("Seleccioná un plano para cambiar Z");
  const el = kids[index], z = Math.max(DZ_Z_MIN, Math.min(DZ_Z_MAX, Math.round(Number(value) || 0)));
  const ref = dzCompositionPlaneRef(el, index);
  if (DZ.doc?.setCompositionTransform) {
    const before = DZ.doc.scene.compositionTransformAt(ref.id, DZ.doc.frame) || { z: 0 };
    DZ.doc.setCompositionTransform(ref.id, { ...before, z }, {
      frame: DZ.compositionAutoKey ? DZ.doc.frame : null, source: ref.source,
      label: DZ.compositionAutoKey ? "Crear clave de profundidad" : "Fijar profundidad"
    });
    DZ.dirty = true;
  } else {
    dzSnapshot(); if (z) el.setAttribute("data-z", z); else el.removeAttribute("data-z"); dzMarkDirty();
  }
  dzZPanelRender(); dzBuildLayers();
}

/* ══ CHROME DE ESTUDIO: menubar, barra de estado, opciones de herramienta,
   splitter del inspector y X-sheet — la cara de software en serio ══ */

function dzCompositionElements(svg) {
  return [...(svg?.children || [])].filter((node) => !DZ_SKIP_TAGS.includes(node.tagName.toLowerCase())
    && !(node.classList && (node.classList.contains("dz-onion") || node.classList.contains("dz-penui"))));
}

/** Del id de un plano al elemento del lienzo que lo produce. */
function dzCompositionPlaneElement(id) {
  const kids = dzCompositionElements($("#dzCanvas")?.querySelector(":scope > svg"));
  return kids.find((el, index) => dzCompositionPlaneRef(el, index).id === id) || null;
}
/** Reparte los planos en profundidad, del fondo al frente, en UNA transacción.
    Sin esto la mesa multiplano arrancaba con todo en Z 0: tres planos
    exactamente superpuestos se ven como una sola lámina y la mesa parece
    decorativa. No se hace solo al abrir —mover el trabajo del artista sin que
    lo pida no es ayudar—: es una acción explícita y reversible. */
function dzCompositionStagger() {
  const kids = dzCompositionElements($("#dzCanvas")?.querySelector(":scope > svg"));
  if (kids.length < 2) return dzSetStatus("Hacen falta al menos dos planos para escalonar");
  if (!DZ.doc?.setCompositionTransform) return dzSetStatus("Abrí una animación para componer en profundidad");
  const paso = Math.min(80, Math.floor(DZ_Z_MAX / (kids.length - 1)));
  DZ.doc.history?.begin("Escalonar planos en profundidad");
  kids.forEach((el, index) => {
    const ref = dzCompositionPlaneRef(el, index);
    const actual = DZ.doc.scene.compositionTransformAt(ref.id, DZ.doc.frame) || {};
    // el primer hijo del SVG es el que se pinta más atrás: le toca el Z mayor
    DZ.doc.setCompositionTransform(ref.id, { ...actual, z: (kids.length - 1 - index) * paso }, {
      frame: DZ.compositionAutoKey ? DZ.doc.frame : null, source: ref.source,
      label: "Escalonar planos en profundidad" });
  });
  DZ.doc.history?.commit();
  DZ.dirty = true;
  dzCompositionViewRender();
  dzSetStatus("Planos escalonados cada " + paso + " de profundidad · Ctrl+Z los devuelve");
}
function dzCompositionPlaneRef(el, index) {
  const layerId = DZ.doc?.layerId || "legacy";
  const stable = el?.getAttribute?.("data-comp-plane") || el?.id || `${layerId}:${index}`;
  return { id: stable, source: { layerId, elementId: el?.id || null, childIndex: index } };
}

/** Migra data-z al modelo una vez y proyecta el valor canónico al adaptador DOM. */
function dzCompositionApplyToCanvas() {
  if (!DZ.doc?.scene?.ensureCompositionPlane) return;
  const svg = $("#dzCanvas")?.querySelector(":scope > svg");
  dzCompositionElements(svg).forEach((el, index) => {
    const ref = dzCompositionPlaneRef(el, index);
    let plane = DZ.doc.scene.compositionPlane(ref.id);
    if (!plane) {
      plane = DZ.doc.scene.ensureCompositionPlane(ref.id, ref.source);
      plane.transform.z = parseFloat(el.getAttribute("data-z")) || 0;
    }
    const value = DZ.doc.scene.compositionTransformAt(ref.id, DZ.doc.frame) || plane.transform;
    const z = Math.max(DZ_Z_MIN, Math.min(DZ_Z_MAX, Math.round(value.z || 0)));
    if (z) el.setAttribute("data-z", z); else el.removeAttribute("data-z");
    const attrs = { "data-comp-x": value.x || 0, "data-comp-y": value.y || 0,
      "data-comp-rz": value.rotationZ || 0, "data-comp-sx": value.scaleX ?? 1, "data-comp-sy": value.scaleY ?? 1 };
    Object.entries(attrs).forEach(([name, number]) => Math.abs(number - (name.includes("-s") ? 1 : 0)) > 1e-6
      ? el.setAttribute(name, number) : el.removeAttribute(name));
  });
}
/** Pinta un dibujo del modelo en el lienzo. */


/* ── EFECTOS DE PLANO (el compositor) ──────────────────────────────────────
   Desenfoque, brillo, contraste, saturación y sombra de una pieza. Vive acá y
   no en app.js porque es composición: son los efectos que el inspector de la
   mesa multiplano edita, y se escriben como un `filter:` real en el elemento —
   así el efecto sale también en la exportación, no sólo en pantalla. */

function dzCompValues(el) {
  const n = (key, fallback) => el && el.hasAttribute("data-comp-" + key) ? +el.getAttribute("data-comp-" + key) : fallback;
  return { blur:n("blur",0), bright:n("bright",100), contrast:n("contrast",100), saturate:n("saturate",100),
    shadow:el?.getAttribute("data-comp-shadow") === "1", sx:n("sx",8), sy:n("sy",8), sb:n("sb",8),
    sc:el?.getAttribute("data-comp-sc") || "#000000" };
}
/** `origen`: true = leer el panel clásico · false = releer el elemento ·
    objeto = parche sobre los valores actuales (lo usa la mesa multiplano). */
function dzCompositorApply(origen=true) {
  const el = DZ.sel; if (!el) return;
  if (origen && typeof origen === "object") origen = { ...dzCompValues(el), ...origen };
  const v = origen === true ? { blur:+$("#dzCompBlur").value, bright:+$("#dzCompBright").value,
    contrast:+$("#dzCompContrast").value, saturate:+$("#dzCompSaturate").value,
    shadow:$("#dzCompShadow").checked, sx:+$("#dzCompShadowX").value, sy:+$("#dzCompShadowY").value,
    sb:+$("#dzCompShadowBlur").value, sc:$("#dzCompShadowColor").value }
    : origen === false ? dzCompValues(el) : origen;
  const attrs = { blur:v.blur, bright:v.bright, contrast:v.contrast, saturate:v.saturate,
    shadow:v.shadow?1:0, sx:v.sx, sy:v.sy, sb:v.sb, sc:v.sc };
  Object.entries(attrs).forEach(([k,val]) => el.setAttribute("data-comp-"+k, String(val)));
  const filters = [];
  if (v.blur) filters.push(`blur(${v.blur}px)`);
  if (v.bright !== 100) filters.push(`brightness(${v.bright}%)`);
  if (v.contrast !== 100) filters.push(`contrast(${v.contrast}%)`);
  if (v.saturate !== 100) filters.push(`saturate(${v.saturate}%)`);
  if (v.shadow) filters.push(`drop-shadow(${v.sx}px ${v.sy}px ${v.sb}px ${v.sc})`);
  const st = (el.getAttribute("style") || "").replace(/filter\s*:[^;]+;?/g, "").trim();
  el.setAttribute("style", (st ? st.replace(/;?$/, ";") : "") + (filters.length ? `filter:${filters.join(" ")};` : ""));
  if (!el.getAttribute("style")) el.removeAttribute("style");
  dzMarkDirty(); dzCompositorSync(el);
}
function dzCompositorSync(el) {
  if (!el || !$("#dzCompBlur")) return;
  const v=dzCompValues(el), set=(id,val)=>{$("#"+id).value=val;};
  set("dzCompBlur",v.blur); set("dzCompBright",v.bright); set("dzCompContrast",v.contrast); set("dzCompSaturate",v.saturate);
  $("#dzCompShadow").checked=v.shadow; set("dzCompShadowX",v.sx); set("dzCompShadowY",v.sy); set("dzCompShadowBlur",v.sb); set("dzCompShadowColor",v.sc);
  $("#dzCompBlurVal").textContent=v.blur+" px"; $("#dzCompBrightVal").textContent=v.bright+"%";
  $("#dzCompContrastVal").textContent=v.contrast+"%"; $("#dzCompSaturateVal").textContent=v.saturate+"%";
}
function dzCompositorWire() {
  const ids=["dzCompBlur","dzCompBright","dzCompContrast","dzCompSaturate","dzCompShadow","dzCompShadowX","dzCompShadowY","dzCompShadowBlur","dzCompShadowColor"];
  ids.forEach(id=>{const e=$("#"+id);if(e)e.onchange=()=>{if(!DZ.sel)return dzSetStatus("Seleccioná una capa para componer");dzSnapshot();dzCompositorApply();};});
  $("#dzCompReset").onclick=()=>{if(!DZ.sel)return;dzSnapshot();["blur","bright","contrast","saturate","shadow","sx","sy","sb","sc"].forEach(k=>DZ.sel.removeAttribute("data-comp-"+k));dzCompositorApply(false);};
}

/* F7: mostrar/ocultar el panel de capas y superposiciones (el inspector) */

/* Nombres que la interfaz y los recorridos usan por nombre global. */
window.DZ_Z_MIN = DZ_Z_MIN; window.DZ_Z_MAX = DZ_Z_MAX;
Object.defineProperty(window, "DZ_COMPOSITION_VIEW", {
  get: () => DZ_COMPOSITION_VIEW, set: (v) => { DZ_COMPOSITION_VIEW = v; },
  configurable: true });
window.dzCompositionViewPlanes = dzCompositionViewPlanes;
window.dzCompositionViewRender = dzCompositionViewRender;
window.dzCompositionViewShow = dzCompositionViewShow;
window.dzCompositionSetExactZ = dzCompositionSetExactZ;
window.dzCompositionElements = dzCompositionElements;
window.dzCompositionPlaneElement = dzCompositionPlaneElement;
window.dzCompositionStagger = dzCompositionStagger;
window.dzCompositionPlaneRef = dzCompositionPlaneRef;
window.dzCompositionApplyToCanvas = dzCompositionApplyToCanvas;
window.dzCompValues = dzCompValues;
window.dzCompositorApply = dzCompositorApply;
window.dzCompositorSync = dzCompositorSync;
window.dzCompositorWire = dzCompositorWire;
window.dzCompositionAplicar = dzCompositionAplicar;
