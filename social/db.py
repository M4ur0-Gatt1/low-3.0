"""Esquema SQLite para el módulo social (social.db en data_dir)."""
import sqlite3, json, os
from config import data_dir


def connect():
    db = data_dir() / "social.db"
    # Cada thread usa SU conexión (SocialService.conn es thread-local): pywebview
    # atiende cada llamada js_api en un thread distinto y el scheduler corre en
    # otro — compartir UNA conexión entre threads rompe aunque sqlite sea
    # "serialized" (los cursores/fetch se pisan: "bad parameter or API misuse").
    # WAL permite lectores+escritor concurrentes entre conexiones.
    conn = sqlite3.connect(str(db), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def migrate(conn):
    conn.executescript("""
    CREATE TABLE IF NOT EXISTS brand_identity (
      id           INTEGER PRIMARY KEY,
      name         TEXT NOT NULL DEFAULT 'Mi marca',
      profile_json TEXT NOT NULL DEFAULT '{}',
      guide_text   TEXT NOT NULL DEFAULT '',
      version      INTEGER NOT NULL DEFAULT 1,
      updated_at   TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS brand_chunks (
      id        INTEGER PRIMARY KEY,
      brand_id  INTEGER NOT NULL REFERENCES brand_identity(id) ON DELETE CASCADE,
      topic     TEXT,
      content   TEXT NOT NULL,
      embedding BLOB
    );

    CREATE TABLE IF NOT EXISTS social_accounts (
      id               INTEGER PRIMARY KEY,
      brand_id         INTEGER REFERENCES brand_identity(id),
      platform         TEXT NOT NULL CHECK(platform IN
                         ('instagram','facebook','linkedin','x','tiktok','canva')),
      handle           TEXT,
      auth_blob        BLOB NOT NULL,
      scopes           TEXT,
      token_expires_at TEXT,
      client_id        TEXT DEFAULT '',
      client_secret    TEXT DEFAULT '',
      status           TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS canva_templates (
      id                INTEGER PRIMARY KEY,
      brand_id          INTEGER REFERENCES brand_identity(id),
      canva_template_id TEXT UNIQUE NOT NULL,
      name              TEXT,
      placeholders_json TEXT NOT NULL DEFAULT '{}',
      format            TEXT
    );

    CREATE TABLE IF NOT EXISTS content_queue (
      id               INTEGER PRIMARY KEY,
      brand_id         INTEGER REFERENCES brand_identity(id),
      account_id       INTEGER REFERENCES social_accounts(id),
      template_id      INTEGER REFERENCES canva_templates(id),
      copy_json        TEXT NOT NULL DEFAULT '{}',
      asset_url        TEXT,
      content_hash     TEXT,
      status           TEXT DEFAULT 'draft' CHECK(status IN
                         ('draft','validated','rendering','ready','scheduled',
                          'publishing','published','failed')),
      scheduled_at     TEXT,
      published_at     TEXT,
      platform_post_id TEXT,
      error            TEXT,
      attempts         INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_queue_due ON content_queue(status, scheduled_at);

    CREATE TABLE IF NOT EXISTS ai_cache (
      hash          TEXT PRIMARY KEY,
      response_json TEXT NOT NULL,
      created_at    TEXT DEFAULT (datetime('now'))
    );
    """)
    conn.commit()


def _brand_id(conn):
    """El id de la marca activa (siempre hay una, la primera)."""
    cur = conn.execute("SELECT id FROM brand_identity LIMIT 1")
    r = cur.fetchone()
    if r:
        return r[0]
    conn.execute("INSERT INTO brand_identity (name, profile_json) VALUES ('Mi marca', '{}')")
    conn.commit()
    return conn.execute("SELECT id FROM brand_identity LIMIT 1").fetchone()[0]
