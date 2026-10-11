"""Convierte un paquete de pinceles DESCARGADO en una biblioteca INCLUIDA de LOW.

Uso:
    python -I tools/armar_biblioteca_incluida.py ARCHIVO --nombre "Autor · Paquete"
        --autor "..." --licencia "CC0 1.0 (dominio público)" --fuente URL
        [--carpeta brushes/]   # en un .tar.gz o .zip, sólo los archivos de esa carpeta

Escribe pinceles/<id>.lowbrush (el mismo formato que «Instalar biblioteca…», más
autor, licencia y fuente). Lo que viene en el paquete se LEE como datos con el
importador de LOW (brush_import.py): no se ejecuta nada de lo descargado.

Cada biblioteca incluida tiene que figurar en pinceles/CREDITOS.md con su
licencia; tools/check_brush_import_backend.py lo controla.
"""
import argparse
import hashlib
import io
import json
import re
import sys
import tarfile
import time
import zipfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
import brush_import  # noqa: E402

FORMATOS = (".abr", ".bundle", ".kpp", ".gbr", ".gih", ".myb", ".brushset", ".brush")


def miembros(ruta: Path, carpeta: str | None):
    """Los archivos de pinceles del paquete: (nombre, bytes). Sin basura de macOS."""
    def sirve(nombre: str) -> bool:
        if "__MACOSX" in nombre or Path(nombre).name.startswith("._"):
            return False
        if carpeta and f"/{carpeta.strip('/')}/" not in "/" + nombre:
            return False
        return nombre.lower().endswith(FORMATOS)
    if ruta.name.endswith((".tar.gz", ".tgz")):
        with tarfile.open(ruta) as t:
            for m in t.getmembers():
                if m.isfile() and sirve(m.name):
                    yield m.name, t.extractfile(m).read()
    elif ruta.suffix.lower() == ".zip":
        with zipfile.ZipFile(ruta) as z:
            for n in z.namelist():
                if not n.endswith("/") and sirve(n):
                    yield n, z.read(n)
    else:
        yield ruta.name, ruta.read_bytes()


def armar(ruta: Path, nombre: str, autor: str, licencia: str, fuente: str, carpeta: str | None) -> Path:
    datos = ruta.read_bytes()
    pinceles = []
    for n, b in miembros(ruta, carpeta):
        try:
            nuevos = brush_import.importar(Path(n).name, b)
        except brush_import.ErrorDeFormato as e:
            print("  no pude leer", n, "·", e)
            continue
        # el nombre de la subcarpeta ayuda a ubicar cada pincel (MyPaint: deevad, ramon, tanda…)
        sub = Path(n).parent.name
        for p in nuevos:
            if p.get("name") and sub and carpeta and sub != carpeta.strip("/").split("/")[-1] and sub.lower() not in p["name"].lower():
                p["name"] = f"{p['name']} · {sub}"[:60]
        pinceles += [p for p in nuevos if isinstance(p, dict) and p.get("name")]
    if not pinceles:
        raise SystemExit("el paquete no trae pinceles utilizables")
    base = re.sub(r"[^a-z0-9]+", "-", nombre.lower().encode("ascii", "ignore").decode()).strip("-")[:40] or "biblioteca"
    id_ = f"{base}-{hashlib.sha1(datos).hexdigest()[:8]}"
    registro = {"id": id_, "name": nombre, "format": ruta.suffix.lstrip(".").lower() or "zip", "source": fuente,
                "installedAt": int(time.time()), "brushes": pinceles, "license": licencia, "author": autor,
                "sha256": hashlib.sha256(datos).hexdigest()}
    destino = RAIZ / "pinceles" / f"{id_}.lowbrush"
    destino.write_text(json.dumps(registro, ensure_ascii=False), encoding="utf-8")
    con_punta = sum(1 for p in pinceles if p.get("tipData"))
    print(f"{destino.name}: {len(pinceles)} pinceles ({con_punta} con punta propia) · {destino.stat().st_size // 1024} KB")
    return destino


if __name__ == "__main__":
    a = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    a.add_argument("archivo")
    a.add_argument("--nombre", required=True)
    a.add_argument("--autor", required=True)
    a.add_argument("--licencia", required=True)
    a.add_argument("--fuente", required=True)
    a.add_argument("--carpeta")
    x = a.parse_args()
    armar(Path(x.archivo), x.nombre, x.autor, x.licencia, x.fuente, x.carpeta)
