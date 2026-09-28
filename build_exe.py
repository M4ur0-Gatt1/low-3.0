"""Build de LOW para Windows: icono -> LOW.exe -> instalador.
Uso: python build_exe.py [fast|clean|release]

  fast    = --onedir (carpeta), sin UPX, sin clean (30-60s, para pruebas)
  clean   = --onedir + --clean (borra cache, build fresco)
  release = --onefile + UPX + clean -> .exe único listo para el instalador

Genera:
  release: dist/LOW.exe              (onefile, el instalador usa ESTE)
  fast/clean: dist/LOW/LOW.exe + deps (onedir, para testing manual)

El instalador (Inno Setup) espera dist/LOW.exe (onefile).
Si no hay Inno Setup, el .exe se puede usar suelto (modo release)
o desde la carpeta dist/LOW/ (modo fast/clean).

Consejo: correr desde C:\temp_low_build (SSD local) para velocidad,
no desde el NAS (PyInstaller sobre UNC es lento y a veces falla).
"""
import os
import shutil
import subprocess
import sys

os.chdir(os.path.dirname(os.path.abspath(__file__)))

MODE = sys.argv[1] if len(sys.argv) > 1 else "fast"

# 1. Icono (requiere Pillow)
if not os.path.exists("low.ico"):
    subprocess.check_call([sys.executable, "make_icon.py"])

# 2. Runtime hook de pythonnet (necesario para WebView2 en .exe)
if not os.path.exists("pyi_rth_pythonnet.py"):
    raise FileNotFoundError(
        "Falta pyi_rth_pythonnet.py — runtime hook para pythonnet/.NET.\n"
        "Sin esto el .exe falla con: Failed to create a .NET runtime (coreclr).\n"
        "Creá el archivo o recuperalo de la release v3.18.4+ en GitHub.")

# 3. PyInstaller
try:
    import PyInstaller
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", "pyinstaller"])

# 4. Leer versión
ver = open("VERSION", encoding="utf-8").read().strip()

# 5. Elegir spec según modo
if MODE == "fast":
    spec = "LOW_fast.spec"
    extra = ["--noconfirm"]
    print(f"[FAST] --onedir, sin limpiar (~60s)")
elif MODE == "clean":
    spec = "LOW_fast.spec"
    extra = ["--noconfirm", "--clean"]
    print(f"[CLEAN] --onedir + clean (~3 min)")
elif MODE == "release":
    spec = "LOW.spec"
    extra = ["--noconfirm", "--clean"]
    print(f"[RELEASE] --onefile + UPX + clean (~6-10 min)")
else:
    print(f"Modo desconocido: {MODE}. Usá: fast | clean | release")
    sys.exit(1)

# 6. PyInstaller
subprocess.check_call([sys.executable, "-m", "PyInstaller", spec] + extra)

if MODE == "release":
    exe_path = "dist/LOW.exe"
    assert os.path.exists(exe_path), f"❌ No se generó {exe_path}"
    print(f"\n[OK] {exe_path}  ({os.path.getsize(exe_path)/1024/1024:.1f} MB)")
else:
    exe_path = "dist/LOW/LOW.exe"
    assert os.path.exists(exe_path), f"❌ No se generó {exe_path}"
    print(f"\n[OK] {exe_path}  ({os.path.getsize(exe_path)/1024/1024:.1f} MB)")

# 7. Instalador (solo en modo release con onefile)
iscc_paths = [
    os.path.expandvars(r"%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"),
    r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    r"C:\Program Files\Inno Setup 6\ISCC.exe",
]
iscc = next((p for p in iscc_paths if os.path.exists(p)), None)

if not iscc:
    print("\n[Aviso] Inno Setup no encontrado; instalador omitido.")
    print("Instalarlo con: winget install JRSoftware.InnoSetup")
elif MODE != "release":
    print("\n[Aviso] El instalador solo se genera en modo 'release' (--onefile).")
    print(f"Modo actual: {MODE}. Probá con: python build_exe.py release")
else:
    # Pasar versión al .iss
    subprocess.check_call(
        [iscc, "/DAppVersion=" + ver, "low_installer.iss"],
        timeout=300)
    out = f"Output/LOWSetup-{ver}.exe"
    if os.path.exists(out):
        print(f"\n[OK] {out}  ({os.path.getsize(out)/1024/1024:.1f} MB)")
    else:
        print(f"\n❌ No se generó {out}")
