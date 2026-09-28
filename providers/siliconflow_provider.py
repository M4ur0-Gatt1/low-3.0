"""SiliconFlow Provider (api.siliconflow.com, API compatible OpenAI).

Plataforma china que hostea DeepSeek, Qwen, GLM, Kimi, etc. con un solo
endpoint OpenAI-compatible. La lista real de modelos se trae en vivo de
/models (hay decenas y cambian seguido) — la estática es solo un fallback.
"""
from providers.base import OpenAICompatProvider


class SiliconFlowProvider(OpenAICompatProvider):
    BASE_URL = "https://api.siliconflow.com/v1"
    # fallback si /models no responde; la lista real se trae en vivo
    MODELS = ["deepseek-ai/DeepSeek-V3", "deepseek-ai/DeepSeek-R1",
              "Qwen/Qwen2.5-Coder-32B-Instruct", "Qwen/Qwen2.5-72B-Instruct",
              "zai-org/GLM-4.6", "moonshotai/Kimi-K2-Instruct"]

    @staticmethod
    def provider_name(): return "SiliconFlow"
    @staticmethod
    def default_model(): return "deepseek-ai/DeepSeek-V3"
