#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Relé de trabajo remoto: protocolo verificado con clientes WebSocket REALES.

No se prueban los métodos de `Sala` por separado, que es la parte fácil: se
levanta el servidor en un puerto libre y se conectan dos clientes de verdad,
con apretón de manos y tramas enmascaradas, como haría el navegador. Lo que
tiene que funcionar es eso — el resto es contabilidad interna.

    python tools/check_relay_server.py
"""
import base64
import json
import os
import socket
import struct
import sys
import threading
import time

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(RAIZ, "server"))
import low_relay                                                    # noqa: E402

fallas = []


def ok(cond, nombre, detalle=None):
    if not cond:
        fallas.append(nombre + ("" if detalle is None else " :: " + repr(detalle)))


class WS:
    """Cliente WebSocket mínimo: lo justo para hablar con el relé."""

    def __init__(self, host, puerto):
        self.sock = socket.create_connection((host, puerto), timeout=5)
        clave = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((
            "GET / HTTP/1.1" + "\r\n" +
            "Host: " + host + "\r\n" +
            "Upgrade: websocket" + "\r\n" +
            "Connection: Upgrade" + "\r\n" +
            "Sec-WebSocket-Key: " + clave + "\r\n" +
            "Sec-WebSocket-Version: 13" + "\r\n\r\n").encode())
        cab = b""
        while b"\r\n\r\n" not in cab:
            trozo = self.sock.recv(1)
            if not trozo:
                raise AssertionError("el rele corto el apreton de manos")
            cab += trozo
        self.handshake = cab.decode("latin-1")
        esperado = low_relay.aceptar_clave(clave)
        assert esperado in self.handshake, "Sec-WebSocket-Accept mal calculado"
        self.buffer = []

    def enviar(self, mensaje):
        datos = json.dumps(mensaje, ensure_ascii=False).encode("utf-8")
        mascara = os.urandom(4)
        largo = len(datos)
        cab = bytes([0x81])
        if largo < 126:
            cab += bytes([0x80 | largo])
        elif largo < 65536:
            cab += bytes([0x80 | 126]) + struct.pack("!H", largo)
        else:
            cab += bytes([0x80 | 127]) + struct.pack("!Q", largo)
        cuerpo = bytes(b ^ mascara[i % 4] for i, b in enumerate(datos))
        self.sock.sendall(cab + mascara + cuerpo)

    def recibir(self, espera=2.0):
        self.sock.settimeout(espera)
        try:
            trama = low_relay.leer_trama(self.sock)
        except (socket.timeout, OSError):
            return None
        if not trama:
            return None
        return json.loads(trama[1].decode("utf-8"))

    def esperar(self, tipo, espera=2.0, intentos=12):
        """Los mensajes llegan entremezclados (presencia, bloqueos): se busca
        el que interesa sin exigir que venga primero."""
        tipos = (tipo,) if isinstance(tipo, str) else tuple(tipo)
        for _ in range(intentos):
            m = self.recibir(espera)
            if m is None:
                return None
            if m.get("t") in tipos:
                return m
        return None

    def drenar(self, espera=0.35):
        """Vacia lo que quedo encolado de los pasos anteriores. Sin esto una
        comprobacion puede darse por buena mirando un mensaje viejo: asi paso
        la primera vez con la presencia y con el aislamiento entre salas."""
        vistos = []
        while True:
            m = self.recibir(espera)
            if m is None:
                return vistos
            vistos.append(m)

    def cerrar(self):
        try:
            self.sock.close()
        except Exception:
            pass


def levantar(token=None, datos=None):
    rele = low_relay.Relé(datos, token)
    srv = low_relay.Servidor(("127.0.0.1", 0), low_relay.Manejador)
    srv.rele = rele
    hilo = threading.Thread(target=srv.serve_forever, daemon=True)
    hilo.start()
    return srv, srv.server_address[1]


def hola(ws, actor, room="proy", rol="editor", token=None, desde=0):
    m = {"t": "hello", "room": room, "actor": actor, "rol": rol, "desde": desde}
    if token:
        m["token"] = token
    ws.enviar(m)
    return ws.esperar(("welcome", "denegado"))


# ══ 1. Dos que entran, uno edita, el otro lo ve ═════════════════════════════
srv, puerto = levantar()
a = WS("127.0.0.1", puerto)
b = WS("127.0.0.1", puerto)
wa = hola(a, {"id": "ana", "nombre": "Ana"})
wb = hola(b, {"id": "beto", "nombre": "Beto"})
ok(wa and wa.get("t") == "welcome", "el primero entra a la sala", wa)
ok(wb and wb.get("seq") == 0, "la sala nueva arranca en cero", wb)
ok(len(wb.get("actores") or []) == 2, "el segundo ve que ya habia alguien", wb.get("actores"))

a.enviar({"t": "op", "op": {"id": "ana:1", "type": "drawing.stroke",
                            "target": "d:1", "payload": {"puntos": 3}}})
eco = a.esperar("op")
visto = b.esperar("op")
ok(eco and eco.get("seq") == 1, "el servidor numera la operacion", eco)
ok(visto and visto["op"]["id"] == "ana:1", "y le llega al otro", visto)
ok(visto and visto["op"]["actorId"] == "ana",
   "el remitente lo pone el servidor, no el cliente", visto)

# el que la manda tambien la recibe: un solo camino de acuse
ok(eco and eco["op"]["id"] == "ana:1", "el que edita recibe su propia operacion")

# ══ 2. Bloqueos: los arbitra el servidor ═══════════════════════════════════
a.enviar({"t": "lock", "recurso": "capa:brazo", "accion": "take"})
ra = a.esperar("lockResult")
ok(ra and ra.get("ok") is True, "el primero toma la pieza", ra)
b.enviar({"t": "lock", "recurso": "capa:brazo", "accion": "take"})
rb = b.esperar("lockResult")
ok(rb and rb.get("ok") is False, "el segundo NO toma la misma pieza", rb)
ok(rb and rb.get("de") == "Ana", "y se le dice quien la tiene", rb)

b.enviar({"t": "lock", "recurso": "capa:pierna", "accion": "take"})
rb2 = b.esperar("lockResult")
ok(rb2 and rb2.get("ok") is True, "otra pieza si se puede tomar en paralelo", rb2)

a.enviar({"t": "lock", "recurso": "capa:brazo", "accion": "drop"})
a.esperar("lockResult")
b.enviar({"t": "lock", "recurso": "capa:brazo", "accion": "take"})
rb3 = b.esperar("lockResult")
ok(rb3 and rb3.get("ok") is True, "soltada, la pieza queda libre", rb3)

# ══ 3. Se cae la conexion: el bloqueo se suelta solo ═══════════════════════
b.cerrar()
time.sleep(0.4)
c = WS("127.0.0.1", puerto)
wc = hola(c, {"id": "caro", "nombre": "Caro"})
ok("capa:brazo" not in (wc.get("bloqueos") or {}),
   "el bloqueo del que se desconecto no queda trabado", wc.get("bloqueos"))
ok("capa:pierna" not in (wc.get("bloqueos") or {}),
   "tampoco los demas bloqueos suyos", wc.get("bloqueos"))
ok(len(wc.get("actores") or []) == 2, "y sale de la lista de presentes", wc.get("actores"))

# ══ 4. El que llega tarde se pone al dia ═══════════════════════════════════
a.enviar({"t": "op", "op": {"id": "ana:2", "type": "cell.set", "target": "l:1"}})
a.esperar("op")
d = WS("127.0.0.1", puerto)
wd = hola(d, {"id": "dani", "nombre": "Dani"})
ok(len(wd.get("ops") or []) == 2, "recibe TODO lo que se perdio", len(wd.get("ops") or []))
e = WS("127.0.0.1", puerto)
we = hola(e, {"id": "eze", "nombre": "Eze"}, desde=1)
ok(len(we.get("ops") or []) == 1,
   "y el que ya tenia parte recibe solo lo que le falta", we.get("ops"))
ok(we["ops"][0]["seq"] == 2, "empezando por la que sigue", we.get("ops"))

# ══ 5. Presencia: quien esta y en que cuadro ═══════════════════════════════
d.drenar()
a.enviar({"t": "presence", "actor": {"cuadro": 42, "herramienta": "pincel"}})
pd = d.esperar("presence")
ana = [x for x in (pd.get("actores") or []) if x["id"] == "ana"]
ok(ana and ana[0].get("cuadro") == 42, "se ve en que cuadro esta cada uno", pd)

# ══ 6. Comentarios sobre el cuadro ═════════════════════════════════════════
a.enviar({"t": "comment", "comentario": {"id": "c1", "cuadro": 42, "texto": "la mano cruza tarde"}})
cd = d.esperar("comment")
ok(cd and cd["comentario"]["texto"] == "la mano cruza tarde", "el comentario llega a todos", cd)
ok(cd["comentario"]["nombre"] == "Ana" and cd["comentario"]["cuadro"] == 42,
   "con autor y cuadro", cd)
ok(cd["comentario"]["resuelto"] is False, "y sin resolver", cd)
a.enviar({"t": "comment", "comentario": {"id": "c2", "texto": "   "}})
ok(a.esperar("error", 1.0) is not None, "un comentario vacio se rechaza")

f = WS("127.0.0.1", puerto)
wf = hola(f, {"id": "fer", "nombre": "Fer"})
ok(len(wf.get("comentarios") or []) == 1, "el que entra ve los comentarios de antes", wf)

d.enviar({"t": "comment.resolve", "id": "c1"})
cr = a.esperar("comments")
ok(cr and cr["comentarios"][0]["resuelto"] is True, "y se pueden dar por resueltos", cr)

# ══ 7. Roles: el que mira no edita ═════════════════════════════════════════
g = WS("127.0.0.1", puerto)
hola(g, {"id": "gus", "nombre": "Gus"}, rol="viewer")
g.enviar({"t": "op", "op": {"id": "gus:1", "type": "drawing.stroke", "target": "d:1"}})
rg = g.esperar("rechazado")
ok(rg is not None, "un viewer no puede editar", rg)
g.enviar({"t": "comment", "comentario": {"id": "cg", "texto": "no deberia"}})
ok(g.esperar("error", 1.0) is not None, "ni comentar")

h = WS("127.0.0.1", puerto)
hola(h, {"id": "hugo", "nombre": "Hugo"}, rol="reviewer")
h.enviar({"t": "comment", "comentario": {"id": "ch", "texto": "esto si"}})
ok(h.esperar("comment", 1.5) is not None, "pero un reviewer si comenta")

# ══ 8. Sin saludar no se hace nada ═════════════════════════════════════════
i = WS("127.0.0.1", puerto)
i.enviar({"t": "op", "op": {"id": "x:1", "type": "drawing.stroke", "target": "d:1"}})
ok(i.esperar("error", 1.0) is not None, "hay que saludar antes de mandar nada")

# ══ 9. Salas separadas ═════════════════════════════════════════════════════
j = WS("127.0.0.1", puerto)
hola(j, {"id": "juan", "nombre": "Juan"}, room="otro")
j.drenar()
a.enviar({"t": "op", "op": {"id": "ana:3", "type": "cell.set", "target": "l:9"}})
a.esperar("op")
ok(j.esperar("op", 0.6, 4) is None, "lo de un proyecto no se filtra al otro")

# ══ 10. Salud por HTTP comun ═══════════════════════════════════════════════
s = socket.create_connection(("127.0.0.1", puerto), timeout=3)
s.sendall(b"GET / HTTP/1.1\r\nHost: x\r\n\r\n")
resp = s.recv(65536).decode("utf-8", "replace")
s.close()
ok("200 OK" in resp and '"ok": true' in resp.lower(),
   "responde salud por HTTP para poder comprobarlo con curl", resp[:120])

for ws in (a, c, d, e, f, g, h, i, j):
    ws.cerrar()
srv.shutdown()

# ══ 11. Con clave, el que no la sabe no entra ══════════════════════════════
srv2, puerto2 = levantar(token="secreta")
k = WS("127.0.0.1", puerto2)
rk = hola(k, {"id": "ken"}, token="equivocada")
ok(rk and rk.get("t") == "denegado", "sin la clave correcta no se entra", rk)
m = WS("127.0.0.1", puerto2)
rm = hola(m, {"id": "meli"}, token="secreta")
ok(rm and rm.get("t") == "welcome", "con la clave correcta si", rm)
k.cerrar()
m.cerrar()
srv2.shutdown()

# ══ 12. El registro sobrevive al reinicio ══════════════════════════════════
import tempfile                                                     # noqa: E402
carpeta = tempfile.mkdtemp(prefix="low-rele-")
srv3, puerto3 = levantar(datos=carpeta)
n = WS("127.0.0.1", puerto3)
hola(n, {"id": "nico"}, room="persistente")
n.enviar({"t": "op", "op": {"id": "nico:1", "type": "cell.set", "target": "l:1"}})
n.esperar("op")
n.enviar({"t": "comment", "comentario": {"id": "cp", "texto": "queda escrito"}})
n.esperar("comment")
n.cerrar()
srv3.shutdown()
time.sleep(0.2)

srv4, puerto4 = levantar(datos=carpeta)          # el relé se reinicia
o = WS("127.0.0.1", puerto4)
wo = hola(o, {"id": "olga"}, room="persistente")
ok(len(wo.get("ops") or []) == 1, "tras reiniciar el rele, la jornada sigue ahi", wo.get("ops"))
ok(wo.get("seq") == 1, "y la numeracion no vuelve a empezar", wo.get("seq"))
ok(len(wo.get("comentarios") or []) == 1, "los comentarios tambien", wo.get("comentarios"))
ok(not (wo.get("bloqueos") or {}), "pero los bloqueos NO: no hay nadie conectado", wo)
o.cerrar()
srv4.shutdown()

if fallas:
    print("RELE: FALLAN %d" % len(fallas))
    for f_ in fallas:
        print("  -", f_)
    sys.exit(1)
print("RELE OK: sala, operaciones, puesta al dia, bloqueos arbitrados, presencia, "
      "comentarios, roles, clave y persistencia")
