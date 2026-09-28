#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PRESUPUESTO DE app.js (biblia §12 AHORA·7)

`app.js` tenía 18.650 líneas: un tercio del frontend en un solo archivo. El
punto 7 de AHORA pide extraerlo desde hace versiones, y mientras nadie miraba
el número, cada función nueva lo hacía **crecer** — la sesión que agregó el
panel de equipo y los arcos le sumó unas 850 líneas.

Esto pone un techo y lo baja solo. La regla, en una línea:

    app.js NO PUEDE CRECER. Cada trabajo se lleva un pedazo afuera al salir.

Cómo funciona: el techo vive en `docs/APP_JS_BUDGET`. Si `app.js` lo pasa, esto
falla y dice cuánto hay que sacar. Si queda **por debajo**, el techo se corrige
solo al nuevo valor y avisa que hay que commitear el archivo — así el terreno
ganado no se puede volver a perder sin que la puerta lo note.

    python tools/check_app_js_budget.py
    python tools/check_app_js_budget.py --fijar   # reescribe el techo (extracción)
"""
import io
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
APP = RAIZ / "ui" / "app.js"
TECHO = RAIZ / "docs" / "APP_JS_BUDGET"


def lineas_de(ruta: Path) -> int:
    with io.open(ruta, encoding="utf-8") as f:
        return sum(1 for _ in f)


def main(argv):
    if not APP.exists():
        print("no existe ui/app.js")
        return 1
    actual = lineas_de(APP)

    modulos = sorted(
        p for p in (RAIZ / "ui").rglob("*.js")
        if p.name != "app.js" and "node_modules" not in p.parts
    )
    fuera = sum(lineas_de(p) for p in modulos)
    porcentaje = actual / (actual + fuera) * 100 if actual + fuera else 0

    if "--fijar" in argv or not TECHO.exists():
        TECHO.write_text(str(actual) + "\n", encoding="utf-8")
        print("techo fijado en %d líneas" % actual)
        return 0

    limite = int(TECHO.read_text(encoding="utf-8").strip() or 0)
    print("app.js: %d líneas  ·  techo %d  ·  %d módulos aparte con %d líneas"
          % (actual, limite, len(modulos), fuera))
    print("        app.js concentra el %.1f%% del frontend" % porcentaje)

    if actual > limite:
        print()
        print("PRESUPUESTO DE app.js EXCEDIDO: %d líneas de más." % (actual - limite))
        print("app.js no puede crecer (biblia §12 AHORA·7). Lo que agregaste va")
        print("en un módulo aparte, o te llevás otro tanto afuera en el mismo")
        print("trabajo. Si de verdad hace falta subir el techo, es una decisión")
        print("que se toma a mano y se escribe en docs/APP_JS_BUDGET.")
        return 1

    if actual < limite:
        TECHO.write_text(str(actual) + "\n", encoding="utf-8")
        print()
        print("Bajaron %d líneas: el techo se ajusta a %d." % (limite - actual, actual))
        print("Commiteá docs/APP_JS_BUDGET junto con la extracción, así el")
        print("terreno ganado no se puede volver a perder en silencio.")
        return 0

    print("PRESUPUESTO DE app.js OK (justo en el techo)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
