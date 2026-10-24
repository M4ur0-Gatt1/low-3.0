"""Pruebas del feed en vivo del agente (code_runner/live_feed.py).
Uso: python tools/run_live_feed_tests.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from code_runner import live_feed  # noqa: E402

ok = 0


def check(cond, msg):
    global ok
    if not cond:
        print("FALLA:", msg)
        sys.exit(1)
    ok += 1


# archivo nuevo: todo es agregado
e = live_feed.diff_event("a.py", None, "x = 1\ny = 2\n")
check(e["new"] is True, "nuevo marcado")
check(e["added"] == 2 and e["removed"] == 0, f"conteo nuevo {e['added']}/{e['removed']}")
check(not any(l.startswith(("---", "+++")) for l in e["lines"]), "sin cabeceras ---/+++")

# edición: una línea cambia
e = live_feed.diff_event("a.py", "a\nb\nc\n", "a\nB\nc\n")
check(e["new"] is False, "edición no es nueva")
check(e["added"] == 1 and e["removed"] == 1, "una línea cambiada = +1 -1")
check("-b" in e["lines"] and "+B" in e["lines"], "líneas del diff presentes")
check(any(l.startswith("@@") for l in e["lines"]), "hunk presente")

# sin cambios reales
e = live_feed.diff_event("a.py", "igual\n", "igual\n")
check(e["lines"] == [] and e["added"] == 0, "sin diferencias")

# recorte de archivos enormes, pero el conteo es el real
big = "\n".join(str(i) for i in range(2000))
e = live_feed.diff_event("big.txt", None, big)
check(e["truncated"] and len(e["lines"]) == live_feed.MAX_DIFF_LINES, "diff recortado")
check(e["added"] == 2000, "conteo real aunque se recorte")

# terminal: exit code y recorte al final (donde están los errores)
t = live_feed.term_event("npm test", 1, "x" * 10000 + "ERROR FINAL")
check(t["code"] == 1 and t["truncated"], "term recortado")
check(t["output"].endswith("ERROR FINAL"), "conserva el final de la salida")
check(t["kind"] == "shell", "tipo por defecto")
t = live_feed.term_event("git status", 0, "limpio\n", "git")
check(t["output"] == "limpio" and t["kind"] == "git" and not t["truncated"], "term corto")

print(f"LIVE FEED OK {ok}/{ok}")
