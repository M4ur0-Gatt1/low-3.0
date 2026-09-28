"""GLM (Zhipu) y xAI Providers (API compatible OpenAI)."""
from providers.base import OpenAICompatProvider


class GLMProvider(OpenAICompatProvider):
    BASE_URL = "https://open.bigmodel.cn/api/paas/v4"
    MODELS = ["glm-4", "glm-4-flash", "glm-4v", "glm-4-air"]

    @staticmethod
    def provider_name(): return "GLM"
    @staticmethod
    def default_model(): return "glm-4"


class XAIProvider(OpenAICompatProvider):
    BASE_URL = "https://api.x.ai/v1"
    MODELS = ["grok-2", "grok-2-mini", "grok-3"]

    @staticmethod
    def provider_name(): return "xAI"
    @staticmethod
    def default_model(): return "grok-2"
