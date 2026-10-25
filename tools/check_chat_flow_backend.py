"""EL TURNO DEL CHAT NO SE PIERDE NI SE PISA (v3.49).
    python tools/check_chat_flow_backend.py

Sin red: un proveedor falso emite eventos de streaming como los reales
(pensamiento, texto por partes, done) y también cortes y respuestas vacías.

Lo que se exige:
1. Streaming completo: los deltas llegan a la UI y el parcial se acumula.
2. Si el stream se corta sin «done», se informa como CORTE (no «Detenido»), el
   texto que ya se vio vuelve en `full` y queda en la memoria del agente.
3. Si el usuario detiene, se informa como detenido (no como corte).
4. Un segundo send_chat mientras hay un turno activo se rechaza con `busy` y
   no toca el turno en curso; al terminar, se puede volver a enviar.
5. Un error dentro del turno libera el candado (el chat no queda trabado).
"""
import sys
import threading
import time
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import main  # noqa: E402


class FakeConfig:
    workspace = ""

    def __init__(self):
        self.data = {"last_workspace": "", "providers": {}}


class NoopImprovement:
    def __init__(self, _path):
        pass


class FakeResp:
    def __init__(self, content):
        self.content = content
        self.raw = {"choices": [{"message": {"content": content}}]}


class StreamProv:
    supports_stream = True

    def __init__(self, events):
        self.events = events

    def chat_stream(self, ms, **kw):
        yield from self.events


def build():
    with patch.object(main, "Config", FakeConfig), \
         patch.object(main, "SelfImprovementSystem", NoopImprovement), \
         patch.object(main.Api, "_initp", lambda _self: None):
        a = main.Api()
    a.pushed = []
    a._push = lambda ev, data: a.pushed.append((ev, data))
    a._mem = []
    a.ses_id = "s1"
    return a


fallas, total = [], 0


def prueba(nombre, fn):
    global total
    total += 1
    try:
        fn()
        print("  ok  ", nombre)
    except AssertionError as e:
        fallas.append(f"{nombre}: {e}")
        print("  FALLA", nombre, "->", e)


def stream_completo():
    a = build()
    a._cancel = False
    a.prov = StreamProv([{"type": "reasoning", "text": "pienso"},
                         {"type": "content", "text": "Hola "},
                         {"type": "content", "text": "mundo"},
                         {"type": "done", "response": FakeResp("Hola mundo")}])
    r = a._run_model([], "sp", 0.2, 100, False)
    evs = [e for e, _ in a.pushed]
    assert evs == ["think_start", "think_delta", "think_end", "agent_start",
                   "agent_delta", "agent_delta", "agent_end"], evs
    assert r.content == "Hola mundo" and a._live and a._partial == "Hola mundo", a._partial


def stream_cortado():
    a = build()
    a._cancel = False
    a.prov = StreamProv([{"type": "content", "text": "Empiezo a "},
                         {"type": "content", "text": "explicar"}])   # sin done
    r = a._run_model([], "sp", 0.2, 100, False)
    assert r is None, "un stream cortado devolvió respuesta"
    assert ("agent_end", {}) in a.pushed, "la burbuja quedó abierta (falta agent_end)"
    out = a._turn_interrupted("explicame", "s1")
    assert out["cut"] is True and out["status"] == "Cortado", out
    assert out["full"] == "Empiezo a explicar", "el parcial se perdió: " + repr(out["full"])
    assert out["streamed"] is True and out["text"] == "", out
    assert a._mem[-1]["role"] == "assistant" and "Empiezo a explicar" in a._mem[-1]["content"], a._mem
    assert "cortada" in a._mem[-1]["content"], "la memoria no marca que la respuesta quedó cortada"


def corte_sin_texto():
    a = build()
    a._cancel = False
    a.prov = StreamProv([])
    assert a._run_model([], "sp", 0.2, 100, False) is None
    out = a._turn_interrupted("hola", "s1")
    assert out["cut"] and not out["streamed"] and "cort" in out["text"], out
    assert a._mem == [], "se guardó memoria sin texto"


def detenido():
    a = build()
    a._cancel = False

    def evs():
        yield {"type": "content", "text": "uno "}
        a._cancel = True                 # el usuario aprieta detener
        yield {"type": "content", "text": "dos"}
        yield {"type": "content", "text": "NUNCA"}
    a.prov = StreamProv(evs())
    assert a._run_model([], "sp", 0.2, 100, False) is None
    assert "NUNCA" not in a._partial, "siguió leyendo después de detener"
    out = a._turn_interrupted("x", "s1")
    assert out["stopped"] and not out["cut"] and out["status"] == "Detenido", out


def otra_charla_no_se_contamina():
    a = build()
    a._cancel = False
    a._partial, a._live = "texto", True
    a.ses_id = "otra"
    a._turn_interrupted("x", "s1")
    assert a._mem == [], "el parcial se metió en la memoria de otra charla"


def un_turno_por_vez():
    a = build()
    entro, soltar = threading.Event(), threading.Event()

    def lento(msg, code, lang, image=None):
        entro.set()
        soltar.wait(5)
        return {"text": "listo " + msg, "status": "ok"}
    a._send_chat_turn = lento
    res = {}
    t = threading.Thread(target=lambda: res.setdefault("a", a.send_chat("primero", "", "py")))
    t.start()
    assert entro.wait(5), "el primer turno no arrancó"
    b = a.send_chat("segundo", "", "py")
    assert b.get("busy") is True and "trabajando" in b["status"], b
    soltar.set()
    t.join(5)
    assert res["a"]["text"] == "listo primero", res
    c = a.send_chat("tercero", "", "py")
    assert c["text"] == "listo tercero", "tras terminar no se pudo volver a enviar: " + repr(c)


def error_libera():
    a = build()

    def roto(*_a, **_k):
        raise RuntimeError("boom")
    a._send_chat_turn = roto
    try:
        a.send_chat("x", "", "py")
    except RuntimeError:
        pass
    a._send_chat_turn = lambda *x, **k: {"text": "ok"}
    t0 = time.time()
    assert a.send_chat("y", "", "py") == {"text": "ok"} and time.time() - t0 < 1, "el candado quedó tomado"


prueba("streaming completo: deltas en orden y parcial acumulado", stream_completo)
prueba("stream cortado: se dice CORTE, el parcial vuelve y queda en memoria", stream_cortado)
prueba("corte antes del primer texto: aviso claro, sin memoria basura", corte_sin_texto)
prueba("detener: se informa detenido y deja de leer el stream", detenido)
prueba("el parcial no contamina otra charla", otra_charla_no_se_contamina)
prueba("un turno por vez: el 2º envío vuelve busy y no pisa al 1º", un_turno_por_vez)
prueba("un error en el turno libera el candado", error_libera)
print(f"\n{total - len(fallas)}/{total} OK")
if fallas:
    print("FALLAS:\n  " + "\n  ".join(fallas))
    sys.exit(1)
print("CHAT FLOW BACKEND OK")
