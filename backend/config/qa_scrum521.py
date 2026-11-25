"""Reusable isolated QA configuration. Runtime artifacts must stay outside the checkout."""
from .settings import *  # noqa: F403

if not DATABASES['default']['NAME'].startswith(('scrum521_qa_', 'test_scrum521_qa_')):
    raise RuntimeError('SCRUM-521 requiere PostgreSQL exclusivo scrum521_qa_*.')
if not MONGO_DB_NAME.startswith('scrum521_qa_'):
    raise RuntimeError('SCRUM-521 requiere MongoDB exclusivo scrum521_qa_*.')

MEDIA_ROOT = Path(os.environ['SCRUM521_QA_OUTPUT']) / 'media'
EMAIL_BACKEND = 'django.core.mail.backends.locmem.EmailBackend'
STORE_MAIL_EXTERNAL_ENABLED = False
STORE_MAIL_TRANSPORT = 'mailpit'
DJANGO_CORS_ALLOWED_ORIGINS = ['http://127.0.0.1:5211', 'http://localhost:5211']
CORS_ALLOWED_ORIGINS = DJANGO_CORS_ALLOWED_ORIGINS
STOREFRONT_PUBLIC_URL = 'http://127.0.0.1:5211/plantilla/1'
