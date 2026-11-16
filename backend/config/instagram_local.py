"""Credential-ready local OAuth, dedicated QA data only; separate from provider simulation."""
from .settings import *  # noqa: F403
from dotenv import dotenv_values

if not DATABASES['default']['NAME'].startswith('instagram_qa_oauth_') or not MONGO_DB_NAME.startswith('instagram_qa_oauth_'):
    raise RuntimeError('OAuth local requiere bases dedicadas instagram_qa_oauth_*.')
_config = Path(os.environ['INSTAGRAM_LOCAL_CONFIG']).resolve()
_output = Path(os.environ['INSTAGRAM_LOCAL_OUTPUT']).resolve()
if _config.is_relative_to(BASE_DIR) or _output.is_relative_to(BASE_DIR):
    raise RuntimeError('Configuración privada y archivos locales deben estar fuera del repositorio.')
_values = dotenv_values(_config, interpolate=False)
for _name in ('APP_ID', 'APP_SECRET', 'CONFIG_ID'):
    globals()['INSTAGRAM_'+_name] = (_values.get('META_'+_name) or '').strip()
for _name in ('REDIRECT_URI', 'FRONTEND_ORIGIN', 'MEDIA_PUBLIC_ORIGIN', 'TOKEN_ENCRYPTION_KEY'):
    globals()['INSTAGRAM_'+_name] = (_values.get('INSTAGRAM_'+_name) or '').strip().rstrip('/') if _name.endswith('ORIGIN') else (_values.get('INSTAGRAM_'+_name) or '').strip()
INSTAGRAM_PUBLISHING_ENABLED = _values.get('INSTAGRAM_PUBLISHING_ENABLED') == '1'
INSTAGRAM_TEST_HTTP_ORIGIN = ''  # Never use synthetic provider responses with real credentials.
MEDIA_ROOT = _output / 'media'
MEDIA_ROOT.mkdir(parents=True, exist_ok=True)
STORE_MAIL_EXTERNAL_ENABLED = False
STORE_MAIL_TRANSPORT = 'mailpit'
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
STOREFRONT_PUBLIC_URL = 'https://localhost:8444/plantilla/1'
CORS_ALLOWED_ORIGINS = ['https://localhost:8444']
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
