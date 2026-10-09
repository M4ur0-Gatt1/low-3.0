"""Servidor estático para las pruebas en navegador (el mock en :8791).

POR QUE EXISTE. Las pruebas usaban `python -m http.server`, que escucha con
una cola de 5 conexiones. Al cargar index.html, Chrome pide de golpe ~170
archivos; con la máquina cargada (la puerta corre una prueba atrás de otra),
Windows RESETEA lo que no entra en la cola y algún programa no llega.
Medido el 9-oct-2026: 41 de 120 conexiones simultáneas cortadas, y en la
puerta `init: dzCornerDown is not defined` —no había cargado
panels/corner-editor.js—, una prueba que pasaba sola y fallaba en la tanda.
Es la misma causa que el arranque sin estilos de la app real
(main._servidor_paciente, LOW 3.12.1).

Uso:  python tools/servidor_mock.py [puerto] [direccion]
"""
import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class Servidor(ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True


def main():
    puerto = int(sys.argv[1]) if len(sys.argv) > 1 else 8791
    direccion = sys.argv[2] if len(sys.argv) > 2 else "127.0.0.1"
    with Servidor((direccion, puerto), SimpleHTTPRequestHandler) as s:
        print("mock en http://%s:%d (cola %d)" % (direccion, puerto, s.request_queue_size), flush=True)
        s.serve_forever()


if __name__ == "__main__":
    main()
