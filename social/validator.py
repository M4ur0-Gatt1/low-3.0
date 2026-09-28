"""Validador IA: adapta/valida contenido contra la identidad de marca."""
import json, hashlib, jsonschema

OUT_SCHEMA = {
    "type": "object",
    "required": ["ok", "caption", "hashtags", "canva_vars", "violations"],
    "properties": {
        "ok": {"type": "boolean"},
        "caption": {"type": "string"},
        "hashtags": {"type": "array", "items": {"type": "string"}},
        "canva_vars": {"type": "object"},
        "violations": {
            "type": "array",
            "items": {"type": "object", "properties": {
                "rule": {"type": "string"}, "fix": {"type": "string"}}}},
    },
}

SYSTEM_PROMPT = (
    "You are LOW-Social validator. Input: {content, brand, platform, placeholders}. "
    "Output ONLY minified JSON matching: "
    '{"ok":bool,"caption":str,"hashtags":[str],"canva_vars":{str:str},'
    '"violations":[{"rule":str,"fix":str}]}. '
    "Rules: 1. Enforce brand.tone. Never output words in brand.banned. "
    "2. caption <= platform.max_chars. hashtags <= platform.max_tags, prefer brand.tags. "
    "3. canva_vars: fill EVERY key in placeholders; each text <= its max_len. "
    "4. If content violates brand but is fixable, fix it, set ok=true, list changes "
    "in violations. If unfixable (false claims, legal, pricing), set ok=false. "
    "5. Do not invent facts, prices, dates or URLs absent from input. "
    "6. No markdown, no prose, nothing outside the JSON object."
)


class Validator:
    def __init__(self, conn, llm_call):
        self.conn = conn
        self.llm = llm_call  # fn(system, user) -> str

    def validate(self, content: dict, brand: dict, platform: str,
                 placeholders: dict, limits: dict, chunks: list[str] = None) -> dict:
        """Valida/adapta contenido. Retorna dict con ok, caption, etc."""
        # cache key
        raw = json.dumps({"c": content, "b": brand, "p": platform},
                         sort_keys=True, ensure_ascii=False)
        h = hashlib.sha256(raw.encode()).hexdigest()

        cur = self.conn.execute("SELECT response_json FROM ai_cache WHERE hash=?",
                                (h,))
        cached = cur.fetchone()
        if cached:
            return json.loads(cached["response_json"])

        user = json.dumps({
            "content": content,
            "brand": brand,
            "platform": platform,
            "placeholders": placeholders,
            "limits": limits,
            "chunks": chunks or [],
        }, ensure_ascii=False)

        for attempt in range(2):
            try:
                raw_out = self.llm(SYSTEM_PROMPT, user)
                # limpiar markdown fences si vinieron
                raw_out = raw_out.strip()
                if raw_out.startswith("```"):
                    raw_out = raw_out.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
                out = json.loads(raw_out)
                jsonschema.validate(out, OUT_SCHEMA)
                # guardar en caché
                self.conn.execute(
                    "INSERT OR REPLACE INTO ai_cache (hash, response_json) VALUES (?,?)",
                    (h, json.dumps(out, ensure_ascii=False)))
                self.conn.commit()
                return out
            except (json.JSONDecodeError, jsonschema.ValidationError) as e:
                if attempt == 1:
                    return {"ok": False, "caption": content.get("copy", ""),
                            "hashtags": [], "canva_vars": {},
                            "violations": [{"rule": "json", "fix": str(e)}]}
                user = user + "\n\nERROR: Invalid JSON. " + str(e)
            except Exception:
                if attempt == 1:
                    raise
