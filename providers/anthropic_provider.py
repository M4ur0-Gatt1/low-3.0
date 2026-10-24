"""Anthropic Provider - API nativa (formato propio de mensajes y tools), por el
SDK oficial (`anthropic`).

Traduce en ambos sentidos: recibe messages/tools en formato OpenAI y expone
los tool_calls de la respuesta en raw["choices"][0]["message"]["tool_calls"],
así el loop del agente en main.py funciona igual con Claude que con el resto.

LO QUE CAMBIÓ EN OCT-2026 (v3.47), y por qué:
- `temperature` NO se manda. Los Claude desde 4.7 (Opus 5.5, Sonnet 5.5,
  Fable…) rechazan con 400 cualquier valor que no sea el de fábrica, y desde
  la versión de API 2026-10-21 todos los modelos lo rechazan. LOW mandaba 0.7:
  cada pedido daba 400, LOW creía que «el modelo no acepta herramientas»,
  reintentaba sin ellas y volvía a dar 400.
- Los modelos actuales PIENSAN SIEMPRE, y en una vuelta de herramientas sus
  bloques de pensamiento tienen que volver INTACTOS. La respuesta guarda los
  bloques tal cual en `_anthropic_content`; main.py los copia al mensaje del
  asistente (como el `reasoning_content` de DeepSeek) y acá se devuelven sin
  tocar.
- LOW agrega avisos y cambia cosas del historial: en los modelos con
  «pensamiento preservado» (Opus 5.5, Sonnet 5.5, Fable 5.1) eso daba 400 en
  cuentas nuevas. Se pide `drop_block`: el bloque que ya no vale se descarta en
  vez de fallar.
- El pensamiento cuenta dentro de `max_tokens`: con 4096 las respuestas se
  cortaban; en los modelos que piensan el piso es 16000.
- Los errores salen con el motivo que da la API, no «400 Bad Request».

v3.48: STREAMING real (`chat_stream`). Antes Claude era el único proveedor
bloqueante: el usuario no veía nada hasta que terminaba cada vuelta («no veo
tu respuesta»). Ahora el texto y el pensamiento llegan a la UI a medida que
se generan, con el mismo formato de eventos que los compatibles con OpenAI.
"""
import json
import re

from providers.base import AIProvider, AIResponse
from providers.transport import calc_cost

# la beta del control de bloques de pensamiento (pensamiento preservado)
BETA_BLOQUES = "thinking-binding-controls-2026-08-01"


def _version(modelo):
    """(familia, mayor, menor) de un id de Claude, o None. «claude-opus-5-5» → ("opus", 5, 5)."""
    m = re.match(r"^(?:anthropic\.)?claude-(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d{1,2}))?(?:\b|-|$)", modelo or "")
    if not m:
        return None
    menor = m.group(3)
    # un sufijo de fecha (claude-sonnet-4-20250514) no es la versión menor
    return m.group(1), int(m.group(2)), int(menor) if menor and len(menor) <= 2 else 0


def piensa_adaptativo(modelo):
    """¿Acepta `thinking: {type: "adaptive"}`? Opus/Sonnet 4.6 en adelante, Haiku 5.5, Fable y Mythos."""
    v = _version(modelo)
    if not v:
        return False
    fam, may, men = v
    if fam in ("fable", "mythos"):
        return True
    if fam == "haiku":
        return (may, men) >= (5, 5)
    return (may, men) >= (4, 6)


def pensamiento_preservado(modelo):
    """¿Ata sus bloques a la conversación? Opus/Sonnet/Haiku 5.5 en adelante y Fable 5.1."""
    v = _version(modelo)
    if not v:
        return False
    fam, may, men = v
    if fam == "fable":
        return (may, men) >= (5, 1)
    if fam in ("opus", "sonnet", "haiku"):
        return (may, men) >= (5, 5)
    return False


def _tools_to_anthropic(tools):
    out = []
    for t in tools or []:
        f = t.get("function", {})
        out.append({"name": f.get("name", ""), "description": f.get("description", ""),
                    "input_schema": f.get("parameters", {"type": "object", "properties": {}})})
    return out


def _content_to_anthropic(content):
    """Traduce el content multimodal formato OpenAI (lista de partes text/
    image_url) al formato de bloques de Anthropic. Si content ya es un
    string, lo deja tal cual."""
    if not isinstance(content, list):
        return content
    blocks = []
    for part in content:
        t = part.get("type")
        if t == "text":
            blocks.append({"type": "text", "text": part.get("text", "")})
        elif t == "image_url":
            url = (part.get("image_url") or {}).get("url", "")
            if url.startswith("data:") and ";base64," in url:
                media_type, data = url[5:].split(";base64,", 1)
                blocks.append({"type": "image", "source": {
                    "type": "base64", "media_type": media_type, "data": data}})
    return blocks


def _msgs_to_anthropic(messages):
    out = []
    for m in messages:
        role = m.get("role")
        if role == "system":
            continue
        if role == "tool":
            bloque = {"type": "tool_result", "tool_use_id": m.get("tool_call_id", ""),
                      "content": str(m.get("content", ""))}
            # varios resultados seguidos van en UN solo mensaje de usuario
            if out and out[-1]["role"] == "user" and isinstance(out[-1]["content"], list) \
                    and out[-1]["content"] and all(b.get("type") == "tool_result" for b in out[-1]["content"]):
                out[-1]["content"].append(bloque)
            else:
                out.append({"role": "user", "content": [bloque]})
        elif role == "assistant" and m.get("_anthropic_content"):
            # la respuesta de Claude TAL CUAL (pensamiento incluido): no se reconstruye
            out.append({"role": "assistant", "content": m["_anthropic_content"]})
        elif role == "assistant" and m.get("tool_calls"):
            blocks = []
            if m.get("content"):
                blocks.append({"type": "text", "text": m["content"]})
            for tc in m["tool_calls"]:
                try:
                    args = json.loads(tc["function"]["arguments"])
                except (json.JSONDecodeError, TypeError):
                    args = {}
                blocks.append({"type": "tool_use", "id": tc.get("id", ""),
                               "name": tc["function"]["name"], "input": args})
            out.append({"role": "assistant", "content": blocks})
        else:
            out.append({"role": role, "content": _content_to_anthropic(m.get("content", ""))})
    return out


def _motivo(e):
    """El motivo que da la API, legible: «400 · invalid_request_error: …»."""
    import anthropic
    if isinstance(e, anthropic.APIStatusError):
        cuerpo = e.body if isinstance(e.body, dict) else {}
        det = cuerpo.get("error") if isinstance(cuerpo.get("error"), dict) else {}
        tipo, msg = det.get("type", ""), det.get("message") or str(e)
        return f"{e.status_code} · {tipo + ': ' if tipo else ''}{msg}"
    if isinstance(e, anthropic.APIConnectionError):
        return "sin conexión con la API de Anthropic: " + str(e)
    return str(e)


class AnthropicProvider(AIProvider):

    # send_chat/_run_model usan chat_stream si esto es True
    supports_stream = True

    def __init__(self, api_key: str = None, **kwargs):
        base_url = (kwargs.pop("base_url", "") or "https://api.anthropic.com/v1").rstrip("/")
        super().__init__(api_key=api_key,
                         base_url=base_url, model=kwargs.pop("model", None) or self.default_model(), **kwargs)
        self._cliente = None

    @staticmethod
    def provider_name(): return "Anthropic"
    @staticmethod
    def default_model(): return "claude-opus-5-5"
    @staticmethod
    def requires_api_key(): return True

    def _cli(self):
        if self._cliente is None:
            import anthropic
            # el SDK quiere la raíz (sin /v1): LOW guarda la url con /v1
            raiz = self.base_url[:-3] if self.base_url.endswith("/v1") else self.base_url
            self._cliente = anthropic.Anthropic(api_key=self.api_key or None, base_url=raiz,
                                                max_retries=3, timeout=600.0)
        return self._cliente

    def cuerpo(self, messages, system_prompt="", max_tokens=4096, tools=None):
        """Los argumentos del pedido (separado para poder probarlo sin red)."""
        kw = {"model": self.model, "messages": _msgs_to_anthropic(messages), "max_tokens": max_tokens}
        if system_prompt:
            kw["system"] = system_prompt
        if tools:
            kw["tools"] = _tools_to_anthropic(tools)
        betas = []
        if piensa_adaptativo(self.model):
            # el pensamiento cuenta dentro de max_tokens
            kw["max_tokens"] = max(int(max_tokens or 0), 16000)
            pensar = {"type": "adaptive"}
            if pensamiento_preservado(self.model):
                pensar["block_binding"] = {"prefix_mismatch_behavior": "drop_block"}
                betas.append(BETA_BLOQUES)
            kw["thinking"] = pensar
        if betas:
            kw["betas"] = betas
        return kw

    def chat(self, messages, system_prompt="", temperature=0.7, max_tokens=4096, tools=None):
        # `temperature` se recibe por compatibilidad con los demás proveedores y NO se
        # manda: Claude 4.7 en adelante (y toda la API desde 2026-10-21) responde 400
        kw = self.cuerpo(messages, system_prompt, max_tokens, tools)
        try:
            r = self._cli().beta.messages.create(**kw)
        except Exception as e:  # noqa: BLE001 — el motivo de la API hacia arriba, legible
            raise RuntimeError("Anthropic " + _motivo(e)) from e
        return self._respuesta(r.to_dict())

    def chat_stream(self, messages, system_prompt="", temperature=0.7, max_tokens=4096, tools=None):
        """Streaming real: yield {type: content|reasoning, text} a medida que llegan
        y al final {type: done, response: AIResponse} (mismo contrato que base).
        Si el consumidor corta (botón detener), el `with` cierra la conexión."""
        kw = self.cuerpo(messages, system_prompt, max_tokens, tools)
        try:
            with self._cli().beta.messages.stream(**kw) as st:
                for ev in st:
                    if getattr(ev, "type", "") != "content_block_delta":
                        continue
                    dt = ev.delta
                    tipo = getattr(dt, "type", "")
                    if tipo == "text_delta" and dt.text:
                        yield {"type": "content", "text": dt.text}
                    elif tipo == "thinking_delta" and getattr(dt, "thinking", ""):
                        yield {"type": "reasoning", "text": dt.thinking}
                final = st.get_final_message()
        except GeneratorExit:
            raise
        except Exception as e:  # noqa: BLE001 — el motivo de la API hacia arriba, legible
            raise RuntimeError("Anthropic " + _motivo(e)) from e
        yield {"type": "done", "response": self._respuesta(final.to_dict())}

    def _respuesta(self, d):
        """Mensaje de Anthropic (dict) → AIResponse con tool_calls formato OpenAI."""
        bloques = d.get("content") or []
        text = "".join(b.get("text", "") for b in bloques if b.get("type") == "text")
        tool_calls = [{"id": b["id"], "type": "function",
                       "function": {"name": b["name"], "arguments": json.dumps(b.get("input", {}))}}
                      for b in bloques if b.get("type") == "tool_use"]
        usage = d.get("usage") or {}
        inp, out = usage.get("input_tokens", 0) or 0, usage.get("output_tokens", 0) or 0
        msg = {"content": text, "_anthropic_content": bloques}
        if tool_calls:
            msg["tool_calls"] = tool_calls
        if d.get("stop_reason") == "refusal":
            det = d.get("stop_details") or {}
            msg["content"] = text or ("Claude no respondió este pedido (rechazo por seguridad"
                                      + (f": {det.get('category')}" if det.get("category") else "") + ").")
        raw = {"choices": [{"message": msg, "finish_reason": d.get("stop_reason", "stop")}],
               "_anthropic": d}
        return AIResponse(content=msg["content"], model=d.get("model", self.model), tokens_used=inp + out,
                          finish_reason=d.get("stop_reason") or "stop",
                          cost=calc_cost(self.model, inp, out), raw=raw)

    def list_models(self):
        if self.api_key:
            try:
                modelos = [m.id for m in self._cli().models.list()]
                if modelos:
                    return modelos
            except Exception:  # noqa: BLE001 — sin red o sin clave: la lista de fábrica
                pass
        return ["claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5", "claude-fable-5-1"]
