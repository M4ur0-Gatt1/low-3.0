"""Configuración de LOW: API keys, tema, zoom.

Vive en el directorio de datos del usuario según el sistema operativo:
Windows %APPDATA%/LOW · macOS ~/Library/Application Support/LOW ·
Linux ~/.config/LOW.
"""
import json
import copy
import os
import sys
from pathlib import Path


def data_dir() -> Path:
    """Directorio de datos de LOW según el SO (config, historial, log)."""
    if os.name == "nt":
        base = Path(os.environ.get("APPDATA", Path.home()))
    elif sys.platform == "darwin":
        base = Path.home() / "Library" / "Application Support"
    else:
        base = Path(os.environ.get("XDG_CONFIG_HOME",
                                   Path.home() / ".config"))
    d = base / "LOW"
    d.mkdir(parents=True, exist_ok=True)
    return d


BASE = data_dir()
CONFIG_PATH = BASE / 'config.json'

DEFAULT_CONFIG = {
    "active_provider": "deepseek",
    "theme": "dark",
    "font_size": 12,
    # Orden de failover: si el provider activo falla, LOW va probando estos en orden.
    # Solo se usan los que tienen API key cargada. Si no se configura, usa el orden
    # por defecto (deepseek  siliconflow  nvidia  groq  openai  ...  custom).
    "failover_order": ["deepseek", "siliconflow", "nvidia", "groq", "gemini",
                       "openai", "anthropic", "qwen", "glm", "xai", "kimi", "stepfun",
                       "perplexity", "openrouter", "huggingface",
                       "mistral", "cohere", "together", "fireworks", "cerebras",
                       "cloudflare", "digitalocean", "agnes", "aimlapi", "custom"],
    # límites del agente — ajustables desde . La idea de LOW es NO ponerle
    # techos al trabajo salvo los que impone la API/costo. Subilos si querés
    # que insista más en tareas grandes; el único freno duro es que deje de
    # avanzar (repetir sin progreso) para no quemar tokens en un bucle.
    "agent": {
        "max_steps": 40,          # rondas de tool-calls por tramo antes de auto-continuar
        "max_continuations": 25,  # veces que sigue solo tras llegar al tope de pasos
        "memory_turns": 24,       # turnos de conversación que recuerda en la sesión
        "learn": True,            # Reflexion: aprende de sus errores y los recuerda
        # tool gating: qué tools se mandan (menos tokens/req). auto = detecta
        # code/design/animation por sesión; full = todos; code = sin imagen/video/anim;
        # design = todos; animation = modo animación con todas las tools de media.
        "tool_profile": "auto",
        # Modo de trabajo del editor: code | design | animation
        "editor_mode": "code",
        # auto-verificación antes de decir "listo":
        "verify_runtime": True,   # correr el código y corregir errores de ejecución
        "verify_design": True,    # rasterizar .svg y criticarlo con visión (vector iterativo)
    },
    # servidores SSH guardados (alias reutilizables para ssh_exec/scp_upload):
    # [{"name": "yungas", "user": "root", "host": "1.2.3.4", "port": "", "key": ""}]
    "ssh_hosts": [],
    "providers": {
        "higgsfield": {"api_key": "", "model": "bytedance/seedance-2.0/text-to-video",
                      "image_model": "higgsfield-ai/soul/v2/standard", "base_url": "",
                      "video_params": {}, "image_params": {}},
        "replicate": {"api_key": "", "model": "", "image_model": "black-forest-labs/flux-schnell",
                      "base_url": "", "video_params": {}, "image_params": {}},
        "deepseek": {"api_key": "", "model": "deepseek-chat", "base_url": ""},
        "nvidia": {"api_key": "", "model": "meta/llama-3.3-70b-instruct", "base_url": ""},
        "groq": {"api_key": "", "model": "llama-3.3-70b-versatile", "base_url": ""},
        "siliconflow": {"api_key": "", "model": "deepseek-ai/DeepSeek-V3", "base_url": ""},
        "openai": {"api_key": "", "model": "gpt-4o", "base_url": ""},
        "anthropic": {"api_key": "", "model": "claude-sonnet-4-5", "base_url": ""},
        "custom": {"api_key": "", "model": "llama3", "base_url": "http://localhost:11434/v1"},
        "qwen": {"api_key": "", "model": "qwen-plus", "base_url": ""},
        "glm": {"api_key": "", "model": "glm-4", "base_url": ""},
        "xai": {"api_key": "", "model": "grok-4.5", "base_url": ""},
        # Kimi (Moonshot AI) — OpenAI-compatible con 1M contexto y razonamiento
        # Key: https://platform.kimi.ai/console/api-keys
        "kimi": {"api_key": "", "model": "kimi-k3", "base_url": ""},
        "stepfun": {"api_key": "", "model": "step-3.7-flash", "base_url": ""},
        # Perplexity — multi-provider con búsqueda web integrada y citas
        # Key: https://console.perplexity.ai/group/keys
        "perplexity": {"api_key": "", "model": "sonar", "base_url": ""},
        # Agnes AI — OpenAI-compatible (https://platform.agnes-ai.com)
        # Key: https://platform.agnes-ai.com/settings/apiKeys
        "agnes": {"api_key": "", "model": "gpt-4o", "base_url": "https://api.agnes-ai.com/api/v1"},
        # DigitalOcean GenAI Platform — Serverless Inference (compatible OpenAI).
        # Endpoint: https://inference.do-ai.run/v1   da acceso a TODOS los modelos
        # con los que tengas acceso (Llama, DeepSeek, Mistral, OpenAI, Anthropic).
        # Key: token personal de DO o model access key
        #      (https://cloud.digitalocean.com/gen-ai/model-access-keys)
        "digitalocean": {"api_key": "", "model": "deepseek-v4-pro", "base_url": "https://inference.do-ai.run/v1"},
        # LTX (Lightricks) — SOLO video (textvideo / imagenvideo con audio).
        # No es un modelo de chat: no entra en la cadena de failover del agente.
        # Key: https://console.ltx.video/api-keys
        "ltx": {"api_key": "", "model": "ltx-2-3-fast", "base_url": ""},
        # fal.ai — GATEWAY universal de imagen/video: una key para 1000+ modelos
        # (Seedance, Flux, Kling, Wan, Veo, Seedream...). SOLO media (no chatea).
        # Key: https://fal.ai/dashboard/keys. Cambiar de modelo = cambiar el model id
        # (ver fal.ai/models). model = video textovideo; i2v_model = imagenvideo;
        # image_model = generación de imagen.
        "fal": {"api_key": "",
                "model": "bytedance/seedance-2.0/text-to-video",
                "i2v_model": "bytedance/seedance-2.0/image-to-video",
                "image_model": "fal-ai/flux/schnell",
                "colorize_model": "fal-ai/flux-kontext/dev",
                "base_url": ""},
        # Google AI Studio (Gemini) — 6M tokens/día gratis en tier gratuito
        # Key: https://aistudio.google.com/apikey
        "gemini": {"api_key": "", "model": "gemini-2.5-flash", "base_url": ""},
        # OpenRouter — 50+ modelos con créditos gratuitos al registrarse
        # Key: https://openrouter.ai/keys
        "openrouter": {"api_key": "", "model": "google/gemini-2.5-flash-preview", "base_url": ""},
        # Hugging Face Inference Providers — API gratuita para modelos comunitarios
        # Key: https://huggingface.co/settings/tokens (permiso "Inference Providers")
        "huggingface": {"api_key": "", "model": "meta-llama/Llama-3.3-70B-Instruct:fastest", "base_url": ""},
        # Grok (xAI) — Key: https://console.x.ai
        "grok": {"api_key": "", "model": "grok-4.5", "base_url": ""},
        # AIMLAPI — gateway a 1000+ modelos con una sola key
        # Key: https://aimlapi.com/app/keys
        "aimlapi": {"api_key": "", "model": "gpt-4o", "base_url": ""},
        # Mistral AI — Key: https://console.mistral.ai/api-keys
        "mistral": {"api_key": "", "model": "mistral-large-latest", "base_url": ""},
        # Cohere (endpoint compatible OpenAI) — Key: https://dashboard.cohere.com/api-keys
        "cohere": {"api_key": "", "model": "command-a-03-2025", "base_url": ""},
        # Together AI — 200+ modelos abiertos. Key: https://api.together.xyz/settings/api-keys
        "together": {"api_key": "", "model": "deepseek-ai/DeepSeek-V3", "base_url": ""},
        # Fireworks AI — Key: https://fireworks.ai/account/api-keys
        "fireworks": {"api_key": "", "model": "accounts/fireworks/models/deepseek-v3", "base_url": ""},
        # Cerebras — inferencia muy rápida. Key: https://cloud.cerebras.ai
        "cerebras": {"api_key": "", "model": "llama-3.3-70b", "base_url": ""},
        # Cloudflare Workers AI — el base_url necesita tu account_id
        # ({account_id} se reemplaza solo). Key: https://dash.cloudflare.com/profile/api-tokens
        "cloudflare": {"api_key": "", "model": "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
                       "base_url": "", "account_id": ""},
    }
}


class Config:
    def __init__(self, path: Path = CONFIG_PATH):
        self.path = path
        self.data = self._load()

    def _load(self) -> dict:
        if self.path.exists():
            # utf-8-sig tolera BOM (editores/PowerShell suelen agregarlo)
            with open(self.path, "r", encoding="utf-8-sig") as f:
                data = json.load(f)
            merged = copy.deepcopy(DEFAULT_CONFIG)
            merged.update(data)
            # providers se mergea por clave: un config.json viejo no debe
            # ocultar providers agregados después en DEFAULT_CONFIG
            merged["providers"] = {
                key: {**DEFAULT_CONFIG["providers"].get(key, {}), **value}
                for key, value in {**copy.deepcopy(DEFAULT_CONFIG["providers"]), **data.get("providers", {})}.items()}
            if self._migrate(merged):
                try:
                    with open(self.path, "w", encoding="utf-8") as f:
                        json.dump(merged, f, indent=2)
                except OSError:
                    pass
            return merged
        return copy.deepcopy(DEFAULT_CONFIG)

    # endpoints viejos que quedaron guardados en config.json y hay que corregir
    _OBSOLETE_BASE_URLS = {
        "perplexity": ({"https://api.perplexity.ai/v1"}, "https://api.perplexity.ai"),
        "digitalocean": ({"https://api.paperspace.io/v1",
                          "https://gateway.digitalocean.ai/v1",
                          "https://api.paperspace.io", ""},
                         "https://inference.do-ai.run/v1"),
        "agnes": ({"https://platform.agnes-ai.com/v1",
                   "https://platform.agnes-ai.com/api/v1",
                   "https://api.agnes-ai.com/v1", ""},
                  "https://api.agnes-ai.com/api/v1"),
        "qwen": ({"https://dashscope.aliyuncs.com/api/v1",
                  "https://dashscope.aliyuncs.com/v1",
                  "https://dashscope.aliyuncs.com/compatible-mode"},
                 "https://dashscope.aliyuncs.com/compatible-mode/v1"),
    }
    # IDs de modelo que pusimos como default y NO andan en el tier base de DO
    # (formato viejo con puntos, o propietarios que dan 403 por tier). Se
    # reescriben a un modelo ABIERTO que sí funciona. OJO: NO incluimos
    # 'llama3.3-70b-instruct' acá porque ES un ID válido y abierto que anda.
    _OBSOLETE_MODELS = {
        "perplexity": ({"sonar-medium-online", "sonar-small-online", "sonar-medium-chat", "sonar-small-chat"}, "sonar"),
        "digitalocean": ({"llama-3.3-70b-instruct", "llama-3.1-8b-instruct",
                          "mixtral-8x7b-instruct", "openai-gpt-4o-mini",
                          "openai-gpt-4o"},
                         "deepseek-v4-pro"),
    }

    def _migrate(self, cfg: dict) -> bool:
        """Corrige config.json ya guardados: base_urls y IDs de modelo obsoletos
        (p.ej. DigitalOcean pasó de paperspace a inference.do-ai.run, y sus IDs de
        modelo no llevan puntos). Devuelve True si cambió algo."""
        changed = False
        provs = cfg.get("providers", {})
        # Configs viejos de la UI llegaron a guardar claves como "undefined".
        # Si quedan, confunden el conteo de APIs y el failover.
        for name in list(provs.keys()):
            from providers import is_custom_provider
            if name not in DEFAULT_CONFIG["providers"] and not is_custom_provider(name):
                provs.pop(name, None)
                changed = True
        for name, (olds, new) in self._OBSOLETE_BASE_URLS.items():
            p = provs.get(name)
            if p is not None and p.get("base_url", "") in olds:
                p["base_url"] = new
                changed = True
        for name, (olds, new) in self._OBSOLETE_MODELS.items():
            p = provs.get(name)
            if p is not None and p.get("model", "") in olds:
                p["model"] = new
                changed = True
        return changed

    def save(self):
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump(self.data, f, indent=2)

    def get_api_key(self, provider: str) -> str:
        return self.data.get("providers", {}).get(provider, {}).get("api_key", "")

    def set_api_key(self, provider: str, key: str):
        self.data.setdefault("providers", {}).setdefault(provider, {})["api_key"] = key
        self.save()

    def get_model(self, provider: str) -> str:
        return self.data.get("providers", {}).get(provider, {}).get("model", "")

    def set_model(self, provider: str, model: str):
        self.data.setdefault("providers", {}).setdefault(provider, {})["model"] = model
        self.save()

    def get_active_provider(self) -> str:
        return self.data.get("active_provider", "groq")

    def set_active_provider(self, provider: str):
        self.data["active_provider"] = provider
        self.save()

    @property
    def theme(self) -> str:
        return self.data.get("theme", "dark")

    @property
    def font_size(self) -> int:
        return self.data.get("font_size", 14)
