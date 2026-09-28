/* XML para Premiere: la animación y su audio, en sincro.
   Uso: node tools/run_premiere_xml_tests.js */
const fs = require("fs"), path = require("path");
global.window = global; global.self = global;
eval(fs.readFileSync(path.join(__dirname, "..", "ui/animation/premiere-xml.js"), "utf8"));
const A = global.LOW.animation;

let pass = 0, fail = 0;
const ok = (cond, nombre, detalle) => {
  if (cond) { pass++; return; }
  fail++; console.error("FALLA:", nombre, detalle == null ? "" : JSON.stringify(detalle));
};

// 1. Estructura mínima que Premiere necesita
{
  const xml = A.premiereXML({ name: "Prueba", fps: 24, width: 1920, height: 1080,
    frames: ["f_001.png", "f_002.png", "f_003.png"] });
  ok(xml.startsWith('<?xml version="1.0"'), "declara XML");
  ok(xml.includes("<!DOCTYPE xmeml>") && xml.includes('<xmeml version="4">'), "es un xmeml v4");
  ok(xml.includes("<timebase>24</timebase>"), "lleva el fps de la escena");
  ok(xml.includes("<width>1920</width>") && xml.includes("<height>1080</height>"), "y la resolución");
  ok((xml.match(/<clipitem id="cuadro-/g) || []).length === 3, "un clip por cuadro");
  ok(xml.includes("<duration>3</duration>"), "la secuencia dura lo que la animación");
  ok(!xml.includes("<audio>"), "sin audio no inventa una pista de audio");
}

// 2. NTSC: 29.97 se escribe con timebase 30 + ntsc, no con decimales
{
  ok(A.premiereTimebase(24).timebase === 24 && A.premiereTimebase(24).ntsc === false,
    "24 fps es entero y sin ntsc");
  const t = A.premiereTimebase(29.97);
  ok(t.timebase === 30 && t.ntsc === true, "29.97 va como timebase 30 con ntsc", t);
  ok(A.premiereTimebase(23.976).ntsc === true, "23.976 también");
  ok(A.premiereXML({ fps: 29.97, frames: ["a.png"] }).includes("<ntsc>TRUE</ntsc>"),
    "y el XML lo declara");
}

// 3. El audio y su desfase
{
  const conAudio = A.premiereXML({ fps: 24, frames: ["a.png", "b.png"],
    audio: { file: "voz.wav", offsetFrames: 0, durationFrames: 48 } });
  ok(conAudio.includes("<audio>") && conAudio.includes("voz.wav"), "monta la pista de audio");
  ok(conAudio.includes("<start>0</start><end>48</end>"), "sin desfase arranca en el cuadro 0");

  const atrasado = A.premiereXML({ fps: 24, frames: ["a.png"],
    audio: { file: "voz.wav", offsetFrames: 12, durationFrames: 48 } });
  ok(atrasado.includes("<start>12</start><end>60</end>"), "un audio atrasado entra más tarde");
  ok(atrasado.includes("<in>0</in><out>48</out>"), "y se usa entero");

  // adelantado: se recorta la cabeza del audio, NO se corre el video
  const adelantado = A.premiereXML({ fps: 24, frames: ["a.png"],
    audio: { file: "voz.wav", offsetFrames: -10, durationFrames: 48 } });
  ok(adelantado.includes("<start>0</start>"), "un audio adelantado no corre el video");
  ok(adelantado.includes("<in>10</in>"), "se recorta su cabeza", adelantado.match(/<in>\d+<\/in>/g));
  ok(adelantado.includes("<end>38</end>"), "y dura lo que le queda");
}

// 4. Rutas y caracteres que rompen un XML
{
  const xml = A.premiereXML({ name: 'Escena "A" & B', fps: 12,
    frames: ["cuadro 1.png"], audio: { file: "mi audio.wav", durationFrames: 5 } });
  ok(!xml.includes('name>Escena "A" & B<'), "escapa comillas y ampersand del nombre");
  ok(xml.includes("&amp;") && xml.includes("&quot;"), "con entidades XML");
  ok(xml.includes("file://localhost/cuadro%201.png"), "la ruta del cuadro es una URL de archivo",
    (xml.match(/pathurl>[^<]*/g) || [])[0]);
  ok(xml.includes("mi%20audio.wav"), "y la del audio también");
  const barra = String.fromCharCode(92);   // la barra invertida de Windows
  ok(!xml.includes(barra), "sin barras invertidas de Windows en las rutas");
}

// 5. WAV desde un AudioBuffer decodificado
{
  const buffer = { numberOfChannels: 1, length: 4, sampleRate: 48000,
    getChannelData: () => new Float32Array([0, 1, -1, 0.5]) };
  const wav = A.audioBufferAWav(buffer);
  ok(!!wav && wav.byteLength === 44 + 4 * 2, "el WAV mide cabecera + muestras", wav && wav.byteLength);
  const v = new DataView(wav);
  const t = (p, n) => String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(p + i)));
  ok(t(0, 4) === "RIFF" && t(8, 4) === "WAVE" && t(36, 4) === "data", "con cabecera RIFF/WAVE válida");
  ok(v.getUint32(24, true) === 48000, "conserva la frecuencia de muestreo");
  ok(v.getInt16(44 + 2, true) === 0x7FFF, "el pico positivo llega al máximo sin pasarse");
  ok(v.getInt16(44 + 4, true) === -0x8000, "y el negativo tampoco desborda");
  ok(A.audioBufferAWav(null) === null, "sin buffer no inventa un archivo");
}

console.log(`premiere-xml: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
