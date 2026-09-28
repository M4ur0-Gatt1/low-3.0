"""Hugging Face Inference Providers — miles de modelos open source (API compatible OpenAI)."""
from providers.base import OpenAICompatProvider


class HuggingFaceProvider(OpenAICompatProvider):
    BASE_URL = "https://router.huggingface.co/v1"
    # Sufijo :fastest elige el proveedor más rápido; también :cheapest o :groq etc.
    MODELS = ["meta-llama/Llama-3.3-70B-Instruct:fastest",
              "meta-llama/Llama-3.1-8B-Instruct:fastest",
              "Qwen/Qwen2.5-72B-Instruct:fastest",
              "mistralai/Mistral-7B-Instruct-v0.3:fastest",
              "deepseek-ai/DeepSeek-R1:fastest"]

    @staticmethod
    def provider_name(): return "Hugging Face"
    @staticmethod
    def default_model(): return "meta-llama/Llama-3.3-70B-Instruct:fastest"
