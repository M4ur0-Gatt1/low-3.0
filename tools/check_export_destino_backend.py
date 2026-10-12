"""Elegir DÓNDE se guarda lo exportado: el lado del puente.

POR QUE EXISTE ESTE ARCHIVO. Pedido de Mauro (v3.23): «cuando exporto los
archivos quiero poder elegir dónde los guardo; ahora se arma una carpeta por
defecto y no la puedo cambiar». `export_anim` y `export_premiere` escribían
siempre en `export/` al lado del documento, y no aceptaban otro lugar.

Se comprueba, en una carpeta temporal y sin ffmpeg ni Pillow:
- `pick_export_target` abre Guardar para un archivo (con nombre y extensión
  sugeridos) y Carpeta para la secuencia y Premiere; recuerda la carpeta y
  vuelve a abrir ahí; cancelar devuelve {cancel}; agrega la extensión si falta.
- `export_anim` escribe la secuencia y el spritesheet DONDE se eligió, sin
  crear `export/`, aunque el documento no tenga ruta todavía.
- `export_premiere` escribe cuadros, audio y XML en la carpeta elegida.
- Sin elección, todo sigue yendo a `export/` como antes.
"""
import base64
import shutil
import struct
import sys
import tempfile
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import webview  # noqa: E402
from main import Api  # noqa: E402

fallas = []


def ok(cond, msg):
    print(("OK   " if cond else "FALLA ") + msg)
    if not cond:
        fallas.append(msg)


def png():
    def trozo(tipo, datos):
        return (struct.pack(">I", len(datos)) + tipo + datos
                + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF))
    cab = struct.pack(">IIBBBBB", 4, 4, 8, 2, 0, 0, 0)
    crudo = b"".join(b"\x00" + b"\xf0\x45\x0e" * 4 for _ in range(4))
    raw = (b"\x89PNG\r\n\x1a\n" + trozo(b"IHDR", cab)
           + trozo(b"IDAT", zlib.compress(crudo)) + trozo(b"IEND", b""))
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")


class Config:
    def __init__(s):
        s.data, s.guardados = {}, 0

    def save(s):
        s.guardados += 1


class Ventana:
    """El diálogo nativo, de mentira: anota cómo lo abrieron y contesta lo que
    la prueba le diga."""
    def __init__(s):
        s.llamadas, s.respuesta = [], None

    def create_file_dialog(s, tipo, directory="", allow_multiple=False, save_filename="", file_types=()):
        s.llamadas.append({"tipo": tipo, "dir": directory, "nombre": save_filename, "tipos": file_types})
        return s.respuesta


def puente(base):
    b = Api.__new__(Api)
    b.ws = str(base)
    b.cfg = Config()
    b._window = Ventana()
    b._push = lambda canal, datos: None
    b._tree = lambda: {}
    b._git_branch = lambda: ""
    return b


def main():
    base = Path(tempfile.mkdtemp(prefix="low_destino_"))
    try:
        proyecto = base / "proyecto"
        proyecto.mkdir()
        doc = proyecto / "caminata.low"
        doc.write_text("{}", encoding="utf-8")
        elegida = base / "Mis exportaciones"
        elegida.mkdir()
        b = puente(proyecto)
        v = b._window

        ok(hasattr(b, "pick_export_target"), "el puente sabe preguntar dónde guardar")
        if not hasattr(b, "pick_export_target"):
            raise SystemExit(1)

        # ── un archivo: diálogo de Guardar, con nombre y extensión sugeridos
        v.respuesta = (str(elegida / "final"),)        # sin extensión, a propósito
        r = b.pick_export_target(str(doc), "mp4", "Escena 1")
        ll = v.llamadas[-1]
        ok(ll["tipo"] == webview.SAVE_DIALOG, "MP4 abre el diálogo de Guardar")
        ok(ll["nombre"] == "caminata.mp4", "sugiere el nombre del documento: " + repr(ll["nombre"]))
        ok(ll["dir"] == str(proyecto), "la primera vez abre en la carpeta del documento: " + repr(ll["dir"]))
        ok(any("*.mp4" in t for t in ll["tipos"]), "filtra por MP4")
        ok(r.get("path") == str(elegida / "final.mp4"), "agrega la extensión que faltaba: " + repr(r))
        ok(b.cfg.data.get("export_dir") == str(elegida) and b.cfg.guardados >= 1, "recuerda la carpeta elegida")

        v.respuesta = [str(elegida / "loop.gif")]
        b.pick_export_target(str(doc), "gif")
        ok(v.llamadas[-1]["dir"] == str(elegida), "la próxima vez abre donde se guardó la última")

        v.respuesta = (str(elegida / "hoja.png"),)
        b.pick_export_target(str(doc), "sheet")
        ok(v.llamadas[-1]["nombre"] == "caminata_sheet.png", "el spritesheet sugiere *_sheet.png")

        # ── muchos archivos: se elige la carpeta
        v.respuesta = (str(elegida),)
        r = b.pick_export_target(str(doc), "png")
        ok(v.llamadas[-1]["tipo"] == webview.FOLDER_DIALOG, "la secuencia PNG pide una carpeta")
        ok(r.get("path") == str(elegida), "devuelve la carpeta tal cual")
        b.pick_export_target(str(doc), "premiere")
        ok(v.llamadas[-1]["tipo"] == webview.FOLDER_DIALOG, "Premiere pide una carpeta")

        v.respuesta = None
        ok(b.pick_export_target(str(doc), "mp4") == {"cancel": True}, "cancelar el diálogo devuelve {cancel}")

        # documento sin guardar: el nombre sale de la escena
        b2 = puente(proyecto)
        b2._window.respuesta = (str(elegida / "x.mp4"),)
        b2.pick_export_target(None, "mp4", "Mi escena")
        ok(b2._window.llamadas[-1]["nombre"] == "Mi escena.mp4", "sin documento, sugiere el nombre de la escena")

        # ── export_anim escribe DONDE se eligió
        cuadros = [png(), png(), png()]
        r = b.export_anim(str(doc), cuadros, 12, "png", str(elegida))
        ok(not r.get("error") and Path(r.get("path", "")) == elegida, "la secuencia va a la carpeta elegida: " + repr(r))
        ok(sorted(p.name for p in elegida.glob("caminata_*.png")) ==
           ["caminata_001.png", "caminata_002.png", "caminata_003.png"], "los tres cuadros están ahí")
        ok(not (proyecto / "export").exists(), "no se armó la carpeta export/ por defecto")

        destino = elegida / "sub" / "mi_hoja.png"
        destino.parent.mkdir()
        r = b.export_anim(str(doc), [png()], 12, "sheet", str(destino))
        ok(r.get("path") == str(destino) and destino.is_file(), "el spritesheet se guarda con el nombre elegido: " + repr(r))

        sin_doc = base / "sin_doc"
        sin_doc.mkdir()
        r = b.export_anim(None, cuadros, 12, "png", str(sin_doc), "Mi escena")
        ok(not r.get("error") and len(list(sin_doc.glob("Mi escena_*.png"))) == 3,
           "un documento sin guardar exporta igual si se eligió dónde: " + repr(r))

        # ── Premiere: cuadros, audio y XML juntos en la carpeta elegida
        prem = base / "montaje"
        wav = base64.b64encode(b"RIFF0000WAVE").decode("ascii")
        r = b.export_premiere(str(doc), cuadros, "<xmeml/>", wav, "caminata", str(prem))
        ok(not r.get("error") and Path(r["path"]) == prem, "Premiere va a la carpeta elegida: " + repr(r))
        ok((prem / "caminata.xml").is_file() and (prem / "audio.wav").is_file()
           and len(list(prem.glob("caminata_*.png"))) == 3, "XML, audio y cuadros juntos")
        ok(not (proyecto / "export").exists(), "Premiere tampoco armó export/")

        # ── sin elección: el camino de siempre
        r = b.export_anim(str(doc), cuadros, 12, "png")
        ok(Path(r.get("path", "")) == proyecto / "export", "sin elegir, sigue yendo a export/: " + repr(r))
        r = b.export_anim(None, cuadros, 12, "png")
        ok("error" in r, "sin documento ni destino, error legible como antes")
    finally:
        shutil.rmtree(base, ignore_errors=True)
    print(f"\n{'FALLAS: ' + str(len(fallas)) if fallas else 'TODO OK'}")
    return 1 if fallas else 0


if __name__ == "__main__":
    sys.exit(main())
