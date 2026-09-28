"""OpenAI Provider (API compatible OpenAI, obvio)."""
from providers.base import OpenAICompatProvider


class OpenAIProvider(OpenAICompatProvider):
    BASE_URL = "https://api.openai.com/v1"
    MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o1", "o3-mini"]

    @staticmethod
    def provider_name(): return "OpenAI"
    @staticmethod
    def default_model(): return "gpt-4o"
