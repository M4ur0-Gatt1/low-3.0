"""Alt solo no deja la ventana de LOW en «modo menú» (el «ding» al apretar una letra).

Reportado por Mauro (v3.28.1): «al apretar la B para elegir el pincel primero
me da un error de Windows sonoro, y después tengo que hacer un clic sobre el
dibujo y volver a apretar la B». Medido en la app real: después de soltar Alt
SOLO, el hilo de la ventana quedaba en modo menú del sistema y la letra
siguiente no llegaba a la página. Lo dispara WM_SYSCOMMAND/SC_KEYMENU.

Esta prueba crea una ventana de Windows DE VERDAD (sin mostrarla), le aplica
`_sin_modo_menu` como a la de LOW y comprueba con SendMessage:
- SC_KEYMENU (Alt solo, o Alt+letra) NO llega al procedimiento original;
- Alt+Espacio (el menú de la ventana) SÍ llega;
- cualquier otro mensaje sigue su camino.
En otro sistema operativo no aplica y se saltea."""
import ctypes
import sys
from pathlib import Path

if sys.platform != "win32":
    print("SIN MODO MENÚ: no es Windows, se saltea")
    sys.exit(0)

import ctypes.wintypes as wt

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main  # noqa: E402

fallas = []
def ok(c, m):
    print(("OK   " if c else "FALLA ") + m)
    if not c:
        fallas.append(m)

user32 = ctypes.WinDLL("user32")
kernel32 = ctypes.WinDLL("kernel32")
LRESULT = ctypes.c_ssize_t
WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM)
user32.DefWindowProcW.restype = LRESULT
user32.DefWindowProcW.argtypes = (wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM)
user32.SendMessageW.restype = LRESULT
user32.SendMessageW.argtypes = (wt.HWND, wt.UINT, wt.WPARAM, wt.LPARAM)
user32.CreateWindowExW.restype = wt.HWND
user32.CreateWindowExW.argtypes = (wt.DWORD, wt.LPCWSTR, wt.LPCWSTR, wt.DWORD, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                   ctypes.c_int, wt.HWND, wt.HMENU, wt.HINSTANCE, wt.LPVOID)

vistos = []
WM_SYSCOMMAND, SC_KEYMENU, WM_USER = 0x0112, 0xF100, 0x0400

def original(h, msg, wp, lp):
    if msg == WM_SYSCOMMAND or msg == WM_USER + 7:
        vistos.append((msg, wp, lp))
        return 1                                       # sin DefWindowProc: el menú de verdad bloquearía la prueba
    return user32.DefWindowProcW(h, msg, wp, lp)
proc = WNDPROC(original)

class WNDCLASSW(ctypes.Structure):
    _fields_ = [("style", wt.UINT), ("lpfnWndProc", WNDPROC), ("cbClsExtra", ctypes.c_int), ("cbWndExtra", ctypes.c_int),
                ("hInstance", wt.HINSTANCE), ("hIcon", wt.HICON), ("hCursor", wt.HANDLE), ("hbrBackground", wt.HBRUSH),
                ("lpszMenuName", wt.LPCWSTR), ("lpszClassName", wt.LPCWSTR)]

wc = WNDCLASSW(); wc.lpfnWndProc = proc; wc.lpszClassName = "LowPruebaSinMenu"; wc.hInstance = kernel32.GetModuleHandleW(None)
user32.RegisterClassW(ctypes.byref(wc))
hwnd = user32.CreateWindowExW(0, "LowPruebaSinMenu", "prueba", 0x00CF0000, 0, 0, 200, 200, None, None, wc.hInstance, None)
ok(bool(hwnd), "se creó una ventana de Windows de prueba")


class Handle:
    def __init__(s, h): s.h = h
    def ToInt64(s): return s.h


class Eventos:
    def __init__(s): s.shown = s
    def __iadd__(s, f): s.f = f; return s


class Ventana:
    def __init__(s, h): s.native = type("F", (), {"Handle": Handle(h)})(); s.events = Eventos()


v = Ventana(hwnd)
main._sin_modo_menu(v)
v.events.f()                                          # como cuando pywebview avisa que la ventana se mostró

user32.SendMessageW(hwnd, WM_SYSCOMMAND, SC_KEYMENU, 0)        # Alt solo
user32.SendMessageW(hwnd, WM_SYSCOMMAND, SC_KEYMENU, ord("b"))  # Alt+B
ok(not any(m == WM_SYSCOMMAND and (w & 0xFFF0) == SC_KEYMENU and l != 32 for m, w, l in vistos),
   "Alt solo y Alt+letra NO arrancan el modo menú: " + repr(vistos))
user32.SendMessageW(hwnd, WM_SYSCOMMAND, SC_KEYMENU, 32)        # Alt+Espacio
ok((WM_SYSCOMMAND, SC_KEYMENU, 32) in vistos, "Alt+Espacio sigue abriendo el menú de la ventana")
user32.SendMessageW(hwnd, WM_SYSCOMMAND, 0xF020, 0)             # minimizar: otro comando del sistema
ok((WM_SYSCOMMAND, 0xF020, 0) in vistos, "los demás comandos del sistema siguen pasando")
user32.SendMessageW(hwnd, WM_USER + 7, 5, 9)
ok((WM_USER + 7, 5, 9) in vistos, "los demás mensajes siguen pasando")
user32.DestroyWindow(hwnd)

print(f"\n{'FALLAS: ' + str(len(fallas)) if fallas else 'SIN MODO MENÚ OK'}")
sys.exit(1 if fallas else 0)
