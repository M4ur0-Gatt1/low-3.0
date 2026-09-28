"""Agnes AI Provider — OpenAI-compatible (https://platform.agnes-ai.com)."""
from providers.base import OpenAICompatProvider


class AgnesProvider(OpenAICompatProvider):
    BASE_URL = "https://api.agnes-ai.com/api/v1"
    MODELS = ["gpt-4o", "claude-sonnet-4-5", "deepseek-v4-pro"]

    @staticmethod
    def provider_name(): return "Agnes AI"
    @staticmethod
    def default_model(): return "gpt-4o"
