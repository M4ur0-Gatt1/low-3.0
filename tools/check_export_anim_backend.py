"""La exportacion de animacion: lo que promete `export_anim` del puente.

POR QUE EXISTE ESTE ARCHIVO. El inventario de capacidades (A01) dejo anotado,
con estas palabras, que «la exportacion de animacion (MP4/PNG) no tiene ninguna
prueba» y que era el siguiente agujero a cerrar «de los que se notan: si falla,
falla al final del trabajo». Esto cierra la mitad del puente; el recorrido del
navegador (`check_export_anim_ui.js`) cierra la otra.

Se prueba sobre un proyecto de prueba en una carpeta temporal. No toca nada del
proyecto de nadie, y no necesita ffmpeg ni Pillow: cuando falta uno de los dos
se comprueba que el mensaje de error SIRVA —que nombre la alternativa que si
funciona—, porque un «error» a secas al final de una exportacion larga es lo
mismo que perder el trabajo.
"""
import base64
import io as _io
import shutil
import struct
import sys
import tempfile
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import Api


def png_de_un_color(r, g, b, ancho=8, alto=8):
    """Un PNG valido de verdad, armado a mano. Pillow puede no estar instalado
    y aca hace falta que los bytes sean un PNG legitimo, no un placeholder."""
    def trozo(tipo, datos):
        return (struct.pack(">I", len(datos)) + tipo + datos
                + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF))
    cabecera = struct.pack(">IIBBBBB", ancho, alto, 8, 2, 0, 0, 0)
    crudo = b"".join(b"\x00" + bytes([r, g, b]) * ancho for _ in range(alto))
    return (b"\x89PNG\r\n\x1a\n" + trozo(b"IHDR", cabecera)
            + trozo(b"IDAT", zlib.compress(crudo)) + trozo(b"IEND", b""))


def data_url(raw):
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")


def bridge_for(base):
    bridge = Api.__new__(Api)
    bridge.ws = str(base)
    bridge._window = None
    bridge.avisos = []
    bridge._push = lambda canal, datos: bridge.avisos.append(canal)
    bridge._tree = lambda: {}
    bridge._git_branch = lambda: ""
    return bridge


def main():
    tiene_ffmpeg = bool(shutil.which("ffmpeg"))
    try:
        from PIL import Image
        tiene_pillow = True
    except ImportError:
        tiene_pillow = False

    with tempfile.TemporaryDirectory(prefix="low-export-") as folder:
        base = Path(folder)
        (base / "disenos").mkdir()
        doc = base / "disenos" / "escena.svg"
        doc.write_text("<svg/>", encoding="utf-8")
        puente = bridge_for(base)

        rojo, verde, azul = (png_de_un_color(220, 30, 30), png_de_un_color(30, 200, 30),
                             png_de_un_color(30, 30, 220))
        cuadros = [data_url(rojo), data_url(verde), data_url(azul)]

        # -- 0. SIN RUTA: error legible, no un TypeError. Un .low no tiene
        #       DZ.path; cuando el frontend mandaba None, `Path(None)` reventaba
        #       con «argument should be a str... not 'NoneType'» y del otro lado
        #       se veia el programa colgado en «Guardando la secuencia...».
        #       Medido en la app real: asi no salia NADA de LOW.
        for vacia in (None, ""):
            r = puente.export_anim(vacia, cuadros, 12, "png")
            assert isinstance(r, dict) and "error" in r, ("sin ruta tiene que dar error", vacia, r)
            assert "guarda" in r["error"].lower(), ("el error tiene que decir que hacer", r)
            r = puente.export_premiere(vacia, cuadros, "<xml/>", None, "s")
            assert isinstance(r, dict) and "error" in r, ("premiere sin ruta", vacia, r)

        # -- 1. SECUENCIA PNG: sale un archivo por cuadro, con los bytes
        #       intactos y en una carpeta `export` al lado del documento.
        r = puente.export_anim(str(doc), cuadros, 12, "png")
        assert not r.get("error"), r
        assert r.get("n") == 3, r
        salida = Path(r["path"])
        assert salida == base / "disenos" / "export", salida
        pngs = sorted(salida.glob("escena_*.png"))
        assert len(pngs) == 3, "esperaba 3 PNG, hay %d: %s" % (len(pngs), [p.name for p in pngs])
        assert pngs[0].read_bytes() == rojo, "el primer cuadro no llego intacto"
        assert pngs[2].read_bytes() == azul, "el ultimo cuadro no llego intacto"
        assert all(p.stat().st_size > 0 for p in pngs), "algun PNG salio vacio"

        # -- 2. EL ORDEN DE LOS NOMBRES ES EL ORDEN DE LA ANIMACION. Un importador
        #       —o cualquier `sorted()`— toma la secuencia por nombre: si el
        #       relleno de ceros no alcanza, el cuadro 1000 se ordena ANTES del
        #       999 y la animacion entra desordenada al montaje. Son 42 segundos
        #       a 24 fps: nada raro.
        muchos = [data_url(rojo)] * 1001
        r = puente.export_anim(str(doc), muchos, 24, "png")
        assert len(list(salida.glob("escena_*.png"))) == 1001, (
            "quedaron cuadros de la toma anterior mezclados con la nueva: %d archivos"
            % len(list(salida.glob("escena_*.png"))))
        assert not r.get("error"), r
        nombres = sorted(p.name for p in salida.glob("escena_*.png"))
        indices = [int(n.rsplit("_", 1)[1].split(".")[0]) for n in nombres]
        desorden = next(((nombres[i], nombres[i + 1]) for i in range(len(indices) - 1)
                         if indices[i] > indices[i + 1]), None)
        assert desorden is None, (
            "los nombres NO se ordenan como la animacion: %s queda ANTES de %s, "
            "asi que la secuencia entra desordenada al montaje" % desorden)
        # -- 2b. Y UNA TOMA CORTA DESPUES DE UNA LARGA no deja los cuadros
        #        viejos. Es el caso que de verdad arruina una entrega: se exporta
        #        la escena entera, se corrige y se exporta un tramo, y el
        #        importador se lleva los 990 cuadros de la version anterior
        #        pegados atras sin que nadie lo note.
        r = puente.export_anim(str(doc), cuadros, 24, "png")
        assert not r.get("error"), r
        quedaron = sorted(p.name for p in salida.glob("escena_*.png"))
        assert len(quedaron) == 3, (
            "despues de exportar 3 cuadros quedaron %d archivos: la toma vieja "
            "sigue en la carpeta y el montaje se la lleva :: %s"
            % (len(quedaron), quedaron[:6]))

        for p in salida.glob("escena_*.png"):
            p.unlink()

        # -- 3. UN CUADRO ROTO NO DEJA UNA SECUENCIA A MEDIAS. Si se escribiera
        #       mientras se decodifica, un cuadro corrupto en el medio dejaria
        #       media exportacion en disco y nadie sabria donde se corto.
        r = puente.export_anim(str(doc), [data_url(rojo), "data:image/png;base64,@@no-es-base64@@"], 12, "png")
        assert r.get("error"), "acepto un cuadro corrupto sin decir nada"
        assert not list(salida.glob("escena_*.png")), \
            "dejo una secuencia A MEDIAS en disco despues de fallar"

        # -- 4. SIN CUADROS no se inventa un archivo.
        r = puente.export_anim(str(doc), [], 12, "png")
        assert r.get("n") == 0 or r.get("error"), r
        assert not list(salida.glob("escena_*.png")), "escribio algo sin cuadros"

        # -- 5. MP4. Con ffmpeg tiene que salir un archivo de verdad; sin ffmpeg,
        #       el mensaje tiene que NOMBRAR la salida que si funciona.
        r = puente.export_anim(str(doc), cuadros, 12, "mp4")
        if tiene_ffmpeg:
            assert not r.get("error"), r
            video = Path(r["path"])
            assert video.exists() and video.suffix == ".mp4", r
            assert video.stat().st_size > 200, "el MP4 salio vacio: %d bytes" % video.stat().st_size
            assert video.read_bytes()[4:8] == b"ftyp", "el MP4 no tiene cabecera de MP4"
        else:
            assert r.get("error") and "ffmpeg" in r["error"], r
            assert "PNG" in r["error"] or "GIF" in r["error"], \
                ("el error de MP4 no dice que hacer en su lugar: al final de una "
                 "exportacion larga eso es perder el trabajo :: %s" % r["error"])

        # -- 6. GIF. Igual: o sale el GIF con sus tres cuadros, o el mensaje
        #       explica que instalar y que alternativa no necesita nada.
        r = puente.export_anim(str(doc), cuadros, 10, "gif")
        if tiene_pillow:
            assert not r.get("error"), r
            gif = Path(r["path"])
            assert gif.exists() and gif.suffix == ".gif", r
            assert gif.read_bytes()[:3] == b"GIF", "el archivo no es un GIF"
            with Image.open(gif) as im:
                assert getattr(im, "n_frames", 1) == 3, \
                    "el GIF salio con %d cuadros en vez de 3" % getattr(im, "n_frames", 1)
        else:
            assert r.get("error") and "Pillow" in r["error"], r
            assert "PNG" in r["error"], \
                "el error de GIF no nombra la secuencia PNG, que funciona sin instalar nada"

        # -- 7. El spritesheet lo compone el frontend: el puente guarda ESE png.
        r = puente.export_anim(str(doc), [data_url(verde)], 12, "sheet")
        assert not r.get("error"), r
        hoja = Path(r["path"])
        assert hoja.name == "escena_sheet.png" and hoja.read_bytes() == verde, r

        # -- 8. Y cada exportacion avisa a la interfaz, que es lo que refresca el
        #       arbol de archivos: sin eso el resultado no aparece hasta reabrir.
        assert "ws" in puente.avisos, "el puente no avisa que hay archivos nuevos"

    faltantes = []
    if not tiene_ffmpeg:
        faltantes.append("sin ffmpeg: se comprobo el mensaje, no el MP4")
    if not tiene_pillow:
        faltantes.append("sin Pillow: se comprobo el mensaje, no el GIF")
    print("EXPORT ANIM OK: secuencia PNG intacta y ordenable, cuadro roto sin "
          "secuencia a medias, MP4, GIF y spritesheet"
          + (" (" + "; ".join(faltantes) + ")" if faltantes else ""))


if __name__ == "__main__":
    main()
