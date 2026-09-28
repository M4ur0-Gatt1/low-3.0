/* ══════════════════════════════════════════════════════════════════════════
   LA CÁMARA DENTRO DE COMPOSICIÓN

   Por qué el módulo se sentía de juguete, dicho con lo medido: el motor era
   real —poner Z escribe `data-z`, se guarda en el dibujo, llega al cuadro y
   `dzCamView` aplica paralaje de verdad— pero en la pantalla de Composición
   **no había cámara**. Sus controles eran 2D, Perspectiva, Frente, Arriba,
   grilla, snap, home, auto-key y Escalonar Z.

   Y el paralaje SÓLO existe cuando la cámara se mueve. Así que uno ordenaba
   los planos en profundidad, no veía ningún cambio, y la pantalla misma
   admitía «la mesa se ve plana». Trabajo sin resultado visible: eso es lo que
   se siente falso, aunque el motor ande.

   Esto agrega la vista CÁMARA. Y no dibuja una aproximación: pinta
   **exactamente el cuadro que se va a exportar** —`dzCuadroSvgTexto` pasado
   por `dzCamView`—, así que lo que se ve acá es lo que sale. Si el paralaje no
   se nota, es porque no está, no porque la vista mienta.

     arrastrar    panea la cámara — el paralaje se ve en el acto
     rueda        dolly (acercar y alejar)
     Auto-key     al soltar, deja clave de cámara en el cuadro actual

   Sin Auto-key la cámara se mueve para MIRAR y no se guarda nada: es el
   equivalente a asomarse por el visor sin tocar la animación.

   Vive en su propio archivo porque app.js no puede crecer (§12 AHORA·7).
   ══════════════════════════════════════════════════════════════════════════ */

/** Cámara con la que se está mirando en esta pantalla. Arranca en la del
 *  cuadro actual y queda suelta mientras uno la mueve sin Auto-key. */
let DZ_CMP_CAM = null;

function dzCmpCamActual() {
  if (DZ_CMP_CAM) return { ...DZ_CMP_CAM };
  return dzCamAt(dzCamFrame());
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
    info.textContent = "Cuadro " + DZ.doc.frame + " · " +
      (claves ? claves + " clave(s) de cámara" : "sin claves de cámara") +
      " · " + (planos ? "planos en distinta profundidad: paneá para ver el paralaje"
        : "todos los planos a la misma profundidad: paneá y se mueven juntos");
  }
  return true;
}

/** Panear con el arrastre y dolly con la rueda. Con Auto-key, al soltar deja
 *  clave; sin Auto-key sólo cambia el punto de vista. */
function dzCmpCamGesto(evento) {
  if (!dzCmpCamHay() || evento.button !== 0) return;
  evento.preventDefault();
  const cam0 = dzCmpCamActual();
  const raiz = document.getElementById("dzComposition3D");
  const caja = raiz.querySelector(".cmp3-camview").getBoundingClientRect();
  const vb = dzVB();
  // Cuánto vale un píxel de pantalla en unidades de la escena: el ancho de la
  // cámara sobre el ancho del recuadro. Sin esto el paneo se siente lento al
  // acercar y rapidísimo al alejar.
  const escala = cam0.w / Math.max(1, caja.width);
  const x0 = evento.clientX, y0 = evento.clientY;
  let movio = false;

  const mover = (e) => {
    const dx = (e.clientX - x0) * escala, dy = (e.clientY - y0) * escala;
    if (Math.hypot(e.clientX - x0, e.clientY - y0) > 2) movio = true;
    DZ_CMP_CAM = { ...cam0, cx: cam0.cx - dx, cy: cam0.cy - dy };
    dzCmpCamRender();
  };
  const soltar = () => {
    window.removeEventListener("pointermove", mover);
    window.removeEventListener("pointerup", soltar);
    if (!movio) return;
    if (DZ.compositionAutoKey) dzCmpCamClave("Paneo de cámara");
    else dzSetStatus("Cámara movida para mirar · con Auto-key deja clave en el cuadro");
  };
  window.addEventListener("pointermove", mover);
  window.addEventListener("pointerup", soltar);
}

function dzCmpCamRueda(evento) {
  if (!dzCmpCamHay()) return;
  evento.preventDefault();
  const cam = dzCmpCamActual(), vb = dzVB();
  const factor = evento.deltaY < 0 ? 0.9 : 1 / 0.9;
  // Tope: no menos de un 5 % del ancho de la hoja ni más de tres hojas.
  const w = Math.max(vb[2] * 0.05, Math.min(vb[2] * 3, cam.w * factor));
  DZ_CMP_CAM = { ...cam, w };
  dzCmpCamRender();
  if (DZ.compositionAutoKey) dzCmpCamClave("Dolly de cámara");
  else dzSetStatus("Dolly: " + Math.round(vb[2] / w * 100) + "% del ancho de la hoja");
}

/** Deja clave de cámara en el cuadro actual, en UN paso de historial. */
function dzCmpCamClave(etiqueta) {
  if (!DZ.doc) return false;
  const cam = dzCmpCamActual(), num = dzCamFrame();
  const claves = dzCamKeys();
  const antes = claves[num] ? { ...claves[num] } : null;
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

/** Monta el recuadro de cámara y su botón la primera vez. */
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
  vista.addEventListener("wheel", dzCmpCamRueda, { passive: false });
  const info = document.createElement("div");
  info.className = "cmp3-caminfo";
  escenario.append(vista, info);

  // El botón va junto a Perspectiva/Frente/Arriba: es otra forma de mirar la
  // misma mesa, no una función aparte.
  const arriba = barra.querySelector('[data-v="top"]');
  if (arriba) {
    const boton = document.createElement("button");
    boton.dataset.v = "camera";
    boton.textContent = "Cámara";
    boton.title = "Mirar por la cámara de la escena: exactamente el cuadro que se exporta. " +
      "Arrastrá para panear y ver el paralaje · rueda para dolly · con Auto-key deja clave";
    arriba.after(boton);
    boton.onclick = () => DZ_COMPOSITION_VIEW && DZ_COMPOSITION_VIEW.setView("camera");
  }
}

window.dzCmpCamMontar = dzCmpCamMontar;
window.dzCmpCamRender = dzCmpCamRender;
window.dzCmpCamHay = dzCmpCamHay;
window.dzCmpCamClave = dzCmpCamClave;
window.dzCmpCamActual = dzCmpCamActual;
