"""Qwen Provider (DashScope, API compatible OpenAI)."""
from providers.base import OpenAICompatProvider


class QwenProvider(OpenAICompatProvider):
    BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    MODELS = ["qwen-plus", "qwen-max", "qwen-turbo", "qwen2.5-coder-32b"]

    @staticmethod
    def provider_name(): return "Qwen"
    @staticmethod
    def default_model(): return "qwen-plus"
