"""Importadores de pinceles de otros programas → presets de LOW.

Pedido de Mauro (oct-2026): «quiero que incorpores pinceles de otros
softwares, para instalar bibliotecas como las de Photoshop». Antes, LOW
sólo sacaba de un .abr las imágenes PNG/JPEG que algunos traen de vista
previa: la mayoría de los .abr guardan la PUNTA comprimida (RLE) y LOW los
rechazaba. Y de un .brushset de Procreate tomaba cualquier PNG, sin leer los
ajustes del pincel.

Formatos:
  · Photoshop .abr  v1/v2 (viejos) y v6+ (Photoshop 7 en adelante): puntas
    muestreadas (crudas o RLE PackBits) + el descriptor «desc» con diámetro,
    espaciado, ángulo, redondez y dureza de cada preset.
  · GIMP .gbr (punta) y .gih (punta animada: varias celdas).
  · Krita .bundle (ZIP con presets .kpp y sus puntas) y .kpp suelto.
  · Procreate .brushset / .brush (ZIP; Brush.archive es un plist binario
    NSKeyedArchiver; la punta es Shape.png y el grano Grain.png).
  · MyPaint .myb (JSON de parámetros; sin punta: se usa la redonda).

Todo se normaliza al MISMO contrato de presets de LOW (ver ui/drawing/
brushes.js): {name, engine:"raster", size, spacing, opacity, flow,
pressureSize, pressureOpacity, angle, roundness, hardness, tipData,
tipVariants?, grainData?, sourceFormat}.

Vive aparte de main.py para poder probarlo sin ventana:
tools/check_brush_import_backend.py arma archivos de cada formato y los lee.
"""
from __future__ import annotations

import base64
import io
import json
import plistlib
import re
import struct
import zipfile
import zlib
from pathlib import Path

MAX_PUNTAS = 600
LADO_PUNTA = 256


class ErrorDeFormato(ValueError):
    pass


# ───────────────────────────── utilidades ─────────────────────────────

class Lector:
    """Lectura big-endian (Photoshop y GIMP guardan en big-endian)."""

    def __init__(self, datos: bytes, pos: int = 0):
        self.d = datos
        self.p = pos

    def fin(self) -> bool:
        return self.p >= len(self.d)

    def bytes(self, n: int) -> bytes:
        if n < 0 or self.p + n > len(self.d):
            raise ErrorDeFormato("archivo cortado")
        b = self.d[self.p:self.p + n]
        self.p += n
        return b

    def u8(self) -> int:
        return self.bytes(1)[0]

    def u16(self) -> int:
        return struct.unpack(">H", self.bytes(2))[0]

    def i16(self) -> int:
        return struct.unpack(">h", self.bytes(2))[0]

    def u32(self) -> int:
        return struct.unpack(">I", self.bytes(4))[0]

    def i32(self) -> int:
        return struct.unpack(">i", self.bytes(4))[0]

    def f64(self) -> float:
        return struct.unpack(">d", self.bytes(8))[0]

    def saltar(self, n: int) -> None:
        self.bytes(n)

    def unicode(self) -> str:
        n = self.u32()
        s = self.bytes(n * 2).decode("utf-16-be", "replace")
        return s.rstrip("\x00")

    def pascal(self) -> str:
        n = self.u8()
        return self.bytes(n).decode("latin-1", "replace")

    def clave(self) -> str:
        """Clave de un descriptor de Photoshop: largo (0 → 4 letras) + texto."""
        n = self.u32()
        return self.bytes(n if n else 4).decode("latin-1", "replace")


def packbits(datos: bytes, largo: int) -> bytes:
    """Descompresión PackBits (la RLE de Photoshop) de UNA línea."""
    out = bytearray()
    i = 0
    while i < len(datos) and len(out) < largo:
        n = datos[i]
        i += 1
        if n < 128:
            out += datos[i:i + n + 1]
            i += n + 1
        elif n > 128:
            out += bytes([datos[i]]) * (257 - n)
            i += 1
        # 128: no hace nada
    return bytes(out[:largo]).ljust(largo, b"\x00")


def punta_png(mascara: bytes, ancho: int, alto: int, invertir: bool = False) -> str:
    """Una máscara de 8 bits (255 = tinta) → PNG transparente negro, como data
    URL. LOW tiñe la punta con el color del trazo."""
    from PIL import Image
    img = Image.frombytes("L", (ancho, alto), mascara)
    if invertir:
        from PIL import ImageOps
        img = ImageOps.invert(img)
    if max(ancho, alto) > LADO_PUNTA:
        img.thumbnail((LADO_PUNTA, LADO_PUNTA), Image.Resampling.LANCZOS)
    # centrada en un cuadrado: el motor estampa la punta en una caja cuadrada
    lado = max(img.size)
    lienzo = Image.new("L", (lado, lado), 0)
    lienzo.paste(img, ((lado - img.size[0]) // 2, (lado - img.size[1]) // 2))
    rgba = Image.new("RGBA", (lado, lado), (0, 0, 0, 0))
    rgba.putalpha(lienzo)
    out = io.BytesIO()
    rgba.save(out, format="PNG", optimize=True)
    return "data:image/png;base64," + base64.b64encode(out.getvalue()).decode("ascii")


def punta_de_imagen(blob: bytes, tinta_oscura: bool = True) -> str:
    """PNG/JPEG de una punta → máscara. Muchos packs guardan tinta NEGRA sobre
    blanco (Photoshop, Procreate) y otros usan alfa real: se unifican."""
    from PIL import Image, ImageChops, ImageOps
    img = Image.open(io.BytesIO(blob)).convert("RGBA")
    lum = ImageOps.grayscale(img.convert("RGB"))
    alfa = img.getchannel("A")
    # ¿es «blanco = tinta» sobre negro (Procreate Shape.png)? se detecta por el borde
    if not tinta_oscura:
        tinta = lum
    else:
        tinta = ImageOps.invert(lum)
    mascara = ImageChops.multiply(tinta, alfa)
    return punta_png(mascara.tobytes(), *mascara.size)


def preset(nombre: str, tip: str | None, formato: str, **ajustes) -> dict:
    p = {"name": (nombre or "Pincel").strip()[:60] or "Pincel", "engine": "raster", "size": 36, "opacity": 1,
         "flow": .8, "spacing": .12, "pressureSize": .7, "pressureOpacity": .2, "hardness": .8,
         # una punta importada NO gira con el trazo (Photoshop y Krita no lo hacen
         # salvo que el preset lo pida): un árbol o una casa quedan derechos
         "angleFollowsStroke": False, "sourceFormat": formato}
    if tip:
        p["tipData"] = tip
    for k, v in ajustes.items():
        if v is not None:
            p[k] = v
    return p


def acotar(v, a, b):
    try:
        return max(a, min(b, float(v)))
    except (TypeError, ValueError):
        return None


# ───────────────────────────── Photoshop .abr ─────────────────────────────

def _abr_muestra(r: Lector, alto_rle: bool = True):
    """Una punta muestreada: caja, profundidad, compresión y datos."""
    top, left, bottom, right = r.i32(), r.i32(), r.i32(), r.i32()
    depth = r.u16()
    comp = r.u8()
    ancho, alto = right - left, bottom - top
    if not (0 < ancho <= 5000 and 0 < alto <= 5000) or depth not in (8, 16):
        raise ErrorDeFormato(f"punta inválida {ancho}x{alto}x{depth}")
    bpp = depth // 8
    if comp == 0:
        datos = r.bytes(ancho * alto * bpp)
    else:
        largos = [r.u16() for _ in range(alto)]
        filas = [packbits(r.bytes(n), ancho * bpp) for n in largos]
        datos = b"".join(filas)
    if bpp == 2:  # 16 bits: el byte alto
        datos = datos[0::2]
    return ancho, alto, datos


def _abr_v12(datos: bytes, version: int) -> list[dict]:
    """ABR viejos (Photoshop ≤ 6): una lista de pinceles computados o muestreados."""
    r = Lector(datos, 2)
    cuantos = r.u16()
    out = []
    for i in range(cuantos):
        tipo = r.u16()
        largo = r.u32()
        siguiente = r.p + largo
        if tipo == 2:  # muestreado
            r.saltar(4)                       # misc
            espaciado = r.u16()
            nombre = r.unicode() if version == 2 else f"Pincel {i + 1}"
            r.saltar(1)                       # antialias
            r.saltar(8)                       # caja corta (ignorada: viene la larga)
            ancho, alto, m = _abr_muestra(r)
            out.append(preset(nombre, punta_png(m, ancho, alto), "abr", size=float(max(ancho, alto)),
                              spacing=acotar(espaciado / 100, .01, 2) or .12))
        elif tipo == 1:  # computado: redondo con dureza
            r.saltar(4)
            diametro = r.u16(); redondez = r.u16(); angulo = r.u16(); dureza = r.u16()
            out.append(preset(f"Redondo {diametro}", None, "abr", size=float(diametro or 20),
                              roundness=acotar(redondez / 100, .05, 1), angle=float(angulo),
                              hardness=acotar(dureza / 100, 0, 1)))
        r.p = siguiente
        if len(out) >= MAX_PUNTAS:
            break
    return out


def _desc_valor(r: Lector, tipo: str):
    if tipo == "Objc" or tipo == "GlbO":
        return _desc_objeto(r)
    if tipo == "VlLs":
        n = r.u32()
        return [_desc_valor(r, r.bytes(4).decode("latin-1")) for _ in range(n)]
    if tipo == "doub":
        return r.f64()
    if tipo == "UntF":
        r.saltar(4)
        return r.f64()
    if tipo == "UnFl":
        r.saltar(4); n = r.u32()
        return [r.f64() for _ in range(n)]
    if tipo == "TEXT":
        return r.unicode()
    if tipo == "enum":
        r.clave(); return r.clave()
    if tipo == "long":
        return r.i32()
    if tipo == "comp":
        return struct.unpack(">q", r.bytes(8))[0]
    if tipo == "bool":
        return bool(r.u8())
    if tipo == "type" or tipo == "GlbC":
        r.unicode(); return r.clave()
    if tipo == "tdta":
        return r.bytes(r.u32())
    if tipo == "obj ":
        n = r.u32()
        for _ in range(n):
            t = r.bytes(4).decode("latin-1")
            if t == "Enmr":
                r.unicode(); r.clave(); r.clave(); r.clave()
            elif t == "Clss":
                r.unicode(); r.clave()
            elif t == "prop":
                r.unicode(); r.clave(); r.clave()
            else:
                raise ErrorDeFormato("referencia desconocida " + t)
        return None
    if tipo == "alis" or tipo == "Pth ":
        return r.bytes(r.u32())
    raise ErrorDeFormato("tipo de descriptor desconocido: " + repr(tipo))


def _desc_objeto(r: Lector) -> dict:
    nombre = r.unicode()
    clase = r.clave()
    n = r.u32()
    out = {"_clase": clase, "_nombre": nombre}
    for _ in range(n):
        k = r.clave()
        t = r.bytes(4).decode("latin-1")
        out[k] = _desc_valor(r, t)
    return out


def _abr_ajustes(desc: dict) -> list[dict]:
    """De la lista «Brsh» del descriptor: nombre, diámetro, espaciado, ángulo,
    redondez, dureza y a qué punta muestreada apunta (sampledData)."""
    lista = desc.get("Brsh") or []
    out = []
    for item in lista if isinstance(lista, list) else []:
        if not isinstance(item, dict):
            continue
        b = item.get("Brsh") if isinstance(item.get("Brsh"), dict) else {}
        out.append({
            "name": item.get("Nm  ") or b.get("Nm  ") or "",
            "sampled": b.get("sampledData"),
            "size": b.get("Dmtr"),
            "spacing": (b.get("Spcn") / 100) if isinstance(b.get("Spcn"), (int, float)) else None,
            "angle": b.get("Angl"),
            "roundness": (b.get("Rndn") / 100) if isinstance(b.get("Rndn"), (int, float)) else None,
            "hardness": (b.get("Hrdn") / 100) if isinstance(b.get("Hrdn"), (int, float)) else None,
        })
    return out


def _abr_v6(datos: bytes) -> list[dict]:
    r = Lector(datos, 2)
    subversion = r.u16()
    muestras = {}   # id de la muestra → (ancho, alto, máscara)
    orden = []
    ajustes = []
    while not r.fin():
        if r.p + 12 > len(datos):
            break
        firma = r.bytes(4)
        if firma != b"8BIM":
            break
        seccion = r.bytes(4).decode("latin-1")
        largo = r.u32()
        fin = r.p + largo
        if seccion == "samp":
            while r.p < fin and len(orden) < MAX_PUNTAS * 2:
                tam = r.u32()
                inicio = r.p
                proximo = inicio + ((tam + 3) & ~3)
                try:
                    clave = r.pascal().lstrip("$")   # el uuid de la muestra
                    # de ahí a la caja hay un tramo FIJO según la subversión de 6
                    # (47 bytes en 6.1, 301 en 6.2, contados desde el comienzo
                    # del pincel: los mismos que usa el lector de GIMP)
                    r.p = inicio + (47 if subversion == 1 else 301)
                    muestra = _abr_muestra(r)
                    muestras[clave] = muestra
                    orden.append(clave)
                except ErrorDeFormato:
                    pass
                r.p = proximo
        elif seccion == "desc":
            try:
                r.saltar(4)                     # versión del descriptor (16)
                ajustes = _abr_ajustes(_desc_objeto(r))
            except (ErrorDeFormato, struct.error, UnicodeDecodeError):
                ajustes = []
        r.p = fin
    if not muestras and not ajustes:
        raise ErrorDeFormato("el .abr no tiene puntas")
    out = []
    usadas = set()
    for a in ajustes:
        clave = (a.get("sampled") or "").lstrip("$") or None
        m = muestras.get(clave) if clave else None
        if clave and not m:
            continue
        tip = punta_png(m[2], m[0], m[1]) if m else None
        if m:
            usadas.add(clave)
        out.append(preset(a["name"] or f"Pincel {len(out) + 1}", tip, "abr",
                          size=acotar(a["size"], .5, 2500) or (float(max(m[0], m[1])) if m else 30.0),
                          spacing=acotar(a["spacing"], .01, 10), angle=acotar(a["angle"], -360, 360),
                          roundness=acotar(a["roundness"], .05, 1), hardness=acotar(a["hardness"], 0, 1)))
        if len(out) >= MAX_PUNTAS:
            break
    # puntas sin preset en el descriptor: igual se importan
    for clave in orden:
        if clave in usadas or len(out) >= MAX_PUNTAS:
            continue
        a, h, m = muestras[clave]
        out.append(preset(f"Punta {len(out) + 1}", punta_png(m, a, h), "abr", size=float(max(a, h))))
    return out


def _abr_previews(datos: bytes, nombre: str = "Punta") -> list[dict]:
    """Último recurso: imágenes PNG/JPEG enteras metidas en el archivo (algunos
    .abr traen vistas previas así). Es lo único que leía el importador viejo:
    se sigue aceptando cuando la estructura no se puede leer."""
    out, cursor = [], 0
    while len(out) < MAX_PUNTAS:
        png, jpg = datos.find(b"\x89PNG\r\n\x1a\n", cursor), datos.find(b"\xff\xd8\xff", cursor)
        inicios = [(p, k) for p, k in ((png, "png"), (jpg, "jpg")) if p >= 0]
        if not inicios:
            break
        inicio, tipo = min(inicios)
        if tipo == "png":
            fin = datos.find(b"IEND\xaeB`\x82", inicio); fin = fin + 8 if fin >= 0 else -1
        else:
            fin = datos.find(b"\xff\xd9", inicio + 3); fin = fin + 2 if fin >= 0 else -1
        if fin <= inicio:
            break
        try:
            out.append(preset(f"{nombre} {len(out) + 1}", punta_de_imagen(datos[inicio:fin]), "abr"))
        except Exception:  # noqa: BLE001 — una vista previa rota no frena las demás
            pass
        cursor = fin
    return out


def leer_abr(datos: bytes) -> list[dict]:
    if len(datos) < 4:
        raise ErrorDeFormato("archivo vacío")
    version = struct.unpack(">H", datos[:2])[0]
    try:
        if version in (1, 2):
            return _abr_v12(datos, version)
        if version in (6, 7, 10):
            return _abr_v6(datos)
        raise ErrorDeFormato(f"versión de ABR {version} desconocida")
    except (ErrorDeFormato, struct.error) as e:
        previas = _abr_previews(datos)
        if previas:
            return previas
        raise ErrorDeFormato(str(e)) from e


# ───────────────────────────── GIMP .gbr / .gih ─────────────────────────────

def _gbr(datos: bytes, pos: int = 0):
    r = Lector(datos, pos)
    largo_cab = r.u32()
    version = r.u32()
    ancho, alto, bytes_px = r.u32(), r.u32(), r.u32()
    if version == 1:
        espaciado, nombre_len = 25, largo_cab - 20
        nombre = r.bytes(nombre_len)
    else:
        if r.bytes(4) != b"GIMP":
            raise ErrorDeFormato("no es un pincel de GIMP")
        espaciado = r.u32()
        nombre = r.bytes(largo_cab - 28)
    if not (0 < ancho <= 5000 and 0 < alto <= 5000) or bytes_px not in (1, 4):
        raise ErrorDeFormato("pincel de GIMP inválido")
    crudo = r.bytes(ancho * alto * bytes_px)
    if bytes_px == 4:
        # RGBA: la forma suele estar en el ALFA. Pero hay celdas OPACAS (tinta
        # oscura sobre fondo claro, alfa entero en 255): ahí la forma es la
        # LUMINANCIA invertida. Medido con el bundle de David Revoy: tomando
        # siempre el alfa, esas puntas salían como cuadrados negros.
        alfa = crudo[3::4]
        if min(alfa) > 250:
            mascara = bytes(255 - (crudo[i] * 299 + crudo[i + 1] * 587 + crudo[i + 2] * 114) // 1000 for i in range(0, len(crudo), 4))
        else:
            mascara = alfa
    else:
        mascara = crudo
    nombre = nombre.split(b"\x00")[0].decode("utf-8", "replace") or "Pincel de GIMP"
    return nombre, espaciado, ancho, alto, mascara, r.p


def leer_gbr(datos: bytes) -> list[dict]:
    nombre, esp, a, h, m, _ = _gbr(datos)
    return [preset(nombre, punta_png(m, a, h), "gbr", size=float(max(a, h)), spacing=acotar(esp / 100, .01, 10))]


def leer_gih(datos: bytes) -> list[dict]:
    """Punta animada: varias celdas. LOW las usa como VARIANTES (una al azar
    en cada sello), como las hojas de un pincel de follaje."""
    fin_nombre = datos.index(b"\n")
    nombre = datos[:fin_nombre].decode("utf-8", "replace")
    fin_params = datos.index(b"\n", fin_nombre + 1)
    pos = fin_params + 1
    celdas = []
    esp = 25
    while pos < len(datos) and len(celdas) < MAX_PUNTAS:
        _, esp, a, h, m, pos = _gbr(datos, pos)
        celdas.append(punta_png(m, a, h))
    if not celdas:
        raise ErrorDeFormato("el .gih no tiene celdas")
    p = preset(nombre, celdas[0], "gih", spacing=acotar(esp / 100, .01, 10), angleFollowsStroke=False)
    if len(celdas) > 1:
        p["tipVariants"] = celdas
    return [p]


# ───────────────────────────── Krita .kpp / .bundle ─────────────────────────────

def _png_textos(datos: bytes) -> dict:
    """Los fragmentos de texto (tEXt/zTXt/iTXt) de un PNG: ahí guarda Krita el preset."""
    if datos[:8] != b"\x89PNG\r\n\x1a\n":
        raise ErrorDeFormato("no es PNG")
    pos, out = 8, {}
    while pos + 8 <= len(datos):
        largo = struct.unpack(">I", datos[pos:pos + 4])[0]
        tipo = datos[pos + 4:pos + 8]
        cuerpo = datos[pos + 8:pos + 8 + largo]
        if tipo == b"tEXt" and b"\x00" in cuerpo:
            k, v = cuerpo.split(b"\x00", 1); out[k.decode("latin-1")] = v.decode("utf-8", "replace")
        elif tipo == b"zTXt" and b"\x00" in cuerpo:
            k, v = cuerpo.split(b"\x00", 1); out[k.decode("latin-1")] = zlib.decompress(v[1:]).decode("utf-8", "replace")
        elif tipo == b"iTXt" and b"\x00" in cuerpo:
            k, resto = cuerpo.split(b"\x00", 1)
            comprimido = resto[0]
            resto = resto[2:]
            _, resto = resto.split(b"\x00", 1)   # idioma
            _, texto = resto.split(b"\x00", 1)   # clave traducida
            out[k.decode("latin-1")] = (zlib.decompress(texto) if comprimido else texto).decode("utf-8", "replace")
        elif tipo == b"IEND":
            break
        pos += 12 + largo
    return out


def _kpp_ajustes(xml: str) -> dict:
    """Del XML del preset de Krita: nombre, tamaño, espaciado, ángulo, redondez,
    dureza y el archivo de la punta (brush_definition)."""
    out = {}
    m = re.search(r'<Preset[^>]*\bname="([^"]*)"', xml)
    if m:
        out["name"] = m.group(1)
    m = re.search(r'name="brush_definition"[^>]*>\s*<!\[CDATA\[(.*?)\]\]>', xml, re.S)
    defin = m.group(1) if m else ""
    if not defin:
        m = re.search(r'name="brush_definition"[^>]*>(.*?)</param>', xml, re.S)
        if m:
            import html
            defin = html.unescape(m.group(1))
    def atr(nombre, texto):
        mm = re.search(r'\b' + nombre + r'="([^"]*)"', texto)
        return mm.group(1) if mm else None
    out["tipo"] = atr("type", defin)
    out["archivo"] = atr("filename", defin)
    out["spacing"] = acotar(atr("spacing", defin), .01, 10)
    out["angle"] = acotar(atr("angle", defin), -360, 360)
    gen = re.search(r"<MaskGenerator([^>]*)>", defin)
    if gen:
        g = gen.group(1)
        out["size"] = acotar(atr("diameter", g), .5, 2500)
        out["roundness"] = acotar(atr("ratio", g), .05, 1)
        hfade = acotar(atr("hfade", g), 0, 1)
        if hfade is not None:
            out["hardness"] = 1 - hfade
    tam = re.search(r'name="(?:size|brush_size)"[^>]*>\s*(?:<!\[CDATA\[)?\s*([\d.]+)', xml)
    if tam and not out.get("size"):
        out["size"] = acotar(tam.group(1), .5, 2500)
    if out.get("size") is None:
        d = atr("diameter", defin)
        out["size"] = acotar(d, .5, 2500)
    return out


def leer_kpp(datos: bytes, recursos: dict | None = None) -> list[dict]:
    textos = _png_textos(datos)
    xml = textos.get("preset") or ""
    if not xml:
        raise ErrorDeFormato("el .kpp no trae su preset")
    a = _kpp_ajustes(xml)
    tip, variantes = None, None
    archivo = (a.get("archivo") or "").split("/")[-1]
    if archivo and recursos:
        blob = recursos.get(archivo.lower())
        if blob is not None:
            try:
                if archivo.lower().endswith(".gbr"):
                    _, _, w, h, m, _ = _gbr(blob)
                    tip = punta_png(m, w, h)
                elif archivo.lower().endswith(".gih"):
                    # punta ANIMADA: todas sus celdas, una al azar en cada sello
                    g = leer_gih(blob)[0]
                    tip, variantes = g.get("tipData"), g.get("tipVariants")
                else:
                    tip = punta_de_imagen(blob)
            except Exception:
                tip = None
    p = preset(a.get("name") or "Preset de Krita", tip, "kpp", size=a.get("size") or 30.0,
               spacing=a.get("spacing"), angle=a.get("angle"), roundness=a.get("roundness"),
               hardness=a.get("hardness"))
    if variantes:
        p["tipVariants"] = variantes
        p["angleFollowsStroke"] = False
    return [p]


def leer_bundle(datos: bytes) -> list[dict]:
    with zipfile.ZipFile(io.BytesIO(datos)) as z:
        recursos = {}
        for n in z.namelist():
            if n.lower().startswith("brushes/") and not n.endswith("/"):
                recursos[Path(n).name.lower()] = z.read(n)
        out = []
        for n in z.namelist():
            if n.lower().endswith(".kpp") and len(out) < MAX_PUNTAS:
                try:
                    out += leer_kpp(z.read(n), recursos)
                except Exception:
                    continue
        # puntas sueltas del bundle que ningún preset usó
        if not out:
            for nombre, blob in list(recursos.items())[:MAX_PUNTAS]:
                try:
                    out += leer_gbr(blob) if nombre.endswith(".gbr") else [preset(Path(nombre).stem, punta_de_imagen(blob), "bundle")]
                except Exception:
                    continue
    if not out:
        raise ErrorDeFormato("el bundle no trae pinceles")
    return out


# ───────────────────────────── Procreate .brushset / .brush ─────────────────────────────

def _nskeyed(datos: bytes) -> dict:
    """Un NSKeyedArchiver (plist binario) → diccionario plano de valores simples."""
    pl = plistlib.loads(datos)
    objetos = pl.get("$objects") or []
    raiz = pl.get("$top", {}).get("root")

    def resolver(v, prof=0):
        if prof > 6:
            return None
        if isinstance(v, plistlib.UID):
            v = objetos[v.data] if v.data < len(objetos) else None
            return resolver(v, prof + 1)
        if isinstance(v, dict) and "NS.keys" in v and "NS.objects" in v:
            return {resolver(k, prof + 1): resolver(o, prof + 1) for k, o in zip(v["NS.keys"], v["NS.objects"])}
        if isinstance(v, dict) and "NS.string" in v:
            return v["NS.string"]
        return v
    r = resolver(raiz)
    if not isinstance(r, dict):
        raise ErrorDeFormato("Brush.archive ilegible")
    out = {}
    for k, v in r.items():
        if isinstance(k, str) and not k.startswith("$"):
            out[k] = resolver(v) if isinstance(v, plistlib.UID) else v
    return out


def _procreate_un_pincel(archivos: dict, carpeta: str, nombre_defecto: str) -> dict | None:
    pre = carpeta + "/" if carpeta else ""
    forma = archivos.get(pre + "Shape.png")
    if forma is None:
        return None
    ajustes = {}
    if (pre + "Brush.archive") in archivos:
        try:
            ajustes = _nskeyed(archivos[pre + "Brush.archive"])
        except Exception:
            ajustes = {}
    # en Procreate la forma es BLANCO = tinta sobre negro
    tip = punta_de_imagen(forma, tinta_oscura=False)
    grano = archivos.get(pre + "Grain.png")
    nombre = ajustes.get("name") if isinstance(ajustes.get("name"), str) else nombre_defecto
    max_tam = acotar(ajustes.get("maxSize"), 0, 10)
    p = preset(nombre, tip, "brushset",
               size=(max_tam * 120) if max_tam else None,
               spacing=acotar(ajustes.get("plotSpacing"), .01, 10),
               opacity=acotar(ajustes.get("maxOpacity", ajustes.get("paintOpacity")), 0, 1),
               pressureSize=acotar(ajustes.get("dynamicsPressureSize"), 0, 1),
               pressureOpacity=acotar(ajustes.get("dynamicsPressureOpacity"), 0, 1),
               scatter=acotar(ajustes.get("plotJitter"), 0, 2),
               angle=acotar(ajustes.get("shapeRotation"), -360, 360))
    if grano is not None:
        try:
            p["grainData"] = punta_de_imagen(grano, tinta_oscura=False)
        except Exception:
            pass
    return p


def leer_brushset(datos: bytes) -> list[dict]:
    with zipfile.ZipFile(io.BytesIO(datos)) as z:
        archivos = {n: z.read(n) for n in z.namelist() if not n.endswith("/") and z.getinfo(n).file_size < 40_000_000}
    carpetas = sorted({n.rsplit("/", 1)[0] if "/" in n else "" for n in archivos if n.endswith("Shape.png")})
    out = []
    for c in carpetas:
        p = _procreate_un_pincel(archivos, c, f"Pincel {len(out) + 1}")
        if p:
            out.append(p)
        if len(out) >= MAX_PUNTAS:
            break
    if not out:
        raise ErrorDeFormato("el archivo de Procreate no trae pinceles (Shape.png)")
    return out


# ───────────────────────────── MyPaint .myb ─────────────────────────────

def leer_myb(datos: bytes) -> list[dict]:
    j = json.loads(datos.decode("utf-8-sig"))
    s = j.get("settings", {})
    base = lambda k, d=None: (s.get(k) or {}).get("base_value", d)
    import math
    radio = base("radius_logarithmic", 1.0)
    return [preset(j.get("comment") or "Pincel de MyPaint", None, "myb",
                   size=acotar(2 * math.exp(radio), .5, 600) if radio is not None else None,
                   hardness=acotar(base("hardness"), 0, 1), opacity=acotar(base("opaque"), 0, 1),
                   spacing=acotar(1 / max(.1, base("dabs_per_actual_radius", 2.0) or 2.0), .01, 2))]


# ───────────────────────────── entrada ─────────────────────────────

def leer_zip(datos: bytes) -> list[dict]:
    """Un .zip tal como se descarga (bibliotecas de Photoshop, Krita…): se leen
    los archivos de pinceles que trae adentro (no la basura de macOS)."""
    out = []
    with zipfile.ZipFile(io.BytesIO(datos)) as z:
        for n in z.namelist():
            nombre = Path(n).name
            if n.endswith("/") or "__MACOSX" in n or nombre.startswith("._"):
                continue
            suf = Path(n).suffix.lower()
            if suf not in LECTORES or suf == ".zip":
                continue
            try:
                out += LECTORES[suf](z.read(n))
            except Exception:  # noqa: BLE001 — un archivo malo no tumba el paquete
                continue
            if len(out) >= MAX_PUNTAS:
                break
    if not out:
        raise ErrorDeFormato("el .zip no trae pinceles que LOW sepa leer")
    return out[:MAX_PUNTAS]


LECTORES = {".abr": leer_abr, ".gbr": leer_gbr, ".gih": leer_gih, ".kpp": leer_kpp, ".bundle": leer_bundle,
            ".brushset": leer_brushset, ".brush": leer_brushset, ".myb": leer_myb, ".zip": leer_zip}


def importar(nombre_archivo: str, datos: bytes) -> list[dict]:
    """Lee un archivo de pinceles de cualquier formato conocido."""
    sufijo = Path(nombre_archivo).suffix.lower()
    lector = LECTORES.get(sufijo)
    if not lector:
        raise ErrorDeFormato(f"formato {sufijo} desconocido")
    presets = lector(datos)
    for p in presets:
        p.setdefault("sourceFormat", sufijo.lstrip("."))
    return presets[:MAX_PUNTAS]


# ───────────────────────────── bibliotecas instaladas ─────────────────────────────

class Bibliotecas:
    """Las bibliotecas de pinceles INSTALADAS: un archivo JSON por biblioteca en
    la carpeta de datos de LOW (%APPDATA%/LOW/pinceles). No van al almacén del
    navegador: ahí entran unos 5 MB y una biblioteca de Photoshop con cientos
    de puntas no cabe."""

    def __init__(self, carpeta: Path, incluidas: Path | None = None):
        self.carpeta = Path(carpeta)
        # las INCLUIDAS vienen con LOW (carpeta pinceles/ del programa): no se
        # borran, se ocultan (ocultas.json en la carpeta del usuario)
        self.incluidas = Path(incluidas) if incluidas else None

    def _ocultas(self) -> set:
        try:
            return set(json.loads((self.carpeta / "ocultas.json").read_text(encoding="utf-8")))
        except (OSError, ValueError):
            return set()

    def _ruta(self, id_: str) -> Path:
        if not re.fullmatch(r"[a-z0-9-]{1,80}", id_ or ""):
            raise ErrorDeFormato("biblioteca inválida")
        return self.carpeta / f"{id_}.lowbrush"

    def instalar(self, nombre_archivo: str, datos: bytes, nombre: str | None = None, origen: str | None = None) -> dict:
        sufijo = Path(nombre_archivo).suffix.lower()
        if sufijo in (".lowbrush", ".json"):
            j = json.loads(datos.decode("utf-8-sig"))
            pinceles = j.get("brushes", j if isinstance(j, list) else [j])
            nombre = nombre or j.get("name")
            formato = j.get("format") or "lowbrush"
        elif sufijo in (".png", ".jpg", ".jpeg", ".webp"):
            pinceles = [preset(Path(nombre_archivo).stem, punta_de_imagen(datos), sufijo.lstrip("."))]
            formato = sufijo.lstrip(".")
        else:
            pinceles = importar(nombre_archivo, datos)
            formato = sufijo.lstrip(".")
        pinceles = [p for p in pinceles if isinstance(p, dict) and p.get("name")]
        if not pinceles:
            raise ErrorDeFormato("el archivo no trae pinceles utilizables")
        import hashlib
        import time
        nombre = (nombre or Path(nombre_archivo).stem).strip()[:60] or "Biblioteca"
        base = re.sub(r"[^a-z0-9]+", "-", nombre.lower().encode("ascii", "ignore").decode()).strip("-")[:40] or "biblioteca"
        id_ = f"{base}-{hashlib.sha1(datos).hexdigest()[:8]}"
        registro = {"id": id_, "name": nombre, "format": formato, "source": origen or Path(nombre_archivo).name,
                    "installedAt": int(time.time()), "brushes": pinceles}
        self.carpeta.mkdir(parents=True, exist_ok=True)
        self._ruta(id_).write_text(json.dumps(registro, ensure_ascii=False), encoding="utf-8")
        return {"id": id_, "name": nombre, "format": formato, "count": len(pinceles)}

    def listar(self) -> list[dict]:
        out, vistos, ocultas = [], set(), self._ocultas()
        for carpeta, incluida in ((self.carpeta, False), (self.incluidas, True)):
            if not carpeta or not carpeta.is_dir():
                continue
            for f in sorted(carpeta.glob("*.lowbrush")):
                try:
                    j = json.loads(f.read_text(encoding="utf-8"))
                    if j["id"] in vistos or (incluida and j["id"] in ocultas):
                        continue
                    vistos.add(j["id"])
                    out.append({"id": j["id"], "name": j.get("name") or j["id"], "format": j.get("format"),
                                "count": len(j.get("brushes") or []), "source": j.get("source"),
                                "license": j.get("license"), "author": j.get("author"), "builtin": incluida})
                except (OSError, ValueError, KeyError):
                    continue
        return out

    def cargar(self, id_: str) -> dict:
        r = self._ruta(id_)
        if not r.exists() and self.incluidas and (self.incluidas / r.name).exists():
            r = self.incluidas / r.name
        return json.loads(r.read_text(encoding="utf-8"))

    def quitar(self, id_: str) -> bool:
        r = self._ruta(id_)
        if r.exists():
            r.unlink()
            return True
        # una incluida no se borra del programa: se oculta
        if self.incluidas and (self.incluidas / r.name).exists():
            ocultas = self._ocultas() | {id_}
            self.carpeta.mkdir(parents=True, exist_ok=True)
            (self.carpeta / "ocultas.json").write_text(json.dumps(sorted(ocultas)), encoding="utf-8")
            return True
        return False
