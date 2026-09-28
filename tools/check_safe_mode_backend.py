"""Contrato del host: --safe-mode nunca reabre el último proyecto."""
import tempfile
import sys
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import main


class FakeConfig:
    workspace = ""

    def __init__(self, workspace):
        self.data = {"last_workspace": workspace, "providers": {}}


class NoopImprovement:
    def __init__(self, _path):
        pass


def build(workspace: str, safe: bool):
    with patch.object(main, "Config", lambda: FakeConfig(workspace)), \
         patch.object(main, "SelfImprovementSystem", NoopImprovement), \
         patch.object(main.Api, "_initp", lambda _self: None):
        return main.Api(safe_mode=safe)


def main_test() -> None:
    with tempfile.TemporaryDirectory() as directory:
        normal = build(directory, False)
        assert Path(normal.ws).resolve() == Path(directory).resolve()
        safe = build(directory, True)
        assert safe.ws is None and safe.safe_mode is True
        normal.enter_safe_mode()
        assert normal.ws is None and normal.safe_mode is True
        assert normal.cfg.data["last_workspace"] == directory
    print("SAFE MODE BACKEND OK: no reabre ni borra el último proyecto")


if __name__ == "__main__":
    main_test()
