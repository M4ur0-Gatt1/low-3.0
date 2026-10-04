"""Lo reciente de la portada: `recent_documents` del puente.

La portada de la v3.2 dejó de promocionar el experimento «Interpretar» y pasó a
ofrecer lo que ofrece un programa de animación: empezar, abrir y SEGUIR donde
se dejó. Se exige:

1. Devuelve los .low del proyecto, del más nuevo al más viejo.
2. No mira dentro de carpetas ocultas ni de la papelera (.low-trash): ofrecer
   un documento borrado sería devolverlo a la vida sin que nadie lo pida.
3. Respeta el límite y nunca devuelve otra cosa que .low.
4. Sin proyecto abierto devuelve una lista vacía, sin adoptar ninguna carpeta:
   mirar no puede crear nada en el disco.
"""
import os
import sys
import tempfile
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from main import Api  # noqa: E402


def main():
    with tempfile.TemporaryDirectory(prefix="low-recientes-") as carpeta:
        base = Path(carpeta)
        (base / "disenos").mkdir()
        (base / "otro").mkdir()
        (base / ".low-trash").mkdir()
        ahora = time.time()
        archivos = {
            "disenos/viejo.low": ahora - 3000,
            "disenos/medio.low": ahora - 2000,
            "otro/nuevo.low": ahora - 10,
            "disenos/no-es.svg": ahora,
            ".low-trash/borrado.low": ahora + 5,
        }
        for rel, t in archivos.items():
            fp = base / rel
            fp.write_text("{}", encoding="utf-8")
            os.utime(fp, (t, t))

        puente = Api.__new__(Api)
        puente.ws = str(base)
        r = puente.recent_documents(8)
        nombres = [d["name"] for d in r]
        assert nombres == ["nuevo.low", "medio.low", "viejo.low"], \
            "no vienen del más nuevo al más viejo, o se coló algo que no es un .low vivo: %r" % nombres
        assert all(Path(d["path"]).exists() for d in r)
        assert r[0]["folder"] == "otro" and r[1]["folder"] == "disenos", r
        assert "borrado.low" not in nombres, "ofrece un documento de la papelera"

        assert [d["name"] for d in puente.recent_documents(2)] == ["nuevo.low", "medio.low"], \
            "no respeta el límite"

        sin = Api.__new__(Api)
        sin.ws = None
        assert sin.recent_documents() == [], "sin proyecto tiene que devolver una lista vacía"
        assert sin.ws is None, "mirar los recientes adoptó una carpeta: mirar no puede crear nada"

    print("RECIENTES OK: los .low del proyecto, del más nuevo al más viejo, sin papelera "
          "ni ocultos, con límite, y sin proyecto no inventa nada")


if __name__ == "__main__":
    main()
