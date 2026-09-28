"""AIMLAPI Provider - 1000+ AI models through a single API (OpenAI compatible)."""
from providers.base import OpenAICompatProvider


class AIMLAPIProvider(OpenAICompatProvider):
    BASE_URL = "https://api.aimlapi.com/v1"
    MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "claude-sonnet-4-5",
              "claude-opus-4-1", "gemini-1.5-pro", "gemini-1.5-flash",
              "deepseek-chat", "deepseek-reasoner", "llama-3.3-70b",
              "llama-3.1-8b", "mistral-large", "qwen-plus", "qwen-max"]

    @staticmethod
    def provider_name(): return "AIMLAPI"
    @staticmethod
    def default_model(): return "gpt-4o"
