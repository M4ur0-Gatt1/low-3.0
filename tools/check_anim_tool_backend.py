#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
LA HERRAMIENTA `anim` DEL AGENTE TIENE QUE ANDAR

Medido en LOW 3.47-3.49: toda llamada a `anim` respondía
«'NoneType' object is not callable». No era el motor: en la clase de la API,
`__init__` hace `s._anim = None` y el método puente también se llamaba `_anim`,
así que el atributo de instancia tapaba al método.

Este control verifica dos cosas:
  1. Ningún método de las clases de main.py queda tapado por un atributo de
     instancia del mismo nombre (`s.x = ...` / `self.x = ...`).
  2. El puente `_anim_tool` crea un proyecto, agrega un actor, pone claves y
     devuelve el resumen, usando el motor real (low_anim.AnimationAPI).

    python tools/check_anim_tool_backend.py
"""
import ast
import shutil
import sys
import tempfile
import types
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
fallas = []


def controlar(ok, mensaje):
    print(("OK   " if ok else "FALLA") + "  " + mensaje)
    if not ok:
        fallas.append(mensaje)


# 1) atributos que tapan métodos
arbol = ast.parse((RAIZ / "main.py").read_text(encoding="utf-8"))
tapados = []
for clase in [n for n in arbol.body if isinstance(n, ast.ClassDef)]:
    metodos = {f.name for f in clase.body if isinstance(f, (ast.FunctionDef, ast.AsyncFunctionDef))}
    for nodo in ast.walk(clase):
        if isinstance(nodo, (ast.Assign, ast.AnnAssign)):
            destinos = nodo.targets if isinstance(nodo, ast.Assign) else [nodo.target]
            for d in destinos:
                if (isinstance(d, ast.Attribute) and isinstance(d.value, ast.Name)
                        and d.value.id in ("s", "self") and d.attr in metodos):
                    tapados.append("%s.%s (línea %d)" % (clase.name, d.attr, nodo.lineno))
controlar(not tapados, "ningún método queda tapado por un atributo de instancia"
          + ("" if not tapados else ": " + ", ".join(sorted(set(tapados)))))

# 2) el puente de verdad, contra el motor real
fuente = (RAIZ / "main.py").read_text(encoding="utf-8")
modulo = ast.parse(fuente)
metodo = None
for clase in [n for n in modulo.body if isinstance(n, ast.ClassDef)]:
    for f in clase.body:
        if isinstance(f, ast.FunctionDef) and f.name == "_anim_tool":
            metodo = f
controlar(metodo is not None, "existe el puente _anim_tool")
if metodo is not None:
    espacio = {}
    codigo = ast.Module(body=[metodo], type_ignores=[])
    import json
    import os
    exec(compile(codigo, "main.py:_anim_tool", "exec"),
         {"Path": Path, "json": json, "os": os, "__builtins__": __builtins__}, espacio)
    trabajo = Path(tempfile.mkdtemp(prefix="low-anim-"))
    try:
        api = types.SimpleNamespace(_anim=None, ws=str(trabajo))
        api._base = lambda: trabajo
        api._push = lambda *a, **k: None
        llamar = lambda accion, params=None: espacio["_anim_tool"](api, accion, params or {})
        r1 = str(llamar("new", {"name": "prueba", "width": 640, "height": 360, "fps": 12, "duration": 1}))
        controlar("NoneType" not in r1 and not r1.startswith("\u274c"), "anim new responde: " + r1[:90])
        svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 80"><rect width="40" height="80" fill="#B98058"/></svg>'
        r2 = str(llamar("add_actor", {"layer": "personajes", "name": "tano", "svg": svg, "x": 100, "y": 200}))
        controlar("NoneType" not in r2, "anim add_actor responde: " + r2[:90])
        r3 = str(llamar("keyframe", {"actor": "tano", "frame": 0, "x": 100, "y": 200}))
        r4 = str(llamar("keyframe", {"actor": "tano", "frame": 11, "x": 500, "y": 200}))
        controlar("NoneType" not in r3 + r4, "anim keyframe responde")
        r5 = str(llamar("timeline_summary", {}))
        controlar("NoneType" not in r5 and "tano" in r5.lower(), "anim timeline_summary ve al actor: " + r5[:90])
    except Exception as e:  # noqa: BLE001 — el control informa cualquier rotura
        controlar(False, "el puente explotó: %r" % (e,))
    finally:
        shutil.rmtree(trabajo, ignore_errors=True)

print()
print("FALLAS: %d" % len(fallas) if fallas else "TODO OK")
sys.exit(1 if fallas else 0)
