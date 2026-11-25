"""Synthetic Instagram QA. It cannot call Meta, even when publishing is enabled here."""
from .settings import *  # noqa: F403
from cryptography.fernet import Fernet

if not DATABASES['default']['NAME'].startswith(('instagram_qa_', 'test_instagram_qa_')) or not MONGO_DB_NAME.startswith('instagram_qa_'):
    raise RuntimeError('Instagram QA requiere bases dedicadas instagram_qa_*.')
MEDIA_ROOT = Path(os.environ['INSTAGRAM_QA_OUTPUT']) / 'media'
INSTAGRAM_TEST_HTTP_ORIGIN = 'http://host.docker.internal:5199/instagram'
INSTAGRAM_APP_ID, INSTAGRAM_APP_SECRET = '100000000000001', 'instagram-qa-secret'
INSTAGRAM_CONFIG_ID = '100000000000002'
INSTAGRAM_REDIRECT_URI = 'https://localhost:8444/api/instagram/oauth/callback/'
INSTAGRAM_FRONTEND_ORIGIN = 'https://localhost:8444'
INSTAGRAM_MEDIA_PUBLIC_ORIGIN = 'https://instagram-qa.example.test'
_public = Path(os.environ['INSTAGRAM_QA_OUTPUT']) / 'public-origin.txt'
if _public.exists():
    INSTAGRAM_REDIRECT_URI = _public.read_text().strip() + '/api/instagram/oauth/callback/'
    INSTAGRAM_MEDIA_PUBLIC_ORIGIN = _public.read_text().strip()
INSTAGRAM_PUBLISHING_ENABLED = True
_key = Path(os.environ['INSTAGRAM_QA_OUTPUT']) / 'instagram-qa.key'
_key.parent.mkdir(parents=True, exist_ok=True)
if not _key.exists():
    _key.write_bytes(Fernet.generate_key())
INSTAGRAM_TOKEN_ENCRYPTION_KEY = _key.read_text().strip()
STORE_MAIL_EXTERNAL_ENABLED = False
STORE_MAIL_TRANSPORT = 'mailpit'
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
STOREFRONT_PUBLIC_URL = 'https://localhost:8444/plantilla/1'
CORS_ALLOWED_ORIGINS = ['https://localhost:8444']
SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
