/* Transporte del trabajo remoto. Uso: node tools/run_collab_transport_tests.js
   Socket de mentira: se prueba la conducta ante la red, que es lo que rompe. */
const fs = require("fs"), path = require("path");
global.window = global; global.self = global;
eval(fs.readFileSync(path.join(__dirname, "..", "ui/collaboration/transport.js"), "utf8"));
const C = global.LOW.collaboration;

let pass = 0, fail = 0;
const ok = (cond, nombre, detalle) => {
  if (cond) { pass++; return; }
  fail++; console.error("FALLA:", nombre, detalle === undefined ? "" : JSON.stringify(detalle));
};

// las promesas (bloqueos) se comprueban al final, cuando ya resolvieron
const alFinal = [];

/** Socket de mentira: guarda lo enviado y deja empujar mensajes del servidor. */
class SocketFalso {
  constructor(url) { this.url = url; this.readyState = 0; this.enviados = []; SocketFalso.ultimo = this; }
  send(texto) { this.enviados.push(JSON.parse(texto)); }
  close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  abrir() { this.readyState = 1; if (this.onopen) this.onopen(); }
  recibe(mensaje) { if (this.onmessage) this.onmessage({ data: JSON.stringify(mensaje) }); }
  de(tipo) { return this.enviados.filter((m) => m.t === tipo); }
}

/** Relojes controlados: nada de esperas reales en una suite de pruebas. */
function armar(extra = {}) {
  const timers = [];
  const t = new C.RelayTransport(Object.assign({
    url: "ws://x", room: "proy", actor: { id: "ana", nombre: "Ana" },
    socketFactory: (url) => new SocketFalso(url),
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1].cancelado = true; },
    random: () => 0.5, now: () => 1000,
  }, extra));
  return { t, timers, correrTimer: (i = 0) => { const x = timers[i]; if (x && !x.cancelado) x.fn(); } };
}
function conectado(extra) {
  const a = armar(extra);
  a.t.conectar();
  SocketFalso.ultimo.abrir();
  SocketFalso.ultimo.recibe({ t: "welcome", room: "proy", actorId: "ana", rol: "editor",
    seq: 0, ops: [], actores: [{ id: "ana" }], bloqueos: {}, comentarios: [] });
  a.sock = SocketFalso.ultimo;
  return a;
}

// ── 1. El saludo dice desde dónde viene ────────────────────────────────────
{
  const a = armar();
  a.t.conectar();
  SocketFalso.ultimo.abrir();
  const hello = SocketFalso.ultimo.de("hello")[0];
  ok(hello && hello.room === "proy" && hello.desde === 0, "saluda con sala y punto de partida", hello);
  ok(a.t.estado === "conectando", "hasta la bienvenida no se da por conectado", a.t.estado);
  SocketFalso.ultimo.recibe({ t: "welcome", actorId: "ana", seq: 7, ops: [] });
  ok(a.t.estado === "listo" && a.t.seq === 7, "con la bienvenida queda listo y al día", a.t.seq);
}

// ── 2. Sin red se encola; al volver, sale en orden ─────────────────────────
{
  const a = armar();
  a.t.enviarOp({ id: "ana:1", type: "stroke" });
  a.t.enviarOp({ id: "ana:2", type: "stroke" });
  ok(a.t.cola.length === 2, "sin conexión se encola en vez de perderse", a.t.cola.length);
  a.t.conectar();
  SocketFalso.ultimo.abrir();
  SocketFalso.ultimo.recibe({ t: "welcome", actorId: "ana", seq: 0, ops: [] });
  const ops = SocketFalso.ultimo.de("op");
  ok(ops.length === 2, "al conectar se manda todo lo encolado", ops.length);
  ok(ops[0].op.id === "ana:1" && ops[1].op.id === "ana:2",
    "y EN ORDEN: el trazo 2 después del 1", ops.map((o) => o.op.id));
}

// ── 3. La operación propia no se aplica dos veces ──────────────────────────
{
  const a = conectado();
  const aplicadas = [];
  a.t.on("operacion", (e) => aplicadas.push(e.op.id));
  a.t.enviarOp({ id: "ana:9", type: "stroke" });     // el que llama ya la aplicó
  a.sock.recibe({ t: "op", seq: 1, op: { id: "ana:9", actorId: "ana", type: "stroke" } });
  ok(aplicadas.length === 0, "el eco de lo propio no se vuelve a dibujar", aplicadas);
  ok(a.t.cola.length === 0, "pero sí la confirma y la saca de la cola", a.t.cola);
  ok(a.t.seq === 1, "y avanza el punto de partida", a.t.seq);

  a.sock.recibe({ t: "op", seq: 2, op: { id: "beto:1", actorId: "beto", type: "stroke" } });
  ok(aplicadas.length === 1 && aplicadas[0] === "beto:1", "la ajena sí se aplica", aplicadas);
  a.sock.recibe({ t: "op", seq: 2, op: { id: "beto:1", actorId: "beto", type: "stroke" } });
  ok(aplicadas.length === 1, "y repetida no se aplica de nuevo", aplicadas);
}

// ── 4. Reconexión: espera creciente, con tope y con azar ───────────────────
{
  const a = armar({ random: () => 0.5 });     // 0.5 → factor 1.0, espera limpia
  const esperas = [];
  a.t.on("reintento", (e) => esperas.push(e.espera));
  a.t.conectar();
  for (let i = 0; i < 8; i++) {
    SocketFalso.ultimo.abrir();
    SocketFalso.ultimo.close();
    const pendiente = a.timers[a.timers.length - 1];
    if (pendiente && !pendiente.cancelado) pendiente.fn();
  }
  ok(esperas[0] === 1000 && esperas[1] === 2000 && esperas[2] === 4000,
    "la espera crece: 1s, 2s, 4s", esperas.slice(0, 3));
  ok(esperas[esperas.length - 1] === 30000, "y tiene tope de 30s", esperas);
  ok(esperas.every((e, i) => i === 0 || e >= esperas[i - 1]), "nunca baja", esperas);

  const conAzar = armar({ random: () => 0 });
  const bajas = [];
  conAzar.t.on("reintento", (e) => bajas.push(e.espera));
  conAzar.t.conectar(); SocketFalso.ultimo.abrir(); SocketFalso.ultimo.close();
  ok(bajas[0] === 700, "el azar mueve la espera: diez clientes no vuelven juntos", bajas[0]);
}

// ── 5. Al reconectar pide sólo lo que le falta ─────────────────────────────
{
  const a = conectado();
  a.sock.recibe({ t: "op", seq: 12, op: { id: "beto:5", actorId: "beto" } });
  a.sock.close();
  const pendiente = a.timers[a.timers.length - 1];
  pendiente.fn();
  SocketFalso.ultimo.abrir();
  const hello = SocketFalso.ultimo.de("hello")[0];
  ok(hello.desde === 12, "pide desde donde quedó, no la jornada entera", hello.desde);
}

// ── 6. Clave equivocada: se avisa y NO se reintenta ────────────────────────
{
  const a = armar();
  let denegado = null;
  a.t.on("denegado", (m) => { denegado = m; });
  a.t.conectar();
  SocketFalso.ultimo.abrir();
  SocketFalso.ultimo.recibe({ t: "denegado", motivo: "clave incorrecta" });
  const antes = a.timers.length;
  SocketFalso.ultimo.close();
  ok(denegado && /clave/.test(denegado.motivo), "avisa que lo rechazaron", denegado);
  ok(a.timers.length === antes, "y no se queda golpeando la puerta", a.timers.length - antes);
}

// ── 7. Bloqueos: respuesta con nombre, y sin red se dice que es sin red ────
{
  const a = conectado();
  let resultado = null;
  a.t.bloquear("capa:brazo").then((r) => { resultado = r; });
  const pedido = a.sock.de("lock")[0];
  ok(pedido && pedido.accion === "take", "pide la pieza", pedido);
  a.sock.recibe({ t: "lockResult", recurso: "capa:brazo", ok: false, de: "Beto" });
  alFinal.push(() => ok(resultado && resultado.ok === false && resultado.de === "Beto",
    "y se entera de quién la tiene", resultado));
  a.sock.recibe({ t: "locks", bloqueos: { "capa:brazo": { actorId: "beto", nombre: "Beto" } } });
  ok(a.t.bloqueadaPorOtro("capa:brazo"), "sabe que está tomada por otro");
  a.sock.recibe({ t: "locks", bloqueos: { "capa:brazo": { actorId: "ana", nombre: "Ana" } } });
  ok(!a.t.bloqueadaPorOtro("capa:brazo"), "la propia no cuenta como ajena");

  const sinRed = armar();
  let r2 = null;
  sinRed.t.bloquear("x").then((r) => { r2 = r; });
  alFinal.push(() => ok(r2 && r2.sinRed === true,
    "sin conexión lo dice, no se cuelga esperando", r2));
}

// ── 8. La presencia se descarta si no hay red ──────────────────────────────
{
  const a = armar();
  ok(a.t.presencia({ cuadro: 5 }) === false, "sin red no se encola dónde estaba uno");
  const b = conectado();
  ok(b.t.presencia({ cuadro: 5 }) === true, "con red se manda");
  const p = b.sock.de("presence")[0];
  ok(p.actor.cuadro === 5 && p.actor.id === "ana", "con el cuadro y el actor", p);
}

// ── 9. Comentarios ─────────────────────────────────────────────────────────
{
  const a = conectado();
  const c = a.t.comentar("  la mano cruza tarde  ", 42);
  ok(c && c.texto === "la mano cruza tarde" && c.cuadro === 42, "recorta y numera el comentario", c);
  ok(a.sock.de("comment").length === 1, "y lo manda");
  ok(a.t.comentar("   ", 42) === null, "uno vacío no se manda");
  let llegado = null;
  a.t.on("comentario", (x) => { llegado = x; });
  a.sock.recibe({ t: "comment", comentario: { id: "z", texto: "de otro", nombre: "Beto" } });
  ok(llegado && llegado.nombre === "Beto", "los ajenos avisan", llegado);
  ok(a.t.comentarios.length === 1, "y se guardan", a.t.comentarios.length);
}

// ── 10. Desconectar a mano no reintenta ────────────────────────────────────
{
  const a = conectado();
  const antes = a.timers.length;
  a.t.desconectar();
  ok(a.t.estado === "cortado", "queda cortado", a.t.estado);
  ok(a.timers.length === antes, "y no programa reintento: fue a propósito");
}

// ── 11. Un oyente roto no tumba la sesión ──────────────────────────────────
{
  const a = conectado();
  a.t.on("operacion", () => { throw Error("oyente roto"); });
  let segundo = false;
  a.t.on("operacion", () => { segundo = true; });
  a.sock.recibe({ t: "op", seq: 3, op: { id: "beto:7", actorId: "beto" } });
  ok(segundo, "el resto de los oyentes sigue funcionando");
}

setTimeout(() => {
  alFinal.forEach((f) => f());
  console.log(`collab-transport: ${pass}/${pass + fail}`);
  process.exit(fail ? 1 : 0);
}, 10);
