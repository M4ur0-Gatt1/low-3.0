"""La papelera del proyecto: las cuatro promesas de `trash_design`.

POR QUE EXISTE ESTE ARCHIVO. Haciendo el inventario de capacidades (A01 del plan
maestro) busque quien probaba «Mover documento a la papelera…» y la respuesta fue
NADIE: ni un guard de navegador, ni un contrato, ni una prueba de puente. Es la
UNICA accion destructiva del modulo 2D —mueve un archivo del trabajo de alguien—
y no tenia una sola comprobacion automatica.

El codigo del puente esta bien escrito y promete cuatro cosas en su docstring.
Esto las prueba, una por una, sobre un proyecto de prueba en una carpeta
temporal. No toca nada del proyecto de nadie.
"""
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import Api


def bridge_for(base):
    """El puente con lo mínimo para que `trash_design` funcione.

    `_base()` resuelve el workspace, y `_push` avisa a la interfaz: acá se
    reemplaza por un contador, porque lo que se prueba es el movimiento del
    archivo y no el aviso.
    """
    bridge = Api.__new__(Api)
    bridge.ws = str(base)
    bridge._window = None
    bridge.avisos = []
    bridge._push = lambda canal, datos: bridge.avisos.append(canal)
    bridge._tree = lambda: {}
    bridge._git_branch = lambda: ""
    return bridge


def main():
    with tempfile.TemporaryDirectory(prefix="low-papelera-") as folder:
        base = Path(folder)
        (base / "disenos").mkdir()
        puente = bridge_for(base)

        # ── 1. NUNCA BORRA DEFINITIVAMENTE: mueve a .low-trash y devuelve donde
        #      quedo, para que se pueda recuperar a mano.
        dibujo = base / "disenos" / "escena.svg"
        dibujo.write_text("<svg><path d='M0 0h9'/></svg>", encoding="utf-8")
        r = puente.trash_design(str(dibujo))
        assert r.get("trashed"), r
        assert not dibujo.exists(), "el archivo sigue en su lugar: no se movio"
        recuperado = Path(r["recovery_path"])
        assert recuperado.exists(), "el archivo no aparecio en la papelera: SE PERDIO"
        assert recuperado.parent == base / ".low-trash", recuperado
        assert recuperado.read_text(encoding="utf-8") == "<svg><path d='M0 0h9'/></svg>", \
            "el contenido no llego intacto a la papelera"
        assert "escena" in recuperado.name and recuperado.suffix == ".svg", \
            "la papelera no conserva el nombre ni la extension: no se puede recuperar a ojo"

        # ── 2. NUNCA ACEPTA RUTAS DE AFUERA DEL PROYECTO. Es la promesa que
        #      impide que un pedido mal formado se lleve un archivo de otra
        #      carpeta de la maquina.
        with tempfile.TemporaryDirectory(prefix="low-ajeno-") as ajeno:
            intruso = Path(ajeno) / "no-tocar.svg"
            intruso.write_text("ajeno", encoding="utf-8")
            r = puente.trash_design(str(intruso))
            assert r.get("error"), "acepto una ruta de AFUERA del proyecto"
            assert "dentro del proyecto" in r["error"], r
            assert intruso.exists(), "SE LLEVO UN ARCHIVO DE AFUERA DEL PROYECTO"

        # ── 3. DOS ARCHIVOS DEL MISMO NOMBRE NO SE PISAN. Sin el contador, el
        #      segundo borraria al primero DENTRO de la papelera, que es
        #      exactamente perder lo que se dijo que se podia recuperar.
        primero = base / "disenos" / "repetido.svg"
        primero.write_text("uno", encoding="utf-8")
        a = puente.trash_design(str(primero))
        assert a.get("trashed"), a
        segundo = base / "disenos" / "repetido.svg"
        segundo.write_text("dos", encoding="utf-8")
        b = puente.trash_design(str(segundo))
        assert b.get("trashed"), b
        assert a["recovery_path"] != b["recovery_path"], \
            "los dos fueron al MISMO destino: el segundo piso al primero en la papelera"
        assert Path(a["recovery_path"]).read_text(encoding="utf-8") == "uno"
        assert Path(b["recovery_path"]).read_text(encoding="utf-8") == "dos"

        # ── 4. LO QUE NO EXISTE NO SE INVENTA, y un pedido vacio no hace nada.
        r = puente.trash_design(str(base / "disenos" / "fantasma.svg"))
        assert r.get("error") and "ya no existe" in r["error"], r
        r = puente.trash_design("")
        assert r.get("error"), "un pedido sin ruta no dio error"

        # Y la papelera queda fuera de la vista creativa: empieza con punto.
        assert (base / ".low-trash").is_dir()
        cuantos = len(list((base / ".low-trash").iterdir()))
        assert cuantos == 3, "esperaba 3 archivos en la papelera, hay %d" % cuantos

    print("PAPELERA OK: mueve y no borra, rechaza rutas de afuera, no pisa "
          "nombres repetidos y no inventa archivos")


if __name__ == "__main__":
    main()
