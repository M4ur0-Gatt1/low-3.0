"""Los documentos recientes que ofrece la portada (v3.2).

Vive aparte de main.py a proposito: alli un contrato prohibe leer fechas de
modificacion, porque volvio mas de una vez una heuristica equivocada sobre la
fecha DEL EJECUTABLE (ver tools/check_2d_interaction_contracts.py). Aca la fecha
se usa para otra cosa —ordenar los .low del proyecto del mas nuevo al mas
viejo— y es justo el dato que corresponde.
"""
import os
from pathlib import Path


def documentos_recientes(base, ignorar=(), limite=8, tope_archivos=4000):
    """Los .low bajo `base`, del mas nuevo al mas viejo.

    Se saltean carpetas ocultas (entre ellas la papelera .low-trash) y las de
    `ignorar`; se corta a los `tope_archivos` recorridos para no trabarse en un
    proyecto enorme."""
    base = Path(base)
    if not base.is_dir():
        return []
    try:
        limite = max(1, min(int(limite), 30))
    except (TypeError, ValueError):
        limite = 8
    vistos, encontrados = 0, []
    for raiz, dirs, archivos in os.walk(base):
        dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ignorar]
        for nombre in archivos:
            vistos += 1
            if nombre.lower().endswith(".low"):
                fp = Path(raiz) / nombre
                try:
                    encontrados.append((os.stat(fp).st_mtime, fp))
                except OSError:
                    pass
        if vistos > tope_archivos:
            break
    encontrados.sort(key=lambda x: x[0], reverse=True)
    salida = []
    for mtime, fp in encontrados[:limite]:
        carpeta = fp.parent.relative_to(base).as_posix() if fp.parent != base else ""
        salida.append({"path": str(fp), "name": fp.name, "folder": carpeta, "mtime": mtime})
    return salida
