"""
Generación y validación de CAPTCHA visual firmado criptográficamente
para proteger el inicio de sesión y el registro contra bots automatizados.
"""
import base64
import hashlib
import secrets
from typing import Dict

from django.core import signing
from django.core.cache import cache
from django.utils.crypto import constant_time_compare

from apps.core.domain.security_validators import CAPTCHA_ALLOWLIST_REGEX

CAPTCHA_SALT = "auth-captcha-challenge-v1"
CAPTCHA_MAX_AGE_SECONDS = 300  # 5 minutos
_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"


def _normalize_answer(answer: str) -> str:
    return "".join(str(answer or "").split()).upper()


def _build_svg_data_uri(code: str) -> str:
    """Construye una imagen SVG distorsionada con ruido visual codificada en Base64."""
    width = 190
    height = 56
    colors = ["#1e293b", "#0f172a", "#1d4ed8", "#334155", "#0369a1"]

    noise_lines = []
    for _ in range(6):
        x1 = secrets.randbelow(width)
        y1 = secrets.randbelow(height)
        x2 = secrets.randbelow(width)
        y2 = secrets.randbelow(height)
        stroke = colors[secrets.randbelow(len(colors))]
        noise_lines.append(
            f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{stroke}" stroke-opacity="0.22" stroke-width="1.5"/>'
        )

    noise_dots = []
    for _ in range(18):
        cx = secrets.randbelow(width)
        cy = secrets.randbelow(height)
        noise_dots.append(
            f'<circle cx="{cx}" cy="{cy}" r="1.3" fill="#64748b" fill-opacity="0.35"/>'
        )

    chars_svg = []
    start_x = 24
    step_x = 26
    for idx, ch in enumerate(code):
        x = start_x + idx * step_x + (secrets.randbelow(5) - 2)
        y = 36 + (secrets.randbelow(9) - 4)
        rot = secrets.randbelow(25) - 12
        color = colors[idx % len(colors)]
        chars_svg.append(
            f'<text x="{x}" y="{y}" fill="{color}" font-family="monospace, sans-serif" '
            f'font-size="24" font-weight="bold" transform="rotate({rot} {x} {y})">{ch}</text>'
        )

    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="Desafío CAPTCHA">'
        f'<rect width="100%" height="100%" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="1"/>'
        f'{"".join(noise_lines)}'
        f'{"".join(noise_dots)}'
        f'{"".join(chars_svg)}'
        f"</svg>"
    )
    encoded = base64.b64encode(svg.encode("utf-8")).decode("ascii")
    return f"data:image/svg+xml;base64,{encoded}"


def generate_captcha_challenge() -> Dict[str, str]:
    """Genera un desafío CAPTCHA con imagen SVG y token firmado de un solo uso."""
    code = "".join(secrets.choice(_ALPHABET) for _ in range(5))
    nonce = secrets.token_urlsafe(16)
    answer_hash = hashlib.sha256(f"{nonce}:{_normalize_answer(code)}".encode("utf-8")).hexdigest()

    token = signing.dumps(
        {"nonce": nonce, "hash": answer_hash},
        salt=CAPTCHA_SALT,
    )
    cache.set(f"captcha_nonce:{nonce}", "pending", timeout=CAPTCHA_MAX_AGE_SECONDS)

    return {
        "captcha_token": token,
        "captcha_image": _build_svg_data_uri(code),
        "expires_in": CAPTCHA_MAX_AGE_SECONDS,
    }


def verify_captcha_challenge(captcha_token: str, captcha_answer: str) -> bool:
    """
    Valida criptográficamente el token CAPTCHA y la respuesta del usuario,
    consumiendo el nonce para impedir ataques de repetición (replay).
    """
    if not captcha_token or not captcha_answer:
        return False

    clean_answer = _normalize_answer(captcha_answer)
    if not CAPTCHA_ALLOWLIST_REGEX.fullmatch(clean_answer):
        return False

    try:
        payload = signing.loads(
            captcha_token,
            salt=CAPTCHA_SALT,
            max_age=CAPTCHA_MAX_AGE_SECONDS,
        )
    except (signing.BadSignature, signing.SignatureExpired, ValueError, TypeError):
        return False

    if not isinstance(payload, dict):
        return False

    nonce = str(payload.get("nonce", ""))
    expected_hash = str(payload.get("hash", ""))
    if not nonce or not expected_hash:
        return False

    cache_key = f"captcha_nonce:{nonce}"
    if cache.get(cache_key) == "used":
        return False

    actual_hash = hashlib.sha256(f"{nonce}:{clean_answer}".encode("utf-8")).hexdigest()
    if not constant_time_compare(expected_hash, actual_hash):
        return False

    cache.set(cache_key, "used", timeout=CAPTCHA_MAX_AGE_SECONDS)
    return True
