"""Smoke del puente real para brushset/ABR y arte vectorial SVG."""
import base64
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import Api

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


class Window:
    def __init__(self, path):
        self.path = path

    def create_file_dialog(self, *_args, **_kwargs):
        return [str(self.path)]


def bridge_for(path):
    bridge = Api.__new__(Api)
    bridge._window = Window(path)
    bridge.ws = str(path.parent)
    return bridge


def main():
    with tempfile.TemporaryDirectory(prefix="low-imports-") as folder:
        root = Path(folder)
        svg = root / "illustrator.svg"
        svg.write_text('<svg xmlns="http://www.w3.org/2000/svg"><g id="Layer_1"><path id="a" d="M0 0h1"/><path id="b" d="M1 1h1"/></g></svg>', encoding="utf-8")
        character = bridge_for(svg).import_character_art()
        assert character.get("kind") == "svg" and "Layer_1" in character.get("svg", ""), character

        brushset = root / "studio.brushset"
        with zipfile.ZipFile(brushset, "w") as archive:
            archive.writestr("Brushes/Inker/Shape.png", PNG)
        brushes = bridge_for(brushset).import_brush_pack()
        assert brushes.get("count") == 1 and brushes["presets"][0]["tipData"].startswith("data:image/png"), brushes

        abr = root / "legacy.abr"
        abr.write_bytes(b"8BIM-preview" + PNG + b"tail")
        adobe = bridge_for(abr).import_brush_pack()
        assert adobe.get("count") == 1 and adobe.get("format") == "abr", adobe

    print("BACKEND imports OK: SVG, brushset y ABR con preview")


if __name__ == "__main__":
    main()
