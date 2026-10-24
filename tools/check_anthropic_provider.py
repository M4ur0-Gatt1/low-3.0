"""EL PROVEEDOR DE CLAUDE HABLA COMO PIDE LA API ACTUAL (v3.47).
    python tools/check_anthropic_provider.py

Sin red: un servidor local imita /v1/messages, anota cada pedido y contesta
como Claude (bloque de pensamiento con firma + texto + llamada a herramienta).

Lo que se exige, y por qué (oct-2026: «400 Bad Request» y «Este modelo no
acepta herramientas» con cualquier Claude actual):
1. `temperature` no va nunca (Claude 4.7+ y la API 2026-10-21 dan 400).
2. Opus 5.5: pensamiento adaptativo con `drop_block` y su beta; max_tokens con
   lugar para pensar.
3. La vuelta de herramientas devuelve los bloques de Claude TAL CUAL (el
   pensamiento con su firma), y los resultados de varias herramientas van en
   un solo mensaje.
4. Un modelo viejo (Sonnet 4.5) no recibe `thinking` ni la beta.
5. Un error trae el motivo que da la API, no «400 Bad Request».
6. Los campos internos de LOW no salen a las APIs compatibles con OpenAI.
7. (v3.48) Streaming: el texto y el pensamiento llegan por partes, y el
   «done» final trae los mismos bloques/tool_calls que la llamada normal.
"""
import json
import sys
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
from providers.anthropic_provider import AnthropicProvider, piensa_adaptativo, pensamiento_preservado  # noqa: E402
from providers.transport import _sin_campos_internos  # noqa: E402

pedidos = []
respuestas = []


class Falsa(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        largo = int(self.headers.get("content-length") or 0)
        cuerpo = json.loads(self.rfile.read(largo) or b"{}")
        pedidos.append({"path": self.path, "headers": {k.lower(): v for k, v in self.headers.items()}, "body": cuerpo})
        codigo, resp = respuestas.pop(0)
        if codigo == 200 and cuerpo.get("stream"):
            datos = "".join(f"event: {e['type']}\ndata: {json.dumps(e)}\n\n" for e in sse(resp)).encode("utf-8")
            self.send_response(200)
            self.send_header("content-type", "text/event-stream")
            self.send_header("content-length", str(len(datos)))
            self.end_headers()
            self.wfile.write(datos)
            return
        datos = json.dumps(resp).encode("utf-8")
        self.send_response(codigo)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)


def sse(m):
    """Un mensaje completo → los eventos SSE que mandaría la API (texto en 2 partes)."""
    yield {"type": "message_start", "message": {**m, "content": [], "stop_reason": None,
                                                "usage": {"input_tokens": m["usage"]["input_tokens"], "output_tokens": 0}}}
    for i, b in enumerate(m["content"]):
        t = b["type"]
        if t == "thinking":
            yield {"type": "content_block_start", "index": i, "content_block": {"type": "thinking", "thinking": "", "signature": ""}}
            if b["thinking"]:
                yield {"type": "content_block_delta", "index": i, "delta": {"type": "thinking_delta", "thinking": b["thinking"]}}
            yield {"type": "content_block_delta", "index": i, "delta": {"type": "signature_delta", "signature": b["signature"]}}
        elif t == "text":
            yield {"type": "content_block_start", "index": i, "content_block": {"type": "text", "text": ""}}
            mitad = len(b["text"]) // 2
            for parte in (b["text"][:mitad], b["text"][mitad:]):
                yield {"type": "content_block_delta", "index": i, "delta": {"type": "text_delta", "text": parte}}
        elif t == "tool_use":
            yield {"type": "content_block_start", "index": i, "content_block": {**b, "input": {}}}
            yield {"type": "content_block_delta", "index": i, "delta": {"type": "input_json_delta", "partial_json": json.dumps(b["input"])}}
        yield {"type": "content_block_stop", "index": i}
    yield {"type": "message_delta", "delta": {"stop_reason": m["stop_reason"], "stop_sequence": None},
           "usage": {"output_tokens": m["usage"]["output_tokens"]}}
    yield {"type": "message_stop"}


srv = HTTPServer(("127.0.0.1", 0), Falsa)
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f"http://127.0.0.1:{srv.server_port}/v1"

PENSAR = {"type": "thinking", "thinking": "", "signature": "firma-opaca-123=="}
USO = {"input_tokens": 10, "output_tokens": 5}


def msg(content, stop="end_turn", model="claude-opus-5-5"):
    return {"id": "msg_1", "type": "message", "role": "assistant", "model": model, "content": content,
            "stop_reason": stop, "stop_sequence": None, "usage": USO}


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


TOOLS = [{"type": "function", "function": {"name": "write_file", "description": "escribe",
                                            "parameters": {"type": "object", "properties": {"path": {"type": "string"}}}}}]


def opus_con_herramientas():
    pedidos.clear()
    p = AnthropicProvider(api_key="sk-prueba", model="claude-opus-5-5", base_url=URL)
    respuestas.append((200, msg([PENSAR, {"type": "text", "text": "Voy."},
                                 {"type": "tool_use", "id": "toolu_1", "name": "write_file", "input": {"path": "a.svg"}},
                                 {"type": "tool_use", "id": "toolu_2", "name": "write_file", "input": {"path": "b.svg"}}], stop="tool_use")))
    r = p.chat([{"role": "user", "content": "dibujá"}], system_prompt="sos LOW", temperature=0.7, max_tokens=4096, tools=TOOLS)
    b = pedidos[0]["body"]
    assert "temperature" not in b, "se mandó temperature: " + str(b.get("temperature"))
    assert b.get("thinking") == {"type": "adaptive", "block_binding": {"prefix_mismatch_behavior": "drop_block"}}, "thinking: " + json.dumps(b.get("thinking"))
    assert "thinking-binding-controls-2026-08-01" in pedidos[0]["headers"].get("anthropic-beta", ""), "falta la beta de los bloques"
    assert b.get("max_tokens", 0) >= 16000, "max_tokens sin lugar para pensar: " + str(b.get("max_tokens"))
    assert b.get("system") == "sos LOW" and b["tools"][0]["name"] == "write_file", "system/tools mal traducidos"
    m = r.raw["choices"][0]["message"]
    assert [tc["id"] for tc in m["tool_calls"]] == ["toolu_1", "toolu_2"], "tool_calls: " + json.dumps(m.get("tool_calls"))
    assert m["_anthropic_content"][0] == PENSAR, "la respuesta no guardó el pensamiento tal cual"
    # la vuelta: el mensaje del asistente como lo arma main.py + los dos resultados
    asst = {"role": "assistant", "content": m["content"], "tool_calls": m["tool_calls"], "_anthropic_content": m["_anthropic_content"]}
    hist = [{"role": "user", "content": "dibujá"}, asst,
            {"role": "tool", "tool_call_id": "toolu_1", "content": "ok a"},
            {"role": "tool", "tool_call_id": "toolu_2", "content": "ok b"}]
    respuestas.append((200, msg([PENSAR, {"type": "text", "text": "Listo."}])))
    r2 = p.chat(hist, system_prompt="sos LOW", tools=TOOLS)
    b2 = pedidos[1]["body"]
    assert b2["messages"][1] == {"role": "assistant", "content": m["_anthropic_content"]}, "la vuelta no devolvió los bloques tal cual: " + json.dumps(b2["messages"][1])[:300]
    assert b2["messages"][2]["role"] == "user" and [x["tool_use_id"] for x in b2["messages"][2]["content"]] == ["toolu_1", "toolu_2"], \
        "los dos resultados no van en un solo mensaje: " + json.dumps(b2["messages"][2:])[:300]
    assert len(b2["messages"]) == 3, "sobran mensajes: " + str(len(b2["messages"]))
    assert r2.content == "Listo."


def sonnet_viejo():
    pedidos.clear()
    p = AnthropicProvider(api_key="sk-prueba", model="claude-sonnet-4-5", base_url=URL)
    respuestas.append((200, msg([{"type": "text", "text": "hola"}], model="claude-sonnet-4-5")))
    r = p.chat([{"role": "user", "content": "hola"}], temperature=0.2, max_tokens=4096)
    b = pedidos[0]["body"]
    assert "temperature" not in b and "thinking" not in b, "a Sonnet 4.5 le llegó temperature/thinking: " + json.dumps(b)[:200]
    assert "thinking-binding" not in pedidos[0]["headers"].get("anthropic-beta", ""), "a Sonnet 4.5 le llegó la beta de bloques"
    assert b["max_tokens"] == 4096 and r.content == "hola"


def error_legible():
    pedidos.clear()
    p = AnthropicProvider(api_key="sk-prueba", model="claude-opus-5-5", base_url=URL)
    p._cli().max_retries = 0
    respuestas.append((400, {"type": "error", "error": {"type": "invalid_request_error", "message": "temperature: no soportado en este modelo"}}))
    try:
        p.chat([{"role": "user", "content": "hola"}])
    except RuntimeError as e:
        t = str(e)
        assert "400" in t and "invalid_request_error" in t and "temperature: no soportado" in t, "el error no trae el motivo: " + t
        return
    raise AssertionError("un 400 no levantó error")


def rechazo():
    pedidos.clear()
    p = AnthropicProvider(api_key="sk-prueba", model="claude-opus-5-5", base_url=URL)
    respuestas.append((200, {**msg([], stop="refusal"), "stop_details": {"type": "refusal", "category": "cyber", "explanation": "x"}}))
    r = p.chat([{"role": "user", "content": "x"}])
    assert "rechazo" in r.content and "cyber" in r.content, "un rechazo volvió vacío: " + repr(r.content)


def familias():
    assert piensa_adaptativo("claude-opus-5-5") and pensamiento_preservado("claude-opus-5-5")
    assert piensa_adaptativo("claude-sonnet-5-5") and pensamiento_preservado("claude-sonnet-5-5")
    assert piensa_adaptativo("claude-fable-5-1") and pensamiento_preservado("claude-fable-5-1")
    assert piensa_adaptativo("claude-opus-4-6") and not pensamiento_preservado("claude-opus-4-6")
    assert piensa_adaptativo("claude-sonnet-5") and not pensamiento_preservado("claude-sonnet-5")
    assert not piensa_adaptativo("claude-sonnet-4-5") and not piensa_adaptativo("claude-haiku-4-5")
    assert not piensa_adaptativo("claude-sonnet-4-20250514"), "la fecha se leyó como versión menor"
    assert not piensa_adaptativo("gpt-4o")


def streaming():
    pedidos.clear()
    p = AnthropicProvider(api_key="sk-prueba", model="claude-opus-5-5", base_url=URL)
    assert getattr(p, "supports_stream", False), "Claude no declara streaming: la UI queda muda hasta el final"
    pensar = {"type": "thinking", "thinking": "planeo", "signature": "firma-opaca-123=="}
    respuestas.append((200, msg([pensar, {"type": "text", "text": "Voy a escribir."},
                                 {"type": "tool_use", "id": "toolu_9", "name": "write_file", "input": {"path": "a.svg"}}],
                                stop="tool_use")))
    evs = list(p.chat_stream([{"role": "user", "content": "dibujá"}], system_prompt="sos LOW", tools=TOOLS))
    b = pedidos[0]["body"]
    assert b.get("stream") is True and "temperature" not in b, "pedido de stream mal armado: " + json.dumps(b)[:200]
    textos = [e["text"] for e in evs if e["type"] == "content"]
    assert len(textos) >= 2 and "".join(textos) == "Voy a escribir.", "el texto no llegó por partes: " + repr(textos)
    assert "".join(e["text"] for e in evs if e["type"] == "reasoning") == "planeo", "el pensamiento no llegó"
    assert evs[-1]["type"] == "done", "falta el done final"
    r = evs[-1]["response"]
    m = r.raw["choices"][0]["message"]
    assert r.content == "Voy a escribir." and m["tool_calls"][0]["id"] == "toolu_9", "done sin tool_calls: " + json.dumps(m)[:300]
    assert json.loads(m["tool_calls"][0]["function"]["arguments"]) == {"path": "a.svg"}, "argumentos de la herramienta"
    assert m["_anthropic_content"][0]["signature"] == "firma-opaca-123==", "el pensamiento no conservó su firma"


def streaming_error():
    p = AnthropicProvider(api_key="sk-prueba", model="claude-opus-5-5", base_url=URL)
    p._cli().max_retries = 0
    respuestas.append((400, {"type": "error", "error": {"type": "invalid_request_error", "message": "algo inválido"}}))
    try:
        list(p.chat_stream([{"role": "user", "content": "hola"}]))
    except RuntimeError as e:
        assert "400" in str(e) and "algo inválido" in str(e), "el error de stream no trae el motivo: " + str(e)
        return
    raise AssertionError("un 400 en streaming no levantó error")


def sin_campos_internos():
    ms = [{"role": "assistant", "content": "x", "_anthropic_content": [PENSAR], "reasoning_content": "r"}]
    assert _sin_campos_internos(ms) == [{"role": "assistant", "content": "x", "reasoning_content": "r"}], "un campo interno sale a la API"


prueba("Opus 5.5 con herramientas: sin temperature, pensamiento con drop_block, vuelta intacta", opus_con_herramientas)
prueba("Sonnet 4.5: sin temperature ni thinking ni beta", sonnet_viejo)
prueba("un 400 trae el motivo de la API", error_legible)
prueba("un rechazo se dice, no vuelve vacío", rechazo)
prueba("qué modelos piensan y cuáles atan sus bloques", familias)
prueba("los campos internos no salen a las APIs compatibles con OpenAI", sin_campos_internos)
prueba("streaming: texto y pensamiento por partes, done con tool_calls y firma", streaming)
prueba("streaming: un 400 trae el motivo de la API", streaming_error)
srv.shutdown()
print(f"\n{total - len(fallas)}/{total} OK")
if fallas:
    print("FALLAS:\n  " + "\n  ".join(fallas))
    sys.exit(1)
