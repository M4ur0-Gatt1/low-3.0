"""SocialAdapter(ABC): interfaz unificada para plataformas de redes sociales."""
from abc import ABC, abstractmethod


class SocialAdapter(ABC):
    @staticmethod
    @abstractmethod
    def platform() -> str: ...

    @staticmethod
    @abstractmethod
    def limits() -> dict:
        """{'max_chars':..., 'max_tags':..., 'media': [...], 'ratios': [...]}"""

    @abstractmethod
    def publish(self, asset_url: str, caption: str, hashtags: list[str]) -> str:
        """Sube media + crea post. Devuelve platform_post_id."""

    @abstractmethod
    def refresh(self) -> None:
        """Renueva access token con el refresh token; persiste cifrado."""


# ── límites por plataforma ──
PLATFORM_LIMITS = {
    "instagram": {"max_chars": 2200, "max_tags": 30, "media": ["png", "mp4"],
                  "ratios": ["1:1", "4:5", "9:16"]},
    "facebook": {"max_chars": 63206, "max_tags": 0, "media": ["png", "mp4"],
                 "ratios": ["1:1", "16:9"]},
    "linkedin": {"max_chars": 3000, "max_tags": 0, "media": ["png", "mp4"],
                 "ratios": ["1:1", "16:9"]},
    "x": {"max_chars": 280, "max_tags": 0, "media": ["png", "mp4"],
          "ratios": ["16:9", "1:1"]},
    "tiktok": {"max_chars": 2200, "max_tags": 20, "media": ["mp4"],
               "ratios": ["9:16"]},
}
