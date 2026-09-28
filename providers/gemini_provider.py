"""Google AI Studio (Gemini) — familia Gemini vía endpoint compatible OpenAI."""
from providers.base import OpenAICompatProvider


class GeminiProvider(OpenAICompatProvider):
    BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"
    MODELS = ["gemini-2.5-flash", "gemini-2.5-pro",
              "gemini-2.0-flash", "gemini-1.5-flash", "gemini-1.5-pro"]

    @staticmethod
    def provider_name(): return "Google Gemini"
    @staticmethod
    def default_model(): return "gemini-2.5-flash"
