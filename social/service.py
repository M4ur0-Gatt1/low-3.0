"""Servicio de redes sociales: orquestador del módulo social.

Expone:
- state()  plataformas disponibles, cuentas conectadas, brand
- connect(platform, client_id, client_secret)  OAuth loopback
- disconnect(platform)  borra tokens
- save_brand(profile_json)  guarda BrandProfile
- set_brand_guide(text)  guarda guía extensa (RAG)
- sync_templates()  sincroniza templates de Canva
- process_item(qid, llm_fn, notify_fn)  valida  render  publica
- start_scheduler(llm_fn, notify_fn)  thread que procesa cola cada 60s
"""
import json, time, threading, requests
from datetime import datetime, timezone

from . import db
from .brand import BrandManager
from .validator import Validator
from .oauth import OAUTH_CONFIG, REDIRECT_URI, _run_loopback
from .secure import encrypt, decrypt
from .adapters.base import PLATFORM_LIMITS


PLATFORMS = list(OAUTH_CONFIG.keys())  # canva, instagram, facebook, linkedin, x, tiktok


def _adapter_for(row):
    p = row["platform"]
    if p in ("instagram", "facebook"):
        from .adapters.meta import MetaAdapter
        return MetaAdapter(row)
    elif p == "linkedin":
        from .adapters.linkedin import LinkedInAdapter
        return LinkedInAdapter(row)
    elif p == "x":
        from .adapters.x import XAdapter
        return XAdapter(row)
    elif p == "tiktok":
        from .adapters.tiktok import TikTokAdapter
        return TikTokAdapter(row)
    return None


class SocialService:
    def __init__(self):
        self._local = threading.local()
        db.migrate(self.conn)              # crea la conexión de este thread
        self.brand_mgr = BrandManager(self)
        # serializa las secciones de varias sentencias (SELECT+INSERT/UPDATE)
        # entre los threads de pywebview y el scheduler
        self._lock = threading.RLock()

    @property
    def conn(self):
        """Conexión SQLite del thread actual (pywebview usa un thread por
        llamada js_api; compartir una conexión entre threads rompe)."""
        c = getattr(self._local, "conn", None)
        if c is None:
            c = db.connect()
            self._local.conn = c
        return c

    def state(self) -> dict:
        platforms = []
        for key in PLATFORMS:
            cfg = OAUTH_CONFIG[key]
            cur = self.conn.execute(
                "SELECT * FROM social_accounts WHERE platform=? AND status='active'", (key,))
            row = cur.fetchone()
            platforms.append({
                "key": key,
                "label": cfg["label"],
                "has_app": cfg["has_app"],
                "connected": row is not None,
                "handle": row["handle"] if row else "",
                "client_id_saved": bool(row and row["client_id"]),
            })
        templates = [
            {"id": r["id"], "canva_template_id": r["canva_template_id"],
             "name": r["name"] or "", "format": r["format"] or ""}
            for r in self.conn.execute(
                "SELECT * FROM canva_templates ORDER BY name")]
        queue = []
        for r in self.conn.execute(
                "SELECT q.*, a.platform AS network FROM content_queue q "
                "LEFT JOIN social_accounts a ON a.id = q.account_id "
                "ORDER BY q.id DESC LIMIT 50"):
            try:
                data = json.loads(r["copy_json"] or "{}")
                caption = data.get("caption") or data.get("copy") or ""
            except Exception:
                caption = ""
            queue.append({
                "id": r["id"],
                "network": r["network"] or "?",
                "status": r["status"],
                "caption": caption[:140],
                "scheduled_at": r["scheduled_at"] or "",
                "published_at": r["published_at"] or "",
                "error": (r["error"] or "")[:200],
                "attempts": r["attempts"],
            })
        return {
            "platforms": platforms,
            "redirect_uri": REDIRECT_URI,
            "brand": self.brand_mgr.get_profile(),
            "templates": templates,
            "queue": queue,
        }

    def connect(self, platform: str, client_id: str, client_secret: str) -> dict:
        cfg = OAUTH_CONFIG.get(platform)
        if not cfg:
            return {"error": f"Plataforma desconocida: {platform}"}

        if platform == "canva":
            # Canva usa API key, no OAuth
            if not client_id:
                return {"error": "Client ID = Canva API Key (obligatorio)"}
            with self._lock:
                cur = self.conn.execute(
                    "SELECT id FROM social_accounts WHERE platform='canva' AND status='active'")
                existing = cur.fetchone()
                if existing:
                    self.conn.execute(
                        "UPDATE social_accounts SET auth_blob=?, client_id=? WHERE id=?",
                        (encrypt(json.dumps({"api_key": client_id})), client_id, existing["id"]))
                else:
                    self.conn.execute(
                        "INSERT INTO social_accounts (brand_id,platform,auth_blob,client_id) VALUES (?,?,?,?)",
                        (self.brand_mgr.brand_id, "canva",
                         encrypt(json.dumps({"api_key": client_id})), client_id))
                self.conn.commit()
            return {"ok": True, "handle": "Canva API conectada"}

        # OAuth2 loopback para el resto
        result = _run_loopback(platform, client_id, client_secret)
        if "error" in result:
            return result

        auth_blob = {
            "access_token": result["access_token"],
            "refresh_token": result.get("refresh_token", ""),
            "expires_at": result.get("expires_at", time.time() + 5184000),
        }
        enc = encrypt(json.dumps(auth_blob))
        sec_enc = encrypt(client_secret) if client_secret else b""

        with self._lock:
            cur = self.conn.execute(
                "SELECT id FROM social_accounts WHERE platform=? AND status='active'", (platform,))
            existing = cur.fetchone()
            if existing:
                self.conn.execute(
                    "UPDATE social_accounts SET auth_blob=?, client_id=?, client_secret=?, "
                    "token_expires_at=? WHERE id=?",
                    (enc, client_id, sec_enc,
                     time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(auth_blob["expires_at"])),
                     existing["id"]))
            else:
                self.conn.execute(
                    "INSERT INTO social_accounts (brand_id,platform,auth_blob,client_id,"
                    "client_secret,token_expires_at) VALUES (?,?,?,?,?,?)",
                    (self.brand_mgr.brand_id, platform, enc, client_id, sec_enc,
                     time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(auth_blob["expires_at"]))))
            self.conn.commit()
        return {"ok": True, "handle": f"@{platform}"}

    def disconnect(self, platform: str):
        self.conn.execute(
            "UPDATE social_accounts SET status='inactive' WHERE platform=?", (platform,))
        self.conn.commit()

    def save_brand(self, profile_json: str) -> dict:
        return self.brand_mgr.save_profile(profile_json)

    def set_brand_guide(self, text: str):
        self.brand_mgr.set_guide(text or "")

    def sync_templates(self) -> list[dict]:
        """Sincroniza templates de Canva (requiere API key conectada)."""
        cur = self.conn.execute(
            "SELECT auth_blob FROM social_accounts WHERE platform='canva' AND status='active'")
        row = cur.fetchone()
        if not row:
            return [{"error": "Canva no conectado — configuralo en "}]

        tokens = json.loads(decrypt(row["auth_blob"]))
        from .canva_client import CanvaClient
        cc = CanvaClient(tokens["api_key"])

        templates = cc.list_templates()
        brand_id = self.brand_mgr.brand_id
        with self._lock:
            for t in templates:
                placeholders = t.get("placeholders", {})
                cur2 = self.conn.execute(
                    "SELECT id FROM canva_templates WHERE canva_template_id=?",
                    (t["id"],))
                if cur2.fetchone():
                    self.conn.execute(
                        "UPDATE canva_templates SET name=?, placeholders_json=? "
                        "WHERE canva_template_id=?",
                        (t["name"], json.dumps(placeholders), t["id"]))
                else:
                    self.conn.execute(
                        "INSERT INTO canva_templates (brand_id,canva_template_id,name,"
                        "placeholders_json) VALUES (?,?,?,?)",
                        (brand_id, t["id"], t["name"], json.dumps(placeholders)))
            self.conn.commit()
        return templates

    def enqueue(self, network: str, content: str, template_id="",
                asset_path="", scheduled_at="") -> int:
        """Encola un post. Devuelve el id en content_queue.

        network: instagram/facebook/linkedin/x/tiktok (cuenta conectada).
        template_id: id numérico local o canva_template_id (opcional).
        scheduled_at: ISO 8601; vacío = listo para procesar ya.
        """
        network = (network or "").strip().lower()
        publishable = [p for p in PLATFORMS if p != "canva"]
        if network not in publishable:
            raise ValueError(f"Red desconocida: {network!r} — usá una de: "
                             + ", ".join(publishable))
        if not (content or "").strip():
            raise ValueError("Falta el contenido del post")
        acct = self.conn.execute(
            "SELECT id FROM social_accounts WHERE platform=? AND status='active'",
            (network,)).fetchone()
        if not acct:
            raise ValueError(f"{network} no está conectada — conectala en "
                             "  Redes Sociales")

        tpl_row_id = None
        if template_id:
            trow = self.conn.execute(
                "SELECT id FROM canva_templates WHERE id=? OR canva_template_id=?",
                (str(template_id), str(template_id))).fetchone()
            if not trow:
                raise ValueError(f"Template no encontrado: {template_id} — "
                                 "sincronizá los templates de Canva")
            tpl_row_id = trow["id"]

        when = (scheduled_at or "").strip() or datetime.now(timezone.utc).isoformat()
        with self._lock:
            cur = self.conn.execute(
                "INSERT INTO content_queue (brand_id,account_id,template_id,copy_json,"
                "asset_url,status,scheduled_at) VALUES (?,?,?,?,?,'draft',?)",
                (self.brand_mgr.brand_id, acct["id"], tpl_row_id,
                 json.dumps({"copy": content}, ensure_ascii=False),
                 asset_path or None, when))
            self.conn.commit()
            return cur.lastrowid

    def queue_delete(self, qid: int):
        with self._lock:
            row = self.conn.execute(
                "SELECT status FROM content_queue WHERE id=?", (qid,)).fetchone()
            if not row:
                raise ValueError(f"Item #{qid} no existe")
            if row["status"] == "publishing":
                raise ValueError(f"Item #{qid} se está publicando — esperá a que termine")
            self.conn.execute("DELETE FROM content_queue WHERE id=?", (qid,))
            self.conn.commit()

    def process_item(self, qid: int, llm_fn, notify_fn) -> dict:
        """Procesa un item de la cola: valida  renderiza  publica."""
        cur = self.conn.execute("SELECT * FROM content_queue WHERE id=?", (qid,))
        item = cur.fetchone()
        if not item:
            return {"error": "Item no encontrado"}

        try:
            # 1. Validación IA
            brand = self.brand_mgr.get_profile()
            copy_json = json.loads(item["copy_json"])
            chunks = self.brand_mgr.get_chunks(copy_json.get("copy", ""))

            cur_acct = self.conn.execute(
                "SELECT platform FROM social_accounts WHERE id=?", (item["account_id"],))
            acct = cur_acct.fetchone()
            platform = acct["platform"] if acct else "instagram"

            limits = PLATFORM_LIMITS.get(platform, PLATFORM_LIMITS["instagram"])

            # placeholders del template
            placeholders = {}
            if item["template_id"]:
                cur_t = self.conn.execute(
                    "SELECT placeholders_json FROM canva_templates WHERE id=?",
                    (item["template_id"],))
                trow = cur_t.fetchone()
                if trow:
                    placeholders = json.loads(trow["placeholders_json"])

            validator = Validator(self.conn, llm_fn)
            result = validator.validate(copy_json, brand, platform, placeholders, limits, chunks)

            if not result["ok"]:
                self.conn.execute(
                    "UPDATE content_queue SET status='failed', error=? WHERE id=?",
                    (json.dumps(result.get("violations", [])), qid))
                self.conn.commit()
                notify_fn(f" Contenido #{qid} rechazado: "
                          + json.dumps(result.get("violations", [])))
                return {"ok": False, "violations": result["violations"]}

            self.conn.execute(
                "UPDATE content_queue SET status='validated', copy_json=? WHERE id=?",
                (json.dumps(result, ensure_ascii=False), qid))

            # 2. Render (Canva) — si tiene template
            if item["template_id"]:
                self.conn.execute("UPDATE content_queue SET status='rendering' WHERE id=?", (qid,))
                self.conn.commit()

                cur_canva = self.conn.execute(
                    "SELECT auth_blob FROM social_accounts WHERE platform='canva' "
                    "AND status='active'")
                canva_row = cur_canva.fetchone()
                if canva_row:
                    tokens = json.loads(decrypt(canva_row["auth_blob"]))
                    from .canva_client import CanvaClient
                    cc = CanvaClient(tokens["api_key"])

                    cur_t = self.conn.execute(
                        "SELECT canva_template_id FROM canva_templates WHERE id=?",
                        (item["template_id"],))
                    trow = cur_t.fetchone()

                    asset_url = cc.render(trow["canva_template_id"],
                                          result.get("canva_vars", {}))
                    self.conn.execute(
                        "UPDATE content_queue SET asset_url=?, status='ready' WHERE id=?",
                        (asset_url, qid))
                    self.conn.commit()
                else:
                    notify_fn(" Canva no conectado — se publica sin imagen")

            self.conn.execute(
                "UPDATE content_queue SET status=COALESCE(status,'ready') WHERE id=?", (qid,))
            self.conn.commit()

            # 3. Publicación (va en el scheduler, no acá — si se llama desde
            #    social_publish_now, publicamos ya)
            if item["status"] in ("ready", "validated"):
                return self._publish(qid, notify_fn)

            return {"ok": True, "status": "ready"}

        except Exception as e:
            self.conn.execute(
                "UPDATE content_queue SET status='failed', error=? WHERE id=?",
                (str(e)[:500], qid))
            self.conn.commit()
            notify_fn(f" Error procesando #{qid}: {e}")
            return {"error": str(e)[:300]}

    def _publish(self, qid: int, notify_fn) -> dict:
        """Publica en la red social correspondiente."""
        item = self.conn.execute("SELECT * FROM content_queue WHERE id=?", (qid,)).fetchone()
        if not item:
            return {"error": "Item no encontrado"}

        acct = self.conn.execute(
            "SELECT * FROM social_accounts WHERE id=?", (item["account_id"],)).fetchone()
        if not acct:
            return {"error": "Cuenta no encontrada"}

        adapter = _adapter_for(acct)
        if not adapter:
            return {"error": f"Adaptador no encontrado para {acct['platform']}"}

        # refresh si expira en <5 min
        try:
            tokens = json.loads(decrypt(acct["auth_blob"]))
            if tokens.get("expires_at", 0) < time.time() + 300:
                adapter.refresh()
                # persistir
                adapter._save(self.conn)
        except Exception:
            pass

        self.conn.execute("UPDATE content_queue SET status='publishing', attempts=attempts+1 "
                          "WHERE id=?", (qid,))
        self.conn.commit()

        data = json.loads(item["copy_json"])
        caption = data.get("caption", data.get("copy", ""))
        hashtags = data.get("hashtags", [])
        asset_url = item["asset_url"] or ""

        try:
            post_id = adapter.publish(asset_url, caption, hashtags)
            self.conn.execute(
                "UPDATE content_queue SET status='published', platform_post_id=?, "
                "published_at=? WHERE id=?",
                (str(post_id), datetime.now(timezone.utc).isoformat(), qid))
            self.conn.commit()
            notify_fn(f" Publicado en {acct['platform']}: {post_id}")
            return {"ok": True, "post_id": str(post_id)}
        except requests.HTTPError as e:
            status_code = e.response.status_code if e.response else 0
            err = str(e)[:500]
            if 400 <= status_code < 500:
                self.conn.execute(
                    "UPDATE content_queue SET status='failed', error=? WHERE id=?",
                    (err, qid))
                self.conn.commit()
            else:
                self.conn.execute(
                    "UPDATE content_queue SET status='ready', error=? WHERE id=?",
                    (err, qid))
                self.conn.commit()
            return {"error": err}

    def tick(self, llm_fn, notify_fn):
        """Procesa items vencidos en la cola (borradores incluidos: el flujo
        completo draft  validar  render  publicar corre acá)."""
        now = datetime.now(timezone.utc).isoformat()
        cur = self.conn.execute(
            "SELECT id, status FROM content_queue "
            "WHERE status IN ('draft','ready','validated') "
            "AND scheduled_at IS NOT NULL AND scheduled_at <= ? "
            "ORDER BY scheduled_at LIMIT 5",
            (now,))
        for row in cur.fetchall():
            try:
                if row["status"] == "draft":
                    self.process_item(row["id"], llm_fn, notify_fn)
                else:
                    self._publish(row["id"], notify_fn)
            except Exception as e:
                notify_fn(f" tick #{row['id']}: {e}")


# singleton thread-safe
_instance = None
_lock = threading.Lock()


def get_service():
    global _instance
    with _lock:
        if _instance is None:
            _instance = SocialService()
        return _instance


def start_scheduler(llm_fn, notify_fn, interval=60):
    svc = get_service()

    def _loop():
        while True:
            time.sleep(interval)
            try:
                svc.tick(llm_fn, notify_fn)
            except Exception:
                pass

    t = threading.Thread(target=_loop, daemon=True, name="soc-sched")
    t.start()


# ── API a nivel módulo: main.py llama social.service.<fn>() directamente ──
def state():
    return get_service().state()


def connect(platform, client_id="", client_secret=""):
    return get_service().connect(platform, client_id, client_secret)


def disconnect(platform):
    return get_service().disconnect(platform)


def save_brand(profile_json):
    return get_service().save_brand(profile_json)


def set_brand_guide(text):
    return get_service().set_brand_guide(text)


def sync_templates():
    return get_service().sync_templates()


def enqueue(network, content, template_id="", asset_path="", scheduled_at=""):
    return get_service().enqueue(network, content, template_id=template_id,
                                 asset_path=asset_path, scheduled_at=scheduled_at)


def process_item(qid, llm_fn, notify_fn):
    return get_service().process_item(int(qid), llm_fn, notify_fn)


def queue_delete(qid):
    return get_service().queue_delete(int(qid))
