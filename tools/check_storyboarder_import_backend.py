"""Puente real: leer un proyecto .storyboarder del disco.

El proyecto se arma ACÁ, sintético, con el formato que escribe Storyboarder
(JSON + carpeta images/). No se usan sus archivos de ejemplo: Storyboarder no es
software libre y su repositorio no se redistribuye.

Lo que se cuida:
1. Capas en el orden del formato (calco debajo de la tinta) y la opacidad por
   defecto del calco (0.75) cuando el archivo no la dice.
2. Proyectos viejos: el dibujo principal en board.url, sin capa «fill».
3. Sin capas, el posterframe como respaldo.
4. Lo que falta en images/ se DICE, no se inventa.
5. Un nombre de capa con ruta no puede leer fuera de images/.
"""
import base64
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import Api

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 20 + b"\xff\xd9"


class Window:
    def __init__(self, path):
        self.path = path

    def create_file_dialog(self, *_args, **_kwargs):
        return [str(self.path)]


def main():
    with tempfile.TemporaryDirectory(prefix="low-sb-") as folder:
        root = Path(folder)
        (root / "secreto.png").write_bytes(PNG)      # fuera de images/
        images = root / "images"
        images.mkdir()
        for name in ("b1-reference.png", "b1-fill.png", "b1-ink.png", "b2.png",
                     "b3-posterframe.jpg", "a1.wav"):
            (images / name).write_bytes(JPG if name.endswith(".jpg") else PNG)
        project = {
            "version": "2.0.1", "aspectRatio": 1.7777777777777777, "fps": 24,
            "defaultBoardTiming": 2000,
            "boards": [
                {"uid": "AAAAA", "url": "b1.png", "number": 1, "shot": "1A", "newShot": True,
                 "duration": 1500, "dialogue": "Hola", "action": "Entra", "notes": "lento",
                 "audio": {"filename": "a1.wav"},
                 "layers": {"ink": {"url": "b1-ink.png"}, "reference": {"url": "b1-reference.png"},
                            "fill": {"url": "b1-fill.png"}, "tone": {"url": "no-esta.png"}},
                 "sg": {"version": "2.0.1", "data": {"sceneObjects": {"c": {"type": "camera", "fov": 22.25}}}}},
                {"uid": "BBBBB", "url": "b2.png", "number": 2, "shot": "2A",
                 "layers": {"notes": {"url": "../secreto.png"}}},
                {"uid": "CCCCC", "url": "b3.png", "number": 3, "shot": "3A"},
            ],
        }
        fp = root / "escena.storyboarder"
        fp.write_text(json.dumps(project), encoding="utf-8")

        bridge = Api.__new__(Api)
        bridge._window = Window(fp)
        r = bridge.import_storyboarder()
        assert "error" not in r, r
        b1, b2, b3 = r["boards"]

        orden = [c["name"] for c in b1["layers"]]
        assert orden == ["reference", "fill", "ink"], ("orden de capas", orden)
        assert b1["layers"][0]["opacity"] == 0.75, "el calco sin opacidad escrita va al 75%"
        assert b1["duration"] == 1500 and b1["shot"] == "1A" and b1["dialogue"] == "Hola"
        assert b1["audio"] == {"filename": "a1.wav", "found": True}, b1["audio"]
        assert b1["sg"]["data"]["sceneObjects"]["c"]["fov"] == 22.25

        # proyecto viejo: board.url es el dibujo; la nota con ruta NO sale de images/
        assert [c["name"] for c in b2["layers"]] == ["fill"], ("board.url como fill", b2["layers"])
        assert len(b2["layers"]) == 1 and b2["layers"][0]["data"].startswith("data:image/png"), b2["layers"]

        # sin capas: posterframe
        assert not b3["layers"] and b3["posterframe"].startswith("data:image/jpeg"), b3
        # la nota «../secreto.png» se busca SOLO en images/ (y ahí no está); b3.png
        # no es falta porque el posterframe cubre el panel
        assert r["missing"] == ["no-esta.png", "secreto.png"], r["missing"]
        assert r["fps"] == 24 and abs(r["aspectRatio"] - 16 / 9) < 1e-9

        bad = root / "malo.storyboarder"
        bad.write_text('{"nada": 1}', encoding="utf-8")
        bridge._window = Window(bad)
        assert "error" in bridge.import_storyboarder()
    print("STORYBOARDER BACKEND OK: capas en orden, calco 75%, formato viejo, posterframe, faltantes, sin salir de images/")


if __name__ == "__main__":
    main()
