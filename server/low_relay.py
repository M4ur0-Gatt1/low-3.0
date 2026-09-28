#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
═══════════════════════════════════════════════════════════════════════════════
RELÉ DE TRABAJO REMOTO DE LOW

Un servidor WebSocket para poner en un droplet propio. Reparte entre los que
están abriendo el mismo proyecto: las operaciones de edición, quién está y en
qué cuadro, los bloqueos de piezas y los comentarios sobre el cuadro.

POR QUÉ SIN DEPENDENCIAS. Corre con `python3 low_relay.py` y nada más: no hay
`pip install`, no hay entorno virtual, no hay versión de una biblioteca que se
rompa dentro de un año en un servidor que nadie mira. El protocolo WebSocket
(RFC 6455) es un apretón de manos y un encabezado de trama; está acá abajo
entero y se lee en diez minutos.

QUÉ DECIDE EL SERVIDOR Y QUÉ NO
  - Los BLOQUEOS los decide el servidor, y es lo único que decide. Dos personas
    que piden la misma pieza en el mismo instante no pueden resolverlo entre
    ellas: alguien tiene que ser el árbitro. Sin esto los dos creen que ganaron
    y se pisan el dibujo.
  - Las OPERACIONES no las interpreta: las numera, las guarda y las reparte. El
    servidor no sabe qué es un hueso ni una capa, y no debe saberlo — si supiera,
    habría que actualizarlo cada vez que LOW aprende algo nuevo.
  - El ORDEN lo da el número de secuencia del servidor. El reloj de Lamport del
    cliente ordena lo que todavía no llegó; el servidor ordena lo que ya está.

EL QUE LLEGA TARDE. Cada cliente dice desde qué número viene y recibe lo que se
perdió. Es lo que hace que abrir el proyecto a mitad de jornada no obligue a que
alguien vuelva a guardar y mandar el archivo por chat.

QUÉ NO HACE. No comparte pantalla: eso es video en vivo entre navegadores
(WebRTC), otro problema y otra pieza. Este relé mueve texto.

    python3 low_relay.py --puerto 8787 --datos /var/lib/low-relay
    LOW_RELAY_TOKEN=unaclavelarga python3 low_relay.py     # con clave

═══════════════════════════════════════════════════════════════════════════════
"""
import argparse
import base64
import hashlib
import json
import os
import socket
import socketserver
import struct
import sys
import threading
import time

GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"   # RFC 6455, sección 1.3
OP_TEXTO, OP_BINARIO, OP_CIERRE, OP_PING, OP_PONG = 0x1, 0x2, 0x8, 0x9, 0xA
MAX_TRAMA = 8 * 1024 * 1024        # un dibujo entero cabe; un disparate, no
MAX_OPS = 20000                    # tope del registro por sala
PRESENCIA_VIVA = 20.0              # segundos sin señal y se lo da por ido


def ahora():
    return time.time()


class Sala:
    """El estado compartido de un proyecto. Todo lo que se toca acá pasa por
    `self.cerrojo`: hay un hilo por cliente conectado."""

    def __init__(self, nombre, carpeta=None):
        self.nombre = nombre
        self.carpeta = carpeta
        self.cerrojo = threading.RLock()
        self.clientes = set()
        self.ops = []            # [{seq, op}]
        self.seq = 0
        self.presencia = {}      # actorId -> {id, nombre, color, cuadro, ...}
        self.bloqueos = {}       # recurso -> {actorId, nombre, desde}
        self.comentarios = []    # {id, cuadro, texto, actorId, at, resuelto}
        self._cargar()

    # ── persistencia ────────────────────────────────────────────────────────
    # El registro se guarda en disco porque un relé que se reinicia y pierde la
    # jornada no sirve: el que estaba desconectado vuelve y no tiene con qué
    # ponerse al día. Presencia y bloqueos NO se guardan — son estado de gente
    # conectada, y al arrancar no hay nadie.
    def _archivo(self):
        if not self.carpeta:
            return None
        seguro = "".join(c for c in self.nombre if c.isalnum() or c in "-_.")
        return os.path.join(self.carpeta, (seguro or "sala") + ".json")

    def _cargar(self):
        ruta = self._archivo()
        if not ruta or not os.path.exists(ruta):
            return
        try:
            with open(ruta, "r", encoding="utf-8") as f:
                datos = json.load(f)
            self.ops = datos.get("ops", [])[-MAX_OPS:]
            self.comentarios = datos.get("comentarios", [])
            self.seq = max([e.get("seq", 0) for e in self.ops] or [0])
        except Exception as e:                                  # pragma: no cover
            print("aviso: no se pudo leer el registro de %s: %s" % (self.nombre, e))

    def _guardar(self):
        ruta = self._archivo()
        if not ruta:
            return
        try:
            os.makedirs(os.path.dirname(ruta), exist_ok=True)
            tmp = ruta + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump({"ops": self.ops[-MAX_OPS:], "comentarios": self.comentarios},
                          f, ensure_ascii=False)
            os.replace(tmp, ruta)          # atómico: nunca queda medio escrito
        except Exception as e:                                  # pragma: no cover
            print("aviso: no se pudo guardar el registro de %s: %s" % (self.nombre, e))

    # ── operaciones ─────────────────────────────────────────────────────────
    def agregar_op(self, op):
        with self.cerrojo:
            self.seq += 1
            entrada = {"seq": self.seq, "op": op}
            self.ops.append(entrada)
            if len(self.ops) > MAX_OPS:
                del self.ops[:len(self.ops) - MAX_OPS]
            self._guardar()
            return entrada

    def desde(self, seq):
        with self.cerrojo:
            return [e for e in self.ops if e["seq"] > (seq or 0)]

    # ── bloqueos: acá el servidor es el árbitro ─────────────────────────────
    def tomar(self, recurso, actor, nombre, ttl):
        with self.cerrojo:
            actual = self.bloqueos.get(recurso)
            if actual and actual["actorId"] != actor and actual["hasta"] > ahora():
                return False, actual
            self.bloqueos[recurso] = {"actorId": actor, "nombre": nombre,
                                      "desde": ahora(), "hasta": ahora() + ttl}
            return True, self.bloqueos[recurso]

    def soltar(self, recurso, actor):
        with self.cerrojo:
            actual = self.bloqueos.get(recurso)
            if not actual or actual["actorId"] != actor:
                return False
            del self.bloqueos[recurso]
            return True

    def soltar_todo(self, actor):
        """Se cae la conexión y los bloqueos se sueltan solos. Un bloqueo que
        sobrevive al que lo tomó deja la pieza trabada hasta que alguien entre
        al servidor a mano — el modo más rápido de que el equipo deje de usar
        los bloqueos."""
        with self.cerrojo:
            for r in [r for r, b in self.bloqueos.items() if b["actorId"] == actor]:
                del self.bloqueos[r]

    def bloqueos_vivos(self):
        with self.cerrojo:
            t = ahora()
            for r in [r for r, b in self.bloqueos.items() if b["hasta"] <= t]:
                del self.bloqueos[r]
            return dict(self.bloqueos)

    # ── presencia ───────────────────────────────────────────────────────────
    def ver(self, actor):
        with self.cerrojo:
            if not actor or not actor.get("id"):
                return False
            actor = dict(actor)
            actor["visto"] = ahora()
            self.presencia[str(actor["id"])] = actor
            return True

    def se_fue(self, actorId):
        with self.cerrojo:
            self.presencia.pop(str(actorId), None)

    def presentes(self):
        with self.cerrojo:
            corte = ahora() - PRESENCIA_VIVA
            for k in [k for k, a in self.presencia.items() if a.get("visto", 0) < corte]:
                del self.presencia[k]
            return list(self.presencia.values())

    # ── comentarios ─────────────────────────────────────────────────────────
    def comentar(self, c):
        with self.cerrojo:
            self.comentarios.append(c)
            self._guardar()
            return c

    def resolver(self, cid, resuelto=True):
        with self.cerrojo:
            for c in self.comentarios:
                if c.get("id") == cid:
                    c["resuelto"] = bool(resuelto)
                    self._guardar()
                    return True
            return False


class Relé:
    def __init__(self, carpeta=None, token=None):
        self.salas = {}
        self.carpeta = carpeta
        self.token = token
        self.cerrojo = threading.RLock()
        self.arrancado = ahora()

    def sala(self, nombre):
        with self.cerrojo:
            if nombre not in self.salas:
                self.salas[nombre] = Sala(nombre, self.carpeta)
            return self.salas[nombre]

    def salud(self):
        with self.cerrojo:
            return {"ok": True, "version": 1, "arriba": round(ahora() - self.arrancado),
                    "salas": {n: {"clientes": len(s.clientes), "seq": s.seq,
                                  "presentes": len(s.presentes())}
                              for n, s in self.salas.items()}}


# ═══ WebSocket: apretón de manos y tramas (RFC 6455) ═══════════════════════

def aceptar_clave(clave):
    return base64.b64encode(hashlib.sha1((clave + GUID).encode()).digest()).decode()


def leer_exacto(sock, n):
    datos = b""
    while len(datos) < n:
        trozo = sock.recv(n - len(datos))
        if not trozo:
            return None
        datos += trozo
    return datos


def leer_trama(sock):
    """Devuelve (opcode, payload) o None si se cerró. Junta las tramas
    fragmentadas, que es lo que manda un navegador con un dibujo grande."""
    partes, primer_op = b"", None
    while True:
        cab = leer_exacto(sock, 2)
        if not cab:
            return None
        b1, b2 = cab[0], cab[1]
        fin, opcode = b1 & 0x80, b1 & 0x0F
        enmascarada, largo = b2 & 0x80, b2 & 0x7F
        if largo == 126:
            ext = leer_exacto(sock, 2)
            if not ext:
                return None
            largo = struct.unpack("!H", ext)[0]
        elif largo == 127:
            ext = leer_exacto(sock, 8)
            if not ext:
                return None
            largo = struct.unpack("!Q", ext)[0]
        if largo > MAX_TRAMA or len(partes) + largo > MAX_TRAMA:
            return None
        mascara = leer_exacto(sock, 4) if enmascarada else None
        cuerpo = leer_exacto(sock, largo) if largo else b""
        if cuerpo is None:
            return None
        if mascara:
            cuerpo = bytes(b ^ mascara[i % 4] for i, b in enumerate(cuerpo))
        if opcode in (OP_CIERRE, OP_PING, OP_PONG):
            return (opcode, cuerpo)
        if primer_op is None:
            primer_op = opcode
        partes += cuerpo
        if fin:
            return (primer_op, partes)


def escribir_trama(sock, datos, opcode=OP_TEXTO):
    if isinstance(datos, str):
        datos = datos.encode("utf-8")
    largo = len(datos)
    cab = bytes([0x80 | opcode])
    if largo < 126:
        cab += bytes([largo])
    elif largo < 65536:
        cab += bytes([126]) + struct.pack("!H", largo)
    else:
        cab += bytes([127]) + struct.pack("!Q", largo)
    sock.sendall(cab + datos)


class Cliente:
    """Un participante conectado. El envío va con cerrojo propio: dos hilos
    escribiendo el mismo socket entrelazan tramas y el navegador corta la
    conexión sin decir por qué."""

    def __init__(self, sock, rele):
        self.sock = sock
        self.rele = rele
        self.sala = None
        self.actorId = None
        self.nombre = ""
        self.rol = "editor"
        self.vivo = True
        self.cerrojo = threading.Lock()

    def enviar(self, mensaje):
        if not self.vivo:
            return False
        try:
            with self.cerrojo:
                escribir_trama(self.sock, json.dumps(mensaje, ensure_ascii=False))
            return True
        except Exception:
            self.vivo = False
            return False


class Manejador(socketserver.StreamRequestHandler):
    daemon_threads = True
    timeout = 300

    def handle(self):
        try:
            self._handle()
        except (ConnectionResetError, BrokenPipeError, socket.timeout, OSError):
            pass
        finally:
            self._despedir()

    # ── entrada ─────────────────────────────────────────────────────────────
    def _handle(self):
        self.cliente = Cliente(self.request, self.server.rele)
        pedido = self.rfile.readline(65536).decode("latin-1").strip()
        cabeceras = {}
        while True:
            linea = self.rfile.readline(65536).decode("latin-1").strip()
            if not linea:
                break
            if ":" in linea:
                k, v = linea.split(":", 1)
                cabeceras[k.strip().lower()] = v.strip()

        clave = cabeceras.get("sec-websocket-key")
        if "upgrade" not in cabeceras.get("connection", "").lower() or not clave:
            return self._responder_http(pedido)

        self.request.sendall(
            ("HTTP/1.1 101 Switching Protocols" + "\r\n" +
             "Upgrade: websocket" + "\r\n" +
             "Connection: Upgrade" + "\r\n" +
             "Sec-WebSocket-Accept: " + aceptar_clave(clave) + "\r\n\r\n").encode())
        self._bucle()

    def _responder_http(self, pedido):
        """Sin upgrade se responde HTTP común: sirve para comprobar desde el
        navegador o con curl que el relé está vivo antes de culpar al cliente."""
        cuerpo = json.dumps(self.server.rele.salud(), ensure_ascii=False).encode("utf-8")
        self.request.sendall(
            ("HTTP/1.1 200 OK" + "\r\n" +
             "Content-Type: application/json; charset=utf-8" + "\r\n" +
             "Access-Control-Allow-Origin: *" + "\r\n" +
             "Content-Length: " + str(len(cuerpo)) + "\r\n" +
             "Connection: close" + "\r\n\r\n").encode() + cuerpo)

    # ── bucle de mensajes ───────────────────────────────────────────────────
    def _bucle(self):
        c = self.cliente
        while c.vivo:
            trama = leer_trama(self.request)
            if trama is None:
                break
            opcode, cuerpo = trama
            if opcode == OP_CIERRE:
                break
            if opcode == OP_PING:
                with c.cerrojo:
                    escribir_trama(self.request, cuerpo, OP_PONG)
                continue
            if opcode != OP_TEXTO:
                continue
            try:
                mensaje = json.loads(cuerpo.decode("utf-8"))
            except Exception:
                c.enviar({"t": "error", "motivo": "mensaje ilegible"})
                continue
            self._despachar(mensaje)

    def _despachar(self, m):
        c, t = self.cliente, m.get("t")
        if t == "hello":
            return self._hola(m)
        if not c.sala:
            return c.enviar({"t": "error", "motivo": "hay que saludar primero"})
        sala = c.sala
        if t == "op":
            if c.rol not in ("owner", "editor"):
                return c.enviar({"t": "rechazado", "id": (m.get("op") or {}).get("id"),
                                 "motivo": "el rol " + c.rol + " no puede editar"})
            op = m.get("op") or {}
            if not op.get("id"):
                return c.enviar({"t": "error", "motivo": "operación sin id"})
            op["actorId"] = c.actorId          # el remitente lo pone el servidor
            entrada = sala.agregar_op(op)
            # se difunde también al que la mandó: así confirma con el mismo
            # camino que los demás, y no hay dos rutas de acuse que mantener
            return self._difundir({"t": "op", "seq": entrada["seq"], "op": op})
        if t == "presence":
            actor = dict(m.get("actor") or {})
            actor["id"] = c.actorId
            actor["nombre"] = actor.get("nombre") or c.nombre
            if sala.ver(actor):
                self._difundir({"t": "presence", "actores": sala.presentes()})
            return
        if t == "lock":
            recurso = str(m.get("recurso") or "")
            if not recurso:
                return
            if m.get("accion") == "drop":
                sala.soltar(recurso, c.actorId)
                ok = True
            else:
                ok, actual = sala.tomar(recurso, c.actorId, c.nombre,
                                        float(m.get("ttl") or 120))
                if not ok:
                    c.enviar({"t": "lockResult", "recurso": recurso, "ok": False,
                              "de": actual.get("nombre") or actual.get("actorId")})
            if ok:
                c.enviar({"t": "lockResult", "recurso": recurso, "ok": True})
            return self._difundir({"t": "locks", "bloqueos": sala.bloqueos_vivos()})
        if t == "comment":
            if c.rol == "viewer":
                return c.enviar({"t": "error", "motivo": "el rol viewer no comenta"})
            com = dict(m.get("comentario") or {})
            if not com.get("id") or not str(com.get("texto") or "").strip():
                return c.enviar({"t": "error", "motivo": "comentario vacío"})
            com["actorId"] = c.actorId
            com["nombre"] = c.nombre
            com["at"] = ahora()
            com["resuelto"] = False
            com["texto"] = str(com["texto"])[:2000]
            sala.comentar(com)
            return self._difundir({"t": "comment", "comentario": com})
        if t == "comment.resolve":
            if sala.resolver(m.get("id"), m.get("resuelto", True)):
                self._difundir({"t": "comments", "comentarios": sala.comentarios})
            return
        if t == "ping":
            return c.enviar({"t": "pong", "at": ahora()})

    def _hola(self, m):
        c, rele = self.cliente, self.server.rele
        if rele.token and str(m.get("token") or "") != rele.token:
            c.enviar({"t": "denegado", "motivo": "clave incorrecta"})
            c.vivo = False
            return
        actor = m.get("actor") or {}
        if not m.get("room") or not actor.get("id"):
            c.enviar({"t": "denegado", "motivo": "falta room o actor"})
            c.vivo = False
            return
        c.actorId = str(actor["id"])
        c.nombre = str(actor.get("nombre") or actor["id"])[:80]
        c.rol = m.get("rol") if m.get("rol") in ("owner", "editor", "reviewer", "viewer") else "editor"
        c.sala = rele.sala(str(m["room"]))
        with c.sala.cerrojo:
            c.sala.clientes.add(c)
        actor = dict(actor)
        actor["id"] = c.actorId
        actor["nombre"] = c.nombre
        actor["rol"] = c.rol
        c.sala.ver(actor)
        desde = int(m.get("desde") or 0)
        c.enviar({"t": "welcome", "room": c.sala.nombre, "actorId": c.actorId,
                  "rol": c.rol, "seq": c.sala.seq,
                  "ops": c.sala.desde(desde),
                  "actores": c.sala.presentes(),
                  "bloqueos": c.sala.bloqueos_vivos(),
                  "comentarios": c.sala.comentarios})
        self._difundir({"t": "presence", "actores": c.sala.presentes()})

    def _difundir(self, mensaje, menos=None, sala=None):
        sala = sala or self.cliente.sala
        if not sala:
            return
        with sala.cerrojo:
            destinos = list(sala.clientes)
        for otro in destinos:
            if otro is menos:
                continue
            if not otro.enviar(mensaje):
                with sala.cerrojo:
                    sala.clientes.discard(otro)

    def _despedir(self):
        c = getattr(self, "cliente", None)
        if not c or not c.sala:
            return
        sala = c.sala
        with sala.cerrojo:
            sala.clientes.discard(c)
        if c.actorId:
            sala.se_fue(c.actorId)
            sala.soltar_todo(c.actorId)
        c.sala = None
        self._difundir({"t": "presence", "actores": sala.presentes()}, sala=sala)
        self._difundir({"t": "locks", "bloqueos": sala.bloqueos_vivos()}, sala=sala)


class Servidor(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def main(argv=None):
    p = argparse.ArgumentParser(description="Relé de trabajo remoto de LOW")
    p.add_argument("--puerto", type=int, default=int(os.environ.get("LOW_RELAY_PORT", 8787)))
    p.add_argument("--host", default=os.environ.get("LOW_RELAY_HOST", "0.0.0.0"))
    p.add_argument("--datos", default=os.environ.get("LOW_RELAY_DATA", ""),
                   help="carpeta donde guardar el registro de cada sala")
    args = p.parse_args(argv)

    token = os.environ.get("LOW_RELAY_TOKEN", "").strip() or None
    if not token:
        print("AVISO: sin LOW_RELAY_TOKEN cualquiera que sepa la dirección entra "
              "a las salas. En un servidor público, ponele una clave.")
    rele = Relé(args.datos or None, token)
    srv = Servidor((args.host, args.puerto), Manejador)
    srv.rele = rele
    print("relé de LOW escuchando en %s:%d%s" %
          (args.host, args.puerto, " (con clave)" if token else ""))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\ncortado a mano")
    finally:
        srv.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
