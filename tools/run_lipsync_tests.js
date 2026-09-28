/* Lipsync por amplitud. Uso: node tools/run_lipsync_tests.js */
const fs = require("fs"), path = require("path");
global.window = global; global.self = global;
eval(fs.readFileSync(path.join(__dirname, "..", "ui/animation/lipsync.js"), "utf8"));
const A = global.LOW.animation;

let pass = 0, fail = 0;
const ok = (cond, nombre, detalle) => {
  if (cond) { pass++; return; }
  fail++; console.error("FALLA:", nombre, detalle == null ? "" : JSON.stringify(detalle));
};
const BOCAS = ["cerrada", "media", "abierta"];

// 1. Sin material suficiente no inventa nada
{
  ok(A.lipsyncPorAmplitud([], BOCAS).cambios === 0, "sin picos no genera claves");
  ok(A.lipsyncPorAmplitud([0.5, 0.5], ["una"]).cambios === 0,
    "con una sola boca no hay lipsync posible");
  ok(A.lipsyncPorAmplitud([0, 0, 0], BOCAS).cambios === 0,
    "un audio en silencio total no genera claves");
}

// 2. El silencio cierra la boca, siempre
{
  const r = A.lipsyncPorAmplitud([0, 0, 1, 1, 0, 0], BOCAS, { sosten: 1, umbral: 0.08 });
  ok(r.keys[1] === "cerrada", "arranca cerrada en el silencio", r.keys);
  ok(r.keys[3] === "abierta", "abre cuando entra la voz", r.keys);
  ok(r.keys[5] === "cerrada", "y vuelve a cerrar en el silencio final", r.keys);
  ok(r.cuadros === 6, "informa cuántos cuadros recorrió");
}

// 3. Sólo se escribe el CAMBIO, no una clave por cuadro
{
  const r = A.lipsyncPorAmplitud([1, 1, 1, 1, 1, 1], BOCAS, { sosten: 1 });
  ok(r.cambios === 1, "una boca sostenida deja UNA sola clave", r.keys);
  ok(r.keys[1] === "abierta", "la del cuadro donde empieza");
}

// 4. Sostén mínimo: una boca no dura un cuadro
{
  const picos = [1, 0.1, 1, 0.1, 1, 0.1, 1, 0.1];
  const flojo = A.lipsyncPorAmplitud(picos, BOCAS, { sosten: 1, umbral: 0.05 });
  const firme = A.lipsyncPorAmplitud(picos, BOCAS, { sosten: 4, umbral: 0.05 });
  ok(firme.cambios < flojo.cambios,
    "con sostén alto la boca tiembla menos", { flojo: flojo.cambios, firme: firme.cambios });
  const marcos = Object.keys(firme.keys).map(Number).sort((a, b) => a - b);
  const juntos = marcos.every((f, i) => i === 0 || f - marcos[i - 1] >= 4);
  ok(juntos, "y ningún cambio ocurre antes del sostén", marcos);
}

// 5. La escala la manda el tramo, no el archivo entero
{
  // un susurro seguido de un grito: si mandara el máximo global, el susurro
  // no abriría nunca la boca
  const picos = [0.2, 0.2, 0.2, 1, 1, 1];
  const susurro = A.lipsyncPorAmplitud(picos, BOCAS, { desde: 1, hasta: 3, sosten: 1 });
  ok(susurro.keys[1] === "abierta",
    "en un tramo susurrado la boca igual abre", susurro.keys);
  const todo = A.lipsyncPorAmplitud(picos, BOCAS, { sosten: 1 });
  ok(todo.keys[1] !== "abierta",
    "pero medido contra el grito, el susurro no abre igual", todo.keys);
}

// 6. El rango acota lo que se toca
{
  const r = A.lipsyncPorAmplitud([1, 1, 1, 1, 1, 1], BOCAS, { desde: 3, hasta: 5, sosten: 1 });
  const marcos = Object.keys(r.keys).map(Number);
  ok(marcos.every((f) => f >= 3 && f <= 5), "no escribe fuera del rango pedido", marcos);
  ok(r.cuadros === 3, "y cuenta sólo el tramo", r.cuadros);
}

// 7. Más bocas = más matices, pero el silencio sigue siendo la primera
{
  const seis = ["c", "a", "b", "d", "e", "f"];
  const r = A.lipsyncPorAmplitud([0, 0.3, 0.6, 1], seis, { sosten: 1, umbral: 0.08 });
  ok(r.keys[1] === "c", "el silencio usa la primera forma");
  const usadas = new Set(Object.values(r.keys));
  ok(usadas.size >= 3, "y la voz reparte entre varias", [...usadas]);
  ok(!Object.entries(r.keys).some(([f, b]) => +f > 1 && b === "c"),
    "ninguna boca de voz cae en la forma de silencio", r.keys);
}

// 8. Picos desde un buffer: RMS por cuadro, no el pico absoluto
{
  const rate = 48000, fps = 24, n = rate;          // un segundo
  const datos = new Float32Array(n);
  for (let i = 0; i < n; i++) datos[i] = i < rate / 2 ? 0.5 : 0;   // medio segundo con señal
  const buffer = { sampleRate: rate, length: n, numberOfChannels: 1, getChannelData: () => datos };
  const picos = A.lipsyncPicosDeBuffer(buffer, fps);
  ok(picos.length === fps, "un pico por cuadro", picos.length);
  ok(picos[0] > 0.5 && picos[0] <= 1, "la mitad con señal suena", picos[0]);
  ok(picos[fps - 1] === 0, "y la mitad muda queda en cero", picos[fps - 1]);
  ok(A.lipsyncPicosDeBuffer(null, 24).length === 0, "sin buffer no inventa picos");

  // un chasquido de una muestra no debe abrir la boca de par en par
  const clic = new Float32Array(n);
  clic[10] = 1;
  const picoClic = A.lipsyncPicosDeBuffer(
    { sampleRate: rate, length: n, numberOfChannels: 1, getChannelData: () => clic }, fps)[0];
  ok(picoClic < 0.2, "un chasquido aislado no cuenta como voz", picoClic);
}

console.log(`lipsync: ${pass}/${pass + fail}`);
process.exit(fail ? 1 : 0);
