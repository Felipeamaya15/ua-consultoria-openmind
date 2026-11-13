"""
Autenticación segura basada en Cookies (HttpOnly, Secure, SameSite) + Token,
con gestión de ciclo de vida según perfil de usuario:
- Cuentas administrativas (is_staff / admin): expiración corta de 30 minutos por inactividad,
  con reinicio del temporizador en cada interacción o petición a la API (sliding window).
- Cuentas de clientes finales: sin cierre por inactividad corta; expiración prolongada (7 a 30 días, default 30 días).
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
ADMIN_SESSION_INACTIVITY_TIMEOUT_SECONDS = 1800  # 30 minutos de inactividad para administradores
CUSTOMER_SESSION_COOKIE_AGE = 30 * 86400  # 30 días para clientes finales (expiración prolongada: 7 a 30 días)
SESSION_INACTIVITY_TIMEOUT_SECONDS = ADMIN_SESSION_INACTIVITY_TIMEOUT_SECONDS


def is_admin_user(user) -> bool:
    """Comprueba si un usuario corresponde a una cuenta administrativa (is_staff o is_superuser)."""
    if not user:
        return False
    return bool(
        getattr(user, "is_staff", False)
        or getattr(user, "is_superuser", False)
    )


def get_session_timeout_for_user(user=None) -> int:
    """
    Retorna la duración de la cookie/sesión según el perfil del usuario:
    - 30 minutos (1800s) por inactividad para cuentas administrativas (is_staff / admin)
    - Expiración prolongada (30 días = 2592000s) para clientes finales (7 a 30 días)
    """
    if is_admin_user(user):
        return getattr(
            settings,
            "ADMIN_SESSION_COOKIE_AGE",
            getattr(settings, "SESSION_COOKIE_AGE", ADMIN_SESSION_INACTIVITY_TIMEOUT_SECONDS),
        )
    return getattr(settings, "CUSTOMER_SESSION_COOKIE_AGE", CUSTOMER_SESSION_COOKIE_AGE)


def _activity_cache_key(token_key: str) -> str:
    return f"auth_session_last_activity:{token_key}"


def touch_token_activity(token_key: str, user=None) -> None:
    """
    Registra actividad reciente para el token, reiniciando el temporizador.
    Para administradores reinicia los 30 minutos de inactividad; para clientes
    extiende la vigencia prolongada (30 días).
    """
    if user is None and token_key:
        try:
            tok = Token.objects.filter(key=token_key).select_related("user").first()
            if tok:
                user = tok.user
        except Exception:
            user = None

    timeout = get_session_timeout_for_user(user)
    cache.set(_activity_cache_key(token_key), time.time(), timeout=timeout)


def is_token_inactive(token: Token, user=None) -> bool:
    """
    Comprueba si la sesión superó el tiempo de inactividad según su perfil:
    - Administradores (is_staff / superuser): expiran tras 30 minutos de inactividad.
    - Clientes finales: NO se cierran por inactividad corta; vigencia prolongada (7 a 30 días).
    Si no existe registro previo en caché pero el token fue creado recientemente, inicializa su marca.
    """
    if user is None:
        try:
            user = getattr(token, "user", None)
        except Exception:
            user = None

    timeout = get_session_timeout_for_user(user)
    now = time.time()
    last_activity = cache.get(_activity_cache_key(token.key))

    if last_activity is None:
        created_ts = token.created.timestamp() if getattr(token, "created", None) else now
        if now - created_ts > timeout:
            return True
        touch_token_activity(token.key, user=user)
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


def set_auth_cookies(response, request, token_key: str, user=None) -> None:
    """
    Configura la cookie de sesión/token con los atributos obligatorios:
    - HttpOnly=True (impide acceso desde JavaScript contra XSS)
    - Secure=True (en HTTPS / según configuración segura)
    - SameSite='Lax' o 'Strict' (protección contra CSRF)
    - max_age: 30 minutos para administradores (is_staff / admin),
      o prolongada (30 días) para clientes finales.
    """
    if user is None:
        if request is not None and hasattr(request, "user") and getattr(request.user, "is_authenticated", False):
            user = request.user
        elif token_key:
            try:
                tok = Token.objects.filter(key=token_key).select_related("user").first()
                if tok:
                    user = tok.user
            except Exception:
                user = None

    timeout = get_session_timeout_for_user(user)
    samesite = getattr(settings, "SESSION_COOKIE_SAMESITE", "Lax") or "Lax"
    secure = bool(
        getattr(settings, "SESSION_COOKIE_SECURE", True)
        or (request is not None and request.is_secure())
    )
    touch_token_activity(token_key, user=user)
    response.set_cookie(
        key=AUTH_COOKIE_NAME,
        value=token_key,
        max_age=timeout,
        httponly=True,
        secure=secure,
        samesite=samesite,
        path="/",
    )
    if request is not None and hasattr(request, "session"):
        try:
            request.session.set_expiry(timeout)
        except Exception:
            pass


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
    la cabecera `Authorization: Token <key>` y verifica la ventana de inactividad según perfil:
    - 30 minutos de inactividad para cuentas administrativas (is_staff / admin).
    - Expiración prolongada (7 a 30 días) para clientes finales.
    Reinicia el temporizador de actividad en cada petición a la API.
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

        if is_token_inactive(token, user=user):
            destroy_server_session_and_token(django_request, token.key)
            request._clear_expired_auth_cookie = True
            django_request._clear_expired_auth_cookie = True
            return None

        touch_token_activity(token.key, user=user)
        request._active_auth_token_key = token.key
        request._active_auth_user = user
        django_request._active_auth_token_key = token.key
        django_request._active_auth_user = user
        return user, token

    def _validate_inactivity(self, request, user, token: Token) -> Tuple[object, Token]:
        django_request = getattr(request, "_request", request)
        if is_token_inactive(token, user=user):
            destroy_server_session_and_token(django_request, token.key)
            request._clear_expired_auth_cookie = True
            django_request._clear_expired_auth_cookie = True
            raise exceptions.AuthenticationFailed(
                "La sesión expiró por 30 minutos de inactividad. Inicia sesión nuevamente."
            )

        touch_token_activity(token.key, user=user)
        request._active_auth_token_key = token.key
        request._active_auth_user = user
        django_request._active_auth_token_key = token.key
        django_request._active_auth_user = user
        return user, token


class SessionInactivityMiddleware:
    """
    Middleware que:
    1. Controla la inactividad en sesiones de Django (`request.session`):
       - 30 minutos para cuentas administrativas (is_staff).
       - Expiración prolongada (7 a 30 días) para clientes finales.
    2. Renueva la cookie `auth_token` en cada petición activa a la API (ventana deslizante que
       reinicia el temporizador para no cerrarle la sesión a los 30 minutos exactos si sigue navegando).
    3. Borra las cookies en el cliente si la sesión expiró por inactividad.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        now = time.time()

        if hasattr(request, "session") and request.session.session_key:
            user = getattr(request, "user", None)
            timeout = get_session_timeout_for_user(user)
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
            active_user = getattr(request, "_active_auth_user", getattr(request, "user", None))
            set_auth_cookies(
                response,
                request,
                request._active_auth_token_key,
                user=active_user,
            )

        return response
