"""La carpeta que se importa en Premiere: que el XML nombre archivos QUE EXISTEN.

POR QUE EXISTE ESTE ARCHIVO. El inventario de capacidades dejaba la exportacion
a Premiere en **parcial**: `run_premiere_xml_tests.js` prueba muy bien el XML, y
nadie probaba el otro lado. El XML y los archivos los arman DOS lados distintos
—el nombre de los cuadros lo calcula el frontend para escribirlo dentro del XML,
y los archivos los escribe `export_premiere` en Python— y cada uno tenia su
propia regla para limpiar el nombre de la escena:

    frontend:  name.replace(/[^\\w.-]+/g, "_")
    puente:    re.sub(r"[^\\w.-]+", "_", name).strip("_")

Con una escena llamada «El Gato (final)» el XML pedia `El_Gato_final__0001.png`
y el puente escribia `El_Gato_final_0001.png`. Premiere abre eso con TODOS los
cuadros perdidos, pidiendo relinkear uno por uno — exactamente lo que el
docstring de `export_premiere` dice que evita. Y falla al final del trabajo.

La prueba de fondo, entonces, no es «el XML esta bien formado» sino: **cada
archivo que el XML nombra tiene que existir en la carpeta**.
"""
import base64
import re
import struct
import sys
import tempfile
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import Api


def png_minimo():
    def trozo(tipo, datos):
        return (struct.pack(">I", len(datos)) + tipo + datos
                + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF))
    cab = struct.pack(">IIBBBBB", 4, 4, 8, 2, 0, 0, 0)
    crudo = b"".join(b"\x00" + bytes([20, 140, 220]) * 4 for _ in range(4))
    return (b"\x89PNG\r\n\x1a\n" + trozo(b"IHDR", cab)
            + trozo(b"IDAT", zlib.compress(crudo)) + trozo(b"IEND", b""))


def data_url(raw):
    return "data:image/png;base64," + base64.b64encode(raw).decode("ascii")


def nombre_como_el_frontend(name):
    """La regla del frontend, copiada de `dzExportPremiere` en ui/app.js.

    Si alguien cambia una de las dos y no la otra, esta prueba se cae: ese es
    justamente su trabajo.
    """
    limpio = re.sub(r"[^\w.-]+", "_", str(name or "secuencia"))
    limpio = re.sub(r"^_+|_+$", "", limpio)
    return limpio or "secuencia"


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
    with tempfile.TemporaryDirectory(prefix="low-premiere-") as folder:
        base = Path(folder)
        (base / "disenos").mkdir()
        doc = base / "disenos" / "escena.low"
        doc.write_text("{}", encoding="utf-8")
        puente = bridge_for(base)
        cuadros = [data_url(png_minimo()) for _ in range(3)]

        # Nombres que un animador pone de verdad. Los tres ultimos terminan en
        # un caracter que no es de palabra: ahi es donde las dos reglas se
        # separaban.
        for escena in ["Escena 1", "plano-A", "El Gato (final)", "Escena 1!", "  toma 3 "]:
            nombre = nombre_como_el_frontend(escena)
            archivos = ["%s_%04d.png" % (nombre, i + 1) for i in range(len(cuadros))]
            xml = ("<?xml version=\"1.0\"?><!DOCTYPE xmeml><xmeml version=\"4\">"
                   + "".join('<pathurl>%s</pathurl>' % a for a in archivos)
                   + "</xmeml>")

            r = puente.export_premiere(str(doc), cuadros, xml, None, escena)
            assert not r.get("error"), (escena, r)
            carpeta = Path(r["path"])
            assert carpeta.is_dir(), r
            assert carpeta.parent == base / "disenos" / "export", carpeta

            # LA COMPROBACION QUE IMPORTA: lo que el XML nombra, existe.
            escrito = {p.name for p in carpeta.glob("*.png")}
            faltan = [a for a in archivos if a not in escrito]
            assert not faltan, (
                "el XML de «%s» nombra archivos que NO SE ESCRIBIERON: %s. Premiere "
                "abriria la secuencia con esos cuadros PERDIDOS, pidiendo relinkear "
                "uno por uno. Escritos: %s" % (escena, faltan[:3], sorted(escrito)[:3]))

            # y el XML quedo al lado de los cuadros, que es lo que evita el
            # cartel de «archivo perdido» al importar
            xmls = list(carpeta.glob("*.xml"))
            assert len(xmls) == 1 and xmls[0].read_text(encoding="utf-8") == xml, xmls
            assert xmls[0].parent == carpeta, "el XML no quedo junto a los cuadros"

        # -- El audio, cuando lo hay, viaja en la MISMA carpeta.
        wav = base64.b64encode(b"RIFF0000WAVEfmt ").decode("ascii")
        r = puente.export_premiere(str(doc), cuadros, "<xmeml/>", wav, "con audio")
        carpeta = Path(r["path"])
        assert (carpeta / "audio.wav").exists(), \
            "el audio no quedo junto al XML: el montaje arranca pidiendo relinkear el sonido"
        assert r.get("audio") is True and r.get("frames") == 3, r

        # -- Sin cuadros no se inventa una carpeta con un XML solo, que seria
        #    una secuencia vacia con pinta de exportacion buena.
        r = puente.export_premiere(str(doc), [], "<xmeml/>", None, "vacia")
        assert r.get("frames") == 0, r

        assert "ws" in puente.avisos, "el puente no avisa que hay archivos nuevos"

    print("PREMIERE OK: el XML nombra archivos que existen, el audio y el XML "
          "viajan con los cuadros")


if __name__ == "__main__":
    main()
