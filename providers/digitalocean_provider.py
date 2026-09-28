"""DigitalOcean GenAI Platform — Serverless Inference (API compatible OpenAI).

Endpoint correcto: https://inference.do-ai.run/v1
Da acceso, detrás de una sola base URL, a modelos de Meta (Llama), DeepSeek,
Mistral, OpenAI y Anthropic. La lista COMPLETA se trae en vivo de /models.
Auth: token personal de DigitalOcean o "model access key"
(https://cloud.digitalocean.com/gen-ai/model-access-keys).

Nota: `api.paperspace.io` era el endpoint viejo y devolvía una lista limitada;
por eso "solo mostraba algunos modelos". config.py migra el base_url viejo.
"""
from providers.base import OpenAICompatProvider


class DigitalOceanProvider(OpenAICompatProvider):
    BASE_URL = "https://inference.do-ai.run/v1"
    # fallback si /models no responde. La lista real se trae en vivo de /models,
    # PERO OJO: /models lista TODO el catálogo de DO; los modelos PROPIETARIOS
    # (anthropic-claude-*, openai-gpt-*/o*) requieren un tier de suscripción alto
    # y devuelven 403 "not available for your subscription tier". Los ABIERTOS
    # andan en el tier base. Por eso el default y el fallback son abiertos.
    # Incluye modelos de VISIÓN (-vl, -vision) para ask_model con imágenes.
    MODELS = ["deepseek-v4-pro", "deepseek-3.2", "glm-5.2", "kimi-k2.6",
              "llama-4-maverick", "llama3.3-70b-instruct", "qwen3-coder-flash",
              "openai-gpt-oss-120b", "mistral-3-14B",
              # Visión (multimodal: texto + imagen)
              "llama-3.2-11b-vision-instruct", "llama-3.2-90b-vision-instruct",
              "nemotron-nano-12b-v2-vl"]

    @staticmethod
    def provider_name(): return "DigitalOcean"

    @staticmethod
    def default_model(): return "deepseek-v4-pro"
