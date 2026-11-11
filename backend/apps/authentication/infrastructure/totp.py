"""
Implementación de MFA (Autenticación Multifactor) mediante protocolo estándar
TOTP (RFC 6238 - Time-Based One-Time Password) compatible con Google Authenticator y Authy,
además de códigos temporales enviados por correo con expiración de 60 segundos.
"""
import base64
import hashlib
import hmac
import secrets
import struct
import time
from typing import Dict, Optional
from urllib.parse import quote

from django.core import signing
from django.core.cache import cache
from django.utils.crypto import constant_time_compare

TOTP_PERIOD_SECONDS = 30
TOTP_DIGITS = 6
EMAIL_OTP_TTL_SECONDS = 60
MFA_CHALLENGE_SALT = "auth-mfa-challenge-v1"
MFA_CHALLENGE_TTL_SECONDS = 300  # 5 minutos para completar el segundo factor


def generate_totp_secret() -> str:
    """Genera un secreto aleatorio de 160 bits codificado en Base32 estándar (sin padding '=')."""
    raw = secrets.token_bytes(20)
    return base64.b32encode(raw).decode("ascii").rstrip("=")


def _decode_base32(secret: str) -> bytes:
    cleaned = "".join(str(secret or "").split()).upper()
    padding = (8 - (len(cleaned) % 8)) % 8
    return base64.b32decode(cleaned + ("=" * padding), casefold=True)


def generate_totp_code(
    secret: str,
    for_time: Optional[float] = None,
    period: int = TOTP_PERIOD_SECONDS,
    digits: int = TOTP_DIGITS,
) -> str:
    """Calcula el código TOTP de 6 dígitos según RFC 6238 (HMAC-SHA1)."""
    timestamp = time.time() if for_time is None else float(for_time)
    counter = int(timestamp // period)
    key = _decode_base32(secret)
    msg = struct.pack(">Q", counter)
    digest = hmac.new(key, msg, hashlib.sha1).digest()
    offset = digest[-1] & 0x0F
    binary = struct.unpack(">I", digest[offset : offset + 4])[0] & 0x7FFFFFFF
    otp = binary % (10**digits)
    return str(otp).zfill(digits)


def verify_totp_code(
    secret: str,
    code: str,
    *,
    for_time: Optional[float] = None,
    window: int = 1,
    period: int = TOTP_PERIOD_SECONDS,
) -> bool:
    """
    Verifica un código TOTP de 6 dígitos permitindo una ventana de ±1 intervalo (30-60s)
    para absorber desfase de reloj entre el servidor y Google Authenticator / Authy.
    """
    cleaned = "".join(str(code or "").split())
    if not cleaned.isdigit() or len(cleaned) != TOTP_DIGITS or not secret:
        return False

    timestamp = time.time() if for_time is None else float(for_time)
    for offset in range(-window, window + 1):
        candidate = generate_totp_code(
            secret,
            for_time=timestamp + (offset * period),
            period=period,
        )
        if constant_time_compare(candidate, cleaned):
            return True
    return False


def build_otpauth_uri(secret: str, account_email: str, issuer: str = "ConsultoriaTienda") -> str:
    """Construye la URI estándar otpauth://totp/ compatible con Google Authenticator y Authy."""
    clean_issuer = (issuer or "ConsultoriaTienda").replace(":", "").strip() or "ConsultoriaTienda"
    label = f"{quote(clean_issuer)}:{quote(account_email)}"
    return (
        f"otpauth://totp/{label}"
        f"?secret={secret}&issuer={quote(clean_issuer)}&algorithm=SHA1&digits={TOTP_DIGITS}&period={TOTP_PERIOD_SECONDS}"
    )


def create_mfa_challenge_token(user_id: int) -> str:
    """Emite un token temporal firmado para completar la verificación de segundo factor (MFA)."""
    return signing.dumps(
        {"user_id": int(user_id), "nonce": secrets.token_urlsafe(16)},
        salt=MFA_CHALLENGE_SALT,
    )


def verify_mfa_challenge_token(mfa_token: str) -> Optional[int]:
    """Valida el token de desafío MFA y retorna el user_id si no ha expirado."""
    if not mfa_token:
        return None
    try:
        payload = signing.loads(
            mfa_token,
            salt=MFA_CHALLENGE_SALT,
            max_age=MFA_CHALLENGE_TTL_SECONDS,
        )
        return int(payload["user_id"])
    except (signing.BadSignature, signing.SignatureExpired, ValueError, TypeError, KeyError):
        return None


def issue_email_otp_code(user_id: int, ttl_seconds: int = EMAIL_OTP_TTL_SECONDS) -> Dict[str, object]:
    """
    Genera un código temporal de 6 dígitos con expiración estricta de 60 segundos
    y almacena únicamente su hash SHA-256 en caché.
    """
    code = f"{secrets.randbelow(10**TOTP_DIGITS):0{TOTP_DIGITS}d}"
    salt = secrets.token_hex(8)
    code_hash = hashlib.sha256(f"{salt}:{code}".encode("utf-8")).hexdigest()
    cache.set(
        f"mfa_email_otp:{int(user_id)}",
        {"salt": salt, "hash": code_hash, "expires_at": time.time() + ttl_seconds},
        timeout=ttl_seconds,
    )
    return {"code": code, "expires_in": ttl_seconds}


def verify_email_otp_code(user_id: int, code: str) -> bool:
    """Verifica y consume el código temporal de 60 segundos enviado por correo."""
    cleaned = "".join(str(code or "").split())
    if not cleaned.isdigit() or len(cleaned) != TOTP_DIGITS:
        return False

    cache_key = f"mfa_email_otp:{int(user_id)}"
    stored = cache.get(cache_key)
    if not isinstance(stored, dict):
        return False

    if time.time() > float(stored.get("expires_at", 0)):
        cache.delete(cache_key)
        return False

    salt = str(stored.get("salt", ""))
    expected_hash = str(stored.get("hash", ""))
    actual_hash = hashlib.sha256(f"{salt}:{cleaned}".encode("utf-8")).hexdigest()
    if not constant_time_compare(expected_hash, actual_hash):
        return False

    cache.delete(cache_key)
    return True
