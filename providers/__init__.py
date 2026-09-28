"""AI Provider Factory - register all providers here."""
from providers.base import AIProvider
from providers.groq_provider import GroqProvider
from providers.openai_provider import OpenAIProvider
from providers.anthropic_provider import AnthropicProvider
from providers.custom_provider import CustomProvider
from providers.deepseek_provider import DeepSeekProvider
from providers.qwen_provider import QwenProvider
from providers.glm_provider import GLMProvider, XAIProvider
from providers.nvidia_provider import NVIDIAProvider
from providers.siliconflow_provider import SiliconFlowProvider
from providers.digitalocean_provider import DigitalOceanProvider
from providers.ltx_provider import LTXProvider
from providers.fal_provider import FALProvider
from providers.aimlapi_provider import AIMLAPIProvider
from providers.agnes_provider import AgnesProvider
from providers.kimi_provider import KimiProvider
from providers.stepfun_provider import StepFunProvider
from providers.grok_provider import GrokProvider
from providers.perplexity_provider import PerplexityProvider
from providers.huggingface_provider import HuggingFaceProvider
from providers.openrouter_provider import OpenRouterProvider
from providers.gemini_provider import GeminiProvider
from providers.mistral_provider import MistralProvider
from providers.cohere_provider import CohereProvider
from providers.together_provider import TogetherProvider
from providers.fireworks_provider import FireworksProvider
from providers.cerebras_provider import CerebrasProvider
from providers.cloudflare_provider import CloudflareProvider
from providers.media_gateway import HiggsfieldProvider, ReplicateMediaProvider

PROVIDERS = {
    "higgsfield": HiggsfieldProvider, "replicate": ReplicateMediaProvider,
    "groq": GroqProvider, "openai": OpenAIProvider, "anthropic": AnthropicProvider,
    "deepseek": DeepSeekProvider, "qwen": QwenProvider, "glm": GLMProvider,
    "xai": XAIProvider, "nvidia": NVIDIAProvider, "siliconflow": SiliconFlowProvider,
    "digitalocean": DigitalOceanProvider, "ltx": LTXProvider, "fal": FALProvider,
    "aimlapi": AIMLAPIProvider, "agnes": AgnesProvider, "custom": CustomProvider,
    "stepfun": StepFunProvider,
    "kimi": KimiProvider, "grok": GrokProvider, "perplexity": PerplexityProvider,
    "huggingface": HuggingFaceProvider, "openrouter": OpenRouterProvider,
    "gemini": GeminiProvider,
    "mistral": MistralProvider, "cohere": CohereProvider,
    "together": TogetherProvider, "fireworks": FireworksProvider,
    "cerebras": CerebrasProvider, "cloudflare": CloudflareProvider,
}

def get_provider(name, api_key=None, **kwargs):
    cls = PROVIDERS.get(name) or (CustomProvider if is_custom_provider(name) else None)
    if not cls:
        raise ValueError(f"Provider '{name}' not found. Available: {list(PROVIDERS.keys())}")
    return cls(api_key=api_key, **kwargs)


def is_custom_provider(name):
    import re
    return isinstance(name, str) and bool(re.fullmatch(r"custom_[a-z0-9_]{1,48}", name))
