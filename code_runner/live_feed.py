"""Feed EN VIVO del agente (estilo Devin): lo que el agente cambia y ejecuta,
listo para mostrarse mientras trabaja.

Funciones puras (sin ventana ni red) para poder probarlas solas:
- diff_event(path, before, after): diff unificado de una escritura/edición.
- term_event(command, code, output): una ejecución de terminal.

main.py las llama desde write_file / edit_file / exec_cmd / git y empuja el
resultado a la UI con los eventos "live_diff" y "live_term". Los tamaños están
acotados para que un archivo enorme no congele el WebView.
"""
import difflib
import time

MAX_DIFF_LINES = 400      # líneas de diff que viajan a la UI
MAX_TERM_CHARS = 6000     # salida de terminal que viaja a la UI


def diff_event(path, before, after, context=3):
    """Evento live_diff. `before` None = archivo nuevo."""
    nuevo = before is None
    a = [] if nuevo else (before or "").splitlines()
    b = (after or "").splitlines()
    lines = list(difflib.unified_diff(a, b, fromfile="antes", tofile="después",
                                      n=context, lineterm=""))
    # las 2 cabeceras --- / +++ no aportan en la UI
    if len(lines) >= 2 and lines[0].startswith("---") and lines[1].startswith("+++"):
        lines = lines[2:]
    added = sum(1 for l in lines if l.startswith("+"))
    removed = sum(1 for l in lines if l.startswith("-"))
    truncated = len(lines) > MAX_DIFF_LINES
    if truncated:
        lines = lines[:MAX_DIFF_LINES]
    return {"path": str(path), "new": nuevo, "added": added, "removed": removed,
            "lines": lines, "truncated": truncated, "ts": time.time()}


def term_event(command, code, output, kind="shell"):
    """Evento live_term: comando, exit code y salida (recortada al FINAL, que es
    donde suelen estar los errores)."""
    out = (output or "").rstrip()
    truncated = len(out) > MAX_TERM_CHARS
    if truncated:
        out = "…\n" + out[-MAX_TERM_CHARS:]
    return {"command": str(command), "code": code, "output": out, "kind": kind,
            "truncated": truncated, "ts": time.time()}
