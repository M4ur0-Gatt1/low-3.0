"""Runtime hook de PyInstaller para pythonnet (clr).

Busca el runtime de .NET en la máquina y setea las variables de entorno
ANTES de que pythonnet/clr_loader intente cargar el CLR. Sin esto, el .exe
revienta con:
  RuntimeError: Failed to create a .NET runtime (coreclr/netfx).

Estrategia:
- Si hay .NET Core/5+ → DOTNET_ROOT + PYTHONNET_RUNTIME=coreclr
- Si no → no tocamos nada: pythonnet usará netfx (.NET Framework 4.x de Windows)
- cffi DEBE estar incluido en el build (hidden import en el .spec)
"""
import os
import sys


def _find_dotnet_core():
    """Busca .NET Core/5+ (host/fxr). Devuelve el root o None."""
    candidates = []

    dr = os.environ.get("DOTNET_ROOT", "")
    if dr and os.path.isdir(os.path.join(dr, "host", "fxr")):
        candidates.append(dr)

    for base in [
        r"C:\Program Files\dotnet",
        r"C:\Program Files (x86)\dotnet",
        os.path.expandvars(r"%LOCALAPPDATA%\Microsoft\dotnet"),
        os.path.expandvars(r"%ProgramFiles%\dotnet"),
    ]:
        if os.path.isdir(os.path.join(base, "host", "fxr")):
            candidates.append(base)

    import shutil
    dotnet_exe = shutil.which("dotnet")
    if dotnet_exe:
        d = os.path.dirname(dotnet_exe)
        if os.path.isdir(os.path.join(d, "host", "fxr")):
            candidates.append(d)

    return candidates[0] if candidates else None


# FORZAMOS netfx SIEMPRE en Windows (NO coreclr).
# .NET Framework 4.x viene preinstalado en Windows 10/11 y NO necesita:
#   - DOTNET_ROOT
#   - cffi / clr_loader.ffi (que es frágil de empaquetar con PyInstaller)
#   - .NET Core SDK instalado en la máquina del usuario
# coreclr requiere cffi + hostfxr y falla en muchas PCs limpias.
os.environ["PYTHONNET_RUNTIME"] = "netfx"

# Si por algún motivo el sistema tenía DOTNET_ROOT, lo limpiamos
# para que pythonnet no intente coreclr por error.
os.environ.pop("DOTNET_ROOT", None)
