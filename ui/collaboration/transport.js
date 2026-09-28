/* ══════════════════════════════════════════════════════════════════════════
   TRANSPORTE DEL TRABAJO REMOTO

   Habla con el relé (`server/low_relay.py`). Se ocupa de lo que en una sala
   compartida rompe primero: la conexión.

   TRES COSAS QUE TIENEN QUE SALIR BIEN

   1) LO QUE SE DIBUJA SIN RED NO SE PIERDE. Se aplica local en el acto y se
      encola; al reconectar se manda en orden. Un colaborativo que exige red
      para dibujar es peor que trabajar solo.
   2) NO SE APLICA DOS VECES. La operación propia vuelve del servidor con su
      número, igual que las ajenas. Si se aplicara al volver, cada trazo se
      dibujaría dos veces. Se recuerda qué ids ya entraron.
   3) SE VUELVE A INTENTAR CON ESPERA CRECIENTE. Un reintento cada segundo
      contra un servidor caído es un ataque al propio droplet. 1s, 2s, 4s…
      hasta 30, con un pellizco de azar para que diez personas no vuelvan
      todas en el mismo instante.

   El módulo NO toca el DOM ni el documento: recibe operaciones y avisa. Quien
   decide qué hacer con ellas es app.js. Así se prueba entero sin navegador,
   con un socket de mentira.

   @module collaboration/transport
   ══════════════════════════════════════════════════════════════════════════ */
(function (global) {
  "use strict";
  const LOW = global.LOW = global.LOW || {};
  const collaboration = LOW.collaboration = LOW.collaboration || {};

  const ESPERAS = [1000, 2000, 4000, 8000, 15000, 30000];

  class RelayTransport {
    /**
     * @param {object} o
     * @param {string} o.url      ws://host:puerto  (o wss:// detrás de nginx)
     * @param {string} o.room     el proyecto
     * @param {object} o.actor    { id, nombre, color }
     * @param {string} [o.rol]    owner | editor | reviewer | viewer
     * @param {string} [o.token]  clave del relé, si la tiene
     * @param {function} [o.socketFactory]  para poder probar sin red
     */
    constructor(o = {}) {
      if (!o.url || !o.room || !o.actor || !o.actor.id)
        throw Error("faltan url, room o actor");
      this.url = String(o.url);
      this.room = String(o.room);
      this.actor = Object.assign({}, o.actor);
      this.rol = o.rol || "editor";
      this.token = o.token || null;
      this.crearSocket = o.socketFactory || ((url) => new global.WebSocket(url));
      this.now = o.now || (() => Date.now());
      this.timer = o.setTimeout || global.setTimeout.bind(global);
      this.destimer = o.clearTimeout || global.clearTimeout.bind(global);
      this.azar = o.random || Math.random;

      this.sock = null;
      this.estado = "cortado";        // cortado | conectando | listo
      this.seq = 0;                   // hasta dónde estamos al día
      this.cola = [];                 // operaciones sin confirmar
      this.vistas = new Set();        // ids ya aplicados
      this.intentos = 0;
      this.reintento = null;
      this.cerradoAMano = false;
      this.actores = [];
      this.bloqueos = {};
      this.comentarios = [];
      this.pedidosBloqueo = new Map();
      this.oyentes = {};
    }

    // ── avisos ────────────────────────────────────────────────────────────
    on(evento, fn) {
      (this.oyentes[evento] = this.oyentes[evento] || []).push(fn);
      return this;
    }
    _avisar(evento, datos) {
      (this.oyentes[evento] || []).forEach((fn) => {
        try { fn(datos); } catch (e) { /* un oyente roto no corta la sesión */ }
      });
    }

    // ── conexión ──────────────────────────────────────────────────────────
    conectar() {
      if (this.estado !== "cortado") return this;
      this.cerradoAMano = false;
      this.estado = "conectando";
      this._avisar("estado", { estado: this.estado, intentos: this.intentos });
      let sock;
      try { sock = this.crearSocket(this.url); }
      catch (e) { this.estado = "cortado"; return this._programarReintento(); }
      this.sock = sock;
      sock.onopen = () => this._saludar();
      sock.onmessage = (ev) => this._mensaje(ev);
      sock.onclose = () => this._cerrado();
      sock.onerror = () => { /* onclose siempre viene después: se maneja ahí */ };
      return this;
    }

    desconectar() {
      this.cerradoAMano = true;
      if (this.reintento) { this.destimer(this.reintento); this.reintento = null; }
      if (this.sock) { try { this.sock.close(); } catch (e) { /* ya estaba */ } }
      this.sock = null;
      this.estado = "cortado";
      this._avisar("estado", { estado: this.estado, intentos: 0 });
      return this;
    }

    _saludar() {
      // `desde` es lo que evita pedir la jornada entera en cada reconexión
      this._crudo({ t: "hello", room: this.room, actor: this.actor,
                    rol: this.rol, token: this.token, desde: this.seq });
    }

    _cerrado() {
      this.sock = null;
      if (this.estado === "listo" || this.estado === "conectando") {
        this.estado = "cortado";
        this._avisar("estado", { estado: this.estado, intentos: this.intentos });
      }
      if (!this.cerradoAMano) this._programarReintento();
    }

    _programarReintento() {
      if (this.reintento || this.cerradoAMano) return this;
      const base = ESPERAS[Math.min(this.intentos, ESPERAS.length - 1)];
      const espera = Math.round(base * (0.7 + this.azar() * 0.6));
      this.intentos += 1;
      this._avisar("reintento", { espera, intentos: this.intentos });
      this.reintento = this.timer(() => {
        this.reintento = null;
        this.estado = "cortado";
        this.conectar();
      }, espera);
      return this;
    }

    _crudo(mensaje) {
      if (!this.sock || this.sock.readyState !== 1) return false;
      try { this.sock.send(JSON.stringify(mensaje)); return true; }
      catch (e) { return false; }
    }

    // ── mensajes del relé ─────────────────────────────────────────────────
    _mensaje(ev) {
      let m;
      try { m = JSON.parse(typeof ev === "string" ? ev : ev.data); }
      catch (e) { return; }
      switch (m.t) {
        case "welcome": return this._bienvenida(m);
        case "denegado":
          // una clave equivocada no se arregla reintentando: se avisa y se para
          this.cerradoAMano = true;
          this.estado = "cortado";
          return this._avisar("denegado", m);
        case "op": return this._operacion(m);
        case "presence":
          this.actores = m.actores || [];
          return this._avisar("presencia", this.actores);
        case "locks":
          this.bloqueos = m.bloqueos || {};
          return this._avisar("bloqueos", this.bloqueos);
        case "lockResult": return this._resultadoBloqueo(m);
        case "comment":
          this.comentarios.push(m.comentario);
          return this._avisar("comentario", m.comentario);
        case "comments":
          this.comentarios = m.comentarios || [];
          return this._avisar("comentarios", this.comentarios);
        case "rechazado": return this._avisar("rechazado", m);
        case "error": return this._avisar("error", m);
        default: return;
      }
    }

    _bienvenida(m) {
      this.estado = "listo";
      this.intentos = 0;
      this.actorId = m.actorId;
      this.rol = m.rol || this.rol;
      this.actores = m.actores || [];
      this.bloqueos = m.bloqueos || {};
      this.comentarios = m.comentarios || [];
      (m.ops || []).forEach((e) => this._operacion(e));
      // El número lo manda el servidor, no se deduce de lo recibido: si la sala
      // ya venía al día, `ops` llega vacio y sin esto el cliente se quedaria en
      // cero, pidiendo la jornada entera en cada reconexión.
      this.seq = Math.max(this.seq, Number(m.seq) || 0);
      this._avisar("estado", { estado: "listo", intentos: 0 });
      this._avisar("presencia", this.actores);
      this._avisar("bloqueos", this.bloqueos);
      this._avisar("comentarios", this.comentarios);
      this._vaciarCola();
    }

    _operacion(e) {
      const op = e.op || e;
      if (e.seq) this.seq = Math.max(this.seq, e.seq);
      if (!op || !op.id) return;
      const mia = this.cola.some((p) => p.id === op.id);
      if (mia) this.cola = this.cola.filter((p) => p.id !== op.id);   // confirmada
      if (this.vistas.has(op.id)) return;      // ya aplicada: eco propio o repetida
      this.vistas.add(op.id);
      this._avisar("operacion", { op, seq: e.seq || 0, propia: op.actorId === this.actorId });
    }

    _resultadoBloqueo(m) {
      const espera = this.pedidosBloqueo.get(m.recurso);
      if (espera) { this.pedidosBloqueo.delete(m.recurso); espera(m); }
      this._avisar("bloqueo", m);
    }

    _vaciarCola() {
      // en orden: si el trazo 2 llega antes que el 1, el dibujo sale al revés
      const pendientes = this.cola.slice();
      pendientes.forEach((op) => this._crudo({ t: "op", op }));
      if (pendientes.length) this._avisar("cola", { pendientes: pendientes.length });
    }

    // ── lo que usa la aplicación ──────────────────────────────────────────
    /** Manda una operación. Devuelve true si salió, false si quedó encolada.
     *  En los dos casos el que llama YA la aplicó local: acá no se decide eso. */
    enviarOp(op) {
      if (!op || !op.id) return false;
      this.vistas.add(op.id);          // propia: no volver a aplicarla al volver
      this.cola.push(op);
      if (this.estado !== "listo") return false;
      const salio = this._crudo({ t: "op", op });
      return salio;
    }

    /** Dónde está uno: cuadro, herramienta, capa. Se manda seguido, así que
     *  si no hay conexión simplemente se descarta — no tiene sentido encolar
     *  dónde estaba parado alguien hace diez minutos. */
    presencia(datos) {
      if (this.estado !== "listo") return false;
      return this._crudo({ t: "presence", actor: Object.assign({}, this.actor, datos || {}) });
    }

    /** Pide una pieza. Promesa que resuelve a {ok, de}: quien lo pide tiene
     *  que poder decir «la tiene Fulano» en vez de fallar en silencio. */
    bloquear(recurso, ttl) {
      return new Promise((resolve) => {
        if (this.estado !== "listo") return resolve({ recurso, ok: false, sinRed: true });
        this.pedidosBloqueo.set(String(recurso), resolve);
        this._crudo({ t: "lock", recurso: String(recurso), accion: "take", ttl: ttl || 120 });
      });
    }
    soltar(recurso) {
      return this._crudo({ t: "lock", recurso: String(recurso), accion: "drop" });
    }
    /** ¿La tiene otro? Devuelve el bloqueo ajeno, o null si está libre o es propia. */
    bloqueadaPorOtro(recurso) {
      const b = this.bloqueos[String(recurso)];
      return b && b.actorId !== this.actorId ? b : null;
    }

    comentar(texto, cuadro) {
      const limpio = String(texto || "").trim();
      if (!limpio || this.estado !== "listo") return null;
      const c = { id: this.actor.id + ":" + this.now() + ":" + Math.round(this.azar() * 1e6),
                  texto: limpio, cuadro: Number(cuadro) || 0 };
      this._crudo({ t: "comment", comentario: c });
      return c;
    }
    resolverComentario(id, resuelto) {
      return this._crudo({ t: "comment.resolve", id, resuelto: resuelto !== false });
    }
  }

  collaboration.RelayTransport = RelayTransport;
  collaboration.ESPERAS_RECONEXION = ESPERAS;
})(typeof window !== "undefined" ? window : globalThis);
