"""Una segunda instancia de LOW tiene que abrir.

POR QUE EXISTE ESTE ARCHIVO. En v4.32.0 se fijo el perfil de la interfaz para
que LOW dejara de estrenar almacenamiento vacio en cada arranque —se perdian los
pinceles, la disposicion de paneles y el rescate ante caida—. El efecto que no se
vio venir: WebView2 toma ese perfil EN EXCLUSIVA, asi que con LOW abierto una
segunda instancia no abria en absoluto.

Medido el 2026-09-12, intentando abrir LOW mientras Mauro lo tenia abierto:

    [pywebview] WebView2 initialization failed with exception:
      (0x8007139F): El grupo o recurso no esta en el estado correcto...

Ni ventana, ni aviso: solo una traza de .NET en el log. Y abrir dos proyectos a
la vez es algo que uno hace.

`_perfil_libre` mira el candado del propio WebView2 —`EBWebView/lockfile`, que
el proceso dueno mantiene abierto en exclusiva— y si ese perfil esta tomado usa
`webview-2`, `webview-3`... Se mira ESE candado a proposito: asi tambien se
detecta una instancia de una version ANTERIOR de LOW, que es el caso real.
Esto prueba el reparto en carpetas temporales, sin tocar el perfil de nadie.
"""
import os
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main as low


def main():
    with tempfile.TemporaryDirectory(prefix="low-perfil-") as folder:
        base = str(Path(folder) / "webview")

        # -- 1. Un perfil FRESCO es el de siempre: ahi viven los pinceles y los
        #       paneles de la persona.
        ruta1, n1 = low._perfil_libre(base)
        assert ruta1 == base and n1 == 1, (ruta1, n1)
        assert Path(ruta1).is_dir(), "no creo la carpeta del perfil"

        # -- 2. CON EL PERFIL TOMADO, la segunda instancia NO SE QUEDA AFUERA.
        #       Se simula el candado de WebView2 tal cual: `EBWebView/lockfile`
        #       abierto en exclusiva por otro proceso.
        candado = Path(ruta1) / "EBWebView" / "lockfile"
        candado.parent.mkdir(parents=True, exist_ok=True)
        candado.write_bytes(b"x")
        # El candado se toma con el mecanismo de CADA plataforma: `msvcrt` no
        # existe fuera de Windows y CI corre en Linux.
        if os.name == "nt":
            import msvcrt
        else:
            import fcntl
        with open(candado, "r+b") as tomado:
            if os.name == "nt":
                msvcrt.locking(tomado.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                fcntl.flock(tomado.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
            assert low._perfil_en_uso(ruta1),                 "no detecto que el perfil esta tomado: la ventana no abriria (0x8007139F)"
            ruta2, n2 = low._perfil_libre(base)
            assert ruta2 != ruta1, (
                "la segunda instancia recibio EL MISMO perfil que la primera: "
                "WebView2 lo toma en exclusiva y la ventana no abre, sin aviso")
            assert n2 == 2 and ruta2 == base + "-2", (ruta2, n2)
            assert Path(ruta2).is_dir(), "no creo la carpeta de la segunda instancia"
            if os.name == "nt":
                msvcrt.locking(tomado.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                fcntl.flock(tomado.fileno(), fcntl.LOCK_UN)

        # -- 3. AL CERRARSE la otra instancia, el perfil de siempre vuelve a
        #       usarse: no se acumulan carpetas para siempre.
        assert not low._perfil_en_uso(ruta1),             "el perfil quedo marcado como tomado despues de soltarlo: un candado viejo "             "dejaria el perfil de siempre inservible para siempre"
        ruta3, n3 = low._perfil_libre(base)
        assert ruta3 == base and n3 == 1, (ruta3, n3)

        # -- 4. Un perfil sin `lockfile` —recien creado— esta libre.
        assert not low._perfil_en_uso(str(Path(folder) / "nuevo")),             "un perfil que ni existe se dio por tomado"

    print("PERFIL OK: la segunda instancia abre con el suyo, y el de siempre "
          "vuelve a usarse cuando la otra se cierra")


if __name__ == "__main__":
    main()
