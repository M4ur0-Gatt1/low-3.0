"""Offline provider/bridge contracts: no real keys, spending or network."""
import copy
import json
import sys
import tempfile
import itertools
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from config import Config, DEFAULT_CONFIG
from providers import PROVIDERS, get_provider
from providers.base import OpenAICompatProvider
from providers.media_gateway import generate
import main


def response(payload, code=200):
    result = Mock(status_code=code, ok=code < 400, content=b"media")
    result.json.return_value = payload
    result.iter_lines.return_value = [
        b'data: {"choices":[{"delta":{"content":"OK"},"finish_reason":null}]}',
        b'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
        b'data: [DONE]']
    return result


class Providers(unittest.TestCase):
    def test_every_registered_chat_provider_uses_key_model_endpoint_and_tools(self):
        for name, cls in PROVIDERS.items():
            if not issubclass(cls, OpenAICompatProvider):
                continue
            with self.subTest(provider=name):
                provider = get_provider(name, api_key="test-key", model="chosen-model",
                                        base_url="https://example.test/v1/")
                reply = response({"model": "chosen-model", "choices": [{"message": {
                    "content": "OK", "tool_calls": [{"id": "1", "type": "function",
                    "function": {"name": "read_file", "arguments": "{}"}}]}, "finish_reason": "tool_calls"}]})
                with patch("requests.post", return_value=reply) as post:
                    result = provider.chat([{"role": "user", "content": "test"}],
                                           tools=[{"type": "function", "function": {"name": "read_file"}}])
                    args, kwargs = post.call_args
                    self.assertEqual(args[0], "https://example.test/v1/chat/completions")
                    self.assertEqual(kwargs["headers"]["Authorization"], "Bearer test-key")
                    self.assertEqual(kwargs["json"]["model"], "chosen-model")
                    self.assertEqual(kwargs["json"]["tools"][0]["function"]["name"], "read_file")
                    self.assertEqual(result.raw["choices"][0]["message"]["tool_calls"][0]["id"], "1")
                with patch("requests.post", return_value=reply):
                    events = list(provider.chat_stream([{"role": "user", "content": "test"}]))
                    self.assertTrue(any(event["type"] == "done" for event in events))

    def test_registered_providers_are_offered_and_offered_ones_exist(self):
        """Un proveedor a medio enchufar no se nota hasta que alguien lo busca.

        Hay dos formas de dejarlo a medias y ninguna hace ruido:

        · la CLASE registrada en PROVIDERS pero el proveedor sin entrada en
          DEFAULT_CONFIG: la tarjeta no aparece nunca en la pantalla de APIs,
          asi que no hay donde poner la clave. Funciona todo menos poder
          usarlo.
        · la entrada en DEFAULT_CONFIG sin clase: la tarjeta aparece y falla
          al primer uso.

        Agregar un proveedor toca cuatro lugares (la clase, PROVIDERS,
        DEFAULT_CONFIG y el orden de respaldo); esto cuida los dos que dejan
        el resultado invisible o roto.
        """
        registrados = set(PROVIDERS)
        ofrecidos = set(DEFAULT_CONFIG["providers"])
        sin_tarjeta = sorted(registrados - ofrecidos)
        self.assertFalse(sin_tarjeta,
            "registrados en PROVIDERS pero sin entrada en DEFAULT_CONFIG, asi que "
            "su tarjeta no aparece y no hay donde poner la clave: " + ", ".join(sin_tarjeta))
        sin_clase = sorted(ofrecidos - registrados)
        self.assertFalse(sin_clase,
            "ofrecidos en DEFAULT_CONFIG pero sin clase en PROVIDERS, asi que la "
            "tarjeta aparece y falla al usarla: " + ", ".join(sin_clase))

    def test_chat_providers_have_a_reachable_default_endpoint(self):
        """Todo proveedor de chat tiene que saber a DONDE hablar sin que le
        completen la Base URL a mano: el campo es opcional en la tarjeta y
        queda vacio por defecto, asi que si la clase no trae BASE_URL el
        proveedor no sirve recien cuando alguien ya puso su clave."""
        for name, cls in PROVIDERS.items():
            if not issubclass(cls, OpenAICompatProvider):
                continue
            with self.subTest(provider=name):
                url = (getattr(cls, "BASE_URL", "") or
                       DEFAULT_CONFIG["providers"].get(name, {}).get("base_url", ""))
                self.assertTrue(url.startswith("http"),
                    name + " no tiene endpoint por defecto ni en la clase ni en la "
                    "configuracion: con la Base URL vacia no hay a donde hablar")
                self.assertTrue(cls.default_model(),
                    name + " no declara modelo por defecto")

    def test_anthropic_native_auth_endpoint_and_tool_conversion(self):
        provider = get_provider("anthropic", api_key="test-key", base_url="https://example.test/v1/", model="chosen")
        with patch("requests.post", return_value=response({"content": [{"type": "tool_use", "id": "1", "name": "read_file", "input": {"path": "a"}}]})) as post:
            result = provider.chat([{"role": "user", "content": "test"}])
            self.assertEqual(post.call_args.args[0], "https://example.test/v1/messages")
            self.assertEqual(post.call_args.kwargs["headers"]["x-api-key"], "test-key")
            self.assertEqual(result.raw["choices"][0]["message"]["tool_calls"][0]["function"]["name"], "read_file")

    def test_cloudflare_account_and_legacy_url(self):
        provider = get_provider("cloudflare", api_key="key", account_id="account")
        self.assertEqual(provider.base_url, "https://api.cloudflare.com/client/v4/accounts/account/ai/v1")
        old = get_provider("cloudflare", base_url="https://api.cloudflare.com/client/v4/accounts/a/ai/run")
        self.assertTrue(old.base_url.endswith("/ai/v1"))
        with self.assertRaises(ValueError):
            get_provider("cloudflare")

    def test_config_isolation_migration_and_custom_profiles(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "config.json"
            cfg = Config(path)
            cfg.data["providers"]["groq"]["api_key"] = "test"
            self.assertEqual(DEFAULT_CONFIG["providers"]["groq"]["api_key"], "")
            path.write_text(json.dumps({"providers": {"higgsfield": {"api_key": "a:b"}, "custom_lab": {
                "api_key": "", "base_url": "http://localhost:1234/v1", "model": "local"}}}), encoding="utf-8")
            loaded = Config(path)
            self.assertEqual(loaded.data["providers"]["higgsfield"]["image_model"], "higgsfield-ai/soul/v2/standard")
            self.assertIn("custom_lab", loaded.data["providers"])
            self.assertIn("replicate", loaded.data["providers"])
            self.assertEqual(get_provider("custom_lab", model="local").model, "local")

    def test_bridge_persists_fields_and_passes_account(self):
        with tempfile.TemporaryDirectory() as directory:
            api = main.Api.__new__(main.Api)
            api.cfg = Config(Path(directory) / "config.json")
            api.save_keys({"cloudflare": {"api_key": "fake", "account_id": "abc", "model": "chosen"},
                           "higgsfield": {"api_key": "a:b", "video_params": {"duration": 5}},
                           "custom_lab": {"api_key": "", "base_url": "http://localhost:1234/v1", "model": "local"}})
            self.assertIn("/abc/ai/v1", api._mk_provider("cloudflare").base_url)
            self.assertEqual(Config(api.cfg.path).data["providers"]["higgsfield"]["video_params"], {"duration": 5})
            self.assertEqual(api._mk_provider("custom_lab").model, "local")

    def test_media_never_in_chat_failover(self):
        api = main.Api.__new__(main.Api)
        api.cfg = Mock(data={"providers": {key: {"api_key": "test"} for key in PROVIDERS}})
        api.cfg.get_active_provider.return_value = "higgsfield"
        api._ollama = ["local"]
        self.assertFalse(set(name for name, _ in api._chain()) & api.MEDIA_ONLY)

    def test_failover_respects_configured_model(self):
        api = main.Api.__new__(main.Api)
        api.cfg = Mock(data={"providers": {"groq": {"api_key": "test", "model": "chosen-new-model"}}})
        api.cfg.get_active_provider.return_value = "openai"
        api._ollama = ["local"]
        self.assertIn(("groq", "chosen-new-model"), api._chain())

    def test_existing_media_authentication(self):
        api = main.Api.__new__(main.Api)
        api.cfg = Mock()
        api.cfg.get_api_key.return_value = "test-key"
        api.cfg.get_model.return_value = "chosen-video"
        api._push = Mock()
        video = response({})
        video.headers = {"content-type": "video/mp4"}
        with patch("requests.post", return_value=video) as post:
            self.assertEqual(api._ltx_video("test"), (b"media", None))
            self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer test-key")
            self.assertEqual(post.call_args.kwargs["json"]["model"], "chosen-video")
        with patch("requests.post", return_value=response({"images": [{"url": "https://cdn.test/image"}]})) as post, patch("requests.get", return_value=video) as get:
            self.assertEqual(api._fal_run("vendor/model", {"prompt": "test"}, "image"), (b"media", None))
            self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Key test-key")
            self.assertNotIn("headers", get.call_args.kwargs)

    def test_plan_validation_and_event(self):
        api = main.Api.__new__(main.Api)
        api._push = Mock()
        steps = [{"title": "Verificar", "status": "in_progress"}]
        self.assertEqual(api._exec_tool("update_plan", {"steps": steps}, "", "python"), "Plan actualizado en la interfaz")
        api._push.assert_called_with("agent_plan", {"steps": steps})
        from code_runner.agent_plan import validate
        with self.assertRaises(ValueError):
            validate(steps * 2)

    def test_higgsfield_completed_and_auth_not_sent_to_cdn(self):
        http = Mock()
        http.post.return_value = response({"status": "completed", "images": [{"url": "https://cdn.test/image.png"}]})
        http.get.return_value = response({})
        result = generate("higgsfield", {"api_key": "id:secret", "image_model": "higgsfield-ai/soul/v2/standard"}, "image", "portrait", http=http)
        self.assertEqual(result, b"media")
        self.assertEqual(http.post.call_args.kwargs["headers"]["Authorization"], "Key id:secret")
        self.assertNotIn("headers", http.get.call_args.kwargs)

    def test_media_failures_do_not_retry_submission(self):
        for status in ("failed", "nsfw", "canceled"):
            http = Mock()
            http.post.return_value = response({"status": status, "request_id": "job"})
            with self.assertRaises(RuntimeError):
                generate("higgsfield", {"api_key": "id:secret", "model": "vendor/model"}, "video", "test", http=http)
            self.assertEqual(http.post.call_count, 1)

    def test_replicate_version_submission(self):
        http = Mock()
        http.post.return_value = response({"status": "succeeded", "output": ["https://cdn.test/media"]})
        http.get.return_value = response({})
        generate("replicate", {"api_key": "key", "model": "owner/model:version"}, "video", "test", http=http)
        self.assertEqual(http.post.call_args.kwargs["json"], {"version": "version", "input": {"prompt": "test"}})

    def test_higgsfield_polls_once_and_downloads_completed_output(self):
        http = Mock()
        http.post.return_value = response({"status": "queued", "request_id": "job", "status_url": "https://api.higgsfield.ai/requests/job/status"})
        http.get.side_effect = [response({"status": "completed", "video": {"url": "https://cdn.test/video.mp4"}}), response({})]
        with patch("providers.media_gateway.time.monotonic", side_effect=itertools.count(0, 5)), patch("providers.media_gateway.time.sleep"):
            self.assertEqual(generate("higgsfield", {"api_key": "id:secret", "model": "vendor/model"}, "video", "test", http=http), b"media")
        self.assertEqual(http.post.call_count, 1)
        self.assertEqual(http.get.call_args_list[0].kwargs["headers"]["Authorization"], "Key id:secret")
        self.assertNotIn("headers", http.get.call_args_list[1].kwargs)

    def test_timeout_cancels_without_resubmitting(self):
        http = Mock()
        http.post.side_effect = [response({"status": "queued", "request_id": "job", "cancel_url": "https://api.higgsfield.ai/requests/job/cancel"}), response({}, 202)]
        with self.assertRaisesRegex(RuntimeError, "Tiempo de espera agotado"):
            generate("higgsfield", {"api_key": "id:secret", "model": "vendor/model"}, "video", "test", timeout=0, http=http)
        self.assertEqual(http.post.call_count, 2)
        self.assertTrue(http.post.call_args.args[0].endswith("/cancel"))

    def test_control_urls_cannot_exfiltrate_credentials(self):
        from providers.media_gateway import trusted_url
        with self.assertRaises(ValueError):
            trusted_url("https://another.test/status", "https://api.higgsfield.ai")

    def test_catalog_probe_reports_real_http_failure(self):
        api = main.Api.__new__(main.Api)
        api.cfg = Mock(data={"providers": {"groq": {}}})
        api._mk_provider = Mock(return_value=get_provider("groq", api_key="secret", model="chosen"))
        with patch("requests.get", return_value=response({}, 401)):
            result = api.check_provider("groq")
            self.assertEqual(result["status"], "error")
            self.assertNotIn("secret", result["message"])

    def test_higgsfield_checks_draft_without_saving_or_generating(self):
        api = main.Api.__new__(main.Api)
        api.cfg = Mock(data={"providers": {"higgsfield": {"api_key": "old"}}})
        with patch("requests.get") as get, patch("requests.post") as post:
            for key in ("", "only-id", "Key id:secret", "id:"):
                self.assertEqual(api.check_provider("higgsfield", {"api_key": key})["status"], "error")
            result = api.check_provider("higgsfield", {"api_key": "id:secret", "model": "vendor/model"})
            self.assertEqual(result["status"], "unverified")
            self.assertNotIn("id:secret", result["message"])
            get.assert_not_called()
            post.assert_not_called()
            self.assertEqual(api.cfg.data["providers"]["higgsfield"]["api_key"], "old")

    def test_catalog_uses_draft_credentials(self):
        api = main.Api.__new__(main.Api)
        api.cfg = Mock(data={"providers": {}})
        with patch("requests.get", return_value=response({"data": [{"id": "draft-model"}]})) as get:
            result = api.check_provider("custom_test", {"api_key": "draft-key", "model": "draft-model", "base_url": "https://example.test/v1"})
            self.assertEqual(result["status"], "catalog_ok")
            self.assertEqual(get.call_args.kwargs["headers"]["Authorization"], "Bearer draft-key")
            self.assertEqual(get.call_args.kwargs["timeout"], (5, 10))


if __name__ == "__main__":
    unittest.main(verbosity=2)
