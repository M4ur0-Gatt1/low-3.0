"""Custom Provider - cualquier endpoint compatible OpenAI (Ollama, LM Studio, etc.)."""
from providers.base import OpenAICompatProvider


class CustomProvider(OpenAICompatProvider):
    BASE_URL = "http://localhost:11434/v1"
    MODELS = ["llama3", "mistral", "codellama", "deepseek-coder"]

    @staticmethod
    def provider_name(): return "Custom"
    @staticmethod
    def default_model(): return "llama3"
    @staticmethod
    def requires_api_key(): return False

    def list_models(self):
        return [self.model] + [m for m in self.MODELS if m != self.model]
