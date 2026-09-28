# LOW — Módulo de Gestión Autónoma de Redes Sociales (spec v1)

Alineado a la arquitectura existente de LOW: paquete nuevo `social/` espejando el
patrón adapter de `providers/` (ver `providers/base.py`), persistencia SQLite en
`config.data_dir()/social.db`, secretos cifrados fuera de `config.json`.

```
social/
├── __init__.py
├── db.py               # esquema SQLite + migraciones
├── brand.py            # BrandProfile compacto + RAG (brand_chunks)
├── canva_client.py     # Canva Connect API (autofill + export)
├── validator.py        # agente LLM: valida/adapta copy (JSON Schema estricto)
├── queue.py            # ContentQueue: estados y transiciones
├── scheduler.py        # tick de publicación (thread, 60s)
└── adapters/
    ├── base.py         # SocialAdapter(ABC): publish(), refresh(), limits()
    ├── meta.py         # Instagram/Facebook — Graph API
    ├── linkedin.py     # LinkedIn REST (versioned) API
    ├── x.py            # X API v2
    └── tiktok.py       # TikTok Content Posting API
```

---

## 1. Flujo autónomo (diagrama textual)

```
[content_queue: draft]
   │ scheduler.tick() — thread interno de LOW, cada 60s
   ▼
(1) SELECT item con status IN (draft, validated) AND scheduled_at <= now
   │
(2) VALIDACIÓN (token-saving)
    hash = sha256(copy_json + brand.version + platform)
    ├─ hit en ai_cache ───────────────────────► reutiliza respuesta (0 tokens)
    └─ miss:
        2a. RAG: embed(copy) → top-3 brand_chunks por coseno
            (solo si la guía extensa existe; el BrandProfile compacto
             SIEMPRE viaja completo: ~150 tokens)
        2b. LLM: system prompt §3 + {content, brand_profile, chunks, platform_limits}
        2c. Valida salida contra JSON Schema → 1 retry si inválida → persiste en ai_cache
    │
    ├─ ok=false (violación no corregible: claims/legal) → status=failed → notifica UI
    ▼ ok=true → status=validated, copy_json ← salida del agente
(3) RENDER (Canva Connect API) — status=rendering
    autofill(brand_template_id, canva_vars) → poll job → export {png|mp4}
    → asset_url en content_queue → status=ready
(4) PUBLICACIÓN — status=publishing
    adapter = registry[platform]
    token_expires_at < now+5min → adapter.refresh() (persiste cifrado)
    adapter.publish(asset_url, caption, hashtags) → platform_post_id
(5) RESULTADO
    éxito        → status=published, published_at=now
    HTTP 4xx     → status=failed (sin retry; error de datos/permisos)
    5xx / red    → attempts+1, backoff exponencial (2^n min, máx 3) → vuelve a ready
```

Un solo LLM-call por pieza; Canva, OAuth, reintentos y estados son 100% código.

---

## 2. Esquema de base de datos (SQLite)

```sql
CREATE TABLE brand_identity (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  profile_json TEXT NOT NULL,   -- BrandProfile compacto (abajo)
  version      INTEGER NOT NULL DEFAULT 1,  -- invalida ai_cache al cambiar
  updated_at   TEXT DEFAULT (datetime('now'))
);

-- RAG: guía de marca extensa troceada; NUNCA viaja entera al LLM
CREATE TABLE brand_chunks (
  id        INTEGER PRIMARY KEY,
  brand_id  INTEGER NOT NULL REFERENCES brand_identity(id) ON DELETE CASCADE,
  topic     TEXT,               -- 'tone' | 'visual' | 'legal' | 'audience'
  content   TEXT NOT NULL,      -- <= 300 tokens por chunk
  embedding BLOB NOT NULL       -- float32[], little-endian (numpy tobytes)
);

CREATE TABLE social_accounts (
  id               INTEGER PRIMARY KEY,
  brand_id         INTEGER REFERENCES brand_identity(id),
  platform         TEXT NOT NULL CHECK(platform IN
                     ('instagram','facebook','linkedin','x','tiktok')),
  handle           TEXT,
  auth_blob        BLOB NOT NULL, -- {access,refresh,expiry} cifrado Fernet
  scopes           TEXT,
  token_expires_at TEXT,
  status           TEXT DEFAULT 'active'
);

CREATE TABLE canva_templates (
  id                INTEGER PRIMARY KEY,
  brand_id          INTEGER REFERENCES brand_identity(id),
  canva_template_id TEXT UNIQUE NOT NULL,  -- Brand Template ID en Canva
  name              TEXT,
  placeholders_json TEXT NOT NULL, -- dataset del template: campos text/image + max_len
  format            TEXT           -- 'ig_post_1080' | 'story_9x16' | 'video_9x16' ...
);

CREATE TABLE content_queue (
  id               INTEGER PRIMARY KEY,
  brand_id         INTEGER REFERENCES brand_identity(id),
  account_id       INTEGER REFERENCES social_accounts(id),
  template_id      INTEGER REFERENCES canva_templates(id),
  copy_json        TEXT NOT NULL,  -- salida validada del agente (schema §3)
  asset_url        TEXT,           -- export de Canva (PNG/MP4)
  content_hash     TEXT,           -- sha256(copy+brand.version+platform)
  status           TEXT DEFAULT 'draft' CHECK(status IN
                     ('draft','validated','rendering','ready','scheduled',
                      'publishing','published','failed')),
  scheduled_at     TEXT,
  published_at     TEXT,
  platform_post_id TEXT,
  error            TEXT,
  attempts         INTEGER DEFAULT 0
);
CREATE INDEX idx_queue_due ON content_queue(status, scheduled_at);

-- caché de validaciones IA (repetición = 0 tokens)
CREATE TABLE ai_cache (
  hash          TEXT PRIMARY KEY,
  response_json TEXT NOT NULL,
  created_at    TEXT DEFAULT (datetime('now'))
);
```

### BrandProfile compacto (`profile_json`, ~150 tokens inyectados por request)

```json
{
  "tone": "cercano, directo, sin tecnicismos; voseo rioplatense",
  "banned": ["barato", "gratis!!", "revolucionario"],
  "tags": ["#circa", "#hechoamano"],
  "palette": ["#1A1A2E", "#E94560", "#F5F5F5"],
  "fonts": {"head": "Archivo Black", "body": "Inter"},
  "cta": ["Escribinos por DM", "Link en bio"]
}
```

---

## 3. Agente validador

### System prompt (≈110 palabras, en inglés por densidad de tokens)

```
You are LOW-Social validator. Input: {content, brand, platform, placeholders}.
Output ONLY minified JSON matching:
{"ok":bool,"caption":str,"hashtags":[str],"canva_vars":{str:str},
 "violations":[{"rule":str,"fix":str}]}
Rules:
1. Enforce brand.tone. Never output words in brand.banned.
2. caption <= platform.max_chars. hashtags <= platform.max_tags, prefer brand.tags.
3. canva_vars: fill EVERY key in placeholders; each text <= its max_len.
4. If content violates brand but is fixable, fix it, set ok=true, list changes
   in violations. If unfixable (false claims, legal, pricing), set ok=false.
5. Do not invent facts, prices, dates or URLs absent from input.
6. No markdown, no prose, nothing outside the JSON object.
```

La respuesta se valida con `jsonschema` en código (1 retry). Límites por red
(`max_chars`, `max_tags`, aspect ratios) viven en `adapters/*.limits()`, no en el prompt.

---

## 4. Canva Connect API — `social/canva_client.py`

Autofill de un Brand Template + export. El LLM solo produce `canva_vars`
(dict plano `{placeholder: valor}`); el shape verboso de la API se expande en
código — cero tokens gastados en payloads.

```python
"""Cliente Canva Connect API: autofill de Brand Templates + export."""
import time
import requests

API = "https://api.canva.com/rest/v1"


class CanvaClient:
    def __init__(self, token_store):
        # token_store: OAuth2 PKCE; refresca y persiste cifrado (Fernet+keyring)
        self.tokens = token_store

    def _h(self) -> dict:
        return {"Authorization": f"Bearer {self.tokens.access('canva')}",
                "Content-Type": "application/json"}

    def render(self, brand_template_id: str, canva_vars: dict[str, str],
               fmt: str = "png") -> str:
        """Rellena un Brand Template y devuelve la URL del asset exportado.

        canva_vars viaja plano; prefijo 'asset:' marca imágenes ya subidas
        (POST /v1/asset-uploads) para referenciarlas por ID sin re-subir.
        """
        payload = {
            "brand_template_id": brand_template_id,
            "data": {
                k: ({"type": "image", "asset_id": v[6:]} if v.startswith("asset:")
                    else {"type": "text", "text": v})
                for k, v in canva_vars.items()
            },
        }
        r = requests.post(f"{API}/autofills", json=payload, headers=self._h())
        r.raise_for_status()
        design = self._poll(f"{API}/autofills/{r.json()['job']['id']}")
        design_id = design["result"]["design"]["id"]

        r = requests.post(f"{API}/exports", headers=self._h(), json={
            "design_id": design_id,
            "format": {"type": fmt},          # "png" | "mp4" | "pdf"
        })
        r.raise_for_status()
        job = self._poll(f"{API}/exports/{r.json()['job']['id']}")
        return job["urls"][0]                 # URL temporal → descargar o publicar ya

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
```

---

## 5. Adapters de redes (patrón espejo de `providers/base.py`)

```python
class SocialAdapter(ABC):
    @staticmethod
    @abstractmethod
    def platform() -> str: ...
    @staticmethod
    @abstractmethod
    def limits() -> dict:
        """{'max_chars':..., 'max_tags':..., 'media': ['png','mp4'], 'ratios': [...]}"""
    @abstractmethod
    def publish(self, asset_url: str, caption: str, hashtags: list[str]) -> str:
        """Sube media + crea post. Devuelve platform_post_id."""
    @abstractmethod
    def refresh(self) -> None:
        """Renueva access token con el refresh token; persiste cifrado."""
```

| Red | API | Notas de publicación |
|---|---|---|
| Instagram/Facebook | Meta Graph API (`/{ig-user}/media` → `media_publish`) | 2 pasos: container + publish; long-lived token (60d) |
| LinkedIn | Versioned REST (`/rest/posts` + `/rest/images`) | upload por registerUpload; token 60d |
| X | API v2 (`POST /2/tweets` + media upload v1.1/v2) | chunked upload para MP4 |
| TikTok | Content Posting API (`/v2/post/publish/`) | init → upload → status polling |

## 6. Seguridad de credenciales

- **Nada de tokens en `config.json`** ni en texto plano en la DB.
- `auth_blob` cifrado con **Fernet**; la clave Fernet vive en el llavero del SO
  vía `keyring` (Windows Credential Manager / macOS Keychain / SecretService).
- OAuth2 Authorization Code + PKCE con loopback local (`http://127.0.0.1:<puerto>/callback`)
  — patrón de app de escritorio, sin client_secret embebido donde la red lo permita.
- Refresh proactivo: si `token_expires_at < now + 5min`, `adapter.refresh()` antes de publicar.

## 7. Presupuesto de tokens por pieza

| Componente | Tokens aprox. |
|---|---|
| System prompt | ~140 |
| BrandProfile compacto | ~150 |
| RAG (3 chunks × 300, solo si hay guía extensa) | 0–900 |
| Contenido + límites de red | ~200–400 |
| Salida JSON | ~150–250 |
| **Total (cache miss)** | **~650–1.850** |
| **Cache hit / re-validación** | **0** |
