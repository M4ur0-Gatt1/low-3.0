/* EL DIÁLOGO DE EXPORTAR SABE QUÉ ANDA EN ESTA MÁQUINA.

   POR QUE EXISTE. Medido el 3-oct-2026 en la app real, sin ffmpeg instalado
   (la máquina de cualquier chico): el botón PRINCIPAL era «Video MP4», y
   apretarlo dejaba un aviso chico en la barra de estado —«exportar MP4 necesita
   ffmpeg en el PATH»—. El primer intento de sacar la animación fracasaba.

   Ahora, al abrir el diálogo se le pregunta al puente (`export_capacidades`).
   Si MP4 no puede andar: GIF pasa a ser el principal y el primero, MP4 dice
   qué le falta, y apretarlo EXPLICA en un aviso en vez de intentar y fallar.
   Si el puente no contesta, el diálogo queda como siempre.

   «PARA WHATSAPP» (v3.29.2). Mauro mandaba el GIF por WhatsApp y llegaba
   quieto: WhatsApp convierte los GIF por su cuenta o los manda como foto fija
   (el suyo pesaba 5,8 MB por un segundo). Este botón saca un MP4 liviano que
   repite la animación hasta ~6 s, que es lo que WhatsApp reproduce y deja
   mandar «como GIF», en bucle. Lo arma el puente con kind "whatsapp".

   Va aparte y envolviendo `dzExportModal` porque app.js está en su techo de
   líneas. Se carga DESPUÉS de app.js: antes, la función no existe. */
(function (global) {
  "use strict";
  const original = global.dzExportModal;
  if (typeof original !== "function" || original.__capacidades) return;

  const puente = () => { try { return typeof api !== "undefined" && api ? api : null; } catch (_) { return null; } };

  async function ajustar() {
    let cap = null;
    try { const a = puente(); cap = a && typeof a.export_capacidades === "function" ? await a.export_capacidades() : null; }
    catch (_) { cap = null; }
    if (!cap || cap.mp4 !== false) return;                 // sin dato, o MP4 anda: como siempre
    const modal = document.querySelector("#modal");
    const mp4 = modal && modal.querySelector('[data-x="mp4"]');
    const gif = modal && modal.querySelector('[data-x="gif"]');
    if (!mp4 || !gif) return;
    const wa = modal.querySelector('[data-x="whatsapp"]');
    if (wa) wa.remove();                                     // también es un MP4: sin ffmpeg no sale
    mp4.className = "ghost"; gif.className = "primary";
    gif.parentElement.insertBefore(gif, gif.parentElement.firstChild);
    mp4.textContent = "Video MP4 (falta ffmpeg)";
    mp4.title = "Para MP4, LOW necesita el programa ffmpeg en esta computadora. GIF y PNG andan sin nada.";
    mp4.onclick = () => {
      if (typeof global.closeModal === "function") global.closeModal();
      const aviso = "Para exportar en MP4, LOW necesita el programa ffmpeg instalado en esta computadora, y acá no está. " +
        "Mientras tanto, «GIF animado» sale igual de bien para compartir, y «Secuencia PNG» sirve para editarla en otro programa.";
      if (typeof global.dzNotice === "function") global.dzNotice(aviso, "MP4 no disponible");
    };
  }

  /** El botón «Para WhatsApp», al lado de «Video MP4». */
  function botonWhatsapp() {
    const mp4 = document.querySelector('#modal [data-x="mp4"]');
    if (!mp4 || document.querySelector('#modal [data-x="whatsapp"]')) return;
    const b = document.createElement("button");
    b.className = "ghost"; b.dataset.x = "whatsapp";
    b.textContent = "Para WhatsApp";
    b.title = "Video MP4 liviano (720 px) que repite la animación hasta unos 6 segundos: " +
      "WhatsApp lo reproduce y en el celular se puede mandar como GIF, en bucle. " +
      "Un GIF común, WhatsApp suele mandarlo como foto fija.";
    b.onclick = () => {
      if (typeof global.closeModal === "function") global.closeModal();
      if (typeof global.dzDoExport === "function") global.dzDoExport("whatsapp");
    };
    mp4.insertAdjacentElement("afterend", b);
  }

  const envuelta = function () {
    const r = original.apply(this, arguments);
    botonWhatsapp();
    ajustar();
    return r;
  };
  envuelta.__capacidades = true;
  global.dzExportModal = envuelta;
})(window);
