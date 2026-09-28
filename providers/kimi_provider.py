"""Kimi Provider (Moonshot AI, API compatible OpenAI)."""
from providers.base import OpenAICompatProvider


class KimiProvider(OpenAICompatProvider):
    BASE_URL = "https://api.moonshot.ai/v1"
    MODELS = [
        "kimi-k3",
        "kimi-k2.7-code",
        "kimi-k2.7-code-highspeed",
        "kimi-k2.6",
        "kimi-k2.5",
        "moonshot-v1-8k",
        "moonshot-v1-32k",
        "moonshot-v1-128k",
        "moonshot-v1-auto",
    ]

    @staticmethod
    def provider_name(): return "Kimi"
    @staticmethod
    def default_model(): return "kimi-k3"
