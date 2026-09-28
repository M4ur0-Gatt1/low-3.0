/* UN DOCUMENTO NUEVO ES UN ARCHIVO .low, NO UN SVG SUELTO.

   DE DONDE SALE ESTO. Mauro preguntó si ya existían los archivos `.low`. Se
   midió su workspace: **157 dibujos sueltos `diseno_*.svg` —138 de ellos en
   blanco, de 323 bytes— y CERO archivos `.low`**. El formato propio del
   programa no lo estaba usando nadie, y el motivo estaba en el camino:

   `dzDocumentNew()` llamaba a `api.new_design()`, que escribe un
   `disenos/diseno_<fecha>.svg` —un dibujo suelto— y recién después `dzDocInit()`
   armaba la escena EN MEMORIA. La escena (capas, niveles, exposiciones, rig,
   cámara, audio) sólo llegaba al disco si alguien apretaba Guardar y pasaba por
   el diálogo, con lo cual: cada arranque dejaba un SVG vacío tirado, y el
   trabajo de animación no tenía archivo propio hasta que uno se acordara.

   Ahora el documento nace siendo su archivo. `escena_<fecha>.low` se escribe
   antes de mostrar nada, `DZ.doc.path` apunta ahí, y Ctrl+S guarda EN EL LUGAR
   sin preguntar nada.

   POR QUE NO SE ROMPE NADA. Un documento con `DZ.doc` puesto y `DZ.path` en
   null es un estado que LOW ya maneja y ya prueba: es exactamente el que deja
   `dzSceneOpen` al abrir un `.low` existente. Esto llega al mismo estado por el
   otro lado.

   @module animation/escena-nueva */

/** La página en blanco, igual que la que escribía `new_design`: el papel y las
 *  dos capas de arte. Es el CONTENIDO del dibujo 1 —lo de adentro del `<svg>`—,
 *  porque un dibujo de la escena no es un archivo, es la marca que va en la
 *  hoja. */
const DZ_ESCENA_PAGINA =
  '<rect data-low-page="1" x="0" y="0" width="1920" height="1080" fill="#ffffff"/>' +
  '<g data-low-art="colour" aria-label="Color"></g>' +
  '<g data-low-art="line" aria-label="Línea"></g>';

/** Asegura que el lienzo tenga LA HOJA DEL DIBUJO, y que sea la primera.
 *
 *  ESTO ARREGLA UNA PÉRDIDA DE DATOS. Dentro de `#dzCanvas` hay otros `<svg>`
 *  hijos directos —la hoja de rotoscopía, la del esqueleto y la de la malla—
 *  que vienen en el HTML y por lo tanto van ANTES. Todo el editor busca el
 *  dibujo con `querySelector(":scope > svg")`, o sea **el primero**, y hasta
 *  ahora la hoja del dibujo sólo la creaba `openDesign` al abrir un `.svg`.
 *
 *  Medido: abrir un `.low` sin haber abierto antes un `.svg` —que es justo lo
 *  que ofrece la primera pantalla— escribía el dibujo dentro de la hoja de
 *  ROTOSCOPÍA, que está oculta. No se veía nada, y el primer `dzDocCommit()`
 *  leía el lienzo vacío y **escribía ese vacío encima del documento**: el
 *  archivo abierto quedaba en blanco en memoria y un Ctrl+S lo dejaba en blanco
 *  en el disco. Traza: `dzCanvasSet` con 145 caracteres y `ok:true`, y el
 *  `dzDocCommit` siguiente con `dibujoAntes:145` y `lienzo:0`.
 *
 *  La hoja se inserta donde la pone `openDesign` —antes de `#dzHandle`— para
 *  que los dos caminos dejen el lienzo igual.
 */
function dzHojaDeDibujoAsegurar(escena) {
  const cv = document.querySelector("#dzCanvas");
  if (!cv) return null;
  const overlays = ["dzRigOverlay", "dzMocapSheet", "dzMeshOverlay"];
  const primera = cv.querySelector(":scope > svg");
  if (primera && !overlays.includes(primera.id)) return primera;
  const w = (escena && escena.width) || 1920, h = (escena && escena.height) || 1080;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 " + w + " " + h);
  svg.setAttribute("width", w); svg.setAttribute("height", h);
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  cv.insertBefore(svg, document.querySelector("#dzHandle") || cv.firstChild);
  return svg;
}

/** Un documento de animación recién nacido, con su dibujo 1 expuesto.
 *
 *  El dibujo se crea a mano sobre el nivel en vez de con `writeDrawing`, que
 *  deja un paso de historial: un documento nuevo no puede abrir con algo para
 *  deshacer. */
function dzEscenaEnBlanco() {
  const A = window.LOW && window.LOW.animation;
  if (!A || !A.LowDoc) return null;
  const doc = new A.LowDoc();
  doc.scene.setSize(1920, 1080);
  const capa = doc.scene.layers[0];
  const nivel = capa && doc.scene.level(capa.levelId);
  if (!capa || !nivel) return null;
  nivel.addDrawing(1, DZ_ESCENA_PAGINA);
  doc.scene.expose(capa.id, 1, 1);
  doc.frame = 1;
  doc.dirty = false;
  return doc;
}

/** Crea el `.low` en el disco y lo deja abierto y listo para dibujar.
 *
 *  Devuelve false sin tocar nada si el puente no puede escribir: se prefiere no
 *  abrir un documento a abrir uno que no existe en el disco, porque eso es
 *  justo lo que hacía perder el trabajo.
 */
async function dzEscenaNueva() {
  if (typeof api === "undefined" || !api || typeof api.new_scene !== "function") return false;
  const doc = dzEscenaEnBlanco();
  if (!doc) return false;
  const respuesta = await api.new_scene(JSON.stringify(doc.toJSON(), null, 1));
  if (!respuesta || respuesta.error || !respuesta.path) {
    dzSetStatus("No pude crear el documento: " + ((respuesta && respuesta.error) || "el puente no contestó"));
    return false;
  }
  const anterior = dzDocumentTabPrepareNew();
  doc.path = respuesta.path;
  doc.scene.name = String(respuesta.name || "escena").replace(/\.low$/i, "");
  try {
    if (typeof dzWsInit === "function") dzWsInit();   // las pestañas de espacios de trabajo las montaba openDesign
    dzDocUse(doc);
    DZ.path = null;                 // el documento es el .low; no hay svg suelto
    DZ.dirty = false;
    const vista = document.querySelector("#designView");
    if (vista) vista.hidden = false;
    const titulo = document.querySelector("#dzTitle");
    if (titulo) titulo.textContent = doc.scene.name;
    dzDocumentTabRegister(doc.path, doc.scene.name);
    if (typeof dzEnsureAnimationWorkspace === "function") await dzEnsureAnimationWorkspace();
    doc.dirty = false;
    requestAnimationFrame(() => dzFitView());
    dzSetStatus("Documento nuevo · " + respuesta.name + " · Ctrl+S guarda en ese archivo");
    return true;
  } catch (err) {
    if (anterior) await dzDocumentTabActivate(anterior);
    dzSetStatus("No pude abrir el documento nuevo: " + (err.message || err));
    return false;
  }
}
