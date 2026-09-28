"""Cohere Provider (endpoint compatible OpenAI)."""
from providers.base import OpenAICompatProvider


class CohereProvider(OpenAICompatProvider):
    BASE_URL = "https://api.cohere.ai/compatibility/v1"
    MODELS = ["command-a-03-2025", "command-r-plus", "command-r"]

    @staticmethod
    def provider_name(): return "Cohere"
    @staticmethod
    def default_model(): return "command-a-03-2025"
