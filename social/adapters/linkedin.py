"""LinkedIn REST API adapter."""
import time, requests
from .base import SocialAdapter
from ..secure import encrypt, decrypt


class LinkedInAdapter(SocialAdapter):
    def __init__(self, account_row):
        self.row = account_row
        self._tokens = None

    def _load(self):
        if not self._tokens:
            import json
            self._tokens = json.loads(decrypt(self.row["auth_blob"]))

    def _save(self, conn):
        import json
        conn.execute(
            "UPDATE social_accounts SET auth_blob=?, token_expires_at=? WHERE id=?",
            (encrypt(json.dumps(self._tokens)),
             time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(self._tokens.get("expires_at", 0))),
             self.row["id"]))
        conn.commit()

    @staticmethod
    def platform() -> str:
        return "linkedin"

    @staticmethod
    def limits() -> dict:
        from .base import PLATFORM_LIMITS
        return PLATFORM_LIMITS["linkedin"]

    def refresh(self) -> None:
        self._load()
        r = requests.post("https://www.linkedin.com/oauth/v2/accessToken", data={
            "grant_type": "refresh_token",
            "refresh_token": self._tokens["refresh_token"],
            "client_id": self.row["client_id"],
            "client_secret": decrypt(self.row["client_secret"].encode()) if self.row.get("client_secret") else "",
        })
        r.raise_for_status()
        d = r.json()
        self._tokens["access_token"] = d["access_token"]
        self._tokens["refresh_token"] = d.get("refresh_token", self._tokens["refresh_token"])
        self._tokens["expires_at"] = time.time() + d.get("expires_in", 5184000)

    def publish(self, asset_url: str, caption: str, hashtags: list[str]) -> str:
        self._load()
        token = self._tokens["access_token"]
        person = self.row.get("handle", "me")

        full_text = caption + "\n\n" + " ".join(hashtags)
        r = requests.post("https://api.linkedin.com/v2/posts", headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "LinkedIn-Version": "202405",
        }, json={
            "author": f"urn:li:person:{person}",
            "commentary": full_text,
            "visibility": "PUBLIC",
            "distribution": {"feedDistribution": "MAIN_FEED"},
            "content": {"media": {"id": asset_url}},  # simplificado
        })
        r.raise_for_status()
        return r.headers.get("x-restli-id", "ok")
