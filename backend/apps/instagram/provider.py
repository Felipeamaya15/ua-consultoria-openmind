"""Unified Login, SUAT and Instagram publishing only; fixed official Meta hosts."""
import ipaddress
import re
from datetime import datetime, timezone
from urllib.parse import urlencode, urlsplit
import requests
from cryptography.fernet import Fernet, InvalidToken
from django.conf import settings

SCOPES = ('instagram_basic', 'instagram_manage_messages', 'instagram_content_publish')


class InstagramError(Exception):
    def __init__(self, code, uncertain=False):
        self.code, self.uncertain = code, uncertain
        super().__init__(code)


def cipher():
    try:
        return Fernet(settings.INSTAGRAM_TOKEN_ENCRYPTION_KEY.encode('ascii'))
    except (ValueError, TypeError, UnicodeError):
        raise InstagramError('cifrado_no_configurado') from None


def encrypt(token):
    return cipher().encrypt(token.encode()).decode()


def decrypt(value):
    try:
        return cipher().decrypt(value.encode()).decode()
    except (InvalidToken, ValueError, UnicodeError):
        raise InstagramError('reconectar_instagram') from None


def https_origin(value, public=False):
    try:
        u = urlsplit(value)
        if u.scheme != 'https' or not u.hostname or u.username or u.password or u.query or u.fragment or u.path not in ('', '/'):
            return False
        if public:
            host = u.hostname.lower()
            if '.' not in host or host.endswith(('.localhost', '.local', '.internal')) or host == 'localhost':
                return False
            try:
                if not ipaddress.ip_address(host).is_global:
                    return False
            except ValueError:
                pass
        return True
    except ValueError:
        return False


def frontend_origin(value):
    return https_origin(value) or (
        settings.DEBUG and value == 'http://localhost:5173'
    )


def configured():
    try:
        cipher()
        u = urlsplit(settings.INSTAGRAM_REDIRECT_URI)
        return bool(re.fullmatch(r'[0-9]{1,40}', settings.INSTAGRAM_APP_ID) and settings.INSTAGRAM_APP_SECRET
            and re.fullmatch(r'[0-9]{1,40}', settings.INSTAGRAM_CONFIG_ID)
            and https_origin(f'{u.scheme}://{u.netloc}') and u.path.endswith('/api/instagram/oauth/callback/')
            and not u.query and not u.fragment
            and frontend_origin(settings.INSTAGRAM_FRONTEND_ORIGIN)
            and re.fullmatch(r'v\d{1,3}\.0', settings.INSTAGRAM_API_VERSION))
    except (InstagramError, ValueError):
        return False


def authorization_url(state):
    if not configured():
        raise InstagramError('instagram_no_configurado')
    return 'https://www.facebook.com/dialog/oauth?' + urlencode({
        'client_id': settings.INSTAGRAM_APP_ID, 'redirect_uri': settings.INSTAGRAM_REDIRECT_URI,
        'config_id': settings.INSTAGRAM_CONFIG_ID, 'response_type': 'code', 'state': state,
        'override_default_response_type': 'true', 'prompt': 'login',
    })


def api(path):
    return f'https://graph.facebook.com/{settings.INSTAGRAM_API_VERSION}/{path}'


def request(method, url, *, token='', data=None, params=None):
    parsed = urlsplit(url)
    if parsed.scheme != 'https' or parsed.hostname != 'graph.facebook.com' or parsed.port or parsed.username or parsed.password:
        raise InstagramError('host_instagram_invalido')
    publishing = method == 'POST' and parsed.path.endswith(('/media', '/media_publish'))
    if publishing and not settings.INSTAGRAM_PUBLISHING_ENABLED:
        raise InstagramError('publicacion_deshabilitada')
    test_base = getattr(settings, 'INSTAGRAM_TEST_HTTP_ORIGIN', '')
    if test_base:
        if not settings.DEBUG or not settings.DATABASES['default']['NAME'].startswith(('instagram_qa_', 'test_instagram_qa_')):
            raise InstagramError('simulacion_fuera_de_qa')
        url = test_base.rstrip('/') + '/' + parsed.hostname + parsed.path
    try:
        with requests.Session() as transport:
            transport.trust_env = False
            response = transport.request(method, url, headers={'Authorization': 'Bearer ' + token} if token else {},
                data=data, params=params, timeout=(5, 15), allow_redirects=False)
        try:
            body = response.json()
        except (ValueError, requests.exceptions.JSONDecodeError):
            raise InstagramError('respuesta_instagram_invalida', method == 'POST') from None
        if not isinstance(body, dict):
            raise InstagramError('respuesta_instagram_invalida', method == 'POST')
        if not response.ok or 'error' in body or response.is_redirect:
            error = body.get('error') if isinstance(body.get('error'), dict) else {}
            code = 'reconectar_instagram' if error.get('code') == 190 else 'limite_instagram' if response.status_code == 429 or error.get('code') in (4, 17, 32, 613) else 'instagram_rechazo_solicitud'
            raise InstagramError(code, method == 'POST' and (response.status_code >= 500 or response.is_redirect))
        return body
    except requests.RequestException:
        raise InstagramError('instagram_no_disponible', method == 'POST') from None


def identifier(value):
    value = str(value)
    if not re.fullmatch(r'[0-9]{1,40}', value):
        raise InstagramError('identidad_instagram_invalida')
    return value


def exchange(code):
    body = request('GET', api('oauth/access_token'), params={
        'client_id': settings.INSTAGRAM_APP_ID, 'client_secret': settings.INSTAGRAM_APP_SECRET,
        'redirect_uri': settings.INSTAGRAM_REDIRECT_URI, 'code': code,
    })
    token = body.get('access_token')
    if not isinstance(token, str) or len(token) < 10:
        raise InstagramError('token_instagram_invalido')
    metadata = request('GET', api('debug_token'), token=settings.INSTAGRAM_APP_ID+'|'+settings.INSTAGRAM_APP_SECRET,
        params={'input_token': token}).get('data')
    if (not isinstance(metadata, dict) or metadata.get('is_valid') is not True
            or str(metadata.get('app_id')) != settings.INSTAGRAM_APP_ID or metadata.get('type') != 'SYSTEM_USER'):
        raise InstagramError('token_instagram_invalido')
    permissions = metadata.get('scopes')
    if not isinstance(permissions, list) or not all(isinstance(item, str) for item in permissions) or not set(SCOPES).issubset(permissions):
        raise InstagramError('permisos_instagram_incompletos')
    if set(permissions) - set(SCOPES) - {'public_profile'}:
        raise InstagramError('permisos_instagram_excesivos')
    expiry = metadata.get('expires_at')
    access_expiry = metadata.get('data_access_expires_at', 0)
    if any(type(value) is not int or value < 0 for value in (expiry, access_expiry)):
        raise InstagramError('vencimiento_instagram_invalido')
    try:
        finite = [datetime.fromtimestamp(value, timezone.utc) for value in (expiry, access_expiry) if value]
        expires_at = min(finite) if finite else None
    except (ValueError, OverflowError, OSError):
        raise InstagramError('vencimiento_instagram_invalido') from None
    if expires_at and expires_at <= datetime.now(timezone.utc):
        raise InstagramError('token_instagram_vencido')
    business = request('GET', api('me'), token=token, params={'fields': 'client_business_id'})
    business_id = identifier(business.get('client_business_id', ''))
    system_user_id = next(
        (str(value) for value in (metadata.get('user_id'), business.get('id'))
         if re.fullmatch(r'[0-9]{1,40}', str(value))),
        ''
    )
    assigned = request('GET', api('me/assigned_instagram_accounts'), token=token, params={'fields': 'id,username'})
    accounts = assigned.get('data')
    paging = assigned.get('paging') or {}
    if not isinstance(accounts, list) or len(accounts) != 1 or not isinstance(paging, dict) or paging.get('next'):
        raise InstagramError('comparte_una_cuenta_instagram')
    account = accounts[0]
    if not isinstance(account, dict):
        raise InstagramError('identidad_instagram_invalida')
    user_id = identifier(account.get('id', ''))
    identity = request('GET', api(user_id), token=token, params={'fields': 'id,username'})
    if identifier(identity.get('id', '')) != user_id or not isinstance(identity.get('username'), str) or not re.fullmatch(r'[A-Za-z0-9_.]{1,100}', identity['username']):
        raise InstagramError('identidad_instagram_invalida')
    return {'user_id': user_id, 'username': identity['username'], 'token': token, 'expires_at': expires_at,
        'business_id': business_id, 'system_user_id': system_user_id, 'permissions': permissions}
