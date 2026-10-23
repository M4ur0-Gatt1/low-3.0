"""Lo del Estudio 3D que es OBRA, en archivos de verdad (fase 1 del camino a la
estabilidad, docs/CAMINO_ESTABILIDAD.md).

Antes de la 3.44 la biblioteca 3D entera —los personajes con su escultura, su
ropa y su actuación, las escenografías propias— y el autoguardado de la escena
vivían en el almacenamiento del navegador (5 a 10 MB, sin archivo a la vista).
Un personaje en «Muy alta» pesa uno o dos megas: con unos pocos, el guardado
fallaba EN SILENCIO.

Acá:
- cada cosa es un archivo en %APPDATA%/LOW/estudio3d/ (nombres fijos: no se
  escribe nada que venga armado desde la página);
- se escribe ATÓMICO: primero a un archivo aparte, se fuerza al disco, y recién
  ahí reemplaza al de antes. Un corte de luz no deja un archivo a medias;
- el de antes queda como `.bak`: si el principal falta o está roto, se lee el
  respaldo;
- todo error vuelve como {"error": "…"} para que la página lo MUESTRE.
"""
import json
import os
from pathlib import Path

# lo único que se guarda acá (cualquier otro nombre se rechaza)
NOMBRES = {"biblioteca", "autoguardado"}
# la obra del 2D que vivía en el navegador: la biblioteca de personajes (v3.44)
NOMBRES_2D = {"personajes2d"}
# un tope generoso: 400 MB (una biblioteca enorme en «Muy alta» no llega)
TOPE = 400 * 1024 * 1024


def _respaldar(ruta):
    """El de antes pasa a `.bak` SIN que el principal desaparezca ni un
    instante: un segundo nombre para el mismo archivo (enlace duro) y el
    reemplazo de después sólo cambia a qué apunta el principal. Donde no hay
    enlaces duros, una copia."""
    bak = ruta.with_suffix(".json.bak")
    try:
        bak.unlink()
    except FileNotFoundError:
        pass
    try:
        os.link(ruta, bak)
    except OSError:
        import shutil
        shutil.copyfile(ruta, bak)


def escribir_atomico(carpeta, ruta, datos):
    """Primero a un archivo aparte, forzado al disco, y recién ahí reemplaza al
    de antes (que queda como `.bak`). Un corte no deja nada a medias."""
    tmp = ruta.with_suffix(".json.tmp")
    try:
        Path(carpeta).mkdir(parents=True, exist_ok=True)
        with open(tmp, "wb") as f:
            f.write(datos)
            f.flush()
            os.fsync(f.fileno())
        if ruta.exists():
            _respaldar(ruta)
        os.replace(tmp, ruta)
        return {"ok": True, "bytes": len(datos), "ruta": str(ruta)}
    except OSError as e:
        try:
            tmp.unlink()
        except OSError:
            pass
        return {"error": e.strerror or str(e)}


class Almacen3D:
    def __init__(self, carpeta, nombres=None):
        self.carpeta = Path(carpeta)
        self.nombres = NOMBRES if nombres is None else set(nombres)

    def _ruta(self, nombre):
        if nombre not in self.nombres:
            raise ValueError("nombre desconocido: " + str(nombre))
        return self.carpeta / (nombre + ".json")

    def leer(self, nombre):
        """{"json": texto} (o None si nunca se guardó). Si el principal está roto
        o falta, el respaldo; {"error"} sólo si no hay ninguno legible."""
        try:
            ruta = self._ruta(nombre)
        except ValueError as e:
            return {"error": str(e)}
        problemas = []
        for p in (ruta, ruta.with_suffix(".json.bak")):
            if not p.exists():
                continue
            try:
                texto = p.read_text(encoding="utf-8")
                json.loads(texto)   # que sea JSON entero (un archivo cortado no pasa)
                return {"json": texto, "respaldo": p != ruta}
            except (OSError, ValueError) as e:
                problemas.append(p.name + ": " + str(e))
        if problemas:
            return {"error": "no se pudo leer " + "; ".join(problemas)}
        return {"json": None}

    def guardar(self, nombre, texto):
        try:
            ruta = self._ruta(nombre)
        except ValueError as e:
            return {"error": str(e)}
        if not isinstance(texto, str):
            return {"error": "lo que llegó no es texto"}
        datos = texto.encode("utf-8")
        if len(datos) > TOPE:
            return {"error": "demasiado grande (%d MB)" % (len(datos) // (1024 * 1024))}
        try:
            json.loads(texto)
        except ValueError as e:
            return {"error": "no es JSON válido: " + str(e)}
        return escribir_atomico(self.carpeta, ruta, datos)

    def borrar(self, nombre):
        """Para el autoguardado (proyecto nuevo): el principal se va, el
        respaldo queda por si fue sin querer."""
        try:
            ruta = self._ruta(nombre)
            if ruta.exists():
                os.replace(ruta, ruta.with_suffix(".json.bak"))
            return {"ok": True}
        except (ValueError, OSError) as e:
            return {"error": str(e)}


# ── EL RESCATE ANTE CAÍDAS (v3.45) ─────────────────────────────────────────
# Lo sin guardar de cada documento y de cada escena, por si LOW se cierra mal.
# Vivía en el almacenamiento del navegador (~5 MB): un documento de más de
# 2,5 MB, o el almacén lleno, y no había rescate. Acá, un archivo por clave en
# %APPDATA%/LOW/rescate/. Las claves son las mismas que usaba la página; sólo
# se aceptan las de los dos rescates, y el nombre del archivo es un resumen de
# la clave (nada armado por la página llega a una ruta).
PREFIJOS_RESCATE = ("low.document.recovery.", "low.scene.recovery.v2.")


class AlmacenRescate:
    def __init__(self, carpeta):
        self.carpeta = Path(carpeta)

    def _ruta(self, clave):
        clave = str(clave)
        if not clave.startswith(PREFIJOS_RESCATE) or len(clave) > 600:
            raise ValueError("clave de rescate desconocida")
        import hashlib
        return self.carpeta / (hashlib.sha1(clave.encode("utf-8")).hexdigest() + ".json")

    def guardar(self, clave, texto):
        try:
            ruta = self._ruta(clave)
        except ValueError as e:
            return {"error": str(e)}
        if not isinstance(texto, str):
            return {"error": "lo que llegó no es texto"}
        datos = json.dumps({"clave": str(clave), "texto": texto}, ensure_ascii=False).encode("utf-8")
        if len(datos) > TOPE:
            return {"error": "demasiado grande (%d MB)" % (len(datos) // (1024 * 1024))}
        return escribir_atomico(self.carpeta, ruta, datos)

    def borrar(self, clave):
        try:
            ruta = self._ruta(clave)
            for p in (ruta, ruta.with_suffix(".json.bak")):
                if p.exists():
                    p.unlink()
            return {"ok": True}
        except (ValueError, OSError) as e:
            return {"error": str(e)}

    def leer_todo(self):
        """{"registros": {clave: texto}}. Un archivo roto se lee de su respaldo;
        si ninguno sirve, se cuenta en "rotos" (y se deja, por si se puede
        recuperar a mano)."""
        registros, rotos = {}, 0
        if not self.carpeta.is_dir():
            return {"registros": registros, "rotos": 0}
        for ruta in sorted(self.carpeta.glob("*.json")):
            leido = None
            for p in (ruta, ruta.with_suffix(".json.bak")):
                try:
                    d = json.loads(p.read_text(encoding="utf-8"))
                    if isinstance(d, dict) and isinstance(d.get("texto"), str) and str(d.get("clave", "")).startswith(PREFIJOS_RESCATE):
                        leido = d
                        break
                except (OSError, ValueError):
                    continue
            if leido is None:
                rotos += 1
            else:
                registros[leido["clave"]] = leido["texto"]
        return {"registros": registros, "rotos": rotos}
