"""
Autenticación segura basada en Cookies (HttpOnly, Secure, SameSite) + Token,
con expiración automática de la sesión activa tras 30 minutos de inactividad.
Al cumplirse la inactividad, destruye la sesión/token en el servidor y borra la cookie en el cliente.
"""
import time
from typing import Optional, Tuple

from django.conf import settings
from django.core.cache import cache
from rest_framework import exceptions
from rest_framework.authentication import TokenAuthentication
from rest_framework.authtoken.models import Token

AUTH_COOKIE_NAME = "auth_token"
SESSION_INACTIVITY_TIMEOUT_SECONDS = 1800  # 30 minutos


def _activity_cache_key(token_key: str) -> str:
    return f"auth_session_last_activity:{token_key}"


def touch_token_activity(token_key: str) -> None:
    """Registra actividad reciente para el token con un tiempo de vida de 30 minutos."""
    timeout = getattr(settings, "SESSION_COOKIE_AGE", SESSION_INACTIVITY_TIMEOUT_SECONDS)
    cache.set(_activity_cache_key(token_key), time.time(), timeout=timeout)


def is_token_inactive(token: Token) -> bool:
    """
    Comprueba si la sesión asociada al token superó los 30 minutos de inactividad.
    Si no existe registro previo en caché pero el token fue creado hace menos de 30 minutos,
    inicializa su marca de actividad.
    """
    timeout = getattr(settings, "SESSION_COOKIE_AGE", SESSION_INACTIVITY_TIMEOUT_SECONDS)
    now = time.time()
    last_activity = cache.get(_activity_cache_key(token.key))

    if last_activity is None:
        created_ts = token.created.timestamp() if getattr(token, "created", None) else now
        if now - created_ts > timeout:
            return True
        touch_token_activity(token.key)
        return False

    if now - float(last_activity) > timeout:
        return True

    return False


def destroy_server_session_and_token(request, token_key: Optional[str] = None) -> None:
    """Destruye el token de autenticación y la sesión de Django en el servidor."""
    key = token_key
    if not key and request is not None:
        key = request.COOKIES.get(AUTH_COOKIE_NAME)
        if not key:
            auth_header = request.META.get("HTTP_AUTHORIZATION", "")
            if auth_header.startswith("Token "):
                key = auth_header.split(" ", 1)[1].strip()

    if key:
        cache.delete(_activity_cache_key(key))
        Token.objects.filter(key=key).delete()

    if request is not None and hasattr(request, "session"):
        try:
            request.session.flush()
        except Exception:
            pass


def set_auth_cookies(response, request, token_key: str) -> None:
    """
    Configura la cookie de sesión/token con los atributos obligatorios:
    - HttpOnly=True (impide acceso desde JavaScript contra XSS)
    - Secure=True (en HTTPS / según configuración segura)
    - SameSite='Lax' o 'Strict' (protección contra CSRF)
    - max_age=1800 (30 minutos de vida activa)
    """
    timeout = getattr(settings, "SESSION_COOKIE_AGE", SESSION_INACTIVITY_TIMEOUT_SECONDS)
    samesite = getattr(settings, "SESSION_COOKIE_SAMESITE", "Lax") or "Lax"
    secure = bool(
        getattr(settings, "SESSION_COOKIE_SECURE", True)
        or (request is not None and request.is_secure())
    )
    touch_token_activity(token_key)
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token_key,
        max_age=timeout,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )


def clear_auth_cookies(response) -> None:
    """Borra las cookies de autenticación y de sesión en el navegador del cliente."""
    samesite = getattr(settings, "SESSION_COOKIE_SAMESITE", "Lax") or "Lax"
    response.delete_cookie(AUTH_COOKIE_NAME, path="/", samesite=samesite)
    response.delete_cookie(
        getattr(settings, "SESSION_COOKIE_NAME", "sessionid"),
        path="/",
        samesite=samesite,
    )


class ActiveSessionTokenAuthentication(TokenAuthentication):
    """
    Autenticación DRF que soporta tanto la cookie HttpOnly `auth_token` como
    la cabecera `Authorization: Token <key>` y verifica la ventana de 30 minutos de inactividad.
    """

    def authenticate(self, request) -> Optional[Tuple[object, Token]]:
        header_auth = super().authenticate(request)
        if header_auth is not None:
            user, token = header_auth
            return self._validate_inactivity(request, user, token)

        cookie_token = request.COOKIES.get(AUTH_COOKIE_NAME, "").strip()
        if not cookie_token:
            return None

        django_request = getattr(request, "_request", request)

        # Si la cookie contiene un token, intentamos autenticarlo de forma segura.
        # Si el token es inválido, inexistente en la BD o huérfano tras un logout,
        # nunca debemos bloquear endpoints públicos (AllowAny). Marcamos la cookie para borrado y retornamos None.
        try:
            user, token = self.authenticate_credentials(cookie_token)
        except exceptions.AuthenticationFailed:
            request._clear_expired_auth_cookie = True
            django_request._clear_expired_auth_cookie = True
            return None

        if is_token_inactive(token):
            destroy_server_session_and_token(django_request, token.key)
            request._clear_expired_auth_cookie = True
            django_request._clear_expired_auth_cookie = True
            return None

        touch_token_activity(token.key)
        request._active_auth_token_key = token.key
        django_request._active_auth_token_key = token.key
        return user, token

    def _validate_inactivity(self, request, user, token: Token) -> Tuple[object, Token]:
        django_request = getattr(request, "_request", request)
        if is_token_inactive(token):
            destroy_server_session_and_token(django_request, token.key)
            request._clear_expired_auth_cookie = True
            django_request._clear_expired_auth_cookie = True
            raise exceptions.AuthenticationFailed(
                "La sesión expiró por 30 minutos de inactividad. Inicia sesión nuevamente."
            )

        touch_token_activity(token.key)
        request._active_auth_token_key = token.key
        django_request._active_auth_token_key = token.key
        return user, token


class SessionInactivityMiddleware:
    """
    Middleware que:
    1. Controla la inactividad de 30 minutos en sesiones de Django (`request.session`).
    2. Renueva la cookie `auth_token` en cada petición activa (ventana deslizante de 30 min).
    3. Borra las cookies en el cliente si la sesión expiró por inactividad.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        timeout = getattr(settings, "SESSION_COOKIE_AGE", SESSION_INACTIVITY_TIMEOUT_SECONDS)
        now = time.time()

        if hasattr(request, "session") and request.session.session_key:
            last_seen = request.session.get("_last_activity_ts")
            if last_seen is not None and (now - float(last_seen)) > timeout:
                destroy_server_session_and_token(request)
                request._clear_expired_auth_cookie = True
            else:
                request.session["_last_activity_ts"] = now

        response = self.get_response(request)

        if getattr(request, "_clear_expired_auth_cookie", False):
            clear_auth_cookies(response)
        elif getattr(request, "_active_auth_token_key", None):
            set_auth_cookies(response, request, request._active_auth_token_key)

        return response
