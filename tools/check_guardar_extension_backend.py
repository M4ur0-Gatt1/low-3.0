"""«Guardar como…» no puede perder la extensión .low.

POR QUE EXISTE ESTE ARCHIVO. Pedido de Mauro (v3.24.1): «cuando le cambio los
nombres a los archivos pierden el ícono de LOW». `save_file` abría el diálogo
de Guardar sin filtro de tipo: si se escribía el nombre nuevo sin «.low»
(«caminata v2») el archivo quedaba SIN extensión, y Windows asocia el ícono y
el doble clic por la extensión. Para el sistema dejaba de ser una escena de LOW.

Se comprueba con un diálogo de mentira y una carpeta temporal:
- el diálogo filtra por «Escena de LOW (*.low)» y por .low3d;
- sin extensión, o con un punto en el nombre, se agrega .low;
- si ya trae .low (en cualquier caja), no se duplica;
- un archivo de código sigue igual: se agrega sólo si no trae extensión, y una
  extensión elegida a propósito (.txt) se respeta;
- guardar en una ruta conocida (Ctrl+S) no toca nada.
"""
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import webview  # noqa: E402
from main import Api  # noqa: E402

fallas = []


def ok(cond, msg):
    print(("OK   " if cond else "FALLA ") + msg)
    if not cond:
        fallas.append(msg)


class Ventana:
    def __init__(s):
        s.llamadas, s.respuesta = [], None

    def create_file_dialog(s, tipo, directory="", allow_multiple=False, save_filename="", file_types=()):
        s.llamadas.append({"tipo": tipo, "nombre": save_filename, "tipos": tuple(file_types)})
        return s.respuesta


def main():
    base = Path(tempfile.mkdtemp(prefix="low_ext_"))
    try:
        b = Api.__new__(Api)
        b.ws = str(base)
        b._window = v = Ventana()

        def guardar_como(tipeado, sugerido, contenido="{}"):
            v.respuesta = (str(base / tipeado),)
            return b.save_file("", contenido, sugerido)

        r = guardar_como("caminata v2", "escena.low")
        ok(v.llamadas[-1]["tipo"] == webview.SAVE_DIALOG, "abre el diálogo de Guardar")
        ok(v.llamadas[-1]["tipos"] == ("Escena de LOW (*.low)",), "filtra por escenas de LOW: " + repr(v.llamadas[-1]["tipos"]))
        ok(r and r.get("name") == "caminata v2.low" and (base / "caminata v2.low").is_file(),
           "un nombre sin extensión se guarda como .low: " + repr(r))
        ok(not (base / "caminata v2").exists(), "no queda un archivo sin extensión")

        r = guardar_como("caminata.final", "escena.low")
        ok(r.get("name") == "caminata.final.low", "un punto en el nombre no reemplaza a .low: " + repr(r))

        r = guardar_como("toma 3.LOW", "escena.low")
        ok(r.get("name") == "toma 3.LOW", "si ya trae .low (en mayúsculas) no se duplica: " + repr(r))

        r = guardar_como("set", "proyecto.low3d")
        ok(v.llamadas[-1]["tipos"] == ("Proyecto 3D de LOW (*.low3d)",) and r.get("name") == "set.low3d",
           "el proyecto 3D también conserva su extensión: " + repr(r))

        r = guardar_como("script", "codigo.py", "print(1)")
        ok(v.llamadas[-1]["tipos"] == () and r.get("name") == "script.py", "el código sin extensión toma .py: " + repr(r))
        r = guardar_como("notas.txt", "codigo.py", "hola")
        ok(r.get("name") == "notas.txt", "una extensión elegida a propósito se respeta: " + repr(r))

        import base64
        v.respuesta = (str(base / "pieza"),)
        r = b.save_binary(base64.b64encode(b"solid x").decode("ascii"), "modelo.stl")
        ok(r.get("name") == "pieza.stl" and (base / "pieza.stl").is_file(), "el STL del estudio 3D toma su extensión: " + repr(r))

        v.respuesta = None
        ok(b.save_file("", "{}", "escena.low") is None, "cancelar no guarda nada")

        n = len(v.llamadas)
        r = b.save_file(str(base / "conocida.low"), "{}", "escena.low")
        ok(len(v.llamadas) == n and r.get("name") == "conocida.low", "con ruta conocida no abre diálogo ni cambia el nombre")
    finally:
        shutil.rmtree(base, ignore_errors=True)
    print(f"\n{'FALLAS: ' + str(len(fallas)) if fallas else 'TODO OK'}")
    return 1 if fallas else 0


if __name__ == "__main__":
    sys.exit(main())
