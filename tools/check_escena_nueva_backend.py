"""El archivo de escena: lo que promete `new_scene` del puente.

POR QUE EXISTE ESTE ARCHIVO. Mauro pregunto si ya existian los archivos `.low`.
Se midio su workspace: 157 dibujos sueltos `diseno_*.svg` —138 en blanco, de 323
bytes— y CERO `.low`. El formato propio del programa no lo estaba usando nadie.
`new_scene` es el puente que arregla eso: «Nuevo documento» ahora escribe el
documento de escena ANTES de mostrarlo, en vez de sembrar un SVG vacio y dejar
la escena en memoria hasta que alguien se acordara de guardar.

El recorrido de navegador (`check_escena_nueva_ui.js`) prueba el camino desde el
boton. Esto prueba lo que pasa en el disco, que es donde vive el trabajo.
"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import Api


def bridge_for(base):
    bridge = Api.__new__(Api)
    bridge.ws = str(base)
    bridge._window = None
    bridge.avisos = []
    bridge._push = lambda canal, datos: bridge.avisos.append(canal)
    bridge._tree = lambda: {}
    bridge._git_branch = lambda: ""
    return bridge


ESCENA = json.dumps({
    "format": "lowscene", "version": 1, "frame": 1, "layerId": "ly_1",
    "scene": {"name": "Escena", "fps": 24, "width": 1920, "height": 1080,
              "levels": [{"id": "lv_1", "name": "Nivel 1", "drawings": [
                  {"id": "dw_1", "number": 1,
                   "content": '<rect data-low-page="1" width="1920" height="1080" fill="#ffffff"/>'}]}],
              "layers": [{"id": "ly_1", "name": "Capa 1", "levelId": "lv_1", "cells": [1]}]},
}, indent=1)


def main():
    with tempfile.TemporaryDirectory(prefix="low-escena-") as folder:
        base = Path(folder)
        puente = bridge_for(base)

        # -- 1. EL ARCHIVO EXISTE, ES .low Y ESTA DONDE VIVE EL TRABAJO.
        r = puente.new_scene(ESCENA)
        assert not r.get("error"), r
        fp = Path(r["path"])
        assert fp.exists(), "el puente dijo que creo el documento y NO HAY ARCHIVO"
        assert fp.suffix == ".low", "el documento de escena no es un .low: %s" % fp.name
        assert fp.parent == base / "disenos", \
            "el documento no quedo en disenos/, que es donde el usuario busca su trabajo: %s" % fp.parent
        assert fp.name.startswith("escena_"), fp.name
        assert r.get("name") == fp.name, r

        # -- 2. LO ESCRITO ES LO QUE SE MANDO, byte por byte. Un documento que
        #       sale distinto de como entro no se puede volver a abrir.
        assert fp.read_text(encoding="utf-8") == ESCENA, \
            "el contenido llego cambiado al disco"
        vuelta = json.loads(fp.read_text(encoding="utf-8"))
        assert vuelta["scene"]["levels"][0]["drawings"][0]["content"], \
            "el dibujo se perdio en el camino al disco"

        # -- 3. DOS DOCUMENTOS SEGUIDOS NO SE PISAN. Dentro del mismo segundo el
        #       nombre es el mismo: sin contador, el segundo «Nuevo documento»
        #       borraria el trabajo del primero.
        a = puente.new_scene(ESCENA)
        b = puente.new_scene(ESCENA)
        assert not a.get("error") and not b.get("error"), (a, b)
        assert a["path"] != b["path"], \
            "dos documentos nuevos fueron al MISMO archivo: el segundo piso al primero"
        assert Path(a["path"]).exists() and Path(b["path"]).exists()
        assert len(list((base / "disenos").glob("escena_*.low"))) == 3

        # -- 4. UN PEDIDO VACIO NO CREA UN ARCHIVO. Un `.low` de cero bytes
        #       parece trabajo guardado y no lo es.
        r = puente.new_scene("")
        assert r.get("error"), "acepto crear un documento sin contenido"
        assert len(list((base / "disenos").glob("escena_*.low"))) == 3, \
            "escribio un archivo igual"

        # -- 5. Y avisa a la interfaz, que es lo que refresca el arbol: sin eso
        #       el documento nuevo no aparece hasta reabrir el programa.
        assert "ws" in puente.avisos, "el puente no avisa que hay un archivo nuevo"

    primer_arranque()

    print("ESCENA NUEVA OK: crea el .low en disenos/, lo escribe intacto, no pisa "
          "el anterior, no inventa archivos vacios y anda en el primer arranque")


def primer_arranque():
    """-- 6. EL PRIMER ARRANQUE: sin carpeta de proyecto elegida.

    Medido el 3-oct-2026 en la app real con un perfil nuevo —que es exactamente
    lo que tiene quien instala LOW por primera vez—: «Nuevo documento» NO HACIA
    NADA. `new_scene` llamaba a `_base()`, que con `ws` en None lanza «No hay
    workspace abierto», la excepcion volvia a la interfaz como promesa rechazada
    y nadie la mostraba. Mauro no lo veia porque su configuracion recuerda la
    ultima carpeta; los chicos que lo instalan por primera vez, si.

    Se exige: sin carpeta elegida, el documento nuevo se crea igual, en una
    carpeta de proyectos propia de LOW dentro de Documentos, y LOW la recuerda
    para el proximo arranque. Nunca en `Documentos/LOW`, que en la maquina de
    Mauro es un arbol de codigo viejo."""
    import os
    with tempfile.TemporaryDirectory(prefix="low-casa-") as casa:
        viejo = {k: os.environ.get(k) for k in ("HOME", "USERPROFILE")}
        os.environ["HOME"] = os.environ["USERPROFILE"] = casa
        (Path(casa) / "Documents").mkdir()
        (Path(casa) / "Documents" / "LOW").mkdir()      # el arbol viejo de Mauro
        try:
            puente = bridge_for(casa)
            puente.ws = None                             # NADIE eligio carpeta
            guardado = {}

            class Cfg:
                data = {}
                def save(self): guardado.update(self.data)
            puente.cfg = Cfg()

            r = puente.new_scene(ESCENA)
            assert isinstance(r, dict) and not r.get("error"),                 "en el primer arranque «Nuevo documento» no crea nada: %r" % (r,)
            fp = Path(r["path"])
            assert fp.exists() and fp.suffix == ".low", fp
            docs = Path(casa) / "Documents"
            assert docs in fp.parents, "el documento no quedo dentro de Documentos: %s" % fp
            assert (docs / "LOW") not in fp.parents and fp.parent.parent != docs / "LOW",                 "el documento fue a Documentos/LOW, que puede ser cualquier otra cosa: %s" % fp
            assert guardado.get("last_workspace") and Path(guardado["last_workspace"]).is_dir(),                 "LOW no recuerda la carpeta que eligio: el proximo arranque vuelve a no tener donde guardar"
            assert Path(puente.ws) == Path(guardado["last_workspace"])
        finally:
            for k, v in viejo.items():
                if v is None: os.environ.pop(k, None)
                else: os.environ[k] = v


if __name__ == "__main__":
    main()
