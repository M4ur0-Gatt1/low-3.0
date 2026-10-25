#!/usr/bin/env python3
"""Arma la carpeta del paquete MSIX de LOW (Microsoft Store).

    python packaging/msix/armar_msix.py --exe dist/LOW.exe --version 3.52.0 --out build/msix

Deja en --out: AppxManifest.xml (con la identidad de Partner Center), LOW\\LOW.exe
y Assets\\ con los logos que pide Windows, sacados de low.ico. Empacar y firmar
es aparte (packaging/msix/empaquetar.ps1, con makeappx del Windows SDK).

La identidad sale de variables de entorno, que en GitHub son variables del repo
(no secretos: Partner Center las muestra a cualquiera que mire el paquete):

    LOW_MSIX_IDENTITY_NAME          p. ej. 12345TropaCirca.LOW
    LOW_MSIX_PUBLISHER              p. ej. CN=ABCD1234-...
    LOW_MSIX_PUBLISHER_DISPLAY_NAME p. ej. Tropa Circa
    LOW_MSIX_DISPLAY_NAME           el nombre reservado en la Store (p. ej. LOW Studio)

Sin ellas usa una identidad de PRUEBA: sirve para instalar el paquete localmente
con el certificado de prueba, no para subirlo a la Store. Ver docs/MICROSOFT_STORE.md
"""
import argparse
import os
import re
import shutil
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parents[2]
PLANTILLA = Path(__file__).with_name("AppxManifest.template.xml")

PRUEBA = {
    "IDENTITY_NAME": "TropaCirca.LOW.Prueba",
    "PUBLISHER": "CN=LOW Prueba",
    "PUBLISHER_DISPLAY_NAME": "Mauro Gatti · Tropa Circa",
    "DISPLAY_NAME": "LOW",
}
ENV = {
    "IDENTITY_NAME": "LOW_MSIX_IDENTITY_NAME",
    "PUBLISHER": "LOW_MSIX_PUBLISHER",
    "PUBLISHER_DISPLAY_NAME": "LOW_MSIX_PUBLISHER_DISPLAY_NAME",
    "DISPLAY_NAME": "LOW_MSIX_DISPLAY_NAME",
}

# (archivo, ancho, alto): los que nombra el manifiesto y sus variantes de tamaño.
# Las «altform-unplated» son las de la barra de tareas y el menú Inicio sin placa.
LOGOS = [
    ("StoreLogo.png", 50, 50),
    ("Square44x44Logo.png", 44, 44),
    ("Square150x150Logo.png", 150, 150),
    ("Wide310x150Logo.png", 310, 150),
    ("LowDoc.png", 44, 44),
] + [("Square44x44Logo.targetsize-%d_altform-unplated.png" % t, t, t) for t in (16, 24, 32, 48, 256)] \
  + [("Square44x44Logo.targetsize-%d.png" % t, t, t) for t in (16, 24, 32, 48, 256)]


def version_msix(v):
    """3.52.0 → 3.52.0.0 (la Store pide 4 partes y la última en 0)."""
    m = re.match(r"^v?(\d+)\.(\d+)\.(\d+)", str(v).strip())
    if not m:
        raise SystemExit("versión inválida: %r (se espera X.Y.Z)" % v)
    partes = [int(x) for x in m.groups()]
    if any(p > 65535 for p in partes):
        raise SystemExit("cada parte de la versión MSIX tiene que ser <= 65535")
    return "%d.%d.%d.0" % tuple(partes)


def identidad(env=None):
    env = os.environ if env is None else env
    out, prueba = {}, False
    for k, var in ENV.items():
        v = (env.get(var) or "").strip()
        if not v:
            v, prueba = PRUEBA[k], prueba or k in ("IDENTITY_NAME", "PUBLISHER")
        out[k] = v
    if not re.match(r"^[A-Za-z0-9.\-]{3,50}$", out["IDENTITY_NAME"]):
        raise SystemExit("LOW_MSIX_IDENTITY_NAME inválido: %r" % out["IDENTITY_NAME"])
    if not out["PUBLISHER"].startswith("CN="):
        raise SystemExit("LOW_MSIX_PUBLISHER tiene que empezar con CN= (copialo de Partner Center)")
    return out, prueba


def xml_seguro(s):
    return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def manifiesto(version, ident):
    texto = PLANTILLA.read_text(encoding="utf-8")
    valores = dict(ident, VERSION=version_msix(version))
    for k, v in valores.items():
        texto = texto.replace("{{%s}}" % k, xml_seguro(v))
    if "{{" in texto:
        raise SystemExit("quedó un campo sin completar en el manifiesto")
    return texto


def logos(destino, ico=RAIZ / "low.ico"):
    from PIL import Image
    destino.mkdir(parents=True, exist_ok=True)
    ico_img = Image.open(ico)
    mayor = max(ico_img.info.get("sizes") or [ico_img.size])   # el cuadro más grande del .ico (256)
    base = (ico_img.ico.getimage(mayor) if hasattr(ico_img, "ico") else ico_img).convert("RGBA")
    for nombre, w, h in LOGOS:
        lado = min(w, h)
        icono = base.resize((lado, lado), Image.LANCZOS)
        lienzo = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        lienzo.paste(icono, ((w - lado) // 2, (h - lado) // 2), icono)
        lienzo.save(destino / nombre)
    return [n for n, _, _ in LOGOS]


def armar(exe, version, out, env=None):
    exe, out = Path(exe), Path(out)
    if not exe.is_file():
        raise SystemExit("no existe el ejecutable: %s" % exe)
    ident, prueba = identidad(env)
    if out.exists():
        shutil.rmtree(out)
    (out / "LOW").mkdir(parents=True)
    shutil.copy2(exe, out / "LOW" / "LOW.exe")
    logos(out / "Assets")
    (out / "AppxManifest.xml").write_text(manifiesto(version, ident), encoding="utf-8")
    return ident, prueba


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--exe", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--out", required=True)
    a = ap.parse_args(argv)
    ident, prueba = armar(a.exe, a.version, a.out)
    print("MSIX armado en %s · %s %s · %s" % (a.out, ident["IDENTITY_NAME"], version_msix(a.version), ident["PUBLISHER"]))
    if prueba:
        print("::notice::identidad de PRUEBA (faltan las variables LOW_MSIX_*): este paquete no se puede subir a la Store")
    return 0


if __name__ == "__main__":
    sys.exit(main())
