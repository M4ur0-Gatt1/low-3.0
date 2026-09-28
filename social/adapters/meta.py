"""Instagram / Facebook via Meta Graph API."""
import time, requests
from .base import SocialAdapter
from ..secure import encrypt, decrypt


class MetaAdapter(SocialAdapter):
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
        return "instagram"  # instagram/fb comparten API; diferenciamos por row

    @staticmethod
    def limits() -> dict:
        from .base import PLATFORM_LIMITS
        return PLATFORM_LIMITS["instagram"]

    def refresh(self) -> None:
        self._load()
        url = "https://graph.facebook.com/v19.0/oauth/access_token"
        r = requests.get(url, params={
            "grant_type": "fb_exchange_token",
            "client_id": self.row["client_id"],
            "client_secret": decrypt(self.row["client_secret"].encode()) if self.row.get("client_secret") else "",
            "fb_exchange_token": self._tokens["access_token"],
        })
        r.raise_for_status()
        d = r.json()
        self._tokens["access_token"] = d["access_token"]
        self._tokens["expires_at"] = time.time() + d.get("expires_in", 5184000)

    def publish(self, asset_url: str, caption: str, hashtags: list[str]) -> str:
        self._load()
        token = self._tokens["access_token"]
        full_caption = caption + "\n\n" + " ".join(hashtags)

        # Instagram: 2 pasos (container + publish)
        # Paso 1: crear media container
        r = requests.post(
            f"https://graph.facebook.com/v19.0/{self.row.get('ig_user_id', 'me')}/media",
            data={"image_url": asset_url, "caption": full_caption},
            params={"access_token": token})
        r.raise_for_status()
        container_id = r.json()["id"]

        # Paso 2: publicar
        r = requests.post(
            f"https://graph.facebook.com/v19.0/{self.row.get('ig_user_id', 'me')}/media_publish",
            data={"creation_id": container_id},
            params={"access_token": token})
        r.raise_for_status()
        return r.json()["id"]
