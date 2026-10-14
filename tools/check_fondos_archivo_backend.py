"""Los fondos de las tomas del 3D van como archivos al lado del .low (v3.30).

1. Guardar una escena con dos fondos JPG y uno PNG (uno repetido): el .low no
   lleva base64, la carpeta <nombre>.fondos tiene 2 archivos (el repetido es
   uno solo) y el .low pesa una fracción de lo que pesaba.
2. Abrirla devuelve exactamente el mismo JSON que se guardó.
3. Una imagen que NO es de una toma (un calco importado) queda adentro, como siempre.
4. «Guardar como» en otra carpeta escribe los fondos al lado del nuevo .low.
5. Volver a guardar sin un fondo borra su archivo (sólo los nuestros: un
   archivo ajeno en la carpeta queda).
6. Un fondo que falta: el dibujo queda con la referencia y se avisa.
7. Una referencia con ../ no lee fuera de la carpeta del .low.
Corre contra el `Api` real de main.py (save_file / open_file), sin ventana. """
import base64
import json
import os
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
import main  # noqa: E402


def mal(m, d=None):
    raise SystemExit("REGRESIÓN: " + m + ("" if d is None else " :: " + repr(d)[:300]))


def imagen(n, ext):
    return base64.b64encode(bytes([n]) * 50000 + ext.encode()).decode("ascii")


def escena(fondos, calco=None):
    dibujos = [{"id": f"d{i}", "number": i + 1, "content":
                f'<image data-low="toma-3d" data-toma="Toma 1" href="data:image/{t};base64,{b}" x="0" y="0" width="1920" height="1080" preserveAspectRatio="none"/>'}
               for i, (t, b) in enumerate(fondos)]
    if calco:
        dibujos.append({"id": "c", "number": 99, "content": f'<image opacity="0.5" href="data:image/png;base64,{calco}"/>'})
    return json.dumps({"format": "lowscene", "version": 1, "scene": {"levels": [{"id": "L", "type": "reference", "drawings": dibujos}]}}, indent=1)


def main_():
    api = main.Api.__new__(main.Api)        # sin ventana ni config: sólo los métodos de archivos
    a, b, p = imagen(1, "a"), imagen(2, "b"), imagen(3, "p")
    calco = imagen(4, "c")
    original = escena([("jpeg", a), ("jpeg", a), ("png", p), ("jpeg", b)], calco=calco)
    with tempfile.TemporaryDirectory() as tmp:
        ruta = Path(tmp) / "bici.low"
        r = api.save_file(str(ruta), original, "bici.low")
        if not r or r.get("error"):
            mal("no guardó", r)
        disco = ruta.read_text(encoding="utf-8")
        carpeta = Path(tmp) / "bici.fondos"
        archivos = sorted(f.name for f in carpeta.iterdir()) if carpeta.is_dir() else []
        # 1
        if len(archivos) != 3:
            mal("la carpeta de fondos no tiene un archivo por fondo distinto", archivos)
        if sorted(x.rsplit(".", 1)[1] for x in archivos) != ["jpg", "jpg", "png"]:
            mal("las extensiones no son las de cada formato", archivos)
        if a in disco or b in disco or p in disco:
            mal("el .low sigue llevando el base64 de un fondo")
        if "low-archivo:bici.fondos/" not in disco:
            mal("el .low no referencia la carpeta de fondos")
        if len(disco) > len(original) / 3:
            mal("el .low no se alivianó", (len(disco), len(original)))
        # 3
        if calco not in disco:
            mal("un calco importado (que no es de una toma) salió del .low")
        # 2
        abierto = api.open_file(str(ruta))
        if abierto.get("content") != original:
            mal("abrir no devuelve lo mismo que se guardó")
        # 4
        otra = Path(tmp) / "otra"
        otra.mkdir()
        ruta2 = otra / "copia.low"
        api.save_file(str(ruta2), original, "copia.low")
        if not (otra / "copia.fondos").is_dir() or api.open_file(str(ruta2)).get("content") != original:
            mal("guardar en otra carpeta no llevó los fondos")
        # 5
        ajeno = carpeta / "mio.txt"
        ajeno.write_text("de Mauro", encoding="utf-8")
        api.save_file(str(ruta), escena([("jpeg", a)], calco=calco), "bici.low")
        quedan = sorted(f.name for f in carpeta.iterdir())
        if len(quedan) != 2 or "mio.txt" not in quedan:
            mal("volver a guardar no borró sólo los fondos que ya no se usan", quedan)
        # 6
        for f in carpeta.iterdir():
            if f.suffix == ".jpg":
                f.unlink()
        r6 = api.open_file(str(ruta))
        if "low-archivo:" not in r6.get("content", "") or r6.get("fondos_faltan") != 1:
            mal("un fondo que falta no queda como referencia con aviso", {k: v for k, v in r6.items() if k != "content"})
        # 7
        afuera = Path(tmp) / "secreto.jpg"
        afuera.write_bytes(b"\xff\xd8 no")
        trampa = Path(tmp) / "trampa.low"
        trampa.write_text('{"x":"<image data-low=\\"toma-3d\\" href=\\"low-archivo:../secreto.jpg\\"/>"}', encoding="utf-8")
        if "base64" in api.open_file(str(trampa)).get("content", ""):
            mal("una referencia con ../ leyó un archivo de fuera de la carpeta de fondos")
    print("OK fondos de toma como archivos: .low liviano, ida y vuelta exacta, guardar como, poda, faltantes, sin ../")


if __name__ == "__main__":
    main_()
