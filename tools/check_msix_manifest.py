#!/usr/bin/env python3
"""EL PAQUETE MSIX DE LA MICROSOFT STORE SE ARMA BIEN (sin Windows SDK).

Mauro quiere LOW como Krita: gratis en GitHub y pago en la Microsoft Store.
La Store recibe un .msix; makeappx (sólo en Windows, en el build) valida el
esquema, pero lo que más se rompe es lo nuestro: un logo que el manifiesto nombra
y no está, el ejecutable en otra ruta, una versión que la Store rechaza, la
identidad de Partner Center mal copiada. Esto lo controla en cualquier sistema:

  1. Con las variables de Partner Center, el manifiesto lleva ESA identidad, la
     versión en 4 partes (3.52.0 → 3.52.0.0) y no queda ningún {{campo}}.
  2. El ejecutable y cada logo que nombra el manifiesto existen en el paquete,
     del tamaño que pide Windows.
  3. .low se abre con LOW (asociación de archivos) y la app corre con runFullTrust.
  4. Sin variables: identidad de PRUEBA, avisada; un Publisher sin CN= se rechaza.
  5. La app empaquetada no lee la versión del instalador de GitHub del registro.

    python tools/check_msix_manifest.py
"""
import re
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(RAIZ / "packaging" / "msix"))
import armar_msix as A  # noqa: E402

NS = {"m": "http://schemas.microsoft.com/appx/manifest/foundation/windows10",
      "uap": "http://schemas.microsoft.com/appx/manifest/uap/windows10",
      "rescap": "http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"}
fallas = 0


def ok(cond, msg):
    global fallas
    print(("OK    " if cond else "FALLA ") + msg)
    if not cond:
        fallas += 1


ENV_REAL = {"LOW_MSIX_IDENTITY_NAME": "12345TropaCirca.LOWStudio", "LOW_MSIX_PUBLISHER": "CN=ABCD1234-5678-90EF-ABCD-1234567890AB",
            "LOW_MSIX_PUBLISHER_DISPLAY_NAME": "Tropa Circa & Mauro", "LOW_MSIX_DISPLAY_NAME": "LOW Studio"}

with tempfile.TemporaryDirectory() as tmp:
    exe = Path(tmp) / "LOW.exe"
    exe.write_bytes(b"MZ prueba")
    out = Path(tmp) / "msix"
    ident, prueba = A.armar(exe, "3.52.0", out, env=ENV_REAL)
    texto = (out / "AppxManifest.xml").read_text(encoding="utf-8")
    raiz = ET.fromstring(texto)
    idn = raiz.find("m:Identity", NS)

    # 1
    ok(not prueba and idn.get("Name") == "12345TropaCirca.LOWStudio" and idn.get("Publisher") == ENV_REAL["LOW_MSIX_PUBLISHER"],
       "con las variables de Partner Center, el manifiesto lleva esa identidad")
    ok(idn.get("Version") == "3.52.0.0", "versión MSIX en 4 partes: 3.52.0 → 3.52.0.0")
    ok("{{" not in texto and raiz.find("m:Properties/m:PublisherDisplayName", NS).text == "Tropa Circa & Mauro",
       "no queda ningún {{campo}} y los caracteres especiales quedan bien escritos")
    ok(raiz.find("m:Properties/m:DisplayName", NS).text == "LOW Studio", "el nombre reservado en la Store va al manifiesto")

    # 2
    app = raiz.find("m:Applications/m:Application", NS)
    ok((out / app.get("Executable").replace("\\", "/")).is_file(), "el ejecutable que nombra el manifiesto está en el paquete (" + app.get("Executable") + ")")
    nombrados = set(re.findall(r"Assets\\[A-Za-z0-9.\-_]+\.png", texto))
    faltan = [n for n in nombrados if not (out / n.replace("\\", "/")).is_file()]
    ok(nombrados and not faltan, "cada logo que nombra el manifiesto existe (%d): %s" % (len(nombrados), faltan or "todos"))
    from PIL import Image
    tam = {n: Image.open(out / "Assets" / n).size for n, _, _ in A.LOGOS}
    ok(all(tam[n] == (w, h) for n, w, h in A.LOGOS), "cada logo tiene el tamaño que pide Windows")
    ancho = Image.open(out / "Assets" / "Wide310x150Logo.png")
    ok(ancho.getpixel((0, 0))[3] == 0 and ancho.getpixel((155, 75))[3] > 0, "el logo ancho lleva el ícono centrado sobre transparente")

    # 3
    tipos = [e.text for e in raiz.iter("{%s}FileType" % NS["uap"])]
    ok(tipos == [".low"], "los documentos .low se abren con LOW (asociación en el manifiesto)")
    caps = [c.get("Name") for c in raiz.iter("{%s}Capability" % NS["rescap"])]
    ok(caps == ["runFullTrust"] and app.get("EntryPoint") == "Windows.FullTrustApplication", "app de escritorio completa (runFullTrust)")

    # 4
    _, prueba2 = A.armar(exe, "3.52.0", out, env={})
    ok(prueba2 and "CN=LOW Prueba" in (out / "AppxManifest.xml").read_text(encoding="utf-8"), "sin variables: identidad de PRUEBA, avisada")
    try:
        A.identidad({"LOW_MSIX_PUBLISHER": "ABCD-1234"})
        rechaza = False
    except SystemExit:
        rechaza = True
    ok(rechaza, "un Publisher sin «CN=» se rechaza en vez de armar un paquete que la Store no acepta")
    try:
        A.version_msix("3.70000.0")
        grande = False
    except SystemExit:
        grande = True
    ok(grande, "una parte de versión mayor a 65535 se rechaza")

# 5
MAIN = (RAIZ / "main.py").read_text(encoding="utf-8")
cuerpo = MAIN[MAIN.index("def version_instalada"):MAIN.index("def binario_reemplazado")]
ok("def empaquetado_msix" in MAIN and "GetCurrentPackageFullName" in MAIN and "empaquetado_msix()" in cuerpo,
   "la app empaquetada (Store) no lee la versión que anotó el instalador de GitHub")

print("\nFALLAS: %d" % fallas if fallas else "\nMSIX OK")
sys.exit(1 if fallas else 0)
