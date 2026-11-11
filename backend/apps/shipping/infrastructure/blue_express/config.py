"""Configuración y validación de la integración Blue Express."""

from math import isfinite
from urllib.parse import urlsplit

from django.conf import settings


class BlueExpressConfigurationError(Exception):
    """La integración no tiene una configuración válida."""


SERVICE_URL_KEYS = {
    "geo": "GEO_URL",
    "pricing": "PRICING_URL",
    "emission": "EMISSION_URL",
    "label": "LABEL_URL",
    "tracking": "TRACKING_URL",
}


def _positive_timeout(config, key):
    try:
        value = float(config.get(key, ""))
    except (TypeError, ValueError):
        raise BlueExpressConfigurationError(
            f"Blue Express: {key} debe ser un número positivo."
        ) from None

    if not isfinite(value) or value <= 0:
        raise BlueExpressConfigurationError(
            f"Blue Express: {key} debe ser un número positivo."
        )

    return value


def get_service_config(service):
    """Devuelve configuración validada sin realizar solicitudes HTTP."""
    if service not in SERVICE_URL_KEYS:
        raise BlueExpressConfigurationError(
            "Servicio Blue Express desconocido."
        )

    config = getattr(settings, "BLUE_EXPRESS", {})

    if config.get("ENABLED") is not True:
        raise BlueExpressConfigurationError(
            "La integración Blue Express está deshabilitada."
        )

    if config.get("ENVIRONMENT") not in {"qa", "production"}:
        raise BlueExpressConfigurationError(
            "BLUE_EXPRESS_ENVIRONMENT debe ser qa o production."
        )

    required = ["TOKEN", "USERCODE", "CLIENT_ACCOUNT"]
    if service == "emission":
        required.append("USERNAME")

    missing = [
        key
        for key in required
        if not str(config.get(key) or "").strip()
    ]
    if missing:
        raise BlueExpressConfigurationError(
            "Faltan variables de Blue Express: " + ", ".join(missing)
        )

    url_key = SERVICE_URL_KEYS[service]
    url = str(config.get(url_key) or "").strip()

    try:
        parsed = urlsplit(url)
        valid_url = (
            parsed.scheme == "https"
            and bool(parsed.hostname)
            and parsed.username is None
            and parsed.password is None
            and not parsed.fragment
            and parsed.port in (None, 443)
            and not any(character.isspace() for character in url)
        )
    except ValueError:
        valid_url = False

    if not valid_url:
        raise BlueExpressConfigurationError(
            f"Blue Express: configura {url_key} con una URL HTTPS válida."
        )

    return {
        "environment": config["ENVIRONMENT"],
        "url": url,
        "token": str(config["TOKEN"]).strip(),
        "usercode": str(config["USERCODE"]).strip(),
        "client_account": str(config["CLIENT_ACCOUNT"]).strip(),
        "username": str(config.get("USERNAME") or "").strip(),
        "timeout": (
            _positive_timeout(config, "CONNECT_TIMEOUT"),
            _positive_timeout(config, "READ_TIMEOUT"),
        ),
    }