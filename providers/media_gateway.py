"""Documented asynchronous media protocols, independent of the desktop bridge.

Model IDs and inputs are configurable: catalogs and model schemas evolve independently.
Never retry a submission automatically: a timeout may already have created a paid job.
"""
import time
import re
from urllib.parse import urlparse

import requests

from providers.base import AIProvider


class MediaProvider(AIProvider):
    @staticmethod
    def requires_api_key():
        return True

    def chat(self, *args, **kwargs):
        raise ValueError("Este proveedor genera medios; elegí un LLM para el agente.")

    def list_models(self):
        return [self.model]


class HiggsfieldProvider(MediaProvider):
    @staticmethod
    def provider_name():
        return "Higgsfield"

    @staticmethod
    def default_model():
        return "bytedance/seedance-2.0/text-to-video"


class ReplicateMediaProvider(MediaProvider):
    @staticmethod
    def provider_name():
        return "Replicate (media)"

    @staticmethod
    def default_model():
        return ""


def trusted_url(url, base):
    """Only send credentials to the API origin, never an output CDN or redirect."""
    parsed, origin = urlparse(url), urlparse(base)
    if parsed.scheme != "https" or parsed.netloc != origin.netloc or parsed.username:
        raise ValueError("El proveedor devolvió una URL de control fuera de su API")
    return url


def generate(provider, config, kind, prompt, *, cancelled=lambda: False,
             progress=lambda message: None, timeout=600, http=requests):
    key = config.get("api_key", "").strip()
    model = config.get("image_model" if kind == "image" else "model", "").strip()
    if not key or not model:
        raise ValueError(f"Configurá la clave y el modelo de {kind} en {provider}")
    if not re.fullmatch(r"[\w./:-]+", model) or ".." in model:
        raise ValueError("ID de modelo inválido")
    params = config.get(kind + "_params") or {}
    if not isinstance(params, dict):
        raise ValueError("Los parámetros del modelo deben ser un objeto JSON")
    body = {**params, "prompt": prompt}
    if provider == "higgsfield":
        if ":" not in key or not all(key.split(":", 1)):
            raise ValueError("Higgsfield necesita ID:SECRET en el campo API key")
        base = "https://api.higgsfield.ai"
        headers = {"Authorization": f"Key {key}"}
        url = f"{base}/{model}"
    elif provider == "replicate":
        base = "https://api.replicate.com"
        headers = {"Authorization": f"Bearer {key}"}
        if ":" in model:
            _, version = model.rsplit(":", 1)
            url, body = base + "/v1/predictions", {"version": version, "input": body}
        else:
            if len(model.split("/")) != 2:
                raise ValueError("Replicate necesita owner/model o owner/model:version")
            url, body = f"{base}/v1/models/{model}/predictions", {"input": body}
    else:
        raise ValueError("Protocolo de medios no soportado")
    if cancelled():
        raise RuntimeError("Generación cancelada antes del envío")
    def control(method, url, **kwargs):
        response = getattr(http, method)(trusted_url(url, base), headers=headers,
                                        timeout=30, allow_redirects=False, **kwargs)
        if not 200 <= response.status_code < 300:
            raise RuntimeError(f"{provider}: HTTP {response.status_code}")
        return response
    job = control("post", url, json=body).json()
    job_id = job.get("request_id") or job.get("id") or "desconocido"
    status_url = job.get("status_url") or job.get("urls", {}).get("get")
    cancel_url = job.get("cancel_url") or job.get("urls", {}).get("cancel")
    progress(f"{provider}: solicitud {job_id}")
    deadline, delay = time.monotonic() + timeout, 2
    while True:
        status = job.get("status", "")
        if status in ("completed", "succeeded"):
            break
        if status in ("failed", "nsfw", "canceled", "cancelled", "aborted"):
            raise RuntimeError(f"{provider}: {status} (solicitud {job_id})")
        if cancelled() or time.monotonic() >= deadline:
            message = "Espera cancelada" if cancelled() else "Tiempo de espera agotado"
            if cancel_url:
                try:
                    control("post", cancel_url)
                    message += "; cancelación remota solicitada"
                except (requests.RequestException, RuntimeError, ValueError):
                    message += "; no se pudo confirmar la cancelación remota"
            raise RuntimeError(f"{message}. Solicitud {job_id}; revisá su estado antes de reenviar")
        if not status_url:
            raise ValueError(f"Respuesta sin URL de estado (solicitud {job_id})")
        # Short sleeps keep Stop responsive even during exponential backoff.
        until = min(time.monotonic() + delay, deadline)
        while time.monotonic() < until and not cancelled():
            time.sleep(min(.2, max(0, until - time.monotonic())))
        if cancelled():
            continue
        try:
            job = control("get", status_url).json()
        except requests.RequestException:
            # Retry reads only. Never repeat the POST.
            pass
        delay = min(10, delay * 1.5)
    output = job.get("output") if provider == "replicate" else job.get("images" if kind == "image" else "video")
    if isinstance(output, list):
        output = output[0] if output else None
    if isinstance(output, dict):
        output = output.get("url")
    if not isinstance(output, str) or urlparse(output).scheme != "https":
        raise ValueError(f"{provider}: respuesta sin archivo {kind}")
    response = http.get(output, timeout=90)  # Deliberately no credentials on downloads.
    response.raise_for_status()
    return response.content
