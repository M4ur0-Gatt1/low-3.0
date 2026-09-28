"""Grok Provider (xAI, API compatible OpenAI)."""
from providers.base import OpenAICompatProvider


class GrokProvider(OpenAICompatProvider):
    BASE_URL = "https://api.x.ai/v1"
    MODELS = [
        "grok-4.5",
        "grok-4.3",
        "grok-build-0.1",
        "grok-4",
        "grok-4-mini",
    ]

    @staticmethod
    def provider_name(): return "Grok"
    @staticmethod
    def default_model(): return "grok-4.5"
