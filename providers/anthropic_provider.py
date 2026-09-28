"""Anthropic Provider - API nativa (formato propio de mensajes y tools).

Traduce en ambos sentidos: recibe messages/tools en formato OpenAI y expone
los tool_calls de la respuesta en raw["choices"][0]["message"]["tool_calls"],
así el loop del agente en main.py funciona igual con Claude que con el resto.
"""
import json
import random
import time

import requests

from providers.base import AIProvider, AIResponse
from providers.transport import calc_cost


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
            out.append({"role": "user", "content": [{
                "type": "tool_result", "tool_use_id": m.get("tool_call_id", ""),
                "content": str(m.get("content", ""))}]})
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


class AnthropicProvider(AIProvider):

    def __init__(self, api_key: str = None, **kwargs):
        base_url = (kwargs.pop("base_url", "") or "https://api.anthropic.com/v1").rstrip("/")
        super().__init__(api_key=api_key,
                         base_url=base_url, model=kwargs.pop("model", None) or self.default_model(), **kwargs)

    @staticmethod
    def provider_name(): return "Anthropic"
    @staticmethod
    def default_model(): return "claude-sonnet-4-5"
    @staticmethod
    def requires_api_key(): return True

    def chat(self, messages, system_prompt="", temperature=0.7, max_tokens=4096, tools=None):
        body = {"model": self.model, "system": system_prompt,
                "messages": _msgs_to_anthropic(messages),
                "max_tokens": max_tokens, "temperature": temperature}
        if tools:
            body["tools"] = _tools_to_anthropic(tools)
        resp = None
        for attempt in range(3):
            resp = requests.post(
                self.base_url + "/messages",
                headers={"x-api-key": self.api_key, "anthropic-version": "2023-06-01",
                         "Content-Type": "application/json"},
                json=body, timeout=120)
            if resp.status_code in (429, 500, 502, 503, 529) and attempt < 2:
                time.sleep(2 ** attempt + random.random() * 0.5)
                continue
            break
        resp.raise_for_status()
        d = resp.json()
        text = "".join(b.get("text", "") for b in d.get("content", []) if b.get("type") == "text")
        tool_calls = [{"id": b["id"], "type": "function",
                       "function": {"name": b["name"], "arguments": json.dumps(b.get("input", {}))}}
                      for b in d.get("content", []) if b.get("type") == "tool_use"]
        usage = d.get("usage", {})
        inp, out = usage.get("input_tokens", 0), usage.get("output_tokens", 0)
        msg = {"content": text}
        if tool_calls:
            msg["tool_calls"] = tool_calls
        raw = {"choices": [{"message": msg, "finish_reason": d.get("stop_reason", "stop")}],
               "_anthropic": d}
        return AIResponse(content=text, model=d.get("model", self.model), tokens_used=inp + out,
                          finish_reason=d.get("stop_reason") or "stop",
                          cost=calc_cost(self.model, inp, out), raw=raw)

    def list_models(self):
        if self.api_key:
            try:
                response = requests.get(self.base_url + "/models", headers={
                    "x-api-key": self.api_key, "anthropic-version": "2023-06-01"}, timeout=8)
                response.raise_for_status()
                models = [item["id"] for item in response.json().get("data", [])]
                if models:
                    return models
            except (requests.RequestException, ValueError, KeyError):
                pass
        return ["claude-sonnet-4-5", "claude-opus-4-1",
                "claude-sonnet-4-20250514", "claude-3-5-haiku-20241022"]
