"""NVIDIA NIM Provider (integrate.api.nvidia.com, API compatible OpenAI)."""
from providers.base import OpenAICompatProvider


class NVIDIAProvider(OpenAICompatProvider):
    BASE_URL = "https://integrate.api.nvidia.com/v1"
    MODELS = ["z-ai/glm-5.2", "nvidia/llama-3.1-nemotron-70b",
              "mistralai/mistral-large", "meta/llama-3.1-70b"]

    @staticmethod
    def provider_name(): return "NVIDIA"
    @staticmethod
    def default_model(): return "z-ai/glm-5.2"

    # Los modelos de razonamiento de NIM cortan respuestas largas con 4096
    def chat(self, messages, system_prompt="", temperature=0.7, max_tokens=16384, tools=None):
        return super().chat(messages, system_prompt, temperature, max_tokens, tools)
