"""
Control de límite de velocidad (Rate Limiting) de 5 intentos por minuto
para proteger el inicio de sesión y endpoints sensibles contra ataques de fuerza bruta.
"""
import hashlib
import time
from typing import Tuple

from django.core.cache import cache

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 60


def _client_ip(request) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "127.0.0.1") or "127.0.0.1"


def _rate_limit_key(scope: str, ip: str, identifier: str = "") -> str:
    norm_id = (identifier or "").strip().lower()[:150]
    digest = hashlib.sha256(f"{scope}:{ip}:{norm_id}".encode("utf-8")).hexdigest()
    return f"auth_ratelimit:{scope}:{digest}"


def check_rate_limit(
    request,
    scope: str = "login",
    identifier: str = "",
    max_attempts: int = MAX_ATTEMPTS,
    window_seconds: int = WINDOW_SECONDS,
) -> Tuple[bool, int, int]:
    """
    Verifica si el cliente/usuario ha superado el límite de intentos por minuto.
    Retorna (allowed, remaining_attempts, retry_after_seconds).
    """
    ip = _client_ip(request)
    key = _rate_limit_key(scope, ip, identifier)
    ip_key = _rate_limit_key(f"{scope}_ip", ip, "")
    now = time.time()

    records = cache.get(key) or []
    records = [ts for ts in records if now - ts < window_seconds]

    ip_records = cache.get(ip_key) or []
    ip_records = [ts for ts in ip_records if now - ts < window_seconds]

    active_records = records if len(records) >= len(ip_records) else ip_records
    if len(active_records) >= max_attempts:
        oldest = min(active_records)
        retry_after = max(1, int(window_seconds - (now - oldest)))
        return False, 0, retry_after

    remaining = max(0, max_attempts - len(active_records))
    return True, remaining, 0


def record_failed_attempt(
    request,
    scope: str = "login",
    identifier: str = "",
    window_seconds: int = WINDOW_SECONDS,
) -> int:
    """Registra un intento en la ventana de 1 minuto y devuelve el total acumulado."""
    ip = _client_ip(request)
    key = _rate_limit_key(scope, ip, identifier)
    ip_key = _rate_limit_key(f"{scope}_ip", ip, "")
    now = time.time()

    records = [ts for ts in (cache.get(key) or []) if now - ts < window_seconds]
    records.append(now)
    cache.set(key, records, timeout=window_seconds)

    ip_records = [ts for ts in (cache.get(ip_key) or []) if now - ts < window_seconds]
    ip_records.append(now)
    cache.set(ip_key, ip_records, timeout=window_seconds)

    return max(len(records), len(ip_records))


def reset_rate_limit(request, scope: str = "login", identifier: str = "") -> None:
    """Limpia el contador de intentos tras una autenticación exitosa."""
    ip = _client_ip(request)
    cache.delete(_rate_limit_key(scope, ip, identifier))
    cache.delete(_rate_limit_key(f"{scope}_ip", ip, ""))
