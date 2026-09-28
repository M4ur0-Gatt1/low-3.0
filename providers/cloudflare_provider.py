"""Cloudflare Workers AI Provider (API compatible OpenAI).

Cloudflare Workers AI ofrece 10,000 Neurons por día gratis en el plan Free.
API compatible OpenAI: https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model}
Modelos disponibles: Llama 3.3, Mistral, Gemma, DeepSeek, Qwen, etc.
Documentación: https://developers.cloudflare.com/workers-ai/

Auth: API Token de Cloudflare (https://dash.cloudflare.com/profile/api-tokens)
Requiere permisos: Account - Workers AI - Edit
"""
from providers.base import OpenAICompatProvider


class CloudflareProvider(OpenAICompatProvider):
    BASE_URL = "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1"
    MODELS = [
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        "@cf/meta/llama-3.1-8b-instruct-fp8-fast",
        "@cf/meta/llama-3.2-3b-instruct",
        "@cf/meta/llama-3.2-1b-instruct",
        "@cf/mistral/mistral-7b-instruct-v0.1",
        "@cf/mistralai/mistral-small-3.1-24b-instruct",
        "@cf/google/gemma-3-12b-it",
        "@cf/qwen/qwen2.5-coder-32b-instruct",
        "@cf/qwen/qwq-32b",
        "@cf/deepseek-ai/deepseek-r1-distill-qwen-32b",
    ]

    def __init__(self, api_key=None, **kwargs):
        # Cloudflare requiere account_id en la URL
        account_id = kwargs.pop("account_id", "")
        base_url = kwargs.pop("base_url", "")
        if not base_url and account_id:
            base_url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1"
        elif not base_url:
            base_url = self.BASE_URL
        base_url = base_url.replace("{account_id}", account_id)
        if base_url.rstrip("/").endswith("/ai/run"):
            base_url = base_url.rstrip("/")[:-len("/run")] + "/v1"
        if not account_id and ("/accounts//" in base_url or "{account_id}" in base_url):
            raise ValueError("Cloudflare necesita account_id o una Base URL completa")
        super().__init__(api_key=api_key, base_url=base_url, **kwargs)

    @staticmethod
    def provider_name():
        return "Cloudflare"

    @staticmethod
    def default_model():
        return "@cf/meta/llama-3.3-70b-instruct-fp8-fast"

    def list_models(self):
        """Cloudflare no tiene endpoint /models, retorna la lista estática."""
        return list(self.MODELS)
