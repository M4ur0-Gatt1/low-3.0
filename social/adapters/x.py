"""X (Twitter) API v2 adapter."""
import time, requests
from .base import SocialAdapter
from ..secure import encrypt, decrypt


class XAdapter(SocialAdapter):
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
        return "x"

    @staticmethod
    def limits() -> dict:
        from .base import PLATFORM_LIMITS
        return PLATFORM_LIMITS["x"]

    def refresh(self) -> None:
        self._load()
        r = requests.post("https://api.twitter.com/2/oauth2/token", data={
            "refresh_token": self._tokens["refresh_token"],
            "grant_type": "refresh_token",
            "client_id": self.row["client_id"],
        })
        r.raise_for_status()
        d = r.json()
        self._tokens["access_token"] = d["access_token"]
        self._tokens["refresh_token"] = d.get("refresh_token", self._tokens["refresh_token"])
        self._tokens["expires_at"] = time.time() + d.get("expires_in", 7200)

    def publish(self, asset_url: str, caption: str, hashtags: list[str]) -> str:
        self._load()
        token = self._tokens["access_token"]
        full_text = caption + "\n" + " ".join(hashtags)
        r = requests.post("https://api.twitter.com/2/tweets", headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }, json={"text": full_text[:280]})
        r.raise_for_status()
        return r.json()["data"]["id"]
