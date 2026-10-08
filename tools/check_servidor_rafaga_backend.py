"""El servidor de la interfaz aguanta la ráfaga del arranque.

POR QUE EXISTE. Medido el 7-oct-2026 en la app real, al abrir LOW: seis hojas
de estilo SEGUIDAS del index.html (camara-2d, pantalla-inicial, forma,
rhythm-lab, estudio-moho, panel-espejo) no cargaron —estado 0, cero bytes—, y
la ventana quedó con otro aspecto hasta reabrirla. Al recargar, cargaban.

La causa: pywebview sirve la interfaz con el WSGIServer de la biblioteca
estándar, que escucha con una cola de 5 conexiones (`request_queue_size`). Al
arrancar, WebView2 pide de golpe las ~16 hojas y ~150 programas de la página;
si llegan más conexiones de las que entran en la cola, Windows rechaza las
que sobran y el navegador no reintenta una hoja de estilo.

Se exige: con el arreglo de LOW puesto, una ráfaga de conexiones simultáneas
al servidor de pywebview se atiende entera, sin ninguna rechazada.
"""
import socket
import sys
import tempfile
import threading
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main  # noqa: E402

RAFAGA = 120


def main_prueba():
    main._servidor_paciente()
    from webview import http as wvhttp

    with tempfile.TemporaryDirectory(prefix="low-rafaga-") as carpeta:
        raiz = Path(carpeta)
        (raiz / "index.html").write_text("<p>hola</p>", encoding="utf-8")
        direccion, _, _ = wvhttp.BottleServer.start_server([str(raiz / "index.html")], None)
        for _ in range(50):
            try:
                urllib.request.urlopen(direccion + "index.html", timeout=5).read()
                break
            except OSError:
                time.sleep(0.1)
        else:
            raise AssertionError("el servidor de pywebview no levantó")
        host, puerto = direccion.split("//")[1].rstrip("/").split(":")
        puerto = int(puerto)

        # todas las conexiones a la vez, sin esperar a que el servidor acepte
        listo = threading.Barrier(RAFAGA)
        fallas, bien = [], []

        def pedir(i):
            try:
                listo.wait(10)
                s = socket.create_connection((host, puerto), timeout=10)
                s.sendall(b"GET /index.html?r=%d HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n" % i)
                datos = b""
                while True:
                    trozo = s.recv(4096)
                    if not trozo:
                        break
                    datos += trozo
                s.close()
                (bien if b" 200 " in datos.split(b"\r\n", 1)[0] else fallas).append(i)
            except OSError as e:
                fallas.append("%d: %s" % (i, e))

        hilos = [threading.Thread(target=pedir, args=(i,)) for i in range(RAFAGA)]
        for h in hilos:
            h.start()
        for h in hilos:
            h.join(30)
        assert not fallas, (
            "el servidor de la interfaz RECHAZÓ %d de %d conexiones simultáneas "
            "(cola de %s). Al arrancar, WebView2 pide todo de golpe y lo rechazado no "
            "se reintenta: la ventana queda sin estilo. Ejemplos: %s" % (
                len(fallas), RAFAGA, getattr(__import__("wsgiref.simple_server").simple_server.WSGIServer,
                                             "request_queue_size", "?"), fallas[:3]))
        assert len(bien) == RAFAGA, len(bien)
    print("OK servidor de la interfaz: %d conexiones simultáneas, ninguna rechazada" % RAFAGA)


if __name__ == "__main__":
    main_prueba()
