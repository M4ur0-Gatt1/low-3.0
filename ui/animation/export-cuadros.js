/* UN CUADRO EN BLANCO ES UN CUADRO, NO UN CUADRO DE MENOS.

   De donde sale esto. El inventario de capacidades (A01) dejo anotado que la
   exportacion de animacion no tenia NINGUNA prueba. Al escribirla, lo primero
   que aparecio fue que el exportador SALTEABA los cuadros vacios:

       let txt = dzCuadroSvgTexto(f);
       if (!txt) continue;                    // cuadro vacio: se saltea

   Medido con cinco cuadros —contenido en 1, 2, 4 y 5, el 3 vacio— el puente
   recibia CUATRO PNG y la app informaba, contradiciendose sola:

       «Exportado export/prueba (4 PNGs) - 4 cuadros (F1 a F5)»

   Para una animacion eso no es un cuadro de menos: es que todo lo que viene
   despues del hueco SE ADELANTA UN CUADRO. El timing es la materia del oficio
   y se rompia en silencio, al final del trabajo, que es cuando menos se puede
   revisar. Y un cuadro en blanco no es un error: un parpadeo, una entrada
   despues de un tiempo muerto o una pausa sobre nada son cuadros vacios a
   proposito.

   Que se dibuja en el hueco. El papel, no un agujero. Si se emitiera un PNG
   transparente, el MP4 y el GIF lo rellenan con negro segun el codec y el
   hueco aparece como un fogonazo. El papel se toma del lienzo vivo, que es la
   misma fuente que usa el balde para saber cual es el fondo (`dzIsCanvasBackground`):
   si el documento no tiene papel, el cuadro sale transparente, que es lo
   correcto —no hay nada dibujado— y consistente con los demas. */
function dzExportPapelDelLienzo() {
  const svg = document.querySelector("#dzCanvas > svg");
  if (!svg || typeof dzIsCanvasBackground !== "function") return null;
  for (const nodo of svg.children) if (dzIsCanvasBackground(nodo)) return nodo;
  return null;
}

/** El SVG de un cuadro vacio, del tamaño de la escena y con el papel puesto. */
function dzExportCuadroEnBlanco(escena) {
  const w = (escena && escena.width) || 1920, h = (escena && escena.height) || 1080;
  const fondo = dzExportPapelDelLienzo();
  const relleno = fondo ? (fondo.getAttribute("fill") || fondo.style?.fill || "") : "";
  const papel = relleno && relleno !== "none"
    ? `<rect x="0" y="0" width="${w}" height="${h}" fill="${relleno}"/>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" ` +
         `viewBox="0 0 ${w} ${h}">${papel}</svg>`;
}

/** Lo que hay que decir cuando salieron MENOS cuadros de los pedidos.
 *
 *  Los cuadros vacios ya no se pierden, pero quedan dos maneras de perder uno:
 *  que la rasterizacion falle, y —en el camino viejo, el de `DZ.anim`— que el
 *  archivo del cuadro no se pueda leer. En los dos casos la animacion sale mas
 *  corta y corrida. No se puede arreglar desde aca, pero SI se puede dejar de
 *  informar como si hubiera salido bien: antes el aviso decia «4 cuadros (F1 a
 *  F5)» y el que exportaba se enteraba en el montaje. */
function dzExportAvisoFaltantes(hechos, pedidos) {
  const faltan = Math.max(0, pedidos - hechos);
  if (!faltan) return "";
  return ` · ATENCIÓN: faltan ${faltan} de ${pedidos} cuadros, así que la ` +
    `animación sale más corta y lo que sigue al hueco se adelanta`;
}
