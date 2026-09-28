"""Smoke del puente real: .low atomico y secuencia PNG en un temporal."""
import base64
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import Api


def main():
    bridge = Api.__new__(Api)
    bridge.ws = None
    bridge._push = lambda *_args, **_kwargs: None
    scene = {
        "scene": {
            "name": "Multiplane smoke",
            "composition": {
                "planes": {
                    "fondo": {
                        "source": {"layerId": "bg", "elementId": "fondo"},
                        "transform": {"x": 0, "y": 0, "z": 180, "rotationZ": 0,
                                      "scaleX": 1, "scaleY": 1},
                        "keys": {"8": {"z": 240, "rotationZ": 12}},
                    }
                }
            },
        }
    }
    # PNG 1×1 real: alcanza para probar la ruta binaria del exportador.
    png = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )
    data_url = "data:image/png;base64," + base64.b64encode(png).decode("ascii")

    with tempfile.TemporaryDirectory(prefix="low-multiplane-") as folder:
        root = Path(folder)
        target = root / "multiplane.low"
        saved = bridge.save_file(str(target), json.dumps(scene, ensure_ascii=False))
        assert saved.get("atomic") is True and target.exists(), saved
        reopened = json.loads(target.read_text(encoding="utf-8"))
        key = reopened["scene"]["composition"]["planes"]["fondo"]["keys"]["8"]
        assert key == {"z": 240, "rotationZ": 12}, key

        exported = bridge.export_anim(str(target), [data_url], 12, "png")
        output = root / "export" / "multiplane_001.png"
        assert exported.get("n") == 1 and output.read_bytes() == png, exported

    print("BACKEND multiplano OK: guardado atómico, reapertura y PNG real")


if __name__ == "__main__":
    main()
