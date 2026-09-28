"""Together AI Provider (API compatible OpenAI)."""
from providers.base import OpenAICompatProvider


class TogetherProvider(OpenAICompatProvider):
    BASE_URL = "https://api.together.xyz/v1"
    MODELS = ["deepseek-ai/DeepSeek-V3", "meta-llama/Llama-3.3-70B-Instruct-Turbo",
              "Qwen/Qwen2.5-Coder-32B-Instruct"]

    @staticmethod
    def provider_name(): return "Together AI"
    @staticmethod
    def default_model(): return "deepseek-ai/DeepSeek-V3"
