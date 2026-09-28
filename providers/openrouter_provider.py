"""OpenRouter Provider — 50+ modelos (Claude, Llama, Mistral, Gemini…) vía una sola API."""
from providers.base import OpenAICompatProvider


class OpenRouterProvider(OpenAICompatProvider):
    BASE_URL = "https://openrouter.ai/api/v1"
    MODELS = ["google/gemini-2.5-flash-preview",
              "anthropic/claude-sonnet-4",
              "meta-llama/llama-3.3-70b-instruct",
              "mistralai/mistral-large",
              "openai/gpt-4o-mini",
              "deepseek/deepseek-chat"]

    @staticmethod
    def provider_name(): return "OpenRouter"
    @staticmethod
    def default_model(): return "google/gemini-2.5-flash-preview"
