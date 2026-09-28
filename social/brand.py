"""Brand Profile: gestión de identidad de marca (compacto + RAG opcional)."""
import json, hashlib
from . import db


class BrandManager:
    def __init__(self, owner):
        """owner: SocialService (usa su .conn thread-local) o una conexión
        sqlite directa (tests/scripts)."""
        self._owner = owner

    @property
    def conn(self):
        return self._owner.conn if hasattr(self._owner, "conn") else self._owner

    @property
    def brand_id(self):
        return db._brand_id(self.conn)

    def get_profile(self) -> dict:
        cur = self.conn.execute(
            "SELECT profile_json, version FROM brand_identity WHERE id=?",
            (self.brand_id,))
        r = cur.fetchone()
        if r:
            return json.loads(r["profile_json"])
        return {}

    def save_profile(self, profile_json: str) -> dict:
        """Guarda el BrandProfile y bump version (invalida caché IA)."""
        try:
            p = json.loads(profile_json) if isinstance(profile_json, str) else profile_json
        except json.JSONDecodeError:
            return {"error": "JSON inválido"}
        profile_str = json.dumps(p, ensure_ascii=False)
        self.conn.execute(
            "UPDATE brand_identity SET profile_json=?, version=version+1, "
            "updated_at=datetime('now') WHERE id=?",
            (profile_str, self.brand_id))
        self.conn.commit()
        return p

    def get_guide(self) -> str:
        cur = self.conn.execute(
            "SELECT guide_text FROM brand_identity WHERE id=?", (self.brand_id,))
        r = cur.fetchone()
        return r["guide_text"] if r else ""

    def set_guide(self, text: str):
        """Guía extensa de marca (opcional). Se trocea en chunks para RAG."""
        self.conn.execute(
            "UPDATE brand_identity SET guide_text=? WHERE id=?",
            (text, self.brand_id))
        # borrar chunks viejos y recrear (simplificado: sin embeddings reales)
        self.conn.execute("DELETE FROM brand_chunks WHERE brand_id=?", (self.brand_id,))
        if text.strip():
            # chunking simple por párrafos, máx 300 tokens (~2000 chars)
            paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
            for i, p in enumerate(paragraphs):
                topic = "general"
                if any(w in p.lower() for w in ["tono", "voz", "lenguaje"]):
                    topic = "tone"
                elif any(w in p.lower() for w in ["color", "fuente", "logo", "visual"]):
                    topic = "visual"
                elif any(w in p.lower() for w in ["legal", "no digas", "prohibido"]):
                    topic = "legal"
                elif any(w in p.lower() for w in ["audiencia", "cliente", "público"]):
                    topic = "audience"
                self.conn.execute(
                    "INSERT INTO brand_chunks (brand_id, topic, content) VALUES (?,?,?)",
                    (self.brand_id, topic, p[:2000]))
        self.conn.commit()

    def get_chunks(self, copy: str, top_n: int = 3) -> list[str]:
        """RAG simplificado: keyword match (sin embeddings si numpy no está)."""
        cur = self.conn.execute(
            "SELECT content FROM brand_chunks WHERE brand_id=?", (self.brand_id,))
        rows = cur.fetchall()
        if not rows:
            return []
        # keyword scoring simple
        words = set(copy.lower().split())
        scored = []
        for r in rows:
            score = sum(1 for w in words if w in r["content"].lower())
            scored.append((score, r["content"]))
        scored.sort(key=lambda x: -x[0])
        return [c for _, c in scored[:top_n] if _ > 0]
