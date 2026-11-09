"""Importar capas de PSD y ORA (capas_archivo.py), sin ventana.

Se ARMAN en memoria un ORA (zip con stack.xml) y un PSD de verdad (RGB, 8 bits,
una capa con canales crudos y otra comprimida con RLE/PackBits, una oculta y
una carpeta), se leen, y se comprueba que cada capa vuelve con su nombre, su
lugar, su visibilidad, su opacidad y los MISMOS píxeles (el PNG se decodifica
de vuelta). También: el orden (la primera es la de más atrás), los errores
claros (CMYK, 16 bits, no es PSD) y que un ORA no lee fuera del zip (../). """
import io
import struct
import sys
import zipfile
import zlib
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
import capas_archivo as C  # noqa: E402


def mal(m, d=None):
    raise SystemExit("REGRESIÓN: " + m + ("" if d is None else " :: " + repr(d)[:300]))


def pixeles(png_bytes):
    """Decodifica un PNG RGBA 8 bits sin filtros (el que arma png()) a filas de bytes."""
    w, h = struct.unpack(">II", png_bytes[16:24])
    idat, o = b"", 8
    while o < len(png_bytes):
        n = struct.unpack(">I", png_bytes[o:o + 4])[0]
        tipo = png_bytes[o + 4:o + 8]
        if tipo == b"IDAT":
            idat += png_bytes[o + 8:o + 8 + n]
        o += 12 + n
    crudo = zlib.decompress(idat)
    return w, h, [crudo[y * (w * 4 + 1) + 1:(y + 1) * (w * 4 + 1)] for y in range(h)]


def packbits(fila):
    """Codificación PackBits mínima (literales) para armar el PSD de prueba."""
    out = bytearray()
    for i in range(0, len(fila), 128):
        trozo = fila[i:i + 128]
        out += bytes([len(trozo) - 1]) + trozo
    return bytes(out)


def armar_psd(capas, ancho=8, alto=6, modo=3, prof=8):
    """capas: [(nombre, top, left, w, h, rgba_bytes, visible, opacidad, rle, carpeta)]"""
    head = b"8BPS" + struct.pack(">H6xHIIHH", 1, 3, alto, ancho, prof, modo)
    registros, datos_canales = b"", b""
    for (nombre, top, left, w, h, rgba, visible, op, rle, carpeta) in capas:
        planos = {0: rgba[0::4], 1: rgba[1::4], 2: rgba[2::4], -1: rgba[3::4]}
        canales = b""
        for cid in (-1, 0, 1, 2):
            p = planos[cid]
            if rle and w and h:
                filas = [packbits(p[y * w:(y + 1) * w]) for y in range(h)]
                cuerpo = struct.pack(">H", 1) + b"".join(struct.pack(">H", len(f)) for f in filas) + b"".join(filas)
            else:
                cuerpo = struct.pack(">H", 0) + p
            canales += struct.pack(">hI", cid, len(cuerpo))
            datos_canales += cuerpo
        n = nombre.encode("latin-1")
        pascal = bytes([len(n)]) + n
        pascal += b"\x00" * ((4 - len(pascal) % 4) % 4)
        extra_info = b""
        uni = nombre.encode("utf-16-be")
        luni = struct.pack(">I", len(nombre)) + uni
        luni += b"\x00" * (len(luni) % 2)
        extra_info += b"8BIMluni" + struct.pack(">I", len(luni)) + luni
        if carpeta:
            extra_info += b"8BIMlsct" + struct.pack(">II", 4, 1)
        extra = struct.pack(">I", 0) + struct.pack(">I", 0) + pascal + extra_info
        registros += struct.pack(">iiiiH", top, left, top + h, left + w, 4) + canales
        registros += b"8BIMnorm" + bytes([int(op * 255), 0, 0 if visible else 2, 0]) + struct.pack(">I", len(extra)) + extra
    info = struct.pack(">h", len(capas)) + registros + datos_canales
    capas_y_mascara = struct.pack(">I", len(info)) + info
    return head + struct.pack(">I", 0) + struct.pack(">I", 0) + struct.pack(">I", len(capas_y_mascara)) + capas_y_mascara


def main_():
    # ── ORA ──
    rojo = C.png(2, 2, b"\xff\x00\x00\xff" * 4)
    azul = C.png(3, 1, b"\x00\x00\xff\x80" * 3)
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("mimetype", "image/openraster")
        z.writestr("stack.xml", '<image w="100" h="50"><stack>'
                   '<layer name="Adelante" src="data/azul.png" x="10" y="20" opacity="0.5"/>'
                   '<stack x="5" y="5"><layer name="Adentro" src="data/rojo.png" x="1" y="2" visibility="hidden"/></stack>'
                   '<layer name="Trampa" src="../fuera.png"/>'
                   '<layer name="Atras" src="data/rojo.png"/></stack></image>')
        z.writestr("data/rojo.png", rojo)
        z.writestr("data/azul.png", azul)
    r = C.leer("dibujo.ora", buf.getvalue())
    nombres = [c["nombre"] for c in r["capas"]]
    if (r["ancho"], r["alto"]) != (100, 50):
        mal("ORA: el tamaño del lienzo", (r["ancho"], r["alto"]))
    if nombres != ["Atras", "Adentro", "Adelante"]:
        mal("ORA: el orden (la primera la de más atrás) o una ruta con ../ se coló", nombres)
    adentro = r["capas"][1]
    if (adentro["x"], adentro["y"], adentro["visible"]) != (6, 7, False):
        mal("ORA: la capa dentro de un grupo no suma el lugar del grupo o no queda oculta", adentro)
    if r["capas"][2]["opacidad"] != 0.5 or r["capas"][2]["png"] != azul:
        mal("ORA: opacidad o PNG de la capa", r["capas"][2]["opacidad"])

    # ── PSD ──
    verde = b"\x00\xff\x00\xff" * (3 * 2)
    mixto = bytes(sum(([x * 10, y * 40, 200, 255 if (x + y) % 2 else 0] for y in range(3) for x in range(4)), []))
    psd = armar_psd([("Fondo", 0, 0, 3, 2, verde, True, 1.0, False, False),
                     ("Ojos ñ", 2, 3, 4, 3, mixto, False, 0.6, True, False),
                     ("Carpeta", 0, 0, 0, 0, b"", True, 1.0, False, True)])
    r = C.leer("personaje.psd", psd)
    if (r["ancho"], r["alto"]) != (8, 6):
        mal("PSD: el tamaño del lienzo", (r["ancho"], r["alto"]))
    nombres = [c["nombre"] for c in r["capas"]]
    if nombres != ["Fondo", "Ojos ñ"]:
        mal("PSD: capas, orden, nombre unicode o la carpeta se coló", nombres)
    fondo, ojos = r["capas"]
    w, h, filas = pixeles(fondo["png"])
    if (w, h) != (3, 2) or filas[1][4:8] != b"\x00\xff\x00\xff":
        mal("PSD: los píxeles de la capa con canales crudos", (w, h, filas[1][:8]))
    w, h, filas = pixeles(ojos["png"])
    esperado = bytes([3 * 10, 2 * 40, 200, 255 if (3 + 2) % 2 else 0])
    if (w, h) != (4, 3) or filas[2][12:16] != esperado:
        mal("PSD: los píxeles de la capa con RLE", (w, h, filas[2][12:16], esperado))
    if (ojos["x"], ojos["y"], ojos["visible"]) != (3, 2, False) or abs(ojos["opacidad"] - 0.6) > 0.01:
        mal("PSD: lugar, visibilidad u opacidad", ojos)

    # ── errores claros ──
    for nombre, datos, texto in [("x.psd", armar_psd([], modo=4), "CMYK"), ("x.psd", armar_psd([], prof=16), "16 bits"),
                                 ("x.psd", b"no soy un psd", "no es un PSD"), ("x.ora", b"zip roto", "no es un ORA"),
                                 ("x.tif", b"", "no soportado"), ("x.psd", psd[:60], "cortado")]:
        try:
            C.leer(nombre, datos)
            mal("no avisó del error: " + texto)
        except C.ErrorCapas as e:
            if texto.lower() not in str(e).lower():
                mal("el error no dice «" + texto + "»", str(e))
    print("OK capas de PSD y ORA: orden, lugar, visibilidad, opacidad, píxeles crudos y RLE, carpetas, grupos ORA, ../ y errores claros")


if __name__ == "__main__":
    main_()
