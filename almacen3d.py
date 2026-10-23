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
        try:
            self.carpeta.mkdir(parents=True, exist_ok=True)
            tmp = ruta.with_suffix(".json.tmp")
            with open(tmp, "wb") as f:
                f.write(datos)
                f.flush()
                os.fsync(f.fileno())
            if ruta.exists():
                self._respaldar(ruta)
            os.replace(tmp, ruta)
            return {"ok": True, "bytes": len(datos), "ruta": str(ruta)}
        except OSError as e:
            try:
                tmp.unlink()
            except (OSError, UnboundLocalError):
                pass
            return {"error": e.strerror or str(e)}

    @staticmethod
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
