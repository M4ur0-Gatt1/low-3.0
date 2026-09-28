"""Cliente Canva Connect API: autofill de Brand Templates + export."""
import time, requests

API = "https://api.canva.com/rest/v1"


class CanvaClient:
    """Canva usa API key (no OAuth de usuario): el Client ID = API Key.
    La key se guarda cifrada en social_accounts (platform='canva')."""

    def __init__(self, api_key: str):
        self.api_key = api_key

    def _h(self):
        return {"Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"}

    def list_templates(self, brand_id: str = ""):
        """Lista Brand Templates del equipo."""
        r = requests.get(f"{API}/brand-templates", headers=self._h())
        r.raise_for_status()
        items = r.json().get("items", [])
        return [{"id": t["id"], "name": t.get("name", ""),
                 "placeholders": t.get("placeholders", {})} for t in items]

    def get_template(self, template_id: str):
        """Obtiene placeholders de un template."""
        r = requests.get(f"{API}/brand-templates/{template_id}", headers=self._h())
        r.raise_for_status()
        t = r.json().get("template", {})
        return {"id": t["id"], "name": t.get("name", ""),
                "placeholders": t.get("placeholders", {})}

    def render(self, brand_template_id: str, canva_vars: dict[str, str],
               fmt: str = "png") -> str:
        """Rellena un Brand Template y devuelve la URL del asset exportado."""
        payload = {
            "brand_template_id": brand_template_id,
            "data": {
                k: ({"type": "image", "asset_id": v[6:]}
                    if v.startswith("asset:") else {"type": "text", "text": v})
                for k, v in canva_vars.items()
            },
        }
        r = requests.post(f"{API}/autofills", json=payload, headers=self._h())
        r.raise_for_status()
        design = self._poll(f"{API}/autofills/{r.json()['job']['id']}")
        design_id = design["result"]["design"]["id"]

        r = requests.post(f"{API}/exports", headers=self._h(), json={
            "design_id": design_id,
            "format": {"type": fmt},
        })
        r.raise_for_status()
        job = self._poll(f"{API}/exports/{r.json()['job']['id']}")
        return job["urls"][0]

    def _poll(self, url: str, every: float = 2.0, timeout: int = 180) -> dict:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            job = requests.get(url, headers=self._h()).json()["job"]
            if job["status"] == "success":
                return job
            if job["status"] == "failed":
                raise RuntimeError(f"Canva job failed: {job.get('error')}")
            time.sleep(every)
        raise TimeoutError(url)
