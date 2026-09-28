"""Replicate Provider - plataforma de modelos open-source.

Replicate ofrece acceso a miles de modelos open-source (Llama, Stable Diffusion, Flux, etc.)
con free tier de $0.005 de crédito al registrarse. Pay-per-prediction, sin GPUs.
Documentación: https://replicate.com/docs

Auth: API Token de Replicate (https://replicate.com/account/api-tokens)
"""
from providers.base import AIProvider, AIResponse
import requests


class ReplicateProvider(AIProvider):
    BASE_URL = "https://api.replicate.com/v1"
    MODELS = [
        "meta/meta-llama-3-70b-instruct",
        "meta/meta-llama-3.1-405b-instruct",
        "mistralai/mistral-7b-instruct-v0.3",
        "deepseek-ai/deepseek-r1",
    ]

    def __init__(self, api_key=None, **kwargs):
        super().__init__(api_key=api_key, **kwargs)
        self.base_url = kwargs.pop("base_url", "") or self.BASE_URL

    @staticmethod
    def provider_name():
        return "Replicate"

    @staticmethod
    def default_model():
        return "meta/meta-llama-3-70b-instruct"

    @staticmethod
    def requires_api_key():
        return True

    def chat(self, messages, system_prompt="", temperature=0.7, max_tokens=4096, tools=None):
        """Replicate usa API de predicciones, no es OpenAI-compatible directo."""
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        
        # Construir prompt
        full = ([{"role": "system", "content": system_prompt}] if system_prompt else []) + messages
        prompt_text = "\n".join([f"{m['role']}: {m['content']}" for m in full])
        
        payload = {
            "version": self._get_model_version(self.model),
            "input": {
                "prompt": prompt_text,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
        }
        
        try:
            r = requests.post(f"{self.base_url}/predictions", json=payload, headers=headers, timeout=60)
            r.raise_for_status()
            data = r.json()
            
            # Replicate es async, puede necesitar polling
            if data.get("status") in ("starting", "processing"):
                prediction_id = data["id"]
                data = self._wait_for_prediction(prediction_id, headers)
            
            content = data.get("output", "")
            if isinstance(content, list):
                content = "".join(content)
            
            return AIResponse(content=content, model=self.model, raw=data)
        except Exception as e:
            return AIResponse(content=f"Error: {str(e)}", model=self.model)

    def _get_model_version(self, model_id):
        """Mapeo simple de modelos a versiones (en producción usar /models endpoint)."""
        versions = {
            "meta/meta-llama-3-70b-instruct": "meta-llama-3-70b-instruct",
            "meta/meta-llama-3.1-405b-instruct": "meta-llama-3.1-405b-instruct",
            "mistralai/mistral-7b-instruct-v0.3": "mistral-7b-instruct-v0.3",
            "deepseek-ai/deepseek-r1": "deepseek-r1",
        }
        return versions.get(model_id, model_id.split("/")[-1])

    def _wait_for_prediction(self, prediction_id, headers, max_wait=120):
        """Poll hasta que la predicción termine."""
        import time
        for _ in range(max_wait):
            r = requests.get(f"{self.base_url}/predictions/{prediction_id}", headers=headers, timeout=10)
            r.raise_for_status()
            data = r.json()
            if data.get("status") in ("succeeded", "failed", "canceled"):
                return data
            time.sleep(1)
        return {"status": "timeout", "output": "Timeout waiting for prediction"}

    def list_models(self):
        """Replicate no tiene endpoint simple /models, retorna lista estática."""
        return list(self.MODELS)
