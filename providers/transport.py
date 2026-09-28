"""Transporte HTTP unificado con retry, backoff, streaming y costo."""
import time, random, json, os, requests
from dataclasses import dataclass
from typing import Optional, Generator


@dataclass
class APIResult:
    content: str
    model: str
    tokens_input: int = 0
    tokens_output: int = 0
    latency_ms: int = 0
    cost: float = 0.0
    finish_reason: str = "stop"
    cached_tokens: int = 0      # tokens del prompt servidos desde cache
    raw: dict = None


def _cached_from_usage(usage: dict) -> int:
    """Tokens del prompt leídos del cache, según el proveedor:
    DeepSeek → prompt_cache_hit_tokens; OpenAI → prompt_tokens_details.cached_tokens."""
    if not usage:
        return 0
    return (usage.get("prompt_cache_hit_tokens")
            or (usage.get("prompt_tokens_details") or {}).get("cached_tokens")
            or 0)


# Precios por millón de tokens (input, output) — agosto 2026
PRICING = {
    "gpt-4o":             (2.50, 10.00),
    "gpt-4o-mini":        (0.15, 0.60),
    "claude-sonnet-4":    (3.00, 15.00),
    "claude-sonnet-4-5":  (3.00, 15.00),
    "claude-opus-4-1":    (15.00, 75.00),
    "claude-3-5-haiku":   (0.80, 4.00),
    "llama-3.3-70b":      (0.59, 0.79),
    "llama-3.1-8b":       (0.05, 0.08),
    "mixtral-8x7b":       (0.24, 0.24),
    "deepseek-chat":      (0.14, 0.28),
    "deepseek-reasoner":  (0.55, 2.19),
    "qwen-plus":          (0.80, 2.00),
    "qwen-max":           (2.00, 6.00),
    "glm-4":              (0.10, 0.10),
    "grok-2":             (2.00, 10.00),
    "gemini-1.5-pro":     (1.25, 5.00),
}

# Fallback si el modelo no está en la tabla
DEFAULT_RATE = (0.50, 1.50)


def calc_cost(model: str, inp: int, out: int) -> float:
    """Costo en USD. Busca match exacto y si no, el prefijo más largo
    (p. ej. 'llama-3.3-70b-versatile' matchea 'llama-3.3-70b')."""
    m = model.split("/")[-1]
    rate = PRICING.get(m)
    if rate is None:
        for k in sorted(PRICING, key=len, reverse=True):
            if m.startswith(k):
                rate = PRICING[k]
                break
    if rate is None:
        rate = DEFAULT_RATE
    return (inp * rate[0] + out * rate[1]) / 1_000_000


class Transport:
    """Cliente HTTP con manejo profesional de errores.
    
    - Retry con exponential backoff + jitter en 429 y 5xx
    - Streaming via iter_lines
    - Cálculo de costo por modelo
    - Timeout configurable
    """

    def __init__(self, base_url: str, api_key: str,
                 max_retries: int = 3, timeout: int = 60):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.max_retries = max_retries
        # (conexión, lectura) para que un proveedor colgado falle rápido y arriba
        # se haga failover, en vez de bloquear un minuto entero
        self.timeout = (10, 50) if isinstance(timeout, int) else timeout

    def _headers(self) -> dict:
        return {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    def _calc_cost(self, model: str, inp: int, out: int) -> float:
        return calc_cost(model, inp, out)

    def _should_retry(self, code: int) -> bool:
        return code in (429, 500, 502, 503, 504)

    def chat(self, model: str, messages: list, temperature: float = 0.7,
             max_tokens: int = 4096, stream: bool = False,
             tools: list = None) -> APIResult:
        """Completar chat completo (sin streaming). Devuelve APIResult."""
        body = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": stream,
        }
        if tools:
            body["tools"] = tools

        last_error = None
        rate_limited = False
        last_status = None
        for attempt in range(max(self.max_retries, 5)):
            try:
                t0 = time.time()
                resp = requests.post(
                    f"{self.base_url}/chat/completions",
                    headers=self._headers(),
                    json=body,
                    timeout=self.timeout,
                )
                if resp.status_code == 429:
                    rate_limited = True
                    # respetar el Retry-After del proveedor si lo manda
                    try:
                        wait = float(resp.headers.get("retry-after", ""))
                    except ValueError:
                        wait = 2 ** attempt + random.random() * 0.5
                    time.sleep(min(wait, 30))
                    continue
                if resp.status_code >= 500 and self._should_retry(resp.status_code):
                    last_status = resp.status_code
                    wait = 2 ** attempt + random.random() * 0.5
                    time.sleep(wait)
                    continue
                if resp.status_code >= 400:
                    # incluir el mensaje real de la API, no solo "400 Bad Request"
                    try:
                        detail = (resp.json().get("error") or {}).get("message") \
                            or resp.text[:300]
                    except ValueError:
                        detail = resp.text[:300]
                    raise requests.HTTPError(
                        f"{resp.status_code}: {detail}", response=resp)
                data = resp.json()
                latency = int((time.time() - t0) * 1000)
                choice = data["choices"][0]
                usage = data.get("usage", {})
                inp = usage.get("prompt_tokens", 0)
                out = usage.get("completion_tokens", 0)
                msg = choice.get("message", {})
                return APIResult(
                    content=msg.get("content", "") or "",
                    model=data.get("model", model),
                    tokens_input=inp,
                    tokens_output=out,
                    latency_ms=latency,
                    cost=self._calc_cost(model, inp, out),
                    finish_reason=choice.get("finish_reason", "stop") or "stop",
                    cached_tokens=_cached_from_usage(usage),
                    raw=data,
                )
            except requests.exceptions.Timeout as e:
                last_error = e
                if attempt == self.max_retries - 1:
                    raise TimeoutError(f"Timeout tras {self.max_retries} intentos")
            except requests.exceptions.RequestException as e:
                last_error = e
                if attempt < self.max_retries - 1 and self._should_retry(
                        getattr(e.response, "status_code", 0)):
                    time.sleep(2 ** attempt)
                    continue
                raise
        if rate_limited:
            raise requests.HTTPError(
                "429: límite de uso del proveedor alcanzado (rate limit). "
                "Esperá un minuto y volvé a intentar.")
        if last_status:
            raise requests.HTTPError(
                f"{last_status}: el proveedor está sobrecargado o caído en este "
                "momento. Probá de nuevo en unos segundos o cambiá de modelo.")
        raise last_error or Exception("Max retries exceeded")

    def chat_stream(self, model: str, messages: list, temperature: float = 0.7,
                    max_tokens: int = 4096, tools: list = None):
        """Streaming real: yield 'content'/'reasoning' a medida que llegan y un
        'done' final con APIResult (incluye tool_calls en formato OpenAI en raw)."""
        body = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
            "stream": True,
            "stream_options": {"include_usage": True},
        }
        if tools:
            body["tools"] = tools
        t0 = time.time()
        # timeout (conexión, lectura entre bytes): si un modelo no manda nada por
        # 40s, se corta y arriba se hace failover al siguiente (que ande sí o sí),
        # en vez de esperar eternamente a un razonador lento o un stream colgado.
        # 429/5xx: NO explotar de una — respetar Retry-After y reintentar con backoff
        # (antes cada 429 caía derecho → "un montón de errores 429"). Solo si persiste
        # se levanta el error y arriba se hace failover.
        resp = None
        for attempt in range(4):
            resp = requests.post(
                f"{self.base_url}/chat/completions",
                headers=self._headers(),
                json=body, stream=True, timeout=(15, 40),
            )
            if resp.status_code in (429, 500, 502, 503, 504) and attempt < 3:
                try:
                    wait = float(resp.headers.get("retry-after", ""))
                except (ValueError, TypeError):
                    wait = 2 ** attempt + random.random()
                try:
                    resp.close()
                except Exception:
                    pass
                time.sleep(min(wait, 20))
                continue
            break
        if resp.status_code >= 400:
            try:
                detail = (resp.json().get("error") or {}).get("message") or resp.text[:300]
            except ValueError:
                detail = (resp.text or "")[:300]
            raise requests.HTTPError(f"{resp.status_code}: {detail}", response=resp)

        content_parts, reasoning_parts = [], []
        tool_calls = {}          # index -> {id, name, args}
        inp = out = cached = 0
        model_name = model
        finish = "stop"

        for line in resp.iter_lines():
            if not line:
                continue
            raw = line.decode("utf-8", errors="replace").strip()
            if not raw.startswith("data:"):
                continue
            payload = raw[5:].strip()
            if payload == "[DONE]":
                break
            try:
                chunk = json.loads(payload)
            except json.JSONDecodeError:
                continue
            model_name = chunk.get("model", model_name)
            usage = chunk.get("usage") or {}
            if usage:
                inp = usage.get("prompt_tokens", inp)
                out = usage.get("completion_tokens", out)
                cached = _cached_from_usage(usage) or cached
            choices = chunk.get("choices") or []
            if not choices:
                continue
            ch = choices[0]
            delta = ch.get("delta", {})
            if delta.get("content"):
                content_parts.append(delta["content"])
                yield {"type": "content", "text": delta["content"]}
            if delta.get("reasoning_content"):
                reasoning_parts.append(delta["reasoning_content"])
                yield {"type": "reasoning", "text": delta["reasoning_content"]}
            for tc in delta.get("tool_calls") or []:
                slot = tool_calls.setdefault(tc.get("index", 0),
                                             {"id": "", "name": "", "args": ""})
                if tc.get("id"):
                    slot["id"] = tc["id"]
                fn = tc.get("function") or {}
                if fn.get("name"):
                    slot["name"] = fn["name"]
                if fn.get("arguments"):
                    slot["args"] += fn["arguments"]
            if ch.get("finish_reason"):
                finish = ch["finish_reason"]

        content = "".join(content_parts)
        tcs = [{"id": v["id"] or f"call_{i}", "type": "function",
                "function": {"name": v["name"], "arguments": v["args"]}}
               for i, v in sorted(tool_calls.items())]
        msg = {"content": content, "role": "assistant"}
        if reasoning_parts:
            msg["reasoning_content"] = "".join(reasoning_parts)
        if tcs:
            msg["tool_calls"] = tcs
        yield {"type": "done", "result": APIResult(
            content=content, model=model_name, tokens_input=inp, tokens_output=out,
            latency_ms=int((time.time() - t0) * 1000),
            cost=self._calc_cost(model_name, inp, out), finish_reason=finish,
            cached_tokens=cached,
            raw={"choices": [{"message": msg, "finish_reason": finish}],
                 "model": model_name})}
