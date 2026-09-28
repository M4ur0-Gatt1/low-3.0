"""Groq Provider - ultra-fast inference (API compatible OpenAI)."""
from providers.base import OpenAICompatProvider


class GroqProvider(OpenAICompatProvider):
    BASE_URL = "https://api.groq.com/openai/v1"
    # fallback si /models no responde; la lista real se trae en vivo
    MODELS = ["llama-3.3-70b-versatile", "llama-3.1-8b-instant",
              "meta-llama/llama-4-scout-17b-16e-instruct",
              "groq/compound", "groq/compound-mini"]

    @staticmethod
    def provider_name(): return "Groq"
    @staticmethod
    def default_model(): return "llama-3.3-70b-versatile"
