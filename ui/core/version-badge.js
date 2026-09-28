/* ══════════════════════════════════════════════════════════════════════════
   QUÉ VERSIÓN ESTÁS CORRIENDO

   Existe por un episodio concreto y evitable. Se reportó tres veces que un
   panel «no anda nada»; se midió tres veces funcionando; y las dos cosas eran
   ciertas, porque el programa que se estaba probando **no era el que se había
   arreglado**: el proceso abierto había arrancado con el build anterior, y el
   instalador nuevo se había corrido encima sin reiniciar la ventana.

   Nada en la pantalla decía qué versión estaba corriendo, y el log escribía
   «── arranque ──» sin número. Así que no había manera de darse cuenta: ni
   mirando, ni leyendo el log, ni preguntando.

   Dos cosas, entonces:

   1. LA VERSIÓN, A LA VISTA. En la barra de estado de la ventana de dibujo, al
      lado del zoom y del cuadro. Es donde uno ya mira.

   2. EL AVISO DE REINICIO. Si el instalador dejó anotada una versión MÁS NUEVA
      que la que esta ventana trae compilada, se instaló con LOW abierto y lo
      que hay en pantalla es código viejo. Eso se dice fuerte y con el motivo,
      porque es la diferencia entre «no lo arreglaron» y «no lo reiniciaste».

      La primera versión de esto lo adivinaba por la FECHA del ejecutable, y
      estaba mal: el instalador conserva la marca de tiempo del build, que
      corre en UTC, así que en una máquina en UTC−3 el archivo dice estar unas
      tres horas en el futuro y el aviso saltaba en TODOS los arranques. Lo
      reportó Mauro: «aparece un cartel diciendo que se instaló una versión
      nueva con LOW abierto pero no es correcto, y además ya lo cerré y lo
      volví a abrir y el cartel persiste». Criar lobo es peor que no avisar.

   El aviso se puede cerrar, y no vuelve en esa sesión: informa una vez, no
   molesta.

   @module core/version-badge
   ══════════════════════════════════════════════════════════════════════════ */

/** Pinta la versión en la barra de estado de dibujo. Idempotente. */
function dzVersionBadge(version) {
  const barra = document.querySelector("#dzStatusbar");
  if (!barra || !version) return null;
  let chip = barra.querySelector("#sbVersion");
  if (!chip) {
    chip = document.createElement("span");
    chip.id = "sbVersion";
    chip.className = "dz-sb-version";
    // Antes del hint, que es el que se estira y come el resto de la barra.
    barra.insertBefore(chip, barra.querySelector("#sbHint") || null);
  }
  chip.textContent = "v" + version;
  chip.title = "Versión de LOW que está corriendo ahora mismo en esta ventana";
  return chip;
}

/** El aviso de «instalaste con LOW abierto».
 *
 *  `instalada` es la versión que el instalador dejó anotada en el registro;
 *  `corriendo` la que trae esta ventana. Sólo se avisa cuando la instalada es
 *  MÁS NUEVA.
 *
 *  Antes esto se decidía por la fecha del ejecutable, y estaba mal: el
 *  instalador conserva la marca de tiempo del build, que corre en UTC, así que
 *  en una máquina en UTC−3 el archivo dice estar unas tres horas en el futuro y
 *  el aviso saltaba en TODOS los arranques. Medido: mtime 12:47 con el reloj en
 *  10:16. Criar lobo es peor que no avisar, porque entrena a ignorar el único
 *  mensaje que iba a importar. Comparar versiones no depende de ningún reloj. */
function dzAvisoBinarioViejo(instalada, corriendo) {
  const cual = typeof instalada === "string" ? instalada.trim() : "";
  if (!cual) return null;
  if (document.querySelector("#dzAvisoReinicio")) return null;
  const mia = typeof corriendo === "string" && corriendo.trim() ? corriendo.trim() : "";
  const aviso = document.createElement("div");
  aviso.id = "dzAvisoReinicio";
  aviso.className = "dz-aviso-reinicio";
  aviso.setAttribute("role", "status");
  aviso.innerHTML = `<strong>Se instaló LOW ${cual} con el programa abierto.</strong>
    <span>Esta ventana sigue corriendo${mia ? " la " + mia : " la versión anterior"},
    así que los arreglos de la ${cual} no están acá. Cerrá LOW y volvé a abrirlo.</span>
    <button type="button" data-a="cerrar" title="Entendido">Entendido</button>`;
  aviso.querySelector('[data-a="cerrar"]').onclick = () => aviso.remove();
  document.body.appendChild(aviso);
  return aviso;
}

/** Se llama con el estado que devuelve el puente (get_state). */
function dzVersionSync(state) {
  if (!state) return;
  dzVersionBadge(state.version);
  dzAvisoBinarioViejo(state.binario_viejo, state.version);
}

window.dzVersionBadge = dzVersionBadge;
window.dzAvisoBinarioViejo = dzAvisoBinarioViejo;
window.dzVersionSync = dzVersionSync;
