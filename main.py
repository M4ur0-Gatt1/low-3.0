"""LOW — editor de código con agente IA multi-proveedor.

UI web (pywebview + WebView2) que implementa design_handoff_low_editor 1:1.
Este módulo es el puente: expone la lógica Python (providers, runner, config)
como js_api para ui/app.js. La versión CustomTkinter quedó en main_ctk.py.
"""
import base64
import datetime
import difflib
import html as _html
import http.server
import json
import platform
import os
import re
import shutil
import socketserver
import subprocess
import sys
import threading
import time
import tempfile
import urllib.parse
import webbrowser
from pathlib import Path

import requests
import webview

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import Config, data_dir
from providers import get_provider, PROVIDERS, is_custom_provider
from providers.media_gateway import generate as generate_media
from code_runner.agent_plan import TOOL as PLAN_TOOL, validate as validate_plan
from code_runner import CodeRunner
try:
    from low_anim import AnimationAPI
except Exception:            # dep opcional ausente (p.ej. numpy): LOW arranca igual
    AnimationAPI = None
from self_improvement import SelfImprovementSystem

IGNORE_DIRS = {".git", "__pycache__", "node_modules", ".venv", "venv",
               "dist", "build", ".idea", ".vscode"}
CODE_EXT = {".py", ".js", ".ts", ".tsx", ".jsx", ".md", ".txt", ".json",
            ".html", ".css", ".sh", ".ps1", ".yml", ".yaml", ".toml",
            ".sql", ".c", ".cpp", ".h", ".rs", ".go", ".java"}
# imágenes/vectores/documentos: se muestran en el árbol (para reabrirlos en el
# visor/editor de diseño o en su app) pero NO entran al contexto ni al search
ASSET_EXT = {".svg", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp",
             ".docx", ".pdf", ".mp4", ".webm"}
LANG_BY_EXT = {".py": "python", ".js": "javascript", ".ts": "javascript",
               ".sh": "bash", ".ps1": "powershell"}

LOW_VERSION = "3.1.0"
# El puerto desde el que se sirve la interfaz. FIJO a propósito: `localStorage`
# es por origen, y con un puerto al azar en cada arranque LOW estrenaba
# almacenamiento vacío cada vez —se perdían el rescate ante caída, los pinceles
# y la disposición de paneles—. Ver el bloque de `webview.start` al final.
LOW_UI_PORT = 47141


def _puerto_libre(puerto: int) -> bool:
    """¿Se puede escuchar en ese puerto? Se pregunta ANTES de arrancar."""
    import socket
    with socket.socket() as s:
        try:
            s.bind(("127.0.0.1", puerto))
            return True
        except OSError:
            return False
def _perfil_en_uso(ruta) -> bool:
    """¿Hay otra instancia usando ese perfil de WebView2?

    La señal es el propio candado de WebView2, `EBWebView/lockfile`, que el
    proceso dueño mantiene abierto en exclusiva. Se mira ESE y no un candado
    nuestro a propósito: así también se detecta una instancia de una versión
    ANTERIOR de LOW, que es el caso real —Mauro trabajando con la versión
    instalada mientras se abre otra—. Si el archivo no existe, el perfil está
    fresco. Si el proceso dueño murió, Windows suelta el handle y vuelve a
    abrirse: un candado viejo no deja el perfil inservible.
    """
    candado = os.path.join(ruta, "EBWebView", "lockfile")
    if not os.path.exists(candado):
        return False
    try:
        with open(candado, "r+b") as f:
            # Dos candados distintos y los dos cuentan: WebView2 abre el archivo
            # sin compartir —y entonces falla el `open`— y ademas toma el rango.
            # Probar los dos deja la deteccion a salvo de como lo tome cada
            # version, y es lo que hace verificable esta funcion.
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
                msvcrt.locking(f.fileno(), msvcrt.LK_UNLCK, 1)
            else:
                import fcntl
                fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
            return False
    except OSError:
        return True


def _perfil_libre(base, maximo=8):
    """El perfil de la interfaz que ESTE proceso puede usar.

    Desde v4.32.0 el perfil es fijo para no perder pinceles, paneles ni rescate
    entre arranques. El efecto que no se vio venir: WebView2 toma el perfil en
    exclusiva, así que **una segunda instancia de LOW no abría en absoluto** —
    moría con `0x8007139F` («el grupo o recurso no está en el estado correcto»)
    y una traza de .NET en el log, sin ventana ni explicación. Abrir dos
    proyectos a la vez es algo que uno hace.

    Si el perfil de siempre está tomado, esta instancia usa `webview-2`,
    `webview-3`… Abre y funciona; lo que no comparte son las preferencias con la
    otra, y queda dicho en el log.
    """
    for n in range(1, maximo + 1):
        ruta = base if n == 1 else base + "-" + str(n)
        try:
            os.makedirs(ruta, exist_ok=True)
        except OSError:
            continue
        if not _perfil_en_uso(ruta):
            return ruta, n
    return base, 1


# Hora en que empezó a correr ESTE proceso. Sirve para detectar que el
# instalador reemplazó el .exe con LOW abierto: ver binario_reemplazado().
_ARRANQUE = __import__("time").time()


def atomic_write_text(path, content, encoding="utf-8"):
    """Escribe texto sin exponer un archivo parcial.

    El temporal vive junto al destino para que ``os.replace`` sea atómico en
    el mismo volumen. Si escribir o reemplazar falla, el archivo anterior queda
    intacto y el temporal se elimina. Esta es la garantía detrás de Ctrl+S.
    """
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
                mode="w", encoding=encoding, newline="", dir=target.parent,
                prefix=f".{target.name}.", suffix=".tmp", delete=False) as tmp:
            tmp_path = Path(tmp.name)
            tmp.write(content)
            tmp.flush()
            os.fsync(tmp.fileno())
        os.replace(tmp_path, target)
        return target
    except Exception:
        if tmp_path:
            try:
                tmp_path.unlink(missing_ok=True)
            except OSError:
                pass
        raise

# Desafío por defecto del comparador: verificable automáticamente
DEFAULT_TASK = ("Escribe un programa Python que imprima los primeros 10 numeros "
                "primos en una sola linea separados por coma.")
DEFAULT_EXPECTED = "2, 3, 5, 7, 11, 13, 17, 19, 23, 29"

# System prompt por defecto del agente. Editable desde  — LOW no agrega
# ningún filtro ni instrucción oculta más allá de esto.
DEFAULT_SP = ("Estás corriendo en LOW v" + LOW_VERSION + ". Eres LOW, agente creativo y programador senior orientado a programación, diseño, video y animación. Tienes HERRAMIENTAS: read_file, "
              "write_file, edit_file, exec_cmd, run_code, list_files, search_code, "
              "git, ssh_exec, scp_upload, generate_image, remember, check_design, social_export, "
              "web_search, web_fetch, write_doc, edit_image, refine_image, animate_image, generate_video. "
              "PRECISION de imagen: usa seed en generate_image para iterar cambiando UNA "
              "cosa a la vez (mismo seed = misma base); refina el resultado final con "
              "refine_image (detalle y nitidez estilo Magnific) antes de entregarlo. "
              "Usalas y ACTUA directo, sin pedir permiso. "
              "ANIMACION/storyboard/animatic: 1) crea el cuadro clave (generate_image o "
              "un SVG); 2) para el resto de los planos MANTENE EL ESTILO usando edit_image "
              "sobre el cuadro anterior (nunca generes de cero cada plano); 3) anima un "
              "cuadro con animate_image describiendo el movimiento (camara y accion); "
              "4) generate_video solo cuando no haya cuadro de referencia. "
              "PERSONAJES — REGLA DE ORO (el error tipico es que el personaje CAMBIE de "
              "aspecto entre imagenes/videos; evitalo siempre asi): 1) apenas exista un "
              "personaje (o el usuario apruebe un diseno), guarda su hoja de modelo con "
              "save_character: descripcion COMPLETA en ingles (cara, cuerpo, proporciones, "
              "colores EXACTOS, ropa, estilo de dibujo) — se inyecta sola en los prompts "
              "que lo nombren; 2) nombra SIEMPRE al personaje por su nombre en los prompts "
              "de generacion; 3) para un plano nuevo del mismo personaje usa edit_image "
              "sobre una imagen YA aprobada de el ('same character, new pose: ...') — "
              "NUNCA generate_image de cero, que inventa otro diseno; 4) para video usa "
              "animate_image partiendo de un cuadro del personaje (la imagen ancla el "
              "diseno) — generate_video de texto pierde el personaje; 5) si el personaje "
              "salio mal en una generacion, NO avances: regenerala hasta que coincida con "
              "la ficha. En SVG: reutiliza los mismos paths del personaje entre cuadros, "
              "cambiando solo posiciones/transform. "
              "Para documentos de texto (informes, cartas, presupuestos) usa write_doc: "
              "crea un .docx real que se abre en Word. "
              "Tenes INTERNET: si necesitas info actual, documentacion, precios o algo que no sabes, "
              "usa web_search y leé las páginas con web_fetch en vez de inventar. "
              "Cuando descubras un hecho DURABLE de este proyecto (stack y versiones, "
              "comandos de build/test/deploy, servidores y rutas, convenciones, "
              "decisiones) guardalo con remember — así lo recordás en próximas sesiones. "
              "No uses remember para cosas triviales o de un solo uso. "
              "Si el usuario adjunta una imagen la ves directo en el mensaje (mockup, "
              "screenshot, foto de un error) — describila o usala de referencia segun "
              "lo que pida. Para generar assets/ilustraciones raster usa generate_image "
              "(requiere key de OpenAI o SiliconFlow cargada en Configuracion). "
              "Para logos, iconos, diagramas o cualquier DISENO editable, escribi un "
              ".svg con write_file: se abre solo en el entorno de diseno de LOW, donde "
              "el usuario selecciona y edita cada elemento. Usa SVG limpio: viewBox "
              "explicito y TODO dentro de el; un elemento por forma/texto con "
              "fill/stroke/font-family explicitos; alinea y espacia prolijo; para texto "
              "usa text-anchor y evita que se desborde o se corte. Se AMBICIOSO con la "
              "calidad visual: usa <path> con curvas bezier para formas organicas, "
              "<linearGradient>/<radialGradient> en <defs> para volumen y luz, "
              "opacity para sombras suaves, y <g> para agrupar partes logicas — un "
              "buen diseno tiene profundidad, no solo rectangulos planos. "
              "Para editar una FOTO o imagen raster existente usa edit_image con el "
              "pedido en lenguaje natural. NO dibujes a ciegas: "
              "despues de escribir un SVG usa check_design para VERLO (lo rasteriza y lo "
              "revisa un modelo de vision) y corregi segun la devolucion antes de darlo por listo. "
              "Para un POSTEO de redes sociales: 1) crea/consegui la imagen o diseno base; "
              "2) usa social_export para generarla en el tamano exacto de cada red pedida; "
              "3) escribi el copy y los hashtags adaptados a CADA plataforma (tono y largo) "
              "en social/post.md. No inventes medidas: social_export ya usa las correctas. "
              "Antes de editar un proyecto grande, usa search_code para ubicar lo que "
              "buscas. Para modificar un archivo QUE YA EXISTE preferi edit_file "
              "(reemplaza solo el fragmento exacto que cambia) — es mas confiable y "
              "barato que reescribir todo el archivo. Usa write_file solo para archivos "
              "nuevos o reescrituras completas cortas. Elegi el lenguaje mas adecuado "
              "para cada tarea. Para SUBIR A GITHUB usa la herramienta git: 'add -A', "
              "'commit -m \"mensaje\"', 'push' (gh CLI esta autenticado para crear repos). "
              "Para servidores usa ssh_exec (podes pasar un alias guardado o usuario@ip) "
              "y scp_upload para subir archivos. REGLA CLAVE: si una herramienta devuelve "
              "un error (empieza con ), NO repitas la misma llamada — LEE el mensaje, "
              "corregi los argumentos (ej: si falta 'path', agregalo) o cambia de enfoque. "
              "Repetir la misma llamada da el mismo error. Al escribir codigo: sintaxis "
              "valida y COMPLETO, sin funciones a medias, TODOs ni placeholders — tiene que "
              "andar. Elegi el lenguaje mas adecuado. Cuando termines de verdad, decilo "
              "claro. No crees entornos virtuales salvo pedido explicito. "
              "VECTOR/SVG (lo mas dificil de acertar): cada .svg que escribas se rasteriza "
              "y lo revisa un modelo de vision AUTOMATICAMENTE; te voy a devolver que esta "
              "mal (proporciones, cosas fuera del viewBox, texto cortado, solapamientos) y "
              "vas a iterar con edit_file hasta que se vea prolijo — no te frustres, es "
              "normal ajustar 2-3 veces. Trabaja con una grilla mental de coordenadas y "
              "verifica que cada elemento este DENTRO del viewBox. "
              "TAREAS GRANDES: antes de empezar, escribi en 1-2 lineas el plan de pasos, "
              "despues ejecutalo (menos vueltas perdidas). "
              "DEPENDENCIAS: si algo falla por un paquete faltante (ModuleNotFoundError, "
              "'Cannot find module'), instalalo con exec_cmd (pip install / npm install) y "
              "volve a correr, en vez de rendirte. "
              "Responde en espanol, breve.")


LOG_PATH = data_dir() / 'low.log'


def log(msg):
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"{datetime.datetime.now().isoformat()} {msg}\n")
    except OSError:
        pass


class Api:
    def __init__(s, safe_mode=False):
        s.cfg = Config()
        s.safe_mode = bool(safe_mode)
        s._window = None
        s._ui_base = None
        s._abrir_al_inicio = None   # .low con el que se abrio LOW (doble clic)
        s._aux_windows = {}
        s._panel_states = {}
        s._dock_armed = set()   # paneles que ya salieron de la ventana principal
        s._dock_check = {}      # último control de acople por arrastre, por panel
        s._animation_panel_state = {}
        s.ws = None
        # Auto-reabrir el último workspace abierto (si sigue existiendo).
        # Así el agente lee la carpeta correcta desde el arranque y no trabaja
        # "a ciegas" ni sobre un directorio viejo de otra sesión.
        _lw = (s.cfg.data.get("last_workspace") or "").strip()
        if not s.safe_mode and _lw and Path(_lw).is_dir():
            s.ws = _lw
        s.prov = None
        s.ses_dir = data_dir() / 'historial'
        s.ses_dir.mkdir(parents=True, exist_ok=True)
        s.ses_id = s._new_sid()
        s.ses_msgs = []
        s._written = []
        s._mem = []          # memoria de conversación (pares user/assistant)
        s._checkpoint = {}   # {path: contenido_previo|None} del último turno  /undo
        s._ollama = []       # modelos locales de Ollama detectados (para failover)
        s._cancel = False    # bandera para detener una consulta en curso
        s._self_improvement = SelfImprovementSystem(data_dir())  # Sistema de automejora
        s._design_session_id = None  # sesión separada para modo diseño
        s._previous_session_id = None  # sesión anterior antes de entrar a diseño
        s._anim = None       # AnimationAPI (bajo demanda, se crea al entrar a animación)
        s._initp()

    def cancel(s):
        """El usuario pidió detener la consulta en curso."""
        s._cancel = True

    def enter_safe_mode(s):
        """Aísla esta sesión sin borrar configuración ni documentos."""
        s.safe_mode = True
        s.ws = None
        return {"ok": True, "safe_mode": True}

    # Paneles y mesa que se pueden separar a otra ventana para dos monitores.
    PANELS = {
        "viewer":   {"title": "Mesa de dibujo", "w": 1280, "h": 820, "min": (720, 480)},
        "timeline": {"title": "Timeline", "w": 1180, "h": 520, "min": (720, 320)},
        "xsheet":   {"title": "X-sheet",  "w": 760,  "h": 760, "min": (520, 360)},
        "layers":   {"title": "Capas",    "w": 340,  "h": 720, "min": (260, 320)},
        "tools":    {"title": "Herramientas", "w": 300, "h": 640, "min": (220, 320)},
        "color":    {"title": "Color",    "w": 340,  "h": 420, "min": (260, 260)},
        "onion":    {"title": "Papel cebolla", "w": 250, "h": 330, "min": (220, 260)},
        "levelstrip":{"title": "Dibujos del nivel", "w": 360, "h": 620, "min": (260, 320)},
        "rig":      {"title": "Esqueleto / Cut-out", "w": 360, "h": 760, "min": (300, 420)},
    }

    @classmethod
    def _panel_kind(cls, kind):
        return kind if kind in cls.PANELS else "timeline"

    def panel_state(s, kind="timeline", state=None):
        """Buzón por panel: la ventana principal escribe, la auxiliar lee."""
        kind = s._panel_kind(kind)
        if isinstance(state, dict):
            s._panel_states[kind] = state
        return s._panel_states.get(kind, {})

    def panel_command(s, kind, action, payload=None):
        """Reenvía una acción de una ventana auxiliar a la ventana principal."""
        if not s._window:
            return {"error": "ventana principal no disponible"}
        message = json.dumps({"kind": s._panel_kind(kind), "action": action,
                              "payload": payload or {}}, ensure_ascii=False)
        # Igual que en _panel_forget: la llamada llega desde la ventana AUXILIAR
        # y evaluar JS en la principal de forma sincrónica traba las dos.
        def enviar():
            try:
                s._window.evaluate_js(f"window.lowPanelCommand({message})")
            except Exception:
                pass
        threading.Thread(target=enviar, daemon=True).start()
        return {"ok": True}

    # ── alias de compatibilidad (la UI vieja llama a estos) ──
    def animation_panel_state(s, state=None):
        if isinstance(state, dict):
            kind = s._panel_kind(state.get("kind") or "timeline")
            s._panel_states[kind] = state
            # el panel de animación comparte un mismo estado para timeline y
            # x-sheet: son dos vistas de lo mismo.
            s._panel_states["xsheet" if kind == "timeline" else "timeline"] = state
            return state
        return s._panel_states.get("timeline", {})

    def animation_panel_command(s, action, payload=None):
        return s.panel_command("timeline", action, payload)

    def close_panel(s, kind="timeline"):
        """Cierra la ventana de un panel DESDE Python. Hace falta porque
        `window.close()` del lado web no cierra una ventana de pywebview: por
        eso el botón "Acoplar" parecía no hacer nada."""
        kind = s._panel_kind(kind)
        win = s._aux_windows.pop(kind, None)
        if not win:
            return {"ok": True}

        def cerrar():
            try:
                win.destroy()
            except Exception:
                pass
        threading.Thread(target=cerrar, daemon=True).start()
        return {"ok": True}

    def panel_closed(s, kind="timeline"):
        """Olvida una ventana auxiliar cerrada para poder reabrirla."""
        s._aux_windows.pop(s._panel_kind(kind), None)
        return {"ok": True}

    def animation_panel_closed(s, kind="timeline"):
        """Olvida una ventana auxiliar cerrada para permitir volver a abrirla."""
        kind = "xsheet" if kind == "xsheet" else "timeline"
        s._aux_windows.pop(kind, None)
        return {"ok": True}

    def open_animation_panel(s, kind="timeline"):
        """Alias histórico: antes solo se separaban Timeline y X-sheet."""
        return s.open_panel(kind)

    def open_panel(s, kind="timeline"):
        """Abre un panel como ventana nativa, para mandarlo al otro monitor."""
        kind = s._panel_kind(kind)
        current = s._aux_windows.get(kind)
        if current:
            try:
                current.show()
                return {"ok": True, "reused": True}
            except Exception:
                s._aux_windows.pop(kind, None)
        if not s._ui_base:
            return {"error": "interfaz no inicializada"}
        # El parámetro va como FRAGMENTO (#), no como query (?): sobre una URL
        # file:// WebView2 se come la query como parte del NOMBRE del archivo y
        # la ventana abría en "No se encuentra el archivo" (ERR_FILE_NOT_FOUND).
        archivo = Path(s._ui_base, "animation_panel.html").resolve()
        if not archivo.exists():
            return {"error": f"falta {archivo.name} en la instalación"}
        panel = archivo.as_uri() + f"#kind={kind}"
        spec = s.PANELS[kind]
        # Geometría recordada: en un setup de dos monitores la gracia es que el
        # panel vuelva SOLO al monitor donde lo dejaste. Sin esto, cada vez se
        # abría centrado en la pantalla principal y había que arrastrarlo.
        geo = (s.cfg.data.get("aux_windows") or {}).get(kind) or {}
        try:
            win = webview.create_window(
                "LOW · " + spec["title"], panel, js_api=s,
                width=int(geo.get("w") or spec["w"]),
                height=int(geo.get("h") or spec["h"]),
                x=geo.get("x"), y=geo.get("y"),
                min_size=spec["min"],
                background_color="#151514")
            s._aux_windows[kind] = win
            s._dock_armed.discard(kind)   # recién abierto: todavía no "salió"
            s._track_geometry(win, kind, on_close=lambda: s._panel_forget(kind))
            return {"ok": True}
        except Exception as e:
            return {"error": str(e)}

    def _maybe_dock_by_drag(s, kind, x, y):
        """Acople por arrastre, como en Photoshop: si el panel se lleva encima
        de la ventana principal, vuelve solo a su lugar.

        Dos recaudos aprendidos a la mala:
        - El panel tiene que haber estado AFUERA al menos una vez. Si no, uno
          que se abre sobre la ventana principal (su posición recordada) se
          acoplaría solo en el primer movimiento, cerrándose al instante.
        - `moved` dispara en cada píxel del arrastre: consultar la geometría de
          la otra ventana cada vez cruza al hilo de la GUI y arrastra la app.
          Se consulta como mucho cada 200 ms."""
        if kind not in s.PANELS or not s._window:
            return
        ahora = time.monotonic()
        if ahora - s._dock_check.get(kind, 0) < 0.2:
            return
        s._dock_check[kind] = ahora
        try:
            mx, my = int(s._window.x), int(s._window.y)
            mw, mh = int(s._window.width), int(s._window.height)
        except Exception:
            return
        # margen adentro: rozar el borde no alcanza, hay que entrar de verdad
        m = 40
        dentro = (mx + m) <= x <= (mx + mw - m) and (my + m) <= y <= (my + mh - m)
        if not dentro:
            s._dock_armed.add(kind)     # estuvo afuera: a partir de acá, vale
            return
        if kind not in s._dock_armed:
            return                      # nunca salió: no acoplar
        s._dock_armed.discard(kind)
        s.close_panel(kind)
        s._panel_forget(kind)

    def _panel_forget(s, kind):
        """Cerrar la ventana con la X tiene que valer lo mismo que "Acoplar":
        si no, la ventana principal sigue creyendo que el panel está afuera y
        publica su estado a un buzón que ya nadie lee."""
        s._aux_windows.pop(kind, None)
        if not s._window:
            return
        # OJO: esto corre en el hilo de la ventana que se está cerrando. Llamar
        # evaluate_js sobre la ventana principal desde acá TRABA la aplicación
        # entera ("LOW.exe no responde"). Se manda desde un hilo aparte.
        def avisar():
            try:
                s._window.evaluate_js(
                    'window.lowPanelCommand && window.lowPanelCommand('
                    '{"kind":"%s","action":"dock","payload":{}})' % kind)
            except Exception:
                pass
        threading.Thread(target=avisar, daemon=True).start()

    def _track_geometry(s, win, key, store_name="aux_windows", on_close=None):
        """Recuerda dónde y de qué tamaño quedó una ventana, para reabrirla en
        el MISMO monitor (setup de dos pantallas). `moved`/`resized` disparan
        muy seguido: solo se anota en memoria y el disco se toca al cerrar."""
        live = {}

        def moved(x, y):
            live["x"], live["y"] = int(x), int(y)
            # ACOPLE POR ARRASTRE (estilo Photoshop): si el panel se suelta
            # encima de la ventana principal, vuelve solo a su lugar. Es más
            # natural que buscar el botón "Acoplar".
            if store_name == "aux_windows":
                s._maybe_dock_by_drag(key, int(x), int(y))

        def resized(w, h):
            live["w"], live["h"] = int(w), int(h)

        def closing():
            if on_close:
                on_close()
            if not live:
                return
            store = s.cfg.data.setdefault(store_name, {})
            store[key] = {**(store.get(key) or {}), **live}
            try:
                s.cfg.save()
            except OSError:
                pass

        try:
            win.events.moved += moved
            win.events.resized += resized
            win.events.closing += closing
        except Exception:
            # backend sin estos eventos: la ventana anda igual, sin memoria.
            pass


    def _mem_limit(s):
        """Cuántos mensajes de la conversación recordar (2 por turno).
        Configurable desde  (config agent.memory_turns)."""
        try:
            return max(2, int(s.cfg.data.get("agent", {}).get("memory_turns", 24))) * 2
        except (TypeError, ValueError):
            return 48

    # ── Reflexion: aprende de sus errores y los recuerda ──────
    def _lessons_path(s):
        # Por WORKSPACE: cada proyecto tiene sus propias lecciones aprendidas.
        # Así dos sesiones/workspaces en paralelo no se mezclan los aprendizajes.
        if s.ws:
            return Path(s.ws) / ".low" / "lecciones.json"
        return data_dir() / 'lecciones.json'

    def _load_lessons(s):
        try:
            data = json.loads(s._lessons_path().read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except (OSError, ValueError):
            return []

    def _save_lesson(s, txt):
        txt = (txt or "").strip().strip('"').strip()
        # descartar respuestas vacías o que no son una regla (el modelo a veces divaga)
        if not txt or len(txt) < 8:
            return
        ls = s._load_lessons()
        if any(txt.lower() == x.get("txt", "").lower() for x in ls):
            return                      # ya la aprendió
        ls.append({"txt": txt[:400],
                   "ts": datetime.datetime.now().isoformat()})
        ls = ls[-40:]                   # no acumular infinito
        try:
            s._lessons_path().write_text(json.dumps(ls, ensure_ascii=False, indent=2),
                                         encoding="utf-8")
        except OSError as e:
            log(f"no pude guardar lección: {e}")

    def _reflect_and_learn(s, task, reason):
        """Tras un fallo, pide al modelo UNA regla concreta para no repetirlo y la
        guarda (patrón Reflexion). Desactivable con config agent.learn=false."""
        if not s.cfg.data.get("agent", {}).get("learn", True):
            return
        if not s.prov:
            return
        try:
            r = s.prov.chat(
                [{"role": "user", "content":
                  f"Estabas resolviendo esta tarea: «{(task or '')[:300]}».\n"
                  f"Fallaste asi: {reason}.\n"
                  "En UNA sola frase corta y accionable, escribi la REGLA que seguirias "
                  "la proxima vez para NO repetir este error (empezando con un verbo). "
                  "Solo la regla, sin preambulo ni comillas."}],
                system_prompt="Sos un ingeniero senior que aprende de sus errores. Respondes con UNA regla breve y concreta.",
                temperature=0.3, max_tokens=120)
            lesson = re.sub(r"<think>.*?</think>", "", r.content or "", flags=re.DOTALL).strip()
            if lesson:
                s._save_lesson(lesson)
                s._push("sys", f" Aprendí: {lesson[:180]}")
        except Exception as e:
            log(f"reflect fallo: {e}")

    # ── Habilidades: aprende de lo que le sale BIEN y lo reutiliza ──
    # (complemento positivo de Reflexion; patrón "skill library" tipo Nous/Voyager)
    def _skills_path(s):
        # Por WORKSPACE: biblioteca de habilidades aislada por proyecto (no se
        # comparte entre sesiones en paralelo).
        if s.ws:
            return Path(s.ws) / ".low" / "habilidades.json"
        return data_dir() / 'habilidades.json'

    def _load_skills(s):
        try:
            data = json.loads(s._skills_path().read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except (OSError, ValueError):
            return []

    def skills(s):
        """Para el frontend: lista de habilidades aprendidas (/panel)."""
        return s._load_skills()

    def delete_skill(s, name):
        sk = [x for x in s._load_skills() if x.get("name") != name]
        try:
            s._skills_path().write_text(json.dumps(sk, ensure_ascii=False, indent=2),
                                        encoding="utf-8")
        except OSError:
            pass
        return {"skills": sk}

    @staticmethod
    def _words(txt):
        return {w for w in re.findall(r"[a-záéíóúñ0-9]{4,}", (txt or "").lower())}

    def _relevant_skills(s, msg, k=3):
        """Habilidades cuyo disparador se solapa con el pedido actual (top-k por
        cantidad de palabras en común). Evita inyectar toda la biblioteca al prompt."""
        skills = s._load_skills()
        if not skills:
            return []
        mw = s._words(msg)
        if not mw:
            return []
        scored = []
        for sk in skills:
            sw = s._words(sk.get("name", "") + " " + sk.get("when", ""))
            score = len(mw & sw)
            if score:
                scored.append((score, sk))
        scored.sort(key=lambda x: -x[0])
        return [sk for _, sk in scored[:k]]

    @staticmethod
    def _as_text(v):
        """El modelo a veces devuelve steps/when como lista JSON en vez de string.
        Normaliza cualquier cosa a texto plano."""
        if isinstance(v, list):
            return "\n".join(str(x) for x in v)
        if v is None:
            return ""
        return str(v)

    def _save_skill(s, skill):
        name = s._as_text(skill.get("name")).strip()
        steps = s._as_text(skill.get("steps")).strip()
        if not name or not steps:
            return False
        sk = s._load_skills()
        # reemplazar si ya existe una con el mismo nombre (la mejora, no duplica)
        sk = [x for x in sk if x.get("name", "").lower() != name.lower()]
        sk.append({"name": name[:80],
                   "when": s._as_text(skill.get("when"))[:200],
                   "steps": steps[:800],
                   "ts": datetime.datetime.now().isoformat()})
        sk = sk[-60:]
        try:
            s._skills_path().write_text(json.dumps(sk, ensure_ascii=False, indent=2),
                                        encoding="utf-8")
            return True
        except OSError as e:
            log(f"no pude guardar habilidad: {e}")
            return False

    def _learn_skill(s, task, summary):
        """Tras un turno EXITOSO y no trivial, destila una habilidad reutilizable
        (nombre + cuándo aplicarla + pasos) y la guarda. Misma llave de config que
        Reflexion (agent.learn). Devuelve el nombre aprendido o None."""
        if not s.cfg.data.get("agent", {}).get("learn", True):
            return None
        if not s.prov:
            return None
        try:
            r = s.prov.chat(
                [{"role": "user", "content":
                  f"Acabás de resolver con éxito esta tarea:\n«{(task or '')[:400]}»\n"
                  f"Lo que hiciste, en breve:\n{(summary or '')[:600]}\n\n"
                  "Si (y solo si) esto es un procedimiento GENERAL y reutilizable en "
                  "tareas futuras parecidas, destilalo como habilidad. Si fue algo "
                  "puntual que no sirve reutilizar, devolvé exactamente NO_APLICA.\n"
                  "Formato JSON estricto sin markdown: "
                  '{"name":"nombre corto","when":"cuándo aplicarla","steps":"pasos concretos, uno por línea"}'}],
                system_prompt="Sos un ingeniero senior que arma una biblioteca de habilidades reutilizables. Respondés SOLO con el JSON pedido o NO_APLICA.",
                temperature=0.3, max_tokens=350)
            out = re.sub(r"<think>.*?</think>", "", r.content or "", flags=re.DOTALL).strip()
            if not out or "NO_APLICA" in out.upper():
                return None
            m = re.search(r"\{.*\}", out, re.DOTALL)
            if not m:
                return None
            skill = json.loads(m.group(0))
            if s._save_skill(skill):
                nm = s._as_text(skill.get("name"))
                s._push("sys", f" Nueva habilidad: {nm}")
                return nm
        except Exception as e:
            # defensa amplia a propósito: aprender NUNCA debe romper un turno exitoso
            log(f"learn_skill fallo: {e}")
        return None

    # ── Fichas de personaje (hojas de modelo): la referencia canónica ──
    # El "drift" de personaje (que cambie de cara/ropa/proporciones entre
    # imágenes o videos) se corta con una FICHA fija que viaja en cada prompt
    # de generación. Viven en .low/personajes.json del workspace.
    def _chars_file(s):
        if not s.ws:
            return None
        return Path(s.ws) / ".low" / "personajes.json"

    def _load_characters(s):
        f = s._chars_file()
        if not f or not f.exists():
            return []
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            return data if isinstance(data, list) else []
        except (OSError, ValueError):
            return []

    def characters(s):
        """Para el frontend: fichas de personaje del proyecto."""
        return s._load_characters()

    def save_character(s, name, desc):
        name, desc = (name or "").strip(), (desc or "").strip()
        if not name or not desc:
            return " Falta el nombre o la descripción del personaje"
        f = s._chars_file()
        if not f:
            return " No hay proyecto abierto"
        chars = [c for c in s._load_characters()
                 if c.get("name", "").lower() != name.lower()]
        chars.append({"name": name[:60], "desc": desc[:1200],
                      "ts": datetime.datetime.now().isoformat()})
        try:
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text(json.dumps(chars[-20:], ensure_ascii=False, indent=1),
                         encoding="utf-8")
        except OSError as e:
            return f" {e}"
        s._push("sys", f"[Personaje] Ficha de personaje guardada: {name}")
        return (f" Ficha de «{name}» guardada — se va a inyectar en TODOS los prompts "
                "de imagen/video que lo mencionen, para que no cambie entre generaciones")

    def delete_character(s, name):
        chars = [c for c in s._load_characters()
                 if c.get("name", "").lower() != (name or "").lower()]
        f = s._chars_file()
        if f:
            try:
                f.write_text(json.dumps(chars, ensure_ascii=False, indent=1),
                             encoding="utf-8")
            except OSError:
                pass
        return {"characters": chars}

    def _chars_for_prompt(s, prompt):
        """Fichas cuyos nombres aparecen en el prompt (o todas si hay una sola
        y el pedido menciona 'personaje'). Es el ancla anti-drift."""
        chars = s._load_characters()
        if not chars:
            return []
        low = (prompt or "").lower()
        hit = [c for c in chars if c.get("name", "").lower() in low]
        if not hit and len(chars) == 1 and any(
                w in low for w in ("personaje", "protagonista", "character", "él", "ella")):
            hit = chars
        return hit

    # ── Memoria del proyecto: hechos durables por workspace ────────
    # Vive en .low/memoria.md DENTRO del proyecto (portable, editable, versionable
    # si el usuario quiere). El árbol y search ya ignoran carpetas que empiezan con
    # "." así que no ensucia el listado del proyecto.
    def _mem_file(s):
        if not s.ws:
            return None
        return Path(s.ws) / ".low" / "memoria.md"

    def _load_project_memory(s):
        f = s._mem_file()
        if not f or not f.exists():
            return ""
        try:
            return f.read_text(encoding="utf-8", errors="replace").strip()
        except OSError:
            return ""

    def project_memory(s):
        """Para el frontend/comando: contenido y ruta de la memoria del proyecto."""
        f = s._mem_file()
        return {"content": s._load_project_memory(),
                "path": str(f) if f else "", "has_ws": bool(s.ws)}

    def save_project_memory(s, text):
        """Sobrescribe la memoria del proyecto (edición manual desde la UI)."""
        f = s._mem_file()
        if not f:
            return {"error": "Abrí un proyecto primero"}
        try:
            f.parent.mkdir(parents=True, exist_ok=True)
            f.write_text((text or "").strip() + "\n", encoding="utf-8")
            return {"ok": True, "path": str(f)}
        except OSError as e:
            return {"error": str(e)}

    def _remember(s, note):
        """Agrega un hecho durable a .low/memoria.md (sin duplicar). Devuelve
        el texto de resultado para la tool `remember`."""
        note = (note or "").strip().lstrip("-•").strip()
        if not note:
            return " Nota vacía"
        f = s._mem_file()
        if not f:
            return " No hay proyecto abierto — no puedo guardar memoria de proyecto"
        prev = s._load_project_memory()
        # dedup laxo: si ya está esa línea (ignorando may/min), no repetir
        if any(note.lower() == ln.strip().lstrip("-•").strip().lower()
               for ln in prev.splitlines()):
            return "✓ Ya estaba en la memoria del proyecto"
        try:
            f.parent.mkdir(parents=True, exist_ok=True)
            header = "" if prev else "# Memoria del proyecto (LOW)\n"
            with open(f, "a", encoding="utf-8") as fh:
                if header:
                    fh.write(header)
                fh.write(f"- {note}\n")
            s._push("sys", f" Recordé del proyecto: {note[:140]}")
            return f" Guardado en memoria del proyecto: {note[:120]}"
        except OSError as e:
            return f" {e}"

    # ── infraestructura ───────────────────────────────────
    def _push(s, event, data):
        if not s._window:
            return
        payload = json.dumps({"event": event, "data": data}, ensure_ascii=False)
        try:
            s._window.evaluate_js(f"LOW.onPy({payload})")
        except Exception as e:
            log(f"_push({event}) fallo: {e}")

    def log_js(s, msg):
        """El frontend reporta acá sus errores y el boot — queda en low.log."""
        log(f"[js] {msg}")

    # Campos que puede contener un informe de fallo. Es una lista BLANCA a
    # propósito: CRASH-01 pide versión, sistema, GPU, escena y último comando,
    # y nada más. Cualquier cosa que mande el frontend fuera de esta lista se
    # descarta acá, para que un informe no arrastre el dibujo, la conversación
    # ni las rutas completas del disco de nadie.
    CRASH_FIELDS = ("motivo", "error", "origen", "version", "sistema", "gpu",
                    "escena", "ultimoComando", "herramienta", "cuandoUI")

    def crash_report(s, data=None):
        """Guarda un informe de fallo legible, sin contenido del documento."""
        if not isinstance(data, dict):
            return {"error": "informe vacío"}
        limpio = {k: data.get(k) for k in s.CRASH_FIELDS if data.get(k) is not None}
        limpio["version"] = LOW_VERSION          # la fuente de verdad es Python
        limpio["python"] = platform.python_version()
        limpio["plataforma"] = platform.platform()
        limpio["cuando"] = datetime.datetime.now().isoformat(timespec="seconds")
        destino = data_dir() / "fallos"
        nombre = "fallo-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S") + ".json"
        try:
            destino.mkdir(parents=True, exist_ok=True)
            atomic_write_text(destino / nombre, json.dumps(limpio, ensure_ascii=False, indent=1))
        except OSError as e:
            log(f"crash_report: no pude escribir el informe: {e}")
            return {"error": str(e)}
        log(f"[fallo] {nombre}: {limpio.get('error') or limpio.get('motivo') or 'sin detalle'}")
        return {"path": str(destino / nombre), "name": nombre, "campos": sorted(limpio)}

    def session_log(s, data=None):
        """La bitácora de la prueba maestra de §15, al disco.

        La §15 pide que el proceso «quede grabado como prueba repetible y se
        mida en errores, tiempo, interrupciones y necesidad de ayuda». Repetible
        quiere decir comparable: por eso van los dos archivos, el JSON con el
        esqueleto estable de los doce pasos y el resumen legible al lado.

        No lleva nada del documento: sólo tiempos, conteos y las notas que la
        persona escribió. Es la misma regla que el informe de fallo.
        """
        if not isinstance(data, dict):
            return {"error": "bitácora vacía"}
        destino = data_dir() / "sesiones"
        sello = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
        nombre = "prueba15-" + sello
        try:
            destino.mkdir(parents=True, exist_ok=True)
            cuerpo = data.get("json") if isinstance(data.get("json"), dict) else {}
            cuerpo = dict(cuerpo)
            cuerpo["version"] = LOW_VERSION      # la fuente de verdad es Python
            cuerpo["plataforma"] = platform.platform()
            cuerpo["guardada"] = datetime.datetime.now().isoformat(timespec="seconds")
            atomic_write_text(destino / (nombre + ".json"),
                              json.dumps(cuerpo, ensure_ascii=False, indent=1))
            texto = data.get("texto")
            if isinstance(texto, str) and texto.strip():
                atomic_write_text(destino / (nombre + ".md"), texto)
        except OSError as e:
            log(f"session_log: no pude escribir la bitácora: {e}")
            return {"error": str(e)}
        resumen = (cuerpo.get("resumen") or {})
        log("[prueba15] %s: %s/%s pasos sin ayuda, %s errores, %s ayudas, %s interrupciones" % (
            nombre, resumen.get("hechosSolo"), resumen.get("pasos"), resumen.get("errores"),
            resumen.get("ayudas"), resumen.get("interrupciones")))
        return {"path": str(destino / (nombre + ".json")), "name": nombre + ".json",
                "carpeta": str(destino)}

    def _base(s):
        """Workspace efectivo para las tools. Si no hay, lanza excepción
        para que el frontend pida al usuario que abra una carpeta."""
        if not s.ws:
            raise RuntimeError("No hay workspace abierto. Por favor, abre una carpeta de proyecto primero.")
        return Path(s.ws)

    def _initp(s):
        n = s.cfg.get_active_provider()
        kw = {"model": s.cfg.get_model(n)}
        bu = s.cfg.data.get("providers", {}).get(n, {}).get("base_url", "")
        if bu:
            kw["base_url"] = bu
        if n == "cloudflare":
            kw["account_id"] = s.cfg.data.get("providers", {}).get(n, {}).get("account_id", "")
        try:
            s.prov = get_provider(n, api_key=s.cfg.get_api_key(n), **kw)
        except Exception as e:
            log(f"Error inicializando provider {n}: {e}")
            s.prov = None

    def _models(s, name):
        try:
            kw = {"model": s.cfg.get_model(name)}
            bu = s.cfg.data.get("providers", {}).get(name, {}).get("base_url", "")
            if bu:
                kw["base_url"] = bu
            if name == "cloudflare":
                kw["account_id"] = s.cfg.data.get("providers", {}).get(name, {}).get("account_id", "")
            return get_provider(name, api_key=s.cfg.get_api_key(name) or "x", **kw).list_models()
        except Exception as e:
            log(f"Error obteniendo modelos para {name}: {e}")
            return ["(configura la key)"]

    def _apis_state(s):
        provs = s.cfg.data.get("providers", {})
        return {
            "apis": sum(1 for d in provs.values() if d.get("api_key")),
            "providers": [{"name": k, "has_key": bool(d.get("api_key")),
                           "key": d.get("api_key", ""), "model": d.get("model", ""),
                           "base_url": d.get("base_url", ""),
                           "account_id": d.get("account_id", ""),
                           "image_model": d.get("image_model", ""),
                           "video_params": d.get("video_params", {}),
                           "image_params": d.get("image_params", {}),
                           "media_only": k in s.MEDIA_ONLY}
                          for k, d in provs.items()],
        }

    # ── estado / config ───────────────────────────────────
    def get_state(s):
        active = s.cfg.get_active_provider()
        models = s._models(active)
        model = s.cfg.get_model(active)
        # si el modelo guardado ya no es de chat (quedó filtrado, ej. Qwen-Image),
        # caer al primer modelo válido para que la UI y la config coincidan
        if models and model not in models and not models[0].startswith("("):
            model = models[0]
            s.cfg.set_model(active, model)
            s._initp()
        st = {
            "theme": s.cfg.theme if s.cfg.theme in ("dark", "light") else "dark",
            "provider": active,
            "model": model,
            "models": models,
            "langs": CodeRunner.supported_languages(),
            "ws": s.ws,
            "branch": s._git_branch(),
            "tree": s._tree(),
            "zoom": s.cfg.data.get("zoom", 1.0),
            "system_prompt": s.cfg.data.get("system_prompt", ""),
            "default_sp": DEFAULT_SP,
            "version": LOW_VERSION,
            "binario_viejo": binario_reemplazado(),
            "safe_mode": s.safe_mode,
            "tools": [{"name": t["function"]["name"],
                       "desc": t["function"].get("description", "")}
                      for t in s._get_tools()],
            "routines": s.cfg.data.get("routines", []),
            "agent": s.cfg.data.get("agent", {}),
            "session_id": s.ses_id,
            "ssh_hosts": s.cfg.data.get("ssh_hosts", []),
            "lessons": len(s._load_lessons()),
            "skills": len(s._load_skills()),
            # cadena de failover: para que la UI muestre el orden y el modelo de respaldo
            "chain": [{"provider": p, "model": m} for p, m in s._chain()],
            # Archivo con el que se abrió LOW: doble clic en un .low, o
            # "Abrir con". Se entrega UNA sola vez —después se limpia— para que
            # un refresco de la interfaz no lo vuelva a abrir encima de lo que
            # el usuario ya tenga en pantalla.
            "open_file": s._abrir_al_inicio,
        }
        s._abrir_al_inicio = None
        st.update(s._apis_state())
        return st

    def save_system_prompt(s, text):
        s.cfg.data["system_prompt"] = (text or "").strip()
        s.cfg.save()

    def save_agent_config(s, steps, conts, mem, verify_runtime=None, verify_design=None):
        """Guarda los límites del agente (). LOW no le pone techo al trabajo
        salvo el que elijas acá y el de la API."""
        a = s.cfg.data.setdefault("agent", {})

        def _int(v, d):
            try:
                return max(1, int(v))
            except (TypeError, ValueError):
                return d
        a["max_steps"] = _int(steps, 40)
        a["max_continuations"] = _int(conts, 0)
        a["memory_turns"] = _int(mem, 24)
        if verify_runtime is not None:
            a["verify_runtime"] = bool(verify_runtime)
        if verify_design is not None:
            a["verify_design"] = bool(verify_design)
        s.cfg.save()
        return a

    def set_verify_runtime(s, on):
        """Activa/desactiva la verificación de ejecución (correr el código para
        confirmar que no revienta en runtime, no solo que compila)."""
        s.cfg.data.setdefault("agent", {})["verify_runtime"] = bool(on)
        s.cfg.save()
        return {"verify_runtime": bool(on)}

    def current_session(s):
        """Id de la conversación activa — el frontend lo usa para marcar la solapa."""
        return {"id": s.ses_id}

    # ── rutinas: órdenes reutilizables que guarda el usuario ──
    def save_routine(s, name, prompt):
        name, prompt = (name or "").strip(), (prompt or "").strip()
        if not name or not prompt:
            return {"routines": s.cfg.data.get("routines", [])}
        rs = [r for r in s.cfg.data.get("routines", []) if r.get("name") != name]
        rs.append({"name": name, "prompt": prompt})
        s.cfg.data["routines"] = rs
        s.cfg.save()
        return {"routines": rs}

    def delete_routine(s, name):
        rs = [r for r in s.cfg.data.get("routines", []) if r.get("name") != name]
        s.cfg.data["routines"] = rs
        s.cfg.save()
        return {"routines": rs}

    def artifact_content(s, path):
        """Contenido de un archivo, para renderizar artefactos in-app."""
        try:
            return {"content": Path(path).read_text(encoding="utf-8", errors="replace"),
                    "name": Path(path).name}
        except OSError as e:
            return {"error": str(e)}

    def image_data(s, path):
        """Imagen (o SVG) como data URL, para verla DENTRO de LOW sin romper el
        editor de código con bytes binarios."""
        p = Path(path)
        ext = p.suffix.lower()
        try:
            if ext == ".svg":
                svg = p.read_text(encoding="utf-8", errors="replace")
                b64 = base64.b64encode(svg.encode("utf-8")).decode("ascii")
                return {"data_url": f"data:image/svg+xml;base64,{b64}",
                        "name": p.name, "svg": svg}
            mime = s.IMG_MIME.get(ext, "application/octet-stream")
            b64 = base64.b64encode(p.read_bytes()).decode("ascii")
            return {"data_url": f"data:{mime};base64,{b64}", "name": p.name}
        except OSError as e:
            return {"error": str(e)}

    def open_external(s, path):
        """Abre un archivo con su aplicación del sistema (Word para .docx, el
        visor de PDF, etc.)."""
        try:
            if os.name == "nt":
                os.startfile(path)                      # noqa: S606 — deliberado
            else:
                opener = "open" if sys.platform == "darwin" else "xdg-open"
                subprocess.Popen([opener, path])
            return {"ok": True}
        except Exception as e:
            return {"error": str(e)}

    # ── animación: cuadros como archivos nombre_f001.svg, _f002… ────────
    _FRAME_RX = re.compile(r"^(.*)_f(\d{3})\.svg$", re.IGNORECASE)

    def make_frame(s, path):
        """Convierte un .svg suelto en el cuadro 1 de una animación (copia a
        nombre_f001.svg, el original queda). Si ya es un cuadro, lo devuelve."""
        p = Path(path)
        if s._FRAME_RX.match(p.name):
            return {"path": str(p)}
        out = p.with_name(f"{p.stem}_f001.svg")
        try:
            if not out.exists():
                out.write_text(p.read_text(encoding="utf-8", errors="replace"),
                               encoding="utf-8")
        except OSError as e:
            return {"error": str(e)}
        return {"path": str(out)}

    def list_frames(s, path):
        """Todos los cuadros hermanos de un cuadro dado, ordenados."""
        if not path:
            return {"error": "No se de donde sacar la carpeta de salida: guarda el documento antes de exportar"}
        p = Path(path)
        m = s._FRAME_RX.match(p.name)
        if not m:
            return {"frames": []}
        base = m.group(1)
        try:
            fs = sorted(str(f) for f in p.parent.glob(f"{base}_f[0-9][0-9][0-9].svg"))
        except OSError:
            fs = []
        return {"frames": fs, "current": str(p)}

    def dup_frame(s, path):
        """Duplica el cuadro dado como el número siguiente al último — el flujo
        clásico de animación: dibujar sobre la copia del cuadro anterior."""
        p = Path(path)
        m = s._FRAME_RX.match(p.name)
        if not m:
            return {"error": "no es un cuadro (_fNNN.svg)"}
        frames = s.list_frames(path)["frames"]
        last = max(int(s._FRAME_RX.match(Path(f).name).group(2)) for f in frames) if frames else 0
        out = p.with_name(f"{m.group(1)}_f{last + 1:03d}.svg")
        try:
            out.write_text(p.read_text(encoding="utf-8", errors="replace"),
                           encoding="utf-8")
        except OSError as e:
            return {"error": str(e)}
        return {"path": str(out)}

    def record_take(s, path, svgs):
        """TITIRITERO: escribe una toma completa (lista de SVGs capturados en vivo)
        como cuadros consecutivos DESPUÉS del último — en un solo llamado, sin
        renumerar (mucho más rápido que insert_frame por cuadro). Devuelve el
        primer cuadro nuevo y la cantidad."""
        p = Path(path)
        m = s._FRAME_RX.match(p.name)
        if not m:
            return {"error": "no es un cuadro (_fNNN.svg)"}
        if not isinstance(svgs, list) or not svgs:
            return {"error": "toma vacía"}
        base = m.group(1)
        frames = s.list_frames(path)["frames"]
        last = max(int(s._FRAME_RX.match(Path(f).name).group(2)) for f in frames) if frames else 0
        first_out = None
        try:
            for i, svg in enumerate(svgs):
                out = p.with_name(f"{base}_f{last + 1 + i:03d}.svg")
                out.write_text(svg or "", encoding="utf-8")
                if first_out is None:
                    first_out = str(out)
        except OSError as e:
            return {"error": str(e)}
        return {"path": first_out, "n": len(svgs)}

    def del_frame(s, path):
        """Borra un cuadro y devuelve el vecino más cercano para seguir editando."""
        p = Path(path)
        if not s._FRAME_RX.match(p.name):
            return {"error": "no es un cuadro (_fNNN.svg)"}
        frames = s.list_frames(path)["frames"]
        if len(frames) <= 1:
            return {"error": "es el único cuadro — borralo desde el árbol si querés"}
        i = frames.index(str(p)) if str(p) in frames else 0
        cur = int(s._FRAME_RX.match(p.name).group(2))
        try:
            p.unlink()
        except OSError as e:
            return {"error": str(e)}
        # descartar la clave de cámara del cuadro borrado y correr las siguientes
        f = s._scene_path(path)
        if f.exists():
            try:
                sc = json.loads(f.read_text(encoding="utf-8"))
                sc["keys"] = [k for k in sc.get("keys", []) if k != cur]
                sc["cam"] = {k: v for k, v in sc.get("cam", {}).items() if int(k) != cur}
                f.write_text(json.dumps(sc, ensure_ascii=False, indent=1), encoding="utf-8")
            except (OSError, ValueError, TypeError):
                pass
        # ojo: del_frame NO renumera los archivos (quedan huecos válidos),
        # así que las demás claves conservan su número
        rest = [f for f in frames if f != str(p)]
        return {"path": rest[min(i, len(rest) - 1)]}

    def insert_frame(s, path, content=None):
        """Inserta un cuadro NUEVO justo después del dado, renumerando los
        siguientes (flujo OpenToonz: intercalar en medio de la secuencia).
        content: SVG del cuadro nuevo; None = copia del cuadro actual."""
        p = Path(path)
        m = s._FRAME_RX.match(p.name)
        if not m:
            return {"error": "no es un cuadro (_fNNN.svg)"}
        base, cur = m.group(1), int(m.group(2))
        frames = s.list_frames(path)["frames"]
        try:
            # renumerar de atrás hacia adelante: _f005_f006, _f004_f005…
            nums = sorted((int(s._FRAME_RX.match(Path(f).name).group(2))
                           for f in frames), reverse=True)
            for n in nums:
                if n <= cur:
                    break
                src = p.with_name(f"{base}_f{n:03d}.svg")
                src.rename(p.with_name(f"{base}_f{n + 1:03d}.svg"))
            out = p.with_name(f"{base}_f{cur + 1:03d}.svg")
            if content is None:
                content = p.read_text(encoding="utf-8", errors="replace")
            out.write_text(content, encoding="utf-8")
        except OSError as e:
            return {"error": str(e)}
        s._shift_scene(path, cur, +1)   # las claves de cámara/dibujo se corren con los archivos
        s._push("ws", {"ws": s.ws, "tree": s._tree(), "branch": s._git_branch()})
        return {"path": str(out)}

    def _shift_scene(s, path, after, delta):
        """Corre los índices de la escena (claves de dibujo y de cámara) cuando
        se inserta (+1) o borra (-1) un cuadro después del número `after`."""
        f = s._scene_path(path)
        if not f.exists():
            return
        try:
            sc = json.loads(f.read_text(encoding="utf-8"))
            sc["keys"] = sorted(k + delta if k > after else k
                                for k in sc.get("keys", []))
            sc["cam"] = {str(int(k) + delta if int(k) > after else int(k)): v
                         for k, v in sc.get("cam", {}).items()}
            f.write_text(json.dumps(sc, ensure_ascii=False, indent=1), encoding="utf-8")
        except (OSError, ValueError, TypeError) as e:
            log(f"shift_scene fallo: {e}")

    def export_premiere(s, path, frames_png, xml, wav_b64=None, name="secuencia"):
        """Escribe la carpeta que se importa en Premiere: los cuadros, el audio
        y el XML, TODO junto. Que vivan en la misma carpeta es lo que evita el
        cartel de «archivo perdido» pidiendo relinkear cuadro por cuadro."""
        if not path:
            return {"error": "No se de donde sacar la carpeta de salida: guarda el documento antes de exportar"}
        p = Path(path)
        limpio = re.sub(r"[^\w.-]+", "_", str(name or "secuencia")).strip("_") or "secuencia"
        outdir = p.parent / "export" / (limpio + "_premiere")
        try:
            outdir.mkdir(parents=True, exist_ok=True)
            for i, du in enumerate(frames_png or []):
                b64 = du.split(",", 1)[1] if "," in du else du
                (outdir / f"{limpio}_{i + 1:04d}.png").write_bytes(base64.b64decode(b64))
            if wav_b64:
                cru = wav_b64.split(",", 1)[1] if "," in wav_b64 else wav_b64
                (outdir / "audio.wav").write_bytes(base64.b64decode(cru))
            atomic_write_text(outdir / (limpio + ".xml"), xml or "")
        except (OSError, ValueError, TypeError) as e:
            log(f"export_premiere: {e}")
            return {"error": str(e)}
        s._push("ws", {"ws": s.ws, "tree": s._tree(), "branch": s._git_branch()})
        return {"path": str(outdir), "name": limpio + ".xml",
                "frames": len(frames_png or []), "audio": bool(wav_b64)}

    def export_anim(s, path, frames_png, fps=12, kind="gif"):
        """Exporta la animación: el frontend rasteriza cada cuadro a PNG dataURL
        y acá se arma el archivo final. kind: 'gif' (Pillow) o 'png' (secuencia).
        Devuelve {path} del resultado o {error}."""
        # SIN RUTA NO HAY DONDE ESCRIBIR, y `Path(None)` revienta con un
        # TypeError que del otro lado se ve como el programa colgado en
        # «Guardando la secuencia...». Un error legible es parte de la promesa.
        if not path:
            return {"error": "No se de donde sacar la carpeta de salida: guarda el documento antes de exportar"}
        p = Path(path)
        m = s._FRAME_RX.match(p.name)
        stem = m.group(1) if m else p.stem
        outdir = p.parent / "export"
        try:
            outdir.mkdir(parents=True, exist_ok=True)
            imgs = []
            for i, du in enumerate(frames_png):
                b64 = du.split(",", 1)[1] if "," in du else du
                imgs.append(base64.b64decode(b64))
            if kind == "png":
                # El relleno de ceros se calcula por la CANTIDAD de cuadros, no
                # fijo en 3: con 1000 cuadros --42 segundos a 24 fps-- `_1000.png`
                # se ordena ANTES de `_999.png` y la secuencia entra desordenada
                # al montaje. Tres digitos es el minimo, para no cambiarle el
                # nombre a las exportaciones cortas de siempre.
                ancho = max(3, len(str(len(imgs))))
                # Se limpian los cuadros de la exportacion ANTERIOR de este mismo
                # documento. Sin esto, exportar 1000 cuadros y despues 10 deja 990
                # cuadros de la toma vieja en la carpeta, y el importador se lleva
                # una secuencia de 1000 con 990 cuadros que no son de esta version.
                # Se borra solo `{stem}_<numeros>.png`, que son los que escribe esto.
                for previo in outdir.glob(f"{Path(stem).name}_*.png"):
                    if re.fullmatch(r"\d+", previo.stem.rsplit("_", 1)[-1]):
                        previo.unlink()
                for i, raw in enumerate(imgs):
                    (outdir / f"{Path(stem).name}_{i + 1:0{ancho}d}.png").write_bytes(raw)
                s._push("ws", {"ws": s.ws, "tree": s._tree(), "branch": s._git_branch()})
                return {"path": str(outdir), "n": len(imgs)}
            if kind == "sheet":                 # el frontend ya compuso la grilla
                out = outdir / f"{Path(stem).name}_sheet.png"
                out.write_bytes(imgs[0])
                s._push("ws", {"ws": s.ws, "tree": s._tree(), "branch": s._git_branch()})
                return {"path": str(out), "n": 1}
            if kind in ("mp4", "webm"):
                # Video real con ffmpeg (no necesita Pillow). Los cuadros ya vienen
                # rasterizados como PNG del frontend  los escribo a temp y encodeo.
                import shutil
                import tempfile
                ff = shutil.which("ffmpeg")
                if not ff:
                    return {"error": "exportar MP4 necesita ffmpeg en el PATH "
                                     "(probá GIF o secuencia PNG, que no lo necesitan)"}
                if not imgs:
                    return {"error": "no llegó ningún cuadro"}
                tdir = Path(tempfile.mkdtemp())
                try:
                    for i, raw in enumerate(imgs):
                        (tdir / f"f_{i + 1:04d}.png").write_bytes(raw)
                    out = outdir / f"{Path(stem).name}.{kind}"
                    fps_v = max(1, int(fps or 12))
                    vcodec = "libx264" if kind == "mp4" else "libvpx-vp9"
                    # yuv420p + escala a dimensiones pares = compatible con todos los players
                    cmd = [ff, "-y", "-framerate", str(fps_v),
                           "-i", str(tdir / "f_%04d.png"),
                           "-c:v", vcodec, "-pix_fmt", "yuv420p",
                           "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", str(out)]
                    r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
                finally:
                    shutil.rmtree(tdir, ignore_errors=True)
                if r.returncode != 0 or not out.exists():
                    return {"error": "ffmpeg falló: " + ((r.stderr or r.stdout or "")[-200:])}
                s._push("ws", {"ws": s.ws, "tree": s._tree(), "branch": s._git_branch()})
                return {"path": str(out), "n": len(imgs)}
            # GIF (y spritesheet los arma el frontend en canvas)
            try:
                from PIL import Image
            except ImportError:
                return {"error": "exportar GIF necesita Pillow: pip install pillow "
                                 "(la secuencia PNG funciona sin nada)"}
            import io
            pil = [Image.open(io.BytesIO(raw)).convert("RGB") for raw in imgs]
            if not pil:
                return {"error": "no llegó ningún cuadro"}
            out = outdir / f"{Path(stem).name}.gif"
            dur = max(20, round(1000 / max(1, int(fps or 12))))
            pil[0].save(out, save_all=True, append_images=pil[1:],
                        duration=dur, loop=0, optimize=True)
            s._push("ws", {"ws": s.ws, "tree": s._tree(), "branch": s._git_branch()})
            return {"path": str(out), "n": len(pil)}
        except (OSError, ValueError) as e:
            return {"error": str(e)}

    def import_ref_image(s):
        """Abre el diálogo de archivos y devuelve la imagen elegida como data URI
        para sumarla al lienzo como <image> (referencia/calco, nivel OpenToonz)."""
        if not s._window:
            return {"error": "sin ventana"}
        try:
            r = s._window.create_file_dialog(
                webview.OPEN_DIALOG, allow_multiple=False,
                file_types=("Imágenes (*.png;*.jpg;*.jpeg;*.webp;*.gif)",))
        except Exception as e:
            return {"error": str(e)}
        if not r:
            return {"cancel": True}
        fp = Path(r[0] if isinstance(r, (list, tuple)) else r)
        mime = s.IMG_MIME.get(fp.suffix.lower())
        if not mime:
            return {"error": f"formato no soportado: {fp.suffix}"}
        try:
            raw = fp.read_bytes()
        except OSError as e:
            return {"error": str(e)}
        if len(raw) > 12_000_000:
            return {"error": "imagen muy pesada (>12MB) — achicala antes"}
        return {"data": f"data:{mime};base64," + base64.b64encode(raw).decode("ascii"),
                "name": fp.name}

    # Orden de capas de un panel de Storyboarder, de abajo hacia arriba. Es el
    # FORMATO del archivo (qué capa tapa a cuál), no código de Storyboarder:
    # sin esto un panel importado sale con el calco encima de la tinta.
    SB_LAYERS = ("shot-generator", "reference", "fill", "tone", "pencil", "ink", "notes")
    SB_MAX_FILE = 12_000_000
    SB_MAX_TOTAL = 250_000_000

    @classmethod
    def _read_storyboarder(cls, fp):
        """Lee un proyecto .storyboarder (JSON + carpeta images/) y devuelve los
        paneles con sus capas como data URI. No toca el documento: eso lo hace
        la interfaz, para que entre en Undo."""
        fp = Path(fp)
        try:
            data = json.loads(fp.read_text(encoding="utf-8-sig"))
        except (OSError, ValueError) as e:
            return {"error": f"No pude leer el proyecto de Storyboarder: {e}"}
        if not isinstance(data, dict) or not isinstance(data.get("boards"), list):
            return {"error": "El archivo no parece un proyecto de Storyboarder (no tiene «boards»)."}
        images = fp.parent / "images"
        total, faltan = 0, []

        def uri(name, avisar=True):
            nonlocal total
            if not name or not isinstance(name, str):
                return None
            f = images / Path(name).name          # nunca salir de images/
            if not f.is_file():
                if avisar:
                    faltan.append(Path(name).name)
                return None
            mime = cls.IMG_MIME.get(f.suffix.lower())
            if not mime or f.stat().st_size > cls.SB_MAX_FILE:
                return None
            raw = f.read_bytes()
            total += len(raw)
            if total > cls.SB_MAX_TOTAL:
                raise MemoryError
            return f"data:{mime};base64," + base64.b64encode(raw).decode("ascii")

        boards = []
        try:
            for b in data["boards"]:
                if not isinstance(b, dict):
                    continue
                layers = b.get("layers") if isinstance(b.get("layers"), dict) else {}
                capas = []
                for name in cls.SB_LAYERS:
                    info = layers.get(name) if isinstance(layers.get(name), dict) else {}
                    url, avisar = info.get("url"), True
                    # los proyectos viejos (<1.0) guardaban el dibujo principal
                    # en board.url, sin capa «fill»; en los nuevos ese archivo
                    # no existe y no es una falta
                    if name == "fill" and not url:
                        url, avisar = b.get("url"), False
                    d = uri(url, avisar)
                    if d:
                        op = info.get("opacity")
                        if op is None:
                            op = 0.75 if name == "reference" else 1
                        capas.append({"name": name, "data": d, "opacity": float(op)})
                url = b.get("url") or ""
                poster = uri(url.replace(".png", "-posterframe.jpg")) if not capas and url else None
                if not capas and not poster:
                    faltan.append(Path(url).name or ("panel " + str(len(boards) + 1)))
                audio = b.get("audio") if isinstance(b.get("audio"), dict) else None
                boards.append({
                    "uid": b.get("uid"), "number": b.get("number"), "shot": b.get("shot"),
                    "newShot": bool(b.get("newShot")), "duration": b.get("duration"),
                    "dialogue": b.get("dialogue") or "", "action": b.get("action") or "",
                    "notes": b.get("notes") or "", "layers": capas, "posterframe": poster,
                    "audio": ({"filename": audio.get("filename"),
                               "found": (images / Path(str(audio.get("filename") or "_")).name).is_file()}
                              if audio else None),
                    "sg": b.get("sg") if isinstance(b.get("sg"), dict) else None,
                })
        except MemoryError:
            return {"error": "El proyecto pesa más de 250 MB en imágenes: importalo por escenas."}
        try:
            aspect = float(data.get("aspectRatio") or 16 / 9)
        except (TypeError, ValueError):
            aspect = 16 / 9
        return {"name": fp.stem, "version": str(data.get("version") or ""),
                "fps": data.get("fps"), "aspectRatio": aspect,
                "defaultBoardTiming": data.get("defaultBoardTiming") or 2000,
                "boards": boards, "missing": sorted(set(faltan))}

    def import_storyboarder(s):
        """Diálogo para elegir un .storyboarder y leerlo."""
        if not s._window:
            return {"error": "sin ventana"}
        try:
            r = s._window.create_file_dialog(
                webview.OPEN_DIALOG, allow_multiple=False,
                file_types=("Proyecto de Storyboarder (*.storyboarder)",))
        except Exception as e:
            return {"error": str(e)}
        if not r:
            return {"cancel": True}
        return s._read_storyboarder(r[0] if isinstance(r, (list, tuple)) else r)

    def import_character_art(s):
        """Importa arte destinado a rigging, no una referencia de calco.

        SVG conserva sus objetos separados para poder repartirlos entre huesos.
        Los formatos raster entran como una sola pieza rígida y opaca.
        """
        if not s._window:
            return {"error": "sin ventana"}
        try:
            r = s._window.create_file_dialog(
                webview.OPEN_DIALOG, allow_multiple=False,
                file_types=("Personaje vectorial o raster (*.svg;*.ai;*.pdf;*.png;*.jpg;*.jpeg;*.webp;*.gif)",))
        except Exception as e:
            return {"error": str(e)}
        if not r:
            return {"cancel": True}
        fp = Path(r[0] if isinstance(r, (list, tuple)) else r)
        try:
            raw = fp.read_bytes()
        except OSError as e:
            return {"error": str(e)}
        if len(raw) > 12_000_000:
            return {"error": "archivo muy pesado (>12MB) — achicalo antes"}
        suffix = fp.suffix.lower()
        if suffix in (".ai", ".pdf"):
            import shutil
            import tempfile
            converter = shutil.which("inkscape")
            if not converter:
                return {"error": "Para importar AI/PDF conservando vectores instalá Inkscape. "
                                 "También podés exportar desde Illustrator como SVG con "
                                 "'Conservar capacidades de edición' y abrir ese SVG directamente."}
            out = Path(tempfile.gettempdir()) / (fp.stem + "_low_import.svg")
            try:
                result = subprocess.run([converter, str(fp), "--export-type=svg",
                                         "--export-filename", str(out)],
                                        capture_output=True, text=True, timeout=90)
                if result.returncode != 0 or not out.exists():
                    return {"error": "Inkscape no pudo convertir el AI/PDF: " +
                                     ((result.stderr or result.stdout or "")[-240:])}
                raw = out.read_bytes()
            except (OSError, subprocess.SubprocessError) as e:
                return {"error": f"No pude convertir el archivo vectorial: {e}"}
        if suffix in (".svg", ".ai", ".pdf"):
            try:
                return {"svg": raw.decode("utf-8-sig"), "name": fp.name,
                        "kind": "svg", "source_kind": suffix.lstrip(".")}
            except UnicodeDecodeError:
                return {"error": "el SVG no está codificado como UTF-8"}
        mime = s.IMG_MIME.get(fp.suffix.lower())
        if not mime:
            return {"error": f"formato no soportado: {fp.suffix}"}
        return {"data": f"data:{mime};base64," + base64.b64encode(raw).decode("ascii"),
                "name": fp.name, "kind": "raster"}

    def import_brush_pack(s):
        """Importa puntas de pincel sin acoplar el motor a formatos externos.

        PNG/JPEG/WebP son puntas directas; brushset se abre como ZIP y ABR
        moderno se admite cuando contiene previews PNG/JPEG embebidos. Todos
        se normalizan al mismo contrato de presets que consume el frontend.
        """
        if not s._window:
            return {"error": "sin ventana"}
        try:
            chosen = s._window.create_file_dialog(
                webview.OPEN_DIALOG, allow_multiple=False,
                file_types=("Pinceles (*.abr;*.brushset;*.lowbrush;*.json;*.png;*.jpg;*.jpeg;*.webp)",))
        except Exception as e:
            return {"error": str(e)}
        if not chosen:
            return {"cancel": True}
        fp = Path(chosen[0] if isinstance(chosen, (list, tuple)) else chosen)
        try:
            raw = fp.read_bytes()
        except OSError as e:
            return {"error": str(e)}
        if len(raw) > 80_000_000:
            return {"error": "paquete de pinceles demasiado grande (>80 MB)"}

        suffix = fp.suffix.lower()
        if suffix in (".lowbrush", ".json"):
            try:
                data = json.loads(raw.decode("utf-8-sig"))
                presets = data.get("brushes", data if isinstance(data, list) else [data])
                return {"presets": presets, "name": fp.name, "format": "lowbrush"}
            except (ValueError, UnicodeDecodeError) as e:
                return {"error": f"preset JSON inválido: {e}"}

        tips = []
        if suffix == ".brushset":
            import io
            import zipfile
            try:
                with zipfile.ZipFile(io.BytesIO(raw)) as archive:
                    for name in archive.namelist():
                        if Path(name).suffix.lower() in (".png", ".jpg", ".jpeg"):
                            tips.append((Path(name).stem, archive.read(name)))
                            if len(tips) >= 32:
                                break
            except (OSError, zipfile.BadZipFile) as e:
                return {"error": f"brushset inválido: {e}"}
        elif suffix == ".abr":
            # Algunos ABR incluyen previews codificados como imágenes completas.
            # Se extraen sin intentar adivinar los descriptores propietarios.
            cursor = 0
            while len(tips) < 32:
                png = raw.find(b"\x89PNG\r\n\x1a\n", cursor)
                jpg = raw.find(b"\xff\xd8\xff", cursor)
                starts = [(p, "png") for p in (png,) if p >= 0] + [(p, "jpg") for p in (jpg,) if p >= 0]
                if not starts:
                    break
                start, kind = min(starts)
                if kind == "png":
                    end = raw.find(b"IEND\xaeB`\x82", start)
                    end = end + 8 if end >= 0 else -1
                else:
                    end = raw.find(b"\xff\xd9", start + 3)
                    end = end + 2 if end >= 0 else -1
                if end <= start:
                    break
                tips.append((f"{fp.stem} {len(tips)+1}", raw[start:end]))
                cursor = end
            if not tips:
                return {"error": "Este ABR usa puntas comprimidas sin preview compatible. "
                                 "Exportá las puntas como PNG desde Photoshop por ahora."}
        else:
            tips = [(fp.stem, raw)]

        try:
            import io
            from PIL import Image, ImageChops, ImageOps
            normalized = []
            for index, (name, blob) in enumerate(tips):
                image = Image.open(io.BytesIO(blob)).convert("RGBA")
                image.thumbnail((256, 256), Image.Resampling.LANCZOS)
                # Photoshop/Procreate suelen guardar la punta como tinta negra
                # sobre blanco; otros packs usan alpha real. Unificamos ambos
                # casos como máscara negra transparente para poder recolorearla.
                luminance = ImageOps.grayscale(image.convert("RGB"))
                ink = ImageOps.invert(luminance)
                alpha = ImageChops.multiply(ink, image.getchannel("A"))
                normalized_tip = Image.new("RGBA", image.size, (0, 0, 0, 0))
                normalized_tip.putalpha(alpha)
                out = io.BytesIO(); normalized_tip.save(out, format="PNG", optimize=True)
                data = "data:image/png;base64," + base64.b64encode(out.getvalue()).decode("ascii")
                normalized.append({"id": f"imported-{fp.stem}-{index+1}", "name": name,
                    "engine": "raster", "size": 36, "opacity": 1, "flow": .72,
                    "spacing": .12, "pressureSize": .72, "pressureOpacity": .18,
                    "hardness": .8, "tipData": data, "sourceFormat": suffix.lstrip(".")})
        except Exception as e:
            return {"error": f"No pude leer las puntas del pincel: {e}"}
        return {"presets": normalized, "name": fp.name,
                "format": suffix.lstrip("."), "count": len(normalized)}

    def gen_background(s, prompt, size="1024x1024"):
        """Genera una IMAGEN DE FONDO con IA y la devuelve como data URL, para que
        el frontend la coloque AL FONDO del lienzo (eje z). Usa el mismo despachador
        de imagen (fal.ai/OpenAI/SiliconFlow)."""
        if not (prompt or "").strip():
            return {"error": "falta describir el fondo"}
        data, used, err = s._gen_image(prompt.strip(), size=size)
        if not data:
            return {"error": err or "no se pudo generar el fondo"}
        return {"data": "data:image/png;base64," + base64.b64encode(data).decode("ascii"),
                "used": used}

    def ai_colorize(s, image, prompt=""):
        """Coloreado inteligente / entintado con IA: toma un raster (line art o el
        render del lienzo, como data URL) y lo colorea preservando las líneas. Usa
        FLUX.1 Kontext en fal.ai (lo mejor del mercado para line art) y si no hay,
        edición de imagen en SiliconFlow. Devuelve {data: dataurl}."""
        if not image or not str(image).startswith("data:"):
            return {"error": "falta la imagen a colorear (data URL)"}
        instr = (prompt or "").strip() or (
            "Colorize this line art professionally: clean flat colors with soft "
            "cel-shading, harmonious palette, keep the existing ink lines intact, "
            "do not change the drawing — only add color.")
        # fal.ai FLUX Kontext primero (referencia del mercado en line art)
        if s.cfg.get_api_key("fal"):
            model = s._fal_cfg("colorize_model", "fal-ai/flux-kontext/dev")
            data, err = s._fal_run(model, {"prompt": instr, "image_url": image}, "image")
            if data:
                return {"data": "data:image/png;base64," + base64.b64encode(data).decode("ascii"),
                        "used": "fal.ai FLUX Kontext"}
            fal_err = err
        else:
            fal_err = None
        # SiliconFlow (Qwen-Image-Edit) como alternativa
        if s.cfg.get_api_key("siliconflow"):
            try:
                import tempfile
                b64 = image.split(",", 1)[1]
                tmp = Path(tempfile.gettempdir()) / "low_colorize_in.png"
                tmp.write_bytes(base64.b64decode(b64))
            except (ValueError, OSError, base64.binascii.Error) as e:
                return {"error": f"imagen inválida: {e}"}
            data, err = s._edit_image_api(str(tmp), instr)
            if data:
                return {"data": "data:image/png;base64," + base64.b64encode(data).decode("ascii"),
                        "used": "SiliconFlow (Qwen-Image-Edit)"}
            return {"error": err or fal_err or "no se pudo colorear"}
        return {"error": fal_err or "cargá una API key de fal.ai o SiliconFlow () para el coloreado con IA"}

    # ── vectorización: raster (PNG/JPG)  SVG EDITABLE ("calcar") ────────
    # El truco para que la IA "dibuje bien": en vez de escribir coordenadas SVG a
    # ciegas (sale tosco), genera/toma un raster y lo TRAZA a vectores editables.
    _VTRACE_PRESETS = {
        "low":    {"filter_speckle": 10, "color_precision": 4, "path_precision": 4},
        "medium": {"filter_speckle": 6,  "color_precision": 6, "path_precision": 6},
        "high":   {"filter_speckle": 3,  "color_precision": 8, "path_precision": 8},
    }
    # preset de CONTORNO (animación): trazos largos y unificados, sin puntitos.
    # filter_speckle alto mata blobs chicos; corner/length/splice altos favorecen
    # curvas largas y continuas en vez de fragmentos.
    _VTRACE_CONTOUR = {"filter_speckle": 12, "path_precision": 6,
                       "corner_threshold": 80, "length_threshold": 8.0,
                       "splice_threshold": 60}

    _VTRACE_KEY = (255, 0, 254)   # magenta imposible: marca el fondo eliminado

    def _prep_raster(s, png_bytes, mode="color", remove_bg=False, bg_tol=32):
        """Preprocesa el raster antes de trazar (Pillow + numpy).

        - remove_bg: detecta el color de fondo por las 4 esquinas y lo vuelve
          color llave con tolerancia (la varita mágica de Photoshop, global) —
          después _strip_key_paths borra esos paths del SVG.
        - mode='lineas': luminancia  umbral de Otsu  tinta negra pura, para
          CALCAR solo las líneas del dibujo (line-art/boceto).
        Devuelve (png_bytes, key_color|None).
        """
        import io
        import numpy as np
        from PIL import Image
        img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
        if max(img.size) > 1600:                    # velocidad y menos ruido
            img.thumbnail((1600, 1600), Image.LANCZOS)
        a = np.asarray(img).astype(np.int16).copy()  # H×W×4

        KEY = s._VTRACE_KEY
        key_used = False
        if remove_bg:
            corners = np.array([a[0, 0, :3], a[0, -1, :3], a[-1, 0, :3], a[-1, -1, :3]])
            bg = np.median(corners, axis=0)
            mask = (np.abs(a[..., :3] - bg).sum(axis=-1) <= int(bg_tol) * 3) | (a[..., 3] < 40)
            a[mask] = (*KEY, 255)
            key_used = True
        else:
            mask = a[..., 3] < 40                   # PNG con transparencia previa
            if mask.any():
                a[mask] = (*KEY, 255)
                key_used = True

        if mode in ("lineas", "contorno"):
            rgb = a[..., :3].astype(np.float32)
            # redondear: el umbral de Otsu es un índice de bin entero — con
            # floats, la tinta del bin exacto quedaba afuera de lum <= t
            lum = np.round(rgb[..., 0] * 0.299 + rgb[..., 1] * 0.587 + rgb[..., 2] * 0.114)
            if key_used:
                lum[np.all(a[..., :3] == KEY, axis=-1)] = 255   # el fondo es papel
            hist, _ = np.histogram(lum, bins=256, range=(0, 255))
            total, sum_all = lum.size, float((np.arange(256) * hist).sum())
            best_t, best_v, wB, sumB = 128, -1.0, 0.0, 0.0
            for t in range(256):                    # umbral de Otsu
                wB += hist[t]
                if wB == 0:
                    continue
                wF = total - wB
                if wF == 0:
                    break
                sumB += t * hist[t]
                mB, mF = sumB / wB, (sum_all - sumB) / wF
                v = wB * wF * (mB - mF) ** 2
                if v > best_v:
                    best_v, best_t = v, t
            ink = Image.fromarray(np.where(lum <= best_t, 0, 255).astype(np.uint8), "L")
            if mode == "contorno":
                # CIERRE morfológico: une los cortes de la línea en contornos
                # LARGOS y continuos (para animación), en vez de trocitos sueltos.
                # min=oscuro crece (conecta), max=oscuro se achica (vuelve al grosor).
                from PIL import ImageFilter
                ink = ink.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MinFilter(3))
                ink = ink.filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MaxFilter(3))
            buf = io.BytesIO()
            ink.convert("RGB").save(buf, "PNG")
            return buf.getvalue(), None             # binario: sin color llave

        buf = io.BytesIO()
        Image.fromarray(a.astype(np.uint8), "RGBA").convert("RGB").save(buf, "PNG")
        return buf.getvalue(), (KEY if key_used else None)

    @staticmethod
    def _drop_tiny_paths(svg, min_px=6.0):
        """Borra los <path> cuyo bounding box es más chico que min_px — los
        'puntitos de vector' que ensucian el calco de líneas para animación."""
        def repl(m):
            tag = m.group(0)
            dm = re.search(r'\bd="([^"]+)"', tag)
            if not dm:
                return tag
            nums = [float(x) for x in re.findall(r'-?\d+(?:\.\d+)?', dm.group(1))]
            xs, ys = nums[0::2], nums[1::2]
            if len(xs) < 2:
                return ""
            if max(max(xs) - min(xs), max(ys) - min(ys)) < min_px:
                return ""
            return tag
        return re.sub(r"<path\b[^>]*/?>", repl, svg)

    @staticmethod
    def _strip_key_paths(svg, key):
        """Borra del SVG trazado los paths del color llave (el fondo quitado)."""
        kr, kg, kb = key

        def repl(m):
            tag = m.group(0)
            fm = re.search(r'fill="#?([0-9a-fA-F]{6})"', tag)
            if not fm:
                return tag
            h = fm.group(1)
            r_, g_, b_ = int(h[:2], 16), int(h[2:4], 16), int(h[4:6], 16)
            return "" if abs(r_ - kr) + abs(g_ - kg) + abs(b_ - kb) <= 48 else tag
        return re.sub(r"<path\b[^>]*/?>", repl, svg)

    @staticmethod
    def _strip_bg_fills(svg, thresh=210):
        """Borra los paths de relleno CLARO (el papel blanco). En line-art vtracer
        traza el fondo como un path blanco bajo cada trazo — eso metía una 'capa
        de fondo blanco por cada trazo'. Deja solo la tinta."""
        def repl(m):
            tag = m.group(0)
            fm = re.search(r'fill="#?([0-9a-fA-F]{6})"', tag)
            if not fm:
                return tag
            h = fm.group(1)
            r_, g_, b_ = int(h[:2], 16), int(h[2:4], 16), int(h[4:6], 16)
            return "" if (r_ >= thresh and g_ >= thresh and b_ >= thresh) else tag
        return re.sub(r"<path\b[^>]*/?>", repl, svg)

    # ── trazador de contornos en NUMPY (sin vtracer, corre en cualquier Python) ──
    @staticmethod
    def _rdp(pts, eps):
        """Ramer-Douglas-Peucker: simplifica una polilínea quitando puntos
        redundantes (saca la escalera de píxeles del contorno)."""
        import math
        n = len(pts)
        if n < 3:
            return pts
        keep = [False] * n
        keep[0] = keep[-1] = True
        stack = [(0, n - 1)]
        while stack:
            a, b = stack.pop()
            x1, y1 = pts[a]; x2, y2 = pts[b]
            dx, dy = x2 - x1, y2 - y1
            L = math.hypot(dx, dy) or 1.0
            dmax, idx = 0.0, -1
            for i in range(a + 1, b):
                x0, y0 = pts[i]
                d = abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / L
                if d > dmax:
                    dmax, idx = d, i
            if dmax > eps and idx > 0:
                keep[idx] = True
                stack.append((a, idx)); stack.append((idx, b))
        return [pts[i] for i in range(n) if keep[i]]

    @staticmethod
    def _rdp_closed(pts, eps):
        """RDP para un lazo CERRADO: parte el lazo en dos arcos con extremos
        distintos (si no, el RDP normal degenera a 2 puntos porque inicio==fin)."""
        if len(pts) > 1 and pts[0] == pts[-1]:
            pts = pts[:-1]
        n = len(pts)
        if n < 4:
            return pts
        lo = min(range(n), key=lambda i: pts[i][0] + pts[i][1])
        hi = max(range(n), key=lambda i: pts[i][0] + pts[i][1])
        a, b = sorted((lo, hi))
        if a == b:
            a, b = 0, n // 2
        r1 = Api._rdp(pts[a:b + 1], eps)
        r2 = Api._rdp(pts[b:] + pts[:a + 1], eps)
        out = r1[:-1] + r2[:-1]         # sacar las anclas duplicadas
        return out if len(out) >= 3 else pts

    @staticmethod
    def _smooth_closed(pts):
        """Catmull-Rom  beziers cúbicas cerradas: curva suave que pasa por
        todos los puntos del contorno."""
        n = len(pts)
        if n < 3:
            return ""
        def pt(i):
            return pts[i % n]
        d = "M %.1f %.1f " % (pt(0)[0], pt(0)[1])
        for i in range(n):
            p0, p1, p2, p3 = pt(i - 1), pt(i), pt(i + 1), pt(i + 2)
            c1x = p1[0] + (p2[0] - p0[0]) / 6.0; c1y = p1[1] + (p2[1] - p0[1]) / 6.0
            c2x = p2[0] - (p3[0] - p1[0]) / 6.0; c2y = p2[1] - (p3[1] - p1[1]) / 6.0
            d += "C %.1f %.1f %.1f %.1f %.1f %.1f " % (c1x, c1y, c2x, c2y, p2[0], p2[1])
        return d + "Z"

    @staticmethod
    def _trace_np_contours(mask):
        """Contornos de una máscara binaria (True=tinta) siguiendo los bordes de
        píxel y encadenándolos en lazos cerrados. numpy puro."""
        import numpy as np
        from collections import defaultdict
        H, W = mask.shape
        mp = np.zeros((H + 2, W + 2), bool)
        mp[1:-1, 1:-1] = mask
        core = mp[1:-1, 1:-1]
        up = core & ~mp[0:-2, 1:-1]
        down = core & ~mp[2:, 1:-1]
        left = core & ~mp[1:-1, 0:-2]
        right = core & ~mp[1:-1, 2:]
        adj = defaultdict(list)
        def add(p1, p2):
            adj[p1].append(p2); adj[p2].append(p1)
        for r, c in zip(*np.where(up)):    add((int(c), int(r)), (int(c) + 1, int(r)))
        for r, c in zip(*np.where(down)):  add((int(c), int(r) + 1), (int(c) + 1, int(r) + 1))
        for r, c in zip(*np.where(left)):  add((int(c), int(r)), (int(c), int(r) + 1))
        for r, c in zip(*np.where(right)): add((int(c) + 1, int(r)), (int(c) + 1, int(r) + 1))
        used = set()
        def ek(a, b):
            return (a, b) if a <= b else (b, a)
        loops = []
        for start in list(adj.keys()):
            for first in adj[start]:
                if ek(start, first) in used:
                    continue
                used.add(ek(start, first))
                loop = [start, first]
                prev, cur = start, first
                while cur != start:
                    nb = None
                    for cand in adj[cur]:      # preferí un borde sin usar ≠ al que vine
                        if cand != prev and ek(cur, cand) not in used:
                            nb = cand; break
                    if nb is None:
                        for cand in adj[cur]:
                            if ek(cur, cand) not in used:
                                nb = cand; break
                    if nb is None:
                        break
                    used.add(ek(cur, nb))
                    loop.append(nb)
                    prev, cur = cur, nb
                if len(loop) >= 4:
                    loops.append(loop)
        return loops

    def _vectorize_np(s, png_bytes, mode, remove_bg, bg_tol):
        """Vectoriza line-art/contorno en numpy puro: traza SOLO la tinta a un
        path con fill-rule evenodd (los huecos salen solos). Sin fondo blanco,
        sin vtracer — corre en cualquier versión de Python."""
        try:
            import io
            import numpy as np
            from PIL import Image
            prep, _key = s._prep_raster(png_bytes, mode, remove_bg, bg_tol)
            arr = np.asarray(Image.open(io.BytesIO(prep)).convert("L"))
            mask = arr < 128
            if not mask.any():
                return None
            H, W = mask.shape
            loops = s._trace_np_contours(mask)
            eps = 2.2 if mode == "contorno" else 1.4
            minbb = 6.0 if mode == "contorno" else 2.5
            subpaths = []
            for loop in loops:
                xs = [p[0] for p in loop]; ys = [p[1] for p in loop]
                if max(max(xs) - min(xs), max(ys) - min(ys)) < minbb:
                    continue                         # fuera los puntitos
                simp = s._rdp_closed(loop, eps)
                if len(simp) >= 3:
                    subpaths.append(s._smooth_closed(simp))
            if not subpaths:
                return None
            return ('<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" '
                    'viewBox="0 0 %d %d"><path fill="#111111" fill-rule="evenodd" d="%s"/></svg>'
                    % (W, H, W, H, " ".join(subpaths)))
        except Exception as e:
            log(f"tracer numpy: {e}")
            return None

    @staticmethod
    def _vtrace_safe(tin, tout, kwargs):
        """Corre vtracer sin arriesgar el proceso de LOW. Devuelve error o None.

        El binding PyO3 de vtracer 0.6.x CRASHEA el intérprete entero (access
        violation, imposible de atrapar) en Python >= 3.14. En el .exe
        congelado (CI usa 3.11/3.12) es seguro en-proceso; corriendo desde
        source con 3.14+ se aísla en un subproceso: si revienta, muere el
        hijo y LOW sigue vivo."""
        if sys.version_info < (3, 14):
            import vtracer                     # exe de CI (3.11) y source ≤3.13
            vtracer.convert_image_to_svg_py(tin, tout, **kwargs)
            return None
        if getattr(sys, "frozen", False):      # exe compilado con 3.14: ni intentar
            return ("vtracer es incompatible con Python 3.14 (crash nativo) — "
                    "este .exe se compiló con 3.14; el de GitHub Actions (3.11) "
                    "no tiene el problema")
        import subprocess
        code = ("import json,sys,vtracer;a=json.loads(sys.argv[1]);"
                "vtracer.convert_image_to_svg_py(a['tin'],a['tout'],**a['kw'])")
        arg = json.dumps({"tin": tin, "tout": tout, "kw": kwargs})
        r = subprocess.run([sys.executable, "-c", code, arg],
                           capture_output=True, timeout=180)
        if r.returncode != 0:
            return (f"vtracer se cayó (código {r.returncode}) — el paquete es "
                    f"incompatible con Python {sys.version_info.major}."
                    f"{sys.version_info.minor}; el .exe de LOW no tiene este "
                    "problema, o usá Python 3.13 o anterior")
        return None

    def _vectorize(s, png_bytes, detail="medium", mode="color",
                   remove_bg=False, bg_tol=32):
        """PNG/JPG (bytes)  (svg_str, error). vtracer local (offline, gratis)
        primero; si no está, fal.ai recraft/vectorize (IA, needs key).
        mode: 'color' (formas por color) | 'lineas' (calca el trazo) |
        'contorno' (trazos largos unificados sin puntitos, para animación)."""
        binary = mode in ("lineas", "contorno")
        # line-art/contorno: trazador NUMPY primero — corre en cualquier Python
        # (incluido 3.14, donde vtracer crashea) y traza SOLO la tinta a un path
        # con fill-rule evenodd  NUNCA genera capas de fondo blanco.
        if binary:
            svg_np = s._vectorize_np(png_bytes, mode, remove_bg, bg_tol)
            if svg_np:
                if mode == "contorno":
                    svg_np = s._drop_tiny_paths(svg_np, 6.0)
                return svg_np, None
        opt = s._VTRACE_CONTOUR if mode == "contorno" \
            else s._VTRACE_PRESETS.get(detail, s._VTRACE_PRESETS["medium"])
        key = None
        try:
            png_bytes, key = s._prep_raster(png_bytes, mode, remove_bg, bg_tol)
        except Exception as e:
            log(f"prep raster (sigo sin preproceso): {e}")
        last_err = None
        try:
            import tempfile
            tin = Path(tempfile.mktemp(suffix=".png"))
            tout = Path(tempfile.mktemp(suffix=".svg"))
            tin.write_bytes(png_bytes)
            last_err = s._vtrace_safe(str(tin), str(tout), dict(
                colormode="binary" if binary else "color",
                mode="spline", hierarchical="stacked", **opt))
            svg = "" if last_err or not tout.exists() \
                else tout.read_text(encoding="utf-8", errors="replace")
            for f in (tin, tout):
                try:
                    f.unlink()
                except OSError:
                    pass
            if last_err:
                log(f"vtracer: {last_err}")
            elif "<svg" in svg:
                if key:
                    svg = s._strip_key_paths(svg, key)
                if binary:
                    svg = s._strip_bg_fills(svg)         # fuera el papel blanco
                if mode == "contorno":
                    svg = s._drop_tiny_paths(svg, 6.0)   # fuera los puntitos
                return svg, None
        except Exception as e:
            last_err = str(e)[:200]
            log(f"vtracer no disponible/falló: {e}")
        # fallback: fal.ai recraft (vectorizador neural)
        if s.cfg.get_api_key("fal"):
            du = "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")
            data, err = s._fal_run("fal-ai/recraft/vectorize", {"image_url": du}, "image")
            if data:
                try:
                    return data.decode("utf-8", "replace"), None
                except Exception:
                    return None, "fal devolvió un formato inesperado"
            return None, err
        return None, (last_err or "vectorización no disponible: instalá vtracer "
                      "(pip install vtracer) o cargá una API key de fal.ai en ")

    def _read_img_bytes(s, image):
        """Bytes de una imagen desde data URL o ruta (relativa al workspace o abs)."""
        if not image:
            return None, "falta la imagen"
        if str(image).startswith("data:"):
            try:
                return base64.b64decode(image.split(",", 1)[1]), None
            except Exception as e:
                return None, f"data URL inválido: {e}"
        p = Path(image) if os.path.isabs(image) else s._base() / image
        if not p.exists():
            return None, f"no existe: {image}"
        try:
            return p.read_bytes(), None
        except OSError as e:
            return None, str(e)

    def vectorize_image(s, image, detail="medium", mode="color",
                        remove_bg=False, bg_tol=32):
        """API para el frontend: raster (data URL o ruta)  {svg} editable."""
        raw, err = s._read_img_bytes(image)
        if err:
            return {"error": err}
        svg, err = s._vectorize(raw, detail, mode=mode or "color",
                                remove_bg=bool(remove_bg),
                                bg_tol=int(bg_tol or 32))
        return {"svg": svg} if svg else {"error": err or "no se pudo vectorizar"}

    # ── escena de animación: cámara, claves y easing por secuencia ──────
    # Vive en <base>_escena.json al lado de los cuadros (portable con el proyecto).
    # {"cam": {"1": {"cx","cy","w","rot"}}, "keys": [1,5], "ease": "inout", "fps": 12}
    def _scene_path(s, path):
        p = Path(path)
        m = s._FRAME_RX.match(p.name)
        base = m.group(1) if m else p.stem
        return p.with_name(f"{base}_escena.json")

    def scene_get(s, path):
        f = s._scene_path(path)
        if not f.exists():
            return {"scene": {}}
        try:
            return {"scene": json.loads(f.read_text(encoding="utf-8"))}
        except (OSError, ValueError) as e:
            return {"scene": {}, "error": str(e)}

    def scene_save(s, path, scene):
        f = s._scene_path(path)
        try:
            f.write_text(json.dumps(scene or {}, ensure_ascii=False, indent=1),
                         encoding="utf-8")
            return {"ok": True}
        except OSError as e:
            return {"error": str(e)}

    def ai_keyframe(s, path, prompt):
        """ El modelo dibuja el PRÓXIMO fotograma clave a partir del cuadro
        actual + la descripción del movimiento, y se inserta como cuadro nuevo
        justo después. Es el flujo pose-a-pose de Toon Boom con IA."""
        if not s.prov:
            return {"error": "No hay proveedor activo — configurá una API key ()"}
        p = Path(path)
        if not s._FRAME_RX.match(p.name):
            return {"error": "no es un cuadro de animación (_fNNN.svg)"}
        try:
            src = p.read_text(encoding="utf-8", errors="replace")[:14000]
        except OSError as e:
            return {"error": str(e)}
        chars = s._load_characters()
        sheet = ("\nFICHAS DE PERSONAJE (canónicas, NO se negocian):\n" +
                 "\n".join(f"- {c['name']}: {c['desc']}" for c in chars) + "\n"
                 if chars else "")
        try:
            r = s.prov.chat(
                [{"role": "user", "content":
                  "Este SVG es un FOTOGRAMA de una animación 2D cuadro a cuadro:\n\n" + src +
                  "\n\nDibujá el SIGUIENTE FOTOGRAMA CLAVE de la animación según esta "
                  "indicación del animador: «" + (prompt or "continuá el movimiento natural") + "».\n"
                  + sheet +
                  "Reglas de animación (respetalas TODAS):\n"
                  "- REUTILIZÁ los elementos existentes: COPIÁ cada path/forma del personaje "
                  "tal cual está y modificá SOLO las coordenadas/transform de las partes que "
                  "se mueven. NO redibujes el personaje de cero.\n"
                  "- PROHIBIDO cambiar del personaje: colores (ni un hex), proporciones, "
                  "grosores de trazo, cantidad de elementos, orden de capas, estilo. Un "
                  "espectador tiene que jurar que es EL MISMO personaje en otra pose.\n"
                  "- Mantené EXACTAMENTE el mismo viewBox y el fondo idéntico.\n"
                  "- Mantené la misma cantidad, orden y tipo de elementos: así el intercalado "
                  "automático entre claves funciona.\n"
                  "- El cambio debe leerse como UNA pose nueva clara (pose-a-pose), no un ajuste sutil.\n"
                  "Respondé SOLO con el código SVG completo del cuadro nuevo, sin markdown."}],
                system_prompt="Sos un animador 2D senior (flujo pose a pose estilo Toon Boom/OpenToonz). Tu regla de oro es LA CONSISTENCIA DEL PERSONAJE: mismo diseño exacto en cada cuadro, solo cambia la pose. Respondés únicamente con SVG válido.",
                temperature=0.5, max_tokens=8000)
        except Exception as e:
            return {"error": f"el modelo falló: {e}"}
        m = re.search(r"<svg.*?</svg>", r.content or "", re.DOTALL)
        if not m:
            return {"error": "el modelo no devolvió un SVG válido — probá describir el movimiento más concreto"}
        return s.insert_frame(path, m.group(0))

    def new_design(s):
        """Crea un lienzo SVG Full HD en blanco (1920×1080) y devuelve su ruta.
        Página en blanco de verdad, lista para dibujar — sin carteles."""
        starter = (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" width="1920" height="1080" preserveAspectRatio="xMidYMid meet">\n'
            '  <rect data-low-page="1" x="0" y="0" width="1920" height="1080" fill="#ffffff"/>\n'
            '  <g data-low-art="colour" aria-label="Color"></g>\n'
            '  <g data-low-art="line" aria-label="Línea"></g>\n'
            '</svg>\n')
        d = s._base() / "disenos"
        d.mkdir(parents=True, exist_ok=True)
        fp = d / f"diseno_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.svg"
        fp.write_text(starter, encoding="utf-8")
        s._push("ws", {"ws": s.ws, "tree": s._tree(), "branch": s._git_branch()})
        return {"path": str(fp), "name": fp.name}

    def new_scene(s, content):
        """Crea en el disco un documento de escena `.low` y devuelve su ruta.

        POR QUE EXISTE. Hasta la v4.35.2 «Nuevo documento» llamaba a
        `new_design()`, que escribe un `disenos/diseno_<fecha>.svg`: un dibujo
        suelto. La escena —capas, niveles, exposiciones, rig, camara— vivia solo
        en memoria y unicamente se volcaba a `.low` si alguien apretaba Guardar y
        pasaba por el dialogo. Medido en el workspace de Mauro: 157 SVG sueltos,
        138 de ellos en blanco, y CERO archivos .low. O sea que el formato propio
        del programa no lo estaba usando nadie.

        El contenido lo arma el frontend (`LowDoc.toJSON`): el formato es del
        modelo, no del puente. Aca solo se elige un nombre libre y se escribe.
        """
        if not content:
            return {"error": "no hay escena que guardar"}
        d = s._base() / "disenos"
        try:
            d.mkdir(parents=True, exist_ok=True)
            stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
            fp = d / f"escena_{stamp}.low"
            # Dos documentos creados dentro del mismo segundo no pueden pisarse:
            # el segundo seria el primero, y el trabajo del primero se perderia.
            n = 2
            while fp.exists():
                fp = d / f"escena_{stamp}_{n}.low"
                n += 1
            fp.write_text(content, encoding="utf-8")
        except OSError as e:
            return {"error": str(e)}
        s._push("ws", {"ws": s.ws, "tree": s._tree(), "branch": s._git_branch()})
        return {"path": str(fp), "name": fp.name}

    def trash_design(s, path):
        """Mueve un archivo creativo del workspace a una papelera recuperable.

        Nunca acepta rutas externas al proyecto y nunca borra definitivamente.
        La carpeta `.low-trash` queda fuera de la vista creativa normal, pero el
        usuario puede recuperar el archivo manualmente si se arrepiente.
        """
        if not path:
            return {"error": "no se indicó ningún archivo"}
        base = s._base().resolve()
        source = Path(path).resolve()
        try:
            source.relative_to(base)
        except ValueError:
            return {"error": "LOW solo puede borrar archivos dentro del proyecto abierto"}
        if not source.exists() or not source.is_file():
            return {"error": "el archivo ya no existe"}
        trash = base / ".low-trash"
        trash.mkdir(parents=True, exist_ok=True)
        stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        destination = trash / f"{source.stem}_{stamp}{source.suffix}"
        counter = 2
        while destination.exists():
            destination = trash / f"{source.stem}_{stamp}_{counter}{source.suffix}"
            counter += 1
        try:
            shutil.move(str(source), str(destination))
        except OSError as e:
            return {"error": str(e)}
        s._push("ws", {"ws": s.ws, "tree": s._tree(), "branch": s._git_branch()})
        return {"trashed": True, "path": str(source), "recovery_path": str(destination)}

    # direcciones creativas del [Variacion]: cada variación explora un eje distinto
    VAR_DIRECTIONS = [
        "paleta de colores alternativa (mantené la composición igual)",
        "más minimalista: menos elementos, más aire, formas más simples",
        "más contraste y jerarquía visual: pesos, tamaños y color más marcados",
        "composición distinta: reorganizá los elementos con otro layout",
    ]

    def design_variations(s, path, current_svg=""):
        """[Variacion] Evolución de diseño: genera variaciones del SVG en direcciones
        creativas distintas (en paralelo) para que el usuario elija una y pueda
        volver a evolucionar desde ella. Devuelve {variants: [{dir, svg}]}."""
        if not s.prov:
            return {"error": "No hay proveedor activo — configurá una API key ()"}
        svg = (current_svg or "").strip()
        if not svg:
            try:
                svg = Path(path).read_text(encoding="utf-8", errors="replace")
            except OSError as e:
                return {"error": str(e)}
        if "<svg" not in svg:
            return {"error": "El archivo no parece un SVG"}
        src = svg[:14000]   # techo de contexto: diseños gigantes se recortan
        results, lock = [], threading.Lock()

        def worker(direction):
            try:
                r = s.prov.chat(
                    [{"role": "user", "content":
                      "Este es un diseño SVG:\n\n" + src +
                      "\n\nCreá UNA variación del MISMO diseño con esta dirección: "
                      + direction +
                      ".\nMantené el mismo viewBox y que todo quede dentro del lienzo. "
                      "Respondé SOLO con el código SVG completo, sin markdown ni explicación."}],
                    system_prompt="Sos un diseñador gráfico senior. Respondés únicamente con SVG válido.",
                    temperature=0.9, max_tokens=6000)
                m = re.search(r"<svg.*?</svg>", r.content or "", re.DOTALL)
                if m:
                    with lock:
                        results.append({"dir": direction.split(":")[0].split("(")[0].strip(),
                                        "svg": m.group(0)})
            except Exception as e:
                log(f"variación falló ({direction[:30]}): {e}")

        ts = [threading.Thread(target=worker, args=(d,), daemon=True)
              for d in s.VAR_DIRECTIONS]
        for t in ts:
            t.start()
        for t in ts:
            t.join(timeout=150)
        return {"variants": results}

    def set_zoom(s, z):
        s.cfg.data["zoom"] = z
        s.cfg.save()

    def refresh_tree(s):
        return {"tree": s._tree()}

    def config_path(s):
        return str(s.cfg.path)

    def set_theme(s, theme):
        s.cfg.data["theme"] = theme
        s.cfg.save()

    def set_provider(s, name):
        name = name.replace(" (media)", "")  # por si viene con el sufijo de la UI
        s.cfg.set_active_provider(name)
        s._initp()
        active = s.cfg.get_active_provider()
        r = {"provider": active,
             "model": s.cfg.get_model(active) or (s.prov.model if s.prov else ""),
             "models": s._models(active),
             "chain": [{"provider": p, "model": m} for p, m in s._chain()]}
        r.update(s._apis_state())
        return r

    def set_model(s, model):
        s.cfg.set_model(s.cfg.get_active_provider(), model.strip())
        s._initp()

    def save_failover_order(s, order):
        """Guarda el orden de prioridad de providers para failover ()."""
        if isinstance(order, list) and order:
            s.cfg.data["failover_order"] = order
            s.cfg.save()
        return {"failover_order": s.cfg.data.get("failover_order", []),
                "chain": [{"provider": p, "model": m} for p, m in s._chain()]}

    def save_keys(s, keys):
        for p, v in (keys or {}).items():
            if p not in PROVIDERS and not is_custom_provider(p):
                log(f"save_keys ignora provider desconocido: {p!r}")
                continue
            if isinstance(v, dict):
                if "api_key" in v:
                    s.cfg.data.setdefault("providers", {}).setdefault(p, {})["api_key"] = (v.get("api_key") or "").strip()
                if "base_url" in v:
                    s.cfg.data.setdefault("providers", {}).setdefault(p, {})["base_url"] = (v.get("base_url") or "").strip()
                for field in ("model", "image_model", "account_id"):
                    if field in v and isinstance(v[field], str):
                        s.cfg.data.setdefault("providers", {}).setdefault(p, {})[field] = v[field].strip()
                for field in ("video_params", "image_params"):
                    if field in v and isinstance(v[field], dict):
                        s.cfg.data.setdefault("providers", {}).setdefault(p, {})[field] = v[field]
                s.cfg.save()
            else:
                s.cfg.set_api_key(p, v)
        s._initp()
        active = s.cfg.get_active_provider()
        model = s.cfg.get_model(active)
        return {**s._apis_state(), "provider": active, "model": model,
                "models": [model] if model else []}

    def check_provider(s, name, settings=None):
        """Read the real catalog, never a static fallback or another provider."""
        if name not in PROVIDERS and not is_custom_provider(name):
            return {"status": "error", "message": "Proveedor desconocido."}
        if settings is None and name not in s.cfg.data.get("providers", {}):
            return {"status": "unverified", "message": "Guardá primero la configuración del proveedor."}
        values = settings if isinstance(settings, dict) else s.cfg.data.get("providers", {}).get(name, {})
        if name == "higgsfield":
            key = str(values.get("api_key") or "").strip()
            parts = key.split(":")
            if len(parts) != 2 or not all(parts) or any(c.isspace() for c in key):
                return {"status": "error", "message": "Higgsfield necesita ID:SECRET completos de Higgsfield Console, sin espacios ni el prefijo Key."}
            if not values.get("model") and not values.get("image_model"):
                return {"status": "error", "message": "Elegí un modelo de imagen o video de Higgsfield."}
            return {"status": "unverified", "message": "Formato de clave y modelo completos. Guardá para aplicarlos. La autenticación y el acceso al modelo se comprueban al generar; no se envió una generación ni se verificó saldo."}
        if name in s.MEDIA_ONLY:
            return {"status": "unverified", "message": "La conexión de medios se verifica al generar; esta comprobación no genera contenido."}
        try:
            provider = get_provider(name, **values)
            headers = {"Authorization": f"Bearer {provider.api_key or 'na'}"}
            if name == "anthropic":
                headers = {"x-api-key": provider.api_key or "", "anthropic-version": "2023-06-01"}
            response = requests.get(provider.base_url.rstrip("/") + "/models",
                                    headers=headers, timeout=(5, 10), allow_redirects=False)
            if response.status_code != 200:
                return {"status": "error", "message": f"HTTP {response.status_code}: no se pudo verificar el catálogo. Algunos servicios no ofrecen /models."}
            models = [item["id"] for item in response.json().get("data", []) if isinstance(item, dict) and isinstance(item.get("id"), str)]
            available = provider.model in models
            return {"status": "catalog_ok", "models": models,
                    "message": f"Catálogo accesible: {len(models)} modelos. " +
                    ("Modelo elegido presente." if available else "El modelo elegido no aparece; elegí uno del catálogo.") +
                    " Esto no verifica saldo ni generación."}
        except Exception as error:
            return {"status": "error", "message": "No se pudo conectar: " + type(error).__name__}

    # ── workspace / archivos ──────────────────────────────
    def _git_branch(s):
        if not s.ws:
            return ""
        try:
            txt = (Path(s.ws) / ".git" / "HEAD").read_text(encoding="utf-8").strip()
            return txt.rsplit("/", 1)[-1] if txt.startswith("ref:") else txt[:8]
        except OSError:
            return ""

    @staticmethod
    def _is_venv(p):
        return (p / "pyvenv.cfg").exists() or p.name == "site-packages"

    def _iter_files(s, base, max_files=5000):
        """Archivos de código del workspace, salteando venvs y basura.
        max_files: límite de seguridad para evitar iteraciones excesivas."""
        file_count = 0
        for root, dirs, files in os.walk(base):
            rp = Path(root)
            dirs[:] = [d for d in dirs
                       if not d.startswith(".") and d not in IGNORE_DIRS
                       and not s._is_venv(rp / d)]
            for f in sorted(files):
                if file_count >= max_files:
                    return
                p = rp / f
                if p.suffix.lower() in CODE_EXT:
                    yield p
                    file_count += 1

    def _tree(s):
        if not s.ws:
            return []

        def walk(dirp, depth):
            items = []
            try:
                entries = sorted(dirp.iterdir(), key=lambda x: (x.is_file(), x.name.lower()))
            except OSError:
                return items
            for p in entries:
                if p.name.startswith("."):
                    continue
                if p.is_dir():
                    if p.name in IGNORE_DIRS or s._is_venv(p):
                        continue
                    items.append({"name": p.name, "path": str(p), "dir": True,
                                  "children": walk(p, depth + 1) if depth < 3 else []})
                elif p.suffix.lower() in CODE_EXT or p.suffix.lower() in ASSET_EXT:
                    items.append({"name": p.name, "path": str(p), "dir": False,
                                  "asset": p.suffix.lower() in ASSET_EXT})
            return items
        return walk(Path(s.ws), 0)

    def pick_ws(s):
        r = s._window.create_file_dialog(webview.FOLDER_DIALOG)
        if not r:
            return None
        s.ws = r[0] if isinstance(r, (list, tuple)) else str(r)
        # recordar el workspace para reabrirlo en el próximo arranque
        s.cfg.data["last_workspace"] = s.ws
        s.cfg.save()
        return {"ws": s.ws, "tree": s._tree(), "branch": s._git_branch()}

    def _file_payload(s, path):
        p = Path(path)
        try:
            content = p.read_text(encoding="utf-8", errors="replace")
        except OSError as e:
            return {"error": f"No pude abrir {p.name}: {e}"}
        return {"path": str(p), "name": p.name, "content": content,
                "lang": LANG_BY_EXT.get(p.suffix.lower(), "python")}

    def open_file(s, path):
        return s._file_payload(path)

    def open_dialog(s):
        r = s._window.create_file_dialog(webview.OPEN_DIALOG,
                                        directory=s.ws or "")
        if not r:
            return None
        return s._file_payload(r[0] if isinstance(r, (list, tuple)) else str(r))

    IMG_MIME = {".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
                ".gif": "image/gif", ".webp": "image/webp", ".bmp": "image/bmp"}

    def pick_image(s):
        """Diálogo de archivo para adjuntar una imagen al chat (visión).
        Devuelve {data, mime, name} en base64, listo para mandar al modelo."""
        r = s._window.create_file_dialog(
            webview.OPEN_DIALOG,
            file_types=("Imágenes (*.png;*.jpg;*.jpeg;*.gif;*.webp;*.bmp)",))
        if not r:
            return None
        p = Path(r[0] if isinstance(r, (list, tuple)) else str(r))
        mime = s.IMG_MIME.get(p.suffix.lower())
        if not mime:
            return {"error": f"Formato no soportado: {p.suffix}"}
        try:
            data = base64.b64encode(p.read_bytes()).decode("ascii")
        except OSError as e:
            return {"error": str(e)}
        return {"data": data, "mime": mime, "name": p.name}

    def save_binary(s, base64_data, filename="modelo.stl"):
        """Guarda un archivo BINARIO que viene del estudio 3D (por ejemplo un
        STL). No se puede reusar save_file: ese escribe texto UTF-8 y un binario
        pasado por ahí sale corrupto.

        Devuelve SIEMPRE un dict que dice qué pasó — {path}, {cancelado} o
        {error} —, nunca None: el estudio corre en un iframe sin puente con
        Python, así que si acá no se contesta, del otro lado no se distingue
        "cancelé", "falló" y "el botón está roto". Y si el diálogo nativo no
        puede abrirse, el archivo se escribe igual en una carpeta conocida
        antes que perderse: el trabajo del usuario no se tira."""
        import base64 as _b64
        try:
            datos = _b64.b64decode(base64_data or "")
        except Exception as e:
            log(f"save_binary: base64 ilegible: {e}")
            return {"error": f"datos ilegibles: {e}"}
        if not datos:
            return {"error": "no llegó nada para guardar"}

        ruta = None
        try:
            r = s._window.create_file_dialog(webview.SAVE_DIALOG,
                                             directory=s.ws or "",
                                             save_filename=filename)
            if not r:
                return {"cancelado": True}
            ruta = Path(r[0] if isinstance(r, (list, tuple)) else str(r))
        except Exception as e:
            # el diálogo no abrió (pasa si se lo pide desde el hilo equivocado):
            # se guarda en el workspace o en Documentos y se avisa dónde quedó
            log(f"save_binary: falló el diálogo ({e}) — guardo en carpeta por defecto")
            base = Path(s.ws) if s.ws else (Path.home() / "Documents")
            ruta = base / filename

        try:
            ruta.parent.mkdir(parents=True, exist_ok=True)
            ruta.write_bytes(datos)
        except OSError as e:
            log(f"save_binary: no pude escribir {ruta}: {e}")
            return {"error": str(e)}
        log(f"save_binary: {ruta} ({len(datos)} bytes)")
        return {"path": str(ruta), "name": ruta.name, "bytes": len(datos)}

    def save_file(s, path, content, filename="codigo.py"):
        # `filename` = nombre sugerido en el diálogo. Lo usa, por ejemplo, LOW
        # Estudio para proponer "proyecto.low3d" en vez de "codigo.py".
        if not path:
            r = s._window.create_file_dialog(webview.SAVE_DIALOG,
                                            directory=s.ws or "",
                                            save_filename=filename)
            if not r:
                return None
            path = r[0] if isinstance(r, (list, tuple)) else str(r)
        p = Path(path)
        try:
            atomic_write_text(p, content, encoding="utf-8")
        except OSError as e:
            log(f"save_file: escritura atómica falló para {p}: {e}")
            return {"error": str(e), "path": str(p), "recoverable": True}
        return {"path": str(p), "name": p.name, "bytes": len(content.encode("utf-8")),
                "atomic": True}

    # ── ejecutar código ───────────────────────────────────
    GUI_LIBS = re.compile(r"\b(pygame|tkinter|turtle|PyQt5|PyQt6|PySide6|kivy|arcade)\b")

    def run_code(s, code, lang):
        # los juegos/apps con ventana no pueden correr capturados con timeout
        # de 30s: se lanzan en un proceso aparte y viven lo que el usuario quiera
        if lang == "python" and s.GUI_LIBS.search(code):
            import shutil
            import tempfile
            f = tempfile.NamedTemporaryFile("w", suffix=".py", delete=False,
                                            encoding="utf-8")
            f.write(code)
            f.close()
            # pythonw no abre consola fantasma; si no está, python con consola propia
            exe = (shutil.which("pythonw") or shutil.which("python")
                   or shutil.which("python3"))
            if not exe:
                return {"success": False, "stdout": "", "stderr": "",
                        "error": "No encuentro Python en el PATH"}
            flags = (subprocess.CREATE_NEW_CONSOLE
                     if os.name == "nt" and exe.lower().endswith("python.exe") else 0)
            try:
                subprocess.Popen([exe, f.name], cwd=s.ws or None, creationflags=flags)
                return {"success": True, "returncode": 0, "stderr": "",
                        "stdout": "[App] App con ventana: corriendo en un proceso aparte. "
                                  "Cerrala desde su propia ventana."}
            except OSError as e:
                return {"success": False, "stdout": "", "stderr": "",
                        "error": f"No pude lanzar la app: {e}"}
        return CodeRunner.run(code, lang)

    def preview_html(s, path, content):
        """Guarda el HTML (en su archivo o en un temporal) y lo abre en el navegador."""
        try:
            if path:
                p = Path(path)
                p.write_text(content, encoding="utf-8")
            else:
                import tempfile
                f = tempfile.NamedTemporaryFile("w", suffix=".html", delete=False,
                                                encoding="utf-8")
                f.write(content)
                f.close()
                p = Path(f.name)
            webbrowser.open(p.resolve().as_uri())
            return {"path": str(p)}
        except Exception as e:
            return {"error": str(e)}

    # ── diff para la tarjeta de cambios ───────────────────
    def diff_stats(s, old, new):
        sm = difflib.SequenceMatcher(None, old.splitlines(), new.splitlines())
        adds = dels = 0
        ranges = []
        for op, i1, i2, j1, j2 in sm.get_opcodes():
            if op in ("replace", "insert"):
                adds += j2 - j1
                ranges.append([j1, j2])
            if op in ("replace", "delete"):
                dels += i2 - i1
        return {"adds": adds, "dels": dels, "ranges": ranges}

    # ── failover automático entre modelos/proveedores ────
    # errores que justifican saltar al siguiente modelo (no son culpa del prompt)
    FAILOVER_HINTS = ("429", "500", "502", "503", "504", "529", "decommission",
                      "rate limit", "límite de uso", "sobrecargado", "caído",
                      "timeout", "timed out", "max retries", "connection",
                      "temporarily", "unavailable", "overloaded", "401", "403",
                      "capacity", "not found", "does not exist")

    def _is_failover(s, err):
        e = str(err).lower()
        return any(h in e for h in s.FAILOVER_HINTS)

    # modelo RÁPIDO y confiable por proveedor para el failover (evita razonadores
    # lentos como glm-5.2 al saltar: queremos que responda YA, no que piense 40s)
    # proveedores que NO son de chat (solo medios): nunca entran en la cadena
    # de failover ni se ofrecen como modelo del agente
    MEDIA_ONLY = {"ltx", "fal", "higgsfield", "replicate"}

    FAST_MODEL = {
        "groq": "openai/gpt-oss-120b",
        "nvidia": "meta/llama-3.3-70b-instruct",
        "deepseek": "deepseek-v4-flash",
        "siliconflow": "deepseek-ai/DeepSeek-V3",
        "openai": "gpt-4o-mini",
        "qwen": "qwen-plus",
        "stepfun": "step-3.5-flash",
        "glm": "glm-4-flash",
        "xai": "grok-2",
        "digitalocean": "llama3.3-70b-instruct",
        "gemini": "gemini-2.5-flash",
        "openrouter": "google/gemini-2.5-flash-preview",
        "huggingface": "meta-llama/Llama-3.1-8B-Instruct:fastest",
    }
    # modelo de VISIÓN rápido por proveedor (multimodal: texto+imagen)
    # usado por ask_model cuando se adjunta una imagen. Si no está listado,
    # se usa el FAST_MODEL normal (que puede o no soportar imágenes).
    VISION_MODEL = {
        "digitalocean": "nemotron-nano-12b-v2-vl",
        "gemini": "gemini-2.5-flash",
        "openrouter": "google/gemini-2.5-flash-preview",
    }

    def _chain(s):
        """Cadena de failover: (proveedor, modelo). El activo usa el modelo que
        eligió el usuario; los de respaldo usan su modelo RÁPIDO conocido. Termina
        en Ollama local (custom) que no tiene límites de cupo  siempre responde.
        
        El orden de prioridad se puede configurar en   failover_order. Si no,
        usa el orden por defecto (deepseek  siliconflow  nvidia  ...  custom)."""
        provs = s.cfg.data.get("providers", {})
        active = s.cfg.get_active_provider()
        # Orden configurable por el usuario (); si no, el default histórico
        pref = s.cfg.data.get("failover_order") or [
            "deepseek", "siliconflow", "nvidia", "groq", "gemini", "openai",
            "anthropic", "qwen", "stepfun", "glm", "xai", "openrouter", "huggingface",
            "digitalocean", "agnes", "aimlapi", "custom"]
        rest = sorted((p for p in provs if p != active and p not in s.MEDIA_ONLY),
                      key=lambda p: pref.index(p) if p in pref else 99)
        # ¿Ollama está realmente corriendo? Si NO, no lo metemos como respaldo:
        # antes la cadena caía SIEMPRE en custom y, con Ollama apagado, moría con
        # "connection refused" en localhost:11434 en vez de dar un error útil.
        ollama_up = bool(s._ollama) or bool(s.ollama_models())
        chain = []
        for i, name in enumerate([active] + rest):
            if name in s.MEDIA_ONLY:   # ltx & cía no chatean
                continue
            d = provs.get(name, {})
            if name == "custom":
                # custom (Ollama): solo como respaldo si está corriendo. Si el
                # usuario lo eligió explícitamente (activo, i==0) lo dejamos igual
                # para que el error sea claro ("Ollama no responde").
                if not ollama_up and i != 0:
                    continue
            elif not d.get("api_key") and not (i == 0 and is_custom_provider(name)):
                continue
            if i == 0:
                model = d.get("model") or None            # respeta la elección del usuario
            elif name == "custom":
                # Ollama local: usar un modelo REALMENTE instalado (detectado)
                model = (s._ollama[0] if s._ollama else None) or d.get("model") or None
            else:
                model = d.get("model") or s.FAST_MODEL.get(name) or None
            chain.append((name, model))
        return chain

    def _mk_provider(s, name, model=None):
        d = s.cfg.data.get("providers", {}).get(name, {})
        kw = {"model": model or d.get("model") or None}
        if d.get("base_url"):
            kw["base_url"] = d["base_url"]
        if name == "cloudflare":
            kw["account_id"] = d.get("account_id", "")
        return get_provider(name, api_key=d.get("api_key", ""), **kw)

    def _ask_model(s, provider, prompt, model="", image=""):
        """Delegación: corre `prompt` en OTRO proveedor/modelo (one-shot, sin
        herramientas) y devuelve su texto. Opcionalmente incluye una imagen
        (ruta en el workspace) para análisis multimodal (visión).
        Permite que el modelo activo derive subtareas simples a uno barato/rápido
        y use el resultado."""
        import base64, os
        provider = (provider or "").strip().lower()
        prompt = prompt or ""
        if not provider or not prompt:
            return " ask_model necesita {provider, prompt}."
        provs = s.cfg.data.get("providers", {})
        if provider not in provs:
            avail = ", ".join(p for p in provs if p not in s.MEDIA_ONLY)
            return f" Proveedor '{provider}' no existe. Disponibles: {avail}."
        if provider in s.MEDIA_ONLY:
            return f" '{provider}' es de medios (video), no sirve para chat."
        d = provs[provider]
        if not (d.get("api_key") or provider == "custom"):
            return f" '{provider}' no tiene API key configurada ( para cargarla)."
        model = (model or "").strip() or s.FAST_MODEL.get(provider) or d.get("model") or None
        # Si hay imagen, usar modelo de visión si está configurado
        if image and provider in s.VISION_MODEL:
            model = s.VISION_MODEL[provider]
        try:
            p = s._mk_provider(provider, model)
            # Construir mensaje: con o sin imagen
            if image:
                img_path = Path(s._base()) / image if not os.path.isabs(image) else Path(image)
                if not img_path.exists():
                    img_path = Path(image)
                if img_path.exists():
                    raw = img_path.read_bytes()
                    b64 = base64.b64encode(raw).decode("utf-8")
                    mime = "image/png" if img_path.suffix.lower() in (".png",) else "image/jpeg"
                    content = [
                        {"type": "text", "text": prompt},
                        {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}}
                    ]
                else:
                    content = prompt  # imagen no encontrada, mandar solo texto
            else:
                content = prompt
            messages = [{"role": "user", "content": content}]
            r = p.chat(messages, temperature=0.3, max_tokens=2048)
            txt = re.sub(r"<think>.*?</think>", "", r.content or "", flags=re.DOTALL).strip()
            used = f"{provider}·{model or p.model}"
            s._push("sys", f" Delegué a {used}" + (" (con imagen)" if image else ""))
            return f" Respuesta de {used}:\n{txt[:4000]}" if txt else f" {used} no devolvió texto"
        except Exception as e:
            return (f" ask_model {provider} falló: {str(e)[:200]}. "
                    "Probá otro proveedor o hacelo vos.")

    def _anim(s, action, params):
        """Puente al motor de animación 2D (tools/animation + low_anim.AnimationAPI).
        Mantiene el proyecto vivo en s._anim_api entre tool-calls del turno, guarda
        en el workspace y avisa al frontend (wrote) para refrescar árbol/artefactos."""
        params = params or {}
        try:
            import low_anim
        except Exception as e:
            return f" Motor de animación no disponible: {e}"
        api = getattr(s, "_anim_api", None)
        if api is None:
            api = s._anim_api = low_anim.AnimationAPI()
        base = s._base()

        def _f(k):   # float opcional
            v = params.get(k)
            return None if v is None else float(v)

        def _save():
            """Persiste el proyecto a disco para que persista entre tool-calls."""
            if api.current_scene:
                api.save_project(str(base / api.current_scene.name))
        try:
            if action == "new":
                name = (params.get("name") or "anim").strip() or "anim"
                api.create_project(name, int(params.get("width", 1020)),
                                   int(params.get("height", 1080)),
                                   int(params.get("fps", 24)),
                                   int(params.get("duration", 240)))
                proj = base / name
                api.save_project(str(proj))
                s._push("wrote", {"path": str(proj / "scene.json")})
                return (f" Proyecto de animación '{name}' creado en {name}/ "
                        "(scene.json, timeline.json, comp.json). Ahora agregá actores "
                        "con action='add_actor'.")
            if not api.current_scene:
                return " Primero creá un proyecto con action='new'."
            if action == "add_actor":
                svg = params.get("svg", "") or ""
                sp = params.get("svg_path") or params.get("path")
                if sp:
                    p = Path(sp) if os.path.isabs(sp) else base / sp
                    if p.exists():
                        svg = p.read_text(encoding="utf-8", errors="replace")
                    else:
                        return f" No existe el SVG: {sp}"
                nm = params.get("name") or "actor"
                api.add_actor(params.get("layer", "main"), nm, svg,
                              float(params.get("x", 0)), float(params.get("y", 0)))
                return f" Actor '{nm}' agregado a la capa '{params.get('layer', 'main')}'."
            if action == "keyframe":
                actor = params.get("actor", "")
                api.add_keyframe(actor, int(params.get("frame", 0)),
                                 x=_f("x"), y=_f("y"), rotation=_f("rotation"),
                                 scale_x=_f("scale_x"), scale_y=_f("scale_y"),
                                 skew_x=_f("skew_x"), skew_y=_f("skew_y"),
                                 opacity=_f("opacity"),
                                 label=str(params.get("label", "") or ""),
                                 hold=bool(params.get("hold", False)),
                                 ease_in=_f("ease_in") or 0.0,
                                 ease_out=_f("ease_out") or 0.0)
                _save()
                return f" Keyframe en frame {params.get('frame', 0)} para '{actor}'."
            if action == "walk_cycle":
                actor = params.get("actor", "")
                api.generate_walk_cycle(actor, int(params.get("start", 0)),
                                        int(params.get("duration", 24)))
                _save()
                return f" Ciclo de caminata generado para '{actor}'."
            if action == "set_frame":
                f = api.set_frame(int(params.get("frame", 0)))
                return f" Playhead en frame {f}."
            if action == "get_frame_info":
                return json.dumps(api.get_frame_info(int(params.get("frame", 0))),
                                  ensure_ascii=False)
            if action == "list_actors":
                return json.dumps(api.list_actors(), ensure_ascii=False)
            if action == "list_keyframes":
                kfs = api.list_keyframes(params.get("actor", ""))
                return f" Keyframes de '{params.get('actor', '')}': {kfs}"
            if action == "copy_frame":
                n = api.copy_frame(int(params.get("src", 0)), int(params.get("dst", 0)),
                                   params.get("actor") or None)
                _save()
                return f" Copiado el frame {params.get('src')} → {params.get('dst')} ({n} actor/es)."
            if action == "delete_keyframe":
                ok = api.delete_keyframe(params.get("actor", ""), int(params.get("frame", 0)))
                _save()
                return f" Keyframe {'eliminado' if ok else 'no encontrado'}."
            if action == "interpolate":
                n = api.interpolate(params.get("actor", ""),
                                    int(params.get("from", 0)), int(params.get("to", 0)))
                _save()
                return f" Interpolación bakeada: {n} keyframe(s) intermedio(s)."
            if action == "add_marker":
                m = api.add_marker(int(params.get("frame", 0)), str(params.get("label", "") or ""))
                _save()
                return f" Marcador: {m}"
            if action == "timeline_summary":
                return json.dumps(api.timeline_summary(), ensure_ascii=False)
            if action in ("render", "export"):
                fmt = params.get("format", "mp4")
                rel = params.get("output") or f"anim/{(api.current_scene.name or 'anim')}.{fmt}"
                out = base / rel
                out.parent.mkdir(parents=True, exist_ok=True)
                api.export(str(out), format=fmt, preset=params.get("preset", "hd"))
                s._push("wrote", {"path": str(out)})
                return f" Exportado: {rel}"
            if action == "storyboard":
                from tools.animation.ai_pipeline import StoryboardAI
                scenes = StoryboardAI().parse_script(params.get("script", "") or "")
                return (f"[Storyboard] Storyboard: {len(scenes)} escena(s).\n"
                        + json.dumps(scenes, ensure_ascii=False)[:1800])
            return (" Acción desconocida. Usá: new, add_actor, keyframe, walk_cycle, "
                    "render, storyboard, set_frame, get_frame_info, list_actors, "
                    "list_keyframes, copy_frame, delete_keyframe, interpolate, "
                    "add_marker, timeline_summary.")
        except Exception as e:
            return f" anim {action}: {e}"

    @staticmethod
    def _arg_path(args):
        """Ruta desde los args de una tool, tolerando alias comunes que el modelo
        a veces usa (file/filename/filepath) en vez de 'path'."""
        for k in ("path", "file", "filename", "filepath", "file_path"):
            v = args.get(k)
            if v:
                return str(v).strip()
        return ""

    # ── servidores SSH guardados ──────────────────────────
    def _resolve_ssh(s, alias_or_target):
        """Devuelve (target, key, port). Si 'alias_or_target' coincide con un
        servidor guardado (config ssh_hosts), usa sus datos; si no, lo trata
        como 'usuario@ip' directo."""
        alias_or_target = (alias_or_target or "").strip()
        for h in s.cfg.data.get("ssh_hosts", []):
            if h.get("name") == alias_or_target:
                user = (h.get("user") or "").strip()
                host = (h.get("host") or "").strip()
                target = f"{user}@{host}" if user else host
                return target, (h.get("key") or "").strip(), h.get("port")
        return alias_or_target, "", None

    @staticmethod
    def _ssh_base(target, key, port):
        parts = ["ssh", "-o", "StrictHostKeyChecking=accept-new",
                 "-o", "ConnectTimeout=15", "-o", "BatchMode=yes"]
        if port:
            parts += ["-p", str(port)]
        if key:
            parts += ["-i", key]
        parts.append(target)
        return parts

    def save_ssh_hosts(s, hosts):
        """Guarda la lista de servidores SSH (). Cada uno: name, user, host, port, key."""
        clean = []
        for h in (hosts or []):
            name = (h.get("name") or "").strip()
            host = (h.get("host") or "").strip()
            if not name or not host:
                continue
            clean.append({"name": name, "user": (h.get("user") or "").strip(),
                          "host": host, "port": h.get("port") or "",
                          "key": (h.get("key") or "").strip()})
        s.cfg.data["ssh_hosts"] = clean
        s.cfg.save()
        return {"ssh_hosts": clean}

    # ── redes sociales (módulo social/) ────────────────────────────
    # La autorización SIEMPRE se hace desde acá (  Redes Sociales): LOW abre
    # el navegador y recibe el token por callback local. Tokens cifrados (DPAPI).
    def _social(s):
        import social.service as svc
        if not getattr(s, "_social_sched", False):
            s._social_sched = True
            try:
                svc.start_scheduler(s._social_ask,
                                    lambda m: s._push("sys", m))
            except Exception as e:
                log(f"social scheduler: {e}")
        return svc

    def _social_ask(s, system, user):
        """LLM one-shot para el validador de marca: usa la cadena de failover."""
        for name, model in s._chain():
            try:
                p = s._mk_provider(name, model)
                r = p.chat([{"role": "user", "content": user}],
                           system_prompt=system, temperature=0.2, max_tokens=1500)
                if r.content:
                    return r.content
            except Exception:
                continue
        raise RuntimeError("ningún proveedor de IA respondió — configurá una "
                           "API key en ")

    def social_state(s):
        try:
            return s._social().state()
        except Exception as e:
            return {"error": str(e)[:300], "platforms": []}

    def social_connect(s, platform, client_id="", client_secret=""):
        """Corre el OAuth desde LOW (bloquea hasta que el usuario autoriza en
        el navegador). client_id/secret = la app del usuario en esa plataforma."""
        try:
            return s._social().connect(platform, client_id or "", client_secret or "")
        except Exception as e:
            return {"error": str(e)[:300]}

    def social_disconnect(s, platform):
        try:
            s._social().disconnect(platform)
            return {"ok": True}
        except Exception as e:
            return {"error": str(e)[:300]}

    def social_save_brand(s, profile_json):
        try:
            return {"ok": True, "profile": s._social().save_brand(profile_json)}
        except Exception as e:
            return {"error": str(e)[:300]}

    def social_save_brand_guide(s, text):
        try:
            s._social().set_brand_guide(text or "")
            return {"ok": True}
        except Exception as e:
            return {"error": str(e)[:300]}

    def social_sync_templates(s):
        try:
            return {"ok": True, "templates": s._social().sync_templates()}
        except Exception as e:
            return {"error": str(e)[:300]}

    def social_publish_now(s, qid):
        try:
            svc = s._social()
            return {"msg": svc.process_item(int(qid), s._social_ask,
                                            lambda m: s._push("sys", m))}
        except Exception as e:
            return {"error": str(e)[:300]}

    def social_enqueue(s, network, content, template_id="", schedule_at=""):
        """Encola un post desde el panel de Redes ([Post]). schedule_at ISO
        vacío = queda listo para publicar ya (draft con fecha now)."""
        try:
            qid = s._social().enqueue(network or "", content or "",
                                      template_id=template_id or "",
                                      scheduled_at=(schedule_at or "").strip())
            return {"ok": True, "qid": qid}
        except Exception as e:
            return {"error": str(e)[:300]}

    def social_queue_delete(s, qid):
        try:
            s._social().queue_delete(int(qid))
            return {"ok": True}
        except Exception as e:
            return {"error": str(e)[:300]}

    # ── sistema de automejora ──
    def get_diagnostic_report(s):
        """Genera un reporte de diagnóstico del sistema."""
        return s._self_improvement.get_diagnostic_report()

    DIAG_LOG_TOPE = 2 * 1024 * 1024      # 2 MB: sobran para diagnosticar una sesion

    def save_tablet_log(s, text):
        """Guarda el log de diagnostico de tableta, con un TOPE.

        El diagnostico de tableta escribe un renglon por evento de puntero, y
        esto solo hacia `append`. Medido en la maquina de Mauro: 23 MB desde
        agosto, creciendo sin techo dentro de %APPDATA%. Un log que nadie vacia
        deja de ser diagnostico y pasa a ser basura que ocupa disco, y abrirlo
        para ver los ultimos eventos se vuelve incomodo.

        Pasado el tope se conserva la ULTIMA mitad: para diagnosticar sirve lo
        ultimo que paso, no lo de hace dos meses.
        """
        import datetime
        p = data_dir() / 'diag-log.txt'
        ts = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        try:
            if p.exists() and p.stat().st_size > s.DIAG_LOG_TOPE:
                cola = p.read_bytes()[-(s.DIAG_LOG_TOPE // 2):]
                corte = cola.find(b"\n")
                p.write_bytes(b"-- recortado: se conservan los ultimos eventos --\n"
                              + (cola[corte + 1:] if corte >= 0 else cola))
        except OSError:
            pass                              # recortar es una mejora, no un requisito
        with open(p, 'a', encoding='utf-8') as f:
            f.write(f"== {ts} ==\n{text}\n\n")
        return f"ok {p}"

    def open_tablet_diag(s):
        """Abre el diagnóstico de tableta en el navegador externo."""
        import sys as _sys
        base = getattr(_sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
        diag = os.path.join(base, "ui", "diag-tablet.html")
        webbrowser.open(diag)
        return {"ok": True}

    # ── API de animación (bridge al motor Python) ──────────
    def anim_init(s, name="animacion", width=1920, height=1080, fps=24, duration=240):
        """Inicializa el motor de animación para el workspace actual."""
        if not s.ws:
            return {"error": "Abrí un proyecto primero"}
        if AnimationAPI is None:
            return {"error": "motor de animación no disponible (instalá numpy)"}
        try:
            s._anim = AnimationAPI()
            s._anim.create_project(name, width, height, fps, duration)
            return {"ok": True, "name": name, "fps": fps, "duration": duration}
        except Exception as e:
            return {"error": str(e)}

    def anim_add_actor(s, layer_name, actor_name, svg_content="", x=0, y=0):
        """Añade un actor a la escena de animación."""
        if not s._anim or not s._anim.current_scene:
            return {"error": "Inicializá la animación primero (anim_init)"}
        try:
            actor = s._anim.add_actor(layer_name, actor_name, svg_content, x, y)
            return {"ok": True, "name": actor.name, "svg_id": actor.svg_id}
        except Exception as e:
            return {"error": str(e)}

    def anim_add_keyframe(s, actor_name, frame, x=None, y=None, rotation=None,
                          scale_x=None, scale_y=None, opacity=None):
        """Añade un keyframe a un actor."""
        if not s._anim:
            return {"error": "animación no inicializada"}
        try:
            s._anim.add_keyframe(actor_name, frame, x=x, y=y, rotation=rotation,
                                 scale_x=scale_x, scale_y=scale_y, opacity=opacity)
            return {"ok": True, "actor": actor_name, "frame": frame}
        except Exception as e:
            return {"error": str(e)}

    def anim_render_frame(s, frame):
        """Renderiza un frame a SVG string."""
        if not s._anim or not s._anim.current_engine:
            return {"error": "animación no inicializada"}
        try:
            svg = s._anim.render_frame(frame)
            return {"svg": svg, "frame": frame}
        except Exception as e:
            return {"error": str(e)}

    def anim_generate_walk_cycle(s, actor_name, start_frame=0, duration=24):
        """Genera un ciclo de caminata automático para un actor."""
        if not s._anim:
            return {"error": "animación no inicializada"}
        try:
            s._anim.generate_walk_cycle(actor_name, start_frame, duration)
            return {"ok": True, "actor": actor_name, "start": start_frame, "duration": duration}
        except Exception as e:
            return {"error": str(e)}

    def anim_get_scene_assets(s, description=""):
        """Genera prompts para assets visuales con IA."""
        if not s._anim:
            if AnimationAPI is None:
                return {"error": "motor de animación no disponible (instalá numpy)"}
            s._anim = AnimationAPI()
        try:
            prompts = s._anim.generate_scene_assets(description or "cartoon character")
            return {"prompts": prompts}
        except Exception as e:
            return {"error": str(e)}

    def anim_save(s, folder=None):
        """Guarda el proyecto de animación completo."""
        if not s._anim:
            return {"error": "nada para guardar"}
        try:
            dest = folder or (Path(s.ws) / "anim")
            s._anim.save_project(str(dest))
            return {"ok": True, "path": str(dest)}
        except Exception as e:
            return {"error": str(e)}

    def anim_load(s, folder=None):
        """Carga un proyecto de animación."""
        if not s.ws:
            return {"error": "Abrí un proyecto primero"}
        if AnimationAPI is None:
            return {"error": "motor de animación no disponible (instalá numpy)"}
        try:
            src = folder or (Path(s.ws) / "anim")
            s._anim = AnimationAPI()
            s._anim.load_project(str(src))
            sc = s._anim.current_scene
            return {"ok": True, "name": sc.name if sc else "", "fps": sc.fps if sc else 24}
        except Exception as e:
            return {"error": str(e)}

    def anim_xsheet(s):
        """Devuelve datos para la X-sheet (planilla de exposición)."""
        if not s._anim or not s._anim.current_scene:
            return {"error": "animación no inicializada"}
        try:
            sc = s._anim.current_scene
            actors = sc.get_all_actors()
            rows = []
            total = sc.duration
            for f in range(total):
                row = {"frame": f + 1}
                for a in actors:
                    kf = a.get_state_at(f)
                    if kf and kf[0]:
                        row[a.name] = {
                            "x": round(kf[0].x, 1),
                            "y": round(kf[0].y, 1),
                            "rot": round(kf[0].rotation, 1),
                            "scl": round(kf[0].scale_x, 2),
                        }
                rows.append(row)
            return {"rows": rows, "actors": [a.name for a in actors], "total": total}
        except Exception as e:
            return {"error": str(e)}

    def anim_export_video(s, output_path, scene_id=None, preset="hd"):
        """Exporta la animación a video MP4."""
        if not s._anim:
            return {"error": "animación no inicializada"}
        try:
            result = s._anim.export(output_path, preset=preset)
            return {"ok": True, "result": str(result)}
        except Exception as e:
            return {"error": str(e)}

    def get_optimization_suggestions(s):
        """Obtiene sugerencias de optimización basadas en análisis."""
        return {"suggestions": s._self_improvement.get_optimization_suggestions()}

    def get_best_model(s, provider=None):
        """Recomienda el mejor modelo basado en métricas de rendimiento."""
        best = s._self_improvement.get_best_model(provider)
        if best:
            return {"provider": best[0], "model": best[1]}
        return {"error": "No hay suficientes datos para recomendar un modelo"}

    def auto_optimize_config(s):
        """Optimiza automáticamente la configuración del agente."""
        current = s.cfg.data.get("agent", {})
        optimized = s._self_improvement.auto_optimize_agent_config(current)
        s.cfg.data["agent"] = optimized
        s.cfg.save()
        return {"config": optimized, "applied": True}

    # ── agente ────────────────────────────────────────────
    def _get_tools(s):
        return [
            PLAN_TOOL,
            {"type": "function", "function": {"name": "read_file", "description": "Lee un archivo (ruta relativa al workspace O absoluta). Para archivos grandes leelo por partes con start_line y max_lines; si la salida avisa que hay mas, segui desde el start_line que indica.", "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "start_line": {"type": "integer", "description": "linea inicial, 1 = principio"}, "max_lines": {"type": "integer", "description": "cuantas lineas leer; 0 = hasta el final o el tope"}}, "required": ["path"]}}},
            {"type": "function", "function": {"name": "write_file", "description": "Escribe archivo COMPLETO (crea o reemplaza todo el contenido). Para archivos existentes grandes preferi edit_file.", "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "content": {"type": "string"}}, "required": ["path", "content"]}}},
            {"type": "function", "function": {"name": "edit_file", "description": "Reemplaza un fragmento de un archivo existente sin reescribir el resto (PREFERILO sobre write_file en archivos que ya existen). old_text tiene que identificar UNA SOLA parte del archivo; copialo de un read_file previo — la indentación exacta ayuda pero se tolera alguna diferencia de espacios. Para varios cambios en el mismo archivo, mandá edits:[{old_text,new_text},...] en UNA sola llamada en vez de muchas. Si da ' No encontré ese texto', te devuelve las líneas reales del archivo: copiá el old_text de ahí, no reintentes a ciegas.", "parameters": {"type": "object", "properties": {"path": {"type": "string"}, "old_text": {"type": "string"}, "new_text": {"type": "string"}, "edits": {"type": "array", "description": "opcional: varios reemplazos en este archivo, cada uno {old_text,new_text}", "items": {"type": "object", "properties": {"old_text": {"type": "string"}, "new_text": {"type": "string"}}}}}, "required": ["path"]}}},
            {"type": "function", "function": {"name": "exec_cmd", "description": "Ejecuta comando shell", "parameters": {"type": "object", "properties": {"command": {"type": "string"}}, "required": ["command"]}}},
            {"type": "function", "function": {"name": "run_code", "description": "Corre codigo del editor", "parameters": {"type": "object", "properties": {"language": {"type": "string"}}, "required": ["language"]}}},
            {"type": "function", "function": {"name": "list_files", "description": "Lista archivos del workspace", "parameters": {"type": "object", "properties": {"path": {"type": "string"}}}}},
            {"type": "function", "function": {"name": "search_code", "description": "Busca texto/regex en los archivos del proyecto y devuelve archivo:linea:coincidencia. Usalo para ubicar funciones o usos antes de editar.", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
            {"type": "function", "function": {"name": "git", "description": "Ejecuta un comando git EN EL WORKSPACE (status, add, commit, push, pull, log, diff, branch, clone, remote, init...). Para SUBIR A GITHUB: 'add -A' -> 'commit -m \"mensaje\"' -> 'push'. Si el repo no existe aun podes usar exec_cmd con 'gh repo create' (gh CLI ya esta autenticado). No hace falta pedir permiso.", "parameters": {"type": "object", "properties": {"args": {"type": "string", "description": "argumentos de git, ej: commit -m \"fix login\""}}, "required": ["args"]}}},
            {"type": "function", "function": {"name": "ssh_exec", "description": "Ejecuta un comando en un servidor remoto por SSH y devuelve stdout/stderr. 'host' puede ser un ALIAS guardado (ver lista de servidores) o 'usuario@ip' directo. Usalo para administrar servidores, desplegar, revisar logs, etc.", "parameters": {"type": "object", "properties": {"host": {"type": "string", "description": "alias guardado o usuario@ip"}, "command": {"type": "string"}}, "required": ["host", "command"]}}},
            {"type": "function", "function": {"name": "scp_upload", "description": "Sube un archivo o carpeta local a un servidor remoto por scp. 'host' = alias guardado o usuario@ip.", "parameters": {"type": "object", "properties": {"host": {"type": "string"}, "local": {"type": "string", "description": "ruta local (relativa al workspace o absoluta)"}, "remote": {"type": "string", "description": "ruta destino en el servidor"}}, "required": ["host", "local", "remote"]}}},
            {"type": "function", "function": {"name": "generate_image", "description": "Genera una imagen a partir de una descripcion (DALL-E de OpenAI, o SiliconFlow si no hay key de OpenAI) y la guarda en el workspace. Requiere API key de OpenAI o SiliconFlow cargada en Configuracion.", "parameters": {"type": "object", "properties": {"prompt": {"type": "string", "description": "descripcion de la imagen a generar, en ingles da mejor resultado"}, "path": {"type": "string", "description": "ruta donde guardarla dentro del workspace, ej assets/logo.png. Si se omite usa assets/img_<fecha>.png"}, "size": {"type": "string", "description": "tamano, ej 1024x1024 (default) — no todos los tamanos existen en todos los proveedores"}, "seed": {"type": "integer", "description": "semilla: mismo seed + mismo prompt = misma imagen. Usalo para iterar con precision (cambiar UNA cosa manteniendo el resto)"}}, "required": ["prompt"]}}},
            {"type": "function", "function": {"name": "refine_image", "description": "REFINA una imagen existente al estilo Magnific: aumenta micro-detalle, nitidez y fidelidad de texturas SIN cambiar composición ni estilo. Opcionalmente un foco ('la cara', 'el fondo'). Guarda una versión _hd al lado. Ideal como paso final antes de publicar.", "parameters": {"type": "object", "properties": {"path": {"type": "string", "description": "ruta a la imagen"}, "focus": {"type": "string", "description": "en qué enfocar el refinado (opcional)"}}, "required": ["path"]}}},
            {"type": "function", "function": {"name": "remember", "description": "Guarda un HECHO DURABLE de ESTE proyecto en la memoria del workspace (.fidel/memoria.md) para tenerlo en futuras sesiones: stack y versiones, comandos de build/test/deploy, servidores y rutas, convenciones de código, decisiones tomadas. Usalo cuando descubras algo del proyecto que valga la pena recordar. NO lo uses para cosas triviales o de un solo uso.", "parameters": {"type": "object", "properties": {"note": {"type": "string", "description": "el hecho a recordar, en una frase concreta"}}, "required": ["note"]}}},
            {"type": "function", "function": {"name": "save_character", "description": "Guarda la FICHA DE PERSONAJE (hoja de modelo) del proyecto. La ficha se inyecta AUTOMATICAMENTE en todos los prompts de generate_image/edit_image/animate_image/generate_video que mencionen al personaje — es el ancla para que NO cambie de aspecto entre imagenes y videos. Usala apenas se defina un personaje (o cuando el usuario apruebe un diseno) y actualizala si el diseno evoluciona. La descripcion en INGLES da mejor resultado con los modelos generativos.", "parameters": {"type": "object", "properties": {"name": {"type": "string", "description": "nombre corto del personaje, ej 'Rita'"}, "description": {"type": "string", "description": "hoja de modelo COMPLETA y concreta en ingles: especie/edad, forma de cara y cuerpo, proporciones (ej 'large round head, small body, 3-heads tall'), pelo, ojos, piel/pelaje con COLORES EXACTOS (hex si aplica), ropa detallada, accesorios, estilo de dibujo (ej 'flat vector, thick outlines'). Todo lo que no quieras que cambie."}}, "required": ["name", "description"]}}},
            {"type": "function", "function": {"name": "check_design", "description": "VE un archivo .svg: lo rasteriza y lo revisa con un modelo de visión, devolviendo qué está visualmente mal o mejorable (proporciones, alineación, elementos fuera del lienzo, texto desbordado, colores). Usalo DESPUÉS de escribir un SVG para no dibujar a ciegas — corregí según la devolución y volvé a chequear.", "parameters": {"type": "object", "properties": {"path": {"type": "string", "description": "ruta al .svg a revisar"}}, "required": ["path"]}}},
            {"type": "function", "function": {"name": "social_export", "description": "Genera versiones de una imagen/diseño (png/jpg/svg) en el TAMAÑO EXACTO de cada red social, con recorte centrado, y las guarda en social/. Plataformas: instagram_post (1080x1080), instagram_story (1080x1920), facebook_post (1200x630), x_post (1600x900), linkedin_post (1200x627), tiktok, youtube_thumbnail, pinterest, whatsapp_status; o alias instagram/facebook/x/linkedin/youtube; o 'all'. El COPY y los hashtags escribilos vos aparte en social/post.md.", "parameters": {"type": "object", "properties": {"image": {"type": "string", "description": "ruta a la imagen/diseño fuente"}, "platforms": {"type": "array", "items": {"type": "string"}, "description": "lista de plataformas o formatos; default ['all']"}}, "required": ["image"]}}},
            {"type": "function", "function": {"name": "write_doc", "description": "Crea un DOCUMENTO Word (.docx) real, que se abre en Word/LibreOffice/Google Docs. El contenido va en markdown simple: # titulo, ## subtitulo, - viñetas, **negrita**, y párrafos separados por línea en blanco. Usalo cuando pidan un documento de texto, informe, carta, presupuesto, etc.", "parameters": {"type": "object", "properties": {"path": {"type": "string", "description": "ruta destino, ej docs/informe.docx"}, "content": {"type": "string", "description": "contenido en markdown simple"}}, "required": ["path", "content"]}}},
            {"type": "function", "function": {"name": "edit_image", "description": "EDITA una imagen existente (png/jpg/webp) con IA según un pedido en lenguaje natural (ej: 'cambiá el fondo a azul', 'sacale el texto', 'convertila en acuarela'). Guarda una VERSIÓN nueva al lado (no pisa la original). Requiere key de SiliconFlow.", "parameters": {"type": "object", "properties": {"path": {"type": "string", "description": "ruta a la imagen a editar"}, "prompt": {"type": "string", "description": "qué cambiar, concreto"}}, "required": ["path", "prompt"]}}},
            {"type": "function", "function": {"name": "animate_image", "description": "ANIMA una imagen existente (png/jpg): imagenvideo que MANTIENE el estilo del cuadro. Usa LTX-2.3 si hay key (rápido, CON audio generado, hasta 20s) y si no Wan 2.2 en SiliconFlow (~5s, 2-4 min). Ideal para storyboard/animatic: describí el movimiento ('zoom lento hacia la cara', 'las hojas se mueven con el viento', 'la cámara recorre de izquierda a derecha'). Guarda un .mp4 al lado.", "parameters": {"type": "object", "properties": {"image": {"type": "string", "description": "ruta a la imagen a animar"}, "prompt": {"type": "string", "description": "qué movimiento/acción debe tener"}}, "required": ["image", "prompt"]}}},
            {"type": "function", "function": {"name": "generate_video", "description": "Genera un VIDEO desde una descripción de texto. Usa LTX-2.3 si hay key (rápido, CON audio, hasta 20s) y si no Wan 2.2 T2V (~5s, 2-4 min). Para mantener estilo entre planos de un storyboard preferí animate_image sobre un cuadro ya diseñado. Guarda un .mp4.", "parameters": {"type": "object", "properties": {"prompt": {"type": "string", "description": "escena, estilo y movimiento de cámara"}, "path": {"type": "string", "description": "ruta destino, ej video/plano01.mp4 (opcional)"}}, "required": ["prompt"]}}},
            {"type": "function", "function": {"name": "social_publish", "description": "PUBLICA (o programa) contenido en una red social conectada (  Redes Sociales): instagram, facebook, linkedin, x, tiktok. LOW valida el copy contra la IDENTIDAD DE MARCA cargada (tono, palabras prohibidas, hashtags) ANTES de publicar — si la viola de forma no corregible, se rechaza. La pieza gráfica sale de: un template de Canva ('template_id' + el copy, LOW rellena y exporta), o una imagen/video local del workspace ('asset'). 'schedule_at' (YYYY-MM-DD HH:MM, hora local) la programa; sin schedule_at publica YA. Antes de usarla podés ver qué hay conectado con social_status.", "parameters": {"type": "object", "properties": {"network": {"type": "string", "description": "instagram | facebook | linkedin | x | tiktok"}, "content": {"type": "string", "description": "el copy/idea del post — LOW lo valida y adapta a la marca y a los límites de la red"}, "template_id": {"type": "string", "description": "ID de un Brand Template de Canva (ver social_status) para generar la gráfica"}, "asset": {"type": "string", "description": "ruta a imagen/video del workspace si no usás template de Canva"}, "schedule_at": {"type": "string", "description": "cuándo publicar, 'YYYY-MM-DD HH:MM' (opcional; vacío = ahora)"}}, "required": ["network", "content"]}}},
            {"type": "function", "function": {"name": "social_status", "description": "Muestra el estado del módulo de redes: cuentas conectadas, templates de Canva disponibles (con sus placeholders), identidad de marca cargada y la cola de publicaciones (pendientes/publicadas/fallidas). Usala antes de social_publish.", "parameters": {"type": "object", "properties": {}}}},
            {"type": "function", "function": {"name": "web_search", "description": "Busca en internet (DuckDuckGo, sin API key) y devuelve los primeros resultados con título, URL y resumen. Usalo para info actual, documentación, precios, noticias, etc. Después podés leer una URL con web_fetch.", "parameters": {"type": "object", "properties": {"query": {"type": "string"}}, "required": ["query"]}}},
            {"type": "function", "function": {"name": "web_fetch", "description": "Descarga una URL y devuelve su texto legible (quita HTML/scripts). Usalo para LEER una página, doc o API pública. Devuelve hasta ~8000 caracteres.", "parameters": {"type": "object", "properties": {"url": {"type": "string"}}, "required": ["url"]}}},
            {"type": "function", "function": {"name": "ask_model", "description": "Delega una SUBTAREA a OTRO modelo para AHORRAR recursos: mandá lo simple/mecánico a uno barato o rápido y reservá el modelo actual (caro) para lo complejo. Devuelve la respuesta de ese modelo como texto para que la uses. 'provider' = uno de los configurados con key (ej. groq, digitalocean, siliconflow, deepseek, glm, qwen, nvidia, custom). 'model' opcional (default: el rápido del proveedor). 'image' (opcional) = ruta a una imagen en el workspace para análisis multimodal (el modelo debe soportar visión). Ideal para: resumir, traducir, reformatear, generar texto trivial, clasificar, listar ideas, boilerplate, y analizar imágenes. NO delegues tareas que necesiten tus otras herramientas (archivos, git, imágenes). Podés hacer varias ask_model en paralelo mental para comparar respuestas.", "parameters": {"type": "object", "properties": {"provider": {"type": "string", "description": "proveedor destino (con key configurada)"}, "prompt": {"type": "string", "description": "la subtarea, autocontenida (incluí todo el contexto que el otro modelo necesita)"}, "model": {"type": "string", "description": "modelo especifico del proveedor (opcional)"}, "image": {"type": "string", "description": "ruta a imagen (png/jpg) en el workspace para análisis multimodal (opcional)"}}, "required": ["provider", "prompt"]}}},
            {"type": "function", "function": {"name": "vectorize", "description": "Convierte una imagen raster del workspace (PNG/JPG) en un SVG VECTORIAL EDITABLE (la 'calca'). Usalo para NO escribir coordenadas SVG a mano (eso sale tosco): parti de una foto, boceto o imagen generada y obtene vectores limpios y editables. 'detail': low|medium|high (mas detalle = mas trazos). Guarda el .svg en el workspace y lo abre en el editor de vectores.", "parameters": {"type": "object", "properties": {"image": {"type": "string", "description": "ruta a la imagen PNG/JPG en el workspace"}, "out": {"type": "string", "description": "ruta .svg destino (opcional)"}, "detail": {"type": "string"}, "mode": {"type": "string", "description": "color (formas por color, default) | lineas (calca SOLO el trazo/tinta — ideal para line-art y bocetos) | contorno (trazos LARGOS y unificados sin puntitos — el mejor para ANIMACION, limpia los fragmentos de vector)"}, "remove_bg": {"type": "boolean", "description": "true: quita el fondo detectado por las esquinas antes de trazar (como la varita de Photoshop)"}, "bg_tol": {"type": "integer", "description": "tolerancia del fondo 4-96 (default 32)"}}, "required": ["image"]}}},
            {"type": "function", "function": {"name": "illustrate", "description": "LA MEJOR forma de crear una ILUSTRACION sofisticada como VECTOR editable: genera un raster de alta calidad con IA (diffusion) desde tu descripcion y lo VECTORIZA a SVG. Evita el SVG tosco escrito a mano — usalo en vez de dibujar paths cuando quieras algo pulido (personajes, escenas, logos con detalle). 'prompt' detallado (estilo, colores, composicion, fondo). 'detail': low|medium|high. Guarda y abre el .svg editable en el editor [Diseno].", "parameters": {"type": "object", "properties": {"prompt": {"type": "string"}, "out": {"type": "string", "description": "ruta .svg destino (opcional)"}, "detail": {"type": "string"}, "size": {"type": "string", "description": "ej 1024x1024"}}, "required": ["prompt"]}}},
            {"type": "function", "function": {"name": "anim", "description": "Estudio de ANIMACION 2D profesional (motor propio de LOW: timeline por tracks, rigging con huesos/IK, compositor de nodos, export MP4/GIF/Lottie). Ideal para ANIMAR los SVG que diseñás. Acciones (campo 'action') con sus 'params': 'new' {name,width,height,fps,duration} crea el proyecto; 'add_actor' {layer,name,svg_path o svg (inline),x,y}; 'keyframe' {actor,frame,x,y,rotation,scale_x,scale_y,skew_x,skew_y,opacity,label,hold,ease_in,ease_out} pone/actualiza un cuadro clave; 'walk_cycle' {actor,start,duration} ciclo de caminata automatico; 'render' {output,format(mp4/gif/png),preset(hd/web/4k/gif)} exporta el video; 'storyboard' {script}; 'set_frame' {frame} mueve el playhead; 'get_frame_info' {frame} estado resuelto de todos los actores en un frame; 'list_actors' {}; 'list_keyframes' {actor}; 'copy_frame' {src,dst,actor?} copia el estado de un frame a otro; 'delete_keyframe' {actor,frame}; 'interpolate' {actor,from,to} bakea keyframes intermedios; 'add_marker' {frame,label}; 'timeline_summary' {} resumen de tracks. Flujo tipico: diseñá el personaje (generate_image/save_character), guardalo como SVG, luego anim new -> add_actor -> keyframe -> render.", "parameters": {"type": "object", "properties": {"action": {"type": "string", "description": "new | add_actor | keyframe | walk_cycle | render | storyboard | set_frame | get_frame_info | list_actors | list_keyframes | copy_frame | delete_keyframe | interpolate | add_marker | timeline_summary"}, "params": {"type": "object", "description": "campos segun la accion (ver descripcion)"}}, "required": ["action"]}}},
        ]

    # tools de imagen/video: peso muerto en tareas de código (~1.4k tokens). El
    # tool gating las omite en sesiones 'code' y las incluye en 'design'.
    _MEDIA_TOOLS = {"generate_image", "refine_image", "edit_image", "animate_image",
                    "generate_video", "social_export", "save_character", "check_design",
                    "anim", "vectorize", "illustrate", "social_publish", "social_status"}
    _DESIGN_RE = re.compile(r"imagen|dibuj|logo|ilustr|dise[ñn]|foto|render|v[ií]deo|video|"
                            r"anima|storyboard|personaje|banner|flyer|afiche|p[oó]ster|"
                            r"social|thumbnail|\bsvg\b|[ií]cono", re.I)

    def _session_tools(s, msg):
        """Tools a enviar este turno. Modo POR SESIÓN (cache estable): 'design'
        incluye imagen/video, 'code' las omite. Se decide en el primer mensaje;
        si una sesión 'code' pide diseño en un turno posterior, sube a 'design'
        para el resto. Config agent.tool_profile: auto (default) | full | code | design."""
        all_tools = s._get_tools()
        prof = (s.cfg.data.get("agent", {}) or {}).get("tool_profile", "auto")
        if prof == "full":
            return all_tools
        design_now = bool(s._DESIGN_RE.search(msg or ""))
        if prof in ("code", "design"):
            mode = prof
        else:
            mode = getattr(s, "_tool_mode", None)
            if mode is None:
                mode = "design" if design_now else "code"
                s._tool_mode = mode
            elif mode == "code" and design_now:
                mode = s._tool_mode = "design"
        if mode == "design":
            return all_tools
        return [t for t in all_tools if t["function"]["name"] not in s._MEDIA_TOOLS]

    # ── helpers de edición robusta / progreso ──────────────────────
    @staticmethod
    def _is_tool_err(res):
        """Indica si una herramienta falló o no produjo avance.

        Antes se comprobaba ``t.startswith("")``. Esa expresión es verdadera
        para *cualquier* texto y hacía que LOW contara incluso una edición o una
        lectura correcta como error; después de 20 llamadas cortaba el turno.
        Los resultados de las tools son texto, así que reconocemos únicamente
        señales de error explícitas y códigos de salida distintos de cero.
        """
        t = str(res or "").strip()
        if not t:
            return True

        # Herramientas que devuelven un objeto JSON (por ejemplo run_code).
        if t.startswith("{"):
            try:
                payload = json.loads(t)
                if isinstance(payload, dict):
                    if payload.get("error"):
                        return True
                    if payload.get("success") is False:
                        return True
            except (json.JSONDecodeError, TypeError):
                pass

        # exec_cmd/git/ssh/scp incluyen el return code en la primera línea.
        exit_match = re.search(r"(?:exit|returncode)\s*=\s*(-?\d+)",
                               t.splitlines()[0], re.IGNORECASE)
        if exit_match:
            return int(exit_match.group(1)) != 0

        low = t.casefold()
        error_prefixes = (
            "ya ejecutaste exactamente esta misma llamada",
            "falta ", "falta'", "faltan ", "no existe", "no encontré",
            "es un directorio", "old_text vacío", "ese texto aparece",
            "el edit no cambió nada", "editor vacio", "editor vacío",
            "error:", "error ", "falló:", "fallo:", "inválido:",
        )
        return low.startswith(error_prefixes)

    @staticmethod
    def _norm_ws(t):
        """Normaliza para comparar ignorando indentación y espacios internos:
        cada línea trim + colapso de runs de espacios."""
        return "\n".join(re.sub(r"[ \t]+", " ", ln.strip()) for ln in t.splitlines())

    @classmethod
    def _find_fuzzy(cls, src, old):
        """Localiza `old` dentro de `src` tolerando diferencias de espacios /
        indentación (el error #1 de los modelos al copiar un fragmento).
        Devuelve (start, end) en caracteres del tramo REAL de src, o None si no
        hay exactamente un candidato. Compara ventana de líneas por _norm_ws."""
        old_lines = old.splitlines()
        win = len(old_lines)
        if win == 0:
            return None
        old_n = cls._norm_ws(old)
        if not old_n.strip():
            return None
        src_lines = src.splitlines(keepends=True)
        offsets, acc = [], 0
        for ln in src_lines:
            offsets.append(acc)
            acc += len(ln)
        offsets.append(acc)
        matches = []
        for i in range(0, len(src_lines) - win + 1):
            chunk = "".join(src_lines[i:i + win])
            if cls._norm_ws(chunk) == old_n:
                matches.append((offsets[i], offsets[i + win]))
                if len(matches) > 1:
                    return None
        return matches[0] if len(matches) == 1 else None

    @classmethod
    def _nearest_hint(cls, src, old, ctx=3):
        """Muestra las líneas del archivo más parecidas al old_text buscado, con
        número de línea, para que el modelo corrija el fragmento en vez de
        reintentar a ciegas (lo que provocaba los bucles)."""
        first = next((ln for ln in old.splitlines() if ln.strip()), "")
        a = set(re.findall(r"\w+", first.lower()))
        if not a:
            return ""
        lines = src.splitlines()
        best_i, best = None, 0
        for i, ln in enumerate(lines):
            sc = len(a & set(re.findall(r"\w+", ln.lower())))
            if sc > best:
                best, best_i = sc, i
        if best_i is None or best == 0:
            return ""
        lo, hi = max(0, best_i - ctx), min(len(lines), best_i + ctx + 1)
        snip = "\n".join(f"{j + 1}: {lines[j]}" for j in range(lo, hi))
        return "Lo más parecido en el archivo (copiá el old_text de acá, tal cual):\n" + snip

    def _run_shell(s, cmd, timeout=30, cwd=None):
        """Ejecuta un comando shell tolerando rutas UNC como directorio actual.
        En Windows, cmd.exe NO acepta \\\\server\\share como cwd (los comandos
        fallan con exit 1/2 sin razón aparente) — pasaba con el workspace en el
        NAS. Solución: `pushd` mapea la UNC a una letra de unidad temporal y entra
        ahí; se libera sola al cerrar el proceso. Así el agente no desperdicia
        tokens reintentando comandos que 'fallan' solo por la ruta UNC."""
        cwd = str(cwd if cwd is not None else s._base())
        if os.name == "nt" and cwd.startswith(("\\\\", "//")):
            # pushd + '&&': el returncode queda el del COMANDO (no el de pushd)
            return subprocess.run(f'pushd "{cwd}" && {cmd}', shell=True,
                                  capture_output=True, text=True, timeout=timeout)
        return subprocess.run(cmd, shell=True, capture_output=True, text=True,
                              timeout=timeout, cwd=cwd or None)

    def _exec_tool(s, name, args, code, lang):
        try:
            if name == "update_plan":
                steps = validate_plan(args.get("steps"))
                s._push("agent_plan", {"steps": steps})
                return "Plan actualizado en la interfaz"
            if name == "read_file":
                rel = s._arg_path(args)
                if not rel:
                    return (" Falta 'path'. Llamá read_file con {\"path\": \"archivo.js\"} "
                            "(opcional start_line/max_lines). No repitas sin el path.")
                p = Path(rel) if os.path.isabs(rel) else s._base() / rel
                if not p.exists():
                    return f" No existe: {rel}. Usá list_files para ver los nombres exactos."
                if p.is_dir():
                    return " Es un directorio — usá list_files"
                try:
                    txt = p.read_text(encoding="utf-8", errors="replace")
                except OSError as e:
                    return f" {e}"
                lines = txt.splitlines(keepends=True)
                start = max(1, int(args.get("start_line", 1) or 1))
                maxl = int(args.get("max_lines", 0) or 0)
                end = (start - 1 + maxl) if maxl else len(lines)
                seg = "".join(lines[start - 1:end])
                cap = 20000
                if len(seg) > cap:
                    return seg[:cap] + (f"\n\n… (cortado en {cap} chars — pedí un rango "
                                        "menor con start_line/max_lines)")
                if end < len(lines):
                    seg += (f"\n\n… ({len(lines)} líneas en total; mostradas {start}-{end}. "
                            f"Seguí con start_line={end + 1})")
                return seg or "(archivo vacío)"
            if name == "write_file":
                rel = s._arg_path(args)
                if not rel:
                    return (" Falta 'path'. Llamá write_file con "
                            "{\"path\": \"archivo.py\", \"content\": \"...\"}. "
                            "No repitas la llamada sin el path — corregila.")
                if "content" not in args and "text" not in args:
                    return (" Falta 'content' — write_file necesita {path, content} con el "
                            "contenido COMPLETO del archivo. Si querés cambiar solo una parte, usá edit_file.")
                content = args.get("content")
                if content is None:
                    content = args.get("text") or ""
                p = s._base() / rel
                p.parent.mkdir(parents=True, exist_ok=True)
                # checkpoint: guardar el contenido previo (o None si es nuevo) una
                # sola vez por turno, para poder deshacer todo el turno con /undo
                key = str(p)
                if key not in s._checkpoint:
                    s._checkpoint[key] = p.read_text(encoding="utf-8",
                                                     errors="replace") if p.exists() else None
                p.write_text(content, encoding="utf-8")
                s._written.append(str(p))
                s._push("wrote", {"path": str(p)})
                return f" Escrito {rel} ({len(content)}c)"
            if name == "edit_file":
                rel = s._arg_path(args)
                if not rel:
                    return (" Falta 'path'. Llamá edit_file con "
                            "{path, old_text, new_text} (o {path, edits:[{old_text,new_text},...]}). "
                            "No repitas sin el path.")
                p = s._base() / rel
                if not p.exists():
                    return f" No existe {rel} — usa write_file para crear un archivo nuevo"
                # acepta un solo reemplazo {old_text,new_text} o varios en {edits:[...]}
                edits = args.get("edits")
                if not isinstance(edits, list) or not edits:
                    edits = [{"old_text": args.get("old_text", ""),
                              "new_text": args.get("new_text", "")}]
                try:
                    src = p.read_text(encoding="utf-8", errors="replace")
                except OSError as e:
                    return f" {e}"
                orig = src
                ranges = []
                for i, ed in enumerate(edits):
                    tag = f" (edit {i + 1}/{len(edits)})" if len(edits) > 1 else ""
                    old = ed.get("old_text") or ed.get("old") or ""
                    new = ed.get("new_text")
                    if new is None:
                        new = ed.get("new") or ""
                    if not old:
                        return (" old_text vacío" + tag + " — copiá el fragmento EXACTO a "
                                "reemplazar (de un read_file previo, con su indentación).")
                    cnt = src.count(old)
                    if cnt == 1:
                        a = src.find(old); b = a + len(old)
                    elif cnt == 0:
                        # match exacto falló  intento tolerante a espacios/indentación
                        span = s._find_fuzzy(src, old)
                        if span is None:
                            hint = s._nearest_hint(src, old)
                            return (" No encontré ese texto en el archivo" + tag +
                                    ". Releé con read_file y copiá el fragmento EXACTO "
                                    "(indentación incluida).\n" + hint).rstrip()
                        a, b = span
                        # el fuzzy matchea líneas completas (con su \n); si el modelo
                        # mandó new_text sin salto final, no pegar con la línea de abajo
                        if src[a:b].endswith("\n") and new and not new.endswith("\n"):
                            new += "\n"
                    else:
                        return (f" Ese texto aparece {cnt} veces" + tag +
                                " — agregá más líneas de contexto para que sea único.")
                    if new == src[a:b]:
                        continue  # ese reemplazo no cambia nada, saltarlo
                    line_start = src[:a].count("\n")
                    src = src[:a] + new + src[b:]
                    ranges.append([line_start, line_start + new.count("\n")])
                if src == orig:
                    return (" El edit no cambió nada (el new_text ya estaba igual). "
                            "Si el archivo ya está como querés, decilo y seguí.")
                key = str(p)
                if key not in s._checkpoint:
                    s._checkpoint[key] = orig
                p.write_text(src, encoding="utf-8")
                s._written.append(str(p))
                # rango de líneas tocado  el frontend lo abre, scrollea y resalta
                lo = min(r[0] for r in ranges); hi = max(r[1] for r in ranges)
                s._push("wrote", {"path": str(p), "range": [lo, hi]})
                nch = len(ranges)
                return f" Editado {rel} ({nch} cambio{'s' if nch != 1 else ''})"
            if name == "exec_cmd":
                cmd = args.get("command") or args.get("cmd") or ""
                if not cmd:
                    return " Falta 'command'. Llamá exec_cmd con {\"command\": \"...\"}."
                r = s._run_shell(cmd, timeout=30)
                return f" exit={r.returncode}\n" + ((r.stdout + "\n" + r.stderr).strip()[:3000])
            if name == "git":
                a = (args.get("args") or "").strip()
                if not a:
                    return " Faltan argumentos de git (ej: 'commit -m \"msg\"', 'push')"
                r = s._run_shell("git " + a, timeout=180)
                out = (r.stdout + "\n" + r.stderr).strip()
                return f" git {a} (exit={r.returncode})\n{out[:3500] or '(sin salida)'}"
            if name == "ssh_exec":
                target, key, port = s._resolve_ssh(args.get("host", ""))
                if not target:
                    return " Falta el host (alias guardado o usuario@ip)"
                cmd = args.get("command", "")
                if not cmd:
                    return " Falta el comando a ejecutar en el servidor"
                r = subprocess.run(s._ssh_base(target, key, port) + [cmd],
                                   capture_output=True, text=True, timeout=180)
                out = (r.stdout + "\n" + r.stderr).strip()
                return f"[SSH] {target} (exit={r.returncode})\n{out[:3500] or '(sin salida)'}"
            if name == "scp_upload":
                target, key, port = s._resolve_ssh(args.get("host", ""))
                if not target:
                    return " Falta el host"
                local = args.get("local", "")
                lp = local if os.path.isabs(local) else str(s._base() / local)
                remote = args.get("remote", "")
                parts = ["scp", "-r", "-o", "StrictHostKeyChecking=accept-new"]
                if port:
                    parts += ["-P", str(port)]
                if key:
                    parts += ["-i", key]
                parts += [lp, f"{target}:{remote}"]
                r = subprocess.run(parts, capture_output=True, text=True, timeout=300)
                out = (r.stdout + "\n" + r.stderr).strip()
                return f"[Upload] {local}  {target}:{remote} (exit={r.returncode})\n{out[:2000]}"
            if name == "run_code":
                if not code or code.strip() == "// Nuevo archivo":
                    return " Editor vacio"
                return json.dumps(CodeRunner.run(code, args.get("language", lang)),
                                  indent=2)[:3000]
            if name == "list_files":
                base = s._base()
                return "\n".join(str(f.relative_to(base))
                                 for f in s._iter_files(base))[:3000] or "(vacío)"
            if name == "search_code":
                base = s._base()
                q = args.get("query", "")
                try:
                    rx = re.compile(q, re.IGNORECASE)
                except re.error:
                    rx = re.compile(re.escape(q), re.IGNORECASE)
                hits = []
                max_hits = 50
                for f in s._iter_files(base):
                    if len(hits) >= max_hits:
                        break
                    try:
                        content = f.read_text(encoding="utf-8", errors="replace")
                        lines = content.splitlines()
                        for i, line in enumerate(lines, 1):
                            if rx.search(line):
                                hits.append(f"{f.relative_to(base)}:{i}: {line.strip()[:120]}")
                                if len(hits) >= max_hits:
                                    break
                    except (OSError, UnicodeDecodeError):
                        pass
                return "\n".join(hits) or f"(sin coincidencias para «{q}»)"
            if name == "save_character":
                return s.save_character(args.get("name", ""),
                                        args.get("description") or args.get("desc") or "")
            if name == "generate_image":
                prompt = (args.get("prompt") or "").strip()
                if not prompt:
                    return " Falta 'prompt' — describí la imagen que querés generar."
                size = args.get("size") or "1024x1024"
                rel = args.get("path") or (
                    f"assets/img_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.png")
                img_bytes, used, err = s._gen_image(s._enhance_gen_prompt(prompt, "imagen"), size,
                                                    seed=args.get("seed"))
                if err:
                    return f" {err}"
                p = s._base() / rel
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_bytes(img_bytes)
                s._written.append(str(p))
                s._push("wrote", {"path": str(p)})
                return f" Imagen generada con {used}  {rel}"
            if name == "refine_image":
                rel = s._arg_path(args)
                if not rel:
                    return " Falta 'path' a la imagen"
                p = Path(rel) if os.path.isabs(rel) else s._base() / rel
                if not p.exists():
                    return f" No existe: {rel}"
                focus = (args.get("focus") or "").strip()
                # prompt de refinado fijo en inglés (no pasa por el traductor: es técnica)
                rp = ("Enhance this image like a professional upscaler: dramatically increase "
                      "micro-detail, texture fidelity and sharpness; refine edges and remove "
                      "artifacts. Keep the composition, colors, style and every element EXACTLY "
                      "the same — only add detail and clarity."
                      + (f" Pay special attention to: {focus}." if focus else ""))
                data, err = s._edit_image_api(str(p), rp)
                if err:
                    return f" {err}"
                out = p.with_name(f"{p.stem}_hd.png")
                n = 2
                while out.exists():
                    out = p.with_name(f"{p.stem}_hd{n}.png"); n += 1
                out.write_bytes(data)
                s._written.append(str(out))
                s._push("wrote", {"path": str(out)})
                return f" Imagen refinada (detalle+nitidez)  {out.name}"
            if name == "edit_image":
                rel = s._arg_path(args)
                if not rel:
                    return " Falta 'path' a la imagen"
                r = s.edit_image(rel, args.get("prompt") or "")
                if r.get("error"):
                    return f" {r['error']}"
                return f" Imagen editada  {r['name']} (versión nueva, la original queda intacta)"
            if name == "animate_image":
                rel = args.get("image") or s._arg_path(args)
                if not rel:
                    return " Falta 'image' (ruta a la imagen a animar)"
                p = Path(rel) if os.path.isabs(rel) else s._base() / rel
                if not p.exists():
                    return f" No existe: {rel}"
                prompt = s._enhance_gen_prompt(args.get("prompt") or "gentle cinematic motion", "video")
                data, used, err = s._gen_video_any(prompt, image_path=str(p))
                if err:
                    return f" {err}"
                out = s._save_video(data, f"video/{p.stem}_anim.mp4"
                                    if not os.path.isabs(rel) else str(Path(rel).with_suffix("")) + "_anim.mp4")
                return f" Imagen animada con {used}  {out.name} (mantiene el estilo del cuadro)"
            if name == "generate_video":
                prompt = (args.get("prompt") or "").strip()
                if not prompt:
                    return " Falta 'prompt' con la escena"
                rel = args.get("path") or f"video/video_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.mp4"
                if not rel.lower().endswith(".mp4"):
                    rel += ".mp4"
                data, used, err = s._gen_video_any(s._enhance_gen_prompt(prompt, "video"))
                if err:
                    return f" {err}"
                out = s._save_video(data, rel)
                return f" Video generado con {used}  {rel}"
            if name == "write_doc":
                rel = s._arg_path(args)
                if not rel:
                    return " Falta 'path' (ej: docs/informe.docx)"
                if not rel.lower().endswith(".docx"):
                    rel += ".docx"
                content = args.get("content") or args.get("text") or ""
                if not content.strip():
                    return " Falta 'content' con el texto del documento"
                p = s._base() / rel
                out = s._write_docx(p, content)
                s._written.append(out)
                s._push("sys", f" Documento Word creado: {rel}")
                return f" Documento .docx creado: {rel} (se abre con Word/LibreOffice)"
            if name == "social_publish":
                try:
                    svc = s._social()
                    asset = (args.get("asset") or "").strip()
                    if asset:
                        p = Path(asset) if os.path.isabs(asset) else s._base() / asset
                        if not p.exists():
                            return f" No existe el asset: {asset}"
                        asset = str(p)
                    qid = svc.enqueue(args.get("network", ""),
                                      args.get("content", ""),
                                      template_id=args.get("template_id", "") or "",
                                      asset_path=asset,
                                      scheduled_at=(args.get("schedule_at") or "").strip())
                    if (args.get("schedule_at") or "").strip():
                        return (f" Programado #{qid} para {args['schedule_at']} en "
                                f"{args.get('network')}. LOW lo valida contra la marca "
                                "y lo publica solo (autopiloto).")
                    return svc.process_item(qid, s._social_ask,
                                            lambda m: s._push("sys", m))
                except Exception as e:
                    return f" social_publish: {str(e)[:300]}"
            if name == "social_status":
                try:
                    st = s._social().state()
                    conn = [f"{p['label']}: {p['handle'] or '✔'}"
                            for p in st["platforms"] if p["connected"]]
                    lines = ["Cuentas conectadas: " + (", ".join(conn) or
                             "NINGUNA — el usuario debe conectarlas en   Redes Sociales")]
                    if st.get("templates"):
                        lines.append("Templates de Canva: " + "; ".join(
                            f"{t['name']} (id {t['id']})" for t in st["templates"][:15]))
                    b = st.get("brand") or {}
                    lines.append("Marca: " + (f"tono='{b.get('tone', '')[:80]}', "
                                 f"{len(b.get('banned', []))} palabras prohibidas"
                                 if b.get("tone") else "SIN CARGAR (  Redes Sociales)"))
                    for q_ in st.get("queue", [])[:10]:
                        lines.append(f"  cola #{q_['id']} {q_['network']} "
                                     f"[{q_['status']}] {q_.get('error') or ''}")
                    return "\n".join(lines)
                except Exception as e:
                    return f" social_status: {str(e)[:300]}"
            if name == "web_search":
                return s._web_search(args.get("query") or args.get("q") or "")
            if name == "web_fetch":
                return s._web_fetch(args.get("url") or args.get("path") or "")
            if name == "ask_model":
                return s._ask_model(args.get("provider") or args.get("name") or "",
                                    args.get("prompt") or args.get("task") or "",
                                    args.get("model") or "",
                                    args.get("image") or "")
            if name == "anim":
                return s._anim(args.get("action") or "", args.get("params") or {})
            if name == "vectorize":
                raw, err = s._read_img_bytes(s._arg_path(args) or args.get("image"))
                if err:
                    return f" {err}"
                svg, err = s._vectorize(raw, args.get("detail", "medium"),
                                        mode=args.get("mode", "color"),
                                        remove_bg=bool(args.get("remove_bg")),
                                        bg_tol=int(args.get("bg_tol") or 32))
                if not svg:
                    return f" {err}"
                rel = args.get("out") or f"disenos/vector_{datetime.datetime.now().strftime('%H%M%S')}.svg"
                if not rel.endswith(".svg"):
                    rel += ".svg"
                p = s._base() / rel
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(svg, encoding="utf-8")
                s._written.append(str(p))
                s._push("wrote", {"path": str(p)})
                return (f" Vectorizado  {rel} ({svg.count('<path')} trazos editables). "
                        "Abrilo en el editor [Diseno] para ajustarlo.")
            if name == "illustrate":
                prompt = args.get("prompt") or ""
                if not prompt:
                    return " Falta 'prompt' (describí la ilustración: estilo, colores, composición)."
                data, used, gerr = s._gen_image(prompt, size=args.get("size", "1024x1024"))
                if not data:
                    return f" No pude generar el raster base: {gerr}"
                svg, verr = s._vectorize(data, args.get("detail", "high"))
                if not svg:
                    return f" Generé el raster pero no pude vectorizar: {verr}"
                rel = args.get("out") or f"disenos/ilustracion_{datetime.datetime.now().strftime('%H%M%S')}.svg"
                if not rel.endswith(".svg"):
                    rel += ".svg"
                p = s._base() / rel
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(svg, encoding="utf-8")
                s._written.append(str(p))
                s._push("wrote", {"path": str(p)})
                return (f" Ilustración vectorial  {rel} ({svg.count('<path')} trazos, vía {used}). "
                        "Editable en el [Diseno] (cada zona de color es un path).")
            if name == "remember":
                return s._remember(args.get("note") or args.get("text") or "")
            if name == "social_export":
                rel = args.get("image") or s._arg_path(args)
                if not rel:
                    return " Falta 'image' (ruta a la imagen/diseño fuente)"
                src = Path(rel) if os.path.isabs(rel) else s._base() / rel
                if not src.exists():
                    return f" No existe: {rel}"
                data_url, err = s._source_dataurl(str(src))
                if err or not data_url:
                    return f" No pude leer la fuente: {err}"
                fmts = s._resolve_platforms(args.get("platforms"))
                outdir = s._base() / "social" / src.stem
                outdir.mkdir(parents=True, exist_ok=True)
                done, fail, first = [], [], None
                for fmt in fmts:
                    w, h = s.SOCIAL_SIZES[fmt]
                    png, e = s._fit_image(data_url, w, h)
                    if e or not png:
                        fail.append(f"{fmt} ({e})")
                        continue
                    b64 = png.split(",", 1)[1]
                    fp = outdir / f"{fmt}_{w}x{h}.png"
                    fp.write_bytes(base64.b64decode(b64))
                    s._written.append(str(fp))
                    first = first or str(fp)
                    done.append(f"{fmt} {w}x{h}")
                # abrir la primera imagen generada (una ruta de archivo, NO la carpeta:
                # el frontend rutea archivos al visor; una carpeta daría error)
                if first:
                    s._push("wrote", {"path": first})
                rel_out = outdir.relative_to(s._base()) if str(outdir).startswith(str(s._base())) else outdir
                msg = f" {len(done)} imagen(es) en {rel_out}/:\n  " + "\n  ".join(done)
                if fail:
                    msg += "\n fallaron: " + ", ".join(fail)
                msg += "\nAcordate de escribir el copy + hashtags por plataforma en social/post.md"
                return msg
            if name == "check_design":
                rel = s._arg_path(args)
                if not rel:
                    return " Falta 'path' al .svg a revisar"
                p = Path(rel) if os.path.isabs(rel) else s._base() / rel
                if not p.exists():
                    return f" No existe: {rel}"
                struct = s._check_svg(str(p))
                try:
                    svg = p.read_text(encoding="utf-8", errors="replace")
                except OSError as e:
                    return f" {e}"
                visual = s._critique_design(svg, "revisión de diseño")
                if not struct and not visual:
                    return " El diseño se ve bien (estructura válida y sin problemas visuales evidentes)."
                out = []
                if struct:
                    out.append(" Estructura: " + struct)
                if visual:
                    out.append(" Revisión visual:\n" + visual)
                else:
                    out.append("(no había un modelo de visión disponible para la revisión visual)"
                               if not s._vision_target()[0] else "")
                return "\n".join(x for x in out if x)
        except Exception as e:
            return f" {e}"

    @staticmethod
    def _sf_image_models(key, skip=()):
        """Modelos generadores de imagen disponibles HOY en SiliconFlow (el
        catálogo cambia seguido). Para el fallback dinámico de _gen_image."""
        try:
            r = requests.get("https://api.siliconflow.com/v1/models",
                             headers={"Authorization": f"Bearer {key}"}, timeout=10)
            ids = [m["id"] for m in r.json().get("data", [])]
        except (requests.RequestException, ValueError, KeyError):
            return []
        pats = ("flux", "kolors", "z-image", "qwen-image", "seedream", "sd3",
                "stable-diffusion")
        # los "-Edit" editan una imagen existente, no generan desde texto
        return [i for i in ids
                if any(p in i.lower() for p in pats)
                and "edit" not in i.lower() and i not in skip][:3]

    def _enhance_gen_prompt(s, prompt, kind="imagen"):
        """Los modelos generativos (FLUX/Qwen/Wan) son chinos y entienden MUCHO
        mejor un prompt detallado en inglés que un pedido suelto en español.
        Reescribe el pedido preservando toda la intención de estilo. Si el pedido
        menciona un personaje con FICHA guardada, la ficha viaja en el prompt
        (anti-drift: mismo personaje en todas las generaciones). Desactivable
        con agent.enhance_prompts=false. Si falla, usa el original."""
        chars = s._chars_for_prompt(prompt)
        sheet = "\n".join(f"- {c['name']}: {c['desc']}" for c in chars)
        if not s.cfg.data.get("agent", {}).get("enhance_prompts", True) \
                or not s.prov or len(prompt) > 900:
            # sin enhancer igual anclamos el personaje, pegando la ficha al final
            return prompt + (f"\n\nCharacter reference (MUST match exactly): {sheet}"
                             if sheet else "")
        try:
            r = s.prov.chat(
                [{"role": "user", "content":
                  f"Rewrite this {('video' if 'video' in kind else 'image')} generation "
                  "request as ONE detailed English prompt optimized for diffusion/video "
                  "models. Include: subject, art style, lighting, composition, colors"
                  + (", camera movement and motion" if "video" in kind else "") +
                  ". PRESERVE every stylistic intent of the original. "
                  + ("These CHARACTER MODEL SHEETS are canonical and NON-NEGOTIABLE: "
                     "the rewritten prompt MUST describe each character EXACTLY as their "
                     "sheet says (same face, hair, colors, clothing, proportions, style) "
                     "— never invent or alter their features:\n" + sheet + "\n"
                     if sheet else "") +
                  "Reply ONLY with the prompt, no quotes.\n\n"
                  f"Request (Spanish): {prompt}"}],
                system_prompt="You write world-class generation prompts for diffusion and video models.",
                temperature=0.4, max_tokens=280 + (220 if sheet else 0))
            out = re.sub(r"<think>.*?</think>", "", r.content or "", flags=re.DOTALL).strip().strip('"')
            if 15 < len(out) < 2200:
                s._push("sys", f"[Prompt] Prompt optimizado ({kind})"
                        + (f" con ficha de {', '.join(c['name'] for c in chars)} [Personaje]" if chars else "")
                        + f": {out[:130]}…")
                return out
        except Exception as e:
            log(f"enhance_prompt falló: {e}")
        return prompt + (f"\n\nCharacter reference (MUST match exactly): {sheet}"
                         if sheet else "")

    # ── video (Wan 2.2 en SiliconFlow): textovideo y IMAGENvideo (animar) ──
    VIDEO_T2V = "Wan-AI/Wan2.2-T2V-A14B"
    VIDEO_I2V = "Wan-AI/Wan2.2-I2V-A14B"

    @staticmethod
    def _sf_video_models(key, i2v=False):
        """Modelos de video disponibles HOY en el catálogo (cambia seguido).
        i2v=True busca imagenvideo; si no, textovideo."""
        try:
            r = requests.get("https://api.siliconflow.com/v1/models",
                             headers={"Authorization": f"Bearer {key}"}, timeout=10)
            ids = [m["id"] for m in r.json().get("data", [])]
        except (requests.RequestException, ValueError, KeyError):
            return []
        tag = "i2v" if i2v else "t2v"
        out = [i for i in ids if tag in i.lower()]
        if not out:   # más laxo: cualquier modelo que diga video
            out = [i for i in ids if "video" in i.lower() and "instruct" not in i.lower()]
        return out[:3]

    def _sf_video(s, prompt, image_path=None, size="1280x720"):
        """Genera un video (async: submit + poll). Con image_path ANIMA esa
        imagen manteniendo su estilo (I2V). Si el modelo conocido ya no existe,
        busca en el catálogo vivo el que lo sepa hacer. Devuelve (bytes, error)."""
        sk = s.cfg.get_api_key("siliconflow")
        if not sk:
            return None, "video necesita la API key de SiliconFlow ()"
        hdr = {"Authorization": f"Bearer {sk}", "Content-Type": "application/json"}
        body = {"prompt": prompt, "image_size": size}   # image_size es OBLIGATORIO
        if image_path:
            p = Path(image_path)
            mime = s.IMG_MIME.get(p.suffix.lower())
            if not mime:
                return None, f"formato no soportado para animar: {p.suffix}"
            try:
                body["image"] = f"data:{mime};base64," + \
                    base64.b64encode(p.read_bytes()).decode("ascii")
            except OSError as e:
                return None, str(e)
        # candidatos: el conocido primero; si su submit falla, el catálogo en vivo
        known = s.VIDEO_I2V if image_path else s.VIDEO_T2V
        rid, sub_err = None, None
        for model in [known] + [m for m in s._sf_video_models(sk, i2v=bool(image_path))
                                if m != known]:
            try:
                r = requests.post("https://api.siliconflow.com/v1/video/submit",
                                  headers=hdr, json={**body, "model": model}, timeout=60)
                rid = r.json().get("requestId")
            except (requests.RequestException, ValueError) as e:
                sub_err = f"submit falló ({model}): {e}"
                continue
            if rid:
                if model != known:
                    s._push("sys", f" Usé {model} (el modelo conocido no estaba disponible)")
                break
            sub_err = f"{model}: {r.text[:150]}"
            log(f"video submit rechazado {model}: {r.text[:150]}")
        if not rid:
            return None, sub_err or "ningún modelo de video disponible en el catálogo"
        s._push("sys", " Generando video (~2-4 min)… te aviso cuando esté.")
        for i in range(60):                     # hasta 10 minutos
            time.sleep(10)
            try:
                d = requests.post("https://api.siliconflow.com/v1/video/status",
                                  headers=hdr, json={"requestId": rid}, timeout=30).json()
            except (requests.RequestException, ValueError):
                continue
            st = d.get("status")
            if i % 6 == 5:
                s._push("sys", f" Video: {st}… ({(i + 1) * 10}s)")
            if st == "Succeed":
                vids = (d.get("results") or {}).get("videos") or []
                if not vids or not vids[0].get("url"):
                    return None, "terminó sin URL de video"
                try:
                    v = requests.get(vids[0]["url"], timeout=120)
                    v.raise_for_status()
                    return v.content, None
                except requests.RequestException as e:
                    return None, f"descarga falló: {e}"
            if st == "Failed":
                return None, f"la generación falló{': ' + d.get('reason') if d.get('reason') else ' (probá reformular el pedido)'}"
        return None, "timeout: el video tardó más de 10 minutos"

    # ── video (LTX-2.3 de Lightricks): sync, con AUDIO generado ──────────
    # Docs: https://docs.ltx.video · key: https://console.ltx.video/api-keys
    # A diferencia de Wan (submit+poll), LTX v1 es SÍNCRONO: el POST devuelve
    # el mp4 directo (octet-stream). Soporta t2v e i2v (image_uri).
    LTX_DURATIONS = (6, 8, 10, 12, 14, 16, 18, 20)   # segundos válidos en 1080p

    def _ltx_video(s, prompt, image_path=None, duration=6, resolution="1920x1080"):
        """Genera video con LTX. Con image_path anima esa imagen (primer cuadro).
        Devuelve (bytes, error). La imagen local va como data-URI base64."""
        key = s.cfg.get_api_key("ltx")
        if not key:
            return None, "video LTX necesita la API key (  ltx · console.ltx.video/api-keys)"
        model = s.cfg.get_model("ltx") or "ltx-2-3-fast"
        # duración: al valor válido más cercano (la API rechaza intermedios)
        try:
            duration = int(duration or 6)
        except (TypeError, ValueError):
            duration = 6
        duration = min(s.LTX_DURATIONS, key=lambda d: abs(d - duration))
        body = {"prompt": prompt, "model": model, "duration": duration,
                "resolution": resolution}
        url = "https://api.ltx.video/v1/text-to-video"
        if image_path:
            p = Path(image_path)
            mime = s.IMG_MIME.get(p.suffix.lower())
            if not mime:
                return None, f"formato no soportado para animar: {p.suffix}"
            try:
                body["image_uri"] = f"data:{mime};base64," + \
                    base64.b64encode(p.read_bytes()).decode("ascii")
            except OSError as e:
                return None, str(e)
            url = "https://api.ltx.video/v1/image-to-video"
        s._push("sys", f" Generando video con LTX ({model}, {duration}s)…")
        try:
            r = requests.post(url, json=body, timeout=(30, 600),
                              headers={"Authorization": f"Bearer {key}",
                                       "Content-Type": "application/json"})
        except requests.RequestException as e:
            return None, f"LTX: {e}"
        ctype = r.headers.get("content-type", "")
        if r.status_code == 200 and "json" not in ctype:
            return r.content, None      # el mp4 viene directo en el body
        # error: viene JSON {type, error:{message}} — devolver el mensaje útil
        try:
            j = r.json()
            detail = (j.get("error") or {}).get("message") or j.get("message") or r.text[:200]
        except ValueError:
            detail = r.text[:200]
        return None, f"LTX {r.status_code}: {detail}"

    # ── fal.ai: gateway universal (Seedance, Flux, Kling, Wan, Veo…). Queue API:
    # POST https://queue.fal.run/<model_id>  {request_id, status_url, response_url};
    # se poolea status_url hasta COMPLETED y se lee response_url. Auth: "Key <k>".
    def _fal_run(s, model_id, body, kind="video"):
        """Somete un job a fal.ai, poolea hasta COMPLETED y devuelve (bytes, error).
        kind = 'video' | 'image' (para saber qué URL extraer del resultado)."""
        key = s.cfg.get_api_key("fal")
        if not key:
            return None, "fal.ai necesita API key (  fal · fal.ai/dashboard/keys)"
        hdr = {"Authorization": f"Key {key}", "Content-Type": "application/json"}
        try:
            r = requests.post(f"https://queue.fal.run/{model_id}", headers=hdr,
                              json=body, timeout=60)
            if not r.ok:
                return None, f"fal.ai submit {r.status_code}: {r.text[:200]}"
            j = r.json()
        except (requests.RequestException, ValueError) as e:
            return None, f"fal.ai submit: {e}"
        status_url, response_url = j.get("status_url"), j.get("response_url")
        if not response_url:                      # respuesta síncrona (sin cola)
            return s._fal_extract(j, kind)
        s._push("sys", f" Generando con fal.ai ({model_id})…")
        for i in range(90):                       # hasta ~15 min
            time.sleep(10)
            try:
                st = requests.get(status_url, headers=hdr, timeout=30).json()
            except (requests.RequestException, ValueError):
                continue
            state = st.get("status")
            if i % 6 == 5:
                s._push("sys", f" fal.ai: {state}… ({(i + 1) * 10}s)")
            if state == "COMPLETED":
                try:
                    out = requests.get(response_url, headers=hdr, timeout=60).json()
                except (requests.RequestException, ValueError) as e:
                    return None, f"fal.ai result: {e}"
                return s._fal_extract(out, kind)
            if state in ("FAILED", "ERROR"):
                return None, f"fal.ai falló: {str(st.get('error') or st)[:200]}"
        return None, "fal.ai timeout (>15 min)"

    def _fal_extract(s, out, kind):
        """Extrae la URL de media del resultado de fal y descarga los bytes."""
        url = None
        if kind == "video":
            v = out.get("video")
            if isinstance(v, dict):
                url = v.get("url")
            if not url:
                vids = out.get("videos") or []
                url = vids[0].get("url") if vids else None
        else:
            imgs = out.get("images") or []
            if imgs:
                url = imgs[0].get("url")
            else:
                img = out.get("image")
                url = img.get("url") if isinstance(img, dict) else None
        if not url:
            return None, f"fal.ai: respuesta sin media ({str(out)[:150]})"
        try:
            m = requests.get(url, timeout=180)
            m.raise_for_status()
            return m.content, None
        except requests.RequestException as e:
            return None, f"fal.ai descarga: {e}"

    def _fal_cfg(s, key, default):
        return s.cfg.data.get("providers", {}).get("fal", {}).get(key) or default

    def _fal_video(s, prompt, image_path=None):
        if image_path:
            model = s._fal_cfg("i2v_model", "bytedance/seedance-2.0/image-to-video")
            data_url, err = s._source_dataurl(image_path)
            if err:
                return None, err
            body = {"prompt": prompt, "image_url": data_url}
        else:
            model = s._fal_cfg("model", "bytedance/seedance-2.0/text-to-video")
            body = {"prompt": prompt}
        return s._fal_run(model, body, "video")

    def _fal_image(s, prompt, size="1024x1024", seed=None):
        model = s._fal_cfg("image_model", "fal-ai/flux/schnell")
        body = {"prompt": prompt}
        if seed is not None:
            try:
                body["seed"] = int(seed)
            except (TypeError, ValueError):
                pass
        return s._fal_run(model, body, "image")

    def _gateway_media(s, provider, kind, prompt):
        try:
            data = generate_media(provider, s.cfg.data["providers"][provider], kind, prompt,
                                  cancelled=lambda: bool(s._cancel),
                                  progress=lambda message: s._push("sys", message))
            return data, provider, None
        except Exception as exc:
            # Keys, request bodies and signed download URLs never enter logs.
            message = str(exc) if isinstance(exc, (ValueError, RuntimeError)) else type(exc).__name__
            return None, None, f"{provider}: {message}"

    def _gen_video_any(s, prompt, image_path=None):
        """Despachador de video: fal.ai (Seedance, universal) primero si hay key;
        luego LTX (rápido, con audio) y por último Wan en SiliconFlow. Devuelve
        (bytes, proveedor_usado, error)."""
        errs = []
        # Explicitly configured gateways take precedence. Do not silently submit
        # another paid request after a timeout or moderation rejection.
        for gateway in ("higgsfield", "replicate"):
            cfg = s.cfg.data.get("providers", {}).get(gateway, {})
            if cfg.get("api_key") and cfg.get("model") and not image_path:
                return s._gateway_media(gateway, "video", prompt)
        if s.cfg.get_api_key("fal"):
            data, err = s._fal_video(prompt, image_path=image_path)
            if data:
                return data, "fal.ai (Seedance)", None
            errs.append(err)
            s._push("sys", f" fal.ai falló ({str(err)[:110]})  pruebo otro proveedor…")
        if s.cfg.get_api_key("ltx"):
            data, err = s._ltx_video(prompt, image_path=image_path)
            if data:
                return data, "LTX", None
            errs.append(err)
            if s.cfg.get_api_key("siliconflow"):
                s._push("sys", f" LTX falló ({str(err)[:120]})  pruebo con Wan/SiliconFlow…")
        if s.cfg.get_api_key("siliconflow"):
            data, err = s._sf_video(prompt, image_path=image_path)
            if data:
                return data, "Wan (SiliconFlow)", None
            errs.append(err)
        if not errs:
            errs.append("no hay API key de video: cargá LTX (console.ltx.video/api-keys) "
                        "o SiliconFlow en ")
        return None, None, " · ".join(str(e) for e in errs if e)

    def _save_video(s, data, rel):
        out = s._base() / rel
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(data)
        s._written.append(str(out))
        s._push("wrote", {"path": str(out)})
        return out

    def _edit_image_api(s, img_path, prompt):
        """Edita una imagen EXISTENTE con IA (img2img): se la manda a
        Qwen-Image-Edit de SiliconFlow junto al pedido y devuelve la nueva.
        Devuelve (bytes, error)."""
        sk = s.cfg.get_api_key("siliconflow")
        if not sk:
            return None, ("editar imágenes necesita la API key de SiliconFlow "
                          "cargada en Configuración ()")
        p = Path(img_path)
        mime = s.IMG_MIME.get(p.suffix.lower())
        if not mime:
            return None, f"formato no soportado: {p.suffix} (png/jpg/webp)"
        try:
            b64 = base64.b64encode(p.read_bytes()).decode("ascii")
        except OSError as e:
            return None, str(e)
        try:
            r = requests.post(
                "https://api.siliconflow.com/v1/images/generations",
                headers={"Authorization": f"Bearer {sk}", "Content-Type": "application/json"},
                json={"model": "Qwen/Qwen-Image-Edit", "prompt": prompt,
                      "image": f"data:{mime};base64,{b64}"},
                timeout=150)
            if not r.ok:
                try:
                    detail = (r.json().get("error") or {}).get("message", r.text[:200])
                except ValueError:
                    detail = r.text[:200]
                return None, f"Qwen-Image-Edit: {detail}"
            d = (r.json().get("images") or r.json().get("data") or [{}])[0]
            if d.get("b64_json"):
                return base64.b64decode(d["b64_json"]), None
            if d.get("url"):
                img = requests.get(d["url"], timeout=90)
                img.raise_for_status()
                return img.content, None
            return None, "respuesta sin imagen"
        except requests.RequestException as e:
            return None, str(e)

    def edit_image(s, path, prompt):
        """js_api + tool: edita la imagen y guarda una VERSIÓN nueva al lado
        (no pisa la original). Devuelve {path} o {error}."""
        p = Path(path) if os.path.isabs(str(path)) else s._base() / str(path)
        if not p.exists():
            return {"error": f"No existe: {path}"}
        data, err = s._edit_image_api(str(p), s._enhance_gen_prompt((prompt or "").strip(), "edición de imagen"))
        if err:
            return {"error": err}
        # versionar: foto.png  foto_v2.png, foto_v3.png…
        n, out = 2, p.with_name(f"{p.stem}_v2.png")
        while out.exists():
            n += 1
            out = p.with_name(f"{p.stem}_v{n}.png")
        out.write_bytes(data)
        s._written.append(str(out))
        s._push("wrote", {"path": str(out)})
        return {"path": str(out), "name": out.name}

    def _gen_image(s, prompt, size="1024x1024", seed=None):
        """Genera una imagen con la primera API disponible: OpenAI (dall-e-3)
        y si no hay key, SiliconFlow (con fallback dinámico al catálogo en vivo).
        Devuelve (bytes, proveedor_usado, error) — uno de (bytes, error) es no-None."""
        for gateway in ("higgsfield", "replicate"):
            cfg = s.cfg.data.get("providers", {}).get(gateway, {})
            if cfg.get("api_key") and cfg.get("image_model"):
                return s._gateway_media(gateway, "image", prompt)
        err_fal = err_openai = err_sf = None
        # fal.ai primero si hay key (universal: Flux/Seedream/etc.)
        if s.cfg.get_api_key("fal"):
            data, err = s._fal_image(prompt, size=size, seed=seed)
            if data:
                return data, "fal.ai", None
            err_fal = f"fal.ai: {err}"
        ok = s.cfg.get_api_key("openai")
        if ok:
            try:
                r = requests.post(
                    "https://api.openai.com/v1/images/generations",
                    headers={"Authorization": f"Bearer {ok}", "Content-Type": "application/json"},
                    json={"model": "dall-e-3", "prompt": prompt, "size": size,
                          "n": 1, "response_format": "b64_json"},
                    timeout=90)
                if r.ok:
                    b64 = r.json()["data"][0]["b64_json"]
                    return base64.b64decode(b64), "OpenAI (dall-e-3)", None
                try:
                    detail = (r.json().get("error") or {}).get("message", r.text[:200])
                except ValueError:
                    detail = r.text[:200]
                err_openai = f"OpenAI: {detail}"
            except requests.RequestException as e:
                err_openai = f"OpenAI: {e}"
        sk = s.cfg.get_api_key("siliconflow")
        if sk:
            # candidatos: el conocido primero y, si falla (el catálogo cambia seguido),
            # los modelos de imagen REALES del catálogo en vivo
            candidates = ["black-forest-labs/FLUX.1-schnell"]
            for model in candidates + s._sf_image_models(sk, skip=candidates):
                try:
                    r = requests.post(
                        "https://api.siliconflow.com/v1/images/generations",
                        headers={"Authorization": f"Bearer {sk}", "Content-Type": "application/json"},
                        json={"model": model, "prompt": prompt, "image_size": size,
                              **({"seed": int(seed)} if seed is not None else {})},
                        timeout=90)
                    if r.ok:
                        d = (r.json().get("data") or [{}])[0]
                        if d.get("b64_json"):
                            return base64.b64decode(d["b64_json"]), f"SiliconFlow ({model})", None
                        if d.get("url"):
                            img = requests.get(d["url"], timeout=60)
                            img.raise_for_status()
                            return img.content, f"SiliconFlow ({model})", None
                        err_sf = f"SiliconFlow {model}: respuesta sin imagen"
                        continue
                    try:
                        detail = (r.json().get("error") or {}).get("message", r.text[:200])
                    except ValueError:
                        detail = r.text[:200]
                    err_sf = f"SiliconFlow {model}: {detail}"
                    log(f"gen_image {model} falló: {detail}")
                except requests.RequestException as e:
                    err_sf = f"SiliconFlow {model}: {e}"
        if not ok and not sk and not s.cfg.get_api_key("fal"):
            return None, None, ("no hay API key de fal.ai, OpenAI ni SiliconFlow cargada — "
                                 "agregá una en Configuración () para generar imágenes")
        return None, None, " · ".join(x for x in (err_fal, err_openai, err_sf) if x) or "no se pudo generar la imagen"

    # ── documentos .docx (Word) sin dependencias: un docx es un zip con XML ──
    @staticmethod
    def _docx_par(text, style=None):
        esc = (text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
        ppr = f'<w:pPr><w:pStyle w:val="{style}"/></w:pPr>' if style else ""
        # negrita inline con **texto**
        runs = []
        for i, part in enumerate(re.split(r"\*\*(.+?)\*\*", esc)):
            if not part:
                continue
            rpr = "<w:rPr><w:b/></w:rPr>" if i % 2 else ""
            runs.append(f'<w:r>{rpr}<w:t xml:space="preserve">{part}</w:t></w:r>')
        return f"<w:p>{ppr}{''.join(runs)}</w:p>"

    def _write_docx(s, path, content):
        """Convierte texto markdown-lite (#/##/### títulos, - viñetas, **negrita**,
        párrafos separados por línea en blanco) a un .docx válido, sin librerías."""
        import zipfile
        body = []
        for raw in (content or "").split("\n"):
            ln = raw.rstrip()
            if not ln.strip():
                continue
            if ln.startswith("### "):
                body.append(s._docx_par(ln[4:], "Heading3"))
            elif ln.startswith("## "):
                body.append(s._docx_par(ln[3:], "Heading2"))
            elif ln.startswith("# "):
                body.append(s._docx_par(ln[2:], "Heading1"))
            elif ln.lstrip().startswith(("- ", "* ", "• ")):
                body.append(s._docx_par("• " + ln.lstrip()[2:].strip()))
            else:
                body.append(s._docx_par(ln))
        doc = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
               '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
               f'<w:body>{"".join(body)}</w:body></w:document>')
        styles = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
                  '<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/>'
                  '<w:rPr><w:b/><w:sz w:val="48"/></w:rPr></w:style>'
                  '<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/>'
                  '<w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>'
                  '<w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/>'
                  '<w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style></w:styles>')
        ct = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
              '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
              '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
              '<Default Extension="xml" ContentType="application/xml"/>'
              '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
              '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>')
        rels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>')
        drels = ('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
                 '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
                 '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>')
        p = Path(path)
        p.parent.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(p, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", ct)
            z.writestr("_rels/.rels", rels)
            z.writestr("word/_rels/document.xml.rels", drels)
            z.writestr("word/document.xml", doc)
            z.writestr("word/styles.xml", styles)
        return str(p)

    def _check_written(s):
        """Verifica la sintaxis de los archivos escritos por el agente en este turno.
        El harness NO confía en que el modelo escriba código válido: .py se compila,
        .js/.mjs/.cjs se chequean con `node --check` (si hay node), .json se parsea."""
        import shutil
        node = shutil.which("node")
        errs = []
        for p in dict.fromkeys(s._written):
            base = os.path.basename(p)
            try:
                if p.endswith(".py"):
                    src = Path(p).read_text(encoding="utf-8", errors="replace")
                    compile(src, p, "exec")
                elif p.endswith((".js", ".mjs", ".cjs")) and node:
                    r = subprocess.run([node, "--check", p], capture_output=True,
                                       text=True, timeout=15)
                    if r.returncode != 0:
                        det = (r.stderr or r.stdout).strip().splitlines()
                        errs.append(f"{base}: " + (det[0] if det else "error de sintaxis JS"))
                elif p.endswith(".json"):
                    json.loads(Path(p).read_text(encoding="utf-8", errors="replace"))
            except SyntaxError as e:
                linea = (e.text or "").strip()
                errs.append(f"{base} línea {e.lineno}: {e.msg}"
                            + (f"\n  {linea}" if linea else ""))
            except json.JSONDecodeError as e:
                errs.append(f"{base}: JSON inválido — {e.msg} (línea {e.lineno})")
            except (OSError, subprocess.SubprocessError):
                pass
        return "\n".join(errs)

    def _pick_entry(s):
        """Elige UN archivo .py de los escritos este turno para el smoke test.
        Prioriza puntos de entrada obvios; si no, uno con bloque __main__.
        Devuelve la ruta o None si no hay un candidato claro y seguro."""
        pys = [p for p in dict.fromkeys(s._written) if p.endswith(".py")]
        if not pys:
            return None
        names = {"main.py", "app.py", "__main__.py", "run.py", "manage.py",
                 "cli.py", "start.py"}
        for p in pys:
            if os.path.basename(p).lower() in names:
                return p
        for p in pys:
            try:
                if "__main__" in Path(p).read_text(encoding="utf-8", errors="replace"):
                    return p
            except OSError:
                pass
        # un único archivo suelto  probablemente es el que hay que correr
        return pys[0] if len(pys) == 1 else None

    def _check_runtime(s):
        """Verificación de EJECUCIÓN (no solo sintaxis): corre el punto de entrada
        .py escrito este turno con un timeout y, si revienta con un traceback,
        devuelve el error para que el modelo lo corrija. Desactivable con
        config agent.verify_runtime=false. Salta apps con ventana (pygame/tkinter…),
        que no se pueden correr capturadas, y trata el timeout como 'probablemente
        un server/loop, no lo marco como error'."""
        if not s.cfg.data.get("agent", {}).get("verify_runtime", True):
            return ""
        entry = s._pick_entry()
        if not entry:
            return ""
        try:
            src = Path(entry).read_text(encoding="utf-8", errors="replace")
        except OSError:
            return ""
        if s.GUI_LIBS.search(src):
            return ""   # app con ventana: no se puede smoke-testear con timeout
        import shutil
        exe = shutil.which("python") or shutil.which("python3")
        if not exe:
            return ""
        base = os.path.basename(entry)
        try:
            s._push("sys", f" Verificando que {base} corra sin errores…")
            r = subprocess.run([exe, entry], capture_output=True, text=True,
                               timeout=12, cwd=str(s._base()),
                               env={**os.environ, "PYTHONIOENCODING": "utf-8"})
        except subprocess.TimeoutExpired:
            # no terminó en 12s: server, loop o input()  no lo tomo como falla
            return ""
        except (OSError, subprocess.SubprocessError):
            return ""
        if r.returncode == 0:
            return ""
        err = (r.stderr or r.stdout or "").strip()
        if "Traceback" not in err and "Error" not in err:
            return ""   # exit != 0 sin traceback claro (ej. sys.exit(1) intencional)
        # quedarse con la parte útil del traceback (las últimas líneas)
        tail = "\n".join(err.splitlines()[-12:])
        return f"{base} falla al ejecutarse:\n{tail}"

    # ── Vectores: que el modelo VEA lo que dibujó y se autocorrija ──────
    # El límite real de la IA con vectores es que genera SVG a ciegas. Acá lo
    # rasterizamos (vía el propio webview), se lo mostramos a un modelo de visión
    # y devolvemos una crítica accionable para que corrija.
    def _rasterize_svg(s, svg):
        """SVG  PNG dataURL usando el motor del webview. Devuelve (dataurl, error)."""
        if not s._window:
            return None, "sin ventana"
        try:
            s._window.evaluate_js("window.rasterizeSVG(" + json.dumps(svg) + ")")
        except Exception as e:
            return None, str(e)
        for _ in range(60):                     # hasta ~6s
            time.sleep(0.1)
            try:
                r = s._window.evaluate_js("window.__raster")
            except Exception:
                r = None
            if not r or r == "PENDING":
                continue
            if isinstance(r, str) and r.startswith("ERR:"):
                return None, r[4:]
            if isinstance(r, str) and r.startswith("data:image"):
                return r, None
        return None, "timeout rasterizando el SVG"

    # ── Redes sociales: preparar el paquete de posteo (sin APIs) ──────
    # Tamaños canónicos por plataforma/formato (px). El agente escribe el copy;
    # esto se encarga de dejar la imagen en la medida exacta de cada red.
    SOCIAL_SIZES = {
        "instagram_post": (1080, 1080), "instagram_portrait": (1080, 1350),
        "instagram_story": (1080, 1920), "instagram_reel": (1080, 1920),
        "facebook_post": (1200, 630), "facebook_story": (1080, 1920),
        "x_post": (1600, 900), "twitter": (1600, 900),
        "linkedin_post": (1200, 627), "tiktok": (1080, 1920),
        "youtube_thumbnail": (1280, 720), "pinterest": (1000, 1500),
        "whatsapp_status": (1080, 1920),
    }
    SOCIAL_ALIASES = {
        "instagram": ["instagram_post", "instagram_story"],
        "facebook": ["facebook_post"], "x": ["x_post"],
        "linkedin": ["linkedin_post"], "youtube": ["youtube_thumbnail"],
        "all": ["instagram_post", "instagram_story", "facebook_post",
                "x_post", "linkedin_post"],
    }

    def _fit_image(s, data_url, w, h):
        """Redimensiona/recorta (cover) una imagen a w×h usando el canvas del
        webview. Devuelve (png_dataurl, error)."""
        if not s._window:
            return None, "sin ventana"
        try:
            s._window.evaluate_js(
                "window.fitImage(%s,%d,%d)" % (json.dumps(data_url), int(w), int(h)))
        except Exception as e:
            return None, str(e)
        for _ in range(60):
            time.sleep(0.1)
            try:
                r = s._window.evaluate_js("window.__fit")
            except Exception:
                r = None
            if not r or r == "PENDING":
                continue
            if isinstance(r, str) and r.startswith("ERR:"):
                return None, r[4:]
            if isinstance(r, str) and r.startswith("data:image"):
                return r, None
        return None, "timeout redimensionando"

    def _source_dataurl(s, path):
        """Data URL PNG de la fuente: si es SVG lo rasteriza; si es raster lo
        codifica directo. Devuelve (dataurl, error)."""
        p = Path(path)
        ext = p.suffix.lower()
        try:
            if ext == ".svg":
                return s._rasterize_svg(p.read_text(encoding="utf-8", errors="replace"))
            mime = s.IMG_MIME.get(ext)
            if not mime:
                return None, f"formato no soportado: {ext}"
            b64 = base64.b64encode(p.read_bytes()).decode("ascii")
            return f"data:{mime};base64,{b64}", None
        except OSError as e:
            return None, str(e)

    def _resolve_platforms(s, platforms):
        """Normaliza la lista de plataformas pedida a claves de SOCIAL_SIZES."""
        if isinstance(platforms, str):
            platforms = [x.strip() for x in re.split(r"[,\s]+", platforms) if x.strip()]
        out = []
        for p in (platforms or ["all"]):
            key = p.lower().strip()
            if key in s.SOCIAL_ALIASES:
                out.extend(s.SOCIAL_ALIASES[key])
            elif key in s.SOCIAL_SIZES:
                out.append(key)
        # sin duplicados, preservando orden
        return list(dict.fromkeys(out)) or ["instagram_post"]

    # ── Internet: buscar y leer páginas (sin API key) ──────────────
    _UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                         "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
           "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
           "Accept-Language": "es,en;q=0.9", "Referer": "https://duckduckgo.com/"}

    def _ddg_html(s, q):
        """Resultados web de DuckDuckGo HTML. Devuelve lista de (titulo, url, snippet)."""
        try:
            r = requests.post("https://html.duckduckgo.com/html/",
                              data={"q": q, "kl": "wt-wt"}, headers=s._UA, timeout=15)
        except requests.RequestException:
            return []
        if r.status_code != 200:
            return []
        html_txt, out = r.text, []
        for m in re.finditer(
                r'result__a[^>]*href="(?P<href>[^"]+)"[^>]*>(?P<title>.*?)</a>', html_txt, re.DOTALL):
            href = _html.unescape(m.group("href"))
            um = re.search(r"[?&]uddg=([^&]+)", href)   # DDG envuelve en /l/?uddg=<url>
            if um:
                href = urllib.parse.unquote(um.group(1))
            title = _html.unescape(re.sub(r"<[^>]+>", "", m.group("title"))).strip()
            snip = ""
            sm = re.search(r'result__snippet[^>]*>(.*?)</a>', html_txt[m.end():m.end() + 2000], re.DOTALL)
            if sm:
                snip = _html.unescape(re.sub(r"<[^>]+>", "", sm.group(1))).strip()
            if title and href.startswith("http"):
                out.append((title, href, snip))
            if len(out) >= 8:
                break
        return out

    def _ddg_instant(s, q):
        """Fallback: API JSON de instant answers (abstract + temas relacionados)."""
        try:
            d = requests.get("https://api.duckduckgo.com/",
                             params={"q": q, "format": "json", "no_html": 1, "no_redirect": 1},
                             headers=s._UA, timeout=15).json()
        except (requests.RequestException, ValueError):
            return []
        out = []
        if d.get("AbstractText") and d.get("AbstractURL"):
            out.append((d.get("Heading") or q, d["AbstractURL"], d["AbstractText"]))
        for t in d.get("RelatedTopics", []):
            if isinstance(t, dict) and t.get("Text") and t.get("FirstURL"):
                out.append((t["Text"][:80], t["FirstURL"], t["Text"]))
            if len(out) >= 8:
                break
        return out

    def _bing_html(s, q):
        """Segundo motor: Bing HTML (aguanta mucho mejor el scraping que DDG).
        Devuelve lista de (titulo, url, snippet)."""
        try:
            r = requests.get("https://www.bing.com/search",
                             params={"q": q, "count": 10, "setlang": "es"},
                             headers=s._UA, timeout=15)
        except requests.RequestException:
            return []
        if r.status_code != 200:
            return []
        out = []
        # cada resultado orgánico viene en <li class="b_algo"> con <h2><a href>
        for m in re.finditer(
                r'<li class="b_algo".*?<h2[^>]*><a[^>]*href="(?P<href>[^"]+)"[^>]*>(?P<title>.*?)</a></h2>(?P<rest>.*?)</li>',
                r.text, re.DOTALL):
            href = _html.unescape(m.group("href"))
            title = _html.unescape(re.sub(r"<[^>]+>", "", m.group("title"))).strip()
            sm = re.search(r"<p[^>]*>(.*?)</p>", m.group("rest"), re.DOTALL)
            snip = _html.unescape(re.sub(r"<[^>]+>", "", sm.group(1))).strip() if sm else ""
            if title and href.startswith("http"):
                out.append((title, href, snip))
            if len(out) >= 8:
                break
        return out

    def _mojeek_html(s, q):
        """Tercer motor: Mojeek (índice propio, tolerante al scraping)."""
        try:
            r = requests.get("https://www.mojeek.com/search",
                             params={"q": q}, headers=s._UA, timeout=15)
        except requests.RequestException:
            return []
        if r.status_code != 200:
            return []
        out = []
        for m in re.finditer(r'<h2><a href="(?P<href>[^"]+)"[^>]*>(?P<title>.*?)</a>',
                             r.text, re.DOTALL):
            href = _html.unescape(m.group("href"))
            title = _html.unescape(re.sub(r"<[^>]+>", "", m.group("title"))).strip()
            sm = re.search(r'<p class="s">(.*?)</p>', r.text[m.end():m.end() + 1500], re.DOTALL)
            snip = _html.unescape(re.sub(r"<[^>]+>", "", sm.group(1))).strip() if sm else ""
            if title and href.startswith("http"):
                out.append((title, href, snip))
            if len(out) >= 8:
                break
        return out

    _search_cache = {}   # query  (timestamp, resultado) — no martillar los motores

    def _web_search(s, query):
        """Busca en internet sin API key. Cadena de motores: DuckDuckGo HTML 
        Bing HTML  Mojeek  instant answers de DDG. Cachea 5 min por consulta
        para no gatillar límites de peticiones con búsquedas repetidas."""
        q = (query or "").strip()
        if not q:
            return " Falta la búsqueda (query)"
        hit = s._search_cache.get(q.lower())
        if hit and time.time() - hit[0] < 300:
            return hit[1]
        res = s._ddg_html(q) or s._bing_html(q) or s._mojeek_html(q) or s._ddg_instant(q)
        if not res:
            return (f"(no obtuve resultados web para «{q}» en ningún motor — puede ser "
                    "un tema de red. Si sabés una URL, leela directo con web_fetch.)")
        out = "\n".join(
            f"• {t}\n  {u}" + (f"\n  {sn[:200]}" if sn else "") for t, u, sn in res)
        s._search_cache[q.lower()] = (time.time(), out)
        if len(s._search_cache) > 60:
            s._search_cache.pop(next(iter(s._search_cache)))
        return out

    def _web_fetch(s, url):
        """Descarga una URL y devuelve su texto legible (sin HTML/scripts)."""
        url = (url or "").strip()
        if not url.startswith(("http://", "https://")):
            url = "https://" + url
        try:
            r = requests.get(url, headers=s._UA, timeout=20)
            r.raise_for_status()
        except requests.RequestException as e:
            return f" No pude abrir {url}: {e}"
        ct = r.headers.get("content-type", "")
        text = r.text
        if "html" in ct or re.search(r"<html", text[:500], re.IGNORECASE):
            # sacar script/style y tags  texto plano
            text = re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>", " ", text)
            text = re.sub(r"(?s)<[^>]+>", " ", text)
            text = _html.unescape(text)
            text = re.sub(r"[ \t]+", " ", text)
            text = re.sub(r"\n\s*\n\s*\n+", "\n\n", text).strip()
        cap = 8000
        return text[:cap] + (f"\n\n… (recortado; la página tiene {len(text)} chars)" if len(text) > cap else "")

    def _check_svg(s, path):
        """Validación estructural barata del SVG (antes de gastar en visión):
        XML válido, tiene viewBox o width/height, sin NaN en el path data."""
        try:
            import xml.dom.minidom as minidom
            src = Path(path).read_text(encoding="utf-8", errors="replace")
        except (OSError, ValueError):
            return ""
        issues = []
        try:
            minidom.parseString(src)
        except Exception as e:
            return f"SVG mal formado (XML inválido): {e}"
        if "viewBox" not in src and not re.search(r"<svg[^>]*\bwidth=", src):
            issues.append("falta viewBox (o width/height) en <svg> — el lienzo queda indefinido")
        if re.search(r"[dxy]=\"[^\"]*\bNaN\b", src):
            issues.append("hay 'NaN' en coordenadas — algún cálculo falló")
        return "; ".join(issues)

    def _vision_target(s):
        """Elige (provider_obj, etiqueta) con capacidad de visión para criticar.
        Config opcional agent.design_critic = 'provider/modelo'. Si no hay ninguno
        con visión, devuelve (None, motivo)."""
        crit = (s.cfg.data.get("agent", {}).get("design_critic") or "").strip()
        if crit and "/" in crit:
            pv, _, md = crit.partition("/")
            try:
                return s._mk_provider(pv.strip(), md.strip()), crit
            except Exception:
                pass
        provs = s.cfg.data.get("providers", {})
        # candidatos conocidos con visión, por preferencia. Incluye DigitalOcean
        # con un VL abierto (anda en el tier base) para que la crítica funcione con
        # el setup de DO, no solo con OpenAI/Anthropic (propietarios/gateados).
        cands = [
            ("openai", "gpt-4o"),
            ("siliconflow", "Qwen/Qwen3-VL-8B-Instruct"),
            ("digitalocean", "nemotron-nano-12b-v2-vl"),
            ("anthropic", "claude-sonnet-4-5"),
            ("qwen", "qwen-vl-plus"),
        ]
        for pv, md in cands:
            if provs.get(pv, {}).get("api_key"):
                try:
                    return s._mk_provider(pv, md), f"{pv}/{md}"
                except Exception:
                    continue
        return None, "no hay proveedor con visión configurado (OpenAI, SiliconFlow, DigitalOcean, Anthropic o Qwen)"

    def _critique_design(s, svg, request):
        """Rasteriza el SVG, se lo muestra a un modelo de visión y devuelve una
        crítica accionable (o '' si está bien / no se puede criticar)."""
        prov, tag = s._vision_target()
        if not prov:
            return ""
        png, err = s._rasterize_svg(svg)
        if err or not png:
            log(f"rasterize falló: {err}")
            return ""
        try:
            content = [
                {"type": "text", "text":
                 "Sos un director de arte. Esta imagen es el render de un SVG generado para: "
                 f"«{(request or 'un diseño')[:300]}». Decí en 2 a 4 viñetas CONCRETAS qué está "
                 "visualmente MAL o mejorable: proporciones, alineación, elementos fuera del "
                 "lienzo o cortados, texto ilegible/desbordado, solapamientos no intencionales, "
                 "colores/contraste, espaciado. Si está correcto y prolijo, respondé exactamente OK."},
                {"type": "image_url", "image_url": {"url": png}},
            ]
            r = prov.chat([{"role": "user", "content": content}],
                          system_prompt="Respondés con viñetas breves y accionables, o 'OK'.",
                          temperature=0.2, max_tokens=300)
            out = re.sub(r"<think>.*?</think>", "", r.content or "", flags=re.DOTALL).strip()
            if not out or out.strip().upper().startswith("OK"):
                return ""
            return out
        except Exception as e:
            log(f"critique_design falló ({tag}): {e}")
            return ""

    def _check_design_written(s, request):
        """Crítica visual de los .svg escritos este turno (auto-verificación).
        ON por default (el vector es lo más precario de los modelos  hay que mirarlo).
        Desactivable con agent.verify_design=false. Revisa TODOS los .svg del turno."""
        if not s.cfg.data.get("agent", {}).get("verify_design", True):
            return ""
        svgs = [p for p in dict.fromkeys(s._written) if p.lower().endswith(".svg")]
        if not svgs:
            return ""
        reports = []
        for p in svgs[-3:]:                     # hasta 3 diseños tocados este turno
            base = os.path.basename(p)
            struct = s._check_svg(p)
            try:
                svg = Path(p).read_text(encoding="utf-8", errors="replace")
            except OSError:
                continue
            s._push("sys", f" Mirando {base} para revisar el diseño…")
            visual = s._critique_design(svg, request)
            parts = []
            if struct:
                parts.append("Estructura: " + struct)
            if visual:
                parts.append("Revisión visual:\n" + visual)
            if parts:
                reports.append(f"{base}:\n" + "\n".join(parts))
        return "\n\n".join(reports)

    def _run_model(s, ms, sp, temperature, max_tok, use_tools, tools=None):
        """Llama al modelo con STREAMING real: empuja content y reasoning
        ('pensamiento') a la UI a medida que llegan. Devuelve el AIResponse final.
        `s._live` queda True si el texto de la respuesta se mostró en vivo.
        `tools`: subconjunto ya filtrado (tool gating); si no se pasa, todos."""
        tools = (tools if tools is not None else s._get_tools()) if use_tools else None
        s._live = False
        if getattr(s.prov, "supports_stream", False):
            started = thinking = False
            r = None
            for ev in s.prov.chat_stream(ms, system_prompt=sp, temperature=temperature,
                                         max_tokens=max_tok, tools=tools):
                t = ev["type"]
                if t == "reasoning":
                    if not thinking:
                        s._push("think_start", {}); thinking = True
                    s._push("think_delta", ev["text"])
                elif t == "content":
                    if thinking:
                        s._push("think_end", {}); thinking = False
                    if not started:
                        s._push("agent_start", {}); started = True
                    s._push("agent_delta", ev["text"])
                elif t == "done":
                    r = ev["response"]
                if s._cancel:      # el usuario apretó detener  cortar el stream
                    break
            if thinking:
                s._push("think_end", {})
            if started:
                s._push("agent_end", {})
            s._live = started
            return r
        # provider sin streaming (Anthropic): una sola llamada bloqueante
        return s.prov.chat(ms, system_prompt=sp, temperature=temperature,
                           max_tokens=max_tok, tools=tools)

    def send_chat(s, msg, code, lang, image=None):
        r = None
        s._written = []
        s._checkpoint = {}   # arranca el checkpoint del turno
        s._cancel = False
        sid0 = s.ses_id      # charla a la que pertenece ESTE turno (anti-mezcla)
        try:
            ctx = ""
            # PODA de contexto por turno: mandar editor+árbol enteros solo al arrancar
            # la charla o cuando el mensaje los referencia; el resto de los turnos el
            # agente ya tiene contexto y puede usar list_files/read_file (ahorra tokens).
            first_turn = not s._mem
            code_relevant = bool(re.search(
                r"editor|este c[oó]digo|esta func|refactor|arregl|\bbug\b|\bfix\b|"
                r"l[ií]nea|archivo abierto|el c[oó]digo|lo de arriba", msg or "", re.I))
            if code.strip() and not code.startswith("//") and (first_turn or code_relevant):
                ctx += f"Editor ({lang}):\n```{lang}\n{code[:2500]}\n```\n"
            if s.ws and first_turn:
                cf = list(s._iter_files(Path(s.ws)))
                if cf:
                    ctx += "Proyecto:\n" + "\n".join(
                        f"  {f.relative_to(s.ws)}" for f in cf[:12]) + "\n"
            sp = (s.cfg.data.get("system_prompt") or "").strip() or DEFAULT_SP
            # Reflexion: re-inyectar las lecciones aprendidas de errores previos
            lessons = s._load_lessons()
            if lessons:
                sp += ("\n\nLECCIONES APRENDIDAS de errores previos (RESPETALAS estrictamente):\n"
                       + "\n".join(f"- {x['txt']}" for x in lessons[-12:]))
            # Delegación: qué proveedores puede usar el agente con ask_model
            _active = s.cfg.get_active_provider()
            _avail = [p for p, dd in s.cfg.data.get("providers", {}).items()
                      if p not in s.MEDIA_ONLY and p != _active
                      and (dd.get("api_key") or p == "custom")]
            if _avail:
                sp += ("\n\nDELEGACIÓN (herramienta ask_model): para AHORRAR recursos, derivá "
                       "subtareas SIMPLES o mecánicas (resumir, traducir, reformatear, texto "
                       "trivial, clasificar, listar ideas, boilerplate) a un modelo más barato/"
                       "rápido y reservate vos (el modelo actual) para lo complejo. Proveedores "
                       "disponibles para delegar: " + ", ".join(_avail) + ". Para DigitalOcean, "
                       "los modelos abiertos (deepseek-v4-pro, glm-5.2, qwen3-coder-flash, "
                       "openai-gpt-oss-120b) son baratos y buenos. No delegues lo que necesite "
                       "tus otras herramientas (archivos, git, imágenes).")
            # Habilidades: inyectar solo las relevantes al pedido (patrón positivo).
            # OJO CACHE: esto varía por mensaje  NO va en el system prompt (rompería
            # el prefijo cacheado). Se agrega al mensaje del usuario (parte no cacheada).
            rel_skills = s._relevant_skills(msg)
            skills_hint = ""
            if rel_skills:
                skills_hint = ("HABILIDADES APRENDIDAS aplicables a este pedido (usalas como guía):\n"
                               + "\n".join(f"• {sk['name']} — cuándo: {sk.get('when','')}\n"
                                           f"  pasos: {sk.get('steps','')}" for sk in rel_skills)
                               + "\n\n")
            # Memoria del proyecto: hechos durables de ESTE workspace (stack, servers,
            # comandos, convenciones). Se carga entre sesiones para no arrancar de cero.
            pmem = s._load_project_memory()
            if pmem:
                sp += ("\n\nMEMORIA DE ESTE PROYECTO (contexto persistente, tenelo en cuenta):\n"
                       + pmem[:3000])
            # Fichas de personaje: el agente las conoce SIEMPRE (para nombrarlos en
            # los prompts, actualizarlas si el diseño evoluciona y no redibujarlos)
            pchars = s._load_characters()
            if pchars:
                sp += ("\n\nPERSONAJES DEL PROYECTO (hojas de modelo canónicas — su aspecto "
                       "NO cambia jamás entre generaciones; nombralos en cada prompt):\n"
                       + "\n".join(f"• {c['name']}: {c['desc'][:400]}" for c in pchars[-8:]))
            # imagen adjunta (visión): arma el content multimodal formato OpenAI
            # ({"type":"image_url",...}); cada provider lo traduce si hace falta
            # (ver _msgs_to_anthropic). No se guarda en la memoria del turno para
            # no arrastrar el base64 (pesado) a los mensajes siguientes.
            user_text = skills_hint + ctx + msg
            if image and image.get("data"):
                user_content = [
                    {"type": "text", "text": user_text or "Describí esta imagen."},
                    {"type": "image_url", "image_url": {
                        "url": f"data:{image.get('mime', 'image/png')};base64,{image['data']}"}},
                ]
            else:
                user_content = user_text
            # memoria: incluir los últimos turnos para que el agente tenga contexto
            ms = list(s._mem[-s._mem_limit():]) + [{"role": "user", "content": user_content}]
            text = ""
            use_tools = True
            flubs = 0
            fixes = 0
            rt_fixes = 0      # correcciones pedidas por errores de EJECUCIÓN (runtime)
            design_fixes = 0  # correcciones pedidas por la revisión visual de un .svg
            max_tok = 8192   # se ajusta solo (413 lo baja, archivo cortado lo sube)
            seen_calls = {}   # (tool, args) -> veces repetida en este turno  detectar bucles
            stall = 0         # tramos seguidos sin ejecutar ninguna tool
            stalled_out = False
            hit_cap = False
            tool_runs = 0     # tools que AVANZARON (resultado sin )  progreso real
            fail_streak = 0   # tools seguidas que fallaron sin ningún éxito en el medio
            edit_fails = 0    # edit_file fallidos seguidos  escalar la guía
            recovery_attempts = 0  # recuperaciones automáticas antes de cortar el turno
            # cadena de failover: si el modelo actual se cae/agota, saltar al siguiente
            chain = s._chain()   # [(proveedor, modelo), ...]
            ci = 0
            if chain:
                s.prov = s._mk_provider(*chain[0])
            # imagen adjunta + modelo sin visión  cambiar SOLO este turno a un
            # modelo que VEA (antes fallaba o el modelo ignoraba la imagen)
            if image and image.get("data"):
                cur = (chain[0][1] if chain and chain[0][1] else
                       s.cfg.get_model(s.cfg.get_active_provider()) or "")
                looks_vision = any(k in cur.lower() for k in
                                   ("vl", "vision", "gpt-4o", "claude", "gemini", "pixtral"))
                if not looks_vision:
                    vp, vtag = s._vision_target()
                    if vp:
                        s.prov = vp
                        chain = [(vtag.split("/")[0], "/".join(vtag.split("/")[1:]))] + chain
                        s._push("sys", f" Imagen adjunta  uso {vtag} para este mensaje (tu modelo no ve imágenes)")
                    else:
                        s._push("sys", " Tu modelo no ve imágenes y no hay ninguno con visión configurado — la imagen puede ser ignorada")
            # Límites del agente: configurables desde  (config "agent"). La filosofía
            # de LOW es NO ponerle techo al trabajo — el único freno real es que el
            # agente deje de AVANZAR (bucle) o el costo/límite de la API. max_steps =
            # rondas de tools por tramo; max_continuations = cuántas veces sigue solo.
            ag = s.cfg.data.get("agent", {})
            cfg_steps = int(ag.get("max_steps", 40) or 40)
            # el piso asegura suficientes intentos para agotar la cadena de failover
            max_attempts = max(cfg_steps, len(chain) * 3 + 4)
            continuations = 0
            # 0 = el agente NUNCA se auto-continúa: termina el turno y ESPERA la
            # respuesta del usuario (evita los loops de "sigo trabajando").
            MAX_AUTO_CONTINUATIONS = int(ag.get("max_continuations", 0) or 0)
            no_progress = 0            # tramos seguidos sin ningún avance  ahí sí paramos
            STALL_LIMIT = max(3, int(ag.get("max_stall", 6) or 6))  # margen anti-corte prematuro
            verified_ok = False        # el turno terminó limpio (sin errores)  aprender habilidad
            turn_tools = s._session_tools(msg)   # tool gating por sesión (cache estable)
            while True:
                hit_cap = False
                # estado al inicio del tramo: el progreso se mide POR TRAMO (no
                # acumulado global), así un bucle que ejecuta tools "exitosas" en
                # círculo ya no se disfraza de avance y el turno vuelve al usuario.
                marker_start = (len(dict.fromkeys(s._written)), tool_runs)
                for attempt in range(max_attempts):
                    if s._cancel:
                        return {"text": " Detenido.", "status": "Detenido"}
                    try:
                        # temperatura baja: las llamadas a herramientas requieren
                        # JSON exacto y los Llama en Groq lo fallan con temp alta
                        r = s._run_model(ms, sp, 0.2, max_tok, use_tools, turn_tools)
                    except Exception as e:
                        err = str(e)
                        low = err.lower()
                        decom = "decommission" in low
                        # 413: el request excede el límite por minuto (típico free tier) 
                        # achicar la respuesta pedida y reintentar en el mismo modelo
                        if ("413" in err or "too large" in low or "reduce your message" in low) \
                                and max_tok > 1024:
                            max_tok = max(1024, max_tok // 2)
                            log(f"413  reintento con max_tokens={max_tok}")
                            continue
                        if use_tools and "400" in err and not decom:
                            if "Failed to call a function" in err or "tool_use_failed" in err:
                                # el modelo armó mal el JSON de la tool call:
                                # es aleatorio, reintentar suele alcanzar
                                flubs += 1
                                log(f"tool call malformada (intento {flubs}): {err[:200]}")
                                if flubs <= 2:
                                    continue
                                use_tools = False
                                s._push("sys", " El modelo falló 3 veces armando la llamada a herramienta — respondo sin herramientas este mensaje")
                                continue
                            use_tools = False
                            log(f"tools deshabilitadas tras 400: {err[:200]}")
                            s._push("sys", " Este modelo no acepta herramientas — respondo sin ellas (no puede crear archivos)")
                            continue
                        # ── FAILOVER: modelo caído/agotado/dado de baja  siguiente ──
                        if (s._is_failover(err) or decom) and ci + 1 < len(chain):
                            prev = chain[ci][0]
                            ci += 1
                            nxt, nxt_model = chain[ci]
                            s.prov = s._mk_provider(nxt, nxt_model)
                            s._push("sys", f" {prev} no disponible ({err[:50].strip()}…) "
                                           f" cambiando automáticamente a {nxt} · {nxt_model or 'default'}")
                            log(f"failover {prev}  {nxt}/{nxt_model}: {err[:150]}")
                            use_tools = True
                            flubs = 0
                            continue
                        # sin más proveedores en la cadena  mensaje útil, no el stack crudo
                        if ("11434" in err or "10061" in err or "connection refused" in low
                                or ("localhost" in low and "connection" in low)):
                            return {"text": " Ollama no está corriendo en localhost:11434. "
                                            "Arrancalo (`ollama serve`, con un modelo instalado) "
                                            "o elegí otro proveedor con API key en  (arriba a la "
                                            "izquierda).", "status": "Error"}
                        if "403" in err and ("subscription" in low or "tier" in low):
                            return {"text": " Ese modelo necesita un tier de suscripción más alto "
                                            "(en DigitalOcean los PROPIETARIOS —Claude, GPT-4o/GPT-5, "
                                            "o-series— están gateados). Elegí en el selector uno "
                                            "ABIERTO, que sí anda en tu plan: deepseek-v4-pro, "
                                            "glm-5.2, kimi-k2.6, llama-4-maverick, qwen3-coder-flash "
                                            "u openai-gpt-oss-120b.",
                                    "status": "Error"}
                        if "429" in err or "rate limit" in low:
                            return {"text": "⏳ Límite de requests por minuto alcanzado (429) en "
                                            "todos los proveedores disponibles. Esperá ~1 minuto y "
                                            "seguí, o cargá otra API key en  para repartir la carga. "
                                            "Tip: en tareas grandes conviene un tier más alto o menos "
                                            "verificaciones (  agente).",
                                    "status": "Rate limit"}
                        raise
                    # el usuario detuvo (o el stream se cortó sin respuesta)
                    if s._cancel or r is None:
                        return {"streamed": bool(getattr(s, "_live", False)),
                                "full": "", "text": "" if getattr(s, "_live", False) else " Detenido.",
                                "status": "Detenido"}
                    raw = r.raw or {}
                    msg_resp = raw.get("choices", [{}])[0].get("message", {})
                    tcs = msg_resp.get("tool_calls", [])
                    if not tcs:
                        text = msg_resp.get("content", "") or r.content
                        # verificación del harness: si escribió .py con sintaxis rota,
                        # devolverle el error para que lo corrija antes de terminar
                        errs = s._check_written()
                        if errs and use_tools and fixes < 2:
                            fixes += 1
                            # si el error pinta a corte por limite de tokens (archivo
                            # a medio escribir), subir el techo en vez de solo reintentar
                            # con el mismo limite — si no, va a cortarse igual de nuevo
                            trunc = any(h in errs.lower() for h in
                                        ("unexpected eof", "was never closed",
                                         "unterminated", "eol while scanning"))
                            if trunc and max_tok < 16384:
                                max_tok = min(16384, max_tok * 2)
                                s._push("sys", f" El archivo parece haberse cortado por el límite de tokens — subo a {max_tok} y pido que lo reescriba completo ({fixes}/2)…")
                            else:
                                s._push("sys", f" Verifiqué el código y tiene errores de sintaxis — pidiendo corrección ({fixes}/2)…")
                            ms.append({"role": "assistant", "content": text})
                            ms.append({"role": "user", "content":
                                       "Verifiqué los archivos que escribiste y tienen errores de sintaxis:\n"
                                       + errs +
                                       "\nCorregilos: si el archivo es grande preferi edit_file sobre el "
                                       "fragmento roto; si usas write_file escribi el archivo COMPLETO. "
                                       "Confirma en una linea."})
                            text = ""
                            continue
                        if errs:
                            s._push("sys", f" Quedaron errores de sintaxis sin resolver:\n{errs}")
                            s._reflect_and_learn(msg, f"dejaste código con errores de sintaxis: {errs[:200]}")
                            break
                        # sintaxis OK  verificación de EJECUCIÓN: correr el punto de
                        # entrada y, si revienta en runtime, pedir corrección con el
                        # traceback (no alcanza con que compile: tiene que ANDAR)
                        rt = s._check_runtime()
                        if rt and use_tools and rt_fixes < 2:
                            rt_fixes += 1
                            s._push("sys", f" Compila pero falla al ejecutarse — pidiendo corrección ({rt_fixes}/2)…")
                            ms.append({"role": "assistant", "content": text})
                            ms.append({"role": "user", "content":
                                       "Verifiqué ejecutando el código y falla en tiempo de ejecución:\n"
                                       + rt +
                                       "\nCorregí la causa real del error (leé el traceback) y dejalo "
                                       "andando. Usá edit_file para el cambio puntual. Confirmá en una línea."})
                            text = ""
                            continue
                        if rt:
                            s._push("sys", f" Quedó un error de ejecución sin resolver:\n{rt}")
                            s._reflect_and_learn(msg, f"dejaste código que compila pero falla al correr: {rt[:200]}")
                            break
                        # VECTORES: si escribió un .svg, que el modelo lo VEA (render +
                        # crítica visual) y lo corrija — el agente no dibuja a ciegas.
                        dz = s._check_design_written(msg)
                        if dz and use_tools and design_fixes < 3:
                            design_fixes += 1
                            s._push("sys", f" Revisé el diseño y hay cosas para mejorar — pidiendo ajuste ({design_fixes}/3)…")
                            ms.append({"role": "assistant", "content": text})
                            ms.append({"role": "user", "content":
                                       "Rendericé el SVG y lo revisé visualmente. Observaciones:\n" + dz +
                                       "\nAjustá el SVG con edit_file para resolver eso (mantené todo dentro "
                                       "del viewBox, alineado y legible). Confirmá en una línea."})
                            text = ""
                            continue
                        verified_ok = True   # sin errores de sintaxis, ejecución ni diseño pendiente
                        break
                    asst = {"role": "assistant",
                            "content": msg_resp.get("content", ""), "tool_calls": tcs}
                    # Los modelos "thinking" de DeepSeek EXIGEN que se les devuelva su
                    # reasoning_content junto al mensaje con tool_calls, o responden
                    # 400 "The reasoning_content in the thinking mode must be passed
                    # back". El transport ya lo captura en raw  lo reinyectamos.
                    if msg_resp.get("reasoning_content"):
                        asst["reasoning_content"] = msg_resp["reasoning_content"]
                    ms.append(asst)
                    progressed = False   # ¿alguna tool AVANZÓ (no error) en esta ronda?
                    ran_any = False      # ¿se ejecutó alguna tool (aunque falle)?
                    for tc in tcs:
                        fn = tc["function"]["name"]
                        try:
                            args = json.loads(tc["function"]["arguments"])
                        except (json.JSONDecodeError, TypeError):
                            args = {}
                        # bucle sin avance: la MISMA llamada (herramienta + argumentos)
                        # ya se ejecutó antes en este turno  no repetirla, avisar.
                        # exec_cmd/run_code quedan afuera: repetirlos SI puede tener
                        # sentido (ej. correr los tests de nuevo tras un fix).
                        # Una lectura idéntica vuelve a ser válida después de una edición:
                        # agregamos la revisión del workspace a su firma. Sin esto el agente
                        # no podía verificar el archivo que acababa de modificar.
                        revision = len(s._written) if fn in (
                            "read_file", "list_files", "search_code") else 0
                        sig = (fn, json.dumps(args, sort_keys=True,
                                              ensure_ascii=False), revision)
                        dedupe = fn not in ("exec_cmd", "run_code")
                        seen_calls[sig] = seen_calls.get(sig, 0) + 1
                        if dedupe and seen_calls[sig] > 1:
                            res = (" Ya ejecutaste exactamente esta misma llamada antes en "
                                   "este turno — el resultado va a ser igual. No la repitas: "
                                   "cambia de enfoque o responde con lo que ya tenes.")
                        else:
                            s._push("tool_start", {"name": fn})
                            res = s._exec_tool(fn, args, code, lang)
                            ran_any = True
                        # avance REAL = la tool no devolvió error. Un  (típico:
                        # edit_file que no encuentra el fragmento) NO es progreso —
                        # antes se contaba como tal y por eso los bucles no se
                        # detectaban y se quemaban los 40×25 pasos en silencio.
                        err = s._is_tool_err(res)
                        if not err:
                            progressed = True
                            tool_runs += 1
                            fail_streak = 0
                            if fn == "edit_file":
                                edit_fails = 0
                        else:
                            fail_streak += 1
                            if fn == "edit_file":
                                edit_fails += 1
                        ms.append({"role": "tool", "tool_call_id": tc.get("id", ""),
                                   "content": res})
                        # tras 2 edit_file fallidos seguidos, empujar a que RELEA el
                        # archivo antes de reintentar (rompe el bucle de indentación)
                        if err and fn == "edit_file" and edit_fails == 2:
                            ms.append({"role": "user", "content":
                                       "Van 2 edit_file seguidos que fallan en el mismo archivo. "
                                       "PARÁ de adivinar el old_text: llamá read_file de esa zona, "
                                       "copiá el fragmento EXACTO tal cual aparece, y recién ahí "
                                       "edit_file. Si igual no entra, reescribí el archivo con "
                                       "write_file (contenido completo)."})
                        # Enviar detalles más específicos de la herramienta
                        tool_info = {"name": fn, "res": str(res)[:150], "error": bool(err)}
                        if fn in ("write_file", "edit_file", "read_file") and "path" in args:
                            tool_info["file"] = args["path"]
                        s._push("tool", tool_info)
                    # Recuperación automática: una racha de errores ya no corta el
                    # trabajo en el primer incidente. LOW devuelve el diagnóstico al
                    # modelo y le exige releer/cambiar de estrategia. Solo abandona si
                    # también fracasan las recuperaciones configuradas.
                    max_failures = max(4, int(ag.get("max_tool_failures", 12) or 12))
                    max_recoveries = max(1, int(ag.get("max_recovery_attempts", 3) or 3))
                    if fail_streak >= max_failures:
                        if recovery_attempts < max_recoveries:
                            recovery_attempts += 1
                            fail_streak = 0
                            edit_fails = 0
                            stall = 0
                            ms.append({"role": "user", "content":
                                       "RECUPERACIÓN AUTOMÁTICA: las últimas herramientas "
                                       "fallaron. No termines ni repitas la misma llamada. "
                                       "Leé el último error, inspeccioná el estado real con "
                                       "read_file/list_files y continuá con una estrategia "
                                       "distinta. Si la tarea ya está resuelta, respondé con "
                                       "un resumen final."})
                            s._push("sys", f"↻ Recuperando al agente tras errores de herramienta "
                                           f"({recovery_attempts}/{max_recoveries})…")
                        else:
                            stalled_out = True
                            s._push("sys", " El agente no pudo recuperarse de varios errores de herramienta.")
                            break
                    # Progreso significa éxito, no simplemente haber invocado una tool.
                    stall = 0 if progressed else stall + 1
                    if stall >= STALL_LIMIT:
                        if recovery_attempts < max_recoveries:
                            recovery_attempts += 1
                            stall = 0
                            ms.append({"role": "user", "content":
                                       "RECUPERACIÓN AUTOMÁTICA: estás repitiendo acciones sin "
                                       "obtener un resultado nuevo. Conservá lo ya hecho, cambiá "
                                       "de enfoque y avanzá con el siguiente paso concreto."})
                            s._push("sys", f"↻ Cambiando de estrategia automáticamente "
                                           f"({recovery_attempts}/{max_recoveries})…")
                        else:
                            stalled_out = True
                            s._push("sys", " El agente siguió repitiendo acciones después de recuperarse.")
                            break
                else:
                    # se agotaron los pasos de herramientas sin llegar a una respuesta final
                    hit_cap = True
                # ¿hubo avance real en este tramo? (archivos nuevos o tools ejecutadas)
                marker = (len(dict.fromkeys(s._written)), tool_runs)
                if marker != marker_start:
                    no_progress = 0
                else:
                    no_progress += 1
                # Seguimos solos mientras el agente PROGRESE: solo paramos si se traba
                # (4 tramos sin ningún avance) o si tocamos el techo de seguridad
                # configurable (evita quemar tokens en un bucle infinito).
                if (hit_cap and not stalled_out and no_progress < STALL_LIMIT
                        and continuations < MAX_AUTO_CONTINUATIONS):
                    continuations += 1
                    s._push("sys", f"↻ Sigo trabajando en la tarea (tramo {continuations})…")
                    ms.append({"role": "user", "content":
                               "Segui trabajando en la tarea desde donde quedaste, sin repetir "
                               "lo que ya hiciste ni resumir. Si ya terminaste, decilo en una linea."})
                    continue
                break
            # código propuesto  tarjeta Aceptar/Rechazar en el frontend
            for mr in reversed(ms):
                if mr.get("role") == "assistant" and mr.get("content"):
                    bs = re.findall(r"```(?:\w+)?\n(.+?)```", mr["content"], re.DOTALL)
                    if bs and bs[0].strip() != "// Nuevo archivo":
                        s._push("propose", {"code": bs[0].strip()})
                    break
            # los modelos razonadores a veces dejan content vacío o con <think>
            text = re.sub(r"<think>.*?</think>", "", text or "", flags=re.DOTALL).strip()
            # resumen concreto de lo que SÍ se hizo en el turno (archivos tocados),
            # para no cerrar nunca con un mensaje vacío u opaco
            done = list(dict.fromkeys(s._written))
            done_str = ", ".join(Path(p).name for p in done)
            if not text and stalled_out:
                text = (" Corté el turno: el agente se trabó (repitió acciones o encadenó "
                        "errores de herramienta sin avanzar)." +
                        (f" Alcancé a tocar {len(done)} archivo(s): {done_str}."
                         if done else "") +
                        " Probá pedir algo más chico y específico, o dividí la tarea en pasos.")
                s._reflect_and_learn(msg, "te trabaste reintentando una herramienta que fallaba "
                                          "en vez de releer el archivo, corregir los argumentos o "
                                          "cambiar de enfoque")
            elif not text and hit_cap:
                n_esc = len(dict.fromkeys(s._written))
                toque = f" (toqué {n_esc} archivo(s))" if n_esc else ""
                if no_progress >= STALL_LIMIT:
                    text = ("⏸ Paré porque el agente dejó de avanzar (repetía sin progreso)"
                            + toque + ". Escribí «segui» para reintentar, cambiá de modelo, "
                            "o dividí un poco el pedido.")
                    s._reflect_and_learn(msg, "dejaste de avanzar repitiendo acciones sin progreso")
                else:
                    text = ("↻ Vengo trabajando la tarea en varios tramos" + toque +
                            f" y llegué al tope de {continuations} tramos automáticos "
                            "(seguridad para no quemar tokens). La conversación recuerda el "
                            "contexto: escribí «segui» y continúo desde donde quedé. Si es una "
                            "tarea siempre grande, subí «tramos automáticos» en .")
            if not text:
                # el modelo no cerró con texto pero SÍ hubo trabajo real  resumir yo
                # (antes esto caía en "el modelo no devolvió respuesta" y parecía que
                # no había pasado nada, cuando en realidad había editado archivos)
                if done:
                    text = (f" Listo. Toqué {len(done)} archivo(s): {done_str}. "
                            "(El modelo no dejó un resumen escrito, así que te lo resumo yo — "
                            "revisá los cambios y decime si querés ajustar algo.)")
                elif tool_runs:
                    text = (" Terminé de ejecutar las acciones del pedido. (El modelo no dejó "
                            "un resumen escrito.) Decime si querés que profundice en algo.")
                else:
                    try:
                        rc = (r.raw or {}).get("choices", [{}])[0] \
                            .get("message", {}).get("reasoning_content") or ""
                    except Exception:
                        rc = ""
                    text = rc.strip()[:1500] or \
                        " El modelo no devolvió respuesta (se quedó razonando o cortó). " \
                        "Probá de nuevo o cambiá de modelo."
            if r:
                cached = getattr(r, "cached_tokens", 0) or 0
                cache_txt = f" ·  {cached}t cache" if cached else ""
                status = f" {r.tokens_used}t{cache_txt} · ${r.cost:.4f} · {r.model}"
            else:
                status = "Listo"
            # guardar el turno en memoria (solo texto limpio, robusto entre modelos).
            # SOLO si seguimos en la misma charla: si el usuario cambió de solapa
            # mientras el agente trabajaba, no contaminar la memoria de la otra.
            if s.ses_id == sid0:
                s._mem.append({"role": "user", "content": msg})
                s._mem.append({"role": "assistant", "content": text})
                s._mem = s._mem[-s._mem_limit():]
            # aviso de undo si el turno escribió archivos
            if s._checkpoint:
                n = len(s._checkpoint)
                files_list = ", ".join(Path(p).name for p in s._checkpoint.keys())
                s._push("sys", f"✍ Escribí {n} archivo(s): {files_list} · escribí /undo para revertir este turno")
            # habilidad: aprender de un turno EXITOSO y no trivial (verificado sin
            # errores + trabajo real: archivos escritos o varias herramientas usadas)
            if verified_ok and not stalled_out and (len(dict.fromkeys(s._written)) or tool_runs >= 3):
                try:
                    resumen = f"Archivos: {', '.join(Path(p).name for p in dict.fromkeys(s._written)) or '—'}. {text[:300]}"
                    s._learn_skill(msg, resumen)
                except Exception as e:
                    log(f"learn_skill (turno) fallo: {e}")
            # si el texto ya se mostró en vivo por streaming, no re-renderizar
            if getattr(s, "_live", False) and text:
                return {"streamed": True, "full": text, "status": status}
            return {"text": text, "status": status}
        except Exception as e:
            import traceback
            log("send_chat fallo:\n" + traceback.format_exc())
            return {"text": f" {e}", "status": "Error"}

    def undo_turn(s):
        """Revierte todos los archivos que el agente escribió en el último turno."""
        if not s._checkpoint:
            return {"msg": "No hay nada que deshacer del último turno"}
        n = 0
        for path, prev in s._checkpoint.items():
            try:
                p = Path(path)
                if prev is None:
                    if p.exists():
                        p.unlink()
                else:
                    p.write_text(prev, encoding="utf-8")
                n += 1
            except OSError:
                pass
        s._checkpoint = {}
        return {"msg": f"↩ Revertidos {n} archivo(s) del último turno", "tree": s._tree()}

    # ── comparar modelos: desafío de código verificado ────
    def compare(s, task, expected, models):
        """Misma consigna a cada modelo; el harness compila, ejecuta y
        verifica la salida. Ranking por funcionalidad, después velocidad."""
        provs = s.cfg.data.get("providers", {})
        models = [m for m in models if m in provs
                  and (provs[m].get("api_key") or m == "custom")]
        if not models:
            s._push("sys", "Sin proveedores con key")
            return
        task = (task or "").strip()
        if not task:
            task = DEFAULT_TASK
            expected = expected or DEFAULT_EXPECTED

        def norm(t):
            return " ".join((t or "").replace(",", " ").split())
        exp = norm(expected)
        results = []

        def funciona(x):
            return x.get("salida_ok") or (x.get("salida_ok") is None and x.get("corre"))

        def run_one(pn):
            res = {"prov": pn, "model": provs[pn].get("model", "?"), "lat_ms": 0,
                   "tokens": 0, "costo": 0.0, "sintaxis": False, "corre": False,
                   "salida_ok": None, "detalle": "", "icon": ""}
            try:
                p = s._mk_provider(pn)
                t0 = time.time()
                r = p.chat([{"role": "user", "content": task +
                             "\nResponde UNICAMENTE con un bloque de codigo Python completo."}],
                           system_prompt="Sos un programador experto. Respondes SOLO con codigo.",
                           temperature=0.2)
                res.update(lat_ms=int((time.time() - t0) * 1000),
                           tokens=r.tokens_used, costo=r.cost, model=r.model)
                bs = re.findall(r"```(?:\w+)?\n(.+?)```", r.content, re.DOTALL)
                code = (bs[0] if bs else r.content).strip()
                try:
                    compile(code, "<cmp>", "exec")
                    res["sintaxis"] = True
                except SyntaxError as e:
                    res["detalle"] = f"sintaxis rota: {e.msg} (línea {e.lineno})"
                if res["sintaxis"]:
                    out = CodeRunner.run(code, "python", timeout=15)
                    res["corre"] = bool(out.get("success"))
                    if not res["corre"]:
                        res["detalle"] = "falla al correr: " + \
                            (out.get("stderr") or out.get("error") or "?").strip()[-160:]
                    elif exp:
                        res["salida_ok"] = exp in norm(out.get("stdout", ""))
                        if not res["salida_ok"]:
                            res["detalle"] = "salida distinta: " + \
                                out.get("stdout", "").strip()[:120]
                res["icon"] = ("" if funciona(res) else
                               "[Amarillo]" if res["corre"] else
                               "" if res["sintaxis"] else "")
                results.append(res)
                s._push("sys", f"{res['icon']} {pn} · {res['model']}: "
                               f"{res['lat_ms']}ms · {res['tokens']}t · ${res['costo']:.4f}"
                               + (f"\n   {res['detalle']}" if res["detalle"] else ""))
            except Exception as e:
                res["detalle"] = str(e)[:160]
                results.append(res)
                s._push("sys", f" {pn}: {res['detalle']}")

        def worker():
            s._push("sys", f"⚖ Desafío de código para {len(models)} modelos:\n«{task[:140]}»")
            ts = [threading.Thread(target=run_one, args=(m,), daemon=True) for m in models]
            for th in ts:
                th.start()
            for th in ts:
                th.join(timeout=150)
            orden = sorted(results, key=lambda x: (not funciona(x), not x["corre"],
                                                   not x["sintaxis"], x["lat_ms"] or 9e9))
            podio = "\n".join(f"{i + 1}. {x['icon']} {x['prov']} · {x['model']} — "
                              f"{x['lat_ms']}ms · ${x['costo']:.4f}"
                              for i, x in enumerate(orden))
            s._push("sys", "[Ranking] Ranking (código que funciona primero, velocidad después):\n" + podio)
            cmp_dir = data_dir() / 'comparativas'
            cmp_dir.mkdir(parents=True, exist_ok=True)
            fp = cmp_dir / f"cmp_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
            fp.write_text(json.dumps({"tarea": task, "esperado": expected,
                                      "resultados": results, "ts": time.time()},
                                     indent=2, ensure_ascii=False), encoding="utf-8")
            s._push("sys", f" Guardado: {fp.name}")
        threading.Thread(target=worker, daemon=True).start()

    # ── historial de sesiones ─────────────────────────────
    def persist(s, role, content, sid=None):
        """Guarda un mensaje en el historial. `sid` opcional: la charla a la que
        pertenece — si el usuario cambió de solapa mientras el agente trabajaba,
        la respuesta va a SU charla original y no a la que quedó abierta (antes
        se mezclaban las conversaciones)."""
        try:
            target = sid or s.ses_id
            entry = {"role": role, "content": content,
                     "ts": datetime.datetime.now().isoformat()}
            if target == s.ses_id:
                s.ses_msgs.append(entry)
                msgs = s.ses_msgs
            else:
                f = s.ses_dir / f"{target}.json"
                try:
                    msgs = json.loads(f.read_text(encoding="utf-8"))
                    if not isinstance(msgs, list):
                        msgs = []
                except (OSError, ValueError):
                    msgs = []
                msgs.append(entry)
            (s.ses_dir / f"{target}.json").write_text(
                json.dumps(msgs, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception:
            pass

    def _new_sid(s):
        """Id de sesión ÚNICO. El formato viejo (resolución de segundos) hacía
        que dos charlas creadas en el mismo segundo compartieran archivo y se
        MEZCLARAN los mensajes — la causa raíz de las conversaciones cruzadas."""
        base = datetime.datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        sid, n = base, 1
        while (s.ses_dir / f"{sid}.json").exists() or sid == getattr(s, "ses_id", None):
            n += 1
            sid = f"{base}_{n}"
        return sid

    def new_session(s):
        s.ses_id = s._new_sid()
        s.ses_msgs = []
        s._mem = []          # olvidar el contexto de conversación
        s._checkpoint = {}
        s._tool_mode = None  # re-detectar modo de tools (code/design) en la charla nueva
        return s.ses_id

    def enter_design_mode(s):
        """Entra al modo diseño con una sesión separada."""
        s._previous_session_id = s.ses_id
        if not s._design_session_id:
            s._design_session_id = s._new_sid()
        s.ses_id = s._design_session_id
        s.ses_msgs = []
        s._mem = []
        s._checkpoint = {}
        return {"session_id": s.ses_id, "previous_session_id": s._previous_session_id}

    def exit_design_mode(s):
        """Sale del modo diseño y vuelve a la sesión anterior."""
        if s._previous_session_id:
            s.ses_id = s._previous_session_id
            # Cargar mensajes de la sesión anterior
            f = s.ses_dir / f"{s.ses_id}.json"
            if f.exists():
                try:
                    s.ses_msgs = json.loads(f.read_text(encoding="utf-8"))
                except Exception:
                    s.ses_msgs = []
            else:
                s.ses_msgs = []
            # Reconstruir memoria
            s._mem = []
            for msg in s.ses_msgs:
                if msg.get("role") in ("user", "assistant"):
                    s._mem.append({"role": msg["role"], "content": msg.get("content", "")})
            s._mem = s._mem[-s._mem_limit():]
            s._previous_session_id = None
        return {"session_id": s.ses_id}

    def delete_session(s, sid):
        """Borra una conversación del historial (cerrar la solapa). Si es la
        activa, arranca una sesión nueva vacía. Devuelve el nuevo estado de
        solapas para que el frontend re-renderice."""
        try:
            f = s.ses_dir / f"{sid}.json"
            if f.exists():
                f.unlink()
        except OSError as e:
            log(f"delete_session({sid}) fallo: {e}")
            return {"error": str(e)}
        was_active = (sid == s.ses_id)
        if was_active:
            s.new_session()
        return {"deleted": sid, "was_active": was_active,
                "session_id": s.ses_id, "chats": s.history()}

    def leaderboard(s):
        """Ranking histórico agregando todas las comparativas guardadas."""
        cmp_dir = data_dir() / 'comparativas'
        stats = {}   # model -> dict
        n_desafios = 0
        for f in sorted(cmp_dir.glob("cmp_*.json")) if cmp_dir.exists() else []:
            try:
                data = json.loads(f.read_text(encoding="utf-8"))
            except Exception:
                continue
            res = data.get("resultados", [])
            if not res:
                continue
            n_desafios += 1

            def funciona(x):
                return x.get("salida_ok") or (x.get("salida_ok") is None and x.get("corre"))
            ganador = None
            orden = sorted(res, key=lambda x: (not funciona(x), not x.get("corre"),
                                               x.get("lat_ms") or 9e9))
            if orden and funciona(orden[0]):
                ganador = orden[0].get("model")
            for x in res:
                m = x.get("model", "?")
                d = stats.setdefault(m, {"model": m, "prov": x.get("prov", ""),
                                         "corridas": 0, "ok": 0, "wins": 0,
                                         "lat_total": 0, "lat_n": 0})
                d["corridas"] += 1
                if funciona(x):
                    d["ok"] += 1
                if x.get("lat_ms"):
                    d["lat_total"] += x["lat_ms"]
                    d["lat_n"] += 1
                if x.get("model") == ganador:
                    d["wins"] += 1
        tabla = []
        for d in stats.values():
            d["lat_prom"] = int(d["lat_total"] / d["lat_n"]) if d["lat_n"] else 0
            d["tasa"] = round(100 * d["ok"] / d["corridas"]) if d["corridas"] else 0
            tabla.append(d)
        tabla.sort(key=lambda d: (-d["wins"], -d["tasa"], d["lat_prom"] or 9e9))
        return {"n_desafios": n_desafios, "tabla": tabla}

    def ollama_models(s):
        """Detecta si Ollama corre localmente y devuelve sus modelos.
        Cachea el primer modelo para que el failover a 'custom' lo use."""
        base = s.cfg.data.get("providers", {}).get("custom", {}).get("base_url") \
            or "http://localhost:11434/v1"
        try:
            r = requests.get(f"{base.rstrip('/')}/models", timeout=2)
            if r.ok:
                ms = [m["id"] for m in r.json().get("data", [])]
                s._ollama = ms
                return ms
        except requests.RequestException:
            pass
        return []

    def history(s, limit=20):
        out = []
        try:
            for f in sorted(s.ses_dir.glob("*.json"), reverse=True)[:limit]:
                first, n = "(vacía)", 0
                try:
                    msgs = json.loads(f.read_text(encoding="utf-8"))
                    n = len(msgs)
                    # título = primer mensaje del usuario (los del sistema no describen)
                    um = next((m.get("content", "") for m in msgs
                               if m.get("role") == "user" and m.get("content")), "")
                    first = (um or (msgs[0].get("content", "") if msgs else ""))[:80] or "(vacía)"
                except Exception:
                    first = "(error)"
                out.append({"id": f.stem, "first": first, "n": n})
        except Exception:
            pass
        return out

    def resume(s, sid):
        f = s.ses_dir / f"{sid}.json"
        if not f.exists():
            return {"error": f"No existe: {sid}"}
        try:
            msgs = json.loads(f.read_text(encoding="utf-8"))
            s.ses_id = sid
            s.ses_msgs = msgs
            # Reconstruir _mem para que el modelo tenga contexto de la conversación.
            # OJO: el frontend guarda las respuestas del agente con rol "LOW"
            # (no "assistant") — hay que mapearlo o el modelo pierde su propio
            # contexto al restaurar una conversación.
            s._mem = []
            for m in msgs:
                role = m.get("role")
                if role == "user":
                    s._mem.append({"role": "user", "content": m.get("content", "")})
                elif role in ("assistant", "LOW"):
                    s._mem.append({"role": "assistant", "content": m.get("content", "")})
            # Mantener solo los últimos turnos para no saturar el contexto
            s._mem = s._mem[-s._mem_limit():]
            return msgs
        except Exception as e:
            return {"error": str(e)}

    # ── comandos slash ────────────────────────────────────
    def command(s, cmd, arg, full):
        def msgs(*texts):
            return {"msgs": [{"role": "system", "content": t} for t in texts]}
        try:
            if cmd in ("files", "ls"):
                if not s.ws:
                    return msgs("Abrí un workspace (ícono de carpeta)")
                cf = list(s._iter_files(Path(s.ws)))
                return msgs("\n".join(f"  {f.relative_to(s.ws)}" for f in cf[:25])
                            or "(vacío)")
            if cmd == "search" and arg:
                return msgs("[Buscar] " + arg + ":\n" +
                            s._exec_tool("search_code", {"query": arg}, "", "python"))
            if cmd == "read" and arg:
                fp = Path(s.ws if s.ws else ".") / arg
                if not fp.exists():
                    return msgs("No existe")
                return {"open": s._file_payload(fp)}
            if cmd == "write" and arg and " " in full[len(cmd):].strip():
                rest = full[len(cmd):].strip()
                fn, _, ct = rest.partition(" ")
                fp = Path(s.ws if s.ws else ".") / fn
                fp.parent.mkdir(parents=True, exist_ok=True)
                fp.write_text(ct, encoding="utf-8")
                return msgs(f" {fp}")
            if cmd == "exec" and arg:
                r = s._run_shell(arg, timeout=30, cwd=s.ws)
                return msgs(f"$ {arg}\n{(r.stdout + r.stderr)[:2000]}")
            if cmd in ("lecciones", "lessons"):
                if arg.strip() in ("borrar", "clear", "reset", "olvidar"):
                    try:
                        s._lessons_path().unlink()
                    except OSError:
                        pass
                    return msgs(" Lecciones borradas.")
                ls = s._load_lessons()
                if not ls:
                    return msgs(" Todavía no aprendí lecciones — aparecen cuando algo falla. "
                                "(/lecciones borrar para reiniciar)")
                return msgs(" Lecciones aprendidas (se le re-inyectan al agente):\n"
                            + "\n".join(f"• {x['txt']}" for x in ls[-20:]))
            if cmd in ("habilidades", "skills"):
                arg_s = arg.strip()
                if arg_s in ("borrar", "clear", "reset", "olvidar"):
                    try:
                        s._skills_path().unlink()
                    except OSError:
                        pass
                    return msgs(" Habilidades borradas.")
                sk = s._load_skills()
                if not sk:
                    return msgs(" Todavía no aprendí habilidades — aparecen cuando resolvés "
                                "bien una tarea reutilizable. (/habilidades borrar para reiniciar)")
                return msgs(" Habilidades aprendidas (se aplican cuando el pedido se parece):\n"
                            + "\n".join(f"• {x['name']} — {x.get('when','')}" for x in sk[-25:]))
            if cmd in ("memoria", "memory"):
                if not s.ws:
                    return msgs("Abrí un proyecto primero (ícono de carpeta) — la memoria es por workspace.")
                arg_m = arg.strip()
                if arg_m in ("borrar", "clear", "reset", "olvidar"):
                    f = s._mem_file()
                    try:
                        if f and f.exists():
                            f.unlink()
                    except OSError:
                        pass
                    return msgs(" Memoria del proyecto borrada.")
                if arg_m:                       # /memoria <texto>  agregar a mano
                    return msgs(s._remember(arg_m))
                pm = s._load_project_memory()
                if not pm:
                    return msgs(" Este proyecto todavía no tiene memoria. Se va llenando "
                                "sola cuando el agente descubre cosas durables, o agregá con "
                                "«/memoria <hecho>». Vive en .low/memoria.md")
                return msgs(" Memoria de este proyecto (se le reinyecta al agente):\n" + pm[:2500])
            if cmd == "git" and arg:
                return msgs(s._exec_tool("git", {"args": arg}, "", "python"))
            if cmd == "commit":
                m = arg.strip() or "update"
                s._exec_tool("git", {"args": "add -A"}, "", "python")
                return msgs(s._exec_tool("git", {"args": f'commit -m "{m}"'}, "", "python"))
            if cmd == "push":
                return msgs(s._exec_tool("git", {"args": "push " + arg}, "", "python"))
            if cmd == "ssh" and arg:
                # /ssh <alias|user@ip> <comando…>  — alias guardado o destino directo
                host, _, rest = arg.partition(" ")
                if rest.strip():
                    return msgs(s._exec_tool("ssh_exec",
                                             {"host": host, "command": rest.strip()},
                                             "", "python"))
                r = subprocess.run(f"ssh {arg}", shell=True, capture_output=True,
                                   text=True, timeout=60)
                return msgs("[SSH]\n" + (r.stdout + r.stderr)[:2000])
            if cmd == "upload" and arg:
                r = subprocess.run(f"scp {arg}", shell=True, capture_output=True,
                                   text=True, timeout=120)
                return msgs("[Upload]\n" + (r.stdout + r.stderr)[:2000])
            if cmd == "browse" and arg:
                webbrowser.open(arg)
                return msgs(f" {arg}")
            if cmd == "form" and arg:
                parts = arg.split()
                url, data = parts[0], " ".join(parts[1:])
                d = dict(p.split("=", 1) for p in data.split() if "=" in p)
                r = requests.post(url, data=d, timeout=15)
                return msgs(f"[Storyboard] Form ({r.status_code})")
            if cmd == "scrape" and arg:
                r = requests.get(arg, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
                return msgs(f" {arg[:60]} ({len(r.text)}b)")
            if cmd == "preview":
                serve_dir = s.ws or "."

                def serve():
                    # sirve el workspace SIN cambiar el cwd global del proceso
                    # (os.chdir rompía rutas relativas del resto de la app)
                    def handler(*a, **k):
                        return http.server.SimpleHTTPRequestHandler(
                            *a, directory=serve_dir, **k)
                    with socketserver.TCPServer(("", 0), handler) as h:
                        port = h.server_address[1]
                        s._push("sys", f" http://localhost:{port}")
                        webbrowser.open(f"http://localhost:{port}")
                        h.serve_forever()
                threading.Thread(target=serve, daemon=True).start()
                return msgs(" Sirviendo el workspace…")
            return msgs(f"Comando desconocido: /{cmd}")
        except Exception as e:
            return msgs(f" {e}")


EXT_LOW = (".low", ".lowscene")


def archivo_de_argv(argv):
    """El archivo con el que Windows abre LOW al hacer doble clic en un .low.

    Se aceptan .low y .lowscene: la extensión cambió en la v4.19.0 y los
    archivos viejos tienen que seguir abriéndose (§14). Se ignoran las banderas
    y cualquier cosa que no exista en el disco — un argumento raro no puede
    impedir que el programa arranque.
    """
    for a in argv[1:]:
        if a.startswith("-"):
            continue
        if a.lower().endswith(EXT_LOW) and os.path.isfile(a):
            return os.path.abspath(a)
    return None


def smoke(base):
    """Autochequeo del EJECUTABLE EMPAQUETADO (biblia §9·4).

    Lo que rompe un empaquetado no es la lógica: es que falte un archivo de
    datos, que un módulo no haya entrado en el bundle o que una ruta relativa
    funcione desde el repo y no desde el .exe. Nada de eso se ve corriendo las
    pruebas del repo, y era la razón por la que se publicaban tres instaladores
    de los que sólo uno lo había arrancado alguien.

    No abre ventana: comprueba lo que el binario necesita para abrirla y sale.
    Imprime una línea por comprobación y devuelve 0 sólo si todas pasan.
    """
    import re
    fallos = []
    def revisar(que, cond, detalle=""):
        print(("  OK   " if cond else "  FALLA") + " " + que + ((" :: " + str(detalle)) if detalle and not cond else ""))
        if not cond:
            fallos.append(que)

    print("LOW smoke · %s · python %s · %s" % (LOW_VERSION, sys.version.split()[0], sys.platform))
    print("  base: %s%s" % (base, "  (empaquetado)" if getattr(sys, "frozen", False) else "  (desde el repo)"))

    ui_dir = os.path.join(base, "ui")
    index = os.path.join(ui_dir, "index.html")
    revisar("existe ui/index.html", os.path.isfile(index), index)
    if not os.path.isfile(index):
        print("SMOKE FALLA: sin la interfaz no hay nada que arrancar")
        return 1

    with open(index, encoding="utf-8") as f:
        html = f.read()

    # TODO lo que index.html pide tiene que estar dentro del bundle: es el fallo
    # de empaquetado más común y el más silencioso — la app abre en blanco.
    pedidos = re.findall(r'(?:src|href)="([^"]+)"', html)
    locales = [r.split("?")[0] for r in pedidos
               if not r.startswith(("http:", "https:", "data:", "#", "//"))]
    faltan = [r for r in locales if not os.path.isfile(os.path.join(ui_dir, r))]
    revisar("los %d archivos que pide index.html están en el bundle" % len(locales),
            not faltan, faltan[:6])

    # la versión sellada en el HTML tiene que ser la del binario, o el navegador
    # embebido sirve el JavaScript viejo desde su caché
    sellos = set(re.findall(r"[?]v=([0-9]+[.][0-9]+[.][0-9]+)", html))
    revisar("el sello de versión del HTML coincide con el binario",
            sellos == {LOW_VERSION} or not sellos, {"html": sorted(sellos), "binario": LOW_VERSION})

    revisar("el puente Api se construye", _api_ok(), "")

    for mod in ("webview", "PIL", "numpy"):
        try:
            __import__(mod); ok = True; det = ""
        except Exception as e:
            ok = False; det = repr(e)
        revisar("importa %s" % mod, ok, det)

    escribible = None
    try:
        import tempfile
        with tempfile.TemporaryDirectory() as d:
            with open(os.path.join(d, "x.json"), "w", encoding="utf-8") as f:
                f.write("{}")
        escribible = True
    except Exception as e:
        escribible = False
    revisar("puede escribir archivos temporales", escribible)

    if fallos:
        print("SMOKE FALLA: %d comprobación(es) — %s" % (len(fallos), "; ".join(fallos)))
        return 1
    print("SMOKE OK %s" % LOW_VERSION)
    return 0


def _api_ok():
    try:
        Api()
        return True
    except Exception:
        import traceback
        print(traceback.format_exc())
        return False


def _version_tupla(texto):
    """«4.26.0» → (4, 26, 0). Lo que no sea número no cuenta."""
    partes = []
    for pedazo in str(texto or "").split("."):
        digitos = "".join(c for c in pedazo if c.isdigit())
        if not digitos:
            break
        partes.append(int(digitos))
    return tuple(partes)


def version_instalada():
    """La versión que el INSTALADOR dejó anotada, o None.

    El instalador escribe HKCU\\Software\\LOW\\Version al terminar. Es la única
    señal exacta de qué versión hay en el disco: un ejecutable de un solo
    archivo no puede leer su propia versión nueva sin desempacarse.
    """
    if sys.platform != "win32":
        return None
    try:
        import winreg
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r"Software\LOW") as k:
            valor, _ = winreg.QueryValueEx(k, "Version")
            return str(valor).strip() or None
    except Exception:
        return None


def binario_reemplazado():
    """¿Se instaló una versión más nueva mientras esta ventana corre?

    Es la trampa de instalar LOW con LOW abierto: el .exe del disco se
    reemplaza, pero la ventana sigue corriendo el código viejo en memoria. Uno
    prueba el arreglo que acaba de instalar, no está, y concluye que no se
    arregló nada. Pasó de verdad.

    ESTO ANTES SE ADIVINABA POR LA FECHA DEL .EXE, Y ESTABA MAL. El instalador
    conserva la marca de tiempo del build, y el build corre en UTC: en una
    máquina en UTC−3 el archivo instalado dice estar unas TRES HORAS en el
    futuro. Medido en la máquina de Mauro: mtime 12:47 con el reloj en 10:16,
    151 minutos de diferencia. Así que la comparación era verdadera SIEMPRE y el
    aviso saltaba en cada arranque —criar lobo es peor que no avisar, porque
    entrena a ignorar el único mensaje que iba a importar—.

    Ahora se comparan VERSIONES, que no dependen de ningún reloj: la que el
    instalador anotó en el registro contra la que este ejecutable trae
    compilada adentro.

    Devuelve la versión instalada (str) si es MÁS NUEVA que la que corre, o
    None: corriendo desde fuente, sin registro, o ya estando al día.
    """
    if not getattr(sys, "frozen", False):
        return None
    instalada = version_instalada()
    if not instalada:
        return None
    a, b = _version_tupla(instalada), _version_tupla(LOW_VERSION)
    return instalada if (a and b and a > b) else None


def main():
    log("── arranque ── LOW v%s · python %s · %s%s" % (
        LOW_VERSION, sys.version.split()[0], sys.platform,
        " · CONGELADO" if getattr(sys, "frozen", False) else " · desde fuente"))
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    if "--smoke" in sys.argv:
        sys.exit(smoke(base))
    safe_mode = "--safe-mode" in sys.argv
    api = Api(safe_mode=safe_mode)
    api._abrir_al_inicio = archivo_de_argv(sys.argv)
    if api._abrir_al_inicio:
        log("abrir al inicio: " + api._abrir_al_inicio)
    ui = os.path.join(base, "ui", "index.html")
    if safe_mode:
        ui = Path(ui).resolve().as_uri() + "?safe=1"
    api._ui_base = os.path.join(base, "ui")
    # Dos pantallas: reabrir LOW en el monitor y el tamaño donde se cerró.
    # Antes salía siempre maximizada en la pantalla principal.
    mg = (api.cfg.data.get("windows") or {}).get("main") or {}
    window = webview.create_window(
        "LOW", ui, js_api=api,
        width=int(mg.get("w") or 1280), height=int(mg.get("h") or 800),
        x=mg.get("x"), y=mg.get("y"),
        min_size=(980, 600),
        maximized=bool(mg.get("maximized", True)) if mg else True,
        background_color="#151514",
    )
    api._window = window
    api._track_geometry(window, "main", store_name="windows")
    # ── EL ALMACENAMIENTO DE LA INTERFAZ TIENE QUE SOBREVIVIR AL CIERRE ──────
    #
    # Y no sobrevivía. pywebview 6.x viene con `private_mode=True` —perfil
    # efímero, se tira al cerrar— y con `http_port=None`, así que la interfaz se
    # servía desde un puerto AL AZAR en cada arranque. `localStorage` es por
    # ORIGEN, así que cada inicio estrenaba almacenamiento vacío.
    #
    # Medido con una clave testigo: escrita en http://127.0.0.1:17446 y, tras
    # cerrar y reabrir, `{testigo: null, claves: 0}` en http://127.0.0.1:61150.
    #
    # Lo que se perdía en cada arranque, todo en localStorage:
    #   · EL RESCATE ANTE CAÍDA. Probado en la app real: un trazo sin guardar,
    #     matar el proceso, reabrir — no había documento, no había ofrecimiento
    #     de recuperar, y las claves de recovery habían desaparecido.
    #   · Los pinceles (`low.brushes.v1`), la disposición de paneles
    #     (`low.2d.panelLayout`) y el espacio de trabajo activo.
    #
    # El puerto FIJO es lo que estabiliza el origen, y se comprueba ANTES de
    # arrancar: si estuviera ocupado —otra instancia de LOW, u otro programa— se
    # arranca sin fijarlo y se deja dicho en el log. Vale más abrir perdiendo la
    # persistencia que no abrir. No se reintenta después de `webview.start`
    # porque esa llamada bloquea hasta que se cierra la ventana: reintentar ahí
    # abriría una segunda.
    perfil, instancia = _perfil_libre(str(data_dir() / "webview"))
    if instancia > 1:
        log("ya hay otra instancia de LOW usando el perfil: esta abre con %s. "
            "Funciona igual, pero no comparte preferencias con la otra" % perfil)
    puerto = LOW_UI_PORT if _puerto_libre(LOW_UI_PORT) else None
    if puerto is None:
        log("el puerto %d esta ocupado: LOW arranca sin origen fijo y NO va a "
            "conservar preferencias ni rescate entre arranques" % LOW_UI_PORT)
    try:
        webview.start(debug="--debug" in sys.argv, private_mode=False,
                      storage_path=perfil, http_port=puerto)
    except Exception:
        import traceback
        log("webview.start fallo:\n" + traceback.format_exc())
        raise


if __name__ == "__main__":
    main()
