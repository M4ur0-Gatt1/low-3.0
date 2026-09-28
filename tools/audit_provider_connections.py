"""Probe configured LLMs directly (no failover). --live sends a tiny paid request.

Never outputs credentials, response bodies or local configuration paths.
Media generation is intentionally excluded from connection probes.
"""
import argparse
import concurrent.futures
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import Config
from providers import get_provider
from providers.base import OpenAICompatProvider


def check(item):
    name, settings = item
    result = {"provider": name, "model": settings.get("model", "")}
    if not settings.get("api_key"):
        return {**result, "status": "no_key"}
    if name in {"fal", "ltx", "higgsfield", "replicate"}:
        return {**result, "status": "media_not_generated"}
    try:
        provider = get_provider(name, **settings)
        if isinstance(provider, OpenAICompatProvider):
            provider.t.max_retries = 1
            provider.t.timeout = (8, 20)
        reply = provider.chat([{"role": "user", "content": "Reply with only OK."}], max_tokens=64)
        return {**result, "status": "ok" if reply.content.strip() else "empty_response",
                "tokens": reply.tokens_used}
    except Exception as error:
        # HTTP status only; an exception can contain a key or echoed user text.
        import re
        match = re.search(r"\b(400|401|402|403|404|408|422|429|500|502|503|504)\b", str(error))
        return {**result, "status": "error", "error_type": type(error).__name__,
                "http_status": getattr(getattr(error, "response", None), "status_code", None) or (match.group(1) if match else None)}


def catalog(item):
    """Authenticated read only probe. A catalog is not proof of inference access."""
    import requests
    name, settings = item
    if not settings.get("api_key") or name in {"fal", "ltx", "higgsfield", "replicate"}:
        return {"provider": name, "status": "skipped"}
    try:
        provider = get_provider(name, **settings)
        headers = {"Authorization": "Bearer " + settings["api_key"]}
        if name == "anthropic":
            headers = {"x-api-key": settings["api_key"], "anthropic-version": "2023-06-01"}
        reply = requests.get(provider.base_url.rstrip("/") + "/models", headers=headers,
                             timeout=(8, 15), allow_redirects=False)
        result = {"provider": name, "http_status": reply.status_code}
        if reply.ok:
            models = [model.get("id") for model in reply.json().get("data", [])]
            result.update(model_count=len(models), selected_available=settings.get("model") in models)
        return result
    except Exception as error:
        return {"provider": name, "status": type(error).__name__}


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true")
    parser.add_argument("--catalog", action="store_true")
    args = parser.parse_args()
    if not args.live and not args.catalog:
        parser.error("Use --live to authorize minimal billable LLM probes")
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        for result in pool.map(catalog if args.catalog else check, Config().data["providers"].items()):
            print(json.dumps(result), flush=True)
