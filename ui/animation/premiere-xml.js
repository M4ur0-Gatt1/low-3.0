/* ══════════════════════════════════════════════════════════════════════════
   XML PARA PREMIERE — la animación y su audio, en sincro, del otro lado

   LOW exporta GIF, secuencia PNG y spritesheet: formatos para MIRAR. Cuando el
   trabajo sigue en montaje hace falta otra cosa —que la animación entre a la
   línea de tiempo del editor con su audio ya calzado— y eso, en el mundo real,
   es un XML de FCP7 (`xmeml`), que es lo que Premiere, Resolve y Final Cut
   importan sin plugins.

   Dos decisiones que evitan el problema clásico de estos exportadores:

   1) Se escribe TODO junto: los cuadros, el audio y el XML en la misma carpeta,
      y el XML referencia por ruta RELATIVA. Así al importar no aparece el
      cartel de «archivo perdido» pidiendo relinkear cuadro por cuadro.
   2) El desfase del audio se expresa en CUADROS, que es como lo guarda LOW, y
      se traduce a la grilla de la secuencia. Un audio adelantado (offset
      negativo) recorta su cabeza en vez de correr el video: el cuadro 1 de la
      animación tiene que seguir siendo el cuadro 1 del montaje.

   El módulo es PURO: recibe datos y devuelve texto. Así se prueba sin navegador
   y sin escribir en disco.

   @module animation/premiere-xml
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const animation = LOW.animation = LOW.animation || {};

  const esc = (t) => String(t == null ? "" : t)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  /** Premiere quiere una URL de archivo, no una ruta de Windows. */
  const urlDe = (nombre) => "file://localhost/" +
    String(nombre).replace(/\\/g, "/").split("/").map(encodeURIComponent).join("/");

  /** El `ntsc` del XML: 23.976, 29.97 y 59.94 se escriben con timebase entero
   *  y la bandera puesta, no con decimales. Escribir 29.97 a secas produce
   *  secuencias que se desfasan un cuadro por minuto. */
  function tiempoBase(fps) {
    const f = +fps || 24;
    const ntsc = [23.976, 29.97, 59.94].some((v) => Math.abs(f - v) < 0.02);
    // El timebase de una tasa NTSC es su entero NOMINAL —29.97 va como 30,
    // 23.976 como 24— y la bandera `ntsc` es la que dice que en realidad corre
    // un pelo más lento. Sumarle uno desfasaba la secuencia entera.
    return { timebase: Math.round(f), ntsc };
  }

  /**
   * Arma el XML de una secuencia con la animación y su audio.
   *
   * @param {object} datos
   *   name        nombre de la secuencia
   *   fps         cuadros por segundo de la escena
   *   width,height  resolución del lienzo
   *   frames      nombres de archivo de los cuadros, en orden
   *   audio       { file, offsetFrames, durationFrames } · opcional
   */
  function premiereXML(datos = {}) {
    const fps = +datos.fps || 24;
    const { timebase, ntsc } = tiempoBase(fps);
    const ancho = Math.max(1, Math.round(+datos.width || 1920));
    const alto = Math.max(1, Math.round(+datos.height || 1080));
    const cuadros = Array.isArray(datos.frames) ? datos.frames.filter(Boolean) : [];
    const total = cuadros.length;
    const nombre = datos.name || "LOW";
    const ratio = `<rate><timebase>${timebase}</timebase><ntsc>${ntsc ? "TRUE" : "FALSE"}</ntsc></rate>`;

    const video = cuadros.map((archivo, i) => `
          <clipitem id="cuadro-${i + 1}">
            <name>${esc(archivo)}</name>
            <duration>1</duration>
            ${ratio}
            <start>${i}</start><end>${i + 1}</end>
            <in>0</in><out>1</out>
            <file id="file-${i + 1}">
              <name>${esc(archivo)}</name>
              <pathurl>${esc(urlDe(archivo))}</pathurl>
              ${ratio}
              <duration>1</duration>
              <media><video><samplecharacteristics><width>${ancho}</width><height>${alto}</height></samplecharacteristics></video></media>
            </file>
          </clipitem>`).join("");

    let audio = "";
    if (datos.audio && datos.audio.file) {
      // offset negativo = el audio va adelantado: se recorta su cabeza en vez
      // de correr el video, para que el cuadro 1 siga siendo el cuadro 1
      const off = Math.round(+datos.audio.offsetFrames || 0);
      const dur = Math.max(1, Math.round(+datos.audio.durationFrames || total || 1));
      const inicio = Math.max(0, off);
      const entrada = Math.max(0, -off);
      const largo = Math.max(1, dur - entrada);
      audio = `
      <audio>
        <track>
          <clipitem id="audio-1">
            <name>${esc(datos.audio.file)}</name>
            <duration>${dur}</duration>
            ${ratio}
            <start>${inicio}</start><end>${inicio + largo}</end>
            <in>${entrada}</in><out>${entrada + largo}</out>
            <file id="file-audio">
              <name>${esc(datos.audio.file)}</name>
              <pathurl>${esc(urlDe(datos.audio.file))}</pathurl>
              ${ratio}
              <duration>${dur}</duration>
              <media><audio><samplecharacteristics><depth>16</depth><samplerate>48000</samplerate></samplecharacteristics><channelcount>2</channelcount></audio></media>
            </file>
          </clipitem>
        </track>
      </audio>`;
    }

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="4">
  <sequence id="${esc(nombre)}">
    <name>${esc(nombre)}</name>
    <duration>${total}</duration>
    ${ratio}
    <media>
      <video>
        <format>
          <samplecharacteristics>
            ${ratio}
            <width>${ancho}</width>
            <height>${alto}</height>
            <pixelaspectratio>square</pixelaspectratio>
          </samplecharacteristics>
        </format>
        <track>${video}
        </track>
      </video>${audio}
    </media>
  </sequence>
</xmeml>
`;
  }

  /** Un AudioBuffer decodificado vuelto WAV PCM 16 bits. Se escribe el audio
   *  al lado del XML para que el montaje no arranque pidiendo relinkear: el
   *  navegador sólo nos da el archivo decodificado, no el original. */
  function bufferAWav(buffer) {
    if (!buffer || !buffer.length) return null;
    const canales = Math.min(2, buffer.numberOfChannels || 1);
    const muestras = buffer.length;
    const rate = buffer.sampleRate || 48000;
    const bytes = 44 + muestras * canales * 2;
    const vista = new DataView(new ArrayBuffer(bytes));
    const texto = (pos, t) => { for (let i = 0; i < t.length; i++) vista.setUint8(pos + i, t.charCodeAt(i)); };
    texto(0, "RIFF"); vista.setUint32(4, bytes - 8, true); texto(8, "WAVE");
    texto(12, "fmt "); vista.setUint32(16, 16, true);
    vista.setUint16(20, 1, true); vista.setUint16(22, canales, true);
    vista.setUint32(24, rate, true); vista.setUint32(28, rate * canales * 2, true);
    vista.setUint16(32, canales * 2, true); vista.setUint16(34, 16, true);
    texto(36, "data"); vista.setUint32(40, muestras * canales * 2, true);
    const pistas = [];
    for (let c = 0; c < canales; c++) pistas.push(buffer.getChannelData(c));
    let pos = 44;
    for (let i = 0; i < muestras; i++)
      for (let c = 0; c < canales; c++) {
        const v = Math.max(-1, Math.min(1, pistas[c][i] || 0));
        vista.setInt16(pos, v < 0 ? v * 0x8000 : v * 0x7FFF, true);
        pos += 2;
      }
    return vista.buffer;
  }

  animation.premiereXML = premiereXML;
  animation.premiereTimebase = tiempoBase;
  animation.audioBufferAWav = bufferAWav;
})(window);
