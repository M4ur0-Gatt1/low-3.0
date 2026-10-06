"""Smoke del puente real para brushset/ABR y arte vectorial SVG.

AISLADO (oct-2026): desde 3.6.0 importar un pincel lo INSTALA como biblioteca
en la carpeta de datos de LOW. Esta prueba corría con la carpeta del usuario
de verdad y le dejó dos bibliotecas basura («studio») en %APPDATA%/LOW/pinceles.
Ahora APPDATA apunta a una carpeta temporal antes de tocar el puente, y al
final se exige que la carpeta real no haya cambiado."""
import base64
import os
import sys
import tempfile
import zipfile
from pathlib import Path

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


class Window:
    def __init__(self, path):
        self.path = path

    def create_file_dialog(self, *_args, **_kwargs):
        return [str(self.path)]


def main():
    real = os.environ.get("APPDATA")
    real_pinceles = Path(real) / "LOW" / "pinceles" if real else None
    antes = sorted(p.name for p in real_pinceles.glob("*")) if real_pinceles and real_pinceles.is_dir() else []
    with tempfile.TemporaryDirectory(prefix="low-imports-") as folder:
        root = Path(folder)
        os.environ["APPDATA"] = str(root / "appdata")     # data_dir() lee APPDATA en cada llamada
        os.environ["XDG_CONFIG_HOME"] = str(root / "appdata")
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
        from main import Api

        def bridge_for(path):
            bridge = Api.__new__(Api)
            bridge._window = Window(path)
            bridge.ws = str(path.parent)
            return bridge

        svg = root / "illustrator.svg"
        svg.write_text('<svg xmlns="http://www.w3.org/2000/svg"><g id="Layer_1"><path id="a" d="M0 0h1"/><path id="b" d="M1 1h1"/></g></svg>', encoding="utf-8")
        character = bridge_for(svg).import_character_art()
        assert character.get("kind") == "svg" and "Layer_1" in character.get("svg", ""), character

        brushset = root / "studio.brushset"
        with zipfile.ZipFile(brushset, "w") as archive:
            archive.writestr("Brushes/Inker/Shape.png", PNG)
        puente = bridge_for(brushset)
        r = puente.import_brush_pack()
        assert len(r.get("libraries", [])) == 1 and r["libraries"][0]["count"] == 1 and not r.get("errors"), r
        lib = puente.brush_library(r["libraries"][0]["id"])
        assert lib["brushes"][0]["tipData"].startswith("data:image/png"), lib
        instalada = Path(os.environ["APPDATA"]) / "LOW" / "pinceles" / (r["libraries"][0]["id"] + ".lowbrush")
        assert instalada.exists(), "la biblioteca no quedó en la carpeta de datos (la temporal)"

        # un .abr que sólo trae una vista previa PNG (lo que aceptaba el importador viejo)
        abr = root / "legacy.abr"
        abr.write_bytes(b"8BIM-preview" + PNG + b"tail")
        adobe = bridge_for(abr).import_brush_pack()
        assert len(adobe.get("libraries", [])) == 1 and adobe["libraries"][0]["count"] == 1 and adobe["libraries"][0]["format"] == "abr", adobe
        os.environ["APPDATA"] = real or ""

    despues = sorted(p.name for p in real_pinceles.glob("*")) if real_pinceles and real_pinceles.is_dir() else []
    assert antes == despues, f"la prueba tocó la carpeta de pinceles REAL del usuario: {antes} → {despues}"
    print("BACKEND imports OK: SVG, brushset y ABR con preview, instalados en una carpeta temporal")


if __name__ == "__main__":
    main()
