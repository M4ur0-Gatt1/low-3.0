"""LO DEL ESTUDIO 3D EN ARCHIVOS (almacen3d.py, v3.44). python tools/check_almacen3d_backend.py

Fase 1 del camino a la estabilidad: «que no se pierda nada». Antes la biblioteca
3D y el autoguardado vivían en el almacenamiento del navegador (5 a 10 MB) y,
llenos, el guardado fallaba en silencio. Se exige:
1. guardar y leer de vuelta lo mismo (una biblioteca de 30 MB incluida);
2. un corte a mitad de escritura NO toca el archivo bueno;
3. el de antes queda como respaldo y se lee si el principal está roto;
4. JSON inválido, nombres de afuera y lo demasiado grande se rechazan con un
   error que se puede mostrar (no en silencio);
5. sin permiso de escritura, también un error;
6. borrar el autoguardado deja el respaldo."""
import json
import os
import shutil
import stat
import sys
import tempfile
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
import almacen3d  # noqa: E402

fallas = []
total = 0


def prueba(nombre, fn):
    global total
    total += 1
    try:
        fn()
        print("  ok  ", nombre)
    except AssertionError as e:
        fallas.append(nombre + ": " + str(e))
        print("  FALLA", nombre, "→", e)


carpeta = Path(tempfile.mkdtemp(prefix="low-almacen3d-"))
A = almacen3d.Almacen3D(carpeta / "estudio3d")


def ida_y_vuelta():
    assert A.leer("biblioteca") == {"json": None}, "sin nada guardado tiene que devolver json None"
    kits = [{"id": "kit-1", "nombre": "Mis personajes", "piezas": [{"nombre": "Tito", "items": [{"personaje": {"escultura": "e1:" + "A" * 1000}}]}]}]
    r = A.guardar("biblioteca", json.dumps(kits))
    assert r.get("ok") and r["bytes"] > 1000, r
    assert json.loads(A.leer("biblioteca")["json"]) == kits, "no volvió lo mismo"
    grande = json.dumps({"x": "e1:" + "B" * (30 * 1024 * 1024)})
    r = A.guardar("biblioteca", grande)
    assert r.get("ok"), r
    assert A.leer("biblioteca")["json"] == grande, "la biblioteca de 30 MB no volvió entera"


def corte_a_medias():
    A.guardar("autoguardado", json.dumps({"bueno": 1}))
    real = os.replace
    llamadas = []

    def corte(a, b):
        llamadas.append((a, b))
        raise OSError(28, "No queda espacio en el disco")
    os.replace = corte
    try:
        r = A.guardar("autoguardado", json.dumps({"nuevo": 2}))
    finally:
        os.replace = real
    assert "error" in r and "espacio" in r["error"], "el corte no volvió como error: " + str(r)
    assert json.loads(A.leer("autoguardado")["json"]) == {"bueno": 1}, "el corte tocó el archivo bueno"
    assert not (carpeta / "estudio3d" / "autoguardado.json.tmp").exists(), "quedó el archivo a medias"


def respaldo():
    A.guardar("autoguardado", json.dumps({"v": 1}))
    A.guardar("autoguardado", json.dumps({"v": 2}))
    (carpeta / "estudio3d" / "autoguardado.json").write_text('{"v": 3, "cortado', encoding="utf-8")
    r = A.leer("autoguardado")
    assert r.get("respaldo") and json.loads(r["json"]) == {"v": 1}, "con el principal roto no se leyó el respaldo: " + str(r)


def rechazos():
    assert "error" in A.guardar("biblioteca", "{no es json"), "aceptó JSON roto"
    assert "error" in A.guardar("../../windows/x", "{}"), "aceptó un nombre de afuera"
    assert "error" in A.leer("config"), "leyó un nombre que no es suyo"
    viejo = almacen3d.TOPE
    almacen3d.TOPE = 10
    try:
        assert "demasiado grande" in A.guardar("biblioteca", json.dumps({"x": "y" * 50})).get("error", ""), "aceptó algo más grande que el tope"
    finally:
        almacen3d.TOPE = viejo


def sin_permiso():
    if os.name != "nt":
        d = carpeta / "solo-lectura"
        d.mkdir()
        os.chmod(d, stat.S_IRUSR | stat.S_IXUSR)
        r = almacen3d.Almacen3D(d).guardar("biblioteca", "{}")
        os.chmod(d, stat.S_IRWXU)
        assert "error" in r, "sin permiso no hubo error: " + str(r)
        return
    # en Windows: la carpeta es un ARCHIVO (no se puede crear adentro)
    f = carpeta / "es-un-archivo"
    f.write_text("x", encoding="utf-8")
    r = almacen3d.Almacen3D(f).guardar("biblioteca", "{}")
    assert "error" in r, "sin dónde escribir no hubo error: " + str(r)


def borrar():
    A.guardar("autoguardado", json.dumps({"escena": 1}))
    assert A.borrar("autoguardado").get("ok")
    assert not (carpeta / "estudio3d" / "autoguardado.json").exists(), "no se borró"
    assert json.loads((carpeta / "estudio3d" / "autoguardado.json.bak").read_text(encoding="utf-8")) == {"escena": 1}, "no quedó el respaldo"


def principal_siempre():
    # entre el respaldo y el reemplazo el principal NO puede faltar: un corte
    # justo ahí dejaba sólo el .bak (la versión de antes)
    A.guardar("autoguardado", json.dumps({"v": 1}))
    ruta = carpeta / "estudio3d" / "autoguardado.json"
    real = os.replace
    vistos = []

    def mirar(a, b):
        vistos.append(ruta.exists())
        return real(a, b)
    os.replace = mirar
    try:
        A.guardar("autoguardado", json.dumps({"v": 2}))
    finally:
        os.replace = real
    assert vistos and all(vistos), "hubo un instante sin el archivo principal: " + str(vistos)
    assert json.loads((carpeta / "estudio3d" / "autoguardado.json.bak").read_text(encoding="utf-8")) == {"v": 1}, "el respaldo no es la versión de antes"
    assert json.loads(A.leer("autoguardado")["json"]) == {"v": 2}


def obra_2d():
    B = almacen3d.Almacen3D(carpeta / "obra", almacen3d.NOMBRES_2D)
    assert B.leer("personajes2d") == {"json": None}
    assert B.guardar("personajes2d", json.dumps([{"id": "char_1", "name": "Pepa"}])).get("ok")
    assert json.loads(B.leer("personajes2d")["json"])[0]["name"] == "Pepa"
    assert "error" in B.guardar("biblioteca", "[]"), "el almacén del 2D aceptó un nombre del 3D"
    assert "error" in A.guardar("personajes2d", "[]"), "el almacén del 3D aceptó un nombre del 2D"


prueba("guardar y leer de vuelta (incluida una de 30 MB)", ida_y_vuelta)
prueba("el principal no falta ni un instante al guardar", principal_siempre)
prueba("el almacén del 2D sólo guarda lo suyo", obra_2d)
prueba("un corte a mitad de escritura no toca el archivo bueno", corte_a_medias)
prueba("con el principal roto se lee el respaldo", respaldo)
prueba("JSON roto, nombres de afuera y lo demasiado grande se rechazan", rechazos)
prueba("sin dónde escribir, un error (no silencio)", sin_permiso)
prueba("borrar el autoguardado deja el respaldo", borrar)
shutil.rmtree(carpeta, ignore_errors=True)
print(f"\n{total - len(fallas)}/{total} OK")
if fallas:
    print("FALLAS:\n  " + "\n  ".join(fallas))
    sys.exit(1)
