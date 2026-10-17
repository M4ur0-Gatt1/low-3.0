"""Los fondos de las tomas del 3D, como ARCHIVOS al lado del .low.

Pedido de Mauro (v3.30): «exportar imágenes raster para no hacer tan pesado el
flujo… en el 2D traer sólo JPG o PNG, lo más liviano que mantenga calidad».

En memoria, el 2D sigue teniendo cada fondo como `data:` adentro del dibujo
(así lo pintan el lienzo, la cebolla, la vista previa y la exportación sin
cambiar nada). Lo que cambia es el DISCO:

- Al guardar un .low, cada `<image data-low="toma-3d" href="data:…">` se
  escribe como archivo en la carpeta `<nombre>.fondos/` al lado del .low, y
  en el .low queda `href="low-archivo:<nombre>.fondos/<hash>.jpg"`. El nombre
  es el hash del contenido: un fondo repetido es un solo archivo, y volver a
  guardar no reescribe lo que no cambió. Los archivos de esa carpeta que ya no
  usa ningún dibujo se borran (son nuestros, generados).
- Al abrir, cada `low-archivo:` vuelve a ser `data:` leyendo ese archivo. Si
  falta, queda la referencia (el dibujo no se rompe) y se avisa cuántos faltan.

«Guardar como» en otra carpeta funciona solo: el JSON que llega trae las
imágenes adentro, así que se escriben donde va el .low nuevo.
"""
import base64
import hashlib
import re
from pathlib import Path

PREFIJO = "low-archivo:"
_TAG = re.compile(r"<image\b[^>]*>")
# adentro del JSON las comillas del SVG vienen escapadas (\"); en un SVG suelto, no
_MARCA = re.compile(r'data-low=\\?"(?:toma|plano)-3d\\?"')
_HREF_DATA = re.compile(r'href=(\\?")data:image/(jpeg|png);base64,([A-Za-z0-9+/=]+)(\\?")')
_HREF_ARCH = re.compile(r'href=(\\?")' + re.escape(PREFIJO) + r'([^"\\]+)(\\?")')
_NOMBRE_NUESTRO = re.compile(r"^[0-9a-f]{20}\.(jpg|png)$")
_EXT = {"jpeg": "jpg", "png": "png"}
_MIME = {"jpg": "image/jpeg", "png": "image/png"}


def carpeta_de(ruta_low):
    p = Path(ruta_low)
    return p.with_name(p.stem + ".fondos")


def afuera(texto, ruta_low):
    """Devuelve (texto_liviano, cuantos). Si no se puede escribir la carpeta,
    devuelve el texto como vino: nunca se pierde un fondo por guardar."""
    if "toma-3d" not in texto and "plano-3d" not in texto:
        return texto, 0
    carpeta = carpeta_de(ruta_low)
    usados = set()
    escritos = []

    def tag(m):
        t = m.group(0)
        if not _MARCA.search(t):
            return t

        def href(h):
            datos = base64.b64decode(h.group(3))
            nombre = hashlib.sha1(datos).hexdigest()[:20] + "." + _EXT[h.group(2)]
            destino = carpeta / nombre
            if not destino.exists():
                carpeta.mkdir(parents=True, exist_ok=True)
                tmp = destino.with_suffix(destino.suffix + ".tmp")
                tmp.write_bytes(datos)
                tmp.replace(destino)
                escritos.append(destino)
            usados.add(nombre)
            return f"href={h.group(1)}{PREFIJO}{carpeta.name}/{nombre}{h.group(4)}"
        return _HREF_DATA.sub(href, t)

    try:
        nuevo = _TAG.sub(tag, texto)
    except (OSError, ValueError):
        for f in escritos:
            try:
                f.unlink()
            except OSError:
                pass
        return texto, 0
    return nuevo, len(usados)


def podar(ruta_low, texto_guardado):
    """Borra de la carpeta de fondos los archivos NUESTROS que el .low ya no usa."""
    carpeta = carpeta_de(ruta_low)
    if not carpeta.is_dir():
        return 0
    usados = {m.group(2).rsplit("/", 1)[-1] for m in _HREF_ARCH.finditer(texto_guardado)}
    borrados = 0
    for f in carpeta.iterdir():
        if f.is_file() and _NOMBRE_NUESTRO.match(f.name) and f.name not in usados:
            try:
                f.unlink()
                borrados += 1
            except OSError:
                pass
    try:
        if not any(carpeta.iterdir()):
            carpeta.rmdir()
    except OSError:
        pass
    return borrados


def adentro(texto, ruta_low):
    """Devuelve (texto_con_data, faltan)."""
    if PREFIJO not in texto:
        return texto, 0
    base = Path(ruta_low).resolve().parent
    faltan = 0
    cache = {}

    def href(h):
        nonlocal faltan
        rel = h.group(2)
        if rel not in cache:
            f = (base / rel).resolve()
            ext = f.suffix.lower().lstrip(".")
            # sólo archivos de una carpeta *.fondos al lado del .low: nada de ../
            if f.parent.parent != base or not f.parent.name.endswith(".fondos") or ext not in _MIME or not f.is_file():
                cache[rel] = None
            else:
                try:
                    cache[rel] = f"data:{_MIME[ext]};base64," + base64.b64encode(f.read_bytes()).decode("ascii")
                except OSError:
                    cache[rel] = None
        if cache[rel] is None:
            faltan += 1
            return h.group(0)
        return f"href={h.group(1)}{cache[rel]}{h.group(3)}"

    return _HREF_ARCH.sub(href, texto), faltan
