"""Autorización OAuth de Gmail para cada instalación de OpenMind."""

from urllib.parse import urlencode

import requests
from django.conf import settings
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token


GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send"
GOOGLE_SCOPES = f"openid email {GMAIL_SEND_SCOPE}"


def _configuracion():
    client_id = getattr(settings, "GOOGLE_OAUTH_CLIENT_ID", "").strip()
    client_secret = getattr(settings, "GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
    redirect_uri = getattr(settings, "GOOGLE_OAUTH_REDIRECT_URI", "").strip()

    if not client_id or not client_secret or not redirect_uri:
        raise ValueError("Falta configurar Google OAuth en el servidor.")

    return client_id, client_secret, redirect_uri


def construir_url_autorizacion(state):
    """Genera el enlace de autorización de Google."""
    if not state:
        raise ValueError("Se requiere un estado OAuth válido.")

    client_id, _, redirect_uri = _configuracion()

    parametros = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": GOOGLE_SCOPES,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }

    return (
        "https://accounts.google.com/o/oauth2/v2/auth?"
        + urlencode(parametros)
    )


def intercambiar_codigo(code):
    """Intercambia el código OAuth y verifica la cuenta autorizada."""
    if not code:
        raise ValueError("Google no devolvió un código de autorización.")

    client_id, client_secret, redirect_uri = _configuracion()

    respuesta = requests.post(
        "https://oauth2.googleapis.com/token",
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        },
        timeout=15,
    )

    if not respuesta.ok:
        raise ValueError("Google rechazó la autorización del correo.")

    datos = respuesta.json()

    if GMAIL_SEND_SCOPE not in datos.get("scope", "").split():
        raise ValueError("No se autorizó el permiso para enviar correos.")

    if not datos.get("refresh_token"):
        raise ValueError("No se recibió autorización para conexión persistente.")

    token_identidad = datos.get("id_token")
    if not token_identidad:
        raise ValueError("No se pudo identificar la cuenta de Google.")

    identidad = id_token.verify_oauth2_token(
        token_identidad,
        GoogleRequest(),
        client_id,
    )

    if identidad.get("email_verified") is not True:
        raise ValueError("El correo de Google no está verificado.")

    correo = identidad.get("email", "").strip().lower()
    if not correo:
        raise ValueError("Google no proporcionó un correo válido.")

    return {
        "correo": correo,
        "refresh_token": datos["refresh_token"],
    }
