"""Importar capas de Photoshop (PSD) y de Krita/GIMP/MyPaint (ORA) — LOW 3.63.

Pedido de Mauro (nov-2026): lo que Blender trae para 2D, incluido el puente con
Photoshop y Krita (el COA Tools de Blender arma el cut-out desde un PSD). Acá se
leen las CAPAS de esos archivos y cada una vuelve como un PNG con su lugar:

    [{"nombre", "x", "y", "ancho", "alto", "png": bytes, "visible", "opacidad"}]

en el orden de la pila: la primera es la de MÁS ATRÁS (como las capas de LOW).

ORA es un ZIP con stack.xml y un PNG por capa: se toman tal cual.
PSD es binario: se entiende RGB de 8 bits (lo que exporta casi cualquier
programa por defecto), con canales crudos o comprimidos (RLE / PackBits), con
o sin transparencia. Las carpetas de Photoshop se aplanan (sus capas entran
igual). Lo que no se entiende se dice con un error claro, no se adivina.

Sin dependencias: el PNG se arma con zlib.
"""
import struct
import zipfile
import zlib
import io
import xml.etree.ElementTree as ET

TOPE_CAPAS = 400


class ErrorCapas(Exception):
    pass


def png(ancho, alto, rgba):
    """Un PNG RGBA de 8 bits a partir de los píxeles en filas."""
    filas = b"".join(b"\x00" + rgba[y * ancho * 4:(y + 1) * ancho * 4] for y in range(alto))

    def trozo(tipo, datos):
        return struct.pack(">I", len(datos)) + tipo + datos + struct.pack(">I", zlib.crc32(tipo + datos) & 0xFFFFFFFF)
    return (b"\x89PNG\r\n\x1a\n" + trozo(b"IHDR", struct.pack(">IIBBBBB", ancho, alto, 8, 6, 0, 0, 0))
            + trozo(b"IDAT", zlib.compress(filas, 6)) + trozo(b"IEND", b""))


# ── ORA ──────────────────────────────────────────────────────────────────────
def leer_ora(datos):
    try:
        z = zipfile.ZipFile(io.BytesIO(datos))
        raiz = ET.fromstring(z.read("stack.xml"))
    except (zipfile.BadZipFile, KeyError, ET.ParseError) as e:
        raise ErrorCapas("no es un ORA válido: " + str(e))
    ancho, alto = int(raiz.get("w", "0") or 0), int(raiz.get("h", "0") or 0)
    capas = []

    def recorrer(stack, dx, dy, visible_padre):
        # en stack.xml la PRIMERA es la de más adelante: se recorre al revés
        for hijo in reversed(list(stack)):
            x = dx + int(float(hijo.get("x", "0") or 0))
            y = dy + int(float(hijo.get("y", "0") or 0))
            visible = visible_padre and hijo.get("visibility", "visible") != "hidden"
            if hijo.tag == "stack":
                recorrer(hijo, x, y, visible)
            elif hijo.tag == "layer":
                src = hijo.get("src", "")
                if not src or ".." in src or src.startswith("/"):
                    continue
                try:
                    imagen = z.read(src)
                except KeyError:
                    continue
                if imagen[:8] != b"\x89PNG\r\n\x1a\n":
                    continue
                w, h = struct.unpack(">II", imagen[16:24])
                capas.append({"nombre": hijo.get("name", "Capa")[:80], "x": x, "y": y, "ancho": w, "alto": h,
                              "png": imagen, "visible": visible,
                              "opacidad": max(0.0, min(1.0, float(hijo.get("opacity", "1") or 1)))})
                if len(capas) >= TOPE_CAPAS:
                    return

    recorrer(raiz.find("stack") if raiz.tag == "image" else raiz, 0, 0, True)
    return {"ancho": ancho, "alto": alto, "capas": capas}


# ── PSD ──────────────────────────────────────────────────────────────────────
def _packbits(datos, largo):
    out, i = bytearray(), 0
    while i < len(datos) and len(out) < largo:
        n = datos[i]
        i += 1
        if n < 128:
            out += datos[i:i + n + 1]
            i += n + 1
        elif n > 128:
            out += bytes([datos[i]]) * (257 - n)
            i += 1
    return bytes(out[:largo]).ljust(largo, b"\x00")


def leer_psd(datos):
    def u8(o): return datos[o]
    def u16(o): return struct.unpack_from(">H", datos, o)[0]
    def i16(o): return struct.unpack_from(">h", datos, o)[0]
    def u32(o): return struct.unpack_from(">I", datos, o)[0]
    def i32(o): return struct.unpack_from(">i", datos, o)[0]

    if datos[:4] != b"8BPS" or u16(4) != 1:
        raise ErrorCapas("no es un PSD (o es un PSB, que no se lee)")
    alto, ancho, prof, modo = u32(14), u32(18), u16(22), u16(24)
    if prof != 8:
        raise ErrorCapas(f"el PSD es de {prof} bits por canal: exportalo en 8 bits")
    if modo != 3:
        raise ErrorCapas("el PSD no es RGB (es CMYK, escala de grises u otro): convertilo a RGB")
    o = 26
    o += 4 + u32(o)                          # datos del modo de color
    o += 4 + u32(o)                          # recursos de imagen
    fin_capas = o + 4 + u32(o)
    o += 4
    if o >= fin_capas:
        return {"ancho": ancho, "alto": alto, "capas": []}
    o += 4                                   # largo de la info de capas
    cuantas = abs(i16(o))
    o += 2
    registros = []
    for _ in range(cuantas):
        top, left, bottom, right = i32(o), i32(o + 4), i32(o + 8), i32(o + 12)
        o += 16
        nc = u16(o)
        o += 2
        canales = []
        for _c in range(nc):
            canales.append((i16(o), u32(o + 2)))
            o += 6
        o += 4 + 4                           # «8BIM» + modo de fusión
        opacidad, flags = u8(o), u8(o + 2)
        o += 4
        extra = u32(o)
        o += 4
        fin_extra = o + extra
        o += 4 + u32(o)                      # máscara
        o += 4 + u32(o)                      # rangos de fusión
        nl = u8(o)
        nombre = datos[o + 1:o + 1 + nl].decode("latin-1", "replace")
        o += ((1 + nl + 3) // 4) * 4
        carpeta = False
        while o + 12 <= fin_extra:            # info adicional: nombre unicode y carpetas
            clave, largo = datos[o + 4:o + 8], u32(o + 8)
            cuerpo = o + 12
            if clave == b"luni":
                n = u32(cuerpo)
                nombre = datos[cuerpo + 4:cuerpo + 4 + n * 2].decode("utf-16-be", "replace")
            elif clave in (b"lsct", b"lsdk"):
                carpeta = carpeta or u32(cuerpo) in (1, 2, 3)
            o = cuerpo + largo + (largo % 2)
        o = fin_extra
        registros.append({"top": top, "left": left, "alto": bottom - top, "ancho": right - left, "canales": canales,
                          "opacidad": opacidad / 255.0, "visible": not (flags & 2), "nombre": nombre[:80], "carpeta": carpeta})
    capas = []
    for r in registros:
        w, h = r["ancho"], r["alto"]
        planos = {}
        for cid, largo in r["canales"]:
            comp = u16(o)
            cuerpo, fin = o + 2, o + largo
            o = fin
            if cid < -1 or w <= 0 or h <= 0:
                continue                     # máscaras: otras medidas, no se usan
            if comp == 0:
                planos[cid] = datos[cuerpo:cuerpo + w * h].ljust(w * h, b"\x00")
            elif comp == 1:
                cuentas = [u16(cuerpo + 2 * k) for k in range(h)]
                p, filas = cuerpo + 2 * h, []
                for c in cuentas:
                    filas.append(_packbits(datos[p:p + c], w))
                    p += c
                planos[cid] = b"".join(filas)
            else:
                raise ErrorCapas("el PSD usa compresión ZIP en las capas: guardalo sin «maximizar compatibilidad» desactivada o exportá ORA")
        if r["carpeta"] or w <= 0 or h <= 0 or not all(k in planos for k in (0, 1, 2)):
            continue
        a = planos.get(-1, b"\xff" * (w * h))
        rgba = bytearray(w * h * 4)
        rgba[0::4], rgba[1::4], rgba[2::4], rgba[3::4] = planos[0], planos[1], planos[2], a
        capas.append({"nombre": r["nombre"] or "Capa", "x": r["left"], "y": r["top"], "ancho": w, "alto": h,
                      "png": png(w, h, bytes(rgba)), "visible": r["visible"], "opacidad": r["opacidad"]})
        if len(capas) >= TOPE_CAPAS:
            break
    return {"ancho": ancho, "alto": alto, "capas": capas}


def leer(nombre, datos):
    n = nombre.lower()
    if n.endswith(".ora"):
        return leer_ora(datos)
    if n.endswith(".psd"):
        try:
            return leer_psd(datos)
        except (struct.error, IndexError) as e:
            raise ErrorCapas("el PSD está cortado o tiene algo que no se entiende: " + str(e))
    raise ErrorCapas("formato no soportado (sólo PSD y ORA)")
