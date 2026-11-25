"""QA aislado de Marketing. Requiere bases dedicadas y archivos fuera del checkout."""
from .settings import *  # noqa: F403

if not DATABASES['default']['NAME'].startswith(('marketing_qa_', 'test_marketing_qa_')):
    raise RuntimeError('Marketing QA requiere PostgreSQL marketing_qa_*.')
if not MONGO_DB_NAME.startswith('marketing_qa_'):
    raise RuntimeError('Marketing QA requiere MongoDB marketing_qa_*.')
MEDIA_ROOT = Path(os.environ['MARKETING_QA_OUTPUT']) / 'media'
STORE_MAIL_EXTERNAL_ENABLED = False
STORE_MAIL_TRANSPORT = 'mailpit'
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST, EMAIL_PORT = 'mailpit', 1025
EMAIL_HOST_USER = EMAIL_HOST_PASSWORD = ''
EMAIL_USE_TLS = EMAIL_USE_SSL = False
DEFAULT_FROM_EMAIL = 'QA Marketing <qa@openmind.test>'
STOREFRONT_PUBLIC_URL = 'http://127.0.0.1:5211/plantilla/1'
STORE_MAIL_PUBLIC_API_URL = 'http://127.0.0.1:8002'
COMMERCIAL_CONSENT_FRONTEND_ORIGIN = 'http://127.0.0.1:5211'
CORS_ALLOWED_ORIGINS = ['http://127.0.0.1:5211']
GOOGLE_OAUTH_CLIENT_ID = 'marketing-qa-synthetic'
GOOGLE_OAUTH_CLIENT_SECRET = 'marketing-qa-synthetic'
GOOGLE_OAUTH_REDIRECT_URI = 'http://127.0.0.1:8002/api/tienda/correo/google/callback/'
