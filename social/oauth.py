"""OAuth2 Authorization Code + PKCE con loopback local — app de escritorio."""
import hashlib, base64, os, urllib.parse, secrets, webbrowser, time
from http.server import HTTPServer, BaseHTTPRequestHandler
import requests

REDIRECT_PORT = 8732
REDIRECT_URI = f"http://127.0.0.1:{REDIRECT_PORT}/callback"

OAUTH_CONFIG = {
    "canva": {
        "label": "Canva",
        "has_app": False,       # Canva usa API key, no OAuth de usuario
        "auth_url": None,
        "token_url": None,
        "scopes": "",
    },
    "instagram": {
        "label": "Instagram",
        "has_app": True,
        "auth_url": "https://www.facebook.com/v19.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v19.0/oauth/access_token",
        "scopes": "instagram_basic,instagram_content_publish,pages_show_list",
    },
    "facebook": {
        "label": "Facebook",
        "has_app": True,
        "auth_url": "https://www.facebook.com/v19.0/dialog/oauth",
        "token_url": "https://graph.facebook.com/v19.0/oauth/access_token",
        "scopes": "pages_manage_posts,pages_read_engagement",
    },
    "linkedin": {
        "label": "LinkedIn",
        "has_app": True,
        "auth_url": "https://www.linkedin.com/oauth/v2/authorization",
        "token_url": "https://www.linkedin.com/oauth/v2/accessToken",
        "scopes": "openid profile w_member_social email",
    },
    "x": {
        "label": "X (Twitter)",
        "has_app": True,
        "auth_url": "https://twitter.com/i/oauth2/authorize",
        "token_url": "https://api.twitter.com/2/oauth2/token",
        "scopes": "tweet.read tweet.write users.read offline.access media.write",
    },
    "tiktok": {
        "label": "TikTok",
        "has_app": True,
        "auth_url": "https://www.tiktok.com/v2/auth/authorize/",
        "token_url": "https://open.tiktokapis.com/v2/oauth/token/",
        "scopes": "user.info.basic,video.publish",
    },
}


class _CallbackHandler(BaseHTTPRequestHandler):
    result = None

    def do_GET(self):
        q = urllib.parse.urlparse(self.path).query
        params = dict(urllib.parse.parse_qsl(q))
        _CallbackHandler.result = params
        if "code" in params:
            body = "<html><body><h2> Autorizado</h2><p>Ya podés cerrar esta ventana.</p></body></html>"
        else:
            body = f"<html><body><h2> Error</h2><pre>{params}</pre></body></html>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body.encode())

    def log_message(self, fmt, *args):
        pass  # silencioso


def _run_loopback(platform, client_id, client_secret):
    """Abre el navegador, espera el callback y devuelve los tokens."""
    cfg = OAUTH_CONFIG.get(platform)
    if not cfg or not cfg["auth_url"]:
        return {"error": f"OAuth no soportado para {platform}"}

    state = secrets.token_urlsafe(32)
    code_verifier = secrets.token_urlsafe(64)
    code_challenge = base64.urlsafe_b64encode(
        hashlib.sha256(code_verifier.encode()).digest()
    ).rstrip(b"=").decode()

    params = {
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": cfg["scopes"],
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
    }
    url = f"{cfg['auth_url']}?{urllib.parse.urlencode(params)}"

    _CallbackHandler.result = None
    server = HTTPServer(("127.0.0.1", REDIRECT_PORT), _CallbackHandler)
    server.timeout = 120

    webbrowser.open(url)

    try:
        server.handle_request()
        result = _CallbackHandler.result or {}
    except Exception:
        result = {}
    finally:
        server.server_close()

    if "error" in result:
        return {"error": result.get("error_description", result["error"])}
    if "code" not in result:
        return {"error": "No se recibió código de autorización"}

    # intercambiar code por token
    token_resp = requests.post(cfg["token_url"], data={
        "client_id": client_id,
        "client_secret": client_secret,
        "code": result["code"],
        "redirect_uri": REDIRECT_URI,
        "code_verifier": code_verifier,
        "grant_type": "authorization_code",
    })
    token_resp.raise_for_status()
    data = token_resp.json()

    if "error" in data:
        return {"error": data.get("error_description", data["error"])}

    expires_in = data.get("expires_in", 5184000)  # default 60d
    return {
        "ok": True,
        "access_token": data["access_token"],
        "refresh_token": data.get("refresh_token", ""),
        "expires_at": time.time() + int(expires_in) - 60,
    }
