"""Mistral AI Provider (API compatible OpenAI)."""
from providers.base import OpenAICompatProvider


class MistralProvider(OpenAICompatProvider):
    BASE_URL = "https://api.mistral.ai/v1"
    MODELS = ["mistral-large-latest", "mistral-small-latest",
              "codestral-latest", "open-mistral-nemo"]

    @staticmethod
    def provider_name(): return "Mistral AI"
    @staticmethod
    def default_model(): return "mistral-large-latest"
