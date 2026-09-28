"""DeepSeek Provider (API compatible OpenAI)."""
from providers.base import OpenAICompatProvider


class DeepSeekProvider(OpenAICompatProvider):
    BASE_URL = "https://api.deepseek.com/v1"
    MODELS = ["deepseek-chat", "deepseek-reasoner"]

    @staticmethod
    def provider_name(): return "DeepSeek"
    @staticmethod
    def default_model(): return "deepseek-chat"
