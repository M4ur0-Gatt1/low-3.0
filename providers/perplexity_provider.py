"""Perplexity Provider (multi-provider API with web search)."""
from providers.base import OpenAICompatProvider


class PerplexityProvider(OpenAICompatProvider):
    BASE_URL = "https://api.perplexity.ai"
    MODELS = [
        "sonar", "sonar-pro",
    ]

    @staticmethod
    def provider_name(): return "Perplexity"
    @staticmethod
    def default_model(): return "sonar"
