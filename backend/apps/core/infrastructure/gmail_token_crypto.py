"""Cifrado de tokens OAuth de Gmail."""

import os

from cryptography.fernet import Fernet, InvalidToken


def _obtener_cifrador():
    clave = os.environ.get(
        "GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY", ""
    ).strip()

    if not clave:
        raise RuntimeError(
            "Falta configurar la clave de cifrado de Gmail."
        )

    try:
        return Fernet(clave.encode("ascii"))
    except (ValueError, TypeError) as exc:
        raise RuntimeError(
            "La clave de cifrado de Gmail no es valida."
        ) from exc


def cifrar_token(token):
    if not isinstance(token, str) or not token:
        raise ValueError("El token no puede estar vacio.")

    return _obtener_cifrador().encrypt(
        token.encode("utf-8")
    ).decode("ascii")


def descifrar_token(token_cifrado):
    if not isinstance(token_cifrado, str) or not token_cifrado:
        raise ValueError("No existe un token cifrado.")

    try:
        return _obtener_cifrador().decrypt(
            token_cifrado.encode("ascii")
        ).decode("utf-8")
    except (InvalidToken, ValueError) as exc:
        raise ValueError(
            "No fue posible descifrar el token de Gmail."
        ) from exc
