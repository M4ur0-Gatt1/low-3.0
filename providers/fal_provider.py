"""fal.ai — gateway universal de imagen/video (Seedance, Flux, Kling, Wan, Veo…).

SOLO media: no es un modelo de chat (marcado media-only en main.py, no entra en
la cadena de failover ni en el selector de modelo). La generación real la hacen
main.py `_fal_video` / `_fal_image` (queue API de fal). Esta clase existe para que
el proveedor esté REGISTRADO —`get_provider('fal')` no rompe— y aparezca en .

Key: https://fal.ai/dashboard/keys · modelos: https://fal.ai/models
"""
from providers.base import AIProvider, AIResponse


class FALProvider(AIProvider):
    MODELS = ["bytedance/seedance-2.0/text-to-video",
              "bytedance/seedance-2.0/image-to-video",
              "fal-ai/flux/schnell", "fal-ai/bytedance/seedream/v4/text-to-image"]

    @staticmethod
    def provider_name() -> str:
        return "fal.ai (media)"

    @staticmethod
    def default_model() -> str:
        return "bytedance/seedance-2.0/text-to-video"

    @staticmethod
    def requires_api_key() -> bool:
        return True

    def chat(self, messages, system_prompt="", temperature=0.7,
             max_tokens=4096, tools=None) -> AIResponse:
        return AIResponse(
            content=" fal.ai es un gateway de IMAGEN/VIDEO, no de chat. Pedí una "
                    "imagen o un video y el agente lo usa solo; no lo elijas como "
                    "modelo del agente.",
            model=self.model, finish_reason="stop")

    def list_models(self) -> list:
        return list(self.MODELS)
