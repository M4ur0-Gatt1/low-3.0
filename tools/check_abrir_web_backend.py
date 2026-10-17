"""LOW abre la página de su programa aliado (Storyboarder) y NADA más (v3.31).

Pedido de Mauro: «no quiero usar casi ningún otro programa, sólo Storyboarder,
que también quiero que lo recomendemos como aliado». El panel de storyboard
tiene un botón que abre su página. La función del puente que lo hace no puede
servir para abrir cualquier cosa: una dirección que venga de un documento o de
la IA no abre nada.
1. https://wonderunit.com/storyboarder/ se abre (en el navegador del sistema).
2. http, otro dominio, un dominio que la imita, javascript:, file: y vacío: no.
"""
import sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
import main  # noqa: E402


def main_():
    abiertas = []
    main.webbrowser.open = lambda u, *a, **k: abiertas.append(u) or True
    api = main.Api.__new__(main.Api)
    r = api.abrir_web("https://wonderunit.com/storyboarder/")
    if not (r and r.get("ok")) or abiertas != ["https://wonderunit.com/storyboarder/"]:
        raise SystemExit("REGRESIÓN: no abre la página de Storyboarder :: %r %r" % (r, abiertas))
    for mala in ["http://wonderunit.com/storyboarder/", "https://wonderunit.com.malo.io/", "https://otro.com/",
                 "javascript:alert(1)", "file:///C:/Windows/notepad.exe", "", None, "https://wonderunit.com@malo.io/"]:
        r = api.abrir_web(mala)
        if not (r and r.get("error")):
            raise SystemExit("REGRESIÓN: abrió una dirección que no es la del aliado :: %r" % mala)
    if abiertas != ["https://wonderunit.com/storyboarder/"]:
        raise SystemExit("REGRESIÓN: se abrió algo de más :: %r" % abiertas)
    print("OK abrir_web: sólo la página de Storyboarder (https), nada más")


if __name__ == "__main__":
    main_()
