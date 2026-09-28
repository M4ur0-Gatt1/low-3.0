/* LA ZONA DE CÁMARA, MARCADA EN PANTALLA MIENTRAS SE DIBUJA.

   LO QUE PIDIÓ MAURO: «también quiero que marque en la pantalla la zona de la
   cámara».

   Antes el encuadre sólo se veía dentro del MODO cámara, así que mientras
   dibujabas no sabías qué parte de la hoja entra en el plano: te enterabas al
   exportar, que es tarde. En Moho y en OpenToonz el área de cámara está marcada
   todo el tiempo.

   Se puede porque desde v4.38.0 el encuadre sólo agarra el puntero cuando la
   cámara es la herramienta activa: fuera de ese modo es una guía y nada más, no
   se come los trazos.

   @module animation/camara-guia */

const DZ_CAM_GUIA_KEY = "low.camara.guia";

/** ¿Está marcada la zona de cámara? Por defecto SÍ: es una guía, no un cambio
 *  en el dibujo, y no saber qué entra en el plano cuesta más que verla. */
function dzCamGuiaActiva() {
  try { return (typeof dzPrefsStorage === "function" ? dzPrefsStorage() : localStorage)
    .getItem(DZ_CAM_GUIA_KEY) !== "0"; } catch (_) { return true; }
}

function dzCamGuiaAlternar() {
  const nueva = !dzCamGuiaActiva();
  try { (typeof dzPrefsStorage === "function" ? dzPrefsStorage() : localStorage)
    .setItem(DZ_CAM_GUIA_KEY, nueva ? "1" : "0"); } catch (_) { }
  if (typeof dzCamOverlay === "function") dzCamOverlay();
  if (typeof dzSetStatus === "function")
    dzSetStatus(nueva ? "Zona de cámara marcada: lo que queda afuera no entra en el plano"
                      : "Zona de cámara oculta");
  return nueva;
}
