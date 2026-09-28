"""Cerebras Provider (inferencia muy rapida, API compatible OpenAI)."""
from providers.base import OpenAICompatProvider


class CerebrasProvider(OpenAICompatProvider):
    BASE_URL = "https://api.cerebras.ai/v1"
    MODELS = ["llama-3.3-70b", "llama3.1-8b", "qwen-3-32b"]

    @staticmethod
    def provider_name(): return "Cerebras"
    @staticmethod
    def default_model(): return "llama-3.3-70b"
