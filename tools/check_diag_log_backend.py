"""El log de diagnostico de tableta no puede crecer sin techo.

POR QUE EXISTE ESTE ARCHIVO. Revisando la carpeta de datos de LOW en la maquina
de Mauro aparecio `diag-log.txt` con **23 MB**, creciendo desde agosto. El
diagnostico de tableta escribe un renglon por evento de puntero y
`save_tablet_log` solo hacia `append`: nadie lo vaciaba nunca. Un log asi deja
de ser diagnostico y pasa a ser basura que ocupa disco, y abrirlo para ver los
ultimos eventos —que es para lo unico que sirve— se vuelve incomodo.

Se prueba en una carpeta temporal, redirigiendo `data_dir`. No toca el log real.
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import main as low
from main import Api


def main_test():
    with tempfile.TemporaryDirectory(prefix="low-diag-") as folder:
        base = Path(folder)
        original = low.data_dir
        low.data_dir = lambda: base
        try:
            puente = Api.__new__(Api)
            destino = base / "diag-log.txt"

            # -- 1. escribe lo que se le manda, y lo deja legible
            puente.save_tablet_log("down id1 pr:0.5")
            texto = destino.read_text(encoding="utf-8")
            assert "down id1 pr:0.5" in texto, "no guardo el evento"
            assert texto.count("\n") >= 2, "no separo la entrada con su encabezado"

            # -- 2. EL TOPE. Se siembra un log mas grande que el tope y se
            #       comprueba que la escritura siguiente lo RECORTA.
            tope = puente.DIAG_LOG_TOPE
            assert tope <= 8 * 1024 * 1024, \
                "el tope es tan grande que no protege de nada: %d bytes" % tope
            # cada renglón numerado, para poder distinguir DESPUÉS cuál mitad
            # sobrevivió: sin eso la prueba no nota si se conserva el principio
            cuantos = (tope // 10) + 5000        # renglones de 14 bytes: pasa el tope
            destino.write_bytes(b"".join(b"evento %06d\n" % n for n in range(cuantos)))
            antes = destino.stat().st_size
            assert antes > tope, antes
            puente.save_tablet_log("down id2 pr:0.9")
            despues = destino.stat().st_size
            assert despues < antes, \
                "el log NO se recorto: sigue creciendo sin techo (%d bytes)" % despues
            assert despues <= tope, \
                "el log quedo por encima del tope despues de recortar: %d" % despues

            # -- 3. Y LO QUE SE CONSERVA ES LO ULTIMO. Recortar guardando el
            #       principio seria peor que no recortar: se tiraria justo lo
            #       que hace falta para diagnosticar.
            final = destino.read_text(encoding="utf-8", errors="replace")
            assert "down id2 pr:0.9" in final, \
                "el recorte se llevo el evento que se acababa de escribir"
            assert ("evento %06d" % (cuantos - 1)) in final, \
                "el recorte NO conservo los ultimos eventos, que son los unicos que " \
                "sirven para diagnosticar"
            assert "evento 000000" not in final, \
                "el recorte conservo el PRINCIPIO del log: se quedo con los eventos de " \
                "hace dos meses y tiro los de la sesion que se esta diagnosticando"
            assert "recortado" in final, \
                "no queda dicho que el log se recorto: parece que faltan eventos"

            # -- 4. Un log chico NO se toca: recortar de mas pierde contexto.
            destino.write_text("dos renglones\nchiquitos\n", encoding="utf-8")
            puente.save_tablet_log("down id3")
            corto = destino.read_text(encoding="utf-8")
            assert "dos renglones" in corto and "down id3" in corto, \
                "recorto un log que estaba lejos del tope"
        finally:
            low.data_dir = original

    print("DIAG LOG OK: escribe, recorta al pasar el tope conservando lo ultimo, "
          "y no toca un log chico")


if __name__ == "__main__":
    main_test()
