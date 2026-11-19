"""Servidor de revisión exclusivo de datos sintéticos; nunca usar en producción."""
from .settings import *  # noqa: F403

if not DATABASES['default']['NAME'].startswith('scrum522_qa_'):
    raise RuntimeError('QA SCRUM-522 requiere una base dedicada scrum522_qa_*.')
if not MONGO_DB_NAME.startswith('scrum522_qa_'):
    raise RuntimeError('QA SCRUM-522 requiere MongoDB dedicado scrum522_qa_*.')
STORE_MAIL_EXTERNAL_ENABLED = False
STORE_MAIL_TRANSPORT = 'mailpit'
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST, EMAIL_PORT = 'mailpit', 1025
EMAIL_HOST_USER = EMAIL_HOST_PASSWORD = ''
EMAIL_USE_TLS = EMAIL_USE_SSL = False
DEFAULT_FROM_EMAIL = 'QA OpenMind <qa@openmind.test>'
COMMERCIAL_CONSENT_FRONTEND_ORIGIN = 'http://localhost:5174'
STOREFRONT_PUBLIC_URL = 'http://localhost:5174/plantilla/1'
STORE_MAIL_PUBLIC_API_URL = 'http://localhost:8001'
MEDIA_ROOT = BASE_DIR / '.pytest_cache' / 'scrum522-qa-media'
GOOGLE_OAUTH_CLIENT_ID = 'scrum522-synthetic-client'
GOOGLE_OAUTH_CLIENT_SECRET = 'scrum522-synthetic-secret'
GOOGLE_OAUTH_REDIRECT_URI = 'http://localhost:8001/api/tienda/correo/google/callback/'
from cryptography.fernet import Fernet
_qa_key = BASE_DIR / '.pytest_cache' / 'scrum522-mail.key'
_qa_key.parent.mkdir(parents=True, exist_ok=True)
if not _qa_key.exists():
    _qa_key.write_text(Fernet.generate_key().decode(), encoding='utf-8')
os.environ['GOOGLE_OAUTH_TOKEN_ENCRYPTION_KEY'] = _qa_key.read_text(encoding='utf-8').strip()
