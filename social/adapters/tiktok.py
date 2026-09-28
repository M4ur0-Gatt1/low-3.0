"""TikTok Content Posting API adapter."""
import time, requests
from .base import SocialAdapter
from ..secure import encrypt, decrypt


class TikTokAdapter(SocialAdapter):
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
        return "tiktok"

    @staticmethod
    def limits() -> dict:
        from .base import PLATFORM_LIMITS
        return PLATFORM_LIMITS["tiktok"]

    def refresh(self) -> None:
        self._load()
        r = requests.post("https://open.tiktokapis.com/v2/oauth/token/", data={
            "client_key": self.row["client_id"],
            "client_secret": decrypt(self.row["client_secret"].encode()) if self.row.get("client_secret") else "",
            "grant_type": "refresh_token",
            "refresh_token": self._tokens["refresh_token"],
        })
        r.raise_for_status()
        d = r.json()
        self._tokens["access_token"] = d["access_token"]
        self._tokens["refresh_token"] = d.get("refresh_token", self._tokens["refresh_token"])
        self._tokens["expires_at"] = time.time() + d.get("expires_in", 86400)

    def publish(self, asset_url: str, caption: str, hashtags: list[str]) -> str:
        self._load()
        token = self._tokens["access_token"]

        # init → upload → publish
        r = requests.post("https://open.tiktokapis.com/v2/post/publish/content/init/", headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }, json={
            "post_info": {"title": caption[:2200], "privacy_level": "PUBLIC_TO_EVERYONE"},
            "source_info": {"source": "PULL_FROM_URL", "video_url": asset_url},
        })
        r.raise_for_status()
        d = r.json()["data"]
        return d.get("publish_id", d.get("status", "ok"))
