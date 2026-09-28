"""Fireworks AI Provider (API compatible OpenAI)."""
from providers.base import OpenAICompatProvider


class FireworksProvider(OpenAICompatProvider):
    BASE_URL = "https://api.fireworks.ai/inference/v1"
    MODELS = ["accounts/fireworks/models/deepseek-v3",
              "accounts/fireworks/models/llama-v3p3-70b-instruct",
              "accounts/fireworks/models/qwen2p5-coder-32b-instruct"]

    @staticmethod
    def provider_name(): return "Fireworks AI"
    @staticmethod
    def default_model(): return "accounts/fireworks/models/deepseek-v3"
