"""Cifrado de tokens OAuth: Fernet + keyring (Credential Manager en Windows)."""
import os, sys
from cryptography.fernet import Fernet

APP_ID = "low-social-v1"


def _key():
    """Obtiene (o crea) la clave Fernet del llavero del SO."""
    try:
        import keyring
        k = keyring.get_password(APP_ID, "fernet")
        if k:
            return k.encode()
        k = Fernet.generate_key().decode()
        keyring.set_password(APP_ID, "fernet", k)
        return k.encode()
    except Exception:
        # fallback: archivo en data_dir (menos seguro pero anda sin keyring)
        from config import data_dir
        kf = data_dir() / ".fernet_key"
        if kf.exists():
            return kf.read_bytes()
        k = Fernet.generate_key()
        kf.write_bytes(k)
        return k


_f = Fernet(_key())


def encrypt(plain: str) -> bytes:
    return _f.encrypt(plain.encode())


def decrypt(cipher: bytes) -> str:
    return _f.decrypt(cipher).decode()
