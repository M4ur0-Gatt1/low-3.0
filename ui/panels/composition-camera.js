/* ══════════════════════════════════════════════════════════════════════════
   LA CÁMARA DENTRO DE COMPOSICIÓN — ESTILO AFTER EFFECTS (3.50)

   Historia corta: la vista CÁMARA (3.4x) pintaba exactamente el cuadro que se
   exporta —`dzCuadroSvgTexto` pasado por `dzCamView`— pero la cámara era 2D:
   arrastrar paneaba y la rueda achicaba el recuadro. Mauro pidió que se
   parezca a la cámara virtual de After Effects. Ahora es esa cámara
   (ui/composition/ae-camera.js) con las herramientas de AE:

     Unificada (C)  izquierdo = órbita · medio o Mayús = track XY ·
                    derecho o Alt = track Z (como la herramienta unificada de AE)
     Órbita         gira alrededor del punto de interés (dos nodos) o gira la
                    cámara sobre sí misma (un nodo)
     Track XY       mueve cámara y punto de interés juntos (paneo)
     Track Z        dolly: avanza o retrocede por el eje de la cámara
     rueda          dolly · Ctrl+rueda cambia la LENTE (zoom), sin mover la cámara
     C              alterna herramientas

   «Ajustes de cámara» es el diálogo de AE: tipo (uno o dos nodos), presets de
   lente 15–200 mm, zoom ⇄ distancia focal ⇄ ángulo de visión, posición, punto
   de interés, orientación y profundidad de campo (enfoque, apertura, nivel de
   desenfoque), con «Enfocar a la capa elegida» y «Mirar a la capa elegida».

   Lo que se ve sigue siendo el cuadro que se exporta: si acá se ve mal, sale
   mal. En Perspectiva/Frente/Arriba la cámara aparece en la mesa con su punto
   de interés, como en las vistas personalizadas de AE.

     Auto-key       al soltar un gesto o confirmar un campo deja clave
   Sin Auto-key la cámara se mueve para MIRAR y no se guarda nada.

   Vive en su propio archivo porque app.js no puede crecer (§12 AHORA·7).
   ══════════════════════════════════════════════════════════════════════════ */

/** Cámara con la que se está mirando en esta pantalla. Arranca en la del
 *  cuadro actual y queda suelta mientras uno la mueve sin Auto-key. */
let DZ_CMP_CAM = null;
/** Herramienta de cámara activa: unificada · orbita · trackxy · trackz. */
let DZ_CMP_HERR = "unificada";
const DZ_CMP_HERRAMIENTAS = [
  ["unificada", "Unificada", "Izquierdo: órbita · medio o Mayús: track XY · derecho o Alt: track Z (C alterna)"],
  ["orbita", "Órbita", "Gira la cámara alrededor de su punto de interés"],
  ["trackxy", "Track XY", "Mueve cámara y punto de interés juntos sobre la imagen"],
  ["trackz", "Track Z", "Dolly: avanza o retrocede por el eje de la cámara"],
];

const dzCmpAE = () => (window.LOW && LOW.composition && LOW.composition.aeCamera) || null;

function dzCmpCamActual() {
  if (DZ_CMP_CAM) return { ...DZ_CMP_CAM };
  return dzCamAt(dzCamFrame());
}

/** La cámara actual como cámara AE (convierte una clave 2D sin cambiar el cuadro). */
function dzCmpCamAE() {
  const ae = dzCmpAE();
  return ae ? ae.comoAE(dzCmpCamActual(), dzVB()) : dzCmpCamActual();
}

function dzCmpCamHay() {
  const raiz = document.getElementById("dzComposition3D");
  return !!raiz && !raiz.hidden && !!DZ_COMPOSITION_VIEW && DZ_COMPOSITION_VIEW.view === "camera";
}

/** Pinta en el escenario el cuadro compuesto tal como sale por la cámara.
 *  Es el mismo camino que la exportación: si acá se ve mal, sale mal. */
function dzCmpCamRender() {
  const raiz = document.getElementById("dzComposition3D");
  if (!raiz || raiz.hidden) return false;
  dzCmpCamGizmo();
  const lienzo = raiz.querySelector(".cmp3-camview");
  if (!lienzo) return false;
  if (!DZ.doc) { lienzo.innerHTML = ""; return false; }
  dzDocCommit();
  const cam = dzCmpCamActual();
  const texto = dzCuadroSvgTexto(DZ.doc.frame) || "";
  lienzo.innerHTML = texto ? dzCamView(texto, cam) : "";
  const info = raiz.querySelector(".cmp3-caminfo");
  if (info) {
    const claves = Object.keys(dzCamKeys() || {}).length;
    const zs = dzCompositionViewPlanes().map((p) => Math.round(p.transform?.z || 0));
    const planos = zs.length > 1 && zs.some((z) => z !== zs[0]);
    const ae = dzCmpAE(), vb = dzVB();
    let lente = "cámara 2D";
    if (ae && cam.ae) {
      lente = (cam.type === "one" ? "cámara de un nodo" : "cámara de dos nodos") + " · " +
        Math.round(ae.focalDeZoom(cam.zoom, vb[2])) + " mm · " + ae.anguloDeZoom(cam.zoom, vb[2]).toFixed(1) + "°" +
        (cam.dof ? " · prof. de campo" : "");
    }
    info.textContent = "Cuadro " + DZ.doc.frame + " · " + lente + " · " +
      (claves ? claves + " clave(s) de cámara" : "sin claves de cámara") +
      " · " + (planos ? "planos en distinta profundidad: orbitá o hacé track para ver el paralaje"
        : "todos los planos a la misma profundidad: usá Escalonar Z para ver el paralaje");
  }
  dzCmpCamPanel();
  return true;
}

/** Pone la cámara suelta y repinta. */
function dzCmpCamPoner(cam) {
  DZ_CMP_CAM = { ...cam };
  dzCmpCamRender();
}

/** Unidades de la hoja por píxel de pantalla en el visor de cámara. */
function dzCmpCamEscala() {
  const raiz = document.getElementById("dzComposition3D");
  const svg = raiz && raiz.querySelector(".cmp3-camview svg");
  const ancho = svg ? svg.getBoundingClientRect().width : 0;
  return dzVB()[2] / Math.max(1, ancho || 1);
}

/** Qué hace este arrastre según la herramienta y el botón (como en AE). */
function dzCmpCamModo(evento) {
  if (DZ_CMP_HERR !== "unificada") return DZ_CMP_HERR;
  if (evento.button === 1 || evento.shiftKey) return "trackxy";
  if (evento.button === 2 || evento.altKey) return "trackz";
  return "orbita";
}

/** Arrastre con la herramienta de cámara. Con Auto-key, al soltar deja clave. */
function dzCmpCamGesto(evento) {
  if (!dzCmpCamHay() || evento.button > 2) return;
  evento.preventDefault();
  const ae = dzCmpAE();
  const vb = dzVB();
  const cam0 = dzCmpCamAE();
  const modo = dzCmpCamModo(evento);
  const escala = dzCmpCamEscala();
  const x0 = evento.clientX, y0 = evento.clientY;
  let movio = false;
  const nombres = { orbita: "Órbita de cámara", trackxy: "Track XY de cámara", trackz: "Track Z de cámara" };

  const mover = (e) => {
    const px = e.clientX - x0, py = e.clientY - y0;
    if (Math.hypot(px, py) > 2) movio = true;
    if (!ae) {   // sin el módulo AE: paneo 2D de siempre
      const k = (cam0.w || vb[2]) / vb[2] * escala;
      DZ_CMP_CAM = { ...cam0, cx: cam0.cx - px * k, cy: cam0.cy - py * k };
    } else if (modo === "orbita") {
      DZ_CMP_CAM = ae.orbitar(cam0, px * 0.4, py * 0.4, vb);
    } else if (modo === "trackxy") {
      DZ_CMP_CAM = ae.trackXY(cam0, px * escala, py * escala, vb);
    } else {
      const dist = Math.max(10, cam0.focus || cam0.zoom);
      DZ_CMP_CAM = ae.trackZ(cam0, -py * dist * 0.004, vb);
    }
    dzCmpCamRender();
  };
  const soltar = () => {
    window.removeEventListener("pointermove", mover);
    window.removeEventListener("pointerup", soltar);
    if (!movio) return;
    if (DZ.compositionAutoKey) dzCmpCamClave(nombres[modo] || "Cámara");
    else dzSetStatus(nombres[modo] + " para mirar · con Auto-key deja clave en el cuadro");
  };
  window.addEventListener("pointermove", mover);
  window.addEventListener("pointerup", soltar);
}

/** Rueda: dolly (track Z). Ctrl+rueda: lente (zoom), sin mover la cámara. */
function dzCmpCamRueda(evento) {
  if (!dzCmpCamHay()) return;
  evento.preventDefault();
  const ae = dzCmpAE(), vb = dzVB();
  const adelante = evento.deltaY < 0;
  let etiqueta;
  if (!ae) {
    const cam = dzCmpCamActual();
    const w = Math.max(vb[2] * 0.05, Math.min(vb[2] * 3, cam.w * (adelante ? 0.9 : 1 / 0.9)));
    DZ_CMP_CAM = { ...cam, w };
    etiqueta = "Dolly de cámara";
  } else {
    const cam = dzCmpCamAE();
    if (evento.ctrlKey) {
      DZ_CMP_CAM = ae.lente(cam, cam.zoom * (adelante ? 1.1 : 1 / 1.1), vb);
      etiqueta = "Lente de cámara";
    } else {
      const dist = Math.max(10, cam.focus || cam.zoom);
      DZ_CMP_CAM = ae.trackZ(cam, (adelante ? 1 : -1) * dist * 0.08, vb);
      etiqueta = "Dolly de cámara";
    }
  }
  dzCmpCamRender();
  // UNA clave por GESTO de rueda, no por muesca (oct-2026, «se me movió la cámara»)
  clearTimeout(dzCmpCamRueda.reloj);
  if (DZ.compositionAutoKey) dzCmpCamRueda.reloj = setTimeout(() => dzCmpCamClave(etiqueta), 350);
  const c = DZ_CMP_CAM;
  dzSetStatus(etiqueta + (ae && c.ae ? ": " + Math.round(ae.focalDeZoom(c.zoom, vb[2])) + " mm · posición Z " + Math.round(c.z)
    : ": " + Math.round(vb[2] / c.w * 100) + "% del ancho de la hoja") + (DZ.compositionAutoKey ? " · auto-key: deja clave al soltar la rueda" : ""));
}

/** Deja clave de cámara en el cuadro actual, en UN paso de historial. */
function dzCmpCamClave(etiqueta) {
  if (!DZ.doc) return false;
  const ae = dzCmpAE();
  let cam = dzCmpCamActual();
  if (ae && cam.ae) cam = ae.redondear(ae.completar(cam, dzVB()));
  const num = dzCamFrame();
  const claves = dzCamKeys();
  const antes = claves[num] ? { ...claves[num] } : null;
  if (antes && antes.ease && !cam.ease) cam.ease = antes.ease;
  if (DZ.history) {
    DZ.history.push({
      label: etiqueta || "Clave de cámara", domain: "camera",
      before: antes, after: { ...cam },
      apply: (_dir, valor) => {
        const c = dzCamKeys();
        if (valor) c[num] = { ...valor }; else delete c[num];
        if (DZ.doc) { DZ.doc.touch(); DZ.doc.emit("camera"); }
        dzCmpCamRender(); dzCamOverlay(); dzTimelineBadges();
      },
    });
  }
  claves[num] = { ...cam };
  DZ.doc.touch(); DZ.doc.emit("camera");
  dzMarkDirty(); dzCamOverlay(); dzTimelineBadges(); dzCmpCamRender();
  dzSetStatus("Clave de cámara en el cuadro " + num + " · " + Object.keys(claves).length + " en total");
  return true;
}

/* ── AJUSTES DE CÁMARA (el diálogo de AE, siempre a mano) ─────────────────── */
const DZ_CMP_CAMPOS = [
  ["Lente", [["zoom", "Zoom (px)", 10], ["focal", "Distancia focal (mm)", 1], ["angulo", "Ángulo de visión (°)", 0.5]]],
  ["Posición", [["x", "X", 10], ["y", "Y", 10], ["z", "Z", 10]]],
  ["Punto de interés", [["poiX", "X", 10], ["poiY", "Y", 10], ["poiZ", "Z", 10]]],
  ["Orientación", [["rx", "X (°)", 1], ["ry", "Y (°)", 1], ["rz", "Z (°)", 1]]],
  ["Profundidad de campo", [["focus", "Distancia de enfoque", 10], ["aperture", "Apertura (px)", 1], ["blurLevel", "Nivel de desenfoque (%)", 5]]],
];

function dzCmpCamValor(cam, campo) {
  const ae = dzCmpAE(), vb = dzVB();
  if (campo === "focal") return ae.focalDeZoom(cam.zoom, vb[2]);
  if (campo === "angulo") return ae.anguloDeZoom(cam.zoom, vb[2]);
  return cam[campo];
}

/** Aplica un campo del panel a la cámara (sin clave). */
function dzCmpCamCampo(campo, valor) {
  const ae = dzCmpAE(), vb = dzVB();
  if (!ae || !Number.isFinite(valor)) return null;
  let cam = dzCmpCamAE();
  if (campo === "zoom") cam = ae.lente(cam, valor, vb);
  else if (campo === "focal") cam = ae.lente(cam, ae.zoomDeFocal(Math.max(1, valor), vb[2]), vb);
  else if (campo === "angulo") cam = ae.lente(cam, ae.zoomDeAngulo(valor, vb[2]), vb);
  else {
    cam = { ...cam, [campo]: valor };
    if (campo === "focus") cam.lockFocus = false;
    cam = ae.completar(cam, vb);
  }
  DZ_CMP_CAM = cam;
  dzCmpCamRender();
  return cam;
}

function dzCmpCamPlanoElegido() {
  const id = DZ_COMPOSITION_VIEW && DZ_COMPOSITION_VIEW.selected;
  return dzCompositionViewPlanes().find((p) => p.id === id) || null;
}

/** «Mirar a la capa elegida» y «Enfocar a la capa elegida», como en AE. */
function dzCmpCamHaciaPlano(que) {
  const ae = dzCmpAE(), vb = dzVB(), plano = dzCmpCamPlanoElegido();
  if (!ae) return false;
  if (!plano) { dzSetStatus("Elegí un plano en la lista para " + (que === "enfocar" ? "enfocarlo" : "mirarlo")); return false; }
  const t = plano.transform || {};
  let cam = dzCmpCamAE();
  if (que === "enfocar") {
    cam = ae.completar({ ...cam, dof: true, lockFocus: false, focus: ae.distanciaA(cam, t.z || 0, vb) }, vb);
  } else {
    cam = ae.mirarA({ ...cam, type: "two" }, [vb[0] + vb[2] / 2 + (t.x || 0), vb[1] + vb[3] / 2 + (t.y || 0),
      (t.z || 0) * ae.unidadZ(vb[2])], vb);
  }
  DZ_CMP_CAM = cam;
  dzCmpCamRender();
  const texto = que === "enfocar" ? "Enfoque en «" + plano.name + "»" : "La cámara mira a «" + plano.name + "»";
  if (DZ.compositionAutoKey) dzCmpCamClave(texto); else dzSetStatus(texto + " · con Auto-key deja clave");
  return true;
}

function dzCmpCamRestablecer() {
  const ae = dzCmpAE(), vb = dzVB();
  DZ_CMP_CAM = ae ? ae.desdeLegacy(dzCamDefault(), vb) : dzCamDefault();
  dzCmpCamRender();
  if (DZ.compositionAutoKey) dzCmpCamClave("Restablecer cámara");
  else dzSetStatus("Cámara restablecida: 50 mm mirando la hoja entera");
}

/** Refresca los valores del panel sin pisar el campo que se está escribiendo. */
function dzCmpCamPanel() {
  const raiz = document.getElementById("dzComposition3D");
  const panel = raiz && raiz.querySelector(".cmp3-camset");
  const ae = dzCmpAE();
  if (!panel || !ae) return;
  const cam = dzCmpCamAE(), vb = dzVB();
  panel.querySelectorAll("input[data-cam]").forEach((input) => {
    if (input === document.activeElement) return;
    const v = dzCmpCamValor(cam, input.dataset.cam);
    input.value = Math.round(v * 10) / 10;
  });
  const tipo = panel.querySelector('[data-camset="tipo"]');
  if (tipo) tipo.value = cam.type === "one" ? "one" : "two";
  const preset = panel.querySelector('[data-camset="preset"]');
  if (preset) {
    const mm = Math.round(ae.focalDeZoom(cam.zoom, vb[2]) * 10) / 10;
    preset.value = ae.PRESETS.includes(mm) ? String(mm) : "";
  }
  const dof = panel.querySelector('[data-camset="dof"]'); if (dof) dof.checked = !!cam.dof;
  const lock = panel.querySelector('[data-camset="lock"]'); if (lock) lock.checked = cam.lockFocus !== false;
  panel.querySelectorAll('[data-campo-poi]').forEach((n) => n.classList.toggle("apagado", cam.type === "one"));
  const barra = raiz.querySelector(".cmp3-camtools");
  if (barra) barra.querySelectorAll("[data-herr]").forEach((b) => b.classList.toggle("active", b.dataset.herr === DZ_CMP_HERR));
}

function dzCmpCamHerramienta(herr) {
  DZ_CMP_HERR = herr;
  dzCmpCamPanel();
  const h = DZ_CMP_HERRAMIENTAS.find((x) => x[0] === herr);
  if (h) dzSetStatus("Cámara · " + h[1] + ": " + h[2]);
}

function dzCmpCamMontarPanel(escenario) {
  const ae = dzCmpAE();
  const barra = document.createElement("div");
  barra.className = "cmp3-camtools";
  barra.innerHTML = DZ_CMP_HERRAMIENTAS.map(([id, nombre, ayuda]) =>
    '<button data-herr="' + id + '" title="' + ayuda + '">' + nombre + "</button>").join("") +
    '<i></i><button data-camaccion="clave" title="Clave de cámara en el cuadro actual">◆ Clave</button>' +
    '<button data-camaccion="reset" title="Volver a la cámara de 50 mm que mira la hoja entera">Restablecer</button>' +
    '<button data-camaccion="ajustes" class="active" title="Mostrar u ocultar los ajustes de cámara">Ajustes</button>';
  barra.onpointerdown = (e) => e.stopPropagation();
  barra.querySelectorAll("[data-herr]").forEach((b) => b.onclick = () => dzCmpCamHerramienta(b.dataset.herr));
  barra.querySelector('[data-camaccion="clave"]').onclick = () => dzCmpCamClave("Clave de cámara");
  barra.querySelector('[data-camaccion="reset"]').onclick = dzCmpCamRestablecer;

  const panel = document.createElement("div");
  panel.className = "cmp3-camset";
  panel.onpointerdown = (e) => e.stopPropagation();
  panel.onwheel = (e) => e.stopPropagation();
  const presets = ae ? ae.PRESETS.map((mm) => '<option value="' + mm + '">' + mm + " mm</option>").join("") : "";
  let html = '<header>Ajustes de cámara</header>' +
    '<label><span>Tipo</span><select data-camset="tipo"><option value="two">Cámara de dos nodos</option>' +
    '<option value="one">Cámara de un nodo</option></select></label>' +
    '<label><span>Preset</span><select data-camset="preset"><option value="">Personalizado</option>' + presets + "</select></label>";
  for (const [titulo, campos] of DZ_CMP_CAMPOS) {
    html += '<h4' + (titulo === "Punto de interés" ? " data-campo-poi" : "") + ">" + titulo + "</h4>";
    if (titulo === "Profundidad de campo") {
      html += '<label class="flag"><span>Activar</span><input type="checkbox" data-camset="dof"></label>' +
        '<label class="flag"><span>Enfoque fijo al punto de interés</span><input type="checkbox" data-camset="lock"></label>';
    }
    for (const [campo, nombre, paso] of campos) {
      html += "<label" + (titulo === "Punto de interés" ? " data-campo-poi" : "") + "><span>" + nombre +
        '</span><input type="number" data-cam="' + campo + '" step="' + paso + '"></label>';
    }
  }
  html += '<div class="botones"><button data-camaccion="mirar" title="El punto de interés pasa al plano elegido">Mirar a la capa elegida</button>' +
    '<button data-camaccion="enfocar" title="La distancia de enfoque pasa al plano elegido y se activa la profundidad de campo">Enfocar a la capa elegida</button></div>';
  panel.innerHTML = html;

  const confirmar = (etiqueta) => { if (DZ.compositionAutoKey) dzCmpCamClave(etiqueta); };
  panel.querySelectorAll("input[data-cam]").forEach((input) => {
    input.oninput = () => {
      const t = String(input.value).trim();
      if (t === "" || t === "-" || t.endsWith(".")) return;
      dzCmpCamCampo(input.dataset.cam, Number(t));
    };
    input.onchange = () => confirmar("Ajuste de cámara");
    input.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); input.blur(); } };
  });
  const vb = () => dzVB();
  panel.querySelector('[data-camset="tipo"]').onchange = (e) => {
    const cam = dzCmpCamAE(), uno = e.target.value === "one";
    let nueva = { ...cam, type: uno ? "one" : "two" };
    if (ae && uno) {
      // de dos nodos a uno: la cámara conserva hacia dónde mira
      // (en un nodo: f = (sen ry, sen rx·cos ry, cos rx·cos ry))
      const f = ae.base(cam).f;
      nueva = { ...nueva, ry: Math.asin(Math.max(-1, Math.min(1, f[0]))) * 180 / Math.PI,
        rx: Math.atan2(f[1], f[2]) * 180 / Math.PI };
    } else if (ae) {
      // de uno a dos: el punto de interés queda delante, a la distancia de enfoque
      const f = ae.base(cam).f, d = Math.max(10, cam.focus || cam.zoom);
      nueva = { ...nueva, rx: 0, ry: 0, poiX: cam.x + f[0] * d, poiY: cam.y + f[1] * d, poiZ: cam.z + f[2] * d };
    }
    DZ_CMP_CAM = ae ? ae.completar(nueva, vb()) : nueva;
    dzCmpCamRender(); confirmar("Tipo de cámara");
  };
  panel.querySelector('[data-camset="preset"]').onchange = (e) => {
    if (!e.target.value || !ae) return;
    DZ_CMP_CAM = ae.lente(dzCmpCamAE(), ae.zoomDeFocal(Number(e.target.value), vb()[2]), vb());
    dzCmpCamRender(); confirmar("Lente de " + e.target.value + " mm");
  };
  panel.querySelector('[data-camset="dof"]').onchange = (e) => {
    DZ_CMP_CAM = ae.completar({ ...dzCmpCamAE(), dof: e.target.checked }, vb());
    dzCmpCamRender(); confirmar(e.target.checked ? "Activar profundidad de campo" : "Apagar profundidad de campo");
  };
  panel.querySelector('[data-camset="lock"]').onchange = (e) => {
    DZ_CMP_CAM = ae.completar({ ...dzCmpCamAE(), lockFocus: e.target.checked }, vb());
    dzCmpCamRender(); confirmar("Enfoque de cámara");
  };
  panel.querySelector('[data-camaccion="mirar"]').onclick = () => dzCmpCamHaciaPlano("mirar");
  panel.querySelector('[data-camaccion="enfocar"]').onclick = () => dzCmpCamHaciaPlano("enfocar");
  barra.querySelector('[data-camaccion="ajustes"]').onclick = (e) => {
    panel.hidden = !panel.hidden; e.currentTarget.classList.toggle("active", !panel.hidden);
  };
  escenario.append(barra, panel);
}

/* ── LA CÁMARA EN LA MESA (vistas Perspectiva/Frente/Arriba) ──────────────── */
function dzCmpCamGizmo() {
  const raiz = document.getElementById("dzComposition3D");
  const mundo = raiz && raiz.querySelector(".cmp3-world");
  const ae = dzCmpAE();
  if (!mundo || !ae || !DZ.doc) return;
  let g = mundo.querySelector(".cmp3-camgizmo");
  if (!g) {
    g = document.createElement("div");
    g.className = "cmp3-camgizmo";
    g.innerHTML = '<div class="cuerpo" title="Cámara de la escena"><b></b><span>Cámara</span></div><div class="poi" title="Punto de interés"></div>';
    mundo.appendChild(g);
  }
  const vb = dzVB(), cam = dzCmpCamAE(), k = ae.unidadZ(vb[2]);
  // la tarjeta de la mesa mide 640 px de ancho por toda la hoja; Z va en unidades de la mesa
  const s = 640 / vb[2], cx = vb[0] + vb[2] / 2, cy = vb[1] + vb[3] / 2;
  const pos = (x, y, z) => "translate3d(" + ((x - cx) * s).toFixed(1) + "px," + ((y - cy) * s).toFixed(1) + "px," + (-(z / k)).toFixed(1) + "px)";
  const f = ae.base(cam).f;
  const yaw = Math.atan2(f[0], f[2]) * 180 / Math.PI, pitch = Math.atan2(-f[1], Math.hypot(f[0], f[2])) * 180 / Math.PI;
  g.querySelector(".cuerpo").style.transform = pos(cam.x, cam.y, cam.z) + " rotateY(" + yaw.toFixed(1) + "deg) rotateX(" + pitch.toFixed(1) + "deg)";
  const poi = g.querySelector(".poi");
  poi.hidden = cam.type === "one";
  poi.style.transform = pos(cam.poiX, cam.poiY, cam.poiZ);
}

/** Monta el visor, las herramientas y el panel de cámara la primera vez. */
function dzCmpCamMontar() {
  const raiz = document.getElementById("dzComposition3D");
  if (!raiz || raiz.dataset.camlisto) return;
  const barra = raiz.querySelector(".cmp3-toolbar");
  const escenario = raiz.querySelector(".cmp3-stage");
  if (!barra || !escenario) return;
  raiz.dataset.camlisto = "1";

  const vista = document.createElement("div");
  vista.className = "cmp3-camview";
  vista.onpointerdown = dzCmpCamGesto;
  vista.oncontextmenu = (e) => e.preventDefault();   // el derecho es track Z, como en AE
  vista.addEventListener("wheel", dzCmpCamRueda, { passive: false });
  const info = document.createElement("div");
  info.className = "cmp3-caminfo";
  escenario.append(vista, info);
  dzCmpCamMontarPanel(escenario);

  // C alterna las herramientas de cámara (la tecla de AE)
  raiz.addEventListener("keydown", (e) => {
    if (!dzCmpCamHay() || e.target.matches?.("input,select,textarea") || e.ctrlKey || e.metaKey) return;
    if (e.key.toLowerCase() !== "c") return;
    e.preventDefault(); e.stopPropagation();
    const i = DZ_CMP_HERRAMIENTAS.findIndex((h) => h[0] === DZ_CMP_HERR);
    dzCmpCamHerramienta(DZ_CMP_HERRAMIENTAS[(i + 1) % DZ_CMP_HERRAMIENTAS.length][0]);
  }, true);

  // la cámara se dibuja en la mesa: se repinta con los planos
  if (DZ_COMPOSITION_VIEW && !DZ_COMPOSITION_VIEW.__conCamara) {
    const original = DZ_COMPOSITION_VIEW.render.bind(DZ_COMPOSITION_VIEW);
    DZ_COMPOSITION_VIEW.render = (...a) => { const r = original(...a); try { dzCmpCamGizmo(); } catch (_) { /* sin escena */ } return r; };
    DZ_COMPOSITION_VIEW.__conCamara = true;
  }

  // El botón va junto a Perspectiva/Frente/Arriba: es otra forma de mirar la
  // misma mesa, no una función aparte.
  const arriba = barra.querySelector('[data-v="top"]');
  if (arriba) {
    const boton = document.createElement("button");
    boton.dataset.v = "camera";
    boton.textContent = "Cámara";
    boton.title = "Mirar por la cámara de la escena (cámara virtual estilo After Effects): exactamente el cuadro que se exporta. " +
      "Arrastrá para orbitar · Mayús/medio track XY · derecho/Alt track Z · rueda dolly · Ctrl+rueda lente · C cambia de herramienta";
    arriba.after(boton);
    boton.onclick = () => DZ_COMPOSITION_VIEW && DZ_COMPOSITION_VIEW.setView("camera");
  }
  dzCmpCamGizmo();
}

window.dzCmpCamMontar = dzCmpCamMontar;
window.dzCmpCamRender = dzCmpCamRender;
window.dzCmpCamHay = dzCmpCamHay;
window.dzCmpCamClave = dzCmpCamClave;
window.dzCmpCamActual = dzCmpCamActual;
window.dzCmpCamAE = dzCmpCamAE;
window.dzCmpCamCampo = dzCmpCamCampo;
window.dzCmpCamHerramienta = dzCmpCamHerramienta;
window.dzCmpCamHaciaPlano = dzCmpCamHaciaPlano;
window.dzCmpCamRestablecer = dzCmpCamRestablecer;
window.dzCmpCamPoner = dzCmpCamPoner;
