"""La interfaz no puede servirse desde una caché vieja.

POR QUE EXISTE. Medido el 3-oct-2026 en la app real: después de cambiar el
`index.html` y reabrir LOW, la ventana cargó el `index.html` ANTERIOR desde la
caché de WebView2 —0 bytes transferidos, 113.739 bytes contra los 112.465 del
archivo nuevo— con las etiquetas `?v=` viejas y sin el módulo nuevo. Python ya
decía la versión nueva; la interfaz era la vieja.

Desde que el perfil de WebView2 es PERSISTENTE (private_mode=False, para no
perder el rescate ni las preferencias), esa caché sobrevive a las
actualizaciones: quien instala una versión nueva puede seguir viendo la
interfaz vieja contra el puente nuevo. «Sigue igual», con el arreglo instalado.

La causa está en pywebview 6.x: su ruta de archivos pone `Cache-Control:
no-cache` en `bottle.response` y después devuelve lo de `bottle.static_file`,
que es un HTTPResponse con sus propias cabeceras: la de no-cache se pierde. Sin
Cache-Control, el navegador usa frescura heurística y no vuelve a preguntar.

Se exige: con el arreglo de LOW puesto, lo que sirve el servidor de pywebview
lleva `Cache-Control: no-cache` (revalida siempre; en localhost un 304 cuesta
nada), y la revalidación devuelve el contenido NUEVO tras cambiar el archivo.
"""
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main  # noqa: E402


def pedir(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return r.headers.get("Cache-Control") or "", r.read().decode("utf-8")


def main_prueba():
    main._ui_sin_cache()
    from webview import http as wvhttp

    with tempfile.TemporaryDirectory(prefix="low-cache-") as carpeta:
        raiz = Path(carpeta)
        (raiz / "index.html").write_text("<p>vieja</p>", encoding="utf-8")
        direccion, _, servidor = wvhttp.BottleServer.start_server(
            [str(raiz / "index.html")], None)
        for _ in range(50):
            try:
                cabecera, cuerpo = pedir(direccion + "index.html")
                break
            except OSError:
                time.sleep(0.1)
        else:
            raise AssertionError("el servidor de pywebview no levantó")

        assert "no-cache" in cabecera.lower(), (
            "la interfaz se sirve SIN Cache-Control: no-cache (llegó %r). WebView2 "
            "la guarda con frescura heurística y, con el perfil persistente, una "
            "actualización de LOW puede seguir mostrando la interfaz vieja" % cabecera)
        assert cuerpo == "<p>vieja</p>", cuerpo

        (raiz / "index.html").write_text("<p>nueva</p>", encoding="utf-8")
        _, cuerpo = pedir(direccion + "index.html")
        assert cuerpo == "<p>nueva</p>", "tras cambiar el archivo se sirvió el viejo"

        # y los scripts también: el index nuevo con un app.js viejo es la mezcla
        (raiz / "app.js").write_text("// x", encoding="utf-8")
        cabecera, _ = pedir(direccion + "app.js")
        assert "no-cache" in cabecera.lower(), "los .js se sirven sin no-cache: %r" % cabecera

    cache_por_version()
    print("UI SIN CACHE OK: el servidor de pywebview manda Cache-Control: no-cache, "
          "y al cambiar de versión se vacía la caché sin tocar el rescate")


def cache_por_version():
    """Quien YA tiene una versión instalada guardó su index.html sin no-cache:
    al actualizar se vacía la caché HTTP del perfil. Sólo la caché: el Local
    Storage guarda el rescate ante caída y las preferencias."""
    with tempfile.TemporaryDirectory(prefix="low-perfil-") as carpeta:
        perfil = Path(carpeta)
        base = perfil / "EBWebView" / "Default"
        for sub in ("Cache/Cache_Data", "Code Cache/js", "Local Storage/leveldb"):
            (base / sub).mkdir(parents=True)
            (base / sub / "f").write_text("x", encoding="utf-8")
        (perfil / ".low_version").write_text("3.1.1", encoding="utf-8")

        assert main._cache_de_version(perfil, "3.1.2") is True, "no vació nada al cambiar de versión"
        assert not (base / "Cache").exists(), "la caché HTTP sobrevivió a la actualización"
        assert not (base / "Code Cache").exists(), "la caché de código sobrevivió"
        assert (base / "Local Storage" / "leveldb" / "f").exists(), (
            "se BORRÓ el Local Storage: ahí vive el rescate ante caída")
        assert (perfil / ".low_version").read_text(encoding="utf-8") == "3.1.2"

        (base / "Cache").mkdir()
        assert main._cache_de_version(perfil, "3.1.2") is False, "vació la caché sin cambio de versión"
        assert (base / "Cache").exists(), "con la misma versión no se toca la caché"


if __name__ == "__main__":
    main_prueba()
