"""Base AI Provider - interface that all providers must implement."""
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from providers.transport import Transport


@dataclass
class AIResponse:
    """Structured response from any AI provider."""
    content: str
    model: str = ""
    tokens_used: int = 0
    finish_reason: str = "stop"
    cost: float = 0.0
    latency_ms: int = 0
    cached_tokens: int = 0    # tokens del prompt leídos del cache (90% más baratos)
    raw: dict = field(default_factory=dict)


class AIProvider(ABC):
    """Abstract base for all AI providers. Add new APIs by subclassing this."""

    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None,
                 model: Optional[str] = None, **kwargs):
        self.api_key = api_key
        self.base_url = base_url
        self.model = model or self.default_model()
        self.kwargs = kwargs

    @staticmethod
    @abstractmethod
    def provider_name() -> str:
        """Human-readable provider name (e.g. 'Groq', 'OpenAI')."""
        ...

    @staticmethod
    @abstractmethod
    def default_model() -> str:
        """Default model ID for this provider."""
        ...

    @staticmethod
    @abstractmethod
    def requires_api_key() -> bool:
        """Whether this provider needs an API key."""
        ...

    @abstractmethod
    def chat(self, messages: list[dict], system_prompt: str = "",
             temperature: float = 0.7, max_tokens: int = 4096,
             tools: Optional[list] = None) -> AIResponse:
        """Send a chat completion request. Returns AIResponse.

        `tools` usa el formato OpenAI ({"type":"function","function":{...}});
        cada provider lo traduce a su API si hace falta. Los tool_calls de la
        respuesta se exponen siempre en raw["choices"][0]["message"]["tool_calls"]
        con formato OpenAI, sea cual sea el provider.
        """
        ...

    @abstractmethod
    def list_models(self) -> list[str]:
        """Return available model IDs."""
        ...

    def code_completion(self, code: str, instruction: str,
                        language: str = "python") -> AIResponse:
        """Specialized method for code generation/editing tasks."""
        system = (
            f"You are an expert {language} programmer. "
            "Respond ONLY with the code, no explanations unless asked. "
            "Write clean, well-documented, production-ready code."
        )
        messages = [
            {"role": "user", "content": f"Task: {instruction}\n\nContext code:\n```{language}\n{code}\n```\n\nProvide the solution:"}
        ]
        return self.chat(messages, system_prompt=system)


class OpenAICompatProvider(AIProvider):
    """Base para providers con API compatible OpenAI.

    Usa Transport (retry con backoff, streaming, costo) y soporta tools.
    Un provider nuevo solo define BASE_URL, MODELS, provider_name y default_model.
    """
    BASE_URL = ""
    MODELS: list[str] = []

    def __init__(self, api_key: str = None, **kwargs):
        base_url = kwargs.pop("base_url", "") or self.BASE_URL
        super().__init__(api_key=api_key, base_url=base_url,
                         model=kwargs.pop("model", None) or self.default_model(), **kwargs)
        self.base_url = self.base_url.rstrip("/")
        self.t = Transport(self.base_url, api_key or "na")

    @staticmethod
    def requires_api_key() -> bool:
        return True

    def chat(self, messages, system_prompt="", temperature=0.7, max_tokens=4096, tools=None):
        full = ([{"role": "system", "content": system_prompt}] if system_prompt else []) + messages
        r = self.t.chat(self.model, full, temperature, max_tokens, tools=tools)
        return AIResponse(content=r.content, model=r.model,
                          tokens_used=r.tokens_input + r.tokens_output,
                          finish_reason=r.finish_reason, cost=r.cost,
                          latency_ms=r.latency_ms,
                          cached_tokens=getattr(r, "cached_tokens", 0), raw=r.raw)

    def chat_stream(self, messages, system_prompt="", temperature=0.7,
                    max_tokens=4096, tools=None):
        """Yield eventos {type: content|reasoning} y al final {type: done, response: AIResponse}."""
        full = ([{"role": "system", "content": system_prompt}] if system_prompt else []) + messages
        for chunk in self.t.chat_stream(self.model, full, temperature, max_tokens, tools=tools):
            if chunk["type"] in ("content", "reasoning"):
                yield chunk
            elif chunk["type"] == "done":
                r = chunk["result"]
                yield {"type": "done", "response": AIResponse(
                    content=r.content, model=r.model,
                    tokens_used=r.tokens_input + r.tokens_output,
                    finish_reason=r.finish_reason, cost=r.cost,
                    latency_ms=r.latency_ms,
                    cached_tokens=getattr(r, "cached_tokens", 0), raw=r.raw)}

    # marca para que send_chat sepa que este provider hace streaming real
    supports_stream = True

    # modelos que NO sirven como modelo de CHAT del agente (imagen, video, audio,
    # embeddings, rerankers, moderación…). Se filtran del selector para que el
    # usuario no elija p.ej. un Qwen-Image y le falle todo con "model does not exist".
    NON_CHAT = ("whisper", "tts", "-asr", "audio", "voice", "speech", "guard",
                "embed", "embedding", "moderation", "rerank", "reranker", "bge",
                "dall-e", "dalle", "stable-diffusion", "stable_diffusion", "sdxl",
                "sd3", "flux", "kolors", "cogview", "-image", "image-", "qwen-image",
                "z-image", "playground-v", "photomaker", "instantid", "wan", "-video",
                "video-", "musicgen", "seedream", "hunyuan-video", "ltx")

    def list_models(self):
        """Lista en vivo desde /models si hay key; si no, la estática. Filtra los
        modelos que no son de chat (imagen/audio/embeddings/rerank)."""
        import requests
        try:
            r = requests.get(f"{self.base_url}/models",
                             headers={"Authorization": f"Bearer {self.api_key}"},
                             timeout=8)
            if r.ok:
                ids = sorted(m["id"] for m in r.json().get("data", [])
                             if not any(x in m["id"].lower() for x in self.NON_CHAT))
                if ids:
                    return ids
        except (requests.RequestException, ValueError, KeyError):
            pass
        return list(self.MODELS) if self.MODELS else [self.model]
